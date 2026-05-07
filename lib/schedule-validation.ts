/**
 * STI RAMS - Schedule Validation Helper
 * 
 * Validates employee schedules and determines attendance status
 * Supports "Admin Time" for employees without teaching load
 */

import { dbQuery } from './db'
import type { TeachingSchedule, ExamSchedule, HolidayCalendar } from './types/database.types'

interface ScheduleValidationResult {
  hasSchedule: boolean
  isAdminTime: boolean
  schedules: TeachingSchedule[]
  examSchedules: ExamSchedule[]
  effectiveSchedules?: {
    teaching: TeachingSchedule[]
    exam: ExamSchedule[]
  }
  policy?: {
    employeeRole: 'teaching' | 'non_teaching' | 'admin' | 'unknown'
    attendanceMode: 'no_tracking' | 'teaching_or_exam' | 'fixed_shift' | 'admin_time'
    overrides: string[]
    conflicts: string[]
  }
  expectedTimeIn?: string
  expectedTimeOut?: string
  holiday?: HolidayCalendar
  message: string
}

interface TimeInterval {
  start: string
  end: string
}

interface EmployeeProfile {
  employee_id: number
  role?: string | null
  staff_type?: string | null
  employment_type?: string | null
  is_reporting_staff?: boolean | null
  schedule_time_in?: string | null
  schedule_time_out?: string | null
}

interface ApprovedLeaveRow {
  request_id: number
  time_start?: string | null
  time_end?: string | null
  reason?: string | null
}

interface SubstituteScheduleRow {
  substitute_schedule_id: number
  schedule_type?: 'class' | 'exam' | string | null
  time_start: string
  time_end: string
  subject_name?: string | null
  section?: string | null
}

const toMinutes = (time: string): number => {
  const [h, m] = String(time).split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return h * 60 + m
}

const overlaps = (a: TimeInterval, b: TimeInterval): boolean => {
  return toMinutes(a.start) < toMinutes(b.end) && toMinutes(a.end) > toMinutes(b.start)
}

const inferEmployeeRole = (employee?: EmployeeProfile): 'teaching' | 'non_teaching' | 'admin' | 'unknown' => {
  if (!employee) return 'unknown'
  const role = String(employee.role || '').toLowerCase()
  if (role === 'teaching' || role === 'non_teaching' || role === 'admin') {
    return role
  }

  const staffType = String(employee.staff_type || '').toLowerCase()
  if (staffType.includes('teaching')) return 'teaching'
  if (staffType.includes('non')) return 'non_teaching'
  return 'unknown'
}

const isReportingStaff = (employee?: EmployeeProfile): boolean => {
  if (!employee) return false
  if (employee.is_reporting_staff === true) return true
  const employmentType = String(employee.employment_type || '').toLowerCase()
  return employmentType === 'regular' || employmentType === 'part_time_full_load'
}

/**
 * Check if a date is a holiday, suspended, or online class day
 */
export async function checkSpecialDay(date: string): Promise<HolidayCalendar | null> {
  try {
    const rows = await dbQuery<HolidayCalendar>(
      `SELECT *
       FROM holiday_calendar
       WHERE date = $1
       LIMIT 1`,
      [date]
    )

    return rows[0] || null
  } catch (error) {
    console.error('[checkSpecialDay] Exception:', error)
    return null
  }
}

/**
 * Get day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
 */
export function getDayOfWeek(date: string | Date): number {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00+08:00') : date
  return d.getDay()
}

/**
 * Validate if an employee has a teaching schedule for a specific date
 */
