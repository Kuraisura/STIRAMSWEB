import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

let notificationsColumnsCache: { cols: Set<string>; ts: number } | null = null

async function getNotificationColumns(): Promise<Set<string>> {
  const now = Date.now()
  if (notificationsColumnsCache && now - notificationsColumnsCache.ts < 60_000) {
    return notificationsColumnsCache.cols
  }

  const rows = await dbQuery<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'notifications'`
  )
  const cols = new Set((rows || []).map(r => String(r.column_name || '').trim()).filter(Boolean))
  notificationsColumnsCache = { cols, ts: now }
  return cols
}

// POST /api/notifications/mark-all-read
// Mark all unread notifications as read for a specific admin
export async function POST(req: Request) {
  try {
    const columns = await getNotificationColumns()
    const hasReadAt = columns.has('read_at')
    const hasIsRead = columns.has('is_read')
    const hasNotificationId = columns.has('notification_id')
    const hasRecipientType = columns.has('recipient_type')
    const hasRecipientId = columns.has('recipient_id')

    if (!hasNotificationId || !hasRecipientType || !hasRecipientId) {
      return NextResponse.json({
        success: false,
        error: 'notifications table is missing required columns for mark-all-read'
      }, { status: 500 })
    }

    const setParts: string[] = []
    if (hasIsRead) setParts.push('is_read = TRUE')
    if (hasReadAt) setParts.push('read_at = NOW()')
    if (setParts.length === 0) {
      return NextResponse.json({ success: true, marked: 0, admin_specific: 0, broadcast: 0 })
    }

    const unreadClause = hasReadAt
      ? 'read_at IS NULL'
      : '(is_read IS NULL OR is_read = FALSE)'

    const body = await req.json().catch(() => ({}))
    const adminId = body.admin_id || null

    console.log('[Mark All Read API] Marking all as read for admin:', adminId)

    // Update notifications for specific admin (if adminId provided)
    let adminSpecificMarked = 0
    if (adminId !== null && adminId !== undefined) {
      const rows1 = await dbQuery(
        `UPDATE notifications
         SET ${setParts.join(', ')}
         WHERE recipient_type = 'admin'
           AND recipient_id = $1
           AND ${unreadClause}
         RETURNING notification_id`,
        [adminId]
      )

      adminSpecificMarked = rows1.length
      console.log(`[Mark All Read API] Marked ${adminSpecificMarked} admin-specific notifications as read`)
    }

    // Update broadcast notifications (null recipient_id) for all admins
    const rows2 = await dbQuery(
      `UPDATE notifications
       SET ${setParts.join(', ')}
       WHERE recipient_type = 'admin'
         AND recipient_id IS NULL
         AND ${unreadClause}
       RETURNING notification_id`
    )

    const broadcastMarked = rows2.length
    const totalMarked = adminSpecificMarked + broadcastMarked
    console.log(`[Mark All Read API] Successfully marked ${totalMarked} notifications as read`)

    return NextResponse.json({
      success: true,
      marked: totalMarked,
      admin_specific: adminSpecificMarked,
      broadcast: broadcastMarked
    })
  } catch (e: any) {
    console.error('[Mark All Read API] Exception:', e)
    return NextResponse.json({
      error: e?.message || 'Failed to mark all notifications as read',
      details: e
    }, { status: 500 })
  }
}

