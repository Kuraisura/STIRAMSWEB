import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'
import { hasWorkStarted, isSunday } from '@/lib/attendance-helpers'
import { getDaysInRange, parseManilaDate, getManilaToday, MANILA_TZ } from '@/lib/timezone-utils'
import { formatInTimeZone } from 'date-fns-tz'
import { calculateNonTeachingGapMinutes, getExpectedScheduleBounds, mergeMinuteSlots, minutesToClock12h, minutesToDurationLabel, parseClockToMinutesFlexible, subtractMinuteSlots, toMinuteSlot, type MinuteSlot } from '@/lib/non-teaching-load'

export const dynamic = 'force-dynamic'

// Use centralized Manila timezone utility for date range generation
const toDaysInclusive = (start: string, end: string): string[] => {
  return getDaysInRange(start, end)
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const employeeIdStr = searchParams.get('employeeId') || ''
    const start = (searchParams.get('start') || '').substring(0, 10)
    const end = (searchParams.get('end') || '').substring(0, 10)
    const employee_id = parseInt(employeeIdStr, 10)
    
    console.log(`[irregularities/detail] Request params: employeeId=${employeeIdStr}, start=${start}, end=${end}`)
    
    if (!employee_id || !start || !end) {
      console.error(`[irregularities/detail] Missing params: employeeId=${employeeIdStr}, start=${start}, end=${end}`)
      return NextResponse.json({ error: 'Missing employeeId/start/end' }, { status: 400 })
    }

    // Get employee's hire_date and start_date
    const employeeRows = await dbQuery<{ start_date: string | null; hire_date: string | null }>(
      `
        SELECT
          start_date::text AS start_date,
          hire_date::text AS hire_date
        FROM employees
        WHERE employee_id = $1
        LIMIT 1
      `,
      [employee_id]
    )

    if (employeeRows.length === 0) {
      console.error(`[irregularities/detail] Employee ${employee_id} not found in local database`)
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }
    const employee = employeeRows[0]

    const hireDate = employee?.hire_date || null
    const startDate = employee?.start_date || employee?.hire_date || null
    const today = getManilaToday() // Use Manila timezone for today's date
    console.log(`[irregularities/detail] Employee ${employee_id}: hireDate=${hireDate}, startDate=${startDate}, today=${today}`)

    // CRITICAL: Fetch employee's schedules to check if they have a schedule for each day
    // Only mark absent if employee has a schedule for that day
    let schedulesForEmployee: Array<{ day_of_week: number }> = []
    try {
      const allSchedules = await dbQuery<{ day_of_week: number }>(
        `
          SELECT DISTINCT day_of_week
          FROM (
            SELECT day_of_week FROM teaching_schedules WHERE employee_id = $1
            UNION ALL
            SELECT day_of_week FROM exam_schedules WHERE employee_id = $1
          ) schedules
          WHERE day_of_week BETWEEN 1 AND 6
        `,
        [employee_id]
      )

      // Combine all schedules and get unique day_of_week values
      const uniqueDays = new Set<number>()
      allSchedules.forEach(s => {
        if (s.day_of_week && s.day_of_week >= 1 && s.day_of_week <= 6) {
          uniqueDays.add(s.day_of_week)
        }
      })
      schedulesForEmployee = Array.from(uniqueDays).map(dow => ({ day_of_week: dow }))
    } catch (e) {
      console.warn('Error fetching schedules for employee:', e)
      // If we can't fetch schedules, default to backward compatibility (assume has schedule)
    }

    // Helper function to check if employee has a schedule for a specific date
    // Use Manila timezone for date parsing to ensure correct day calculation
    const hasScheduleForDate = (dateStr: string): boolean => {
      try {
        // Parse date in Manila timezone to get correct day of week
        const dateObj = new Date(dateStr + 'T00:00:00+08:00')
        const jsDay = dateObj.getDay() // 0=Sunday, 1=Monday, ..., 6=Saturday
        if (jsDay === 0) return false // Sunday - no schedules
        // Convert JS day (1-6) to schedule day_of_week (1=Monday, ..., 6=Saturday)
        const scheduleDayMap: Record<number, number> = {
          1: 1, // Monday
          2: 2, // Tuesday
          3: 3, // Wednesday
          4: 4, // Thursday
          5: 5, // Friday
          6: 6, // Saturday
        }
        const scheduleDay = scheduleDayMap[jsDay]
        if (!scheduleDay) return false
        // Check if employee has a schedule for this day
        return schedulesForEmployee.some(s => s.day_of_week === scheduleDay)
      } catch (error) {
        console.error(`[irregularities/detail] Error checking schedule for date ${dateStr}:`, error)
        return false
      }
    }

    const teachingWindows = await dbQuery<{ day_of_week: number | null; time_start: string | null; time_end: string | null }>(
      `
        SELECT day_of_week, time_start::text AS time_start, time_end::text AS time_end
        FROM teaching_schedules
        WHERE employee_id = $1
          AND (status IS NULL OR LOWER(status) IN ('available', 'active'))
      `,
      [employee_id]
    )

    const examWindows = await dbQuery<{ exam_date: string | null; day_of_week: number | null; time_start: string | null; time_end: string | null }>(
      `
        SELECT exam_date::text AS exam_date, day_of_week, time_start::text AS time_start, time_end::text AS time_end
        FROM exam_schedules
        WHERE employee_id = $1
          AND (status IS NULL OR LOWER(status) IN ('available', 'active'))
      `,
      [employee_id]
    )

    const substitutions = await dbQuery<{
      substitution_date: string | null
      original_employee_id: number | null
      substitute_employee_id: number | null
      start_time: string | null
      end_time: string | null
    }>(
      `
        SELECT
          substitution_date::text AS substitution_date,
          original_employee_id,
          substitute_employee_id,
          start_time::text AS start_time,
          end_time::text AS end_time
        FROM class_substitutions_v2
        WHERE substitution_date BETWEEN $2::date AND $3::date
          AND COALESCE(status, 'pending') = 'approved'
          AND (original_employee_id = $1 OR substitute_employee_id = $1)
      `,
      [employee_id, start, end]
    )

    const normalizeTime = (value: string | null | undefined): string | null => {
      const raw = String(value || '').trim()
      if (!raw) return null
      if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return raw
      if (/^\d{2}:\d{2}$/.test(raw)) return `${raw}:00`
      return null
    }

    const toMinutes = (hhmmss: string): number => {
      const [hh, mm] = hhmmss.split(':').slice(0, 2).map(Number)
      return (hh || 0) * 60 + (mm || 0)
    }

    const substitutionsByDate = new Map<string, Array<{
      original_employee_id: number | null
      substitute_employee_id: number | null
      start_time: string | null
      end_time: string | null
    }>>()

    ;(substitutions || []).forEach((sub) => {
      const dateKey = String(sub.substitution_date || '').slice(0, 10)
      if (!dateKey) return
      if (!substitutionsByDate.has(dateKey)) {
        substitutionsByDate.set(dateKey, [])
      }
      substitutionsByDate.get(dateKey)!.push({
        original_employee_id: sub.original_employee_id,
        substitute_employee_id: sub.substitute_employee_id,
        start_time: sub.start_time,
        end_time: sub.end_time,
      })
    })

    const collectEffectiveIntervalsForDate = (dateStr: string): MinuteSlot[] => {
      try {
        const dateObj = new Date(dateStr + 'T00:00:00+08:00')
        const jsDay = dateObj.getDay()
        if (jsDay === 0) return []
        const scheduleDay = jsDay

        const baseSlots: MinuteSlot[] = []

        teachingWindows.forEach((s) => {
          if (s.day_of_week !== scheduleDay) return
          const slot = toMinuteSlot(normalizeTime(s.time_start), normalizeTime(s.time_end))
          if (slot) baseSlots.push(slot)
        })

        examWindows.forEach((s) => {
          const examDate = String(s.exam_date || '').slice(0, 10)
          const matches = examDate ? examDate === dateStr : s.day_of_week === scheduleDay
          if (!matches) return
          const slot = toMinuteSlot(normalizeTime(s.time_start), normalizeTime(s.time_end))
          if (slot) baseSlots.push(slot)
        })

        const subs = substitutionsByDate.get(dateStr) || []
        const removedSlots = subs
          .filter((sub) => Number(sub.original_employee_id) === Number(employee_id))
          .map((sub) => toMinuteSlot(normalizeTime(sub.start_time), normalizeTime(sub.end_time)))
          .filter((slot: MinuteSlot | null): slot is MinuteSlot => slot !== null)

        const substituteSlots = subs
          .filter((sub) => Number(sub.substitute_employee_id) === Number(employee_id))
          .map((sub) => toMinuteSlot(normalizeTime(sub.start_time), normalizeTime(sub.end_time)))
          .filter((slot: MinuteSlot | null): slot is MinuteSlot => slot !== null)

        const remaining = subtractMinuteSlots(baseSlots, removedSlots)
        return mergeMinuteSlots([...remaining, ...substituteSlots])
      } catch {
        return []
      }
    }

    const getScheduleWindowForDate = (dateStr: string): { timeIn: string; timeOut: string; intervals: MinuteSlot[] } | null => {
      const intervals = collectEffectiveIntervalsForDate(dateStr)
      if (intervals.length === 0) return null
      try {
        const sorted = [...intervals].sort((a, b) => a.start - b.start)
        return {
          timeIn: `${String(Math.floor(sorted[0].start / 60)).padStart(2, '0')}:${String(sorted[0].start % 60).padStart(2, '0')}:00`,
          timeOut: `${String(Math.floor(sorted[sorted.length - 1].end / 60)).padStart(2, '0')}:${String(sorted[sorted.length - 1].end % 60).padStart(2, '0')}:00`,
          intervals: sorted,
        }
      } catch {
        return null
      }
    }

    const buildAdminExplanation = (dateStr: string, timeIn: string | null, timeOut: string | null): { minutes: number; text: string | null } => {
      const schedule = getScheduleWindowForDate(dateStr)
      const intervals = schedule?.intervals || []
      const gapMinutes = calculateNonTeachingGapMinutes(intervals)
      const bounds = intervals.length > 0 ? getExpectedScheduleBounds(intervals) : null
      const inNorm = normalizeTime(timeIn)
      const outNorm = normalizeTime(timeOut)
      const inMinutes = parseClockToMinutesFlexible(inNorm)
      const outMinutes = parseClockToMinutesFlexible(outNorm)

      let earlyMinutes = 0
      let overtimeMinutes = 0
      if (bounds) {
        if (inMinutes !== null && inMinutes < bounds.start) {
          earlyMinutes = bounds.start - inMinutes
        }
        if (outMinutes !== null && outMinutes > bounds.end) {
          overtimeMinutes = outMinutes - bounds.end
        }
      }

      const parts: string[] = []
      if (earlyMinutes > 0 && inMinutes !== null && bounds) {
        parts.push(`Early arrival: ${minutesToClock12h(inMinutes)} - ${minutesToClock12h(bounds.start)} (${minutesToDurationLabel(earlyMinutes)})`)
      }

      if (gapMinutes > 0 && intervals.length > 1) {
        for (let i = 0; i < intervals.length - 1; i++) {
          const gap = intervals[i + 1].start - intervals[i].end
          if (gap > 0) {
            parts.push(`${minutesToClock12h(intervals[i].end)} - ${minutesToClock12h(intervals[i + 1].start)} (${minutesToDurationLabel(gap)})`)
          }
        }
      }

      if (overtimeMinutes > 0 && outMinutes !== null && bounds) {
        parts.push(`After last class: ${minutesToClock12h(bounds.end)} - ${minutesToClock12h(outMinutes)} (${minutesToDurationLabel(overtimeMinutes)})`)
      }

      const totalMinutes = gapMinutes + earlyMinutes + overtimeMinutes
      if (parts.length > 0) {
        return {
          minutes: totalMinutes,
          text: `${parts.join('; ')}. Total ${minutesToDurationLabel(totalMinutes)}.`,
        }
      }

      const inSlot = inNorm ? toMinuteSlot(inNorm, outNorm) : null
      if (inSlot) {
        const worked = inSlot.end - inSlot.start
        return {
          minutes: worked,
          text: `No active schedule for this day. Logged ${minutesToClock12h(inSlot.start)} - ${minutesToClock12h(inSlot.end)} (${minutesToDurationLabel(worked)}).`,
        }
      }

      return { minutes: 0, text: null }
    }

    const days = toDaysInclusive(start, end)
    console.log(`[irregularities/detail] Generated ${days.length} days for range ${start} to ${end}`)
    if (days.length === 0) {
      console.error(`[irregularities/detail] Invalid date range: ${start} to ${end}`)
      return NextResponse.json({ error: 'Invalid range' }, { status: 400 })
    }

    const byDate = await dbQuery<{
      date: string | null
      log_time: string | null
      log_type: 'IN' | 'OUT' | null
      attendance_status?: string | null
      notes?: string | null
      is_late?: boolean | null
      is_early_out?: boolean | null
    }>(
      `
        SELECT
          date::text AS date,
          log_time::text AS log_time,
          log_type,
          attendance_status,
          notes,
          is_late,
          is_early_out
        FROM attendance_logs
        WHERE employee_id = $1
          AND date BETWEEN $2::date AND $3::date
        ORDER BY log_time ASC
      `,
      [employee_id, start, end]
    )

    const startPH = new Date(start + 'T00:00:00+08:00').toISOString()
    const endPH = new Date(end + 'T23:59:59.999+08:00').toISOString()
    const byTime = await dbQuery<{
      date: string | null
      log_time: string | null
      log_type: 'IN' | 'OUT' | null
      attendance_status?: string | null
      notes?: string | null
      is_late?: boolean | null
      is_early_out?: boolean | null
    }>(
      `
        SELECT
          date::text AS date,
          log_time::text AS log_time,
          log_type,
          attendance_status,
          notes,
          is_late,
          is_early_out
        FROM attendance_logs
        WHERE employee_id = $1
          AND log_time BETWEEN $2::timestamptz AND $3::timestamptz
        ORDER BY log_time ASC
      `,
      [employee_id, startPH, endPH]
    )
    
    console.log(`[irregularities/detail] Fetched ${(byDate || []).length} logs by date, ${(byTime || []).length} logs by time`)

    const rows = [...(byDate || []), ...(byTime || [])] as Array<{
      date: string | null
      log_time: string | null
      log_type: 'IN' | 'OUT' | null
      attendance_status?: string | null
      notes?: string | null
      is_late?: boolean | null
      is_early_out?: boolean | null
    }>

    const dayMap: Record<string, { 
      firstIn?: string | null
      lastOut?: string | null
      any: boolean
      late?: boolean
      undertime?: boolean
      attendanceStatus?: string | null // Store actual attendance_status from logs
      inAttendanceStatus?: string | null
      outAttendanceStatus?: string | null
      inNotes?: string | null
      outNotes?: string | null
      isAdminTime?: boolean // Track if this is admin time
      autoGeneratedUnderReview?: boolean
    }> = {}
    days.forEach(d => { dayMap[d] = { any: false } })

    const getTimeValue = (iso: string): string | null => {
      if (!iso) return null
      const raw = String(iso).trim()
      if (!raw) return null

      // Already a plain time string from DB text casting.
      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)) {
        return raw.length === 5 ? `${raw}:00` : raw
      }

      // If datetime has no timezone, treat as Manila-local to avoid client TZ drift.
      const normalized = raw.includes(' ') ? raw.replace(' ', 'T') : raw
      const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
      const candidate = hasOffset ? normalized : `${normalized}+08:00`

      try {
        const dt = new Date(candidate)
        if (Number.isNaN(dt.getTime())) return null
        return formatInTimeZone(dt, MANILA_TZ, 'HH:mm:ss')
      } catch {
        return null
      }
    }
    const dayOf = (r: any) => (r.date && r.date.length >= 10 ? r.date.substring(0,10) : (r.log_time ? r.log_time.substring(0,10) : null))

    rows.forEach(r => {
      const d = dayOf(r)
      if (!d) return
      if (!dayMap[d]) dayMap[d] = { any: false }
      dayMap[d].any = true
      const status = (r.attendance_status || '').toLowerCase()
      
      // Store actual attendance_status from logs (don't assume "on-time")
      if (r.attendance_status) {
        dayMap[d].attendanceStatus = r.attendance_status
      }

      const noteText = String(r.notes || '').toLowerCase()
      if (noteText.includes('under review resolved')) {
        dayMap[d].autoGeneratedUnderReview = true
      }
      
      // Check if this is admin time
      if (status === 'admin-time' || status === 'admin_time' || status === 'admin') {
        dayMap[d].isAdminTime = true
      }
      
      if (r.log_type === 'IN' && !dayMap[d].firstIn) {
        dayMap[d].firstIn = r.log_time ? getTimeValue(r.log_time) : undefined
        dayMap[d].inAttendanceStatus = r.attendance_status || null
        dayMap[d].inNotes = r.notes || null
        if (r.is_late || status === 'late') dayMap[d].late = true
      }
      if (r.log_type === 'OUT') {
        dayMap[d].lastOut = r.log_time ? getTimeValue(r.log_time) : undefined
        dayMap[d].outAttendanceStatus = r.attendance_status || null
        dayMap[d].outNotes = r.notes || null
        if (r.is_early_out || status === 'undertime') dayMap[d].undertime = true
      }
    })

    const resultDays = days.map(d => {
      // CRITICAL: Exclude Sundays (rest day)
      if (isSunday(d)) {
        return { date: d, timeIn: null, timeOut: null, status: 'rest-day' }
      }
      
      const b = dayMap[d] || { any: false }
      
      // CRITICAL: If there ARE logs, show them regardless of start_date/hire_date
      // This ensures that if someone logged in before their official start_date, we still show it
      if (b.any) {
        let displayTimeIn = b.firstIn || null
        let displayTimeOut = b.lastOut || null

        const statusLower = String(b.attendanceStatus || '').toLowerCase()
        if (b.autoGeneratedUnderReview && (statusLower === '' || statusLower === 'on-time' || statusLower === 'on_time' || statusLower === 'present')) {
          const win = getScheduleWindowForDate(d)
          if (win) {
            displayTimeIn = win.timeIn
            displayTimeOut = win.timeOut
          }
        }

        // Check if this is admin time (no schedule but employee tapped in)
        if (b.isAdminTime || b.attendanceStatus === 'admin-time' || b.attendanceStatus === 'admin_time' || b.attendanceStatus === 'admin') {
          const adminMeta = buildAdminExplanation(d, displayTimeIn, displayTimeOut)
          return {
            date: d,
            timeIn: displayTimeIn,
            timeOut: displayTimeOut,
            status: 'admin-time',
            adminMinutes: adminMeta.minutes,
            adminExplanation: adminMeta.text,
          }
        }
        
        // Check if this is absent (from actual attendance_status in logs)
        if (b.attendanceStatus === 'absent') {
          return { date: d, timeIn: displayTimeIn, timeOut: displayTimeOut, status: 'absent', adminMinutes: 0, adminExplanation: null }
        }

        const normalizeLogStatus = (value: string | null | undefined): 'missed_log' | 'late' | 'undertime' | 'on-time' | null => {
          const v = String(value || '').toLowerCase().trim().replace(/_/g, '-')
          if (!v) return null
          if (v === 'missed-log' || v === 'missed log') return 'missed_log'
          if (v === 'late') return 'late'
          if (v === 'undertime') return 'undertime'
          if (v === 'on-time' || v === 'on time' || v === 'present') return 'on-time'
          return null
        }

        const inState =
          !displayTimeIn ? null
            : normalizeLogStatus(b.inAttendanceStatus) === 'missed_log' ? 'missed_log'
            : b.late ? 'late'
            : 'on-time'
        const outState =
          !displayTimeOut ? null
            : normalizeLogStatus(b.outAttendanceStatus) === 'missed_log' ? 'missed_log'
            : b.undertime ? 'undertime'
            : 'on-time'
        const inMissedFromNotes = String(b.inNotes || '').toLowerCase().includes('missed log')
        const outMissedFromNotes = String(b.outNotes || '').toLowerCase().includes('missed log')
        const inMissed = inState === 'missed_log' || inMissedFromNotes
        const outMissed = outState === 'missed_log' || outMissedFromNotes

        // Preserve explicit "missed log" semantics:
        // - BOTH logs missed => "missed_log"
        // - only one side missed => combine with the computed other side status (e.g., "on-time/missed_log").
        if (inMissed && outMissed) {
          return { date: d, timeIn: displayTimeIn, timeOut: displayTimeOut, status: 'missed_log', adminMinutes: 0, adminExplanation: null }
        }

        const inDisplay = !inState || inState === 'missed_log'
          ? (b.late ? 'late' : 'on-time')
          : inState
        const outDisplay = !outState || outState === 'missed_log'
          ? (b.undertime ? 'undertime' : 'on-time')
          : outState

        if (inMissed && outDisplay) {
          return { date: d, timeIn: displayTimeIn, timeOut: displayTimeOut, status: `${inDisplay} (missed_log)/${outDisplay}`, adminMinutes: 0, adminExplanation: null }
        }
        if (outMissed && inDisplay) {
          return { date: d, timeIn: displayTimeIn, timeOut: displayTimeOut, status: `${inDisplay}/${outDisplay} (missed_log)`, adminMinutes: 0, adminExplanation: null }
        }
        
        // For other statuses, use the actual attendance_status or calculate based on late/undertime
        // Don't assume "on-time" - use the actual status from the database
        if (b.attendanceStatus && b.attendanceStatus !== 'present' && b.attendanceStatus !== 'on-time' && b.attendanceStatus !== 'on_time') {
          // Use the actual status from the database
          return { date: d, timeIn: displayTimeIn, timeOut: displayTimeOut, status: b.attendanceStatus, adminMinutes: 0, adminExplanation: null }
        }
        
        // Calculate status based on late/undertime flags
        // Priority: Check both late and undertime first, then individual flags
        if (b.late && b.undertime) {
          return { date: d, timeIn: displayTimeIn, timeOut: displayTimeOut, status: 'late/undertime', adminMinutes: 0, adminExplanation: null }
        } else if (b.late) {
          return { date: d, timeIn: displayTimeIn, timeOut: displayTimeOut, status: 'late', adminMinutes: 0, adminExplanation: null }
        } else if (b.undertime) {
          return { date: d, timeIn: displayTimeIn, timeOut: displayTimeOut, status: 'undertime', adminMinutes: 0, adminExplanation: null }
        } else {
          // Both on-time
          return { date: d, timeIn: displayTimeIn, timeOut: displayTimeOut, status: 'on-time', adminMinutes: 0, adminExplanation: null }
        }
      }
      
      // No logs for this date - check if work has started and determine status
      // Check if work has started for this date (using helper function)
      // This checks both hire_date and start_date
      if (!hasWorkStarted(d, startDate, hireDate)) {
        // Work hasn't started yet - return null status to display blank
        // This applies to dates before hire_date OR before start_date
        return { date: d, timeIn: null, timeOut: null, status: null, adminMinutes: 0, adminExplanation: null }
      }
      
      // No logs and work has started: keep blank. Do not infer "absent" automatically here.
      // Absent should only appear when explicitly present in attendance logs.
      return { date: d, timeIn: null, timeOut: null, status: null, adminMinutes: 0, adminExplanation: null }
    })

    const summary = resultDays.reduce((acc, d) => {
      // Skip days with null status (before start_date) or rest days from summary
      if (!d.status || d.status === 'rest-day' || d.status === 'admin-time' || d.status === 'admin_time' || d.status === 'admin') {
        // Don't count null status, "rest-day", or "admin-time" in summary
        return acc
      }
      
      const statusLower = d.status.toLowerCase()
      
      // Count absent
      if (statusLower === 'absent') {
        acc.absent++
        return acc
      }
      
      // Check for undertime (can be standalone "undertime" or combined "late/undertime", "on-time/undertime")
      const hasUndertime = statusLower.includes('undertime')
      if (hasUndertime) {
        acc.undertime++
      }
      
      // Check for late (can be standalone "late" or combined "late/undertime", "late/on-time")
      const hasLate = statusLower.includes('late')
      if (hasLate) {
        acc.late++
      }
      
      // Count on-time only if status is exactly "on-time" (no late, no undertime)
      // This ensures "on-time/undertime" or "late/on-time" don't count as on-time
      if (statusLower === 'on-time') {
        acc.onTime++
      }
      
      return acc
    }, { onTime: 0, late: 0, undertime: 0, absent: 0 })

    console.log(`[irregularities/detail] Successfully processed ${resultDays.length} days for employee ${employee_id}`)
    return NextResponse.json({ days: resultDays, summary })
  } catch (e: any) {
    console.error('[irregularities/detail] Error details:', {
      message: e?.message,
      stack: e?.stack,
      error: e
    })
    return NextResponse.json({ 
      error: 'Internal error', 
      details: process.env.NODE_ENV === 'development' ? e?.message : undefined 
    }, { status: 500 })
  }
}


