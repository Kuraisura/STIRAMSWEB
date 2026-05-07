import { NextRequest, NextResponse } from 'next/server'
import { validateSession, shouldUseSecureCookies } from '@/lib/session-manager'
import {
  getGuestRecoveryCookieName,
  getRecoveryCookieName,
  verifyGuestRecoveryToken,
} from '@/lib/recovery-access'
import { recordLogTrailChange, getAuditContext } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const session = await validateSession(req)
    const guestTok = req.cookies.get(getGuestRecoveryCookieName())?.value
    const guestOk = verifyGuestRecoveryToken(guestTok).valid

    if (!session.valid || !session.user) {
      if (!guestOk) {
        return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
      }
    }

    const response = NextResponse.json({ success: true })

    response.cookies.set(getRecoveryCookieName(), '', {
      httpOnly: true,
      secure: shouldUseSecureCookies(req),
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    })
    response.cookies.set(getGuestRecoveryCookieName(), '', {
      httpOnly: true,
      secure: shouldUseSecureCookies(req),
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    })

    const ctx = getAuditContext(req)
    if (session.valid && session.user) {
      await recordLogTrailChange({
        actor: {
          user_id: session.user.id,
          user_email: session.user.email,
          user_name: session.user.name,
          user_type: 'admin',
        },
        action: 'lock:recovery_console',
        table: 'recovery_console',
        description: `Recovery console locked by ${session.user.name}`,
        context: ctx,
      })
    } else {
      await recordLogTrailChange({
        actor: {
          user_id: 0,
          user_email: 'recovery@guest.local',
          user_name: 'Recovery console (guest lock)',
          user_type: 'admin',
        },
        action: 'lock:recovery_console_guest',
        table: 'recovery_console',
        description: 'Recovery console locked (guest session)',
        context: ctx,
      })
    }

    return response
  } catch (error: any) {
    console.error('[POST /api/recovery/lock] Error:', error)
    return NextResponse.json({ success: false, error: error?.message || 'Failed to lock recovery console' }, { status: 500 })
  }
}
