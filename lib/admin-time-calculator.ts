/**
 * Admin Time Calculator
 * Handles calculation of non-teaching (admin) time for employees
 */

import { format, parse, differenceInMinutes, addMinutes, parseISO, startOfDay } from 'date-fns'
import { dbQuery } from './db'

export interface ScheduleSlot {
  time_start: string // HH:mm format or ISO timestamp
  time_end: string // HH:mm format or ISO timestamp
  day?: string
  subject_name?: string
  section?: string
  type?: string
}

export interface AdminTimeSegment {
  start: Date
  end: Date
  durationMinutes: number
  durationHours: number
  type: 'no_schedule' | 'early_arrival' | 'vacant_period' | 'overtime' | 'other'
  reason: string
}

/**
 * Round hours to 2 decimal places using proper mathematical rounding
 * Example: 5.916667 -> 5.92
 */
export function roundHours(hours: number): number {
  return Math.round(hours * 100) / 100
}

/**
 * Convert minutes to hours with proper rounding
 */
export function minutesToRoundedHours(minutes: number): number {
  const hours = minutes / 60
  return roundHours(hours)
}

/**
 * Parse time string to Date object for a specific date
 * Handles both "HH:mm" format and ISO timestamps
 */
export function parseTimeOnDate(timeStr: string, referenceDate: Date): Date {
  try {
    // If it's already a timestamp
    if (timeStr.includes('T') || timeStr.includes('Z')) {
      return parseISO(timeStr)
    }
    
    // If it's HH:mm format
    const [hours, minutes] = timeStr.split(':').map(Number)
    const date = new Date(referenceDate)
    date.setHours(hours, minutes, 0, 0)
    return date
  } catch (error) {
    console.error('Error parsing time:', timeStr, error)
    return referenceDate
  }
}

/**
 * Get all schedules for an employee on a specific day
 * IMPORTANT: Includes substitute schedules (when employee is covering for someone)
 * This ensures substitute periods are NOT counted as admin time
 */
export async function getEmployeeSchedulesForDay(
  employeeId: number,
  date: Date,
  dayName: string
): Promise<ScheduleSlot[]> {
  try {
    // Get class schedules
    const classSchedules = await dbQuery<ScheduleSlot>(
      `SELECT time_start, time_end, day, subject_name, section, room, type
       FROM class_schedules
       WHERE employee_id = $1
         AND day = $2
       ORDER BY time_start ASC`,
      [employeeId, dayName]
    )

    // Get exam schedules for this specific date
    const dateStr = format(date, 'yyyy-MM-dd')
    const examSchedules = await dbQuery<ScheduleSlot>(
      `SELECT time_start, time_end, day, subject_name, section, room, type
       FROM exam_schedules
       WHERE employee_id = $1
         AND day = $2
         AND exam_date >= $3
         AND exam_date <= $4
       ORDER BY time_start ASC`,
      [employeeId, dayName, dateStr, dateStr]
    )

    // Get substitute schedules (CRITICAL for Scenario 3)
    // When an employee is substituting, those periods are teaching time, NOT admin time
    const substituteSchedules = await dbQuery<ScheduleSlot>(
      `SELECT time_start, time_end, day, subject_name, section, room, schedule_type AS type
       FROM substitute_schedules
       WHERE substitute_employee_id = $1
         AND active_date = $2
         AND is_active = true
       ORDER BY time_start ASC`,
      [employeeId, dateStr]
    )

    console.log(`[Admin Time] Found schedules for employee ${employeeId} on ${dateStr}:`)
    console.log(`  - Class schedules: ${classSchedules?.length || 0}`)
    console.log(`  - Exam schedules: ${examSchedules?.length || 0}`)
    console.log(`  - Substitute schedules: ${substituteSchedules?.length || 0}`)

    // Combine all schedules
    const allSchedules = [
      ...(classSchedules || []),
      ...(examSchedules || []),
      ...(substituteSchedules || [])
    ]

    // Sort by time_start
    allSchedules.sort((a, b) => {
      const timeA = a.time_start.substring(0, 5) // Get HH:mm
      const timeB = b.time_start.substring(0, 5)
      return timeA.localeCompare(timeB)
    })

    if (substituteSchedules && substituteSchedules.length > 0) {
      console.log(`  ✅ Substitute schedules will prevent admin time calculation for those periods`)
    }

    return allSchedules
  } catch (error) {
    console.error('Error getting employee schedules:', error)
    return []
  }
}

