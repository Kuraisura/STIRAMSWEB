/**
 * Faculty Timesheet Helper Functions
 * ===================================
 * Modular helper functions for faculty timesheet Excel generation
 */

import { formatInTimeZone } from 'date-fns-tz'
import { MANILA_TZ } from './timezone-utils'

// ============================================================
// Type Definitions
// ============================================================

export type CutoffPeriod = '26-10' | '11-25' | null

export interface CutoffDate {
  date: string
  dayName: string
  dayNumber: number
}

export interface TeachingSchedule {
  SUBJECT_CODE: string
  SECTION: string
  DAY: string
  TIME: string
  ROOM: string
  HOURS?: number
}

export interface AttendanceData {
  date: string
  timeIn: string | null
  timeOut: string | null
}

export interface TeachingScheduleForAdmin {
  day_of_week: number
  time_start: string
  time_end: string
  subject_name: string
  section: string
}

// ============================================================
// Helper: Day Abbreviation Mapping
// ============================================================

const DAY_ABBREVIATION_MAP: { [key: string]: string } = {
  'MON': 'M',
  'MONDAY': 'M',
  'TUE': 'T',
  'TUESDAY': 'T',
  'T': 'T',
  'WED': 'W',
  'WEDNESDAY': 'W',
  'THU': 'TH',
  'THURSDAY': 'TH',
  'FRI': 'F',
  'FRIDAY': 'F',
  'SAT': 'S',
  'SATURDAY': 'S',
  'SUN': 'SUN',
  'SUNDAY': 'SUN'
}

/**
 * Convert day name to proper abbreviation
 */
export function getDayAbbreviation(dayName: string): string {
  const dayUpper = dayName.toUpperCase().trim()
  return DAY_ABBREVIATION_MAP[dayUpper] || (dayUpper.length >= 3 ? dayUpper.substring(0, 3) : dayUpper)
}

// ============================================================
// Helper: Time Parsing and Calculation
// ============================================================

/**
 * Parse time string to minutes since midnight
 * Handles formats: "12:00PM", "12:00:00", "12:00 PM", "12:00", "07:05", "19:35", "6:05PM"
 */
export function parseTimeToMinutes(timeStr: string | null): number | null {
  if (!timeStr) return null
  
  try {
    let time = String(timeStr).trim().toUpperCase()
    let isPM = false
    
    // Check for AM/PM indicators
    if (time.includes('PM')) {
      isPM = true
      time = time.replace('PM', '').trim()
    } else if (time.includes('AM')) {
      time = time.replace('AM', '').trim()
    }
    
    // Parse hours and minutes (handle HH:MM:SS format)
    const parts = time.split(':')
    const hours = Number(parts[0]) || 0
    const minutes = Number(parts[1]) || 0
    
    let hour24 = hours
    
    // Convert 12-hour to 24-hour format if AM/PM was detected
    if (String(timeStr).toUpperCase().includes('PM') || String(timeStr).toUpperCase().includes('AM')) {
      if (isPM && hour24 !== 12) hour24 += 12
      if (!isPM && hour24 === 12) hour24 = 0
    }
    
    return hour24 * 60 + minutes
  } catch {
    return null
  }
}

/**
 * Parse time range string and calculate duration in hours
 * Handles formats: "12:00PM-2:00PM", "12:00PM - 2:00PM", "9:00AM-11:00AM", etc.
 * Example: "12:00PM-2:00PM" -> 2.00
 * CRITICAL: Always returns hours rounded to 2 decimal places (e.g., 2.00, 1.50)
 */
