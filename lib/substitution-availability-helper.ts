import { parseTimeToMinutes, rangesOverlap } from './substitution-conflict-helper'

export type SubstituteConflictCode =
  | 'TEACHING_SCHEDULE_CONFLICT'
  | 'EXAM_SCHEDULE_CONFLICT'
  | 'EXISTING_SUBSTITUTION_CONFLICT'

export type SubstituteConflictResult = {
  code: SubstituteConflictCode
  label: string
  conflictRange?: string
}

type TimeRangeRow = {
  time_start?: string | null
  time_end?: string | null
  start_time?: string | null
  end_time?: string | null
}

function toRange(row: TimeRangeRow): { start: string; end: string } | null {
  const start = String(row.time_start ?? row.start_time ?? '').trim()
  const end = String(row.time_end ?? row.end_time ?? '').trim()
  if (!start || !end) return null
  return { start, end }
}

function hasOverlap(
  requestStartMinutes: number,
  requestEndMinutes: number,
  rows: TimeRangeRow[]
): { conflictRange: string } | null {
  for (const row of rows) {
    const range = toRange(row)
    if (!range) continue

    const startMinutes = parseTimeToMinutes(range.start)
    const endMinutes = parseTimeToMinutes(range.end)
    if (startMinutes === null || endMinutes === null) continue

    if (rangesOverlap(requestStartMinutes, requestEndMinutes, startMinutes, endMinutes)) {
      return { conflictRange: `${range.start} - ${range.end}` }
    }
  }

  return null
}

export function getSubstituteConflictReason(params: {
  requestStartMinutes: number
  requestEndMinutes: number
  teachingSchedules?: TimeRangeRow[]
  examSchedules?: TimeRangeRow[]
  existingSubstitutions?: TimeRangeRow[]
}): SubstituteConflictResult | null {
  const teaching = hasOverlap(
    params.requestStartMinutes,
    params.requestEndMinutes,
    params.teachingSchedules || []
  )
  if (teaching) {
    return {
      code: 'TEACHING_SCHEDULE_CONFLICT',
      label: 'Has a class schedule conflict',
      conflictRange: teaching.conflictRange,
    }
  }

  const exam = hasOverlap(
    params.requestStartMinutes,
    params.requestEndMinutes,
    params.examSchedules || []
  )
  if (exam) {
    return {
      code: 'EXAM_SCHEDULE_CONFLICT',
      label: 'Has an exam schedule conflict',
      conflictRange: exam.conflictRange,
    }
  }

  const substitution = hasOverlap(
    params.requestStartMinutes,
    params.requestEndMinutes,
    params.existingSubstitutions || []
  )
  if (substitution) {
    return {
      code: 'EXISTING_SUBSTITUTION_CONFLICT',
      label: 'Already assigned to another substitution',
      conflictRange: substitution.conflictRange,
    }
  }

  return null
}
