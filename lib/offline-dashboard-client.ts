import type { Employee } from '@/lib/types/database.types'

type StaffTypeFilter = 'Teaching' | 'Non-Teaching' | null

export type { Employee }

export interface Subject {
  subject_id: number
  name: string
  description?: string
  department?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

const STAFF_OWNERS = {
  NON_TEACHING: 'evelyn.barron@santarosa.sti.edu',
} as const

const normalizeEmail = (email?: string): string => (email || '').trim().toLowerCase()

export const getStaffTypeFilter = (userEmail?: string, userRole?: string): StaffTypeFilter => {
  const email = normalizeEmail(userEmail)

  void userRole

  if (email === STAFF_OWNERS.NON_TEACHING) return 'Non-Teaching'

  return 'Teaching'
}

const parseJson = async (res: Response) => {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((body as any)?.error || `Request failed (${res.status})`)
  }
  return body
}

export const getAttendanceLogs = async (date?: string, limit = 1000) => {
  const params = new URLSearchParams()
  if (date) params.set('date', date)
  params.set('limit', String(limit))
  const res = await fetch(`/api/attendance/logs?${params.toString()}`, { cache: 'no-store' })
  const body = await parseJson(res)
  return Array.isArray(body) ? body : []
}

export const getAttendanceSummary = async (date?: string) => {
  const params = new URLSearchParams()
  if (date) params.set('date', date)
  const res = await fetch(`/api/attendance/summary?${params.toString()}`, { cache: 'no-store' })
  return await parseJson(res)
}

export const getAttendanceSummaryToday = async () => getAttendanceSummary()

export const getDashboardStats = async (staffTypeFilter?: StaffTypeFilter) => {
  const params = new URLSearchParams()
  if (staffTypeFilter) params.set('staffType', staffTypeFilter)

  const res = await fetch(`/api/dashboard/stats?${params.toString()}`, { cache: 'no-store' })
  return await parseJson(res)
}

export const getWeeklyAttendanceData = async (staffTypeFilter?: StaffTypeFilter) => {
  const params = new URLSearchParams()
  if (staffTypeFilter) params.set('staffType', staffTypeFilter)

  const res = await fetch(`/api/dashboard/weekly-attendance?${params.toString()}`, { cache: 'no-store' })
  const body = await parseJson(res)
  return Array.isArray((body as any)?.items) ? (body as any).items : []
}

export const getDepartmentAttendanceData = async (staffTypeFilter?: StaffTypeFilter) => {
  const params = new URLSearchParams()
  if (staffTypeFilter) params.set('staffType', staffTypeFilter)

  const res = await fetch(`/api/dashboard/department-attendance?${params.toString()}`, { cache: 'no-store' })
  const body = await parseJson(res)
  return Array.isArray((body as any)?.items) ? (body as any).items : []
}

export const getEmployees = async (
  includeInactive = false,
  includeNotStarted = true,
  onlyArchived = false,
  staffTypeFilter?: StaffTypeFilter
) => {
  const params = new URLSearchParams()
  if (includeInactive) params.set('includeInactive', 'true')
  if (includeNotStarted) params.set('includeNotStarted', 'true')
  if (onlyArchived) params.set('onlyArchived', 'true')
  if (staffTypeFilter) params.set('staffTypeFilter', staffTypeFilter)

  const res = await fetch(`/api/employees?${params.toString()}`, { cache: 'no-store' })
  const body = await parseJson(res)
  return Array.isArray(body) ? body : []
}

export const createEmployee = async (employee: Omit<Employee, 'employee_id' | 'created_at' | 'updated_at'>) => {
  const res = await fetch('/api/employees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(employee),
  })
  return await parseJson(res)
}

export const updateEmployee = async (
  employeeId: number,
  updates: Partial<Omit<Employee, 'employee_id' | 'created_at' | 'updated_at'>>
) => {
  const payload = {
    employee_id: employeeId,
    ...Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined)),
  }

  const res = await fetch('/api/employees', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return await parseJson(res)
}

export const archiveEmployee = async (employeeId: number, archive = true) => {
  return await updateEmployee(employeeId, { is_active: !archive } as any)
}

export const deleteEmployee = async (employeeId: number) => {
  const res = await fetch('/api/employees/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId }),
  })
  await parseJson(res)
  return true
}

export const getDepartments = async (staffTypeFilter?: StaffTypeFilter) => {
  const params = new URLSearchParams()
  if (staffTypeFilter) params.set('category', staffTypeFilter)

  const res = await fetch(`/api/departments?${params.toString()}`, { cache: 'no-store' })
  const body = await parseJson(res)
  return Array.isArray((body as any)?.data) ? (body as any).data : []
}

