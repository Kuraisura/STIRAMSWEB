/**
 * Attendance Helpers and Validators
 * 
 * This module provides helper functions and validators for attendance logic,
 * especially around start_date handling and preventing false absent marking.
 */

/**
 * Validates if an employee should be marked as absent on a given date
 * based on their hire_date, start_date, and schedule.
 * 
 * Rules:
 * - If checking before hire_date → Don't mark absent (not hired yet)
 * - If checking before start_date → Don't mark absent (work hasn't started)
 * - If checking the start_date itself → Start monitoring from this date
 * - If checking after start_date → Can mark absent if no logs AND has schedule for that day
 * - If employee has NO schedule for the day → Don't mark absent (show blank)
 * - Sundays are always excluded (rest day)
 * 
 * @param checkDate - The date being checked (YYYY-MM-DD format)
 * @param startDate - The employee's start date (YYYY-MM-DD format, can be null/undefined)
 * @param hireDate - The employee's hire date (YYYY-MM-DD format, can be null/undefined)
 * @param today - Today's date (YYYY-MM-DD format) - defaults to current date
 * @param hasScheduleForDay - Whether the employee has a schedule (class/exam) for this day (optional, defaults to true for backward compatibility)
 * @returns true if the employee can be marked absent, false otherwise
 */
export function canMarkAsAbsent(
  checkDate: string,
  startDate: string | null | undefined,
  hireDate?: string | null | undefined,
  today?: string,
  hasScheduleForDay?: boolean
): boolean {
  const manilaDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })

  const toManilaDateKey = (value: string | null | undefined): string | null => {
    if (!value) return null
    const raw = String(value).trim()
    if (!raw) return null
    const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/)
    if (direct) return direct[1]
    const parsed = new Date(raw)
    if (isNaN(parsed.getTime())) return null
    const parts = manilaDateFormatter.formatToParts(parsed)
    const y = parts.find((p) => p.type === 'year')?.value
    const m = parts.find((p) => p.type === 'month')?.value
    const d = parts.find((p) => p.type === 'day')?.value
    if (!y || !m || !d) return null
    return `${y}-${m}-${d}`
  }

  // Normalize dates to YYYY-MM-DD format using Manila timezone
  const normalizeDate = (d: string) => {
    const key = toManilaDateKey(d)
    return key || d
  }

  const normalizedCheckDate = normalizeDate(checkDate)
  const normalizedToday = today ? normalizeDate(today) : (() => {
    // Get today's date in Manila timezone
    const now = new Date()
    const manilaDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }))
    const year = manilaDate.getFullYear()
    const month = String(manilaDate.getMonth() + 1).padStart(2, '0')
    const day = String(manilaDate.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })()

  // Convert to Date objects for comparison using Manila timezone
  const checkDateKey = toManilaDateKey(normalizedCheckDate)
  const todayKey = toManilaDateKey(normalizedToday)
  if (!checkDateKey || !todayKey) {
    return false
  }

  const checkDateObj = new Date(`${checkDateKey}T00:00:00+08:00`)

  // CRITICAL: Exclude Sundays (rest day)
  // getDay() returns 0 for Sunday
  if (checkDateObj.getDay() === 0) {
    return false
  }

  // Rule 1: If checking before hire_date → Don't mark absent (not hired yet)
  if (hireDate) {
    const normalizedHireDate = normalizeDate(hireDate)
    const hireDateKey = toManilaDateKey(normalizedHireDate)
    if (hireDateKey && checkDateKey < hireDateKey) {
      return false
    }
  }

  // Rule 2: If no start_date, use hire_date as start_date (backward compatibility)
  const effectiveStartDate = startDate || hireDate
  if (!effectiveStartDate) {
    // If neither start_date nor hire_date, use backward compatibility (can mark absent)
    return true
  }

  const normalizedStartDate = normalizeDate(effectiveStartDate)
  const startDateKey = toManilaDateKey(normalizedStartDate)
  if (!startDateKey) {
    return false
  }

  // Rule 3: If checking a date before start_date → Don't mark absent
  // CRITICAL: Use strict less-than comparison to prevent marking absent on start_date itself
  if (checkDateKey < startDateKey) {
    return false
  }
  
  // Rule 4: If checking a date in the future (after today) → Don't mark absent
  // Future dates should be blank, not marked as absent
  if (checkDateKey > todayKey) {
    return false
  }

  // Rule 4.5: Never mark the current day in-progress as absent.
  // The day-end/midnight automation will process this once the day closes.
  if (checkDateKey === todayKey) {
    return false
  }

  // Rule 5: Already handled above (Rule 3.5) - start_date itself is never marked absent

  // Rule 6: If checking a date after start_date → Can mark absent ONLY if employee has a schedule for that day
  // If hasScheduleForDay is undefined, default to true for backward compatibility
  // If hasScheduleForDay is false, don't mark absent (employee has no schedule - show blank)
  if (hasScheduleForDay === false) {
    return false // No schedule for this day - don't mark absent, show blank
  }
  
  // Employee has a schedule for this day (or hasScheduleForDay is undefined/true for backward compatibility)
  // And the date is in the past or today
  return true
}

