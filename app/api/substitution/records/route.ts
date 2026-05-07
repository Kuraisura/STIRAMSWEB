import { NextRequest, NextResponse } from 'next/server'
import { dbQuery, pool } from '@/lib/db'
import { getIsoDayOfWeekFromDate, parseTimeToMinutes, rangesOverlap } from '@/lib/substitution-conflict-helper'
import { getActiveTermContext } from '@/lib/active-term-code'
import {
  autoMarkOriginalEmployeeAbsentIfNoSchedule,
  removeAutoMarkedAbsentIfScheduleRestored,
} from '@/lib/substitution-auto-absent-helper'
import { getAuditContext, recordLogTrailChange } from '@/lib/audit'

export const dynamic = 'force-dynamic'

function apiError(
  message: string,
  status: number,
  code: string,
  details?: Record<string, unknown>
) {
  return NextResponse.json({ error: message, code, details }, { status })
}

function normalizeTimeForDb(value: string): string {
  const raw = String(value || '').trim()
  const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i)
  if (ampmMatch) {
    let hour = Number(ampmMatch[1])
    const minute = Number(ampmMatch[2])
    const second = Number(ampmMatch[3] || '0')
    const meridiem = ampmMatch[4].toUpperCase()
    if (hour === 12) hour = 0
    if (meridiem === 'PM') hour += 12
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
  }

  const hmsMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (hmsMatch) {
    const hour = Number(hmsMatch[1])
    const minute = Number(hmsMatch[2])
    const second = Number(hmsMatch[3] || '0')
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
  }

  return raw
}

