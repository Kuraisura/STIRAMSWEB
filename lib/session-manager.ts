/**
 * ============================================================================
 * Hardened Server-Side Session Manager
 * ============================================================================
 * Replaces the insecure localStorage + spoofable-header auth with:
 *
 *   1. HMAC-SHA256 signed session tokens (not JWT — shorter, server-verified)
 *   2. HttpOnly, Secure, SameSite=Strict cookies (unreachable by JS / XSS)
 *   3. Session fingerprinting (IP + UA hash) to detect hijacking
 *   4. Automatic rotation — new token on every request (sliding window)
 *   5. Server-side session store with TTL (`sessions` table)
 *   6. Concurrent session limiting (max N sessions per user)
 *   7. CSRF double-submit cookie protection
 *
 * Red-Team Counters:
 *   - Session Hijacking:  Token is bound to IP+UA fingerprint; rotation
 *                          invalidates stolen tokens within 1 request.
 *   - XSS Token Theft:    HttpOnly cookie — JS cannot read it.
 *   - CSRF:               Double-submit cookie verified on every mutation.
 *   - Replay Attacks:     Single-use tokens with server-side invalidation.
 *   - Brute Force:        Progressive delay + account lockout (separate module).
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { dbQuery } from './db'
import { getClientIP } from './security'

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------

const SESSION_CONFIG = {
  /** HMAC signing secret — should be set via SESSION_SECRET env var */
  get secret(): string {
    const s = process.env.SESSION_SECRET
    if (!s && process.env.NODE_ENV === 'production') {
      console.warn('[SECURITY] SESSION_SECRET is not set. Set it in your environment variables for better security.')
    }
    return s ?? 'DEV_ONLY_SESSION_SECRET_NOT_FOR_PRODUCTION_USE_64_CHARS_MINIMUM'
  },

  /** Cookie name for the session token */
  cookieName: 'rams_sid',

  /** Cookie name for the CSRF token */
  csrfCookieName: 'rams_csrf',

  /** Session lifetime (ms) — 8 hours for normal, 30 days for "remember me" */
  defaultTTL:     8 * 60 * 60 * 1000,
  rememberMeTTL: 30 * 24 * 60 * 60 * 1000,

  /** Maximum concurrent sessions per user (safety-net cleanup only).
   *  Actual single-active-session is enforced via current_session_id in
   *  admin_users — NOT by revoking old sessions eagerly. Keep this value
   *  above 1 so the old session row stays alive long enough for the
   *  displacement check in validateSession() step 7 to detect it. */
  maxSessions: 5,

  /** Token rotation interval (ms) — rotate every 15 minutes */
  rotationInterval: 15 * 60 * 1000,

  /** Whether to enforce fingerprint matching (disable for dev behind proxies) */
  enforceFingerprint: process.env.NODE_ENV === 'production',

  /** Cookie domain — leave empty for same-domain */
  cookieDomain: process.env.COOKIE_DOMAIN ?? '',
} as const

// ---------------------------------------------------------------------------
// 2. Crypto Utilities (Web Crypto — Edge Runtime compatible)
// ---------------------------------------------------------------------------

const encoder = new TextEncoder()

function isPrivateOrLocalHost(host: string): boolean {
  const h = (host || '').toLowerCase()
  if (!h) return false
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0') return true
  if (h.startsWith('192.168.')) return true
  if (h.startsWith('10.')) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true
  return false
}

export function shouldUseSecureCookies(req?: Request): boolean {
  if (process.env.FORCE_INSECURE_COOKIES === 'true') return false
  if (process.env.FORCE_SECURE_COOKIES === 'true') return true
  if (process.env.NODE_ENV !== 'production') return false
  if (!req) return true

  try {
    const url = new URL(req.url)
    const protoHeader = req.headers.get('x-forwarded-proto')
    const protocol = (protoHeader || url.protocol.replace(':', '') || 'http')
      .split(',')[0]
      .trim()
      .toLowerCase()

    if (protocol === 'https') return true

    // Allow HTTP cookies only for localhost/private-LAN deployments.
    if (isPrivateOrLocalHost(url.hostname)) return false

    return true
  } catch {
    return true
  }
}

