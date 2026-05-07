import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'
import { requireRecoveryConsoleSession } from '@/lib/route-role-guard'

export const dynamic = 'force-dynamic'

type TableTestResult = {
  table: string
  connected: boolean
  rowCount: number | null
  sampleColumns: string[]
  sampleRows: any[]
  error: string | null
  queryTimeMs: number
  schemaColumns: { column_name: string; data_type: string }[]
  requiredColumns: string[]
  missingRequiredColumns: string[]
  isSchemaComplete: boolean
}

// Table list used in recovery diagnostics.
const ALLOWED_TABLES: Record<string, { label: string }> = {
  employees: { label: 'Employees' },
  teaching_schedules: { label: 'Teaching Schedules' },
  exam_schedules: { label: 'Exam Schedules' },
  attendance_logs: { label: 'Attendance Logs' },
  verification_requests: { label: 'Verification Requests' },
  holiday_calendar: { label: 'Holiday Calendar' },
  departments: { label: 'Departments' },
  admin_users: { label: 'Admin Users' },
  academic_terms: { label: 'Academic Terms' },
  courses: { label: 'Courses' },
  rooms: { label: 'Rooms' },
}

// Tables that support term + employee_id filtering
const SCHEDULE_TABLES = new Set(['teaching_schedules', 'exam_schedules'])

const REQUIRED_TABLE_COLUMNS: Record<string, string[]> = {
  employees: ['employee_id', 'full_name', 'school_id', 'staff_type', 'employment_status', 'is_active'],
  teaching_schedules: ['schedule_id', 'employee_id', 'day_of_week', 'time_start', 'time_end', 'term'],
  exam_schedules: ['exam_schedule_id', 'employee_id', 'day_of_week', 'time_start', 'time_end', 'term', 'exam_date'],
  attendance_logs: ['log_id', 'employee_id', 'date', 'log_time', 'attendance_status', 'term_id'],
  verification_requests: ['request_id', 'employee_id', 'request_type', 'requested_time', 'status', 'term_id'],
  holiday_calendar: ['id', 'holiday_date'],
  departments: ['department_id', 'name'],
  admin_users: ['id', 'email', 'role'],
  academic_terms: ['id', 'academic_year', 'term_name', 'start_date', 'end_date', 'is_active'],
  courses: ['course_id', 'code'],
  rooms: ['room_id', 'code'],
}

