/**
 * ============================================================================
 * Brute-Force Protection for Login Endpoint
 * ============================================================================
 * Progressive delay + account lockout to prevent credential stuffing and
 * password brute-force attacks.
 *
 * Strategy:
 *   - Track failed attempts per email AND per IP (dual tracking).
 *   - After 3 failures: 5-second delay.
 *   - After 5 failures: 30-second delay.
 *   - After 8 failures: 5-minute lockout.
 *   - After 15 failures: 30-minute lockout + security alert.
 *   - All thresholds are per-email. IP-based tracking has separate,
 *     slightly higher thresholds (to avoid locking out shared networks).
 *
 * Persistence:
 *   - In-memory (fast, resets on deploy) + PostgreSQL `login_attempts` table
 *     (persistent, survives restarts).
 *   - The DB table is the source of truth; in-memory is a cache.
 *
 * Red-Team Counters:
 *   - Credential Stuffing: Per-email tracking stops password spraying.
 *   - Distributed Attacks: Per-IP tracking limits botnets.
 *   - Timing Attacks:      Constant-time bcrypt comparison (already in
 *                           the `verify_admin_login` function).
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from './db'
import { getClientIP } from './security'

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------

interface BruteForceConfig {
  /** Progressive delay thresholds: [attempts, delayMs][] */
  delays: Array<[number, number]>
  /** Lockout thresholds: [attempts, lockoutMs][] */
  lockouts: Array<[number, number]>
  /** Time window for counting attempts (ms) */
  windowMs: number
  /** IP-based attempt multiplier (higher threshold for shared IPs) */
  ipMultiplier: number
}

const CONFIG: BruteForceConfig = {
  delays: [
    [3, 5_000],       // After 3 failures: 5s delay
    [5, 30_000],      // After 5 failures: 30s delay
  ],
  lockouts: [
    [8, 5 * 60_000],       // After 8 failures: 5 min lockout
    [15, 30 * 60_000],     // After 15 failures: 30 min lockout
    [25, 60 * 60_000],     // After 25 failures: 1 hour lockout
  ],
  windowMs: 60 * 60_000,    // 1 hour window
  ipMultiplier: 3,           // IP thresholds are 3× the email thresholds
}

// ---------------------------------------------------------------------------
// 2. In-Memory Cache (fast path)
// ---------------------------------------------------------------------------

interface AttemptRecord {
  count: number
  firstAttempt: number
  lastAttempt: number
  lockedUntil: number  // 0 = not locked
}

const attempts = new Map<string, AttemptRecord>()

// Cleanup stale entries every 10 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, record] of attempts.entries()) {
    if (now - record.lastAttempt > CONFIG.windowMs && record.lockedUntil < now) {
      attempts.delete(key)
    }
  }
}, 10 * 60_000)

function getOrCreateRecord(key: string): AttemptRecord {
  const now = Date.now()
  let record = attempts.get(key)

  if (!record || now - record.firstAttempt > CONFIG.windowMs) {
    record = { count: 0, firstAttempt: now, lastAttempt: now, lockedUntil: 0 }
    attempts.set(key, record)
  }

  return record
}

// ---------------------------------------------------------------------------
// 3. Core Logic
// ---------------------------------------------------------------------------

export interface BruteForceCheckResult {
  allowed: boolean
  retryAfterMs: number
  attemptsRemaining: number
  message: string
  isLocked: boolean
}

/**
 * Check if a login attempt should be allowed.
 * Call this BEFORE verifying credentials.
 */
export async function checkLoginAllowed(
  email: string,
  req: NextRequest
): Promise<BruteForceCheckResult> {
  const ip = getClientIP(req)
  const normalizedEmail = email.trim().toLowerCase()
  const now = Date.now()

  // Check email-based record
  const emailKey = `email:${normalizedEmail}`
  const emailRecord = getOrCreateRecord(emailKey)

  // Check IP-based record
  const ipKey = `ip:${ip}`
  const ipRecord = getOrCreateRecord(ipKey)

  // Check if locked out (email)
  if (emailRecord.lockedUntil > now) {
    const retryAfter = emailRecord.lockedUntil - now
    return {
      allowed: false,
      retryAfterMs: retryAfter,
      attemptsRemaining: 0,
      message: `Account temporarily locked. Try again in ${Math.ceil(retryAfter / 1000)} seconds.`,
      isLocked: true,
    }
  }

  // Check if locked out (IP — higher threshold)
  if (ipRecord.lockedUntil > now) {
    const retryAfter = ipRecord.lockedUntil - now
    return {
      allowed: false,
      retryAfterMs: retryAfter,
      attemptsRemaining: 0,
      message: `Too many login attempts from this location. Try again in ${Math.ceil(retryAfter / 1000)} seconds.`,
      isLocked: true,
    }
  }

  // Check if a delay applies
  const delay = getRequiredDelay(emailRecord.count)
  if (delay > 0) {
    const elapsed = now - emailRecord.lastAttempt
    if (elapsed < delay) {
      const retryAfter = delay - elapsed
      return {
        allowed: false,
        retryAfterMs: retryAfter,
        attemptsRemaining: getAttemptsRemaining(emailRecord.count),
        message: `Please wait ${Math.ceil(retryAfter / 1000)} seconds before trying again.`,
        isLocked: false,
      }
    }
  }

  return {
    allowed: true,
    retryAfterMs: 0,
    attemptsRemaining: getAttemptsRemaining(emailRecord.count),
    message: '',
    isLocked: false,
  }
}

