/**
 * ============================================================================
 * HMAC-SHA256 Request Signing & Replay-Attack Guard
 * ============================================================================
 * Prevents:
 *   - Replay attacks  → RFID tap replayed via Burp Suite / Postman.
 *   - Request tampering → Fields modified in-flight.
 *
 * How it works:
 *   1. The WPF client (or any trusted device) computes:
 *        signature = HMAC-SHA256(sharedSecret, nonce + timestamp + body)
 *   2. It sends the request with headers:
 *        X-HMAC-Signature: <hex signature>
 *        X-HMAC-Nonce:     <uuid-v4>
 *        X-HMAC-Timestamp: <unix ms>
 *   3. This module verifies the signature, checks freshness (±60 s),
 *      and rejects any nonce that has already been seen.
 *
 * Nonce deduplication:
 *   - In-memory Set (fast) + optional DB persistence.
 *   - Nonces older than the freshness window are garbage-collected.
 *
 * Integration:
 *   Wrap any route handler:
 *     export const POST = withHMACGuard(handler)
 *   Or call verifyHMAC(request, body) manually.
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { dbQuery } from './db'

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------

interface HMACConfig {
  /** Env var holding the 64-char hex shared secret */
  secretEnvVar: string
  /** Maximum clock skew allowed between client and server (ms) */
  maxClockSkewMs: number
  /** How long to keep nonces in memory before GC (ms) */
  nonceRetentionMs: number
  /** GC interval for stale nonces (ms) */
  gcIntervalMs: number
  /** Headers the client must include */
  headers: {
    signature: string
    nonce: string
    timestamp: string
  }
}

const DEFAULT_CONFIG: HMACConfig = {
  secretEnvVar: 'RFID_HMAC_SECRET',
  maxClockSkewMs: 60_000,          // ±60 seconds
  nonceRetentionMs: 2 * 60_000,    // Keep nonces for 2 min (double the skew window)
  gcIntervalMs: 5 * 60_000,        // GC every 5 min
  headers: {
    signature: 'x-hmac-signature',
    nonce: 'x-hmac-nonce',
    timestamp: 'x-hmac-timestamp',
  },
}

// ---------------------------------------------------------------------------
// 2. Nonce Store (in-memory + optional DB)
// ---------------------------------------------------------------------------

interface NonceEntry {
  usedAt: number    // Unix ms
}

const usedNonces = new Map<string, NonceEntry>()

// Garbage-collect expired nonces periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const cutoff = Date.now() - DEFAULT_CONFIG.nonceRetentionMs
    for (const [nonce, entry] of usedNonces.entries()) {
      if (entry.usedAt < cutoff) {
        usedNonces.delete(nonce)
      }
    }
  }, DEFAULT_CONFIG.gcIntervalMs)
}

/**
 * Check if a nonce has already been used. If not, mark it as used.
 * Returns `true` if the nonce is FRESH (first use), `false` if REPLAYED.
 */
function consumeNonce(nonce: string): boolean {
  if (usedNonces.has(nonce)) {
    return false // Replay detected
  }
  usedNonces.set(nonce, { usedAt: Date.now() })
  return true
}

/**
 * Persist a used nonce to the database for cross-instance deduplication.
 * Best-effort; does not block the request.
 */
