import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

// Test endpoint to create a notification manually
// Protected: only available in development mode
export async function POST(req: Request) {
  // Block in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  try {
    const body = await req.json()
    const adminId = body.admin_id || 1
    
    const testNotification = {
      recipient_id: adminId,
      recipient_type: 'admin',
      notification_type: 'test',
      type: 'test',
      title: 'Test Notification',
      message: 'This is a test notification created at ' + new Date().toISOString(),
      source: 'test',
      channel: 'system',
      status: 'pending',
      created_at: new Date().toISOString()
    }
    
    try {
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
          testNotification.recipient_id,
          testNotification.recipient_type,
          testNotification.notification_type,
          testNotification.type,
          testNotification.title,
          testNotification.message,
          testNotification.source,
          testNotification.channel,
          testNotification.status,
          testNotification.created_at,
        ]
      )
    } catch (error) {
      console.error('[Test Notification] Error:', error)
      return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true,
      message: 'Test notification created successfully!'
    })
  } catch (e: any) {
    console.error('[Test Notification] Exception:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET endpoint - blocked in production
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  return NextResponse.json({
    status: 'Test endpoint available (development only)'
  })
}
