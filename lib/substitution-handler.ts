/**
 * Substitution Handler
 * Manages schedule transfers and automatic absence marking for substitutions
 */

import { format, parse, addMinutes, differenceInMinutes, parseISO, isBefore, isAfter } from 'date-fns'
import { dbQuery } from './db'

export interface SubstitutionRequest {
  originalEmployeeId: number
  substituteEmployeeId: number
  substitutionDate: Date
  startTime: string // HH:mm format
  endTime: string // HH:mm format
  verificationRequestId?: number
  gracePeriodMinutes?: number
}

export interface ScheduleToTransfer {
  scheduleId: number
  scheduleType: 'class' | 'exam'
  day: string
  time_start: string
  time_end: string
  subject_name: string
  course_code?: string
  section: string
  room: string
  type?: string
}

/**
 * Get all schedules for an employee that fall within the substitution time range
 */
export async function getSchedulesToTransfer(
  employeeId: number,
  date: Date,
  startTime: string,
  endTime: string
): Promise<ScheduleToTransfer[]> {
  try {
    const dayName = format(date, 'EEEE')
    const dateStr = format(date, 'yyyy-MM-dd')
    const schedules: ScheduleToTransfer[] = []

    // Get class schedules
    const classSchedules = await dbQuery<any>(
      `SELECT *
       FROM class_schedules
       WHERE employee_id = $1
         AND day = $2
         AND time_start >= $3
         AND time_end <= $4`,
      [employeeId, dayName, startTime, endTime]
    )

    if (classSchedules?.length) {
      schedules.push(...classSchedules.map(cs => ({
        scheduleId: cs.class_schedule_id,
        scheduleType: 'class' as const,
        day: cs.day,
        time_start: cs.time_start,
        time_end: cs.time_end,
        subject_name: cs.subject_name,
        course_code: cs.course_code,
        section: cs.section,
        room: cs.room,
        type: cs.type
      })))
    }

    // Get exam schedules for this date
    const examSchedules = await dbQuery<any>(
      `SELECT *
       FROM exam_schedules
       WHERE employee_id = $1
         AND day = $2
         AND exam_date = $3
         AND time_start >= $4
         AND time_end <= $5`,
      [employeeId, dayName, dateStr, startTime, endTime]
    )

    if (examSchedules?.length) {
      schedules.push(...examSchedules.map(es => ({
        scheduleId: es.exam_schedule_id,
        scheduleType: 'exam' as const,
        day: es.day,
        time_start: es.time_start,
        time_end: es.time_end,
        subject_name: es.subject_name,
        course_code: es.course_code,
        section: es.section,
        room: es.room,
        type: es.type
      })))
    }

    return schedules
  } catch (error) {
    console.error('Error getting schedules to transfer:', error)
    return []
  }
}

/**
 * Create substitution record and transfer schedules
 */
