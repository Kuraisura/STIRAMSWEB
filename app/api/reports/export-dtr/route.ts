import { NextRequest } from 'next/server'
import { dbQuery } from '@/lib/db'
import { hasWorkStarted, isSunday } from '@/lib/attendance-helpers'
import { formatInTimeZone } from 'date-fns-tz'
import { MANILA_TZ, toManilaTime, toManilaTime12h, toManilaTime24h, formatManilaDateLong, parseManilaDate, getManilaDayBounds } from '@/lib/timezone-utils'
import { getAttendanceForDateRange, type DayAttendance } from '@/lib/dtr-attendance-helper'
import { calculateNonTeachingMinutesWithAttendance, getExpectedScheduleBounds, mergeMinuteSlots, parseClockToMinutes, subtractMinuteSlots, toMinuteSlot, type MinuteSlot } from '@/lib/non-teaching-load'

export const dynamic = 'force-dynamic'

// CRITICAL: Improved helper function that double-checks attendance_logs for each date
// This ensures DTR shows accurate Time In and Time Out from the database
// AND retrieves scheduled times from class_schedules for late/undertime calculations
const getAttendanceDetailsForDTR = async (employeeId: number, start: string, end: string) => {
  const toDaysInclusive = (start: string, end: string): string[] => {
    const s = new Date(start + 'T00:00:00+08:00')
    const e = new Date(end + 'T23:59:59.999+08:00')
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return []
    const days: string[] = []
    const c = new Date(s)
    while (c <= e) {
      const y = c.getFullYear()
      const m = String(c.getMonth() + 1).padStart(2, '0')
      const d = String(c.getDate()).padStart(2, '0')
      days.push(`${y}-${m}-${d}`)
      c.setDate(c.getDate() + 1)
    }
    return days
  }

  const days = toDaysInclusive(start, end)
  if (days.length === 0) return []

  // Get employee's start_date and hire_date
  const employeeRows = await dbQuery<{ start_date: string | null; hire_date: string | null; employment_status: string | null }>(
    `SELECT start_date, hire_date, employment_status
     FROM employees
     WHERE employee_id = $1
     LIMIT 1`,
    [employeeId]
  )
  const employee = employeeRows[0]
  
  const hireDate = employee?.hire_date || null
  const startDate = employee?.start_date || employee?.hire_date || null
  const employmentStatus = String(employee?.employment_status || '').toLowerCase().trim()
  // CRITICAL: Always show admin time for ALL Teaching staff (not just Part Time Full Load)
  // Admin time = early arrival + gaps between classes + time after last class until time out
  const showAdminTime = true
  const today = formatInTimeZone(new Date(), MANILA_TZ, 'yyyy-MM-dd')

  // CRITICAL: Fetch class schedules for this employee to get scheduled start/end times
  console.log(`[DTR getAttendanceDetailsForDTR] Fetching class schedules for employee ${employeeId}`)
  const classSchedules = await dbQuery<any>(
    `SELECT day_of_week, time_start, time_end, class_type
     FROM class_schedules
     WHERE employee_id = $1
     ORDER BY time_start ASC`,
    [employeeId]
  )
  
  // CRITICAL: Fetch exam schedules for this employee
  const examSchedules = await dbQuery<any>(
    `SELECT exam_date, time_start, time_end, class_type
     FROM exam_schedules
     WHERE employee_id = $1
       AND exam_date >= $2
       AND exam_date <= $3
     ORDER BY time_start ASC`,
    [employeeId, start, end]
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
  
  console.log(`[DTR getAttendanceDetailsForDTR] Found ${classSchedules?.length || 0} class schedules and ${examSchedules?.length || 0} exam schedules`)

  // Create a map of exam dates to their schedules
  const examScheduleMap = new Map<string, any[]>()
  if (examSchedules) {
    examSchedules.forEach((exam: any) => {
      const examDateKey = String(exam.exam_date || '').substring(0, 10)
      if (!examDateKey) return
      if (!examScheduleMap.has(examDateKey)) {
        examScheduleMap.set(examDateKey, [])
      }
      examScheduleMap.get(examDateKey)!.push(exam)
    })
  }

  // Create a map of day of week to schedules
  const schedulesByDay = new Map<number, any[]>()
  if (classSchedules) {
    classSchedules.forEach((schedule: any) => {
      const dow = Number(schedule.day_of_week)
      if (!schedulesByDay.has(dow)) {
        schedulesByDay.set(dow, [])
      }
      schedulesByDay.get(dow)!.push(schedule)
    })
  }
  // CRITICAL: Use the new helper function to double-check attendance for each date
  // This ensures we get accurate Time In and Time Out from attendance_logs table
  console.log(`[DTR getAttendanceDetailsForDTR] Retrieving attendance for ${days.length} days using helper function`)
  const attendanceData = await getAttendanceForDateRange(employeeId, start, end)
  
  // Create a map for quick lookup
  const attendanceMap = new Map<string, DayAttendance>()
  attendanceData.forEach(a => {
    attendanceMap.set(a.date, a)
  })
  
  // Also fetch raw logs to determine late/undertime status
  const startPH = new Date(start + 'T00:00:00+08:00').toISOString()
  const endPH = new Date(end + 'T23:59:59.999+08:00').toISOString()
  
  const rawLogs = await dbQuery<any>(
    `SELECT date, log_time, log_type, attendance_status, notes, is_late, is_early_out
     FROM attendance_logs
     WHERE employee_id = $1
       AND log_time >= $2
       AND log_time <= $3
     ORDER BY log_time ASC`,
    [employeeId, startPH, endPH]
  )

  const explicitStatusByDate = new Map<string, string>()
  ;(rawLogs || []).forEach((log: any) => {
    const rawStatus = String(log?.attendance_status || '').trim().toLowerCase().replace(/_/g, '-')
    if (!rawStatus) return
    const status = rawStatus === 'absent' && /^leave approved:/i.test(String(log?.notes || '').trim())
      ? 'leave'
      : (rawStatus === 'missed log' ? 'missed-log' : rawStatus)
    if (!['absent', 'leave', 'excused', 'missed-log'].includes(status)) return

    const rawDate = String(log?.date || '').substring(0, 10)
    let dateKey = rawDate
    if (!dateKey && log?.log_time) {
      try {
        dateKey = formatInTimeZone(new Date(log.log_time), MANILA_TZ, 'yyyy-MM-dd')
      } catch {
        dateKey = ''
      }
    }

    if (dateKey) {
      explicitStatusByDate.set(dateKey, status)
    }
  })

  const holidayRows = await dbQuery<any>(
    `SELECT date, start_date, end_date, type, name, affects_attendance, reporting_only
     FROM holiday_calendar
     WHERE start_date <= $2
       AND end_date >= $1`,
    [start, end]
  )
  const holidayList = Array.isArray(holidayRows) ? holidayRows : []

  const getHolidayForDate = (dateStr: string): any | null => {
    if (!dateStr || holidayList.length === 0) return null
    for (const holiday of holidayList) {
      const startDate = holiday.start_date || holiday.date
      const endDate = holiday.end_date || holiday.date
      if (!startDate || !endDate) continue
      if (dateStr >= startDate && dateStr <= endDate) return holiday
    }
    return null
  }

  const getHolidayContextForDate = (dateStr: string): { noTracking: boolean; suffix: string } => {
    const holiday = getHolidayForDate(dateStr)
    if (!holiday) return { noTracking: false, suffix: '' }
    const type = String(holiday.type || '').toLowerCase()
    const reportingOnly = Boolean(holiday.reporting_only)
    const affectsAttendance = Boolean(holiday.affects_attendance)

    if (affectsAttendance && type !== 'online_class') {
      return { noTracking: true, suffix: '' }
    }

    if (reportingOnly || type === 'suspended_asynchronous') {
      return { noTracking: false, suffix: ' (Reporting)' }
    }

    if (type === 'online_class') {
      return { noTracking: false, suffix: ' (Online Class)' }
    }

    return { noTracking: false, suffix: '' }
  }

  const toClockWithSeconds = (minutes: number): string => {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`
  }

  const substitutionsByDate = new Map<string, any[]>()
  ;(substitutions || []).forEach((sub: any) => {
    const dateKey = String(sub.substitution_date || '').substring(0, 10)
    if (!dateKey) return
    if (!substitutionsByDate.has(dateKey)) substitutionsByDate.set(dateKey, [])
    substitutionsByDate.get(dateKey)!.push(sub)
  })

  const collectSlotsForDate = (dateStr: string): MinuteSlot[] => {
    const examSchedsForDate = examScheduleMap.get(dateStr) || []
    // Exam day takes precedence for expected range/admin gap on that exact date.
    const sourceSchedules = examSchedsForDate.length > 0
      ? examSchedsForDate
      : (schedulesByDay.get(new Date(dateStr + 'T00:00:00+08:00').getDay()) || [])

    const baseSlots = sourceSchedules
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

  // Helper function to get scheduled times for a date
  const getScheduledTimes = (dateStr: string): { scheduledIn: string | null; scheduledOut: string | null } => {
    if (isSunday(dateStr)) return { scheduledIn: null, scheduledOut: null }

    const bounds = getExpectedScheduleBounds(collectSlotsForDate(dateStr))
    if (!bounds) return { scheduledIn: null, scheduledOut: null }

    return {
      scheduledIn: toClockWithSeconds(bounds.start),
      scheduledOut: toClockWithSeconds(bounds.end),
    }
  }

  const calculateNonTeachingMinutesForDate = (dateStr: string, actualIn: string | null, actualOut: string | null): number => {
    if (isSunday(dateStr)) return 0
    const slots = collectSlotsForDate(dateStr)
    if (!slots.length) return 0
    return calculateNonTeachingMinutesWithAttendance(slots, actualIn, actualOut)
  }

  const calculateTeachingMinutesForDate = (dateStr: string): number => {
    if (isSunday(dateStr)) return 0
    return collectSlotsForDate(dateStr).reduce((sum, slot) => sum + Math.max(0, slot.end - slot.start), 0)
  }

  // Calculate late/undertime based on actual times vs scheduled times
  const calculateLateMinutes = (actualIn: string | null, scheduledIn: string | null): number => {
    if (!actualIn || !scheduledIn) return 0
    const actualMinutes = parseClockToMinutes(actualIn.substring(11, 19))
    const scheduledMinutes = parseClockToMinutes(scheduledIn)
    if (actualMinutes === null || scheduledMinutes === null) return 0
    const lateMinutes = actualMinutes - scheduledMinutes
    return lateMinutes > 0 ? lateMinutes : 0
  }

  const calculateUndertimeMinutes = (actualOut: string | null, scheduledOut: string | null): number => {
    if (!actualOut || !scheduledOut) return 0
    const actualMinutes = parseClockToMinutes(actualOut.substring(11, 19))
    const scheduledMinutes = parseClockToMinutes(scheduledOut)
    if (actualMinutes === null || scheduledMinutes === null) return 0
    const undertimeMinutes = scheduledMinutes - actualMinutes
    return undertimeMinutes > 0 ? undertimeMinutes : 0
  }

  const resultDays = days.map(d => {
    // Exclude Sundays (rest day)
    if (isSunday(d)) {
      return { 
        date: d, 
        timeIn: null, 
        timeOut: null, 
        status: 'rest-day',
        scheduledTimeIn: null,
        scheduledTimeOut: null,
        lateMinutes: 0,
        undertimeMinutes: 0,
        nonTeachingMinutes: 0,
        teachingMinutes: 0
      }
    }
    
    const attendance = attendanceMap.get(d)
    const { scheduledIn, scheduledOut } = getScheduledTimes(d)
    const holidayContext = getHolidayContextForDate(d)
    const explicitStatus = explicitStatusByDate.get(d)

    if (holidayContext.noTracking && !explicitStatus) {
      return {
        date: d,
        timeIn: attendance?.timeIn || null,
        timeOut: attendance?.timeOut || null,
        status: 'holiday',
        scheduledTimeIn: scheduledIn,
        scheduledTimeOut: scheduledOut,
        lateMinutes: 0,
        undertimeMinutes: 0,
        nonTeachingMinutes: 0,
        teachingMinutes: calculateTeachingMinutesForDate(d)
      }
    }

    if (explicitStatus && !attendance?.timeIn && !attendance?.timeOut) {
      return {
        date: d,
        timeIn: null,
        timeOut: null,
        status: explicitStatus,
        scheduledTimeIn: scheduledIn,
        scheduledTimeOut: scheduledOut,
        lateMinutes: 0,
        undertimeMinutes: 0,
        nonTeachingMinutes: 0,
        teachingMinutes: calculateTeachingMinutesForDate(d)
      }
    }
    
    // CRITICAL: If attendance helper found logs, use them
    if (attendance && attendance.hasLogs) {
      // Calculate late and undertime based on actual times vs scheduled times
      const lateMinutes = calculateLateMinutes(attendance.timeIn, scheduledIn)
      const undertimeMinutes = calculateUndertimeMinutes(attendance.timeOut, scheduledOut)
      
      // Determine status
      let finalStatus = 'on-time'
      if (lateMinutes > 0 && undertimeMinutes > 0) {
        finalStatus = 'late/undertime'
      } else if (lateMinutes > 0) {
        finalStatus = 'late'
      } else if (undertimeMinutes > 0) {
        finalStatus = 'on-time/undertime'
      }

      if (holidayContext.suffix && finalStatus) {
        finalStatus = `${finalStatus}${holidayContext.suffix}`
      }
      
      console.log(`[DTR getAttendanceDetailsForDTR] Date ${d}: TimeIn=${attendance.timeIn}, TimeOut=${attendance.timeOut}, Late=${lateMinutes}min, Undertime=${undertimeMinutes}min, Status=${finalStatus}`)
      
      // Calculate non-teaching load (admin time) from schedule gaps + overtime after last schedule
      const nonTeachingMinutes = calculateNonTeachingMinutesForDate(d, attendance.timeIn, attendance.timeOut)
      const teachingMinutes = calculateTeachingMinutesForDate(d)
      
      return { 
        date: d, 
        timeIn: attendance.timeIn, 
        timeOut: attendance.timeOut, 
        status: finalStatus,
        scheduledTimeIn: scheduledIn,
        scheduledTimeOut: scheduledOut,
        lateMinutes,
        undertimeMinutes,
        nonTeachingMinutes,
        teachingMinutes
      }
    }
    
    // No logs found - check if work has started
    if (!hasWorkStarted(d, startDate, hireDate)) {
      return { 
        date: d, 
        timeIn: null, 
        timeOut: null, 
        status: null,
        scheduledTimeIn: scheduledIn,
        scheduledTimeOut: scheduledOut,
        lateMinutes: 0,
        undertimeMinutes: 0,
        nonTeachingMinutes: 0,
        teachingMinutes: calculateTeachingMinutesForDate(d)
      }
    }
    
    // No logs and work has started - determine if absent or blank
    const dateObj = new Date(d + 'T00:00:00+08:00')
    const todayObj = new Date(today + 'T00:00:00+08:00')
    
    if (dateObj >= todayObj) {
      return { 
        date: d, 
        timeIn: null, 
        timeOut: null, 
        status: null,
        scheduledTimeIn: scheduledIn,
        scheduledTimeOut: scheduledOut,
        lateMinutes: 0,
        undertimeMinutes: 0,
        nonTeachingMinutes: 0,
        teachingMinutes: calculateTeachingMinutesForDate(d)
      }
    }
    
    if (explicitStatus) {
      return {
        date: d,
        timeIn: null,
        timeOut: null,
        status: explicitStatus,
        scheduledTimeIn: scheduledIn,
        scheduledTimeOut: scheduledOut,
        lateMinutes: 0,
        undertimeMinutes: 0,
        nonTeachingMinutes: 0,
        teachingMinutes: calculateTeachingMinutesForDate(d)
      }
    }

    // Keep status blank when there are no saved logs/status rows for this date.
    return { 
      date: d, 
      timeIn: null, 
      timeOut: null, 
      status: null,
      scheduledTimeIn: scheduledIn,
      scheduledTimeOut: scheduledOut,
      lateMinutes: 0,
      undertimeMinutes: 0,
      nonTeachingMinutes: 0,
      teachingMinutes: calculateTeachingMinutesForDate(d)
    }
  })

  return resultDays
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const employeeId = Number(searchParams.get('employee_id'))
    const periodStart = searchParams.get('start') || new Date().toISOString().slice(0,10)
    const periodEnd = searchParams.get('end') || new Date().toISOString().slice(0,10)

    console.log(`[DTR API] RAW Query Params - employee_id: ${employeeId}, start: ${periodStart}, end: ${periodEnd}`)

    if (!employeeId) {
      return new Response('employee_id is required', { status: 400 })
    }

    // Get employee data
    const employeeRows = await dbQuery<any>(
      `SELECT *
       FROM employees
       WHERE employee_id = $1
       LIMIT 1`,
      [employeeId]
    )
    const emp = employeeRows[0]
    if (!emp) return new Response('Employee not found', { status: 404 })

    // Parse dates directly from YYYY-MM-DD strings (no timezone conversion needed)
    const [startYear, startMonth, startDay] = periodStart.split('-').map(Number)
    const [endYear, endMonth, endDay] = periodEnd.split('-').map(Number)
    
    console.log(`[DTR] Period: ${periodStart} to ${periodEnd}`)
    console.log(`[DTR] Parsed Start: Year=${startYear}, Month=${startMonth}, Day=${startDay}`)
    console.log(`[DTR] Parsed End: Year=${endYear}, Month=${endMonth}, Day=${endDay}`)
    
    // Determine cutoff period label (26-10 or 11-25) using parsed day values
    let cutoffLabel = ''
    if (startDay === 26 && endDay === 10) {
      cutoffLabel = '26-10'
    } else if (startDay === 11 && endDay === 25) {
      cutoffLabel = '11-25'
    } else {
      // Fallback: show the day numbers
      cutoffLabel = `${startDay}-${endDay}`
    }
    
    console.log(`[DTR] Cutoff Label: ${cutoffLabel}`)

    // CRITICAL: Get attendance data using the EXACT same logic as the detail API endpoint
    // This ensures we get the same times displayed in the Reports modal
    const dtrRows = await getAttendanceDetailsForDTR(employeeId, periodStart, periodEnd)

    console.log(`[DTR] Employee: ${emp.full_name}, Period: ${periodStart} to ${periodEnd}, Total Rows: ${dtrRows?.length || 0}`)
    console.log(`[DTR] Sample Data with times:`, dtrRows?.slice(0, 5).map(r => ({
      date: r.date,
      timeIn: r.timeIn,
      timeOut: r.timeOut,
      status: r.status
    })))

    // Validate minimum logs requirement (at least 4 logs)
    const validLogs = (dtrRows || []).filter(r => r && (r.timeIn || r.timeOut))
    console.log(`[DTR] Valid Logs: ${validLogs.length}, Logs with TimeIn:`, validLogs.filter(r => r.timeIn).length, `Logs with TimeOut:`, validLogs.filter(r => r.timeOut).length)
    
    if (validLogs.length < 4) {
      return new Response(
        JSON.stringify({ 
          error: `Insufficient attendance data. Employee has only ${validLogs.length} log(s) in the cutoff period. Minimum 4 logs required to generate DTR.` 
        }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Generate Excel file using exceljs
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('DTR')

    // Helper function for borders
    const setAllBorders = (cell: any) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      }
    }

    // Configure page setup for half bond paper (8.5 x 5.5 inches landscape)
    ws.pageSetup = {
      paperSize: 8 as any, // Letter size
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.25,
        bottom: 0.25,
        header: 0,
        footer: 0
      },
      showGridLines: true
    }

    // STI BRANDING HEADER
    
    // Row 1 - School Name with STI Blue background
    ws.mergeCells(1, 1, 1, 9)
    const schoolNameCell = ws.getCell(1, 1)
    schoolNameCell.value = 'STI COLLEGE SANTA ROSA'
    schoolNameCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
    schoolNameCell.alignment = { horizontal: 'center', vertical: 'middle' }
    schoolNameCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF003C71' } // STI Blue
    }
    ws.getRow(1).height = 30
    
    // Row 2 - Document Title with STI Yellow accent
    ws.mergeCells(2, 1, 2, 9)
    const docTitleCell = ws.getCell(2, 1)
    docTitleCell.value = 'FACULTY DAILY TIME RECORD'
    docTitleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF003C71' } }
    docTitleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    docTitleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFCC00' } // STI Yellow
    }
    ws.getRow(2).height = 28

    // Employee info section with enhanced styling
    const infoStartRow = 4
    
    // NAME - With light blue background
    ws.mergeCells(infoStartRow, 1, infoStartRow, 9)
    const nameCell = ws.getCell(infoStartRow, 1)
    nameCell.value = `NAME: ${emp.full_name}`
    nameCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF003C71' } }
    nameCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    nameCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6F2FF' } // Light blue
    }
    setAllBorders(nameCell)
    ws.getRow(infoStartRow).height = 22
    
    // DEPARTMENT - With light blue background
    ws.mergeCells(infoStartRow + 1, 1, infoStartRow + 1, 9)
    const deptCell = ws.getCell(infoStartRow + 1, 1)
    deptCell.value = `DEPARTMENT: ${emp.department || ''}`
    deptCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF003C71' } }
    deptCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    deptCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6F2FF' } // Light blue
    }
    setAllBorders(deptCell)
    ws.getRow(infoStartRow + 1).height = 22
    
    // CUT-OFF PERIOD - With light yellow background
    ws.mergeCells(infoStartRow + 2, 1, infoStartRow + 2, 9)
    const periodCell = ws.getCell(infoStartRow + 2, 1)
    periodCell.value = `CUT-OFF PERIOD: ${cutoffLabel} (${periodStart} to ${periodEnd})`
    periodCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF003C71' } }
    periodCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    periodCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFF5CC' } // Light yellow
    }
    setAllBorders(periodCell)
    ws.getRow(infoStartRow + 2).height = 22

    // Format time to 12-hour format - CRITICAL: Input is already in HH:MM:SS format (Manila time)
    // CRITICAL: Format ISO timestamp to 12-hour format in Manila timezone
    // This ensures times match exactly what's shown in the Reports page
    // The database stores timestamps without timezone info, so we treat them as Manila timezone
    const formatTime = (isoTimestamp: string | null) => {
      if (!isoTimestamp) return ''
      try {
        let dt: Date
        
        // Check if timestamp has timezone info (contains +, Z, or timezone offset)
        const hasTimezone = isoTimestamp.includes('+') || isoTimestamp.includes('Z') || 
                           (isoTimestamp.includes('-') && isoTimestamp.length > 19)
        
        if (hasTimezone) {
          // Has timezone info, parse directly
          dt = new Date(isoTimestamp)
        } else {
          // No timezone info - database format is "2025-10-27 06:55:00" or "2025-10-27T06:55:00"
          // Treat as Manila timezone by adding +08:00 offset
          const normalized = isoTimestamp.replace(' ', 'T')
          dt = new Date(normalized + '+08:00')
        }
        
        // Format in Manila timezone to 12-hour format
        const formatted = formatInTimeZone(dt, MANILA_TZ, 'h:mm a')
          .replace(/\s?am/i, ' AM')
          .replace(/\s?pm/i, ' PM')
        
        return formatted || ''
      } catch (err) {
        console.error(`[DTR] Error formatting time ${isoTimestamp}:`, err)
        // Fallback: try toManilaTime12h
        try {
          const formatted = toManilaTime12h(isoTimestamp)
          return formatted || ''
        } catch {
          return ''
        }
      }
    }

    // Header row with STI Blue background - NEW LAYOUT
    const headerRow = 9
    ws.getCell(headerRow, 1).value = 'DAY'          // Column A: Day name
    ws.getCell(headerRow, 2).value = 'DATE'         // Column B: Date
    ws.getCell(headerRow, 3).value = 'TIME IN'      // Column C: Time In
    ws.getCell(headerRow, 4).value = 'TIME OUT'     // Column D: Time Out
    ws.getCell(headerRow, 5).value = 'SIGNATURE'    // Column E: Signature
    ws.getCell(headerRow, 6).value = 'REMARKS'      // Column F: Remarks
    // Column G can be hidden for non-teaching part-timers (computed below, but safe default here)
    ws.getCell(headerRow, 7).value = 'NON-TEACHING' // Column G: Non-Teaching
    ws.getCell(headerRow, 8).value = 'LATE'         // Column H: Late
    ws.getCell(headerRow, 9).value = 'ABSENCES'     // Column I: Absences
    
    // Set column widths for better readability
    ws.getColumn(1).width = 8   // DAY
    ws.getColumn(2).width = 8   // DATE
    ws.getColumn(3).width = 12  // TIME IN
    ws.getColumn(4).width = 12  // TIME OUT
    ws.getColumn(5).width = 15  // SIGNATURE
    ws.getColumn(6).width = 18  // REMARKS (widened for "On-Time/Undertime")
    ws.getColumn(7).width = 13  // NON-TEACHING
    ws.getColumn(8).width = 8   // LATE
    ws.getColumn(9).width = 10  // ABSENCES
    
    // Apply STI branding to header
    for (let col = 1; col <= 9; col++) {
      const cell = ws.getCell(headerRow, col)
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF003C71' } // STI Blue
      }
      setAllBorders(cell)
    }
    
    ws.getRow(headerRow).height = 28

    // Add date range rows (include all days, but leave Sundays blank)
    // CRITICAL: Use parsed date values from earlier (no timezone conversion needed)
    // Use the already-parsed startYear, startMonth, startDay, endYear, endMonth, endDay
    
    // Create start date at midnight Manila time
    let currentYear = startYear
    let currentMonth = startMonth
    let currentDay = startDay
    
    let rowNum = headerRow + 1
    let actualRowCount = 0

    console.log(`[DTR] Starting date generation from ${currentYear}-${currentMonth}-${currentDay} to ${endYear}-${endMonth}-${endDay}`)

    // Helper to format date as YYYY-MM-DD
    const toDateStr = (year: number, month: number, day: number) => {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }

    // Helper to get day of week from date string (0=Sunday, 6=Saturday)
    const getDayOfWeek = (year: number, month: number, day: number): number => {
      // JavaScript Date: month is 0-indexed (0=January, 11=December)
      const date = new Date(year, month - 1, day)
      return date.getDay()
    }

    // Day name helper
    const getDayName = (dayOfWeek: number): string => {
      const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
      return days[dayOfWeek] || ''
    }

    // Helper to check if we've reached the end date
    const hasReachedEnd = () => {
      if (currentYear > endYear) return true
      if (currentYear < endYear) return false
      if (currentMonth > endMonth) return true
      if (currentMonth < endMonth) return false
      return currentDay > endDay
    }

    // Helper to advance to next day
    const advanceDay = () => {
      const daysInMonth = new Date(currentYear, currentMonth, 0).getDate()
      currentDay++
      if (currentDay > daysInMonth) {
        currentDay = 1
        currentMonth++
        if (currentMonth > 12) {
          currentMonth = 1
          currentYear++
        }
      }
    }

    // Remove Admin Time / Non-Teaching Load ONLY for Non-Teaching + Part Time employees.
    const empStatus = String(emp.employment_status || '').toLowerCase().trim()
    const isPartTimeOnly = /part\s*time/i.test(empStatus) && !/full\s*load/i.test(empStatus)
    const staffType = String(emp.staff_type || '').toLowerCase().trim()
    const isNonTeachingStaff = /non[-\s]?teaching/i.test(staffType)
    const hideAdminNonTeachingLoad = isNonTeachingStaff && isPartTimeOnly

    // Hide the column header too when applicable
    if (hideAdminNonTeachingLoad) {
      ws.getCell(headerRow, 7).value = ''
    }
    
    while (!hasReachedEnd()) {
      const dayOfWeek = getDayOfWeek(currentYear, currentMonth, currentDay)
      const dateStr = toDateStr(currentYear, currentMonth, currentDay)
      const dayName = getDayName(dayOfWeek)
      
      // CRITICAL: Find attendance data for this specific date
      const attendanceData = dtrRows.find((r: any) => r.date === dateStr)
      
      console.log(`[DTR] Date: ${dateStr}, Day: ${dayName}, Has Data: ${!!attendanceData}, TimeIn: ${attendanceData?.timeIn}, TimeOut: ${attendanceData?.timeOut}`)

      // Column A: Day name (MON, TUE, etc.)
      ws.getCell(rowNum, 1).value = dayName
      
      // Column B: Date number (just the day of the month)
      ws.getCell(rowNum, 2).value = currentDay
      
      // For Sundays, leave everything blank except day name and date
      if (dayOfWeek === 0) {
        ws.getCell(rowNum, 3).value = '' // TIME IN
        ws.getCell(rowNum, 4).value = '' // TIME OUT
        ws.getCell(rowNum, 5).value = '' // SIGNATURE
        ws.getCell(rowNum, 6).value = '' // REMARKS
        ws.getCell(rowNum, 7).value = '' // NON-TEACHING
        ws.getCell(rowNum, 8).value = '' // LATE
        ws.getCell(rowNum, 9).value = '' // ABSENCES
      } else {
        // For Monday-Saturday, process normally
        const formattedTimeIn = attendanceData?.timeIn ? formatTime(attendanceData.timeIn) : ''
        const formattedTimeOut = attendanceData?.timeOut ? formatTime(attendanceData.timeOut) : ''
        
        if (attendanceData?.timeIn || attendanceData?.timeOut) {
          console.log(`[DTR] ${dateStr}: Raw TimeIn=${attendanceData?.timeIn}, Formatted=${formattedTimeIn}, Raw TimeOut=${attendanceData?.timeOut}, Formatted=${formattedTimeOut}`)
        }
        
        // Column C: TIME IN
        ws.getCell(rowNum, 3).value = formattedTimeIn
        // Column D: TIME OUT
        ws.getCell(rowNum, 4).value = formattedTimeOut
        // Column E: HOURS from active teaching/exam slots after substitution adjustments
        const teachingMinutes = Math.max(0, attendanceData?.teachingMinutes || 0)
        if (!isNonTeachingStaff && attendanceData?.timeIn && attendanceData?.timeOut && teachingMinutes > 0) {
          ws.getCell(rowNum, 5).value = Math.round((teachingMinutes / 60) * 100) / 100
          ws.getCell(rowNum, 5).numFmt = '0.00'
        } else {
          ws.getCell(rowNum, 5).value = ''
        }
        
        // Column F: REMARKS & Marking validation
        // CRITICAL: Use calculated late/undertime minutes from schedule comparison
        let remarks = ''
        let isLate = false
        let isAbsent = false
        
        if (!attendanceData || !attendanceData.timeIn) {
          remarks = 'Absent'
          isAbsent = true
        } else {
          const lateMin = attendanceData.lateMinutes || 0
          const undertimeMin = attendanceData.undertimeMinutes || 0
          
          // Build remarks based on actual calculated minutes
          if (lateMin > 0 && undertimeMin > 0) {
            remarks = `Late (${lateMin} min) / Undertime (${undertimeMin} min)`
            isLate = true
          } else if (lateMin > 0) {
            remarks = `Late (${lateMin} min)`
            isLate = true
          } else if (undertimeMin > 0) {
            remarks = `Undertime (${undertimeMin} min)`
          } else {
            remarks = 'On-Time'
          }
        }
        
        ws.getCell(rowNum, 6).value = remarks // REMARKS
        
        // Column G: NON-TEACHING (Admin / gaps between classes)
        // Hide entirely for Non-Teaching + Part Time employees.
        if (hideAdminNonTeachingLoad) {
          ws.getCell(rowNum, 7).value = ''
        } else if (isNonTeachingStaff) {
          ws.getCell(rowNum, 7).value = ''
        } else {
          // Always show admin time (non-teaching load) for all Teaching staff
          const nonTeachingMin = attendanceData?.nonTeachingMinutes || 0
          if (nonTeachingMin > 0) {
            const adminHrs = Math.round((nonTeachingMin / 60) * 100) / 100
            ws.getCell(rowNum, 7).value = adminHrs
            ws.getCell(rowNum, 7).numFmt = '0.00'
          } else {
            ws.getCell(rowNum, 7).value = ''
          }
        }
        ws.getCell(rowNum, 8).value = isLate ? 'X' : '' // LATE
        ws.getCell(rowNum, 9).value = isAbsent ? 'X' : '' // ABSENCES
      }

      // Apply formatting with STI-themed alternate row shading
      const isEvenRow = actualRowCount % 2 === 0
      for (let col = 1; col <= 9; col++) {
        const cell = ws.getCell(rowNum, col)
        cell.font = { name: 'Arial', size: 9, color: { argb: 'FF000000' } }
        // REMARKS column (F/col 6) left-aligned, others centered
        if (col === 6) {
          cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
        } else {
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
        }
        // STI-themed zebra striping
        if (isEvenRow) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F9FF' } } // Very light blue
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } } // White
        }
        setAllBorders(cell)
      }
      ws.getRow(rowNum).height = 18

      advanceDay()
      rowNum++
      actualRowCount++
    }

    // Calculate summary statistics
    let totalLateDays = 0
    let totalLateMinutes = 0
    let totalUndertimeDays = 0
    let totalUndertimeMinutes = 0
    let totalAbsentDays = 0
    let totalNonTeachingMinutes = 0
    
    dtrRows.forEach((row: any) => {
      if (row.lateMinutes && row.lateMinutes > 0) {
        totalLateDays++
        totalLateMinutes += row.lateMinutes
      }
      if (row.undertimeMinutes && row.undertimeMinutes > 0) {
        totalUndertimeDays++
        totalUndertimeMinutes += row.undertimeMinutes
      }
      if (row.status === 'absent') {
        totalAbsentDays++
      }
      if (!hideAdminNonTeachingLoad && !isNonTeachingStaff && row.nonTeachingMinutes && row.nonTeachingMinutes > 0) {
        totalNonTeachingMinutes += row.nonTeachingMinutes
      }
    })
    
    // Helper to format minutes to hours and minutes
    const formatMinutesToHoursMinutes = (totalMinutes: number): string => {
      if (totalMinutes === 0) return '0 min'
      const hours = Math.floor(totalMinutes / 60)
      const minutes = totalMinutes % 60
      if (hours === 0) return `${minutes} min`
      if (minutes === 0) return `${hours} hr${hours > 1 ? 's' : ''}`
      return `${hours} hr${hours > 1 ? 's' : ''} ${minutes} min`
    }

    // Add summary section before signatures
    const summaryStartRow = rowNum + 1
    
    // Summary header
    ws.mergeCells(summaryStartRow, 1, summaryStartRow, 9)
    const summaryHeaderCell = ws.getCell(summaryStartRow, 1)
    summaryHeaderCell.value = 'ATTENDANCE SUMMARY'
    summaryHeaderCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    summaryHeaderCell.alignment = { horizontal: 'center', vertical: 'middle' }
    summaryHeaderCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF003C71' } // STI Blue
    }
    setAllBorders(summaryHeaderCell)
    ws.getRow(summaryStartRow).height = 22
    
    // Summary rows
    const totalNonTeachingHours = Math.round((totalNonTeachingMinutes / 60) * 100) / 100
    const summaryRows = [
      { label: 'Number of Lates:', value: `${totalLateDays} day${totalLateDays !== 1 ? 's' : ''} - ${formatMinutesToHoursMinutes(totalLateMinutes)}` },
      { label: 'Number of Undertimes:', value: `${totalUndertimeDays} day${totalUndertimeDays !== 1 ? 's' : ''} - ${formatMinutesToHoursMinutes(totalUndertimeMinutes)}` },
      { label: 'Number of Absences:', value: `${totalAbsentDays} day${totalAbsentDays !== 1 ? 's' : ''}` }
    ]

    if (!hideAdminNonTeachingLoad && !isNonTeachingStaff) {
      summaryRows.push({
        label: 'Non-Teaching Load (Admin):',
        value: `${totalNonTeachingHours} hour${totalNonTeachingHours !== 1 ? 's' : ''} (${formatMinutesToHoursMinutes(totalNonTeachingMinutes)})`
      })
    }
    
    summaryRows.forEach((row, index) => {
      const rowIndex = summaryStartRow + 1 + index
      
      // Label column (columns 1-3)
      ws.mergeCells(rowIndex, 1, rowIndex, 3)
      const labelCell = ws.getCell(rowIndex, 1)
      labelCell.value = row.label
      labelCell.font = { name: 'Arial', size: 9, bold: true }
      labelCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
      labelCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF5F9FF' }
      }
      setAllBorders(labelCell)
      
      // Value column (columns 4-9)
      ws.mergeCells(rowIndex, 4, rowIndex, 9)
      const valueCell = ws.getCell(rowIndex, 4)
      valueCell.value = row.value
      valueCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFD32F2F' } }
      valueCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
      valueCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFFFF' }
      }
      setAllBorders(valueCell)
      
      ws.getRow(rowIndex).height = 20
    })

    // Signature rows - professional footer with top border
    const signatureRow = summaryStartRow + 5
    
    // Add top border line for separation
    ws.getCell(signatureRow, 1).border = {
      top: { style: 'thin', color: { argb: 'FF000000' } }
    }
    
    // Checked by section (adjusted for 9 columns)
    ws.mergeCells(signatureRow, 1, signatureRow, 4)
    ws.getCell(signatureRow, 1).value = 'Checked by:\n\n_________________\nProgram Coordinator'
    ws.getCell(signatureRow, 1).alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
    ws.getCell(signatureRow, 1).font = { name: 'Calibri', size: 8 }
    
    // Approved by section (adjusted for 9 columns)
    ws.mergeCells(signatureRow, 5, signatureRow, 9)
    ws.getCell(signatureRow, 5).value = 'Approved by:\n\n_________________\nAcademic Head'
    ws.getCell(signatureRow, 5).alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
    ws.getCell(signatureRow, 5).font = { name: 'Calibri', size: 8 }
    
    ws.getRow(signatureRow).height = 45

    // Generate file
    const buf = await wb.xlsx.writeBuffer()
    const filename = `DTR_${emp.full_name}_${cutoffLabel}.xlsx`

    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    })
  } catch (e: any) {
    console.error("[Export DTR] Error:", e)
    return new Response(e?.message || 'Failed to generate DTR', { status: 500 })
  }
}