export async function GET(req: NextRequest) {
  const recoveryAccess = await requireRecoveryConsoleSession(req)
  if (!recoveryAccess.ok) {
    return NextResponse.json({ error: 'Recovery console access required' }, { status: 403 })
  }

  const tableParam = req.nextUrl.searchParams.get('table')
  const rawTermParam = req.nextUrl.searchParams.get('term')
  const termParam = rawTermParam && rawTermParam !== 'all_terms' ? rawTermParam : null
  const employeeIdParam = req.nextUrl.searchParams.get('employee_id')

  // If a specific table is requested, test just that one
  const tablesToTest = tableParam && ALLOWED_TABLES[tableParam]
    ? { [tableParam]: ALLOWED_TABLES[tableParam] }
    : ALLOWED_TABLES

  const results: TableTestResult[] = []

  for (const [tableName, config] of Object.entries(tablesToTest)) {
    const start = Date.now()
    try {
      // Step 1: Discover actual columns from information_schema (never hardcode)
      const schemaColumns = await dbQuery<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position ASC`,
        [tableName]
      )

      if (schemaColumns.length === 0) {
        // Table doesn't exist in the schema
        results.push({
          table: tableName,
          connected: false,
          rowCount: null,
          sampleColumns: [],
          sampleRows: [],
          error: `Table "${tableName}" does not exist in the public schema.`,
          queryTimeMs: Date.now() - start,
          schemaColumns: [],
          requiredColumns: REQUIRED_TABLE_COLUMNS[tableName] || [],
          missingRequiredColumns: REQUIRED_TABLE_COLUMNS[tableName] || [],
          isSchemaComplete: false,
        })
        continue
      }

      // Step 2: Build the query dynamically
      const columnNames = schemaColumns.map(c => c.column_name)
      const hasColumn = (name: string) => columnNames.includes(name)

      // Build WHERE clause for schedule tables if filters are provided
      const conditions: string[] = []
      const params: any[] = []

      if (SCHEDULE_TABLES.has(tableName) && (termParam || employeeIdParam)) {
        if (termParam && hasColumn('term')) {
          params.push(termParam)
          conditions.push(`term = $${params.length}`)
        }
        if (employeeIdParam && Number.isFinite(Number(employeeIdParam)) && hasColumn('employee_id')) {
          params.push(Number(employeeIdParam))
          conditions.push(`employee_id = $${params.length}`)
        }
      }

      const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''

      // Determine ORDER BY column (use the first column as a safe default)
      const firstCol = columnNames[0]
      // For certain tables, prefer descending order on the primary key to show newest first
      const descendingTables = new Set(['attendance_logs', 'verification_requests'])
      const orderDir = descendingTables.has(tableName) ? 'DESC' : 'ASC'

      const sampleLimit = SCHEDULE_TABLES.has(tableName) && (termParam || employeeIdParam) ? 25 : 10

      // Step 3: Run count and sample queries
      const countQuery = `SELECT COUNT(*)::int AS count FROM "${tableName}"${whereClause}`
      const sampleQuery = `SELECT * FROM "${tableName}"${whereClause} ORDER BY "${firstCol}" ${orderDir} LIMIT ${sampleLimit}`

      const [countResult, sampleRows] = await Promise.all([
        dbQuery<{ count: number }>(countQuery, params),
        dbQuery<any>(sampleQuery, params),
      ])

      const rowCount = countResult?.[0]?.count ?? null

      // Extract columns from actual result rows (most accurate)
      const resultColumns = sampleRows.length > 0 ? Object.keys(sampleRows[0]) : columnNames
      const requiredColumns = REQUIRED_TABLE_COLUMNS[tableName] || []
      const lowerSchemaColumns = new Set(columnNames.map((name) => name.toLowerCase()))
      const missingRequiredColumns = requiredColumns.filter(
        (columnName) => !lowerSchemaColumns.has(columnName.toLowerCase())
      )

      // Serialize any non-primitive values (dates, buffers, etc.) to strings for JSON safety
      const safeSampleRows = sampleRows.map(row => {
        const safeRow: Record<string, any> = {}
        for (const key of resultColumns) {
          const val = row[key]
          if (val === null || val === undefined) {
            safeRow[key] = null
          } else if (val instanceof Date) {
            safeRow[key] = val.toISOString()
          } else if (Buffer.isBuffer(val)) {
            safeRow[key] = `<binary ${val.length} bytes>`
          } else if (typeof val === 'object') {
            safeRow[key] = JSON.stringify(val)
          } else {
            safeRow[key] = val
          }
        }
        return safeRow
      })

      results.push({
        table: tableName,
        connected: true,
        rowCount,
        sampleColumns: resultColumns,
        sampleRows: safeSampleRows,
        error: null,
        queryTimeMs: Date.now() - start,
        schemaColumns,
        requiredColumns,
        missingRequiredColumns,
        isSchemaComplete: missingRequiredColumns.length === 0,
      })
    } catch (err: any) {
      results.push({
        table: tableName,
        connected: false,
        rowCount: null,
        sampleColumns: [],
        sampleRows: [],
        error: err?.message || 'Unknown error',
        queryTimeMs: Date.now() - start,
        schemaColumns: [],
        requiredColumns: REQUIRED_TABLE_COLUMNS[tableName] || [],
        missingRequiredColumns: REQUIRED_TABLE_COLUMNS[tableName] || [],
        isSchemaComplete: false,
      })
    }
  }

  const incompleteTables = results
    .filter((row) => !row.isSchemaComplete)
    .map((row) => ({ table: row.table, missing_required_columns: row.missingRequiredColumns }))

  return NextResponse.json({
    testedAt: new Date().toISOString(),
    summary: {
      totalTablesTested: results.length,
      incompleteTableCount: incompleteTables.length,
      incompleteTables,
    },
    results,
  })
}
