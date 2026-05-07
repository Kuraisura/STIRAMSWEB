import path from 'path'
import os from 'os'
import { promises as fs } from 'fs'
import { formatInTimeZone } from 'date-fns-tz'
import { MANILA_TZ } from '@/lib/timezone-utils'
import {
  highlightCutoffPeriodCells,
  alignDayLabels,
  populateSubjectNameColumn,
  populateSectionColumn,
  buildColumnMapping,
  calculateAndPlaceTeachingLoads,
  updateExamDayLayout,
  calculateAndPlaceNonTeachingLoads,
  parseTimeRangeToHours,
  daysMatch,
  type CutoffDate,
  type TeachingSchedule,
  type AttendanceData
} from './faculty-timesheet-helpers'

type TeachingRow = {
  SUBJECT_CODE: string
  SECTION: string
  DAY: string
  TIME: string
  ROOM: string
  HOURS?: string | number
}

export type FacultyTimesheetData = {
  FACULTY_NAME: string
  SCHOOL_YEAR: string
  SEMESTER: string
  PERIOD_START: string
  PERIOD_END: string
  PERIOD_COVERED?: string
  CUTOFF_START?: string
  CUTOFF_END?: string
  CUTOFF_PERIOD?: string // '26-10' or '11-25' or null
  CUTOFF_DATES?: Array<{ date: string; dayName: string; dayNumber: number }>
  TOTAL_TEACHING_HOURS?: number
  TOTAL_NON_TEACHING_HOURS?: number
  TOTAL_HOURS?: number
  TOTAL_LATE_MINS?: number
  TOTAL_UNDERTIME_HOURS?: number
  PREPARED_BY?: string
  CHECKED_BY?: string
  APPROVED_BY?: string
  TEACHING_ROWS: TeachingRow[]
  EXAM_ROWS?: TeachingRow[]
  NON_TEACHING_ROWS?: Array<{ ACTIVITY: string; DAY: string; HOURS?: string | number }>
  EMPLOYMENT_TYPE?: string // 'Part Time Full Load', 'Part Time', 'Full Time', etc.
  STAFF_TYPE?: string // 'Teaching', 'Non-Teaching', etc.
  NON_TEACHING_ATTENDANCE?: Array<{ date: string; timeIn: string | null; timeOut: string | null }> // Attendance logs for non-teaching hours calculation
  NON_TEACHING_SCHEDULE?: { timeStart: string; timeEnd: string } // Non-teaching schedule (e.g., "12:00PM-6:00PM")
  TEACHING_SCHEDULES?: Array<{ day_of_week: number; time_start: string; time_end: string; subject_name: string; section: string }> // Teaching schedules for admin time calculation
  // Attendance summary (same format as email preview)
  ATTENDANCE_PRESENT?: number
  ATTENDANCE_ABSENT?: number
  ATTENDANCE_LATE?: number
  ATTENDANCE_UNDERTIME?: number
}

// Copy minimal but important style attributes from one cell to another
function copyCellStyle(src: any, dst: any) {
  dst.style = JSON.parse(JSON.stringify(src.style || {}))
  if (src.numFmt) dst.numFmt = src.numFmt
  if (src.font) dst.font = { ...(src.font as any) }
  if (src.alignment) dst.alignment = { ...(src.alignment as any) }
  if (src.border) dst.border = { ...(src.border as any) }
  if (src.fill) dst.fill = { ...(src.fill as any) }
}

