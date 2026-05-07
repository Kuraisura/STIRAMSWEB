import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

// Test endpoint - blocked in production
export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  try {
    const adminIds = [1, 2, 3]
    const testNotifications = adminIds.map(adminId => ({
      recipient_id: adminId,
      recipient_type: 'admin',
      notification_type: 'test',
      type: 'test',
      title: `Test Notification for Admin ${adminId}`,
      message: `This is a test notification created at ${new Date().toLocaleString()}`,
      source: 'test',
      channel: 'system',
      status: 'pending',
      created_at: new Date().toISOString()
    }))
    
    let created = 0
    try {
      for (const n of testNotifications) {
        await dbQuery(
          `INSERT INTO notifications (
             recipient_id,
             recipient_type,
             notification_type,
             type,
             title,
             message,
             source,
             channel,
             status,
             created_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
           )`,
          [
            n.recipient_id,
            n.recipient_type,
            n.notification_type,
            n.type,
            n.title,
            n.message,
            n.source,
            n.channel,
            n.status,
            n.created_at,
          ]
        )
        created++
      }
    } catch (error) {
      console.error('[Test Notifications All] Error:', error)
      return NextResponse.json({ error: 'Failed to create notifications' }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true,
      created,
      message: `Successfully created ${created} test notifications`
    })
  } catch (e: any) {
    console.error('[Test Notifications All] Exception:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET endpoint to check recent notifications
export async function GET() {
  try {
    // Get recent admin notifications
    const data = await dbQuery<any>(
      `SELECT notification_id, recipient_id, recipient_type, title, created_at
       FROM notifications
       WHERE recipient_type = 'admin'
         AND recipient_id IN (1, 2, 3)
       ORDER BY created_at DESC
       LIMIT 20`
    )
    
    return NextResponse.json({ 
      success: true,
      count: data?.length || 0,
      notifications: data,
      error: null
    })
  } catch (e: any) {
    return NextResponse.json({ 
      error: e?.message || 'Unknown error'
    }, { status: 500 })
  }
}
