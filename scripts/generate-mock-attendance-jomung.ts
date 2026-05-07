/**
 * MOCK ATTENDANCE GENERATOR FOR JOMUNG DE CASTRO
 * 
 * This script generates realistic attendance logs for Jomung De Castro (employee_id: 5)
 * from October 26, 2025 to November 10, 2025.
 * 
 * It automatically:
 * 1. Retrieves his actual class schedule
 * 2. Generates attendance logs that align with his schedule
 * 3. Calculates Admin Time correctly (early arrival, overtime, vacant periods)
 * 4. Creates varied scenarios (on-time, late, undertime, admin time days)
 */

import { dbQuery } from '../lib/db'
import { format, addDays, parse, startOfDay } from 'date-fns'

const EMPLOYEE_ID = 5 // Jomung De Castro
const START_DATE = '2025-10-26'
const END_DATE = '2025-11-10'

interface ClassSchedule {
  schedule_id: number
  day_of_week: number // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  time_start: string // HH:mm:ss
  time_end: string // HH:mm:ss
  subject_name: string
  section: string
  room_id?: number
  class_type?: string
}

interface AttendanceScenario {
  date: string
  timeInOffset: number // Minutes before/after first class (negative = early, positive = late)
  timeOutOffset: number // Minutes before/after last class (negative = early, positive = late)
  isAdminTimeDay?: boolean // True if no classes scheduled
  skipDay?: boolean // True for rest days
}

/**
 * STEP 1: Retrieve Jomung's class schedule
 */
async function getEmployeeSchedule(employeeId: number): Promise<ClassSchedule[]> {
  console.log(`📚 Fetching schedule for employee ID: ${employeeId}`)
  
  const data = await dbQuery<ClassSchedule>(
    `SELECT *
     FROM teaching_schedules
     WHERE employee_id = $1
     ORDER BY day_of_week ASC, time_start ASC`,
    [employeeId]
  )

  if (!data || data.length === 0) {
    console.warn('⚠️  No teaching schedules found for this employee')
    return []
  }

  console.log(`✅ Found ${data.length} scheduled classes`)
  data.forEach((cls: any) => {
    const dayName = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][cls.day_of_week]
    console.log(`   - ${dayName}: ${cls.time_start} - ${cls.time_end} | ${cls.subject_name} (${cls.section})`)
  })

  return data as ClassSchedule[]
}

/**
 * STEP 2: Get schedule for a specific day
 */
function getScheduleForDay(schedules: ClassSchedule[], dayOfWeek: number): ClassSchedule[] {
  return schedules.filter(s => s.day_of_week === dayOfWeek)
}

/**
 * STEP 3: Parse time string to Date object on a specific date
 */
function parseTimeToDate(dateStr: string, timeStr: string): Date {
  // Remove seconds if present
  const time = timeStr.substring(0, 5) // HH:mm
  return parse(`${dateStr} ${time}`, 'yyyy-MM-dd HH:mm', new Date())
}

/**
 * STEP 4: Add minutes to a time
 */
function addMinutesToTime(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000)
}

/**
 * STEP 5: Generate attendance scenarios
 * This creates varied and realistic attendance patterns
 */
