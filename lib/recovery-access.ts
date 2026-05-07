import crypto from 'crypto'

const RECOVERY_COOKIE_NAME = 'rams_recovery'
const GUEST_RECOVERY_COOKIE_NAME = 'rams_recovery_guest'
const DEFAULT_TTL_SECONDS = 30 * 60 // 30 minutes

function getRecoverySecret() {
  return process.env.RECOVERY_CONSOLE_SECRET || process.env.EMERGENCY_RECOVERY_SECRET || ''
}

export function getRecoveryCookieName() {
  return RECOVERY_COOKIE_NAME
}

export function getGuestRecoveryCookieName() {
  return GUEST_RECOVERY_COOKIE_NAME
}

export function hasRecoverySecretConfigured() {
  return Boolean(getRecoverySecret())
}

export function verifyRecoveryPassphrase(input: string) {
  const secret = getRecoverySecret()
  if (!secret) return false

  const a = Buffer.from(String(input || ''), 'utf8')
  const b = Buffer.from(secret, 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

function signTokenBody(body: string) {
  const secret = getRecoverySecret()
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

export function issueRecoveryToken(userId: number, ttlSeconds: number = DEFAULT_TTL_SECONDS) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const body = `${userId}.${exp}`
  const sig = signTokenBody(body)
  return `${body}.${sig}`
}

export function verifyRecoveryToken(token: string | undefined, expectedUserId?: number) {
  if (!token || !hasRecoverySecretConfigured()) {
    return { valid: false as const, reason: 'missing' }
  }

  const parts = token.split('.')
  if (parts.length !== 3) {
    return { valid: false as const, reason: 'malformed' }
  }

  const userId = Number(parts[0])
  const exp = Number(parts[1])
  const sig = parts[2]

  if (!Number.isFinite(userId) || !Number.isFinite(exp)) {
    return { valid: false as const, reason: 'invalid_payload' }
  }

  const now = Math.floor(Date.now() / 1000)
  if (exp < now) {
    return { valid: false as const, reason: 'expired' }
  }

  if (expectedUserId && userId !== expectedUserId) {
    return { valid: false as const, reason: 'user_mismatch' }
  }

  const body = `${userId}.${exp}`
  const expectedSig = signTokenBody(body)
  const a = Buffer.from(sig, 'utf8')
  const b = Buffer.from(expectedSig, 'utf8')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false as const, reason: 'bad_signature' }
  }

  return { valid: true as const, userId, exp }
}

/**
 * Guest recovery session: unlock without admin login (passphrase-only + lockout on /api/recovery/unlock).
 * Token format matches lib/recovery-guest-edge.ts verification in middleware.
 */
export function issueGuestRecoveryToken(ttlSeconds: number = DEFAULT_TTL_SECONDS) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const body = `guest.${exp}`
  const sig = signTokenBody(body)
  return `${body}.${sig}`
}

export function verifyGuestRecoveryToken(token: string | undefined) {
  if (!token || !hasRecoverySecretConfigured()) {
    return { valid: false as const, reason: 'missing' as const }
  }

  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'guest') {
    return { valid: false as const, reason: 'malformed' as const }
  }

  const exp = Number(parts[1])
  const sig = parts[2]
  if (!Number.isFinite(exp) || !sig) {
    return { valid: false as const, reason: 'invalid_payload' as const }
  }

  const now = Math.floor(Date.now() / 1000)
  if (exp < now) {
    return { valid: false as const, reason: 'expired' as const }
  }

  const body = `guest.${exp}`
  const expectedSig = signTokenBody(body)
  const a = Buffer.from(sig, 'utf8')
  const b = Buffer.from(expectedSig, 'utf8')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false as const, reason: 'bad_signature' as const }
  }

  return { valid: true as const, exp }
}
