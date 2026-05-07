import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const code = String(body?.code || '').trim().toUpperCase()

    if (!code) {
      return NextResponse.json({ error: 'Course code is required' }, { status: 400 })
    }

    const existing = await dbQuery(
      `SELECT *
       FROM courses
       WHERE code = $1
       LIMIT 1`,
      [code]
    )

    if (existing[0]) {
      return NextResponse.json(existing[0])
    }

    const inserted = await dbQuery(
      `INSERT INTO courses (code)
       VALUES ($1)
       RETURNING *`,
      [code]
    )

    return NextResponse.json(inserted[0])
  } catch (error: any) {
    console.error('[POST /api/courses] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to save course' },
      { status: 500 }
    )
  }
}
