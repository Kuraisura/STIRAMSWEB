import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const limitRaw = Number(request.nextUrl.searchParams.get('limit') || 10)
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 10

    const rows = await dbQuery<any>(
      `SELECT
         COALESCE(l.attendance_log_id, l.log_id) AS id,
         l.employee_id,
         l.date::text AS log_date,
         l.log_time::text AS log_time,
         l.log_type,
         l.attendance_status,
         l.is_late,
         e.full_name,
         e.department
       FROM attendance_logs l
       LEFT JOIN employees e ON e.employee_id = l.employee_id
       ORDER BY COALESCE(l.log_time, l.created_at, NOW()) DESC
       LIMIT $1`,
      [limit]
    )

    const items = rows.map((log: any) => {
      let type = 'check_in'
      let status = 'on_time'
      let details = 'Regular check-in'

      if (String(log.log_type || '').toUpperCase() === 'OUT') {
        type = 'check_out'
        details = 'Regular checkout'
      }

      if (String(log.attendance_status || '').toLowerCase() === 'absent') {
        type = 'absence'
        status = 'absent'
        details = 'No check-in recorded'
      } else if (log.is_late) {
        status = 'late'
        details = 'Arrived late'
      }

      const timeIso = log.log_time || `${log.log_date || new Date().toISOString().split('T')[0]}T00:00:00.000Z`

      return {
        id: Number(log.id) || 0,
        type,
        employee: log.full_name || 'Unknown Employee',
        department: log.department || 'Unknown Department',
        time: timeIso,
        status,
        details,
      }
    })

    return NextResponse.json({ items })
  } catch (error: any) {
    console.error('[GET /api/dashboard/recent-activity] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch recent activity' },
      { status: 500 }
    )
  }
}
