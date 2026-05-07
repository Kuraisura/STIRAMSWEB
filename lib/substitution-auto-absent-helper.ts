import { dbQuery } from '@/lib/db'
import { parseTimeToMinutes } from '@/lib/substitution-conflict-helper'

type TimeWindow = { start: number; end: number }

const AUTO_SUBSTITUTION_ABSENT_NOTE = 'Auto-marked absent: all class/exam schedules covered by approved substitution(s).'

type AutoAbsentResult = {
  checked: boolean
  createdAbsent: boolean
  skippedReason?: string
  employeeId?: number
  date?: string
  absentLogId?: number
}

function mergeWindows(windows: TimeWindow[]): TimeWindow[] {
  if (!windows.length) return []
  const sorted = [...windows].sort((a, b) => a.start - b.start)
  const merged: TimeWindow[] = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]
    const last = merged[merged.length - 1]
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end)
    } else {
      merged.push({ ...cur })
    }
  }
  return merged
}

function subtractWindows(base: TimeWindow[], removals: TimeWindow[]): TimeWindow[] {
  let result = [...base]
  for (const rem of removals) {
    const next: TimeWindow[] = []
    for (const b of result) {
      if (rem.end <= b.start || rem.start >= b.end) {
        next.push(b)
        continue
      }
      if (rem.start > b.start) next.push({ start: b.start, end: rem.start })
      if (rem.end < b.end) next.push({ start: rem.end, end: b.end })
    }
    result = next
  }
  return result.filter((w) => w.end > w.start)
}

async function getScheduleCoverageForDate(employeeId: number, date: string): Promise<{
  baseWindows: TimeWindow[]
  effectiveWindows: TimeWindow[]
}> {
  const dayRows = await dbQuery<{ dow: number }>(
    `SELECT EXTRACT(ISODOW FROM $1::date)::int AS dow`,
    [date]
  )
  const dayOfWeek = Number(dayRows?.[0]?.dow || 0)

  const teaching = dayOfWeek
    ? await dbQuery<{ time_start: string; time_end: string }>(
        `SELECT time_start::text, time_end::text
         FROM teaching_schedules
         WHERE employee_id = $1 AND day_of_week = $2`,
        [employeeId, dayOfWeek]
      )
    : []

  const exams = dayOfWeek
    ? await dbQuery<{ time_start: string; time_end: string }>(
        `SELECT time_start::text, time_end::text
         FROM exam_schedules
         WHERE employee_id = $1
           AND (exam_date = $2::date OR day_of_week = $3)`,
        [employeeId, date, dayOfWeek]
      )
    : []

  const baseWindows = [
    ...(teaching || []).map((r) => ({ start: parseTimeToMinutes(r.time_start), end: parseTimeToMinutes(r.time_end) })),
    ...(exams || []).map((r) => ({ start: parseTimeToMinutes(r.time_start), end: parseTimeToMinutes(r.time_end) })),
  ].filter((w): w is { start: number; end: number } => w.start !== null && w.end !== null && w.end > w.start)

  if (!baseWindows.length) {
    return { baseWindows: [], effectiveWindows: [] }
  }

  const approvedClassSubs = await dbQuery<{ start_time: string; end_time: string }>(
    `SELECT start_time::text, end_time::text
     FROM class_substitutions_v2
     WHERE original_employee_id = $1
       AND substitution_date = $2::date
       AND COALESCE(status, 'pending') = 'approved'`,
    [employeeId, date]
  )

  const substitutedExamWindows = await dbQuery<{ time_start: string; time_end: string }>(
    `SELECT time_start::text, time_end::text
     FROM exam_schedules
     WHERE employee_id = $1
       AND exam_date = $2::date
       AND LOWER(COALESCE(status, 'available')) = 'substituted'
       AND substitute_employee_id IS NOT NULL
       AND COALESCE(substitution_date, exam_date) = $2::date`,
    [employeeId, date]
  )

  const removedWindows = [
    ...(approvedClassSubs || []).map((r) => ({ start: parseTimeToMinutes(r.start_time), end: parseTimeToMinutes(r.end_time) })),
    ...(substitutedExamWindows || []).map((r) => ({ start: parseTimeToMinutes(r.time_start), end: parseTimeToMinutes(r.time_end) })),
  ].filter((w): w is { start: number; end: number } => w.start !== null && w.end !== null && w.end > w.start)

  return {
    baseWindows,
    effectiveWindows: subtractWindows(baseWindows, mergeWindows(removedWindows)),
  }
}

