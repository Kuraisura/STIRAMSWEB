import { NextRequest, NextResponse } from 'next/server'
import { validateSession } from '@/lib/session-manager'
import {
  getGuestRecoveryCookieName,
  getRecoveryCookieName,
  verifyGuestRecoveryToken,
  verifyRecoveryToken,
} from '@/lib/recovery-access'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const guestTok = req.cookies.get(getGuestRecoveryCookieName())?.value
    const gv = verifyGuestRecoveryToken(guestTok)
    if (gv.valid) {
      return NextResponse.json({
        authenticated: false,
        unlocked: true,
        guestMode: true,
        expiresAt: gv.exp ?? null,
      })
    }

    const session = await validateSession(req)
    if (!session.valid || !session.user) {
      return NextResponse.json({
        authenticated: false,
        unlocked: false,
        guestMode: false,
        expiresAt: null,
      })
    }

    const token = req.cookies.get(getRecoveryCookieName())?.value
    const verification = verifyRecoveryToken(token, session.user.id)

    return NextResponse.json({
      authenticated: true,
      unlocked: verification.valid,
      guestMode: false,
      expiresAt: verification.valid ? verification.exp : null,
    })
  } catch (error: any) {
    console.error('[GET /api/recovery/status] Error:', error)
    return NextResponse.json({ authenticated: false, unlocked: false, guestMode: false, error: error?.message || 'Failed to check recovery status' }, { status: 500 })
  }
}
