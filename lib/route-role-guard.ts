import { NextRequest } from 'next/server'
import { validateSession } from '@/lib/session-manager'
import type { LogTrailActor } from '@/lib/audit'
import {
  getGuestRecoveryCookieName,
  getRecoveryCookieName,
  verifyGuestRecoveryToken,
  verifyRecoveryToken,
} from '@/lib/recovery-access'

type SessionUser = {
  id: number
  email: string
  name: string
  role: string
}

export type RoleGuardResult =
  | { ok: true; user: SessionUser }
  | { ok: false; status: 401 | 403; error: string }

export type RecoveryConsoleAccess =
  | { ok: true; mode: 'admin'; user: SessionUser }
  | { ok: true; mode: 'guest' }
  | { ok: false; status: 401 | 403; error: string }

export async function requireRecoveryConsoleAccess(req: NextRequest): Promise<RecoveryConsoleAccess> {
  const guestToken = req.cookies.get(getGuestRecoveryCookieName())?.value
  const guestVerification = verifyGuestRecoveryToken(guestToken)
  if (guestVerification.valid) {
    return { ok: true, mode: 'guest' }
  }

  const session = await validateSession(req)
  if (!session.valid || !session.user) {
    return { ok: false, status: 401, error: 'Authentication required' }
  }

  const token = req.cookies.get(getRecoveryCookieName())?.value
  const verified = verifyRecoveryToken(token, session.user.id)
  if (!verified.valid) {
    return { ok: false, status: 403, error: 'Recovery console is locked' }
  }

  return { ok: true, mode: 'admin', user: session.user }
}

export function recoveryConsoleAuditActor(
  access: Extract<RecoveryConsoleAccess, { ok: true }>
): LogTrailActor {
  if (access.mode === 'guest') {
    return {
      user_id: 0,
      user_email: 'recovery@guest.local',
      user_name: 'Recovery console (guest unlock)',
      user_type: 'admin',
    }
  }
  return {
    user_id: access.user.id,
    user_email: access.user.email,
    user_name: access.user.name,
    user_type: 'admin',
  }
}

export function isSuperAdminRole(role: unknown): boolean {
  const normalized = String(role || '').trim().toLowerCase()
  return normalized === 'super_admin' || normalized === 'superadmin' || normalized === 'super admin'
}

export async function requireSuperAdminSession(req: NextRequest): Promise<RoleGuardResult> {
  const session = await validateSession(req)
  if (!session.valid || !session.user) {
    return { ok: false, status: 401, error: 'Authentication required' }
  }

  if (!isSuperAdminRole(session.user.role)) {
    return { ok: false, status: 403, error: 'Super-admin access required' }
  }

  return { ok: true, user: session.user }
}

/** @deprecated Prefer requireRecoveryConsoleAccess for guest-compatible checks */
export async function requireRecoveryConsoleSession(req: NextRequest): Promise<RoleGuardResult> {
  const access = await requireRecoveryConsoleAccess(req)
  if (!access.ok) return access
  if (access.mode === 'guest') {
    return {
      ok: true,
      user: { id: 0, email: 'recovery@guest.local', name: 'Recovery (guest)', role: 'recovery_guest' },
    }
  }
  return { ok: true, user: access.user }
}
