import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

export const dynamic = 'force-dynamic'

function getTodayManilaDate(): string {
  const now = new Date()
  const manila = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }))
  const y = manila.getFullYear()
  const m = String(manila.getMonth() + 1).padStart(2, '0')
  const d = String(manila.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

async function safeCount(
  query: string,
  params: unknown[],
  metricName: string,
  issues: string[]
): Promise<number | null> {
  try {
    const rows = await dbQuery<{ count: number }>(query, params)
    return Number(rows[0]?.count || 0)
  } catch (error: any) {
    issues.push(`${metricName}: ${error?.message || 'query failed'}`)
    return null
  }
}

export async function GET(request: Request) {
  const issues: string[] = []

  try {
    const { searchParams } = new URL(request.url)
    const dateParam = (searchParams.get('date') || '').trim()
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : getTodayManilaDate()
    const requestedStaffType = (searchParams.get('staffType') || '').trim()
    const staffTypeFilter =
      requestedStaffType === 'Teaching' || requestedStaffType === 'Non-Teaching'
        ? requestedStaffType
        : null

    const metrics = {
      pending_verifications: await safeCount(
        `SELECT COUNT(*)::int AS count
         FROM verification_requests vr
         LEFT JOIN employees e ON e.employee_id = vr.employee_id
         WHERE vr.status = 'pending'
           AND (e.employee_id IS NULL OR e.is_active IS NULL OR e.is_active = TRUE)
           AND ($1::text IS NULL OR e.staff_type = $1)`,
        [staffTypeFilter],
        'pending_verifications',
        issues
      ),

      pending_under_review: null,

      pending_missed_logs: await safeCount(
        `SELECT COUNT(*)::int AS count
         FROM verification_requests vr
         LEFT JOIN employees e ON e.employee_id = vr.employee_id
         WHERE vr.status = 'pending'
           AND vr.request_type = 'missed_log'
           AND COALESCE(vr.reason, '') NOT LIKE '[UNDER_REVIEW]%'
            AND (e.employee_id IS NULL OR e.is_active IS NULL OR e.is_active = TRUE)
            AND ($1::text IS NULL OR e.staff_type = $1)`,
          [staffTypeFilter],
        'pending_missed_logs',
        issues
      ),

      pending_leaves: await safeCount(
        `SELECT COUNT(*)::int AS count
         FROM verification_requests vr
         LEFT JOIN employees e ON e.employee_id = vr.employee_id
         WHERE vr.status = 'pending'
           AND vr.request_type = 'leave'
            AND (e.employee_id IS NULL OR e.is_active IS NULL OR e.is_active = TRUE)
            AND ($1::text IS NULL OR e.staff_type = $1)`,
          [staffTypeFilter],
        'pending_leaves',
        issues
      ),

      pending_time_corrections: await safeCount(
        `SELECT COUNT(*)::int AS count
         FROM verification_requests vr
         LEFT JOIN employees e ON e.employee_id = vr.employee_id
         WHERE vr.status = 'pending'
           AND vr.request_type = 'time_correction'
            AND (e.employee_id IS NULL OR e.is_active IS NULL OR e.is_active = TRUE)
            AND ($1::text IS NULL OR e.staff_type = $1)`,
          [staffTypeFilter],
        'pending_time_corrections',
        issues
      ),

      approved_verifications_today: await safeCount(
        `SELECT COUNT(*)::int AS count
         FROM verification_requests vr
         LEFT JOIN employees e ON e.employee_id = vr.employee_id
         WHERE vr.status = 'approved'
            AND DATE(COALESCE(vr.reviewed_at, vr.requested_at)) = $1
            AND (e.employee_id IS NULL OR e.is_active IS NULL OR e.is_active = TRUE)
            AND ($2::text IS NULL OR e.staff_type = $2)`,
          [date, staffTypeFilter],
        'approved_verifications_today',
        issues
      ),

      rejected_verifications_today: await safeCount(
        `SELECT COUNT(*)::int AS count
         FROM verification_requests vr
         LEFT JOIN employees e ON e.employee_id = vr.employee_id
         WHERE vr.status = 'rejected'
            AND DATE(COALESCE(vr.reviewed_at, vr.requested_at)) = $1
            AND (e.employee_id IS NULL OR e.is_active IS NULL OR e.is_active = TRUE)
            AND ($2::text IS NULL OR e.staff_type = $2)`,
          [date, staffTypeFilter],
        'rejected_verifications_today',
        issues
      ),

      reviewed_verifications_today: await safeCount(
        `SELECT COUNT(*)::int AS count
         FROM verification_requests vr
         LEFT JOIN employees e ON e.employee_id = vr.employee_id
         WHERE vr.status IN ('approved', 'rejected')
            AND DATE(COALESCE(vr.reviewed_at, vr.requested_at)) = $1
            AND (e.employee_id IS NULL OR e.is_active IS NULL OR e.is_active = TRUE)
            AND ($2::text IS NULL OR e.staff_type = $2)`,
          [date, staffTypeFilter],
        'reviewed_verifications_today',
        issues
      ),

      approved_under_review_today: null,

      approved_missed_logs_today: await safeCount(
        `SELECT COUNT(*)::int AS count
         FROM verification_requests vr
         LEFT JOIN employees e ON e.employee_id = vr.employee_id
         WHERE vr.status = 'approved'
           AND vr.request_type = 'missed_log'
            AND DATE(COALESCE(vr.reviewed_at, vr.requested_at)) = $1
            AND (e.employee_id IS NULL OR e.is_active IS NULL OR e.is_active = TRUE)
            AND ($2::text IS NULL OR e.staff_type = $2)`,
          [date, staffTypeFilter],
        'approved_missed_logs_today',
        issues
      ),

      approved_time_corrections_today: await safeCount(
        `SELECT COUNT(*)::int AS count
         FROM verification_requests vr
         LEFT JOIN employees e ON e.employee_id = vr.employee_id
         WHERE vr.status = 'approved'
           AND vr.request_type = 'time_correction'
            AND DATE(COALESCE(vr.reviewed_at, vr.requested_at)) = $1
            AND (e.employee_id IS NULL OR e.is_active IS NULL OR e.is_active = TRUE)
            AND ($2::text IS NULL OR e.staff_type = $2)`,
          [date, staffTypeFilter],
        'approved_time_corrections_today',
        issues
      ),

      approved_leaves_today: await safeCount(
        `SELECT COUNT(*)::int AS count
         FROM verification_requests vr
         LEFT JOIN employees e ON e.employee_id = vr.employee_id
         WHERE vr.request_type = 'leave'
           AND vr.status = 'approved'
            AND DATE(COALESCE(vr.reviewed_at, vr.requested_at)) = $1
            AND (e.employee_id IS NULL OR e.is_active IS NULL OR e.is_active = TRUE)
            AND ($2::text IS NULL OR e.staff_type = $2)`,
          [date, staffTypeFilter],
        'approved_leaves_today',
        issues
      ),

      active_substitutions_today: await safeCount(
        `SELECT COUNT(*)::int AS count
         FROM schedule_substitutions
         WHERE substitution_date = $1
           AND status = 'active'`,
        [date],
        'active_substitutions_today',
        issues
      ),

      employees_with_more_than_two_logs_today: await safeCount(
        `SELECT COUNT(*)::int AS count
         FROM (
           SELECT l.employee_id
           FROM attendance_logs l
           INNER JOIN employees e ON e.employee_id = l.employee_id
           WHERE l.date = $1
             AND (e.is_active IS NULL OR e.is_active = TRUE)
             AND ($2::text IS NULL OR e.staff_type = $2)
           GROUP BY l.employee_id
           HAVING COUNT(*) > 2
         ) q`,
        [date, staffTypeFilter],
        'employees_with_more_than_two_logs_today',
        issues
      ),

      employees_with_out_without_in_today: await safeCount(
        `SELECT COUNT(*)::int AS count
         FROM (
           SELECT l.employee_id
           FROM attendance_logs l
           INNER JOIN employees e ON e.employee_id = l.employee_id
           WHERE l.date = $1
             AND (e.is_active IS NULL OR e.is_active = TRUE)
             AND ($2::text IS NULL OR e.staff_type = $2)
           GROUP BY l.employee_id
           HAVING SUM(CASE WHEN l.log_type = 'OUT' THEN 1 ELSE 0 END) > 0
              AND SUM(CASE WHEN l.log_type = 'IN' THEN 1 ELSE 0 END) = 0
         ) q`,
        [date, staffTypeFilter],
        'employees_with_out_without_in_today',
        issues
      ),

      overlapping_teaching_schedule_pairs: await safeCount(
        `SELECT COUNT(*)::int AS count
         FROM teaching_schedules t1
         JOIN teaching_schedules t2
           ON t1.employee_id = t2.employee_id
          AND t1.day_of_week = t2.day_of_week
          AND COALESCE(t1.term, '') = COALESCE(t2.term, '')
          AND t1.schedule_id < t2.schedule_id
          AND t1.status = 'available'
          AND t2.status = 'available'
          AND t1.time_start < t2.time_end
          AND t1.time_end > t2.time_start
          AND EXISTS (
            SELECT 1
            FROM employees e
            WHERE e.employee_id = t1.employee_id
              AND (e.is_active IS NULL OR e.is_active = TRUE)
              AND ($1::text IS NULL OR e.staff_type = $1)
          )`,
        [staffTypeFilter],
        'overlapping_teaching_schedule_pairs',
        issues
      ),

      overlapping_exam_schedule_pairs: await safeCount(
        `SELECT COUNT(*)::int AS count
         FROM exam_schedules e1
         JOIN exam_schedules e2
           ON e1.employee_id = e2.employee_id
          AND e1.day_of_week = e2.day_of_week
          AND COALESCE(e1.term, '') = COALESCE(e2.term, '')
          AND e1.exam_schedule_id < e2.exam_schedule_id
          AND e1.status = 'available'
          AND e2.status = 'available'
          AND e1.time_start < e2.time_end
          AND e1.time_end > e2.time_start
          AND EXISTS (
            SELECT 1
            FROM employees e
            WHERE e.employee_id = e1.employee_id
              AND (e.is_active IS NULL OR e.is_active = TRUE)
              AND ($1::text IS NULL OR e.staff_type = $1)
          )`,
        [staffTypeFilter],
        'overlapping_exam_schedule_pairs',
        issues
      ),

      verification_requests_over_sla_72h: await safeCount(
        `SELECT COUNT(*)::int AS count
         FROM verification_requests vr
         LEFT JOIN employees e ON e.employee_id = vr.employee_id
         WHERE vr.status = 'pending'
           AND vr.requested_at < NOW() - INTERVAL '72 hours'
           AND (e.employee_id IS NULL OR e.is_active IS NULL OR e.is_active = TRUE)
           AND ($1::text IS NULL OR e.staff_type = $1)`,
        [staffTypeFilter],
        'verification_requests_over_sla_72h',
        issues
      ),
    }

    const reviewedToday = metrics.reviewed_verifications_today
    const approvedToday = metrics.approved_verifications_today
    const approvalConversionRateToday =
      reviewedToday != null && approvedToday != null && reviewedToday > 0
        ? Number(((approvedToday / reviewedToday) * 100).toFixed(1))
        : null

    const metricsWithDerived = {
      ...metrics,
      approval_conversion_rate_today: approvalConversionRateToday,
    }

    const criticalSignals = [
      metrics.employees_with_more_than_two_logs_today,
      metrics.employees_with_out_without_in_today,
      metrics.overlapping_teaching_schedule_pairs,
      metrics.overlapping_exam_schedule_pairs,
    ].filter((v) => v !== null) as number[]

    const warningSignals = [
      metrics.pending_verifications,
      metrics.verification_requests_over_sla_72h,
    ].filter((v) => v !== null) as number[]

    const hasCritical = criticalSignals.some((v) => v > 0)
    const hasWarning = warningSignals.some((v) => v > 0)

    const risk_level = hasCritical ? 'high' : hasWarning ? 'medium' : 'low'

    return NextResponse.json({
      date,
      risk_level,
      metrics: metricsWithDerived,
      diagnostics: {
        partial_data: issues.length > 0,
        issues,
      },
      recommendations: [
        hasCritical ? 'Resolve attendance/schedule conflict signals immediately.' : 'No critical conflicts detected.',
        hasWarning ? 'Review pending verification queue and SLA breaches.' : 'Verification queue is within expected limits.',
        'Run targeted checks using /api/attendance/day-policy for flagged employees.'
      ]
    })
  } catch (error: any) {
    console.error('[GET /api/operations/scenario-health] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to compute scenario health' },
      { status: 500 }
    )
  }
}
