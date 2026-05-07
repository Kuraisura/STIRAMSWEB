import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'
import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { validateRFIDLogRequest } from '@/lib/api-security'
import { processAdminTime } from '@/lib/admin-time-calculator'
import { publishNotificationEvent } from '@/lib/notification-stream'
import { ensureAttendanceLogNotificationTrigger } from '@/lib/attendance-log-notification-trigger'

// Force dynamic rendering (uses request headers for rate limiting)
export const dynamic = 'force-dynamic'

const PHILIPPINES_TIMEZONE = 'Asia/Manila'

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
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, NOW())`,
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
    // Local schema fallback: keep notifications working even if optional columns are missing.
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

async function getScheduledTimesForDate(
  employeeId: number,
  dateStr: string
): Promise<{ scheduleIn: string | null; scheduleOut: string | null }> {
  try {
    const dateObj = new Date(dateStr + 'T00:00:00+08:00')
    const jsDayOfWeek = dateObj.getDay()
    const scheduleDayOfWeek = jsDayOfWeek === 0 ? null : jsDayOfWeek

    if (!scheduleDayOfWeek) return { scheduleIn: null, scheduleOut: null }

    let examRows = await dbQuery<{ time_start: string | null; time_end: string | null }>(
      `SELECT time_start, time_end
       FROM exam_schedules
       WHERE employee_id = $1 AND exam_date = $2`,
      [employeeId, dateStr]
    )

    if (examRows.length === 0) {
      examRows = await dbQuery<{ time_start: string | null; time_end: string | null }>(
        `SELECT time_start, time_end
         FROM exam_schedules
         WHERE employee_id = $1
           AND day_of_week = $2
           AND exam_date IS NULL`,
        [employeeId, scheduleDayOfWeek]
      )
    }

    if (examRows.length > 0) {
      const times = examRows
        .map((s) => ({ start: s.time_start, end: s.time_end }))
        .filter((s) => s.start && s.end) as Array<{ start: string; end: string }>
      if (times.length > 0) {
        const earliest = times.reduce((min, s) => (s.start < min.start ? s : min), times[0])
        const latest = times.reduce((max, s) => (s.end > max.end ? s : max), times[0])
        return {
          scheduleIn: earliest.start.substring(0, 5),
          scheduleOut: latest.end.substring(0, 5),
        }
      }
    }

    const teachingRows = await dbQuery<{ time_start: string | null; time_end: string | null }>(
      `SELECT time_start, time_end
       FROM teaching_schedules
       WHERE employee_id = $1 AND day_of_week = $2`,
      [employeeId, scheduleDayOfWeek]
    )

    if (teachingRows.length > 0) {
      const times = teachingRows
        .map((s) => ({ start: s.time_start, end: s.time_end }))
        .filter((s) => s.start && s.end) as Array<{ start: string; end: string }>
      if (times.length > 0) {
        const earliest = times.reduce((min, s) => (s.start < min.start ? s : min), times[0])
        const latest = times.reduce((max, s) => (s.end > max.end ? s : max), times[0])
        return {
          scheduleIn: earliest.start.substring(0, 5),
          scheduleOut: latest.end.substring(0, 5),
        }
      }
    }

    return { scheduleIn: null, scheduleOut: null }
  } catch (error) {
    console.error('[RFID Log API] Failed to load schedule from local PostgreSQL:', error)
    return { scheduleIn: null, scheduleOut: null }
  }
}

// POST /api/rfid-log
// Body: { rfid_code: string, log_type: 'IN'|'OUT' }
// Creates an attendance log and a corresponding notification for the employee.
export async function POST(request: NextRequest) {
  try {
    await ensureAttendanceLogNotificationTrigger()
    // Validate and sanitize request body
    const body = await request.json().catch(() => ({}))
    const validation = validateRFIDLogRequest(body)
    
    if (!validation.valid || !validation.data) {
      return NextResponse.json(
        { success: false, error: validation.error || 'Invalid request' }, 
        { status: 400 }
      )
    }
    
    const { rfid_code: rfidCode, log_type: logType } = validation.data

    console.log('[RFID Log API] ==========================================')
    console.log('[RFID Log API] 🚀 RECEIVED TAP IN/OUT REQUEST')
    console.log('[RFID Log API] RFID Code:', rfidCode, '| Log Type:', logType)
    console.log('[RFID Log API] Timestamp:', new Date().toISOString())
    console.log('[RFID Log API] ==========================================')

    // Find employee by RFID code with schedule info
    // CRITICAL: Only find active employees (exclude archived employees)
    // Also ensure rfid_code is not NULL (archived employees have NULL rfid_code)
    const employeeRows = await dbQuery<{
      employee_id: number
      full_name: string
      schedule_time_in: string | null
      schedule_time_out: string | null
      rfid_code: string | null
      is_active: boolean | null
    }>(
      `SELECT employee_id, full_name, schedule_time_in, schedule_time_out, rfid_code, is_active
       FROM employees
       WHERE rfid_code = $1
         AND rfid_code IS NOT NULL
         AND (is_active IS NULL OR is_active = TRUE)
       LIMIT 1`,
      [rfidCode]
    )
    const employee = employeeRows[0]

    if (!employee) {
      console.error('[RFID Log API] Employee not found for RFID:', rfidCode)
      // Check if employee exists but is archived
      const archivedRows = await dbQuery<{ employee_id: number; full_name: string; is_active: boolean | null }>(
        `SELECT employee_id, full_name, is_active
         FROM employees
         WHERE rfid_code = $1 AND is_active = FALSE
         LIMIT 1`,
        [rfidCode]
      )
      const archivedEmp = archivedRows[0]
      
      if (archivedEmp) {
        return NextResponse.json({ 
          success: false, 
          error: `Employee ${archivedEmp.full_name} is archived and cannot tap in/out. Please restore the employee first.` 
        }, { status: 403 })
      }
      
      return NextResponse.json({ success: false, error: 'Employee not found for RFID' }, { status: 404 })
    }
    
    // Double-check: Ensure employee is not archived (extra safety check)
    if (employee.is_active === false) {
      return NextResponse.json({ 
        success: false, 
        error: `Employee ${employee.full_name} is archived and cannot tap in/out. Please restore the employee first.` 
      }, { status: 403 })
    }

    console.log('[RFID Log API] Found employee:', { 
      id: employee.employee_id, 
      name: employee.full_name,
      schedule_time_in: employee.schedule_time_in,
      schedule_time_out: employee.schedule_time_out
    })

    // Get current time in Philippines timezone
    const now = new Date()
    const philippinesTime = toZonedTime(now, PHILIPPINES_TIMEZONE)
    const dateOnly = format(philippinesTime, 'yyyy-MM-dd')
    const currentTime = format(philippinesTime, 'HH:mm:ss')
    const isoNow = now.toISOString()

    // Get scheduled times from teaching/exam schedules for this date
    const { scheduleIn, scheduleOut } = await getScheduledTimesForDate(employee.employee_id, dateOnly)
    
    // Check if employee has a schedule for this date
    const hasSchedule = !!(scheduleIn || scheduleOut)
    
    // Fallback to employee's schedule_time_in/out if no schedule found
    const scheduledTimeIn = scheduleIn || employee.schedule_time_in?.substring(0, 5) || null
    const scheduledTimeOut = scheduleOut || employee.schedule_time_out?.substring(0, 5) || null

    // Calculate attendance status based on NEW LOGIC:
    // If NO schedule exists for this date → Admin Time (employee working outside scheduled hours)
    // IN: Before scheduled time = On-Time (earliest tap-in), After = Late
    // OUT: Before scheduled time = Undertime, After = On-Time
    let isLate = false
    let isEarlyOut = false
    let attendanceStatus = 'present'

    // CRITICAL: If employee has NO schedule for this date, mark as Admin Time
    // Example: Employee has Mon-Fri schedule but taps in on Saturday
    if (!hasSchedule && !scheduledTimeIn && !scheduledTimeOut) {
      attendanceStatus = 'admin-time'
      console.log('[RFID Log API] Admin Time detected - No schedule for this date:', {
        date: dateOnly,
        employee: employee.full_name,
        note: 'Employee tapped in on a day with no class schedule'
      })
    } else if (logType === 'IN' && scheduledTimeIn) {
      // NEW LOGIC: Compare times
      // If actualTime is BEFORE or EQUAL to scheduleTime → On-Time (earliest tap-in is On-Time)
      // If actualTime is AFTER scheduleTime → Late
      const scheduleTime = new Date(`2000-01-01T${scheduledTimeIn}:00`)
      const actualTime = new Date(`2000-01-01T${currentTime}`)
      
      // Only mark as late if actualTime is AFTER scheduleTime (no grace period, even 1 second counts)
      isLate = actualTime > scheduleTime
      
      console.log('[RFID Log API] Time IN comparison (NEW LOGIC):', {
        scheduledTimeIn,
        actualTime: currentTime,
        isLate,
        note: isLate ? 'Late (tapped in after schedule)' : 'On-Time (tapped in before/at schedule)'
      })
    } else if (logType === 'IN' && !scheduledTimeIn) {
      // No schedule for IN tap - mark as Admin Time
      attendanceStatus = 'admin-time'
      console.log('[RFID Log API] Admin Time detected - No schedule for IN tap:', {
        date: dateOnly,
        employee: employee.full_name
      })
    }

    if (logType === 'OUT' && scheduledTimeOut) {
      // NEW LOGIC: Compare times
      // If actualTime is BEFORE scheduleTime → Undertime (timed out too early)
      // If actualTime is AFTER or EQUAL to scheduleTime → On-Time
      const scheduleTime = new Date(`2000-01-01T${scheduledTimeOut}:00`)
      const actualTime = new Date(`2000-01-01T${currentTime}`)
      
      // Only mark as early out if actualTime is BEFORE scheduleTime
      isEarlyOut = actualTime < scheduleTime
      
      console.log('[RFID Log API] Time OUT comparison (NEW LOGIC):', {
        scheduledTimeOut,
        actualTime: currentTime,
        isEarlyOut,
        note: isEarlyOut ? 'Undertime (timed out before schedule)' : 'On-Time (timed out at/after schedule)'
      })
    } else if (logType === 'OUT' && !scheduledTimeOut && attendanceStatus !== 'admin-time') {
      // No schedule for OUT tap - mark as Admin Time (if not already marked)
      attendanceStatus = 'admin-time'
      console.log('[RFID Log API] Admin Time detected - No schedule for OUT tap:', {
        date: dateOnly,
        employee: employee.full_name
      })
    }

    // Insert attendance log with proper fields
    const insertedRows = await dbQuery<any>(
      `INSERT INTO attendance_logs (
        employee_id, rfid_code, date, log_time, log_type,
        attendance_status, is_late, is_early_out
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        employee.employee_id,
        rfidCode,
        dateOnly,
        isoNow,
        logType,
        attendanceStatus,
        isLate,
        isEarlyOut,
      ]
    )
    const insertedLog = insertedRows[0]

    console.log('[RFID Log API] Successfully created log:', {
      log_id: insertedLog?.log_id,
      employee_id: employee.employee_id,
      attendance_status: attendanceStatus,
      is_late: isLate,
      is_early_out: isEarlyOut
    })

    // Create notifications for the employee and all admins
    try {
      // Format time in a user-friendly way (e.g., "6:27 PM")
      const timeDisplay = new Date(isoNow).toLocaleString('en-US', { 
        hour12: true, 
        hour: 'numeric', 
        minute: '2-digit',
        timeZone: PHILIPPINES_TIMEZONE
      })
      
      const logTypeVerb = logType === 'IN' ? 'tapped in' : 'tapped out'
      // Determine status text
      let statusText = ''
      if (isLate) {
        statusText = ' (Late)'
      } else if (isEarlyOut) {
        statusText = ' (Undertime)'
      } else {
        statusText = ' (On-Time)'
      }
      
      // Notification for employee
      const employeeTitle = logType === 'IN' ? 'Time In Recorded' : 'Time Out Recorded'
      const employeeMessage = `You ${logTypeVerb} at ${timeDisplay}`
      
      await insertNotificationResilient({
        recipient_id: employee.employee_id,
        recipient_type: 'employee',
        notification_type: 'attendance',
        type: 'attendance',
        title: employeeTitle,
        message: employeeMessage,
        meta: { log_id: insertedLog?.log_id, log_type: logType },
        source: 'rfid',
        channel: 'app',
        status: 'pending',
      })
      
      // Admin notifications are now handled by a PostgreSQL trigger on attendance_logs.
      // This guarantees automatic notifications even when logs are inserted/updated outside this API.
      publishNotificationEvent({
        type: 'notification-created',
        recipient_type: 'admin',
        recipient_id: null,
        employee_id: employee.employee_id,
        employee_name: employee.full_name,
        log_type: logType,
      })
    } catch (notifError: any) {
      console.error('[RFID Log API] ❌ CRITICAL ERROR in notification creation block:', notifError)
      console.error('[RFID Log API] Error type:', typeof notifError)
      console.error('[RFID Log API] Error message:', notifError?.message)
      console.error('[RFID Log API] Error stack:', notifError?.stack)
      console.error('[RFID Log API] Full error object:', JSON.stringify(notifError, Object.getOwnPropertyNames(notifError)))
      // Don't fail the request if notifications fail, but log extensively
    }

    // ADMIN TIME PROCESSING (Scenario 1 & 2)
    // When employee taps OUT, calculate and save admin time
    if (logType === 'OUT' && insertedLog) {
      try {
        console.log('[RFID Log API] ==========================================')
        console.log('[RFID Log API] 🕒 PROCESSING ADMIN TIME')
        
        // Get corresponding IN log for today
        const inRows = await dbQuery<any>(
          `SELECT *
           FROM attendance_logs
           WHERE employee_id = $1 AND date = $2 AND log_type = 'IN'
           ORDER BY log_time DESC
           LIMIT 1`,
          [employee.employee_id, dateOnly]
        )
        const inLog = inRows[0]

        if (!inLog) {
          console.warn('[RFID Log API] No IN log found for admin time calculation')
        } else {
          const timeIn = new Date(inLog.log_time)
          const timeOut = new Date(insertedLog.log_time)
          
          console.log('[RFID Log API] Time IN:', format(timeIn, 'yyyy-MM-dd HH:mm:ss'))
          console.log('[RFID Log API] Time OUT:', format(timeOut, 'yyyy-MM-dd HH:mm:ss'))
          
          // Process admin time (includes all scenarios: no schedule, early arrival, vacant periods)
          const adminTimeResult = await processAdminTime(
            employee.employee_id,
            philippinesTime,
            timeIn,
            timeOut,
            insertedLog.log_id
          )
          
          if (adminTimeResult.totalHours > 0) {
            console.log('[RFID Log API] ✅ Admin Time Calculated:', {
              totalHours: adminTimeResult.totalHours,
              totalMinutes: adminTimeResult.totalMinutes,
              segments: adminTimeResult.segments.length
            })
            
            // Update attendance log to mark it has admin time
            await dbQuery(
              `UPDATE attendance_logs
               SET is_admin_time = TRUE,
                   admin_time_reason = $1
               WHERE log_id = $2`,
              [`${adminTimeResult.totalHours} hours of admin time recorded`, insertedLog.log_id]
            )
          } else {
            console.log('[RFID Log API] No admin time calculated (employee worked only scheduled hours)')
          }
        }
        
        console.log('[RFID Log API] ==========================================')
      } catch (adminTimeError) {
        console.error('[RFID Log API] ❌ Error processing admin time:', adminTimeError)
        // Don't fail the main request if admin time processing fails
      }
    }

    return NextResponse.json({ success: true, log: insertedLog })
  } catch (error) {
    console.error('[RFID] Error in RFID log API:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'API health check failed' },
      { status: 500 }
    )
  }
}