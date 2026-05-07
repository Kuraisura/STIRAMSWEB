import { NextRequest, NextResponse } from "next/server"
import { dbQuery } from "@/lib/db"
import { recordLogTrailChange } from "@/lib/audit"
import { validateSession } from '@/lib/session-manager'

class DepartmentService {
  private static instance: DepartmentService

  static getInstance(): DepartmentService {
    if (!DepartmentService.instance) {
      DepartmentService.instance = new DepartmentService()
    }
    return DepartmentService.instance
  }

  async getAllDepartments(category?: 'Teaching' | 'Non-Teaching') {
    const params: unknown[] = []
    let sql = `
      SELECT *
      FROM departments
      WHERE is_active = TRUE
    `

    if (category) {
      params.push(category)
      sql += ` AND category = $${params.length}`
    }

    sql += ' ORDER BY name ASC'
    const data = await dbQuery(sql, params)
    return data
  }

  async createDepartment(departmentData: { name: string; acronym?: string; description?: string; category?: 'Teaching' | 'Non-Teaching' }, actor?: { user_id?: number; user_email?: string; user_name?: string }) {
    console.log("[Departments] Creating new department:", departmentData)
    const { name, acronym, description, category } = departmentData

    // Validation: Required fields
    if (!name || name.trim() === "") {
      throw new Error("Department name is required and cannot be empty")
    }

    // Validation: Name length
    if (name.trim().length < 2) {
      throw new Error("Department name must be at least 2 characters long")
    }

    if (name.trim().length > 100) {
      throw new Error("Department name cannot exceed 100 characters")
    }

    // Validation: Acronym length if provided
    if (acronym && acronym.trim().length > 10) {
      throw new Error("Department acronym cannot exceed 10 characters")
    }

    // Validation: Description length if provided
    if (description && description.trim().length > 500) {
      throw new Error("Department description cannot exceed 500 characters")
    }

    // Check for duplicate department name (case-insensitive)
    const existing = await dbQuery<{ department_id: number; name: string; is_active: boolean }>(
      `SELECT department_id, name, is_active
       FROM departments
       WHERE lower(name) = lower($1)
       LIMIT 1`,
      [name.trim()]
    )

    if (existing && existing.length > 0) {
      const existingDept = existing[0]
      if (existingDept.is_active) {
        throw new Error(`Department "${existingDept.name}" already exists and is active`)
      } else {
        throw new Error(`Department "${existingDept.name}" already exists but is inactive. Please reactivate it instead.`)
      }
    }

    // Check for duplicate acronym if provided (case-insensitive, but allow symbols)
    if (acronym && acronym.trim() !== "") {
      const existingAcronym = await dbQuery<{ department_id: number; name: string; acronym: string | null }>(
        `SELECT department_id, name, acronym
         FROM departments
         WHERE is_active = TRUE
           AND lower(acronym) = lower($1)`,
        [acronym.trim()]
      )

      if (existingAcronym && existingAcronym.length > 0) {
        // Filter out the current department if updating
        const otherDepts = existingAcronym.filter(dept => 
          dept.department_id !== (departmentData as any).department_id
        )
        
        if (otherDepts.length > 0) {
          throw new Error(`Acronym "${acronym.trim()}" is already used by "${otherDepts[0].name}"`)
        }
      }
    }

    const rows = await dbQuery(
      `INSERT INTO departments (
        name, acronym, description, category, is_active
      ) VALUES ($1, $2, $3, $4, TRUE)
      RETURNING *`,
      [
        name.trim(),
        acronym?.trim() || null,
        description?.trim() || null,
        category || null,
      ]
    )
    const data = rows[0]
    console.log("[Departments] Department created successfully:", data)
    await recordLogTrailChange({ actor, action: 'create:departments', table: 'departments', recordId: data?.department_id, newValue: data })
    return data
  }

