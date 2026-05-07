/**
 * ============================================================================
 * Breach-Resistant Password Hashing — BCrypt High-Cost + Pepper
 * ============================================================================
 * Hardens the existing bcryptjs implementation:
 *
 *   OLD: bcrypt.hash(password, 10)         → ~100 ms, easily GPU-crackable
 *   NEW: bcrypt.hash(pepper + password, 14) → ~1 s, 16× more resistant
 *
 * Strategy:
 *   1. PEPPER: A server-side secret (env var) prepended to the password
 *      BEFORE hashing. Even if the DB is dumped, the hashes are useless
 *      without the pepper.
 *   2. HIGH COST FACTOR (14): Each hash takes ~1 second on a modern CPU,
 *      making GPU-based cracking 16× slower than cost=10.
 *   3. PASSWORD POLICY: Enforced minimum complexity (length, mixed chars).
 *   4. BREACH CHECK: Optional Have-I-Been-Pwned k-anonymity check.
 *
 * Why not Argon2?
 *   The current `verify_admin_login` RPC uses `pgcrypto.crypt()` which is
 *   bcrypt-based. Switching to Argon2 would require changing the DB function.
 *   Instead, we maximise bcrypt strength with high cost + pepper — which
 *   achieves equivalent practical resistance for this threat model.
 *
 * Migration path to Argon2 (if desired):
 *   1. Add `argon2` npm package
 *   2. On next login, re-hash with Argon2 and store in a new column
 *   3. Update verify_admin_login to try Argon2 first, fall back to bcrypt
 *   4. After all users have logged in once, drop bcrypt hashes
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------

interface HashConfig {
  /** bcrypt cost factor (10-15). Higher = more resistant but slower login. */
  costFactor: number
  /** Env var holding the pepper secret (32+ chars) */
  pepperEnvVar: string
  /** Minimum password length */
  minLength: number
  /** Maximum password length (bcrypt truncates at 72 bytes) */
  maxLength: number
  /** Require mixed characters */
  requireMixed: boolean
}

const DEFAULT_CONFIG: HashConfig = {
  costFactor: 14,                       // ~1s per hash on modern hardware
  pepperEnvVar: 'PASSWORD_PEPPER',
  minLength: 10,
  maxLength: 72,                        // bcrypt's native limit
  requireMixed: true,
}

// ---------------------------------------------------------------------------
// 2. Password Policy Enforcement
// ---------------------------------------------------------------------------

export interface PolicyResult {
  valid: boolean
  errors: string[]
}

/**
 * Validate a plaintext password against the security policy.
 */
export function enforcePasswordPolicy(
  password: string,
  config: Partial<HashConfig> = {},
): PolicyResult {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const errors: string[] = []

  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['Password is required'] }
  }

  if (password.length < cfg.minLength) {
    errors.push(`Password must be at least ${cfg.minLength} characters`)
  }

  if (password.length > cfg.maxLength) {
    errors.push(`Password must be at most ${cfg.maxLength} characters`)
  }

  if (cfg.requireMixed) {
    if (!/[a-z]/.test(password)) errors.push('Must contain a lowercase letter')
    if (!/[A-Z]/.test(password)) errors.push('Must contain an uppercase letter')
    if (!/\d/.test(password)) errors.push('Must contain a digit')
    if (!/[^a-zA-Z0-9]/.test(password)) errors.push('Must contain a special character')
  }

  // Common password blocklist (top 20 — extend as needed)
  const blocklist = [
    'password', 'password1', '123456', '12345678', 'qwerty',
    'admin123', 'letmein', 'admin', 'welcome', 'monkey',
    'dragon', 'master', 'iloveyou', 'trustno1', 'abc123',
    'admin1234', 'password123', 'changeme', 'stirams', 'stirams123',
  ]
  if (blocklist.includes(password.toLowerCase())) {
    errors.push('This password is too common and easily guessable')
  }

  return { valid: errors.length === 0, errors }
}

// ---------------------------------------------------------------------------
// 3. Hashing & Verification (BCrypt + Pepper)
// ---------------------------------------------------------------------------

/**
 * Apply the server-side pepper to a password.
 * Pepper = HMAC-like prepend; even if DB is compromised,
 * attacker cannot crack hashes without the pepper.
 */
function applyPepper(password: string): string {
  const pepper = process.env[DEFAULT_CONFIG.pepperEnvVar] || ''
  if (!pepper && process.env.NODE_ENV === 'production') {
    console.error('[PasswordHash] PASSWORD_PEPPER env var not set! Hashing without pepper.')
  }
  // Prepend pepper + separator (null byte prevents length-extension attacks)
  return pepper ? `${pepper}\0${password}` : password
}

/**
 * Hash a plaintext password using bcrypt with high cost factor + pepper.
 *
 * @returns The bcrypt hash string (60 chars)
 */
