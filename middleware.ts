import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { logRealtimeActivity, tryExtractSessionIdFromToken } from '@/lib/realtime-monitor'
import { recoveryGuestBypassPath, verifyGuestRecoveryCookieEdge } from '@/lib/recovery-guest-edge'

const GUEST_RECOVERY_COOKIE = 'rams_recovery_guest'

// ---------------------------------------------------------------------------
// Session cookie name (must match lib/session-manager.ts)
// ---------------------------------------------------------------------------
const SESSION_COOKIE = 'rams_sid'

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  'DEV_ONLY_SESSION_SECRET_NOT_FOR_PRODUCTION_USE_64_CHARS_MINIMUM'

// ---------------------------------------------------------------------------
// Global Rate Limiting (DDoS protection at middleware level)
// ---------------------------------------------------------------------------
const GLOBAL_RATE_LIMIT = {
  windowMs: 60_000,     // 1 minute window
  maxRequests: 1200,    // relaxed to avoid false positives during heavy dashboard navigation
  authMaxRequests: 120, // relaxed auth limit; login brute-force is still protected by app logic
}

// Temporary testing override: allow unrestricted request bursts while validating category flows.
const DISABLE_RATE_LIMITING = true

interface RLEntry { count: number; reset: number }
const globalRL = new Map<string, RLEntry>()
const authRL = new Map<string, RLEntry>()

// Periodic cleanup (runs in-process)
let lastCleanup = Date.now()
function cleanupRL() {
  const now = Date.now()
  if (now - lastCleanup < 30_000) return // cleanup every 30s
  lastCleanup = now
  for (const [k, v] of globalRL) { if (v.reset < now) globalRL.delete(k) }
  for (const [k, v] of authRL) { if (v.reset < now) authRL.delete(k) }
}

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

function checkRL(store: Map<string, RLEntry>, key: string, max: number): { ok: boolean; retryAfter: number } {
  const now = Date.now()
  let entry = store.get(key)
  if (!entry || entry.reset < now) {
    entry = { count: 0, reset: now + GLOBAL_RATE_LIMIT.windowMs }
    store.set(key, entry)
  }
  entry.count++
  if (entry.count > max) {
    return { ok: false, retryAfter: Math.ceil((entry.reset - now) / 1000) }
  }
  return { ok: true, retryAfter: 0 }
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function uint8ToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hmacSign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return uint8ToHex(new Uint8Array(sig))
}

async function parseAndVerifySessionCookie(token: string): Promise<{ sid: string; exp: number; fp: string } | null> {
  try {
    const decoded = atob(token)
    const parts = decoded.split('.')
    if (parts.length !== 4) return null

    const [sid, expStr, fp, sig] = parts
    const exp = Number(expStr)
    if (!sid || !fp || !Number.isFinite(exp)) return null

    const raw = `${sid}.${expStr}.${fp}`
    const expectedSig = await hmacSign(raw)
    if (!constantTimeEqual(expectedSig, sig)) return null

    return { sid, exp, fp }
  } catch {
    return null
  }
}

/**
 * Paths that never require authentication.
 */
const PUBLIC_PATHS = [
  '/auth/login',
  '/auth/recovery',
  '/auth/forgot-password',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/status',
  '/api/health',
  '/api/rfid',          // RFID hardware endpoints (device-authed)
  '/api/rfid-log',
  '/landing',
  '/how-rams-works',
  '/',
]

/**
 * Check if path should be excluded from ALL middleware processing
 */
function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next/') ||
    !!pathname.match(/\.(ico|png|jpg|jpeg|gif|webp|svg|css|js|woff|woff2|ttf|eot|mp4|mp3|pdf)$/i) ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  )
}

/**
 * Check if a path is public (no auth required).
 */
function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

/** Guest recovery passphrase + status (must not open all of /api/recovery/). */
function isPublicRecoveryBypassPath(pathname: string, method: string): boolean {
  const m = method.toUpperCase()
  if (pathname === '/api/recovery/status' && (m === 'GET' || m === 'HEAD')) return true
  return pathname === '/api/recovery/unlock' && m === 'POST'
}

/**
 * Check if user agent indicates a mobile device
 */
function isMobileUserAgent(userAgent: string): boolean {
  const ua = userAgent.toLowerCase()
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet|kindle|silk|fennec|maemo|windows phone|windows mobile|windows ce|palm|symbian|symbos|series60|series40|nokia|lg|motorola|samsung|sony|ericsson|huawei|xiaomi|oppo|vivo|oneplus|realme|meizu|zte|alcatel|asus|acer|dell|hp|lenovo|toshiba|fujitsu|panasonic|sharp|sanyo|benq|philips|siemens|sagem|nec|pantech|kyocera|sendo|bird|amoi|haier|konka|tcl|gionee|coolpad|leeco|letv|zuk|yulong|gfive|karbonn|micromax|spice|celkon|intex|lava|wiko|archos|prestigio|teclast|onda|cube|chuwi|jide|remix/i.test(ua)
}

