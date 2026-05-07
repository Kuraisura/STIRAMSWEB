/**
 * Holiday Calendar API Queries
 * Handles date range queries for the holiday_calendar table
 */

import type { HolidayCalendar } from './types/database.types'

const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') return ''
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    'http://localhost:3000'
  )
}

const parseApiJson = async (res: Response) => {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((body as any)?.error || `Request failed (${res.status})`)
  }
  return body
}

const fetchAllHolidays = async (): Promise<HolidayCalendar[]> => {
  const res = await fetch(`${getApiBaseUrl()}/api/holidays`, { cache: 'no-store' })
  const payload = await parseApiJson(res)
  return Array.isArray(payload) ? payload : []
}

const dateInRange = (value: string, startDate: string, endDate: string) => value >= startDate && value <= endDate

/**
 * Query holidays within a specific date range
 */
export async function getHolidaysByDateRange(
  startDate: string,
  endDate: string
): Promise<{ data: HolidayCalendar[] | null; error: any }> {
  try {
    const rows = await fetchAllHolidays()
    const data = rows
      .filter((row: any) => dateInRange(String(row.date || ''), startDate, endDate))
      .sort((a: any, b: any) => String(a.date || '').localeCompare(String(b.date || '')))

    console.log(`[getHolidaysByDateRange] Found ${data.length} holidays between ${startDate} and ${endDate}`)
    return { data, error: null }
  } catch (error) {
    console.error('[getHolidaysByDateRange] Exception:', error)
    return { data: null, error }
  }
}

/**
 * Check if a specific date falls within any holiday date range
 */
export async function checkIfDateIsHoliday(
  date: string
): Promise<{ data: HolidayCalendar | null; error: any }> {
  try {
    const rows = await fetchAllHolidays()
    const data = rows.find((row: any) => String(row.date || '') === date) || null
    return { data, error: null }
  } catch (error) {
    console.error('[checkIfDateIsHoliday] Exception:', error)
    return { data: null, error }
  }
}

/**
 * Insert a holiday with a date range (creates multiple date rows)
 */
export async function insertHolidayDateRange(
  startDate: string,
  endDate: string,
  name: string,
  type: 'holiday' | 'suspended_asynchronous' | 'suspended_synchronous' | 'online_class',
  description?: string,
  affects_attendance: boolean = true,
  reporting_only: boolean = false
): Promise<{ success: boolean; data: HolidayCalendar[] | null; error: any }> {
  try {
    const dates: string[] = []
    const start = new Date(startDate)
    const end = new Date(endDate)

    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      dates.push(date.toISOString().split('T')[0])
    }

    const created: HolidayCalendar[] = []
    for (const holidayDate of dates) {
      const res = await fetch(`${getApiBaseUrl()}/api/holidays`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: holidayDate,
          start_date: holidayDate,
          end_date: holidayDate,
          type,
          name,
          description,
          affects_attendance,
          reporting_only,
        }),
      })
      const payload = await parseApiJson(res)
      if (payload?.data) created.push(payload.data as HolidayCalendar)
    }

    console.log(`[insertHolidayDateRange] Created ${dates.length} holiday entries from ${startDate} to ${endDate}`)
    return { success: true, data: created, error: null }
  } catch (error) {
    console.error('[insertHolidayDateRange] Exception:', error)
    return { success: false, data: null, error }
  }
}

/**
 * Get all holidays in a specific month
 */
export async function getHolidaysByMonth(
  year: number,
  month: number
): Promise<{ data: HolidayCalendar[] | null; error: any }> {
  try {
    const firstDay = new Date(year, month - 1, 1).toISOString().split('T')[0]
    const lastDay = new Date(year, month, 0).toISOString().split('T')[0]
    return await getHolidaysByDateRange(firstDay, lastDay)
  } catch (error) {
    console.error('[getHolidaysByMonth] Exception:', error)
    return { data: null, error }
  }
}

/**
 * Delete all holidays within a date range
 */
export async function deleteHolidaysByDateRange(
  startDate: string,
  endDate: string
): Promise<{ success: boolean; error: any }> {
  try {
    const rows = await fetchAllHolidays()
    const targets = rows.filter((row: any) => dateInRange(String(row.date || ''), startDate, endDate))

    for (const row of targets as any[]) {
      if (!row?.id) continue
      const res = await fetch(`${getApiBaseUrl()}/api/holidays?id=${row.id}`, { method: 'DELETE' })
      await parseApiJson(res)
    }

    console.log(`[deleteHolidaysByDateRange] Deleted holidays from ${startDate} to ${endDate}`)
    return { success: true, error: null }
  } catch (error) {
    console.error('[deleteHolidaysByDateRange] Exception:', error)
    return { success: false, error }
  }
}

/**
 * Get holidays by type within a date range
 */
export async function getHolidaysByTypeAndDateRange(
  startDate: string,
  endDate: string,
  type: 'holiday' | 'suspended_asynchronous' | 'suspended_synchronous' | 'online_class'
): Promise<{ data: HolidayCalendar[] | null; error: any }> {
  try {
    const rows = await fetchAllHolidays()
    const data = rows
      .filter((row: any) => dateInRange(String(row.date || ''), startDate, endDate) && row.type === type)
      .sort((a: any, b: any) => String(a.date || '').localeCompare(String(b.date || '')))

    return { data, error: null }
  } catch (error) {
    console.error('[getHolidaysByTypeAndDateRange] Exception:', error)
    return { data: null, error }
  }
}

/**
 * Update all holidays within a date range
 */
export async function updateHolidaysByDateRange(
  startDate: string,
  endDate: string,
  updates: Partial<Omit<HolidayCalendar, 'id' | 'date' | 'created_at'>>
): Promise<{ success: boolean; error: any }> {
  try {
    const rows = await fetchAllHolidays()
    const targets = rows.filter((row: any) => dateInRange(String(row.date || ''), startDate, endDate))

    for (const row of targets as any[]) {
      if (!row?.id) continue
      const res = await fetch(`${getApiBaseUrl()}/api/holidays`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, ...updates }),
      })
      await parseApiJson(res)
    }

    console.log(`[updateHolidaysByDateRange] Updated holidays from ${startDate} to ${endDate}`)
    return { success: true, error: null }
  } catch (error) {
    console.error('[updateHolidaysByDateRange] Exception:', error)
    return { success: false, error }
  }
}

/**
 * Count holidays within a date range
 */
export async function countHolidaysInDateRange(
  startDate: string,
  endDate: string
): Promise<{ count: number; error: any }> {
  try {
    const rows = await fetchAllHolidays()
    const count = rows.filter((row: any) => dateInRange(String(row.date || ''), startDate, endDate)).length
    return { count, error: null }
  } catch (error) {
    console.error('[countHolidaysInDateRange] Exception:', error)
    return { count: 0, error }
  }
}
