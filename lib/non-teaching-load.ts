export interface MinuteSlot {
  start: number
  end: number
}

export function mergeMinuteSlots(slots: MinuteSlot[]): MinuteSlot[] {
  return normalizeMinuteSlots(slots)
}

export function parseClockToMinutes(timeStr?: string | null): number | null {
  if (!timeStr) return null
  const raw = String(timeStr).trim()
  const match = raw.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null

  return (hours * 60) + minutes
}

export function parseClockToMinutesFlexible(timeStr?: string | null): number | null {
  if (!timeStr) return null
  const raw = String(timeStr).trim()
  if (!raw) return null

  let candidate = raw
  if (candidate.includes('T')) {
    candidate = candidate.split('T')[1] || ''
  }
  if (candidate.includes(' ')) {
    candidate = candidate.split(' ')[1] || candidate
  }
  candidate = candidate.replace('Z', '')
  candidate = candidate.split('.')[0] || candidate

  return parseClockToMinutes(candidate)
}

export function toMinuteSlot(startTime?: string | null, endTime?: string | null): MinuteSlot | null {
  const start = parseClockToMinutes(startTime)
  const end = parseClockToMinutes(endTime)
  if (start === null || end === null) return null
  if (end <= start) return null
  return { start, end }
}

export function normalizeMinuteSlots(slots: MinuteSlot[]): MinuteSlot[] {
  if (!slots.length) return []

  const sorted = [...slots]
    .filter((slot) => Number.isFinite(slot.start) && Number.isFinite(slot.end) && slot.end > slot.start)
    .sort((a, b) => a.start - b.start)

  if (!sorted.length) return []

  const merged: MinuteSlot[] = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const last = merged[merged.length - 1]

    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end)
      continue
    }

    merged.push({ ...current })
  }

  return merged
}

export function calculateNonTeachingGapMinutes(slots: MinuteSlot[]): number {
  const merged = normalizeMinuteSlots(slots)
  if (merged.length < 2) return 0

  let totalGapMinutes = 0
  for (let i = 0; i < merged.length - 1; i++) {
    const gap = merged[i + 1].start - merged[i].end
    if (gap > 0) totalGapMinutes += gap
  }

  return totalGapMinutes
}

export function calculateNonTeachingMinutesWithAttendance(
  slots: MinuteSlot[],
  actualIn?: string | null,
  actualOut?: string | null
): number {
  const merged = normalizeMinuteSlots(slots)
  if (!merged.length) return 0

  let totalMinutes = calculateNonTeachingGapMinutes(merged)
  const bounds = getExpectedScheduleBounds(merged)
  if (!bounds) return totalMinutes

  const inMinutes = parseClockToMinutesFlexible(actualIn)
  if (inMinutes !== null && inMinutes < bounds.start) {
    totalMinutes += bounds.start - inMinutes
  }

  const outMinutes = parseClockToMinutesFlexible(actualOut)
  if (outMinutes !== null && outMinutes > bounds.end) {
    totalMinutes += outMinutes - bounds.end
  }

  return totalMinutes
}

export function getExpectedScheduleBounds(slots: MinuteSlot[]): { start: number; end: number } | null {
  const merged = normalizeMinuteSlots(slots)
  if (!merged.length) return null
  return {
    start: merged[0].start,
    end: merged[merged.length - 1].end,
  }
}

export function subtractMinuteSlots(base: MinuteSlot[], removals: MinuteSlot[]): MinuteSlot[] {
  if (!base.length) return []
  if (!removals.length) return normalizeMinuteSlots(base)

  let result = normalizeMinuteSlots(base)
  const mergedRemovals = normalizeMinuteSlots(removals)

  for (const removal of mergedRemovals) {
    const next: MinuteSlot[] = []
    for (const slot of result) {
      if (removal.end <= slot.start || removal.start >= slot.end) {
        next.push(slot)
        continue
      }

      if (removal.start > slot.start) {
        next.push({ start: slot.start, end: removal.start })
      }
      if (removal.end < slot.end) {
        next.push({ start: removal.end, end: slot.end })
      }
    }
    result = next
  }

  return normalizeMinuteSlots(result)
}

export function minutesToDurationLabel(totalMinutes: number): string {
  const minutes = Math.max(0, Math.floor(totalMinutes))
  const hoursPart = Math.floor(minutes / 60)
  const minsPart = minutes % 60
  if (hoursPart === 0) return `${minsPart}m`
  if (minsPart === 0) return `${hoursPart}h`
  return `${hoursPart}h ${minsPart}m`
}

export function minutesToClock12h(totalMinutes: number): string {
  const normalized = ((Math.floor(totalMinutes) % (24 * 60)) + (24 * 60)) % (24 * 60)
  const hour24 = Math.floor(normalized / 60)
  const mins = normalized % 60
  const suffix = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = (hour24 % 12) || 12
  return `${hour12}:${String(mins).padStart(2, '0')} ${suffix}`
}