import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

export const dynamic = 'force-dynamic'

type IrregularityRow = {
  employee_id: number
  full_name: string
  department: string | null
  total_present: number
  total_late: number
  total_absent: number
  total_undertime: number
  remarks: string
}

const toDaysInclusive = (start: string, end: string): string[] => {
  const s = new Date(start + 'T00:00:00+08:00')
  const e = new Date(end + 'T23:59:59.999+08:00')
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return []
  const days: string[] = []
  const c = new Date(s)
  while (c <= e) {
    const y = c.getFullYear()
    const m = String(c.getMonth() + 1).padStart(2, '0')
    const d = String(c.getDate()).padStart(2, '0')
    days.push(`${y}-${m}-${d}`)
    c.setDate(c.getDate() + 1)
  }
  return days
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const start = (searchParams.get('start') || '').substring(0, 10)
    const end = (searchParams.get('end') || '').substring(0, 10)

    if (!start || !end) {
      return NextResponse.json({ error: 'Missing start or end (YYYY-MM-DD)' }, { status: 400 })
    }

    const days = toDaysInclusive(start, end)
    if (days.length === 0) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
    }

    // Employees (only active, exclude archived)
    // CRITICAL: Strictly exclude archived employees (is_active = false)
    let employees = await dbQuery<any>(
      `SELECT employee_id, full_name, department, employment_status
       FROM employees
       WHERE employment_status IN ('active', 'Active', 'ACTIVE')
         AND (is_active IS NULL OR is_active = true)`
    )

    if (!employees || employees.length === 0) {
      // Fallback: Get all active employees (excluding archived) regardless of employment_status
      employees = await dbQuery<any>(
        `SELECT employee_id, full_name, department, employment_status
         FROM employees
         WHERE is_active IS NULL OR is_active = true`
      )
    }

    const employeeIds = (employees || []).map((e: any) => e.employee_id)
    if (employeeIds.length === 0) {
      return NextResponse.json({ items: [], meta: { start, end, days: days.length } })
    }

    // Attendance logs within range (by date column first)
    const employeePlaceholders = employeeIds.map((_, index) => `$${index + 3}`).join(', ')
    const byDate = await dbQuery<any>(
      `SELECT employee_id, date, attendance_status, is_late, is_early_out, log_type, log_time
       FROM attendance_logs
       WHERE date >= $1
         AND date <= $2
         AND employee_id IN (${employeePlaceholders})`,
      [start, end, ...employeeIds]
    )

    // Fallback by log_time window to capture rows missing date column
    const startPH = new Date(start + 'T00:00:00+08:00').toISOString()
    const endPH = new Date(end + 'T23:59:59.999+08:00').toISOString()
    const byTime = await dbQuery<any>(
      `SELECT employee_id, date, attendance_status, is_late, is_early_out, log_type, log_time
       FROM attendance_logs
       WHERE log_time >= $1
         AND log_time <= $2
         AND employee_id IN (${employeePlaceholders})`,
      [startPH, endPH, ...employeeIds]
    )

    const rows = [...(byDate || []), ...(byTime || [])] as Array<{
      employee_id: number
      date: string | null
      attendance_status?: string | null
      is_late?: boolean | null
      is_early_out?: boolean | null
      log_type?: 'IN' | 'OUT' | null
      log_time?: string | null
    }>

    // Group per employee and day
    const byEmp: Record<number, {
      name: string
      dept: string | null
      daysPresent: Set<string>
      daysLate: Set<string>
      daysUndertime: Set<string>
    }> = {}

    employees.forEach((e: any) => {
      byEmp[e.employee_id] = {
        name: e.full_name,
        dept: e.department || null,
        daysPresent: new Set(),
        daysLate: new Set(),
        daysUndertime: new Set(),
      }
    })

    const manilaDateOf = (iso: string) => (iso || '').split('T')[0]

    rows.forEach((r) => {
      const rec = byEmp[r.employee_id]
      if (!rec) return
      const d = (r.date && r.date.length >= 10) ? r.date.substring(0,10) : (r.log_time ? manilaDateOf(r.log_time) : null)
      if (!d) return

      const status = (r.attendance_status || '').toLowerCase()
      const isPresent = status === 'present' || status === 'on_time' || status === 'on-time' || r.log_type === 'IN' || r.log_type === 'OUT'
      if (isPresent) rec.daysPresent.add(d)
      if (r.is_late === true || status === 'late') rec.daysLate.add(d)
      if (r.is_early_out === true || status === 'undertime') rec.daysUndertime.add(d)
    })

    // Build result rows
    const totalDays = days.length
    const items: IrregularityRow[] = employeeIds.map((id) => {
      const rec = byEmp[id]
      if (!rec) {
        return {
          employee_id: id,
          full_name: 'Unknown',
          department: null,
          total_present: 0,
          total_late: 0,
          total_absent: totalDays,
          total_undertime: 0,
          remarks: 'No records found in cutoff.'
        }
      }
      const total_present = rec.daysPresent.size
      const total_late = rec.daysLate.size
      const total_undertime = rec.daysUndertime.size
      const total_absent = Math.max(0, totalDays - total_present)

      let remarks = 'Good attendance record.'
      if (total_absent > 3) remarks = 'Frequent absences.'
      else if (total_late > 5) remarks = 'Needs improvement in punctuality.'

      return {
        employee_id: id,
        full_name: rec.name,
        department: rec.dept,
        total_present,
        total_late,
        total_absent,
        total_undertime,
        remarks,
      }
    })

    return NextResponse.json({ items, meta: { start, end, days: totalDays } })
  } catch (e: any) {
    console.error('irregularities endpoint error:', e?.message || e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}


