import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const date = (params.get('date') || '').trim()
    const dateFrom = (params.get('dateFrom') || '').trim()
    const dateTo = (params.get('dateTo') || '').trim()
    const limitRaw = Number(params.get('limit') || 100)
    const staffType = (params.get('staffType') || '').trim()
    const department = (params.get('department') || '').trim()
    const employeeIdRaw = Number(params.get('employeeId') || 0)

    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50000) : 100
    const dateFilter = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
    const dateFromFilter = /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? dateFrom : null
    const dateToFilter = /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? dateTo : null
    const staffTypeFilter = staffType === 'Teaching' || staffType === 'Non-Teaching' ? staffType : null
    const departmentFilter = department || null
    const employeeIdFilter = Number.isFinite(employeeIdRaw) && employeeIdRaw > 0 ? employeeIdRaw : null

    const rows = await dbQuery(
      `
      WITH logs_enriched AS (
        SELECT
          l.*,
          COALESCE(
            NULLIF(l.date::text, '')::date,
            (l.log_time AT TIME ZONE 'Asia/Manila')::date,
            l.log_time::date
          ) AS local_date
        FROM attendance_logs l
      )
      SELECT
        l.*,
        l.local_date::text AS date,
        json_build_object(
          'full_name', e.full_name,
          'department', e.department,
          'staff_type', e.staff_type,
          'school_id', e.school_id,
          'is_active', e.is_active,
          'schedule_time_in', e.schedule_time_in,
          'schedule_time_out', e.schedule_time_out
        ) AS employees
      FROM logs_enriched l
      INNER JOIN employees e ON e.employee_id = l.employee_id
      WHERE (e.is_active IS NULL OR e.is_active = TRUE)
        AND ($1::text IS NULL OR l.local_date::text = $1)
        AND ($2::text IS NULL OR e.staff_type = $2)
        AND ($3::int IS NULL OR l.employee_id = $3)
        AND ($4::text IS NULL OR e.department = $4)
        AND ($5::text IS NULL OR l.local_date::text >= $5)
        AND ($6::text IS NULL OR l.local_date::text <= $6)
      ORDER BY l.local_date ASC, l.log_time ASC
      LIMIT $7
      `,
      [
        dateFilter,
        staffTypeFilter,
        employeeIdFilter,
        departmentFilter,
        dateFromFilter,
        dateToFilter,
        limit,
      ]
    )

    return NextResponse.json(rows)
  } catch (error: any) {
    console.error('[GET /api/attendance/logs] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to fetch attendance logs' }, { status: 500 })
  }
}