/**
 * Calculate admin time segments for an employee on a specific day
 * Scenario 1: No schedules = entire tap duration is admin time
 * Scenario 2: Early arrival + vacant periods = admin time
 */
export async function calculateAdminTime(
  employeeId: number,
  date: Date,
  timeIn: Date,
  timeOut: Date | null
): Promise<AdminTimeSegment[]> {
  const segments: AdminTimeSegment[] = []
  const dayName = format(date, 'EEEE') // e.g., "Monday"

  // Get all schedules for this day
  const schedules = await getEmployeeSchedulesForDay(employeeId, date, dayName)

  // Scenario 1: No schedules at all
  if (schedules.length === 0) {
    if (timeOut) {
      const durationMinutes = differenceInMinutes(timeOut, timeIn)
      segments.push({
        start: timeIn,
        end: timeOut,
        durationMinutes,
        durationHours: minutesToRoundedHours(durationMinutes),
        type: 'no_schedule',
        reason: 'No scheduled classes or exams for this day'
      })
    }
    return segments
  }

  // Scenario 2: Has schedules - calculate early arrival and vacant periods
  const firstScheduleStart = parseTimeOnDate(schedules[0].time_start, date)
  const lastScheduleEnd = parseTimeOnDate(schedules[schedules.length - 1].time_end, date)

  // Early arrival (time in before first class)
  if (timeIn < firstScheduleStart) {
    const durationMinutes = differenceInMinutes(firstScheduleStart, timeIn)
    if (durationMinutes > 0) {
      segments.push({
        start: timeIn,
        end: firstScheduleStart,
        durationMinutes,
        durationHours: minutesToRoundedHours(durationMinutes),
        type: 'early_arrival',
        reason: `Arrived ${durationMinutes} minutes before first class (${format(firstScheduleStart, 'h:mm a')})`
      })
    }
  }

  // Vacant periods between schedules
  for (let i = 0; i < schedules.length - 1; i++) {
    const currentEnd = parseTimeOnDate(schedules[i].time_end, date)
    const nextStart = parseTimeOnDate(schedules[i + 1].time_start, date)
    
    const vacantMinutes = differenceInMinutes(nextStart, currentEnd)
    if (vacantMinutes > 0) {
      segments.push({
        start: currentEnd,
        end: nextStart,
        durationMinutes: vacantMinutes,
        durationHours: minutesToRoundedHours(vacantMinutes),
        type: 'vacant_period',
        reason: `Vacant time between ${format(currentEnd, 'h:mm a')} and ${format(nextStart, 'h:mm a')}`
      })
    }
  }

  // Overtime (stayed after last class)
  if (timeOut && timeOut > lastScheduleEnd) {
    const overtimeMinutes = differenceInMinutes(timeOut, lastScheduleEnd)
    if (overtimeMinutes > 0) {
      segments.push({
        start: lastScheduleEnd,
        end: timeOut,
        durationMinutes: overtimeMinutes,
        durationHours: minutesToRoundedHours(overtimeMinutes),
        type: 'overtime',
        reason: `Stayed ${overtimeMinutes} minutes after last class (${format(lastScheduleEnd, 'h:mm a')})`
      })
    }
  }

  return segments
}

/**
 * Calculate total admin time for all segments
 */
export function getTotalAdminTime(segments: AdminTimeSegment[]): {
  totalMinutes: number
  totalHours: number
} {
  const totalMinutes = segments.reduce((sum, seg) => sum + seg.durationMinutes, 0)
  return {
    totalMinutes,
    totalHours: minutesToRoundedHours(totalMinutes)
  }
}

/**
 * Save admin time logs to database
 */
