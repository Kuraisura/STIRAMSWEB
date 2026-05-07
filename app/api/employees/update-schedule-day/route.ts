import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const { scheduleId, scheduleType, newDayOfWeek } = await req.json()

    if (!scheduleId || !scheduleType || !newDayOfWeek) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Validate day of week (1-6 for Monday-Saturday)
    if (newDayOfWeek < 1 || newDayOfWeek > 6) {
      return NextResponse.json({ error: 'Invalid day of week' }, { status: 400 })
    }

    let updateResult

    if (scheduleType === 'teaching') {
      // Update teaching schedule - only update day_of_week, preserve all other fields
      const rows = await dbQuery(
        `UPDATE teaching_schedules
         SET day_of_week = $1
         WHERE schedule_id = $2
         RETURNING *`,
        [newDayOfWeek, scheduleId]
      )

      const data = rows[0]
      if (!data) {
        return NextResponse.json({ error: 'Schedule not found or update failed' }, { status: 404 })
      }
      
      // Verify the update was successful
      if (data.day_of_week !== newDayOfWeek) {
        console.error('Update verification failed: day_of_week mismatch', { expected: newDayOfWeek, actual: data.day_of_week })
        return NextResponse.json({ error: 'Update verification failed' }, { status: 500 })
      }
      
      updateResult = data
      console.log(`[Update Schedule] Successfully moved teaching schedule ${scheduleId} to day ${newDayOfWeek}`)
    } else if (scheduleType === 'exam') {
      // Update exam schedule - only update day_of_week, preserve all other fields
      const rows = await dbQuery(
        `UPDATE exam_schedules
         SET day_of_week = $1
         WHERE exam_schedule_id = $2
         RETURNING *`,
        [newDayOfWeek, scheduleId]
      )

      const data = rows[0]
      if (!data) {
        return NextResponse.json({ error: 'Schedule not found or update failed' }, { status: 404 })
      }
      
      // Verify the update was successful
      if (data.day_of_week !== newDayOfWeek) {
        console.error('Update verification failed: day_of_week mismatch', { expected: newDayOfWeek, actual: data.day_of_week })
        return NextResponse.json({ error: 'Update verification failed' }, { status: 500 })
      }
      
      updateResult = data
      console.log(`[Update Schedule] Successfully moved exam schedule ${scheduleId} to day ${newDayOfWeek}`)
    } else {
      return NextResponse.json({ error: 'Invalid schedule type' }, { status: 400 })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Schedule day updated successfully',
      data: updateResult
    })
  } catch (e: any) {
    console.error('update-schedule-day POST error:', e?.message || e)
    return NextResponse.json({ error: 'Failed to update schedule day' }, { status: 500 })
  }
}

