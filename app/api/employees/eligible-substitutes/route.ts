import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * API endpoint to get eligible substitute employees
 * Returns teaching staff with Part Time or Part Time Full Load employment status
 */
export async function GET() {
  try {
    const employees = await dbQuery(
      `SELECT employee_id, full_name, school_id, department, employment_status, staff_type
       FROM employees 
       WHERE is_active = TRUE 
       AND staff_type = $1 
       AND employment_status IN ($2, $3)
       ORDER BY full_name ASC`,
      ['Teaching', 'Part Time', 'Part Time Full Load']
    )

    return NextResponse.json(employees)
  } catch (error: any) {
    console.error('[api/employees/eligible-substitutes] Error:', error?.message || error)
    return NextResponse.json(
      { error: 'Failed to fetch eligible substitute employees' },
      { status: 500 }
    )
  }
}
