import { NextRequest, NextResponse } from 'next/server'
import { dbQuery, pool } from '@/lib/db'
import { validateSession } from '@/lib/session-manager'
import { getManilaToday } from '@/lib/timezone-utils'

export const dynamic = 'force-dynamic'

async function getEmployeeBySessionEmail(email: string) {
  const rows = await dbQuery<any>(
    `SELECT *
     FROM employees
     WHERE email = $1
       AND (is_active IS NULL OR is_active = true)
     LIMIT 1`,
    [email]
  )
  return rows[0] || null
}

async function getLeaveLimitForStaffType(staffType: string | null | undefined): Promise<number> {
  const normalized = String(staffType || '').toLowerCase().replace(/\s+/g, '-')
  const key = normalized === 'teaching' ? 'max_leaves_per_year_teaching' : 'max_leaves_per_year_non_teaching'

  try {
    const rows = await dbQuery<{ value: string | null }>(
      `SELECT value
       FROM system_settings
       WHERE key = $1
       LIMIT 1`,
      [key]
    )

    const parsed = Number(rows[0]?.value || '10')
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 10
  } catch (error) {
    console.error('[leave-requests] Failed to load leave token limit setting:', error)
    return 10
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await validateSession(req)
    if (!session.valid || !session.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const mine = searchParams.get('mine') === 'true'
    const status = searchParams.get('status') || 'all'
    const employeeIdParam = Number(searchParams.get('employeeId') || 0)
    const employeeId = Number.isFinite(employeeIdParam) && employeeIdParam > 0 ? employeeIdParam : null
    const limitParam = Number(searchParams.get('limit') || 0)
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : null

    if (mine) {
      const employee = await getEmployeeBySessionEmail(session.user.email)
      if (!employee) {
        return NextResponse.json({
          currentUser: null,
          leaveTypes: [],
          leaveCredits: [],
          leaveRequests: [],
          warning: 'Employee profile not found',
        })
      }

      const [leaveTypes, leaveCredits, leaveRequests] = await Promise.all([
        dbQuery<any>(
          `SELECT *
           FROM leave_types
           WHERE is_active = true
           ORDER BY leave_type_name ASC`
        ),
        dbQuery<any>(
          `SELECT lc.*, lt.*
           FROM leave_credits lc
           LEFT JOIN leave_types lt ON lt.id = lc.leave_type_id
           WHERE lc.employee_id = $1`,
          [employee.employee_id]
        ),
        dbQuery<any>(
          `SELECT lr.*, lt.*, e.*
           FROM leave_requests lr
           LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id
           LEFT JOIN employees e ON e.employee_id = lr.employee_id
           WHERE lr.employee_id = $1
           ORDER BY lr.created_at DESC`,
          [employee.employee_id]
        ),
      ])

      const normalizedCredits = leaveCredits.map((row: any) => ({
        id: row.id,
        employee_id: row.employee_id,
        leave_type_id: row.leave_type_id,
        academic_year: row.academic_year,
        total_credits: row.total_credits,
        used_credits: row.used_credits,
        remaining_credits: row.remaining_credits,
        created_at: row.created_at,
        updated_at: row.updated_at,
        leave_types: {
          id: row.leave_type_id,
          leave_type_name: row.leave_type_name,
          description: row.description,
          default_credits: row.default_credits,
          requires_documentation: row.requires_documentation,
          is_active: row.is_active,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
      }))

      const normalizedRequests = leaveRequests.map((row: any) => ({
        id: row.id,
        employee_id: row.employee_id,
        leave_type_id: row.leave_type_id,
        date_from: row.date_from,
        date_to: row.date_to,
        days_requested: row.days_requested,
        reason: row.reason,
        supporting_documents: row.supporting_documents,
        status: row.status,
        reviewed_by: row.reviewed_by,
        reviewed_at: row.reviewed_at,
        remarks: row.remarks,
        created_at: row.created_at,
        updated_at: row.updated_at,
        leave_types: {
          id: row.leave_type_id,
          leave_type_name: row.leave_type_name,
        },
        employees: {
          employee_id: row.employee_id,
          full_name: row.full_name,
          unique_employee_id: row.unique_employee_id,
          department: row.department,
        },
      }))

      return NextResponse.json({
        currentUser: employee,
        leaveTypes,
        leaveCredits: normalizedCredits,
        leaveRequests: normalizedRequests,
      })
    }

    if (employeeId) {
      const [leaveCredits, leaveRequests] = await Promise.all([
        dbQuery<any>(
          `SELECT lc.*, lt.*
           FROM leave_credits lc
           LEFT JOIN leave_types lt ON lt.id = lc.leave_type_id
           WHERE lc.employee_id = $1`,
          [employeeId]
        ),
        dbQuery<any>(
          `SELECT lr.*, lt.*, e.*
           FROM leave_requests lr
           LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id
           LEFT JOIN employees e ON e.employee_id = lr.employee_id
           WHERE lr.employee_id = $1
           ORDER BY lr.created_at DESC
           ${limit ? `LIMIT ${limit}` : ''}`,
          [employeeId]
        ),
      ])

      const normalizedCredits = leaveCredits.map((row: any) => ({
        id: row.id,
        employee_id: row.employee_id,
        leave_type_id: row.leave_type_id,
        academic_year: row.academic_year,
        total_credits: row.total_credits,
        used_credits: row.used_credits,
        remaining_credits: row.remaining_credits,
        created_at: row.created_at,
        updated_at: row.updated_at,
        leave_types: {
          id: row.leave_type_id,
          leave_type_name: row.leave_type_name,
          description: row.description,
          default_credits: row.default_credits,
          requires_documentation: row.requires_documentation,
          is_active: row.is_active,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
      }))

      const normalizedRequests = leaveRequests.map((row: any) => ({
        id: row.id,
        employee_id: row.employee_id,
        leave_type_id: row.leave_type_id,
        date_from: row.date_from,
        date_to: row.date_to,
        days_requested: row.days_requested,
        reason: row.reason,
        status: row.status,
        reviewed_by: row.reviewed_by,
        reviewed_at: row.reviewed_at,
        remarks: row.remarks,
        created_at: row.created_at,
        updated_at: row.updated_at,
        employees: {
          employee_id: row.employee_id,
          full_name: row.full_name,
          unique_employee_id: row.unique_employee_id,
          department: row.department,
        },
        leave_types: {
          id: row.leave_type_id,
          leave_type_name: row.leave_type_name,
        },
      }))

      return NextResponse.json({
        leaveCredits: normalizedCredits,
        leaveRequests: normalizedRequests,
      })
    }

    const params: unknown[] = []
    let whereClause = ''
    if (status !== 'all') {
      params.push(status)
      whereClause = `WHERE lr.status = $${params.length}`
    }

    const leaveRequests = await dbQuery<any>(
      `SELECT lr.*, lt.*, e.*
       FROM leave_requests lr
       LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id
       LEFT JOIN employees e ON e.employee_id = lr.employee_id
       ${whereClause}
       ORDER BY lr.created_at DESC`,
      params
    )

    const normalized = leaveRequests.map((row: any) => ({
      id: row.id,
      employee_id: row.employee_id,
      leave_type_id: row.leave_type_id,
      date_from: row.date_from,
      date_to: row.date_to,
      days_requested: row.days_requested,
      reason: row.reason,
      status: row.status,
      reviewed_by: row.reviewed_by,
      reviewed_at: row.reviewed_at,
      remarks: row.remarks,
      created_at: row.created_at,
      updated_at: row.updated_at,
      employees: {
        employee_id: row.employee_id,
        full_name: row.full_name,
        unique_employee_id: row.unique_employee_id,
        department: row.department,
      },
      leave_types: {
        id: row.leave_type_id,
        leave_type_name: row.leave_type_name,
      },
    }))

    return NextResponse.json({ leaveRequests: normalized })
  } catch (error: any) {
    console.error('[leave-requests GET] Error:', error)
    return NextResponse.json({ error: 'Failed to load leave requests' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await validateSession(req)
    if (!session.valid || !session.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const employee = await getEmployeeBySessionEmail(session.user.email)
    if (!employee) {
      return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 })
    }

    const body = await req.json()
    const leaveTypeId = Number(body.leave_type_id)
    const dateFrom = String(body.date_from || '')
    const dateTo = String(body.date_to || '')
    const reason = String(body.reason || '').trim()
    const daysRequested = Number(body.days_requested)

    if (!leaveTypeId || !dateFrom || !dateTo || !reason || !daysRequested) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Re-read from employees table using employee_id to guarantee we validate against latest DB value.
    const employeeFreshRows = await dbQuery<{ employee_id: number; hire_date: string | null; staff_type: string | null }>(
      `SELECT employee_id, hire_date::text AS hire_date, staff_type
       FROM employees
       WHERE employee_id = $1
       LIMIT 1`,
      [employee.employee_id]
    )
    const employeeFresh = employeeFreshRows[0]
    if (!employeeFresh) {
      return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 })
    }

    // Employee must be hired for at least 1 year before filing leave requests.
    if (!employeeFresh.hire_date) {
      return NextResponse.json({ error: 'Employee hire date is required before leave requests can be filed.' }, { status: 400 })
    }

    const hireDateRaw = String(employeeFresh.hire_date || '').trim()
    const hireDatePart = hireDateRaw.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hireDatePart)) {
      return NextResponse.json(
        { error: 'Employee hire date is invalid. Please contact administrator.' },
        { status: 400 }
      )
    }

    const hireDate = new Date(`${hireDatePart}T00:00:00+08:00`)
    const today = new Date(`${getManilaToday()}T00:00:00+08:00`)

    const oneYearFromHire = new Date(hireDate)
    oneYearFromHire.setFullYear(oneYearFromHire.getFullYear() + 1)

    if (today < oneYearFromHire) {
      const daysRemaining = Math.ceil((oneYearFromHire.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      return NextResponse.json(
        {
          error: `Employee must be employed for at least 1 year before filing leave requests. Hire date: ${hireDatePart}. ${daysRemaining} day(s) remaining.`,
        },
        { status: 400 }
      )
    }

    // Additional DB-level guard so hire-date parsing or stale objects cannot bypass tenure policy.
    const tenureGuardRows = await dbQuery<{ allowed: boolean }>(
      `SELECT (CURRENT_DATE >= ((hire_date::date) + INTERVAL '1 year')::date) AS allowed
       FROM employees
       WHERE employee_id = $1
       LIMIT 1`,
      [employeeFresh.employee_id]
    )
    if (!tenureGuardRows[0]?.allowed) {
      return NextResponse.json(
        { error: `Employee must be employed for at least 1 year before filing leave requests. Hire date: ${hireDatePart}.` },
        { status: 400 }
      )
    }

    const year = new Date(dateFrom).getFullYear()
    const yearStart = `${year}-01-01`
    const nextYearStart = `${year + 1}-01-01`
    const maxLeaves = await getLeaveLimitForStaffType(employeeFresh.staff_type)

    const leaveCountRows = await dbQuery<{ leave_count: number }>(
      `SELECT (
          SELECT COUNT(*)::int
          FROM leave_requests
          WHERE employee_id = $1
            AND status IN ('pending', 'approved')
            AND date_from >= $2::date
            AND date_from < $3::date
        ) + (
          SELECT COUNT(*)::int
          FROM verification_requests
          WHERE employee_id = $1
            AND request_type = 'leave'
            AND status IN ('pending', 'approved')
            AND requested_time >= $2::date
            AND requested_time < $3::date
        ) AS leave_count`,
      [employeeFresh.employee_id, yearStart, nextYearStart]
    )

    const leaveCount = leaveCountRows[0]?.leave_count || 0
    if (leaveCount >= maxLeaves) {
      return NextResponse.json(
        { error: `Employee has reached their leave token limit (${maxLeaves} per year). Tokens reset next year.` },
        { status: 400 }
      )
    }

    const rows = await dbQuery<any>(
      `INSERT INTO leave_requests (
         employee_id,
         leave_type_id,
         date_from,
         date_to,
         reason,
         status,
         days_requested
       ) VALUES (
         $1, $2, $3::date, $4::date, $5, 'pending', $6
       )
       RETURNING *`,
      [employeeFresh.employee_id, leaveTypeId, dateFrom, dateTo, reason, daysRequested]
    )

    return NextResponse.json({ item: rows[0] })
  } catch (error: any) {
    console.error('[leave-requests POST] Error:', error)
    return NextResponse.json({ error: 'Failed to create leave request' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const client = await pool.connect()
  try {
    const session = await validateSession(req)
    if (!session.valid || !session.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await req.json()
    const requestId = Number(body.requestId)
    const action = String(body.action || '')
    const remarks = body.remarks ? String(body.remarks) : null

    if (!requestId || !['approve', 'deny'].includes(action)) {
      return NextResponse.json({ error: 'Invalid requestId/action' }, { status: 400 })
    }

    await client.query('BEGIN')

    const requestRes = await client.query(
      `SELECT * FROM leave_requests WHERE id = $1 FOR UPDATE`,
      [requestId]
    )
    const leaveRequest = requestRes.rows[0]

    if (!leaveRequest) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Leave request not found' }, { status: 404 })
    }

    if (leaveRequest.status !== 'pending') {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Leave request is no longer pending' }, { status: 400 })
    }

    const newStatus = action === 'approve' ? 'approved' : 'denied'

    const updatedRes = await client.query(
      `UPDATE leave_requests
       SET status = $1,
           reviewed_by = $2,
           reviewed_at = NOW(),
           remarks = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [newStatus, session.user.id, remarks, requestId]
    )

    if (action === 'approve') {
      const creditRes = await client.query(
        `SELECT id, used_credits, remaining_credits
         FROM leave_credits
         WHERE employee_id = $1
           AND leave_type_id = $2
         ORDER BY updated_at DESC
         LIMIT 1
         FOR UPDATE`,
        [leaveRequest.employee_id, leaveRequest.leave_type_id]
      )

      const credit = creditRes.rows[0]
      if (credit) {
        await client.query(
          `UPDATE leave_credits
           SET used_credits = COALESCE(used_credits, 0) + $1,
               remaining_credits = GREATEST(0, COALESCE(remaining_credits, 0) - $1),
               updated_at = NOW()
           WHERE id = $2`,
          [leaveRequest.days_requested, credit.id]
        )
      }
    }

    await client.query('COMMIT')
    return NextResponse.json({ item: updatedRes.rows[0] })
  } catch (error: any) {
    await client.query('ROLLBACK')
    console.error('[leave-requests PATCH] Error:', error)
    return NextResponse.json({ error: 'Failed to review leave request' }, { status: 500 })
  } finally {
    client.release()
  }
}