  async updateDepartment(departmentData: { department_id: number; name: string; acronym?: string; description?: string; category?: 'Teaching' | 'Non-Teaching'; is_active?: boolean }, actor?: { user_id?: number; user_email?: string; user_name?: string }) {
    console.log("[Departments] Updating department:", departmentData)
    const { department_id, name, acronym, description, category, is_active } = departmentData

    // Validation: Department ID
    if (!department_id || department_id <= 0) {
      throw new Error("Valid Department ID is required")
    }

    // Validation: Department exists
    const prevRows = await dbQuery(
      'SELECT * FROM departments WHERE department_id = $1 LIMIT 1',
      [department_id]
    )
    const prev = prevRows[0]

    if (!prev) {
      throw new Error("Department not found")
    }

    // Validation: Required fields
    if (!name || name.trim() === "") {
      throw new Error("Department name is required and cannot be empty")
    }

    // Validation: Name length
    if (name.trim().length < 2) {
      throw new Error("Department name must be at least 2 characters long")
    }

    if (name.trim().length > 100) {
      throw new Error("Department name cannot exceed 100 characters")
    }

    // Validation: Acronym length if provided
    if (acronym && acronym.trim().length > 10) {
      throw new Error("Department acronym cannot exceed 10 characters")
    }

    // Validation: Description length if provided
    if (description && description.trim().length > 500) {
      throw new Error("Department description cannot exceed 500 characters")
    }

    // Check for duplicate name (case-insensitive, excluding current department)
    const duplicateName = await dbQuery<{ department_id: number; name: string }>(
      `SELECT department_id, name
       FROM departments
       WHERE lower(name) = lower($1)
         AND department_id <> $2`,
      [name.trim(), department_id]
    )

    if (duplicateName && duplicateName.length > 0) {
      throw new Error(`Department name "${name.trim()}" is already used by another department`)
    }

    // Check for duplicate acronym if provided (excluding current department)
    if (acronym && acronym.trim() !== "") {
      const duplicateAcronym = await dbQuery<{ department_id: number; name: string; acronym: string | null }>(
        `SELECT department_id, name, acronym
         FROM departments
         WHERE lower(acronym) = lower($1)
           AND department_id <> $2
           AND is_active = TRUE`,
        [acronym.trim(), department_id]
      )

      if (duplicateAcronym && duplicateAcronym.length > 0) {
        throw new Error(`Acronym "${acronym.trim()}" is already used by "${duplicateAcronym[0].name}"`)
      }
    }

    const rows = await dbQuery(
      `UPDATE departments
       SET name = $1,
           acronym = $2,
           description = $3,
           category = $4,
           is_active = COALESCE($5, is_active),
           updated_at = NOW()
       WHERE department_id = $6
       RETURNING *`,
      [
        name.trim(),
        acronym?.trim() || null,
        description?.trim() || null,
        category || null,
        is_active === undefined ? null : is_active,
        department_id,
      ]
    )
    const data = rows[0]

    console.log("[Departments] Department updated successfully:", data)
    await recordLogTrailChange({ actor, action: 'update:departments', table: 'departments', recordId: department_id, oldValue: prev, newValue: data })
    return data
  }

  async deleteDepartment(departmentId: number, actor?: { user_id?: number; user_email?: string; user_name?: string }) {
    console.log("[Departments] Permanently deleting department:", departmentId)

    // Validation: Department ID
    if (!departmentId || departmentId <= 0) {
      throw new Error("Valid Department ID is required")
    }

    // Check if department exists
    const prevRows = await dbQuery('SELECT * FROM departments WHERE department_id = $1 LIMIT 1', [departmentId])
    const prevDept = prevRows[0]

    if (!prevDept) {
      throw new Error("Department not found. It may have already been deleted.")
    }

    // Check if department is being used by employees
    let employeeCount = 0
    try {
      const countRows = await dbQuery<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM employees WHERE department = $1',
        [prevDept.name]
      )
      employeeCount = countRows[0]?.count || 0
    } catch (countError) {
      console.error("[Departments] Error checking employees:", countError)
    }

