/**
 * STI RAMS - RFID Scan API Endpoint
 * 
 * Handles RFID card scans with schedule validation
 * Determines if employee should log as regular attendance or admin time
 * 
 * POST /api/rfid/scan
 * Body: { rfid_code: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { dbQuery, pool } from '@/lib/db'
import { 
  validateEmployeeSchedule, 
  calculateAttendanceStatus,
  getCurrentManilaTime,
  getCurrentManilaDate 
} from '@/lib/schedule-validation'
import type { AttendanceLog } from '@/lib/types/database.types'
import { publishNotificationEvent } from '@/lib/notification-stream'
import { ensureAttendanceLogNotificationTrigger } from '@/lib/attendance-log-notification-trigger'
import { getAuditContext, recordLogTrailChange } from '@/lib/audit'

export const dynamic = 'force-dynamic'

async function insertNotificationResilient(payload: {
  recipient_id: number | null
  recipient_type: string
  notification_type?: string
  type?: string
  title: string
  message: string
  meta?: any
  source?: string
  channel?: string
  status?: string
}) {
  try {
    await dbQuery(
      `INSERT INTO notifications (
        recipient_id, recipient_type, notification_type, type, title, message,
        meta, source, channel, status, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::jsonb, $8, $9, $10, NOW()
      )`,
      [
        payload.recipient_id,
        payload.recipient_type,
        payload.notification_type || payload.type || 'info',
        payload.type || payload.notification_type || 'info',
        payload.title,
        payload.message,
        JSON.stringify(payload.meta || {}),
        payload.source || 'system',
        payload.channel || 'app',
        payload.status || 'pending',
      ]
    )
  } catch (error: any) {
    const msg = String(error?.message || '').toLowerCase()
    const schemaMismatch = msg.includes('column') || msg.includes('does not exist') || msg.includes('undefined column') || msg.includes('jsonb')
    if (!schemaMismatch) throw error

    await dbQuery(
      `INSERT INTO notifications (
        recipient_id, recipient_type, title, message
      ) VALUES ($1, $2, $3, $4)`,
      [
        payload.recipient_id,
        payload.recipient_type,
        payload.title,
        payload.message,
      ]
    )
  }
}

async function queueNoScheduleVerification(params: {
  employeeId: number
  logTimeISO: string
  logType: 'IN' | 'OUT'
}) {
  const requestedDate = params.logTimeISO.slice(0, 10)
  const markerReason = `[UNDER_REVIEW] No active schedule found for ${params.logType} tap on ${requestedDate}.`

  const existing = await dbQuery<{ request_id: number }>(
    `SELECT request_id
       FROM verification_requests
      WHERE employee_id = $1
        AND status IN ('pending', 'approved')
        AND requested_time::date = $2::date
        AND (
          request_type = 'under_review'
          OR reason LIKE '[UNDER_REVIEW]%'
        )
      LIMIT 1`,
    [params.employeeId, requestedDate]
  )

  if (existing?.length) return

  try {
    await dbQuery(
      `INSERT INTO verification_requests (
         employee_id,
         request_type,
         original_time,
         requested_time,
         reason,
         status,
         requested_by,
         requested_at,
         schedule_id,
         schedule_type,
         log_type
       ) VALUES (
         $1, 'under_review', NULL, $2, $3, 'pending', NULL, NOW(), NULL, NULL, $4
       )`,
      [params.employeeId, params.logTimeISO, markerReason, params.logType]
    )
  } catch {
    // Fallback for deployments where request_type may be constrained.
    await dbQuery(
      `INSERT INTO verification_requests (
         employee_id,
         request_type,
         original_time,
         requested_time,
         reason,
         status,
         requested_by,
         requested_at,
         schedule_id,
         schedule_type,
         log_type
       ) VALUES (
         $1, 'missed_log', NULL, $2, $3, 'pending', NULL, NOW(), NULL, NULL, $4
       )`,
      [params.employeeId, params.logTimeISO, markerReason, params.logType]
    )
  }
}

interface ScanRequest {
  rfid_code: string
}

interface ScanResponse {
  success: boolean
  message: string
  employee?: {
    id: number
    name: string
    department: string
    photo_url?: string
  }
  attendance?: {
    log_id: number
    log_type: 'IN' | 'OUT'
    log_time: string
    status: string
    is_late?: boolean
    is_early_out?: boolean
    late_minutes?: number
    undertime_minutes?: number
    is_admin_time?: boolean
  }
  schedule_info?: {
    has_schedule: boolean
    expected_time_in?: string
    expected_time_out?: string
    total_classes: number
    total_effective_classes?: number
    attendance_mode?: 'no_tracking' | 'teaching_or_exam' | 'fixed_shift' | 'admin_time'
    overrides?: string[]
    conflicts?: string[]
  }
  error?: string
}

function toClockMinutes(timeValue: string | null | undefined): number | null {
  const raw = String(timeValue || '').trim()
  const match = raw.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

export async function POST(request: NextRequest): Promise<NextResponse<ScanResponse>> {
  try {
    await ensureAttendanceLogNotificationTrigger()
    // Parse request body
    const body: ScanRequest = await request.json()
    const { rfid_code } = body

    // Validate input
    if (!rfid_code || rfid_code.trim() === '') {
      return NextResponse.json(
        { 
          success: false, 
          message: 'RFID code is required',
          error: 'Invalid input' 
        },
        { status: 400 }
      )
    }

    console.log('[RFID Scan] Processing scan for RFID:', rfid_code)

    // Step 1: Find employee by RFID code
    const employeeRows = await dbQuery<any>(
      `SELECT *
       FROM employees
       WHERE rfid_code = $1
         AND is_active = true
       LIMIT 1`,
      [rfid_code.trim()]
    )
    const employee = employeeRows[0]

    if (!employee) {
      console.warn('[RFID Scan] Employee not found or inactive for RFID:', rfid_code)
      return NextResponse.json(
        { 
          success: false, 
          message: 'Employee not found or account inactive. Please contact admin.',
          error: 'Employee not found' 
        },
        { status: 404 }
      )
    }

    console.log('[RFID Scan] Employee found:', employee.full_name, '(ID:', employee.employee_id, ')')

    // Step 2: Get current date and time in Manila timezone
    const currentDate = getCurrentManilaDate()
    const currentTime = getCurrentManilaTime()
    const manilaLogTimeIso = `${currentDate}T${currentTime}+08:00`
    console.log('[RFID Scan] Current Manila time:', currentDate, currentTime)

    // Step 2.5: Block taps when the employee has approved leave for this date/time.
    const approvedLeaveRows = await dbQuery<{
      request_id: number
      time_start: string | null
      time_end: string | null
      reason: string | null
    }>(
      `SELECT request_id, time_start::text AS time_start, time_end::text AS time_end, reason
       FROM verification_requests
       WHERE employee_id = $1
         AND request_type = 'leave'
         AND status = 'approved'
         AND DATE(requested_time) = $2::date
       ORDER BY requested_time DESC`,
      [employee.employee_id, currentDate]
    )

    if (approvedLeaveRows.length > 0) {
      const nowMinutes = toClockMinutes(currentTime)
      const activeLeave = approvedLeaveRows.find((leave) => {
        // Whole-day leave blocks all taps for the date.
        if (!leave.time_start || !leave.time_end) return true
        if (nowMinutes === null) return false
        const start = toClockMinutes(leave.time_start)
        const end = toClockMinutes(leave.time_end)
        if (start === null || end === null) return false
        return nowMinutes >= start && nowMinutes <= end
      })

      if (activeLeave) {
        const leaveReason = String(activeLeave.reason || 'Approved leave')

        try {
          await recordLogTrailChange({
            actor: {
              user_id: employee.employee_id,
              user_email: employee.email || undefined,
              user_name: employee.full_name,
              user_type: 'employee',
            },
            action: 'deny:rfid_scan_on_leave',
            table: 'verification_requests',
            recordId: activeLeave.request_id,
            description: `Blocked RFID tap: employee on approved leave (${currentDate})`,
            context: getAuditContext(request),
            extra: {
              employee_id: employee.employee_id,
              rfid_code: employee.rfid_code,
              leave_request_id: activeLeave.request_id,
              leave_time_start: activeLeave.time_start,
              leave_time_end: activeLeave.time_end,
              leave_reason: leaveReason,
              attempted_time: currentTime,
              attempted_date: currentDate,
            },
          })
        } catch (auditError) {
          console.error('[RFID Scan] Failed to audit blocked on-leave tap:', auditError)
        }

        return NextResponse.json(
          {
            success: false,
            message: `RFID tap blocked: ${employee.full_name} is on approved leave today.`,
            employee: {
              id: employee.employee_id,
              name: employee.full_name,
              department: employee.department,
            },
            error: `On Leave - ${leaveReason}`,
          },
          { status: 403 }
        )
      }
    }

    // Step 3: Validate employee schedule for today
    const scheduleValidation = await validateEmployeeSchedule(
      employee.employee_id,
      currentDate,
      currentTime
    )

    console.log('[RFID Scan] Schedule validation result:', scheduleValidation.message)

    // Step 4: Check if special day (holiday, suspended)
    if (scheduleValidation.holiday && scheduleValidation.holiday.affects_attendance) {
      return NextResponse.json({
        success: false,
        message: `Today is ${scheduleValidation.holiday.name}. No attendance tracking.`,
        employee: {
          id: employee.employee_id,
          name: employee.full_name,
          department: employee.department
        },
        error: 'Holiday'
      })
    }

    // Step 5: Get active academic term ID
    const activeTermRows = await dbQuery<{ id: number }>(
      `SELECT id
       FROM academic_terms
       WHERE is_active = true
       LIMIT 1`
    )
    const activeTerm = activeTermRows[0]

    // Step 6: Atomically determine log type and insert using a per-employee/day lock.
    // This prevents duplicate or out-of-order logs when many taps happen at once.
    let attendanceLog: any
    let logType: 'IN' | 'OUT' = 'IN'
    let attendanceStatus: 'present' | 'late' | 'on_time' | 'undertime' | 'admin_time' = 'present'
    let isLate = false
    let isEarlyOut = false
    let lateMinutes = 0
    let undertimeMinutes = 0
    const attendanceData: Partial<AttendanceLog> = {
      employee_id: employee.employee_id,
      rfid_code: employee.rfid_code,
      log_time: manilaLogTimeIso,
      date: currentDate,
      is_admin_time: scheduleValidation.isAdminTime,
      term_id: activeTerm?.id,
      notes: scheduleValidation.isAdminTime ? 'Admin Time - No teaching load' : undefined
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [`rfid:${employee.employee_id}:${currentDate}`]
      )

      const existingResult = await client.query<any>(
        `SELECT *
         FROM attendance_logs
         WHERE employee_id = $1
           AND date = $2
         ORDER BY log_time DESC
         FOR UPDATE`,
        [employee.employee_id, currentDate]
      )
      const existingLogs = existingResult.rows || []

      const hasTimeIn = existingLogs.some(log => log.log_type === 'IN')
      const hasTimeOut = existingLogs.some(log => log.log_type === 'OUT')

      if (hasTimeIn && !hasTimeOut) {
        logType = 'OUT'
      } else if (hasTimeIn && hasTimeOut) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          success: false,
          message: 'You have already completed your time in and time out for today.',
          employee: {
            id: employee.employee_id,
            name: employee.full_name,
            department: employee.department
          },
          error: 'Already logged'
        })
      }

      if (scheduleValidation.hasSchedule) {
        if (logType === 'IN' && scheduleValidation.expectedTimeIn) {
          const result = calculateAttendanceStatus(
            currentTime,
            scheduleValidation.expectedTimeIn,
            'IN'
          )
          isLate = result.isLate || false
          lateMinutes = result.minutes
          attendanceStatus = (result.status === 'late' || result.status === 'on_time') ? result.status as 'late' | 'on_time' : 'present'
        } else if (logType === 'OUT' && scheduleValidation.expectedTimeOut) {
          const result = calculateAttendanceStatus(
            currentTime,
            scheduleValidation.expectedTimeOut,
            'OUT'
          )
          isEarlyOut = result.isEarlyOut || false
          undertimeMinutes = result.minutes
          if (result.status === 'undertime') {
            attendanceStatus = 'undertime'
          }
        }
      }

      attendanceData.log_type = logType
      attendanceData.attendance_status = attendanceStatus
      attendanceData.is_late = isLate
      attendanceData.is_early_out = isEarlyOut
      attendanceData.late_minutes = lateMinutes
      attendanceData.undertime_minutes = undertimeMinutes

      const insertResult = await client.query<any>(
        `INSERT INTO attendance_logs (
           employee_id,
           rfid_code,
           log_time,
           log_type,
           attendance_status,
           is_late,
           is_early_out,
           date,
           is_admin_time,
           late_minutes,
           undertime_minutes,
           term_id,
           notes
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
         )
         RETURNING *`,
        [
          attendanceData.employee_id,
          attendanceData.rfid_code || null,
          attendanceData.log_time,
          attendanceData.log_type,
          attendanceData.attendance_status,
          attendanceData.is_late,
          attendanceData.is_early_out,
          attendanceData.date,
          attendanceData.is_admin_time,
          attendanceData.late_minutes,
          attendanceData.undertime_minutes,
          attendanceData.term_id || null,
          attendanceData.notes || null,
        ]
      )

      attendanceLog = insertResult.rows[0]
      await client.query('COMMIT')
    } catch (txError) {
      await client.query('ROLLBACK')
      throw txError
    } finally {
      client.release()
    }

    console.log('[RFID Scan] Log type:', logType)

    if (!attendanceLog) {
      console.error('[RFID Scan] Error inserting attendance log: no row returned')
      return NextResponse.json(
        { 
          success: false, 
          message: 'Failed to log attendance. Please try again.',
          error: 'Insert failed'
        },
        { status: 500 }
      )
    }

    console.log('[RFID Scan] Attendance logged successfully:', attendanceLog.log_id)

    // Step 8.25: Queue verification review for no-schedule taps.
    if (!scheduleValidation.hasSchedule) {
      try {
        await queueNoScheduleVerification({
          employeeId: employee.employee_id,
          logTimeISO: String(attendanceData.log_time || manilaLogTimeIso),
          logType,
        })
      } catch (verificationQueueError) {
        console.error('[RFID Scan] Failed to queue no-schedule verification:', verificationQueueError)
      }
    }

    // Step 8.5: Create notifications for employee and active admins.
    // Keep this non-blocking: attendance logging should still succeed even if notifications fail.
    try {
      const [hh, mm] = currentTime.split(':').map(Number)
      const hour12 = hh % 12 || 12
      const ampm = hh >= 12 ? 'PM' : 'AM'
      const timeDisplay = `${hour12}:${String(mm).padStart(2, '0')} ${ampm}`

      const logTypeVerb = logType === 'IN' ? 'tapped in' : 'tapped out'
      let statusText = ''
      if (attendanceStatus === 'late' || isLate) {
        statusText = ' (Late)'
      } else if (attendanceStatus === 'undertime' || isEarlyOut) {
        statusText = ' (Undertime)'
      } else {
        statusText = ' (On-Time)'
      }

      const employeeTitle = logType === 'IN' ? 'Time In Recorded' : 'Time Out Recorded'
      const employeeMessage = `You ${logTypeVerb} at ${timeDisplay}${statusText}`

      await insertNotificationResilient({
        recipient_id: employee.employee_id,
        recipient_type: 'employee',
        notification_type: 'attendance',
        type: 'attendance',
        title: employeeTitle,
        message: employeeMessage,
        meta: {
          log_id: attendanceLog.log_id,
          log_type: logType,
          attendance_status: attendanceStatus,
          is_late: isLate,
          is_early_out: isEarlyOut,
        },
        source: 'rfid',
        channel: 'app',
        status: 'pending',
      })

      // Admin notifications are now handled by a PostgreSQL trigger on attendance_logs.
      // Broadcast a lightweight local event so open dashboards refresh immediately.
      publishNotificationEvent({
        type: 'notification-created',
        recipient_type: 'admin',
        recipient_id: null,
        employee_id: employee.employee_id,
        employee_name: employee.full_name,
        log_type: logType,
      })
    } catch (notifError) {
      console.error('[RFID Scan] Notification creation error:', notifError)
    }

    // Step 9: Log to log_trail
    try {
      await dbQuery(
        `INSERT INTO log_trail (
           user_id,
           user_email,
           user_name,
           user_type,
           action_type,
           table_name,
           record_id,
           description,
           metadata
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9
         )`,
        [
          employee.employee_id,
          employee.email || null,
          employee.full_name,
          'employee',
          'attendance_logged',
          'attendance_logs',
          attendanceLog.log_id,
          `${logType} log via RFID scan`,
          JSON.stringify({
            rfid_code: employee.rfid_code,
            is_admin_time: scheduleValidation.isAdminTime,
            has_schedule: scheduleValidation.hasSchedule,
            status: attendanceStatus,
          }),
        ]
      )
    } catch (logError) {
      // Don't fail the scan if logging fails
      console.error('[RFID Scan] Error logging to log_trail:', logError)
    }

    // Step 10: Prepare response
    const response: ScanResponse = {
      success: true,
      message: scheduleValidation.isAdminTime
        ? `Welcome, ${employee.full_name}! Logged as Admin Time.`
        : logType === 'IN'
        ? isLate
          ? `Welcome, ${employee.full_name}! You are ${lateMinutes} minute(s) late.`
          : `Welcome, ${employee.full_name}! Time in recorded.`
        : isEarlyOut
        ? `Goodbye, ${employee.full_name}! You are ${undertimeMinutes} minute(s) early.`
        : `Goodbye, ${employee.full_name}! Time out recorded.`,
      employee: {
        id: employee.employee_id,
        name: employee.full_name,
        department: employee.department,
        photo_url: employee.photo_path
      },
      attendance: {
        log_id: attendanceLog.log_id,
        log_type: logType,
        log_time: currentTime,
        status: attendanceStatus,
        is_late: isLate,
        is_early_out: isEarlyOut,
        late_minutes: lateMinutes > 0 ? lateMinutes : undefined,
        undertime_minutes: undertimeMinutes > 0 ? undertimeMinutes : undefined,
        is_admin_time: scheduleValidation.isAdminTime
      },
      schedule_info: {
        has_schedule: scheduleValidation.hasSchedule,
        expected_time_in: scheduleValidation.expectedTimeIn,
        expected_time_out: scheduleValidation.expectedTimeOut,
        total_classes: scheduleValidation.schedules.length + scheduleValidation.examSchedules.length,
        total_effective_classes:
          (scheduleValidation.effectiveSchedules?.teaching.length ?? scheduleValidation.schedules.length)
          + (scheduleValidation.effectiveSchedules?.exam.length ?? scheduleValidation.examSchedules.length),
        attendance_mode: scheduleValidation.policy?.attendanceMode,
        overrides: scheduleValidation.policy?.overrides,
        conflicts: scheduleValidation.policy?.conflicts,
      }
    }

    return NextResponse.json(response, { status: 200 })

  } catch (error) {
    console.error('[RFID Scan] Unexpected error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: 'An unexpected error occurred. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}

// GET endpoint for testing (remove in production)
export async function GET(request: NextRequest): Promise<NextResponse> {
  return NextResponse.json({
    message: 'RFID Scan API - POST only',
    usage: 'POST /api/rfid/scan with body: { rfid_code: string }',
    version: '1.0.0'
  })
}
