import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'
import { formatInTimeZone } from 'date-fns-tz'
import { MANILA_TZ } from '@/lib/timezone-utils'
import {
  buildManilaDateTime,
  getScheduleWindowForEmployeeDate,
  normalizeScheduleType as normalizeScheduleTypeHelper,
  toManilaDateTimeOrNull,
} from '@/lib/schedule-window-helper'
import { getManilaDatePart } from '@/lib/verification-replay-time-helper'
import { getActiveTermId } from '@/lib/active-term-code'
import { getManilaToday } from '@/lib/timezone-utils'

function getDatePart(value: string | null | undefined): string | null {
  return getManilaDatePart(value)
}

function toMinutes(hhmmss: string): number {
  const [hh, mm] = hhmmss.split(':').slice(0, 2).map(Number)
  return (hh || 0) * 60 + (mm || 0)
}

function normalizeVerificationTimestamp(value: string | null | undefined): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return buildManilaDateTime(raw, '00:00:00')
  }

  return toManilaDateTimeOrNull(raw) || raw
}

function toManilaClockMinutes(value: string | null | undefined): number | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  try {
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) return null
    const hh = Number(formatInTimeZone(parsed, MANILA_TZ, 'HH'))
    const mm = Number(formatInTimeZone(parsed, MANILA_TZ, 'mm'))
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
    return hh * 60 + mm
  } catch {
    return null
  }
}

function normalizeAttendanceLogType(value: string | null | undefined): 'IN' | 'OUT' | null {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')

  if (['IN', 'TIME_IN', 'CLOCK_IN', 'TIMEIN', 'CLOCKIN'].includes(normalized)) return 'IN'
  if (['OUT', 'TIME_OUT', 'CLOCK_OUT', 'TIMEOUT', 'CLOCKOUT'].includes(normalized)) return 'OUT'
  return null
}

function normalizeVerificationLogType(value: string | null | undefined): 'IN' | 'OUT' | 'BOTH' | null {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')

  if (['BOTH', 'IN_OUT', 'INOUT', 'IN_AND_OUT', 'INOUTS'].includes(normalized)) return 'BOTH'
  return normalizeAttendanceLogType(normalized)
}

function isMissingColumnError(error: unknown): boolean {
  return String((error as any)?.message || error || '').toLowerCase().includes('column')
}

function normalizeHHMMSS(value: string | null | undefined): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i)
  if (ampmMatch) {
    let hour = Number(ampmMatch[1])
    const minute = Number(ampmMatch[2])
    const second = Number(ampmMatch[3] || '0')
    const period = String(ampmMatch[4] || '').toUpperCase()
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) return null
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59 || second < 0 || second > 59) return null
    if (hour === 12) hour = period === 'AM' ? 0 : 12
    else if (period === 'PM') hour += 12
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
  }
  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return raw
  if (/^\d{2}:\d{2}$/.test(raw)) return `${raw}:00`
  return null
}

function toMinuteOfDay(value: string | null | undefined): number | null {
  const normalized = normalizeHHMMSS(value)
  if (!normalized) return null
  const [hh, mm] = normalized.split(':').slice(0, 2).map(Number)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  return (hh * 60) + mm
}

const MISSED_LOG_MIN_MINUTES = 6 * 60
const MISSED_LOG_MAX_MINUTES = 21 * 60
const MISSED_LOG_MIN_REASON_LENGTH = 20

async function getAttendanceDaySnapshot(empId: number, dateStr: string): Promise<{
  hasAny: boolean
  hasIn: boolean
  hasOut: boolean
}> {
  const logs = await dbQuery<{ log_type: string | null }>(
    `SELECT log_type
     FROM attendance_logs
     WHERE employee_id = $1
       AND date = $2`,
    [empId, dateStr]
  )

  const hasIn = logs.some((log) => normalizeAttendanceLogType(log.log_type) === 'IN')
  const hasOut = logs.some((log) => normalizeAttendanceLogType(log.log_type) === 'OUT')

  return {
    hasAny: logs.length > 0,
    hasIn,
    hasOut,
  }
}

async function applyRejectedMissedLogAbsence(
  empId: number,
  dateStr: string,
  reason: string,
  termId: number | null,
  linkedSchedule?: { scheduleId: number | null; scheduleType: 'teaching' | 'exam' | null }
): Promise<void> {
  const existingLogs = await dbQuery<{ log_type: string | null; attendance_status: string | null }>(
    `SELECT log_type, attendance_status
       FROM attendance_logs
      WHERE employee_id = $1
        AND date = $2`,
    [empId, dateStr]
  )

  const hasIn = existingLogs.some((l) => normalizeAttendanceLogType(l.log_type) === 'IN')
  const hasOut = existingLogs.some((l) => normalizeAttendanceLogType(l.log_type) === 'OUT')

  // Exception rule: if either IN or OUT already exists, do not force-absent both.
  // Example: IN exists but OUT missing remains a valid missed-log filing scenario.
  if (hasIn || hasOut) return

  const hasAbsentRecord = existingLogs.some((l) => String(l.attendance_status || '').toLowerCase() === 'absent')
  if (hasAbsentRecord) return

  const scheduleWindow = await getScheduleWindowForEmployeeDate(empId, dateStr, linkedSchedule)
  const fallbackIn = scheduleWindow?.timeIn || '08:00:00'
  const fallbackOut = scheduleWindow?.timeOut || '17:00:00'
  const rfidCode = await getEmployeeRfid(empId)
  const baseNote = `Verification rejected - Missed log declined: ${reason || 'No valid IN/OUT evidence provided'}`
  const effectiveTermId = Number.isFinite(Number(termId)) && Number(termId) > 0
    ? Number(termId)
    : await getActiveTermId()

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
         rfid_code,
         term_id
       ) VALUES (
         $1, $2, $3, 'IN', 'absent', FALSE, FALSE, $4, $5, $6
       )`,
      [empId, dateStr, buildManilaDateTime(dateStr, fallbackIn), baseNote, rfidCode, effectiveTermId]
    )
  } catch {
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
         $1, $2, $3, 'IN', 'absent', FALSE, FALSE, $4, $5
       )`,
      [empId, dateStr, buildManilaDateTime(dateStr, fallbackIn), baseNote, rfidCode]
    )
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
         rfid_code,
         term_id
       ) VALUES (
         $1, $2, $3, 'OUT', 'absent', FALSE, FALSE, $4, $5, $6
       )`,
      [empId, dateStr, buildManilaDateTime(dateStr, fallbackOut), baseNote, rfidCode, effectiveTermId]
    )
  } catch {
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
         $1, $2, $3, 'OUT', 'absent', FALSE, FALSE, $4, $5
       )`,
      [empId, dateStr, buildManilaDateTime(dateStr, fallbackOut), baseNote, rfidCode]
    )
  }
}

