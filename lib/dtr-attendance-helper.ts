/**
 * DTR Attendance Helper Functions
 * =================================
 * Helper functions for retrieving and verifying attendance logs for DTR Excel generation
 * CRITICAL: Always uses Manila/Philippines timezone
 */

import { formatInTimeZone } from 'date-fns-tz'
import { MANILA_TZ } from './timezone-utils'
import { dbQuery } from './db'

export interface AttendanceLog {
  log_id: number
  log_time: string
  log_type: 'IN' | 'OUT'
  attendance_status: string | null
  is_late: boolean | null
  is_early_out: boolean | null
  date: string | null
}

export interface DayAttendance {
  date: string
  timeIn: string | null
  timeOut: string | null
  status: string
  hasLogs: boolean
}

/**
 * Get the date in Manila timezone from a timestamp
 * CRITICAL: Always uses Manila timezone for date extraction
 */
export function getManilaDateFromTimestamp(timestamp: string | null): string | null {
  if (!timestamp) return null
  
  try {
    // Parse timestamp - if it doesn't have timezone, treat as Manila timezone
    let dt: Date
    if (timestamp.includes('+') || timestamp.includes('Z') || (timestamp.includes('-') && timestamp.length > 19)) {
      dt = new Date(timestamp)
    } else {
      // No timezone info - assume Manila timezone
      const normalized = timestamp.replace(' ', 'T')
      dt = new Date(normalized + '+08:00')
    }
    
    // Get date in Manila timezone
    return formatInTimeZone(dt, MANILA_TZ, 'yyyy-MM-dd')
  } catch (err) {
    console.error('[DTR Helper] Error parsing timestamp:', timestamp, err)
    // Fallback: try to extract date from string
    if (timestamp.includes('T')) {
      return timestamp.split('T')[0]
    }
    if (timestamp.length >= 10) {
      return timestamp.substring(0, 10)
    }
    return null
  }
}

/**
 * CRITICAL: Retrieve and verify attendance logs for a specific date
 * This function double-checks the attendance_logs table to ensure we get all logs
 * Filters by log_type (IN/OUT) and returns the first IN and last OUT
 */