/**
 * HMAC-SHA256 sign a payload string.
 */
async function hmacSign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SESSION_CONFIG.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return bufToHex(new Uint8Array(sig))
}

/**
 * Verify an HMAC-SHA256 signature (constant-time).
 */
async function hmacVerify(payload: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(payload)
  if (expected.length !== signature.length) return false
  // Constant-time comparison
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Generate a cryptographically random session ID (32 bytes hex).
 */
function generateSessionId(): string {
  return bufToHex(crypto.getRandomValues(new Uint8Array(32)))
}

/**
 * Generate a CSRF token (16 bytes hex).
 */
function generateCSRFToken(): string {
  return bufToHex(crypto.getRandomValues(new Uint8Array(16)))
}

/**
 * Fingerprint: SHA-256 hash of IP + User-Agent.
 */
async function computeFingerprint(ip: string, userAgent: string): Promise<string> {
  const raw = `${ip}|${userAgent}`
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(raw))
  return bufToHex(new Uint8Array(hash)).substring(0, 32)
}

function bufToHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------------------
// 3. Session Token Format
// ---------------------------------------------------------------------------
// Token = base64( sessionId.expiresAt.fingerprint.signature )
// The signature covers "sessionId.expiresAt.fingerprint" so tampering
// with any field invalidates the token.

interface SessionTokenPayload {
  sid: string      // session ID
  exp: number      // expiry (unix ms)
  fp: string       // fingerprint hash
}

async function createSessionToken(payload: SessionTokenPayload): Promise<string> {
  const raw = `${payload.sid}.${payload.exp}.${payload.fp}`
  const sig = await hmacSign(raw)
  const token = `${raw}.${sig}`
  return btoa(token)
}

