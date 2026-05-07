/**
 * ============================================================================
 * IDOR Protection — Ownership & Scope-Based Access Control Middleware
 * ============================================================================
 * OWASP A01:2025 — Insecure Direct Object Reference (IDOR)
 *
 * Prevents:
 *   - Horizontal privilege escalation → Dean A viewing Dean B's employees
 *   - Vertical privilege escalation  → Readonly user editing records
 *   - Enumeration attacks            → Sequential ID guessing (/employee/101 → /102)
 *
 * How it works:
 *   1. Extracts the target resource ID from the URL or request body.
 *   2. Resolves the current user's session → role + department + userId.
 *   3. Checks the OWNERSHIP_RULES for the requested resource type:
 *      - super_admin → full access
 *      - dean        → only employees in their assigned department(s)
 *      - academic_head → only teaching employees
 *      - non_teaching_admin → only non-teaching staff
 *      - department_head → only their department
 *      - readonly → read-only, scoped to department
 *   4. Rejects with 403 if the ownership check fails.
 *
 * Integration:
 *   export const GET = withIDORProtection(handler, {
 *     resourceType: 'employee',
 *     idParam: 'id',            // from dynamic route [id]
 *     action: 'read',
 *   })
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from './db'
import { validateSession } from './session-manager'
import { getClientIP } from './security'

// ---------------------------------------------------------------------------
// 1. Types
// ---------------------------------------------------------------------------

export type ResourceType =
  | 'employee'
  | 'attendance_log'
  | 'schedule'
  | 'dtr_report'
  | 'academic_term'
  | 'admin_user'

export type ResourceAction = 'read' | 'write' | 'delete' | 'export'

interface IDORConfig {
  /** The type of resource being accessed */
  resourceType: ResourceType
  /** How to extract the target resource ID */
  idSource: 'route' | 'query' | 'body'
  /** The parameter/field name containing the ID */
  idParam: string
  /** The action being performed */
  action: ResourceAction
  /** Custom ownership check (overrides default) */
  customCheck?: (userId: number, role: string, resourceId: number, departments: string[]) => Promise<boolean>
}

interface SessionUser {
  id: number
  email: string
  role: string
  departments: string[]
}

// ---------------------------------------------------------------------------
// 2. Ownership Resolution — Which departments does this user own?
// ---------------------------------------------------------------------------

/**
 * Resolve the departments a user has authority over.
 * Super-admins get ALL departments; others get their assigned department(s).
 */