/**
 * Checks if a date falls on a weekday that matches a schedule's day_of_week
 * 
 * @param checkDate - The date being checked (YYYY-MM-DD format)
 * @param dayOfWeek - The day_of_week from schedule (1=Monday, 2=Tuesday, ..., 6=Saturday)
 * @returns true if the date falls on the specified weekday
 */
export function dateMatchesScheduleDay(checkDate: string, dayOfWeek: number): boolean {
  try {
    const dateObj = new Date(checkDate + 'T00:00:00')
    const jsDay = dateObj.getDay() // 0=Sunday, 1=Monday, ..., 6=Saturday
    // Convert JS day (0-6) to schedule day (1-6): Mon=1, Tue=2, ..., Sat=6, Sun=0 (but should be excluded)
    const scheduleDayMap: Record<number, number> = {
      1: 1, // Monday
      2: 2, // Tuesday
      3: 3, // Wednesday
      4: 4, // Thursday
      5: 5, // Friday
      6: 6, // Saturday
      0: 0  // Sunday (should be excluded elsewhere)
    }
    return scheduleDayMap[jsDay] === dayOfWeek
  } catch {
    return false
  }
}

/**
 * Validates if an employee's work has started on a given date
 * 
 * @param checkDate - The date being checked (YYYY-MM-DD format)
 * @param startDate - The employee's start date (YYYY-MM-DD format, can be null/undefined)
 * @param hireDate - The employee's hire date (YYYY-MM-DD format, can be null/undefined)
 * @returns true if work has started, false otherwise
 */
export function hasWorkStarted(
  checkDate: string, 
  startDate: string | null | undefined,
  hireDate?: string | null | undefined
): boolean {
  try {
    const manilaDateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })

    const toManilaDateKey = (value: string | null | undefined): string | null => {
      if (!value) return null
      const raw = String(value).trim()
      if (!raw) return null
      const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/)
      if (direct) return direct[1]
      const parsed = new Date(raw)
      if (isNaN(parsed.getTime())) return null
      const parts = manilaDateFormatter.formatToParts(parsed)
      const y = parts.find((p) => p.type === 'year')?.value
      const m = parts.find((p) => p.type === 'month')?.value
      const d = parts.find((p) => p.type === 'day')?.value
      if (!y || !m || !d) return null
      return `${y}-${m}-${d}`
    }

    // Use Manila timezone for date comparisons
    const checkDateKey = toManilaDateKey(checkDate)
    if (!checkDateKey) return true
    
    // Check hire_date first - if before hire_date, work hasn't started
    if (hireDate) {
      const hireDateKey = toManilaDateKey(hireDate)
      if (hireDateKey && checkDateKey < hireDateKey) {
        return false // Not hired yet
      }
    }
    
    // Use start_date or hire_date (whichever is later)
    const effectiveStartDate = startDate || hireDate
    if (!effectiveStartDate) {
      return true // Backward compatibility - if no dates, assume started
    }
    
    const startDateKey = toManilaDateKey(effectiveStartDate)
    if (!startDateKey) {
      return true // Invalid start_date should not block employee from being considered started
    }

    // CRITICAL: If checkDate >= startDate, work has started
    // This means if today is start_date, work has started
    return checkDateKey >= startDateKey
  } catch {
    return true // On error, assume started (backward compatibility)
  }
}

/**
 * Gets the correct attendance status for an employee on a given date
 * considering their hire_date and start_date
 * 
 * @param checkDate - The date being checked (YYYY-MM-DD format)
 * @param startDate - The employee's start date (YYYY-MM-DD format)
 * @param hasLogs - Whether the employee has any attendance logs for this date
 * @param today - Today's date (YYYY-MM-DD format)
 * @param hireDate - The employee's hire date (YYYY-MM-DD format, optional)
 * @returns 'present' | 'absent' | 'work-not-started' | null
 */
export function getCorrectAttendanceStatus(
  checkDate: string,
  startDate: string | null | undefined,
  hasLogs: boolean,
  today?: string,
  hireDate?: string | null | undefined
): 'present' | 'absent' | 'work-not-started' | null {
  // Check if work has started (considering both hire_date and start_date)
  if (!hasWorkStarted(checkDate, startDate, hireDate)) {
    return 'work-not-started'
  }

  if (hasLogs) {
    return 'present'
  }

  // No logs - check if we can mark as absent
  if (canMarkAsAbsent(checkDate, startDate, hireDate, today)) {
    return 'absent'
  }

  // Can't mark as absent yet (e.g., it's the start_date itself or before dates)
  return null
}