export async function generateFacultyTimesheetFromTemplate(
  data: FacultyTimesheetData,
  returnBuffer: boolean = false
): Promise<Buffer | string> {
  // Support both ESM and CJS builds of exceljs
  const ExcelNS: any = await import('exceljs')
  const ExcelJS = (ExcelNS as any).default || ExcelNS
  const cwd = process.cwd()

  // Support either filename variant: faculty-timesheets.xlsx (plural) or faculty-timesheet.xlsx (singular)
  let templatePath = path.join(cwd, 'public', 'templates', 'faculty-timesheets.xlsx')
  
  // Only create temp directory if we need to write to file
  let outPath: string | undefined
  if (!returnBuffer) {
    const outDir = os.tmpdir()
    outPath = path.join(outDir, `faculty-timesheet-filled-${Date.now()}.xlsx`)
    await fs.mkdir(outDir, { recursive: true })
  }
  try {
    await fs.access(templatePath)
  } catch {
    const alt = path.join(cwd, 'public', 'templates', 'faculty-timesheet.xlsx')
    try { await fs.access(alt); templatePath = alt } catch { throw new Error(`Template not found at ${templatePath}`) }
  }

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(templatePath)

  // ExcelJS sometimes fails to write files with shared formulas from Excel templates.
  // To make the template stable for programmatic editing, convert all formulas
  // (especially shared formulas) into their last-calculated values.
  wb.worksheets.forEach((ws: any) => {
    ws.eachRow({ includeEmpty: true }, (row: any) => {
      row.eachCell({ includeEmpty: true }, (cell: any) => {
        const v = cell?.value as any
        if (v && typeof v === 'object' && (v.sharedFormula || v.formula)) {
          if (typeof v.result !== 'undefined' && v.result !== null) {
            cell.value = v.result
          } else {
            cell.value = null
          }
        }
      })
    })
  })

  // If the template uses fixed cell addresses instead of placeholders, fill them too.
  const ws0: any = wb.worksheets[0]
  const setCellIfExists = (addr: string, val: any) => {
    try {
      const cell = ws0.getCell(addr)
      if (!cell) return
      // Avoid accidentally overwriting visible placeholders if the template still has them
      const oldVal = cell.value
      if (typeof oldVal === 'string' && /\{\{.*?\}\}/.test(oldVal)) return
      cell.value = val as any
    } catch {}
  }

  // Helper function to set cell with style preservation
  const setCellValue = (addr: string, val: any, preserveStyle = true) => {
    try {
      const cell = ws0.getCell(addr)
      if (!cell) return
      const oldVal = cell.value
      if (typeof oldVal === 'string' && /\{\{.*?\}\}/.test(oldVal)) return
      cell.value = val
    } catch {}
  }

  // Helper function to colorize a cell
  const colorizeCell = (addr: string, color: string) => {
    try {
      const cell = ws0.getCell(addr)
      if (!cell) return
      if (!cell.fill) cell.fill = { type: 'pattern', pattern: 'solid' }
      if (!cell.fill.fgColor) cell.fill.fgColor = { argb: '' }
      cell.fill.fgColor.argb = color
    } catch {}
  }

  // Helper function to set cell with font styling
  const setCellWithFont = (addr: string, val: any, fontSize?: number, bold?: boolean) => {
    try {
      const cell = ws0.getCell(addr)
      if (!cell) return
      cell.value = val
      if (fontSize || bold) {
        if (!cell.font) cell.font = {}
        if (fontSize) cell.font.size = fontSize
        if (bold) cell.font.bold = bold
      }
    } catch {}
  }

  // Header cells - NEW LAYOUT per requirements
  setCellValue('C6', data.FACULTY_NAME || '')
  
  // Cell G6: School Year (e.g., "2025-2026") - Bolded, Font 12
  setCellWithFont('G6', data.SCHOOL_YEAR || '', 12, true)
  
  // Cell K6: Semester (1st Semester for June-December, 2nd Semester for January-May)
  setCellValue('K6', data.SEMESTER || '')
  
  // Cell Q6: First date of cutoff period (e.g., "October 26, 2025")
  // Format the date as "October 26, 2025" using Manila timezone
  const formatLongDate = (dateStr: string) => {
    if (!dateStr) return ''
    try {
      // CRITICAL: Use Manila timezone to ensure consistency with Reports page
      const date = new Date(dateStr + 'T00:00:00+08:00')
      if (isNaN(date.getTime())) return dateStr // Invalid date
      return formatInTimeZone(date, MANILA_TZ, 'MMMM d, yyyy')
    } catch {
      // Fallback to original method if timezone utils not available
      try {
        const date = new Date(dateStr + 'T00:00:00+08:00')
        if (isNaN(date.getTime())) return dateStr
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
        return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
      } catch {
        return dateStr
      }
    }
  }
  
  // CRITICAL FIX: Always use CUTOFF_START and CUTOFF_END if available, fallback to PERIOD_START/PERIOD_END
  const cutoffStartDate = data.CUTOFF_START || data.PERIOD_START || ''
  const cutoffEndDate = data.CUTOFF_END || data.PERIOD_END || ''
  
  setCellValue('Q6', cutoffStartDate ? formatLongDate(cutoffStartDate) : '')
  setCellValue('U6', cutoffEndDate ? formatLongDate(cutoffEndDate) : '')

  // Totals and summary cells
  // CRITICAL: Clear J34 - don't set any value here
  try {
    const j34Cell = ws0.getCell('J34')
    j34Cell.value = ''
  } catch {}
  
  // CRITICAL: Clear J40 - don't set any value here
  try {
    const j40Cell = ws0.getCell('J40')
    j40Cell.value = ''
  } catch {}
  
  // J38 is for non-teaching hours but we'll handle it in the Non-Teaching section
  // J40 cleared above - no total hours in J40
  
  // CRITICAL: Late (total minutes) and Undertime (total Hrs) - Set with proper formatting
  // C47: Late minutes (moved from F44)
  if (typeof data.TOTAL_LATE_MINS !== 'undefined') {
    try {
      const lateCell = ws0.getCell('C47')
      lateCell.value = Number(data.TOTAL_LATE_MINS)
      lateCell.numFmt = '0' // Whole number format for minutes
      console.log('[Faculty Timesheet] Set Late Minutes (C47):', data.TOTAL_LATE_MINS)
    } catch (err) {
      console.error('[Faculty Timesheet] Error setting Late Minutes:', err)
    }
  }
  
  // E47: Undertime hours (moved from N44)
  if (typeof data.TOTAL_UNDERTIME_HOURS !== 'undefined') {
    try {
      const undertimeCell = ws0.getCell('E47')
      undertimeCell.value = Number(data.TOTAL_UNDERTIME_HOURS)
      undertimeCell.numFmt = '0.00' // Decimal format for hours
      console.log('[Faculty Timesheet] Set Undertime Hours (E47):', data.TOTAL_UNDERTIME_HOURS)
    } catch (err) {
      console.error('[Faculty Timesheet] Error setting Undertime Hours:', err)
    }
  }
  
  // Clear old cells F44 and N44 if they exist
  try {
    const oldLateCell = ws0.getCell('F44')
    if (oldLateCell.value) oldLateCell.value = ''
  } catch {}
  
  try {
    const oldUndertimeCell = ws0.getCell('N44')
    if (oldUndertimeCell.value) oldUndertimeCell.value = ''
  } catch {}

  // Attendance Summary (same format as email preview)
  // Add attendance summary near the header area (row 4-5)
  if (typeof data.ATTENDANCE_PRESENT !== 'undefined' || 
      typeof data.ATTENDANCE_ABSENT !== 'undefined' || 
      typeof data.ATTENDANCE_LATE !== 'undefined' || 
      typeof data.ATTENDANCE_UNDERTIME !== 'undefined') {
    try {
      // Row 4: Labels
      setCellWithFont('B4', 'Attendance Summary:', 11, true)
      setCellValue('D4', 'Present:')
      setCellValue('F4', 'Absent:')
      setCellValue('H4', 'Late:')
      setCellValue('J4', 'Undertime:')
      
      // Row 5: Values
      if (typeof data.ATTENDANCE_PRESENT !== 'undefined') {
        const presentCell = ws0.getCell('E5')
        presentCell.value = data.ATTENDANCE_PRESENT
        presentCell.numFmt = '0'
        if (!presentCell.font) presentCell.font = {}
        presentCell.font.bold = true
        presentCell.font.color = { argb: 'FF00AA00' } // Green
      }
      
      if (typeof data.ATTENDANCE_ABSENT !== 'undefined') {
        const absentCell = ws0.getCell('G5')
        absentCell.value = data.ATTENDANCE_ABSENT
        absentCell.numFmt = '0'
        if (!absentCell.font) absentCell.font = {}
        absentCell.font.bold = true
        absentCell.font.color = { argb: 'FFFF0000' } // Red
      }
      
      if (typeof data.ATTENDANCE_LATE !== 'undefined') {
        const lateCell = ws0.getCell('I5')
        lateCell.value = data.ATTENDANCE_LATE
        lateCell.numFmt = '0'
        if (!lateCell.font) lateCell.font = {}
        lateCell.font.bold = true
        lateCell.font.color = { argb: 'FFFF8800' } // Orange
      }
      
      if (typeof data.ATTENDANCE_UNDERTIME !== 'undefined') {
        const undertimeCell = ws0.getCell('K5')
        undertimeCell.value = data.ATTENDANCE_UNDERTIME
        undertimeCell.numFmt = '0'
        if (!undertimeCell.font) undertimeCell.font = {}
        undertimeCell.font.bold = true
        undertimeCell.font.color = { argb: 'FFFF8800' } // Orange
      }
    } catch (err) {
      console.error('[Faculty Timesheet] Error setting attendance summary:', err)
    }
  }

  // Signatures
  if (data.PREPARED_BY) setCellIfExists('B46', data.PREPARED_BY)
  if (data.CHECKED_BY) setCellIfExists('E46', data.CHECKED_BY)
  if (data.APPROVED_BY) setCellIfExists('H46', data.APPROVED_BY)

  // Replace placeholders {{KEY}} in all worksheets
  const replaceInString = (s: string) =>
    s.replace(/\{\{(.*?)\}\}/g, (_m, p1) => {
      const key = String(p1).trim()
      const v = (data as any)[key]
      return v !== undefined && v !== null ? String(v) : ''
    })

  wb.worksheets.forEach((ws: any) => {
    ws.eachRow({ includeEmpty: true }, (row: any) => {
      row.eachCell({ includeEmpty: true }, (cell: any) => {
        if (typeof cell.value === 'string' && /\{\{.*?\}\}/.test(cell.value)) {
          cell.value = replaceInString(cell.value)
        }
      })
    })
  })

  // Teaching rows: find anchor row by placeholder markers in first column
  const ws = wb.worksheets[0]

  const findRowByText = (needle: string | RegExp) => {
    let idx = -1
    ws.eachRow({ includeEmpty: true }, (row: any, rowNumber: number) => {
      const joined = row.values?.map?.((v: any) => (typeof v === 'string' ? v : '')).join(' ') || ''
      if (typeof needle === 'string') {
        if (joined.toLowerCase().includes(needle.toLowerCase())) idx = Math.min(idx === -1 ? rowNumber : idx, rowNumber)
      } else if (needle.test(joined)) {
        idx = Math.min(idx === -1 ? rowNumber : idx, rowNumber)
      }
    })
    return idx
  }

  const insertTableAtMarker = (markerKeys: string[], rows: any[], maxCols: number) => {
    let anchor = -1
    let templateRow: any = null
    ws.eachRow({ includeEmpty: true }, (row: any, rowNumber: number) => {
      const rowText = (row.values?.map?.((v: any) => (typeof v === 'string' ? v : '')).join(' ') || '') as string
      if (markerKeys.some((k) => rowText.includes(`{{${k}}}`))) {
        anchor = rowNumber
        templateRow = row
      }
    })
    if (anchor === -1) return false
    // Overwrite in-place starting at anchor row to keep layout intact
    for (let i = 0; i < rows.length; i++) {
      const r = ws.getRow(anchor + i)
      r.height = templateRow.height
      const obj = rows[i]
      const vals = Array.from({ length: maxCols }).map((_, idx) => Object.values(obj)[idx] as any)
      for (let c = 1; c <= maxCols; c++) {
        const cell = r.getCell(c)
        cell.value = vals[c - 1] ?? ''
        copyCellStyle(templateRow.getCell(c), cell)
      }
    }
    // Clear any remaining rows below the filled block that are part of the template data region
    for (let i = rows.length; i < 30; i++) { // clear up to 30 rows to cover template samples
      const r = ws.getRow(anchor + i)
      for (let c = 1; c <= maxCols; c++) {
        const cell = r.getCell(c)
        if (typeof cell.value === 'string' || typeof cell.value === 'number') cell.value = ''
      }
    }
    return true
  }

  // Ensure column headers are set (if not already in template)
  setCellValue('B9', 'Subject Code')
  setCellValue('D9', 'Day')
  setCellValue('E9', 'Time')
  setCellValue('F9', 'Room')

  // 1) Fill Subject Name column (B10-B28 for regular teaching schedules)
  // IMPORTANT: Show Subject NAME instead of course code (e.g., "Computer Programming" not "CS101")
  // 1a) Fill Column B (B10-B28) with subject_name from teaching_schedules table
  // CRITICAL: User requirement - B10-B28 should show subject_name from database
  // 1b) Fill Column C (C10-C28) with section from teaching_schedules table
  // CRITICAL: User requirement - C10-C28 should show section from database
  const teachingRows = data.TEACHING_ROWS || []
  const teachingSchedules = data.TEACHING_SCHEDULES || []
  populateSubjectNameColumn(ws0, teachingRows as TeachingSchedule[], teachingSchedules)
  populateSectionColumn(ws0, teachingRows as TeachingSchedule[], teachingSchedules)

  // 2) Move "EXAM DAY" from B23 to B29, remove from B23
  updateExamDayLayout(ws0)

  // 3) Fill Exam Day Subject Code column (B31-B41) - adjusted from B27-B37
  const examRows = data.EXAM_ROWS || []
  for (let i = 0; i < Math.min(11, examRows.length); i++) {
    const rowNum = 31 + i // B31, B32, B33, ..., B41 (adjusted from B27-B37)
    const subjCode = examRows[i]?.SUBJECT_CODE || ''
    setCellValue(`B${rowNum}`, subjCode)
  }

  // 4) Fill Exam Day Section column (C31-C41) - adjusted from C27-C37
  for (let i = 0; i < Math.min(11, examRows.length); i++) {
    const rowNum = 31 + i // C31, C32, C33, ..., C41 (adjusted from C27-C37)
    const section = examRows[i]?.SECTION || ''
    setCellValue(`C${rowNum}`, section)
  }

  // 5) Fill Day column (D9 is "Day" header, D10-D28 are data) - expanded from D10-D25
  // D9 header should already exist, just fill D10-D28
  for (let i = 0; i < Math.min(19, teachingRows.length); i++) {
    const rowNum = 10 + i
    const day = teachingRows[i]?.DAY || ''
    setCellValue(`D${rowNum}`, day)
  }

  // 6) Fill Time column (E9 is "Time" header, E10-E28 are data) - expanded from E10-E25
  for (let i = 0; i < Math.min(19, teachingRows.length); i++) {
    const rowNum = 10 + i
    const time = teachingRows[i]?.TIME || ''
    setCellValue(`E${rowNum}`, time)
  }

  // 7) Fill Room column (F9 is "Room" header, F10-F28 are data) - expanded from F10-F25
  for (let i = 0; i < Math.min(19, teachingRows.length); i++) {
    const rowNum = 10 + i
    const room = teachingRows[i]?.ROOM || ''
    setCellValue(`F${rowNum}`, room)
  }

  // 8) Fill Day, Time, Room for exam rows (D31-D41, E31-E41, F31-F41) - adjusted from D27-D37
  for (let i = 0; i < Math.min(11, examRows.length); i++) {
    const rowNum = 31 + i // D31, E31, F31, etc. (adjusted from D27-D37)
    const examRow = examRows[i]
    if (examRow) {
      // Day in acronym format (M, T, W, TH, F, S)
      setCellValue(`D${rowNum}`, examRow.DAY || '')
      // Time in format "8:00AM - 11:00AM"
      setCellValue(`E${rowNum}`, examRow.TIME || '')
      // Room code
      setCellValue(`F${rowNum}`, examRow.ROOM || '')
    }
  }

  // Helper function to find date header row by searching for date-like values
  const findDateHeaderRow = () => {
    // Search rows 6-10 for cells with numbers 1-31 (day numbers)
    for (let row = 6; row <= 10; row++) {
      let foundDate = false
      for (let col = 7; col <= 22; col++) {
        try {
          const cell = ws0.getRow(row).getCell(col)
          const val = cell.value
          if (val && typeof val === 'number' && val >= 1 && val <= 31) {
            foundDate = true
            break
          } else if (val && typeof val === 'string') {
            const numMatch = val.match(/^\d{1,2}$/)
            if (numMatch && parseInt(numMatch[0]) >= 1 && parseInt(numMatch[0]) <= 31) {
              foundDate = true
              break
            }
          }
        } catch {}
      }
      if (foundDate) return row
    }
    return 8 // Default fallback
  }

  // Helper function to find day name header row (usually one row above date row)
  const findDayHeaderRow = () => {
    const dateRow = findDateHeaderRow()
    return Math.max(1, dateRow - 1)
  }

  // 9) Colorize cutoff period dates
  if (data.CUTOFF_DATES && data.CUTOFF_START && data.CUTOFF_END) {
    const cutoffDates = data.CUTOFF_DATES
    const cutoffDayNumbers = new Set(cutoffDates.map(cd => cd.dayNumber))
    const dateHeaderRow = findDateHeaderRow()
    
    // Color all date cells that match cutoff period (yellow highlight: FFFF00)
    // Search columns G through V (columns 7-22) for date numbers
    for (let col = 7; col <= 22; col++) {
      try {
        const cell = ws0.getRow(dateHeaderRow).getCell(col)
        const cellValue = cell.value
        
        let dayNum: number | null = null
        if (cellValue && typeof cellValue === 'number' && cellValue >= 1 && cellValue <= 31) {
          dayNum = cellValue
        } else if (cellValue && typeof cellValue === 'string') {
          const dayMatch = cellValue.match(/^\s*(\d{1,2})\s*$/)
          if (dayMatch) {
            const parsed = parseInt(dayMatch[1])
            if (parsed >= 1 && parsed <= 31) {
              dayNum = parsed
            }
          }
        }
        
        if (dayNum !== null && cutoffDayNumbers.has(dayNum)) {
          // Colorize the cell with yellow highlight
          try {
            if (!cell.fill) cell.fill = { type: 'pattern', pattern: 'solid' } as any
            if (!cell.fill.fgColor) cell.fill.fgColor = { argb: '' } as any
            cell.fill.fgColor.argb = 'FFFF00' // Yellow
          } catch {}
        }
      } catch {}
    }
  }

  // 9) Highlight cutoff period cells and align day labels using helper functions
  const cutoffPeriod = data.CUTOFF_PERIOD as '26-10' | '11-25' | null
  
  if (cutoffPeriod && data.CUTOFF_DATES) {
    // Highlight cutoff period cells (G8-V8/F38-U38 for 26-10, G9-V9/F39-U39 for 11-25)
    highlightCutoffPeriodCells(ws0, cutoffPeriod)
    
    // Align day labels in G7-V7 to match exact dates
    alignDayLabels(ws0, data.CUTOFF_DATES as CutoffDate[], cutoffPeriod)
  }

  // 3) Non-teaching activities (B38-W43)
  // IMPORTANT: Show only for "Part Time Full Load" or "Full Time" employees
  // Hide for "Part Time" employees (only teaching activities)
  const employmentType = data.EMPLOYMENT_TYPE || ''
  const empTypeLower = employmentType.toLowerCase().trim()
  
  // CRITICAL: Improved detection for "Part Time Full Load" employees
  // Check for various possible formats: "Part Time Full Load", "Part-Time Full Load", "Part Time FullLoad", etc.
  const isPartTimeFull = 
    empTypeLower === 'part time full load' ||
    empTypeLower === 'part-time full load' ||
    empTypeLower === 'part time fullload' ||
    empTypeLower === 'part-time fullload' ||
    empTypeLower.includes('part time full load') ||
    empTypeLower.includes('part-time full load') ||
    empTypeLower.includes('parttimefullload') ||
    (empTypeLower.includes('part') && empTypeLower.includes('full') && empTypeLower.includes('load'))
  
  // Check for "Full Time" (but NOT "Part Time")
  const isFullTime = 
    empTypeLower === 'full time' ||
    empTypeLower === 'fulltime' ||
    (empTypeLower.includes('full time') && !empTypeLower.includes('part'))
  
  // CRITICAL: Hide non-teaching activities for Non-Teaching Part Time employees
  // Admin time only applies to Teaching staff or Part Time Full Load / Full Time employees
  const staffType = (data.STAFF_TYPE || '').toLowerCase().trim()
  const isNonTeachingStaffType = staffType === 'non-teaching' || staffType === 'non teaching'
  const isPartTimeOnlyEmployee = (
    empTypeLower === 'part time' || empTypeLower === 'part-time' || empTypeLower === 'parttime'
  ) && !(
    empTypeLower.includes('full load') || empTypeLower.includes('fullload') || empTypeLower.includes('full-load')
  )
  // Show non-teaching for Teaching staff or Part Time Full Load / Full Time employees
  // Hide for Non-Teaching Part Time employees
  const showNonTeaching = !(isNonTeachingStaffType && isPartTimeOnlyEmployee) && !isNonTeachingStaffType
  
  console.log('[Faculty Timesheet] Employment Type Detection:', {
    original: employmentType,
    lower: empTypeLower,
    staffType: data.STAFF_TYPE,
    isPartTimeFull,
    isFullTime,
    isNonTeachingStaffType,
    isPartTimeOnlyEmployee,
    showNonTeaching
  })
  
  if (showNonTeaching) {
    // Set up Non-Teaching Activities table structure
    
    // B38: "NON-TEACHING ACTIVITIES" - Bolded
    try {
      const b38Cell = ws0.getCell('B38')
      b38Cell.value = 'NON-TEACHING ACTIVITIES'
      if (!b38Cell.font) b38Cell.font = {}
      b38Cell.font.bold = true
    } catch {}
    
    // D38: "Schedule" - Bolded
    try {
      const d38Cell = ws0.getCell('D38')
      d38Cell.value = 'Schedule'
      if (!d38Cell.font) d38Cell.font = {}
      d38Cell.font.bold = true
    } catch {}
    
    // F38-U38 and G39-U39: Cutoff period dates with exact dates
    // Determine cutoff type (26-10 or 11-25) and fill dates accordingly
    if (data.CUTOFF_START && data.CUTOFF_END && data.CUTOFF_DATES) {
      const cutoffStart = new Date(data.CUTOFF_START + 'T00:00:00+08:00')
      const cutoffEnd = new Date(data.CUTOFF_END + 'T23:59:59+08:00')
      const startDay = cutoffStart.getDate()
      const endDay = cutoffEnd.getDate()
      
      // Determine cutoff type: 26-10 or 11-25
      const is26_10 = startDay === 26 && endDay === 10
      const is11_25 = startDay === 11 && endDay === 25
      
      // Get all dates in the current cutoff period
      const currentCutoffDates: number[] = []
      const currentDate = new Date(cutoffStart)
      while (currentDate <= cutoffEnd) {
        const dayOfMonth = currentDate.getDate()
        // Exclude Sundays (rest day)
        if (currentDate.getDay() !== 0) {
          currentCutoffDates.push(dayOfMonth)
        }
        currentDate.setDate(currentDate.getDate() + 1)
      }
      
      // Get dates for the OTHER cutoff period (for row 39)
      const otherCutoffDates: number[] = []
      if (is26_10) {
        // If current is 26-10, other is 11-25
        // Calculate 11-25 dates for the same month/year or next month
        const month = cutoffStart.getMonth()
        const year = cutoffStart.getFullYear()
        const otherStart = new Date(year, month, 11)
        const otherEnd = new Date(year, month, 25)
        
        const otherDate = new Date(otherStart)
        while (otherDate <= otherEnd) {
          const dayOfMonth = otherDate.getDate()
          if (otherDate.getDay() !== 0) {
            otherCutoffDates.push(dayOfMonth)
          }
          otherDate.setDate(otherDate.getDate() + 1)
        }
      } else if (is11_25) {
        // If current is 11-25, other is 26-10 (previous month end + current month start)
        const month = cutoffStart.getMonth()
        const year = cutoffStart.getFullYear()
        // Previous month's 26-end
        const prevMonth = month === 0 ? 11 : month - 1
        const prevYear = month === 0 ? year - 1 : year
        const prevMonthDays = new Date(prevYear, prevMonth + 1, 0).getDate()
        
        // Days 26-end of previous month
        for (let day = 26; day <= prevMonthDays; day++) {
          const testDate = new Date(prevYear, prevMonth, day)
          if (testDate.getDay() !== 0) {
            otherCutoffDates.push(day)
          }
        }
        
        // Days 1-10 of current month
        for (let day = 1; day <= 10; day++) {
          const testDate = new Date(year, month, day)
          if (testDate.getDay() !== 0) {
            otherCutoffDates.push(day)
          }
        }
      }
      
      // Map dates to columns G-U (columns 7-21) based on date header row
      const dateHeaderRow = findDateHeaderRow()
      
      // Row 38 (G38-U38): Current cutoff dates - Fill exact dates for current cutoff period
      for (let col = 7; col <= 21; col++) { // G to U (columns 7-21)
        try {
          const dateCell = ws0.getRow(dateHeaderRow).getCell(col)
          const dateValue = dateCell?.value
          let dayNum: number | null = null
          
          if (dateValue && typeof dateValue === 'number') {
            dayNum = dateValue
          } else if (dateValue && typeof dateValue === 'string') {
            const dayMatch = dateValue.toString().match(/^\s*(\d{1,2})\s*$/)
            if (dayMatch) dayNum = parseInt(dayMatch[1])
          }
          
          if (dayNum !== null && currentCutoffDates.includes(dayNum)) {
            const cell38 = ws0.getRow(38).getCell(col)
            cell38.value = dayNum
            // Highlight with yellow background
            if (!cell38.fill) cell38.fill = { type: 'pattern', pattern: 'solid' } as any
            if (!cell38.fill.fgColor) cell38.fill.fgColor = { argb: '' } as any
            cell38.fill.fgColor.argb = 'FFFF00' // Yellow
          }
        } catch {}
      }
      
      // Row 39 (G39-U39): Other cutoff dates - Fill exact dates for the OTHER cutoff period
      for (let col = 7; col <= 21; col++) { // G to U (columns 7-21)
        try {
          const dateCell = ws0.getRow(dateHeaderRow).getCell(col)
          const dateValue = dateCell?.value
          let dayNum: number | null = null
          
          if (dateValue && typeof dateValue === 'number') {
            dayNum = dateValue
          } else if (dateValue && typeof dateValue === 'string') {
            const dayMatch = dateValue.toString().match(/^\s*(\d{1,2})\s*$/)
            if (dayMatch) dayNum = parseInt(dayMatch[1])
          }
          
          if (dayNum !== null && otherCutoffDates.includes(dayNum)) {
            const cell39 = ws0.getRow(39).getCell(col)
            cell39.value = dayNum
            // Highlight with yellow background
            if (!cell39.fill) cell39.fill = { type: 'pattern', pattern: 'solid' } as any
            if (!cell39.fill.fgColor) cell39.fill.fgColor = { argb: '' } as any
            cell39.fill.fgColor.argb = 'FFFF00' // Yellow
          }
        } catch {}
      }
    }
    
    // B40: "REPORTING" - Bolded
    try {
      const b40Cell = ws0.getCell('B40')
      b40Cell.value = 'REPORTING'
      if (!b40Cell.font) b40Cell.font = {}
      b40Cell.font.bold = true
    } catch {}
    
    // F40-U40: Non-teaching load hours - Calculate based on attendance logs vs teaching schedules
    // Logic: 
    //  1. Time in before first class schedule = admin time
    //  2. Vacant periods between class schedules = admin time
    //  3. Time out after last class schedule = admin time
    //  4. Total all admin time and round to 2 decimals
    if (showNonTeaching && data.NON_TEACHING_ATTENDANCE && data.TEACHING_SCHEDULES && data.CUTOFF_DATES && data.CUTOFF_PERIOD) {
      const attendance = data.NON_TEACHING_ATTENDANCE
      const teachingSchedules = data.TEACHING_SCHEDULES || []
      
      // Convert attendance array to Map for easier lookup
      const attendanceMap = new Map<string, AttendanceData>()
      attendance.forEach(a => {
        attendanceMap.set(a.date, { date: a.date, timeIn: a.timeIn, timeOut: a.timeOut })
      })
      
      // Use helper function to calculate and place non-teaching loads
      calculateAndPlaceNonTeachingLoads(
        ws0,
        data.CUTOFF_PERIOD as '26-10' | '11-25',
        data.CUTOFF_DATES as CutoffDate[],
        attendanceMap,
        teachingSchedules
      )
    } else if (showNonTeaching) {
      // If no attendance data, initialize to 0
      for (let col = 6; col <= 21; col++) { // F to U
        try {
          const cell = ws0.getRow(40).getCell(col)
          cell.value = 0
          cell.numFmt = '0.00'
        } catch {}
      }
    }
    
    // R42, W42, B43, W43 are set by calculateAndPlaceNonTeachingLoads helper
    
  } else {
    // Clear non-teaching rows for Part Time employees (B38-W43)
    // Also clear ALL content and formatting in this section
    for (let rowNum = 38; rowNum <= 43; rowNum++) {
      for (let col = 2; col <= 23; col++) { // B to W
        try {
          const cell = ws0.getRow(rowNum).getCell(col)
          if (typeof cell.value === 'string' || typeof cell.value === 'number') {
            cell.value = ''
          }
        } catch {}
      }
    }
  }
  
  // CRITICAL: Remove yellow highlight from row 38, columns F to U (columns 6-21)
  // This clears any yellow fill that might be in the template
  try {
    for (let col = 6; col <= 21; col++) { // F to U
      const cell = ws0.getRow(38).getCell(col)
      if (cell && cell.fill) {
        // Remove any fill/background color
        cell.fill = null
      }
    }
  } catch (err) {
    console.error('[Faculty Timesheet] Error clearing row 38 yellow highlight:', err)
  }

  // 11) Auto-fit columns and rows for perfect formatting
  const autoFitColumns = () => {
    try {
      // Set optimal column widths based on content
      ws0.getColumn('A').width = 3  // Narrow for row numbers
      
      // Calculate optimal width for Subject Name column based on actual content
      let maxSubjectLength = 20 // Default minimum width
      for (let i = 0; i < Math.min(19, teachingRows.length); i++) {
        const subjName = String(teachingRows[i]?.SUBJECT_CODE || '')
        if (subjName.length > maxSubjectLength) {
          maxSubjectLength = subjName.length
        }
      }
      // Set width to fit content, but cap at 45 to prevent overflow
      // Add 5 characters padding for readability
      ws0.getColumn('B').width = Math.min(maxSubjectLength + 5, 45)
      
      ws0.getColumn('C').width = 12  // Section - medium width
      ws0.getColumn('D').width = 6   // Day - narrow for abbreviations
      ws0.getColumn('E').width = 16  // Time - sufficient for "8:00AM - 11:00AM"
      ws0.getColumn('F').width = 10  // Room - medium width for room codes
      
      // Daily hour columns (G-V) - narrow for numerical values
      for (let col = 7; col <= 22; col++) {
        ws0.getColumn(col).width = 6
      }
      
      ws0.getColumn('W').width = 10  // Total Hours - medium width
    } catch {}
  }

  // 12) Compute and fill daily hours for teaching and exam schedules
  const computeDailyHours = () => {
    // Get cutoff dates and day mappings
    if (!data.CUTOFF_DATES || !data.CUTOFF_START || !data.CUTOFF_END) return

    const cutoffDates = data.CUTOFF_DATES as CutoffDate[]
    const cutoffPeriod = (data.CUTOFF_PERIOD || '11-25') as '26-10' | '11-25'
    const dayHeaderRow = findDayHeaderRow() // Typically row 7

    // Build column mapping from date row using helper
    const columnMapping = buildColumnMapping(ws0, cutoffDates, cutoffPeriod, dayHeaderRow)

    // Calculate and place teaching loads using helper
    calculateAndPlaceTeachingLoads(ws0, teachingRows as TeachingSchedule[], columnMapping)

    // Process exam schedules (rows 27-37)
    const examRows = data.EXAM_ROWS || []
    for (let i = 0; i < Math.min(11, examRows.length); i++) {
      const rowNum = 27 + i
      const schedule = examRows[i]
      
      if (!schedule) continue
      
      const day = String(schedule.DAY || '').toUpperCase().trim()
      const time = String(schedule.TIME || '')
      const hours = parseTimeRangeToHours(time)
      
      if (hours <= 0 || !day) continue
      
      // Find matching columns based on day using helper
      const matchingColumns = columnMapping.filter(cm => daysMatch(day, cm.dayName))
      
      // Fill matching columns with computed hours
      for (const match of matchingColumns) {
        try {
          const cell = ws0.getRow(rowNum).getCell(match.col)
          cell.value = hours
          cell.numFmt = '0.00'
          cell.alignment = { ...cell.alignment, horizontal: 'right' }
        } catch {}
      }
      
      // Calculate and fill total in column W
      try {
        const totalCell = ws0.getRow(rowNum).getCell('W')
        const total = matchingColumns.length * hours
        totalCell.value = total
        totalCell.numFmt = '0.00'
        totalCell.alignment = { ...totalCell.alignment, horizontal: 'right' }
      } catch {}
    }
  }

  // Apply auto-formatting
  try {
    autoFitColumns()
  } catch (err) {
    console.error('[Faculty Timesheet] Error in autoFitColumns:', err)
  }
  
  // Compute daily hours
  try {
    computeDailyHours()
  } catch (err) {
    console.error('[Faculty Timesheet] Error in computeDailyHours:', err)
    throw new Error(`Failed to compute daily hours: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Generate buffer from workbook
  try {
    const buffer = await wb.xlsx.writeBuffer()
    
    // If returnBuffer is true, return the buffer directly (faster, no disk I/O)
    if (returnBuffer) {
      console.log('[Faculty Timesheet] Successfully generated buffer')
      // Handle both Buffer and ArrayBuffer types
      if (buffer instanceof Buffer) {
        return buffer
      } else if (buffer instanceof ArrayBuffer) {
        return Buffer.from(buffer)
      } else {
        return Buffer.from(buffer as any)
      }
    }
    
    // Otherwise, write to file for backward compatibility
    if (!outPath) {
      throw new Error('outPath is required when returnBuffer is false')
    }
    
    await fs.writeFile(outPath, buffer)
    await fs.access(outPath)
    console.log('[Faculty Timesheet] Successfully generated file at:', outPath)
    return outPath
  } catch (err) {
    console.error('[Faculty Timesheet] Error generating Excel:', err)
    throw new Error(`Failed to generate Excel: ${err instanceof Error ? err.message : String(err)}`)
  }
}




