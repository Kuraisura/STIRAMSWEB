import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

/**
 * Save absent attendance records to local PostgreSQL
 * This endpoint is called when synthetic absent entries are detected in the UI
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { absentRecords } = body

    console.log('[Save Absent API] Received request:', { recordCount: absentRecords?.length || 0 })

    if (!Array.isArray(absentRecords) || absentRecords.length === 0) {
      console.log('[Save Absent API] No records to save')
      return NextResponse.json({ 
        success: true, 
        message: 'No absent records to save',
        saved: 0,
        skipped: 0
      })
    }

    let savedCount = 0
    let skippedCount = 0
    const errors: string[] = []

    // Get employee RFID codes for all records
    const employeeIds = absentRecords.map(r => r.employee_id).filter(Boolean)
    let rfidMap: Map<number, string> = new Map()
    
    if (employeeIds.length > 0) {
      // CRITICAL: Only include active employees, exclude archived (is_active = false)
      const placeholders = employeeIds.map((_: any, index: number) => `$${index + 1}`).join(', ')
      try {
        const employees = await dbQuery<{ employee_id: number; rfid_code: string | null }>(
          `SELECT employee_id, rfid_code
           FROM employees
           WHERE employee_id IN (${placeholders})
             AND (is_active IS NULL OR is_active = true)`,
          employeeIds
        )
        employees.forEach((emp: any) => {
          rfidMap.set(emp.employee_id, emp.rfid_code || '')
        })
      } catch (empError) {
        console.error('[Save Absent API] Error fetching employees:', empError)
      }
    }

    for (const record of absentRecords) {
      try {
        const { employee_id, date } = record

        if (!employee_id || !date) {
          console.warn('[Save Absent API] Missing employee_id or date:', record)
          skippedCount++
          continue
        }

        const rfid_code = rfidMap.get(employee_id) || ''

        // Check if absent record already exists for this employee and date
        let existingLogs: any[] = []
        try {
          existingLogs = await dbQuery<any>(
            `SELECT log_id
             FROM attendance_logs
             WHERE employee_id = $1
               AND date = $2
             LIMIT 1`,
            [employee_id, date]
          )
        } catch (checkError: any) {
          console.error(`[Save Absent API] Error checking existing log for employee ${employee_id}:`, checkError)
          errors.push(`Employee ${employee_id}: ${checkError.message}`)
          continue
        }

        // If any log exists for this date (including absent), skip
        if (existingLogs && existingLogs.length > 0) {
          console.log(`[Save Absent API] Skipping employee ${employee_id} for ${date} - record already exists`)
          skippedCount++
          continue
        }

        // Create log_time in Philippines timezone (midnight of the date)
        const logTime = `${date}T00:00:00+08:00`

        const insertData: any = {
          employee_id: employee_id,
          date: date,
          log_time: logTime,
          log_type: 'IN',
          attendance_status: 'absent',
          is_late: false,
          is_early_out: false,
        }

        // Add rfid_code if available
        if (rfid_code) {
          insertData.rfid_code = rfid_code
        }

        console.log(`[Save Absent API] Inserting record for employee ${employee_id} on ${date}:`, insertData)

        // Insert absent record
        let insertedData: any
        try {
          const insertedRows = await dbQuery<any>(
            `INSERT INTO attendance_logs (
               employee_id,
               date,
               log_time,
               log_type,
               attendance_status,
               is_late,
               is_early_out,
               rfid_code
             ) VALUES (
               $1, $2, $3, $4, $5, $6, $7, $8
             )
             RETURNING log_id`,
            [
              insertData.employee_id,
              insertData.date,
              insertData.log_time,
              insertData.log_type,
              insertData.attendance_status,
              insertData.is_late,
              insertData.is_early_out,
              insertData.rfid_code || null,
            ]
          )
          insertedData = insertedRows[0]
        } catch (insertError: any) {
          console.error(`[Save Absent API] Error inserting absent for employee ${employee_id}:`, insertError)
          console.error(`[Save Absent API] Insert data was:`, insertData)
          errors.push(`Employee ${employee_id}: ${insertError.message}`)
          continue
        }

        savedCount++
        console.log(`[Save Absent API] ✅ Saved absent record for employee ${employee_id} on ${date}, log_id: ${insertedData?.log_id}`)
      } catch (error: any) {
        console.error(`[Save Absent API] Error processing record:`, error)
        errors.push(`Record error: ${error.message || 'Unknown error'}`)
      }
    }

    console.log(`[Save Absent API] Completed: ${savedCount} saved, ${skippedCount} skipped, ${errors.length} errors`)

    return NextResponse.json({
      success: true,
      saved: savedCount,
      skipped: skippedCount,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error: any) {
    console.error('[Save Absent API] Fatal error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save absent records' },
      { status: 500 }
    )
  }
}

