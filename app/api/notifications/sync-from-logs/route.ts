import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

type AttendanceLogRow = {
  log_id: number
  employee_id: number
  log_type: 'IN' | 'OUT'
  log_time: string
  date: string | null
  attendance_status: string | null
  is_late: boolean | null
  is_early_out: boolean | null
  full_name: string | null
  employee_code: string | null
}

// POST /api/notifications/sync-from-logs
// Deletes all existing notifications and recreates them from attendance_logs
export async function POST(req: Request) {
  try {
    // Step 1: Delete all existing notifications
    console.log('[Sync Notifications] Deleting all existing notifications...')
    await dbQuery('DELETE FROM notifications')
    
    console.log('[Sync Notifications] All notifications deleted successfully')

    // Step 2: Get all attendance logs with employee info
    console.log('[Sync Notifications] Fetching attendance logs...')
    const logs = await dbQuery<AttendanceLogRow>(
      `SELECT
        l.log_id,
        l.employee_id,
        l.log_type,
        l.log_time,
        l.date,
        l.attendance_status,
        l.is_late,
        l.is_early_out,
        l.is_admin_time,
        e.full_name,
        e.employee_id::text AS employee_code
       FROM attendance_logs l
       LEFT JOIN employees e ON e.employee_id = l.employee_id
       ORDER BY l.log_time DESC`
    )

    if (!logs || logs.length === 0) {
      return NextResponse.json({ 
        success: true,
        message: 'No attendance logs found',
        deleted: 0,
        created: 0
      })
    }

    console.log(`[Sync Notifications] Found ${logs.length} attendance logs`)

    // Step 3: Get all active admin users
    const adminUsers = await dbQuery<{ id: number; full_name: string | null; email: string | null }>(
      `SELECT id, full_name, email
       FROM admin_users
       WHERE is_active = TRUE`
    )

    if (!adminUsers || adminUsers.length === 0) {
      return NextResponse.json({
        error: 'No active admin users found',
      }, { status: 500 })
    }

    console.log(`[Sync Notifications] Found ${adminUsers.length} active admin users`)

    // Step 4: Create notifications from attendance logs
    const notificationsToCreate: any[] = []
    const PHILIPPINES_TIMEZONE = 'Asia/Manila'

    for (const log of logs) {
      const employee = {
        full_name: log.full_name,
        employee_id: log.employee_code,
      }
      if (!employee) continue

      const logType = log.log_type
      const statusRaw = String(log.attendance_status || '').toLowerCase()
      const isAdminTime = Boolean(log.is_admin_time) || statusRaw.includes('admin')
      const isLate = log.is_late || statusRaw === 'late'
      const isEarlyOut = log.is_early_out || statusRaw === 'undertime'
      const logTime = log.log_time ? new Date(log.log_time) : new Date()
      
      // Format time
      const timeDisplay = logTime.toLocaleString('en-US', {
        hour12: true,
        hour: 'numeric',
        minute: '2-digit',
        timeZone: PHILIPPINES_TIMEZONE
      })
      
      // Determine status text
      let statusText = ''
      if (isAdminTime) {
        statusText = ' (Admin Time)'
      } else if (statusRaw === 'absent') {
        statusText = ' (Absent)'
      } else if (isLate) {
        statusText = ' (Late)'
      } else if (isEarlyOut) {
        statusText = ' (Undertime)'
      } else {
        statusText = ' (On-Time)'
      }
      
      const notificationType = isLate ? 'late_arrival' : 'attendance'
      const title = logType === 'IN' ? 'Employee IN' : 'Employee OUT'
      const actionText = logType === 'IN' ? 'has tapped in' : 'has tapped out'
      const message = `${employee.full_name} ${actionText} at ${timeDisplay}${statusText}`
      
      // Create notification for each admin
      for (const admin of adminUsers) {
        notificationsToCreate.push({
          recipient_id: admin.id,
          recipient_type: 'admin',
          notification_type: notificationType,
          type: notificationType,
          title: title,
          message: message,
          meta: {
            log_id: log.log_id,
            log_type: logType,
            employee_id: employee.employee_id,
            employee_name: employee.full_name,
            is_late: isLate,
            is_early_out: isEarlyOut,
            attendance_status: log.attendance_status,
            time: timeDisplay
          },
          source: 'rfid',
          channel: 'system',
          status: 'pending',
          created_at: logTime.toISOString()
        })
      }
    }

    if (notificationsToCreate.length === 0) {
      return NextResponse.json({ 
        success: true,
        message: 'No notifications to create',
        deleted: 0,
        created: 0
      })
    }

    console.log(`[Sync Notifications] Creating ${notificationsToCreate.length} notifications...`)

    // Step 5: Insert notifications in batches to avoid timeout
    const BATCH_SIZE = 100
    let totalCreated = 0
    const errors: any[] = []

    for (let i = 0; i < notificationsToCreate.length; i += BATCH_SIZE) {
      const batch = notificationsToCreate.slice(i, i + BATCH_SIZE)
      try {
        for (const notif of batch) {
          await dbQuery(
            `INSERT INTO notifications (
              recipient_id, recipient_type, notification_type, type,
              title, message, meta, source, channel, status, created_at
            ) VALUES (
              $1, $2, $3, $4,
              $5, $6, $7::jsonb, $8, $9, $10, $11
            )`,
            [
              notif.recipient_id,
              notif.recipient_type,
              notif.notification_type,
              notif.type,
              notif.title,
              notif.message,
              JSON.stringify(notif.meta || {}),
              notif.source,
              notif.channel,
              notif.status,
              notif.created_at,
            ]
          )
          totalCreated += 1
        }
        console.log(`[Sync Notifications] Batch ${i / BATCH_SIZE + 1} created: ${batch.length} notifications`)
      } catch (insertError: any) {
        console.error(`[Sync Notifications] Error inserting batch ${i / BATCH_SIZE + 1}:`, insertError)
        errors.push({ batch: i / BATCH_SIZE + 1, error: insertError?.message || 'Unknown insert error' })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Notifications synced from attendance logs',
      deleted: 'all',
      created: totalCreated,
      logs_processed: logs.length,
      admins_notified: adminUsers.length,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (e: any) {
    console.error('[Sync Notifications] Exception:', e)
    return NextResponse.json({ 
      error: e?.message || 'Unknown error',
      stack: e?.stack
    }, { status: 500 })
  }
}

