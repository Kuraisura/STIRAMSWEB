import { describe, it, expect } from 'vitest'
import {
  parseTimeToMinutes,
  rangesOverlap,
  normalizeDayOfWeekInput,
  getIsoDayOfWeekFromDate,
} from './substitution-conflict-helper'

describe('parseTimeToMinutes', () => {
  it('parses 24-hour HH:mm and HH:mm:ss formats', () => {
    expect(parseTimeToMinutes('08:30')).toBe(510)
    expect(parseTimeToMinutes('23:59:00')).toBe(1439)
  })

  it('parses 12-hour AM/PM format', () => {
    expect(parseTimeToMinutes('12:00 AM')).toBe(0)
    expect(parseTimeToMinutes('12:00 PM')).toBe(720)
    expect(parseTimeToMinutes('1:05 PM')).toBe(785)
  })

  it('returns null for invalid values', () => {
    expect(parseTimeToMinutes('')).toBeNull()
    expect(parseTimeToMinutes('25:00')).toBeNull()
    expect(parseTimeToMinutes('9:99')).toBeNull()
    expect(parseTimeToMinutes('13:00 PM')).toBeNull()
    expect(parseTimeToMinutes('invalid')).toBeNull()
  })
})

describe('rangesOverlap', () => {
  it('returns true for overlapping ranges', () => {
    expect(rangesOverlap(8 * 60, 10 * 60, 9 * 60, 11 * 60)).toBe(true)
  })

  it('returns false for touching-but-not-overlapping ranges', () => {
    expect(rangesOverlap(8 * 60, 9 * 60, 9 * 60, 10 * 60)).toBe(false)
  })

  it('returns false for separate ranges', () => {
    expect(rangesOverlap(8 * 60, 9 * 60, 10 * 60, 11 * 60)).toBe(false)
  })
})

describe('normalizeDayOfWeekInput', () => {
  it('normalizes numeric day values to ISO weekday', () => {
    expect(normalizeDayOfWeekInput(1)).toBe(1)
    expect(normalizeDayOfWeekInput(7)).toBe(7)
    expect(normalizeDayOfWeekInput(0)).toBe(7)
  })

  it('normalizes day name variants', () => {
    expect(normalizeDayOfWeekInput('Monday')).toBe(1)
    expect(normalizeDayOfWeekInput('mon')).toBe(1)
    expect(normalizeDayOfWeekInput('SUNDAY')).toBe(7)
    expect(normalizeDayOfWeekInput('thu')).toBe(4)
  })

  it('returns null for unsupported values', () => {
    expect(normalizeDayOfWeekInput(undefined)).toBeNull()
    expect(normalizeDayOfWeekInput(null)).toBeNull()
    expect(normalizeDayOfWeekInput('')).toBeNull()
    expect(normalizeDayOfWeekInput('noday')).toBeNull()
    expect(normalizeDayOfWeekInput(9)).toBeNull()
  })
})

describe('getIsoDayOfWeekFromDate', () => {
  it('returns expected ISO weekdays for valid dates', () => {
    // 2026-04-05 is Sunday
    expect(getIsoDayOfWeekFromDate('2026-04-05')).toBe(7)
    // 2026-04-06 is Monday
    expect(getIsoDayOfWeekFromDate('2026-04-06')).toBe(1)
  })

  it('returns null for invalid dates', () => {
    expect(getIsoDayOfWeekFromDate('')).toBeNull()
    expect(getIsoDayOfWeekFromDate('2026/04/05')).toBeNull()
    expect(getIsoDayOfWeekFromDate('not-a-date')).toBeNull()
  })
})
