import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'
import { getActiveTermContext, normalizeTermCode } from '@/lib/active-term-code'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const employeeId = Number(searchParams.get('employee_id'))
    const employeeIdsParam = String(searchParams.get('employee_ids') || '').trim()
    const term = searchParams.get('term')

    const employeeIds = employeeIdsParam
      ? Array.from(
          new Set(
            employeeIdsParam
              .split(',')
              .map((value) => Number(value.trim()))
              .filter((value) => Number.isFinite(value) && value > 0)
          )
        )
      : []

    const isBulkRequest = employeeIds.length > 0

    if (!isBulkRequest && (!Number.isFinite(employeeId) || employeeId <= 0)) {
      return NextResponse.json({ error: 'Valid employee_id or employee_ids is required' }, { status: 400 })
    }

    const safeTerm = normalizeTermCode(term)
    const activeTerm = await getActiveTermContext()
    const termToUse = safeTerm || activeTerm.termCode
    const termStart = activeTerm.startDate
    const termEnd = activeTerm.endDate
    const termId = activeTerm.termId

    const employeeFilterSql = isBulkRequest
      ? `ts.employee_id = ANY($1::int[])`
      : `ts.employee_id = $1`

    const examEmployeeFilterSql = isBulkRequest
      ? `es.employee_id = ANY($1::int[])`
      : `es.employee_id = $1`

    const teachingSql = `
      SELECT
        ts.schedule_id,
        ts.employee_id,
        ts.course_id,
        ts.room_id,
        ts.day_of_week,
        ts.time_start,
        ts.time_end,
        NULL::bigint AS subject_id,
        ts.subject_name,
        ts.class_type,
        ts.section,
        ts.term,
        c.code AS course_code,
        r.code AS room_code
      FROM teaching_schedules ts
      LEFT JOIN courses c ON c.course_id = ts.course_id
      LEFT JOIN rooms r ON r.room_id = ts.room_id
      WHERE ${employeeFilterSql}
        AND ($2::text IS NULL OR ts.term = $2 OR ts.term IS NULL)
      ORDER BY ts.day_of_week ASC, ts.time_start ASC
    `

    const examSql = `
      SELECT
        es.*,
        sub.full_name AS substitute_employee_name
      FROM exam_schedules es
      LEFT JOIN employees sub ON sub.employee_id = es.substitute_employee_id
      WHERE ${examEmployeeFilterSql}
        AND (
          $2::text IS NULL
          OR es.term = $2
          OR es.term IS NULL
          OR (
            $2::text IS NOT NULL
            AND lower(replace(replace(es.term, '-', '_'), ' ', '_')) = $2
          )
          OR (
            $2::text = '1st_term'
            AND es.term IS NOT NULL
            AND (lower(es.term) LIKE '%1st%' OR lower(es.term) LIKE '%first%')
          )
          OR (
            $2::text = '2nd_term'
            AND es.term IS NOT NULL
            AND (lower(es.term) LIKE '%2nd%' OR lower(es.term) LIKE '%second%')
          )
          OR (
            $2::text = 'summer'
            AND es.term IS NOT NULL
            AND lower(es.term) LIKE '%summer%'
          )
          OR ($5::int IS NOT NULL AND es.term_id = $5)
          OR (
            $3::date IS NOT NULL
            AND $4::date IS NOT NULL
            AND es.exam_date IS NOT NULL
            AND es.exam_date BETWEEN $3::date AND $4::date
          )
        )
      ORDER BY es.day_of_week ASC, es.time_start ASC
    `

    const queryEmployeeParam = isBulkRequest ? employeeIds : employeeId

    const [teaching, exam] = await Promise.all([
      dbQuery(teachingSql, [queryEmployeeParam, termToUse]),
      dbQuery(examSql, [queryEmployeeParam, termToUse, termStart, termEnd, termId]),
    ])

    return NextResponse.json({ teaching, exam })
  } catch (error: any) {
    console.error('[GET /api/schedules/employee] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch employee schedules' },
      { status: 500 }
    )
  }
}