export async function saveAdminTimeLogs(
  employeeId: number,
  date: Date,
  segments: AdminTimeSegment[],
  attendanceLogId?: number
): Promise<void> {
  try {
    const dateStr = format(date, 'yyyy-MM-dd')
    
    // Delete existing admin time logs for this employee on this date
    await dbQuery(
      `DELETE FROM admin_time_logs
       WHERE employee_id = $1 AND date = $2`,
      [employeeId, dateStr]
    )

    // Insert new admin time logs
    const logs = segments.map(segment => ({
      employee_id: employeeId,
      date: dateStr,
      time_start: segment.start.toISOString(),
      time_end: segment.end.toISOString(),
      duration_hours: segment.durationHours,
      duration_minutes: segment.durationMinutes,
      admin_type: segment.type,
      reason: segment.reason,
      related_attendance_log_id: attendanceLogId || null
    }))

    if (logs.length > 0) {
      await Promise.all(logs.map((log) =>
        dbQuery(
          `INSERT INTO admin_time_logs (
             employee_id,
             date,
             time_start,
             time_end,
             duration_hours,
             duration_minutes,
             admin_type,
             reason,
             related_attendance_log_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            log.employee_id,
            log.date,
            log.time_start,
            log.time_end,
            log.duration_hours,
            log.duration_minutes,
            log.admin_type,
            log.reason,
            log.related_attendance_log_id,
          ]
        )
      ))

      console.log(`✅ Saved ${logs.length} admin time logs for employee ${employeeId} on ${dateStr}`)
    }
  } catch (error) {
    console.error('Error in saveAdminTimeLogs:', error)
    throw error
  }
}

/**
 * Update faculty timesheet with admin time
 */
export async function updateFacultyTimesheet(
  employeeId: number,
  date: Date,
  adminHours: number,
  timeIn?: Date,
  timeOut?: Date
): Promise<void> {
  try {
    const dateStr = format(date, 'yyyy-MM-dd')

    // Check if timesheet entry exists
    const existingRows = await dbQuery<any>(
      `SELECT *
       FROM faculty_timesheet
       WHERE employee_id = $1 AND date = $2
       LIMIT 1`,
      [employeeId, dateStr]
    )
    const existing = existingRows[0]

    const timesheetData: any = {
      employee_id: employeeId,
      date: dateStr,
      admin_hours: adminHours,
      updated_at: new Date().toISOString()
    }

    if (timeIn) timesheetData.time_in = timeIn.toISOString()
    if (timeOut) timesheetData.time_out = timeOut.toISOString()

    if (existing) {
      // Update existing
      const totalHours = (existing.teaching_hours || 0) + adminHours + (existing.substitution_hours || 0)
      await dbQuery(
        `UPDATE faculty_timesheet
         SET admin_hours = $1,
             updated_at = $2,
             time_in = $3,
             time_out = $4,
             total_hours = $5
         WHERE employee_id = $6 AND date = $7`,
        [
          timesheetData.admin_hours,
          timesheetData.updated_at,
          timesheetData.time_in ?? null,
          timesheetData.time_out ?? null,
          roundHours(totalHours),
          employeeId,
          dateStr,
        ]
      )
    } else {
      // Insert new
      await dbQuery(
        `INSERT INTO faculty_timesheet (
           employee_id,
           date,
           admin_hours,
           updated_at,
           time_in,
           time_out,
           teaching_hours,
           substitution_hours,
           total_hours
         ) VALUES ($1, $2, $3, $4, $5, $6, 0, 0, $7)`,
        [
          employeeId,
          dateStr,
          adminHours,
          timesheetData.updated_at,
          timesheetData.time_in ?? null,
          timesheetData.time_out ?? null,
          adminHours,
        ]
      )
    }

    console.log(`✅ Updated faculty timesheet for employee ${employeeId} on ${dateStr}`)
  } catch (error) {
    console.error('Error in updateFacultyTimesheet:', error)
    throw error
  }
}

/**
 * Main function: Process admin time for an attendance log
 * Call this after an employee taps out
 */
export async function processAdminTime(
  employeeId: number,
  date: Date,
  timeIn: Date,
  timeOut: Date,
  attendanceLogId?: number
): Promise<{
  segments: AdminTimeSegment[]
  totalHours: number
  totalMinutes: number
}> {
  try {
    // Calculate admin time segments
    const segments = await calculateAdminTime(employeeId, date, timeIn, timeOut)
    
    if (segments.length === 0) {
      console.log(`No admin time calculated for employee ${employeeId} on ${format(date, 'yyyy-MM-dd')}`)
      return { segments: [], totalHours: 0, totalMinutes: 0 }
    }

    // Get total
    const { totalMinutes, totalHours } = getTotalAdminTime(segments)

    // Save to database
    await saveAdminTimeLogs(employeeId, date, segments, attendanceLogId)
    await updateFacultyTimesheet(employeeId, date, totalHours, timeIn, timeOut)

    console.log(`✅ Processed admin time for employee ${employeeId}: ${totalHours} hours (${totalMinutes} minutes)`)
    
    return { segments, totalHours, totalMinutes }
  } catch (error) {
    console.error('Error processing admin time:', error)
    throw error
  }
}

