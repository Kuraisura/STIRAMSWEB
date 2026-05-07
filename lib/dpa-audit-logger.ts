/**
 * ============================================================================
 * DPA 2012 Compliant Security Audit Logger
 * ============================================================================
 * TypeScript helper for writing to the `security_logs` table.
 *
 * RA 10173 (Data Privacy Act of 2012) — Section 20(c) requires:
 *   - Logging of all access to personal data
 *   - Tracking who accessed what, when, and from where
 *   - 5-year retention of audit logs
 *   - Immutable audit trail (no tampering)
 *
 * This module provides:
 *   - logSecurityEvent()    → Single event logging
 *   - logBatchEvents()      → Batch logging (for exports, bulk operations)
 *   - withAuditLogging()    → Route handler wrapper with automatic logging
 *   - getDPAAuditReport()   → Paginated audit report for school audits
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from './db'
import { getClientIP } from './security'
import { validateSession } from './session-manager'

// ---------------------------------------------------------------------------
// 1. Types
// ---------------------------------------------------------------------------

export type ActionCategory =
  | 'auth'
  | 'employee'
  | 'attendance'
  | 'schedule'
  | 'report'
  | 'admin'
  | 'system'
  | 'security'

export type PrivacyLevel = 'public' | 'internal' | 'restricted'

export interface SecurityLogEntry {
  admin_id: number
  admin_email: string
  admin_name: string
  admin_role: string
  action: string
  action_category: ActionCategory
  target_employee_id?: number | null
  target_table?: string | null
  target_record_id?: string | null
  ip_address?: string | null
  user_agent?: string | null
  device_platform?: string | null
  device_browser?: string | null
  session_id?: string | null
  is_successful?: boolean
  failure_reason?: string | null
  old_value?: Record<string, unknown> | null
  new_value?: Record<string, unknown> | null
  changes_summary?: Record<string, unknown> | null
  description?: string | null
  metadata?: Record<string, unknown>
  privacy_level?: PrivacyLevel
}

// ---------------------------------------------------------------------------
// 2. Device Detection (from User-Agent)
// ---------------------------------------------------------------------------

function parseUserAgent(ua: string): { platform: string; browser: string } {
  let platform = 'Unknown'
  let browser = 'Unknown'

  if (ua.includes('Windows')) platform = 'Windows'
  else if (ua.includes('Mac')) platform = 'macOS'
  else if (ua.includes('Linux')) platform = 'Linux'
  else if (ua.includes('Android')) platform = 'Android'
  else if (ua.includes('iPhone') || ua.includes('iPad')) platform = 'iOS'

  if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('Chrome/')) browser = 'Chrome'
  else if (ua.includes('Firefox/')) browser = 'Firefox'
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari'
  else if (ua.includes('WPF') || ua.includes('.NET')) browser = 'WPF Desktop'

  return { platform, browser }
}

// ---------------------------------------------------------------------------
// 3. Core Logging Functions
// ---------------------------------------------------------------------------

/**
 * Log a single security event to the `security_logs` table.
 * This is the primary function — call it from API routes, middleware, etc.
 *
 * @example
 * await logSecurityEvent({
 *   admin_id: user.id,
 *   admin_email: user.email,
 *   admin_name: user.name,
 *   admin_role: user.role,
 *   action: 'employee:update',
 *   action_category: 'employee',
 *   target_employee_id: 101,
 *   target_table: 'employees',
 *   description: 'Updated employee contact information',
 *   old_value: { phone: '09171234567' },
 *   new_value: { phone: '09181234567' },
 *   privacy_level: 'internal',
 * }, request)
 */