export async function validateEmployeeSchedule(
  employeeId: number,
  date: string, // YYYY-MM-DD format
  time: string // HH:MM:SS format
): Promise<ScheduleValidationResult> {
  try {
    console.log('[validateEmployeeSchedule] Checking schedule for employee:', employeeId, 'date:', date, 'time:', time)

    // Step 0: Load employee profile so we can apply role-based day policy.
    const employeeRows = await dbQuery<EmployeeProfile>(
      `SELECT
         employee_id,
         role,
         staff_type,
         employment_type,
         is_reporting_staff,
         schedule_time_in,
         schedule_time_out
       FROM employees
       WHERE employee_id = $1
       LIMIT 1`,
      [employeeId]
    )
    const employee = employeeRows[0]
    const employeeRole = inferEmployeeRole(employee)
    const policyOverrides: string[] = []
    const policyConflicts: string[] = []

    // Step 1: Check if it's a special day (holiday, suspended, etc.)
    const specialDay = await checkSpecialDay(date)
    if (specialDay) {
      console.log('[validateEmployeeSchedule] Special day detected:', specialDay.type, specialDay.name)

      // Reporting-only holidays: only reporting staff should physically report; count as admin time.
      if (specialDay.reporting_only) {
        if (!isReportingStaff(employee)) {
          return {
            hasSchedule: false,
            isAdminTime: false,
            schedules: [],
            examSchedules: [],
            holiday: specialDay,
            policy: {
              employeeRole,
              attendanceMode: 'no_tracking',
              overrides: ['reporting_only_holiday_exemption'],
              conflicts: []
            },
            message: `${specialDay.name} is reporting-only. No attendance tracking required for this employee.`
          }
        }

        policyOverrides.push('reporting_only_holiday_admin_time')
        return {
          hasSchedule: false,
          isAdminTime: true,
          schedules: [],
          examSchedules: [],
          holiday: specialDay,
          policy: {
            employeeRole,
            attendanceMode: 'admin_time',
            overrides: policyOverrides,
            conflicts: []
          },
          message: `${specialDay.name} is reporting-only. Attendance will be counted as admin time.`
        }
      }

      if (specialDay.affects_attendance && specialDay.type !== 'online_class') {
        return {
          hasSchedule: false,
          isAdminTime: false,
          schedules: [],
          examSchedules: [],
          holiday: specialDay,
          policy: {
            employeeRole,
            attendanceMode: 'no_tracking',
            overrides: ['holiday_blocks_attendance'],
            conflicts: []
          },
          message: `${specialDay.type.toUpperCase()}: ${specialDay.name}. No attendance tracking.`
        }
      }

      if (specialDay.type === 'online_class') {
        policyOverrides.push('online_class_day_active')
      }
    }

    // Step 2: Get day of week
    const dayOfWeek = getDayOfWeek(date)
    console.log('[validateEmployeeSchedule] Day of week:', dayOfWeek)

    // Step 3: Check if it's Sunday (rest day)
    if (dayOfWeek === 0) {
      return {
        hasSchedule: false,
        isAdminTime: false,
        schedules: [],
        examSchedules: [],
        policy: {
          employeeRole,
          attendanceMode: 'no_tracking',
          overrides: ['sunday_rest_day'],
          conflicts: []
        },
        message: 'Sunday is a rest day. No attendance tracking.'
      }
    }

    // Step 4: Get active academic term
    const activeTermRows = await dbQuery<{ term_name: string | null }>(
      `SELECT term_name
       FROM academic_terms
       WHERE is_active = true
       LIMIT 1`
    )
    const activeTerm = activeTermRows[0]

    const currentTerm =
      activeTerm?.term_name === '1st Term'
        ? '1st_term'
        : activeTerm?.term_name === '2nd Term'
        ? '2nd_term'
        : '1st_term'
    console.log('[validateEmployeeSchedule] Current term:', currentTerm)

    const approvedLeaves = await dbQuery<ApprovedLeaveRow>(
      `SELECT
         request_id,
         time_start,
         time_end,
         reason
       FROM verification_requests
       WHERE employee_id = $1
         AND request_type = 'leave'
         AND status = 'approved'
         AND DATE(requested_time) = $2
       ORDER BY requested_time DESC`,
      [employeeId, date]
    )

    const hasWholeDayApprovedLeave = approvedLeaves.some((leave) => !leave.time_start || !leave.time_end)
    if (hasWholeDayApprovedLeave) {
      policyOverrides.push('approved_leave_whole_day')
      return {
        hasSchedule: false,
        isAdminTime: false,
        schedules: [],
        examSchedules: [],
        holiday: specialDay || undefined,
        policy: {
          employeeRole,
          attendanceMode: 'no_tracking',
          overrides: policyOverrides,
          conflicts: []
        },
        message: 'Approved whole-day leave found. No attendance tracking required for this date.'
      }
    }

    if (approvedLeaves.length > 0) {
      policyOverrides.push('approved_leave_partial_day')
      policyConflicts.push('Partial-day leave exists; schedule expectations may require manual review for covered windows.')
    }

    // Step 5: Check for specific date override schedules first
    const specificSchedules = await dbQuery<TeachingSchedule>(
      `SELECT
         ts.*,
         c.code AS course_code,
         r.code AS room_code
       FROM teaching_schedules ts
       LEFT JOIN courses c ON c.course_id = ts.course_id
       LEFT JOIN rooms r ON r.room_id = ts.room_id
       WHERE ts.employee_id = $1
         AND ts.specific_date = $2
         AND ts.status = 'available'`,
      [employeeId, date]
    )

    // Step 6: Check for recurring schedules for this day of week
    const recurringSchedules = await dbQuery<TeachingSchedule>(
      `SELECT
         ts.*,
         c.code AS course_code,
         r.code AS room_code
       FROM teaching_schedules ts
       LEFT JOIN courses c ON c.course_id = ts.course_id
       LEFT JOIN rooms r ON r.room_id = ts.room_id
       WHERE ts.employee_id = $1
         AND ts.day_of_week = $2
         AND ts.term = $3
         AND (ts.is_recurring IS NULL OR ts.is_recurring = true)
         AND (ts.specific_date IS NULL OR ts.specific_date <> $4)
         AND ts.status = 'available'`,
      [employeeId, dayOfWeek, currentTerm, date]
    )

    // Combine specific and recurring schedules
    const baseTeachingSchedules = [
      ...specificSchedules,
      ...recurringSchedules
    ] as TeachingSchedule[]

    console.log('[validateEmployeeSchedule] Found teaching schedules:', baseTeachingSchedules.length)

    // Step 7: Check for exam schedules
    const examSchedules = await dbQuery<ExamSchedule>(
      `SELECT *
       FROM exam_schedules
       WHERE employee_id = $1
         AND day_of_week = $2
         AND term = $3
         AND (exam_date IS NULL OR exam_date = $4)
         AND status = 'available'`,
      [employeeId, dayOfWeek, currentTerm, date]
    )
    console.log('[validateEmployeeSchedule] Found exam schedules:', examSchedules.length)

    const substituteSchedules = await dbQuery<SubstituteScheduleRow>(
      `SELECT
         substitute_schedule_id,
         schedule_type,
         time_start,
         time_end,
         subject_name,
         section
       FROM substitute_schedules
       WHERE substitute_employee_id = $1
         AND active_date = $2
         AND is_active = TRUE`,
      [employeeId, date]
    )

    if (substituteSchedules.length > 0) {
      policyOverrides.push('active_substitute_assignment')
    }

    const substituteTeachingSchedules: TeachingSchedule[] = substituteSchedules
      .filter((s) => String(s.schedule_type || '').toLowerCase() !== 'exam')
      .map((s) => ({
        schedule_id: -Number(s.substitute_schedule_id || 0),
        employee_id: employeeId,
        course_id: 0,
        room_id: 0,
        day_of_week: dayOfWeek,
        time_start: s.time_start,
        time_end: s.time_end,
        subject_name: s.subject_name || 'Substitute Class',
        section: s.section || undefined,
        status: 'available'
      }))

    const substituteExamSchedules: ExamSchedule[] = substituteSchedules
      .filter((s) => String(s.schedule_type || '').toLowerCase() === 'exam')
      .map((s) => ({
        exam_schedule_id: -Number(s.substitute_schedule_id || 0),
        employee_id: employeeId,
        day_of_week: dayOfWeek,
        time_start: s.time_start,
        time_end: s.time_end,
        subject_name: s.subject_name || 'Substitute Exam Proctoring',
        section: s.section || undefined,
        status: 'available'
      }))

    const teachingSchedules = [...baseTeachingSchedules, ...substituteTeachingSchedules]
    const mergedExamSchedules = [...examSchedules, ...substituteExamSchedules]

    const detectOverlaps = (
      label: 'teaching' | 'exam',
      rows: Array<{ time_start: string; time_end: string; subject_name?: string; section?: string }>
    ) => {
      const sorted = [...rows].sort((a, b) => toMinutes(a.time_start) - toMinutes(b.time_start))
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]
        const curr = sorted[i]
        if (overlaps({ start: prev.time_start, end: prev.time_end }, { start: curr.time_start, end: curr.time_end })) {
          const prevLabel = prev.subject_name || prev.section || `${label} schedule`
          const currLabel = curr.subject_name || curr.section || `${label} schedule`
          policyConflicts.push(
            `Overlapping ${label} schedules: ${prevLabel} (${prev.time_start}-${prev.time_end}) and ${currLabel} (${curr.time_start}-${curr.time_end})`
          )
        }
      }
    }

    detectOverlaps('teaching', teachingSchedules)
    detectOverlaps('exam', mergedExamSchedules)

    // Step 8: For non-teaching staff, use fixed shift if available.
    if (employeeRole === 'non_teaching' || employeeRole === 'admin') {
      const shiftIn = String(employee?.schedule_time_in || '').trim()
      const shiftOut = String(employee?.schedule_time_out || '').trim()
      const hasFixedShift = shiftIn.length >= 5 && shiftOut.length >= 5

      if (hasFixedShift) {
        policyOverrides.push('non_teaching_fixed_shift')
        return {
          hasSchedule: true,
          isAdminTime: false,
          schedules: teachingSchedules,
          examSchedules: mergedExamSchedules,
          effectiveSchedules: {
            teaching: teachingSchedules,
            exam: mergedExamSchedules
          },
          expectedTimeIn: shiftIn,
          expectedTimeOut: shiftOut,
          holiday: specialDay || undefined,
          policy: {
            employeeRole,
            attendanceMode: 'fixed_shift',
            overrides: policyOverrides,
            conflicts: policyConflicts
          },
          message: `Using fixed shift schedule (${shiftIn}-${shiftOut}) for ${employeeRole} staff.`
        }
      }
    }

    // Step 9: Determine if employee has any schedule
    const hasSchedule = teachingSchedules.length > 0 || mergedExamSchedules.length > 0

    if (!hasSchedule) {
      // No schedule = Admin Time allowed
      return {
        hasSchedule: false,
        isAdminTime: true,
        schedules: [],
        examSchedules: [],
        policy: {
          employeeRole,
          attendanceMode: 'admin_time',
          overrides: policyOverrides,
          conflicts: policyConflicts
        },
        message: 'No teaching load for today. Logging as Admin Time.'
      }
    }

    // Step 10: Exam/proctoring schedules override conflicting class schedules.
    const examIntervals: TimeInterval[] = mergedExamSchedules.map((s) => ({ start: s.time_start, end: s.time_end }))
    const effectiveTeachingSchedules = teachingSchedules.filter((sched) => {
      const classInterval: TimeInterval = { start: sched.time_start, end: sched.time_end }
      const hasConflict = examIntervals.some((examInterval) => overlaps(classInterval, examInterval))
      if (hasConflict) {
        const subjectLabel = sched.subject_name || sched.section || `Schedule ${sched.schedule_id}`
        policyConflicts.push(`Class suppressed by exam/proctoring: ${subjectLabel} (${sched.time_start}-${sched.time_end})`)
      }
      return !hasConflict
    })

    if (teachingSchedules.length !== effectiveTeachingSchedules.length) {
      policyOverrides.push('exam_overrides_class')
    }

    // Step 11: Determine expected time in/out based on effective schedules.
    let expectedTimeIn: string | undefined
    let expectedTimeOut: string | undefined

    const allTimes = [
      ...effectiveTeachingSchedules.map(s => ({ start: s.time_start, end: s.time_end })),
      ...mergedExamSchedules.map(s => ({ start: s.time_start, end: s.time_end }))
    ]

    if (allTimes.length > 0) {
      // Get earliest start time
      expectedTimeIn = allTimes
        .map(t => t.start)
        .sort()[0]

      // Get latest end time
      expectedTimeOut = allTimes
        .map(t => t.end)
        .sort()
        .reverse()[0]
    }

    return {
      hasSchedule: true,
      isAdminTime: false,
      schedules: teachingSchedules,
      examSchedules: mergedExamSchedules,
      effectiveSchedules: {
        teaching: effectiveTeachingSchedules,
        exam: mergedExamSchedules
      },
      expectedTimeIn,
      expectedTimeOut,
      holiday: specialDay || undefined,
      policy: {
        employeeRole,
        attendanceMode: 'teaching_or_exam',
        overrides: policyOverrides,
        conflicts: policyConflicts
      },
      message: `Found ${effectiveTeachingSchedules.length} effective teaching schedule(s) and ${mergedExamSchedules.length} exam schedule(s).`
    }

  } catch (error) {
    console.error('[validateEmployeeSchedule] Exception:', error)
    return {
      hasSchedule: false,
      isAdminTime: false,
      schedules: [],
      examSchedules: [],
      policy: {
        employeeRole: 'unknown',
        attendanceMode: 'no_tracking',
        overrides: ['validation_error'],
        conflicts: []
      },
      message: 'Error validating schedule. Please try again.'
    }
  }
}

