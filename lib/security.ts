/**
 * Security utilities for input validation, sanitization, and protection
 */

/**
 * Sanitize string input to prevent XSS attacks
 */
export function sanitizeString(input: string | null | undefined): string {
  if (!input || typeof input !== 'string') return ''
  
  return input
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers like onclick=
    .trim()
    .substring(0, 10000) // Limit length
}

/**
 * Sanitize email input
 */
export function sanitizeEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') return null
  
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const sanitized = email.trim().toLowerCase().substring(0, 255)
  
  if (!emailRegex.test(sanitized)) return null
  return sanitized
}

/**
 * Sanitize RFID code (alphanumeric, specific length)
 */
export function sanitizeRFIDCode(rfid: string | null | undefined): string | null {
  if (!rfid || typeof rfid !== 'string') return null
  
  // RFID codes should be alphanumeric, 6-20 characters
  const sanitized = rfid.trim().substring(0, 20)
  const rfidRegex = /^[a-zA-Z0-9]{6,20}$/
  
  if (!rfidRegex.test(sanitized)) return null
  return sanitized
}

/**
 * Sanitize phone number
 */
export function sanitizePhone(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== 'string') return null
  
  // Remove all non-digit characters except +
  const sanitized = phone.replace(/[^\d+]/g, '').substring(0, 20)
  
  // Must be 10-15 digits
  if (!/^\+?\d{10,15}$/.test(sanitized)) return null
  return sanitized
}

/**
 * Validate and sanitize numeric ID
 */
export function sanitizeNumericId(id: string | number | null | undefined): number | null {
  if (id === null || id === undefined) return null
  
  const numId = typeof id === 'string' ? parseInt(id, 10) : id
  
  if (isNaN(numId) || numId <= 0 || numId > Number.MAX_SAFE_INTEGER) return null
  return numId
}

/**
 * Validate date string
 */
export function sanitizeDate(dateString: string | null | undefined): string | null {
  if (!dateString || typeof dateString !== 'string') return null
  
  // ISO date format: YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  const sanitized = dateString.trim().substring(0, 10)
  
  if (!dateRegex.test(sanitized)) return null
  
  // Validate it's a real date
  const date = new Date(sanitized)
  if (isNaN(date.getTime())) return null
  
  return sanitized
}

/**
 * Validate time string (HH:mm:ss or HH:mm)
 */
export function sanitizeTime(timeString: string | null | undefined): string | null {
  if (!timeString || typeof timeString !== 'string') return null
  
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/
  const sanitized = timeString.trim().substring(0, 8)
  
  if (!timeRegex.test(sanitized)) return null
  return sanitized
}

/**
 * Validate request body size (max 10MB)
 */
export function validateRequestBodySize(body: any): boolean {
  try {
    const jsonString = JSON.stringify(body)
    const sizeInBytes = new Blob([jsonString]).size
    const maxSize = 10 * 1024 * 1024 // 10MB
    
    return sizeInBytes <= maxSize
  } catch {
    return false
  }
}

/**
 * Check for SQL injection patterns (basic check)
 * Note: Database access uses parameterized queries, and this is an extra layer
 */
export function detectSQLInjection(input: string | null | undefined): boolean {
  if (!input || typeof input !== 'string') return false
  
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
    /(['";]|--|#|\/\*|\*\/)/g,
    /(\bOR\s+\d+\s*=\s*\d+)/gi,
    /(\bUNION\b.*\bSELECT\b)/gi,
    /(\bAND\s+\d+\s*=\s*\d+)/gi,
  ]
  
  return sqlPatterns.some(pattern => pattern.test(input))
}

/**
 * Check for XSS patterns
 */
export function detectXSS(input: string | null | undefined): boolean {
  if (!input || typeof input !== 'string') return false
  
  const xssPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<img[^>]*src[^>]*=.*?>/gi,
    /<svg[^>]*>.*?<\/svg>/gi,
  ]
  
  return xssPatterns.some(pattern => pattern.test(input))
}

/**
 * Validate and sanitize request body
 */
export function sanitizeRequestBody<T extends Record<string, any>>(
  body: any,
  schema: Record<string, (value: any) => any>
): Partial<T> {
  const sanitized: any = {}
  
  for (const [key, validator] of Object.entries(schema)) {
    if (key in body) {
      try {
        const value = validator(body[key])
        if (value !== null && value !== undefined) {
          sanitized[key] = value
        }
      } catch (error) {
        console.warn(`[Security] Failed to sanitize field ${key}:`, error)
      }
    }
  }
  
  return sanitized
}

/**
 * Get client IP address from request
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIP = request.headers.get('x-real-ip')
  const cfConnectingIP = request.headers.get('cf-connecting-ip') // Cloudflare
  
  if (cfConnectingIP) return cfConnectingIP
  if (realIP) return realIP
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, get the first one
    return forwarded.split(',')[0].trim()
  }
  
  // For Next.js, try to get from request object
  if (request instanceof Request) {
    // Try to extract from URL or other sources
    const url = new URL(request.url)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return '127.0.0.1'
    }
  }
  
  return 'unknown'
}

/**
 * Mask IP address for privacy (show only first octet or first group)
 * Example: 192.168.1.100 -> 192.x.x.x
 * Example: 2001:db8::1 -> 2001:xxxx:xxxx:xxxx
 * Example: ::1 -> localhost (IPv6 localhost)
 */
export function maskIPAddress(ip: string): string {
  if (!ip || ip === 'unknown') return 'hidden'
  
  // Handle localhost variants
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
    return 'localhost'
  }
  
  // IPv4: 192.168.1.100 -> 192.x.x.x
  if (ip.includes('.')) {
    const parts = ip.split('.')
    if (parts.length === 4) {
      return `${parts[0]}.x.x.x`
    }
  }
  
  // IPv6: 2001:db8::1 -> 2001:xxxx:xxxx:xxxx
  if (ip.includes(':')) {
    const parts = ip.split(':').filter(p => p.length > 0)
    if (parts.length > 0) {
      return `${parts[0]}:${'x'.repeat(Math.min(parts.length - 1, 3)).match(/.{1,4}/g)?.join(':') || 'xxxx'}`
    }
  }
  
  return 'hidden'
}

/**
 * Check if IP is from allowed origins (for internal APIs)
 */
export function isAllowedOrigin(ip: string, allowedIPs: string[] = []): boolean {
  if (allowedIPs.length === 0) return true // No restrictions
  
  return allowedIPs.some(allowed => {
    if (allowed === ip) return true
    // Support CIDR notation (e.g., 192.168.1.0/24)
    if (allowed.includes('/')) {
      // Simple CIDR check (basic implementation)
      const [network, prefix] = allowed.split('/')
      return ip.startsWith(network.substring(0, network.lastIndexOf('.')))
    }
    return false
  })
}

