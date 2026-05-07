import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

export const dynamic = 'force-dynamic'

type ScheduleTerm = '1st_term' | '2nd_term' | 'summer'

const ALLOWED_TERMS: ScheduleTerm[] = ['1st_term', '2nd_term', 'summer']

const resolveCourseId = async (courseIdRaw: unknown, courseCodeRaw: unknown, subjectNameRaw: unknown) => {
  const parsedId = Number(courseIdRaw)
  if (Number.isFinite(parsedId) && parsedId > 0) {
    return parsedId
  }

  const explicitCode = String(courseCodeRaw || '').trim().toUpperCase()
  const fallbackCode = String(subjectNameRaw || '').trim().substring(0, 8).toUpperCase()
  const code = explicitCode || fallbackCode

  if (!code) return null

  const existing = await dbQuery<{ course_id: number }>(
    `SELECT course_id FROM courses WHERE code = $1 LIMIT 1`,
    [code]
  )
  if (existing[0]?.course_id) return existing[0].course_id

  const inserted = await dbQuery<{ course_id: number }>(
    `INSERT INTO courses (code) VALUES ($1) RETURNING course_id`,
    [code]
  )
  return inserted[0]?.course_id ?? null
}

const resolveRoomId = async (roomIdRaw: unknown, roomCodeRaw: unknown) => {
  const parsedId = Number(roomIdRaw)
  if (Number.isFinite(parsedId) && parsedId > 0) {
    return parsedId
  }

  const code = String(roomCodeRaw || '').trim().toUpperCase()
  if (!code) return null

  const existing = await dbQuery<{ room_id: number }>(
    `SELECT room_id FROM rooms WHERE code = $1 LIMIT 1`,
    [code]
  )
  if (existing[0]?.room_id) return existing[0].room_id

  const inserted = await dbQuery<{ room_id: number }>(
    `INSERT INTO rooms (code) VALUES ($1) RETURNING room_id`,
    [code]
  )
  return inserted[0]?.room_id ?? null
}

const normalizeTime = (value: unknown): string => {
  const raw = String(value || '').trim()
  if (!raw) throw new Error('time_start/time_end is required')

  if (/^\d{2}:\d{2}$/.test(raw)) return `${raw}:00`
  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return raw

  const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (ampmMatch) {
    let hour = Number(ampmMatch[1])
    const minute = Number(ampmMatch[2])
    const period = ampmMatch[3].toUpperCase()

    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
      throw new Error(`Invalid time format: ${raw}`)
    }

    if (period === 'AM' && hour === 12) hour = 0
    if (period === 'PM' && hour !== 12) hour += 12

    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
  }

  throw new Error(`Invalid time format: ${raw}. Expected HH:mm, HH:mm:ss, or h:mm AM/PM`)
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
  excludeScheduleId?: number
}) => {
  const teachingRows = await dbQuery(
    `SELECT schedule_id, subject_name, time_start, time_end
       FROM teaching_schedules
      WHERE employee_id = $1
        AND day_of_week = $2
        AND term = $3
        AND time_start < $5::time
        AND time_end > $4::time
        AND ($6::int IS NULL OR schedule_id <> $6)
      LIMIT 1`,
    [
      args.employeeId,
      args.dayOfWeek,
      args.term,
      args.timeStart,
      args.timeEnd,
      args.excludeScheduleId ?? null,
    ]
  )

  if (teachingRows && teachingRows.length > 0) {
    const row = teachingRows[0]
    return {
      type: 'class' as const,
      subject: row.subject_name || 'existing class',
      time_start: row.time_start,
      time_end: row.time_end,
    }
  }

  return null
}

