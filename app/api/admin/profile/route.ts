import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'
import { validateSession } from '@/lib/session-manager'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const session = await validateSession(req)
    if (!session.valid || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rows = await dbQuery(
      `SELECT id, email, full_name, role, is_active, created_at, last_login, photo_path
       FROM admin_users
       WHERE id = $1
       LIMIT 1`,
      [session.user.id]
    )

    if (!rows[0]) {
      return NextResponse.json({ error: 'Admin user not found' }, { status: 404 })
    }

    return NextResponse.json({ user: rows[0] })
  } catch (error: any) {
    console.error('[GET /api/admin/profile] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to load profile' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await validateSession(req)
    if (!session.valid || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const fullName = body?.full_name === undefined ? undefined : String(body.full_name || '').trim()
    const email = body?.email === undefined ? undefined : String(body.email || '').trim().toLowerCase()
    const photoPath = body?.photo_path === undefined ? undefined : (body.photo_path === null ? null : String(body.photo_path || '').trim())

    if (fullName !== undefined && !fullName) {
      return NextResponse.json({ error: 'full_name cannot be empty' }, { status: 400 })
    }

    if (email !== undefined && !email) {
      return NextResponse.json({ error: 'email cannot be empty' }, { status: 400 })
    }

    const rows = await dbQuery(
      `UPDATE admin_users
       SET full_name = COALESCE($1, full_name),
           email = COALESCE($2, email),
           photo_path = CASE WHEN $3::text IS NULL AND $4::boolean = TRUE THEN NULL ELSE COALESCE($3, photo_path) END
       WHERE id = $5
       RETURNING id, email, full_name, role, is_active, created_at, last_login, photo_path`,
      [
        fullName === undefined ? null : fullName,
        email === undefined ? null : email,
        photoPath === undefined || photoPath === null ? null : photoPath,
        photoPath === null,
        session.user.id,
      ]
    )

    if (!rows[0]) {
      return NextResponse.json({ error: 'Admin user not found' }, { status: 404 })
    }

    return NextResponse.json({ user: rows[0] })
  } catch (error: any) {
    console.error('[PUT /api/admin/profile] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to update profile' }, { status: 500 })
  }
}