function generateAttendanceScenarios(): AttendanceScenario[] {
  return [
    // Oct 26, 2025 - Sunday (REST DAY) - EXCLUDED
    // { date: '2025-10-26', timeInOffset: 0, timeOutOffset: 0, skipDay: true },
    
    // Oct 27, 2025 - Monday (Early arrival, On-time departure)
    { date: '2025-10-27', timeInOffset: -10, timeOutOffset: 0 },
    
    // Oct 28, 2025 - Tuesday (Early arrival, Overtime)
    { date: '2025-10-28', timeInOffset: -15, timeOutOffset: 10 },
    
    // Oct 29, 2025 - Wednesday (Late arrival)
    { date: '2025-10-29', timeInOffset: 5, timeOutOffset: 0 },
    
    // Oct 30, 2025 - Thursday (Early arrival, Early departure/Undertime)
    { date: '2025-10-30', timeInOffset: -5, timeOutOffset: -5 },
    
    // Oct 31, 2025 - Friday (Early arrival, Overtime)
    { date: '2025-10-31', timeInOffset: -10, timeOutOffset: 15 },
    
    // Nov 1, 2025 - Saturday (On-time both ways)
    { date: '2025-11-01', timeInOffset: 0, timeOutOffset: 0 },
    
    // Nov 2, 2025 - Sunday (REST DAY) - EXCLUDED
    // { date: '2025-11-02', timeInOffset: 0, timeOutOffset: 0, skipDay: true },
    
    // Nov 3, 2025 - Monday (Admin Time Day - No classes, came in for admin work)
    { date: '2025-11-03', timeInOffset: 0, timeOutOffset: 0, isAdminTimeDay: true },
    
    // Nov 4, 2025 - Tuesday (Perfect on-time)
    { date: '2025-11-04', timeInOffset: 0, timeOutOffset: 0 },
    
    // Nov 5, 2025 - Wednesday (Late by 20 minutes)
    { date: '2025-11-05', timeInOffset: 20, timeOutOffset: 0 },
    
    // Nov 6, 2025 - Thursday (Very early arrival - 30 min admin time)
    { date: '2025-11-06', timeInOffset: -30, timeOutOffset: 0 },
    
    // Nov 7, 2025 - Friday (Early arrival, On-time departure)
    { date: '2025-11-07', timeInOffset: -5, timeOutOffset: 0 },
    
    // Nov 8, 2025 - Saturday (On-time in, slight overtime)
    { date: '2025-11-08', timeInOffset: 0, timeOutOffset: 5 },
    
    // Nov 9, 2025 - Sunday (REST DAY) - EXCLUDED
    // { date: '2025-11-09', timeInOffset: 0, timeOutOffset: 0, skipDay: true },
    
    // Nov 10, 2025 - Monday (Early arrival, Overtime)
    { date: '2025-11-10', timeInOffset: -15, timeOutOffset: 20 },
  ]
}

/**
 * STEP 6: Generate attendance logs
 */
