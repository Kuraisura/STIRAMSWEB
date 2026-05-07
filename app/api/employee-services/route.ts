import { NextRequest, NextResponse } from "next/server"
import { dbQuery } from "@/lib/db"
import { recordLogTrailChange } from "@/lib/audit"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const employeeId = searchParams.get("employee_id")

    if (!employeeId) {
      return NextResponse.json({ error: "Employee ID is required" }, { status: 400 })
    }

    const data = await dbQuery(
      `SELECT *
       FROM employee_services
       WHERE employee_id = $1
       ORDER BY service_date DESC`,
      [parseInt(employeeId)]
    )

    return NextResponse.json(data)
  } catch (error: any) {
    console.error("Error in GET /api/employee-services:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { employee_id, service_name, service_description, service_date, hours_worked, client_or_department, status, notes } = body

    if (!employee_id || !service_name || !service_date) {
      return NextResponse.json({ error: "Employee ID, service name, and service date are required" }, { status: 400 })
    }

    const rows = await dbQuery(
      `INSERT INTO employee_services (
        employee_id,
        service_name,
        service_description,
        service_date,
        hours_worked,
        client_or_department,
        status,
        notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *`,
      [
        employee_id,
        service_name,
        service_description || null,
        service_date,
        hours_worked || null,
        client_or_department || null,
        status || 'completed',
        notes || null,
      ]
    )
    const data = rows[0]

    // Audit: create
    await recordLogTrailChange({
      actor: getActorFromHeaders(request),
      action: 'create:employee_services',
      table: 'employee_services',
      recordId: data?.service_id,
      newValue: data
    })

    return NextResponse.json(data)
  } catch (error: any) {
    console.error("Error in POST /api/employee-services:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { service_id, ...updates } = body

    if (!service_id) {
      return NextResponse.json({ error: "Service ID is required" }, { status: 400 })
    }

    // Fetch old row for diff
    const prevRows = await dbQuery(
      `SELECT * FROM employee_services WHERE service_id = $1 LIMIT 1`,
      [service_id]
    )
    const prev = prevRows[0] || null

    const dataRows = await dbQuery(
      `UPDATE employee_services
       SET service_name = COALESCE($1, service_name),
           service_description = COALESCE($2, service_description),
           service_date = COALESCE($3, service_date),
           hours_worked = COALESCE($4, hours_worked),
           client_or_department = COALESCE($5, client_or_department),
           status = COALESCE($6, status),
           notes = COALESCE($7, notes),
           updated_at = NOW()
       WHERE service_id = $8
       RETURNING *`,
      [
        updates.service_name ?? null,
        updates.service_description ?? null,
        updates.service_date ?? null,
        updates.hours_worked ?? null,
        updates.client_or_department ?? null,
        updates.status ?? null,
        updates.notes ?? null,
        service_id,
      ]
    )
    const data = dataRows[0]

    if (!data) {
      return NextResponse.json({ error: 'Employee service not found' }, { status: 404 })
    }

    // Audit: update with diff
    await recordLogTrailChange({
      actor: getActorFromHeaders(request),
      action: 'update:employee_services',
      table: 'employee_services',
      recordId: service_id,
      oldValue: prev,
      newValue: data
    })

    return NextResponse.json(data)
  } catch (error: any) {
    console.error("Error in PUT /api/employee-services:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const serviceId = searchParams.get("service_id")

    if (!serviceId) {
      return NextResponse.json({ error: "Service ID is required" }, { status: 400 })
    }

    // Fetch old row
    const parsedServiceId = parseInt(serviceId)
    const prevRows = await dbQuery(
      `SELECT * FROM employee_services WHERE service_id = $1 LIMIT 1`,
      [parsedServiceId]
    )
    const prev = prevRows[0] || null

    const deletedRows = await dbQuery(
      `DELETE FROM employee_services WHERE service_id = $1 RETURNING service_id`,
      [parsedServiceId]
    )

    if (!deletedRows[0]) {
      return NextResponse.json({ error: 'Employee service not found' }, { status: 404 })
    }

    await recordLogTrailChange({
      actor: getActorFromHeaders(request),
      action: 'delete:employee_services',
      table: 'employee_services',
      recordId: parsedServiceId,
      oldValue: prev
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/employee-services:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}

function getActorFromHeaders(req: NextRequest) {
  const id = Number(req.headers.get('x-user-id') || '') || 0
  const email = req.headers.get('x-user-email') || 'system@rams'
  const name = req.headers.get('x-user-name') || 'System'
  return { user_id: id, user_email: email, user_name: name }
}

