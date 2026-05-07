import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'
import { recordLogTrailChange } from '@/lib/audit'
import { getManilaToday } from '@/lib/timezone-utils'

/**
 * RFID Re-tap for Verification Requests
 * 
 * When a verification request exists (Missed Log IN/OUT), this endpoint:
 * 1. Updates the attendance_logs table with the tapped IN or OUT
 * 2. Deletes the verification request
 * 3. Logs the action as 'Verification Tap' in log_trail
 * 
 * POST /api/verification-requests/retap
 * Body: {
 *   verification_id: number,
 *   employee_id: number,
 *   rfid_code: string,
 *   tap_type: 'IN' | 'OUT',
 *   log_time: string (ISO datetime)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { verification_id, employee_id, rfid_code, tap_type, log_time } = body

    // Validation
    if (!verification_id || !employee_id || !rfid_code || !tap_type) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    if (tap_type !== 'IN' && tap_type !== 'OUT') {
      return NextResponse.json(
        { success: false, error: 'Invalid tap_type. Must be IN or OUT' },
        { status: 400 }
      )
    }

    // Get verification request details
    const verificationRows = await dbQuery<any>(
      `SELECT
         vr.*, 
         e.full_name AS employee_full_name,
         e.employee_id AS employee_record_id,
         e.rfid_code AS employee_rfid_code
       FROM verification_requests vr
       INNER JOIN employees e ON e.employee_id = vr.employee_id
       WHERE vr.verification_id = $1
         AND vr.employee_id = $2
       LIMIT 1`,
      [verification_id, employee_id]
    )
    const verification = verificationRows[0]

    if (!verification) {
      return NextResponse.json(
        { success: false, error: 'Verification request not found' },
        { status: 404 }
      )
    }

    // Verify RFID code matches
    if (verification.employee_rfid_code !== rfid_code) {
      return NextResponse.json(
        { success: false, error: 'RFID code does not match employee' },
        { status: 403 }
      )
    }

    // Get the date from log_time or use today
    const dateStr = getManilaToday()
    
    // Use provided log_time or current time
    const finalLogTime = log_time || new Date().toISOString()

    // Insert attendance log for the re-tap
    let attendanceLog: any
    try {
      const attendanceRows = await dbQuery<any>(
        `INSERT INTO attendance_logs (
           employee_id,
           rfid_code,
           log_type,
           log_time,
           date,
           attendance_status,
           is_late,
           is_early_out,
           notes
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9
         )
         RETURNING *`,
        [
          employee_id,
          rfid_code,
          tap_type,
          finalLogTime,
          dateStr,
          'present',
          false,
          false,
          'Verification Re-tap',
        ]
      )
      attendanceLog = attendanceRows[0]
    } catch (insertError: any) {
      console.error('[Verification Re-tap] Error inserting attendance log:', insertError)
      return NextResponse.json(
        { success: false, error: `Failed to record ${tap_type} log: ${insertError?.message || insertError}` },
        { status: 500 }
      )
    }

    // Delete the verification request
    try {
      await dbQuery(
        `DELETE FROM verification_requests
         WHERE verification_id = $1`,
        [verification_id]
      )
    } catch (deleteError) {
      console.error('[Verification Re-tap] Error deleting verification request:', deleteError)
      // Don't fail the request - log was already recorded
    }

    // Log to log_trail
    try {
      await recordLogTrailChange({
        action: 'VERIFICATION_RETAP',
        table: 'attendance_logs',
        recordId: attendanceLog?.log_id || null,
        actor: {
          user_id: employee_id,
          user_email: verification.employee_full_name,
          user_name: verification.employee_full_name
        },
        newValue: {
          employee_id: employee_id,
          tap_type: tap_type,
          log_time: finalLogTime,
          reason: 'Verification Re-tap for missed log'
        },
        extra: {
          verification_id: verification_id,
          original_issue: verification.issue_type,
          affected_date: verification.affected_date
        }
      })
    } catch (logError) {
      console.error('[Verification Re-tap] Error logging to log_trail:', logError)
      // Don't fail the request
    }

    console.log(`[Verification Re-tap] ✅ Employee ${employee_id} re-tapped ${tap_type} for verification ${verification_id}`)

    return NextResponse.json({
      success: true,
      message: `${tap_type} log recorded successfully`,
      log: attendanceLog,
      verification_id: verification_id
    })
  } catch (error: any) {
    console.error('[Verification Re-tap] Fatal error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process re-tap' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/verification-requests/retap?employee_id=123
 * Get pending verification requests for an employee
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const employeeId = searchParams.get('employee_id')

    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: 'Missing employee_id parameter' },
        { status: 400 }
      )
    }

    const verifications = await dbQuery<any>(
      `SELECT
         vr.*, 
         e.full_name AS employee_full_name,
         e.employee_id AS employee_record_id,
         e.rfid_code AS employee_rfid_code
       FROM verification_requests vr
       INNER JOIN employees e ON e.employee_id = vr.employee_id
       WHERE vr.employee_id = $1
       ORDER BY vr.affected_date DESC`,
      [parseInt(employeeId)]
    )

    return NextResponse.json({
      success: true,
      verifications: verifications || []
    })
  } catch (error: any) {
    console.error('[Verification Re-tap] Fatal error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch verifications' },
      { status: 500 }
    )
  }
}
