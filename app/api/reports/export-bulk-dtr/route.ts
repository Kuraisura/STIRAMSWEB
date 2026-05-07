import { NextRequest } from 'next/server'
import { dbQuery } from '@/lib/db'
import { hasWorkStarted, isSunday } from '@/lib/attendance-helpers'
import { formatInTimeZone } from 'date-fns-tz'
import { MANILA_TZ } from '@/lib/timezone-utils'
import { getAttendanceForDateRange, type DayAttendance } from '@/lib/dtr-attendance-helper'
import { calculateNonTeachingMinutesWithAttendance, getExpectedScheduleBounds, mergeMinuteSlots, parseClockToMinutes, subtractMinuteSlots, toMinuteSlot, type MinuteSlot } from '@/lib/non-teaching-load'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes for bulk export

// Helper function to get attendance details for DTR with class schedule integration
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

  // Fetch class schedules for this employee
  const classSchedules = await dbQuery<any>(
    `SELECT day_of_week, time_start, time_end, class_type
     FROM class_schedules
     WHERE employee_id = $1
     ORDER BY time_start ASC`,
    [employeeId]
  )
  
  // Fetch exam schedules for this employee
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

  // Create maps for schedules
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
  const attendanceData = await getAttendanceForDateRange(employeeId, start, end)
  const attendanceMap = new Map<string, DayAttendance>()
  attendanceData.forEach(a => attendanceMap.set(a.date, a))

  const startPH = new Date(start + 'T00:00:00+08:00').toISOString()
  const endPH = new Date(end + 'T23:59:59.999+08:00').toISOString()
  const rawLogs = await dbQuery<any>(
    `SELECT date, log_time, attendance_status, notes
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

  const calculateLateMinutes = (actualIn: string | null, scheduledIn: string | null): number => {
    if (!actualIn || !scheduledIn) return 0
    const actualMinutes = parseClockToMinutes(actualIn.substring(11, 19))
    const scheduledMinutes = parseClockToMinutes(scheduledIn)
    if (actualMinutes === null || scheduledMinutes === null) return 0
    return Math.max(0, actualMinutes - scheduledMinutes)
  }

  const calculateUndertimeMinutes = (actualOut: string | null, scheduledOut: string | null): number => {
    if (!actualOut || !scheduledOut) return 0
    const actualMinutes = parseClockToMinutes(actualOut.substring(11, 19))
    const scheduledMinutes = parseClockToMinutes(scheduledOut)
    if (actualMinutes === null || scheduledMinutes === null) return 0
    return Math.max(0, scheduledMinutes - actualMinutes)
  }

  return days.map(d => {
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
    
    if (attendance && attendance.hasLogs) {
      const lateMinutes = calculateLateMinutes(attendance.timeIn, scheduledIn)
      const undertimeMinutes = calculateUndertimeMinutes(attendance.timeOut, scheduledOut)
      
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
}

// Generate a single DTR Excel file and return buffer
async function generateSingleDTR(emp: any, periodStart: string, periodEnd: string) {
  const [startYear, startMonth, startDay] = periodStart.split('-').map(Number)
  const [endYear, endMonth, endDay] = periodEnd.split('-').map(Number)
  
  let cutoffLabel = ''
  if (startDay === 26 && endDay === 10) {
    cutoffLabel = '26-10'
  } else if (startDay === 11 && endDay === 25) {
    cutoffLabel = '11-25'
  } else {
    cutoffLabel = `${startDay}-${endDay}`
  }

  const dtrRows = await getAttendanceDetailsForDTR(emp.employee_id, periodStart, periodEnd)
  const validLogs = (dtrRows || []).filter(r => r && (r.timeIn || r.timeOut))
  
  // Allow DTR generation even with single log (removed 4-log minimum requirement)
  if (validLogs.length === 0) {
    return null // Skip employees with no attendance data at all
  }

  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('DTR')

  const setAllBorders = (cell: any) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    }
  }

  ws.pageSetup = {
    paperSize: 8 as any,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.25, bottom: 0.25, header: 0, footer: 0 },
    showGridLines: true
  }

  // STI BRANDING HEADER
  ws.mergeCells(1, 1, 1, 9)
  const schoolNameCell = ws.getCell(1, 1)
  schoolNameCell.value = 'STI COLLEGE SANTA ROSA'
  schoolNameCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
  schoolNameCell.alignment = { horizontal: 'center', vertical: 'middle' }
  schoolNameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003C71' } }
  ws.getRow(1).height = 30
  
  ws.mergeCells(2, 1, 2, 9)
  const docTitleCell = ws.getCell(2, 1)
  docTitleCell.value = 'FACULTY DAILY TIME RECORD'
  docTitleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF003C71' } }
  docTitleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  docTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCC00' } }
  ws.getRow(2).height = 28

  // Employee info
  const infoStartRow = 4
  ws.mergeCells(infoStartRow, 1, infoStartRow, 9)
  const nameCell = ws.getCell(infoStartRow, 1)
  nameCell.value = `NAME: ${emp.full_name}`
  nameCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF003C71' } }
  nameCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F2FF' } }
  setAllBorders(nameCell)
  ws.getRow(infoStartRow).height = 22
  
  ws.mergeCells(infoStartRow + 1, 1, infoStartRow + 1, 9)
  const deptCell = ws.getCell(infoStartRow + 1, 1)
  deptCell.value = `DEPARTMENT: ${emp.department || ''}`
  deptCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF003C71' } }
  deptCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  deptCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F2FF' } }
  setAllBorders(deptCell)
  ws.getRow(infoStartRow + 1).height = 22
  
  ws.mergeCells(infoStartRow + 2, 1, infoStartRow + 2, 9)
  const periodCell = ws.getCell(infoStartRow + 2, 1)
  periodCell.value = `CUT-OFF PERIOD: ${cutoffLabel} (${periodStart} to ${periodEnd})`
  periodCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF003C71' } }
  periodCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  periodCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF5CC' } }
  setAllBorders(periodCell)
  ws.getRow(infoStartRow + 2).height = 22

  const formatTime = (isoTimestamp: string | null) => {
    if (!isoTimestamp) return ''
    try {
      let dt: Date
      const hasTimezone = isoTimestamp.includes('+') || isoTimestamp.includes('Z') || 
                         (isoTimestamp.includes('-') && isoTimestamp.length > 19)
      if (hasTimezone) {
        dt = new Date(isoTimestamp)
      } else {
        const normalized = isoTimestamp.replace(' ', 'T')
        dt = new Date(normalized + '+08:00')
      }
      const formatted = formatInTimeZone(dt, MANILA_TZ, 'h:mm a')
        .replace(/\s?am/i, ' AM')
        .replace(/\s?pm/i, ' PM')
      return formatted || ''
    } catch {
      return ''
    }
  }

  // Header row
  const headerRow = 9
  ws.getCell(headerRow, 1).value = 'DAY'
  ws.getCell(headerRow, 2).value = 'DATE'
  ws.getCell(headerRow, 3).value = 'TIME IN'
  ws.getCell(headerRow, 4).value = 'TIME OUT'
  ws.getCell(headerRow, 5).value = 'SIGNATURE'
  ws.getCell(headerRow, 6).value = 'REMARKS'
  ws.getCell(headerRow, 7).value = 'NON-TEACHING'
  ws.getCell(headerRow, 8).value = 'LATE'
  ws.getCell(headerRow, 9).value = 'ABSENCES'
  
  ws.getColumn(1).width = 8
  ws.getColumn(2).width = 8
  ws.getColumn(3).width = 12
  ws.getColumn(4).width = 12
  ws.getColumn(5).width = 15
  ws.getColumn(6).width = 18
  ws.getColumn(7).width = 13
  ws.getColumn(8).width = 8
  ws.getColumn(9).width = 10
  
  for (let col = 1; col <= 9; col++) {
    const cell = ws.getCell(headerRow, col)
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003C71' } }
    setAllBorders(cell)
  }
  ws.getRow(headerRow).height = 28

  // Add date rows
  let currentYear = startYear
  let currentMonth = startMonth
  let currentDay = startDay
  let rowNum = headerRow + 1
  let actualRowCount = 0

  const toDateStr = (year: number, month: number, day: number) => {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  const getDayOfWeek = (year: number, month: number, day: number): number => {
    const date = new Date(year, month - 1, day)
    return date.getDay()
  }

  const getDayName = (dayOfWeek: number): string => {
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
    return days[dayOfWeek] || ''
  }

  const hasReachedEnd = () => {
    if (currentYear > endYear) return true
    if (currentYear < endYear) return false
    if (currentMonth > endMonth) return true
    if (currentMonth < endMonth) return false
    return currentDay > endDay
  }

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

  // Check if employee is Non-Teaching staff OR a Part Time (non-full-load) non-teaching employee
  // Non-teaching Part Time employees should NOT see Admin Time / Non-Teaching Load columns
  const empStatus = String(emp.employment_status || '').toLowerCase().trim()
  const isPartTimeOnly = (
    empStatus === 'part time' || empStatus === 'part-time' || empStatus === 'parttime'
  ) && !(
    empStatus.includes('full load') || empStatus.includes('fullload') || empStatus.includes('full-load')
  )
  const isNonTeachingStaff = emp.staff_type === 'Non-Teaching' || (isPartTimeOnly && emp.staff_type !== 'Teaching')
  
  while (!hasReachedEnd()) {
    const dayOfWeek = getDayOfWeek(currentYear, currentMonth, currentDay)
    const dateStr = toDateStr(currentYear, currentMonth, currentDay)
    const dayName = getDayName(dayOfWeek)
    const attendanceData = dtrRows.find((r: any) => r.date === dateStr)

    ws.getCell(rowNum, 1).value = dayName
    ws.getCell(rowNum, 2).value = currentDay
    
    if (dayOfWeek === 0) {
      ws.getCell(rowNum, 3).value = ''
      ws.getCell(rowNum, 4).value = ''
      ws.getCell(rowNum, 5).value = ''
      ws.getCell(rowNum, 6).value = ''
      ws.getCell(rowNum, 7).value = ''
      ws.getCell(rowNum, 8).value = ''
      ws.getCell(rowNum, 9).value = ''
    } else {
      const formattedTimeIn = attendanceData?.timeIn ? formatTime(attendanceData.timeIn) : ''
      const formattedTimeOut = attendanceData?.timeOut ? formatTime(attendanceData.timeOut) : ''
      
      ws.getCell(rowNum, 3).value = formattedTimeIn
      ws.getCell(rowNum, 4).value = formattedTimeOut
      const teachingMinutes = Math.max(0, attendanceData?.teachingMinutes || 0)
      if (!isNonTeachingStaff && attendanceData?.timeIn && attendanceData?.timeOut && teachingMinutes > 0) {
        ws.getCell(rowNum, 5).value = Math.round((teachingMinutes / 60) * 100) / 100
        ws.getCell(rowNum, 5).numFmt = '0.00'
      } else {
        ws.getCell(rowNum, 5).value = ''
      }
      
      let remarks = ''
      let isLate = false
      let isAbsent = false
      
      if (!attendanceData || !attendanceData.timeIn) {
        remarks = 'Absent'
        isAbsent = true
      } else {
        // Use calculated late/undertime minutes from schedule comparison
        const lateMin = attendanceData.lateMinutes || 0
        const undertimeMin = attendanceData.undertimeMinutes || 0
        
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
      
      ws.getCell(rowNum, 6).value = remarks
      // Column G: NON-TEACHING
      if (isNonTeachingStaff) {
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
      ws.getCell(rowNum, 8).value = isLate ? 'X' : ''
      ws.getCell(rowNum, 9).value = isAbsent ? 'X' : ''
    }

    const isEvenRow = actualRowCount % 2 === 0
    for (let col = 1; col <= 9; col++) {
      const cell = ws.getCell(rowNum, col)
      cell.font = { name: 'Arial', size: 9, color: { argb: 'FF000000' } }
      if (col === 6) {
        cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
      } else {
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      }
      if (isEvenRow) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F9FF' } }
      } else {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
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
    if (!isNonTeachingStaff && row.nonTeachingMinutes && row.nonTeachingMinutes > 0) {
      totalNonTeachingMinutes += row.nonTeachingMinutes
    }
  })
  
  const formatMinutesToHoursMinutes = (totalMinutes: number): string => {
    if (totalMinutes === 0) return '0 min'
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (hours === 0) return `${minutes} min`
    if (minutes === 0) return `${hours} hr${hours > 1 ? 's' : ''}`
    return `${hours} hr${hours > 1 ? 's' : ''} ${minutes} min`
  }

  // Add summary section
  const summaryStartRow = rowNum + 1
  
  ws.mergeCells(summaryStartRow, 1, summaryStartRow, 9)
  const summaryHeaderCell = ws.getCell(summaryStartRow, 1)
  summaryHeaderCell.value = 'ATTENDANCE SUMMARY'
  summaryHeaderCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
  summaryHeaderCell.alignment = { horizontal: 'center', vertical: 'middle' }
  summaryHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003C71' } }
  setAllBorders(summaryHeaderCell)
  ws.getRow(summaryStartRow).height = 22
  
  const totalNonTeachingHours = Math.round((totalNonTeachingMinutes / 60) * 100) / 100
  const summaryRows = [
    { label: 'Number of Lates:', value: `${totalLateDays} day${totalLateDays !== 1 ? 's' : ''} - ${formatMinutesToHoursMinutes(totalLateMinutes)}` },
    { label: 'Number of Undertimes:', value: `${totalUndertimeDays} day${totalUndertimeDays !== 1 ? 's' : ''} - ${formatMinutesToHoursMinutes(totalUndertimeMinutes)}` },
    { label: 'Number of Absences:', value: `${totalAbsentDays} day${totalAbsentDays !== 1 ? 's' : ''}` }
  ]

  if (!isNonTeachingStaff) {
    summaryRows.push({
      label: 'Non-Teaching Load (Admin):',
      value: `${totalNonTeachingHours} hour${totalNonTeachingHours !== 1 ? 's' : ''} (${formatMinutesToHoursMinutes(totalNonTeachingMinutes)})`
    })
  }
  
  summaryRows.forEach((row, index) => {
    const rowIndex = summaryStartRow + 1 + index
    
    ws.mergeCells(rowIndex, 1, rowIndex, 3)
    const labelCell = ws.getCell(rowIndex, 1)
    labelCell.value = row.label
    labelCell.font = { name: 'Arial', size: 9, bold: true }
    labelCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F9FF' } }
    setAllBorders(labelCell)
    
    ws.mergeCells(rowIndex, 4, rowIndex, 9)
    const valueCell = ws.getCell(rowIndex, 4)
    valueCell.value = row.value
    valueCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFD32F2F' } }
    valueCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
    setAllBorders(valueCell)
    
    ws.getRow(rowIndex).height = 20
  })

  // Signature rows
  const signatureRow = summaryStartRow + 5
  ws.getCell(signatureRow, 1).border = { top: { style: 'thin', color: { argb: 'FF000000' } } }
  
  ws.mergeCells(signatureRow, 1, signatureRow, 4)
  ws.getCell(signatureRow, 1).value = 'Checked by:\n\n_________________\nProgram Coordinator'
  ws.getCell(signatureRow, 1).alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
  ws.getCell(signatureRow, 1).font = { name: 'Calibri', size: 8 }
  
  ws.mergeCells(signatureRow, 5, signatureRow, 9)
  ws.getCell(signatureRow, 5).value = 'Approved by:\n\n_________________\nAcademic Head'
  ws.getCell(signatureRow, 5).alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
  ws.getCell(signatureRow, 5).font = { name: 'Calibri', size: 8 }
  
  ws.getRow(signatureRow).height = 45

  return await wb.xlsx.writeBuffer()
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { employee_ids, start, end } = body

    if (!employee_ids || !Array.isArray(employee_ids) || employee_ids.length === 0) {
      return new Response(JSON.stringify({ error: 'employee_ids array is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!start || !end) {
      return new Response(JSON.stringify({ error: 'start and end dates are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    console.log(`[Bulk DTR] Generating DTRs for ${employee_ids.length} employees`)

    // Fetch all employees
    const employees = await Promise.all(
      employee_ids.map(id =>
        dbQuery<any>(
          `SELECT *
           FROM employees
           WHERE employee_id = $1
           LIMIT 1`,
          [Number(id)]
        ).then(rows => rows[0] || null)
      )
    )

    // Filter out null employees
    const validEmployees = employees.filter(emp => emp !== null)

    if (validEmployees.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid employees found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Generate DTRs for all employees
    const dtrFiles: Array<{ filename: string; buffer: Buffer }> = []
    
    for (const emp of validEmployees) {
      try {
        console.log(`[Bulk DTR] Generating for ${emp.full_name}`)
        const buffer = await generateSingleDTR(emp, start, end)
        
        if (buffer) {
          const [startYear, startMonth, startDay] = start.split('-').map(Number)
          const [endYear, endMonth, endDay] = end.split('-').map(Number)
          let cutoffLabel = ''
          if (startDay === 26 && endDay === 10) {
            cutoffLabel = '26-10'
          } else if (startDay === 11 && endDay === 25) {
            cutoffLabel = '11-25'
          } else {
            cutoffLabel = `${startDay}-${endDay}`
          }
          
          // Sanitize filename to remove invalid characters
          const sanitizedName = emp.full_name.replace(/[^a-zA-Z0-9_-]/g, '_')
          const filename = `DTR_${sanitizedName}_${cutoffLabel}.xlsx`
          dtrFiles.push({ filename, buffer: Buffer.from(buffer) })
        } else {
          console.log(`[Bulk DTR] Skipping ${emp.full_name} - insufficient attendance data`)
        }
      } catch (error) {
        console.error(`[Bulk DTR] Error generating DTR for ${emp.full_name}:`, error)
        // Continue with other employees
      }
    }

    if (dtrFiles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No DTRs could be generated. All selected employees have insufficient attendance data (minimum 4 logs required).' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // If only one file, return it directly
    if (dtrFiles.length === 1) {
      return new Response(dtrFiles[0].buffer as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${dtrFiles[0].filename}"`
        }
      })
    }

    // Create ZIP file for multiple DTRs
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()

    // Add all DTR files to ZIP
    for (const file of dtrFiles) {
      zip.file(file.filename, file.buffer)
    }

    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

    const [startYear, startMonth, startDay] = start.split('-').map(Number)
    const [endYear, endMonth, endDay] = end.split('-').map(Number)
    let cutoffLabel = ''
    if (startDay === 26 && endDay === 10) {
      cutoffLabel = '26-10'
    } else if (startDay === 11 && endDay === 25) {
      cutoffLabel = '11-25'
    } else {
      cutoffLabel = `${startDay}-${endDay}`
    }

    const zipFilename = `Bulk_DTR_${cutoffLabel}_${dtrFiles.length}_employees.zip`

    console.log(`[Bulk DTR] Successfully generated ${dtrFiles.length} DTRs in ZIP file`)

    return new Response(zipBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFilename}"`
      }
    })
  } catch (e: any) {
    console.error('[Bulk DTR] Error:', e)
    return new Response(
      JSON.stringify({ error: e?.message || 'Failed to generate bulk DTR' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}