export async function createSubstitution(request: SubstitutionRequest): Promise<number | null> {
  try {
    const dateStr = format(request.substitutionDate, 'yyyy-MM-dd')
    
    // Get schedules to transfer
    const schedulesToTransfer = await getSchedulesToTransfer(
      request.originalEmployeeId,
      request.substitutionDate,
      request.startTime,
      request.endTime
    )

    if (schedulesToTransfer.length === 0) {
      console.warn('No schedules found to transfer for substitution')
    }

    const scheduleIds = schedulesToTransfer.map(s => s.scheduleId)

    // Create substitution record
    const substitutionRows = await dbQuery<any>(
      `INSERT INTO schedule_substitutions (
         original_employee_id,
         substitute_employee_id,
         substitution_date,
         start_time,
         end_time,
         original_schedule_ids,
         verification_request_id,
         status,
         grace_period_minutes
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'active', $8)
       RETURNING *`,
      [
        request.originalEmployeeId,
        request.substituteEmployeeId,
        dateStr,
        request.startTime,
        request.endTime,
        JSON.stringify(scheduleIds),
        request.verificationRequestId ?? null,
        request.gracePeriodMinutes || 15,
      ]
    )

    const substitution = substitutionRows[0]
    if (!substitution) {
      throw new Error('Failed to create substitution')
    }

    const substitutionId = substitution.substitution_id

    // Transfer schedules to substitute employee
    const substituteSchedules = schedulesToTransfer.map(schedule => ({
      substitution_id: substitutionId,
      substitute_employee_id: request.substituteEmployeeId,
      original_employee_id: request.originalEmployeeId,
      day: schedule.day,
      time_start: schedule.time_start,
      time_end: schedule.time_end,
      subject_name: schedule.subject_name,
      course_code: schedule.course_code,
      section: schedule.section,
      room: schedule.room,
      schedule_type: schedule.scheduleType,
      original_schedule_id: schedule.scheduleId,
      active_date: dateStr,
      is_active: true
    }))

    if (substituteSchedules.length > 0) {
      await Promise.all(substituteSchedules.map((schedule) =>
        dbQuery(
          `INSERT INTO substitute_schedules (
             substitution_id,
             substitute_employee_id,
             original_employee_id,
             day,
             time_start,
             time_end,
             subject_name,
             course_code,
             section,
             room,
             schedule_type,
             original_schedule_id,
             active_date,
             is_active
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, $8, $9, $10, $11, $12,
             $13, $14
           )`,
          [
            schedule.substitution_id,
            schedule.substitute_employee_id,
            schedule.original_employee_id,
            schedule.day,
            schedule.time_start,
            schedule.time_end,
            schedule.subject_name,
            schedule.course_code ?? null,
            schedule.section,
            schedule.room,
            schedule.schedule_type,
            schedule.original_schedule_id,
            schedule.active_date,
            schedule.is_active,
          ]
        )
      ))
    }

    console.log(`✅ Created substitution ${substitutionId}: ${schedulesToTransfer.length} schedules transferred`)
    console.log(`   Original: Employee ${request.originalEmployeeId}`)
    console.log(`   Substitute: Employee ${request.substituteEmployeeId}`)
    console.log(`   Date: ${dateStr}, Time: ${request.startTime} - ${request.endTime}`)

    return substitutionId
  } catch (error) {
    console.error('Error creating substitution:', error)
    throw error
  }
}

/**
 * Check if original employee is still present during substitution period
 * If yes, auto-mark them absent with grace period
 */
export async function checkAndMarkOriginalEmployeeAbsent(
  substitutionId: number
): Promise<boolean> {
  try {
    // Get substitution details
    const substitutionRows = await dbQuery<any>(
      `SELECT *
       FROM schedule_substitutions
       WHERE substitution_id = $1
       LIMIT 1`,
      [substitutionId]
    )
    const substitution = substitutionRows[0]

    if (!substitution) {
      console.error('Error fetching substitution: not found')
      return false
    }

    // Check if already processed
    if (substitution.original_employee_auto_absent) {
      console.log(`Substitution ${substitutionId} already processed for auto-absence`)
      return true
    }

    const now = new Date()
    const substitutionDate = parseISO(substitution.substitution_date)
    const dateStr = format(substitutionDate, 'yyyy-MM-dd')
    
    // Parse start time and add grace period
    const [startHour, startMinute] = substitution.start_time.split(':').map(Number)
    const substitutionStart = new Date(substitutionDate)
    substitutionStart.setHours(startHour, startMinute, 0, 0)
    
    const gracePeriodEnd = addMinutes(substitutionStart, substitution.grace_period_minutes || 15)

    // Only process if current time is past grace period
    if (isBefore(now, gracePeriodEnd)) {
      console.log(`Still within grace period for substitution ${substitutionId}`)
      return false
    }

    // Check if original employee is still present (has IN log but no OUT log)
    const attendanceRows = await dbQuery<any>(
      `SELECT *
       FROM attendance_logs
       WHERE employee_id = $1
         AND date = $2
       ORDER BY log_time DESC
       LIMIT 1`,
      [substitution.original_employee_id, dateStr]
    )
    const attendanceLog = attendanceRows[0]

    // If last log is IN (not OUT), employee is still present
    if (attendanceLog && attendanceLog.log_type === 'IN') {
      console.log(`⚠️ Original employee ${substitution.original_employee_id} still present after grace period`)
      
      // Create automatic OUT log marked as absent
      const autoOutTime = substitutionStart.toISOString()
      
      await dbQuery(
        `INSERT INTO attendance_logs (
           employee_id,
           rfid_code,
           log_time,
           log_type,
           attendance_status,
           is_late,
           is_early_out,
           date,
           remarks
         ) VALUES ($1, $2, $3, 'OUT', 'absent', FALSE, FALSE, $4, $5)`,
        [
          substitution.original_employee_id,
          attendanceLog.rfid_code,
          autoOutTime,
          dateStr,
          `Auto OUT - Failed to leave before substitution period (${substitution.start_time}). Grace period: ${substitution.grace_period_minutes} minutes.`,
        ]
      )

      // Update substitution record
      await dbQuery(
        `UPDATE schedule_substitutions
         SET original_employee_auto_absent = TRUE,
             original_employee_out_time = $1,
             updated_at = $2
         WHERE substitution_id = $3`,
        [autoOutTime, new Date().toISOString(), substitutionId]
      )

      console.log(`✅ Auto-marked employee ${substitution.original_employee_id} absent with OUT at ${format(substitutionStart, 'h:mm a')}`)
      return true
    }

    console.log(`Original employee ${substitution.original_employee_id} already left before substitution`)
    return false
  } catch (error) {
    console.error('Error in checkAndMarkOriginalEmployeeAbsent:', error)
    return false
  }
}

