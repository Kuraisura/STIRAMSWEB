import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'
import { getIsoDayOfWeekFromDate, parseTimeToMinutes } from '@/lib/substitution-conflict-helper'
import { getSubstituteConflictReason } from '@/lib/substitution-availability-helper'
import { getActiveTermContext } from '@/lib/active-term-code'

export const dynamic = 'force-dynamic'

/**
 * API endpoint to get available substitute teachers for a specific schedule
 * Filters out teachers who have conflicting schedules at the same time
 * Uses local PostgreSQL database
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const dateStr = searchParams.get('date') // YYYY-MM-DD format
    const timeStart = searchParams.get('time_start') // HH:MM:SS format (database format)
    const timeEnd = searchParams.get('time_end') // HH:MM:SS format (database format)
    const originalEmployeeId = searchParams.get('original_employee_id') // Employee who needs substitute
    
    if (!dateStr || !timeStart || !timeEnd) {
      return NextResponse.json({ error: 'Missing required parameters: date, time_start, time_end' }, { status: 400 })
    }

    // Get ISO weekday from date (1=Monday..7=Sunday)
    const dayOfWeek = getIsoDayOfWeekFromDate(dateStr)

    if (!dayOfWeek) {
      return NextResponse.json({ error: 'Invalid date parameter. Expected YYYY-MM-DD.' }, { status: 400 })
    }

    const activeTerm = await getActiveTermContext()
    const termToUse = activeTerm.termCode

    console.log('[Available Substitutes] Checking availability for:', {
      date: dateStr,
      dayOfWeek,
      timeStart,
      timeEnd,
      originalEmployeeId
    })

    // Get all eligible teaching staff employees from local PostgreSQL.
    const allEmployees = await dbQuery(
      `SELECT employee_id, full_name, department, staff_type, is_active 
       FROM employees 
       WHERE staff_type = $1
         AND (is_active IS NULL OR is_active = TRUE)
         AND employment_status IN ('Part Time', 'Part Time Full Load')
       ORDER BY full_name ASC`,
      ['Teaching']
    )

    if (!allEmployees || allEmployees.length === 0) {
      return NextResponse.json({ availableTeachers: [] })
    }

    // Exclude the original employee if provided
    let eligibleEmployees = allEmployees
    if (originalEmployeeId) {
      eligibleEmployees = allEmployees.filter(e => e.employee_id !== Number(originalEmployeeId))
    }

    console.log('[Available Substitutes] Total eligible employees:', eligibleEmployees.length)

    const requestStartMinutes = parseTimeToMinutes(timeStart)
    const requestEndMinutes = parseTimeToMinutes(timeEnd)
    if (requestStartMinutes === null || requestEndMinutes === null || requestStartMinutes >= requestEndMinutes) {
      return NextResponse.json({ error: 'Invalid time range parameters.' }, { status: 400 })
    }

    // Check each employee for conflicts
    const availableTeachers = []
    const unavailableTeachers = []
    
    for (const employee of eligibleEmployees) {
      let hasConflict = false
      let conflictReason: {
        code: 'TEACHING_SCHEDULE_CONFLICT' | 'EXAM_SCHEDULE_CONFLICT' | 'EXISTING_SUBSTITUTION_CONFLICT'
        label: string
        conflictRange?: string
      } | null = null

      // Check teaching schedules for this day of week.
      const teachingSchedules = await dbQuery(
        `SELECT time_start, time_end, subject_name, section 
         FROM teaching_schedules 
         WHERE employee_id = $1
           AND day_of_week = $2
           AND ($3::text IS NULL OR term = $3 OR term IS NULL)
           AND (status IS NULL OR LOWER(status) IN ('available', 'active'))`,
        [employee.employee_id, dayOfWeek, termToUse]
      )

      // If no teaching conflict, check exam schedules on this specific date.
      const examSchedules = await dbQuery(
        `SELECT time_start, time_end, subject_name, section, exam_date 
         FROM exam_schedules 
         WHERE employee_id = $1
           AND (
             exam_date = $2::date
             OR (exam_date IS NULL AND day_of_week = $3)
           )
           AND (
             $4::text IS NULL
             OR term = $4
             OR term IS NULL
             OR (
               $5::date IS NOT NULL
               AND $6::date IS NOT NULL
               AND exam_date IS NOT NULL
               AND exam_date BETWEEN $5::date AND $6::date
             )
           )
           AND (status IS NULL OR LOWER(status) IN ('available', 'active'))`,
        [employee.employee_id, dateStr, dayOfWeek, termToUse, activeTerm.startDate, activeTerm.endDate]
      )

      // If still no conflict, check already pending/approved substitutions for same date.
      const substitutionRows = await dbQuery(
        `SELECT start_time::text AS start_time, end_time::text AS end_time
         FROM class_substitutions_v2
         WHERE substitute_employee_id = $1
           AND substitution_date = $2::date
           AND COALESCE(status, 'pending') NOT IN ('rejected', 'cancelled')`,
        [employee.employee_id, dateStr]
      )

      const detectedConflict = getSubstituteConflictReason({
        requestStartMinutes,
        requestEndMinutes,
        teachingSchedules: teachingSchedules || [],
        examSchedules: examSchedules || [],
        existingSubstitutions: substitutionRows || [],
      })

      if (detectedConflict) {
        hasConflict = true
        conflictReason = detectedConflict

        if (detectedConflict.code === 'TEACHING_SCHEDULE_CONFLICT') {
          console.log('[Available Substitutes] Conflict found for', employee.full_name, '- Teaching:', {
            time: detectedConflict.conflictRange,
          })
        } else if (detectedConflict.code === 'EXAM_SCHEDULE_CONFLICT') {
          console.log('[Available Substitutes] Conflict found for', employee.full_name, '- Exam:', {
            time: detectedConflict.conflictRange,
            date: dateStr,
          })
        } else {
          console.log('[Available Substitutes] Conflict found for', employee.full_name, '- Existing substitution:', {
            time: detectedConflict.conflictRange,
          })
        }
      }

      // If no conflicts, add to available list
      if (!hasConflict) {
        availableTeachers.push({
          employee_id: employee.employee_id,
          full_name: employee.full_name,
          department: employee.department,
        })
      } else {
        unavailableTeachers.push({
          employee_id: employee.employee_id,
          full_name: employee.full_name,
          department: employee.department,
          reason_code: conflictReason?.code || 'TEACHING_SCHEDULE_CONFLICT',
          reason_label: conflictReason?.label || 'Unavailable due to schedule conflict',
          conflict_range: conflictReason?.conflictRange || null,
        })
      }
    }

    console.log('[Available Substitutes] Available teachers:', availableTeachers.length, 'out of', eligibleEmployees.length)

    return NextResponse.json({ availableTeachers, unavailableTeachers })
  } catch (e: any) {
    console.error('employees/available-substitutes error:', e?.message || e)
    return NextResponse.json({ error: 'Failed to fetch available substitutes' }, { status: 500 })
  }
}

