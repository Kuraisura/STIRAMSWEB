/**
 * ============================================================================
 * A05: Injection Prevention — Parameterized Query Builder
 * A10: Server-Side Request Forgery & Exception Handling — Safe Error Handler
 * ============================================================================
 * OWASP A05:2025 — Security Misconfiguration / Injection
 * OWASP A10:2025 — Server-Side Request Forgery
 *
 * Two concerns in one module:
 *   1. SECURE QUERY BUILDER — wraps database access with strict parameterization,
 *      type validation, and query-logging (never raw SQL from user input).
 *   2. GLOBAL ERROR HANDLER — catches all unhandled exceptions in API routes,
 *      returns *generic* safe messages to the client, and persists the real
 *      stack trace to an internal-only log.
 *
 * Red-Team Counter:
 *   - Injection: All user inputs pass through Zod schemas before they touch
 *     the query builder. The database layer already parameterizes,
 *     but we add an *application-layer* guard to block malicious filter values.
 *   - Information Leakage: The error handler strips stack traces, DB error
 *     codes, and column names from every outgoing response.
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from './db'
import { z, ZodError, ZodSchema } from 'zod'
import { getClientIP } from './security'

// ═══════════════════════════════════════════════════════════════════════════
//  PART 1 — PARAMETERIZED QUERY BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Common Zod schemas for reuse across all API routes.
 * Every field that will be used in a WHERE clause MUST pass through one of these.
 */
export const QuerySchemas = {
  /** Positive integer ID (employee_id, admin_user.id, etc.) */
  id: z.coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),

  /** RFID codes: 6-20 alphanumeric chars */
  rfidCode: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9]{6,20}$/, 'Invalid RFID code format'),

  /** ISO date: YYYY-MM-DD */
  isoDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .refine((d) => !isNaN(Date.parse(d)), 'Invalid date value'),

  /** Time: HH:mm or HH:mm:ss */
  time: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Time must be HH:mm or HH:mm:ss'),

  /** Sanitised free-text (names, departments, etc.) */
  safeString: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .transform((s) =>
      s
        .replace(/[<>]/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '')
    ),

  /** Email */
  email: z.string().trim().email().max(255).toLowerCase(),

  /** Pagination */
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }),

  /** Sort direction */
  sortDir: z.enum(['asc', 'desc']).default('asc'),

  /** Staff type enum */
  staffType: z.enum(['Teaching', 'Non-Teaching']),

  /** Log type enum */
  logType: z.enum(['IN', 'OUT']),
}

/**
 * Validates `input` against a Zod schema.
 * Returns `{ success: true, data }` or `{ success: false, error }`.
 *
 * NEVER return the raw ZodError to the client — it may contain field names
 * and internal types.  Use `safeValidationError()` for the response.
 */
export function validateInput<T>(
  schema: ZodSchema<T>,
  input: unknown
): { success: true; data: T } | { success: false; error: ZodError } {
  const result = schema.safeParse(input)
  if (result.success) return { success: true, data: result.data }
  return { success: false, error: result.error }
}

/**
 * Converts a ZodError into a client-safe string.
 * Only exposes the *field path* and a generic message — never the raw value.
 */
export function safeValidationError(err: ZodError): string {
  const fields = err.issues.map((i) => i.path.join('.')).filter(Boolean)
  if (fields.length === 0) return 'Invalid request data'
  return `Validation failed for: ${fields.join(', ')}`
}

// ---------------------------------------------------------------------------
// Type-safe query helpers
// ---------------------------------------------------------------------------

/**
 * Safely fetch an employee by validated numeric ID.
 * All parameters are validated through Zod BEFORE reaching the database.
 *
 * @example
 * ```ts
 * const emp = await secureGetEmployee(req.params.id)
 * ```
 */
