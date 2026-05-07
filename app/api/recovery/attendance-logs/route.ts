import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'
import { recordLogTrailChange, getAuditContext } from '@/lib/audit'
import { recoveryConsoleAuditActor, requireRecoveryConsoleAccess } from '@/lib/route-role-guard'

export const dynamic = 'force-dynamic'

async function requireRecoveryAccess(req: NextRequest) {
  const access = await requireRecoveryConsoleAccess(req)
  if (!access.ok) return access
  return { ok: true as const, actor: recoveryConsoleAuditActor(access) }
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireRecoveryAccess(req)
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const params = req.nextUrl.searchParams
    const dateFrom = (params.get('dateFrom') || '').trim()
    const dateTo = (params.get('dateTo') || '').trim()
    const search = (params.get('search') || '').trim()
    const requestedStaffType = (params.get('staffType') || '').trim()
    const staffTypeFilter = requestedStaffType === 'Teaching' || requestedStaffType === 'Non-Teaching'
      ? requestedStaffType
      : null
    const limit = Math.min(500, Math.max(1, Number(params.get('limit') || 200)))

    const values: any[] = []
    const conditions: string[] = []

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      values.push(`${dateFrom}T00:00:00`)
      conditions.push(`l.log_time >= $${values.length}::timestamp`)
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      values.push(`${dateTo}T23:59:59`)
      conditions.push(`l.log_time <= $${values.length}::timestamp`)
    }
    if (search) {
      values.push(`%${search}%`)
      const idx = values.length
      conditions.push(`(
        COALESCE(e.full_name, '') ILIKE $${idx}
        OR COALESCE(e.department, '') ILIKE $${idx}
        OR COALESCE(l.rfid_code, '') ILIKE $${idx}
        OR COALESCE(l.attendance_status, '') ILIKE $${idx}
      )`)
    }

    if (staffTypeFilter) {
      values.push(staffTypeFilter)
      conditions.push(`e.staff_type = $${values.length}`)
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    values.push(limit)

    const rows = await dbQuery<any>(
      `SELECT
         l.log_id,
         l.employee_id,
         l.rfid_code,
         l.date,
         l.log_time,
         l.log_type,
         l.attendance_status,
         l.is_late,
         l.is_early_out,
         l.notes,
         e.full_name,
         e.department,
         e.school_id
       FROM attendance_logs l
       LEFT JOIN employees e ON e.employee_id = l.employee_id
       ${whereClause}
       ORDER BY l.log_time DESC
       LIMIT $${values.length}`,
      values
    )

    return NextResponse.json({ logs: rows })
  } catch (error: any) {
    console.error('[GET /api/recovery/attendance-logs] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to fetch attendance logs' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const access = await requireRecoveryAccess(req)
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const body = await req.json().catch(() => ({}))
    const logId = Number(body?.log_id)

    if (!Number.isFinite(logId) || logId <= 0) {
      return NextResponse.json({ error: 'Valid log_id is required' }, { status: 400 })
    }

    const beforeRows = await dbQuery<any>('SELECT * FROM attendance_logs WHERE log_id = $1 LIMIT 1', [logId])
    const before = beforeRows[0]
    if (!before) {
      return NextResponse.json({ error: 'Attendance log not found' }, { status: 404 })
    }

    const updateFields: string[] = []
    const values: any[] = []

    const allowed: string[] = ['log_type', 'attendance_status', 'notes', 'is_late', 'is_early_out']
    for (const key of allowed) {
      if (body[key] !== undefined) {
        values.push(body[key])
        updateFields.push(`${key} = $${values.length}`)
      }
    }

    const requestedDate = String(body?.date || '').trim()
    const requestedTime = String(body?.time || '').trim()
    const hasDate = requestedDate.length > 0
    const hasTime = requestedTime.length > 0

    if (hasDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return NextResponse.json({ error: 'Invalid date format. Expected YYYY-MM-DD.' }, { status: 400 })
    }
    if (hasTime && !/^\d{2}:\d{2}$/.test(requestedTime)) {
      return NextResponse.json({ error: 'Invalid time format. Expected HH:MM.' }, { status: 400 })
    }

    if (hasDate || hasTime) {
      const existingDate = String(before?.date || '').slice(0, 10)
      const existingTimeMatch = String(before?.log_time || '').match(/T(\d{2}:\d{2})/)
      const existingTime = existingTimeMatch?.[1] || '00:00'

      const finalDate = hasDate ? requestedDate : existingDate
      const finalTime = hasTime ? requestedTime : existingTime

      values.push(finalDate)
      updateFields.push(`date = $${values.length}::date`)

      values.push(`${finalDate} ${finalTime}:00`)
      updateFields.push(`log_time = $${values.length}::timestamp`)
    }

    if (updateFields.length === 0) {
      return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 })
    }

    values.push(logId)
    const updatedRows = await dbQuery<any>(
      `UPDATE attendance_logs
       SET ${updateFields.join(', ')},
           updated_at = NOW()
       WHERE log_id = $${values.length}
       RETURNING *`,
      values
    )

    const updated = updatedRows[0]

    await recordLogTrailChange({
      actor: access.actor,
      action: 'update:attendance_logs_recovery',
      table: 'attendance_logs',
      recordId: logId,
      oldValue: before,
      newValue: updated,
      description: `Recovery console updated attendance log ${logId}`,
      context: getAuditContext(req),
      extra: { recovery_console: true },
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error: any) {
    console.error('[PATCH /api/recovery/attendance-logs] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to update attendance log' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const access = await requireRecoveryAccess(req)
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const body = await req.json().catch(() => ({}))
    const logId = Number(body?.log_id)

    if (!Number.isFinite(logId) || logId <= 0) {
      return NextResponse.json({ error: 'Valid log_id is required' }, { status: 400 })
    }

    const beforeRows = await dbQuery<any>('SELECT * FROM attendance_logs WHERE log_id = $1 LIMIT 1', [logId])
    const before = beforeRows[0]
    if (!before) {
      return NextResponse.json({ error: 'Attendance log not found' }, { status: 404 })
    }

    await dbQuery('DELETE FROM attendance_logs WHERE log_id = $1', [logId])

    await recordLogTrailChange({
      actor: access.actor,
      action: 'delete:attendance_logs_recovery',
      table: 'attendance_logs',
      recordId: logId,
      oldValue: before,
      description: `Recovery console deleted attendance log ${logId}`,
      context: getAuditContext(req),
      extra: { recovery_console: true },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[DELETE /api/recovery/attendance-logs] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to delete attendance log' }, { status: 500 })
  }
}
