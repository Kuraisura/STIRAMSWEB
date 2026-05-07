import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await dbQuery(
      `SELECT *
       FROM subjects
       WHERE is_active = TRUE
       ORDER BY name ASC`
    )

    return NextResponse.json(rows)
  } catch (error: any) {
    console.error('[GET /api/subjects] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to load subjects' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const name = String(body?.name || '').trim()
    const description = body?.description ? String(body.description).trim() : null
    const department = body?.department ? String(body.department).trim() : null

    if (!name) {
      return NextResponse.json({ error: 'Subject name is required' }, { status: 400 })
    }

    const existing = await dbQuery<{ subject_id: number }>(
      `SELECT subject_id
       FROM subjects
       WHERE LOWER(name) = LOWER($1)
       LIMIT 1`,
      [name]
    )

    if (existing.length > 0) {
      const updated = await dbQuery(
        `UPDATE subjects
         SET
           name = $1,
           description = $2,
           department = $3,
           is_active = TRUE,
           updated_at = CURRENT_TIMESTAMP
         WHERE subject_id = $4
         RETURNING *`,
        [name, description, department, existing[0].subject_id]
      )

      return NextResponse.json(updated[0])
    }

    const inserted = await dbQuery(
      `INSERT INTO subjects (name, description, department, is_active)
       VALUES ($1, $2, $3, TRUE)
       RETURNING *`,
      [name, description, department]
    )

    return NextResponse.json(inserted[0])
  } catch (error: any) {
    console.error('[POST /api/subjects] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to save subject' },
      { status: 500 }
    )
  }
}
