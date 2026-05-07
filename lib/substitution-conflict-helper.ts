export function parseTimeToMinutes(value: string): number | null {
  const raw = String(value || '').trim()
  if (!raw) return null

  const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i)
  if (ampmMatch) {
    let hour = Number(ampmMatch[1])
    const minute = Number(ampmMatch[2])
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null
    const meridiem = ampmMatch[4].toUpperCase()
    if (hour === 12) hour = 0
    if (meridiem === 'PM') hour += 12
    return hour * 60 + minute
  }

  const hmsMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (hmsMatch) {
    const hour = Number(hmsMatch[1])
    const minute = Number(hmsMatch[2])
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
    return hour * 60 + minute
  }

  return null
}

export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

export function normalizeDayOfWeekInput(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null

  if (typeof input === 'string' && input.trim() === '') return null

  const asNumber = Number(input)
  if (Number.isFinite(asNumber)) {
    if (asNumber >= 1 && asNumber <= 7) return asNumber
    if (asNumber === 0) return 7
  }

  const normalized = String(input).trim().toLowerCase()
  if (!normalized) return null

  const dayMap: Record<string, number> = {
    sunday: 7,
    sun: 7,
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
  }

  return dayMap[normalized] ?? null
}

export function getIsoDayOfWeekFromDate(dateStr: string): number | null {
  const raw = String(dateStr || '').trim()
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null

  const d = new Date(`${raw}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const jsDay = d.getDay() // 0..6 (Sun..Sat)
  return jsDay === 0 ? 7 : jsDay
}
