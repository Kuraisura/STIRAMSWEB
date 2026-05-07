import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'
import { removeAutoMarkedAbsentIfScheduleRestored } from '@/lib/substitution-auto-absent-helper'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = Number(params.id)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid exam schedule id' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const action = String(body?.action || '').trim().toLowerCase()

    if (action === 'substitute') {
      const substituteEmployeeId = Number(body?.substitute_employee_id)
      const unavailableReason = body?.unavailable_reason ? String(body.unavailable_reason).trim() : null
      const substitutedBy = Number.isFinite(Number(body?.substituted_by)) ? Number(body.substituted_by) : null
      const substitutionDate = body?.substitution_date ? String(body.substitution_date).trim() : null

      if (!Number.isFinite(substituteEmployeeId) || substituteEmployeeId <= 0) {
        return NextResponse.json({ error: 'Valid substitute_employee_id is required' }, { status: 400 })
      }

      const existingRows = await dbQuery<{
        employee_id: number
        exam_date: string | null
      }>(
        `SELECT employee_id, exam_date::text AS exam_date
         FROM exam_schedules
         WHERE exam_schedule_id = $1
         LIMIT 1`,
        [id]
      )
      const existing = existingRows[0]
      if (!existing) {
        return NextResponse.json({ error: 'Exam schedule not found' }, { status: 404 })
      }

      const rows = await dbQuery(
        `UPDATE exam_schedules
         SET status = 'substituted',
             substitute_employee_id = $1,
             unavailable_reason = $2,
             substituted_at = NOW(),
             substituted_by = $3,
             substitution_date = COALESCE($4::date, substitution_date)
         WHERE exam_schedule_id = $5
         RETURNING *`,
        [substituteEmployeeId, unavailableReason, substitutedBy, substitutionDate, id]
      )

      if (!rows[0]) {
        return NextResponse.json({ error: 'Exam schedule not found' }, { status: 404 })
      }

      const effectiveDate = String(substitutionDate || existing.exam_date || '').slice(0, 10)
      let autoAbsent: any = null
      if (effectiveDate) {
        const remainingWindows = await dbQuery<{ remaining_count: number }>(
          `WITH base_windows AS (
             SELECT time_start::text AS start_time, time_end::text AS end_time
             FROM teaching_schedules
             WHERE employee_id = $1
               AND day_of_week = EXTRACT(ISODOW FROM $2::date)::int
             UNION ALL
             SELECT time_start::text AS start_time, time_end::text AS end_time
             FROM exam_schedules
             WHERE employee_id = $1
               AND (exam_date = $2::date OR day_of_week = EXTRACT(ISODOW FROM $2::date)::int)
               AND NOT (
                 LOWER(COALESCE(status, 'available')) = 'substituted'
                 AND substitute_employee_id IS NOT NULL
                 AND COALESCE(substitution_date, exam_date) = $2::date
               )
           )
           SELECT COUNT(*)::int AS remaining_count
           FROM base_windows`,
          [existing.employee_id, effectiveDate]
        )

        if (Number(remainingWindows?.[0]?.remaining_count || 0) === 0) {
          const existingDayLogs = await dbQuery<{ log_id: number }>(
            `SELECT log_id
             FROM attendance_logs
             WHERE employee_id = $1
               AND date = $2::date
             LIMIT 1`,
            [existing.employee_id, effectiveDate]
          )

          if (existingDayLogs.length === 0) {
            const employeeRows = await dbQuery<{ rfid_code: string | null }>(
              `SELECT rfid_code
               FROM employees
               WHERE employee_id = $1
               LIMIT 1`,
              [existing.employee_id]
            )

            const insertedLogs = await dbQuery<{ log_id: number }>(
              `INSERT INTO attendance_logs (
                 employee_id,
                 date,
                 log_time,
                 log_type,
                 attendance_status,
                 is_late,
                 is_early_out,
                 rfid_code,
                 notes
               ) VALUES (
                 $1,
                 $2::date,
                 $3,
                 NULL,
                 'absent',
                 FALSE,
                 FALSE,
                 $4,
                 $5
               )
               RETURNING log_id`,
              [
                existing.employee_id,
                effectiveDate,
                `${effectiveDate}T00:00:00+08:00`,
                employeeRows[0]?.rfid_code || null,
                'Auto-marked absent: all class/exam schedules covered by approved substitution(s).',
              ]
            )

            autoAbsent = {
              createdAbsent: insertedLogs.length > 0,
              employeeId: existing.employee_id,
              date: effectiveDate,
              absentLogId: insertedLogs[0]?.log_id ?? null,
            }
          } else {
            autoAbsent = {
              createdAbsent: false,
              employeeId: existing.employee_id,
              date: effectiveDate,
              skippedReason: 'Attendance log already exists',
            }
          }
        } else {
          autoAbsent = {
            createdAbsent: false,
            employeeId: existing.employee_id,
            date: effectiveDate,
            skippedReason: 'Effective schedule still exists',
          }
        }
      }

      return NextResponse.json({
        ...rows[0],
        autoAbsent,
      })
    }

    if (action === 'remove-substitution') {
      const existingRows = await dbQuery<{
        employee_id: number
        exam_date: string | null
        substitution_date: string | null
      }>(
        `SELECT employee_id,
                exam_date::text AS exam_date,
                substitution_date::text AS substitution_date
         FROM exam_schedules
         WHERE exam_schedule_id = $1
         LIMIT 1`,
        [id]
      )
      const existing = existingRows[0]

      const rows = await dbQuery(
        `UPDATE exam_schedules
         SET status = 'available',
             substitute_employee_id = NULL,
             unavailable_reason = NULL,
             substituted_at = NULL,
             substituted_by = NULL,
             substitution_date = NULL
         WHERE exam_schedule_id = $1
         RETURNING *`,
        [id]
      )

      if (!rows[0]) {
        return NextResponse.json({ error: 'Exam schedule not found' }, { status: 404 })
      }

      const effectiveDate = String(existing?.substitution_date || existing?.exam_date || '').slice(0, 10)
      const attendanceCleanup =
        existing?.employee_id && effectiveDate
          ? await removeAutoMarkedAbsentIfScheduleRestored({
              employeeId: Number(existing.employee_id),
              date: effectiveDate,
            })
          : null

      return NextResponse.json({
        ...rows[0],
        attendanceCleanup,
      })
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
  } catch (error: any) {
    console.error('[PATCH /api/exam-schedules/[id]] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to update exam schedule' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = Number(params.id)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid exam schedule id' }, { status: 400 })
    }

    const result = await dbQuery(
      'DELETE FROM exam_schedules WHERE exam_schedule_id = $1 RETURNING exam_schedule_id',
      [id]
    )

    if (!result || result.length === 0) {
      return NextResponse.json({ error: 'Exam schedule not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, exam_schedule_id: id })
  } catch (error: any) {
    console.error('[DELETE /api/exam-schedules/[id]] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to delete exam schedule' },
      { status: 500 }
    )
  }
}