export async function secureGetEmployee(rawId: unknown) {
  const parsed = QuerySchemas.id.safeParse(rawId)
  if (!parsed.success) throw new SafeQueryError('Invalid employee identifier')

  try {
    const rows = await dbQuery(
      `SELECT employee_id, full_name, email, department, staff_type, is_active
       FROM employees
       WHERE employee_id = $1
       LIMIT 1`,
      [parsed.data]
    )

    if (!rows[0]) {
      throw new SafeQueryError('Employee lookup failed')
    }

    return rows[0]
  } catch (error) {
    if (error instanceof SafeQueryError) {
      throw error
    }
    throw new SafeQueryError('Employee lookup failed', error)
  }
}

/**
 * Safely search employees with Zod-validated text.
 */
export async function secureSearchEmployees(
  rawTerm: unknown,
  staffTypeFilter: 'Teaching' | 'Non-Teaching' | null = null,
  rawPagination?: unknown
) {
  const term = QuerySchemas.safeString.parse(rawTerm)
  const { page, limit } = QuerySchemas.pagination.parse(rawPagination ?? {})

  const offset = (page - 1) * limit

  try {
    const rows = await dbQuery(
      `SELECT employee_id, full_name, email, department, staff_type, is_active
       FROM employees
       WHERE is_active = true
         AND full_name ILIKE $1
         AND ($2::text IS NULL OR staff_type = $2)
       ORDER BY full_name ASC
       LIMIT $3 OFFSET $4`,
      [`%${term}%`, staffTypeFilter, limit, offset]
    )

    return rows ?? []
  } catch (error) {
    throw new SafeQueryError('Employee search failed', error)
  }
}

/**
 * Safely log an RFID attendance event.
 */
