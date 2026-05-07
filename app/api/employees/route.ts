import { NextRequest, NextResponse } from "next/server"
import { dbQuery } from "@/lib/db"
import { getAuditContext, recordLogTrailChange } from '@/lib/audit'
import { validateSession } from '@/lib/session-manager'
import { logRealtimeActivity } from '@/lib/realtime-monitor'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

const NEW_ID_REGEX = /^[TN]\d{3,5}$/
const LEGACY_ID_REGEX = /^07\d{9}$/
const MAX_FULL_NAME_LENGTH = 40
const MAX_EMAIL_LENGTH = 40

function normalizeEmployeeId(value: unknown): string {
  const normalized = String(value || '').trim().toUpperCase()
  if (!NEW_ID_REGEX.test(normalized) && !LEGACY_ID_REGEX.test(normalized)) {
    throw new Error('Employee ID must be T###/N### (3-5 digits) or legacy 07######### format')
  }
  return normalized
}

function normalizeDate(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  const raw = String(value).trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().split('T')[0]
}

function normalizeCompactWhitespace(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function normalizeDigits(value: unknown): string {
  return String(value || '').replace(/\D+/g, '')
}

async function findActiveDuplicateEmployee(params: {
  employeeId?: number
  schoolId?: string
  fullName?: string
  rfidCode?: string
  email?: string
  phone?: string
}): Promise<{ field: 'school_id' | 'full_name' | 'rfid_code' | 'email' | 'phone'; employee: any } | null> {
  const filters: Array<{ field: 'school_id' | 'full_name' | 'rfid_code' | 'email' | 'phone'; sql: string; value: string }> = []

  if (params.schoolId) {
    filters.push({ field: 'school_id', sql: 'UPPER(TRIM(school_id)) = UPPER(TRIM($1))', value: params.schoolId })
  }
  if (params.fullName) {
    filters.push({ field: 'full_name', sql: 'LOWER(TRIM(full_name)) = LOWER(TRIM($1))', value: params.fullName })
  }
  if (params.rfidCode) {
    filters.push({ field: 'rfid_code', sql: "REGEXP_REPLACE(COALESCE(rfid_code, ''), '\\D', '', 'g') = REGEXP_REPLACE($1, '\\D', '', 'g')", value: params.rfidCode })
  }
  if (params.email) {
    filters.push({ field: 'email', sql: 'LOWER(TRIM(email)) = LOWER(TRIM($1))', value: params.email })
  }
  if (params.phone) {
    filters.push({ field: 'phone', sql: "REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g') = REGEXP_REPLACE($1, '\\D', '', 'g')", value: params.phone })
  }

  for (const filter of filters) {
    const where: string[] = [
      '(is_active IS NULL OR is_active = TRUE)',
      filter.sql,
    ]
    const queryParams: unknown[] = [filter.value]

    if (Number.isFinite(params.employeeId) && (params.employeeId as number) > 0) {
      queryParams.push(params.employeeId as number)
      where.push(`employee_id <> $${queryParams.length}`)
    }

    const rows = await dbQuery<any>(
      `SELECT employee_id, full_name, school_id, rfid_code, email, phone
         FROM employees
        WHERE ${where.join(' AND ')}
        LIMIT 1`,
      queryParams
    )

    if (rows[0]) {
      return { field: filter.field, employee: rows[0] }
    }
  }

  return null
}

function normalizePhotoPath(value: unknown, employeeId?: number): string | null {
  if (value === undefined || value === null || value === '') return null

  const raw = String(value).trim()
  if (!raw) return null

  // Base64 data URLs must be uploaded through /api/upload/photo first.
  if (raw.startsWith('data:image')) return null

  // Never persist external URLs in local/offline mode.
  if (/^https?:\/\//i.test(raw)) {
    if (Number.isFinite(employeeId) && (employeeId as number) > 0) {
      return `/api/photos/employee/${employeeId}`
    }
    return null
  }

  if (raw.startsWith('/api/photos/employee/')) return raw
  if (raw.startsWith('/')) return raw
  return `/${raw.replace(/^\/+/, '')}`
}

async function ensureStandbyColumn() {
  await dbQuery(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_name = 'employees'
           AND column_name = 'is_standby'
      ) THEN
        ALTER TABLE employees ADD COLUMN is_standby BOOLEAN DEFAULT FALSE;
      END IF;
    END $$;
  `)
}

async function ensureScheduleColumnsNullable() {
  // Teaching staff schedule is derived from class/exam schedules; these admin-time columns must allow NULL.
  await dbQuery(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_name = 'employees'
           AND column_name = 'schedule_time_in'
           AND is_nullable = 'NO'
      ) THEN
        ALTER TABLE employees ALTER COLUMN schedule_time_in DROP NOT NULL;
      END IF;

      IF EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_name = 'employees'
           AND column_name = 'schedule_time_out'
           AND is_nullable = 'NO'
      ) THEN
        ALTER TABLE employees ALTER COLUMN schedule_time_out DROP NOT NULL;
      END IF;
    END $$;
  `)
}

