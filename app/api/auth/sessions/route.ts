/**
 * ============================================================================
 * Session Management API Route
 * ============================================================================
 * Allows authenticated users to:
 *   GET  — List all their active sessions
 *   DELETE — Revoke a specific session (or all sessions)
 *
 * This enables the "Active Sessions" UI where users can see all their
 * logged-in devices and force-logout any of them.
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  validateSession,
  listUserSessions,
  revokeAllUserSessions,
} from '@/lib/session-manager'
import { dbQuery } from '@/lib/db'
import { recordLogTrailChange, getAuditContext } from '@/lib/audit'

/**
 * GET — List all active sessions for the authenticated user.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await validateSession(req)
  if (!session.valid || !session.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const sessions = await listUserSessions(session.user.id)

  // Mark the current session
  const enriched = sessions.map((s) => ({
    ...s,
    is_current: s.session_id === session.sessionId,
    // Mask the session_id for display (only show last 8 chars)
    session_id: `...${s.session_id.slice(-8)}`,
    // Truncate user agent for display
    user_agent: parseUserAgent(s.user_agent),
  }))

  return NextResponse.json({ sessions: enriched })
}

/**
 * DELETE — Revoke a session.
 *   body.session_id = "..." → revoke specific session
 *   body.all = true         → revoke ALL sessions (force logout everywhere)
 */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const session = await validateSession(req)
  if (!session.valid || !session.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const context = getAuditContext(req)

    if (body.all === true) {
      // Revoke ALL sessions
      await revokeAllUserSessions(session.user.id)

      await recordLogTrailChange({
        actor: {
          user_id: session.user.id,
          user_email: session.user.email,
          user_name: session.user.name,
          user_type: 'admin',
        },
        action: 'security:revoke_all_sessions',
        table: 'sessions',
        description: `${session.user.name} revoked all active sessions`,
        context,
      })

      return NextResponse.json({
        success: true,
        message: 'All sessions revoked. You will need to log in again.',
      })
    }

    if (body.session_id && typeof body.session_id === 'string') {
      // The client sends masked IDs (last 8 chars), so we need to find the full ID
      const sessions = await listUserSessions(session.user.id)
      const target = sessions.find((s) => s.session_id.endsWith(body.session_id.replace('...', '')))

      if (!target) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 })
      }

      // Don't allow revoking your own current session via this endpoint
      // (use /api/auth/logout for that)
      if (target.session_id === session.sessionId) {
        return NextResponse.json(
          { error: 'Use the logout endpoint to end your current session' },
          { status: 400 }
        )
      }

      await dbQuery(
        `UPDATE sessions
         SET is_revoked = TRUE
         WHERE session_id = $1 AND user_id = $2`,
        [target.session_id, session.user.id]
      )

      await recordLogTrailChange({
        actor: {
          user_id: session.user.id,
          user_email: session.user.email,
          user_name: session.user.name,
          user_type: 'admin',
        },
        action: 'security:revoke_session',
        table: 'sessions',
        recordId: target.session_id.slice(-8),
        description: `${session.user.name} revoked session from ${target.ip_address}`,
        context,
      })

      return NextResponse.json({ success: true, message: 'Session revoked' })
    }

    return NextResponse.json({ error: 'Provide session_id or all=true' }, { status: 400 })
  } catch (error) {
    console.error('[Sessions API] Error:', error)
    return NextResponse.json({ error: 'Failed to manage sessions' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseUserAgent(ua: string): string {
  if (!ua || ua === 'unknown') return 'Unknown Device'

  let browser = 'Unknown Browser'
  let platform = 'Unknown OS'

  if (ua.includes('Edge')) browser = 'Edge'
  else if (ua.includes('Chrome')) browser = 'Chrome'
  else if (ua.includes('Firefox')) browser = 'Firefox'
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari'

  if (ua.includes('Windows')) platform = 'Windows'
  else if (ua.includes('Mac')) platform = 'macOS'
  else if (ua.includes('Linux')) platform = 'Linux'
  else if (ua.includes('Android')) platform = 'Android'
  else if (/iPhone|iPad/.test(ua)) platform = 'iOS'

  return `${browser} on ${platform}`
}
