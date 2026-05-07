type ScheduleTerm = '1st_term' | '2nd_term' | 'summer'

export type EmployeeSchedulesBundle = {
  teaching: any[]
  exam: any[]
}

const parseJsonResponse = async (res: Response) => {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((body as any)?.error || `Request failed (${res.status})`)
  }
  return body
}

export async function getSchedulesForEmployees(
  employeeIds: number[],
  term?: ScheduleTerm
): Promise<EmployeeSchedulesBundle> {
  const normalizedIds = Array.from(
    new Set(
      (employeeIds || [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  )

  if (normalizedIds.length === 0) {
    return { teaching: [], exam: [] }
  }

  const params = new URLSearchParams({
    employee_ids: normalizedIds.join(','),
  })

  if (term) {
    params.set('term', term)
  }

  const payload = await parseJsonResponse(
    await fetch(`/api/schedules/employee?${params.toString()}`, { cache: 'no-store' })
  )

  const teaching = Array.isArray((payload as any)?.teaching) ? (payload as any).teaching : []
  const exam = Array.isArray((payload as any)?.exam) ? (payload as any).exam : []

  return { teaching, exam }
}

export function groupSchedulesByEmployee<T extends { employee_id?: number | string | null }>(
  rows: T[]
): Record<number, T[]> {
  return (rows || []).reduce<Record<number, T[]>>((acc, row) => {
    const employeeId = Number(row?.employee_id)
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return acc
    }

    if (!acc[employeeId]) {
      acc[employeeId] = []
    }

    acc[employeeId].push(row)
    return acc
  }, {})
}
