import { NextRequest } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { generateFacultyTimesheetFromTemplate } from '@/lib/faculty-timesheet-template'
import { dbQuery } from '@/lib/db'
import { formatInTimeZone } from 'date-fns-tz'
import { MANILA_TZ } from '@/lib/timezone-utils'
import { getAttendanceForDateRange } from '@/lib/dtr-attendance-helper'
import { calculateNonTeachingMinutesWithAttendance, getExpectedScheduleBounds, mergeMinuteSlots, subtractMinuteSlots, toMinuteSlot, type MinuteSlot } from '@/lib/non-teaching-load'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = {
  employeeId: number
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD
  facultyName?: string
  semester?: string
}

const toMinutes = (t?: string | null) => {
  if (!t) return undefined
  const [hh, mm, ss] = t.split(':').map(Number)
  return (hh || 0) * 60 + (mm || 0) + (ss || 0) / 60
}

const toMinutesNoSeconds = (t?: string | null) => {
  if (!t) return undefined
  const [hh, mm] = t.split(':').map(Number)
  return (hh || 0) * 60 + (mm || 0)
}

const minutesToHourString = (mins: number) => (Math.round(mins * 100 / 60) / 100).toFixed(2)

const format12h = (hhmm: string) => {
  if (!hhmm || !hhmm.includes(':')) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2,'0')}${period}`
}

const formatTimeRange = (start: string, end: string) => {
  const startFormatted = format12h(start)
  const endFormatted = format12h(end)
  if (!startFormatted || !endFormatted) return ''
  return `${startFormatted} - ${endFormatted}`
}

const dayLetter = (d: number) => ['M','T','W','TH','F','S'][Math.max(0, d-1)] || ''

const getDayName = (dateStr: string) => {
  const date = new Date(dateStr + 'T00:00:00')
  // Return full day name abbreviations: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const fullName = dayNames[date.getDay()]
  // Return abbreviated: Sun, Mon, Tue, Wed, Thu, Fri, Sat
  const abbreviations: { [key: string]: string } = {
    'Sunday': 'SUN',
    'Monday': 'MON',
    'Tuesday': 'TUE',
    'Wednesday': 'WED',
    'Thursday': 'THU',
    'Friday': 'FRI',
    'Saturday': 'SAT'
  }
  return abbreviations[fullName] || fullName.substring(0, 3).toUpperCase()
}

const getSemester = (startDate: string) => {
  const date = new Date(startDate + 'T00:00:00')
  const month = date.getMonth() + 1 // 1-12
  // 2nd semester starts in December (month 12)
  return month >= 12 || month <= 5 ? '2nd' : '1st'
}

const iterateDates = (start: string, end: string) => {
  const out: string[] = []
  const s = new Date(start)
  const e = new Date(end)
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    out.push(new Date(d).toISOString().slice(0,10))
  }
  return out
}

export async function POST(req: NextRequest) {
  try {
    const { employeeId, start, end, facultyName, semester }: Body = await req.json()
    if (!employeeId || !start || !end) return new Response(JSON.stringify({ error: 'employeeId, start, end are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

    // 1) Fetch schedules, exam schedules, and attendance
    const employeeRows = await dbQuery<any>(
      `SELECT *
       FROM employees
       WHERE employee_id = $1
       LIMIT 1`,
      [employeeId]
    )
    const employee = employeeRows[0]
    const employmentStatus = String(employee?.employment_status || '').toLowerCase().trim()
    // CRITICAL: Always show admin time for ALL Teaching staff (not just Part Time Full Load)
    // Admin time = early arrival + gaps between classes + time after last class until time out
    const showAdminTime = true

    const schedules = await dbQuery<any>(
      `SELECT
         ts.*,
         c.code AS course_code,
         c.name AS course_name,
         r.code AS room_code
       FROM teaching_schedules ts
       LEFT JOIN courses c ON c.course_id = ts.course_id
       LEFT JOIN rooms r ON r.room_id = ts.room_id
       WHERE ts.employee_id = $1
       ORDER BY ts.day_of_week ASC, ts.time_start ASC`,
      [employeeId]
    )

    const examSchedules = await dbQuery<any>(
      `SELECT
         es.*,
         c.code AS course_code,
         c.name AS course_name,
         r.code AS room_code
       FROM exam_schedules es
       LEFT JOIN courses c ON c.course_id = es.course_id
       LEFT JOIN rooms r ON r.room_id = es.room_id
       WHERE es.employee_id = $1
       ORDER BY es.day_of_week ASC, es.time_start ASC`,
      [employeeId]
    )

    const substitutions = await dbQuery<any>(
      `SELECT substitution_date::text AS substitution_date,
              original_employee_id,
              substitute_employee_id,
              start_time::text AS start_time,
              end_time::text AS end_time
       FROM class_substitutions_v2
       WHERE substitution_date >= $2::date
         AND substitution_date <= $3::date
         AND COALESCE(status, 'pending') = 'approved'
         AND (original_employee_id = $1 OR substitute_employee_id = $1)`,
      [employeeId, start, end]
    )

    const attendance = await getAttendanceForDateRange(employeeId, start, end)

    // Build daily map for logs (include status for Admin Time detection)
    const byDate = new Map<string, { in?: string|null; out?: string|null; status?: string|null }>()
    for (const row of attendance as any[]) {
      byDate.set(row.date, { in: row.timeIn, out: row.timeOut, status: row.status || null })
    }

    const classSchedulesByDow = new Map<number, any[]>()
    for (const s of schedules || []) {
      const dow = Number(s.day_of_week)
      if (!classSchedulesByDow.has(dow)) {
        classSchedulesByDow.set(dow, [])
      }
      classSchedulesByDow.get(dow)!.push(s)
    }

    const examSchedulesByDate = new Map<string, any[]>()
    for (const ex of examSchedules || []) {
      const dateKey = String(ex.exam_date || '').substring(0, 10)
      if (!dateKey) continue
      if (!examSchedulesByDate.has(dateKey)) {
        examSchedulesByDate.set(dateKey, [])
      }
      examSchedulesByDate.get(dateKey)!.push(ex)
    }

    const substitutionsByDate = new Map<string, any[]>()
    for (const sub of substitutions || []) {
      const dateKey = String(sub.substitution_date || '').substring(0, 10)
      if (!dateKey) continue
      if (!substitutionsByDate.has(dateKey)) {
        substitutionsByDate.set(dateKey, [])
      }
      substitutionsByDate.get(dateKey)!.push(sub)
    }

    const collectSlotsForDate = (dateStr: string): MinuteSlot[] => {
      const examSlotsForDate = examSchedulesByDate.get(dateStr) || []
      const dateObj = new Date(dateStr + 'T00:00:00+08:00')
      const dayOfWeek = dateObj.getDay()
      if (dayOfWeek === 0) return []

      const source = examSlotsForDate.length > 0
        ? examSlotsForDate
        : (classSchedulesByDow.get(dayOfWeek) || [])

      const baseSlots = source
        .map((s: any) => toMinuteSlot(s.time_start, s.time_end))
        .filter((slot: MinuteSlot | null): slot is MinuteSlot => slot !== null)

      const subs = substitutionsByDate.get(dateStr) || []
      const removedSlots = subs
        .filter((sub: any) => Number(sub.original_employee_id) === Number(employeeId))
        .map((sub: any) => toMinuteSlot(sub.start_time, sub.end_time))
        .filter((slot: MinuteSlot | null): slot is MinuteSlot => slot !== null)

      const substituteSlots = subs
        .filter((sub: any) => Number(sub.substitute_employee_id) === Number(employeeId))
        .map((sub: any) => toMinuteSlot(sub.start_time, sub.end_time))
        .filter((slot: MinuteSlot | null): slot is MinuteSlot => slot !== null)

      const remainingSlots = subtractMinuteSlots(baseSlots, removedSlots)
      return mergeMinuteSlots([...remainingSlots, ...substituteSlots])
    }

    // 2) Compute TEACHING_ROWS with proper formatting for B, C, D, E, F columns
    const dates = iterateDates(start, end)
    const teachingRows: Array<{ 
      SUBJECT_CODE: string
      SECTION: string
      DAY: string
      TIME: string
      ROOM: string
      HOURS?: string | number
    }> = []

    // Sort schedules by day_of_week and time_start
    const sortedSchedules = (schedules || []).sort((a: any, b: any) => {
      const dayDiff = Number(a.day_of_week) - Number(b.day_of_week)
      if (dayDiff !== 0) return dayDiff
      const timeA = a.time_start || ''
      const timeB = b.time_start || ''
      return timeA.localeCompare(timeB)
    })

    for (const s of sortedSchedules) {
      const dow = Number(s.day_of_week) // 1=Mon..6=Sat
      // CRITICAL: Prioritize subject_name over course_code to show Subject Name instead of Course Code
      const subj = String(s.subject_name || s.courses?.name || s.course_code || s.courses?.code || '').trim() || ''
      const room = String(s.room_code || s.rooms?.code || '').trim() || ''
      const timeStart = (s.time_start || '').slice(0,5)
      const timeEnd = (s.time_end || '').slice(0,5)
      
      if (!timeStart || !timeEnd) continue

      // Calculate duration from time range (for teaching load)
      const startMin = toMinutesNoSeconds(timeStart)
      const endMin = toMinutesNoSeconds(timeEnd)
      let durationHours = 0
      if (startMin !== undefined && endMin !== undefined) {
        const durationMinutes = endMin - startMin
        durationHours = Math.round((durationMinutes / 60) * 100) / 100 // Round to 2 decimal places
      }
      
      // Retrieve section from teaching_schedules table
      const section = String(s.section || '').trim() || ''
      
      teachingRows.push({
        SUBJECT_CODE: subj,
        SECTION: section,
        DAY: dayLetter(dow),
        TIME: formatTimeRange(timeStart, timeEnd),
        ROOM: room,
        HOURS: durationHours // Use duration instead of overlap calculation
      })
    }

    // 3) Format EXAM_ROWS with SECTION included
    const examRows: Array<{
      SUBJECT_CODE: string
      SECTION: string
      DAY: string
      TIME: string
      ROOM: string
    }> = []

    const sortedExamSchedules = (examSchedules || []).sort((a: any, b: any) => {
      const dayDiff = Number(a.day_of_week) - Number(b.day_of_week)
      if (dayDiff !== 0) return dayDiff
      const timeA = a.time_start || ''
      const timeB = b.time_start || ''
      return timeA.localeCompare(timeB)
    })

    for (const ex of sortedExamSchedules) {
      const dow = Number(ex.day_of_week)
      // CRITICAL: Prioritize subject_name over course_code to show Subject Name instead of Course Code
      const subj = String(ex.subject_name || ex.courses?.name || ex.course_code || ex.courses?.code || '').trim() || ''
      const section = String(ex.section || '').trim() || ''
      const room = String(ex.room_code || '').trim() || ''
      const timeStart = (ex.time_start || '').slice(0,5)
      const timeEnd = (ex.time_end || '').slice(0,5)
      
      if (!timeStart || !timeEnd) continue

      examRows.push({
        SUBJECT_CODE: subj,
        SECTION: section,
        DAY: dayLetter(dow),
        TIME: formatTimeRange(timeStart, timeEnd),
        ROOM: room
      })
    }

    // 4) Totals, late and undertime from daily earliest/latest schedule
    let totalLateMins = 0
    let totalUndertimeMins = 0
    for (const d of dates) {
      const expectedBounds = getExpectedScheduleBounds(collectSlotsForDate(d))
      const logs = byDate.get(d)
      if (!expectedBounds || !logs) continue
      const schedIn = expectedBounds.start
      const schedOut = expectedBounds.end
      const inMin = toMinutesNoSeconds(logs.in || undefined)
      const outMin = toMinutesNoSeconds(logs.out || undefined)
      if (inMin !== undefined) {
        const late = inMin - schedIn
        if (late > 5) totalLateMins += late
      }
      if (outMin !== undefined) {
        const under = schedOut - outMin
        if (under > 0) totalUndertimeMins += under
      }
    }

    const totalTeachingMins = teachingRows.reduce((acc, r) => acc + Math.round(Number(r.HOURS) * 60), 0)
    const totalTeachingHours = Math.round(totalTeachingMins) / 60

    // 5) Non-teaching: calculate schedule gaps per date (exam-first),
    // fallback to full tap duration only when there is no schedule and day is admin-time.
    const nonTeachingRows: Array<{ ACTIVITY: string; DAY: string; HOURS: string }> = []
    let totalNonTeachingHours = 0
    
    // Calculate Admin Time hours for days with no schedule or marked as admin-time
    for (const d of dates) {
      const logs = byDate.get(d)
      if (!logs || !logs.in || !logs.out) continue
      
      // Check if this is marked as Admin Time in the logs
      const isAdminTime = logs.status === 'admin-time' || logs.status === 'admin_time' || logs.status === 'admin'

      const slotsForDate = collectSlotsForDate(d)
      let adminMinutes = slotsForDate.length > 0
        ? calculateNonTeachingMinutesWithAttendance(slotsForDate, logs.in, logs.out)
        : 0

      if (adminMinutes <= 0 && slotsForDate.length === 0 && isAdminTime) {
        const timeInMin = toMinutesNoSeconds(logs.in)
        const timeOutMin = toMinutesNoSeconds(logs.out)
        if (timeInMin !== undefined && timeOutMin !== undefined && timeOutMin > timeInMin) {
          adminMinutes = timeOutMin - timeInMin
        }
      }

      if (adminMinutes > 0) {
        const adminHours = adminMinutes / 60
        const dayName = getDayName(d)
        const dayNum = new Date(d + 'T00:00:00+08:00').getDate()
        nonTeachingRows.push({
          ACTIVITY: 'Non-Teaching/Admin Time',
          DAY: `${dayName} ${dayNum}`,
          HOURS: adminHours.toFixed(2)
        })
        totalNonTeachingHours += adminHours
      }
    }

    // 6) Header values
    // CRITICAL: Use Manila timezone for date formatting to ensure consistency with Reports page
    const syStart = new Date(start + 'T00:00:00+08:00')
    const sy = `${syStart.getFullYear()}-${syStart.getFullYear() + 1}`
    const sem = semester || getSemester(start)
    
    // Format period covered using Manila timezone: "October 26, 2025 until November 10, 2025"
    const formatLongDate = (dateStr: string) => {
      try {
        const date = new Date(dateStr + 'T00:00:00+08:00')
        return formatInTimeZone(date, MANILA_TZ, 'MMMM d, yyyy')
      } catch {
        return dateStr
      }
    }
    
    const periodStartFormatted = formatLongDate(start)
    const periodEndFormatted = formatLongDate(end)
    const periodCovered = `${periodStartFormatted} until ${periodEndFormatted}`
    
    // Calculate attendance summary (same as email preview)
    const rowsWithData = attendance.filter((a: any) => {
      const hasTimeIn = a.timeIn && a.timeIn.trim() !== '' && a.timeIn !== '-'
      const hasTimeOut = a.timeOut && a.timeOut.trim() !== '' && a.timeOut !== '-'
      return hasTimeIn || hasTimeOut
    })
    
    const present = rowsWithData.filter((a: any) => 
      a && a.status && a.status !== 'absent' && a.status.toLowerCase() !== 'rest-day'
    ).length
    const late = rowsWithData.filter((a: any) => 
      a && a.status && (a.status || '').toLowerCase().includes('late')
    ).length
    const absent = 0 // Always 0 - we show blank instead of absent when there's no data
    const undertime = rowsWithData.filter((a: any) => 
      a && a.status && (a.status || '').toLowerCase().includes('undertime')
    ).length
    
    // Determine cutoff period (26-10 or 11-25) using Manila timezone
    const startDay = new Date(start + 'T00:00:00+08:00').getDate()
    const endDay = new Date(end + 'T00:00:00+08:00').getDate()
    const cutoffPeriod = (startDay === 26 && endDay === 10) ? '26-10' : (startDay === 11 && endDay === 25) ? '11-25' : null
    
    const payload = {
      FACULTY_NAME: facultyName || employee?.full_name || `Employee ${employeeId}`,
      SCHOOL_YEAR: sy,
      SEMESTER: sem,
      PERIOD_START: periodStartFormatted,
      PERIOD_END: periodEndFormatted,
      PERIOD_COVERED: periodCovered,
      CUTOFF_START: start,
      CUTOFF_END: end,
      CUTOFF_PERIOD: cutoffPeriod, // '26-10' or '11-25' or null
      TEACHING_ROWS: teachingRows,
      EXAM_ROWS: examRows,
      NON_TEACHING_ROWS: nonTeachingRows,
      // CRITICAL: Include employment_status as EMPLOYMENT_TYPE for Part Time Full Load detection
      EMPLOYMENT_TYPE: employee?.employment_status || '',
      // CRITICAL: Include staff_type for Non-Teaching Part Time detection
      STAFF_TYPE: employee?.staff_type || '',
      // CRITICAL: Pass attendance data for non-teaching hours calculation
      NON_TEACHING_ATTENDANCE: attendance.map((a: any) => ({
        date: a.date,
        timeIn: a.timeIn,
        timeOut: a.timeOut
      })),
      // CRITICAL: Pass teaching schedules for admin time calculation (time in before class + vacant periods)
      TEACHING_SCHEDULES: (schedules || []).map((s: any) => ({
        day_of_week: s.day_of_week,
        time_start: s.time_start,
        time_end: s.time_end,
        subject_name: s.subject_name || s.courses?.name || s.course_code || '',
        section: s.section || ''
      })),
      // CRITICAL: Non-teaching schedule (default: 12:00PM-6:00PM, or use employee's schedule_time_in/out)
      NON_TEACHING_SCHEDULE: employee?.schedule_time_in && employee?.schedule_time_out ? {
        timeStart: format12h(employee.schedule_time_in.slice(0, 5)), // Convert to 12-hour format
        timeEnd: format12h(employee.schedule_time_out.slice(0, 5))
      } : {
        timeStart: '12:00PM', // Default: 12:00PM
        timeEnd: '6:00PM'      // Default: 6:00PM
      },
      // Day names for each date in the cutoff period (using Manila timezone)
      CUTOFF_DATES: dates.map(d => ({
        date: d,
        dayName: getDayName(d),
        dayNumber: new Date(d + 'T00:00:00+08:00').getDate()
      })),
      TOTAL_TEACHING_HOURS: Number((Math.round(totalTeachingHours * 100) / 100).toFixed(2)),
      TOTAL_NON_TEACHING_HOURS: totalNonTeachingHours,
      // Keep total hours strictly teaching/presented hours; non-teaching/admin is tracked separately.
      TOTAL_HOURS: Number((Math.round(totalTeachingHours * 100) / 100).toFixed(2)),
      TOTAL_LATE_MINS: Math.round(totalLateMins),
      TOTAL_UNDERTIME_HOURS: Number((Math.round((totalUndertimeMins / 60) * 100) / 100).toFixed(2)),
      // Attendance summary (same format as email preview)
      ATTENDANCE_PRESENT: present,
      ATTENDANCE_ABSENT: absent,
      ATTENDANCE_LATE: late,
      ATTENDANCE_UNDERTIME: undertime
    }
    
    console.log('[generate-employee-timesheet] Employee employment_status:', employee?.employment_status)
    console.log('[generate-employee-timesheet] EMPLOYMENT_TYPE in payload:', payload.EMPLOYMENT_TYPE)
    console.log('[generate-employee-timesheet] Non-teaching schedule:', payload.NON_TEACHING_SCHEDULE)
    console.log('[generate-employee-timesheet] Non-teaching attendance records:', payload.NON_TEACHING_ATTENDANCE?.length || 0)

    const buf = await generateFacultyTimesheetFromTemplate(payload as any, true) as Buffer
    const filename = `employee_${employeeId}_${start}_${end}.xlsx`
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    })
  } catch (e: any) {
    console.error('[generate-employee-timesheet] error:', e?.message, e?.stack)
    return new Response(JSON.stringify({ error: 'Failed to generate timesheet' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}