const isMissingSubjectIdColumnError = (error: any) => {
  const msg = String(error?.message || '').toLowerCase()
  return msg.includes('subject_id') && (msg.includes('does not exist') || msg.includes('undefined column'))
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const scheduleId = Number(body?.schedule_id)
    const employeeId = Number(body?.employee_id)
    const courseId = await resolveCourseId(body?.course_id, body?.course_code, body?.subject_name)
    const roomId = await resolveRoomId(body?.room_id, body?.room_code)
    const dayOfWeek = Number(body?.day_of_week)
    const term = ALLOWED_TERMS.includes(body?.term) ? body.term : '1st_term'

    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return NextResponse.json({ error: 'Valid employee_id is required' }, { status: 400 })
    }
    if (!Number.isFinite(courseId as number) || (courseId as number) <= 0) {
      return NextResponse.json({ error: 'Valid course_id or course_code is required' }, { status: 400 })
    }
    if (!Number.isFinite(roomId as number) || (roomId as number) <= 0) {
      return NextResponse.json({ error: 'Valid room_id or room_code is required' }, { status: 400 })
    }
    if (!Number.isFinite(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 6) {
      return NextResponse.json({ error: 'day_of_week must be between 1 and 6' }, { status: 400 })
    }

    const payload = {
      employee_id: employeeId,
      course_id: courseId as number,
      room_id: roomId as number,
      day_of_week: dayOfWeek,
      time_start: normalizeTime(body?.time_start),
      time_end: normalizeTime(body?.time_end),
      subject_id:
        body?.subject_id !== undefined && body?.subject_id !== null
          ? Number(body.subject_id)
          : null,
      subject_name: body?.subject_name ? String(body.subject_name).trim() : null,
      class_type: body?.class_type ? String(body.class_type).trim() : null,
      section: body?.section ? String(body.section).trim().toUpperCase() : null,
      term,
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
      excludeScheduleId: Number.isFinite(scheduleId) && scheduleId > 0 ? scheduleId : undefined,
    })

    if (conflict) {
      return NextResponse.json(
        {
          error: `Time conflict detected. This overlaps with ${conflict.type} schedule "${conflict.subject}" (${formatTime12h(conflict.time_start)} - ${formatTime12h(conflict.time_end)}).`,
        },
        { status: 409 }
      )
    }

    if (Number.isFinite(scheduleId) && scheduleId > 0) {
      let rows: any[] = []
      try {
        rows = await dbQuery(
          `UPDATE teaching_schedules
           SET employee_id = $1,
               course_id = $2,
               room_id = $3,
               day_of_week = $4,
               time_start = $5,
               time_end = $6,
               subject_id = $7,
               subject_name = $8,
               class_type = $9,
               section = $10,
               term = $11
           WHERE schedule_id = $12
           RETURNING *`,
          [
            payload.employee_id,
            payload.course_id,
            payload.room_id,
            payload.day_of_week,
            payload.time_start,
            payload.time_end,
            payload.subject_id,
            payload.subject_name,
            payload.class_type,
            payload.section,
            payload.term,
            scheduleId,
          ]
        )
      } catch (error) {
        if (!isMissingSubjectIdColumnError(error)) throw error

        rows = await dbQuery(
          `UPDATE teaching_schedules
           SET employee_id = $1,
               course_id = $2,
               room_id = $3,
               day_of_week = $4,
               time_start = $5,
               time_end = $6,
               subject_name = $7,
               class_type = $8,
               section = $9,
               term = $10
           WHERE schedule_id = $11
           RETURNING *`,
          [
            payload.employee_id,
            payload.course_id,
            payload.room_id,
            payload.day_of_week,
            payload.time_start,
            payload.time_end,
            payload.subject_name,
            payload.class_type,
            payload.section,
            payload.term,
            scheduleId,
          ]
        )
      }

      if (!rows || rows.length === 0) {
        return NextResponse.json({ error: 'Teaching schedule not found' }, { status: 404 })
      }

      return NextResponse.json(rows[0])
    }

    let rows: any[] = []
    try {
      rows = await dbQuery(
        `INSERT INTO teaching_schedules (
          employee_id,
          course_id,
          room_id,
          day_of_week,
          time_start,
          time_end,
          subject_id,
          subject_name,
          class_type,
          section,
          term
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        )
        RETURNING *`,
        [
          payload.employee_id,
          payload.course_id,
          payload.room_id,
          payload.day_of_week,
          payload.time_start,
          payload.time_end,
          payload.subject_id,
          payload.subject_name,
          payload.class_type,
          payload.section,
          payload.term,
        ]
      )
    } catch (error) {
      if (!isMissingSubjectIdColumnError(error)) throw error

      rows = await dbQuery(
        `INSERT INTO teaching_schedules (
          employee_id,
          course_id,
          room_id,
          day_of_week,
          time_start,
          time_end,
          subject_name,
          class_type,
          section,
          term
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        )
        RETURNING *`,
        [
          payload.employee_id,
          payload.course_id,
          payload.room_id,
          payload.day_of_week,
          payload.time_start,
          payload.time_end,
          payload.subject_name,
          payload.class_type,
          payload.section,
          payload.term,
        ]
      )
    }

    return NextResponse.json(rows[0])
  } catch (error: any) {
    console.error('[POST /api/teaching-schedules] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to save teaching schedule' },
      { status: 500 }
    )
  }
}