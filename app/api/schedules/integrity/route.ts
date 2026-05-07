import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

export const dynamic = 'force-dynamic'

type ScheduleTerm = '1st_term' | '2nd_term' | 'summer'

const ALLOWED_TERMS: ScheduleTerm[] = ['1st_term', '2nd_term', 'summer']

async function safeCount(query: string, params: unknown[]): Promise<number> {
  try {
    const rows = await dbQuery<{ count: number }>(query, params)
    return Number(rows[0]?.count || 0)
  } catch {
    return 0
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const termRaw = (searchParams.get('term') || '').trim()
    const maxRowsRaw = Number(searchParams.get('maxRows') || 20)
    const maxRows = Number.isFinite(maxRowsRaw) && maxRowsRaw > 0 ? Math.min(maxRowsRaw, 200) : 20

    const term = ALLOWED_TERMS.includes(termRaw as ScheduleTerm) ? (termRaw as ScheduleTerm) : null

    const orphanTeachingOwnerCount = await safeCount(
      `SELECT COUNT(*)::int AS count
       FROM teaching_schedules ts
       LEFT JOIN employees e ON e.employee_id = ts.employee_id
       WHERE e.employee_id IS NULL
         AND ($1::text IS NULL OR ts.term = $1)`,
      [term]
    )

    const orphanExamOwnerCount = await safeCount(
      `SELECT COUNT(*)::int AS count
       FROM exam_schedules es
       LEFT JOIN employees e ON e.employee_id = es.employee_id
       WHERE e.employee_id IS NULL
         AND ($1::text IS NULL OR es.term = $1)`,
      [term]
    )

    const nonTeachingTeachingOwnerCount = await safeCount(
      `SELECT COUNT(*)::int AS count
       FROM teaching_schedules ts
       INNER JOIN employees e ON e.employee_id = ts.employee_id
       WHERE COALESCE(e.staff_type, '') <> 'Teaching'
         AND ($1::text IS NULL OR ts.term = $1)`,
      [term]
    )

    const nonTeachingExamOwnerCount = await safeCount(
      `SELECT COUNT(*)::int AS count
       FROM exam_schedules es
       INNER JOIN employees e ON e.employee_id = es.employee_id
       WHERE COALESCE(e.staff_type, '') <> 'Teaching'
         AND ($1::text IS NULL OR es.term = $1)`,
      [term]
    )

    const invalidTeachingSubstituteCount = await safeCount(
      `SELECT COUNT(*)::int AS count
       FROM teaching_schedules ts
       LEFT JOIN employees sub ON sub.employee_id = ts.substitute_employee_id
       WHERE ts.substitute_employee_id IS NOT NULL
         AND sub.employee_id IS NULL
         AND ($1::text IS NULL OR ts.term = $1)`,
      [term]
    )

    const invalidExamSubstituteCount = await safeCount(
      `SELECT COUNT(*)::int AS count
       FROM exam_schedules es
       LEFT JOIN employees sub ON sub.employee_id = es.substitute_employee_id
       WHERE es.substitute_employee_id IS NOT NULL
         AND sub.employee_id IS NULL
         AND ($1::text IS NULL OR es.term = $1)`,
      [term]
    )

    const selfTeachingSubstituteCount = await safeCount(
      `SELECT COUNT(*)::int AS count
       FROM teaching_schedules ts
       WHERE ts.substitute_employee_id IS NOT NULL
         AND ts.substitute_employee_id = ts.employee_id
         AND ($1::text IS NULL OR ts.term = $1)`,
      [term]
    )

    const selfExamSubstituteCount = await safeCount(
      `SELECT COUNT(*)::int AS count
       FROM exam_schedules es
       WHERE es.substitute_employee_id IS NOT NULL
         AND es.substitute_employee_id = es.employee_id
         AND ($1::text IS NULL OR es.term = $1)`,
      [term]
    )

    const [
      orphanTeachingOwners,
      orphanExamOwners,
      nonTeachingTeachingOwners,
      nonTeachingExamOwners,
      invalidTeachingSubstitutes,
      invalidExamSubstitutes,
      selfTeachingSubstitutes,
      selfExamSubstitutes,
    ] = await Promise.all([
      dbQuery(
        `SELECT ts.schedule_id, ts.employee_id, ts.subject_name, ts.day_of_week, ts.time_start, ts.time_end, ts.term
         FROM teaching_schedules ts
         LEFT JOIN employees e ON e.employee_id = ts.employee_id
         WHERE e.employee_id IS NULL
           AND ($1::text IS NULL OR ts.term = $1)
         ORDER BY ts.schedule_id DESC
         LIMIT $2`,
        [term, maxRows]
      ),
      dbQuery(
        `SELECT es.exam_schedule_id, es.employee_id, es.subject_name, es.day_of_week, es.time_start, es.time_end, es.exam_date, es.term
         FROM exam_schedules es
         LEFT JOIN employees e ON e.employee_id = es.employee_id
         WHERE e.employee_id IS NULL
           AND ($1::text IS NULL OR es.term = $1)
         ORDER BY es.exam_schedule_id DESC
         LIMIT $2`,
        [term, maxRows]
      ),
      dbQuery(
        `SELECT ts.schedule_id, ts.employee_id, e.full_name, e.staff_type, ts.subject_name, ts.day_of_week, ts.time_start, ts.time_end, ts.term
         FROM teaching_schedules ts
         INNER JOIN employees e ON e.employee_id = ts.employee_id
         WHERE COALESCE(e.staff_type, '') <> 'Teaching'
           AND ($1::text IS NULL OR ts.term = $1)
         ORDER BY ts.schedule_id DESC
         LIMIT $2`,
        [term, maxRows]
      ),
      dbQuery(
        `SELECT es.exam_schedule_id, es.employee_id, e.full_name, e.staff_type, es.subject_name, es.day_of_week, es.time_start, es.time_end, es.exam_date, es.term
         FROM exam_schedules es
         INNER JOIN employees e ON e.employee_id = es.employee_id
         WHERE COALESCE(e.staff_type, '') <> 'Teaching'
           AND ($1::text IS NULL OR es.term = $1)
         ORDER BY es.exam_schedule_id DESC
         LIMIT $2`,
        [term, maxRows]
      ),
      dbQuery(
        `SELECT ts.schedule_id, ts.employee_id, ts.substitute_employee_id, ts.subject_name, ts.term
         FROM teaching_schedules ts
         LEFT JOIN employees sub ON sub.employee_id = ts.substitute_employee_id
         WHERE ts.substitute_employee_id IS NOT NULL
           AND sub.employee_id IS NULL
           AND ($1::text IS NULL OR ts.term = $1)
         ORDER BY ts.schedule_id DESC
         LIMIT $2`,
        [term, maxRows]
      ),
      dbQuery(
        `SELECT es.exam_schedule_id, es.employee_id, es.substitute_employee_id, es.subject_name, es.exam_date, es.term
         FROM exam_schedules es
         LEFT JOIN employees sub ON sub.employee_id = es.substitute_employee_id
         WHERE es.substitute_employee_id IS NOT NULL
           AND sub.employee_id IS NULL
           AND ($1::text IS NULL OR es.term = $1)
         ORDER BY es.exam_schedule_id DESC
         LIMIT $2`,
        [term, maxRows]
      ),
      dbQuery(
        `SELECT ts.schedule_id, ts.employee_id, ts.substitute_employee_id, ts.subject_name, ts.term
         FROM teaching_schedules ts
         WHERE ts.substitute_employee_id IS NOT NULL
           AND ts.substitute_employee_id = ts.employee_id
           AND ($1::text IS NULL OR ts.term = $1)
         ORDER BY ts.schedule_id DESC
         LIMIT $2`,
        [term, maxRows]
      ),
      dbQuery(
        `SELECT es.exam_schedule_id, es.employee_id, es.substitute_employee_id, es.subject_name, es.exam_date, es.term
         FROM exam_schedules es
         WHERE es.substitute_employee_id IS NOT NULL
           AND es.substitute_employee_id = es.employee_id
           AND ($1::text IS NULL OR es.term = $1)
         ORDER BY es.exam_schedule_id DESC
         LIMIT $2`,
        [term, maxRows]
      ),
    ])

    const totalIssues =
      orphanTeachingOwnerCount +
      orphanExamOwnerCount +
      nonTeachingTeachingOwnerCount +
      nonTeachingExamOwnerCount +
      invalidTeachingSubstituteCount +
      invalidExamSubstituteCount +
      selfTeachingSubstituteCount +
      selfExamSubstituteCount

    return NextResponse.json({
      summary: {
        term: term || 'all',
        max_rows: maxRows,
        total_issues: totalIssues,
        orphan_teaching_owner_count: orphanTeachingOwnerCount,
        orphan_exam_owner_count: orphanExamOwnerCount,
        non_teaching_teaching_owner_count: nonTeachingTeachingOwnerCount,
        non_teaching_exam_owner_count: nonTeachingExamOwnerCount,
        invalid_teaching_substitute_count: invalidTeachingSubstituteCount,
        invalid_exam_substitute_count: invalidExamSubstituteCount,
        self_teaching_substitute_count: selfTeachingSubstituteCount,
        self_exam_substitute_count: selfExamSubstituteCount,
      },
      details: {
        orphan_teaching_owners: orphanTeachingOwners,
        orphan_exam_owners: orphanExamOwners,
        non_teaching_teaching_owners: nonTeachingTeachingOwners,
        non_teaching_exam_owners: nonTeachingExamOwners,
        invalid_teaching_substitutes: invalidTeachingSubstitutes,
        invalid_exam_substitutes: invalidExamSubstitutes,
        self_teaching_substitutes: selfTeachingSubstitutes,
        self_exam_substitutes: selfExamSubstitutes,
      },
    })
  } catch (error: any) {
    console.error('[GET /api/schedules/integrity] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to audit schedule integrity' },
      { status: 500 }
    )
  }
}
