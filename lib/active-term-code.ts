import { dbQuery } from '@/lib/db'

export type ScheduleTermCode = '1st_term' | '2nd_term' | 'summer'

export type ActiveTermContext = {
  termId: number | null
  termCode: ScheduleTermCode | null
  startDate: string | null
  endDate: string | null
}

let cache: { value: ScheduleTermCode | null; ts: number } | null = null
let termIdCache: { value: number | null; ts: number } | null = null
let contextCache: { value: ActiveTermContext; ts: number } | null = null

function mapTermNameToCode(termName: unknown): ScheduleTermCode | null {
  const normalized = String(termName || '').trim().toLowerCase()
  if (!normalized) return null

  if (normalized.includes('1st') || normalized.includes('first')) return '1st_term'
  if (normalized.includes('2nd') || normalized.includes('second')) return '2nd_term'
  if (normalized.includes('summer')) return 'summer'
  return null
}

export function normalizeTermCode(termRaw: unknown): ScheduleTermCode | null {
  const normalized = String(termRaw || '').trim().toLowerCase()
  if (normalized === '1st_term') return '1st_term'
  if (normalized === '2nd_term') return '2nd_term'
  if (normalized === 'summer') return 'summer'
  return null
}

export async function getActiveTermCode(ttlMs = 60_000): Promise<ScheduleTermCode | null> {
  const now = Date.now()
  if (cache && now - cache.ts < ttlMs) {
    return cache.value
  }

  try {
    const rows = await dbQuery<{ term_name: string | null }>(
      `SELECT term_name
         FROM academic_terms
        WHERE is_active = TRUE
        ORDER BY start_date DESC, id DESC
        LIMIT 1`
    )
    const value = mapTermNameToCode(rows?.[0]?.term_name)
    cache = { value, ts: now }
    return value
  } catch {
    cache = { value: null, ts: now }
    return null
  }
}

export async function getActiveTermId(ttlMs = 60_000): Promise<number | null> {
  const now = Date.now()
  if (termIdCache && now - termIdCache.ts < ttlMs) {
    return termIdCache.value
  }

  try {
    const rows = await dbQuery<{ id: number | null }>(
      `SELECT id
         FROM academic_terms
        WHERE is_active = TRUE
        ORDER BY start_date DESC, id DESC
        LIMIT 1`
    )

    const parsed = Number(rows?.[0]?.id)
    const value = Number.isFinite(parsed) && parsed > 0 ? parsed : null
    termIdCache = { value, ts: now }
    return value
  } catch {
    termIdCache = { value: null, ts: now }
    return null
  }
}

export async function getActiveTermContext(ttlMs = 60_000): Promise<ActiveTermContext> {
  const now = Date.now()
  if (contextCache && now - contextCache.ts < ttlMs) {
    return contextCache.value
  }

  try {
    const rows = await dbQuery<{ id: number | null; term_name: string | null; start_date: string | null; end_date: string | null }>(
      `SELECT id, term_name, start_date::text, end_date::text
         FROM academic_terms
        WHERE is_active = TRUE
        ORDER BY start_date DESC, id DESC
        LIMIT 1`
    )

    const row = rows?.[0]
    const parsedId = Number(row?.id)
    const value: ActiveTermContext = {
      termId: Number.isFinite(parsedId) && parsedId > 0 ? parsedId : null,
      termCode: mapTermNameToCode(row?.term_name),
      startDate: row?.start_date ? String(row.start_date).slice(0, 10) : null,
      endDate: row?.end_date ? String(row.end_date).slice(0, 10) : null,
    }

    contextCache = { value, ts: now }
    cache = { value: value.termCode, ts: now }
    termIdCache = { value: value.termId, ts: now }
    return value
  } catch {
    const value: ActiveTermContext = { termId: null, termCode: null, startDate: null, endDate: null }
    contextCache = { value, ts: now }
    cache = { value: null, ts: now }
    termIdCache = { value: null, ts: now }
    return value
  }
}
