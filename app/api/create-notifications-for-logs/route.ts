import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

// POST /api/create-notifications-for-logs
// Creates notifications for existing attendance logs that don't have notifications yet
// Body: { log_ids: number[] } or empty to process recent logs
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const logIds = body.log_ids || []

    // Get recent attendance logs (or specific log IDs)
    let logs: any[] = []
    if (Array.isArray(logIds) && logIds.length > 0) {
      const placeholders = logIds.map((_: any, index: number) => `$${index + 1}`).join(', ')
      logs = await dbQuery<any>(
        `SELECT
           al.log_id,
           al.employee_id,
           al.log_type,
           al.log_time,
           al.attendance_status,
           al.is_late,
           al.is_early_out,
           al.is_admin_time,
           e.full_name AS employee_full_name
         FROM attendance_logs al
         LEFT JOIN employees e ON e.employee_id = al.employee_id
         WHERE al.log_id IN (${placeholders})
         ORDER BY al.log_time DESC`,
        logIds
      )
    } else {
      logs = await dbQuery<any>(
        `SELECT
           al.log_id,
           al.employee_id,
           al.log_type,
           al.log_time,
           al.attendance_status,
           al.is_late,
           al.is_early_out,
           al.is_admin_time,
           e.full_name AS employee_full_name
         FROM attendance_logs al
         LEFT JOIN employees e ON e.employee_id = al.employee_id
         ORDER BY al.log_time DESC
         LIMIT 50`
      )
    }
    
    if (!logs || logs.length === 0) {
      return NextResponse.json({ 
        message: 'No attendance logs found',
        created: 0
      })
    }
    
    // Get all active admin users
    const adminUsers = await dbQuery<any>(
      `SELECT id, full_name, email
       FROM admin_users
       WHERE is_active = true`
    )

    if (!adminUsers || adminUsers.length === 0) {
      return NextResponse.json({ 
        error: 'No active admin users found',
      }, { status: 500 })
    }
    
    // Check which logs already have notifications
    const logIdsArray = logs.map(l => l.log_id).filter(Boolean)
    const existingNotifs = await dbQuery<{ meta: any }>(
      `SELECT meta
       FROM notifications
       WHERE recipient_type = 'admin'
         AND notification_type IN ('attendance', 'late_arrival')
         AND meta IS NOT NULL`
    )
    
    const existingLogIds = new Set(
      (existingNotifs || [])
        .map(n => {
          try {
            const meta = typeof n.meta === 'string' ? JSON.parse(n.meta) : n.meta
            return meta?.log_id
          } catch {
            return null
          }
        })
        .filter(Boolean)
    )
    
    // Create notifications for logs that don't have them yet
    const notificationsToCreate: any[] = []
    
    for (const log of logs) {
      if (existingLogIds.has(log.log_id)) {
        continue // Skip if notification already exists
      }
      
      if (!log.employee_full_name) continue
      
      const logType = log.log_type
      const statusRaw = String(log.attendance_status || '').toLowerCase()
      const isAdminTime = Boolean(log.is_admin_time) || statusRaw.includes('admin')
      const isAbsent = statusRaw === 'absent'
      const isLate = log.is_late || statusRaw === 'late'
      const isUndertime = log.is_early_out || statusRaw === 'undertime'
      const logTime = log.log_time ? new Date(log.log_time) : new Date()
      
      // Format time
      const timeDisplay = logTime.toLocaleString('en-US', {
        hour12: true,
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Manila'
      })
      
      const notificationType = isLate ? 'late_arrival' : 'attendance'
      const title = logType === 'IN' ? 'Employee IN' : 'Employee OUT'
      const actionText = logType === 'IN' ? 'has tapped in' : 'has tapped out'
      const statusText = isAdminTime
        ? ' (Admin Time)'
        : isAbsent
          ? ' (Absent)'
          : isLate
            ? ' (Late)'
            : isUndertime
              ? ' (Undertime)'
              : ' (On-Time)'
      const message = `${log.employee_full_name} ${actionText} at ${timeDisplay}${statusText}`
      
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
            employee_id: log.employee_id,
            employee_name: log.employee_full_name,
            is_late: isLate,
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
        message: 'All logs already have notifications',
        created: 0,
        checked: logs.length
      })
    }
    
    // Insert notifications
    const inserted: any[] = []
    for (const n of notificationsToCreate) {
      const rows = await dbQuery<any>(
        `INSERT INTO notifications (
           recipient_id,
           recipient_type,
           notification_type,
           type,
           title,
           message,
           meta,
           source,
           channel,
           status,
           created_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
         )
         RETURNING notification_id, recipient_id, title, message`,
        [
          n.recipient_id,
          n.recipient_type,
          n.notification_type,
          n.type,
          n.title,
          n.message,
          JSON.stringify(n.meta),
          n.source,
          n.channel,
          n.status,
          n.created_at,
        ]
      )
      if (rows[0]) inserted.push(rows[0])
    }
    
    return NextResponse.json({
      success: true,
      created: inserted?.length || 0,
      checked_logs: logs.length,
      notifications: inserted?.slice(0, 5).map(n => ({
        id: n.notification_id || n.id,
        recipient_id: n.recipient_id,
        title: n.title,
        message: n.message
      }))
    })
  } catch (e: any) {
    return NextResponse.json({ 
      error: e?.message || 'Unknown error',
      stack: e?.stack
    }, { status: 500 })
  }
}

// GET endpoint to check recent logs without notifications
export async function GET() {
  try {
    // Get recent attendance logs
    const logs = await dbQuery<any>(
      `SELECT
         al.log_id,
         al.employee_id,
         al.log_type,
         al.log_time,
         al.is_late,
         e.full_name AS employee_full_name
       FROM attendance_logs al
       LEFT JOIN employees e ON e.employee_id = al.employee_id
       ORDER BY al.log_time DESC
       LIMIT 10`
    )
    
    // Get notifications with meta
    const notifs = await dbQuery<{ meta: any }>(
      `SELECT meta
       FROM notifications
       WHERE recipient_type = 'admin'
         AND meta IS NOT NULL
       LIMIT 100`
    )
    
    const existingLogIds = new Set(
      (notifs || [])
        .map(n => {
          try {
            const meta = typeof n.meta === 'string' ? JSON.parse(n.meta) : n.meta
            return meta?.log_id
          } catch {
            return null
          }
        })
        .filter(Boolean)
    )
    
    const logsWithoutNotifs = (logs || []).filter(l => !existingLogIds.has(l.log_id))
    
    return NextResponse.json({
      success: true,
      recent_logs: logs?.length || 0,
      logs_without_notifications: logsWithoutNotifs.length,
      logs: logsWithoutNotifs.slice(0, 5).map(l => ({
        log_id: l.log_id,
        employee: l.employee_full_name,
        log_type: l.log_type,
        log_time: l.log_time
      }))
    })
  } catch (e: any) {
    return NextResponse.json({ 
      error: e?.message || 'Unknown error'
    }, { status: 500 })
  }
}

