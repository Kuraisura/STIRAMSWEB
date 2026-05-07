/**
 * CRITICAL: Centralized Manila Timezone Utilities
 * All date/time operations in the project MUST use these functions
 * to ensure consistent Manila timezone handling across:
 * - Excel exports (faculty timesheets, DTR)
 * - Database queries
 * - Date displays
 * - Time formatting
 */

import { formatInTimeZone } from 'date-fns-tz'

// Manila timezone constant - use this everywhere
export const MANILA_TZ = 'Asia/Manila'
export const PH_TZ = 'Asia/Manila' // Alias for compatibility

/**
 * Convert a date to Manila timezone ISO string (YYYY-MM-DD)
 * Use this for all date comparisons and storage
 */
export function toManilaDate(date: Date | string): string {
  if (typeof date === 'string') {
    // If it's already a date string, ensure it's treated as Manila time
    const d = new Date(date + (date.includes('T') ? '' : 'T00:00:00+08:00'))
    return formatInTimeZone(d, MANILA_TZ, 'yyyy-MM-dd')
  }
  return formatInTimeZone(date, MANILA_TZ, 'yyyy-MM-dd')
}

/**
 * Convert a date to Manila timezone ISO string with time (YYYY-MM-DDTHH:mm:ss)
 */
export function toManilaDateTime(date: Date | string): string {
  if (typeof date === 'string') {
    const d = new Date(date.includes('T') ? date : date + 'T00:00:00+08:00')
    return formatInTimeZone(d, MANILA_TZ, 'yyyy-MM-dd\'T\'HH:mm:ss')
  }
  return formatInTimeZone(date, MANILA_TZ, 'yyyy-MM-dd\'T\'HH:mm:ss')
}

/**
 * Format time in Manila timezone (HH:mm:ss)
 * Use this for all time displays and Excel exports
 */
export function toManilaTime(isoString: string | null | undefined): string | null {
  if (!isoString) return null
  try {
    const dt = new Date(isoString)
    return formatInTimeZone(dt, MANILA_TZ, 'HH:mm:ss')
  } catch {
    return null
  }
}

/**
 * Format time in 12-hour format (h:mm AM/PM) in Manila timezone
 */
export function toManilaTime12h(isoString: string | null | undefined): string | null {
  if (!isoString) return null
  try {
    const dt = new Date(isoString)
    return formatInTimeZone(dt, MANILA_TZ, 'h:mm a').replace(/\s?am/i, ' AM').replace(/\s?pm/i, ' PM')
  } catch {
    return null
  }
}

/**
 * Format time in 24-hour format (HH:mm) in Manila timezone
 */
export function toManilaTime24h(isoString: string | null | undefined): string | null {
  if (!isoString) return null
  try {
    const dt = new Date(isoString)
    return formatInTimeZone(dt, MANILA_TZ, 'HH:mm')
  } catch {
    return null
  }
}

/**
 * Create a Date object representing a specific date in Manila timezone
 * Use this to avoid timezone shifting issues
 */