/**
 * Check all active substitutions for today and process them
 * This should be run periodically (e.g., every 5-10 minutes via cron job)
 */
export async function processActiveSubstitutions(): Promise<void> {
  try {
    const today = format(new Date(), 'yyyy-MM-dd')
    
    const activeSubstitutions = await dbQuery<any>(
      `SELECT *
       FROM schedule_substitutions
       WHERE substitution_date = $1
         AND status = 'active'
         AND original_employee_auto_absent = FALSE`,
      [today]
    )

    if (!activeSubstitutions || activeSubstitutions.length === 0) {
      console.log('No active substitutions to process for today')
      return
    }

    console.log(`Processing ${activeSubstitutions.length} active substitutions...`)

    for (const sub of activeSubstitutions) {
      await checkAndMarkOriginalEmployeeAbsent(sub.substitution_id)
    }

    console.log('✅ Finished processing active substitutions')
  } catch (error) {
    console.error('Error processing active substitutions:', error)
  }
}

/**
 * Get substitute schedules for an employee on a specific date
 * Used to exclude these periods from admin time calculation
 */
export async function getSubstituteSchedulesForDate(
  employeeId: number,
  date: Date
): Promise<ScheduleToTransfer[]> {
  try {
    const dateStr = format(date, 'yyyy-MM-dd')
    
    const schedules = await dbQuery<any>(
      `SELECT *
       FROM substitute_schedules
       WHERE substitute_employee_id = $1
         AND active_date = $2
         AND is_active = TRUE`,
      [employeeId, dateStr]
    )

    return schedules?.map(s => ({
      scheduleId: s.substitute_schedule_id,
      scheduleType: s.schedule_type as 'class' | 'exam',
      day: s.day,
      time_start: s.time_start,
      time_end: s.time_end,
      subject_name: s.subject_name,
      course_code: s.course_code,
      section: s.section,
      room: s.room
    })) || []
  } catch (error) {
    console.error('Error getting substitute schedules for date:', error)
    return []
  }
}

/**
 * Update verification request to mark substitution as created
 */
export async function markVerificationAsProcessed(
  verificationRequestId: number,
  substitutionId: number
): Promise<void> {
  try {
    await dbQuery(
      `UPDATE verification_requests
       SET affects_schedule = TRUE,
           substitution_created = TRUE,
           updated_at = $1
       WHERE request_id = $2`,
      [new Date().toISOString(), verificationRequestId]
    )

    console.log(`✅ Marked verification request ${verificationRequestId} as processed (substitution ${substitutionId})`)
  } catch (error) {
    console.error('Error in markVerificationAsProcessed:', error)
    throw error
  }
}

