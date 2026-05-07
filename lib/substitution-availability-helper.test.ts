import { describe, it, expect } from 'vitest'
import { getSubstituteConflictReason } from './substitution-availability-helper'

describe('getSubstituteConflictReason', () => {
  it('returns null when no conflicts are present', () => {
    const result = getSubstituteConflictReason({
      requestStartMinutes: 8 * 60,
      requestEndMinutes: 9 * 60,
      teachingSchedules: [{ time_start: '10:00:00', time_end: '11:00:00' }],
      examSchedules: [{ time_start: '12:00:00', time_end: '13:00:00' }],
      existingSubstitutions: [{ start_time: '14:00:00', end_time: '15:00:00' }],
    })

    expect(result).toBeNull()
  })

  it('returns teaching conflict first when multiple conflicts exist', () => {
    const result = getSubstituteConflictReason({
      requestStartMinutes: 8 * 60,
      requestEndMinutes: 10 * 60,
      teachingSchedules: [{ time_start: '09:00:00', time_end: '10:30:00' }],
      examSchedules: [{ time_start: '09:30:00', time_end: '10:30:00' }],
      existingSubstitutions: [{ start_time: '09:15:00', end_time: '09:45:00' }],
    })

    expect(result).toEqual({
      code: 'TEACHING_SCHEDULE_CONFLICT',
      label: 'Has a class schedule conflict',
      conflictRange: '09:00:00 - 10:30:00',
    })
  })

  it('returns exam conflict when teaching does not overlap', () => {
    const result = getSubstituteConflictReason({
      requestStartMinutes: 8 * 60,
      requestEndMinutes: 9 * 60,
      teachingSchedules: [{ time_start: '10:00:00', time_end: '11:00:00' }],
      examSchedules: [{ time_start: '08:30:00', time_end: '09:30:00' }],
    })

    expect(result).toEqual({
      code: 'EXAM_SCHEDULE_CONFLICT',
      label: 'Has an exam schedule conflict',
      conflictRange: '08:30:00 - 09:30:00',
    })
  })

  it('returns substitution conflict when no teaching/exam overlap', () => {
    const result = getSubstituteConflictReason({
      requestStartMinutes: 13 * 60,
      requestEndMinutes: 14 * 60,
      teachingSchedules: [{ time_start: '08:00:00', time_end: '09:00:00' }],
      examSchedules: [{ time_start: '10:00:00', time_end: '11:00:00' }],
      existingSubstitutions: [{ start_time: '13:30:00', end_time: '14:30:00' }],
    })

    expect(result).toEqual({
      code: 'EXISTING_SUBSTITUTION_CONFLICT',
      label: 'Already assigned to another substitution',
      conflictRange: '13:30:00 - 14:30:00',
    })
  })

  it('ignores invalid time windows and continues evaluation', () => {
    const result = getSubstituteConflictReason({
      requestStartMinutes: 13 * 60,
      requestEndMinutes: 14 * 60,
      teachingSchedules: [{ time_start: 'invalid', time_end: 'time' }],
      existingSubstitutions: [{ start_time: '13:30:00', end_time: '14:30:00' }],
    })

    expect(result?.code).toBe('EXISTING_SUBSTITUTION_CONFLICT')
  })
})
