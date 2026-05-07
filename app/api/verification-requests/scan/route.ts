import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

function toDateOnly(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toISOString().slice(0, 10)
}

function listDatesInclusive(start: string, end: string): string[] {
  const dates: string[] = []
  const cursor = new Date(start + 'T00:00:00+08:00')
  const last = new Date(end + 'T00:00:00+08:00')

  while (cursor <= last) {
    dates.push(toDateOnly(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  return dates
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { employee_id, start, end, schedule_in, schedule_out } = body || {}
    if (!employee_id || !start || !end) {
      return NextResponse.json({ error: 'Missing employee_id/start/end' }, { status: 400 })
    }

    const employeeId = Number(employee_id)
    const startDate = String(start)
    const endDate = String(end)

    const logs = await dbQuery<any>(
      `SELECT log_id, date, log_time, log_type, attendance_status, is_late
       FROM attendance_logs
       WHERE employee_id = $1
         AND date >= $2
         AND date <= $3
       ORDER BY date ASC, log_time ASC`,
      [employeeId, startDate, endDate]
    )

    const byDate = new Map<string, any[]>()
    for (const row of logs) {
      const key = row.date || toDateOnly(row.log_time)
      if (!byDate.has(key)) byDate.set(key, [])
      byDate.get(key)!.push(row)
    }

    const rows = listDatesInclusive(startDate, endDate).map((date) => {
      const dayLogs = byDate.get(date) || []
      const inLog = dayLogs.find((r: any) => r.log_type === 'IN')
      const hasLate = dayLogs.some((r: any) => r.is_late === true || String(r.attendance_status || '').toLowerCase().includes('late'))

      if (dayLogs.length === 0) {
        return { date, status: 'absent', timeIn: null }
      }

      if (hasLate) {
        const timeIn = inLog?.log_time ? String(inLog.log_time).split('T')[1]?.split('+')[0] : null
        return { date, status: 'late', timeIn }
      }

      return { date, status: 'present', timeIn: null }
    })

    const suggestions = rows
      .filter((r: any) => r.status === 'absent' || String(r.status).includes('late'))
      .map((r: any) => {
        if (r.status === 'absent') {
          return {
            date: r.date,
            status: r.status,
            request_type: 'leave',
            requested_time: `${r.date}T00:00:00`,
            reason: 'Auto-detected absence',
          }
        }
        return {
          date: r.date,
          status: r.status,
          request_type: 'late_justification',
          requested_time: `${r.date}T${r.timeIn || '08:00:00'}`,
          reason: 'Auto-detected late arrival',
        }
      })

    return NextResponse.json({ suggestions })
  } catch (e: any) {
    console.error('verification-requests scan error:', e?.message || e)
    return NextResponse.json({ error: 'Failed to scan attendance' }, { status: 500 })
  }
}


