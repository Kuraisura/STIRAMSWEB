import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

async function revertScheduleSubstitution(
  tableName: 'teaching_schedules' | 'exam_schedules',
  idColumn: 'schedule_id' | 'exam_schedule_id',
  scheduleId: number
) {
  let payload: Record<string, any> = {
    substitute_employee_id: null,
    unavailable_reason: null,
    status: 'available',
    substituted_at: null,
    substituted_by: null,
    substitution_date: null,
  }

  let lastError: any = null
  for (let i = 0; i < 6; i++) {
    const entries = Object.entries(payload)
    if (entries.length === 0) throw lastError || new Error('No substitution columns available to revert')

    const setClause = entries.map(([key], idx) => `"${key}" = $${idx + 1}`).join(', ')
    const params = entries.map(([, value]) => value)
    params.push(scheduleId)

    try {
      await dbQuery(
        `UPDATE ${tableName}
         SET ${setClause}
         WHERE ${idColumn} = $${entries.length + 1}`,
        params
      )
      return
    } catch (error: any) {
      lastError = error
      const message = String(error?.message || error)
      const missingColMatch = message.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+does\s+not\s+exist/i)
      if (missingColMatch?.[1] && payload[missingColMatch[1]] !== undefined) {
        delete payload[missingColMatch[1]]
        continue
      }
      if (/violates check constraint|invalid input value for enum/i.test(message) && payload.status !== undefined) {
        delete payload.status
        continue
      }
      throw error
    }
  }

  throw lastError
}

/**
 * DELETE endpoint to remove a verification request and revert all changes
 * This will:
 * 1. Remove any substitutions from schedules (restore to original state)
 * 2. Revert attendance changes (remove absent marks, restore original status)
 * 3. Delete the verification request
 */
