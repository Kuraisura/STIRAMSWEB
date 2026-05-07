import { formatInTimeZone } from 'date-fns-tz'
import { MANILA_TZ } from '@/lib/timezone-utils'
import {
  buildManilaDateTime,
  getScheduleWindowForEmployeeDate,
  normalizeScheduleType,
  toManilaDateTimeOrNull,
} from '@/lib/schedule-window-helper'

type ReplayLogType = 'IN' | 'OUT'

type ResolveReplayLogTimeParams = {
  employeeId: number
  dateStr: string
  logType: ReplayLogType
  requestedTime?: string | null
  originalTime?: string | null
  scheduleId?: number | null
  scheduleType?: string | null
  preferScheduleWindow?: boolean
  fallbackIn?: string
  fallbackOut?: string
}

export function getManilaDatePart(value: string | null | undefined): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null

  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  if (direct) return direct[1]

  try {
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) return null
    return formatInTimeZone(parsed, MANILA_TZ, 'yyyy-MM-dd')
  } catch {
    return null
  }
}

function extractTimePartFromIso(value: string | null | undefined): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null

  const m = raw.match(/T(\d{2}:\d{2}:\d{2})/)
  if (!m) return null
  return m[1]
}

export async function resolveReplayLogTime(params: ResolveReplayLogTimeParams): Promise<{ logTimeIso: string; source: string }> {
  const {
    employeeId,
    dateStr,
    logType,
    requestedTime,
    originalTime,
    scheduleId,
    scheduleType,
    preferScheduleWindow = true,
    fallbackIn = '08:00:00',
    fallbackOut = '17:00:00',
  } = params

  if (preferScheduleWindow) {
    const normalizedScheduleId = Number(scheduleId)
    const window = await getScheduleWindowForEmployeeDate(employeeId, dateStr, {
      scheduleId: Number.isFinite(normalizedScheduleId) ? normalizedScheduleId : null,
      scheduleType: normalizeScheduleType(scheduleType),
    })

    const scheduleTime = logType === 'IN' ? window?.timeIn : window?.timeOut
    if (scheduleTime) {
      return { logTimeIso: buildManilaDateTime(dateStr, scheduleTime), source: 'schedule-window' }
    }
  }

  const requestedIso = toManilaDateTimeOrNull(requestedTime)
  const requestedTimePart = extractTimePartFromIso(requestedIso)
  if (requestedTimePart) {
    return { logTimeIso: buildManilaDateTime(dateStr, requestedTimePart), source: 'requested-time' }
  }

  const originalIso = toManilaDateTimeOrNull(originalTime)
  const originalTimePart = extractTimePartFromIso(originalIso)
  if (originalTimePart) {
    return { logTimeIso: buildManilaDateTime(dateStr, originalTimePart), source: 'original-time' }
  }

  return {
    logTimeIso: buildManilaDateTime(dateStr, logType === 'IN' ? fallbackIn : fallbackOut),
    source: 'fallback-default',
  }
}
