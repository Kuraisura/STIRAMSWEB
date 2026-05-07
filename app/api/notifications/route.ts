import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'
import { publishNotificationEvent } from '@/lib/notification-stream'
import { ensureAttendanceLogNotificationTrigger } from '@/lib/attendance-log-notification-trigger'
import { deriveNotificationReasonContext } from '@/lib/notification-reason-context'
import { NextRequest } from 'next/server'
import { validateSession } from '@/lib/session-manager'

type NotificationColumnsCache = {
  columns: Set<string>
  fetchedAt: number
}

let notificationColumnsCache: NotificationColumnsCache | null = null
let notificationDeleteTableEnsuredAt = 0

type NotificationWithMeta = {
  notification_id: number
  meta?: any
}

type NotificationLogRow = {
  log_id: number
  attendance_status: string | null
  is_late: boolean | null
  is_early_out: boolean | null
  log_type: 'IN' | 'OUT' | null
  notes: string | null
}

function parseMeta(meta: unknown): Record<string, any> {
  if (!meta) return {}
  if (typeof meta === 'object') return meta as Record<string, any>
  if (typeof meta === 'string') {
    try {
      return JSON.parse(meta)
    } catch {
      return {}
    }
  }
  return {}
}

async function autoEnrichNotificationReasons(items: any[], columns: Set<string>) {
  if (!Array.isArray(items) || items.length === 0) return items
  if (!columns.has('meta') || !columns.has('notification_id')) return items

  // Limit automatic enrichment work per request to keep GET responsive.
  const batch = (items as NotificationWithMeta[]).slice(0, 150)
  const logIds = Array.from(new Set(batch
    .map((n) => Number(parseMeta(n?.meta)?.log_id || 0))
    .filter((id) => Number.isFinite(id) && id > 0)))

  const logMap = new Map<number, NotificationLogRow>()
  if (logIds.length > 0) {
    const logRows = await dbQuery<NotificationLogRow>(
      `SELECT log_id, attendance_status, is_late, is_early_out, log_type, notes
       FROM attendance_logs
       WHERE log_id = ANY($1::int[])`,
      [logIds]
    )
    for (const row of logRows || []) {
      logMap.set(Number(row.log_id), row)
    }
  }

  for (const item of batch) {
    const notificationId = Number(item?.notification_id || 0)
    if (!Number.isFinite(notificationId) || notificationId <= 0) continue

    const meta = parseMeta(item?.meta)
    const hasReasonSource = String(meta?.reason_source || '').trim().length > 0
    const hasReasonDetail = String(meta?.reason_detail || '').trim().length > 0
    if (hasReasonSource || hasReasonDetail) continue

    const logId = Number(meta?.log_id || 0)
    const eventLog = Number.isFinite(logId) && logId > 0 ? logMap.get(logId) : undefined
    const reason = deriveNotificationReasonContext({
      meta,
      notes: eventLog?.notes,
      attendanceStatus: eventLog?.attendance_status,
      isLate: eventLog?.is_late,
      isEarlyOut: eventLog?.is_early_out,
      logType: eventLog?.log_type,
    })

    if (!reason.source && !reason.reason) continue

    const nextMeta = {
      ...meta,
      reason_source: reason.source,
      reason_detail: reason.reason,
    }

    try {
      await dbQuery(
        `UPDATE notifications
         SET meta = $2::jsonb
         WHERE notification_id = $1`,
        [notificationId, JSON.stringify(nextMeta)]
      )
      item.meta = nextMeta
    } catch (err) {
      console.warn('[GET /api/notifications] Failed to auto-enrich reason meta:', err)
    }
  }

  return items
}

async function getNotificationColumns(): Promise<Set<string>> {
  const now = Date.now()
  if (notificationColumnsCache && now - notificationColumnsCache.fetchedAt < 60_000) {
    return notificationColumnsCache.columns
  }

  const rows = await dbQuery<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notifications'`
  )

  const columns = new Set((rows || []).map((r) => String(r.column_name || '').trim()).filter(Boolean))
  notificationColumnsCache = { columns, fetchedAt: now }
  return columns
}

