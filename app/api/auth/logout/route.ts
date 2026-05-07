/**
 * ============================================================================
 * Secure Logout API Route
 * ============================================================================
 * - Reads the session from the HttpOnly cookie (no spoofable headers).
 * - Revokes the server-side session in the DB.
 * - Clears all auth cookies (new + legacy).
 * - Logs the event to audit trail.
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateSession, destroySession } from '@/lib/session-manager'
import { recordLogTrailChange, getAuditContext } from '@/lib/audit'

export async function POST(request: NextRequest) {
  try {
    // Validate the session from the HttpOnly cookie — no headers needed
    const session = await validateSession(request)

    // Log to audit trail (even if session is expired, try to get user info)
    if (session.valid && session.user) {
      try {
        const context = getAuditContext(request)
        await recordLogTrailChange({
          actor: {
            user_id: session.user.id,
            user_email: session.user.email,
            user_name: session.user.name,
            user_type: 'admin',
          },
          action: 'logout',
          table: 'admin_users',
          description: `${session.user.name} logged out`,
          context,
          extra: {
            logout_method: 'user_initiated',
            timestamp: new Date().toISOString(),
          },
        })
      } catch {
        // Don't fail logout if audit logging fails
      }
    }

    // Destroy the session and clear ALL cookies (new + legacy)
    const response = await destroySession(request)

    console.log(
      '[Logout API] Session destroyed for user:',
      session.user?.email ?? 'unknown'
    )

    return response
  } catch (error) {
    console.error('[Logout API] Error:', error)

    // Even on error, clear cookies
    const response = NextResponse.json(
      { success: true, message: 'Logged out' },
      { status: 200 }
    )

    // Clear all possible auth cookies
    const cookieNames = ['rams_sid', 'rams_csrf', 'rams_auth', 'rams_user_id', 'rams_user_email']
    for (const name of cookieNames) {
      response.cookies.set(name, '', { path: '/', maxAge: 0 })
    }

    return response
  }
}