async function generateAttendanceLogs(
  employeeId: number,
  schedules: ClassSchedule[],
  scenarios: AttendanceScenario[]
) {
  console.log('\n📝 Generating attendance logs...\n')

  const employee = (
    await dbQuery<{ rfid_code: string; full_name: string }>(
      `SELECT rfid_code, full_name
       FROM employees
       WHERE employee_id = $1
       LIMIT 1`,
      [employeeId]
    )
  )[0]

  if (!employee) {
    console.error('❌ Error fetching employee: employee not found')
    throw new Error('Employee not found')
  }

  const rfidCode = employee.rfid_code
  const employeeName = employee.full_name
  
  console.log(`👤 Employee: ${employeeName} (RFID: ${rfidCode})\n`)

  const logsToInsert: any[] = []

  for (const scenario of scenarios) {
    const date = new Date(scenario.date)
    const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay() // Convert Sunday=0 to 7
    const dayName = format(date, 'EEEE')
    const dateStr = scenario.date

    console.log(`📅 ${dateStr} (${dayName})`)

    // Skip rest days
    if (scenario.skipDay) {
      console.log('   ⏭️  REST DAY - Skipped\n')
      continue
    }

    // Handle Admin Time Day (no classes)
    if (scenario.isAdminTimeDay) {
      const timeIn = parseTimeToDate(dateStr, '08:00:00')
      const timeOut = parseTimeToDate(dateStr, '12:00:00')
      
      logsToInsert.push({
        employee_id: employeeId,
        rfid_code: rfidCode,
        date: dateStr,
        log_time: timeIn.toISOString(),
        log_type: 'IN',
        attendance_status: 'on-time',  // NOTE: 'admin-time' is not a valid status
        is_late: false,
        is_early_out: false,
      })

      logsToInsert.push({
        employee_id: employeeId,
        rfid_code: rfidCode,
        date: dateStr,
        log_time: timeOut.toISOString(),
        log_type: 'OUT',
        attendance_status: 'on-time',  // NOTE: 'admin-time' is not a valid status
        is_late: false,
        is_early_out: false,
      })

      console.log(`   🔧 ADMIN TIME DAY (No classes scheduled)`)
      console.log(`   ⏰ Time In:  ${format(timeIn, 'hh:mm a')}`)
      console.log(`   ⏰ Time Out: ${format(timeOut, 'hh:mm a')}`)
      console.log(`   📊 Status: on-time (Admin time tracked separately)`)
      console.log(`   ℹ️  Note: Using 'on-time' since 'admin-time' is not allowed by constraint\n`)
      continue
    }

    // Get schedule for this day
    const daySchedule = getScheduleForDay(schedules, dayOfWeek)

    if (daySchedule.length === 0) {
      console.log('   ⚠️  No classes scheduled\n')
      continue
    }

    // Get first and last class times
    const firstClass = daySchedule[0]
    const lastClass = daySchedule[daySchedule.length - 1]

    const firstClassStart = parseTimeToDate(dateStr, firstClass.time_start)
    const lastClassEnd = parseTimeToDate(dateStr, lastClass.time_end)

    // Calculate actual time in/out based on scenario
    const actualTimeIn = addMinutesToTime(firstClassStart, scenario.timeInOffset)
    const actualTimeOut = addMinutesToTime(lastClassEnd, scenario.timeOutOffset)

    // Determine status
    const isLate = scenario.timeInOffset > 0
    const isEarlyOut = scenario.timeOutOffset < 0

    // Calculate admin time
    let adminTimeBefore = 0
    let adminTimeAfter = 0
    
    if (scenario.timeInOffset < 0) {
      adminTimeBefore = Math.abs(scenario.timeInOffset) // Early arrival
    }
    
    if (scenario.timeOutOffset > 0) {
      adminTimeAfter = scenario.timeOutOffset // Overtime
    }

    // Log details
    console.log(`   📚 Classes: ${daySchedule.length} scheduled`)
    console.log(`   🕐 First Class: ${format(firstClassStart, 'hh:mm a')} - ${firstClass.subject_name}`)
    console.log(`   🕐 Last Class: ${format(lastClassEnd, 'hh:mm a')} - ${lastClass.subject_name}`)
    console.log(`   ⏰ Time In:  ${format(actualTimeIn, 'hh:mm a')} ${isLate ? '❌ LATE' : '✅ ON-TIME'}`)
    
    // Only add Time Out for days before Nov 7 (current day has no time out yet)
    if (dateStr !== '2025-11-07') {
      console.log(`   ⏰ Time Out: ${format(actualTimeOut, 'hh:mm a')} ${isEarlyOut ? '⚠️  UNDERTIME' : '✅ ON-TIME'}`)
    }
    
    if (adminTimeBefore > 0) {
      console.log(`   🔧 Admin Time (Before): ${adminTimeBefore} minutes`)
    }
    if (adminTimeAfter > 0) {
      console.log(`   🔧 Admin Time (After): ${adminTimeAfter} minutes`)
    }
    console.log()

    // Create attendance log entries
    logsToInsert.push({
      employee_id: employeeId,
      rfid_code: rfidCode,
      date: dateStr,
      log_time: actualTimeIn.toISOString(),
      log_type: 'IN',
      attendance_status: isLate ? 'late' : 'on-time',
      is_late: isLate,
      is_early_out: false,
    })

    // Add Time Out for all days
    logsToInsert.push({
      employee_id: employeeId,
      rfid_code: rfidCode,
      date: dateStr,
      log_time: actualTimeOut.toISOString(),
      log_type: 'OUT',
      attendance_status: isEarlyOut ? 'undertime' : (isLate ? 'late' : 'on-time'),
      is_late: isLate,
      is_early_out: isEarlyOut,
    })
  }

  return logsToInsert
}

/**
 * STEP 7: Insert attendance logs into database
 */
