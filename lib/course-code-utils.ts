/**
 * Course Code Standardization Utility
 * 
 * Provides functions to standardize and validate course codes across the system.
 * Ensures consistent formatting and proper validation.
 */

export type CourseCodeFormat = 'standard' | 'legacy' | 'invalid'

export interface CourseCodeValidation {
  isValid: boolean
  format: CourseCodeFormat
  standardized: string
  original: string
  issues: string[]
}

/**
 * Standard course code format: XXXX####
 * - 4 letters (department/subject code) in UPPERCASE
 * - 4 digits (course number)
 * Example: ACCT1001, GEDC1002, NSTP1008
 */
const STANDARD_PATTERN = /^[A-Z]{4}\d{4}$/

/**
 * Legacy formats we might encounter:
 * - Lowercase letters
 * - Mixed case
 * - Extra spaces
 * - Hyphens or underscores
 */
const LEGACY_PATTERNS = [
  /^[a-zA-Z]{4}\d{4}$/,  // Same format but not uppercase
  /^[A-Z]{4}-\d{4}$/,    // With hyphen
  /^[A-Z]{4}_\d{4}$/,    // With underscore
  /^[A-Z]{4}\s\d{4}$/,   // With space
]

/**
 * Standardize a course code to the standard format
 */
export function standardizeCourseCode(code: string | null | undefined): string {
  if (!code) return ''
  
  // Remove leading/trailing whitespace
  let cleaned = code.trim()
  
  // Remove any hyphens, underscores, or spaces
  cleaned = cleaned.replace(/[-_\s]/g, '')
  
  // Convert to uppercase
  cleaned = cleaned.toUpperCase()
  
  // Ensure it matches the standard pattern
  if (STANDARD_PATTERN.test(cleaned)) {
    return cleaned
  }
  
  // If it doesn't match, return original (validation will catch it)
  return cleaned
}

/**
 * Validate a course code and provide detailed feedback
 */
export function validateCourseCode(code: string | null | undefined): CourseCodeValidation {
  const result: CourseCodeValidation = {
    isValid: false,
    format: 'invalid',
    standardized: '',
    original: code || '',
    issues: []
  }
  
  if (!code || code.trim() === '') {
    result.issues.push('Course code is empty')
    return result
  }
  
  const standardized = standardizeCourseCode(code)
  result.standardized = standardized
  
  // Check if it matches standard format
  if (STANDARD_PATTERN.test(standardized)) {
    result.isValid = true
    result.format = code === standardized ? 'standard' : 'legacy'
    return result
  }
  
  // Analyze what's wrong
  if (standardized.length !== 8) {
    result.issues.push(`Invalid length: ${standardized.length} (expected 8)`)
  }
  
  const letterPart = standardized.substring(0, 4)
  const numberPart = standardized.substring(4)
  
  if (!/^[A-Z]{4}$/.test(letterPart)) {
    result.issues.push(`Invalid letter part: "${letterPart}" (expected 4 uppercase letters)`)
  }
  
  if (!/^\d{4}$/.test(numberPart)) {
    result.issues.push(`Invalid number part: "${numberPart}" (expected 4 digits)`)
  }
  
  return result
}

/**
 * Batch standardize course codes from database
 * Returns a map of original -> standardized codes
 */
export function batchStandardizeCourses(codes: (string | null | undefined)[]): Map<string, string> {
  const result = new Map<string, string>()
  
  for (const code of codes) {
    if (code && code.trim()) {
      const standardized = standardizeCourseCode(code)
      if (standardized && standardized !== code) {
        result.set(code, standardized)
      }
    }
  }
  
  return result
}

/**
 * Extract department code from course code
 * Example: ACCT1001 -> ACCT
 */
export function getDepartmentCode(code: string): string {
  const standardized = standardizeCourseCode(code)
  return standardized.substring(0, 4)
}

/**
 * Extract course number from course code
 * Example: ACCT1001 -> 1001
 */
export function getCourseNumber(code: string): string {
  const standardized = standardizeCourseCode(code)
  return standardized.substring(4)
}

/**
 * Get year level from course number (first digit)
 * Example: ACCT1001 -> 1 (First year)
 */
export function getYearLevel(code: string): number {
  const courseNumber = getCourseNumber(code)
  if (courseNumber.length > 0) {
    const yearDigit = parseInt(courseNumber[0], 10)
    return isNaN(yearDigit) ? 0 : yearDigit
  }
  return 0
}

/**
 * Format course code for display with consistent spacing
 * Example: ACCT1001 -> ACCT 1001
 */
export function formatCourseCodeDisplay(code: string): string {
  const standardized = standardizeCourseCode(code)
  if (standardized.length === 8) {
    return `${standardized.substring(0, 4)} ${standardized.substring(4)}`
  }
  return standardized
}

/**
 * Compare two course codes (useful for sorting)
 */
export function compareCourses(a: string, b: string): number {
  const aStd = standardizeCourseCode(a)
  const bStd = standardizeCourseCode(b)
  return aStd.localeCompare(bStd)
}

/**
 * Check if two course codes are equivalent (after standardization)
 */
export function areCoursesEquivalent(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return standardizeCourseCode(a) === standardizeCourseCode(b)
}

/**
 * Generate SQL update statements for course code standardization
 * Useful for batch updates in the database
 */
export function generateStandardizationSQL(tableName: string, columnName: string, codes: Map<string, string>): string[] {
  const statements: string[] = []
  
  for (const [original, standardized] of codes.entries()) {
    statements.push(
      `UPDATE ${tableName} SET ${columnName} = '${standardized}' WHERE ${columnName} = '${original}';`
    )
  }
  
  return statements
}

/**
 * Common department codes used in STI
 */
export const COMMON_DEPARTMENTS = {
  ACCT: 'Accounting',
  GEDC: 'General Education',
  STIC: 'STI Core',
  NSTP: 'National Service Training Program',
  PHED: 'Physical Education',
  COMP: 'Computer Science',
  ENTR: 'Entrepreneurship',
  MGMT: 'Management',
  MATH: 'Mathematics',
  ENGL: 'English',
  FILI: 'Filipino',
  HIST: 'History',
  SCIE: 'Science',
  ARTS: 'Arts',
  PSYC: 'Psychology',
  SOCI: 'Sociology',
} as const

/**
 * Get department name from course code
 */
export function getDepartmentName(code: string): string {
  const deptCode = getDepartmentCode(code) as keyof typeof COMMON_DEPARTMENTS
  return COMMON_DEPARTMENTS[deptCode] || 'Unknown Department'
}