export async function getAttendanceForDate(
  employeeId: number,
  dateStr: string
): Promise<{ timeIn: string | null; timeOut: string | null; hasLogs: boolean }> {
  try {
    // CRITICAL: Query attendance_logs table directly for this specific date
    // Use both date column and log_time to ensure we get all records
    
    // Get date boundaries in Manila timezone
    const dateStart = new Date(dateStr + 'T00:00:00+08:00').toISOString()
    const dateEnd = new Date(dateStr + 'T23:59:59.999+08:00').toISOString()
    
    // Query 1: By date column
    let byDate: any[] = []
    try {
      byDate = await dbQuery<any>(
        `SELECT log_id, date, log_time, log_type, attendance_status, is_late, is_early_out
         FROM attendance_logs
         WHERE employee_id = $1
           AND date = $2
         ORDER BY log_time ASC`,
        [employeeId, dateStr]
      )
    } catch (dateError) {
      console.error(`[DTR Helper] Error querying by date for ${dateStr}:`, dateError)
    }
    
    // Query 2: By log_time (covers records where date column might be missing or incorrect)
    let byTime: any[] = []
    try {
      byTime = await dbQuery<any>(
        `SELECT log_id, date, log_time, log_type, attendance_status, is_late, is_early_out
         FROM attendance_logs
         WHERE employee_id = $1
           AND log_time >= $2
           AND log_time <= $3
         ORDER BY log_time ASC`,
        [employeeId, dateStart, dateEnd]
      )
    } catch (timeError) {
      console.error(`[DTR Helper] Error querying by time for ${dateStr}:`, timeError)
    }
    
    // Combine results and remove duplicates
    const allLogs: AttendanceLog[] = []
    const seenLogIds = new Set<number>()
    
    // Add logs from date query
    if (byDate) {
      byDate.forEach((log: any) => {
        if (log.log_id && !seenLogIds.has(log.log_id)) {
          seenLogIds.add(log.log_id)
          allLogs.push(log as AttendanceLog)
        }
      })
    }
    
    // Add logs from time query (if not already seen)
    if (byTime) {
      byTime.forEach((log: any) => {
        // Verify this log is actually for the target date in Manila timezone
        const manilaDate = getManilaDateFromTimestamp(log.log_time)
        if (manilaDate === dateStr) {
          if (log.log_id && !seenLogIds.has(log.log_id)) {
            seenLogIds.add(log.log_id)
            allLogs.push(log as AttendanceLog)
          } else if (!log.log_id) {
            // If no log_id, use log_time + log_type as unique key
            const key = `${log.log_time}_${log.log_type}`
            const exists = allLogs.some(l => `${l.log_time}_${l.log_type}` === key)
            if (!exists) {
              allLogs.push(log as AttendanceLog)
            }
          }
        }
      })
    }
    
    // Filter by log_type and get first IN and last OUT
    const inLogs = allLogs.filter(log => log.log_type === 'IN').sort((a, b) => 
      a.log_time.localeCompare(b.log_time)
    )
    const outLogs = allLogs.filter(log => log.log_type === 'OUT').sort((a, b) => 
      b.log_time.localeCompare(a.log_time)
    )
    
    const timeIn = inLogs.length > 0 ? inLogs[0].log_time : null
    const timeOut = outLogs.length > 0 ? outLogs[0].log_time : null
    const hasLogs = allLogs.length > 0
    
    console.log(`[DTR Helper] Date ${dateStr}: Found ${allLogs.length} logs (${inLogs.length} IN, ${outLogs.length} OUT)`)
    if (hasLogs) {
      console.log(`[DTR Helper] Date ${dateStr}: TimeIn=${timeIn}, TimeOut=${timeOut}`)
    }
    
    return { timeIn, timeOut, hasLogs }
  } catch (err) {
    console.error(`[DTR Helper] Error getting attendance for date ${dateStr}:`, err)
    return { timeIn: null, timeOut: null, hasLogs: false }
  }
}

/**
 * CRITICAL: Retrieve attendance for all dates in a range
 * This function retrieves and verifies attendance logs for each date
 * Returns an array of DayAttendance objects with verified Time In and Time Out
 */
export async function getAttendanceForDateRange(
  employeeId: number,
  startDate: string,
  endDate: string
): Promise<DayAttendance[]> {
  // Generate all dates in the range (Manila timezone)
  const dates: string[] = []
  const start = new Date(startDate + 'T00:00:00+08:00')
  const end = new Date(endDate + 'T23:59:59.999+08:00')
  
  const current = new Date(start)
  while (current <= end) {
    const dateStr = formatInTimeZone(current, MANILA_TZ, 'yyyy-MM-dd')
    dates.push(dateStr)
    current.setDate(current.getDate() + 1)
  }
  
  // Get attendance for each date
  const results: DayAttendance[] = []
  
  for (const dateStr of dates) {
    const attendance = await getAttendanceForDate(employeeId, dateStr)
    
    // Determine status based on logs
    let status = 'absent'
    if (attendance.hasLogs) {
      // Check if there are any logs with attendance_status
      // We'll determine status based on is_late and is_early_out flags
      // For now, if there are logs, mark as 'on-time' (will be refined later)
      status = 'on-time'
    } else {
      // Check if this is a Sunday (rest day)
      const dateObj = new Date(dateStr + 'T00:00:00+08:00')
      if (dateObj.getDay() === 0) {
        status = 'rest-day'
      } else {
        // Check if this is a future date
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const dateObjOnly = new Date(dateStr + 'T00:00:00+08:00')
        dateObjOnly.setHours(0, 0, 0, 0)
        
        if (dateObjOnly >= today) {
          status = null as any // Future date - no status
        } else {
          status = 'absent' // Past date with no logs
        }
      }
    }
    
    results.push({
      date: dateStr,
      timeIn: attendance.timeIn,
      timeOut: attendance.timeOut,
      status,
      hasLogs: attendance.hasLogs
    })
  }
  
  return results
}