export const getEmploymentStatuses = async () => {
  const res = await fetch('/api/employment-statuses', { cache: 'no-store' })
  try {
    const body = await parseJson(res)
    return Array.isArray(body) ? body : []
  } catch {
    return [
      { status_id: 1, name: 'Full Time', is_active: true },
      { status_id: 2, name: 'Part Time', is_active: true },
      { status_id: 3, name: 'Part Time Full Load', is_active: true },
    ]
  }
}

export const upsertCourse = async (courseData: { code: string; title?: string; department?: string }) => {
  const res = await fetch('/api/courses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: (courseData.code || '').trim().toUpperCase() }),
  })
  return await parseJson(res)
}

export const upsertRoom = async (roomData: { code: string; building?: string; floor?: number; name?: string }) => {
  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: (roomData.code || '').trim().toUpperCase() }),
  })
  return await parseJson(res)
}

export const getSubjects = async () => {
  const res = await fetch('/api/subjects', { cache: 'no-store' })
  try {
    const body = await parseJson(res)
    return Array.isArray(body) ? body : []
  } catch {
    return []
  }
}

export const upsertSubject = async (subjectData: { name: string; description?: string; department?: string }) => {
  const res = await fetch('/api/subjects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: (subjectData.name || '').trim(),
      description: subjectData.description,
      department: subjectData.department,
    }),
  })
  return await parseJson(res)
}

export const getTeachingSchedulesForEmployee = async (employeeId: number, term?: '1st_term' | '2nd_term' | 'summer') => {
  const params = new URLSearchParams({ employee_id: String(employeeId) })
  if (term) params.set('term', term)

  const res = await fetch(`/api/schedules/employee?${params.toString()}`, { cache: 'no-store' })
  const body = await parseJson(res)
  const teaching = Array.isArray((body as any)?.teaching) ? (body as any).teaching : []
  const filtered = teaching.filter((row: any) => Number(row?.employee_id) === Number(employeeId))

  if (filtered.length !== teaching.length) {
    console.warn('[Schedules] Teaching schedule mismatch detected and filtered', {
      requestedEmployeeId: employeeId,
      totalRows: teaching.length,
      keptRows: filtered.length,
      mismatchedRows: teaching
        .filter((row: any) => Number(row?.employee_id) !== Number(employeeId))
        .map((row: any) => ({ schedule_id: row?.schedule_id, employee_id: row?.employee_id }))
        .slice(0, 10),
    })
  }

  return filtered
}

export const upsertTeachingSchedule = async (payload: any) => {
  const normalizedPayload = { ...payload }

  if (!normalizedPayload.course_id && normalizedPayload.subject_name) {
    normalizedPayload.course_code = String(normalizedPayload.subject_name).trim().substring(0, 8).toUpperCase()
  }

  if (!normalizedPayload.room_id && normalizedPayload.room_code) {
    normalizedPayload.room_code = String(normalizedPayload.room_code).trim().toUpperCase()
  }

  const res = await fetch('/api/teaching-schedules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizedPayload),
  })
  return await parseJson(res)
}

export const deleteTeachingSchedule = async (scheduleId: number) => {
  const res = await fetch(`/api/teaching-schedules/${scheduleId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  })
  await parseJson(res)
  return true
}

export const getExamSchedulesForEmployee = async (employeeId: number, term?: '1st_term' | '2nd_term' | 'summer') => {
  const params = new URLSearchParams({ employee_id: String(employeeId) })
  if (term) params.set('term', term)

  const res = await fetch(`/api/schedules/employee?${params.toString()}`, { cache: 'no-store' })
  const body = await parseJson(res)
  const exam = Array.isArray((body as any)?.exam) ? (body as any).exam : []
  const filtered = exam.filter((row: any) => Number(row?.employee_id) === Number(employeeId))

  if (filtered.length !== exam.length) {
    console.warn('[Schedules] Exam schedule mismatch detected and filtered', {
      requestedEmployeeId: employeeId,
      totalRows: exam.length,
      keptRows: filtered.length,
      mismatchedRows: exam
        .filter((row: any) => Number(row?.employee_id) !== Number(employeeId))
        .map((row: any) => ({ exam_schedule_id: row?.exam_schedule_id, employee_id: row?.employee_id }))
        .slice(0, 10),
    })
  }

  return filtered
}

export const substituteExamSchedule = async (
  examScheduleId: number,
  substituteEmployeeId: number,
  unavailableReason: string,
  _status: 'on-leave' | 'absent' | 'unavailable' = 'on-leave',
  adminUserId?: number,
  substitutionDate?: string
) => {
  const res = await fetch(`/api/exam-schedules/${examScheduleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'substitute',
      substitute_employee_id: substituteEmployeeId,
      unavailable_reason: unavailableReason,
      substituted_by: adminUserId ?? null,
      substitution_date: substitutionDate ?? null,
    }),
  })
  return await parseJson(res)
}

