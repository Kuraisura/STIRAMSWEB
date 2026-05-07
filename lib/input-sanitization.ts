/**
 * ============================================================================
 * Input Sanitization & XSS/SQLi Deep-Defense Layer
 * ============================================================================
 * OWASP A03:2025 — Injection (SQL Injection, XSS, Command Injection)
 *
 * Defence-in-Depth Strategy:
 *   Layer 1: CSP headers                → middleware.ts (already hardened)
 *   Layer 2: Parameterized SQL via DB client → built-in, automatic
 *   Layer 3: THIS MODULE               → validate + sanitize EVERY input field
 *   Layer 4: Output encoding            → React auto-escapes JSX
 *
 * What this module does:
 *   - Provides Zod schemas for ALL entity types (employees, RFID, schedules)
 *   - Strips all HTML/script tags and dangerous patterns at ingress
 *   - Normalises Unicode to NFC to prevent homoglyph attacks
 *   - Logs blocked payloads to security_alerts for SOC review
 *   - Exports a `withInputValidation()` wrapper for route handlers
 *
 * RFID-specific:
 *   An RFID card that encodes `<script>alert('XSS')</script>` or
 *   `' OR 1=1 --` as the "name" field will be caught here and stored as
 *   harmless text — never executed on the Dean's dashboard.
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { dbQuery } from './db'
import { getClientIP } from './security'

// ---------------------------------------------------------------------------
// 1. Core Sanitizers
// ---------------------------------------------------------------------------

/**
 * Strip all HTML tags, script injections, and dangerous patterns from a string.
 * Returns clean text that is safe to store and display.
 */
export function deepSanitize(input: string): string {
  if (!input || typeof input !== 'string') return ''

  let clean = input
    // Normalise Unicode to NFC (prevents homoglyph/bypass attacks)
    .normalize('NFC')
    // Remove null bytes
    .replace(/\0/g, '')
    // Strip ALL HTML tags (including self-closing)
    .replace(/<\/?[^>]+(>|$)/g, '')
    // Remove javascript: protocol (case-insensitive, whitespace-tolerant)
    .replace(/j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi, '')
    // Remove vbscript: protocol
    .replace(/v\s*b\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi, '')
    // Remove data: URIs that could contain scripts
    .replace(/data\s*:\s*text\/html/gi, '')
    // Remove event handler attributes (onclick, onerror, etc.)
    .replace(/\bon\w+\s*=\s*["']?[^"'>]*["']?/gi, '')
    // Remove expression() CSS injection
    .replace(/expression\s*\(/gi, '')
    // Encode remaining special HTML chars
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    // Trim and limit length
    .trim()

  return clean
}

/**
 * Lighter sanitization for fields that must preserve some characters
 * (e.g. email addresses with @, +), but still strip HTML/script.
 */
export function sanitizePreserveStructure(input: string): string {
  if (!input || typeof input !== 'string') return ''
  return input
    .normalize('NFC')
    .replace(/\0/g, '')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi, '')
    .replace(/\bon\w+\s*=\s*["']?[^"'>]*["']?/gi, '')
    .trim()
}

/**
 * Detect if a string contains SQL injection patterns.
 * Returns the matched pattern name for logging, or null if clean.
 */