    // Block deletion if any employee is currently assigned to this department.
    if (employeeCount > 0) {
      throw new Error(`Cannot delete "${prevDept.name}" because ${employeeCount} employee(s) are still assigned to this department. Please archive/delete those employees first before deleting the department.`)
    }

    // Permanently delete the department from database
    console.log("[Departments] Executing DELETE query for department_id:", departmentId)
    let count = 0
    try {
      const deletedRows = await dbQuery<{ department_id: number }>(
        'DELETE FROM departments WHERE department_id = $1 RETURNING department_id',
        [departmentId]
      )
      count = deletedRows.length
    } catch (error: any) {
      console.error("[Departments] Database DELETE error:", {
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint
      })

      // Handle foreign key constraint errors
      if (error?.code === '23503') {
        throw new Error("Cannot delete department because it's being used by employees or other records. Please reassign or delete related records first.")
      }

      throw new Error(`Failed to delete department: ${error?.message || 'Unknown database error'}`)
    }

    console.log("[Departments] DELETE query successful:", {
      departmentName: prevDept.name,
      departmentId: departmentId,
      rowsDeleted: count
    })

    // Verify deletion
    const stillExistsRows = await dbQuery<{ department_id: number }>(
      'SELECT department_id FROM departments WHERE department_id = $1 LIMIT 1',
      [departmentId]
    )
    const stillExists = stillExistsRows[0]

    if (stillExists) {
      console.error("[Departments] CRITICAL: Department still exists after DELETE!", stillExists)
      throw new Error("Department deletion failed - record still exists in database")
    }

    console.log("[Departments] Verified: Department permanently deleted from database")
    await recordLogTrailChange({ 
      actor, 
      action: 'delete:departments', 
      table: 'departments', 
      recordId: departmentId, 
      oldValue: prevDept 
    })
    
