import { type NextRequest, NextResponse } from "next/server"
import { emailService } from "@/lib/email-service"
import { dbQuery } from '@/lib/db'

interface DTREmailRequest {
  employeeIds: number[]
  dateFrom: string
  dateTo: string
}

export async function POST(request: NextRequest) {
  try {
    const body: DTREmailRequest = await request.json()
    const { employeeIds, dateFrom, dateTo } = body

    if (!employeeIds || employeeIds.length === 0) {
      return NextResponse.json(
        { error: 'No employees selected' },
        { status: 400 }
      )
    }

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: 'Date range is required' },
        { status: 400 }
      )
    }

    // Fetch employees with their data
    const employees = await dbQuery<any>(
      `SELECT *
       FROM employees
       WHERE employee_id = ANY($1::int[])`,
      [employeeIds]
    )

    if (!employees) {
      return NextResponse.json(
        { error: 'Failed to fetch employees' },
        { status: 500 }
      )
    }

    // Fetch attendance logs for all employees in date range
    let logs: any[] = []
    try {
      logs = await dbQuery<any>(
        `SELECT *
         FROM attendance_logs
         WHERE employee_id = ANY($1::int[])
           AND date >= $2
           AND date <= $3
         ORDER BY date ASC, log_time ASC`,
        [employeeIds, dateFrom, dateTo]
      )
    } catch (logsError) {
      console.error('[DTR Email] Error fetching logs:', logsError)
    }

    const results = []
    let successCount = 0
    let failCount = 0

    // Process each employee
    for (const employee of employees) {
      try {
        // Filter logs for this employee
        const employeeLogs = logs?.filter(log => log.employee_id === employee.employee_id) || []

        // Calculate DTR statistics
        const daysPresent = new Set(employeeLogs.map(log => log.date)).size
        let totalLateMinutes = 0
        let totalUndertimeMinutes = 0
        let daysLate = 0

        // Group logs by date
        const logsByDate: Record<string, any[]> = {}
        employeeLogs.forEach(log => {
          if (!logsByDate[log.date]) {
            logsByDate[log.date] = []
          }
          logsByDate[log.date].push(log)
        })

        // Calculate late and undertime
        Object.values(logsByDate).forEach(dateLogs => {
          const inLog = dateLogs.find(l => l.type === 'IN')
          const outLog = dateLogs.find(l => l.type === 'OUT')

          if (inLog?.minutes_late && inLog.minutes_late > 0) {
            totalLateMinutes += inLog.minutes_late
            daysLate++
          }

          if (outLog?.minutes_undertime && outLog.minutes_undertime > 0) {
            totalUndertimeMinutes += outLog.minutes_undertime
          }
        })

        // Determine status
        let status = 'On Time'
        let statusColor = 'green'
        
        if (totalLateMinutes > 0 && totalUndertimeMinutes > 0) {
          status = 'Late & Undertime'
          statusColor = 'red'
        } else if (totalLateMinutes > 0) {
          status = 'Late'
          statusColor = 'orange'
        } else if (totalUndertimeMinutes > 0) {
          status = 'Undertime'
          statusColor = 'orange'
        }

        // Format time
        const formatMinutes = (mins: number) => {
          const hours = Math.floor(mins / 60)
          const minutes = mins % 60
          if (hours === 0) return `${minutes}m`
          return `${hours}h ${minutes}m`
        }

        // Build email HTML
        const emailHTML = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Daily Time Record</title>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; }
                .container { max-width: 600px; margin: 20px auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                .header { text-align: center; border-bottom: 3px solid #0066cc; padding-bottom: 20px; margin-bottom: 30px; }
                .header h1 { color: #0066cc; margin: 0 0 10px 0; font-size: 28px; }
                .header p { color: #666; margin: 0; font-size: 14px; }
                .info-grid { display: table; width: 100%; margin: 20px 0; }
                .info-row { display: table-row; }
                .info-label { display: table-cell; padding: 8px 12px; font-weight: bold; color: #555; width: 40%; background: #f8f8f8; border: 1px solid #eee; }
                .info-value { display: table-cell; padding: 8px 12px; border: 1px solid #eee; }
                .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 20px 0; }
                .stat-card { background: #f8f9fa; border-left: 4px solid #0066cc; padding: 15px; border-radius: 4px; }
                .stat-card h3 { margin: 0 0 8px 0; color: #666; font-size: 12px; text-transform: uppercase; }
                .stat-card .value { font-size: 24px; font-weight: bold; color: #0066cc; }
                .status-badge { display: inline-block; padding: 6px 12px; border-radius: 4px; font-weight: bold; font-size: 14px; margin: 15px 0; }
                .status-green { background-color: #d4edda; color: #155724; }
                .status-orange { background-color: #fff3cd; color: #856404; }
                .status-red { background-color: #f8d7da; color: #721c24; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; font-size: 12px; color: #666; }
                @media only screen and (max-width: 600px) {
                  .container { padding: 15px; }
                  .stats-grid { grid-template-columns: 1fr; }
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Daily Time Record</h1>
                  <p>STI College Santa Rosa - RAMS System</p>
                </div>

                <div class="info-grid">
                  <div class="info-row">
                    <div class="info-label">Employee Name</div>
                    <div class="info-value">${employee.full_name}</div>
                  </div>
                  <div class="info-row">
                    <div class="info-label">School ID</div>
                    <div class="info-value">${employee.school_id}</div>
                  </div>
                  <div class="info-row">
                    <div class="info-label">Department</div>
                    <div class="info-value">${employee.department || 'N/A'}</div>
                  </div>
                  <div class="info-row">
                    <div class="info-label">Period</div>
                    <div class="info-value">${new Date(dateFrom).toLocaleDateString()} - ${new Date(dateTo).toLocaleDateString()}</div>
                  </div>
                </div>

                <div style="text-align: center;">
                  <span class="status-badge status-${statusColor}">${status}</span>
                </div>

                <div class="stats-grid">
                  <div class="stat-card">
                    <h3>Days Present</h3>
                    <div class="value">${daysPresent}</div>
                  </div>
                  <div class="stat-card">
                    <h3>Days Late</h3>
                    <div class="value">${daysLate}</div>
                  </div>
                  <div class="stat-card">
                    <h3>Total Late Time</h3>
                    <div class="value">${formatMinutes(totalLateMinutes)}</div>
                  </div>
                  <div class="stat-card">
                    <h3>Total Undertime</h3>
                    <div class="value">${formatMinutes(totalUndertimeMinutes)}</div>
                  </div>
                </div>

                <div class="footer">
                  <p><strong>STI College Santa Rosa</strong></p>
                  <p>Resource Attendance Monitoring System (RAMS)</p>
                  <p style="margin-top: 10px; color: #999;">This is an automated email. Please do not reply.</p>
                </div>
              </div>
            </body>
          </html>
        `

        // Send email
        if (employee.email) {
          const emailResult = await emailService.sendEmail({
            to: employee.email,
            subject: `Daily Time Record - ${new Date(dateFrom).toLocaleDateString()} to ${new Date(dateTo).toLocaleDateString()}`,
            html: emailHTML,
            text: `DTR for ${employee.full_name}: ${daysPresent} days present, ${formatMinutes(totalLateMinutes)} late, ${formatMinutes(totalUndertimeMinutes)} undertime.`
          })

          if (emailResult.success) {
            successCount++
            results.push({
              employee_id: employee.employee_id,
              employee_name: employee.full_name,
              email: employee.email,
              success: true,
              status
            })
          } else {
            failCount++
            results.push({
              employee_id: employee.employee_id,
              employee_name: employee.full_name,
              email: employee.email,
              success: false,
              error: emailResult.error,
              status
            })
          }
        } else {
          failCount++
          results.push({
            employee_id: employee.employee_id,
            employee_name: employee.full_name,
            email: null,
            success: false,
            error: 'No email address',
            status
          })
        }

      } catch (error: any) {
        failCount++
        results.push({
          employee_id: employee.employee_id,
          employee_name: employee.full_name,
          email: employee.email,
          success: false,
          error: error.message || 'Unknown error',
          status: 'Error'
        })
      }
    }

    return NextResponse.json({
      success: true,
      totalEmployees: employees.length,
      successCount,
      failCount,
      results
    })

  } catch (error: any) {
    console.error('[DTR Email] Bulk email error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
