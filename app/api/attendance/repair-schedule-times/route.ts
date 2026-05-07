import { NextRequest, NextResponse } from 'next/server'
import { formatInTimeZone } from 'date-fns-tz'
import { dbQuery } from '@/lib/db'
import { MANILA_TZ } from '@/lib/timezone-utils'
import { buildManilaDateTime, getScheduleWindowForEmployeeDate } from '@/lib/schedule-window-helper'
import { requireRecoveryConsoleSession } from '@/lib/route-role-guard'

export const dynamic = 'force-dynamic'

type LogRow = {
  log_id: number
  employee_id: number
  date: string | null
  log_type: 'IN' | 'OUT' | null
  log_time: string | null
  notes: string | null
  attendance_status: string | null
  is_late: boolean | null
  is_early_out: boolean | null
}

type PreviewRow = {
  log_id: number
  employee_id: number
  date: string
  log_type: 'IN' | 'OUT'
  current_time: string | null
  expected_time: string
  reason: string
}

type ApprovedVerificationRow = {
  employee_id: number
  req_date: string | null
  log_type: string | null
  request_type: string | null
}

function toManilaHms(value: string | null | undefined): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null

  // Plain time text fallback.
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    return raw.length === 5 ? `${raw}:00` : raw
  }

  const normalized = raw.includes(' ') ? raw.replace(' ', 'T') : raw
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
  const candidate = hasOffset ? normalized : `${normalized}+08:00`

  const parsed = new Date(candidate)
  if (Number.isNaN(parsed.getTime())) return null
  return formatInTimeZone(parsed, MANILA_TZ, 'HH:mm:ss')
}

function toDateOnly(value: string | null | undefined): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  if (direct) return direct[1]
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return formatInTimeZone(parsed, MANILA_TZ, 'yyyy-MM-dd')
}

