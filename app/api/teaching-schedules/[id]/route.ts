import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = Number(params.id)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid teaching schedule id' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const action = String(body?.action || '').trim().toLowerCase()

    if (action === 'substitute') {
      const substituteEmployeeId = Number(body?.substitute_employee_id)
      const unavailableReason = body?.unavailable_reason ? String(body.unavailable_reason).trim() : null
      const substitutedBy = Number.isFinite(Number(body?.substituted_by)) ? Number(body.substituted_by) : null
      const substitutionDate = body?.substitution_date ? String(body.substitution_date).trim() : null

      if (!Number.isFinite(substituteEmployeeId) || substituteEmployeeId <= 0) {
        return NextResponse.json({ error: 'Valid substitute_employee_id is required' }, { status: 400 })
      }

      const rows = await dbQuery(
        `UPDATE teaching_schedules
         SET status = 'substituted',
             substitute_employee_id = $1,
             unavailable_reason = $2,
             substituted_at = NOW(),
             substituted_by = $3,
             substitution_date = COALESCE($4::date, substitution_date)
         WHERE schedule_id = $5
         RETURNING *`,
        [substituteEmployeeId, unavailableReason, substitutedBy, substitutionDate, id]
      )

      if (!rows[0]) {
        return NextResponse.json({ error: 'Teaching schedule not found' }, { status: 404 })
      }

      return NextResponse.json(rows[0])
    }

    if (action === 'remove-substitution') {
      const rows = await dbQuery(
        `UPDATE teaching_schedules
         SET status = 'available',
             substitute_employee_id = NULL,
             unavailable_reason = NULL,
             substituted_at = NULL,
             substituted_by = NULL,
             substitution_date = NULL
         WHERE schedule_id = $1
         RETURNING *`,
        [id]
      )

      if (!rows[0]) {
        return NextResponse.json({ error: 'Teaching schedule not found' }, { status: 404 })
      }

      return NextResponse.json(rows[0])
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
  } catch (error: any) {
    console.error('[PATCH /api/teaching-schedules/[id]] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to update teaching schedule' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = Number(params.id)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid teaching schedule id' }, { status: 400 })
    }

    const result = await dbQuery(
      'DELETE FROM teaching_schedules WHERE schedule_id = $1 RETURNING schedule_id',
      [id]
    )

    if (!result || result.length === 0) {
      return NextResponse.json({ error: 'Teaching schedule not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, schedule_id: id })
  } catch (error: any) {
    console.error('[DELETE /api/teaching-schedules/[id]] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to delete teaching schedule' },
      { status: 500 }
    )
  }
}