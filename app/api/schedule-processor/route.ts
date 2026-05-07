import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

class ScheduleProcessorService {
  private static instance: ScheduleProcessorService

  static getInstance(): ScheduleProcessorService {
    if (!ScheduleProcessorService.instance) {
      ScheduleProcessorService.instance = new ScheduleProcessorService()
    }
    return ScheduleProcessorService.instance
  }

  private getManilaDayIndex() {
    const manilaNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }))
    const jsDay = manilaNow.getDay()
    return jsDay === 0 ? null : (jsDay as 1|2|3|4|5|6)
  }

  private getManilaTodayYmd() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  }

  private timeToMinutes(time?: string) {
    if (!time) return Number.POSITIVE_INFINITY
    const [h, m] = time.split(':').map(Number)
    return h * 60 + m
  }

  private timeToMinutesEnd(time?: string) {
    if (!time) return Number.NEGATIVE_INFINITY
    const [h, m] = time.split(':').map(Number)
    return h * 60 + m
  }

  private async updateEmployeeSchedule(employee: any, dayIdx: number) {
    const today = this.getManilaTodayYmd()
    
    // CRITICAL: Check if there's an exam schedule for today first
    // If exam_date matches today, use exam schedule instead of class schedule
    const examSched = await dbQuery<{ time_start: string; time_end: string }>(
      `SELECT time_start, time_end
       FROM exam_schedules
       WHERE employee_id = $1
         AND exam_date = $2
         AND (day_of_week IS NULL OR day_of_week = $3)`,
      [employee.employee_id, today, dayIdx]
    )

    if (examSched && examSched.length > 0) {
      // Use exam schedule for today
      const earliest = examSched.reduce((min, r) => 
        (this.timeToMinutes(r.time_start as any) < this.timeToMinutes(min) ? (r.time_start as any) : min), 
        (examSched[0]?.time_start as any)
      )
      const latest = examSched.reduce((max, r) => 
        (this.timeToMinutesEnd(r.time_end as any) > this.timeToMinutesEnd(max) ? (r.time_end as any) : max), 
        (examSched[0]?.time_end as any)
      )

      if (earliest && latest) {
        const desiredIn = earliest.length === 5 ? `${earliest}:00` : earliest
        const desiredOut = latest.length === 5 ? `${latest}:00` : latest
        
        if (desiredIn !== employee.schedule_time_in || desiredOut !== employee.schedule_time_out) {
          await dbQuery(
            `UPDATE employees
             SET schedule_time_in = $1,
                 schedule_time_out = $2,
                 updated_at = $3
             WHERE employee_id = $4`,
            [desiredIn, desiredOut, new Date().toISOString(), employee.employee_id]
          )
          return true
        }
        return false
      }
    }
    
    // No exam schedule for today - use regular class schedule based on day_of_week
    const sched = await dbQuery<{ time_start: string; time_end: string }>(
      `SELECT time_start, time_end
       FROM teaching_schedules
       WHERE employee_id = $1
         AND day_of_week = $2`,
      [employee.employee_id, dayIdx]
    )

    if (!sched || sched.length === 0) return false

    const earliest = sched.reduce((min, r) => 
      (this.timeToMinutes(r.time_start as any) < this.timeToMinutes(min) ? (r.time_start as any) : min), 
      (sched[0]?.time_start as any)
    )
    const latest = sched.reduce((max, r) => 
      (this.timeToMinutesEnd(r.time_end as any) > this.timeToMinutesEnd(max) ? (r.time_end as any) : max), 
      (sched[0]?.time_end as any)
    )

    if (!earliest || !latest) return false

    const desiredIn = earliest.length === 5 ? `${earliest}:00` : earliest
    const desiredOut = latest.length === 5 ? `${latest}:00` : latest
    
    if (desiredIn !== employee.schedule_time_in || desiredOut !== employee.schedule_time_out) {
      await dbQuery(
        `UPDATE employees
         SET schedule_time_in = $1,
             schedule_time_out = $2,
             updated_at = $3
         WHERE employee_id = $4`,
        [desiredIn, desiredOut, new Date().toISOString(), employee.employee_id]
      )
      return true
    }
    return false
  }

  async processSchedules() {
    console.log("[ScheduleProcessor] Processing schedules for today")
    
    const dayIdx = this.getManilaDayIndex()
    if (!dayIdx) {
      console.log("[ScheduleProcessor] Sunday: no update needed")
      return { success: true, updated: 0, message: 'Sunday: no update' }
    }

    const employees = await dbQuery<any>(
      `SELECT employee_id, staff_type, schedule_time_in, schedule_time_out
       FROM employees`
    )

    let updated = 0
    for (const emp of employees || []) {
      if ((emp as any).staff_type && (emp as any).staff_type !== 'Teaching') continue
      
      const wasUpdated = await this.updateEmployeeSchedule(emp, dayIdx)
      if (wasUpdated) updated++
    }

    console.log("[ScheduleProcessor] Updated", updated, "employee schedules")
    return { success: true, updated }
  }
}

export async function POST(req: NextRequest) {
  try {
    const scheduleProcessorService = ScheduleProcessorService.getInstance()
    const result = await scheduleProcessorService.processSchedules()
    return NextResponse.json(result)
  } catch (e: any) {
    console.error("[ScheduleProcessor] Error processing schedules:", e)
    return NextResponse.json({ success: false, error: e?.message || 'Failed to update schedules' }, { status: 500 })
  }
}