export function detectSQLiPattern(input: string): string | null {
  if (!input) return null
  const lower = input.toLowerCase()

  const patterns: [RegExp, string][] = [
    [/'\s*(or|and)\s+\d+\s*=\s*\d+/i, 'tautology'],
    [/'\s*;\s*(drop|delete|update|insert|alter|create|exec)/i, 'stacked-query'],
    [/union\s+(all\s+)?select/i, 'union-select'],
    [/'\s*--/i, 'comment-terminator'],
    [/'\s*#/i, 'hash-comment'],
    [/\/\*.*?\*\//i, 'block-comment'],
    [/sleep\s*\(\s*\d+\s*\)/i, 'time-based-blind'],
    [/benchmark\s*\(/i, 'benchmark-blind'],
    [/waitfor\s+delay/i, 'mssql-delay'],
    [/load_file\s*\(/i, 'file-read'],
    [/into\s+(out|dump)file/i, 'file-write'],
    [/char\s*\(\s*\d+/i, 'char-encoding'],
    [/0x[0-9a-f]{6,}/i, 'hex-encoding'],
    [/extractvalue\s*\(/i, 'xml-extract'],
    [/updatexml\s*\(/i, 'xml-update'],
  ]

  for (const [regex, name] of patterns) {
    if (regex.test(input)) return name
  }
  return null
}

/**
 * Detect XSS patterns.
 * Returns the matched pattern name for logging, or null if clean.
 */
export function detectXSSPattern(input: string): string | null {
  if (!input) return null

  const patterns: [RegExp, string][] = [
    [/<script[\s>]/i, 'script-tag'],
    [/<\/script>/i, 'script-close'],
    [/<iframe[\s>]/i, 'iframe-tag'],
    [/<object[\s>]/i, 'object-tag'],
    [/<embed[\s>]/i, 'embed-tag'],
    [/<svg[\s>].*?on\w+\s*=/i, 'svg-event'],
    [/<img[^>]+onerror\s*=/i, 'img-onerror'],
    [/javascript\s*:/i, 'javascript-protocol'],
    [/vbscript\s*:/i, 'vbscript-protocol'],
    [/on(click|error|load|mouseover|focus|blur|change|submit)\s*=/i, 'event-handler'],
    [/expression\s*\(/i, 'css-expression'],
    [/url\s*\(\s*['"]?\s*javascript:/i, 'css-url-js'],
    [/data\s*:\s*text\s*\/\s*html/i, 'data-html'],
    [/<meta[^>]+http-equiv/i, 'meta-redirect'],
    [/<base\s/i, 'base-tag'],
    [/<form\s/i, 'form-injection'],
  ]

  for (const [regex, name] of patterns) {
    if (regex.test(input)) return name
  }
  return null
}

// ---------------------------------------------------------------------------
// 2. Zod Schemas with Sanitization Transforms
// ---------------------------------------------------------------------------

/** RFID code: alphanumeric, 4-20 chars, stripped of all special characters */
export const RFIDCodeSchema = z
  .string()
  .trim()
  .min(4, 'RFID code too short')
  .max(20, 'RFID code too long')
  .regex(/^[a-zA-Z0-9]+$/, 'RFID code must be alphanumeric')

/** Employee full name: 2-200 chars, no HTML, no SQL injection */
export const FullNameSchema = z
  .string()
  .trim()
  .min(2, 'Name too short')
  .max(200, 'Name too long')
  .transform(deepSanitize)
  .refine(
    (val) => !detectSQLiPattern(val) && !detectXSSPattern(val),
    { message: 'Name contains invalid characters' },
  )

/** Email: standard email format, lowercased */
export const EmailSchema = z
  .string()
  .trim()
  .email('Invalid email format')
  .max(255, 'Email too long')
  .transform((v) => sanitizePreserveStructure(v).toLowerCase())

/** Generic text field with sanitization (for notes, descriptions, etc.) */
export const SafeTextSchema = z
  .string()
  .trim()
  .max(10000, 'Text too long')
  .transform(deepSanitize)

/** Numeric ID: positive integer */
export const NumericIdSchema = z.coerce
  .number()
  .int('ID must be an integer')
  .positive('ID must be positive')
  .max(Number.MAX_SAFE_INTEGER, 'ID too large')

/** ISO date: YYYY-MM-DD */
export const DateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((v) => !isNaN(Date.parse(v)), 'Invalid date')

/** Time: HH:mm or HH:mm:ss */
export const TimeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, 'Time must be HH:mm or HH:mm:ss')

/** Log type: IN or OUT */
export const LogTypeSchema = z.enum(['IN', 'OUT'])

// ---------------------------------------------------------------------------
// 3. Composite Schemas for API Endpoints
// ---------------------------------------------------------------------------

/** POST /api/rfid-log body */
export const RFIDLogBodySchema = z.object({
  rfid_code: RFIDCodeSchema,
  log_type: LogTypeSchema,
})

/** POST /api/rfid/scan body */
export const RFIDScanBodySchema = z.object({
  rfid_code: RFIDCodeSchema,
})

/** Employee create/update body */
export const EmployeeBodySchema = z.object({
  full_name: FullNameSchema,
  email: EmailSchema.optional(),
  rfid_code: RFIDCodeSchema.optional(),
  department: SafeTextSchema.optional(),
  staff_type: z.enum(['Teaching', 'Non-Teaching']).optional(),
  employment_status: SafeTextSchema.optional(),
  school_id: z.string().trim().max(50).optional(),
  phone: z.string().trim().max(20).regex(/^\+?\d{10,15}$/, 'Invalid phone').optional(),
  schedule_time_in: TimeSchema.optional(),
  schedule_time_out: TimeSchema.optional(),
}).passthrough() // Allow extra fields for backward compatibility

/** Search query params */
export const SearchQuerySchema = z.object({
  q: SafeTextSchema.optional(),
  department: SafeTextSchema.optional(),
  staff_type: z.enum(['Teaching', 'Non-Teaching', '']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// ---------------------------------------------------------------------------
// 4. Validation + Threat Logging
// ---------------------------------------------------------------------------

interface ValidationResult<T> {
  success: boolean
  data?: T
  error?: string
  /** True if the input contained an attack payload (logged to security_alerts) */
  attackDetected?: boolean
}

/**
 * Validate and sanitise a request body against a Zod schema.
 * If an attack pattern (SQLi / XSS) is detected in the raw input,
 * the attempt is logged to `security_alerts`.
 */
export async function validateAndSanitize<T>(
  schema: z.ZodSchema<T>,
  rawBody: unknown,
  request?: NextRequest,
): Promise<ValidationResult<T>> {
  // --- Pre-validation: scan raw input for attack payloads ---
  const rawString = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody)
  const sqli = detectSQLiPattern(rawString)
  const xss = detectXSSPattern(rawString)

  if (sqli || xss) {
    const attackType = sqli ? `sqli:${sqli}` : `xss:${xss}`
    const ip = request ? getClientIP(request) : 'unknown'

    console.warn(`[InputGuard] Attack detected: ${attackType}`, {
      ip,
      path: request?.nextUrl?.pathname,
      raw: rawString.substring(0, 200), // Log first 200 chars only
    })

    // Persist to security_alerts (best-effort)
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
          sqli ? 'sql_injection_attempt' : 'xss_attempt',
          'critical',
          `${attackType} detected in request to ${request?.nextUrl?.pathname || 'unknown'}`,
          ip,
          request?.nextUrl?.pathname || 'unknown',
          JSON.stringify({
            attack_type: attackType,
            raw_payload: rawString.substring(0, 500), // Truncate for storage
            user_agent: request?.headers.get('user-agent')?.substring(0, 200),
          }),
          new Date().toISOString(),
        ]
      )
    } catch { /* best-effort */ }

    return {
      success: false,
      error: 'Invalid input detected',
      attackDetected: true,
    }
  }

  // --- Zod validation + transform ---
  const result = schema.safeParse(rawBody)

  if (!result.success) {
    const firstError = result.error.errors[0]
    return {
      success: false,
      error: firstError
        ? `${firstError.path.join('.')}: ${firstError.message}`
        : 'Validation failed',
    }
  }

  return { success: true, data: result.data }
}

// ---------------------------------------------------------------------------
// 5. Route Handler Wrapper
// ---------------------------------------------------------------------------

type RouteHandler = (req: NextRequest, ctx?: any) => Promise<NextResponse>

/**
 * Wrap a route handler with automatic Zod input validation + sanitisation.
 *
 * @example
 * export const POST = withInputValidation(handler, RFIDLogBodySchema)
 */
export function withInputValidation<T>(
  handler: RouteHandler,
  schema: z.ZodSchema<T>,
): RouteHandler {
  return async (request: NextRequest, ctx?: any) => {
    let rawBody: unknown
    try {
      rawBody = await request.clone().json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const validation = await validateAndSanitize(schema, rawBody, request)

    if (!validation.success) {
      const status = validation.attackDetected ? 403 : 400
      return NextResponse.json(
        { success: false, error: validation.error || 'Validation failed' },
        { status },
      )
    }

    // Reconstruct the request with sanitised body so the handler uses clean data
    const sanitisedRequest = new NextRequest(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(validation.data),
    })

    return handler(sanitisedRequest, ctx)
  }
}

// ---------------------------------------------------------------------------
// 6. Output Encoding Helper (for non-React contexts like emails, PDFs)
// ---------------------------------------------------------------------------

/**
 * HTML-encode a string for safe embedding in non-React templates
 * (e.g. email HTML, PDF generation, server-rendered pages).
 *
 * React JSX already auto-escapes — use this only outside of React rendering.
 */
export function htmlEncode(str: string): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}
