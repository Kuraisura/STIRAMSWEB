/**
 * Employee Schedule Queries
 * 
 * These queries are used to retrieve work schedule information for Non-Teaching staff.
 * Work schedules are stored in the employees table with schedule_time_in and schedule_time_out fields.
 */

const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') return ''
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    'http://localhost:3000'
  )
}

const parseApiJson = async (res: Response) => {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((body as any)?.error || `Request failed (${res.status})`)
  }
  return body
}

/**
 * Get work schedule for a specific employee
 * Returns schedule_time_in and schedule_time_out from employees table
 * 
 * @example
 * const schedule = await getEmployeeWorkSchedule(123)
 * console.log(schedule) // { schedule_time_in: '08:00', schedule_time_out: '17:00' }
 */
export async function getEmployeeWorkSchedule(employeeId: number) {
  try {
    const endpoint = `/api/employees?includeInactive=true&employeeId=${employeeId}`
    const res = await fetch(`${getApiBaseUrl()}${endpoint}`, { cache: 'no-store' })
    const rows = await parseApiJson(res)
    const employee = Array.isArray(rows) ? rows[0] : null

    if (!employee) return null

    return {
      employee_id: employee.employee_id,
      full_name: employee.full_name,
      staff_type: employee.staff_type,
      schedule_time_in: employee.schedule_time_in,
      schedule_time_out: employee.schedule_time_out,
    }
  } catch (error) {
    console.error('[getEmployeeWorkSchedule] Failed to fetch work schedule:', error)
    return null
  }
}

/**
 * Get work schedules for all Non-Teaching staff
 * Useful for bulk operations or reports
 * 
 * @example
 * const schedules = await getNonTeachingStaffSchedules()
 * schedules.forEach(s => console.log(`${s.full_name}: ${s.schedule_time_in} - ${s.schedule_time_out}`))
 */
export async function getNonTeachingStaffSchedules() {
  try {
    const endpoint = '/api/employees?staffTypeFilter=Non-Teaching&includeNotStarted=true'
    const res = await fetch(`${getApiBaseUrl()}${endpoint}`, { cache: 'no-store' })
    const rows = await parseApiJson(res)
    const employees = Array.isArray(rows) ? rows : []

    return employees
      .map((employee: any) => ({
        employee_id: employee.employee_id,
        full_name: employee.full_name,
        department: employee.department,
        schedule_time_in: employee.schedule_time_in,
        schedule_time_out: employee.schedule_time_out,
      }))
      .sort((a: any, b: any) => String(a.full_name || '').localeCompare(String(b.full_name || '')))
  } catch (error) {
    console.error('[getNonTeachingStaffSchedules] Failed to fetch schedules:', error)
    return []
  }
}

/**
 * Update work schedule for an employee
 * 
 * @example
 * await updateEmployeeWorkSchedule(123, '08:00', '17:00')
 */
export async function updateEmployeeWorkSchedule(
  employeeId: number,
  scheduleTimeIn: string,
  scheduleTimeOut: string
) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/employees`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: employeeId,
        schedule_time_in: scheduleTimeIn,
        schedule_time_out: scheduleTimeOut,
      }),
    })

    const employee = await parseApiJson(res)
    return {
      employee_id: employee.employee_id,
      full_name: employee.full_name,
      schedule_time_in: employee.schedule_time_in,
      schedule_time_out: employee.schedule_time_out,
    }
  } catch (error) {
    console.error('[updateEmployeeWorkSchedule] Failed to update work schedule:', error)
    throw error
  }
}

/**
 * Check if an employee has a defined work schedule
 * 
 * @example
 * const hasSchedule = await employeeHasWorkSchedule(123)
 * if (!hasSchedule) console.log('No schedule defined')
 */
export async function employeeHasWorkSchedule(employeeId: number): Promise<boolean> {
  try {
    const employee = await getEmployeeWorkSchedule(employeeId)
    return !!(employee?.schedule_time_in && employee?.schedule_time_out)
  } catch (error) {
    console.error('[employeeHasWorkSchedule] Failed to check schedule:', error)
    return false
  }
}
