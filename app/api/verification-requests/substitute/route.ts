import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

async function verifyApprovedRequest(verificationRequestId: number): Promise<boolean> {
  const rows = await dbQuery<{ status: string }>(
    `SELECT status
     FROM verification_requests
     WHERE request_id = $1
     LIMIT 1`,
    [verificationRequestId]
  )

  if (!rows[0]) {
    throw new Error('VERIFICATION_NOT_FOUND')
  }

  return rows[0].status === 'approved'
}

async function applyScheduleSubstitution(
  tableName: 'exam_schedules' | 'teaching_schedules',
  idColumn: 'exam_schedule_id' | 'schedule_id',
  scheduleId: number,
  substituteEmployeeId: number,
  unavailableReason: string,
  adminUserId?: number,
  substitutionDate?: string
) {
  const payload: Record<string, any> = {
    status: 'substituted',
    substitute_employee_id: substituteEmployeeId,
    unavailable_reason: unavailableReason,
    substituted_at: new Date().toISOString(),
    substituted_by: adminUserId || null,
  }

  if (substitutionDate) {
    payload.substitution_date = substitutionDate
  }

  let retryPayload = { ...payload }
  let lastError: any = null

  for (let i = 0; i < 6; i++) {
    const entries = Object.entries(retryPayload)
    if (entries.length === 0) {
      throw new Error('No updatable substitution fields remain after retries')
    }

    const setClause = entries.map(([key], index) => `"${key}" = $${index + 1}`).join(', ')
    const params = entries.map(([, value]) => value)
    params.push(scheduleId)

    try {
      const rows = await dbQuery<any>(
        `UPDATE ${tableName}
         SET ${setClause}
         WHERE ${idColumn} = $${entries.length + 1}
         RETURNING *`,
        params
      )
      return rows[0]
    } catch (error: any) {
      lastError = error
      const message = String(error?.message || error)

      const missingColMatch = message.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+does\s+not\s+exist/i)
      if (missingColMatch?.[1] && retryPayload[missingColMatch[1]] !== undefined) {
        delete retryPayload[missingColMatch[1]]
        continue
      }

      if (/violates check constraint|invalid input value for enum/i.test(message) && retryPayload.status !== undefined) {
        delete retryPayload.status
        continue
      }

      if (retryPayload.substitution_date !== undefined) {
        delete retryPayload.substitution_date
        continue
      }

      throw error
    }
  }

  throw lastError || new Error('Failed to apply schedule substitution')
}

/**
 * IMPORTANT: This endpoint is only called during the verification filing approval process.
 * Substitutions can only be assigned when a verification filing is approved by an admin.
 * The frontend ensures this by calling this endpoint only after the filing status is set to 'approved'.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const {
      schedule_type,
      schedule_id,
      substitute_employee_id,
      unavailable_reason,
      status = 'on-leave',
      substitution_date, // CRITICAL: Date when substitution occurs (YYYY-MM-DD format)
      admin_user_id,
      verification_request_id, // Optional: Track which verification filing this substitution is for
    } = body || {}

    if (!schedule_type || !schedule_id || !substitute_employee_id || !unavailable_reason || !substitution_date) {
      return NextResponse.json({ 
        error: 'Missing required fields: schedule_type, schedule_id, substitute_employee_id, unavailable_reason, substitution_date' 
      }, { status: 400 })
    }

    // Optional: Verify that the verification filing is approved if request_id is provided
    if (verification_request_id) {
      let isApproved = false
      try {
        isApproved = await verifyApprovedRequest(Number(verification_request_id))
      } catch (error: any) {
        if (String(error?.message || error) === 'VERIFICATION_NOT_FOUND') {
          return NextResponse.json({
            error: 'Verification filing not found'
          }, { status: 404 })
        }
        throw error
      }

      if (!isApproved) {
        return NextResponse.json({ 
          error: 'Substitutions can only be assigned for approved verification filings. Please approve the filing first.' 
        }, { status: 400 })
      }
    }

    if (schedule_type === 'exam') {
      await applyScheduleSubstitution(
        'exam_schedules',
        'exam_schedule_id',
        Number(schedule_id),
        Number(substitute_employee_id),
        unavailable_reason,
        admin_user_id,
        substitution_date // Pass substitution date to the function
      )
    } else if (schedule_type === 'teaching') {
      await applyScheduleSubstitution(
        'teaching_schedules',
        'schedule_id',
        Number(schedule_id),
        Number(substitute_employee_id),
        unavailable_reason,
        admin_user_id,
        substitution_date // Pass substitution date to the function
      )
    } else {
      return NextResponse.json({ error: 'Invalid schedule_type. Must be "exam" or "teaching"' }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: 'Substitute assigned successfully' })
  } catch (e: any) {
    console.error('verification-requests substitute error:', e?.message || e)
    return NextResponse.json({ error: 'Failed to assign substitute' }, { status: 500 })
  }
}

