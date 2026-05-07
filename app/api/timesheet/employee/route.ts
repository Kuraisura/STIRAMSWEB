import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const employeeId = Number(params.get('employee_id'))
    const startDate = String(params.get('start') || '').trim()
    const endDate = String(params.get('end') || '').trim()
    const includeAdminLogs = params.get('include_admin_logs') === 'true'

    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return NextResponse.json({ error: 'Valid employee_id is required' }, { status: 400 })
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return NextResponse.json({ error: 'start and end must be YYYY-MM-DD' }, { status: 400 })
    }

    const timesheets = await dbQuery(
      `SELECT *
       FROM faculty_timesheet
       WHERE employee_id = $1
         AND date >= $2::date
         AND date <= $3::date
       ORDER BY date ASC`,
      [employeeId, startDate, endDate]
    )

    let adminLogs: any[] = []
    if (includeAdminLogs) {
      adminLogs = await dbQuery(
        `SELECT *
         FROM admin_time_logs
         WHERE employee_id = $1
           AND date = $2::date
         ORDER BY time_start ASC`,
        [employeeId, startDate]
      )
    }

    return NextResponse.json({
      timesheets,
      admin_logs: adminLogs,
    })
  } catch (error: any) {
    console.error('[GET /api/timesheet/employee] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to fetch timesheet data' }, { status: 500 })
  }
}