async function persistNonce(nonce: string, ip: string): Promise<void> {
  try {
    await dbQuery(
      `INSERT INTO used_nonces (nonce, ip_address, used_at, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [
        nonce,
        ip,
        new Date().toISOString(),
        new Date(Date.now() + DEFAULT_CONFIG.nonceRetentionMs).toISOString(),
      ]
    )
  } catch {
    // Best-effort; in-memory dedup is the primary guard
  }
}

/**
 * Check the DB for a nonce (used when the in-memory map is empty,
 * e.g. immediately after a server restart).
 */
async function isNonceUsedInDB(nonce: string): Promise<boolean> {
  try {
    const rows = await dbQuery<{ nonce: string }>(
      `SELECT nonce
       FROM used_nonces
       WHERE nonce = $1
         AND expires_at >= $2
       LIMIT 1`,
      [nonce, new Date().toISOString()]
    )
    return rows.length > 0
  } catch {
    return false // Fail-open for DB errors; in-memory is primary
  }
}

// ---------------------------------------------------------------------------
// 3. HMAC Verification
// ---------------------------------------------------------------------------

export interface HMACVerifyResult {
  valid: boolean
  error?: string
  /** The nonce that was consumed (for audit logging) */
  nonce?: string
}

/**
 * Verify the HMAC-SHA256 signature on an incoming request.
 *
 * Expected signature = HMAC-SHA256( secret, nonce + timestamp + bodyJSON )
 *
 * @param request  The incoming NextRequest (for reading headers)
 * @param body     The parsed request body (will be re-serialized deterministically)
 * @param config   Optional config override
 */
export async function verifyHMAC(
  request: NextRequest,
  body: Record<string, unknown>,
  config: Partial<HMACConfig> = {},
): Promise<HMACVerifyResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const secret = process.env[cfg.secretEnvVar]

  // --- Guard: secret must be configured ---
  if (!secret || secret.length < 32) {
    console.error(`[HMAC] ${cfg.secretEnvVar} is not set or too short. Replay protection DISABLED.`)
    // In development, allow unsigned requests with a warning
    if (process.env.NODE_ENV === 'development') {
      return { valid: true, nonce: 'dev-bypass' }
    }
    return { valid: false, error: 'Server misconfiguration: signing secret not set' }
  }

  // --- 1. Extract headers ---
  const signature = request.headers.get(cfg.headers.signature)
  const nonce     = request.headers.get(cfg.headers.nonce)
  const timestamp = request.headers.get(cfg.headers.timestamp)

  if (!signature || !nonce || !timestamp) {
    return {
      valid: false,
      error: 'Missing required HMAC headers (X-HMAC-Signature, X-HMAC-Nonce, X-HMAC-Timestamp)',
    }
  }

  // --- 2. Validate nonce format (UUID v4) ---
  const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!uuidV4Regex.test(nonce)) {
    return { valid: false, error: 'Invalid nonce format (expected UUID v4)' }
  }

  // --- 3. Validate timestamp freshness ---
  const ts = parseInt(timestamp, 10)
  if (isNaN(ts)) {
    return { valid: false, error: 'Invalid timestamp' }
  }
  const drift = Math.abs(Date.now() - ts)
  if (drift > cfg.maxClockSkewMs) {
    return {
      valid: false,
      error: `Request too old or too far in future (drift=${Math.round(drift / 1000)}s, max=${cfg.maxClockSkewMs / 1000}s)`,
    }
  }

  // --- 4. Check for replay (nonce reuse) ---
  const isFresh = consumeNonce(nonce)
  if (!isFresh) {
    return { valid: false, error: 'Nonce already used (replay rejected)' }
  }

  // Also check DB for nonces from other instances
  const usedInDB = await isNonceUsedInDB(nonce)
  if (usedInDB) {
    return { valid: false, error: 'Nonce already used (replay rejected — cross-instance)' }
  }

  // --- 5. Recompute HMAC ---
  // Deterministic body serialization: sort keys to ensure consistent hashing
  const bodyString = JSON.stringify(body, Object.keys(body).sort())
  const message = `${nonce}${timestamp}${bodyString}`

  const expectedSig = createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(message)
    .digest('hex')

  // Constant-time comparison to prevent timing attacks
  const sigBuffer = Buffer.from(signature, 'hex')
  const expectedBuffer = Buffer.from(expectedSig, 'hex')

  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, error: 'Invalid HMAC signature (tampered or wrong key)' }
  }

  // --- 6. Persist nonce (async, non-blocking) ---
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
  void persistNonce(nonce, ip)

  return { valid: true, nonce }
}

// ---------------------------------------------------------------------------
// 4. Route Handler Wrapper
// ---------------------------------------------------------------------------

type RouteHandler = (req: NextRequest, ctx?: any) => Promise<NextResponse>

/**
 * Wrap a Next.js route handler with HMAC verification.
 *
 * Usage:
 *   export const POST = withHMACGuard(myHandler)
 *
 * In **development mode**, if `RFID_HMAC_SECRET` is not set the guard
 * logs a warning but allows the request through so local testing isn't
 * blocked.
 */
export function withHMACGuard(
  handler: RouteHandler,
  config: Partial<HMACConfig> = {},
): RouteHandler {
  return async (request: NextRequest, ctx?: any) => {
    let body: Record<string, unknown>
    try {
      body = await request.clone().json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const result = await verifyHMAC(request, body, config)

    if (!result.valid) {
      console.warn('[HMAC Guard] Request rejected:', result.error, {
        path: request.nextUrl.pathname,
        ip: request.headers.get('x-forwarded-for') || 'unknown',
      })

      // Log to security_alerts table (best-effort)
      try {
        await dbQuery(
          `INSERT INTO security_alerts (
             alert_type,
             severity,
             message,
             source_ip,
             request_path,
             metadata,
             created_at
           ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
          [
            'replay_attack',
            'high',
            result.error || 'Replay attack detected',
            request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
            request.nextUrl.pathname,
            JSON.stringify({
              nonce: request.headers.get('x-hmac-nonce'),
              timestamp: request.headers.get('x-hmac-timestamp'),
            }),
            new Date().toISOString(),
          ]
        )
      } catch { /* best-effort */ }

      return NextResponse.json(
        { success: false, error: 'Request authentication failed' },
        { status: 403 },
      )
    }

    // Attach the consumed nonce to headers for downstream audit logging
    const modifiedHeaders = new Headers(request.headers)
    modifiedHeaders.set('x-verified-nonce', result.nonce || '')

    return handler(request, ctx)
  }
}