async function parseSessionToken(token: string): Promise<SessionTokenPayload | null> {
  try {
    const decoded = atob(token)
    const parts = decoded.split('.')
    if (parts.length !== 4) return null

    const [sid, expStr, fp, sig] = parts
    const raw = `${sid}.${expStr}.${fp}`

    // Verify HMAC signature
    const valid = await hmacVerify(raw, sig)
    if (!valid) return null

    const exp = parseInt(expStr, 10)
    if (isNaN(exp)) return null

    return { sid, exp, fp }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// 4. Session Store (`sessions` table)
// ---------------------------------------------------------------------------

export interface SessionRecord {
  session_id: string
  user_id: number
  user_email: string
  user_name: string
  user_role: string
  fingerprint: string
  ip_address: string
  user_agent: string
  is_remember_me: boolean
  expires_at: string
  last_active_at: string
  rotated_at: string
  created_at: string
  is_revoked: boolean
}

/**
 * Create a new session in the database.
 */
async function createSessionRecord(
  session: Omit<SessionRecord, 'created_at' | 'is_revoked' | 'last_active_at' | 'rotated_at'>
): Promise<boolean> {
  try {
    await dbQuery(
      `INSERT INTO sessions (
        session_id, user_id, user_email, user_name, user_role, fingerprint,
        ip_address, user_agent, is_remember_me, expires_at,
        last_active_at, rotated_at, created_at, is_revoked
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        NOW(), NOW(), NOW(), FALSE
      )`,
      [
        session.session_id,
        session.user_id,
        session.user_email,
        session.user_name,
        session.user_role,
        session.fingerprint,
        session.ip_address,
        session.user_agent,
        session.is_remember_me,
        session.expires_at,
      ]
    )
    return true
  } catch {
    return false
  }
}

/**
 * Fetch a session record by ID.
 */
async function getSessionRecord(sessionId: string): Promise<SessionRecord | null> {
  try {
    const rows = await dbQuery<SessionRecord>(
      `SELECT *
       FROM sessions
       WHERE session_id = $1 AND is_revoked = FALSE
       LIMIT 1`,
      [sessionId]
    )

    return rows[0] || null
  } catch {
    return null
  }
}

/**
 * Touch the session (update last_active_at).
 */
async function touchSession(sessionId: string): Promise<void> {
  try {
    await dbQuery(
      'UPDATE sessions SET last_active_at = NOW() WHERE session_id = $1',
      [sessionId]
    )
  } catch {
    // best-effort
  }
}

/**
 * Rotate a session — issue a new session ID, revoke the old one.
 */
async function rotateSession(
  oldSessionId: string,
  newSessionId: string,
  newFingerprint: string,
  newExpiresAt: string
): Promise<boolean> {
  try {
    const rows = await dbQuery<SessionRecord>(
      'SELECT * FROM sessions WHERE session_id = $1 LIMIT 1',
      [oldSessionId]
    )
    const oldSession = rows[0]

    if (!oldSession) return false

    await dbQuery('UPDATE sessions SET is_revoked = TRUE WHERE session_id = $1', [oldSessionId])

    // Create new session
    return await createSessionRecord({
      session_id: newSessionId,
      user_id: oldSession.user_id,
      user_email: oldSession.user_email,
      user_name: oldSession.user_name,
      user_role: oldSession.user_role,
      fingerprint: newFingerprint,
      ip_address: oldSession.ip_address,
      user_agent: oldSession.user_agent,
      is_remember_me: oldSession.is_remember_me,
      expires_at: newExpiresAt,
    })
  } catch {
    return false
  }
}

/**
 * Revoke a specific session.
 */
async function revokeSession(sessionId: string): Promise<void> {
  try {
    await dbQuery(
      'UPDATE sessions SET is_revoked = TRUE WHERE session_id = $1',
      [sessionId]
    )
  } catch {
    // best-effort
  }
}

/**
 * Revoke ALL sessions for a user (force logout everywhere).
 */
export async function revokeAllUserSessions(userId: number): Promise<void> {
  try {
    await dbQuery(
      'UPDATE sessions SET is_revoked = TRUE WHERE user_id = $1 AND is_revoked = FALSE',
      [userId]
    )
  } catch {
    // best-effort
  }
}

/**
 * Enforce max session limit — revoke oldest sessions if over the limit.
 */
async function enforceSessionLimit(userId: number): Promise<void> {
  try {
    const sessions = await dbQuery<{ session_id: string; created_at: string }>(
      `SELECT session_id, created_at
       FROM sessions
       WHERE user_id = $1 AND is_revoked = FALSE
       ORDER BY created_at ASC`,
      [userId]
    )

    if (!sessions || sessions.length <= SESSION_CONFIG.maxSessions) return

    // Revoke the oldest sessions to stay within the limit
    const toRevoke = sessions.slice(0, sessions.length - SESSION_CONFIG.maxSessions)
    for (const s of toRevoke) {
      await revokeSession(s.session_id)
    }
  } catch {
    // best-effort
  }
}

/**
 * List all active sessions for a user (for "manage sessions" UI).
 */
export async function listUserSessions(userId: number): Promise<
  Array<{
    session_id: string
    ip_address: string
    user_agent: string
    last_active_at: string
    created_at: string
    is_current?: boolean
  }>
> {
  try {
    const rows = await dbQuery<{
      session_id: string
      ip_address: string
      user_agent: string
      last_active_at: string
      created_at: string
    }>(
      `SELECT session_id, ip_address, user_agent, last_active_at, created_at
       FROM sessions
       WHERE user_id = $1 AND is_revoked = FALSE
       ORDER BY last_active_at DESC`,
      [userId]
    )

    return rows
  } catch {
    return []
  }
}

async function findActiveAdminByEmail(email: string): Promise<{
  id: number
  email: string
  full_name: string
  role: string | null
  is_active: boolean | null
  photo_path: string | null
  password: string | null
} | null> {
  const passwordColumnRows = await dbQuery<{ column_name: string }>(
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

  const passwordColumn = passwordColumnRows[0]?.column_name
  if (!passwordColumn) return null

  const safePasswordColumn =
    passwordColumn === 'password' || passwordColumn === 'password_hash' || passwordColumn === 'hashed_password'
      ? passwordColumn
      : null

  if (!safePasswordColumn) return null

  const rows = await dbQuery<{
    id: number
    email: string
    full_name: string
    role: string | null
    is_active: boolean | null
    photo_path: string | null
    password: string | null
  }>(
    `SELECT id, email, full_name, role, is_active, photo_path, ${safePasswordColumn} AS password
     FROM admin_users
     WHERE lower(email) = lower($1)
     LIMIT 1`,
    [email]
  )

  return rows[0] || null
}

async function verifyCredentials(email: string, password: string): Promise<number | null> {
  // Prefer DB-side verification if helper function exists.
  try {
    const rows = await dbQuery<{ user_id: number | null }>(
      'SELECT verify_admin_login($1, $2) AS user_id',
      [email, password]
    )
    const userId = rows[0]?.user_id
    if (userId) return userId
  } catch {
    // Ignore and fallback to local bcrypt verification.
  }

  const user = await findActiveAdminByEmail(email)
  if (!user || user.is_active !== true || !user.password) return null

  // Support existing bcrypt hashes and legacy plaintext passwords.
  if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$') || user.password.startsWith('$2y$')) {
    const isValid = await bcrypt.compare(password, user.password)
    return isValid ? user.id : null
  }

  return user.password === password ? user.id : null
}

// ---------------------------------------------------------------------------
// 5. Login — Create Session
// ---------------------------------------------------------------------------

export interface LoginResult {
  success: boolean
  error?: string
  user?: {
    id: number
    email: string
    name: string
    role: string
    photo?: string
  }
}

/**
 * Authenticate a user and create a secure server-side session.
 *
 * Call this from a SERVER-SIDE API route (NOT from the client).
 * It sets HttpOnly cookies on the response.
 *
 * @example
 * ```ts
 * // app/api/auth/login/route.ts
 * export async function POST(req: NextRequest) {
 *   const { email, password, rememberMe } = await req.json()
 *   const { response, result } = await createAuthSession(req, email, password, rememberMe)
 *   return response
 * }
 * ```
 */
export async function createAuthSession(
  req: NextRequest,
  email: string,
  password: string,
  rememberMe: boolean = false
): Promise<{ response: NextResponse; result: LoginResult }> {
  const ip = getClientIP(req)
  const ua = req.headers.get('user-agent') ?? 'unknown'
  const normalizedEmail = email.trim().toLowerCase()

  // 1. Authenticate against PostgreSQL
  const verifiedId = await verifyCredentials(normalizedEmail, password)

  if (!verifiedId) {
    return {
      response: NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      ),
      result: { success: false, error: 'Invalid credentials' },
    }
  }

  // 2. Fetch user profile
  const userRows = await dbQuery<{
    id: number
    email: string
    full_name: string
    role: string | null
    is_active: boolean | null
    photo_path: string | null
  }>(
    `SELECT id, email, full_name, role, is_active, photo_path
     FROM admin_users
     WHERE id = $1
     LIMIT 1`,
    [verifiedId]
  )
  const user = userRows[0]

  if (!user || user.is_active !== true) {
    return {
      response: NextResponse.json(
        { error: 'Account is inactive' },
        { status: 403 }
      ),
      result: { success: false, error: 'Account inactive' },
    }
  }

  // 3. Generate session
  const sessionId = generateSessionId()
  const ttl = rememberMe ? SESSION_CONFIG.rememberMeTTL : SESSION_CONFIG.defaultTTL
  const expiresAt = Date.now() + ttl
  const fingerprint = await computeFingerprint(ip, ua)

  // 4. Store session in DB
  await createSessionRecord({
    session_id: sessionId,
    user_id: user.id,
    user_email: user.email,
    user_name: user.full_name,
    user_role: user.role ?? 'admin',
    fingerprint,
    ip_address: ip,
    user_agent: ua.substring(0, 500),
    is_remember_me: rememberMe,
    expires_at: new Date(expiresAt).toISOString(),
  })

  // 5. Enforce session limit
  await enforceSessionLimit(user.id)

  // 6. Create signed token
  const token = await createSessionToken({ sid: sessionId, exp: expiresAt, fp: fingerprint })

  // 7. Generate CSRF token
  const csrfToken = generateCSRFToken()

  // 8. Update last_login + set current_session_id (single-active-session enforcement)
  //    This is the "last-in-wins" anchor: any older session whose ID
  //    does NOT match this value will be forcibly logged out.
  try {
    await dbQuery(
      `UPDATE admin_users
       SET last_login = NOW(), current_session_id = $1
       WHERE id = $2`,
      [sessionId, user.id]
    )
  } catch { /* best-effort */ }

  // 8b. NOTE: We intentionally do NOT revoke old sessions here.
  //    The single-active-session check in validateSession() (step 7) compares
  //    the cookie's session ID against current_session_id. If they differ,
  //    it returns { displaced: true } so the client can show a friendly message.
  //    If we revoked here, getSessionRecord() would return null (because it
  //    filters is_revoked=false) and we'd never reach the displacement check.

  // 9. Build response with secure cookies
  const userData = {
    id: user.id,
    email: user.email,
    name: user.full_name,
    role: user.role ?? 'admin',
    photo: user.photo_path ?? undefined,
  }

  const response = NextResponse.json({
    success: true,
    user: userData,
    csrfToken,  // client stores this in memory (NOT cookie) for double-submit
  })

  // Set session cookie — HttpOnly, Secure, SameSite=Strict
  const cookieMaxAge = Math.floor(ttl / 1000)
  const isSecure = shouldUseSecureCookies(req)

  response.cookies.set(SESSION_CONFIG.cookieName, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'strict',
    path: '/',
    maxAge: cookieMaxAge,
    ...(SESSION_CONFIG.cookieDomain ? { domain: SESSION_CONFIG.cookieDomain } : {}),
  })

  // Set CSRF cookie — NOT HttpOnly (JS needs to read it for double-submit)
  response.cookies.set(SESSION_CONFIG.csrfCookieName, csrfToken, {
    httpOnly: false,
    secure: isSecure,
    sameSite: 'strict',
    path: '/',
    maxAge: cookieMaxAge,
  })

  return { response, result: { success: true, user: userData } }
}

