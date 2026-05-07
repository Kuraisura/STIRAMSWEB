/**
 * Edge-compatible verification for guest recovery cookie (middleware).
 * Must match signing in lib/recovery-access.ts (HMAC-SHA256 over UTF-8 body, hex digest).
 */

const textEncoder = new TextEncoder()

function hexFromBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function getRecoverySecret(): string {
  return process.env.RECOVERY_CONSOLE_SECRET || process.env.EMERGENCY_RECOVERY_SECRET || ''
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, textEncoder.encode(message))
  return hexFromBuffer(sig)
}

export async function verifyGuestRecoveryCookieEdge(cookieValue: string | undefined): Promise<boolean> {
  const secret = getRecoverySecret()
  if (!secret || !cookieValue) return false

  const parts = cookieValue.split('.')
  if (parts.length !== 3 || parts[0] !== 'guest') return false

  const exp = Number(parts[1])
  const sigHex = parts[2]
  if (!Number.isFinite(exp) || !/^[a-f0-9]+$/i.test(sigHex)) return false

  const now = Math.floor(Date.now() / 1000)
  if (exp < now) return false

  const body = `guest.${exp}`
  const expected = await hmacSha256Hex(secret, body)
  return timingSafeEqualHex(sigHex.toLowerCase(), expected.toLowerCase())
}

export function recoveryGuestBypassPath(pathname: string): boolean {
  if (pathname === '/dashboard/recovery-console') return true
  if (pathname.startsWith('/api/recovery/')) return true
  if (pathname.startsWith('/api/schedules/integrity')) return true
  if (pathname.startsWith('/api/attendance/repair-schedule-times')) return true
  if (pathname.startsWith('/api/operations/scenario-health')) return true
  return false
}
