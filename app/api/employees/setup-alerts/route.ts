import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

export const dynamic = 'force-dynamic'

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

export async function GET() {
  try {
    await ensureStandbyColumn()

    const rows = await dbQuery<{ pending_count: number }>(
      `SELECT COUNT(*)::int AS pending_count
         FROM employees e
        WHERE (e.is_active IS NULL OR e.is_active = TRUE)
          AND e.staff_type = 'Teaching'
          AND COALESCE(e.is_standby, FALSE) = FALSE
          AND COALESCE(e.start_date, e.hire_date) IS NOT NULL
          AND COALESCE(e.start_date, e.hire_date) <= CURRENT_DATE
          AND NOT EXISTS (
            SELECT 1
              FROM teaching_schedules ts
             WHERE ts.employee_id = e.employee_id
               AND ts.status = 'available'
          )
          AND NOT EXISTS (
            SELECT 1
              FROM exam_schedules es
             WHERE es.employee_id = e.employee_id
               AND es.status = 'available'
          )
          AND NOT EXISTS (
            SELECT 1
              FROM verification_requests vr
             WHERE vr.employee_id = e.employee_id
               AND vr.status = 'pending'
               AND (
                 vr.request_type = 'under_review'
                 OR vr.reason LIKE '[UNDER_REVIEW][STANDBY]%'
               )
          )`
    )

    return NextResponse.json({
      success: true,
      pending_count: rows?.[0]?.pending_count || 0,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to load setup alerts', pending_count: 0 },
      { status: 500 }
    )
  }
}