export function createManilaDate(year: number, month: number, day: number, hour: number = 0, minute: number = 0, second: number = 0): Date {
  // Create date string in Manila timezone format
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}+08:00`
  return new Date(dateStr)
}

/**
 * Get current date in Manila timezone (YYYY-MM-DD)
 */
export function getManilaToday(): string {
  return formatInTimeZone(new Date(), MANILA_TZ, 'yyyy-MM-dd')
}

/**
 * Get current date/time in Manila timezone
 * Safe for client-side use - returns a Date object representing Manila time
 */
export function getManilaNow(): Date {
  // Create a date string in Manila timezone and parse it
  const manilaDateStr = formatInTimeZone(new Date(), MANILA_TZ, 'yyyy-MM-dd\'T\'HH:mm:ss')
  return new Date(manilaDateStr + '+08:00')
}

/**
 * Parse a date string and ensure it's interpreted in Manila timezone
 * Client-safe version - uses direct date parsing with Manila timezone offset
 */
export function parseManilaDate(dateStr: string): Date {
  try {
    // If date string doesn't have time, add midnight Manila time
    if (!dateStr.includes('T')) {
      // Parse as Manila timezone by adding +08:00 offset
      return new Date(dateStr + 'T00:00:00+08:00')
    }
    // If it has time but no timezone, assume Manila timezone
    if (!dateStr.includes('+') && !dateStr.includes('Z') && !dateStr.includes('-', 10)) {
      // Add Manila timezone offset
      return new Date(dateStr + '+08:00')
    }
    // If it already has timezone info, use as-is
    return new Date(dateStr)
  } catch (error) {
    console.error('parseManilaDate error:', error, 'dateStr:', dateStr)
    // Fallback to simple date parsing
    return new Date(dateStr)
  }
}

/**
 * Format date for display (e.g., "October 26, 2025")
 * Safe for client-side use - uses formatInTimeZone instead of utcToZonedTime
 */
export function formatManilaDateLong(date: Date | string): string {
  try {
    // Parse date safely - use direct parsing with Manila offset if string
    let d: Date
    if (typeof date === 'string') {
      if (!date.includes('T')) {
        d = new Date(date + 'T00:00:00+08:00')
      } else if (!date.includes('+') && !date.includes('Z')) {
        d = new Date(date + '+08:00')
      } else {
        d = new Date(date)
      }
    } else {
      d = date
    }
    
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    // Use formatInTimeZone for client-side compatibility
    const monthIdx = parseInt(formatInTimeZone(d, MANILA_TZ, 'M'), 10) - 1
    const day = parseInt(formatInTimeZone(d, MANILA_TZ, 'd'), 10)
    const year = parseInt(formatInTimeZone(d, MANILA_TZ, 'yyyy'), 10)
    return `${months[monthIdx]} ${day}, ${year}`
  } catch (error) {
    console.error('formatManilaDateLong error:', error, 'date:', date)
    // Fallback to simple formatting
    const d = typeof date === 'string' ? new Date(date) : date
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
  }
}

/**
 * Format date for display (e.g., "Oct 26, 2025")
 * Safe for client-side use - uses formatInTimeZone instead of utcToZonedTime
 */
export function formatManilaDateShort(date: Date | string): string {
  try {
    // Parse date safely - use direct parsing with Manila offset if string
    let d: Date
    if (typeof date === 'string') {
      if (!date.includes('T')) {
        d = new Date(date + 'T00:00:00+08:00')
      } else if (!date.includes('+') && !date.includes('Z')) {
        d = new Date(date + '+08:00')
      } else {
        d = new Date(date)
      }
    } else {
      d = date
    }
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    // Use formatInTimeZone for client-side compatibility
    const monthIdx = parseInt(formatInTimeZone(d, MANILA_TZ, 'M'), 10) - 1
    const day = parseInt(formatInTimeZone(d, MANILA_TZ, 'd'), 10)
    const year = parseInt(formatInTimeZone(d, MANILA_TZ, 'yyyy'), 10)
    return `${months[monthIdx]} ${day}, ${year}`
  } catch (error) {
    console.error('formatManilaDateShort error:', error, 'date:', date)
    // Fallback to simple formatting
    const d = typeof date === 'string' ? new Date(date) : date
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
  }
}

/**
 * Generate all days in a date range (inclusive) in Manila timezone
 * Safe for server-side use - handles date parsing more robustly
 */
export function getDaysInRange(start: string, end: string): string[] {
  try {
    // Parse dates more safely - use simple date string parsing
    const startDate = new Date(start + 'T00:00:00+08:00')
    const endDate = new Date(end + 'T23:59:59+08:00')
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
      return []
    }
    
    const days: string[] = []
    const cursor = new Date(startDate)
    
    while (cursor <= endDate) {
      // Format date in Manila timezone
      const dateStr = formatInTimeZone(cursor, MANILA_TZ, 'yyyy-MM-dd')
      days.push(dateStr)
      cursor.setDate(cursor.getDate() + 1)
    }
    
    return days
  } catch (error) {
    console.error('getDaysInRange error:', error)
    return []
  }
}

/**
 * Convert time string (HH:mm:ss) to 12-hour format
 */
export function formatTime12h(timeStr: string | null | undefined, timeFormat: '12h' | '24h' = '12h'): string {
  if (!timeStr) return ''
  if (timeFormat === '24h') {
    const [h, m] = timeStr.split(':').map(Number)
    return `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`
  }
  const [h, m] = timeStr.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  const hh = (h % 12) || 12
  return `${hh}:${String(m || 0).padStart(2, '0')} ${ap}`
}

/**
 * Get start and end of day in Manila timezone for a given date
 */
export function getManilaDayBounds(dateStr: string): { start: string; end: string } {
  try {
    // Parse dates with Manila timezone offset directly (client-safe)
    const start = new Date(dateStr + 'T00:00:00+08:00')
    const end = new Date(dateStr + 'T23:59:59.999+08:00')
    return {
      start: start.toISOString(),
      end: end.toISOString()
    }
  } catch (error) {
    console.error('getManilaDayBounds error:', error, 'dateStr:', dateStr)
    // Fallback
    const start = new Date(dateStr + 'T00:00:00+08:00')
    const end = new Date(dateStr + 'T23:59:59.999+08:00')
    return {
      start: start.toISOString(),
      end: end.toISOString()
    }
  }
}

