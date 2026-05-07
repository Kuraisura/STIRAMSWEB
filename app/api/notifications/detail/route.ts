import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'
import { deriveNotificationReasonContext } from '@/lib/notification-reason-context'

export const dynamic = 'force-dynamic'

type NotificationRow = {
  notification_id: number
  title: string | null
  message: string | null
  created_at: string | null
  meta?: any
}

type LogRow = {
  log_id: number
  employee_id: number
  log_type: 'IN' | 'OUT' | null
  log_time: string | null
  date: string | null
  notes: string | null
  attendance_status: string | null
  is_late: boolean | null
  is_early_out: boolean | null
  local_date: string | null
}

type EmployeeRow = {
  employee_id: number
  school_id: string | null
  full_name: string | null
  department: string | null
  staff_type: string | null
  schedule_time_in: string | null
  schedule_time_out: string | null
}

type TimeWindow = { start: number; end: number }

function toMinutes(value?: string | null): number | null {
  if (!value) return null
  const m = String(value).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

function toTimeText(minutes: number): string {
  const hh = Math.floor(minutes / 60)
  const mm = minutes % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`
}

function mergeWindows(windows: TimeWindow[]): TimeWindow[] {
  if (!windows.length) return []
  const sorted = [...windows].sort((a, b) => a.start - b.start)
  const merged: TimeWindow[] = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const last = merged[merged.length - 1]
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end)
    } else {
      merged.push({ ...current })
    }
  }
  return merged
}

function subtractWindows(base: TimeWindow[], removals: TimeWindow[]): TimeWindow[] {
  let result = [...base]
  for (const rem of removals) {
    const next: TimeWindow[] = []
    for (const block of result) {
      if (rem.end <= block.start || rem.start >= block.end) {
        next.push(block)
        continue
      }
      if (rem.start > block.start) next.push({ start: block.start, end: rem.start })
      if (rem.end < block.end) next.push({ start: rem.end, end: block.end })
    }
    result = next
  }
  return result.filter((w) => w.end > w.start)
}

function parseMeta(meta: unknown): Record<string, any> {
  if (!meta) return {}
  if (typeof meta === 'object') return meta as Record<string, any>
  if (typeof meta === 'string') {
    try {
      return JSON.parse(meta)
    } catch {
      return {}
    }
  }
  return {}
}

function toDateOnly(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10)
    }
    return null
  }

  const parsed = new Date(value as any)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const notificationId = Number(searchParams.get('notificationId') || 0)

    if (!Number.isFinite(notificationId) || notificationId <= 0) {
      return NextResponse.json({ error: 'notificationId is required' }, { status: 400 })
    }

    const notifRows = await dbQuery<NotificationRow>(
      `SELECT notification_id, title, message, created_at, meta
         FROM notifications
        WHERE notification_id = $1
        LIMIT 1`,
      [notificationId]
    )

    if (!notifRows?.length) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
    }

    const notification = notifRows[0]
    const meta = parseMeta(notification.meta)

    const metaLogId = Number(meta?.log_id || 0)
    const metaEmployeeNumeric = Number(meta?.employee_id || 0)
    const metaEmployeeCode = String(meta?.employee_id || '').trim()

    let eventLog: LogRow | null = null

    if (Number.isFinite(metaLogId) && metaLogId > 0) {
      const logRows = await dbQuery<LogRow>(
        `SELECT
           log_id,
           employee_id,
           log_type,
           log_time::text AS log_time,
           date::text AS date,
           notes,
           attendance_status,
           is_late,
           is_early_out,
           COALESCE(date::text, ((log_time AT TIME ZONE 'Asia/Manila')::date)::text) AS local_date
         FROM attendance_logs
         WHERE log_id = $1
         LIMIT 1`,
        [metaLogId]
      )
      eventLog = logRows?.[0] || null
    }

    let employee: EmployeeRow | null = null

    const employeeIdFromLog = eventLog?.employee_id
      ? Number(eventLog.employee_id)
      : Number.isFinite(metaEmployeeNumeric) && metaEmployeeNumeric > 0
      ? metaEmployeeNumeric
      : null

    if (employeeIdFromLog && Number.isFinite(employeeIdFromLog)) {
      const employeeRows = await dbQuery<EmployeeRow>(
        `SELECT
           employee_id,
           school_id::text,
           full_name,
           department,
           staff_type,
           schedule_time_in::text,
           schedule_time_out::text
         FROM employees
         WHERE employee_id = $1
         LIMIT 1`,
        [employeeIdFromLog]
      )
      employee = employeeRows?.[0] || null
    } else if (metaEmployeeCode) {
      const employeeRows = await dbQuery<EmployeeRow>(
        `SELECT
           employee_id,
           school_id::text,
           full_name,
           department,
           staff_type,
           schedule_time_in::text,
           schedule_time_out::text
         FROM employees
         WHERE school_id::text = $1
         LIMIT 1`,
        [metaEmployeeCode]
      )
      employee = employeeRows?.[0] || null
    }

    const employeeId = employee?.employee_id || employeeIdFromLog || null

    const eventDate =
      eventLog?.local_date ||
      toDateOnly(notification.created_at)

    let dayLogs: LogRow[] = []
    if (employeeId && eventDate) {
      dayLogs = await dbQuery<LogRow>(
        `SELECT
           log_id,
           employee_id,
           log_type,
           log_time::text AS log_time,
           date::text AS date,
           notes,
           attendance_status,
           is_late,
           is_early_out,
           COALESCE(date::text, ((log_time AT TIME ZONE 'Asia/Manila')::date)::text) AS local_date
         FROM attendance_logs
         WHERE employee_id = $1
           AND COALESCE(date::text, ((log_time AT TIME ZONE 'Asia/Manila')::date)::text) = $2
         ORDER BY log_time ASC`,
        [employeeId, eventDate]
      )
    }

    const firstIn = dayLogs.find((l) => String(l.log_type || '').toUpperCase() === 'IN') || null
    const outCandidates = dayLogs.filter((l) => String(l.log_type || '').toUpperCase() === 'OUT')
    const lastOut = outCandidates.length > 0 ? outCandidates[outCandidates.length - 1] : null

    let schedules: Array<{ source: string; day_of_week: number; time_start: string | null; time_end: string | null }> = []
    let effectiveScheduleIn: string | null = null
    let effectiveScheduleOut: string | null = null
    let scheduleSource: string | null = null

    if (employeeId && eventDate) {
      const dayOfWeekRows = await dbQuery<{ dow: number }>(
        `SELECT EXTRACT(ISODOW FROM $1::date)::int AS dow`,
        [eventDate]
      )
      const dayOfWeek = dayOfWeekRows?.[0]?.dow || null

      if (dayOfWeek && dayOfWeek >= 1 && dayOfWeek <= 6) {
        try {
          const teaching = await dbQuery<{ day_of_week: number; time_start: string | null; time_end: string | null }>(
            `SELECT day_of_week, time_start::text, time_end::text
             FROM teaching_schedules
             WHERE employee_id = $1 AND day_of_week = $2
             ORDER BY time_start ASC`,
            [employeeId, dayOfWeek]
          )

          const exams = await dbQuery<{ day_of_week: number; time_start: string | null; time_end: string | null }>(
            `SELECT day_of_week, time_start::text, time_end::text
             FROM exam_schedules
             WHERE employee_id = $1 AND day_of_week = $2
             ORDER BY time_start ASC`,
            [employeeId, dayOfWeek]
          )

          const substitutions = await dbQuery<{ original_employee_id: number; substitute_employee_id: number; start_time: string | null; end_time: string | null }>(
            `SELECT original_employee_id, substitute_employee_id, start_time::text, end_time::text
             FROM class_substitutions_v2
             WHERE substitution_date = $1::date
               AND COALESCE(status, 'pending') = 'approved'
               AND (original_employee_id = $2 OR substitute_employee_id = $2)`,
            [eventDate, employeeId]
          )

          const baseWindows = [
            ...(teaching || []).map((s) => ({ start: toMinutes(s.time_start), end: toMinutes(s.time_end) })),
            ...(exams || []).map((s) => ({ start: toMinutes(s.time_start), end: toMinutes(s.time_end) })),
          ]
            .filter((w): w is { start: number; end: number } => w.start !== null && w.end !== null && w.end > w.start)

          const removedWindows = (substitutions || [])
            .filter((s) => Number(s.original_employee_id) === Number(employeeId))
            .map((s) => ({ start: toMinutes(s.start_time), end: toMinutes(s.end_time) }))
            .filter((w): w is { start: number; end: number } => w.start !== null && w.end !== null && w.end > w.start)

          const substituteWindows = (substitutions || [])
            .filter((s) => Number(s.substitute_employee_id) === Number(employeeId))
            .map((s) => ({ start: toMinutes(s.start_time), end: toMinutes(s.end_time) }))
            .filter((w): w is { start: number; end: number } => w.start !== null && w.end !== null && w.end > w.start)

          const effectiveWindows = mergeWindows([
            ...subtractWindows(baseWindows, mergeWindows(removedWindows)),
            ...substituteWindows,
          ])

          if (effectiveWindows.length > 0) {
            effectiveScheduleIn = toTimeText(Math.min(...effectiveWindows.map((w) => w.start)))
            effectiveScheduleOut = toTimeText(Math.max(...effectiveWindows.map((w) => w.end)))
            scheduleSource = 'Substitution-adjusted'
            schedules = effectiveWindows.map((w) => ({
              source: 'effective',
              day_of_week: dayOfWeek,
              time_start: toTimeText(w.start),
              time_end: toTimeText(w.end),
            }))
          } else {
            scheduleSource = 'No class/exam schedule'
            schedules = []
          }
        } catch {
          scheduleSource = 'Unavailable'
          schedules = []
        }
      }
    }

    const isTeaching = String(employee?.staff_type || '').toLowerCase() === 'teaching'
    const scheduleTimeIn = effectiveScheduleIn || (!isTeaching ? employee?.schedule_time_in || null : null)
    const scheduleTimeOut = effectiveScheduleOut || (!isTeaching ? employee?.schedule_time_out || null : null)
    const eventContext = deriveNotificationReasonContext({
      meta,
      notes: eventLog?.notes,
      attendanceStatus: firstIn?.attendance_status || eventLog?.attendance_status,
      isLate: Boolean(firstIn?.is_late || eventLog?.is_late),
      isEarlyOut: Boolean(lastOut?.is_early_out || eventLog?.is_early_out),
      logType: eventLog?.log_type || firstIn?.log_type || lastOut?.log_type,
    })
    if (!scheduleSource && scheduleTimeIn && scheduleTimeOut) {
      scheduleSource = isTeaching ? 'Class/Exam schedule' : 'Default shift'
    }

    return NextResponse.json({
      success: true,
      notification: {
        notification_id: notification.notification_id,
        title: notification.title,
        message: notification.message,
        created_at: notification.created_at,
        meta,
      },
      employee,
      event_log: eventLog,
      daily_summary: {
        date: eventDate,
        time_in: firstIn?.log_time || null,
        time_out: lastOut?.log_time || null,
        status: firstIn?.attendance_status || eventLog?.attendance_status || null,
        is_late: Boolean(firstIn?.is_late || eventLog?.is_late),
        is_early_out: Boolean(lastOut?.is_early_out || eventLog?.is_early_out),
        schedule_time_in: scheduleTimeIn,
        schedule_time_out: scheduleTimeOut,
        schedule_source: scheduleSource,
        absent_source: eventContext.source,
        absent_reason: eventContext.reason,
        reason_source: eventContext.source,
        reason_detail: eventContext.reason,
      },
      schedules,
      raw_logs: dayLogs,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load notification details' }, { status: 500 })
  }
}