function toMinutes(hms: string | null): number | null {
  if (!hms) return null
  const match = String(hms).match(/^(\d{2}):(\d{2})(?::\d{2})?$/)
  if (!match) return null
  const hh = Number(match[1])
  const mm = Number(match[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  return hh * 60 + mm
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireRecoveryConsoleSession(req)
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const body = await req.json().catch(() => ({}))
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.startDate || '')) ? String(body.startDate) : null
    const endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.endDate || '')) ? String(body.endDate) : null
    const employeeId = Number(body?.employeeId || 0)
    const employeeFilter = Number.isFinite(employeeId) && employeeId > 0 ? employeeId : null
    const requestedStaffType = String(body?.staffTypeFilter || '').trim()
    const staffTypeFilter = requestedStaffType === 'Teaching' || requestedStaffType === 'Non-Teaching'
      ? requestedStaffType
      : null
    const aggressive = Boolean(body?.aggressive)
    const dryRun = Boolean(body?.dryRun)
    const previewLimitRaw = Number(body?.previewLimit || 50)
    const previewLimit = Number.isFinite(previewLimitRaw) && previewLimitRaw > 0 ? Math.min(previewLimitRaw, 200) : 50
    const limitRaw = Number(body?.limit || 5000)
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 20000) : 5000

    const conditions: string[] = ["(e.is_active IS NULL OR e.is_active = TRUE)", "l.log_type IN ('IN', 'OUT')"]
    const values: unknown[] = []

    if (startDate) {
      values.push(startDate)
      conditions.push(`l.date >= $${values.length}::date`)
    }
    if (endDate) {
      values.push(endDate)
      conditions.push(`l.date <= $${values.length}::date`)
    }
    if (employeeFilter) {
      values.push(employeeFilter)
      conditions.push(`l.employee_id = $${values.length}`)
    }
    if (staffTypeFilter) {
      values.push(staffTypeFilter)
      conditions.push(`e.staff_type = $${values.length}`)
    }

    values.push(limit)

    const logs = await dbQuery<LogRow>(
      `SELECT
         l.log_id,
         l.employee_id,
         l.date::text AS date,
         l.log_type,
         l.log_time::text AS log_time,
         l.notes,
         l.attendance_status::text AS attendance_status,
         l.is_late,
         l.is_early_out
       FROM attendance_logs l
       INNER JOIN employees e ON e.employee_id = l.employee_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY l.date DESC, l.employee_id ASC, l.log_id ASC
       LIMIT $${values.length}`,
      values
    )

    const vrConditions: string[] = ["vr.status = 'approved'", "vr.request_type IN ('missed_log', 'under_review')"]
    const vrValues: unknown[] = []
    if (startDate) {
      vrValues.push(startDate)
      vrConditions.push(`vr.requested_time::date >= $${vrValues.length}::date`)
    }
    if (endDate) {
      vrValues.push(endDate)
      vrConditions.push(`vr.requested_time::date <= $${vrValues.length}::date`)
    }
    if (employeeFilter) {
      vrValues.push(employeeFilter)
      vrConditions.push(`vr.employee_id = $${vrValues.length}`)
    }
    if (staffTypeFilter) {
      vrValues.push(staffTypeFilter)
      vrConditions.push(`e.staff_type = $${vrValues.length}`)
    }

    const approvedRequests = await dbQuery<ApprovedVerificationRow>(
      `SELECT
         vr.employee_id,
         vr.requested_time::date::text AS req_date,
         vr.log_type,
         vr.request_type
       FROM verification_requests vr
       INNER JOIN employees e ON e.employee_id = vr.employee_id
       WHERE ${vrConditions.join(' AND ')}`,
      vrValues
    )

    const approvedKeys = new Set<string>()
    approvedRequests.forEach((row) => {
      const dateStr = String(row.req_date || '').slice(0, 10)
      const requestType = String(row.request_type || '').toLowerCase()
      if (!dateStr) return

      if (requestType === 'under_review') {
        approvedKeys.add(`${row.employee_id}|${dateStr}|IN`)
        approvedKeys.add(`${row.employee_id}|${dateStr}|OUT`)
        return
      }

      const logType = String(row.log_type || '').toUpperCase()
      if (logType === 'IN' || logType === 'OUT') {
        approvedKeys.add(`${row.employee_id}|${dateStr}|${logType}`)
      }
    })

    let scanned = 0
    let candidates = 0
    let repaired = 0
    let skipped = 0
    let wouldRepair = 0
    const failures: Array<{ log_id: number; error: string }> = []
    const previews: PreviewRow[] = []

    for (const log of logs) {
      scanned++
      try {
        const dateStr = toDateOnly(log.date)
        const logType = String(log.log_type || '').toUpperCase() as 'IN' | 'OUT'
        if (!dateStr || (logType !== 'IN' && logType !== 'OUT')) {
          skipped++
          continue
        }

        const key = `${log.employee_id}|${dateStr}|${logType}`
        const noteText = String(log.notes || '').toLowerCase()
        const relatedVerification = approvedKeys.has(key)
        const relatedByNote =
          noteText.includes('under review resolved') ||
          noteText.includes('replay approved verification') ||
          noteText.includes('verification approved')

        const window = await getScheduleWindowForEmployeeDate(log.employee_id, dateStr)
        if (!window) {
          skipped++
          continue
        }

        const expected = logType === 'IN' ? window.timeIn : window.timeOut
        if (!expected) {
          skipped++
          continue
        }

        const currentHms = toManilaHms(log.log_time)
        const suspiciousClock =
          (logType === 'IN' && (currentHms === '00:00:00' || currentHms === '12:00:00')) ||
          (logType === 'OUT' && (currentHms === '03:00:00' || currentHms === '15:00:00'))

        const statusLower = String(log.attendance_status || '').toLowerCase()
        const generatedLikeStatus =
          statusLower === '' ||
          statusLower === 'present' ||
          statusLower === 'on_time' ||
          statusLower === 'on-time'

        const currentMin = toMinutes(currentHms)
        const expectedMin = toMinutes(expected)
        const hasLargeMismatch =
          Number.isFinite(currentMin as number) &&
          Number.isFinite(expectedMin as number) &&
          Math.abs(Number(currentMin) - Number(expectedMin)) >= 120

        const safeMismatchCandidate =
          generatedLikeStatus &&
          !Boolean(log.is_late) &&
          !Boolean(log.is_early_out) &&
          hasLargeMismatch

        const shouldConsider = aggressive || relatedVerification || relatedByNote || suspiciousClock || safeMismatchCandidate
        if (!shouldConsider) {
          skipped++
          continue
        }

        candidates++
        if (currentHms === expected) {
          skipped++
          continue
        }

        const reason = relatedVerification
          ? 'linked-approved-verification'
          : relatedByNote
            ? 'verification-note'
            : suspiciousClock
              ? 'suspicious-clock'
              : safeMismatchCandidate
                ? 'large-mismatch'
                : 'aggressive-scope'

        if (dryRun) {
          wouldRepair++
          if (previews.length < previewLimit) {
            previews.push({
              log_id: log.log_id,
              employee_id: log.employee_id,
              date: dateStr,
              log_type: logType,
              current_time: currentHms,
              expected_time: expected,
              reason,
            })
          }
          continue
        }

        const newLogTime = buildManilaDateTime(dateStr, expected)
        await dbQuery(
          `UPDATE attendance_logs
           SET log_time = $1,
               notes = CASE
                 WHEN COALESCE(notes, '') = '' THEN 'Repair: aligned with schedule window'
                 ELSE notes || ' | Repair: aligned with schedule window'
               END
           WHERE log_id = $2`,
          [newLogTime, log.log_id]
        )

        repaired++
      } catch (error: any) {
        failures.push({
          log_id: log.log_id,
          error: error?.message || 'Failed to repair log',
        })
      }
    }

    return NextResponse.json({
      success: failures.length === 0,
      scanned,
      candidates,
      repaired,
      wouldRepair,
      skipped,
      aggressive,
      dryRun,
      previews,
      failed: failures.length,
      failures,
    })
  } catch (error: any) {
    console.error('[POST /api/attendance/repair-schedule-times] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to repair schedule times' }, { status: 500 })
  }
}