async function insertAttendanceLogs(logs: any[]) {
  console.log(`\n💾 Inserting ${logs.length} attendance logs into database...\n`)

  // First, delete existing logs for this employee in the date range
  try {
    await dbQuery(
      `DELETE FROM attendance_logs
       WHERE employee_id = $1
         AND date >= $2
         AND date <= $3`,
      [EMPLOYEE_ID, START_DATE, END_DATE]
    )
    console.log('🗑️  Deleted existing logs for date range')
  } catch (deleteError: any) {
    console.warn('⚠️  Warning: Could not delete existing logs:', deleteError.message)
  }

  // Insert new logs
  const valuePlaceholders = logs
    .map((_, idx) => {
      const base = idx * 8
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`
    })
    .join(', ')

  const values = logs.flatMap((log) => [
    log.employee_id,
    log.rfid_code,
    log.date,
    log.log_time,
    log.log_type,
    log.attendance_status,
    log.is_late,
    log.is_early_out,
  ])

  const data = await dbQuery<any>(
    `INSERT INTO attendance_logs (
       employee_id,
       rfid_code,
       date,
       log_time,
       log_type,
       attendance_status,
       is_late,
       is_early_out
     ) VALUES ${valuePlaceholders}
     RETURNING *`,
    values
  )

  console.log(`✅ Successfully inserted ${data?.length || 0} attendance logs\n`)
  return data
}

/**
 * STEP 8: Verify the data
 */
async function verifyAttendanceLogs(employeeId: number) {
  console.log('\n🔍 Verifying attendance logs...\n')

  const data = await dbQuery<any>(
    `SELECT
       log_id,
       date,
       log_time,
       log_type,
       attendance_status,
       is_late,
       is_early_out
     FROM attendance_logs
     WHERE employee_id = $1
       AND date >= $2
       AND date <= $3
     ORDER BY date ASC, log_time ASC`,
    [employeeId, START_DATE, END_DATE]
  )

  console.log('📊 ATTENDANCE SUMMARY')
  console.log('=' .repeat(80))
  
  // Group by date
  const groupedByDate: { [key: string]: any[] } = {}
  data?.forEach(log => {
    if (!groupedByDate[log.date]) {
      groupedByDate[log.date] = []
    }
    groupedByDate[log.date].push(log)
  })

  let onTimeDays = 0
  let lateDays = 0
  let undertimeDays = 0
  let adminTimeDays = 0

  Object.keys(groupedByDate).sort().forEach(date => {
    const logs = groupedByDate[date]
    const timeIn = logs.find(l => l.log_type === 'IN')
    const timeOut = logs.find(l => l.log_type === 'OUT')

    const dateFormatted = format(new Date(date), 'EEE, MMM dd, yyyy')
    const timeInStr = timeIn ? format(new Date(timeIn.log_time), 'hh:mm a') : '-'
    const timeOutStr = timeOut ? format(new Date(timeOut.log_time), 'hh:mm a') : '-'

    let status = ''
    if (timeIn?.attendance_status === 'admin-time') {
      status = '🔧 ADMIN TIME'
      adminTimeDays++
    } else if (timeIn?.is_late) {
      status = '❌ LATE'
      lateDays++
    } else if (timeOut?.is_early_out) {
      status = '⚠️  UNDERTIME'
      undertimeDays++
    } else {
      status = '✅ ON-TIME'
      onTimeDays++
    }

    console.log(`${dateFormatted} | IN: ${timeInStr.padEnd(10)} | OUT: ${timeOutStr.padEnd(10)} | ${status}`)
  })

  console.log('=' .repeat(80))
  console.log(`\n📈 STATISTICS:`)
  console.log(`   ✅ On-Time Days:    ${onTimeDays}`)
  console.log(`   ❌ Late Days:       ${lateDays}`)
  console.log(`   ⚠️  Undertime Days:  ${undertimeDays}`)
  console.log(`   🔧 Admin Time Days: ${adminTimeDays}`)
  console.log(`   📊 Total Days:      ${Object.keys(groupedByDate).length}`)
}

/**
 * MAIN FUNCTION
 */
async function main() {
  try {
    console.log('\n' + '='.repeat(80))
    console.log('🚀 MOCK ATTENDANCE GENERATOR FOR JOMUNG DE CASTRO')
    console.log('='.repeat(80))
    console.log(`📅 Date Range: ${START_DATE} to ${END_DATE}`)
    console.log(`👤 Employee ID: ${EMPLOYEE_ID}`)
    console.log('='.repeat(80) + '\n')

    // Step 1: Get schedule
    const schedules = await getEmployeeSchedule(EMPLOYEE_ID)

    // Step 2: Generate scenarios
    const scenarios = generateAttendanceScenarios()

    // Step 3: Generate logs
    const logs = await generateAttendanceLogs(EMPLOYEE_ID, schedules, scenarios)

    // Step 4: Insert into database
    await insertAttendanceLogs(logs)

    // Step 5: Verify
    await verifyAttendanceLogs(EMPLOYEE_ID)

    console.log('\n' + '='.repeat(80))
    console.log('✅ MOCK ATTENDANCE GENERATION COMPLETE!')
    console.log('='.repeat(80) + '\n')

  } catch (error) {
    console.error('\n❌ ERROR:', error)
    process.exit(1)
  }
}

// Run the script
main()