export async function logSecurityEvent(
  entry: SecurityLogEntry,
  request?: NextRequest | Request,
): Promise<void> {
  try {
    const ua = request?.headers?.get('user-agent') || entry.user_agent || ''
    const { platform, browser } = parseUserAgent(ua)
    const ip = request ? getClientIP(request) : entry.ip_address || 'unknown'

    const row = {
      admin_id: entry.admin_id,
      admin_email: entry.admin_email,
      admin_name: entry.admin_name,
      admin_role: entry.admin_role,
      action: entry.action,
      action_category: entry.action_category,
      target_employee_id: entry.target_employee_id ?? null,
      target_table: entry.target_table ?? null,
      target_record_id: entry.target_record_id != null ? String(entry.target_record_id) : null,
      ip_address: ip,
      user_agent: ua.substring(0, 500),
      device_platform: platform,
      device_browser: browser,
      session_id: entry.session_id ?? null,
      is_successful: entry.is_successful ?? true,
      failure_reason: entry.failure_reason ?? null,
      old_value: entry.old_value ?? null,
      new_value: entry.new_value ?? null,
      changes_summary: entry.changes_summary ?? null,
      description: entry.description ?? null,
      metadata: entry.metadata ?? {},
      privacy_level: entry.privacy_level ?? 'internal',
      created_at: new Date().toISOString(),
    }

    await dbQuery(
      `INSERT INTO security_logs (
         admin_id,
         admin_email,
         admin_name,
         admin_role,
         action,
         action_category,
         target_employee_id,
         target_table,
         target_record_id,
         ip_address,
         user_agent,
         device_platform,
         device_browser,
         session_id,
         is_successful,
         failure_reason,
         old_value,
         new_value,
         changes_summary,
         description,
         metadata,
         privacy_level,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17::jsonb, $18::jsonb,
         $19::jsonb, $20, $21::jsonb, $22, $23
       )`,
      [
        row.admin_id,
        row.admin_email,
        row.admin_name,
        row.admin_role,
        row.action,
        row.action_category,
        row.target_employee_id,
        row.target_table,
        row.target_record_id,
        row.ip_address,
        row.user_agent,
        row.device_platform,
        row.device_browser,
        row.session_id,
        row.is_successful,
        row.failure_reason,
        JSON.stringify(row.old_value),
        JSON.stringify(row.new_value),
        JSON.stringify(row.changes_summary),
        row.description,
        JSON.stringify(row.metadata),
        row.privacy_level,
        row.created_at,
      ]
    )
  } catch (err) {
    console.error('[SecurityLog] Exception:', err)
  }
}

/**
 * Log multiple events in a single batch insert.
 * Use for bulk operations (e.g. exporting multiple DTR reports).
 */
export async function logBatchEvents(
  entries: SecurityLogEntry[],
  request?: NextRequest,
): Promise<void> {
  try {
    const ua = request?.headers?.get('user-agent') || ''
    const { platform, browser } = parseUserAgent(ua)
    const ip = request ? getClientIP(request) : 'unknown'

    const rows = entries.map((entry) => ({
      admin_id: entry.admin_id,
      admin_email: entry.admin_email,
      admin_name: entry.admin_name,
      admin_role: entry.admin_role,
      action: entry.action,
      action_category: entry.action_category,
      target_employee_id: entry.target_employee_id ?? null,
      target_table: entry.target_table ?? null,
      target_record_id: entry.target_record_id != null ? String(entry.target_record_id) : null,
      ip_address: ip,
      user_agent: ua.substring(0, 500),
      device_platform: platform,
      device_browser: browser,
      session_id: entry.session_id ?? null,
      is_successful: entry.is_successful ?? true,
      failure_reason: entry.failure_reason ?? null,
      old_value: entry.old_value ?? null,
      new_value: entry.new_value ?? null,
      changes_summary: entry.changes_summary ?? null,
      description: entry.description ?? null,
      metadata: entry.metadata ?? {},
      privacy_level: entry.privacy_level ?? 'internal',
      created_at: new Date().toISOString(),
    }))

    await Promise.all(rows.map((row) =>
      dbQuery(
        `INSERT INTO security_logs (
           admin_id,
           admin_email,
           admin_name,
           admin_role,
           action,
           action_category,
           target_employee_id,
           target_table,
           target_record_id,
           ip_address,
           user_agent,
           device_platform,
           device_browser,
           session_id,
           is_successful,
           failure_reason,
           old_value,
           new_value,
           changes_summary,
           description,
           metadata,
           privacy_level,
           created_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10, $11, $12,
           $13, $14, $15, $16, $17::jsonb, $18::jsonb,
           $19::jsonb, $20, $21::jsonb, $22, $23
         )`,
        [
          row.admin_id,
          row.admin_email,
          row.admin_name,
          row.admin_role,
          row.action,
          row.action_category,
          row.target_employee_id,
          row.target_table,
          row.target_record_id,
          row.ip_address,
          row.user_agent,
          row.device_platform,
          row.device_browser,
          row.session_id,
          row.is_successful,
          row.failure_reason,
          JSON.stringify(row.old_value),
          JSON.stringify(row.new_value),
          JSON.stringify(row.changes_summary),
          row.description,
          JSON.stringify(row.metadata),
          row.privacy_level,
          row.created_at,
        ]
      )
    ))
  } catch (err) {
    console.error('[SecurityLog] Batch exception:', err)
  }
}