export function parseTimeRangeToHours(timeStr: string): number {
  if (!timeStr || typeof timeStr !== 'string') {
    console.warn('[parseTimeRangeToHours] Invalid input:', timeStr)
    return 0
  }
  
  const time = timeStr.trim()
  
  // Match formats like "12:00PM-2:00PM", "12:00PM - 2:00PM", "9:00AM-11:00AM"
  // Pattern: (hour):(min)(AM|PM) separator (hour):(min)(AM|PM)
  const timePattern = /(\d{1,2}):(\d{2})\s*(AM|PM)\s*[-–—]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i
  const match = time.match(timePattern)
  
  if (match) {
    const startHour = parseInt(match[1])
    const startMin = parseInt(match[2])
    const startPeriod = match[3].toUpperCase()
    const endHour = parseInt(match[4])
    const endMin = parseInt(match[5])
    const endPeriod = match[6].toUpperCase()
    
    // Convert to 24-hour format
    let start24 = startHour
    let end24 = endHour
    
    if (startPeriod === 'AM' && startHour === 12) {
      start24 = 0
    } else if (startPeriod === 'PM' && startHour !== 12) {
      start24 = startHour + 12
    }
    
    if (endPeriod === 'AM' && endHour === 12) {
      end24 = 0
    } else if (endPeriod === 'PM' && endHour !== 12) {
      end24 = endHour + 12
    }
    
    const startTotal = start24 * 60 + startMin
    const endTotal = end24 * 60 + endMin
    
    // Calculate difference in minutes
    let diffMinutes = endTotal - startTotal
    
    // Handle case where end time is next day (e.g., 11:00PM-1:00AM)
    if (diffMinutes < 0) {
      diffMinutes += 24 * 60
    }
    
    // Convert to hours and round to 2 decimal places
    const hours = Math.round((diffMinutes / 60) * 100) / 100
    console.log(`[parseTimeRangeToHours] Parsed "${time}" -> ${hours} hours (${diffMinutes} minutes)`)
    return hours
  }
  
  // Try simpler format without AM/PM (24-hour format)
  const simplePattern = /(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/
  const simpleMatch = time.match(simplePattern)
  if (simpleMatch) {
    const startHour = parseInt(simpleMatch[1])
    const startMin = parseInt(simpleMatch[2])
    const endHour = parseInt(simpleMatch[3])
    const endMin = parseInt(simpleMatch[4])
    
    const startTotal = startHour * 60 + startMin
    const endTotal = endHour * 60 + endMin
    
    let diffMinutes = endTotal - startTotal
    if (diffMinutes < 0) {
      diffMinutes += 24 * 60
    }
    
    const hours = Math.round((diffMinutes / 60) * 100) / 100
    console.log(`[parseTimeRangeToHours] Parsed "${time}" (24h) -> ${hours} hours`)
    return hours
  }
  
  console.warn('[parseTimeRangeToHours] Could not parse time range:', time)
  return 0
}

// ============================================================
// Helper: Column Letter Conversion
// ============================================================

/**
 * Convert column number (1-based) to Excel column letter
 * Example: 1 -> A, 7 -> G, 27 -> AA
 */
export function getColumnLetter(colNum: number): string {
  let result = ''
  let num = colNum
  while (num > 0) {
    num--
    result = String.fromCharCode(65 + (num % 26)) + result
    num = Math.floor(num / 26)
  }
  return result
}

// ============================================================
// Helper: Day Matching
// ============================================================

const DAY_EQUIVALENTS: { [key: string]: string[] } = {
  'M': ['MON', 'M', 'MONDAY'],
  'T': ['TUE', 'T', 'TUESDAY'],
  'TUE': ['TUE', 'T', 'TUESDAY'],
  'W': ['WED', 'W', 'WEDNESDAY'],
  'WED': ['WED', 'W', 'WEDNESDAY'],
  'TH': ['THU', 'TH', 'THURSDAY'],
  'THU': ['THU', 'TH', 'THURSDAY'],
  'F': ['FRI', 'F', 'FRIDAY'],
  'FRI': ['FRI', 'F', 'FRIDAY'],
  'S': ['SAT', 'S', 'SATURDAY'],
  'SAT': ['SAT', 'S', 'SATURDAY'],
  'SUN': ['SUN', 'SUNDAY'],
  'SUNDAY': ['SUN', 'SUNDAY']
}

/**
 * Check if two day abbreviations match
 */
export function daysMatch(scheduleDay: string, columnDay: string): boolean {
  const scheduleDayUpper = scheduleDay.toUpperCase().trim()
  const columnDayUpper = columnDay.toUpperCase().trim()
  
  // Direct match
  if (scheduleDayUpper === columnDayUpper) return true
  
  // Check equivalents
  const equivalents = DAY_EQUIVALENTS[scheduleDayUpper] || [scheduleDayUpper]
  return equivalents.some(eq => eq === columnDayUpper)
}

// ============================================================
// Helper: Yellow Highlighting
// ============================================================

/**
 * Apply yellow background fill to a cell
 */
export function applyYellowFill(cell: any): void {
  try {
    if (!cell.fill) {
      cell.fill = { type: 'pattern', pattern: 'solid' } as any
    }
    if (!cell.fill.fgColor) {
      cell.fill.fgColor = { argb: '' } as any
    }
    cell.fill.fgColor.argb = 'FFFF00' // Yellow
  } catch (err) {
    console.error('[Faculty Timesheet Helper] Error applying yellow fill:', err)
  }
}

/**
 * Highlight cutoff period cells based on cutoff period
 * CRITICAL: User requirement
 * - If cutoff period is 26-10: Highlight G8-V8 (row 8) and F38-U38 (row 38)
 * - If cutoff period is 11-25: Highlight G9-V9 (row 9) and F39-U39 (row 39)
 */
export function highlightCutoffPeriodCells(
  ws: any,
  cutoffPeriod: CutoffPeriod
): void {
  if (cutoffPeriod === '26-10') {
    // Highlight G8 to V8 (row 8, columns 7-22) for 26-10 cutoff period
    for (let col = 7; col <= 22; col++) {
      try {
        const cell = ws.getRow(8).getCell(col)
        applyYellowFill(cell)
      } catch (err) {
        console.error(`[Faculty Timesheet Helper] Error highlighting G8-V8 col ${col}:`, err)
      }
    }
    // Highlight F38 to U38 (row 38, columns 6-21) for Non-Teaching Activities
    for (let col = 6; col <= 21; col++) {
      try {
        const cell = ws.getRow(38).getCell(col)
        applyYellowFill(cell)
      } catch (err) {
        console.error(`[Faculty Timesheet Helper] Error highlighting F38-U38 col ${col}:`, err)
      }
    }
    console.log('[Faculty Timesheet Helper] Highlighted 26-10 cutoff period (G8-V8 and F38-U38)')
  } else if (cutoffPeriod === '11-25') {
    // Highlight G9 to V9 (row 9, columns 7-22) for 11-25 cutoff period
    for (let col = 7; col <= 22; col++) {
      try {
        const cell = ws.getRow(9).getCell(col)
        applyYellowFill(cell)
      } catch (err) {
        console.error(`[Faculty Timesheet Helper] Error highlighting G9-V9 col ${col}:`, err)
      }
    }
    // Highlight F39 to U39 (row 39, columns 6-21) for Non-Teaching Activities
    for (let col = 6; col <= 21; col++) {
      try {
        const cell = ws.getRow(39).getCell(col)
        applyYellowFill(cell)
      } catch (err) {
        console.error(`[Faculty Timesheet Helper] Error highlighting F39-U39 col ${col}:`, err)
      }
    }
    console.log('[Faculty Timesheet Helper] Highlighted 11-25 cutoff period (G9-V9 and F39-U39)')
  }
}

// ============================================================
// Helper: Day Alignment
// ============================================================

/**
 * Align day labels in G7-V7 to match exact dates from cutoff period
 * CRITICAL: Uses dates from Q6 (PERIOD_START) and U6 (PERIOD_END) to determine cutoff period
 * For cutoff period 11-25: dates are in row 9, day labels in row 7
 * For cutoff period 26-10: dates are in row 8, day labels in row 7
 * CRITICAL: Day abbreviations must be correct (T for Tuesday, TH for Thursday)
 */
export function alignDayLabels(
  ws: any,
  cutoffDates: CutoffDate[],
  cutoffPeriod: CutoffPeriod
): void {
  if (!cutoffDates || !cutoffPeriod) {
    console.warn('[Faculty Timesheet Helper] alignDayLabels: Missing cutoffDates or cutoffPeriod')
    return
  }
  
  const dayHeaderRow = 7 // Row 7 contains day labels (G7-V7)
  // CRITICAL: Determine date row based on cutoff period
  // If cutoff period is 11-25, dates are in row 9
  // If cutoff period is 26-10, dates are in row 8
  const dateHeaderRow = cutoffPeriod === '11-25' ? 9 : 8
  
  console.log(`[Faculty Timesheet Helper] Aligning day labels for cutoff period ${cutoffPeriod}, date row ${dateHeaderRow}`)
  console.log(`[Faculty Timesheet Helper] Cutoff dates:`, cutoffDates.map(cd => `${cd.date} (${cd.dayName}, day ${cd.dayNumber})`))
  
  // Update day names in G7-V7 (columns 7-22) based on actual dates
  for (let col = 7; col <= 22; col++) {
    try {
      const dateCell = ws.getRow(dateHeaderRow).getCell(col)
      const dateValue = dateCell.value
      
      let dayNum: number | null = null
      if (dateValue && typeof dateValue === 'number' && dateValue >= 1 && dateValue <= 31) {
        dayNum = dateValue
      } else if (dateValue && typeof dateValue === 'string') {
        const dayMatch = dateValue.toString().match(/^\s*(\d{1,2})\s*$/)
        if (dayMatch) {
          dayNum = parseInt(dayMatch[1])
        }
      }
      
      if (dayNum !== null) {
        // Find matching cutoff date
        const matchingDate = cutoffDates.find(cd => cd.dayNumber === dayNum)
        if (matchingDate) {
          // Get actual day name and convert to proper abbreviation
          // CRITICAL: Ensure correct abbreviations (T for Tuesday, TH for Thursday)
          const dayAbbr = getDayAbbreviation(matchingDate.dayName)
          // CRITICAL: Write to row 7 (dayHeaderRow), not dateHeaderRow
          const dayHeaderCell = ws.getRow(dayHeaderRow).getCell(col)
          dayHeaderCell.value = dayAbbr
          console.log(`[Faculty Timesheet Helper] ✅ Set day ${dayAbbr} for date ${dayNum} (${matchingDate.dayName}) in column ${getColumnLetter(col)} (row ${dayHeaderRow})`)
        } else {
          console.warn(`[Faculty Timesheet Helper] No matching date found for day number ${dayNum} in column ${getColumnLetter(col)}`)
        }
      }
    } catch (err) {
      console.error(`[Faculty Timesheet Helper] Error updating day header for column ${col}:`, err)
    }
  }
}

// ============================================================
// Helper: Section Column Population
// ============================================================

/**
 * Populate column B (B10-B28) with subject_name from teaching_schedules table
 * CRITICAL: User requirement - B10-B28 should show subject_name from database
 */
export function populateSubjectNameColumn(
  ws: any,
  teachingRows: TeachingSchedule[],
  teachingSchedules?: Array<{ subject_name: string; section: string }>
): void {
  for (let i = 0; i < Math.min(19, teachingRows.length); i++) {
    const rowNum = 10 + i // B10, B11, B12, ..., B28
    const schedule = teachingRows[i]
    
    // CRITICAL: Get subject_name from teachingSchedules array (from database table)
    let subjectName = ''
    if (teachingSchedules && teachingSchedules[i]) {
      subjectName = String(teachingSchedules[i].subject_name || '').trim()
    }
    
    // Fallback to SUBJECT_CODE field from teachingRows if not available
    if (!subjectName) {
      subjectName = String(schedule?.SUBJECT_CODE || '').trim()
    }
    
    const cell = ws.getRow(rowNum).getCell(2) // Column B
    cell.value = subjectName
    // Preserve existing formatting (font size, alignment)
    if (!cell.font) cell.font = {}
    if (!cell.alignment) cell.alignment = {}
    console.log(`[Faculty Timesheet Helper] Set B${rowNum} = ${subjectName} (subject_name from database)`)
  }
}

/**
 * Populate column C (C10-C28) with section from teaching_schedules table
 * CRITICAL: User requirement - C10-C28 should show section from database
 */
export function populateSectionColumn(
  ws: any,
  teachingRows: TeachingSchedule[],
  teachingSchedules?: Array<{ subject_name: string; section: string }>
): void {
  for (let i = 0; i < Math.min(19, teachingRows.length); i++) {
    const rowNum = 10 + i // C10, C11, C12, ..., C28
    const schedule = teachingRows[i]
    
    // CRITICAL: Get section from teachingSchedules array (from database table)
    let section = ''
    if (teachingSchedules && teachingSchedules[i]) {
      section = String(teachingSchedules[i].section || '').trim()
    }
    
    // Fallback to SECTION field from teachingRows if not available
    if (!section) {
      section = String(schedule?.SECTION || '').trim()
    }
    
    const cell = ws.getRow(rowNum).getCell(3) // Column C
    cell.value = section
    // Preserve existing formatting
    if (!cell.font) cell.font = {}
    if (!cell.alignment) cell.alignment = {}
    console.log(`[Faculty Timesheet Helper] Set C${rowNum} = ${section} (section from database)`)
  }
}

// ============================================================
// Helper: Teaching Load Calculation and Placement
// ============================================================

export interface ColumnMapping {
  col: number
  dayNumber: number
  dayName: string
  date: string
}

/**
 * Build column mapping from date row
 */
export function buildColumnMapping(
  ws: any,
  cutoffDates: CutoffDate[],
  cutoffPeriod: CutoffPeriod,
  dayHeaderRow: number = 7
): ColumnMapping[] {
  // CRITICAL: Determine date row based on cutoff period
  // If cutoff period is 11-25, dates are in row 9
  // If cutoff period is 26-10, dates are in row 8
  const dateHeaderRow = cutoffPeriod === '11-25' ? 9 : 8
  const columnMapping: ColumnMapping[] = []
  
  console.log(`[Faculty Timesheet Helper] Building column mapping for cutoff period ${cutoffPeriod}, date row ${dateHeaderRow}`)
  
  for (let col = 7; col <= 22; col++) { // Columns G-V
    try {
      const dateCell = ws.getRow(dateHeaderRow).getCell(col)
      const dayCell = ws.getRow(dayHeaderRow).getCell(col)
      
      const dateValue = dateCell.value
      const dayValue = dayCell.value
      
      let dayNum: number | null = null
      if (dateValue && typeof dateValue === 'number' && dateValue >= 1 && dateValue <= 31) {
        dayNum = dateValue
      } else if (dateValue && typeof dateValue === 'string') {
        const dayMatch = dateValue.toString().match(/^\s*(\d{1,2})\s*$/)
        if (dayMatch) dayNum = parseInt(dayMatch[1])
      }
      
      if (dayNum !== null) {
        let dayName = ''
        if (dayValue) {
          dayName = String(dayValue).toUpperCase().trim()
        } else {
          const matchingDate = cutoffDates.find(cd => cd.dayNumber === dayNum)
          if (matchingDate) dayName = matchingDate.dayName
        }
        
        const matchingDate = cutoffDates.find(cd => cd.dayNumber === dayNum)
        if (matchingDate) {
          columnMapping.push({
            col,
            dayNumber: dayNum,
            dayName: dayName || matchingDate.dayName,
            date: matchingDate.date
          })
        }
      }
    } catch (err) {
      console.error(`[Faculty Timesheet Helper] Error building column mapping for col ${col}:`, err)
    }
  }
  
  return columnMapping
}

/**
 * Calculate and place teaching loads in G10-V28
 * CRITICAL: This function places teaching loads in cells G10-V28 based on class schedules
 */
export function calculateAndPlaceTeachingLoads(
  ws: any,
  teachingRows: TeachingSchedule[],
  columnMapping: ColumnMapping[]
): void {
  console.log(`[Faculty Timesheet Helper] calculateAndPlaceTeachingLoads: ${teachingRows.length} schedules, ${columnMapping.length} column mappings`)
  console.log(`[Faculty Timesheet Helper] Column mappings:`, columnMapping.map(cm => ({
    col: getColumnLetter(cm.col),
    dayNumber: cm.dayNumber,
    dayName: cm.dayName,
    date: cm.date
  })))
  
  // Process teaching schedules (rows 10-28)
  for (let i = 0; i < Math.min(19, teachingRows.length); i++) {
    const rowNum = 10 + i
    const schedule = teachingRows[i]
    
    if (!schedule) {
      console.log(`[Faculty Timesheet Helper] Skipping row ${rowNum}: no schedule`)
      continue
    }
    
    const day = String(schedule.DAY || '').toUpperCase().trim()
    const time = String(schedule.TIME || '')
    
    console.log(`[Faculty Timesheet Helper] Row ${rowNum}: DAY=${day}, TIME=${time}`)
    
    // Get hours from HOURS field or parse from time string
    let hours = 0
    if (schedule.HOURS !== undefined && schedule.HOURS !== null) {
      hours = typeof schedule.HOURS === 'number' ? schedule.HOURS : parseFloat(String(schedule.HOURS))
      console.log(`[Faculty Timesheet Helper] Row ${rowNum}: Using HOURS field = ${hours}`)
    }
    
    if (hours <= 0 || isNaN(hours)) {
      hours = parseTimeRangeToHours(time)
      console.log(`[Faculty Timesheet Helper] Row ${rowNum}: Parsed from TIME string = ${hours}`)
    }
    
    if (hours <= 0 || !day) {
      console.warn(`[Faculty Timesheet Helper] Row ${rowNum}: Skipping - hours=${hours}, day=${day}`)
      continue
    }
    
    // Find matching columns based on day
    const matchingColumns = columnMapping.filter(cm => {
      const matches = daysMatch(day, cm.dayName)
      if (matches) {
        console.log(`[Faculty Timesheet Helper] Row ${rowNum}: Day ${day} matches column ${getColumnLetter(cm.col)} (${cm.dayName}, date ${cm.date})`)
      }
      return matches
    })
    
    console.log(`[Faculty Timesheet Helper] Row ${rowNum}: Found ${matchingColumns.length} matching columns for day ${day}`)
    
    if (matchingColumns.length === 0) {
      console.warn(`[Faculty Timesheet Helper] Row ${rowNum}: No matching columns found for day ${day}`)
      console.log(`[Faculty Timesheet Helper] Available day names in column mapping:`, columnMapping.map(cm => cm.dayName))
    }
    
    // Fill matching columns with computed hours (G10-V28)
    for (const match of matchingColumns) {
      try {
        const cell = ws.getRow(rowNum).getCell(match.col)
        cell.value = hours
        cell.numFmt = '0.00'
        if (!cell.alignment) cell.alignment = {}
        cell.alignment.horizontal = 'right'
        const colLetter = getColumnLetter(match.col)
        console.log(`[Faculty Timesheet Helper] ✅ Set cell ${colLetter}${rowNum} = ${hours} for day ${match.dayName} (date ${match.date})`)
      } catch (err) {
        console.error(`[Faculty Timesheet Helper] ❌ Error setting cell for row ${rowNum}, col ${match.col}:`, err)
      }
    }
    
    // Calculate and fill total in column W (sum of all daily values for this row)
    try {
      const totalCell = ws.getRow(rowNum).getCell(23) // Column W
      const rowTotal = matchingColumns.length * hours
      totalCell.value = rowTotal
      totalCell.numFmt = '0.00'
      if (!totalCell.alignment) totalCell.alignment = {}
      totalCell.alignment.horizontal = 'right'
      console.log(`[Faculty Timesheet Helper] ✅ Set W${rowNum} = ${rowTotal} (${matchingColumns.length} days × ${hours} hours)`)
    } catch (err) {
      console.error(`[Faculty Timesheet Helper] ❌ Error calculating total for row ${rowNum}:`, err)
    }
  }
  
  // Calculate W37: Sum of W10 through W28
  try {
    let totalTeachingHours = 0
    for (let row = 10; row <= 28; row++) {
      const cell = ws.getRow(row).getCell(23) // Column W
      const val = cell?.value
      if (typeof val === 'number') {
        totalTeachingHours += val
      }
    }
    
    const totalCell = ws.getRow(37).getCell(23) // W37
    totalCell.value = totalTeachingHours
    totalCell.numFmt = '0.00'
    totalCell.alignment = { ...totalCell.alignment, horizontal: 'right' }
    totalCell.font = { ...totalCell.font, bold: true }
    console.log(`[Faculty Timesheet Helper] Set W37 = ${totalTeachingHours} (Total Teaching Hours)`)
  } catch (err) {
    console.error('[Faculty Timesheet Helper] Error calculating W37:', err)
  }
}

// ============================================================
// Helper: Exam Day Layout Update
// ============================================================

/**
 * Move EXAM DAY from B23 to B29 and remove from B23
 */
export function updateExamDayLayout(ws: any): void {
  try {
    // Clear B23
    const cellB23 = ws.getRow(23).getCell(2) // Column B, Row 23
    cellB23.value = ''
    cellB23.fill = null
    cellB23.font = null
    cellB23.alignment = null
    
    // Set B29 with EXAM DAY
    const cellB29 = ws.getRow(29).getCell(2) // Column B, Row 29
    cellB29.value = 'EXAM DAY'
    cellB29.alignment = { ...cellB29.alignment, horizontal: 'center', vertical: 'middle' }
    cellB29.font = { ...cellB29.font, bold: true }
    
    console.log('[Faculty Timesheet Helper] Moved EXAM DAY from B23 to B29')
  } catch (err) {
    console.error('[Faculty Timesheet Helper] Error updating exam day layout:', err)
  }
}

// ============================================================
// Helper: Non-Teaching Loads Calculation
// ============================================================

/**
 * Calculate admin time (non-teaching load) for a specific date
 */
export function calculateAdminTimeForDate(
  dateStr: string,
  attendanceData: AttendanceData | null,
  schedulesByDow: Map<number, Array<{ start: number; end: number }>>
): number {
  if (!attendanceData || !attendanceData.timeIn) {
    return 0.0
  }
  
  try {
    // Get day of week (1=Monday, 7=Sunday)
    const dateObj = new Date(dateStr + 'T00:00:00+08:00')
    const jsDow = dateObj.getDay() // 0=Sunday, 1=Monday, ..., 6=Saturday
    const dow = jsDow === 0 ? 7 : jsDow // Convert to 1=Monday, 7=Sunday
    
    // Skip Sundays
    if (dow === 7) {
      return 0.0
    }
    
    const timeInMin = parseTimeToMinutes(attendanceData.timeIn)
    if (timeInMin === null) {
      return 0.0
    }
    
    // Get schedules for this day of week
    const daySchedules = schedulesByDow.get(dow) || []
    
    if (daySchedules.length === 0) {
      // No schedules - if employee logged in, count full day as admin time
      if (attendanceData.timeOut) {
        const timeOutMin = parseTimeToMinutes(attendanceData.timeOut)
        if (timeOutMin !== null) {
          const totalMinutes = timeOutMin - timeInMin
          return Math.round((totalMinutes / 60.0) * 100) / 100
        }
      }
      return 0.0
    }
    
    // Sort schedules by start time
    const schedulesSorted = [...daySchedules].sort((a, b) => a.start - b.start)
    
    const firstClassStart = schedulesSorted[0].start
    const lastClassEnd = schedulesSorted[schedulesSorted.length - 1].end
    
    let totalAdminMinutes = 0
    
    // 1. Time in before first class schedule
    if (timeInMin < firstClassStart) {
      totalAdminMinutes += firstClassStart - timeInMin
    }
    
    // 2. Vacant periods between class schedules
    for (let i = 0; i < schedulesSorted.length - 1; i++) {
      const currentEnd = schedulesSorted[i].end
      const nextStart = schedulesSorted[i + 1].start
      
      // If there's a gap between classes, it's vacant time (admin time)
      if (nextStart > currentEnd) {
        totalAdminMinutes += nextStart - currentEnd
      }
    }
    
    // 3. Time out after last class schedule
    if (attendanceData.timeOut) {
      const timeOutMin = parseTimeToMinutes(attendanceData.timeOut)
      if (timeOutMin !== null && timeOutMin > lastClassEnd) {
        totalAdminMinutes += timeOutMin - lastClassEnd
      }
    }
    
    // Convert to hours and round to 2 decimals
    const adminHours = Math.round((totalAdminMinutes / 60.0) * 100) / 100
    return adminHours
  } catch (err) {
    console.error(`[Faculty Timesheet Helper] Error calculating admin time for ${dateStr}:`, err)
    return 0.0
  }
}

/**
 * Calculate and place non-teaching loads in F40-U40
 */
export function calculateAndPlaceNonTeachingLoads(
  ws: any,
  cutoffPeriod: CutoffPeriod,
  cutoffDates: CutoffDate[],
  attendanceData: Map<string, AttendanceData>,
  teachingSchedules: TeachingScheduleForAdmin[]
): void {
  // Build schedule map by day of week (1=Monday, 6=Saturday)
  const schedulesByDow = new Map<number, Array<{ start: number; end: number }>>()
  
  teachingSchedules.forEach((s) => {
    const dow = Number(s.day_of_week)
    if (dow >= 1 && dow <= 6) {
      const start = parseTimeToMinutes(s.time_start)
      const end = parseTimeToMinutes(s.time_end)
      if (start !== null && end !== null) {
        if (!schedulesByDow.has(dow)) {
          schedulesByDow.set(dow, [])
        }
        schedulesByDow.get(dow)!.push({ start, end })
      }
    }
  })
  
  // Sort schedules by start time for each day
  schedulesByDow.forEach((schedules, dow) => {
    schedules.sort((a, b) => a.start - b.start)
  })
  
  // Determine which row has dates (8 for 26-10, 9 for 11-25)
  const dateHeaderRow = cutoffPeriod === '26-10' ? 8 : 9
  
  // Process F40-U40 (columns 6-21)
  for (let col = 6; col <= 21; col++) {
    try {
      const dateCell = ws.getRow(dateHeaderRow).getCell(col)
      const dateValue = dateCell.value
      
      let dayNum: number | null = null
      if (dateValue && typeof dateValue === 'number' && dateValue >= 1 && dateValue <= 31) {
        dayNum = dateValue
      } else if (dateValue && typeof dateValue === 'string') {
        const dayMatch = dateValue.toString().match(/^\s*(\d{1,2})\s*$/)
        if (dayMatch) dayNum = parseInt(dayMatch[1])
      }
      
      if (dayNum !== null) {
        // Find matching date in CUTOFF_DATES
        const matchingDate = cutoffDates.find(cd => cd.dayNumber === dayNum)
        if (matchingDate) {
          const dayAttendance = attendanceData.get(matchingDate.date)
          const adminHours = calculateAdminTimeForDate(
            matchingDate.date,
            dayAttendance || null,
            schedulesByDow
          )
          
          const cell40 = ws.getRow(40).getCell(col)
          cell40.value = adminHours
          cell40.numFmt = '0.00'
        }
      }
    } catch (err) {
      console.error(`[Faculty Timesheet Helper] Error calculating admin time for column ${col}:`, err)
    }
  }
  
  // Calculate W42: Sum of F40:U40
  try {
    let totalAdminHours = 0.0
    for (let col = 6; col <= 21; col++) {
      const cell = ws.getRow(40).getCell(col)
      const val = cell?.value
      if (typeof val === 'number') {
        totalAdminHours += val
      }
    }
    
    // Set W42
    const w42Cell = ws.getRow(42).getCell(23) // Column W, Row 42
    w42Cell.value = totalAdminHours
    w42Cell.numFmt = '0.00'
    
    // Set W43 = W42
    const w43Cell = ws.getRow(43).getCell(23) // Column W, Row 43
    w43Cell.value = totalAdminHours
    w43Cell.numFmt = '0.00'
    
    // Set R42: "Total Non-Teaching Hours"
    const r42Cell = ws.getRow(42).getCell(18) // Column R, Row 42
    r42Cell.value = 'Total Non-Teaching Hours'
    r42Cell.font = { ...r42Cell.font, size: 10, bold: true }
    
    // Set B43: "Total"
    const b43Cell = ws.getRow(43).getCell(2) // Column B, Row 43
    b43Cell.value = 'Total'
    b43Cell.font = { ...b43Cell.font, size: 12, bold: true }
    
    console.log(`[Faculty Timesheet Helper] Set W42 = W43 = ${totalAdminHours} (Total Non-Teaching Hours)`)
  } catch (err) {
    console.error('[Faculty Timesheet Helper] Error calculating non-teaching totals:', err)
  }
}

