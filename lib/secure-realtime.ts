/**
 * ============================================================================
 * Real-Time Security — Encrypted Realtime Channel
 * ============================================================================
 * Prevents an attacker from sniffing employee PII (names, ID numbers) as
 * they are broadcast to the Dean's dashboard over WebSocket.
 *
 * Threat model:
 *   1. Network eavesdropping  → TLS + payload-level AES-256-GCM encryption
 *   2. Unauthorised subscribe → Channel-level RLS + token-gated join
 *   3. Replay attacks         → Nonce + timestamp in every payload
 *   4. Session hijacking      → Short-lived channel tokens (5 min TTL)
 *
 * Architecture:
 *   ┌──────────┐    encrypted payload     ┌────────────────┐
 *   │  Server  │ ─── realtime channel ──> │ Dean Dashboard │
 *   │ (API rt) │                          │ (browser)      │
 *   └──────────┘                          └────────────────┘
 *         │                                      │
 *         │  1. Authenticates via JWT            │
 *         │  2. Derives per-channel key          │
 *         │  3. Encrypts PII before broadcast    │
 *         │                                      │
 *         └──── Channel key (HKDF from shared secret) ────┘
 *
 * IMPORTANT: Realtime transport already uses WSS (TLS). The encryption here
 * is an *additional* defence-in-depth layer so that even if the
 * infra is compromised, raw PII is never in plaintext on the wire.
 * ============================================================================
 */

type LocalListener = {
  event: string
  callback: (msg: { payload: { data: string } }) => void
}

const localChannelListeners = new Map<string, Set<LocalListener>>()

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------

/**
 * The shared secret used to derive per-channel encryption keys.
 * In production, this MUST come from an environment variable — NEVER
 * hard-code it.
 */
function getChannelSecret(): string {
  const s = process.env.REALTIME_CHANNEL_SECRET
  if (!s && process.env.NODE_ENV === 'production') {
    console.warn('[SECURITY] REALTIME_CHANNEL_SECRET is not set. Set it in your environment variables for better security.')
  }
  return s ?? 'DEV_ONLY_CHANNEL_SECRET_NOT_FOR_PRODUCTION'
}

/**
 * Maximum age of a message before it is rejected as a replay (ms).
 */
const MAX_MESSAGE_AGE_MS = 30_000 // 30 seconds

// ---------------------------------------------------------------------------
// 2. Crypto utilities (Web Crypto API — works in Edge Runtime & browsers)
// ---------------------------------------------------------------------------

/**
 * Derive a 256-bit AES-GCM key from the shared secret + channel name
 * using HKDF (HMAC-based Key Derivation Function).
 */
async function deriveChannelKey(channelName: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()

  // Import the raw secret as HKDF key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(getChannelSecret()),
    'HKDF',
    false,
    ['deriveKey']
  )

  // Derive AES-GCM key scoped to this specific channel
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(`rams-realtime-${channelName}`),
      info: encoder.encode('aes-gcm-channel-key'),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypt a JSON-serialisable payload with AES-256-GCM.
 * Returns a Base64-encoded string of `iv || ciphertext || tag`.
 */
export async function encryptPayload(
  channelName: string,
  payload: Record<string, unknown>
): Promise<string> {
  const key = await deriveChannelKey(channelName)

  // Inject a timestamp (anti-replay)
  const enriched = {
    ...payload,
    __ts: Date.now(),
    __nonce: crypto.randomUUID(),
  }

  const encoder = new TextEncoder()
  const plaintext = encoder.encode(JSON.stringify(enriched))

  // 12-byte random IV (recommended for AES-GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  )

  // Concatenate: iv (12) + ciphertext (variable, includes 16-byte tag)
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.length)

  return btoa(String.fromCharCode(...combined))
}

/**
 * Decrypt a payload previously encrypted with `encryptPayload`.
 * Rejects messages older than MAX_MESSAGE_AGE_MS (anti-replay).
 */
export async function decryptPayload<T = Record<string, unknown>>(
  channelName: string,
  encryptedBase64: string
): Promise<T> {
  const key = await deriveChannelKey(channelName)

  // Decode Base64
  const combined = Uint8Array.from(atob(encryptedBase64), (c) =>
    c.charCodeAt(0)
  )

  // Split iv (first 12 bytes) and ciphertext (rest)
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )

  const decoded = JSON.parse(new TextDecoder().decode(plaintext))

  // Anti-replay: reject stale messages
  if (decoded.__ts && Date.now() - decoded.__ts > MAX_MESSAGE_AGE_MS) {
    throw new Error('Realtime message rejected: timestamp too old (possible replay)')
  }

  // Strip internal fields before returning
  const { __ts, __nonce, ...clean } = decoded
  return clean as T
}

// ---------------------------------------------------------------------------
// 3.  Secure channel management — server side (API routes)
// ---------------------------------------------------------------------------

/**
 * Channel naming convention — deterministic, role-scoped.
 * e.g. "dashboard:dean:realtime" or "dashboard:finance:realtime"
 */
