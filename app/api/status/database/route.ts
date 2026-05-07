import { NextResponse } from 'next/server'
import { dbHealthCheck } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/status/database - Check database connectivity
export async function GET() {
  try {
    const connected = await dbHealthCheck()

    if (!connected) {
      return NextResponse.json({
        status: 'error',
        connected: false,
        message: 'Database connection failed',
      })
    }

    return NextResponse.json({
      status: 'connected',
      connected: true,
      message: 'Database connected successfully',
    })
  } catch (e: any) {
    return NextResponse.json({
      status: 'error',
      connected: false,
      message: e?.message || 'Database check failed',
    }, { status: 500 })
  }
}

