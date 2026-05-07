/**
 * DTR Reports Helper Functions
 * Efficient queries for retrieving and managing DTR reports
 */

import { dbQuery } from './db'

export interface DTRReportSummary {
  report_id: number
  employee_id: number
  employee_name: string
  employee_school_id: string
  department: string
  date_from: string
  date_to: string
  total_present: number
  total_late: number
  total_absent: number
  total_early_out: number
  total_admin_time: number
  total_late_minutes: number
  total_undertime_minutes: number
  cutoff_period: string
  school_year: string
  semester: string
  generated_by: string
  generated_at: string
}

/**
 * Get DTR reports for an employee within a date range
 */
export async function getDTRReports(
  employeeId: number,
  dateFrom?: string,
  dateTo?: string
): Promise<DTRReportSummary[]> {
  const rows = await dbQuery<DTRReportSummary>(
    `SELECT *
     FROM dtr_reports_summary
     WHERE employee_id = $1
       AND ($2::date IS NULL OR date_from >= $2::date)
       AND ($3::date IS NULL OR date_to <= $3::date)
     ORDER BY generated_at DESC`,
    [employeeId, dateFrom || null, dateTo || null]
  )

  return rows || []
}

/**
 * Get all DTR reports for a department
 */
export async function getDepartmentDTRReports(
  department: string,
  limit: number = 50
): Promise<DTRReportSummary[]> {
  const rows = await dbQuery<DTRReportSummary>(
    `SELECT *
     FROM dtr_reports_summary
     WHERE department = $1
     ORDER BY generated_at DESC
     LIMIT $2`,
    [department, limit]
  )

  return rows || []
}

/**
 * Get recent DTR reports across all employees
 */
export async function getRecentDTRReports(
  limit: number = 20
): Promise<DTRReportSummary[]> {
  const rows = await dbQuery<DTRReportSummary>(
    `SELECT *
     FROM dtr_reports_summary
     ORDER BY generated_at DESC
     LIMIT $1`,
    [limit]
  )

  return rows || []
}

/**
 * Check if a DTR report already exists for an employee and date range
 */
export async function checkExistingDTR(
  employeeId: number,
  dateFrom: string,
  dateTo: string
): Promise<DTRReportSummary | null> {
  const rows = await dbQuery<DTRReportSummary>(
    `SELECT *
     FROM dtr_reports_summary
     WHERE employee_id = $1
       AND date_from = $2::date
       AND date_to = $3::date
     ORDER BY generated_at DESC
     LIMIT 1`,
    [employeeId, dateFrom, dateTo]
  )

  return rows[0] || null
}

/**
 * Get paired attendance logs (IN and OUT) for DTR generation
 * This efficiently groups logs by date and pairs them
 */
export async function getPairedAttendanceLogs(
  employeeId: number,
  dateFrom: string,
  dateTo: string
) {
  const logs = await dbQuery<any>(
    `SELECT *
     FROM attendance_logs
     WHERE employee_id = $1
       AND date >= $2::date
       AND date <= $3::date
     ORDER BY date ASC, log_time ASC`,
    [employeeId, dateFrom, dateTo]
  )

  // Group logs by date and pair IN/OUT
  const logsByDate: { [date: string]: { inLog?: any; outLog?: any } } = {}

  logs?.forEach((log) => {
    if (!logsByDate[log.date]) {
      logsByDate[log.date] = {}
    }
    if (log.log_type === 'IN') {
      logsByDate[log.date].inLog = log
    } else if (log.log_type === 'OUT') {
      logsByDate[log.date].outLog = log
    }
  })

  // Transform to paired format
  return Object.entries(logsByDate).map(([date, { inLog, outLog }]) => ({
    date,
    employee_id: employeeId,
    time_in: inLog?.log_time || null,
    time_out: outLog?.log_time || null,
    attendance_status: inLog?.attendance_status || outLog?.attendance_status || null,
    is_late: inLog?.is_late || false,
    late_minutes: inLog?.late_minutes || 0,
    is_early_out: outLog?.is_early_out || false,
    undertime_minutes: outLog?.undertime_minutes || 0,
    scheduled_time_in: '08:00:00',
    scheduled_time_out: '17:00:00'
  }))
}

/**
 * Delete a DTR report by ID
 */
export async function deleteDTRReport(reportId: number): Promise<boolean> {
  await dbQuery(
    `DELETE FROM reports
     WHERE report_id = $1
       AND report_type = 'DTR'`,
    [reportId]
  )

  return true
}

/**
 * Get DTR report statistics for a date range
 */
export async function getDTRStatistics(dateFrom: string, dateTo: string) {
  const data = await dbQuery<any>(
    `SELECT *
     FROM dtr_reports_summary
     WHERE date_from >= $1::date
       AND date_to <= $2::date`,
    [dateFrom, dateTo]
  )

  // Calculate aggregate statistics
  const stats = {
    total_reports: data?.length || 0,
    total_employees: new Set(data?.map((r) => r.employee_id)).size,
    total_present_days: data?.reduce((sum, r) => sum + (r.total_present || 0), 0) || 0,
    total_late_days: data?.reduce((sum, r) => sum + (r.total_late || 0), 0) || 0,
    total_absent_days: data?.reduce((sum, r) => sum + (r.total_absent || 0), 0) || 0,
    total_admin_time_days: data?.reduce((sum, r) => sum + (r.total_admin_time || 0), 0) || 0,
    departments: [...new Set(data?.map((r) => r.department))]
  }

  return stats
}
