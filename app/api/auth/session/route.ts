/**
 * ============================================================================
 * Session Validation API Route
 * ============================================================================
 * Called by the client on page load to check if the session is still valid.
 * Returns user data if authenticated.
 *
 * Also handles session token rotation — if the session has been active for
 * longer than the rotation interval, a new token is issued and set in the
 * response cookie.
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  validateSession,
  maybeRotateSession,
  AUTH_COOKIE_NAME,
  shouldUseSecureCookies,
} from '@/lib/session-manager'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await validateSession(req)

    if (!session.valid || !session.user) {
      // If displaced by another login, return a specific signal so the client
      // can show a friendly message instead of a generic "session expired" error.
      if (session.displaced) {
        return NextResponse.json(
          {
            authenticated: false,
            displaced: true,
            error: 'You have been logged out because a new login was detected on another device.',
          },
          { status: 401 }
        )
      }
      return NextResponse.json(
        { authenticated: false, error: session.error },
        { status: 401 }
      )
    }

    // Build response
    const responseBody = {
      authenticated: true,
      user: session.user,
    }

    const response = NextResponse.json(responseBody)

    // Try session rotation (transparent to client)
    if (session.sessionId) {
      try {
        const newToken = await maybeRotateSession(req, session.sessionId)
        if (newToken) {
          response.cookies.set(AUTH_COOKIE_NAME, newToken, {
            httpOnly: true,
            secure: shouldUseSecureCookies(req),
            sameSite: 'strict',
            path: '/',
          })
        }
      } catch {
        // Rotation failure is non-fatal
      }
    }

    return response
  } catch (error) {
    console.error('[Session API] Validation error:', error)
    return NextResponse.json(
      { authenticated: false, error: 'Session validation failed' },
      { status: 401 }
    )
  }
}
