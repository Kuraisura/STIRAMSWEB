/**
 * API Security utilities for protecting routes
 */

import { NextRequest, NextResponse } from 'next/server'
import { 
  sanitizeString, 
  sanitizeEmail, 
  sanitizeRFIDCode, 
  sanitizeNumericId,
  sanitizeDate,
  sanitizeTime,
  validateRequestBodySize,
  detectSQLInjection,
  detectXSS,
  getClientIP,
} from './security'

/**
 * Validate and sanitize request body
 */
export function validateRequestBody(body: any): { valid: boolean; error?: string; sanitized?: any } {
  // Check request body size
  if (!validateRequestBodySize(body)) {
    return { valid: false, error: 'Request body too large (max 10MB)' }
  }
  
  // Check for SQL injection patterns
  const bodyString = JSON.stringify(body)
  if (detectSQLInjection(bodyString)) {
    return { valid: false, error: 'Invalid request: potentially malicious content detected' }
  }
  
  // Check for XSS patterns
  if (detectXSS(bodyString)) {
    return { valid: false, error: 'Invalid request: potentially malicious content detected' }
  }
  
  return { valid: true, sanitized: body }
}

/**
 * Validate RFID log request
 */
export function validateRFIDLogRequest(body: any): { valid: boolean; error?: string; data?: { rfid_code: string; log_type: 'IN' | 'OUT' } } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' }
  }
  
  const rfidCode = sanitizeRFIDCode(body.rfid_code || body.rfidCode)
  const logType = body.log_type || body.logType
  
  if (!rfidCode) {
    return { valid: false, error: 'Invalid or missing RFID code' }
  }
  
  if (!logType || !['IN', 'OUT'].includes(logType)) {
    return { valid: false, error: 'Invalid log_type. Must be IN or OUT' }
  }
  
  return {
    valid: true,
    data: {
      rfid_code: rfidCode,
      log_type: logType as 'IN' | 'OUT',
    },
  }
}

/**
 * Validate employee creation/update request
 */
export function validateEmployeeRequest(body: any, isUpdate: boolean = false): { valid: boolean; error?: string; data?: any } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' }
  }
  
  const sanitized: any = {}
  
  // Required fields
  if (!isUpdate || body.full_name) {
    const fullName = sanitizeString(body.full_name)
    if (!fullName || fullName.length < 2) {
      return { valid: false, error: 'Full name is required and must be at least 2 characters' }
    }
    sanitized.full_name = fullName
  }
  
  if (!isUpdate || body.email) {
    const email = sanitizeEmail(body.email)
    if (!email) {
      return { valid: false, error: 'Valid email is required' }
    }
    sanitized.email = email
  }
  
  // Optional but validated fields
  if (body.phone) {
    const phone = sanitizePhone(body.phone)
    if (phone) sanitized.phone = phone
  }
  
  if (body.rfid_code) {
    const rfid = sanitizeRFIDCode(body.rfid_code)
    if (rfid) sanitized.rfid_code = rfid
  }
  
  if (body.school_id) {
    sanitized.school_id = sanitizeString(body.school_id).substring(0, 50)
  }
  
  if (body.department) {
    sanitized.department = sanitizeString(body.department).substring(0, 200)
  }
  
  if (body.employment_status) {
    sanitized.employment_status = sanitizeString(body.employment_status).substring(0, 50)
  }
  
  if (body.staff_type) {
    const staffType = sanitizeString(body.staff_type)
    if (['Teaching', 'Non-Teaching'].includes(staffType)) {
      sanitized.staff_type = staffType
    }
  }
  
  // Validate numeric IDs
  if (body.employee_id) {
    const id = sanitizeNumericId(body.employee_id)
    if (id) sanitized.employee_id = id
  }
  
  return { valid: true, data: sanitized }
}

/**
 * Sanitize phone number (helper function)
 */
function sanitizePhone(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== 'string') return null
  const sanitized = phone.replace(/[^\d+]/g, '').substring(0, 20)
  if (!/^\+?\d{10,15}$/.test(sanitized)) return null
  return sanitized
}

/**
 * Create secure API handler wrapper
 */
export function createSecureHandler(
  handler: (req: NextRequest, context?: any) => Promise<NextResponse>,
  options: {
    requireAuth?: boolean
    validateBody?: (body: any) => { valid: boolean; error?: string; data?: any }
    maxBodySize?: number
  } = {}
) {
  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    try {
      // Authentication check
      if (options.requireAuth) {
        // TODO: Implement authentication check
        // For now, check for user in headers or session
        const userId = req.headers.get('x-user-id')
        if (!userId) {
          return NextResponse.json(
            { error: 'Authentication required' },
            { status: 401 }
          )
        }
      }
      
      // Validate request body for POST/PUT/PATCH
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        try {
          const body = await req.json().catch(() => ({}))
          
          // Check body size
          if (options.maxBodySize) {
            const bodySize = new Blob([JSON.stringify(body)]).size
            if (bodySize > options.maxBodySize) {
              return NextResponse.json(
                { error: `Request body too large (max ${options.maxBodySize / 1024 / 1024}MB)` },
                { status: 413 }
              )
            }
          }
          
          // Custom validation
          if (options.validateBody) {
            const validation = options.validateBody(body)
            if (!validation.valid) {
              return NextResponse.json(
                { error: validation.error || 'Invalid request body' },
                { status: 400 }
              )
            }
            
            // Replace body with sanitized version
            req = new NextRequest(req.url, {
              method: req.method,
              headers: req.headers,
              body: JSON.stringify(validation.data || body),
            })
          } else {
            // Default validation
            const validation = validateRequestBody(body)
            if (!validation.valid) {
              return NextResponse.json(
                { error: validation.error || 'Invalid request body' },
                { status: 400 }
              )
            }
          }
        } catch (error) {
          return NextResponse.json(
            { error: 'Invalid JSON in request body' },
            { status: 400 }
          )
        }
      }
      
      // Call the actual handler
      return await handler(req, context)
    } catch (error: any) {
      console.error('[API Security] Handler error:', error)
      
      // Don't expose internal errors to client
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
  }
}

/**
 * Log security event (with IP masking)
 */
export function logSecurityEvent(
  event: string,
  details: Record<string, any>,
  request: NextRequest
) {
  const { getClientIP, maskIPAddress } = require('./security')
  const ip = getClientIP(request)
  const maskedIP = maskIPAddress(ip)
  const userAgent = request.headers.get('user-agent') || 'unknown'
  const timestamp = new Date().toISOString()
  
  console.warn(`[Security Event] ${event}`, {
    timestamp,
    ip: maskedIP, // Use masked IP for privacy
    userAgent: userAgent.substring(0, 100), // Limit user agent length
    path: request.nextUrl.pathname,
    ...details,
  })
  
  // TODO: Store in log trail or security monitoring system
  // Note: Store full IP in database but mask in logs
}

