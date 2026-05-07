import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

// Debug endpoint - blocked in production
export async function GET(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const adminId = searchParams.get('admin_id')
    
    const allNotifications = await dbQuery<any>(
      `SELECT notification_id, recipient_id, recipient_type, title, created_at
       FROM notifications
       ORDER BY created_at DESC
       LIMIT 50`
    )
    
    let adminSpecificNotifications: any[] = []
    if (adminId) {
      adminSpecificNotifications = await dbQuery<any>(
        `SELECT notification_id, recipient_id, recipient_type, title, created_at
         FROM notifications
         WHERE recipient_type = 'admin'
           AND recipient_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [parseInt(adminId)]
      )
    }
    
    return NextResponse.json({
      success: true,
      total: allNotifications?.length || 0,
      admin_specific: adminSpecificNotifications.length,
      notifications: allNotifications?.slice(0, 10)
    })
  } catch (e: any) {
    console.error('[Debug Notifications] Error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
