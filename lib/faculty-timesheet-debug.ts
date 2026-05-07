/**
 * Faculty Timesheet Debug Helper
 * ===============================
 * Helper functions to debug why Excel format doesn't change
 */

export interface DebugInfo {
  hasTeachingSchedules: boolean
  teachingSchedulesCount: number
  hasCutoffDates: boolean
  cutoffDatesCount: number
  hasCutoffPeriod: boolean
  cutoffPeriod: string | null
  teachingRowsCount: number
  hasSubjectNameColumn: boolean
  hasSectionColumn: boolean
  payloadKeys: string[]
  errors: string[]
}

/**
 * Debug the payload to understand why format doesn't change
 */
export function debugFacultyTimesheetPayload(payload: any): DebugInfo {
  const errors: string[] = []
  const payloadKeys = Object.keys(payload || {})
  
  // Check for TEACHING_SCHEDULES
  const hasTeachingSchedules = Array.isArray(payload?.TEACHING_SCHEDULES)
  const teachingSchedulesCount = hasTeachingSchedules ? payload.TEACHING_SCHEDULES.length : 0
  
  if (!hasTeachingSchedules) {
    errors.push('❌ Missing TEACHING_SCHEDULES array - needed for populateSubjectNameColumn and populateSectionColumn')
  } else if (teachingSchedulesCount === 0) {
    errors.push('⚠️ TEACHING_SCHEDULES array is empty - no data to populate')
  }
  
  // Check for CUTOFF_DATES
  const hasCutoffDates = Array.isArray(payload?.CUTOFF_DATES)
  const cutoffDatesCount = hasCutoffDates ? payload.CUTOFF_DATES.length : 0
  
  if (!hasCutoffDates) {
    errors.push('❌ Missing CUTOFF_DATES array - needed for alignDayLabels and buildColumnMapping')
  } else if (cutoffDatesCount === 0) {
    errors.push('⚠️ CUTOFF_DATES array is empty - day alignment will fail')
  }
  
  // Check for CUTOFF_PERIOD
  const hasCutoffPeriod = payload?.CUTOFF_PERIOD !== undefined && payload?.CUTOFF_PERIOD !== null
  const cutoffPeriod = payload?.CUTOFF_PERIOD || null
  
  if (!hasCutoffPeriod) {
    errors.push('❌ Missing CUTOFF_PERIOD - needed for highlightCutoffPeriodCells')
  }
  
  // Check for TEACHING_ROWS
  const teachingRowsCount = Array.isArray(payload?.TEACHING_ROWS) ? payload.TEACHING_ROWS.length : 0
  
  if (teachingRowsCount === 0) {
    errors.push('⚠️ TEACHING_ROWS array is empty - no schedules to process')
  }
  
  // Check if subject_name and section are in TEACHING_SCHEDULES
  const hasSubjectNameColumn = hasTeachingSchedules && teachingSchedulesCount > 0 && 
    payload.TEACHING_SCHEDULES.some((s: any) => s.subject_name)
  const hasSectionColumn = hasTeachingSchedules && teachingSchedulesCount > 0 && 
    payload.TEACHING_SCHEDULES.some((s: any) => s.section)
  
  if (!hasSubjectNameColumn) {
    errors.push('❌ TEACHING_SCHEDULES missing subject_name field - column B will not be populated')
  }
  
  if (!hasSectionColumn) {
    errors.push('❌ TEACHING_SCHEDULES missing section field - column C will not be populated')
  }
  
  return {
    hasTeachingSchedules,
    teachingSchedulesCount,
    hasCutoffDates,
    cutoffDatesCount,
    hasCutoffPeriod,
    cutoffPeriod,
    teachingRowsCount,
    hasSubjectNameColumn,
    hasSectionColumn,
    payloadKeys,
    errors
  }
}

/**
 * Log debug information to console
 */
export function logFacultyTimesheetDebug(debugInfo: DebugInfo, context: string = 'Faculty Timesheet'): void {
  console.log(`\n[${context}] ========================================`)
  console.log(`[${context}] Debug Information:`)
  console.log(`[${context}] ========================================`)
  console.log(`[${context}] Teaching Schedules: ${debugInfo.hasTeachingSchedules ? '✅' : '❌'} (${debugInfo.teachingSchedulesCount} items)`)
  console.log(`[${context}] Cutoff Dates: ${debugInfo.hasCutoffDates ? '✅' : '❌'} (${debugInfo.cutoffDatesCount} items)`)
  console.log(`[${context}] Cutoff Period: ${debugInfo.hasCutoffPeriod ? '✅' : '❌'} (${debugInfo.cutoffPeriod || 'null'})`)
  console.log(`[${context}] Teaching Rows: ${debugInfo.teachingRowsCount} items`)
  console.log(`[${context}] Has Subject Name: ${debugInfo.hasSubjectNameColumn ? '✅' : '❌'}`)
  console.log(`[${context}] Has Section: ${debugInfo.hasSectionColumn ? '✅' : '❌'}`)
  console.log(`[${context}] Payload Keys:`, debugInfo.payloadKeys)
  
  if (debugInfo.errors.length > 0) {
    console.log(`[${context}] ⚠️ ERRORS FOUND:`)
    debugInfo.errors.forEach(err => console.log(`[${context}]   ${err}`))
  } else {
    console.log(`[${context}] ✅ All required fields present`)
  }
  console.log(`[${context}] ========================================\n`)
}

