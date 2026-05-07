import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'
import { hasWorkStarted } from '@/lib/attendance-helpers'

export const dynamic = 'force-dynamic'

type EmployeeRow = {
  employee_id: string
  full_name: string
  staff_type: string | null
  schedule_time_in: string | null
  schedule_time_out: string | null
  start_date: string | null
  hire_date: string | null
}

type LogRow = {
  employee_id: string
  date: string | null
  log_time: string | null
  status: string | null
  attendance_status?: string | null
  log_type?: string | null
  is_late?: boolean | null
  is_early_out?: boolean | null
  hours_worked: number | null
  late_hours: number | null
  undertime_hours: number | null
  overtime_hours: number | null
}

function toMinutes(timeValue?: string | null): number | null {
  if (!timeValue) return null
  const match = String(timeValue).match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hh = Number(match[1])
  const mm = Number(match[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  return hh * 60 + mm
}

function getDateKey(value: any): string | null {
  if (!value) return null
  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    const local = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Manila' }))
    const y = local.getFullYear()
    const m = String(local.getMonth() + 1).padStart(2, '0')
    const day = String(local.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  } catch {
    return null
  }
}

function getTimeMinutesFromLog(value: any): number | null {
  if (!value) return null
  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    const local = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Manila' }))
    return local.getHours() * 60 + local.getMinutes()
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const date = (params.get('date') || '').trim()
    const staffType = (params.get('staffType') || '').trim()

    const dateFilter = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
    const staffTypeFilter = staffType === 'Teaching' || staffType === 'Non-Teaching' ? staffType : null

    const employees = await dbQuery<EmployeeRow>(
      `
      SELECT
        employee_id,
        full_name,
        staff_type,
        schedule_time_in,
        schedule_time_out,
        start_date,
        hire_date
      FROM employees
      WHERE (is_active IS NULL OR is_active = TRUE)
        AND ($1::text IS NULL OR staff_type = $1)
      `,
      [staffTypeFilter]
    )

    const attendanceCols = await dbQuery<{ column_name: string }>(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'attendance_logs'
      `
    )

    const colSet = new Set(attendanceCols.map((c) => String(c.column_name).toLowerCase()))
    const hasCol = (name: string) => colSet.has(name.toLowerCase())

    const selectCols = [
      'employee_id',
      'date',
      'log_time',
      hasCol('attendance_status') ? 'attendance_status' : 'NULL::text AS attendance_status',
      hasCol('status') ? 'status' : 'NULL::text AS status',
      hasCol('log_type') ? 'log_type' : 'NULL::text AS log_type',
      hasCol('is_late') ? 'is_late' : 'NULL::boolean AS is_late',
      hasCol('is_early_out') ? 'is_early_out' : 'NULL::boolean AS is_early_out',
      hasCol('hours_worked') ? 'hours_worked' : 'NULL::numeric AS hours_worked',
      hasCol('late_hours') ? 'late_hours' : 'NULL::numeric AS late_hours',
      hasCol('undertime_hours') ? 'undertime_hours' : 'NULL::numeric AS undertime_hours',
      hasCol('overtime_hours') ? 'overtime_hours' : 'NULL::numeric AS overtime_hours',
    ]

    const logs = await dbQuery<LogRow>(
      `
      SELECT
        ${selectCols.join(',\n        ')}
      FROM attendance_logs
      WHERE ($1::text IS NULL OR (
        date::text = $1
        OR (log_time AT TIME ZONE 'Asia/Manila')::date::text = $1
      ))
      `,
      [dateFilter]
    )

    const logsByEmployee = new Map<string, LogRow[]>()
    for (const log of logs) {
      const key = String(log.employee_id)
      const list = logsByEmployee.get(key) || []
      list.push(log)
      logsByEmployee.set(key, list)
    }

    const targetDate = dateFilter || getDateKey(new Date())

    let totalActive = 0
    let present = 0
    let late = 0
    let undertime = 0
    let overtime = 0
    let absent = 0
    let workNotStarted = 0

    for (const emp of employees) {
      totalActive += 1
      const empLogs = logsByEmployee.get(String(emp.employee_id)) || []

      // CRITICAL: "Work has not started" is based on start_date/hire_date, not on whether logs exist.
      // If the selected date is before the employee's start date, they must be counted here and excluded from other buckets.
      const startedForTarget = targetDate ? hasWorkStarted(targetDate, emp.start_date, emp.hire_date) : true
      if (!startedForTarget) {
        workNotStarted += 1
        continue
      }

      const sameDayLogs = empLogs.filter((l) => {
        if (targetDate && l.date && String(l.date) === targetDate) return true
        if (targetDate && l.log_time && getDateKey(l.log_time) === targetDate) return true
        return !targetDate
      })

      if (sameDayLogs.length === 0) {
        continue
      }

      const hasExplicitAbsent = sameDayLogs.some((l) => {
        const attendanceStatus = (l.attendance_status || l.status || '').toLowerCase()
        return attendanceStatus === 'absent'
      })
      if (hasExplicitAbsent) {
        absent += 1
        continue
      }

      present += 1

      const hasLate = sameDayLogs.some((l) => {
        if (l.is_late) return true
        if ((l.late_hours || 0) > 0) return true
        const attendanceStatus = (l.attendance_status || l.status || '').toLowerCase()
        if (attendanceStatus.includes('late')) return true

        const inMinutes = toMinutes(emp.schedule_time_in)
        const logMinutes = getTimeMinutesFromLog(l.log_time)
        return inMinutes != null && logMinutes != null && logMinutes > inMinutes
      })
      if (hasLate) late += 1

      const hasUndertime = sameDayLogs.some((l) => {
        if (l.is_early_out) return true
        if ((l.undertime_hours || 0) > 0) return true
        const attendanceStatus = (l.attendance_status || l.status || '').toLowerCase()
        return attendanceStatus.includes('undertime')
      })
      if (hasUndertime) undertime += 1

      const hasOvertime = sameDayLogs.some((l) => {
        if ((l.overtime_hours || 0) > 0) return true
        const attendanceStatus = (l.attendance_status || l.status || '').toLowerCase()
        return attendanceStatus.includes('overtime')
      })
      if (hasOvertime) overtime += 1
    }

    const activeStarted = Math.max(0, totalActive - workNotStarted)

    return NextResponse.json({
      totalActive,
      present,
      late,
      absent,
      undertime,
      overtime,
      workNotStarted,
      totalEmployees: totalActive,
      presentToday: present,
      lateToday: late,
      absentToday: absent,
      undertimeToday: undertime,
      activeStarted,
    })
  } catch (error: any) {
    console.error('[GET /api/attendance/summary] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to fetch attendance summary' }, { status: 500 })
  }
}