async function ensureNotificationDeleteTable(): Promise<void> {
  const now = Date.now()
  if (now - notificationDeleteTableEnsuredAt < 60_000) return

  await dbQuery(
    `CREATE TABLE IF NOT EXISTS notification_user_deletes (
       admin_id INT NOT NULL,
       notification_id INT NOT NULL,
       deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       PRIMARY KEY (admin_id, notification_id)
     )`
  )
  await dbQuery(
    `CREATE INDEX IF NOT EXISTS idx_notification_user_deletes_notification_id
       ON notification_user_deletes(notification_id)`
  )
  notificationDeleteTableEnsuredAt = now
}

async function resolveAdminId(req: Request, body?: any): Promise<number | null> {
  const bodyAdminRaw = body?.admin_id
  const bodyAdminId = bodyAdminRaw == null ? null : Number(bodyAdminRaw)
  if (bodyAdminId !== null && Number.isFinite(bodyAdminId)) {
    return bodyAdminId
  }

  try {
    const session = await validateSession(req as NextRequest)
    if (session.valid && session.user?.id && Number.isFinite(Number(session.user.id))) {
      return Number(session.user.id)
    }
  } catch {
    // best-effort fallback
  }

  return null
}

// GET /api/notifications?recipient_id=1&status=unread|all
export async function GET(req: Request) {
  try {
    await ensureAttendanceLogNotificationTrigger()
    const columns = await getNotificationColumns()
    const { searchParams } = new URL(req.url)
    const recipientIdParam = searchParams.get('recipient_id')
    const recipientType = (searchParams.get('recipient_type') || '').trim()
    const recipientId = recipientIdParam !== null && recipientIdParam !== ''
      ? Number(recipientIdParam)
      : undefined
    const status = searchParams.get('status') || 'all'
    const staffTypeFilter = (searchParams.get('staffTypeFilter') || '').trim()

    const params: unknown[] = []
    let sql = 'SELECT * FROM notifications WHERE 1=1'

    if (recipientType && columns.has('recipient_type')) {
      params.push(recipientType)
      sql += ` AND recipient_type = $${params.length}`
    }

    if (recipientId !== undefined && Number.isFinite(recipientId) && columns.has('recipient_id')) {
      if (recipientType === 'admin') {
        params.push(recipientId)
        sql += ` AND (recipient_id = $${params.length} OR recipient_id IS NULL)`
      } else {
        params.push(recipientId)
        sql += ` AND recipient_id = $${params.length}`
      }
    }

    if (
      recipientType === 'admin' &&
      recipientId !== undefined &&
      Number.isFinite(recipientId) &&
      columns.has('notification_id')
    ) {
      await ensureNotificationDeleteTable()
      params.push(recipientId)
      sql += ` AND NOT EXISTS (
        SELECT 1
        FROM notification_user_deletes nud
        WHERE nud.notification_id = notifications.notification_id
          AND nud.admin_id = $${params.length}
      )`
    }

    if (status === 'unread') {
      if (columns.has('read_at')) {
        sql += ' AND read_at IS NULL'
      } else if (columns.has('is_read')) {
        sql += ' AND (is_read IS NULL OR is_read = FALSE)'
      }
    }

    // Optional role/staff filter for notification visibility.
    // Applies only when notifications.meta contains an employee_id payload.
    if ((staffTypeFilter === 'Teaching' || staffTypeFilter === 'Non-Teaching') && columns.has('meta')) {
      params.push(staffTypeFilter)
      sql += ` AND (
        meta IS NULL
        OR NOT (meta ? 'employee_id')
        OR EXISTS (
          SELECT 1
          FROM employees e
          WHERE e.employee_id = NULLIF(regexp_replace(COALESCE(meta->>'employee_id', ''), '[^0-9]', '', 'g'), '')::int
            AND e.staff_type = $${params.length}
        )
      )`
    }

    if (columns.has('created_at')) {
      sql += ' ORDER BY created_at DESC'
    } else if (columns.has('notification_id')) {
      sql += ' ORDER BY notification_id DESC'
    }

    const items = await dbQuery(sql, params)
    await autoEnrichNotificationReasons(items, columns)
    return NextResponse.json({ items })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load notifications' }, { status: 500 })
  }
}

