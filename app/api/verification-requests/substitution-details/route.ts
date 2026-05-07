import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const requestId = searchParams.get('requestId')
    
    if (!requestId) {
      return NextResponse.json({ error: 'Missing requestId parameter' }, { status: 400 })
    }

    // Get the verification request to get schedule_id and schedule_type
    const requestRows = await dbQuery<any>(
      `SELECT request_id, employee_id, schedule_id, schedule_type, requested_time, status
       FROM verification_requests
       WHERE request_id = $1
       LIMIT 1`,
      [Number(requestId)]
    )
    const request = requestRows[0]

    if (!request) {
      return NextResponse.json({ error: 'Verification request not found' }, { status: 404 })
    }

    // If no schedule is associated or not approved, return empty substitution details
    if (!request.schedule_id || !request.schedule_type || request.status !== 'approved') {
      return NextResponse.json({ substitutionDetails: null })
    }

    let substitutionDetails: any = null

    // Fetch substitution details based on schedule type
    if (request.schedule_type === 'teaching') {
      const scheduleRows = await dbQuery<any>(
        `SELECT
           ts.schedule_id,
           ts.employee_id,
           ts.substitute_employee_id,
           ts.unavailable_reason,
           ts.status,
           ts.substituted_at,
           ts.substitution_date,
           ts.subject_name,
           ts.section,
           ts.room_id,
           ts.day_of_week,
           ts.time_start,
           ts.time_end,
           ts.class_type,
           e.employee_id AS sub_employee_id,
           e.full_name AS sub_full_name,
           e.department AS sub_department,
           e.email AS sub_email
         FROM teaching_schedules ts
         LEFT JOIN employees e ON e.employee_id = ts.substitute_employee_id
         WHERE ts.schedule_id = $1
         LIMIT 1`,
        [request.schedule_id]
      )
      const schedule = scheduleRows[0]

      if (schedule && schedule.substitute_employee_id) {
        substitutionDetails = {
          scheduleType: 'teaching',
          scheduleId: schedule.schedule_id,
          substituteEmployee: {
            employee_id: schedule.sub_employee_id,
            full_name: schedule.sub_full_name,
            department: schedule.sub_department,
            email: schedule.sub_email,
          },
          unavailableReason: schedule.unavailable_reason,
          status: schedule.status,
          substitutedAt: schedule.substituted_at,
          substitutionDate: schedule.substitution_date,
          scheduleDetails: {
            subjectName: schedule.subject_name,
            section: schedule.section,
            room: schedule.room_id,
            dayOfWeek: schedule.day_of_week,
            timeStart: schedule.time_start,
            timeEnd: schedule.time_end,
            classType: schedule.class_type
          }
        }
      }
    } else if (request.schedule_type === 'exam') {
      const scheduleRows = await dbQuery<any>(
        `SELECT
           es.exam_schedule_id,
           es.employee_id,
           es.substitute_employee_id,
           es.unavailable_reason,
           es.status,
           es.substituted_at,
           es.substitution_date,
           es.subject_name,
           es.section,
           es.room_id,
           es.day_of_week,
           es.time_start,
           es.time_end,
           es.exam_date,
           es.exam_type,
           e.employee_id AS sub_employee_id,
           e.full_name AS sub_full_name,
           e.department AS sub_department,
           e.email AS sub_email
         FROM exam_schedules es
         LEFT JOIN employees e ON e.employee_id = es.substitute_employee_id
         WHERE es.exam_schedule_id = $1
         LIMIT 1`,
        [request.schedule_id]
      )
      const schedule = scheduleRows[0]

      if (schedule && schedule.substitute_employee_id) {
        substitutionDetails = {
          scheduleType: 'exam',
          scheduleId: schedule.exam_schedule_id,
          substituteEmployee: {
            employee_id: schedule.sub_employee_id,
            full_name: schedule.sub_full_name,
            department: schedule.sub_department,
            email: schedule.sub_email,
          },
          unavailableReason: schedule.unavailable_reason,
          status: schedule.status,
          substitutedAt: schedule.substituted_at,
          substitutionDate: schedule.substitution_date,
          scheduleDetails: {
            subjectName: schedule.subject_name,
            section: schedule.section,
            room: schedule.room_id,
            dayOfWeek: schedule.day_of_week,
            timeStart: schedule.time_start,
            timeEnd: schedule.time_end,
            examDate: schedule.exam_date,
            examType: schedule.exam_type
          }
        }
      }
    }

    return NextResponse.json({ substitutionDetails })
  } catch (e: any) {
    console.error('verification-requests/substitution-details GET error:', e?.message || e)
    return NextResponse.json({ error: 'Failed to fetch substitution details' }, { status: 500 })
  }
}

