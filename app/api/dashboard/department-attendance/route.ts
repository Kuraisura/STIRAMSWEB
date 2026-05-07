import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const staffType = request.nextUrl.searchParams.get('staffType')
    const staffTypeFilter = staffType === 'Teaching' || staffType === 'Non-Teaching' ? staffType : null
    const today = new Date().toISOString().split('T')[0]

    const employees = await dbQuery<{
      employee_id: number
      department: string | null
      start_date: string | null
      hire_date: string | null
    }>(
      `SELECT employee_id, department, start_date::text, hire_date::text
       FROM employees
       WHERE (is_active IS NULL OR is_active = TRUE)
        AND ($1::text IS NULL OR staff_type = $1)`,
      [staffTypeFilter]
    )

    const logs = await dbQuery<{
      employee_id: number
      attendance_status: string | null
      is_late: boolean | null
      log_type: string | null
    }>(
      `SELECT employee_id, attendance_status, is_late, log_type
       FROM attendance_logs
       WHERE date = $1::date`,
      [today]
    )

    const byDept = new Map<string, {
      totalSet: Set<number>
      presentSet: Set<number>
      lateSet: Set<number>
    }>()

    for (const e of employees) {
      const start = e.start_date || e.hire_date
      if (start && start > today) continue

      const dept = (e.department || 'Unassigned').trim() || 'Unassigned'
      if (!byDept.has(dept)) {
        byDept.set(dept, { totalSet: new Set(), presentSet: new Set(), lateSet: new Set() })
      }
      byDept.get(dept)!.totalSet.add(e.employee_id)
    }

    const deptByEmployee = new Map<number, string>()
    for (const [dept, sets] of byDept.entries()) {
      for (const employeeId of sets.totalSet.values()) {
        deptByEmployee.set(employeeId, dept)
      }
    }

    for (const row of logs) {
      const dept = deptByEmployee.get(row.employee_id)
      if (!dept) continue

      const sets = byDept.get(dept)
      if (!sets) continue

      const status = String(row.attendance_status || '').toLowerCase()
      const isPresent =
        status === 'present' ||
        status === 'on_time' ||
        status === 'on-time' ||
        String(row.log_type || '').toUpperCase() === 'IN'

      if (isPresent) sets.presentSet.add(row.employee_id)
      if (row.is_late) sets.lateSet.add(row.employee_id)
    }

    const items = Array.from(byDept.entries())
      .map(([department, sets]) => {
        const total = sets.totalSet.size
        const present = sets.presentSet.size
        const late = sets.lateSet.size
        const attendanceRate = total > 0 ? (present / total) * 100 : 0
        const lateRate = total > 0 ? (late / total) * 100 : 0

        return {
          department,
          present,
          late,
          total,
          attendance_rate: Number(attendanceRate.toFixed(1)),
          late_rate: Number(lateRate.toFixed(1)),
        }
      })
      .sort((a, b) => b.present - a.present)

    return NextResponse.json({ items })
  } catch (error: any) {
    console.error('[GET /api/dashboard/department-attendance] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to fetch department attendance' }, { status: 500 })
  }
}