export async function GET() {
  try {
    const rows = await dbQuery(
      `
      SELECT *
      FROM (
      SELECT
        cs.id,
        'class'::text AS substitution_type,
        cs.original_employee_id,
        cs.substitute_employee_id,
        cs.substitution_date,
        cs.start_time,
        cs.end_time,
        cs.reason,
        cs.status,
        cs.approved_by,
        cs.approved_at,
        cs.created_at,
        cs.updated_at,
        json_build_object(
          'employee_id', o.employee_id,
          'full_name', o.full_name,
          'school_id', o.school_id,
          'department', o.department,
          'email', o.email
        ) AS original_employee,
        json_build_object(
          'employee_id', s.employee_id,
          'full_name', s.full_name,
          'school_id', s.school_id,
          'department', s.department,
          'email', s.email
        ) AS substitute_employee
      FROM class_substitutions_v2 cs
      LEFT JOIN employees o ON o.employee_id = cs.original_employee_id
      LEFT JOIN employees s ON s.employee_id = cs.substitute_employee_id
      UNION ALL
      SELECT
        (-1 * es.exam_schedule_id) AS id,
        'exam'::text AS substitution_type,
        es.employee_id AS original_employee_id,
        es.substitute_employee_id,
        COALESCE(es.substitution_date, es.exam_date) AS substitution_date,
        es.time_start AS start_time,
        es.time_end AS end_time,
        es.unavailable_reason AS reason,
        CASE
          WHEN LOWER(COALESCE(es.status, 'available')) = 'substituted' THEN 'approved'
          ELSE LOWER(COALESCE(es.status, 'pending'))
        END AS status,
        es.substituted_by AS approved_by,
        es.substituted_at AS approved_at,
        es.substituted_at AS created_at,
        es.substituted_at AS updated_at,
        json_build_object(
          'employee_id', o.employee_id,
          'full_name', o.full_name,
          'school_id', o.school_id,
          'department', o.department,
          'email', o.email
        ) AS original_employee,
        json_build_object(
          'employee_id', s.employee_id,
          'full_name', s.full_name,
          'school_id', s.school_id,
          'department', s.department,
          'email', s.email
        ) AS substitute_employee
      FROM exam_schedules es
      LEFT JOIN employees o ON o.employee_id = es.employee_id
      LEFT JOIN employees s ON s.employee_id = es.substitute_employee_id
      WHERE es.substitute_employee_id IS NOT NULL
        AND LOWER(COALESCE(es.status, 'available')) = 'substituted'
      ) substitutions
      ORDER BY substitution_date DESC, created_at DESC
      `
    )

    return NextResponse.json({ items: rows })
  } catch (error: any) {
    console.error('[GET /api/substitution/records] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to load substitutions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  let client: Awaited<ReturnType<typeof pool.connect>> | null = null
  try {
    const body = await request.json().catch(() => ({}))

    const originalEmployeeId = Number(body?.original_employee_id)
    const substituteEmployeeId = Number(body?.substitute_employee_id)
    const substitutionDate = String(body?.substitution_date || '').trim()
    const startTimeRaw = String(body?.start_time || '').trim()
    const endTimeRaw = String(body?.end_time || '').trim()
    const reason = body?.reason ? String(body.reason).trim() : null

    if (!originalEmployeeId || !substituteEmployeeId || !substitutionDate || !startTimeRaw || !endTimeRaw) {
      return apiError(
        'Missing required fields: original_employee_id, substitute_employee_id, substitution_date, start_time, end_time',
        400,
        'MISSING_REQUIRED_FIELDS'
      )
    }

    if (originalEmployeeId === substituteEmployeeId) {
      return apiError('Substitute must be different from original employee', 400, 'SAME_EMPLOYEE')
    }

    const reqStart = parseTimeToMinutes(startTimeRaw)
    const reqEnd = parseTimeToMinutes(endTimeRaw)
    if (reqStart === null || reqEnd === null || reqStart >= reqEnd) {
      return apiError('Invalid substitution time range', 400, 'INVALID_TIME_RANGE')
    }

    if (reason && reason.length > 500) {
      return apiError('Reason must be 500 characters or less', 400, 'REASON_TOO_LONG')
    }

    const dayOfWeek = getIsoDayOfWeekFromDate(substitutionDate)
    if (!dayOfWeek) {
      return apiError('Invalid substitution_date', 400, 'INVALID_DATE')
    }

    const activeTerm = await getActiveTermContext()
    const termToUse = activeTerm.termCode

    const originalTeaching = await dbQuery<{ time_start: string; time_end: string }>(
      `SELECT time_start::text AS time_start, time_end::text AS time_end
       FROM teaching_schedules
       WHERE employee_id = $1
         AND day_of_week = $2
         AND ($3::text IS NULL OR term = $3 OR term IS NULL)`,
      [originalEmployeeId, dayOfWeek, termToUse]
    )

    const originalHasSlot = originalTeaching.some((row) => {
      const s = parseTimeToMinutes(row.time_start)
      const e = parseTimeToMinutes(row.time_end)
      return s !== null && e !== null && rangesOverlap(reqStart, reqEnd, s, e)
    })

    if (!originalHasSlot) {
      return apiError(
        'Original employee has no class schedule matching this date/time window.',
        400,
        'ORIGINAL_NO_MATCHING_SCHEDULE',
        {
          originalEmployeeId,
          substitutionDate,
          requestedRange: `${startTimeRaw}-${endTimeRaw}`,
        }
      )
    }

    const substituteRows = await dbQuery<{ employee_id: number }>(
      `SELECT employee_id
       FROM employees
       WHERE employee_id = $1
         AND staff_type = 'Teaching'
         AND (is_active IS NULL OR is_active = TRUE)
         AND employment_status IN ('Part Time', 'Part Time Full Load')
       LIMIT 1`,
      [substituteEmployeeId]
    )

    if (!substituteRows.length) {
      return apiError(
        'Selected substitute is not eligible. Please pick an active Part Time teaching employee.',
        400,
        'SUBSTITUTE_NOT_ELIGIBLE',
        { substituteEmployeeId }
      )
    }

    const normalizedStartTime = normalizeTimeForDb(startTimeRaw)
    const normalizedEndTime = normalizeTimeForDb(endTimeRaw)

    client = await pool.connect()
    await client.query('BEGIN')

    // Serialize creation attempts for the same substitution fingerprint.
    // This protects against duplicate rows from concurrent submissions.
    const lockKey = `substitution:${originalEmployeeId}:${substituteEmployeeId}:${substitutionDate}:${normalizedStartTime}:${normalizedEndTime}`
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey])

    const duplicateResult = await client.query<{ id: number }>(
      `SELECT id
       FROM class_substitutions_v2
       WHERE original_employee_id = $1
         AND substitute_employee_id = $2
         AND substitution_date = $3::date
         AND start_time = $4::time
         AND end_time = $5::time
         AND COALESCE(status, 'pending') NOT IN ('rejected', 'cancelled')
       LIMIT 1`,
      [
        originalEmployeeId,
        substituteEmployeeId,
        substitutionDate,
        normalizedStartTime,
        normalizedEndTime,
      ]
    )
    const duplicate = duplicateResult.rows

    if (duplicate.length) {
      await client.query('ROLLBACK')
      return apiError(
        'An active substitution with the same employee/date/time already exists.',
        409,
        'DUPLICATE_SUBSTITUTION',
        { substitutionId: duplicate[0].id }
      )
    }

    const teaching = await dbQuery<{ time_start: string; time_end: string }>(
      `SELECT time_start::text AS time_start, time_end::text AS time_end
       FROM teaching_schedules
       WHERE employee_id = $1
         AND day_of_week = $2
         AND ($3::text IS NULL OR term = $3 OR term IS NULL)`,
      [substituteEmployeeId, dayOfWeek, termToUse]
    )

    for (const row of teaching) {
      const s = parseTimeToMinutes(row.time_start)
      const e = parseTimeToMinutes(row.time_end)
      if (s !== null && e !== null && rangesOverlap(reqStart, reqEnd, s, e)) {
        return apiError(
          'Selected substitute has a class schedule conflict at that time.',
          409,
          'SUBSTITUTE_CLASS_CONFLICT',
          {
            substituteEmployeeId,
            conflictType: 'class_schedule',
            requestedRange: `${startTimeRaw}-${endTimeRaw}`,
            conflictRange: `${row.time_start}-${row.time_end}`,
          }
        )
      }
    }

    const exams = await dbQuery<{ time_start: string; time_end: string }>(
      `SELECT time_start::text AS time_start, time_end::text AS time_end
       FROM exam_schedules
       WHERE employee_id = $1
         AND (exam_date = $2::date OR (exam_date IS NULL AND day_of_week = $3))
         AND (
           $4::text IS NULL
           OR term = $4
           OR term IS NULL
           OR (
             $5::date IS NOT NULL
             AND $6::date IS NOT NULL
             AND exam_date IS NOT NULL
             AND exam_date BETWEEN $5::date AND $6::date
           )
         )`,
      [
        substituteEmployeeId,
        substitutionDate,
        dayOfWeek,
        termToUse,
        activeTerm.startDate,
        activeTerm.endDate,
      ]
    )

    for (const row of exams) {
      const s = parseTimeToMinutes(row.time_start)
      const e = parseTimeToMinutes(row.time_end)
      if (s !== null && e !== null && rangesOverlap(reqStart, reqEnd, s, e)) {
        return apiError(
          'Selected substitute has an exam schedule conflict at that time.',
          409,
          'SUBSTITUTE_EXAM_CONFLICT',
          {
            substituteEmployeeId,
            conflictType: 'exam_schedule',
            requestedRange: `${startTimeRaw}-${endTimeRaw}`,
            conflictRange: `${row.time_start}-${row.time_end}`,
          }
        )
      }
    }

    const existingSubs = await dbQuery<{ start_time: string; end_time: string }>(
      `SELECT start_time::text AS start_time, end_time::text AS end_time
       FROM class_substitutions_v2
       WHERE substitute_employee_id = $1
         AND substitution_date = $2::date
         AND COALESCE(status, 'pending') NOT IN ('rejected', 'cancelled')`,
      [substituteEmployeeId, substitutionDate]
    )

    for (const row of existingSubs) {
      const s = parseTimeToMinutes(row.start_time)
      const e = parseTimeToMinutes(row.end_time)
      if (s !== null && e !== null && rangesOverlap(reqStart, reqEnd, s, e)) {
        return apiError(
          'Selected substitute already has another substitution at that time.',
          409,
          'SUBSTITUTE_ALREADY_ASSIGNED',
          {
            substituteEmployeeId,
            conflictType: 'existing_substitution',
            requestedRange: `${startTimeRaw}-${endTimeRaw}`,
            conflictRange: `${row.start_time}-${row.end_time}`,
          }
        )
      }
    }

    const insertedResult = await client.query<{ id: number }>(
      `INSERT INTO class_substitutions_v2 (
        original_employee_id,
        substitute_employee_id,
        substitution_date,
        start_time,
        end_time,
        reason,
        status
      ) VALUES ($1, $2, $3::date, $4::time, $5::time, $6, 'pending')
      RETURNING id`,
      [
        originalEmployeeId,
        substituteEmployeeId,
        substitutionDate,
        normalizedStartTime,
        normalizedEndTime,
        reason,
      ]
    )
    const inserted = insertedResult.rows

    if (!inserted.length) {
      await client.query('ROLLBACK')
      return apiError('Failed to create substitution', 500, 'INSERT_FAILED')
    }

    await client.query('COMMIT')

    return NextResponse.json({ success: true, id: inserted[0].id })
  } catch (error: any) {
    if (client) {
      try { await client.query('ROLLBACK') } catch {}
    }
    console.error('[POST /api/substitution/records] Error:', error)
    return apiError(error?.message || 'Failed to create substitution record', 500, 'SERVER_ERROR')
  } finally {
    client?.release()
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = Number(request.nextUrl.searchParams.get('id') || 0)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 })
    }

    const existingRows = await dbQuery<{
      id: number
      original_employee_id: number | null
      substitution_date: string | null
      status: string | null
    }>(
      `SELECT id, original_employee_id, substitution_date::text AS substitution_date, status
       FROM class_substitutions_v2
       WHERE id = $1
       LIMIT 1`,
      [id]
    )
    const existing = existingRows[0]
    if (!existing) {
      return NextResponse.json({ error: 'Substitution record not found' }, { status: 404 })
    }

    const deleted = await dbQuery<{ id: number }>(
      `DELETE FROM class_substitutions_v2 WHERE id = $1 RETURNING id`,
      [id]
    )

    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Substitution record not found' }, { status: 404 })
    }

    let attendanceCleanup: any = null
    const wasApproved = String(existing.status || '').toLowerCase() === 'approved'
    const originalEmployeeId = Number(existing.original_employee_id || 0)
    const substitutionDate = String(existing.substitution_date || '').slice(0, 10)

    if (wasApproved && Number.isFinite(originalEmployeeId) && originalEmployeeId > 0 && substitutionDate) {
      try {
        attendanceCleanup = await removeAutoMarkedAbsentIfScheduleRestored({
          employeeId: originalEmployeeId,
          date: substitutionDate,
        })
      } catch (cleanupError: any) {
        console.error('[DELETE /api/substitution/records] Attendance cleanup failed:', cleanupError)
        attendanceCleanup = {
          checked: false,
          deletedAbsentLogs: 0,
          skippedReason: cleanupError?.message || 'Attendance cleanup failed',
        }
      }
    }

    return NextResponse.json({ success: true, id, attendanceCleanup })
  } catch (error: any) {
    console.error('[DELETE /api/substitution/records] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to delete substitution record' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const id = Number(body?.id || 0)
    const status = String(body?.status || '').trim().toLowerCase()
    const approvedBy = body?.approved_by == null ? null : Number(body.approved_by)

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 })
    }

    if (!['approved', 'rejected', 'cancelled', 'pending'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 })
    }

    const rows = await dbQuery<{ id: number }>(
      `UPDATE class_substitutions_v2
       SET status = $1,
           approved_by = CASE WHEN $4 = 'approved' THEN $2 ELSE approved_by END,
           approved_at = CASE WHEN $4 = 'approved' THEN NOW() ELSE approved_at END,
           updated_at = NOW()
       WHERE id = $3
       RETURNING id`,
      [status, Number.isFinite(approvedBy as number) ? approvedBy : null, id, status]
    )

    if (!rows.length) {
      return NextResponse.json({ error: 'Substitution record not found' }, { status: 404 })
    }

    let autoAbsent: any = null
    if (status === 'approved') {
      try {
        autoAbsent = await autoMarkOriginalEmployeeAbsentIfNoSchedule(id)

        if (autoAbsent?.checked) {
          try {
            const actorUserId = Number.isFinite(approvedBy as number) ? Number(approvedBy) : undefined
            const adminRows = actorUserId
              ? await dbQuery<{ id: number; email: string; full_name: string }>(
                  `SELECT id, email, full_name
                   FROM admin_users
                   WHERE id = $1
                   LIMIT 1`,
                  [actorUserId]
                )
              : []
            const admin = adminRows[0]

            const createdAbsent = autoAbsent?.createdAbsent === true
            const actionType = createdAbsent
              ? 'create:attendance_logs_auto_absent_substitution'
              : 'skip:attendance_logs_auto_absent_substitution'
            const targetTable = createdAbsent ? 'attendance_logs' : 'class_substitutions_v2'
            const targetRecordId = createdAbsent ? autoAbsent?.absentLogId ?? null : id
            const description = createdAbsent
              ? `Auto-marked absent due to fully substituted schedule for substitution ${id}`
              : `Skipped auto-absent for substitution ${id}: ${autoAbsent?.skippedReason || 'unknown reason'}`
            const newValue = createdAbsent
              ? {
                  log_id: autoAbsent?.absentLogId ?? null,
                  employee_id: autoAbsent?.employeeId ?? null,
                  date: autoAbsent?.date ?? null,
                  attendance_status: 'absent',
                  source: 'approved_substitution_auto_absent',
                }
              : {
                  substitution_id: id,
                  employee_id: autoAbsent?.employeeId ?? null,
                  date: autoAbsent?.date ?? null,
                  skipped_reason: autoAbsent?.skippedReason || null,
                  source: 'approved_substitution_auto_absent',
                }

            await recordLogTrailChange({
              actor: {
                user_id: admin?.id ?? actorUserId,
                user_email: admin?.email ?? 'system@rams',
                user_name: admin?.full_name ?? 'System',
                user_type: 'admin',
              },
              action: actionType,
              table: targetTable,
              recordId: targetRecordId,
              newValue,
              description,
              context: getAuditContext(request),
              extra: {
                substitution_id: id,
                approved_by: actorUserId ?? null,
                helper_checked: autoAbsent?.checked ?? false,
                helper_created_absent: autoAbsent?.createdAbsent ?? false,
                helper_skipped_reason: autoAbsent?.skippedReason || null,
              },
            })
          } catch (auditError) {
            console.warn('[PATCH /api/substitution/records] Failed to write auto-absent audit log:', auditError)
          }
        }
      } catch (autoAbsentError: any) {
        console.error('[PATCH /api/substitution/records] Auto-absent helper failed:', autoAbsentError)
        autoAbsent = {
          checked: false,
          createdAbsent: false,
          skippedReason: autoAbsentError?.message || 'Auto-absent helper failed',
        }
      }
    }

    return NextResponse.json({ success: true, id, status, autoAbsent })
  } catch (error: any) {
    console.error('[PATCH /api/substitution/records] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to update substitution record' }, { status: 500 })
  }
}