async function getUserDepartments(userId: number, role: string): Promise<string[]> {
  if (role === 'super_admin') {
    // Super-admin sees everything
    const data = await dbQuery<{ department: string | null }>(
      `SELECT DISTINCT department
       FROM employees
       WHERE department IS NOT NULL`
    )
    const unique = [...new Set((data || []).map((e) => e.department).filter(Boolean) as string[])]
    return unique
  }

  // For other roles, get from admin_users.department or admin_users.departments
  const admins = await dbQuery<{ department: string | null; departments: string[] | null }>(
    `SELECT department, departments
     FROM admin_users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  )
  const admin = admins[0]

  if (!admin) return []

  // admin.departments is an array; admin.department is a single string
  const depts: string[] = []
  if (admin.departments && Array.isArray(admin.departments)) {
    depts.push(...admin.departments)
  } else if (admin.department) {
    depts.push(admin.department)
  }

  return depts.filter(Boolean)
}

// ---------------------------------------------------------------------------
// 3. Resource Ownership Checks
// ---------------------------------------------------------------------------

/**
 * Check if the user's department scope includes the target employee.
 */
async function checkEmployeeOwnership(
  _userId: number,
  role: string,
  resourceId: number,
  departments: string[],
): Promise<boolean> {
  // Super-admin always passes
  if (role === 'super_admin') return true

  // Fetch the employee's department
  const employees = await dbQuery<{ department: string | null; staff_type: string | null }>(
    `SELECT department, staff_type
     FROM employees
     WHERE employee_id = $1
     LIMIT 1`,
    [resourceId]
  )
  const employee = employees[0]

  if (!employee) return false // Resource doesn't exist → 404 would be better, but 403 is safer

  // academic_head → only teaching staff
  if (role === 'academic_head' && employee.staff_type !== 'Teaching') {
    return false
  }

  // non_teaching_admin → only non-teaching staff
  if (role === 'non_teaching_admin' && employee.staff_type !== 'Non-Teaching') {
    return false
  }

  // Department-based scope
  if (departments.length > 0 && employee.department) {
    return departments.includes(employee.department)
  }

  // If no department restrictions configured, allow (backward compat)
  return departments.length === 0
}

/**
 * Check if the user can access a specific attendance log.
 */
async function checkAttendanceLogOwnership(
  userId: number,
  role: string,
  resourceId: number,
  departments: string[],
): Promise<boolean> {
  if (role === 'super_admin') return true

  // Find the employee who owns this attendance log
  const logs = await dbQuery<{ employee_id: number }>(
    `SELECT employee_id
     FROM attendance_logs
     WHERE log_id = $1
     LIMIT 1`,
    [resourceId]
  )
  const log = logs[0]

  if (!log) return false

  // Delegate to employee ownership check
  return checkEmployeeOwnership(userId, role, log.employee_id, departments)
}

/**
 * Check if the user can access a DTR report.
 */
async function checkDTROwnership(
  userId: number,
  role: string,
  resourceId: number,
  departments: string[],
): Promise<boolean> {
  // DTR = employee report, same ownership as employee
  return checkEmployeeOwnership(userId, role, resourceId, departments)
}

/**
 * Check if the user can manage admin users.
 */
async function checkAdminUserOwnership(
  _userId: number,
  role: string,
  _resourceId: number,
  _departments: string[],
): Promise<boolean> {
  // Only super_admin can manage other admin users
  return role === 'super_admin'
}

/**
 * Dispatch to the correct ownership check for a resource type.
 */
const OWNERSHIP_CHECKS: Record<
  ResourceType,
  (userId: number, role: string, resourceId: number, departments: string[]) => Promise<boolean>
> = {
  employee: checkEmployeeOwnership,
  attendance_log: checkAttendanceLogOwnership,
  schedule: checkEmployeeOwnership, // Schedule belongs to an employee
  dtr_report: checkDTROwnership,
  academic_term: async () => true,  // All authenticated users can read terms
  admin_user: checkAdminUserOwnership,
}

// ---------------------------------------------------------------------------
// 4. Read-Only Role Guard
// ---------------------------------------------------------------------------

const READONLY_ACTIONS: Record<ResourceAction, boolean> = {
  read: true,
  write: false,
  delete: false,
  export: true,
}

function canRolePerformAction(role: string, action: ResourceAction): boolean {
  if (role === 'super_admin') return true
  if (role === 'readonly') return READONLY_ACTIONS[action] ?? false
  // Dean and department_head can read + write (not delete admin_users)
  if (action === 'delete' && !['super_admin', 'dean'].includes(role)) return false
  return true
}

// ---------------------------------------------------------------------------
// 5. Route Handler Wrapper
// ---------------------------------------------------------------------------

type RouteHandler = (req: NextRequest, ctx?: any) => Promise<NextResponse>

/**
 * Wrap a Next.js API route handler with IDOR protection.
 *
 * @example
 * // In app/api/employees/[id]/route.ts:
 * export const GET = withIDORProtection(handler, {
 *   resourceType: 'employee',
 *   idSource: 'route',
 *   idParam: 'id',
 *   action: 'read',
 * })
 */
export function withIDORProtection(
  handler: RouteHandler,
  config: IDORConfig,
): RouteHandler {
  return async (request: NextRequest, ctx?: any) => {
    try {
      // --- 1. Authenticate — resolve the current user from session cookie ---
      const sessionResult = await validateSession(request)

      if (!sessionResult.valid || !sessionResult.user) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 },
        )
      }

      const user_id = sessionResult.user.id
      const user_email = sessionResult.user.email
      const role = (sessionResult.user.role || 'readonly') as string

      // --- 2. Action-level check (readonly roles can't write/delete) ---
      if (!canRolePerformAction(role, config.action)) {
        return NextResponse.json(
          { error: `Insufficient permissions: ${role} cannot ${config.action}` },
          { status: 403 },
        )
      }

      // --- 3. Extract the target resource ID ---
      let resourceId: number | null = null

      if (config.idSource === 'route' && ctx?.params) {
        const rawId = ctx.params[config.idParam]
        resourceId = rawId ? parseInt(String(rawId), 10) : null
      } else if (config.idSource === 'query') {
        const rawId = request.nextUrl.searchParams.get(config.idParam)
        resourceId = rawId ? parseInt(rawId, 10) : null
      } else if (config.idSource === 'body') {
        try {
          const body = await request.clone().json()
          resourceId = body[config.idParam] ? parseInt(String(body[config.idParam]), 10) : null
        } catch {
          resourceId = null
        }
      }

      if (resourceId === null || isNaN(resourceId) || resourceId <= 0) {
        return NextResponse.json(
          { error: 'Invalid or missing resource ID' },
          { status: 400 },
        )
      }

      // --- 4. Ownership check ---
      const departments = await getUserDepartments(user_id, role)
      const checkFn = config.customCheck || OWNERSHIP_CHECKS[config.resourceType]

      const allowed = await checkFn(user_id, role, resourceId, departments)

      if (!allowed) {
        // Log the IDOR attempt
        console.warn('[IDOR] Access denied:', {
          user_id,
          user_email,
          role,
          resource: config.resourceType,
          resource_id: resourceId,
          action: config.action,
          ip: getClientIP(request),
        })

        // Write to security_alerts (best-effort)
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
              'idor_attempt',
              'high',
              `User ${user_email} (${role}) attempted unauthorized ${config.action} on ${config.resourceType}:${resourceId}`,
              getClientIP(request),
              request.nextUrl.pathname,
              JSON.stringify({
                user_id,
                role,
                resource_type: config.resourceType,
                resource_id: resourceId,
                action: config.action,
                user_departments: departments,
              }),
              new Date().toISOString(),
            ]
          )
        } catch { /* best-effort */ }

        return NextResponse.json(
          { error: 'You do not have permission to access this resource' },
          { status: 403 },
        )
      }

      // --- 5. Authorized — proceed to handler ---
      return handler(request, ctx)

    } catch (error: any) {
      console.error('[IDOR Middleware] Error:', error)
      return NextResponse.json(
        { error: 'Internal authorization error' },
        { status: 500 },
      )
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Bulk Endpoint Helper — Filter a list of IDs to only owned resources
// ---------------------------------------------------------------------------

/**
 * Given an array of employee IDs, return only the IDs the current user
 * is allowed to see (based on department scope).
 *
 * Use this for bulk endpoints like GET /api/employees or export routes
 * where you need to filter a result set rather than gate a single ID.
 */
export async function filterByOwnership(
  userId: number,
  role: string,
  employeeIds: number[],
): Promise<number[]> {
  if (role === 'super_admin') return employeeIds

  const departments = await getUserDepartments(userId, role)
  if (departments.length === 0) return employeeIds // No restrictions

  const employees = await dbQuery<{ employee_id: number; department: string | null; staff_type: string | null }>(
    `SELECT employee_id, department, staff_type
     FROM employees
     WHERE employee_id = ANY($1::int[])`,
    [employeeIds]
  )

  if (!employees) return []

  return employees
    .filter((e) => {
      // Department check
      if (departments.length > 0 && e.department && !departments.includes(e.department)) {
        return false
      }
      // Staff type check
      if (role === 'academic_head' && e.staff_type !== 'Teaching') return false
      if (role === 'non_teaching_admin' && e.staff_type !== 'Non-Teaching') return false
      return true
    })
    .map((e) => e.employee_id)
}
