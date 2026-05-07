import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

/**
 * POST /api/verification-requests/sync-absences
 * 
 * This endpoint creates absence records in attendance_logs for all approved leave requests
 * that don't have corresponding attendance logs yet.
 * 
 * This is useful for:
 * 1. Retroactively creating absences for leaves approved before the auto-absence feature
 * 2. Fixing any missing absence records
 */
export async function POST(req: Request) {
  try {
    console.log('[Sync Absences] Starting sync process...')

    // Get all approved leave requests
    const approvedLeaves = await dbQuery<any>(
      `SELECT request_id, employee_id, requested_time, time_start, time_end, reason, status
       FROM verification_requests
       WHERE request_type = 'leave'
         AND status = 'approved'
       ORDER BY requested_time DESC`
    )

    console.log(`[Sync Absences] Found ${approvedLeaves?.length || 0} approved leave requests`)

    let created = 0
    let updated = 0
    let skipped = 0
    const errors: string[] = []

    for (const leave of approvedLeaves || []) {
      try {
        const empId = leave.employee_id
        const reqTime = leave.requested_time
        const timeStart = leave.time_start
        const timeEnd = leave.time_end
        const leaveReason = leave.reason || 'Approved leave'

        if (!empId || !reqTime) {
          skipped++
          continue
        }

        // Extract date in YYYY-MM-DD format
        const d = new Date(reqTime).toISOString().slice(0, 10)

        // Get employee RFID code
        const employeeRows = await dbQuery<{ rfid_code: string | null; full_name: string }>(
          `SELECT rfid_code, full_name
           FROM employees
           WHERE employee_id = $1
           LIMIT 1`,
          [empId]
        )
        const employee = employeeRows[0]

        if (!employee) {
          errors.push(`Employee ${empId} not found`)
          skipped++
          continue
        }

        const rfid_code = employee.rfid_code || null

        // Check if absent record already exists for this employee and date
        const existingLogs = await dbQuery<any>(
          `SELECT log_id, log_type, attendance_status, notes
           FROM attendance_logs
           WHERE employee_id = $1
             AND date = $2
           ORDER BY log_time DESC
           LIMIT 10`,
          [empId, d]
        )

        // Check if there's already an absent log with leave reason
        const hasAbsentLog = existingLogs?.some(log => 
          log.attendance_status === 'absent' && log.notes?.includes('Leave approved')
        )

        if (hasAbsentLog) {
          console.log(`[Sync Absences] Skipping ${employee.full_name} - ${d} (already has absence record)`)
          skipped++
          continue
        }

        // If no logs exist, create an absent record
        if (!existingLogs || existingLogs.length === 0) {
          const logTime = timeStart 
            ? `${d}T${timeStart}+08:00` 
            : `${d}T00:00:00+08:00`

          // Note: log_type is NULL for absence records (not IN/OUT)
          // Note: attendance_status is 'absent' (now allowed by DB constraint)
          const insertData: any = {
            employee_id: empId,
            date: d,
            log_time: logTime,
            log_type: null, // NULL for absence records
            attendance_status: 'absent', // Now allowed by updated DB constraint
            is_late: false,
            is_early_out: false,
            notes: `Leave approved: ${leaveReason}`,
          }

          if (rfid_code) {
            insertData.rfid_code = rfid_code
          }

          try {
            await dbQuery(
              `INSERT INTO attendance_logs (
                 employee_id,
                 date,
                 log_time,
                 log_type,
                 attendance_status,
                 is_late,
                 is_early_out,
                 notes,
                 rfid_code
               ) VALUES (
                 $1, $2, $3, $4, $5, $6, $7, $8, $9
               )`,
              [
                insertData.employee_id,
                insertData.date,
                insertData.log_time,
                insertData.log_type,
                insertData.attendance_status,
                insertData.is_late,
                insertData.is_early_out,
                insertData.notes,
                insertData.rfid_code || null,
              ]
            )
            console.log(`[Sync Absences] ✅ Created absence for ${employee.full_name} on ${d}`)
            created++
          } catch (insertError: any) {
            console.error(`[Sync Absences] Error creating absence for ${employee.full_name}:`, insertError)
            errors.push(`${employee.full_name} - ${d}: ${insertError.message}`)
          }
        } else {
          // Update existing logs to mark as absent with leave reason
          for (const log of existingLogs) {
            try {
              await dbQuery(
                `UPDATE attendance_logs
                 SET attendance_status = 'absent',
                     notes = $1
                 WHERE log_id = $2`,
                [`Leave approved: ${leaveReason}`, log.log_id]
              )
              console.log(`[Sync Absences] ✅ Updated log for ${employee.full_name} on ${d}`)
              updated++
            } catch (updateError: any) {
              console.error(`[Sync Absences] Error updating log ${log.log_id}:`, updateError)
              errors.push(`Log ${log.log_id}: ${updateError.message}`)
            }
          }
        }
      } catch (error: any) {
        console.error('[Sync Absences] Error processing leave:', error)
        errors.push(`Leave ${leave.request_id}: ${error.message}`)
      }
    }

    console.log(`[Sync Absences] Sync complete: ${created} created, ${updated} updated, ${skipped} skipped, ${errors.length} errors`)

    return NextResponse.json({
      success: true,
      message: 'Absence sync completed',
      stats: {
        totalLeaves: approvedLeaves?.length || 0,
        created,
        updated,
        skipped,
        errors: errors.length
      },
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error: any) {
    console.error('[Sync Absences] Fatal error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to sync absences' },
      { status: 500 }
    )
  }
}
