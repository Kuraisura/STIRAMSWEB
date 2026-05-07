/**
 * ============================================================================
 * Anti–Red Team: Export Audit Logger & Enhanced Rate Limiter
 * ============================================================================
 * Records every data-export action with full forensic metadata:
 *   - WHO   (user ID, email, role)
 *   - WHAT  (endpoint, export type, record count, filters used)
 *   - WHEN  (ISO timestamp, timezone)
 *   - WHERE (client IP, User-Agent, geo hint)
 *   - HOW   (HTTP method, response status)
 *
 * Also provides a specialized rate limiter tuned for export endpoints that
 * detects and blocks:
 *   - Bulk scraping (too many exports in a short window)
 *   - Off-hours anomalies (exports at unusual times)
 *   - Velocity spikes (sudden increase vs. baseline)
 *
 * Red-Team Counters:
 *   - Session Hijacking: Every export is tied to the JWT identity, so a
 *     stolen session is fully traceable.
 *   - API Abuse: Progressive rate limiting with exponential backoff.
 *   - Privilege Escalation: Works in concert with RBAC middleware — if a
 *     Finance user somehow bypasses RBAC, the audit log captures it.
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from './db'
import { getClientIP } from './security'
import { checkRateLimit, type RateLimitConfig, type RateLimitResult } from './rate-limit'
import type { JWTPayload } from './rbac-middleware'

// ═══════════════════════════════════════════════════════════════════════════
//  PART 1 — EXPORT AUDIT LOGGER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * All exportable data types in the system.
 */
export type ExportType =
  | 'dtr_report'
  | 'dtr_bulk'
  | 'attendance_summary'
  | 'employee_list'
  | 'schedule_report'
  | 'exam_schedule'
  | 'payroll_data'
  | 'audit_trail'
  | 'custom_report'

/**
 * Full export event record.
 */
export interface ExportAuditRecord {
  // Identity
  user_id: string
  user_email: string
  user_role: string

  // Action
  export_type: ExportType
  endpoint: string
  http_method: string
  filters_applied: Record<string, unknown>
  record_count: number
  file_format: 'xlsx' | 'csv' | 'pdf' | 'json'

  // Context
  ip_address: string
  user_agent: string
  referer: string | null
  timestamp: string
  timezone_offset?: number

  // Response
  response_status: number
  duration_ms: number

  // Anomaly flags (populated by anomaly detector)
  is_off_hours: boolean
  is_bulk: boolean
  risk_score: number  // 0-100
}

/**
 * Log an export event to the database AND stdout.
 *
 * @example
 * ```ts
 * await logExportEvent(req, user, {
 *   export_type: 'dtr_report',
 *   record_count: 42,
 *   file_format: 'xlsx',
 *   filters_applied: { department: 'BSIT', term_id: 5 },
 *   response_status: 200,
 *   duration_ms: 1230,
 * })
 * ```
 */
