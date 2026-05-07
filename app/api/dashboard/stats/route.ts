import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

export const dynamic = 'force-dynamic'

type EmployeeRow = {
  employee_id: number
  start_date: string | null
  hire_date: string | null
  department: string | null
}

type AttendanceRow = {
  employee_id: number
  attendance_status: string | null
  is_late: boolean | null
  is_early_out: boolean | null
  log_type: string | null
  log_time: string | null
}

export async function GET(request: NextRequest) {
  try {
    const staffType = request.nextUrl.searchParams.get('staffType')
    const staffTypeFilter = staffType === 'Teaching' || staffType === 'Non-Teaching' ? staffType : null

    const today = new Date().toISOString().split('T')[0]

    const employeeRows = await dbQuery<EmployeeRow>(
      `SELECT employee_id, start_date::text, hire_date::text, department
       FROM employees
       WHERE (is_active IS NULL OR is_active = TRUE)
         AND ($1::text IS NULL OR staff_type = $1)`,
      [staffTypeFilter]
    )

    const activeStarted = employeeRows.filter((e) => {
      const startDate = e.start_date || e.hire_date
      if (!startDate) return true
      return startDate <= today
    })

    const workNotStartedCount = employeeRows.length - activeStarted.length
    const employeeIds = employeeRows.map((e) => e.employee_id)

    let attendanceRows: AttendanceRow[] = []
    if (employeeIds.length > 0) {
      attendanceRows = await dbQuery<AttendanceRow>(
        `SELECT employee_id, attendance_status, is_late, is_early_out, log_type, log_time::text
         FROM attendance_logs
         WHERE date = $1::date
           AND employee_id = ANY($2::int[])`,
        [today, employeeIds]
      )
    }

    const presentSet = new Set<number>()
    const lateSet = new Set<number>()
    const onTimeSet = new Set<number>()
    const undertimeSet = new Set<number>()

    for (const row of attendanceRows) {
      const isPresent =
        row.attendance_status === 'present' ||
        row.attendance_status === 'on_time' ||
        row.attendance_status === 'on-time' ||
        row.log_type === 'IN'

      if (isPresent) {
        presentSet.add(row.employee_id)
        if (!row.is_late) onTimeSet.add(row.employee_id)
      }
      if (row.is_late) lateSet.add(row.employee_id)
      if (row.is_early_out || (row.attendance_status || '').toLowerCase().includes('undertime')) {
        undertimeSet.add(row.employee_id)
      }
    }

    let presentToday = presentSet.size
    let lateToday = lateSet.size
    let onTimeToday = onTimeSet.size
    let undertimeToday = undertimeSet.size

    const activeTotal = activeStarted.length
    if (presentToday > activeTotal) presentToday = activeTotal
    if (lateToday > presentToday) lateToday = presentToday
    if (onTimeToday > presentToday) onTimeToday = presentToday
    if (undertimeToday > presentToday) undertimeToday = presentToday

    const absentToday = attendanceRows.filter((row) => row.attendance_status === 'absent').length

    let departmentsCount = 0
    try {
      const deptRows = await dbQuery<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM departments
         WHERE is_active = TRUE`
      )
      departmentsCount = deptRows[0]?.count || 0
    } catch {
      const unique = new Set(employeeRows.map((e) => (e.department || '').trim()).filter(Boolean))
      departmentsCount = unique.size
    }

    const byEmployee: Record<number, { firstIn?: Date; lastOut?: Date }> = {}
    for (const row of attendanceRows) {
      const emp = row.employee_id
      const logTime = row.log_time ? new Date(row.log_time) : null
      if (!logTime || Number.isNaN(logTime.getTime())) continue
      if (!byEmployee[emp]) byEmployee[emp] = {}
      if (row.log_type === 'IN' && !byEmployee[emp].firstIn) {
        byEmployee[emp].firstIn = logTime
      }
      if (row.log_type === 'OUT' && (!byEmployee[emp].lastOut || byEmployee[emp].lastOut! < logTime)) {
        byEmployee[emp].lastOut = logTime
      }
    }

    const durations: number[] = []
    for (const item of Object.values(byEmployee)) {
      if (item.firstIn && item.lastOut && item.lastOut > item.firstIn) {
        durations.push((item.lastOut.getTime() - item.firstIn.getTime()) / 3600000)
      }
    }

    const avgHoursPerDay = durations.length > 0
      ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10
      : 0

    return NextResponse.json({
      totalEmployees: employeeRows.length,
      workNotStartedCount,
      activeEmployeesCount: activeStarted.length,
      presentToday,
      lateToday,
      onTimeToday,
      absentToday,
      undertimeToday,
      departmentsCount,
      avgHoursPerDay,
      pendingRequests: 0,
    })
  } catch (error: any) {
    console.error('[GET /api/dashboard/stats] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch dashboard stats' },
      { status: 500 }
    )
  }
}
