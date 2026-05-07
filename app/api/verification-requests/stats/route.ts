import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { year = new Date().getFullYear(), employee_id } = body || {}
    const start = `${year}-01-01`
    const end = `${year}-12-31`

    const settingsRows = await dbQuery<{ key: string; value: string | null }>(
      `SELECT key, value
       FROM system_settings
       WHERE key IN ('max_leaves_per_year_teaching', 'max_leaves_per_year_non_teaching')`
    )

    const settingMap = new Map<string, string>()
    for (const row of settingsRows || []) {
      settingMap.set(String(row.key || ''), String(row.value ?? ''))
    }

    const teachingLimitRaw = Number(settingMap.get('max_leaves_per_year_teaching') || '10')
    const nonTeachingLimitRaw = Number(settingMap.get('max_leaves_per_year_non_teaching') || '10')
    const teachingMaxLeaves = Number.isFinite(teachingLimitRaw) && teachingLimitRaw >= 0 ? teachingLimitRaw : 10
    const nonTeachingMaxLeaves = Number.isFinite(nonTeachingLimitRaw) && nonTeachingLimitRaw >= 0 ? nonTeachingLimitRaw : 10

    // Fetch approved leaves within the year
    const leaveParams: unknown[] = [start, end]
    let leaveEmployeeFilter = ''
    if (employee_id) {
      leaveParams.push(employee_id)
      leaveEmployeeFilter = ` AND employee_id = $${leaveParams.length}`
    }
    const leaveRows = await dbQuery<any>(
      `SELECT employee_id, leave_date, source
       FROM (
         SELECT employee_id, requested_time::date AS leave_date, 'verification'::text AS source
         FROM verification_requests
         WHERE request_type = 'leave'
           AND status = 'approved'
           AND requested_time >= $1
           AND requested_time <= $2

         UNION ALL

         SELECT employee_id, date_from::date AS leave_date, 'leave_request'::text AS source
         FROM leave_requests
         WHERE status = 'approved'
           AND date_from >= $1::date
           AND date_from <= $2::date
       ) combined
       WHERE EXISTS (
         SELECT 1 FROM employees e
         WHERE e.employee_id = combined.employee_id
           AND (e.is_active IS NULL OR e.is_active = TRUE)
       )
       ${leaveEmployeeFilter.replace(/employee_id/g, 'combined.employee_id')}`,
      leaveParams
    )

    // Group leaves per employee
    const leaveCount: Record<number, number> = {}
    ;(leaveRows || []).forEach((r: any) => {
      if (!r.employee_id) return
      leaveCount[r.employee_id] = (leaveCount[r.employee_id] || 0) + 1
    })

    // Lates and undertime from attendance_logs
    const makeDistinctCount = (rows: any[]) => {
      const set = new Set<string>()
      rows.forEach((r) => set.add(`${r.employee_id}:${r.date}`))
      return set
    }

    const lateParams: unknown[] = [start, end]
    let lateEmployeeFilter = ''
    if (employee_id) {
      lateParams.push(employee_id)
      lateEmployeeFilter = ` AND employee_id = $${lateParams.length}`
    }
    const lateRows = await dbQuery<any>(
      `SELECT employee_id, date
       FROM attendance_logs
       WHERE is_late = true
         AND date >= $1
         AND date <= $2
         AND EXISTS (
           SELECT 1 FROM employees e
           WHERE e.employee_id = attendance_logs.employee_id
             AND (e.is_active IS NULL OR e.is_active = TRUE)
         )
         ${lateEmployeeFilter}`,
      lateParams
    )

    const underParams: unknown[] = [start, end]
    let underEmployeeFilter = ''
    if (employee_id) {
      underParams.push(employee_id)
      underEmployeeFilter = ` AND employee_id = $${underParams.length}`
    }
    const underRows = await dbQuery<any>(
      `SELECT employee_id, date
       FROM attendance_logs
       WHERE is_early_out = true
         AND date >= $1
         AND date <= $2
         AND EXISTS (
           SELECT 1 FROM employees e
           WHERE e.employee_id = attendance_logs.employee_id
             AND (e.is_active IS NULL OR e.is_active = TRUE)
         )
         ${underEmployeeFilter}`,
      underParams
    )

    // Absences from attendance_daily_status if available
    let absentCount: Record<number, number> = {}
    try {
      const absParams: unknown[] = [start, end]
      let absEmployeeFilter = ''
      if (employee_id) {
        absParams.push(employee_id)
        absEmployeeFilter = ` AND employee_id = $${absParams.length}`
      }
      const absRows = await dbQuery<any>(
        `SELECT employee_id, date, status
         FROM attendance_daily_status
         WHERE status = 'Absent'
           AND date >= $1
           AND date <= $2
           AND EXISTS (
             SELECT 1 FROM employees e
             WHERE e.employee_id = attendance_daily_status.employee_id
               AND (e.is_active IS NULL OR e.is_active = TRUE)
           )
           ${absEmployeeFilter}`,
        absParams
      )
      const set = new Set<string>()
      ;(absRows || []).forEach((r: any) => set.add(`${r.employee_id}:${r.date}`))
      set.forEach((k) => {
        const [id] = k.split(':').map(Number)
        absentCount[id] = (absentCount[id] || 0) + 1
      })
    } catch {}

    const distinctLate = makeDistinctCount(lateRows || [])
    const distinctUnder = makeDistinctCount(underRows || [])

    // Build per-employee aggregates
    const employeeIds = new Set<number>()
    Object.keys(leaveCount).forEach((k) => employeeIds.add(Number(k)))
    ;(lateRows || []).forEach((r: any) => employeeIds.add(r.employee_id))
    ;(underRows || []).forEach((r: any) => employeeIds.add(r.employee_id))
    Object.keys(absentCount).forEach((k) => employeeIds.add(Number(k)))

    const employeeIdList = Array.from(employeeIds)
    const employeeMeta = employeeIdList.length
      ? await dbQuery<{ employee_id: number; staff_type: string | null }>(
          `SELECT employee_id, staff_type
           FROM employees
           WHERE employee_id = ANY($1::int[])`,
          [employeeIdList]
        )
      : []

    const employeeStaffTypeMap = new Map<number, string>()
    for (const row of employeeMeta || []) {
      employeeStaffTypeMap.set(row.employee_id, String(row.staff_type || ''))
    }

    const getMaxLeavesForStaffType = (staffType: string | null | undefined): number => {
      return String(staffType || '').toLowerCase() === 'teaching' ? teachingMaxLeaves : nonTeachingMaxLeaves
    }

    const results = employeeIdList.map((id) => {
      const leavesUsed = leaveCount[id] || 0
      const maxLeaves = getMaxLeavesForStaffType(employeeStaffTypeMap.get(id))
      const remaining = Math.max(0, maxLeaves - leavesUsed)
      const lateDays = Array.from(distinctLate).filter((k) => k.startsWith(`${id}:`)).length
      const undertimeDays = Array.from(distinctUnder).filter((k) => k.startsWith(`${id}:`)).length
      const absentDays = absentCount[id] || 0
      return {
        employee_id: id,
        max_leaves: maxLeaves,
        leaves_used: leavesUsed,
        leaves_remaining: remaining,
        late_days: lateDays,
        undertime_days: undertimeDays,
        absent_days: absentDays,
      }
    })

    const selectedMaxLeaves = (() => {
      if (!employee_id) return null
      const normalizedEmployeeId = Number(employee_id)
      const selectedStaffType = employeeStaffTypeMap.get(normalizedEmployeeId)
      return getMaxLeavesForStaffType(selectedStaffType)
    })()

    return NextResponse.json({ year, max_leaves: selectedMaxLeaves, results })
  } catch (e: any) {
    console.error('verification-requests stats error:', e?.message || e)
    return NextResponse.json({ error: 'Failed to compute stats' }, { status: 500 })
  }
}


