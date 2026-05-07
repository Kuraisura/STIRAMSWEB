import type { AcademicTerm } from './types/database.types'

/**
 * Get the current active academic term
 * @returns The active academic term or null if none is active
 */
export async function getCurrentAcademicTerm(): Promise<AcademicTerm | null> {
  try {
    const res = await fetch('/api/academic-terms')
    const json = await res.json()
    
    if (json.success && json.data) {
      const activeTerm = json.data.find((term: AcademicTerm) => term.is_active)
      return activeTerm || null
    }
    
    return null
  } catch (error) {
    console.error('[AcademicTerm] Error fetching current term:', error)
    return null
  }
}

/**
 * Get all academic terms
 * @returns Array of all academic terms
 */
export async function getAllAcademicTerms(): Promise<AcademicTerm[]> {
  try {
    const res = await fetch('/api/academic-terms')
    const json = await res.json()
    
    if (json.success && json.data) {
      return json.data
    }
    
    return []
  } catch (error) {
    console.error('[AcademicTerm] Error fetching all terms:', error)
    return []
  }
}

/**
 * Check if a date falls within an academic term
 * @param date - The date to check
 * @param term - The academic term
 * @returns True if the date is within the term
 */
export function isDateInTerm(date: Date | string, term: AcademicTerm): boolean {
  const checkDate = typeof date === 'string' ? new Date(date) : date
  const startDate = new Date(term.start_date)
  const endDate = new Date(term.end_date)
  
  return checkDate >= startDate && checkDate <= endDate
}

/**
 * Get the academic term for a specific date
 * @param date - The date to check
 * @param terms - Array of academic terms
 * @returns The academic term that contains the date, or null if none found
 */
export function getTermForDate(date: Date | string, terms: AcademicTerm[]): AcademicTerm | null {
  for (const term of terms) {
    if (isDateInTerm(date, term)) {
      return term
    }
  }
  return null
}

/**
 * Format academic term display name
 * @param term - The academic term
 * @returns Formatted string like "2025-2026 1st Term"
 */
export function formatTermName(term: AcademicTerm): string {
  return `${term.academic_year} ${term.term_name}`
}

/**
 * Get term display with date range
 * @param term - The academic term
 * @returns Formatted string with dates
 */
export function formatTermWithDates(term: AcademicTerm): string {
  const startDate = new Date(term.start_date).toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric' 
  })
  const endDate = new Date(term.end_date).toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric' 
  })
  
  return `${formatTermName(term)} (${startDate} - ${endDate})`
}