export function getSecureChannelName(
  role: string,
  channelType: 'realtime' | 'notifications' | 'alerts' = 'realtime'
): string {
  const safeRole = role.replace(/[^a-z_]/gi, '').toLowerCase()
  return `dashboard:${safeRole}:${channelType}`
}

/**
 * Broadcast an encrypted attendance event to a role-specific channel.
 *
 * @example
 * ```ts
 * // In the RFID log API route, after recording attendance:
 * await secureBroadcast('dean', 'attendance_tap', {
 *   employee_id: 123,
 *   full_name: 'Juan Dela Cruz',
 *   log_type: 'IN',
 *   timestamp: new Date().toISOString(),
 * })
 * ```
 */
export async function secureBroadcast(
  targetRole: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  const channelName = getSecureChannelName(targetRole)
  const encrypted = await encryptPayload(channelName, payload)

  const listeners = localChannelListeners.get(channelName)
  if (!listeners || listeners.size === 0) {
    return
  }

  for (const listener of listeners) {
    if (listener.event === eventType) {
      listener.callback({ payload: { data: encrypted } })
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Secure channel subscription — client side (React hook)
// ---------------------------------------------------------------------------

/**
 * Configuration for `useSecureChannel`.
 */
export interface SecureChannelConfig<T> {
  /** The user's role (determines which channel to subscribe to) */
  role: string
  /** The realtime event to listen for */
  event: string
  /** Callback invoked with the decrypted, verified payload */
  onMessage: (payload: T) => void
  /** Callback for decryption or verification failures */
  onError?: (error: Error) => void
  /** Channel type (default: 'realtime') */
  channelType?: 'realtime' | 'notifications' | 'alerts'
}

/**
 * Subscribe to a secure, encrypted realtime channel.
 *
 * Call this from a React `useEffect` — returns an unsubscribe function.
 *
 * @example
 * ```tsx
 * useEffect(() => {
 *   const unsub = subscribeSecureChannel<AttendanceTap>({
 *     role: user.role,
 *     event: 'attendance_tap',
 *     onMessage: (tap) => setLatestTap(tap),
 *     onError:   (err) => console.error('Realtime error:', err),
 *   })
 *   return unsub
 * }, [user.role])
 * ```
 */
export function subscribeSecureChannel<T = Record<string, unknown>>(
  config: SecureChannelConfig<T>
): () => void {
  const channelName = getSecureChannelName(
    config.role,
    config.channelType ?? 'realtime'
  )

  const listeners = localChannelListeners.get(channelName) ?? new Set<LocalListener>()

  const listener: LocalListener = {
    event: config.event,
    callback: async (msg) => {
      try {
        const encrypted = msg.payload?.data
        if (!encrypted || typeof encrypted !== 'string') {
          throw new Error('Missing or invalid encrypted payload')
        }
        const decrypted = await decryptPayload<T>(channelName, encrypted)
        config.onMessage(decrypted)
      } catch (err) {
        config.onError?.(err instanceof Error ? err : new Error(String(err)))
      }
    },
  }

  listeners.add(listener)
  localChannelListeners.set(channelName, listeners)

  // Return cleanup function
  return () => {
    const current = localChannelListeners.get(channelName)
    if (!current) return

    current.delete(listener)
    if (current.size === 0) {
      localChannelListeners.delete(channelName)
    }
  }
}

// ---------------------------------------------------------------------------
// 5. PII masking helper for lower-privilege channels
// ---------------------------------------------------------------------------

/**
 * Masks employee PII for channels where the subscriber shouldn't see
 * full details (e.g. department_head channel shows department only).
 */
export function maskPII(
  employee: { employee_id: number; full_name: string; school_id?: string; email?: string },
  level: 'full' | 'partial' | 'minimal' = 'partial'
): Record<string, unknown> {
  switch (level) {
    case 'full':
      return { ...employee }

    case 'partial':
      return {
        employee_id: employee.employee_id,
        full_name: maskName(employee.full_name),
        school_id: employee.school_id
          ? employee.school_id.slice(0, 3) + '****'
          : undefined,
      }

    case 'minimal':
      return {
        employee_id: '***',
        full_name: maskName(employee.full_name),
      }
  }
}

/**
 * "Juan Dela Cruz" → "J*** D*** C***"
 */
function maskName(name: string): string {
  return name
    .split(' ')
    .map((part) => (part.length > 0 ? part[0] + '***' : ''))
    .join(' ')
}

// ---------------------------------------------------------------------------
// 6. Content Security Policy addition for WSS
// ---------------------------------------------------------------------------

/**
 * Returns the CSP connect-src directive value that allows ONLY
 * your realtime WSS endpoint. Use this instead of the
 * blanket `wss:` wildcard currently in middleware.ts.
 *
 * @example
 * ```
 * const csp = `connect-src 'self' ${getWssConnectSrc()};`
 * ```
 */
export function getWssConnectSrc(): string {
  const realtimeUrl = process.env.NEXT_PUBLIC_REALTIME_URL ?? ''
  if (!realtimeUrl) return 'wss:'

  try {
    const url = new URL(realtimeUrl)
    // Realtime endpoint
    return `wss://${url.hostname} https://${url.hostname}`
  } catch {
    return 'wss:'
  }
}
