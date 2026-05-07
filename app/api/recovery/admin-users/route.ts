import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'
import { recordLogTrailChange, getAuditContext } from '@/lib/audit'
import { revokeAllUserSessions } from '@/lib/session-manager'
import { recoveryConsoleAuditActor, requireRecoveryConsoleAccess } from '@/lib/route-role-guard'

export const dynamic = 'force-dynamic'

async function requireRecoveryAccess(req: NextRequest) {
  const access = await requireRecoveryConsoleAccess(req)
  if (!access.ok) return access
  return { ok: true as const, actor: recoveryConsoleAuditActor(access) }
}

async function resolvePasswordColumn(): Promise<'password' | 'password_hash' | 'hashed_password'> {
  const rows = await dbQuery<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'admin_users'
       AND column_name IN ('password', 'password_hash', 'hashed_password')
     ORDER BY CASE column_name
       WHEN 'password' THEN 1
       WHEN 'password_hash' THEN 2
       WHEN 'hashed_password' THEN 3
       ELSE 99
     END
     LIMIT 1`
  )

  const col = rows[0]?.column_name
  if (col === 'password' || col === 'password_hash' || col === 'hashed_password') return col
  throw new Error('No supported password column found in admin_users')
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireRecoveryAccess(req)
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const admins = await dbQuery<{
      id: number
      full_name: string
      email: string
      role: string | null
      is_active: boolean
    }>(
      `SELECT id, full_name, email, role, COALESCE(is_active, true) AS is_active
       FROM admin_users
       ORDER BY full_name ASC`
    )

    return NextResponse.json({ admins })
  } catch (error: any) {
    console.error('[GET /api/recovery/admin-users] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to fetch admin users' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireRecoveryAccess(req)
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const body = await req.json().catch(() => ({}))
    const adminId = Number(body?.admin_id)
    const newPassword = String(body?.new_password || '')

    if (!Number.isFinite(adminId) || adminId <= 0) {
      return NextResponse.json({ error: 'Valid admin_id is required' }, { status: 400 })
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long' }, { status: 400 })
    }

    const beforeRows = await dbQuery<{ id: number; email: string; full_name: string; role: string | null }>(
      `SELECT id, email, full_name, role
       FROM admin_users
       WHERE id = $1
       LIMIT 1`,
      [adminId]
    )
    const before = beforeRows[0]

    if (!before) {
      return NextResponse.json({ error: 'Admin user not found' }, { status: 404 })
    }

    const bcryptjs = require('bcryptjs')
    const hashed = await bcryptjs.hash(newPassword, 12)
    const passwordColumn = await resolvePasswordColumn()

    if (passwordColumn === 'password') {
      await dbQuery(`UPDATE admin_users SET password = $1 WHERE id = $2`, [hashed, adminId])
    } else if (passwordColumn === 'password_hash') {
      await dbQuery(`UPDATE admin_users SET password_hash = $1 WHERE id = $2`, [hashed, adminId])
    } else {
      await dbQuery(`UPDATE admin_users SET hashed_password = $1 WHERE id = $2`, [hashed, adminId])
    }

    // Force immediate logout of the target admin by revoking all active sessions.
    await revokeAllUserSessions(adminId)
    await dbQuery('UPDATE admin_users SET current_session_id = NULL WHERE id = $1', [adminId])

    await recordLogTrailChange({
        actor: access.actor,
      action: 'update:admin_password_recovery',
      table: 'admin_users',
      recordId: adminId,
      description: `Recovery console reset password for admin ${before.email}`,
      context: getAuditContext(req),
      extra: {
        recovery_console: true,
        target_admin_id: adminId,
        target_admin_email: before.email,
        forced_logout: true,
      },
    })

    return NextResponse.json({ success: true, message: 'Admin password updated securely' })
  } catch (error: any) {
    console.error('[POST /api/recovery/admin-users] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to reset admin password' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const access = await requireRecoveryAccess(req)
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const body = await req.json().catch(() => ({}))
    const adminId = Number(body?.admin_id)
    const email = String(body?.email || '').trim().toLowerCase()

    if (!Number.isFinite(adminId) || adminId <= 0) {
      return NextResponse.json({ error: 'Valid admin_id is required' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 })
    }

    const beforeRows = await dbQuery<{ id: number; email: string | null; full_name: string }>(
      `SELECT id, email, full_name
       FROM admin_users
       WHERE id = $1
       LIMIT 1`,
      [adminId]
    )
    const before = beforeRows[0]
    if (!before) {
      return NextResponse.json({ error: 'Admin user not found' }, { status: 404 })
    }

    const duplicateRows = await dbQuery<{ id: number }>(
      `SELECT id
       FROM admin_users
       WHERE LOWER(COALESCE(email, '')) = $1
         AND id <> $2
       LIMIT 1`,
      [email, adminId]
    )

    if (duplicateRows.length > 0) {
      return NextResponse.json({ error: 'Email address is already used by another admin account' }, { status: 409 })
    }

    await dbQuery(`UPDATE admin_users SET email = $1 WHERE id = $2`, [email, adminId])

    await recordLogTrailChange({
        actor: access.actor,
      action: 'update:admin_email_recovery',
      table: 'admin_users',
      recordId: adminId,
      description: `Recovery console updated admin email for ${before.full_name}`,
      context: getAuditContext(req),
      extra: {
        recovery_console: true,
        target_admin_id: adminId,
        old_email: before.email,
        new_email: email,
      },
    })

    return NextResponse.json({ success: true, message: 'Admin email updated successfully' })
  } catch (error: any) {
    console.error('[PATCH /api/recovery/admin-users] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to update admin email' }, { status: 500 })
  }
}
