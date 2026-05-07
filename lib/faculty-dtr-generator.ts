/**
 * Faculty Daily Time Record (DTR) Generator
 * Generates professional DTR reports with late/undertime calculations
 */

import { format, parseISO, eachDayOfInterval, startOfDay, endOfDay } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

export interface AttendanceLog {
  employee_id: number
  date: string
  time_in: string | null  // Actual time in from attendance_logs
  time_out: string | null  // Actual time out from attendance_logs
  scheduled_time_in: string  // Expected time in from class_schedules (earliest time_start)
  scheduled_time_out: string  // Expected time out from class_schedules (latest time_end)
  attendance_status?: string | null  // Status from attendance_logs (e.g., 'admin', 'absent')
  is_late?: boolean  // Late flag from attendance_logs
  late_minutes?: number  // Late minutes from attendance_logs
  is_early_out?: boolean  // Early out flag from attendance_logs
  undertime_minutes?: number  // Undertime minutes from attendance_logs
}

export interface DTRData {
  facultyName: string
  department: string
  schoolYear: string
  semester: string
  cutoffStart: string
  cutoffEnd: string
  attendanceLogs: AttendanceLog[]
  // Optional: alias for compatibility with report page (paired logs)
  logs?: AttendanceLog[]
  // Optional: processed daily records used by the bulk DTR path / preview renderer
  processedDailyRecords?: Array<{
    date: string
    timeIn: string | null
    timeOut: string | null
    status: string
    lateMinutes?: number
    undertimeMinutes?: number
    isSunday?: boolean
    admin?: boolean
    adminHours?: number
    teachingMinutes?: number
    teachingHours?: number
  }>
  employmentStatus?: string  // Added for Part Time Full Load detection
}

export interface DayRecord {
  day: string
  date: string
  timeIn: string
  timeOut: string
  status: string
  remarks: string
  lateMinutes: number
  undertimeMinutes: number
}

export interface DTRSummary {
  lateCount: number
  lateTotalMinutes: number
  undertimeCount: number
  undertimeTotalMinutes: number
  absenceCount: number
}

/**
 * Convert time string (HH:mm:ss or HH:mm) to minutes since midnight
 */
function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0
  const parts = timeStr.split(':')
  const hours = parseInt(parts[0] || '0')
  const minutes = parseInt(parts[1] || '0')
  return hours * 60 + minutes
}

/**
 * Format time string to 12-hour format (e.g., 8:00 AM)
 */
export function formatTime12Hour(timeStr: string | null): string {
  if (!timeStr) return '-'
  
  const parts = timeStr.split(':')
  const hours = parseInt(parts[0] || '0')
  const minutes = parts[1] || '00'
  
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
  
  return `${displayHour}:${minutes} ${ampm}`
}

/**
 * Calculate late minutes (if time in is after scheduled time in)
 * CRITICAL: Compares actual tap-in time vs scheduled class start time
 * Example: If scheduled start is 8:00 AM and employee taps in at 8:45 AM, late = 45 minutes
 */
function calculateLateMinutes(actualTimeIn: string | null, scheduledTimeIn: string): number {
  if (!actualTimeIn || !scheduledTimeIn) return 0
  
  const actualMinutes = timeToMinutes(actualTimeIn)
  const scheduledMinutes = timeToMinutes(scheduledTimeIn)
  
  const lateMinutes = actualMinutes - scheduledMinutes
  return lateMinutes > 0 ? lateMinutes : 0
}

/**
 * Calculate undertime minutes (if time out is before scheduled time out)
 * CRITICAL: Compares actual tap-out time vs scheduled class end time
 * Example: If scheduled end is 11:00 AM and employee taps out at 10:45 AM, undertime = 15 minutes
 */
function calculateUndertimeMinutes(actualTimeOut: string | null, scheduledTimeOut: string): number {
  if (!actualTimeOut || !scheduledTimeOut) return 0
  
  const actualMinutes = timeToMinutes(actualTimeOut)
  const scheduledMinutes = timeToMinutes(scheduledTimeOut)
  
  const undertimeMinutes = scheduledMinutes - actualMinutes
  return undertimeMinutes > 0 ? undertimeMinutes : 0
}

/**
 * Generate attendance status and remarks
 */
function generateRemarks(
  timeIn: string | null,
  timeOut: string | null,
  lateMinutes: number,
  undertimeMinutes: number
): { status: string; remarks: string } {
  // Absent if no time in and time out
  if (!timeIn && !timeOut) {
    return { status: 'Absent', remarks: 'Absent' }
  }
  
  // Check for late and undertime
  const isLate = lateMinutes > 0
  const isUndertime = undertimeMinutes > 0
  
  if (isLate && isUndertime) {
    return {
      status: 'Late/Undertime',
      remarks: `Late (${lateMinutes} min) / Undertime (${undertimeMinutes} min)`
    }
  }
  
  if (isLate) {
    return {
      status: 'Late',
      remarks: `Late (${lateMinutes} min)`
    }
  }
  
  if (isUndertime) {
    return {
      status: 'Undertime',
      remarks: `Undertime (${undertimeMinutes} min)`
    }
  }
  
  return { status: 'On Time', remarks: 'On Time' }
}