async function getEmployeeRfid(employeeId: number): Promise<string | null> {
  const rows = await dbQuery<{ rfid_code: string | null }>(
    `SELECT rfid_code
     FROM employees
     WHERE employee_id = $1
     LIMIT 1`,
    [employeeId]
  )
  return rows[0]?.rfid_code || null
}

async function getLeaveLimitForStaffType(staffType: string | null | undefined): Promise<number> {
  const normalized = String(staffType || '').toLowerCase().replace(/\s+/g, '-')
  const key = normalized === 'teaching' ? 'max_leaves_per_year_teaching' : 'max_leaves_per_year_non_teaching'

  try {
    const rows = await dbQuery<{ value: string | null }>(
      `SELECT value
       FROM system_settings
       WHERE key = $1
       LIMIT 1`,
      [key]
    )
    const parsed = Number(rows[0]?.value || '10')
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 10
  } catch (error) {
    console.error('[Verification] Failed to load leave token limit setting:', error)
    return 10
  }
}

async function updateVerificationRequestWithFallback(requestId: number, updates: Record<string, any>) {
  const entries = Object.entries(updates).filter(([, v]) => v !== undefined)
  if (entries.length === 0) {
    const rows = await dbQuery<any>(
      `SELECT *
       FROM verification_requests
       WHERE request_id = $1
       LIMIT 1`,
      [requestId]
    )
    return rows[0]
  }

  const setClause = entries.map(([key], index) => `"${key}" = $${index + 1}`).join(', ')
  const params = entries.map(([, value]) => value)
  params.push(requestId)

  try {
    const rows = await dbQuery<any>(
      `UPDATE verification_requests
       SET ${setClause}
       WHERE request_id = $${entries.length + 1}
       RETURNING *`,
      params
    )
    return rows[0]
  } catch (error: any) {
    if (String(error?.message || error).toLowerCase().includes('column')) {
      const { substitution_applied, ...updatesWithoutSub } = updates
      const retryEntries = Object.entries(updatesWithoutSub).filter(([, v]) => v !== undefined)
      if (retryEntries.length === 0) {
        const rows = await dbQuery<any>(
          `SELECT *
           FROM verification_requests
           WHERE request_id = $1
           LIMIT 1`,
          [requestId]
        )
        return rows[0]
      }

      const retrySetClause = retryEntries.map(([key], index) => `"${key}" = $${index + 1}`).join(', ')
      const retryParams = retryEntries.map(([, value]) => value)
      retryParams.push(requestId)

      const retryRows = await dbQuery<any>(
        `UPDATE verification_requests
         SET ${retrySetClause}
         WHERE request_id = $${retryEntries.length + 1}
         RETURNING *`,
        retryParams
      )
      return retryRows[0]
    }
    throw error
  }
}

