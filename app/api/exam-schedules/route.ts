import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'
import { getActiveTermCode } from '@/lib/active-term-code'

export const dynamic = 'force-dynamic'

type ScheduleTerm = '1st_term' | '2nd_term' | 'summer'

const ALLOWED_TERMS: ScheduleTerm[] = ['1st_term', '2nd_term', 'summer']

const normalizeTime = (value: unknown): string => {
  const raw = String(value || '').trim()
  if (!raw) throw new Error('time_start/time_end is required')

  if (/^\d{2}:\d{2}$/.test(raw)) return `${raw}:00`
  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return raw

  throw new Error(`Invalid time format: ${raw}. Expected HH:mm or HH:mm:ss`)
}

const normalizeDate = (value: unknown): string | null => {
  if (value === undefined || value === null || value === '') return null
  const raw = String(value).trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid exam_date: ${raw}`)
  }

  return parsed.toISOString().split('T')[0]
}

const formatTime12h = (value: unknown): string => {
  const raw = String(value || '').trim()
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!match) return raw

  let hour = Number(match[1])
  const minute = match[2]
  const period = hour >= 12 ? 'PM' : 'AM'

  hour = hour % 12
  if (hour === 0) hour = 12

  return `${String(hour).padStart(2, '0')}:${minute} ${period}`
}

const isWithinAllowedWindow = (value: string): boolean => {
  const match = value.match(/^(\d{2}):(\d{2})(?::\d{2})?$/)
  if (!match) return false

  const hour = Number(match[1])
  const minute = Number(match[2])
  const totalMinutes = hour * 60 + minute

  return totalMinutes >= 7 * 60 && totalMinutes <= 21 * 60
}

const getScheduleConflict = async (args: {
  employeeId: number
  dayOfWeek: number
  term: ScheduleTerm
  timeStart: string
  timeEnd: string
  excludeExamScheduleId?: number
}) => {
  const examRows = await dbQuery(
    `SELECT exam_schedule_id, subject_name, time_start, time_end
       FROM exam_schedules
      WHERE employee_id = $1
        AND day_of_week = $2
        AND term = $3
        AND time_start < $5::time
        AND time_end > $4::time
        AND ($6::int IS NULL OR exam_schedule_id <> $6)
      LIMIT 1`,
    [
      args.employeeId,
      args.dayOfWeek,
      args.term,
      args.timeStart,
      args.timeEnd,
      args.excludeExamScheduleId ?? null,
    ]
  )

  if (examRows && examRows.length > 0) {
    const row = examRows[0]
    return {
      type: 'exam' as const,
      subject: row.subject_name || 'existing exam',
      time_start: row.time_start,
      time_end: row.time_end,
    }
  }

  return null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const examScheduleId = Number(body?.exam_schedule_id)
    const employeeId = Number(body?.employee_id)
    const dayOfWeek = Number(body?.day_of_week)
    const requestedTerm = ALLOWED_TERMS.includes(body?.term) ? body.term : null

    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return NextResponse.json({ error: 'Valid employee_id is required' }, { status: 400 })
    }

    if (!Number.isFinite(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
      return NextResponse.json({ error: 'day_of_week must be between 1 and 7' }, { status: 400 })
    }

    let term = requestedTerm

    if (!term && Number.isFinite(examScheduleId) && examScheduleId > 0) {
      const existing = await dbQuery<{ term?: ScheduleTerm | null }>(
        'SELECT term FROM exam_schedules WHERE exam_schedule_id = $1',
        [examScheduleId]
      )
      const existingTerm = existing?.[0]?.term
      term = ALLOWED_TERMS.includes(existingTerm as ScheduleTerm) ? (existingTerm as ScheduleTerm) : null
    }

    if (!term) {
      const activeTerm = await getActiveTermCode()
      term = activeTerm && ALLOWED_TERMS.includes(activeTerm) ? activeTerm : '1st_term'
    }

    const payload = {
      employee_id: employeeId,
      day_of_week: dayOfWeek,
      time_start: normalizeTime(body?.time_start),
      time_end: normalizeTime(body?.time_end),
      course_code: body?.course_code ? String(body.course_code).trim().toUpperCase() : null,
      subject_name: body?.subject_name ? String(body.subject_name).trim() : null,
      section: body?.section ? String(body.section).trim().toUpperCase() : null,
      room_code: body?.room_code ? String(body.room_code).trim().toUpperCase() : null,
      exam_date: normalizeDate(body?.exam_date),
      status: body?.status ? String(body.status).trim() : 'available',
      substitute_employee_id:
        body?.substitute_employee_id !== undefined && body?.substitute_employee_id !== null
          ? Number(body.substitute_employee_id)
          : null,
      unavailable_reason: body?.unavailable_reason ? String(body.unavailable_reason).trim() : null,
      term,
      class_type: body?.class_type ? String(body.class_type).trim() : null,
      exam_type: body?.exam_type ? String(body.exam_type).trim() : null,
    }

    if (payload.time_start >= payload.time_end) {
      return NextResponse.json(
        { error: 'Invalid time range. Start time must be earlier than end time.' },
        { status: 400 }
      )
    }

    if (!isWithinAllowedWindow(payload.time_start) || !isWithinAllowedWindow(payload.time_end)) {
      return NextResponse.json(
        { error: 'Time must be between 7:00 AM and 9:00 PM.' },
        { status: 400 }
      )
    }

    const conflict = await getScheduleConflict({
      employeeId: payload.employee_id,
      dayOfWeek: payload.day_of_week,
      term: payload.term,
      timeStart: payload.time_start,
      timeEnd: payload.time_end,
      excludeExamScheduleId: Number.isFinite(examScheduleId) && examScheduleId > 0 ? examScheduleId : undefined,
    })

    if (conflict) {
      return NextResponse.json(
        {
          error: `Time conflict detected. This overlaps with another exam schedule "${conflict.subject}" (${formatTime12h(conflict.time_start)} - ${formatTime12h(conflict.time_end)}).`,
        },
        { status: 409 }
      )
    }

    if (Number.isFinite(examScheduleId) && examScheduleId > 0) {
      const rows = await dbQuery(
        `UPDATE exam_schedules
         SET employee_id = $1,
             day_of_week = $2,
             time_start = $3,
             time_end = $4,
             course_code = $5,
             subject_name = $6,
             section = $7,
             room_code = $8,
             exam_date = $9::date,
             status = $10,
             substitute_employee_id = $11,
             unavailable_reason = $12,
             term = $13,
             class_type = $14,
             exam_type = $15
         WHERE exam_schedule_id = $16
         RETURNING *`,
        [
          payload.employee_id,
          payload.day_of_week,
          payload.time_start,
          payload.time_end,
          payload.course_code,
          payload.subject_name,
          payload.section,
          payload.room_code,
          payload.exam_date,
          payload.status,
          payload.substitute_employee_id,
          payload.unavailable_reason,
          payload.term,
          payload.class_type,
          payload.exam_type,
          examScheduleId,
        ]
      )

      if (!rows || rows.length === 0) {
        return NextResponse.json({ error: 'Exam schedule not found' }, { status: 404 })
      }

      return NextResponse.json(rows[0])
    }

    const rows = await dbQuery(
      `INSERT INTO exam_schedules (
        employee_id,
        day_of_week,
        time_start,
        time_end,
        course_code,
        subject_name,
        section,
        room_code,
        exam_date,
        status,
        substitute_employee_id,
        unavailable_reason,
        term,
        class_type,
        exam_type
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10, $11, $12, $13, $14, $15
      )
      RETURNING *`,
      [
        payload.employee_id,
        payload.day_of_week,
        payload.time_start,
        payload.time_end,
        payload.course_code,
        payload.subject_name,
        payload.section,
        payload.room_code,
        payload.exam_date,
        payload.status,
        payload.substitute_employee_id,
        payload.unavailable_reason,
        payload.term,
        payload.class_type,
        payload.exam_type,
      ]
    )

    return NextResponse.json(rows[0])
  } catch (error: any) {
    console.error('[POST /api/exam-schedules] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to save exam schedule' },
      { status: 500 }
    )
  }
}