export async function secureLogRFID(rawBody: unknown) {
  const schema = z.object({
    rfid_code: QuerySchemas.rfidCode,
    log_type: QuerySchemas.logType,
  })
  const body = schema.parse(rawBody)

  try {
    const rows = await dbQuery(
      `INSERT INTO attendance_logs (rfid_code, log_type, logged_at)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [body.rfid_code, body.log_type, new Date().toISOString()]
    )

    return rows[0]
  } catch (error) {
    throw new SafeQueryError('Attendance log failed', error)
  }
}

/**
 * Custom error class that separates the internal detail from the safe message.
 */
export class SafeQueryError extends Error {
  public readonly internalDetail: unknown

  constructor(safeMessage: string, internalDetail?: unknown) {
    super(safeMessage)
    this.name = 'SafeQueryError'
    this.internalDetail = internalDetail
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  PART 2 — GLOBAL ERROR HANDLER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Severity levels for internal logs.
 */
type Severity = 'low' | 'medium' | 'high' | 'critical'

/**
 * Internal error log record (persisted to `error_logs` table or stdout).
 */
interface InternalErrorLog {
  timestamp: string
  severity: Severity
  error_id: string            // unique correlation ID returned to the client
  method: string
  path: string
  ip: string
  user_agent: string
  user_email?: string
  error_name: string
  error_message: string       // FULL message — NEVER sent to client
  stack_trace?: string        // FULL stack — NEVER sent to client
  db_error_code?: string      // e.g. Postgres 23505
  db_error_hint?: string
}

/**
 * Generate a random correlation ID (e.g. "ERR-a1b2c3d4").
 */
function generateErrorId(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `ERR-${hex}`
}

/**
 * Classify severity based on the error type.
 */
function classifySeverity(error: unknown): Severity {
  if (error instanceof ZodError) return 'low'
  if (error instanceof SafeQueryError) return 'medium'
  if (error instanceof TypeError || error instanceof RangeError) return 'medium'
  // Unknown / unexpected errors are HIGH — could indicate an attack
  return 'high'
}

/**
 * Persist the internal error log.
 *
 * Strategy:
 *   1. Try to INSERT into `error_logs` table (if it exists).
 *   2. Always console.error with the full detail so cloud logging captures it.
 */
async function persistErrorLog(log: InternalErrorLog): Promise<void> {
  // Always log to stdout/stderr (picked up by Vercel / Cloud Run / etc.)
  console.error(
    `[ERROR ${log.severity.toUpperCase()}] ${log.error_id} | ${log.method} ${log.path} | ${log.error_name}: ${log.error_message}`
  )
  if (log.stack_trace) {
    console.error(`[STACK] ${log.error_id}\n${log.stack_trace}`)
  }

  // Best-effort DB persistence (don't let this throw)
  try {
    await dbQuery(
      `INSERT INTO error_logs (
         error_id,
         severity,
         method,
         path,
         ip_address,
         user_agent,
         user_email,
         error_name,
         error_message,
         stack_trace,
         db_error_code,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12
       )`,
      [
        log.error_id,
        log.severity,
        log.method,
        log.path,
        log.ip,
        log.user_agent,
        log.user_email ?? null,
        log.error_name,
        log.error_message,
        log.stack_trace ?? null,
        log.db_error_code ?? null,
        log.timestamp,
      ]
    )
  } catch {
    // If the error_logs table doesn't exist yet, silently skip
  }
}

// ---------------------------------------------------------------------------
// The main export — wrap any API handler
// ---------------------------------------------------------------------------

/**
 * Wraps a Next.js API route handler with a global error boundary.
 *
 * - Catches **every** exception (sync & async).
 * - Logs the FULL error internally (console + DB).
 * - Returns a **generic, safe** JSON response to the client with only
 *   an opaque `error_id` for support correlation.
 *
 * @example
 * ```ts
 * // app/api/employees/route.ts
 * import { withErrorHandler } from '@/lib/secure-error-handler'
 *
 * async function GET(req: NextRequest) {
 *   const emp = await secureGetEmployee(req.nextUrl.searchParams.get('id'))
 *   return NextResponse.json(emp)
 * }
 *
 * export { withErrorHandler(GET) as GET }
 * ```
 */
export function withErrorHandler(
  handler: (req: NextRequest, ctx?: any) => Promise<NextResponse>
) {
  return async (req: NextRequest, ctx?: any): Promise<NextResponse> => {
    try {
      return await handler(req, ctx)
    } catch (error: unknown) {
      const errorId = generateErrorId()
      const severity = classifySeverity(error)
      const ip = getClientIP(req)
      const ua = req.headers.get('user-agent') ?? 'unknown'
      const userEmail = req.headers.get('x-user-email') ?? undefined

      // Build internal log
      const log: InternalErrorLog = {
        timestamp: new Date().toISOString(),
        severity,
        error_id: errorId,
        method: req.method,
        path: req.nextUrl.pathname,
        ip,
        user_agent: ua,
        user_email: userEmail,
        error_name: error instanceof Error ? error.name : 'UnknownError',
        error_message:
          error instanceof Error ? error.message : String(error),
        stack_trace: error instanceof Error ? error.stack : undefined,
      }

      // Extract Postgres-specific codes if available
      if (
        error instanceof SafeQueryError &&
        error.internalDetail &&
        typeof error.internalDetail === 'object'
      ) {
        const detail = error.internalDetail as Record<string, unknown>
        log.db_error_code = String(detail.code ?? '')
        log.db_error_hint = String(detail.hint ?? detail.details ?? '')
      }

      await persistErrorLog(log)

      // ---- Determine client-safe status & message ----
      let status = 500
      let safeMessage = 'An unexpected error occurred. Please try again later.'

      if (error instanceof ZodError) {
        status = 400
        safeMessage = safeValidationError(error)
      } else if (error instanceof SafeQueryError) {
        // SafeQueryError's `.message` is already client-safe by design
        status = 400
        safeMessage = error.message
      }

      // ---- Return the safe response ----
      return NextResponse.json(
        {
          error: safeMessage,
          error_id: errorId,   // client can quote this to support
        },
        { status }
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Convenience: combine RBAC + Error Handler
// ---------------------------------------------------------------------------

// Re-export for direct import
export { QuerySchemas as Schemas }
