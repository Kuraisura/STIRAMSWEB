import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'
import { getAuditContext, recordLogTrailChange } from '@/lib/audit'
import { validateSession } from '@/lib/session-manager'
import { logRealtimeActivity } from '@/lib/realtime-monitor'

class EmployeeDeleteService {
  private static instance: EmployeeDeleteService

  static getInstance(): EmployeeDeleteService {
    if (!EmployeeDeleteService.instance) {
      EmployeeDeleteService.instance = new EmployeeDeleteService()
    }
    return EmployeeDeleteService.instance
  }

  private async safeDeleteEq(table: string, column: string, value: any) {
    try { 
      await dbQuery(
        `DELETE FROM ${table}
         WHERE ${column} = $1`,
        [value]
      )
    } catch (err) {
      console.warn(`[Employees] [delete-eq] ${table}.${column} ->`, (err as any)?.message || err)
    }
  }

  private async safeDeleteWhere(table: string, filters: Record<string, any>) {
    try {
      const entries = Object.entries(filters)
      if (entries.length === 0) return

      const whereClause = entries.map(([k], idx) => `${k} = $${idx + 1}`).join(' AND ')
      const params = entries.map(([, v]) => v)

      await dbQuery(
        `DELETE FROM ${table}
         WHERE ${whereClause}`,
        params
      )
    } catch (err) {
      console.warn(`[Employees] [delete-where] ${table} ->`, (err as any)?.message || err)
    }
  }

  async deleteEmployee(
    employeeId: number,
    actor: { user_id?: number; user_email?: string; user_name?: string; user_type?: 'admin' | 'employee' | 'system' },
    context?: ReturnType<typeof getAuditContext>,
    sessionId?: string,
  ) {
    console.log("[Employees] Delete request received for employee:", employeeId)
    
    if (!employeeId || typeof employeeId !== 'number') {
      throw new Error('Invalid employeeId')
    }

    await this.safeDeleteWhere('audit_trail', { user_id: employeeId, user_type: 'employee' })
    await this.safeDeleteEq('notifications', 'recipient_id', employeeId)
    await this.safeDeleteWhere('notifications', { recipient_id: employeeId, recipient_type: 'employee' })
    await this.safeDeleteEq('verification_requests', 'requested_by', employeeId)
    await this.safeDeleteEq('verification_requests', 'employee_id', employeeId)
    await this.safeDeleteEq('attendance_logs', 'employee_id', employeeId)
    await this.safeDeleteEq('teaching_schedules', 'employee_id', employeeId)
    await this.safeDeleteEq('exam_schedules', 'employee_id', employeeId)
    await this.safeDeleteEq('attendance_daily_status', 'employee_id', employeeId)

    console.log("[Employees] Deleting employee:", employeeId)
    const prevRows = await dbQuery<any>(
      `SELECT *
       FROM employees
       WHERE employee_id = $1
       LIMIT 1`,
      [employeeId]
    )
    const prev = prevRows[0] || null

    const deletedRows = await dbQuery<{ employee_id: number }>(
      `DELETE FROM employees
       WHERE employee_id = $1
       RETURNING employee_id`,
      [employeeId]
    )
    if (!deletedRows[0]) {
      throw new Error('Failed to delete employee')
    }

    console.log("[Employees] Employee deleted successfully")
    await recordLogTrailChange({
      actor,
      action: 'delete:employees',
      table: 'employees',
      recordId: employeeId,
      oldValue: prev,
      context,
      extra: {
        session_id: sessionId,
        source: 'api/employees/delete:POST',
      },
    })
    return { success: true }
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await validateSession(req)
    if (!session.valid || !session.user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    const employeeDeleteService = EmployeeDeleteService.getInstance()
    const { employeeId } = await req.json()
    const context = getAuditContext(req)
    const actor = {
      user_id: session.user.id,
      user_email: session.user.email,
      user_name: session.user.name,
      user_type: 'admin' as const,
    }
    
    const result = await employeeDeleteService.deleteEmployee(employeeId, actor, context, session.sessionId)

    logRealtimeActivity({
      request: req,
      action: 'employee:delete',
      status: 200,
      sessionId: session.sessionId,
      userId: actor.user_id,
      userEmail: actor.user_email,
      details: { employee_id: employeeId },
    })

    return NextResponse.json(result)
  } catch (e: any) {
    console.error('[Employees] api/employees/delete error:', e)

    logRealtimeActivity({
      request: req,
      action: 'employee:delete_failed',
      status: 500,
      details: { error: e?.message || 'Unexpected error' },
    })

    return NextResponse.json({ success: false, error: e?.message || 'Unexpected error' }, { status: 500 })
  }
}