/**
 * Calculate if employee is late or has undertime
 */
export function calculateAttendanceStatus(
  actualTime: string, // HH:MM:SS
  scheduledTime: string, // HH:MM:SS
  type: 'IN' | 'OUT'
): {
  isLate?: boolean
  isEarlyOut?: boolean
  minutes: number
  status: string
} {
  try {
    // Parse times
    const [actualHours, actualMinutes] = actualTime.split(':').map(Number)
    const [scheduledHours, scheduledMinutes] = scheduledTime.split(':').map(Number)

    // Convert to minutes since midnight
    const actualTotalMinutes = actualHours * 60 + actualMinutes
    const scheduledTotalMinutes = scheduledHours * 60 + scheduledMinutes

    const diffMinutes = actualTotalMinutes - scheduledTotalMinutes

    if (type === 'IN') {
      // Time IN: Check if late
      if (diffMinutes > 0) {
        // Late
        return {
          isLate: true,
          minutes: diffMinutes,
          status: 'late'
        }
      } else {
        // On time or early
        return {
          isLate: false,
          minutes: 0,
          status: 'on_time'
        }
      }
    } else {
      // Time OUT: Check if early (undertime)
      if (diffMinutes < 0) {
        // Early out (undertime)
        return {
          isEarlyOut: true,
          minutes: Math.abs(diffMinutes),
          status: 'undertime'
        }
      } else {
        // On time or overtime
        return {
          isEarlyOut: false,
          minutes: 0,
          status: 'on_time'
        }
      }
    }
  } catch (error) {
    console.error('[calculateAttendanceStatus] Error:', error)
    return {
      minutes: 0,
      status: 'error'
    }
  }
}

/**
 * Get current time in Asia/Manila timezone (HH:MM:SS format)
 */
export function getCurrentManilaTime(): string {
  const now = new Date()
  const manilaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }))
  const hours = manilaTime.getHours().toString().padStart(2, '0')
  const minutes = manilaTime.getMinutes().toString().padStart(2, '0')
  const seconds = manilaTime.getSeconds().toString().padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

/**
 * Get current date in Asia/Manila timezone (YYYY-MM-DD format)
 */
export function getCurrentManilaDate(): string {
  const now = new Date()
  const manilaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }))
  const year = manilaTime.getFullYear()
  const month = (manilaTime.getMonth() + 1).toString().padStart(2, '0')
  const day = manilaTime.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Format time for display (HH:MM AM/PM)
 */
export function formatTimeDisplay(time: string): string {
  try {
    const [hours, minutes] = time.split(':').map(Number)
    const period = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
  } catch {
    return time
  }
}
