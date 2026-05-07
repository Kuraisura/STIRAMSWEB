import type { Employee } from '@/lib/types/database.types'

type ScheduleTerm = '1st_term' | '2nd_term' | 'summer'

type UpsertExamSchedulePayload = {
  exam_schedule_id?: number
  employee_id: number
  day_of_week: number
  time_start: string
  time_end: string
  course_code?: string
  subject_name?: string
  section?: string
  room_code?: string
  exam_date?: string | null
  status?: string
  substitute_employee_id?: number | null
  unavailable_reason?: string
  term?: ScheduleTerm
  class_type?: string
  exam_type?: string
}

const parseJsonResponse = async (res: Response) => {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body?.error || `Request failed (${res.status})`)
  }
  return body
}

export const getTeachingEmployees = async (): Promise<Employee[]> => {
  const res = await fetch('/api/employees?staffTypeFilter=Teaching', { cache: 'no-store' })
  const rows = (await parseJsonResponse(res)) as Employee[]
  return (rows || []).filter((emp) => emp?.staff_type === 'Teaching' && emp?.is_active !== false)
}

export const getExamSchedulesForEmployee = async (
  employeeId: number,
  term?: ScheduleTerm
): Promise<any[]> => {
  const params = new URLSearchParams({ employee_id: String(employeeId) })
  if (term) params.set('term', term)

  const res = await fetch(`/api/schedules/employee?${params.toString()}`, { cache: 'no-store' })
  const payload = await parseJsonResponse(res)
  const exam = Array.isArray(payload?.exam) ? payload.exam : []
  const filtered = exam.filter((row: any) => Number(row?.employee_id) === Number(employeeId))

  if (filtered.length !== exam.length) {
    console.warn('[ExamSchedule] Mismatched employee_id rows detected and filtered', {
      requestedEmployeeId: employeeId,
      totalRows: exam.length,
      keptRows: filtered.length,
      mismatchedRows: exam
        .filter((row: any) => Number(row?.employee_id) !== Number(employeeId))
        .map((row: any) => ({ exam_schedule_id: row?.exam_schedule_id, employee_id: row?.employee_id }))
        .slice(0, 10),
    })
  }

  return filtered.map((row: any) => ({
    ...row,
    section:
      row.section !== undefined && row.section !== null && String(row.section).trim() !== ''
        ? String(row.section).trim()
        : null,
  }))
}

export const upsertExamSchedule = async (payload: UpsertExamSchedulePayload) => {
  const res = await fetch('/api/exam-schedules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  return parseJsonResponse(res)
}

export const deleteExamSchedule = async (examScheduleId: number) => {
  const res = await fetch(`/api/exam-schedules/${examScheduleId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  })

  await parseJsonResponse(res)
  return true
}