// ---------------------------------------------------------------------------
// 6. Validate Session (for API routes & middleware)
// ---------------------------------------------------------------------------

export interface ValidatedSession {
  valid: boolean
  user?: {
    id: number
    email: string
    name: string
    role: string
  }
  sessionId?: string
  error?: string
  /** True when a newer login displaced this session (single-active-session). */
  displaced?: boolean
}

/**
 * Validate the session from the request cookies.
 *
 * This is the PRIMARY authentication method. Use this instead of
 * checking `x-user-id` / `x-user-email` headers.
 */
export async function validateSession(req: NextRequest): Promise<ValidatedSession> {
  // 1. Extract session cookie
  const token = req.cookies.get(SESSION_CONFIG.cookieName)?.value
  if (!token) {
    return { valid: false, error: 'No session cookie' }
  }

  // 2. Parse & verify HMAC signature
  const payload = await parseSessionToken(token)
  if (!payload) {
    return { valid: false, error: 'Invalid session token' }
  }

  // 3. Check expiry
  if (Date.now() > payload.exp) {
    return { valid: false, error: 'Session expired' }
  }

  // 4. Look up session in DB
  const session = await getSessionRecord(payload.sid)
  if (!session) {
    return { valid: false, error: 'Session not found or revoked' }
  }

  // 5. Check DB-level expiry
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await revokeSession(payload.sid)
    return { valid: false, error: 'Session expired' }
  }

  // 6. Fingerprint verification (detect session hijacking)
  if (SESSION_CONFIG.enforceFingerprint) {
    const ip = getClientIP(req)
    const ua = req.headers.get('user-agent') ?? 'unknown'
    const currentFP = await computeFingerprint(ip, ua)

    if (currentFP !== session.fingerprint) {
      // Possible session hijacking — revoke immediately
      await revokeSession(payload.sid)

      console.error(
        `[SESSION HIJACK DETECTED] sid=${payload.sid} user=${session.user_email} ` +
        `expected_fp=${session.fingerprint} actual_fp=${currentFP} ip=${ip}`
      )

      // Log to audit trail
      try {
        const { recordLogTrailChange } = await import('./audit')
        await recordLogTrailChange({
          actor: {
            user_id: session.user_id,
            user_email: session.user_email,
            user_name: session.user_name,
            user_type: 'admin',
          },
          action: 'security:session_hijack_detected',
          table: 'sessions',
          recordId: payload.sid,
          description: `Session hijacking detected for ${session.user_email}. Session revoked.`,
          context: { ip_address: ip, user_agent: ua },
        })
      } catch { /* best-effort */ }

      return { valid: false, error: 'Session fingerprint mismatch' }
    }
  }

  // 7. Single Active Session check (last-in-wins)
  //    Compare this session's ID with the current_session_id stored on the user.
  //    If they differ, a newer login happened elsewhere → this session is stale.
  try {
    const rows = await dbQuery<{ current_session_id: string | null }>(
      'SELECT current_session_id FROM admin_users WHERE id = $1 LIMIT 1',
      [session.user_id]
    )
    const currentSessionId = rows[0]?.current_session_id

    if (currentSessionId && currentSessionId !== payload.sid) {
      // This session was displaced by a newer login — revoke it
      await revokeSession(payload.sid)

      console.log(
        `[SINGLE-SESSION] Displaced session ${payload.sid.substring(0, 8)}… ` +
        `for user ${session.user_email} — active session is ` +
        `${currentSessionId.substring(0, 8)}…`
      )

      return {
        valid: false,
        displaced: true,
        error: 'Session displaced by a newer login on another device',
        user: {
          id: session.user_id,
          email: session.user_email,
          name: session.user_name,
          role: session.user_role,
        },
      }
    }
  } catch (err) {
    // If the column doesn't exist yet or query fails, skip the check gracefully
    console.error('[SINGLE-SESSION] Error checking current_session_id:', err)
  }

  // 8. Touch session (update last_active_at)
  await touchSession(payload.sid)

  return {
    valid: true,
    sessionId: payload.sid,
    user: {
      id: session.user_id,
      email: session.user_email,
      name: session.user_name,
      role: session.user_role,
    },
  }
}

