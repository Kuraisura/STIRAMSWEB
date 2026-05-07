/**
 * Rate limiting utilities using in-memory store
 * For production, consider using Redis or a dedicated rate limiting service
 */

interface RateLimitEntry {
  count: number
  resetTime: number
  firstRequest: number
}

// Temporary testing override: bypass rate-limit checks for rapid category testing.
const DISABLE_RATE_LIMITING = true

// In-memory store (use Redis in production for distributed systems)
const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key)
    }
  }
}, 5 * 60 * 1000)

export interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Maximum requests per window
  message?: string // Custom error message
  skipSuccessfulRequests?: boolean // Don't count successful requests
  skipFailedRequests?: boolean // Don't count failed requests
}

export interface RateLimitResult {
  success: boolean
  remaining: number
  resetTime: number
  retryAfter?: number
  message?: string
}

/**
 * Check rate limit for a given identifier (IP, user ID, etc.)
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  if (DISABLE_RATE_LIMITING) {
    return {
      success: true,
      remaining: Number.MAX_SAFE_INTEGER,
      resetTime: Date.now() + config.windowMs,
    }
  }

  const now = Date.now()
  const key = `${identifier}:${Math.floor(now / config.windowMs)}`
  
  let entry = rateLimitStore.get(key)
  
  // Create new entry if it doesn't exist or window has reset
  if (!entry || entry.resetTime < now) {
    entry = {
      count: 0,
      resetTime: now + config.windowMs,
      firstRequest: now,
    }
    rateLimitStore.set(key, entry)
  }
  
  // Increment count
  entry.count++
  
  // Check if limit exceeded
  if (entry.count > config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000)
    
    return {
      success: false,
      remaining: 0,
      resetTime: entry.resetTime,
      retryAfter,
      message: config.message || `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
    }
  }
  
  return {
    success: true,
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetTime: entry.resetTime,
  }
}

/**
 * Rate limit middleware for API routes
 */
export function createRateLimiter(config: RateLimitConfig) {
  return (request: Request, identifier?: string): RateLimitResult => {
    // Use provided identifier or get from request
    const id = identifier || getRequestIdentifier(request)
    return checkRateLimit(id, config)
  }
}

/**
 * Get unique identifier for rate limiting from request
 */
function getRequestIdentifier(request: Request): string {
  // Try to get user ID from headers (if authenticated)
  const userId = request.headers.get('x-user-id')
  if (userId) return `user:${userId}`
  
  // Fall back to IP address
  const forwarded = request.headers.get('x-forwarded-for')
  const realIP = request.headers.get('x-real-ip')
  const cfConnectingIP = request.headers.get('cf-connecting-ip')
  
  let ip = cfConnectingIP || realIP || (forwarded ? forwarded.split(',')[0].trim() : 'unknown')
  
  // Normalize localhost IPs
  if (ip === '::1' || ip === 'localhost') {
    ip = '127.0.0.1'
  }
  
  return `ip:${ip}`
}

/**
 * Pre-configured rate limiters for different endpoints
 */
export const rateLimiters = {
  // General API endpoints: 100 requests per minute
  general: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    message: 'Too many requests. Please slow down.',
  }),
  
  // Authentication endpoints: 5 requests per 15 minutes
  auth: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    message: 'Too many login attempts. Please try again later.',
  }),
  
  // RFID logging: 100 requests per minute (high frequency expected)
  rfid: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    message: 'RFID logging rate limit exceeded.',
  }),
  
  // Email sending: 10 requests per hour
  email: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10,
    message: 'Email sending rate limit exceeded. Please try again later.',
  }),
  
  // File upload: 20 requests per hour
  upload: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 20,
    message: 'Upload rate limit exceeded. Please try again later.',
  }),
  
  // Data export: 10 requests per hour
  export: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10,
    message: 'Export rate limit exceeded. Please try again later.',
  }),
  
  // Search: 50 requests per minute
  search: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 50,
    message: 'Search rate limit exceeded. Please slow down.',
  }),
}

