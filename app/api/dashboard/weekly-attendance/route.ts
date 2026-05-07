import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

export const dynamic = 'force-dynamic'

type DayStats = {
  date: string
  present: number
  late: number
  undertime: number
  absent: number
}

const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export async function GET(request: NextRequest) {
  try {
    const staffType = request.nextUrl.searchParams.get('staffType')
    const staffTypeFilter = staffType === 'Teaching' || staffType === 'Non-Teaching' ? staffType : null

    const today = new Date()
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - 6)

    const employeeRows = await dbQuery<{ employee_id: number; start_date: string | null; hire_date: string | null }>(
      `SELECT employee_id, start_date::text, hire_date::text
       FROM employees
       WHERE (is_active IS NULL OR is_active = TRUE)
         AND ($1::text IS NULL OR staff_type = $1)`,
      [staffTypeFilter]
    )

    const logs = await dbQuery<{
      employee_id: number
      date: string | null
      log_time: string | null
      attendance_status: string | null
      log_type: string | null
      is_late: boolean | null
      is_early_out: boolean | null
    }>(
      `SELECT l.employee_id, l.date::text, l.log_time::text, l.attendance_status, l.log_type, l.is_late, l.is_early_out
       FROM attendance_logs l
       INNER JOIN employees e ON e.employee_id = l.employee_id
       WHERE l.date >= $1::date
         AND l.date <= $2::date
         AND (e.is_active IS NULL OR e.is_active = TRUE)
         AND ($3::text IS NULL OR e.staff_type = $3)`,
      [weekStart.toISOString().split('T')[0], today.toISOString().split('T')[0], staffTypeFilter]
    )

    const byDate = new Map<string, {
      presentSet: Set<number>
      lateSet: Set<number>
      undertimeSet: Set<number>
    }>()

    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + i)
      const key = d.toISOString().split('T')[0]
      byDate.set(key, { presentSet: new Set(), lateSet: new Set(), undertimeSet: new Set() })
    }

    for (const row of logs) {
      const dateKey = String(row.date || '').slice(0, 10)
      const target = byDate.get(dateKey)
      if (!target) continue

      const status = String(row.attendance_status || '').toLowerCase()
      const isPresent =
        status === 'present' ||
        status === 'on_time' ||
        status === 'on-time' ||
        String(row.log_type || '').toUpperCase() === 'IN'

      if (isPresent) target.presentSet.add(row.employee_id)
      if (row.is_late) target.lateSet.add(row.employee_id)
      if (row.is_early_out || status.includes('undertime')) target.undertimeSet.add(row.employee_id)
    }

    const items: DayStats[] = []

    for (const [dateKey, sets] of byDate.entries()) {
      const startedCount = employeeRows.filter((e) => {
        const start = e.start_date || e.hire_date
        if (!start) return true
        return start <= dateKey
      }).length

      items.push({
        date: dayLabel(dateKey),
        present: sets.presentSet.size,
        late: sets.lateSet.size,
        undertime: sets.undertimeSet.size,
        absent: Math.max(0, startedCount - sets.presentSet.size),
      })
    }

    return NextResponse.json({ items })
  } catch (error: any) {
    console.error('[GET /api/dashboard/weekly-attendance] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to fetch weekly attendance' }, { status: 500 })
  }
}