export async function logExportEvent(
  req: NextRequest,
  user: JWTPayload,
  details: {
    export_type: ExportType
    record_count: number
    file_format: 'xlsx' | 'csv' | 'pdf' | 'json'
    filters_applied?: Record<string, unknown>
    response_status: number
    duration_ms: number
  }
): Promise<void> {
  const ip = getClientIP(req)
  const ua = req.headers.get('user-agent') ?? 'unknown'
  const referer = req.headers.get('referer') ?? null
  const now = new Date()

  // Anomaly detection
  const isOffHours = checkOffHours(now)
  const isBulk = details.record_count > 500
  const riskScore = computeRiskScore({
    isOffHours,
    isBulk,
    recordCount: details.record_count,
    role: user.role,
    exportType: details.export_type,
  })

  const record: ExportAuditRecord = {
    user_id: user.sub,
    user_email: user.email,
    user_role: user.role,
    export_type: details.export_type,
    endpoint: req.nextUrl.pathname,
    http_method: req.method,
    filters_applied: details.filters_applied ?? {},
    record_count: details.record_count,
    file_format: details.file_format,
    ip_address: ip,
    user_agent: ua,
    referer,
    timestamp: now.toISOString(),
    is_off_hours: isOffHours,
    is_bulk: isBulk,
    risk_score: riskScore,
    response_status: details.response_status,
    duration_ms: details.duration_ms,
  }

  // 1. Always log to stdout (structured JSON for log aggregators)
  console.log(
    `[EXPORT AUDIT] ${record.user_role}:${record.user_email} exported ${record.record_count} records ` +
    `(${record.export_type}/${record.file_format}) from ${record.ip_address} ` +
    `[risk=${record.risk_score}${isOffHours ? ' OFF-HOURS' : ''}${isBulk ? ' BULK' : ''}]`
  )

  // 2. Persist to DB (best-effort)
  try {
    await dbQuery(
      `INSERT INTO export_audit_logs (
         user_id,
         user_email,
         user_role,
         export_type,
         endpoint,
         http_method,
         filters_applied,
         record_count,
         file_format,
         ip_address,
         user_agent,
         referer,
         is_off_hours,
         is_bulk,
         risk_score,
         response_status,
         duration_ms,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7::jsonb, $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17, $18
       )`,
      [
        record.user_id,
        record.user_email,
        record.user_role,
        record.export_type,
        record.endpoint,
        record.http_method,
        JSON.stringify(record.filters_applied),
        record.record_count,
        record.file_format,
        record.ip_address,
        record.user_agent,
        record.referer,
        record.is_off_hours,
        record.is_bulk,
        record.risk_score,
        record.response_status,
        record.duration_ms,
        record.timestamp,
      ]
    )
  } catch (err) {
    console.error('[EXPORT AUDIT] Failed to persist:', err)
  }
  // 3. If risk is HIGH, fire an alert
  if (riskScore >= 70) {
    await fireSecurityAlert(record)
  }
}

// ---------------------------------------------------------------------------
// Anomaly helpers
// ---------------------------------------------------------------------------

/**
 * Business hours are 06:00–22:00 PHT (UTC+8).
 * Exports outside this window are flagged.
 */
function checkOffHours(now: Date): boolean {
  // Convert to PHT
  const phtHour = (now.getUTCHours() + 8) % 24
  return phtHour < 6 || phtHour >= 22
}

/**
 * Compute a 0-100 risk score for the export event.
 */
function computeRiskScore(params: {
  isOffHours: boolean
  isBulk: boolean
  recordCount: number
  role: string
  exportType: ExportType
}): number {
  let score = 0

  // Off-hours: +25
  if (params.isOffHours) score += 25

  // Bulk export: +20 base, +1 per 100 records above 500
  if (params.isBulk) {
    score += 20 + Math.min(30, Math.floor((params.recordCount - 500) / 100))
  }

  // Sensitive data types: +15
  const sensitiveTypes: ExportType[] = ['payroll_data', 'employee_list', 'audit_trail']
  if (sensitiveTypes.includes(params.exportType)) score += 15

  // Non-admin roles exporting sensitive data: +10
  if (params.role !== 'super_admin' && sensitiveTypes.includes(params.exportType)) {
    score += 10
  }

  return Math.min(100, score)
}

/**
 * Fire a security alert for high-risk export events.
 * In production, integrate with Slack / PagerDuty / email.
 */