export async function hashPassword(
  password: string,
  config: Partial<HashConfig> = {},
): Promise<string> {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  // Dynamic import — bcryptjs may not be available at build time
  const bcrypt = await import('bcryptjs')

  const peppered = applyPepper(password)

  // bcrypt truncates at 72 bytes; the pepper + null + password could exceed this.
  // If it does, we SHA-256 the peppered value to fit within 72 bytes.
  let toHash = peppered
  if (Buffer.byteLength(peppered, 'utf8') > 72) {
    const { createHash } = await import('crypto')
    // SHA-256 → 64 hex chars (< 72 bytes) — preserves entropy
    toHash = createHash('sha256').update(peppered).digest('hex')
  }

  return bcrypt.hash(toHash, cfg.costFactor)
}

/**
 * Verify a plaintext password against a bcrypt hash.
 *
 * NOTE: For the existing `verify_admin_login` RPC, the verification
 * happens server-side in PostgreSQL. This function is for direct Node.js
 * verification (e.g. during migration or in tests).
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  const bcrypt = await import('bcryptjs')
  const peppered = applyPepper(password)

  let toVerify = peppered
  if (Buffer.byteLength(peppered, 'utf8') > 72) {
    const { createHash } = await import('crypto')
    toVerify = createHash('sha256').update(peppered).digest('hex')
  }

  return bcrypt.compare(toVerify, hash)
}

// ---------------------------------------------------------------------------
// 4. Have-I-Been-Pwned Check (k-Anonymity)
// ---------------------------------------------------------------------------

/**
 * Check if a password has appeared in known data breaches using the
 * Have I Been Pwned (HIBP) API with k-anonymity.
 *
 * Only the first 5 characters of the SHA-1 hash are sent to HIBP;
 * the full hash never leaves the server.
 *
 * @returns The number of times the password appeared in breaches (0 = safe)
 */
export async function checkBreachedPassword(password: string): Promise<number> {
  try {
    const { createHash } = await import('crypto')
    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase()
    const prefix = sha1.substring(0, 5)
    const suffix = sha1.substring(5)

    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'User-Agent': 'RAMS-Security-Check' },
    })

    if (!response.ok) {
      console.warn('[HIBP] API returned non-OK status:', response.status)
      return 0 // Fail open — don't block user if API is down
    }

    const text = await response.text()
    const lines = text.split('\r\n')

    for (const line of lines) {
      const [hashSuffix, count] = line.split(':')
      if (hashSuffix === suffix) {
        return parseInt(count, 10)
      }
    }

    return 0 // Not found in breaches
  } catch (error) {
    console.warn('[HIBP] Check failed:', error)
    return 0 // Fail open
  }
}

// ---------------------------------------------------------------------------
// 5. Secure Password Hash API (replacement for /api/admin/hash-password)
// ---------------------------------------------------------------------------

/**
 * Secure handler for the admin password hash endpoint.
 * Enforces password policy, checks for breaches, and uses high-cost bcrypt.
 */
export async function secureHashPasswordHandler(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { email, plainPassword, skipBreachCheck } = body

    if (!email || !plainPassword) {
      return NextResponse.json(
        { error: 'Email and plainPassword are required' },
        { status: 400 },
      )
    }

    // 1. Enforce password policy
    const policy = enforcePasswordPolicy(plainPassword)
    if (!policy.valid) {
      return NextResponse.json(
        { error: 'Password does not meet security policy', details: policy.errors },
        { status: 400 },
      )
    }

    // 2. Check for breached passwords (optional, can be skipped for admin reset)
    if (!skipBreachCheck) {
      const breachCount = await checkBreachedPassword(plainPassword)
      if (breachCount > 0) {
        return NextResponse.json(
          {
            error: `This password has appeared in ${breachCount.toLocaleString()} data breaches. Choose a different password.`,
            breached: true,
            count: breachCount,
          },
          { status: 400 },
        )
      }
    }

    // 3. Hash with high-cost bcrypt + pepper
    const hash = await hashPassword(plainPassword)

    return NextResponse.json({
      success: true,
      email,
      hash,
      costFactor: DEFAULT_CONFIG.costFactor,
      peppered: !!process.env[DEFAULT_CONFIG.pepperEnvVar],
    })
  } catch (error: any) {
    console.error('[SecureHash] Error:', error)
    return NextResponse.json(
      { error: 'Hashing failed' },
      { status: 500 },
    )
  }
}

// ---------------------------------------------------------------------------
// 6. Rate Limiter for Password-Change Endpoints
// ---------------------------------------------------------------------------

const passwordChangeAttempts = new Map<string, { count: number; firstAt: number }>()

/**
 * Rate-limit password change/reset attempts per user.
 * Max 3 attempts per 15 minutes.
 */
export function checkPasswordChangeRate(userId: number | string): { allowed: boolean; retryAfter?: number } {
  const key = `pwd-change:${userId}`
  const now = Date.now()
  const windowMs = 15 * 60_000 // 15 min
  const maxAttempts = 3

  const record = passwordChangeAttempts.get(key)

  if (!record || now - record.firstAt > windowMs) {
    passwordChangeAttempts.set(key, { count: 1, firstAt: now })
    return { allowed: true }
  }

  if (record.count >= maxAttempts) {
    const retryAfter = Math.ceil((record.firstAt + windowMs - now) / 1000)
    return { allowed: false, retryAfter }
  }

  record.count++
  return { allowed: true }
}
