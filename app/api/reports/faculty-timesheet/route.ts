import { NextRequest } from 'next/server'
import { generateFacultyTimesheetExcel, generateDailyTimeRecordExcel } from '@/lib/utils'
import { dbQuery } from '@/lib/db'
import { getAttendanceForDateRange } from '@/lib/dtr-attendance-helper'

export const dynamic = 'force-dynamic'

class ReportGenerationService {
  private static instance: ReportGenerationService

  static getInstance(): ReportGenerationService {
    if (!ReportGenerationService.instance) {
      ReportGenerationService.instance = new ReportGenerationService()
    }
    return ReportGenerationService.instance
  }

  private async generateDTRReport(employeeId: number, periodStart: string, periodEnd: string, emp: any) {
    console.log("[Reports] Generating DTR report for employee:", employeeId)

    const dtrRowsRaw: any[] = await getAttendanceForDateRange(employeeId, periodStart, periodEnd)
    
    // Validate minimum logs requirement (at least 4 logs)
    const validLogs = (dtrRowsRaw || []).filter(r => r && (r.timeIn || r.timeOut))
    if (validLogs.length < 4) {
      throw new Error(`Insufficient attendance data. Employee has only ${validLogs.length} log(s) in the cutoff period. Minimum 4 logs required to generate DTR.`)
    }
    
    const dtrRows = (dtrRowsRaw || []).map(r => ({
      date: r.date,
      day: new Date(r.date).toLocaleDateString(undefined, { weekday: 'long' }),
      timeIn: r.timeIn,
      timeOut: r.timeOut,
      status: r.status,
    }))

    return await generateDailyTimeRecordExcel({
      employeeName: emp.full_name,
      department: emp.department,
      schoolId: emp.school_id,
      periodStart,
      periodEnd,
      workHoursLabel: emp.schedule_time_in && emp.schedule_time_out ? 
        `${String(emp.schedule_time_in).slice(0,5)} - ${String(emp.schedule_time_out).slice(0,5)}` : undefined,
      rows: dtrRows,
    })
  }

  private async generateTimesheetReport(employeeId: number, periodStart: string, periodEnd: string, emp: any) {
    console.log("[Reports] Generating timesheet report for employee:", employeeId)

    const sched = await dbQuery<any>(
      `SELECT
         ts.*,
         c.code AS course_code,
         r.code AS room_code
       FROM teaching_schedules ts
       LEFT JOIN courses c ON c.course_id = ts.course_id
       LEFT JOIN rooms r ON r.room_id = ts.room_id
       WHERE ts.employee_id = $1
       ORDER BY ts.day_of_week ASC, ts.time_start ASC`,
      [employeeId]
    )
    const rows = (sched || []).map((s: any) => ({
      subjectCode: s.subject_name || s.courses?.code || s.course_code || '',
      section: s.section || '',
      day: ['Mon','Tue','Wed','Thu','Fri','Sat'][Math.max(1, Math.min(6, s.day_of_week)) - 1] || '',
      time: `${String(s.time_start || '').slice(0,5)} - ${String(s.time_end || '').slice(0,5)}`,
      room: s.rooms?.code || s.room_code || '',
      totalHours: s.time_start && s.time_end ? 
        (new Date(`2000-01-01T${s.time_end}`).getTime() - new Date(`2000-01-01T${s.time_start}`).getTime())/3600000 : undefined
    }))

    return await generateFacultyTimesheetExcel({
      facultyName: emp.full_name,
      schoolYear: new Date().getFullYear().toString(),
      semester: '1st',
      periodStart,
      periodEnd,
      rows,
    })
  }

  async generateReport(employeeId: number, periodStart: string, periodEnd: string, type: string) {
    console.log("[Reports] Generating report - Type:", type, "Employee:", employeeId, "Period:", periodStart, "to", periodEnd)

    if (!employeeId) {
      throw new Error('employee_id is required')
    }

    const employeeRows = await dbQuery<any>(
      `SELECT *
       FROM employees
       WHERE employee_id = $1
       LIMIT 1`,
      [employeeId]
    )
    const emp = employeeRows[0]
    if (!emp) throw new Error('Employee not found')

    let blob: Blob
    if (type === 'dtr') {
      blob = await this.generateDTRReport(employeeId, periodStart, periodEnd, emp)
    } else {
      blob = await this.generateTimesheetReport(employeeId, periodStart, periodEnd, emp)
    }

    const ab = await blob.arrayBuffer()
    console.log("[Reports] Report generated successfully for employee:", employeeId)
    
    return {
      buffer: Buffer.from(ab),
      filename: `${type === 'dtr' ? 'DTR' : 'Timesheet'}-${emp.full_name}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
  }
}

export async function GET(req: NextRequest) {
  try {
    const reportGenerationService = ReportGenerationService.getInstance()
    const { searchParams } = new URL(req.url)
    const employeeId = Number(searchParams.get('employee_id'))
    const periodStart = searchParams.get('start') || new Date().toISOString().slice(0,10)
    const periodEnd = searchParams.get('end') || new Date().toISOString().slice(0,10)
    const type = (searchParams.get('type') || 'timesheet').toLowerCase()

    const result = await reportGenerationService.generateReport(employeeId, periodStart, periodEnd, type)
    
    return new Response(result.buffer, {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`
      }
    })
  } catch (e: any) {
    console.error("[Reports] Error generating report:", e)
    return new Response(e?.message || 'Failed', { status: 500 })
  }
}


