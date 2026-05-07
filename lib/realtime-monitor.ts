import { NextRequest } from 'next/server'

type RealtimeMonitorPayload = {
  request?: Request | NextRequest
  action: string
  status?: number
  sessionId?: string | null
  userId?: number | string | null
  userEmail?: string | null
  details?: Record<string, unknown>
}

type DeviceInfo = {
  platform: string
  browser: string
  deviceType: 'Desktop' | 'Mobile' | 'Tablet' | 'Unknown'
  label: string
}

const recentLogCache = new Map<string, number>()

function getMonitorLevel(): 'verbose' | 'normal' | 'minimal' {
  const raw = (process.env.REALTIME_MONITOR_LEVEL || 'normal').toLowerCase()
  if (raw === 'verbose' || raw === 'minimal' || raw === 'normal') return raw
  return 'normal'
}

function shouldThrottle(action: string, method: string, path: string): { enabled: boolean; windowMs: number } {
  // High-frequency read endpoints that can spam console when a dashboard loads.
  const noisyApiPrefixes = [
    '/api/academic-terms',
    '/api/departments',
    '/api/dashboard',
    '/api/notifications',
    '/api/attendance/logs',
    '/api/auth/session',
    '/api/employees',
  ]

  if (action === 'page_access:public' && method === 'GET') {
    return { enabled: true, windowMs: 10000 }
  }

  if (action.startsWith('api_access:') && method === 'GET' && path.startsWith('/api/')) {
    const isNoisy = noisyApiPrefixes.some((prefix) => path.startsWith(prefix))
    return { enabled: true, windowMs: isNoisy ? 20000 : 8000 }
  }

  if (action === 'page_access:protected' && method === 'GET') {
    return { enabled: true, windowMs: 12000 }
  }

  return { enabled: false, windowMs: 0 }
}

function shouldLogEvent(action: string, method: string, path: string, sessionId: string, ip: string): boolean {
  const level = getMonitorLevel()

  if (level === 'verbose') {
    return true
  }

  if (level === 'minimal') {
    const importantAction =
      action.startsWith('employee:') ||
      action.includes('rate_limited') ||
      action.startsWith('blocked:') ||
      action.startsWith('redirect:')

    return importantAction
  }

  const throttle = shouldThrottle(action, method, path)
  if (!throttle.enabled) return true

  const now = Date.now()
  const key = `${action}|${method}|${path}|${sessionId || ip}`
  const lastSeen = recentLogCache.get(key) || 0

  // Cleanup old cache entries opportunistically.
  if (recentLogCache.size > 500) {
    for (const [k, ts] of recentLogCache) {
      if (now - ts > 120000) recentLogCache.delete(k)
    }
  }

  if (now - lastSeen < throttle.windowMs) {
    return false
  }

  recentLogCache.set(key, now)
  return true
}

function shortSessionId(sessionId?: string | null): string {
  if (!sessionId) return 'none'
  if (sessionId.length <= 16) return sessionId
  return `${sessionId.slice(0, 8)}...${sessionId.slice(-4)}`
}

function getClientIp(request?: Request | NextRequest): string {
  if (!request) return 'unknown'
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

function parseDeviceInfo(userAgent: string): DeviceInfo {
  const ua = userAgent || ''

  let platform = 'Unknown'
  if (/windows/i.test(ua)) platform = 'Windows'
  else if (/macintosh|mac os/i.test(ua)) platform = 'macOS'
  else if (/android/i.test(ua)) platform = 'Android'
  else if (/iphone|ipad|ios/i.test(ua)) platform = 'iOS'
  else if (/linux/i.test(ua)) platform = 'Linux'

  let browser = 'Unknown'
  if (/edg\//i.test(ua)) browser = 'Edge'
  else if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) browser = 'Chrome'
  else if (/firefox\//i.test(ua)) browser = 'Firefox'
  else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = 'Safari'

  let deviceType: DeviceInfo['deviceType'] = 'Unknown'
  if (/ipad|tablet|kindle/i.test(ua)) deviceType = 'Tablet'
  else if (/mobile|android|iphone/i.test(ua)) deviceType = 'Mobile'
  else if (ua) deviceType = 'Desktop'

  return {
    platform,
    browser,
    deviceType,
    label: `${platform} ${browser} ${deviceType}`.trim(),
  }
}

export function tryExtractSessionIdFromToken(token?: string | null): string | null {
  if (!token) return null

  try {
    const decoded = atob(token)
    const parts = decoded.split('.')
    if (parts.length < 4) return null
    const sid = parts[0]?.trim()
    return sid || null
  } catch {
    return null
  }
}

export function logRealtimeActivity(payload: RealtimeMonitorPayload): void {
  if (process.env.DISABLE_REALTIME_MONITOR === 'true') return

  const request = payload.request
  const userAgent = request?.headers.get('user-agent') || 'unknown'
  const device = parseDeviceInfo(userAgent)
  const method = request?.method || 'N/A'
  const path = request ? new URL(request.url).pathname : 'N/A'
  const ip = getClientIp(request)
  const session = shortSessionId(payload.sessionId)

  if (!shouldLogEvent(payload.action, method, path, session, ip)) {
    return
  }

  const details = payload.details ? JSON.stringify(payload.details) : '{}'

  console.log(
    [
      '[RealtimeMonitor]',
      new Date().toISOString(),
      `action=${payload.action}`,
      `status=${payload.status ?? 0}`,
      `method=${method}`,
      `path=${path}`,
      `session=${session}`,
      `ip=${ip}`,
      `device="${device.label}"`,
      `userId=${payload.userId ?? 'unknown'}`,
      `userEmail=${payload.userEmail ?? 'unknown'}`,
      `details=${details}`,
    ].join(' ')
  )
}