// ---------------------------------------------------------------------------
// Hardened Content Security Policy
// ---------------------------------------------------------------------------
function isLocalOrLanOrigin(origin: string): boolean {
  try {
    const u = new URL(origin)
    const host = (u.hostname || '').toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return true
    if (host.startsWith('192.168.')) return true
    if (/^10\./.test(host)) return true
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true
    return false
  } catch {
    return false
  }
}

function getRequestOrigin(request?: NextRequest): string | undefined {
  if (!request) return undefined
  const forwardedHost = request.headers.get('x-forwarded-host')
  const hostHeader = forwardedHost || request.headers.get('host')
  const protoHeader = request.headers.get('x-forwarded-proto')
  const protocol = (protoHeader || request.nextUrl.protocol.replace(':', '') || 'http').split(',')[0].trim()

  if (hostHeader) {
    const host = hostHeader.split(',')[0].trim()
    if (host) return `${protocol}://${host}`
  }

  return request.nextUrl.origin
}

function buildCSP(requestOrigin?: string): string {
  const appOrigin = requestOrigin || process.env.APP_ORIGIN || 'http://localhost:3000'

  const isDev = process.env.NODE_ENV !== 'production'
  const isLocalLan = isLocalOrLanOrigin(appOrigin)
  const allowEval = isDev || isLocalLan

  return [
    "default-src 'self'",
    // 'unsafe-inline' required for Next.js inline scripts/styles
    // 'unsafe-eval' required for webpack HMR in development and some LAN-hosted bundles
    `script-src 'self' 'unsafe-inline'${allowEval ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${appOrigin}`,
    "font-src 'self' data:",
    `connect-src 'self' ${appOrigin}${isDev ? ' ws://localhost:* http://localhost:* ws://127.0.0.1:* http://127.0.0.1:*' : ''}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(!isDev && !isLocalLan ? ["upgrade-insecure-requests"] : []),
  ].join('; ')
}

/**
 * Set hardened security headers on the response.
 */
function setSecurityHeaders(response: NextResponse, request?: NextRequest): void {
  response.headers.set('Content-Security-Policy', buildCSP(getRequestOrigin(request)))
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '0')  // CSP is the real protection
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  // HSTS — only in production
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value
  const sessionId = tryExtractSessionIdFromToken(sessionCookie)

  // 0. Global rate limiting — DDoS protection
  cleanupRL()
  const clientIP = getClientIP(request)
  
  // Rate limit auth endpoints except passive session checks.
  if (!DISABLE_RATE_LIMITING && path.startsWith('/api/auth/') && path !== '/api/auth/session') {
    const authCheck = checkRL(authRL, clientIP, GLOBAL_RATE_LIMIT.authMaxRequests)
    if (!authCheck.ok) {
      logRealtimeActivity({
        request,
        action: 'rate_limited:auth',
        status: 429,
        sessionId,
        details: { retry_after_sec: authCheck.retryAfter },
      })
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { 
          status: 429,
          headers: { 'Retry-After': String(authCheck.retryAfter) }
        }
      )
    }
  }
  
  // Global rate limit for API traffic only; browsing pages/categories won't trigger logout side-effects.
  if (!DISABLE_RATE_LIMITING && path.startsWith('/api/')) {
    const globalCheck = checkRL(globalRL, clientIP, GLOBAL_RATE_LIMIT.maxRequests)
    if (!globalCheck.ok) {
      logRealtimeActivity({
        request,
        action: 'rate_limited:global',
        status: 429,
        sessionId,
        details: { retry_after_sec: globalCheck.retryAfter },
      })
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(globalCheck.retryAfter) }
        }
      )
    }
  }

  // 1. Static assets — minimal headers, no auth check
  if (isStaticAsset(path)) {
    const response = NextResponse.next()
    response.headers.set('X-Content-Type-Options', 'nosniff')
    return response
  }

  // 2. Mobile blocking (except API routes)
  const userAgent = request.headers.get('user-agent') || ''
  if (isMobileUserAgent(userAgent) && !path.startsWith('/api/')) {
    const response = NextResponse.next()
    response.headers.set('X-Mobile-Detected', 'true')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    logRealtimeActivity({
      request,
      action: 'page_access:mobile_detected',
      status: 200,
      sessionId,
    })
    return response
  }

  // 3a. Unlock / status endpoints (recovery without admin session).
  const methodUpper = (request.method || 'GET').toUpperCase()
  if (isPublicRecoveryBypassPath(path, methodUpper)) {
    const response = NextResponse.next()
    setSecurityHeaders(response, request)
    logRealtimeActivity({
      request,
      action: path.startsWith('/api/') ? 'api_access:recovery_guest_public' : 'page_access:public',
      status: 200,
      sessionId,
    })
    return response
  }

  // 3. Public paths — no auth required, but add security headers
  if (isPublicPath(path)) {
    const response = NextResponse.next()
    setSecurityHeaders(response, request)
    logRealtimeActivity({
      request,
      action: 'page_access:public',
      status: 200,
      sessionId,
    })
    return response
  }

  // 4. Protected paths (/dashboard/**, /api/**) — require valid session cookie
  //
  //    NOTE: Full session validation (HMAC verify + DB lookup + fingerprint)
  //    is expensive for middleware. We do a LIGHTWEIGHT check here:
  //      - Cookie exists?
  //      - Not obviously expired? (base64 decode → check exp field)
  //    Full validation happens in the API route / session endpoint.
  //
  const guestRecoveryCookie = request.cookies.get(GUEST_RECOVERY_COOKIE)?.value

  /** Valid guest recovery cookie: allow only recovery-related routes (see recoveryGuestBypassPath). */
  if (!sessionCookie) {
    const guestOk = await verifyGuestRecoveryCookieEdge(guestRecoveryCookie)
    if (guestOk && recoveryGuestBypassPath(path)) {
      const response = NextResponse.next()
      setSecurityHeaders(response, request)
      logRealtimeActivity({
        request,
        action: 'access:recovery_guest_cookie',
        status: 200,
        sessionId,
      })
      return response
    }
  }

  if (!sessionCookie) {
    // No session cookie — redirect to login (pages) or return 401 (API)
    if (path.startsWith('/api/')) {
      logRealtimeActivity({
        request,
        action: 'blocked:missing_session',
        status: 401,
        sessionId,
      })
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    /** Recovery UI without signing in → passphrase gate (not dashboard login email/password). */
    if (path === '/dashboard/recovery-console' || path.startsWith('/dashboard/recovery-console/')) {
      const recoveryGate = new URL('/auth/recovery', request.url)
      recoveryGate.searchParams.set('next', path)
      logRealtimeActivity({
        request,
        action: 'redirect:recovery_gate',
        status: 302,
        sessionId,
      })
      return NextResponse.redirect(recoveryGate)
    }

    // Redirect to login with return URL
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('redirect', path)
    logRealtimeActivity({
      request,
      action: 'redirect:login_required',
      status: 302,
      sessionId,
    })
    return NextResponse.redirect(loginUrl)
  }

  // Verify session token signature and expiry before protected access.
  const parsedToken = await parseAndVerifySessionCookie(sessionCookie)
  if (!parsedToken) {
    if (path.startsWith('/api/')) {
      logRealtimeActivity({
        request,
        action: 'blocked:invalid_session_signature',
        status: 401,
        sessionId,
      })
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      )
    }

    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('redirect', path)
    loginUrl.searchParams.set('reason', 'expired')
    const redirectResponse = NextResponse.redirect(loginUrl)
    redirectResponse.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 })
    logRealtimeActivity({
      request,
      action: 'redirect:invalid_session_signature',
      status: 302,
      sessionId,
    })
    return redirectResponse
  }

  if (Date.now() > parsedToken.exp) {
    // Token expired — force re-login.
    if (path.startsWith('/api/')) {
      logRealtimeActivity({
        request,
        action: 'blocked:session_expired',
        status: 401,
        sessionId,
      })
      return NextResponse.json(
        { error: 'Session expired' },
        { status: 401 }
      )
    }

    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('redirect', path)
    loginUrl.searchParams.set('reason', 'expired')
    const redirectResponse = NextResponse.redirect(loginUrl)
    redirectResponse.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 })
    logRealtimeActivity({
      request,
      action: 'redirect:session_expired',
      status: 302,
      sessionId,
    })
    return redirectResponse
  }

  // 5. Session looks OK — proceed with security headers
  const response = NextResponse.next()
  setSecurityHeaders(response, request)

  const isApiPath = path.startsWith('/api/')
  const method = (request.method || 'GET').toUpperCase()
  const shouldLogProtectedAccess =
    !isApiPath ||
    method !== 'GET' ||
    path.startsWith('/api/auth/') ||
    path.startsWith('/api/employees')

  if (shouldLogProtectedAccess) {
    logRealtimeActivity({
      request,
      action: isApiPath ? 'api_access:protected' : 'page_access:protected',
      status: 200,
      sessionId,
    })
  }

  return response
}

/**
 * Configure which routes to run middleware on
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/webpack|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot|mp4|mp3|pdf)$).*)',
  ],
}

