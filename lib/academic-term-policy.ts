type CanonicalTermName = '1st Term' | '2nd Term' | 'Summer'

type TermMonthWindow = {
  startMonth: number
  endMonth: number
  expectedStartYearFromAcademicYear: 1 | 2
  expectedEndYearFromAcademicYear: 1 | 2
}

const TERM_WINDOWS: Record<CanonicalTermName, TermMonthWindow> = {
  '1st Term': {
    startMonth: 8,
    endMonth: 12,
    expectedStartYearFromAcademicYear: 1,
    expectedEndYearFromAcademicYear: 1,
  },
  '2nd Term': {
    startMonth: 1,
    endMonth: 5,
    expectedStartYearFromAcademicYear: 2,
    expectedEndYearFromAcademicYear: 2,
  },
  Summer: {
    startMonth: 6,
    endMonth: 7,
    expectedStartYearFromAcademicYear: 2,
    expectedEndYearFromAcademicYear: 2,
  },
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function normalizeAcademicTermName(termName: unknown): CanonicalTermName | null {
  const normalized = String(termName || '').trim().toLowerCase()
  if (normalized === '1st term' || normalized === 'first term') return '1st Term'
  if (normalized === '2nd term' || normalized === 'second term') return '2nd Term'
  if (normalized === 'summer' || normalized === 'summer term' || normalized === 'inter-term' || normalized === 'inter term') {
    return 'Summer'
  }
  return null
}

export function getAcademicYearBounds(academicYear: unknown): { startYear: number; endYear: number } | null {
  const value = String(academicYear || '').trim()
  const match = value.match(/^(\d{4})\s*-\s*(\d{4})$/)
  if (!match) return null

  const startYear = Number(match[1])
  const endYear = Number(match[2])
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return null
  if (endYear !== startYear + 1) return null

  return { startYear, endYear }
}

export function getAllowedTermWindow(termName: unknown) {
  const canonical = normalizeAcademicTermName(termName)
  if (!canonical) return null
  const window = TERM_WINDOWS[canonical]
  return {
    canonical,
    ...window,
  }
}

export function getAllowedTermWindowLabel(termName: unknown): string | null {
  const window = getAllowedTermWindow(termName)
  if (!window) return null

  return `${MONTH_LABELS[window.startMonth - 1]} to ${MONTH_LABELS[window.endMonth - 1]}`
}

export function validateAcademicTermDatePolicy(args: {
  academicYear: unknown
  termName: unknown
  startDate: unknown
  endDate: unknown
}): { valid: true } | { valid: false; error: string } {
  const bounds = getAcademicYearBounds(args.academicYear)
  if (!bounds) {
    return { valid: false, error: 'academic_year must use YYYY-YYYY format (example: 2025-2026).' }
  }

  const window = getAllowedTermWindow(args.termName)
  if (!window) {
    return { valid: false, error: 'term_name must be one of: 1st Term, 2nd Term, Summer.' }
  }

  const startDate = new Date(String(args.startDate || ''))
  const endDate = new Date(String(args.endDate || ''))

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { valid: false, error: 'start_date and end_date must be valid dates.' }
  }

  const startMonth = startDate.getUTCMonth() + 1
  const endMonth = endDate.getUTCMonth() + 1
  const startYear = startDate.getUTCFullYear()
  const endYear = endDate.getUTCFullYear()

  if (startMonth !== window.startMonth || endMonth !== window.endMonth) {
    return {
      valid: false,
      error: `${window.canonical} must start in ${MONTH_LABELS[window.startMonth - 1]} and end in ${MONTH_LABELS[window.endMonth - 1]}.`,
    }
  }

  const expectedStartYear = window.expectedStartYearFromAcademicYear === 1 ? bounds.startYear : bounds.endYear
  const expectedEndYear = window.expectedEndYearFromAcademicYear === 1 ? bounds.startYear : bounds.endYear

  if (startYear !== expectedStartYear || endYear !== expectedEndYear) {
    return {
      valid: false,
      error: `${window.canonical} dates must align with academic year ${bounds.startYear}-${bounds.endYear}.`,
    }
  }

  if (startDate.getTime() > endDate.getTime()) {
    return { valid: false, error: 'start_date must be earlier than or equal to end_date.' }
  }

  return { valid: true }
}