export const removeSubstitution = async (examScheduleId: number) => {
  const res = await fetch(`/api/exam-schedules/${examScheduleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'remove-substitution' }),
  })
  return await parseJson(res)
}

export const substituteTeachingSchedule = async (
  scheduleId: number,
  substituteEmployeeId: number,
  unavailableReason: string,
  _status: 'on-leave' | 'absent' | 'unavailable' = 'on-leave',
  adminUserId?: number,
  substitutionDate?: string
) => {
  const res = await fetch(`/api/teaching-schedules/${scheduleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'substitute',
      substitute_employee_id: substituteEmployeeId,
      unavailable_reason: unavailableReason,
      substituted_by: adminUserId ?? null,
      substitution_date: substitutionDate ?? null,
    }),
  })
  return await parseJson(res)
}

export const removeTeachingSubstitution = async (scheduleId: number) => {
  const res = await fetch(`/api/teaching-schedules/${scheduleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'remove-substitution' }),
  })
  return await parseJson(res)
}

export const getClassSubstitutions = async (filters?: { date?: string; status?: string }) => {
  const res = await fetch('/api/substitution/records', { cache: 'no-store' })
  const body = await parseJson(res)
  const items = Array.isArray((body as any)?.items) ? (body as any).items : []

  return items.filter((item: any) => {
    const okDate = !filters?.date || String(item.substitution_date || '').slice(0, 10) === filters.date
    const okStatus = !filters?.status || String(item.status || '').toLowerCase() === String(filters.status).toLowerCase()
    return okDate && okStatus
  })
}

export const getClassSubstitutionsForEmployeeOnDate = async (employeeId: number, date: string) => {
  const items = await getClassSubstitutions({ date })
  return items.filter((item: any) => item.original_employee_id === employeeId || item.substitute_employee_id === employeeId)
}

const toSeconds = (time: string) => {
  const [hh, mm, ss] = time.split(':').map(Number)
  return (hh || 0) * 3600 + (mm || 0) * 60 + (ss || 0)
}

const toYmd = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const manilaDateOfIso = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso))
  } catch {
    return (iso || '').split('T')[0]
  }
}

const localTimeOfIso = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Manila',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(iso))
  } catch {
    return null
  }
}

const getScheduledTimesForDate = async (employeeId: number, date: string) => {
  const params = new URLSearchParams({ employee_id: String(employeeId) })
  const res = await fetch(`/api/schedules/employee?${params.toString()}`, { cache: 'no-store' })
  const body = await parseJson(res)

  const teaching = Array.isArray((body as any)?.teaching) ? (body as any).teaching : []
  const exam = Array.isArray((body as any)?.exam) ? (body as any).exam : []

  const dateObj = new Date(`${date}T00:00:00+08:00`)
  const jsDay = dateObj.getDay()
  if (jsDay === 0) return { scheduleIn: null as string | null, scheduleOut: null as string | null }

  const dayOfWeek = jsDay

  const examForDate = exam.filter((item: any) => String(item.exam_date || '').slice(0, 10) === date)
  const examForDay = examForDate.length > 0 ? examForDate : exam.filter((item: any) => Number(item.day_of_week) === dayOfWeek)
  const source = examForDay.length > 0 ? examForDay : teaching.filter((item: any) => Number(item.day_of_week) === dayOfWeek)

  if (!source.length) return { scheduleIn: null as string | null, scheduleOut: null as string | null }

  const starts = source.map((item: any) => String(item.time_start || '').slice(0, 8)).filter(Boolean)
  const ends = source.map((item: any) => String(item.time_end || '').slice(0, 8)).filter(Boolean)
  if (!starts.length || !ends.length) return { scheduleIn: null as string | null, scheduleOut: null as string | null }

  const scheduleIn = starts.sort()[0]
  const scheduleOut = ends.sort().slice(-1)[0]
  return { scheduleIn, scheduleOut }
}

export const getEmployeeCutoffAttendance = async (
  employeeId: number,
  cutoffStart: string,
  cutoffEnd: string,
  scheduleIn?: string,
  scheduleOut?: string,
  startDate?: string,
  hireDate?: string
) => {
  const start = new Date(`${cutoffStart}T00:00:00+08:00`)
  const end = new Date(`${cutoffEnd}T23:59:59.999+08:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new Error('Invalid cutoff range')
  }

  const days: string[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    days.push(toYmd(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  const attendanceParams = new URLSearchParams({
    employeeId: String(employeeId),
    dateFrom: cutoffStart,
    dateTo: cutoffEnd,
    limit: '50000',
  })

  const [attendanceRows, scheduleBody] = await Promise.all([
    fetch(`/api/attendance/logs?${attendanceParams.toString()}`, { cache: 'no-store' }).then(parseJson),
    fetch(`/api/schedules/employee?employee_id=${employeeId}`, { cache: 'no-store' }).then(parseJson),
  ])

  const teaching = Array.isArray((scheduleBody as any)?.teaching) ? (scheduleBody as any).teaching : []
  const exam = Array.isArray((scheduleBody as any)?.exam) ? (scheduleBody as any).exam : []

  const hasScheduleForDate = (date: string) => {
    const dayObj = new Date(`${date}T00:00:00+08:00`)
    const jsDay = dayObj.getDay()
    if (jsDay === 0) return false
    const dateExam = exam.some((item: any) => String(item.exam_date || '').slice(0, 10) === date)
    if (dateExam) return true
    return teaching.some((item: any) => Number(item.day_of_week) === jsDay) || exam.some((item: any) => Number(item.day_of_week) === jsDay)
  }

  const byDay: Record<string, { firstIn?: string; lastOut?: string; anyLog: boolean; inLate?: boolean; outUndertime?: boolean }> = {}
  days.forEach((day) => {
    byDay[day] = { anyLog: false }
  })

  const merged = [...(Array.isArray(attendanceRows) ? attendanceRows : [])].sort((a: any, b: any) => new Date(a.log_time).getTime() - new Date(b.log_time).getTime())
  merged.forEach((row: any) => {
    const day = String(row.date || manilaDateOfIso(row.log_time || ''))
    if (!byDay[day]) byDay[day] = { anyLog: false }
    byDay[day].anyLog = true

    const status = String(row.attendance_status || '').toLowerCase()
    if (row.log_type === 'IN' && !byDay[day].firstIn) {
      byDay[day].firstIn = localTimeOfIso(row.log_time || '') || null || undefined
      byDay[day].inLate = Boolean(row.is_late || status === 'late')
    }
    if (row.log_type === 'OUT') {
      byDay[day].lastOut = localTimeOfIso(row.log_time || '') || null || undefined
      byDay[day].outUndertime = Boolean(row.is_early_out || status === 'undertime')
    }
  })

  const defaultScheduleInSec = scheduleIn ? toSeconds(scheduleIn) : undefined
  const defaultScheduleOutSec = scheduleOut ? toSeconds(scheduleOut) : undefined

  return await Promise.all(days.map(async (day) => {
    const dayObj = new Date(`${day}T00:00:00+08:00`)
    if (dayObj.getDay() === 0) return { date: day, timeIn: null, timeOut: null, status: 'rest-day' }

    const bucket = byDay[day] || { anyLog: false }
    const timeIn = bucket.firstIn || null
    const timeOut = bucket.lastOut || null

    if (!bucket.anyLog) {
      if (hireDate && dayObj < new Date(`${hireDate}T00:00:00+08:00`)) {
        return { date: day, timeIn: null, timeOut: null, status: null }
      }
      if (startDate && dayObj <= new Date(`${startDate}T00:00:00+08:00`)) {
        return { date: day, timeIn: null, timeOut: null, status: null }
      }
      if (!hasScheduleForDate(day)) {
        return { date: day, timeIn: null, timeOut: null, status: null }
      }
      return { date: day, timeIn: null, timeOut: null, status: 'absent' }
    }

    let dayScheduleInSec = defaultScheduleInSec
    let dayScheduleOutSec = defaultScheduleOutSec
    try {
      const daySchedule = await getScheduledTimesForDate(employeeId, day)
      if (daySchedule.scheduleIn) dayScheduleInSec = toSeconds(daySchedule.scheduleIn)
      if (daySchedule.scheduleOut) dayScheduleOutSec = toSeconds(daySchedule.scheduleOut)
    } catch {
      // Keep defaults if day-specific schedule lookup fails.
    }

    let inPart: 'on-time' | 'late' = 'on-time'
    if (bucket.inLate === true) inPart = 'late'
    else if (bucket.inLate === undefined && timeIn && dayScheduleInSec !== undefined) {
      inPart = toSeconds(timeIn) >= dayScheduleInSec ? 'late' : 'on-time'
    }

    let outPart: 'on-time' | 'undertime' = 'on-time'
    if (bucket.outUndertime === true) outPart = 'undertime'
    else if (bucket.outUndertime === undefined && timeOut && dayScheduleOutSec !== undefined) {
      outPart = toSeconds(timeOut) < dayScheduleOutSec ? 'undertime' : 'on-time'
    }

    const status = inPart === 'on-time' && outPart === 'on-time' ? 'on-time' : `${inPart}/${outPart}`
    return { date: day, timeIn, timeOut, status }
  }))
}
