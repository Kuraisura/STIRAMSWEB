import type { NextRequest } from 'next/server'

/** In-memory lockout map (survives for one Node process lifetime; suitable for single-server deployments). */

type Entry = {
  failures: number
  lockedUntilMs: number
}

const lockoutStore = new Map<string, Entry>()

function getRecoveryUnlockMaxAttempts(): number {
  const n = Number(process.env.RECOVERY_UNLOCK_MAX_ATTEMPTS)
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 50) : 5
}

function getRecoveryUnlockLockoutMs(): number {
  const seconds = Number(process.env.RECOVERY_UNLOCK_LOCKOUT_SECONDS)
  const effective = Number.isFinite(seconds) && seconds > 0 ? seconds : 300
  return Math.min(Math.floor(effective), 86400) * 1000
}

export function getRecoveryUnlockFailureClientKey(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

export type LockoutGateResult =
  | { blocked: false }
  | { blocked: true; retryAfterSec: number }

export function getRecoveryUnlockLockoutStatus(clientKey: string): LockoutGateResult {
  const now = Date.now()
  let entry = lockoutStore.get(clientKey)
  if (!entry || entry.failures <= 0) {
    lockoutStore.delete(clientKey)
    return { blocked: false }
  }
  if (entry.lockedUntilMs > now) {
    return {
      blocked: true,
      retryAfterSec: Math.max(1, Math.ceil((entry.lockedUntilMs - now) / 1000)),
    }
  }
  return { blocked: false }
}

export function recordRecoveryUnlockFailure(clientKey: string): LockoutGateResult {
  const now = Date.now()
  const maxAttempts = getRecoveryUnlockMaxAttempts()
  const lockMs = getRecoveryUnlockLockoutMs()

  let entry = lockoutStore.get(clientKey)
  if (!entry || entry.lockedUntilMs <= now) {
    entry = { failures: 0, lockedUntilMs: 0 }
  }
  entry.failures++
  lockoutStore.set(clientKey, entry)

  if (entry.failures >= maxAttempts) {
    entry.failures = 0
    entry.lockedUntilMs = now + lockMs
    lockoutStore.set(clientKey, entry)
    return {
      blocked: true,
      retryAfterSec: Math.ceil(lockMs / 1000),
    }
  }
  lockoutStore.set(clientKey, entry)
  return { blocked: false }
}

export function clearRecoveryUnlockFailures(clientKey: string) {
  lockoutStore.delete(clientKey)
}