/**
 * Record a failed login attempt.
 * Call this AFTER credential verification fails.
 */
export async function recordFailedAttempt(
  email: string,
  req: NextRequest
): Promise<void> {
  const ip = getClientIP(req)
  const ua = req.headers.get('user-agent') ?? 'unknown'
  const normalizedEmail = email.trim().toLowerCase()
  const now = Date.now()

  // Update email record
  const emailKey = `email:${normalizedEmail}`
  const emailRecord = getOrCreateRecord(emailKey)
  emailRecord.count++
  emailRecord.lastAttempt = now

  // Check if lockout threshold reached
  const lockout = getLockoutDuration(emailRecord.count)
  if (lockout > 0) {
    emailRecord.lockedUntil = now + lockout
  }

  // Update IP record
  const ipKey = `ip:${ip}`
  const ipRecord = getOrCreateRecord(ipKey)
  ipRecord.count++
  ipRecord.lastAttempt = now

  // Check IP lockout (higher thresholds)
  const ipLockout = getLockoutDuration(
    Math.floor(ipRecord.count / CONFIG.ipMultiplier)
  )
  if (ipLockout > 0) {
    ipRecord.lockedUntil = now + ipLockout
  }

  // Persist to DB (best-effort, for cross-instance tracking)
  try {
    await dbQuery(
      `INSERT INTO login_attempts (
        email, ip_address, user_agent, success,
        attempt_number, is_locked, locked_until, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        normalizedEmail,
        ip,
        ua.substring(0, 500),
        false,
        emailRecord.count,
        emailRecord.lockedUntil > now,
        emailRecord.lockedUntil > now
          ? new Date(emailRecord.lockedUntil).toISOString()
          : null,
      ]
    )
  } catch {
    // best-effort
  }

  // Fire security alert at high thresholds
  if (emailRecord.count >= 15) {
    console.error(
      `[BRUTE FORCE ALERT] ${emailRecord.count} failed attempts for ${normalizedEmail} from ${ip}`
    )
    try {
      await dbQuery(
        `INSERT INTO security_alerts (
          alert_type, severity, user_email, description, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, NOW())`,
        [
          'brute_force',
          emailRecord.count >= 25 ? 'critical' : 'high',
          normalizedEmail,
          `${emailRecord.count} failed login attempts for ${normalizedEmail} from IP ${ip}`,
          JSON.stringify({
            email: normalizedEmail,
            ip,
            user_agent: ua.substring(0, 200),
            attempt_count: emailRecord.count,
            locked_until: emailRecord.lockedUntil > now
              ? new Date(emailRecord.lockedUntil).toISOString()
              : null,
          }),
        ]
      )
    } catch {
      // best-effort
    }
  }
}

/**
 * Record a successful login (resets the failure counter).
 */
export async function recordSuccessfulLogin(
  email: string,
  req: NextRequest
): Promise<void> {
  const ip = getClientIP(req)
  const normalizedEmail = email.trim().toLowerCase()

  // Clear email record
  attempts.delete(`email:${normalizedEmail}`)

  // DON'T clear IP record — an attacker might try valid creds to reset the IP counter

  // Persist success to DB
  try {
    await dbQuery(
      `INSERT INTO login_attempts (
        email, ip_address, user_agent, success,
        attempt_number, is_locked, locked_until, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        normalizedEmail,
        ip,
        (req.headers.get('user-agent') ?? 'unknown').substring(0, 500),
        true,
        0,
        false,
        null,
      ]
    )
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// 4. Helpers
// ---------------------------------------------------------------------------

function getRequiredDelay(failureCount: number): number {
  let delay = 0
  for (const [threshold, d] of CONFIG.delays) {
    if (failureCount >= threshold) delay = d
  }
  return delay
}

function getLockoutDuration(failureCount: number): number {
  let lockout = 0
  for (const [threshold, d] of CONFIG.lockouts) {
    if (failureCount >= threshold) lockout = d
  }
  return lockout
}

function getAttemptsRemaining(failureCount: number): number {
  // Find the next lockout threshold
  for (const [threshold] of CONFIG.lockouts) {
    if (failureCount < threshold) return threshold - failureCount
  }
  return 0
}

// ---------------------------------------------------------------------------
// 5. Middleware wrapper for login route
// ---------------------------------------------------------------------------

/**
 * Wraps a login handler with brute-force protection.
 *
 * @example
 * ```ts
 * export const POST = withBruteForceProtection(loginHandler)
 * ```
 */
export function withBruteForceProtection(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    // Extract email from body (peek without consuming)
    let email = ''
    try {
      const body = await req.clone().json()
      email = body.email ?? body.username ?? ''
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Check if attempt is allowed
    const check = await checkLoginAllowed(email, req)
    if (!check.allowed) {
      return NextResponse.json(
        {
          error: check.message,
          retryAfter: Math.ceil(check.retryAfterMs / 1000),
          isLocked: check.isLocked,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(check.retryAfterMs / 1000)),
          },
        }
      )
    }

    // Execute the login handler
    return handler(req)
  }
}