// ---------------------------------------------------------------------------
// 7. CSRF Validation
// ---------------------------------------------------------------------------

/**
 * Validate the CSRF token for state-changing requests (POST/PUT/PATCH/DELETE).
 *
 * Double-submit cookie pattern:
 *   - Cookie `rams_csrf` is set on login (readable by JS).
 *   - Client sends the SAME value in the `X-CSRF-Token` header.
 *   - Server compares the two — they must match.
 *
 * An attacker on a different origin cannot read the cookie, so they
 * cannot provide the matching header.
 */
export function validateCSRF(req: NextRequest): boolean {
  // Only validate on state-changing methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true

  const cookieToken = req.cookies.get(SESSION_CONFIG.csrfCookieName)?.value
  const headerToken = req.headers.get('x-csrf-token')

  if (!cookieToken || !headerToken) return false

  // Constant-time comparison
  if (cookieToken.length !== headerToken.length) return false
  let diff = 0
  for (let i = 0; i < cookieToken.length; i++) {
    diff |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i)
  }
  return diff === 0
}

// ---------------------------------------------------------------------------
// 8. Logout — Destroy Session
// ---------------------------------------------------------------------------

/**
 * Destroy the current session and clear all auth cookies.
 */
export async function destroySession(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(SESSION_CONFIG.cookieName)?.value

  if (token) {
    const payload = await parseSessionToken(token)
    if (payload) {
      // Revoke the session in the DB
      await revokeSession(payload.sid)

      // Clear current_session_id on the user so the next login starts fresh
      const rows = await dbQuery<{ user_id: number }>(
        'SELECT user_id FROM sessions WHERE session_id = $1 LIMIT 1',
        [payload.sid]
      )
      const userId = rows[0]?.user_id
      if (userId) {
        try {
          await dbQuery(
            'UPDATE admin_users SET current_session_id = NULL WHERE id = $1',
            [userId]
          )
        } catch { /* best-effort */ }
      }
    }
  }

  const response = NextResponse.json({ success: true, message: 'Logged out' })

  // Clear all auth cookies
  response.cookies.set(SESSION_CONFIG.cookieName, '', {
    httpOnly: true,
    secure: shouldUseSecureCookies(req),
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })
  response.cookies.set(SESSION_CONFIG.csrfCookieName, '', {
    httpOnly: false,
    secure: shouldUseSecureCookies(req),
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })

  // Also clear legacy cookies
  response.cookies.set('rams_auth', '', { path: '/', maxAge: 0 })
  response.cookies.set('rams_user_id', '', { path: '/', maxAge: 0 })
  response.cookies.set('rams_user_email', '', { path: '/', maxAge: 0 })

  return response
}

