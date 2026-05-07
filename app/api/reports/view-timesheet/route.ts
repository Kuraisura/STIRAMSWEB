import { NextRequest } from 'next/server'
import { promises as fs } from 'fs'
import { generateFacultyTimesheetFromTemplate } from '@/lib/faculty-timesheet-template'
import { dbQuery } from '@/lib/db'
import { formatInTimeZone } from 'date-fns-tz'
import { MANILA_TZ } from '@/lib/timezone-utils'
import { debugFacultyTimesheetPayload, logFacultyTimesheetDebug } from '@/lib/faculty-timesheet-debug'
import { getAttendanceForDateRange } from '@/lib/dtr-attendance-helper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const toMinutesNoSeconds = (t?: string | null) => {
  if (!t) return undefined
  const [hh, mm] = t.split(':').map(Number)
  return (hh || 0) * 60 + (mm || 0)
}

const format12h = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  const h12 = (h % 12) || 12
  return `${h12}:${String(m).padStart(2, '0')}${ap}`
}

const formatTimeRange = (start: string, end: string) => {
  const startFormatted = format12h(start)
  const endFormatted = format12h(end)
  if (!startFormatted || !endFormatted) return ''
  return `${startFormatted}-${endFormatted}`
}

const dayLetter = (d: number) => ['M','T','W','TH','F','S'][Math.max(0, d-1)] || ''

const getDayName = (dateStr: string) => {
  const date = new Date(dateStr + 'T00:00:00')
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const fullName = dayNames[date.getDay()]
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const employeeId = Number(searchParams.get('employee_id'))
    const start = searchParams.get('start') || new Date().toISOString().slice(0,10)
    const end = searchParams.get('end') || start
    if (!employeeId) return new Response('employee_id is required', { status: 400 })

    const employeeRows = await dbQuery<any>(
      `SELECT *
       FROM employees
       WHERE employee_id = $1
       LIMIT 1`,
      [employeeId]
    )
    const emp = employeeRows[0]
    if (!emp) return new Response('Employee not found', { status: 404 })

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

    const attendance = await getAttendanceForDateRange(employeeId, start, end)

    const dates = iterateDates(start, end)
    
    // Sort schedules by day_of_week and time_start
    const sortedSchedules = (schedules || []).sort((a: any, b: any) => {
      const dayDiff = Number(a.day_of_week) - Number(b.day_of_week)
      if (dayDiff !== 0) return dayDiff
      const timeA = a.time_start || ''
      const timeB = b.time_start || ''
      return timeA.localeCompare(timeB)
    })

    // Compute TEACHING_ROWS with proper formatting - use duration from time_start and time_end
    const teachingRows: Array<{ 
      SUBJECT_CODE: string
      SECTION: string
      DAY: string
      TIME: string
      ROOM: string
      HOURS?: number
    }> = []

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
      
      // CRITICAL: Retrieve section from teaching_schedules table (not course_code)
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

    // Format EXAM_ROWS
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

    // Totals
    const totalTeachingMins = teachingRows.reduce((acc, r) => acc + Math.round((r.HOURS || 0) * 60), 0)
    const totalTeachingHours = Math.round(totalTeachingMins) / 60
    
    // Parse dates to determine cutoff period
    const startDate = new Date(start + 'T00:00:00+08:00')
    const endDate = new Date(end + 'T23:59:59+08:00')
    const startDay = startDate.getDate()
    const endDay = endDate.getDate()
    
    // Determine cutoff period (26-10 or 11-25)
    const cutoffPeriod = (startDay === 26 && endDay === 10) ? '26-10' : (startDay === 11 && endDay === 25) ? '11-25' : null
    
    // Format dates for display (e.g., "October 26, 2025") - Use Manila timezone
    const formatLongDate = (dateStr: string) => {
      try {
        const date = new Date(dateStr + 'T00:00:00+08:00')
        return formatInTimeZone(date, MANILA_TZ, 'MMMM d, yyyy')
      } catch {
        return dateStr
      }
    }
    
    const syStart = new Date(start + 'T00:00:00+08:00')
    const sy = `${syStart.getFullYear()}-${syStart.getFullYear() + 1}`
    const sem = getSemester(start)
    
    const payload = {
      FACULTY_NAME: emp?.full_name || `Employee ${employeeId}`,
      SCHOOL_YEAR: sy,
      SEMESTER: sem,
      PERIOD_START: formatLongDate(start),
      PERIOD_END: formatLongDate(end),
      CUTOFF_START: start, // YYYY-MM-DD format for template
      CUTOFF_END: end, // YYYY-MM-DD format for template
      CUTOFF_PERIOD: cutoffPeriod, // '26-10' or '11-25' or null
      TEACHING_ROWS: teachingRows,
      EXAM_ROWS: examRows,
      NON_TEACHING_ROWS: [],
      // CRITICAL: Include employment_status as EMPLOYMENT_TYPE for Part Time Full Load detection
      EMPLOYMENT_TYPE: emp?.employment_status || '',
      // CRITICAL: Include staff_type for Non-Teaching Part Time detection
      STAFF_TYPE: emp?.staff_type || '',
      // CRITICAL: Pass attendance data for non-teaching hours calculation
      NON_TEACHING_ATTENDANCE: attendance.map((a: any) => ({
        date: a.date,
        timeIn: a.timeIn,
        timeOut: a.timeOut
      })),
      // CRITICAL: Pass teaching schedules for populateSubjectNameColumn and populateSectionColumn
      TEACHING_SCHEDULES: (schedules || []).map((s: any) => ({
        day_of_week: s.day_of_week,
        time_start: s.time_start,
        time_end: s.time_end,
        subject_name: s.subject_name || s.courses?.name || s.course_code || '',
        section: s.section || ''
      })),
      // CRITICAL: Non-teaching schedule (default: 12:00PM-6:00PM, or use employee's schedule_time_in/out)
      NON_TEACHING_SCHEDULE: emp?.schedule_time_in && emp?.schedule_time_out ? {
        timeStart: format12h(emp.schedule_time_in.slice(0, 5)),
        timeEnd: format12h(emp.schedule_time_out.slice(0, 5))
      } : {
        timeStart: '12:00PM',
        timeEnd: '6:00PM'
      },
      // CRITICAL: Day names for each date in the cutoff period (using Manila timezone)
      CUTOFF_DATES: dates.map(d => ({
        date: d,
        dayName: getDayName(d),
        dayNumber: new Date(d + 'T00:00:00+08:00').getDate()
      })),
      TOTAL_TEACHING_HOURS: Number(totalTeachingHours.toFixed(2)),
      TOTAL_NON_TEACHING_HOURS: 0,
      TOTAL_HOURS: Number(totalTeachingHours.toFixed(2)),
      TOTAL_LATE_MINS: 0,
      TOTAL_UNDERTIME_HOURS: 0
    }
    
    // DEBUG: Log payload information to understand why format doesn't change
    const debugInfo = debugFacultyTimesheetPayload(payload)
    logFacultyTimesheetDebug(debugInfo, 'view-timesheet')

    const buf = await generateFacultyTimesheetFromTemplate(payload as any, true) as Buffer
    const filename = `Timesheet_${employeeId}_${start}_to_${end}.xlsx`
    return new Response(new Uint8Array(buf), { status: 200, headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${filename}"` } })
  } catch (e: any) {
    console.error('[view-timesheet] error:', e?.message, e?.stack)
    return new Response(JSON.stringify({ error: 'Failed to generate timesheet' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}