// POST { recipient_id, type, title, message, meta }
export async function POST(req: Request) {
  try {
    const columns = await getNotificationColumns()
    const body = await req.json()

    const valuesByColumn: Record<string, any> = {
      recipient_id: body.recipient_id ?? null,
      recipient_type: body.recipient_type || 'employee',
      notification_type: body.notification_type || body.type || 'info',
      type: body.type || body.notification_type || 'info',
      title: body.title || '',
      message: body.message || '',
      meta: body.meta ? JSON.stringify(body.meta) : null,
      source: body.source || 'system',
      channel: body.channel || 'app',
      status: body.status || 'pending',
      category: body.category || null,
      is_read: false,
      read_at: null,
    }

    const insertColumns: string[] = []
    const insertParams: unknown[] = []

    for (const [col, val] of Object.entries(valuesByColumn)) {
      if (!columns.has(col)) continue
      insertColumns.push(col)
      insertParams.push(val)
    }

    if (columns.has('created_at')) {
      insertColumns.push('created_at')
    }

    if (!insertColumns.includes('title') || !insertColumns.includes('message')) {
      return NextResponse.json({ error: 'Notifications table is missing required columns (title/message).' }, { status: 500 })
    }

    const placeholders = insertColumns.map((c, i) => (c === 'created_at' ? 'NOW()' : `$${i + 1}`)).join(', ')
    const rows = await dbQuery(
      `INSERT INTO notifications (${insertColumns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      insertParams
    )

    const created = rows[0] || null
    if (created) {
      publishNotificationEvent({
        type: 'notification-created',
        recipient_type: created.recipient_type,
        recipient_id: created.recipient_id,
        notification_id: created.notification_id,
      })
    }

    return NextResponse.json({ item: created })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to create notification' }, { status: 500 })
  }
}

// PATCH mark read { ids: number[] } (or id via ?id=)
export async function PATCH(req: Request) {
  try {
    const columns = await getNotificationColumns()
    const { searchParams } = new URL(req.url)
    const id = Number(searchParams.get('id')) || undefined
    const body = await req.json().catch(() => ({}))
    const ids: number[] = id ? [id] : Array.isArray(body?.ids) ? body.ids : []
    if (!ids.length) return NextResponse.json({ error: 'No ids' }, { status: 400 })

    if (!columns.has('notification_id')) {
      return NextResponse.json({ error: 'notifications.notification_id column is missing' }, { status: 500 })
    }

    const setParts: string[] = []
    if (columns.has('is_read')) setParts.push('is_read = TRUE')
    if (columns.has('read_at')) setParts.push('read_at = NOW()')

    if (setParts.length === 0) {
      return NextResponse.json({ items: [] })
    }
    
    console.log('[PATCH API] Marking notifications as read:', ids)
    const items = await dbQuery(
      `UPDATE notifications
       SET ${setParts.join(', ')}
       WHERE notification_id = ANY($1::int[])
       RETURNING *`,
      [ids]
    )

    console.log('[PATCH API] Result:', { count: items.length })
    return NextResponse.json({ items })
  } catch (e: any) {
    console.error('[PATCH API] Error:', e)
    return NextResponse.json({ error: e?.message || 'Failed to update notifications' }, { status: 500 })
  }
}

// DELETE delete notifications { ids: number[] } (or id via ?id=)
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = Number(searchParams.get('id')) || undefined
    const body = await req.json().catch(() => ({}))
    const deleteAllForAdmin = Boolean(body?.delete_all_for_admin)
    const adminId = await resolveAdminId(req, body)
    const includeBroadcast = Boolean(body?.include_broadcast)

    if (deleteAllForAdmin) {
      if (adminId === null || !Number.isFinite(adminId)) {
        return NextResponse.json({ error: 'admin_id is required when delete_all_for_admin is true' }, { status: 400 })
      }

      const deleteRows = await dbQuery<{ deleted: number }>(
        `WITH deleted_rows AS (
           DELETE FROM notifications
           WHERE recipient_type = 'admin'
             AND recipient_id = $1
           RETURNING notification_id
         )
         SELECT COUNT(*)::int AS deleted FROM deleted_rows`,
        [adminId]
      )

      let hiddenBroadcast = 0
      if (includeBroadcast) {
        await ensureNotificationDeleteTable()
        const hideRows = await dbQuery<{ hidden: number }>(
          `WITH broadcast_ids AS (
             SELECT n.notification_id
             FROM notifications n
             WHERE n.recipient_type = 'admin'
               AND n.recipient_id IS NULL
           ),
           hidden_rows AS (
             INSERT INTO notification_user_deletes (admin_id, notification_id, deleted_at)
             SELECT $1, b.notification_id, NOW()
             FROM broadcast_ids b
             ON CONFLICT (admin_id, notification_id) DO NOTHING
             RETURNING notification_id
           )
           SELECT COUNT(*)::int AS hidden FROM hidden_rows`,
          [adminId]
        )
        hiddenBroadcast = hideRows[0]?.hidden || 0
      }

      const deleted = deleteRows[0]?.deleted || 0
      return NextResponse.json({
        success: true,
        deleted: deleted + hiddenBroadcast,
        hard_deleted: deleted,
        hidden_broadcast: hiddenBroadcast,
        mode: 'delete_all_for_admin'
      })
    }

    const ids: number[] = id ? [id] : Array.isArray(body?.ids) ? body.ids : []
    if (!ids.length) return NextResponse.json({ error: 'No ids' }, { status: 400 })

    if (adminId === null || !Number.isFinite(adminId)) {
      return NextResponse.json({ error: 'admin_id is required for deletion' }, { status: 400 })
    }

    await ensureNotificationDeleteTable()
    console.log('[DELETE API] Attempting to delete notification IDs:', ids, 'for admin:', adminId)

    const hardDeleteRows = await dbQuery<{ deleted: number }>(
      `WITH deleted_rows AS (
         DELETE FROM notifications
         WHERE notification_id = ANY($1::int[])
           AND recipient_type = 'admin'
           AND recipient_id = $2
         RETURNING notification_id
       )
       SELECT COUNT(*)::int AS deleted FROM deleted_rows`,
      [ids, adminId]
    )

    const hideRows = await dbQuery<{ hidden: number }>(
      `WITH broadcast_matches AS (
         SELECT n.notification_id
         FROM notifications n
         WHERE n.notification_id = ANY($1::int[])
           AND n.recipient_type = 'admin'
           AND n.recipient_id IS NULL
       ),
       hidden_rows AS (
         INSERT INTO notification_user_deletes (admin_id, notification_id, deleted_at)
         SELECT $2, bm.notification_id, NOW()
         FROM broadcast_matches bm
         ON CONFLICT (admin_id, notification_id) DO NOTHING
         RETURNING notification_id
       )
       SELECT COUNT(*)::int AS hidden FROM hidden_rows`,
      [ids, adminId]
    )

    const hardDeleted = hardDeleteRows[0]?.deleted || 0
    const hidden = hideRows[0]?.hidden || 0
    const deleted = hardDeleted + hidden
    console.log('[DELETE API] Delete result:', { deleted, hardDeleted, hidden, ids, adminId })
    return NextResponse.json({ success: true, deleted, hard_deleted: hardDeleted, hidden_broadcast: hidden })
  } catch (e: any) {
    console.error('[DELETE API] Error:', e)
    return NextResponse.json({ error: e?.message || 'Failed to delete notifications', details: e }, { status: 500 })
  }
}