// ---------------------------------------------------------------------------
// 5. WPF / Device Client Helper — Reference Implementation (C#)
// ---------------------------------------------------------------------------
//
// This is provided as a code comment for the WPF desktop app developer.
//
// ```csharp
// using System.Security.Cryptography;
// using System.Text;
// using System.Text.Json;
//
// public static class HMACRequestSigner
// {
//     private static readonly string SharedSecret = Environment.GetEnvironmentVariable("RFID_HMAC_SECRET")!;
//
//     public static (string signature, string nonce, string timestamp)
//         SignRequest(object body)
//     {
//         var nonce     = Guid.NewGuid().ToString();
//         var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
//
//         // Deterministic JSON: sort keys
//         var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
//         var sorted  = JsonSerializer.Serialize(body, options);  // Ensure key-sorted
//
//         var message = $"{nonce}{timestamp}{sorted}";
//         var key     = Convert.FromHexString(SharedSecret);
//
//         using var hmac = new HMACSHA256(key);
//         var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(message));
//         var signature = Convert.ToHexString(hash).ToLowerInvariant();
//
//         return (signature, nonce, timestamp);
//     }
// }
//
// // Usage in HttpClient:
// var (sig, nonce, ts) = HMACRequestSigner.SignRequest(new { rfid_code = "ABC123", log_type = "IN" });
// client.DefaultRequestHeaders.Add("X-HMAC-Signature", sig);
// client.DefaultRequestHeaders.Add("X-HMAC-Nonce", nonce);
// client.DefaultRequestHeaders.Add("X-HMAC-Timestamp", ts);
// ```
//
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 6. Nonce DB Migration (reference — add to your database migration file)
// ---------------------------------------------------------------------------
//
// CREATE TABLE IF NOT EXISTS used_nonces (
//   nonce       TEXT PRIMARY KEY,
//   ip_address  TEXT,
//   used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
//   expires_at  TIMESTAMPTZ NOT NULL
// );
//
// -- Auto-delete expired nonces every hour
// CREATE EXTENSION IF NOT EXISTS pg_cron;
// SELECT cron.schedule('cleanup-nonces', '0 * * * *',
//   $$DELETE FROM used_nonces WHERE expires_at < NOW()$$
// );
//
// ---------------------------------------------------------------------------