async function getVerificationRequestsFromLocalDb(staffTypeFilter: 'Teaching' | 'Non-Teaching' | null) {
  const requestedAtExists = await dbQuery<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'verification_requests'
         AND column_name = 'requested_at'
     ) AS exists`
  )

  const createdAtExists = await dbQuery<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'verification_requests'
         AND column_name = 'created_at'
     ) AS exists`
  )

  const params: unknown[] = []
  let where = `WHERE (e.is_active IS NULL OR e.is_active = TRUE)`
  if (staffTypeFilter) {
    params.push(staffTypeFilter)
    where += ` AND e.staff_type = $${params.length}`
  }

  let orderBy = 'vr.request_id DESC'
  if (requestedAtExists[0]?.exists) {
    orderBy = 'vr.requested_at DESC'
  } else if (createdAtExists[0]?.exists) {
    orderBy = 'vr.created_at DESC'
  }

  const rows = await dbQuery<any>(
    `SELECT
       vr.*,
       e.employee_id AS _employee_id,
       e.full_name AS _employee_full_name,
       e.department AS _employee_department,
       e.staff_type AS _employee_staff_type
     FROM verification_requests vr
     LEFT JOIN employees e ON e.employee_id = vr.employee_id
     ${where}
     ORDER BY ${orderBy}`,
    params
  )

  const classifyRequestSource = (request: any): 'automatic' | 'manual' => {
    void request
    return 'manual'
  }

  return rows.map((r: any) => {
    const {
      _employee_id,
      _employee_full_name,
      _employee_department,
      _employee_staff_type,
      ...requestData
    } = r

    return {
      ...requestData,
      request_source: classifyRequestSource(requestData),
      employees:
        _employee_id != null
          ? {
              employee_id: _employee_id,
              full_name: _employee_full_name,
              department: _employee_department,
              staff_type: _employee_staff_type,
            }
          : null,
    }
  })
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const requestedStaffTypeFilter = searchParams.get('staffTypeFilter')
    const staffTypeFilter =
      requestedStaffTypeFilter === 'Teaching' || requestedStaffTypeFilter === 'Non-Teaching'
        ? requestedStaffTypeFilter
        : null

    const items = await getVerificationRequestsFromLocalDb(staffTypeFilter)
    return NextResponse.json({ items })
  } catch (e: any) {
    console.error('verification-requests GET error:', e?.message || e)
    return NextResponse.json({ error: 'Failed to load requests' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const {
      employee_id,
      request_type = 'leave',
      original_time = null,
      requested_time = null,
      time_start = null, // Time range start (HH:MM:SS format, e.g., "12:00:00")
      time_end = null, // Time range end (HH:MM:SS format, e.g., "14:00:00")
      reason = '',
      requested_by = null,
      notes = '',
      log_type = null, // 'IN', 'OUT', or 'BOTH' for missed_log, late_justification, and time_correction requests
    } = body || {}

    const normalizedRequestedTime = normalizeVerificationTimestamp(requested_time)
    const normalizedOriginalTime = normalizeVerificationTimestamp(original_time)
    const normalizedLogType = normalizeVerificationLogType(log_type)

    console.log('[Verification POST] === MISSED LOG DEBUG ===')
    console.log('[Verification POST] Body received:', JSON.stringify({
      employee_id, request_type, requested_time, original_time,
      time_start, time_end, reason: reason?.substring?.(0, 50),
      log_type, notes: notes?.substring?.(0, 30),
    }))
    console.log('[Verification POST] Normalized:', {
      normalizedRequestedTime,
      normalizedOriginalTime,
      normalizedLogType,
      requestedDate: getDatePart(normalizedRequestedTime),
    })

    if (!employee_id || !reason) {
      console.log('[Verification POST] ❌ FAILED: Missing employee_id or reason', { employee_id, reason: !!reason })
      return NextResponse.json({ error: 'Missing employee_id or reason' }, { status: 400 })
    }
    
    // Validate log_type for missed_log, late_justification, and time_correction requests
    if (request_type === 'missed_log') {
      if (!normalizedLogType) {
        console.log('[Verification POST] ❌ FAILED: Missing/invalid log_type for missed_log', { log_type, normalizedLogType })
        return NextResponse.json({ error: 'Missing or invalid log_type. Must be IN, OUT, or BOTH.' }, { status: 400 })
      }
    } else if (request_type === 'late_justification' || request_type === 'time_correction') {
      if (!normalizedLogType || normalizedLogType === 'BOTH') {
        return NextResponse.json({ error: 'Missing or invalid log_type. Must be IN or OUT.' }, { status: 400 })
      }
    }

    const requestedDate = getDatePart(normalizedRequestedTime)
    if ((request_type === 'leave' || request_type === 'missed_log') && !requestedDate) {
      console.log('[Verification POST] ❌ FAILED: Missing requestedDate', { requested_time, normalizedRequestedTime, requestedDate })
      return NextResponse.json({ error: 'Requested date is required.' }, { status: 400 })
    }

    if (request_type === 'missed_log') {
      const reasonText = String(reason || '').trim()
      if (reasonText.length < MISSED_LOG_MIN_REASON_LENGTH) {
        console.log('[Verification POST] ❌ FAILED: Reason too short', { reasonLength: reasonText.length, min: MISSED_LOG_MIN_REASON_LENGTH })
        return NextResponse.json(
          { error: `Missed Log reason must be at least ${MISSED_LOG_MIN_REASON_LENGTH} characters. Current: ${reasonText.length} characters.` },
          { status: 400 }
        )
      }

      if (normalizedLogType === 'BOTH') {
        const startMinutes = toMinuteOfDay(time_start)
        const endMinutes = toMinuteOfDay(time_end)
        if (startMinutes === null || endMinutes === null) {
          console.log('[Verification POST] ❌ FAILED: BOTH time_start/end null', { time_start, time_end, startMinutes, endMinutes })
          return NextResponse.json(
            { error: 'Time In and Time Out are required for Missed Log (BOTH).' },
            { status: 400 }
          )
        }
        if (startMinutes > endMinutes) {
          return NextResponse.json(
            { error: 'Time In must be earlier than Time Out for Missed Log (BOTH).' },
            { status: 400 }
          )
        }
        if (startMinutes < MISSED_LOG_MIN_MINUTES || startMinutes > MISSED_LOG_MAX_MINUTES || endMinutes < MISSED_LOG_MIN_MINUTES || endMinutes > MISSED_LOG_MAX_MINUTES) {
          return NextResponse.json(
            { error: 'Missed Log time must be between 06:00 and 21:00.' },
            { status: 400 }
          )
        }
      } else {
        const minutes = toManilaClockMinutes(normalizedRequestedTime)
        if (minutes === null) {
          console.log('[Verification POST] ❌ FAILED: Single time null', { normalizedRequestedTime, minutes })
          return NextResponse.json(
            { error: 'Time is required for Missed Log.' },
            { status: 400 }
          )
        }
        if (minutes < MISSED_LOG_MIN_MINUTES || minutes > MISSED_LOG_MAX_MINUTES) {
          console.log('[Verification POST] ❌ FAILED: Single time out of range', { minutes, min: MISSED_LOG_MIN_MINUTES, max: MISSED_LOG_MAX_MINUTES })
          return NextResponse.json(
            { error: `Missed Log time must be between 06:00 and 21:00. Current time in minutes: ${minutes}.` },
            { status: 400 }
          )
        }
      }
    }

    if (request_type === 'readjusting') {
      return NextResponse.json({ error: 'Readjusting request type is no longer supported.' }, { status: 400 })
    }

    if ((request_type === 'leave' || request_type === 'missed_log') && requestedDate) {
      const attendanceSnapshot = await getAttendanceDaySnapshot(Number(employee_id), requestedDate)

      if (request_type === 'leave' && attendanceSnapshot.hasAny) {
        return NextResponse.json(
          { error: 'Cannot file leave for this date because attendance data already exists.' },
          { status: 400 }
        )
      }

      if (request_type === 'missed_log') {
        if (attendanceSnapshot.hasIn && attendanceSnapshot.hasOut) {
          console.log('[Verification POST] ❌ FAILED: Both IN and OUT already exist', { attendanceSnapshot })
          return NextResponse.json(
            { error: 'Cannot file missed log for this date because both Time In and Time Out already exist.' },
            { status: 400 }
          )
        }

        if (normalizedLogType === 'BOTH') {
          if (attendanceSnapshot.hasIn || attendanceSnapshot.hasOut) {
            return NextResponse.json(
              { error: 'Cannot file missed log (BOTH) because Time In or Time Out already exists for this date.' },
              { status: 400 }
            )
          }
        } else if (normalizedLogType === 'IN' && attendanceSnapshot.hasIn) {
          return NextResponse.json(
            { error: 'Cannot file missed log (IN) because Time In already exists for this date.' },
            { status: 400 }
          )
        } else if (normalizedLogType === 'OUT' && attendanceSnapshot.hasOut) {
          return NextResponse.json(
            { error: 'Cannot file missed log (OUT) because Time Out already exists for this date.' },
            { status: 400 }
          )
        }
      }
    }

    // Check if employee has been employed for at least 1 year (for leave requests)
    if (request_type === 'leave') {
      const employeeRows = await dbQuery<{ hire_date: string | null; staff_type: string | null }>(
        `SELECT hire_date, staff_type
         FROM employees
         WHERE employee_id = $1
         LIMIT 1`,
        [employee_id]
      )
      const employee = employeeRows[0]

      if (!employee) {
        return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
      }
      
      if (employee.hire_date) {
        const hireDateStr = String(employee.hire_date).slice(0, 10)
        const hireDate = new Date(`${hireDateStr}T00:00:00+08:00`)
        const todayManila = getManilaToday()
        const today = new Date(`${todayManila}T00:00:00+08:00`)

        // Calculate 1 year from hire date in Manila time.
        const oneYearFromHire = new Date(hireDate)
        oneYearFromHire.setFullYear(oneYearFromHire.getFullYear() + 1)

        // Employee can file only when they have reached at least 1 year of tenure as of today.
        if (today < oneYearFromHire) {
          const daysRemaining = Math.ceil((oneYearFromHire.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          return NextResponse.json({
            error: `Employee must be employed for at least 1 year before filing leave requests. Hire date: ${hireDateStr}. ${daysRemaining} day(s) remaining.`
          }, { status: 400 })
        }
        
        // Check leave token limit per staff type (resets yearly)
        try {
          const currentYear = new Date().getFullYear()
          const start = `${currentYear}-01-01`
          const nextYearStart = `${currentYear + 1}-01-01`
          const maxLeaves = await getLeaveLimitForStaffType(employee.staff_type)

          const leaveCountRows = await dbQuery<{ leave_count: number }>(
            `SELECT (
                SELECT COUNT(*)::int
                FROM verification_requests
                WHERE employee_id = $1
                  AND request_type = 'leave'
                  AND status IN ('pending', 'approved')
                  AND requested_time >= $2::date
                  AND requested_time < $3::date
              ) + (
                SELECT COUNT(*)::int
                FROM leave_requests
                WHERE employee_id = $1
                  AND status IN ('pending', 'approved')
                  AND date_from >= $2::date
                  AND date_from < $3::date
              ) AS leave_count`,
            [employee_id, start, nextYearStart]
          )

          const leaveCount = leaveCountRows[0]?.leave_count || 0

          if (leaveCount >= maxLeaves) {
            return NextResponse.json({
              error: `Employee has reached their leave token limit (${maxLeaves} per year). Tokens reset next year.`
            }, { status: 400 })
          }
        } catch (creditError) {
          console.error('[Verification] Error checking leave credit limit:', creditError)
          // Continue with request if check fails (don't block)
        }
      } else {
        return NextResponse.json({ error: 'Employee hire date is required before leave requests can be filed.' }, { status: 400 })
      }
    }

    // Check for duplicate requests for the same schedule
    // If schedule_id and schedule_type are provided, check for existing pending/approved requests
    const schedule_id = (body as any).schedule_id || null
    const schedule_type = (body as any).schedule_type || null
    
    if (schedule_id && schedule_type && request_type === 'leave') {
      // Check for existing pending or approved requests for this schedule
      try {
        const existingRequests = await dbQuery<{ request_id: number; status: string }>(
          `SELECT request_id, status
           FROM verification_requests
           WHERE employee_id = $1
             AND request_type = 'leave'
             AND schedule_id = $2
             AND schedule_type = $3
             AND status IN ('pending', 'approved')
           LIMIT 1`,
          [employee_id, schedule_id, schedule_type]
        )

        if (existingRequests.length > 0) {
          const existing = existingRequests[0]
          return NextResponse.json({
            error: `A ${existing.status} verification request already exists for this schedule. Please review the existing request instead.`
          }, { status: 400 })
        }
      } catch (checkError) {
        console.error('[Verification] Error checking for duplicates:', checkError)
      }
    }
    
    // Also check for duplicate requests based on requested_time and time range
    if (normalizedRequestedTime && request_type === 'leave') {
      const requestedDate = String(getDatePart(normalizedRequestedTime) || '')
      
      // If time range is specified, check for overlapping time ranges
      if (time_start && time_end) {
        const dateRequests = await dbQuery<any>(
          `SELECT request_id, status, time_start, time_end, requested_time
           FROM verification_requests
           WHERE employee_id = $1
             AND request_type = 'leave'
             AND status IN ('pending', 'approved')
             AND time_start IS NOT NULL
             AND time_end IS NOT NULL
           ORDER BY request_id DESC
           LIMIT 10`,
          [employee_id]
        )

        if (dateRequests) {
          // Check if any request has the same date and overlapping time range
          for (const req of dateRequests) {
            const reqDate = getDatePart(req.requested_time)
            if (reqDate === requestedDate && req.time_start && req.time_end) {
              // Convert times to minutes for comparison
              const reqStartMinutes = toMinutes(req.time_start)
              const reqEndMinutes = toMinutes(req.time_end)
              const newStartMinutes = toMinutes(time_start)
              const newEndMinutes = toMinutes(time_end)
              
              // Check if time ranges overlap
              if (newStartMinutes < reqEndMinutes && newEndMinutes > reqStartMinutes) {
                return NextResponse.json({ 
                  error: `A ${req.status} verification request already exists for this schedule with overlapping time range (${req.time_start} - ${req.time_end}). Please review the existing request instead.` 
                }, { status: 400 })
              }
            }
          }
        }
      } else {
        // No time range - check for whole-day requests on the same date
        const wholeDayRequests = await dbQuery<any>(
          `SELECT request_id, status, requested_time
           FROM verification_requests
           WHERE employee_id = $1
             AND request_type = 'leave'
             AND status IN ('pending', 'approved')
             AND time_start IS NULL
             AND time_end IS NULL
           ORDER BY request_id DESC
           LIMIT 10`,
          [employee_id]
        )

        if (wholeDayRequests) {
          for (const req of wholeDayRequests) {
            const reqDate = getDatePart(req.requested_time)
            if (reqDate === requestedDate) {
              return NextResponse.json({ 
                error: `A ${req.status} verification request already exists for this date. Please review the existing request instead.` 
              }, { status: 400 })
            }
          }
        }
      }
    }

    const insertRow: any = {
      employee_id,
      request_type,
      original_time: normalizedOriginalTime,
      requested_time: normalizedRequestedTime,
      time_start: time_start || null, // Time range start for time-based leave requests
      time_end: time_end || null, // Time range end for time-based leave requests
      reason,
      notes: notes || null,
      status: 'pending',
      requested_by: requested_by || null,
      schedule_id: schedule_id || null,
      schedule_type: schedule_type || null,
      log_type: normalizedLogType || null, // 'IN', 'OUT', or 'BOTH' for log-type requests
    }

    let insertedRows: any[]
    try {
      insertedRows = await dbQuery<any>(
        `INSERT INTO verification_requests (
           employee_id,
           request_type,
           original_time,
           requested_time,
           time_start,
           time_end,
           reason,
           notes,
           status,
           requested_by,
           requested_at,
           schedule_id,
           schedule_type,
           log_type
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, $12, $13
         )
         RETURNING *`,
        [
          insertRow.employee_id,
          insertRow.request_type,
          insertRow.original_time,
          insertRow.requested_time,
          insertRow.time_start,
          insertRow.time_end,
          insertRow.reason,
          insertRow.notes,
          insertRow.status,
          insertRow.requested_by,
          insertRow.schedule_id,
          insertRow.schedule_type,
          insertRow.log_type,
        ]
      )
    } catch (insertErr) {
      // Fallback: try without notes column in case migration hasn't been run
      console.warn('[Verification POST] INSERT with notes failed, falling back:', (insertErr as any)?.message)
      insertedRows = await dbQuery<any>(
        `INSERT INTO verification_requests (
           employee_id,
           request_type,
           original_time,
           requested_time,
           time_start,
           time_end,
           reason,
           status,
           requested_by,
           requested_at,
           schedule_id,
           schedule_type,
           log_type
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11, $12
         )
         RETURNING *`,
        [
          insertRow.employee_id,
          insertRow.request_type,
          insertRow.original_time,
          insertRow.requested_time,
          insertRow.time_start,
          insertRow.time_end,
          insertRow.reason,
          insertRow.status,
          insertRow.requested_by,
          insertRow.schedule_id,
          insertRow.schedule_type,
          insertRow.log_type,
        ]
      )
    }
    console.log('[Verification POST] ✅ INSERT success:', insertedRows?.[0]?.request_id)
    const data = insertedRows[0]
    return NextResponse.json({ item: data })
  } catch (e: any) {
    console.error('verification-requests POST error:', e?.message || e)
    return NextResponse.json({ error: e?.message || 'Failed to create request' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { requestId, updates } = body || {}
    if (!requestId || !updates) return NextResponse.json({ error: 'Missing requestId/updates' }, { status: 400 })

    // Remove substitution_applied from updates if column doesn't exist (migration not run yet)
    // This prevents errors when the column doesn't exist
    const safeUpdates: any = { ...updates }

    const data: any = await updateVerificationRequestWithFallback(Number(requestId), safeUpdates)

    // If approved, apply side-effects to attendance data
    const finalStatus = (updates?.status || data?.status)
    if (finalStatus === 'approved') {
      try {
        const row: any = data
        const empId: number = row.employee_id
        const type: string = row.request_type
        const reasonText: string = String(row.reason || '')
        const reqTime: string | null = row.requested_time
        const origTime: string | null = row.original_time
        const rowTermId = Number((row as any)?.term_id)
        const effectiveTermId = Number.isFinite(rowTermId) && rowTermId > 0 ? rowTermId : null

        const dateISO = (ts?: string | null) => toManilaDateTimeOrNull(ts)
        const dateOnly = (ts?: string | null) => getDatePart(ts)

        if (type === 'leave') {
          const d = dateOnly(reqTime)
          // Safely get time_start and time_end (may not exist if migration not run)
          const timeStart = (row as any).time_start || null // Time range start (HH:MM:SS format)
          const timeEnd = (row as any).time_end || null // Time range end (HH:MM:SS format)
          const substitutionApplied = (updates as any)?.substitution_applied || (row as any)?.substitution_applied || false
          const leaveReason = row.reason || 'Approved leave'
          
          if (empId && d) {
            // Get employee RFID code
            const rfid_code = await getEmployeeRfid(empId)

            const existingLogs = await dbQuery<any>(
              `SELECT log_id, attendance_status, log_time, log_type, notes
               FROM attendance_logs
               WHERE employee_id = $1
                 AND date = $2
               ORDER BY log_time DESC
               LIMIT 10`,
              [empId, d]
            )
            
            // Check if this is a time-based leave request (has time_start and time_end)
            if (timeStart && timeEnd && typeof timeStart === 'string' && typeof timeEnd === 'string') {
              // Time-based leave request (e.g., 12:00PM-2:00PM)
              // Mark employee as absent for the specific time range
              
              // If no logs exist, create an absent record for the time range
              if (!existingLogs || existingLogs.length === 0) {
                // Create absent record with leave reason
                // Note: log_type is NULL for absence records (not IN/OUT)
                // Note: attendance_status is 'absent' (now allowed by DB constraint)
                const logTime = `${d}T${timeStart}+08:00` // Use time_start as log_time
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
                
                console.log(`[Verification] Creating absence log for leave approval - Employee ${empId} on ${d}`)
                console.log(`[Verification] Insert data:`, JSON.stringify(insertData, null, 2))
                
                try {
                  const insertedLog = await dbQuery<any>(
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
                     )
                     RETURNING *`,
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
                  console.log(`[Verification] ✅ Successfully created absence log:`, insertedLog)
                } catch (insertError) {
                  console.error(`[Verification] ❌ Error creating absence log:`, insertError)
                  console.error(`[Verification] Failed insert data was:`, JSON.stringify(insertData, null, 2))
                }
              } else {
                // Update existing logs to mark as absent for the time range
                // Find logs that fall within the time range
                const timeStartMinutes = timeStart.split(':').slice(0, 2).map(Number).reduce((h: number, m: number) => h * 60 + m, 0)
                const timeEndMinutes = timeEnd.split(':').slice(0, 2).map(Number).reduce((h: number, m: number) => h * 60 + m, 0)
                
                for (const log of existingLogs) {
                  const logTimeMinutes = toManilaClockMinutes(log.log_time)
                  if (Number.isFinite(logTimeMinutes as number)) {
                    
                    // If log time falls within the leave time range, mark as absent with reason
                    if (Number(logTimeMinutes) >= timeStartMinutes && Number(logTimeMinutes) <= timeEndMinutes) {
                      try {
                        await dbQuery(
                          `UPDATE attendance_logs
                           SET attendance_status = 'absent',
                               notes = $1
                           WHERE log_id = $2`,
                          [`Leave approved: ${leaveReason}`, log.log_id]
                        )
                        console.log(`[Verification] ✅ Updated log ${log.log_id} to absent`)
                      } catch (updateError) {
                        console.error(`[Verification] ❌ Error updating log ${log.log_id}:`, updateError)
                      }
                    }
                  }
                }
              }
            } else {
              // Whole-day leave request (no time range)
              // Create absent record for the entire day
              if (!existingLogs || existingLogs.length === 0) {
                // Create absent record with leave reason
                // Note: log_type is NULL for absence records (not IN/OUT)
                // Note: attendance_status is 'absent' (now allowed by DB constraint)
                const logTime = `${d}T00:00:00+08:00`
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
                
                console.log(`[Verification] Creating absent log for leave approval - Employee ${empId} on ${d}`)
                console.log(`[Verification] Insert data:`, JSON.stringify(insertData, null, 2))
                
                try {
                  const insertedLog = await dbQuery<any>(
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
                     )
                     RETURNING *`,
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
                  console.log(`[Verification] ✅ Successfully created absence log:`, insertedLog)
                } catch (insertError) {
                  console.error(`[Verification] ❌ Error creating absence log:`, insertError)
                  console.error(`[Verification] Failed insert data was:`, JSON.stringify(insertData, null, 2))
                }
              } else {
                // Update existing logs to mark as absent with leave reason
                console.log(`[Verification] Updating ${existingLogs.length} existing log(s) to absent`)
                for (const log of existingLogs) {
                  try {
                    await dbQuery(
                      `UPDATE attendance_logs
                       SET attendance_status = 'absent',
                           notes = $1
                       WHERE log_id = $2`,
                      [`Leave approved: ${leaveReason}`, log.log_id]
                    )
                    console.log(`[Verification] ✅ Updated log ${log.log_id} to absent`)
                  } catch (updateError) {
                    console.error(`[Verification] ❌ Error updating log ${log.log_id}:`, updateError)
                  }
                }
              }
              
              // Also mark in attendance_daily_status
              await dbQuery(
                `INSERT INTO attendance_daily_status (
                   employee_id,
                   date,
                   status,
                   updated_at
                 ) VALUES (
                   $1, $2, $3, NOW()
                 )
                 ON CONFLICT (employee_id, date)
                 DO UPDATE SET
                   status = EXCLUDED.status,
                   updated_at = EXCLUDED.updated_at`,
                [empId, d, 'On Leave']
              )
            }
          }
        } else if (type === 'late_justification') {
          // Clear late flag for the specified log type
          const d = dateOnly(reqTime) || dateOnly(origTime)
          if (empId && d) {
            // Get log_type from the request (required for late_justification)
            const logType = (row as any).log_type || null
            
            if (logType && (logType === 'IN' || logType === 'OUT')) {
              // Update the specific log type (IN or OUT)
              await dbQuery(
                `UPDATE attendance_logs
                 SET is_late = false,
                     attendance_status = 'on_time'
                 WHERE employee_id = $1
                   AND date = $2
                   AND log_type = $3`,
                [empId, d, logType]
              )

              const targetRows = await dbQuery<{ count: number }>(
                `SELECT COUNT(*)::int AS count
                 FROM attendance_logs
                 WHERE employee_id = $1
                   AND date = $2
                   AND log_type = $3`,
                [empId, d, logType]
              )

              if (Number(targetRows[0]?.count || 0) === 0) {
                const rfidCode = await getEmployeeRfid(empId)
                const fallbackTime = dateISO(reqTime) || dateISO(origTime) || `${d}T08:00:00+08:00`
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
                     $1, $2, $3, $4, 'on_time', FALSE, FALSE, $5, $6
                   )`,
                  [empId, d, fallbackTime, logType, 'Verification approved - Late justification applied', rfidCode]
                )
              }
            } else {
              // Fallback: clear late flag for all logs on that day (backward compatibility)
              await dbQuery(
                `UPDATE attendance_logs
                 SET is_late = false,
                     attendance_status = 'on_time'
                 WHERE employee_id = $1
                   AND date = $2`,
                [empId, d]
              )
            }
          }
        } else if (type === 'missed_log') {
          // Create a new RFID log entry for the missed tap
          // Use the log_type (IN/OUT/BOTH) specified in the request
          if (empId && reqTime) {
            const logType = normalizeVerificationLogType((row as any).log_type)
            const dateStr = dateOnly(reqTime) || dateOnly(origTime)
            const rfid_code = await getEmployeeRfid(empId)

            const insertMissedLog = async (logTypeValue: 'IN' | 'OUT', logTimeValue: string, note: string) => {
              const insertData: any = {
                employee_id: empId,
                date: dateStr,
                log_time: logTimeValue,
                log_type: logTypeValue,
                attendance_status: 'missed_log',
                term_id: effectiveTermId,
                notes: note,
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
                     notes,
                     rfid_code,
                     term_id
                   ) VALUES (
                     $1, $2, $3, $4, $5, $6, $7, $8
                   )`,
                  [
                    insertData.employee_id,
                    insertData.date,
                    insertData.log_time,
                    insertData.log_type,
                    insertData.attendance_status || null,
                    insertData.notes,
                    insertData.rfid_code || null,
                    insertData.term_id || null,
                  ]
                )
              } catch {
                await dbQuery(
                  `INSERT INTO attendance_logs (
                     employee_id,
                     date,
                     log_time,
                     log_type,
                     attendance_status,
                     notes,
                     rfid_code
                   ) VALUES (
                     $1, $2, $3, $4, $5, $6, $7
                   )`,
                  [
                    insertData.employee_id,
                    insertData.date,
                    insertData.log_time,
                    insertData.log_type,
                    insertData.attendance_status || null,
                    insertData.notes,
                    insertData.rfid_code || null,
                  ]
                )
              }
            }

            const upsertMissedLog = async (logTypeValue: 'IN' | 'OUT', logTimeValue: string, note: string) => {
              if (!dateStr) return
              // Replace existing DTR row for the same date/log_type so the table reflects the approved missed log.
              // If none exists, create it.
              const existingRows = await dbQuery<{ log_id: number; log_time: string | null }>(
                `SELECT log_id, log_time
                 FROM attendance_logs
                 WHERE employee_id = $1
                   AND date = $2
                   AND log_type = $3
                 ORDER BY log_time ${logTypeValue === 'IN' ? 'ASC' : 'DESC'}
                 LIMIT 1`,
                [empId, dateStr, logTypeValue]
              )

              const existing = existingRows[0]
              if (existing?.log_id) {
                try {
                  await dbQuery(
                    `UPDATE attendance_logs
                     SET log_time = $1,
                         attendance_status = 'missed_log',
                         notes = $2,
                         rfid_code = COALESCE(rfid_code, $3),
                         term_id = COALESCE(term_id, $4),
                         is_late = FALSE,
                         is_early_out = FALSE
                     WHERE log_id = $5`,
                    [logTimeValue, note, rfid_code, effectiveTermId, existing.log_id]
                  )
                  return
                } catch (updateErr) {
                  if (!isMissingColumnError(updateErr)) throw updateErr
                  await dbQuery(
                    `UPDATE attendance_logs
                     SET log_time = $1,
                         attendance_status = 'missed_log',
                         notes = $2,
                         rfid_code = COALESCE(rfid_code, $3),
                         is_late = FALSE,
                         is_early_out = FALSE
                     WHERE log_id = $4`,
                    [logTimeValue, note, rfid_code, existing.log_id]
                  )
                  return
                }
              }

              await insertMissedLog(logTypeValue, logTimeValue, note)
            }

            if (!dateStr) {
              console.error('[Verification] Missing date for missed_log request:', requestId)
              return
            }

            if (!logType) {
              console.error('[Verification] Invalid or missing log_type for missed_log request:', requestId)
              const h = new Date(reqTime).getHours()
              const fallbackLogType = h <= 12 ? 'IN' : 'OUT'
              await upsertMissedLog(fallbackLogType, dateISO(reqTime) || reqTime, 'Verification approved - Missed log created (fallback)')
            } else if (logType === 'BOTH') {
              const startTime = normalizeHHMMSS((row as any).time_start)
              const endTime = normalizeHHMMSS((row as any).time_end)
              if (!startTime || !endTime) {
                console.error('[Verification] Missing time_start/time_end for missed_log BOTH:', requestId)
                return
              }

              await upsertMissedLog('IN', buildManilaDateTime(dateStr, startTime), 'Verification approved - IN missed log created (BOTH)')
              await upsertMissedLog('OUT', buildManilaDateTime(dateStr, endTime), 'Verification approved - OUT missed log created (BOTH)')
            } else {
              console.log(`[Verification] Creating ${logType} log for employee ${empId} at ${dateISO(reqTime)}`)
              await upsertMissedLog(logType, dateISO(reqTime) || reqTime, `Verification approved - ${logType} missed log created`)
            }
          }
        } else if (type === 'time_correction') {
          // Update the log time and status for the specified log type
          const d = dateOnly(origTime)
          if (empId && d && reqTime) {
            // Get log_type from the request (required for time_correction)
            const logType = (row as any).log_type || null
            // Get corrected_time and corrected_status from updates
            const correctedTime = body.updates?.corrected_time || null
            const correctedStatusRaw = String(body.updates?.corrected_status || 'on-time').toLowerCase().trim()
            const correctedStatus = correctedStatusRaw === 'on-time' ? 'on_time'
              : correctedStatusRaw === 'under-time' ? 'undertime'
              : correctedStatusRaw === 'on leave' ? 'on_leave'
              : correctedStatusRaw
            
            if (logType && (logType === 'IN' || logType === 'OUT')) {
              // Update the specific log type (IN or OUT)
              const rows = await dbQuery<any>(
                `SELECT log_id, log_time, log_type, date
                 FROM attendance_logs
                 WHERE employee_id = $1
                   AND date = $2
                   AND log_type = $3
                 ORDER BY log_time ${logType === 'IN' ? 'ASC' : 'DESC'}
                 LIMIT 1`,
                [empId, d, logType]
              )

              if (rows && rows.length > 0) {
                // Build corrected timestamp from date + correctedTime
                let correctedTimestamp: string
                if (correctedTime) {
                  // Use the corrected time provided by admin
                  const dateStr = rows[0].date
                  correctedTimestamp = `${dateStr}T${correctedTime}:00+08:00`
                } else {
                  // Fallback to requested_time
                  correctedTimestamp = dateISO(reqTime) || buildManilaDateTime(d, '08:00:00')
                }
                
                console.log(`[Verification] Updating ${logType} log for employee ${empId} - Time: ${correctedTimestamp}, Status: ${correctedStatus}`)
                
                // Update the log with corrected time and status
                await dbQuery(
                  `UPDATE attendance_logs
                   SET log_time = $1,
                       attendance_status = $2,
                       is_late = $3,
                       is_early_out = $4,
                       notes = $5
                   WHERE log_id = $6`,
                  [
                    correctedTimestamp,
                    correctedStatus,
                    correctedStatus === 'late',
                    correctedStatus === 'undertime',
                    `Time corrected via verification request - Set to ${correctedStatus}`,
                    rows[0].log_id,
                  ]
                )
              } else {
                const rfidCode = await getEmployeeRfid(empId)
                const correctedTimestamp = correctedTime
                  ? `${d}T${correctedTime}:00+08:00`
                  : dateISO(reqTime) || `${d}T08:00:00+08:00`

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
                    empId,
                    d,
                    correctedTimestamp,
                    logType,
                    correctedStatus,
                    correctedStatus === 'late',
                    correctedStatus === 'undertime',
                    `Time corrected via verification request - Set to ${correctedStatus}`,
                    rfidCode,
                  ]
                )
              }
            } else {
              // Fallback: use old logic (backward compatibility)
              const rows = await dbQuery<any>(
                `SELECT log_id, log_time, log_type, date
                 FROM attendance_logs
                 WHERE employee_id = $1
                   AND date = $2
                 ORDER BY log_time ASC`,
                [empId, d]
              )

              if (rows && rows.length) {
                // Pick first IN if exists else last OUT else first row
                const firstIn = rows.find((r: any) => r.log_type === 'IN')
                const lastOut = [...rows].reverse().find((r: any) => r.log_type === 'OUT')
                const target = firstIn || lastOut || rows[0]
                
                // Build corrected timestamp from date + correctedTime
                let correctedTimestamp: string
                if (correctedTime) {
                  const dateStr = target.date
                  correctedTimestamp = `${dateStr}T${correctedTime}:00+08:00`
                } else {
                  correctedTimestamp = dateISO(reqTime) || buildManilaDateTime(d, '08:00:00')
                }
                
                await dbQuery(
                  `UPDATE attendance_logs
                   SET log_time = $1,
                       attendance_status = $2,
                       is_late = $3,
                       is_early_out = $4,
                       notes = $5
                   WHERE log_id = $6`,
                  [
                    correctedTimestamp,
                    correctedStatus,
                    correctedStatus === 'late',
                    correctedStatus === 'undertime',
                    `Time corrected via verification request - Set to ${correctedStatus}`,
                    target.log_id,
                  ]
                )
              } else {
                const rfidCode = await getEmployeeRfid(empId)
                const correctedTimestamp = correctedTime
                  ? `${d}T${correctedTime}:00+08:00`
                  : dateISO(reqTime) || `${d}T08:00:00+08:00`

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
                     $1, $2, $3, 'IN', $4, $5, $6, $7, $8
                   )`,
                  [
                    empId,
                    d,
                    correctedTimestamp,
                    correctedStatus,
                    correctedStatus === 'late',
                    correctedStatus === 'undertime',
                    `Time corrected via verification request - Set to ${correctedStatus}`,
                    rfidCode,
                  ]
                )
              }
            }
          }
        }
      } catch (sideErr) {
        console.warn('verification-requests side-effect error:', (sideErr as any)?.message || sideErr)
      }
    } else if (finalStatus === 'rejected') {
      try {
        const row: any = data
        const empId: number = row.employee_id
        const type: string = row.request_type
        const reasonText: string = String(row.reason || '')
        const reqTime: string | null = row.requested_time
        const origTime: string | null = row.original_time
        const rowTermId = Number((row as any)?.term_id)
        const effectiveTermId = Number.isFinite(rowTermId) && rowTermId > 0 ? rowTermId : null

        if (type === 'missed_log') {
          const d = getDatePart(reqTime) || getDatePart(origTime)
          if (empId && d) {
            const scheduleIdNumber = Number((row as any).schedule_id)
            await applyRejectedMissedLogAbsence(empId, d, reasonText, effectiveTermId, {
              scheduleId: Number.isFinite(scheduleIdNumber) ? scheduleIdNumber : null,
              scheduleType: normalizeScheduleTypeHelper((row as any).schedule_type),
            })
          }
        }
      } catch (sideErr) {
        console.warn('verification-requests rejected side-effect error:', (sideErr as any)?.message || sideErr)
      }
    }

    // Create notification to employee regardless of status change
    try {
      if (data?.employee_id) {
        await dbQuery(
          `INSERT INTO notifications (
             recipient_id,
             recipient_type,
             notification_type,
             type,
             title,
             message,
             meta,
             source,
             channel,
             status
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
           )`,
          [
            data.employee_id,
            'employee',
            'verification',
            'verification',
            `Verification ${finalStatus}`,
            `Your ${data.request_type} request has been ${finalStatus}.`,
            JSON.stringify({ request_id: data.request_id }),
            'system',
            'verification',
            'pending',
          ]
        )
      }
    } catch {}

    // Notify all admin users (including requester/reviewer) when a missed log is approved
    if (finalStatus === 'approved' && data?.request_type === 'missed_log') {
      try {
        // Get the employee name
        const empRows = await dbQuery<{ full_name: string }>(
          `SELECT CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')) AS full_name
           FROM employees WHERE employee_id = $1 LIMIT 1`,
          [data.employee_id]
        )
        const employeeName = empRows[0]?.full_name?.trim() || `Employee #${data.employee_id}`

        // Get the admin who approved/reviewed (reviewed_by)
        const reviewedBy = updates?.reviewed_by || data?.reviewed_by || null
        let adminName = 'An admin'
        if (reviewedBy) {
          const adminRows = await dbQuery<{ full_name: string; email: string }>(
            `SELECT CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')) AS full_name, email
             FROM admin_users WHERE admin_id = $1 LIMIT 1`,
            [reviewedBy]
          )
          if (adminRows[0]?.full_name?.trim()) {
            adminName = adminRows[0].full_name.trim()
          } else if (adminRows[0]?.email) {
            adminName = adminRows[0].email
          }
        }

        // Format the date and time info
        const missedDate = getDatePart(data.requested_time) || 'unknown date'
        const logType = data.log_type || 'IN/OUT'
        let timeInfo = ''
        if (logType === 'BOTH' && data.time_start && data.time_end) {
          timeInfo = `IN ${data.time_start} / OUT ${data.time_end}`
        } else if (data.requested_time) {
          const timePart = String(data.requested_time || '').match(/T(\d{2}:\d{2})/)
          timeInfo = timePart ? `${timePart[1]}` : 'unknown time'
        }

        // Notify all admins (include approver/reviewer and requester when they are admins)
        const adminUsers = await dbQuery<{ admin_id: number }>(
          `SELECT admin_id FROM admin_users`
        )

        // Send notification to each admin
        for (const admin of adminUsers) {
          try {
            await dbQuery(
              `INSERT INTO notifications (
                 recipient_id,
                 recipient_type,
                 notification_type,
                 type,
                 title,
                 message,
                 meta,
                 source,
                 channel,
                 status
               ) VALUES (
                 $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
               )`,
              [
                admin.admin_id,
                'admin',
                'missed_log_approved',
                'missed_log_approved',
                'Missed Log Approved',
                `${employeeName} has an approved missed log on ${missedDate} at ${timeInfo} [${logType}]. Status: Missed Log.`,
                JSON.stringify({ request_id: data.request_id, employee_id: data.employee_id, approved_by: adminName, status: 'missed_log' }),
                'system',
                'verification',
                'pending',
              ]
            )
          } catch {}
        }
      } catch (notifError) {
        console.error('[Verification] Error sending missed log admin notification:', notifError)
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Verification request ${finalStatus} successfully`, 
      data 
    })
  } catch (e: any) {
    console.error('verification-requests PATCH error:', e?.message || e)
    return NextResponse.json({ error: 'Failed to update request' }, { status: 500 })
  }
}