export async function DELETE(req: Request) {
  const deleteOneRequest = async (requestId: number) => {
    // Fetch the verification request to get all details
    const requestRows = await dbQuery<any>(
      `SELECT *
       FROM verification_requests
       WHERE request_id = $1
       LIMIT 1`,
      [requestId]
    )
    const request = requestRows[0]

    if (!request) {
      return { ok: false as const, error: 'Verification request not found' }
    }

    console.log('[Delete Verification] Starting deletion process for request:', requestId)
    console.log('[Delete Verification] Request details:', {
      employee_id: request.employee_id,
      request_type: request.request_type,
      status: request.status,
      schedule_id: request.schedule_id,
      schedule_type: request.schedule_type
    })

    // STEP 1: Remove substitution from schedule if it exists
    if (request.schedule_id && request.schedule_type && request.status === 'approved') {
      console.log('[Delete Verification] Reverting substitution for schedule:', request.schedule_id, 'type:', request.schedule_type)

      if (request.schedule_type === 'teaching') {
        try {
          await revertScheduleSubstitution('teaching_schedules', 'schedule_id', request.schedule_id)
          console.log('[Delete Verification] Successfully reverted teaching schedule')
        } catch (revertError) {
          console.error('[Delete Verification] Error reverting teaching schedule:', revertError)
        }
      } else if (request.schedule_type === 'exam') {
        try {
          await revertScheduleSubstitution('exam_schedules', 'exam_schedule_id', request.schedule_id)
          console.log('[Delete Verification] Successfully reverted exam schedule')
        } catch (revertError) {
          console.error('[Delete Verification] Error reverting exam schedule:', revertError)
        }
      }
    }

    // STEP 2: Revert attendance changes if request was approved
    if (request.status === 'approved') {
      const empId = request.employee_id
      const type = request.request_type
      const reqTime = request.requested_time
      const origTime = request.original_time

      const dateOnly = (ts?: string | null) => (ts ? new Date(ts).toISOString().slice(0, 10) : null)

      console.log('[Delete Verification] Reverting attendance changes for type:', type)

      if (type === 'leave') {
        const d = dateOnly(reqTime)
        const timeStart = request.time_start || null
        const timeEnd = request.time_end || null

        if (empId && d) {
          if (timeStart && timeEnd) {
            // Time-based leave - remove the absent records created for this time range
            console.log('[Delete Verification] Removing time-based leave absent records for date:', d)

            // Delete attendance logs that were created for this leave
            try {
              await dbQuery(
                `DELETE FROM attendance_logs
                 WHERE employee_id = $1
                   AND date = $2
                   AND attendance_status = 'absent'`,
                [empId, d]
              )
              console.log('[Delete Verification] Successfully deleted absent records')
            } catch (deleteError) {
              console.error('[Delete Verification] Error deleting absent records:', deleteError)
            }
          } else {
            // Whole-day leave - remove the On Leave status
            console.log('[Delete Verification] Removing whole-day leave status for date:', d)

            try {
              await dbQuery(
                `DELETE FROM attendance_daily_status
                 WHERE employee_id = $1
                   AND date = $2
                   AND status = 'On Leave'`,
                [empId, d]
              )
              console.log('[Delete Verification] Successfully deleted On Leave status')
            } catch (deleteError) {
              console.error('[Delete Verification] Error deleting On Leave status:', deleteError)
            }
          }
        }
      } else if (type === 'late_justification') {
        // Revert late justification - mark as late again
        const d = dateOnly(reqTime) || dateOnly(origTime)
        if (empId && d) {
          console.log('[Delete Verification] Reverting late justification for date:', d)

          try {
            await dbQuery(
              `UPDATE attendance_logs
               SET is_late = true,
                   attendance_status = 'late'
               WHERE employee_id = $1
                 AND date = $2`,
              [empId, d]
            )
            console.log('[Delete Verification] Successfully reverted late status')
          } catch (revertError) {
            console.error('[Delete Verification] Error reverting late status:', revertError)
          }
        }
      } else if (type === 'missed_log') {
        // Delete the log entry that was created
        if (empId && reqTime) {
          console.log('[Delete Verification] Deleting missed log entry for time:', reqTime)

          const d = dateOnly(reqTime)
          try {
            await dbQuery(
              `DELETE FROM attendance_logs
               WHERE employee_id = $1
                 AND date = $2
                 AND log_time = $3`,
              [empId, d, new Date(reqTime).toISOString()]
            )
            console.log('[Delete Verification] Successfully deleted missed log')
          } catch (deleteError) {
            console.error('[Delete Verification] Error deleting missed log:', deleteError)
          }
        }
      } else if (type === 'time_correction') {
        // Revert time correction - restore original time
        const d = dateOnly(origTime)
        if (empId && d && origTime) {
          console.log('[Delete Verification] Reverting time correction for date:', d)

          // Find the log that was updated and restore it to original time
          const logs = await dbQuery<any>(
            `SELECT log_id, log_time, log_type
             FROM attendance_logs
             WHERE employee_id = $1
               AND date = $2
             ORDER BY log_time ASC`,
            [empId, d]
          )

          if (logs && logs.length) {
            // Restore the first IN or last OUT to original time
            const firstIn = logs.find((r: any) => r.log_type === 'IN')
            const lastOut = [...logs].reverse().find((r: any) => r.log_type === 'OUT')
            const target = firstIn || lastOut || logs[0]

            try {
              await dbQuery(
                `UPDATE attendance_logs
                 SET log_time = $1
                 WHERE log_id = $2`,
                [new Date(origTime).toISOString(), target.log_id]
              )
              console.log('[Delete Verification] Successfully reverted time correction')
            } catch (revertError) {
              console.error('[Delete Verification] Error reverting time correction:', revertError)
            }
          }
        }
      }
    }

    // STEP 3: Delete any notifications related to this verification request
    try {
      await dbQuery(
        `DELETE FROM notifications
         WHERE recipient_id = $1
           AND notification_type = 'verification'
           AND (meta->>'request_id') = $2`,
        [request.employee_id, String(requestId)]
      )

      console.log('[Delete Verification] Deleted related notifications')
    } catch (notifError) {
      console.error('[Delete Verification] Error deleting notifications:', notifError)
      // Continue with deletion even if notification deletion fails
    }

    // STEP 4: Delete the verification request
    await dbQuery(
      `DELETE FROM verification_requests
       WHERE request_id = $1`,
      [requestId]
    )

    console.log('[Delete Verification] Successfully deleted verification request')
    return { ok: true as const }
  }

  try {
    const { searchParams } = new URL(req.url)
    const requestId = searchParams.get('requestId')
    const body = await req.json().catch(() => ({}))
    const requestIds = Array.isArray(body?.requestIds)
      ? body.requestIds.map((v: any) => Number(v)).filter((n: number) => Number.isFinite(n) && n > 0)
      : []
    
    if (requestIds.length > 0) {
      const uniqueIds = Array.from(new Set(requestIds))
      let deletedCount = 0
      const failures: Array<{ request_id: number; error: string }> = []

      for (const id of uniqueIds) {
        try {
          const result = await deleteOneRequest(id)
          if (result.ok) {
            deletedCount++
          } else {
            failures.push({ request_id: id, error: result.error })
          }
        } catch (error: any) {
          failures.push({ request_id: id, error: error?.message || 'Failed to delete request' })
        }
      }

      return NextResponse.json({
        success: failures.length === 0,
        deletedCount,
        requestedCount: uniqueIds.length,
        failures,
        message:
          failures.length === 0
            ? `Deleted ${deletedCount} verification request(s) successfully`
            : `Deleted ${deletedCount} request(s) with ${failures.length} failure(s)`,
      })
    }

    if (!requestId) {
      return NextResponse.json({ error: 'Missing requestId parameter or requestIds body array' }, { status: 400 })
    }

    const result = await deleteOneRequest(Number(requestId))
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Verification request deleted and all changes reverted successfully' 
    })
  } catch (e: any) {
    console.error('verification-requests/delete error:', e?.message || e)
    return NextResponse.json({ error: 'Failed to delete verification request' }, { status: 500 })
  }
}

