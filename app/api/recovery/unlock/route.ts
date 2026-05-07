import { NextRequest, NextResponse } from 'next/server'
import { validateSession, shouldUseSecureCookies } from '@/lib/session-manager'
import {
  getGuestRecoveryCookieName,
  getRecoveryCookieName,
  hasRecoverySecretConfigured,
  issueGuestRecoveryToken,
  issueRecoveryToken,
  verifyRecoveryPassphrase,
} from '@/lib/recovery-access'
import { recordLogTrailChange, getAuditContext } from '@/lib/audit'
import {
  clearRecoveryUnlockFailures,
  getRecoveryUnlockFailureClientKey,
  getRecoveryUnlockLockoutStatus,
  recordRecoveryUnlockFailure,
} from '@/lib/recovery-unlock-lockout'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const clientIp = getRecoveryUnlockFailureClientKey(req)

  try {
    if (!hasRecoverySecretConfigured()) {
      return NextResponse.json({ success: false, error: 'Recovery secret is not configured' }, { status: 500 })
    }

    const lockCheck = getRecoveryUnlockLockoutStatus(clientIp)
    if (lockCheck.blocked) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many failed attempts. Try again in ${lockCheck.retryAfterSec} second(s).`,
          retryAfterSec: lockCheck.retryAfterSec,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(lockCheck.retryAfterSec) },
        }
      )
    }

    const body = await req.json().catch(() => ({}))
    const passphrase = String(body?.passphrase || '')

    const session = await validateSession(req)

    if (!verifyRecoveryPassphrase(passphrase)) {
      const afterFail = recordRecoveryUnlockFailure(clientIp)
      const ctx = getAuditContext(req)

      if (session.valid && session.user) {
        await recordLogTrailChange({
          actor: {
            user_id: session.user.id,
            user_email: session.user.email,
            user_name: session.user.name,
            user_type: 'admin',
          },
          action: 'unlock_failed:recovery_console',
          table: 'recovery_console',
          description: `Failed recovery unlock attempt by ${session.user.name}`,
          context: ctx,
        })
      } else {
        await recordLogTrailChange({
          actor: {
            user_id: 0,
            user_email: 'recovery@guest.local',
            user_name: 'Recovery console (guest attempt)',
            user_type: 'admin',
          },
          action: 'unlock_failed:recovery_console_guest',
          table: 'recovery_console',
          description: 'Failed guest recovery unlock attempt',
          context: ctx,
        })
      }

      if (afterFail.blocked) {
        return NextResponse.json(
          {
            success: false,
            error: `Too many failed attempts. Try again in ${afterFail.retryAfterSec} second(s).`,
            retryAfterSec: afterFail.retryAfterSec,
          },
          {
            status: 429,
            headers: { 'Retry-After': String(afterFail.retryAfterSec) },
          }
        )
      }

      return NextResponse.json({ success: false, error: 'Invalid recovery passphrase' }, { status: 403 })
    }

    clearRecoveryUnlockFailures(clientIp)

    /** Guest unlock: signed-in admins are not required. */
    if (!session.valid || !session.user) {
      let guestToken: string
      try {
        guestToken = issueGuestRecoveryToken()
      } catch {
        return NextResponse.json({ success: false, error: 'Recovery secret is not configured' }, { status: 500 })
      }

      const response = NextResponse.json({ success: true, guestMode: true })
      response.cookies.set(getRecoveryCookieName(), '', {
        httpOnly: true,
        secure: shouldUseSecureCookies(req),
        sameSite: 'strict',
        path: '/',
        maxAge: 0,
      })
      response.cookies.set(getGuestRecoveryCookieName(), guestToken, {
        httpOnly: true,
        secure: shouldUseSecureCookies(req),
        sameSite: 'strict',
        path: '/',
        maxAge: 30 * 60,
      })

      await recordLogTrailChange({
        actor: {
          user_id: 0,
          user_email: 'recovery@guest.local',
          user_name: 'Recovery console (guest unlock)',
          user_type: 'admin',
        },
        action: 'unlock:recovery_console_guest',
        table: 'recovery_console',
        description: 'Recovery console unlocked via guest passphrase',
        context: getAuditContext(req),
      })

      return response
    }

    /** Admin unlock (existing behaviour): tie cookie to logged-in admin id. */
    const token = issueRecoveryToken(session.user.id)
    const response = NextResponse.json({ success: true, guestMode: false })

    response.cookies.set(getGuestRecoveryCookieName(), '', {
      httpOnly: true,
      secure: shouldUseSecureCookies(req),
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    })

    response.cookies.set(getRecoveryCookieName(), token, {
      httpOnly: true,
      secure: shouldUseSecureCookies(req),
      sameSite: 'strict',
      path: '/',
      maxAge: 30 * 60,
    })

    await recordLogTrailChange({
      actor: {
        user_id: session.user.id,
        user_email: session.user.email,
        user_name: session.user.name,
        user_type: 'admin',
      },
      action: 'unlock:recovery_console',
      table: 'recovery_console',
      description: `Recovery console unlocked by ${session.user.name}`,
      context: getAuditContext(req),
    })

    return response
  } catch (error: any) {
    console.error('[POST /api/recovery/unlock] Error:', error)
    return NextResponse.json({ success: false, error: error?.message || 'Failed to unlock recovery console' }, { status: 500 })
  }
}