export async function GET(req: NextRequest) {
  try {
    await ensureStandbyColumn()
    const { searchParams } = new URL(req.url)
    const includeInactive = searchParams.get('includeInactive') === 'true'
    const includeNotStarted = searchParams.get('includeNotStarted') === 'true'
    const onlyArchived = searchParams.get('onlyArchived') === 'true'
    const staffTypeFilter = searchParams.get('staffTypeFilter')
    const employeeIdParam = Number(searchParams.get('employeeId') || 0)
    const employeeIdFilter = Number.isFinite(employeeIdParam) && employeeIdParam > 0 ? employeeIdParam : null

    const params: unknown[] = []
    // IMPORTANT: return hire_date/start_date as YYYY-MM-DD strings (date-cast) to prevent timezone day-shift in UI.
    let sql = 'SELECT employees.*, hire_date::date::text AS hire_date, start_date::date::text AS start_date FROM employees WHERE 1=1'

    if (onlyArchived) {
      sql += ' AND is_active = FALSE'
    } else if (!includeInactive) {
      sql += ' AND (is_active IS NULL OR is_active = TRUE)'
    }

    if (staffTypeFilter === 'Teaching' || staffTypeFilter === 'Non-Teaching') {
      params.push(staffTypeFilter)
      sql += ` AND staff_type = $${params.length}`
    }

    if (employeeIdFilter) {
      params.push(employeeIdFilter)
      sql += ` AND employee_id = $${params.length}`
    }

    if (!includeNotStarted) {
      sql += ' AND (start_date IS NULL OR start_date <= CURRENT_DATE)'
    }

    sql += ' ORDER BY full_name ASC'

    const employees = await dbQuery(sql, params)
    return NextResponse.json(employees)
  } catch (error) {
    console.error("Error fetching employees:", error)
    return NextResponse.json(
      { error: "Local PostgreSQL connection failed while loading employees. Check DB configuration for localhost:5432." },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const session = await validateSession(req)
  const context = getAuditContext(req)
  const actor = session.valid && session.user ? {
    user_id: session.user.id,
    user_email: session.user.email,
    user_name: session.user.name,
    user_type: 'admin' as const,
  } : undefined

  try {
    await ensureStandbyColumn()
    await ensureScheduleColumnsNullable()
    const body = await req.json()
    const schoolId = normalizeEmployeeId(body?.school_id)
    const hireDate = normalizeDate(body?.hire_date)
    const startDate = normalizeDate(body?.start_date)
    const normalizedFullName = normalizeCompactWhitespace(body?.full_name)
    const normalizedRfidCode = normalizeDigits(body?.rfid_code).slice(0, 10)
    const normalizedEmail = String(body?.email || '').trim().toLowerCase()
    const normalizedPhone = normalizeDigits(body?.phone).slice(0, 11)

    if (!normalizedFullName || !normalizedRfidCode || !body?.department || !normalizedEmail || !normalizedPhone || !body?.staff_type) {
      return NextResponse.json(
        { error: 'Missing required fields: full_name, rfid_code, department, email, phone, staff_type' },
        { status: 400 }
      )
    }

    if (normalizedFullName.length > MAX_FULL_NAME_LENGTH) {
      return NextResponse.json({ error: `Full Name must not exceed ${MAX_FULL_NAME_LENGTH} characters` }, { status: 400 })
    }
    if (normalizedEmail.length > MAX_EMAIL_LENGTH) {
      return NextResponse.json({ error: `Email must not exceed ${MAX_EMAIL_LENGTH} characters` }, { status: 400 })
    }

    const duplicate = await findActiveDuplicateEmployee({
      schoolId,
      fullName: normalizedFullName,
      rfidCode: normalizedRfidCode,
      email: normalizedEmail,
      phone: normalizedPhone,
    })
    if (duplicate) {
      const labels: Record<string, string> = {
        school_id: 'Employee ID',
        full_name: 'Full Name',
        rfid_code: 'RFID Code',
        email: 'Email',
        phone: 'Phone Number',
      }
      return NextResponse.json(
        {
          error: `${labels[duplicate.field]} is already in use by ${duplicate.employee.full_name}`,
          field: duplicate.field,
        },
        { status: 409 }
      )
    }

    const normalizedPhotoPath = normalizePhotoPath(body.photo_path)
    const creatorEmail = String(actor?.user_email || '').trim().toLowerCase()
    const forceNonTeaching = creatorEmail === 'evelyn.barron@santarosa.sti.edu'
    const requestedStaffType = String(body?.staff_type || '').trim()
    const staffType = forceNonTeaching ? 'Non-Teaching' : requestedStaffType
    const isTeaching = staffType.toLowerCase() === 'teaching'
    const employeeRole = isTeaching ? 'teaching' : 'non_teaching'
    const employeeType = isTeaching ? 'teaching' : 'non-teaching'

    const inserted = await dbQuery(
      `INSERT INTO employees (
        rfid_code, full_name, school_id, department, email, phone,
        password, schedule_time_in, schedule_time_out,
        employment_status, employment_type,
        hire_date, start_date,
        photo_path, staff_type, is_active, is_reporting_staff, is_standby,
        role, employee_type, unique_employee_id,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11,
        $12::date, $13::date,
        $14, $15, $16, $17, $18,
        $19, $20, $21,
        NOW(), NOW()
      )
      RETURNING *`,
      [
        normalizedRfidCode,
        normalizedFullName,
        schoolId,
        String(body.department).trim(),
        normalizedEmail,
        normalizedPhone,
        body.password || 'admin123',
        // Teaching staff schedule is derived from class/exam schedules (no fixed admin-time window).
        isTeaching ? null : (String(body.schedule_time_in || '').trim() || null),
        isTeaching ? null : (String(body.schedule_time_out || '').trim() || null),
        body.employment_status || null,
        body.employment_type || null,
        hireDate,
        startDate,
        normalizedPhotoPath,
        staffType,
        body.is_active ?? true,
        body.is_reporting_staff ?? false,
        body.is_standby ?? false,
        employeeRole,
        employeeType,
        null,
      ]
    )

    let createdEmployee = inserted[0]

    if (createdEmployee) {
      const uniqueEmployeeId = isTeaching
        ? `T${createdEmployee.employee_id}`
        : `N${createdEmployee.employee_id}`

      const updatedRows = await dbQuery(
        `UPDATE employees
         SET unique_employee_id = $1
         WHERE employee_id = $2
         RETURNING *`,
        [uniqueEmployeeId, createdEmployee.employee_id]
      )

      createdEmployee = updatedRows[0] || createdEmployee
    }

    if (actor && createdEmployee) {
      await recordLogTrailChange({
        actor,
        action: 'create:employees',
        table: 'employees',
        recordId: createdEmployee.employee_id,
        newValue: createdEmployee,
        context,
        extra: {
          session_id: session.sessionId,
          source: 'api/employees:POST',
        },
      })
    }

    logRealtimeActivity({
      request: req,
      action: 'employee:create',
      status: 200,
      sessionId: session.sessionId,
      userId: actor?.user_id,
      userEmail: actor?.user_email,
      details: {
        employee_id: createdEmployee?.employee_id,
        employee_name: createdEmployee?.full_name,
      },
    })

    return NextResponse.json(createdEmployee)
  } catch (error: any) {
    console.error('[POST /api/employees] Error:', error)
    const message = String(error?.message || '')
    const lower = message.toLowerCase()

    if (lower.includes('employees_rfid_code_key')) {
      return NextResponse.json({ error: 'RFID Code is already in use by another employee' }, { status: 409 })
    }
    if (lower.includes('employees_school_id_key')) {
      return NextResponse.json({ error: 'Employee ID is already in use by another employee' }, { status: 409 })
    }
    if (lower.includes('employees_email_key')) {
      return NextResponse.json({ error: 'Email is already in use by another employee' }, { status: 409 })
    }

    logRealtimeActivity({
      request: req,
      action: 'employee:create_failed',
      status: 500,
      sessionId: session.sessionId,
      userId: actor?.user_id,
      userEmail: actor?.user_email,
      details: { error: error?.message || 'Failed to create employee' },
    })

    return NextResponse.json(
      { error: error?.message || 'Failed to create employee' },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  const session = await validateSession(req)
  const context = getAuditContext(req)
  const actor = session.valid && session.user ? {
    user_id: session.user.id,
    user_email: session.user.email,
    user_name: session.user.name,
    user_type: 'admin' as const,
  } : undefined

  try {
    await ensureStandbyColumn()
    await ensureScheduleColumnsNullable()
    const body = await req.json()
    const employeeId = Number(body?.employee_id)

    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return NextResponse.json({ error: 'Valid employee_id is required' }, { status: 400 })
    }

    const previousRows = await dbQuery(
      `SELECT * FROM employees WHERE employee_id = $1 LIMIT 1`,
      [employeeId]
    )
    const previousEmployee = previousRows[0]

    const allowedFields = new Set([
      'rfid_code',
      'full_name',
      'school_id',
      'department',
      'email',
      'phone',
      'password',
      'schedule_time_in',
      'schedule_time_out',
      'employment_status',
      'employment_type',
      'hire_date',
      'start_date',
      'photo_path',
      'staff_type',
      'is_active',
      'is_reporting_staff',
      'is_standby',
    ])

    const updates: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(body || {})) {
      if (allowedFields.has(key) && value !== undefined) {
        updates[key] = value
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No update fields provided' }, { status: 400 })
    }

    if (updates.school_id !== undefined && updates.school_id !== null && String(updates.school_id).trim() !== '') {
      updates.school_id = normalizeEmployeeId(updates.school_id)
    }

    if (updates.full_name !== undefined) {
      updates.full_name = normalizeCompactWhitespace(updates.full_name)
      if (String(updates.full_name).length > MAX_FULL_NAME_LENGTH) {
        return NextResponse.json({ error: `Full Name must not exceed ${MAX_FULL_NAME_LENGTH} characters` }, { status: 400 })
      }
    }

    if (updates.email !== undefined) {
      updates.email = String(updates.email || '').trim().toLowerCase()
      if (String(updates.email).length > MAX_EMAIL_LENGTH) {
        return NextResponse.json({ error: `Email must not exceed ${MAX_EMAIL_LENGTH} characters` }, { status: 400 })
      }
    }

    if (updates.phone !== undefined) {
      updates.phone = normalizeDigits(updates.phone).slice(0, 11)
    }

    if (updates.rfid_code !== undefined) {
      updates.rfid_code = normalizeDigits(updates.rfid_code).slice(0, 10)
    }

    if (updates.hire_date !== undefined) {
      updates.hire_date = normalizeDate(updates.hire_date)
    }

    if (updates.start_date !== undefined) {
      updates.start_date = normalizeDate(updates.start_date)
    }

    if (updates.photo_path !== undefined) {
      updates.photo_path = normalizePhotoPath(updates.photo_path, employeeId)
    }

    const duplicate = await findActiveDuplicateEmployee({
      employeeId,
      schoolId: String((updates.school_id ?? previousEmployee?.school_id) || '').trim(),
      fullName: normalizeCompactWhitespace(updates.full_name ?? previousEmployee?.full_name),
      rfidCode: normalizeDigits(updates.rfid_code ?? previousEmployee?.rfid_code).slice(0, 10),
      email: String((updates.email ?? previousEmployee?.email) || '').trim().toLowerCase(),
      phone: normalizeDigits(updates.phone ?? previousEmployee?.phone).slice(0, 11),
    })
    if (duplicate) {
      const labels: Record<string, string> = {
        school_id: 'Employee ID',
        full_name: 'Full Name',
        rfid_code: 'RFID Code',
        email: 'Email',
        phone: 'Phone Number',
      }
      return NextResponse.json(
        {
          error: `${labels[duplicate.field]} is already in use by ${duplicate.employee.full_name}`,
          field: duplicate.field,
        },
        { status: 409 }
      )
    }

    const setClauses: string[] = []
    const params: unknown[] = []
    for (const [key, value] of Object.entries(updates)) {
      params.push(value)
      const idx = params.length
      if (key === 'hire_date' || key === 'start_date') {
        setClauses.push(`${key} = $${idx}::date`)
      } else {
        setClauses.push(`${key} = $${idx}`)
      }
    }

    params.push(employeeId)
    const idParam = params.length

    const updated = await dbQuery(
      `UPDATE employees
       SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE employee_id = $${idParam}
       RETURNING *`,
      params
    )

    if (!updated[0]) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    const updatedEmployee = updated[0]
    const isArchivingNow = previousEmployee?.is_active !== false && updatedEmployee?.is_active === false

    let autoClosedVerificationCount = 0
    if (isArchivingNow) {
      // Resolve pending verification requests for archived employees so they no longer appear in review queues.
      const autoClosedRows = await dbQuery<{ request_id: number }>(
        `UPDATE verification_requests
         SET status = 'rejected',
             review_notes = COALESCE(NULLIF(review_notes, ''), '') || CASE WHEN COALESCE(review_notes, '') = '' THEN '' ELSE ' | ' END || 'Auto-closed: employee archived',
             reviewed_at = NOW(),
             reviewed_by = COALESCE(reviewed_by, NULL)
         WHERE employee_id = $1
           AND status = 'pending'`,
        [employeeId]
      )
      autoClosedVerificationCount = autoClosedRows.length
    }

    if (actor) {
      const archiveAutoCloseMetadata = isArchivingNow
        ? {
            archive_transition: 'active_to_archived',
            archive_auto_closed_verification_count: autoClosedVerificationCount,
            archive_auto_close_status: autoClosedVerificationCount > 0 ? 'pending_verifications_closed' : 'no_pending_verifications',
            archive_auto_close_note: 'Auto-closed: employee archived',
          }
        : {}

      await recordLogTrailChange({
        actor,
        action: 'update:employees',
        table: 'employees',
        recordId: employeeId,
        oldValue: previousEmployee,
        newValue: updatedEmployee,
        context,
        description: isArchivingNow
          ? `Archived employee (ID: ${employeeId}); auto-closed ${autoClosedVerificationCount} pending verification request(s)`
          : undefined,
        extra: {
          session_id: session.sessionId,
          source: 'api/employees:PUT',
          ...archiveAutoCloseMetadata,
        },
      })
    }

    logRealtimeActivity({
      request: req,
      action: 'employee:update',
      status: 200,
      sessionId: session.sessionId,
      userId: actor?.user_id,
      userEmail: actor?.user_email,
      details: {
        employee_id: employeeId,
        fields_updated: Object.keys(updates),
      },
    })

    return NextResponse.json(updatedEmployee)
  } catch (error: any) {
    console.error('[PUT /api/employees] Error:', error)
    const message = String(error?.message || '')
    const lower = message.toLowerCase()

    if (lower.includes('employees_rfid_code_key')) {
      return NextResponse.json({ error: 'RFID Code is already in use by another employee' }, { status: 409 })
    }
    if (lower.includes('employees_school_id_key')) {
      return NextResponse.json({ error: 'Employee ID is already in use by another employee' }, { status: 409 })
    }
    if (lower.includes('employees_email_key')) {
      return NextResponse.json({ error: 'Email is already in use by another employee' }, { status: 409 })
    }

    logRealtimeActivity({
      request: req,
      action: 'employee:update_failed',
      status: 500,
      sessionId: session.sessionId,
      userId: actor?.user_id,
      userEmail: actor?.user_email,
      details: { error: error?.message || 'Failed to update employee' },
    })

    return NextResponse.json(
      { error: error?.message || 'Failed to update employee' },
      { status: 500 }
    )
  }
}