/**
 * Checks if a date is a Sunday (rest day)
 * 
 * @param dateStr - The date to check (YYYY-MM-DD format)
 * @returns true if the date is a Sunday, false otherwise
 */
export function isSunday(dateStr: string): boolean {
  try {
    const dateObj = new Date(dateStr + 'T00:00:00')
    return dateObj.getDay() === 0 // 0 = Sunday
  } catch {
    return false
  }
}

/**
 * Validates start_date when being changed in the employee form
 * 
 * @param newStartDate - The new start date value
 * @param hireDate - The employee's hire date
 * @param currentStartDate - The current start date (if editing)
 * @returns { valid: boolean, error?: string }
 */
export function validateStartDateChange(
  newStartDate: string,
  hireDate: string,
  currentStartDate?: string | null
): { valid: boolean; error?: string; warning?: string } {
  if (!newStartDate) {
    return { valid: false, error: 'Start date is required' }
  }

  try {
    const newDate = new Date(newStartDate + 'T00:00:00')
    const hireDateObj = new Date(hireDate + 'T00:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Check if start date is before hire date
    if (newDate < hireDateObj) {
      return { valid: false, error: 'Start date cannot be before hire date' }
    }

    // Check if start date is too far in the future (more than 1 year)
    const maxDate = new Date()
    maxDate.setFullYear(maxDate.getFullYear() + 1)
    if (newDate > maxDate) {
      return { valid: false, error: 'Start date cannot be more than 1 year in the future' }
    }

    // Warning if changing start_date to today or past
    if (newDate <= today) {
      const warning = currentStartDate && newDate.toISOString().split('T')[0] !== currentStartDate
        ? 'Changing start date may affect attendance records. The employee will not be marked absent until the day after the new start date.'
        : undefined
      return { valid: true, warning }
    }

    return { valid: true }
  } catch (e) {
    return { valid: false, error: 'Invalid date format' }
  }
}

/**
 * Formats a date to YYYY-MM-DD format for database storage
 */
export function formatDateForDB(date: string | Date): string {
  if (!date) return ''
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date + 'T00:00:00') : date
    if (isNaN(dateObj.getTime())) return ''
    return dateObj.toISOString().split('T')[0]
  } catch {
    return String(date)
  }
}

/**
 * Check if a date is a configured day off for an employee
 * @param checkDate - Date to check (YYYY-MM-DD format)
 * @param daysOff - JSON string of day numbers, e.g., "[5, 6]" for Friday & Saturday
 * @returns true if the date is a configured day off
 */
export function isConfiguredDayOff(checkDate: string, daysOff?: string | null): boolean {
  if (!daysOff) return false
  
  try {
    const daysOffArray = JSON.parse(daysOff) as number[]
    if (!Array.isArray(daysOffArray)) return false
    
    const dateObj = new Date(checkDate + 'T00:00:00+08:00')
    const jsDay = dateObj.getDay() // 0=Sunday, 1=Monday, ..., 6=Saturday
    
    // Convert JS day to schedule day format (1=Monday, ..., 6=Saturday, 0=Sunday)
    const scheduleDayMap: Record<number, number> = {
      0: 0, // Sunday
      1: 1, // Monday
      2: 2, // Tuesday
      3: 3, // Wednesday
      4: 4, // Thursday
      5: 5, // Friday
      6: 6  // Saturday
    }
    
    return daysOffArray.includes(scheduleDayMap[jsDay])
  } catch {
    return false
  }
}

/**
 * Check if employee should be marked as "No Schedule" instead of absent
 * For Part Time Full Load employees with no scheduled classes on a day
 * @param employmentType - Employee's employment type
 * @param hasSchedule - Whether employee has any schedule for the day
 * @returns true if should show "No Schedule" instead of absent
 */
export function shouldShowNoSchedule(employmentType: string | undefined, hasSchedule: boolean): boolean {
  return employmentType === 'part_time_full_load' && !hasSchedule
}

/**
 * Enhanced absence checking with logs consideration
 * Only mark as absent if employee has IN/OUT logs but no schedule
 * If no logs at all, keep as 'No Record'
 * @param hasLogs - Whether employee has any logs for the day
 * @param hasSchedule - Whether employee has schedule for the day
 * @param employmentType - Employee's employment type
 * @returns true if should be marked as actually absent
 */
export function isActuallyAbsent(
  hasLogs: boolean,
  hasSchedule: boolean,
  employmentType?: string
): boolean {
  // If no logs at all, return false (will show 'No Record')
  if (!hasLogs) {
    return false
  }
  
  // If has logs but no schedule
  if (hasLogs && !hasSchedule) {
    // Part Time Full Load: If has logs but no schedule, not absent (will show 'No Schedule')
    if (employmentType === 'part_time_full_load') {
      return false
    }
    // For other types, having logs without schedule might still be absent
    return true
  }
  
  // If has logs and has schedule, check the logs to determine absence
  return false // This will be determined by other logic (checking IN/OUT times)
}

