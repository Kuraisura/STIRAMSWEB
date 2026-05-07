/**
 * ============================================================================
 * Secure Login API Route
 * ============================================================================
 * Replaces the insecure client-side authentication with a server-side flow:
 *
 *   1. Brute-force check  → reject if locked
 *   2. Credential verify  → bcrypt via database RPC
 *   3. Session create     → HMAC-signed token in HttpOnly cookie
 *   4. CSRF token issue   → returned in response + non-HttpOnly cookie
 *   5. Audit log          → success/failure recorded
 *
 * The client should call this endpoint via POST, then store the returned
 * user object and csrfToken in React state — NOT in localStorage.
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAuthSession } from '@/lib/session-manager'
import {
  checkLoginAllowed,
  recordFailedAttempt,
  recordSuccessfulLogin,
  withBruteForceProtection,
} from '@/lib/brute-force-protection'
import { recordLogTrailChange, getAuditContext } from '@/lib/audit'

async function loginHandler(req: NextRequest): Promise<NextResponse> {
  let email = ''

  try {
    const body = await req.json()
    email = (body.email ?? '').trim().toLowerCase()
    const password = body.password ?? ''
    const rememberMe = body.rememberMe === true

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    // Create session (handles credential check + cookie setting)
    const { response, result } = await createAuthSession(req, email, password, rememberMe)

    if (!result.success) {
      // Record failed attempt for brute-force tracking
      await recordFailedAttempt(email, req)

      // Audit log
      try {
        const context = getAuditContext(req)
        await recordLogTrailChange({
          actor: {
            user_email: email,
            user_name: 'Unknown',
            user_type: 'admin',
          },
          action: 'login_failed',
          table: 'admin_users',
          description: `Failed login attempt for ${email}`,
          context,
          extra: {
            reason: result.error,
            timestamp: new Date().toISOString(),
          },
        })
      } catch { /* best-effort */ }

      return response
    }

    // Record successful login (resets brute-force counter)
    await recordSuccessfulLogin(email, req)

    // Audit log
    try {
      const context = getAuditContext(req)
      await recordLogTrailChange({
        actor: {
          user_id: result.user!.id,
          user_email: result.user!.email,
          user_name: result.user!.name,
          user_type: 'admin',
        },
        action: 'login',
        table: 'admin_users',
        description: `${result.user!.name} logged in successfully`,
        context,
        extra: {
          login_method: 'password',
          remember_me: rememberMe,
          timestamp: new Date().toISOString(),
        },
      })
    } catch { /* best-effort */ }

    return response
  } catch (error) {
    console.error('[Login API] Error:', error)

    // Don't leak internal errors
    return NextResponse.json(
      { error: 'An error occurred during authentication. Please try again.' },
      { status: 500 }
    )
  }
}

// Wrap with brute-force protection
export const POST = withBruteForceProtection(loginHandler)