    return { 
      success: true,
      message: `Department "${prevDept.name}" has been permanently deleted`,
      departmentName: prevDept.name
    }
  }

  async reassignDepartmentEmployees(
    sourceDepartmentId: number,
    targetDepartmentId: number,
    actor?: { user_id?: number; user_email?: string; user_name?: string }
  ) {
    if (!sourceDepartmentId || sourceDepartmentId <= 0) {
      throw new Error('Valid source department ID is required')
    }
    if (!targetDepartmentId || targetDepartmentId <= 0) {
      throw new Error('Valid target department ID is required')
    }
    if (sourceDepartmentId === targetDepartmentId) {
      throw new Error('Source and target departments must be different')
    }

    const sourceRows = await dbQuery<any>(
      'SELECT * FROM departments WHERE department_id = $1 LIMIT 1',
      [sourceDepartmentId]
    )
    const targetRows = await dbQuery<any>(
      'SELECT * FROM departments WHERE department_id = $1 LIMIT 1',
      [targetDepartmentId]
    )

    const source = sourceRows[0]
    const target = targetRows[0]

    if (!source) throw new Error('Source department not found')
    if (!target) throw new Error('Target department not found')

    const reassigned = await dbQuery<{ employee_id: number }>(
      `UPDATE employees
       SET department = $1,
           updated_at = NOW()
       WHERE department = $2
       RETURNING employee_id`,
      [target.name, source.name]
    )

    const reassignedCount = reassigned.length

    await recordLogTrailChange({
      actor,
      action: 'reassign:departments',
      table: 'employees',
      recordId: sourceDepartmentId,
      oldValue: { department_id: sourceDepartmentId, name: source.name },
      newValue: {
        source_department_id: sourceDepartmentId,
        source_department_name: source.name,
        target_department_id: targetDepartmentId,
        target_department_name: target.name,
        reassigned_count: reassignedCount,
      },
    })

    return {
      success: true,
      sourceDepartmentName: source.name,
      targetDepartmentName: target.name,
      reassignedCount,
      note: 'Historical attendance logs were not modified.',
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const departmentService = DepartmentService.getInstance()
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') as 'Teaching' | 'Non-Teaching' | null
    
    // Fetch departments with category filter applied at database level
    const data = await departmentService.getAllDepartments(category || undefined)
    
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error("[Departments] Error fetching departments:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const departmentService = DepartmentService.getInstance()
    const actor = await resolveActor(request)
    
    let body
    try {
      body = await request.json()
    } catch (parseError) {
      console.error("[Departments] Invalid JSON in request body:", parseError)
      return NextResponse.json({ error: "Invalid request body. Please provide valid JSON." }, { status: 400 })
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: "Request body must be a valid object" }, { status: 400 })
    }

    const data = await departmentService.createDepartment(body, actor)
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error: any) {
    console.error("[Departments] Error creating department:", error)
    
    // Return appropriate status codes
    const statusCode = error.message.includes("already exists") ? 409 : 
                       error.message.includes("required") || error.message.includes("must be") ? 400 : 500
    
    return NextResponse.json({ success: false, error: error.message }, { status: statusCode })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const departmentService = DepartmentService.getInstance()
    const actor = await resolveActor(request)
    
    let body
    try {
      body = await request.json()
    } catch (parseError) {
      console.error("[Departments] Invalid JSON in request body:", parseError)
      return NextResponse.json({ error: "Invalid request body. Please provide valid JSON." }, { status: 400 })
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: "Request body must be a valid object" }, { status: 400 })
    }

    const data = await departmentService.updateDepartment(body, actor)
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error("[Departments] Error updating department:", error)
    
    // Return appropriate status codes
    const statusCode = error.message.includes("not found") ? 404 :
                       error.message.includes("already used") ? 409 :
                       error.message.includes("required") || error.message.includes("must be") ? 400 : 500
    
    return NextResponse.json({ success: false, error: error.message }, { status: statusCode })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const departmentService = DepartmentService.getInstance()
    const actor = await resolveActor(request)
    const { searchParams } = new URL(request.url)
    const department_id = searchParams.get("id")

    if (!department_id) {
      return NextResponse.json({ success: false, error: "Department ID is required in query parameters" }, { status: 400 })
    }

    const parsedId = parseInt(department_id, 10)
    if (isNaN(parsedId) || parsedId <= 0) {
      return NextResponse.json({ success: false, error: "Department ID must be a valid positive number" }, { status: 400 })
    }

    const result = await departmentService.deleteDepartment(parsedId, actor)
    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    console.error("[Departments] Error deleting department:", error)
    
    // Return appropriate status codes
    const statusCode = error.message.includes("not found") || error.message.includes("already been deleted") ? 404 :
                       error.message.includes("being used") ? 409 :
                       error.message.includes("required") ? 400 : 500
    
    return NextResponse.json({ success: false, error: error.message }, { status: statusCode })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const departmentService = DepartmentService.getInstance()
    const actor = await resolveActor(request)

    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request body. Please provide valid JSON.' }, { status: 400 })
    }

    const sourceDepartmentId = Number(body?.source_department_id)
    const targetDepartmentId = Number(body?.target_department_id)

    const result = await departmentService.reassignDepartmentEmployees(sourceDepartmentId, targetDepartmentId, actor)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[Departments] Error reassigning department employees:', error)
    const statusCode =
      error.message.includes('not found') ? 404 :
      error.message.includes('must be') || error.message.includes('required') || error.message.includes('different') ? 400 : 500

    return NextResponse.json({ success: false, error: error.message || 'Failed to reassign employees' }, { status: statusCode })
  }
}

async function resolveActor(req: NextRequest): Promise<{ user_id?: number; user_email?: string; user_name?: string; session_id?: string }> {
  try {
    const session = await validateSession(req)
    if (session.valid && session.user) {
      return {
        user_id: session.user.id,
        user_email: session.user.email,
        user_name: session.user.name,
        session_id: session.sessionId,
      }
    }
  } catch {
    // best-effort fallback
  }

  const id = Number(req.headers.get('x-user-id') || '') || 0
  const email = req.headers.get('x-user-email') || 'system@rams'
  const name = req.headers.get('x-user-name') || 'System'
  return { user_id: id, user_email: email, user_name: name, session_id: undefined }
}

