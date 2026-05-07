import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await dbQuery(
      `SELECT *
       FROM employment_statuses
       WHERE is_active = TRUE
       ORDER BY name ASC`
    )
    return NextResponse.json(rows)
  } catch (error: any) {
    console.error('[GET /api/employment-statuses] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to load employment statuses' },
      { status: 500 }
    )
  }
}