/**
 * Convert minutes to hours and minutes format (e.g., "2 hrs 30 min")
 */
export function formatMinutesToHoursMinutes(totalMinutes: number): string {
  if (totalMinutes === 0) return '0 min'
  
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  
  if (hours === 0) {
    return `${minutes} min`
  }
  
  if (minutes === 0) {
    return `${hours} hr${hours > 1 ? 's' : ''}`
  }
  
  return `${hours} hr${hours > 1 ? 's' : ''} ${minutes} min`
}

/**
 * Format day name to abbreviation
 * Monday -> M, Tuesday -> T, Wednesday -> W, Thursday -> TH, Friday -> F, Saturday -> S, Sunday -> SUN
 */
function formatDayAbbreviation(dayName: string): string {
  const dayMap: { [key: string]: string } = {
    'Monday': 'M',
    'Tuesday': 'T',
    'Wednesday': 'W',
    'Thursday': 'TH',
    'Friday': 'F',
    'Saturday': 'S',
    'Sunday': 'SUN'
  }
  return dayMap[dayName] || dayName
}

/**
 * Generate DTR records for the specified date range
 */
export function generateDTRRecords(dtrData: DTRData): {
  records: DayRecord[]
  summary: DTRSummary
} {
  const startDate = parseISO(dtrData.cutoffStart)
  const endDate = parseISO(dtrData.cutoffEnd)
  
  // Get all days in the range
  const allDays = eachDayOfInterval({ start: startDate, end: endDate })
  
  const records: DayRecord[] = []
  let lateCount = 0
  let lateTotalMinutes = 0
  let undertimeCount = 0
  let undertimeTotalMinutes = 0
  let absenceCount = 0
  
  // Create a map of attendance logs by date
  const logsByDate = new Map<string, AttendanceLog>()
  dtrData.attendanceLogs.forEach(log => {
    logsByDate.set(log.date, log)
  })
  
  // Generate record for each day
  allDays.forEach(date => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const fullDayName = format(date, 'EEEE')
    const dayName = formatDayAbbreviation(fullDayName)
    const displayDate = format(date, 'MMM dd, yyyy')
    
    const log = logsByDate.get(dateStr)
    
    if (!log) {
      // No log for this day - mark as absent
      records.push({
        day: dayName,
        date: displayDate,
        timeIn: '-',
        timeOut: '-',
        status: 'absent',
        remarks: 'Absent',
        lateMinutes: 0,
        undertimeMinutes: 0
      })
      absenceCount++
      return
    }
    
    // Calculate late and undertime
    const lateMinutes = calculateLateMinutes(log.time_in, log.scheduled_time_in)
    const undertimeMinutes = calculateUndertimeMinutes(log.time_out, log.scheduled_time_out)
    
    // Generate remarks
    const { status, remarks } = generateRemarks(
      log.time_in,
      log.time_out,
      lateMinutes,
      undertimeMinutes
    )
    
    // Update counters
    if (lateMinutes > 0) {
      lateCount++
      lateTotalMinutes += lateMinutes
    }
    
    if (undertimeMinutes > 0) {
      undertimeCount++
      undertimeTotalMinutes += undertimeMinutes
    }
    
    if (status === 'absent') {
      absenceCount++
    }
    
    records.push({
      day: dayName,
      date: displayDate,
      timeIn: formatTime12Hour(log.time_in),
      timeOut: formatTime12Hour(log.time_out),
      status,
      remarks,
      lateMinutes,
      undertimeMinutes
    })
  })
  
  return {
    records,
    summary: {
      lateCount,
      lateTotalMinutes,
      undertimeCount,
      undertimeTotalMinutes,
      absenceCount
    }
  }
}

/**
 * Check if employee has any attendance logs in the date range
 */
export function hasAttendanceLogs(attendanceLogs: AttendanceLog[]): boolean {
  return attendanceLogs.length > 0 && attendanceLogs.some(log => log.time_in || log.time_out)
}

/**
 * Split records into two pages (for printing two DTRs per landscape page)
 */
export function splitRecordsForTwoPages(records: DayRecord[]): {
  page1: DayRecord[]
  page2: DayRecord[]
} {
  const midpoint = Math.ceil(records.length / 2)
  
  return {
    page1: records.slice(0, midpoint),
    page2: records.slice(midpoint)
  }
}
