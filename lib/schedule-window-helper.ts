import { formatInTimeZone } from 'date-fns-tz'
import { MANILA_TZ } from '@/lib/timezone-utils'
import { dbQuery } from '@/lib/db'
import { getActiveTermCode } from '@/lib/active-term-code'

export type LinkedScheduleRef = {
  scheduleId: number | null
  scheduleType: 'teaching' | 'exam' | null
}

function toMinutes(hhmmss: string): number {
  const [hh, mm] = hhmmss.split(':').slice(0, 2).map(Number)
  return (hh || 0) * 60 + (mm || 0)
}

function toHHMMSS(value: string | null | undefined): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null

  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i)
  if (!match) return null

  let hour = Number(match[1])
  const minute = Number(match[2])
  const second = Number(match[3] || '0')
  const ampm = String(match[4] || '').toUpperCase()

  if (minute < 0 || minute > 59 || second < 0 || second > 59) return null

  if (ampm === 'AM' || ampm === 'PM') {
    if (hour < 1 || hour > 12) return null
    if (hour === 12) hour = ampm === 'AM' ? 0 : 12
    else if (ampm === 'PM') hour += 12
  } else {
    if (hour < 0 || hour > 23) return null
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
}

function toDateOnlyManila(value: string | null | undefined): string | null {
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

function wasScheduleActiveOnDate(createdAt: string | null | undefined, targetDate: string): boolean {
  const createdDate = toDateOnlyManila(createdAt)
  if (!createdDate) return true
  return createdDate <= targetDate
}

export function normalizeScheduleType(value: unknown): 'teaching' | 'exam' | null {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'teaching' || normalized === 'exam') return normalized
  return null
}

export function buildManilaDateTime(dateStr: string, hhmmss: string): string {
  const safeTime = toHHMMSS(hhmmss) || '00:00:00'
  return `${dateStr}T${safeTime}+08:00`
}

export function toManilaDateTimeOrNull(value: string | null | undefined): string | null {
  if (!value) return null
  const raw = String(value).trim()
  if (!raw) return null

  // Preserve plain Manila clock strings without UTC conversion surprises.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    return `${raw.length === 16 ? `${raw}:00` : raw}+08:00`
  }

  try {
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) return null
    return formatInTimeZone(parsed, MANILA_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX")
  } catch {
    return null
  }
}

export async function getScheduleWindowForEmployeeDate(
  employeeId: number,
  dateStr: string,
  linkedSchedule?: LinkedScheduleRef
): Promise<{ timeIn: string; timeOut: string } | null> {
  const activeTermCode = await getActiveTermCode()
  const dayRows = await dbQuery<{ dow: number }>(
    `SELECT EXTRACT(ISODOW FROM $1::date)::int AS dow`,
    [dateStr]
  )
  const scheduleDay = dayRows?.[0]?.dow

  if (linkedSchedule?.scheduleId && linkedSchedule?.scheduleType === 'teaching') {
    const rows = await dbQuery<{ time_start: string | null; time_end: string | null; created_at: string | null }>(
      `SELECT time_start::text, time_end::text, created_at::text AS created_at
         FROM teaching_schedules
        WHERE schedule_id = $1
          AND employee_id = $2
        LIMIT 1`,
      [linkedSchedule.scheduleId, employeeId]
    )
    if (!wasScheduleActiveOnDate(rows?.[0]?.created_at || null, dateStr)) return null
    const start = toHHMMSS(rows?.[0]?.time_start)
    const end = toHHMMSS(rows?.[0]?.time_end)
    if (start && end) return { timeIn: start, timeOut: end }
  }

  if (linkedSchedule?.scheduleId && linkedSchedule?.scheduleType === 'exam') {
    const rows = await dbQuery<{ time_start: string | null; time_end: string | null; created_at: string | null }>(
      `SELECT time_start::text, time_end::text, created_at::text AS created_at
         FROM exam_schedules
        WHERE exam_schedule_id = $1
          AND employee_id = $2
        LIMIT 1`,
      [linkedSchedule.scheduleId, employeeId]
    )
    if (!wasScheduleActiveOnDate(rows?.[0]?.created_at || null, dateStr)) return null
    const start = toHHMMSS(rows?.[0]?.time_start)
    const end = toHHMMSS(rows?.[0]?.time_end)
    if (start && end) return { timeIn: start, timeOut: end }
  }

  const teaching = await dbQuery<{ time_start: string | null; time_end: string | null; created_at: string | null }>(
    `SELECT time_start::text, time_end::text, created_at::text AS created_at
       FROM teaching_schedules
      WHERE employee_id = $1
        AND (status IS NULL OR LOWER(status) IN ('available', 'active'))
        AND ($3::text IS NULL OR term = $3 OR term IS NULL)
        AND day_of_week = $2`,
    [employeeId, scheduleDay, activeTermCode]
  )

  const exams = await dbQuery<{ time_start: string | null; time_end: string | null; created_at: string | null }>(
    `SELECT time_start::text, time_end::text, created_at::text AS created_at
       FROM exam_schedules
      WHERE employee_id = $1
        AND (status IS NULL OR LOWER(status) IN ('available', 'active'))
        AND ($4::text IS NULL OR term = $4 OR term IS NULL)
        AND (
          (exam_date IS NOT NULL AND exam_date = $2::date)
          OR (exam_date IS NULL AND day_of_week = $3)
        )`,
    [employeeId, dateStr, scheduleDay, activeTermCode]
  )

  const windows = [...teaching, ...exams]
    .filter((row) => wasScheduleActiveOnDate(row.created_at, dateStr))
    .map((row) => ({
      start: toHHMMSS(row.time_start),
      end: toHHMMSS(row.time_end),
    }))
    .filter((row): row is { start: string; end: string } => Boolean(row.start && row.end))

  const sorted = windows.sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
  if (sorted.length > 0) {
    const earliestStart = sorted.reduce((min, row) => Math.min(min, toMinutes(row.start)), Number.POSITIVE_INFINITY)
    const latestEnd = sorted.reduce((max, row) => Math.max(max, toMinutes(row.end)), Number.NEGATIVE_INFINITY)

    const toHHMMSSFromMinutes = (minutes: number): string => {
      const hh = Math.floor(minutes / 60)
      const mm = minutes % 60
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`
    }

    return {
      timeIn: toHHMMSSFromMinutes(earliestStart),
      timeOut: toHHMMSSFromMinutes(latestEnd),
    }
  }

  const fixedShift = await dbQuery<{ schedule_time_in: string | null; schedule_time_out: string | null }>(
    `SELECT schedule_time_in::text, schedule_time_out::text
       FROM employees
      WHERE employee_id = $1
      LIMIT 1`,
    [employeeId]
  )

  const shiftIn = toHHMMSS(fixedShift?.[0]?.schedule_time_in)
  const shiftOut = toHHMMSS(fixedShift?.[0]?.schedule_time_out)
  if (shiftIn && shiftOut) {
    return {
      timeIn: shiftIn,
      timeOut: shiftOut,
    }
  }

  return null
}
