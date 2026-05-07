import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const page = Math.max(1, Number(params.get('page') || 1))
    const limit = Math.min(200, Math.max(1, Number(params.get('limit') || 50)))
    const offset = (page - 1) * limit

    const actionType = (params.get('actionType') || 'all').trim()
    const userType = (params.get('userType') || 'all').trim()
    const archiveEventsOnly = (params.get('archiveEventsOnly') || 'false').trim() === 'true'
    const dateFrom = (params.get('dateFrom') || '').trim()
    const dateTo = (params.get('dateTo') || '').trim()
    const search = (params.get('search') || '').trim()

    const conditions: string[] = []
    const values: unknown[] = []

    if (actionType && actionType !== 'all' && actionType !== 'archive_auto_closed') {
      values.push(actionType)
      conditions.push(`action_type = $${values.length}`)
    }

    if (actionType === 'archive_auto_closed') {
      conditions.push(`COALESCE(metadata->>'archive_transition', '') = 'active_to_archived'`)
    }

    if (userType && userType !== 'all') {
      values.push(userType)
      conditions.push(`user_type = $${values.length}`)
    }

    if (archiveEventsOnly) {
      conditions.push(`COALESCE(metadata->>'archive_transition', '') = 'active_to_archived'`)
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      values.push(`${dateFrom}T00:00:00`)
      conditions.push(`created_at >= $${values.length}::timestamp`)
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      values.push(`${dateTo}T23:59:59`)
      conditions.push(`created_at <= $${values.length}::timestamp`)
    }

    if (search) {
      values.push(`%${search}%`)
      const idx = values.length
      conditions.push(`(
        COALESCE(user_name, '') ILIKE $${idx}
        OR COALESCE(user_email, '') ILIKE $${idx}
        OR COALESCE(action_type, '') ILIKE $${idx}
        OR COALESCE(description, '') ILIKE $${idx}
      )`)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const countRows = await dbQuery<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM log_trail ${whereClause}`,
      values
    )
    const totalCount = countRows[0]?.count || 0

    const dataValues = [...values, limit, offset]
    const logs = await dbQuery(
      `SELECT *
       FROM log_trail
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${dataValues.length - 1}
       OFFSET $${dataValues.length}`,
      dataValues
    )

    return NextResponse.json({ logs, totalCount, page, limit })
  } catch (error: any) {
    console.error('[GET /api/log-trail] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to fetch logs' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const id = Number(body?.id)
    const clearAll = Boolean(body?.clearAll)
    const confirmText = String(body?.confirmText || '')

    if (Number.isFinite(id) && id > 0) {
      const rows = await dbQuery<{ id: number }>(
        `DELETE FROM log_trail WHERE id = $1 RETURNING id`,
        [id]
      )
      if (!rows[0]) {
        return NextResponse.json({ error: 'Log entry not found' }, { status: 404 })
      }
      return NextResponse.json({ success: true, deleted: 1 })
    }

    if (clearAll) {
      if (confirmText !== 'DELETE ALL LOGS') {
        return NextResponse.json({ error: 'Invalid confirmation text' }, { status: 400 })
      }
      const rows = await dbQuery<{ count: number }>(
        `WITH deleted AS (
          DELETE FROM log_trail RETURNING id
        )
        SELECT COUNT(*)::int AS count FROM deleted`
      )
      return NextResponse.json({ success: true, deleted: rows[0]?.count || 0 })
    }

    return NextResponse.json({ error: 'Provide id or clearAll=true' }, { status: 400 })
  } catch (error: any) {
    console.error('[DELETE /api/log-trail] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to delete logs' }, { status: 500 })
  }
}
