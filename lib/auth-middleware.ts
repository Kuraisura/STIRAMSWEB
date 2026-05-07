/**
 * Authentication middleware for API routes
 */

import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from './db'

export interface AuthResult {
  authenticated: boolean
  user?: {
    id: number
    email: string
    name: string
    role: string
  }
  error?: string
}

/**
 * Authenticate request using session or headers
 */
export async function authenticateRequest(request: NextRequest): Promise<AuthResult> {
  try {
    // Try to get user from headers (set by client-side auth)
    const userId = request.headers.get('x-user-id')
    const userEmail = request.headers.get('x-user-email')
    
    if (userId && userEmail) {
      // Verify user exists and is active
      const rows = await dbQuery<{
        id: number
        email: string
        full_name: string | null
        role: string | null
      }>(
        `SELECT id, email, full_name, role
         FROM admin_users
         WHERE id = $1
           AND email = $2
           AND is_active = TRUE
         LIMIT 1`,
        [parseInt(userId, 10), userEmail]
      )

      const user = rows[0]
      
      if (!user) {
        return {
          authenticated: false,
          error: 'Invalid or inactive user',
        }
      }
      
      return {
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.full_name || user.email,
          role: user.role || 'admin',
        },
      }
    }
    
    // Try to get from Authorization header
    const authHeader = request.headers.get('authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      // TODO: Verify JWT token if using JWT auth
      // For now, return unauthenticated
    }
    
    return {
      authenticated: false,
      error: 'Authentication required',
    }
  } catch (error) {
    console.error('[Auth Middleware] Error:', error)
    return {
      authenticated: false,
      error: 'Authentication error',
    }
  }
}

/**
 * Require authentication for API route
 */
export function requireAuth(handler: (req: NextRequest, user: AuthResult['user']) => Promise<NextResponse>) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const authResult = await authenticateRequest(req)
    
    if (!authResult.authenticated || !authResult.user) {
      return NextResponse.json(
        { error: authResult.error || 'Authentication required' },
        { status: 401 }
      )
    }
    
    return handler(req, authResult.user)
  }
}

/**
 * Require specific role
 */
export function requireRole(
  roles: string[],
  handler: (req: NextRequest, user: AuthResult['user']) => Promise<NextResponse>
) {
  return requireAuth(async (req, user) => {
    if (!user || !roles.includes(user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }
    
    return handler(req, user)
  })
}