// ---------------------------------------------------------------------------
// 4. Route Handler Wrapper
// ---------------------------------------------------------------------------

type RouteHandler = (req: NextRequest, ctx?: any) => Promise<NextResponse>

interface AuditConfig {
  /** The action name (e.g. 'employee:update') */
  action: string
  /** The action category */
  category: ActionCategory
  /** The table being accessed */
  table?: string
  /** Privacy classification */
  privacyLevel?: PrivacyLevel
  /** Extract target employee/record ID from the request */
  extractTarget?: (req: NextRequest, ctx?: any) => { employeeId?: number; recordId?: string }
}

/**
 * Wrap a route handler with automatic audit logging.
 *
 * @example
 * export const POST = withAuditLogging(handler, {
 *   action: 'employee:create',
 *   category: 'employee',
 *   table: 'employees',
 *   privacyLevel: 'internal',
 * })
 */
export function withAuditLogging(
  handler: RouteHandler,
  config: AuditConfig,
): RouteHandler {
  return async (request: NextRequest, ctx?: any) => {
    const startTime = Date.now()

    // Resolve current user from session
    let admin = {
      admin_id: 0,
      admin_email: 'unknown',
      admin_name: 'Unknown',
      admin_role: 'unknown',
      session_id: '',
    }

    try {
      const sessionResult = await validateSession(request)
      if (sessionResult.valid && sessionResult.user) {
        admin = {
          admin_id: sessionResult.user.id,
          admin_email: sessionResult.user.email,
          admin_name: sessionResult.user.name || 'Unknown',
          admin_role: sessionResult.user.role || 'unknown',
          session_id: sessionResult.sessionId || '',
        }
      }
    } catch { /* best-effort session resolution */ }

    // Extract target info
    let targetEmployeeId: number | undefined
    let targetRecordId: string | undefined
    if (config.extractTarget) {
      try {
        const target = config.extractTarget(request, ctx)
        targetEmployeeId = target.employeeId
        targetRecordId = target.recordId
      } catch { /* ignore extraction errors */ }
    }

    // Call the actual handler
    let response: NextResponse
    let success = true
    let failureReason: string | undefined

    try {
      response = await handler(request, ctx)
      success = response.status < 400
      if (!success) {
        try {
          const body = await response.clone().json()
          failureReason = body.error || body.message || `HTTP ${response.status}`
        } catch {
          failureReason = `HTTP ${response.status}`
        }
      }
    } catch (error: any) {
      success = false
      failureReason = error.message || 'Internal error'
      response = NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // Log the event (non-blocking)
    const durationMs = Date.now() - startTime
    void logSecurityEvent(
      {
        ...admin,
        action: config.action,
        action_category: config.category,
        target_employee_id: targetEmployeeId,
        target_table: config.table,
        target_record_id: targetRecordId,
        is_successful: success,
        failure_reason: failureReason,
        description: `${config.action} ${success ? 'succeeded' : 'failed'} (${durationMs}ms)`,
        privacy_level: config.privacyLevel || 'internal',
        metadata: { duration_ms: durationMs, http_method: request.method },
      },
      request,
    )

    return response
  }
}

// ---------------------------------------------------------------------------
// 5. DPA Audit Report Query
// ---------------------------------------------------------------------------

export interface DPAAuditReportParams {
  /** Start date (inclusive) */
  from: string   // YYYY-MM-DD
  /** End date (inclusive) */
  to: string     // YYYY-MM-DD
  /** Filter by admin ID */
  adminId?: number
  /** Filter by target employee ID */
  targetEmployeeId?: number
  /** Filter by action category */
  category?: ActionCategory
  /** Filter by privacy level */
  privacyLevel?: PrivacyLevel
  /** Pagination */
  page?: number
  pageSize?: number
}

export interface DPAAuditReportRow {
  log_id: number
  timestamp: string
  admin_name: string
  admin_email: string
  admin_role: string
  action: string
  category: string
  target_employee_id: number | null
  target_employee_name: string | null
  description: string | null
  is_successful: boolean
  failure_reason: string | null
  ip_address: string | null
  platform: string | null
  browser: string | null
  privacy_level: string
}

/**
 * Query the DPA audit report with filtering and pagination.
 * This is used by the admin dashboard for school audit reports.
 */
export async function getDPAAuditReport(
  params: DPAAuditReportParams,
): Promise<{ data: DPAAuditReportRow[]; total: number }> {
  const page = params.page || 1
  const pageSize = params.pageSize || 50
  const offset = (page - 1) * pageSize

  const filters = [
    `s.created_at >= $1::timestamptz`,
    `s.created_at <= $2::timestamptz`,
    params.adminId ? `s.admin_id = $3` : '',
    params.targetEmployeeId ? `s.target_employee_id = $4` : '',
    params.category ? `s.action_category = $5` : '',
    params.privacyLevel ? `s.privacy_level = $6` : '',
  ].filter(Boolean).join(' AND ')

  const values: any[] = [
    `${params.from}T00:00:00`,
    `${params.to}T23:59:59`,
    params.adminId ?? null,
    params.targetEmployeeId ?? null,
    params.category ?? null,
    params.privacyLevel ?? null,
  ]

  try {
    const totalRows = await dbQuery<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM security_logs s
       WHERE ${filters}`,
      values
    )

    const data = await dbQuery<any>(
      `SELECT s.*, e.full_name AS target_employee_name
       FROM security_logs s
       LEFT JOIN employees e ON e.employee_id = s.target_employee_id
       WHERE ${filters}
       ORDER BY s.created_at DESC
       LIMIT $7 OFFSET $8`,
      [...values, pageSize, offset]
    )

    const rows: DPAAuditReportRow[] = (data || []).map((row: any) => ({
    log_id: row.log_id,
    timestamp: row.created_at,
    admin_name: row.admin_name,
    admin_email: row.admin_email,
    admin_role: row.admin_role,
    action: row.action,
    category: row.action_category,
    target_employee_id: row.target_employee_id,
      target_employee_name: row.target_employee_name || null,
    description: row.description,
    is_successful: row.is_successful,
    failure_reason: row.failure_reason,
    ip_address: row.ip_address,
    platform: row.device_platform,
    browser: row.device_browser,
    privacy_level: row.privacy_level,
    }))

    return { data: rows, total: totalRows[0]?.count || 0 }
  } catch (error) {
    console.error('[DPAAudit] Query error:', error)
    return { data: [], total: 0 }
  }
}