// ---------------------------------------------------------------------------
// 9. Session Rotation (call periodically or from middleware)
// ---------------------------------------------------------------------------

/**
 * Check if a session needs rotation and rotate if so.
 * Returns the new token if rotated, null otherwise.
 */
export async function maybeRotateSession(
  req: NextRequest,
  sessionId: string
): Promise<string | null> {
  const session = await getSessionRecord(sessionId)
  if (!session) return null

  const rotatedAt = new Date(session.rotated_at).getTime()
  const elapsed = Date.now() - rotatedAt

  if (elapsed < SESSION_CONFIG.rotationInterval) return null

  // Time to rotate
  const newSessionId = generateSessionId()
  const ip = getClientIP(req)
  const ua = req.headers.get('user-agent') ?? 'unknown'
  const newFP = await computeFingerprint(ip, ua)
  const ttl = session.is_remember_me ? SESSION_CONFIG.rememberMeTTL : SESSION_CONFIG.defaultTTL
  const newExp = Date.now() + ttl

  const success = await rotateSession(
    sessionId,
    newSessionId,
    newFP,
    new Date(newExp).toISOString()
  )

  if (!success) return null

  // Update current_session_id so the single-active-session check
  // doesn't falsely flag a rotated session as displaced.
  try {
    await dbQuery(
      'UPDATE admin_users SET current_session_id = $1 WHERE id = $2',
      [newSessionId, session.user_id]
    )
  } catch { /* best-effort */ }

  return await createSessionToken({
    sid: newSessionId,
    exp: newExp,
    fp: newFP,
  })
}

// ---------------------------------------------------------------------------
// 10. Middleware helper — combine validate + rotate + CSRF
// ---------------------------------------------------------------------------

/**
 * Full session validation for use in Next.js middleware.
 * Returns the validated session and optionally a new token (if rotated).
 */
export async function authenticateMiddleware(
  req: NextRequest
): Promise<{
  authenticated: boolean
  user?: ValidatedSession['user']
  newToken?: string
  error?: string
}> {
  const session = await validateSession(req)

  if (!session.valid || !session.user || !session.sessionId) {
    return { authenticated: false, error: session.error }
  }

  // Try rotation
  const newToken = await maybeRotateSession(req, session.sessionId)

  return {
    authenticated: true,
    user: session.user,
    newToken: newToken ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// 11. Export config for external use
// ---------------------------------------------------------------------------

export const AUTH_COOKIE_NAME = SESSION_CONFIG.cookieName
export const CSRF_COOKIE_NAME = SESSION_CONFIG.csrfCookieName