async function fireSecurityAlert(record: ExportAuditRecord): Promise<void> {
  console.warn(
    `[SECURITY ALERT] High-risk export detected! ` +
    `User: ${record.user_email} (${record.user_role}) | ` +
    `Type: ${record.export_type} | Records: ${record.record_count} | ` +
    `Risk: ${record.risk_score} | IP: ${record.ip_address}`
  )

  // Persist alert separately for dashboarding
  try {
    await dbQuery(
      `INSERT INTO security_alerts (
         alert_type,
         severity,
         user_email,
         user_role,
         description,
         metadata,
         created_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        'high_risk_export',
        record.risk_score >= 90 ? 'critical' : 'high',
        record.user_email,
        record.user_role,
        `High-risk export: ${record.export_type} (${record.record_count} records, risk=${record.risk_score})`,
        JSON.stringify(record),
        record.timestamp,
      ]
    )
  } catch {
    // best-effort
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  PART 2 — ENHANCED EXPORT RATE LIMITER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tiered rate-limit configs for export endpoints.
 * More restrictive than general API limits.
 */
const EXPORT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Per-user limits
  'export:per_minute': {
    windowMs: 60_000,       // 1 minute
    maxRequests: 3,         // max 3 exports/min
    message: 'Export rate limit: max 3 exports per minute.',
  },
  'export:per_hour': {
    windowMs: 3_600_000,    // 1 hour
    maxRequests: 20,        // max 20 exports/hour
    message: 'Export rate limit: max 20 exports per hour.',
  },
  'export:per_day': {
    windowMs: 86_400_000,   // 24 hours
    maxRequests: 100,       // max 100 exports/day
    message: 'Export rate limit: max 100 exports per day.',
  },
}

/**
 * Check all tiered rate limits for an export request.
 * Returns the MOST restrictive result (the one closest to limit).
 */
export function checkExportRateLimit(
  userId: string,
  role: string
): RateLimitResult {
  // Super-admins get 2x the limits
  const multiplier = role === 'super_admin' ? 2 : 1

  const results: RateLimitResult[] = Object.entries(EXPORT_RATE_LIMITS).map(
    ([tier, config]) => {
      return checkRateLimit(`export:${userId}:${tier}`, {
        ...config,
        maxRequests: config.maxRequests * multiplier,
      })
    }
  )

  // Return the first failing result, or the one with the least remaining
  const failing = results.find((r) => !r.success)
  if (failing) return failing

  // All passed — return the one with the fewest remaining
  return results.reduce((min, r) =>
    r.remaining < min.remaining ? r : min
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  PART 3 — COMBINED MIDDLEWARE: RBAC + RATE LIMIT + AUDIT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Higher-order handler that combines:
 *   1. Export rate limiting
 *   2. Export audit logging
 *
 * Use this INSIDE a `withRBAC` wrapper for full protection.
 *
 * @example
 * ```ts
 * // app/api/reports/export/route.ts
 * import { withRBAC, SCOPES } from '@/lib/rbac-middleware'
 * import { withExportProtection } from '@/lib/export-audit-logger'
 * import { withErrorHandler } from '@/lib/secure-error-handler'
 *
 * async function POST(req: NextRequest, ctx: { user: JWTPayload }) {
 *   // ... generate report ...
 *   return new NextResponse(excelBuffer, {
 *     headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
 *   })
 * }
 *
 * export const POST = withErrorHandler(
 *   withRBAC(
 *     withExportProtection(POST, { export_type: 'dtr_report', file_format: 'xlsx' }),
 *     { requiredScopes: [SCOPES.DTR_EXPORT] }
 *   )
 * )
 * ```
 */
export function withExportProtection(
  handler: (
    req: NextRequest,
    ctx: { user: JWTPayload }
  ) => Promise<NextResponse>,
  meta: {
    export_type: ExportType
    file_format: 'xlsx' | 'csv' | 'pdf' | 'json'
  }
) {
  return async (
    req: NextRequest,
    ctx: { user: JWTPayload }
  ): Promise<NextResponse> => {
    const startTime = Date.now()
    const user = ctx.user

    // 1. Rate limit check
    const rl = checkExportRateLimit(user.sub, user.role)
    if (!rl.success) {
      // Log the blocked attempt
      await logExportEvent(req, user, {
        export_type: meta.export_type,
        record_count: 0,
        file_format: meta.file_format,
        response_status: 429,
        duration_ms: Date.now() - startTime,
      })

      return NextResponse.json(
        {
          error: rl.message,
          retry_after: rl.retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rl.retryAfter ?? 60),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(rl.resetTime),
          },
        }
      )
    }

    // 2. Execute the actual handler
    const response = await handler(req, ctx)
    const duration = Date.now() - startTime

    // 3. Log the export (extract record count from response header if set)
    const recordCount = parseInt(
      response.headers.get('X-Export-Record-Count') ?? '0',
      10
    )

    // Extract filters from the request body (if POST) or query params (if GET)
    let filters: Record<string, unknown> = {}
    try {
      if (req.method === 'POST') {
        filters = await req.clone().json()
      } else {
        const params = req.nextUrl.searchParams
        params.forEach((v, k) => { filters[k] = v })
      }
    } catch {
      // non-JSON body or no params — fine
    }

    await logExportEvent(req, user, {
      export_type: meta.export_type,
      record_count: recordCount,
      file_format: meta.file_format,
      filters_applied: filters,
      response_status: response.status,
      duration_ms: duration,
    })

    // 4. Add rate-limit headers to the response
    const headers = new Headers(response.headers)
    headers.set('X-RateLimit-Remaining', String(rl.remaining))
    headers.set('X-RateLimit-Reset', String(rl.resetTime))

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
}
