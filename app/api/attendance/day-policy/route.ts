import { NextRequest, NextResponse } from 'next/server'
import { validateEmployeeSchedule, getCurrentManilaDate, getCurrentManilaTime } from '@/lib/schedule-validation'

export const dynamic = 'force-dynamic'

/**
 * GET /api/attendance/day-policy?employee_id=123&date=2026-04-04&time=08:00:00
 *
 * Provides a deterministic day-policy result used for day-by-day validation,
 * including schedule overrides and class/exam conflict decisions.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const employeeId = Number(searchParams.get('employee_id') || 0)
    const date = (searchParams.get('date') || getCurrentManilaDate()).trim()
    const time = (searchParams.get('time') || getCurrentManilaTime()).trim()

    if (!employeeId) {
      return NextResponse.json(
        { error: 'employee_id is required' },
        { status: 400 }
      )
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'date must be YYYY-MM-DD' },
        { status: 400 }
      )
    }

    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time)) {
      return NextResponse.json(
        { error: 'time must be HH:MM or HH:MM:SS' },
        { status: 400 }
      )
    }

    const normalizedTime = time.length === 5 ? `${time}:00` : time
    const result = await validateEmployeeSchedule(employeeId, date, normalizedTime)

    return NextResponse.json({
      employee_id: employeeId,
      date,
      time: normalizedTime,
      has_schedule: result.hasSchedule,
      is_admin_time: result.isAdminTime,
      expected_time_in: result.expectedTimeIn || null,
      expected_time_out: result.expectedTimeOut || null,
      holiday: result.holiday || null,
      policy: result.policy || null,
      totals: {
        teaching_raw: result.schedules.length,
        exam_raw: result.examSchedules.length,
        teaching_effective: result.effectiveSchedules?.teaching.length ?? result.schedules.length,
        exam_effective: result.effectiveSchedules?.exam.length ?? result.examSchedules.length,
      },
      message: result.message,
    })
  } catch (error: any) {
    console.error('[GET /api/attendance/day-policy] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to evaluate day policy' },
      { status: 500 }
    )
  }
}
