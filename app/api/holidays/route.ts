import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'
import { formatInTimeZone } from 'date-fns-tz'

export const dynamic = 'force-dynamic'

const normalizeDateInput = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return formatInTimeZone(parsed, 'Asia/Manila', 'yyyy-MM-dd')
}

const isSundayDate = (value: string): boolean => {
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return false
  return d.getDay() === 0
}

const rangeContainsSunday = (start: string, end: string): boolean => {
  const cursor = new Date(`${start}T00:00:00`)
  const limit = new Date(`${end}T00:00:00`)
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(limit.getTime())) return false

  while (cursor <= limit) {
    if (cursor.getDay() === 0) return true
    cursor.setDate(cursor.getDate() + 1)
  }
  return false
}

export async function GET() {
  try {
    const rows = await dbQuery(
      `SELECT *
       FROM holiday_calendar
       ORDER BY COALESCE(start_date, date) ASC`
    )

    return NextResponse.json(rows)
  } catch (error: any) {
    console.error('[GET /api/holidays] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch holidays' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const {
      date,
      start_date,
      end_date,
      type,
      name,
      description,
      affects_attendance,
      reporting_only,
    } = body || {}

    const finalDate = normalizeDateInput(start_date || date)
    const finalStart = normalizeDateInput(start_date || date)
    const finalEnd = normalizeDateInput(end_date || date)

    if (!finalDate || !finalStart || !finalEnd || !type || !name) {
      return NextResponse.json({ error: 'Missing required holiday fields.' }, { status: 400 })
    }

    if (finalEnd < finalStart) {
      return NextResponse.json({ error: 'end_date must be on or after start_date.' }, { status: 400 })
    }

    if (isSundayDate(finalStart) || isSundayDate(finalEnd) || rangeContainsSunday(finalStart, finalEnd)) {
      return NextResponse.json({ error: 'Sunday is not allowed. Please select Monday to Saturday only.' }, { status: 400 })
    }

    const rows = await dbQuery(
      `INSERT INTO holiday_calendar (
        date,
        start_date,
        end_date,
        type,
        name,
        description,
        affects_attendance,
        reporting_only,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *`,
      [
        finalDate,
        finalStart,
        finalEnd,
        type,
        name,
        description || null,
        Boolean(affects_attendance),
        Boolean(reporting_only),
      ]
    )

    return NextResponse.json({ success: true, data: rows[0] })
  } catch (error: any) {
    console.error('[POST /api/holidays] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to create holiday' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const {
      id,
      date,
      start_date,
      end_date,
      type,
      name,
      description,
      affects_attendance,
      reporting_only,
    } = body || {}

    if (!id) {
      return NextResponse.json({ error: 'Missing holiday id.' }, { status: 400 })
    }

    const finalDate = normalizeDateInput(start_date || date)
    const finalStart = normalizeDateInput(start_date || date)
    const finalEnd = normalizeDateInput(end_date || date)

    if ((start_date || date) && !finalStart) {
      return NextResponse.json({ error: 'Invalid start date format. Use YYYY-MM-DD.' }, { status: 400 })
    }

    if ((end_date || date) && !finalEnd) {
      return NextResponse.json({ error: 'Invalid end date format. Use YYYY-MM-DD.' }, { status: 400 })
    }

    if (finalStart && finalEnd && finalEnd < finalStart) {
      return NextResponse.json({ error: 'end_date must be on or after start_date.' }, { status: 400 })
    }

    if (finalStart && finalEnd && (isSundayDate(finalStart) || isSundayDate(finalEnd) || rangeContainsSunday(finalStart, finalEnd))) {
      return NextResponse.json({ error: 'Sunday is not allowed. Please select Monday to Saturday only.' }, { status: 400 })
    }

    const rows = await dbQuery(
      `UPDATE holiday_calendar
       SET date = COALESCE($1, date),
           start_date = COALESCE($2, start_date),
           end_date = COALESCE($3, end_date),
           type = COALESCE($4, type),
           name = COALESCE($5, name),
           description = $6,
           affects_attendance = COALESCE($7, affects_attendance),
           reporting_only = COALESCE($8, reporting_only),
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        finalDate || null,
        finalStart || null,
        finalEnd || null,
        type || null,
        name || null,
        description ?? null,
        typeof affects_attendance === 'boolean' ? affects_attendance : null,
        typeof reporting_only === 'boolean' ? reporting_only : null,
        id,
      ]
    )

    if (!rows[0]) {
      return NextResponse.json({ error: 'Holiday not found.' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: rows[0] })
  } catch (error: any) {
    console.error('[PATCH /api/holidays] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to update holiday' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = Number(searchParams.get('id') || '0')

    if (!id) {
      return NextResponse.json({ error: 'Missing holiday id.' }, { status: 400 })
    }

    const rows = await dbQuery(
      `DELETE FROM holiday_calendar
       WHERE id = $1
       RETURNING id`,
      [id]
    )

    if (!rows[0]) {
      return NextResponse.json({ error: 'Holiday not found.' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[DELETE /api/holidays] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to delete holiday' },
      { status: 500 }
    )
  }
}