export async function autoMarkOriginalEmployeeAbsentIfNoSchedule(
  substitutionId: number
): Promise<AutoAbsentResult> {
  const subRows = await dbQuery<{ original_employee_id: number; substitution_date: string }>(
    `SELECT original_employee_id, substitution_date::text
     FROM class_substitutions_v2
     WHERE id = $1
     LIMIT 1`,
    [substitutionId]
  )

  const sub = subRows[0]
  if (!sub?.original_employee_id || !sub?.substitution_date) {
    return { checked: false, createdAbsent: false, skippedReason: 'Substitution not found' }
  }

  const employeeId = Number(sub.original_employee_id)
  const date = String(sub.substitution_date).slice(0, 10)

  const { baseWindows, effectiveWindows } = await getScheduleCoverageForDate(employeeId, date)

  if (!baseWindows.length) {
    return { checked: true, createdAbsent: false, skippedReason: 'No base class/exam schedule', employeeId, date }
  }

  if (effectiveWindows.length > 0) {
    return { checked: true, createdAbsent: false, skippedReason: 'Effective schedule still exists', employeeId, date }
  }

  const existingDayLogs = await dbQuery<{ log_id: number }>(
    `SELECT log_id
     FROM attendance_logs
     WHERE employee_id = $1 AND date = $2::date
     LIMIT 1`,
    [employeeId, date]
  )

  if (existingDayLogs.length > 0) {
    return { checked: true, createdAbsent: false, skippedReason: 'Attendance log already exists', employeeId, date }
  }

  const employeeRows = await dbQuery<{ rfid_code: string | null }>(
    `SELECT rfid_code FROM employees WHERE employee_id = $1 LIMIT 1`,
    [employeeId]
  )
  const rfidCode = employeeRows[0]?.rfid_code || null

  const insertedLogs = await dbQuery<{ log_id: number }>(
    `INSERT INTO attendance_logs (
       employee_id,
       date,
       log_time,
       log_type,
       attendance_status,
       is_late,
       is_early_out,
       rfid_code,
       notes
     ) VALUES (
       $1,
       $2::date,
       $3,
       NULL,
       'absent',
       FALSE,
       FALSE,
       $4,
       $5
     )`,
    [
      employeeId,
      date,
      `${date}T00:00:00+08:00`,
      rfidCode,
      AUTO_SUBSTITUTION_ABSENT_NOTE,
    ]
  )

    return {
      checked: true,
      createdAbsent: true,
      employeeId,
      date,
      absentLogId: Number(insertedLogs?.[0]?.log_id || 0) || undefined,
    }
}

  type AutoAbsentCleanupResult = {
    checked: boolean
    deletedAbsentLogs: number
    skippedReason?: string
  }

  export async function removeAutoMarkedAbsentIfScheduleRestored(params: {
    employeeId: number
    date: string
  }): Promise<AutoAbsentCleanupResult> {
    const employeeId = Number(params.employeeId)
    const date = String(params.date || '').slice(0, 10)

    if (!Number.isFinite(employeeId) || employeeId <= 0 || !date) {
      return { checked: false, deletedAbsentLogs: 0, skippedReason: 'Invalid cleanup inputs' }
    }

    const { baseWindows, effectiveWindows } = await getScheduleCoverageForDate(employeeId, date)

    if (!baseWindows.length) {
      return { checked: true, deletedAbsentLogs: 0, skippedReason: 'No base class/exam schedule' }
    }

    if (!effectiveWindows.length) {
      return { checked: true, deletedAbsentLogs: 0, skippedReason: 'No effective schedule remains' }
    }

    const deletedRows = await dbQuery<{ log_id: number }>(
      `DELETE FROM attendance_logs
       WHERE employee_id = $1
         AND date = $2::date
         AND attendance_status = 'absent'
         AND notes = $3
       RETURNING log_id`,
      [employeeId, date, AUTO_SUBSTITUTION_ABSENT_NOTE]
    )

    return {
      checked: true,
      deletedAbsentLogs: deletedRows.length,
      skippedReason: deletedRows.length ? undefined : 'No auto-marked substitution absent logs found',
    }
  }
