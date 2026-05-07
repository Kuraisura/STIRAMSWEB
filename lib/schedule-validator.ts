// Advanced Schedule Time Validator
// Uses multiple validation methods to ensure time accuracy

export interface TimeValidationResult {
  isValid: boolean
  confidence: number // 0-100
  errors: string[]
  warnings: string[]
  suggestions: string[]
  correctedTimes?: {
    time_start: string
    time_end: string
  }
}

export interface ScheduleBlock {
  day: string
  time_start: string
  time_end: string
  subject: string
  course_code: string
  room: string
  professor: string
  visualData?: {
    position: { x: number, y: number }
    size: { width: number, height: number }
    borders: { top: boolean, bottom: boolean, left: boolean, right: boolean }
  }
}

export class ScheduleTimeValidator {
  private static readonly TIME_PATTERNS = [
    /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i,
    /^(\d{1,2}):(\d{2})$/,
    /^(\d{1,2})\.(\d{2})\s*(AM|PM)$/i,
    /^(\d{1,2})\.(\d{2})$/
  ]

  private static readonly VALID_TIME_SLOTS = [
    '7:00 AM', '7:30 AM', '8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM',
    '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM',
    '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM',
    '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM', '6:00 PM', '6:30 PM',
    '7:00 PM', '7:30 PM', '8:00 PM', '8:30 PM'
  ]

  /**
   * Main validation method that uses multiple techniques
   */
  static validateSchedule(schedule: ScheduleBlock[]): TimeValidationResult {
    const errors: string[] = []
    const warnings: string[] = []
    const suggestions: string[] = []
    let confidence = 100

    // 1. Basic format validation
    const formatValidation = this.validateTimeFormats(schedule)
    errors.push(...formatValidation.errors)
    warnings.push(...formatValidation.warnings)
    confidence -= formatValidation.errors.length * 10

    // 2. Logical time sequence validation
    const sequenceValidation = this.validateTimeSequences(schedule)
    errors.push(...sequenceValidation.errors)
    warnings.push(...sequenceValidation.warnings)
    confidence -= sequenceValidation.errors.length * 5

    // 3. Visual structure validation (if visual data available)
    const visualValidation = this.validateVisualStructure(schedule)
    errors.push(...visualValidation.errors)
    warnings.push(...visualValidation.warnings)
    confidence -= visualValidation.errors.length * 3

    // 4. Mathematical relationship validation
    const mathValidation = this.validateMathematicalRelationships(schedule)
    errors.push(...mathValidation.errors)
    warnings.push(...mathValidation.warnings)
    confidence -= mathValidation.errors.length * 2

    // 5. Cross-reference validation
    const crossValidation = this.validateCrossReferences(schedule)
    errors.push(...crossValidation.errors)
    warnings.push(...crossValidation.warnings)
    confidence -= crossValidation.errors.length * 1

    // 6. Generate corrections if possible
    const corrections = this.generateCorrections(schedule, errors)

    return {
      isValid: errors.length === 0,
      confidence: Math.max(0, confidence),
      errors,
      warnings,
      suggestions,
      correctedTimes: corrections
    }
  }

  /**
   * Validates time format consistency
   */
  private static validateTimeFormats(schedule: ScheduleBlock[]): { errors: string[], warnings: string[] } {
    const errors: string[] = []
    const warnings: string[] = []

    schedule.forEach((block, index) => {
      const startTime = this.normalizeTime(block.time_start)
      const endTime = this.normalizeTime(block.time_end)

      // Check if time format is valid
      if (!this.isValidTimeFormat(startTime)) {
        errors.push(`Block ${index + 1}: Invalid start time format "${block.time_start}"`)
      }
      if (!this.isValidTimeFormat(endTime)) {
        errors.push(`Block ${index + 1}: Invalid end time format "${block.time_end}"`)
      }

      // Check if times are in valid schedule slots
      if (!this.isValidScheduleSlot(startTime)) {
        warnings.push(`Block ${index + 1}: Start time "${startTime}" not in standard schedule slots`)
      }
      if (!this.isValidScheduleSlot(endTime)) {
        warnings.push(`Block ${index + 1}: End time "${endTime}" not in standard schedule slots`)
      }
    })

    return { errors, warnings }
  }

  /**
   * Validates logical time sequences
   */
  private static validateTimeSequences(schedule: ScheduleBlock[]): { errors: string[], warnings: string[] } {
    const errors: string[] = []
    const warnings: string[] = []

    schedule.forEach((block, index) => {
      const startTime = this.normalizeTime(block.time_start)
      const endTime = this.normalizeTime(block.time_end)

      // Check if end time is after start time
      if (!this.isTimeAfter(startTime, endTime)) {
        errors.push(`Block ${index + 1}: End time "${endTime}" must be after start time "${startTime}"`)
      }

      // Check for reasonable class duration (15 minutes to 3 hours)
      const duration = this.getTimeDifference(startTime, endTime)
      if (duration < 15) {
        errors.push(`Block ${index + 1}: Class duration too short (${duration} minutes)`)
      } else if (duration > 180) {
        warnings.push(`Block ${index + 1}: Class duration very long (${duration} minutes)`)
      }
    })

    // Check for overlapping times on the same day
    const dayGroups = this.groupByDay(schedule)
    Object.entries(dayGroups).forEach(([day, blocks]) => {
      const overlaps = this.findTimeOverlaps(blocks)
      overlaps.forEach(overlap => {
        errors.push(`Day ${day}: Overlapping classes at ${overlap.time}`)
      })
    })

    return { errors, warnings }
  }

  /**
   * Validates visual structure (borders, positioning)
   */
  private static validateVisualStructure(schedule: ScheduleBlock[]): { errors: string[], warnings: string[] } {
    const errors: string[] = []
    const warnings: string[] = []

    schedule.forEach((block, index) => {
      if (!block.visualData) return

      const { position, size, borders } = block.visualData

      // Check if time block has proper borders (should have top/bottom borders)
      if (!borders.top && !borders.bottom) {
        warnings.push(`Block ${index + 1}: Time block may be missing top/bottom borders`)
      }

      // Check if time block is properly positioned
      if (position.x < 0 || position.y < 0) {
        warnings.push(`Block ${index + 1}: Time block has invalid position`)
      }

      // Check if time block has reasonable size
      if (size.width < 50 || size.height < 20) {
        warnings.push(`Block ${index + 1}: Time block may be too small (${size.width}x${size.height})`)
      }
    })

    return { errors, warnings }
  }

  /**
   * Validates mathematical relationships
   */
  private static validateMathematicalRelationships(schedule: ScheduleBlock[]): { errors: string[], warnings: string[] } {
    const errors: string[] = []
    const warnings: string[] = []

    schedule.forEach((block, index) => {
      const startTime = this.normalizeTime(block.time_start)
      const endTime = this.normalizeTime(block.time_end)

      // Check if times align with 30-minute intervals
      const startMinutes = this.getMinutesFromTime(startTime)
      const endMinutes = this.getMinutesFromTime(endTime)

      if (startMinutes % 30 !== 0) {
        warnings.push(`Block ${index + 1}: Start time "${startTime}" not aligned to 30-minute intervals`)
      }
      if (endMinutes % 30 !== 0) {
        warnings.push(`Block ${index + 1}: End time "${endTime}" not aligned to 30-minute intervals`)
      }

      // Check for standard class durations (1.5, 2, 2.5, 3 hours)
      const duration = this.getTimeDifference(startTime, endTime)
      const standardDurations = [90, 120, 150, 180] // minutes
      if (!standardDurations.includes(duration)) {
        warnings.push(`Block ${index + 1}: Non-standard class duration (${duration} minutes)`)
      }
    })

    return { errors, warnings }
  }

  /**
   * Validates cross-references between related blocks
   */
  private static validateCrossReferences(schedule: ScheduleBlock[]): { errors: string[], warnings: string[] } {
    const errors: string[] = []
    const warnings: string[] = []

    // Group by subject to find related classes
    const subjectGroups = this.groupBySubject(schedule)
    Object.entries(subjectGroups).forEach(([subject, blocks]) => {
      if (blocks.length > 1) {
        // Check if related classes have consistent timing patterns
        const timePatterns = blocks.map(block => ({
          day: block.day,
          start: this.getMinutesFromTime(this.normalizeTime(block.time_start)),
          end: this.getMinutesFromTime(this.normalizeTime(block.time_end))
        }))

        // Check for consistent start/end times across days
        const startTimes = timePatterns.map(p => p.start)
        const endTimes = timePatterns.map(p => p.end)

        if (new Set(startTimes).size > 1) {
          warnings.push(`Subject "${subject}": Inconsistent start times across days`)
        }
        if (new Set(endTimes).size > 1) {
          warnings.push(`Subject "${subject}": Inconsistent end times across days`)
        }
      }
    })

    return { errors, warnings }
  }

  /**
   * Generates corrections for invalid times
   */
  private static generateCorrections(schedule: ScheduleBlock[], errors: string[]): { time_start: string, time_end: string } | undefined {
    if (errors.length === 0) return undefined

    // Find the most likely corrections based on common patterns
    const corrections = schedule.map(block => {
      const startTime = this.normalizeTime(block.time_start)
      const endTime = this.normalizeTime(block.time_end)

      // Try to correct common issues
      const correctedStart = this.correctTimeFormat(startTime)
      const correctedEnd = this.correctTimeFormat(endTime)

      return {
        time_start: correctedStart,
        time_end: correctedEnd
      }
    })

    return corrections[0] // Return first correction as example
  }

  // Helper methods
  private static normalizeTime(time: string): string {
    if (!time) return ''
    
    // Remove extra spaces and normalize format
    return time.trim().toUpperCase()
  }

  private static isValidTimeFormat(time: string): boolean {
    return this.TIME_PATTERNS.some(pattern => pattern.test(time))
  }

  private static isValidScheduleSlot(time: string): boolean {
    const normalizedTime = this.normalizeTime(time)
    return this.VALID_TIME_SLOTS.includes(normalizedTime)
  }

  private static isTimeAfter(startTime: string, endTime: string): boolean {
    const startMinutes = this.getMinutesFromTime(startTime)
    const endMinutes = this.getMinutesFromTime(endTime)
    return endMinutes > startMinutes
  }

  private static getTimeDifference(startTime: string, endTime: string): number {
    const startMinutes = this.getMinutesFromTime(startTime)
    const endMinutes = this.getMinutesFromTime(endTime)
    return endMinutes - startMinutes
  }

  private static getMinutesFromTime(time: string): number {
    const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
    if (!match) return 0

    let hours = parseInt(match[1])
    const minutes = parseInt(match[2])
    const ampm = match[3]?.toUpperCase()

    // Convert to 24-hour format
    if (ampm === 'AM' && hours === 12) {
      hours = 0
    } else if (ampm === 'PM' && hours !== 12) {
      hours += 12
    }

    return hours * 60 + minutes
  }

  private static groupByDay(schedule: ScheduleBlock[]): { [day: string]: ScheduleBlock[] } {
    return schedule.reduce((groups, block) => {
      const day = block.day
      if (!groups[day]) groups[day] = []
      groups[day].push(block)
      return groups
    }, {} as { [day: string]: ScheduleBlock[] })
  }

  private static groupBySubject(schedule: ScheduleBlock[]): { [subject: string]: ScheduleBlock[] } {
    return schedule.reduce((groups, block) => {
      const subject = block.subject
      if (!groups[subject]) groups[subject] = []
      groups[subject].push(block)
      return groups
    }, {} as { [subject: string]: ScheduleBlock[] })
  }

  private static findTimeOverlaps(blocks: ScheduleBlock[]): { time: string, blocks: string[] }[] {
    const overlaps: { time: string, blocks: string[] }[] = []
    
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const block1 = blocks[i]
        const block2 = blocks[j]
        
        if (this.timesOverlap(block1.time_start, block1.time_end, block2.time_start, block2.time_end)) {
          overlaps.push({
            time: `${block1.time_start}-${block1.time_end}`,
            blocks: [block1.subject, block2.subject]
          })
        }
      }
    }
    
    return overlaps
  }

  private static timesOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
    const start1Minutes = this.getMinutesFromTime(this.normalizeTime(start1))
    const end1Minutes = this.getMinutesFromTime(this.normalizeTime(end1))
    const start2Minutes = this.getMinutesFromTime(this.normalizeTime(start2))
    const end2Minutes = this.getMinutesFromTime(this.normalizeTime(end2))

    return start1Minutes < end2Minutes && start2Minutes < end1Minutes
  }

  private static correctTimeFormat(time: string): string {
    const normalized = this.normalizeTime(time)
    
    // Try to fix common format issues
    if (normalized.includes('.')) {
      return normalized.replace('.', ':')
    }
    
    if (!normalized.includes('AM') && !normalized.includes('PM')) {
      // Try to determine AM/PM based on hour
      const hourMatch = normalized.match(/^(\d{1,2}):(\d{2})$/)
      if (hourMatch) {
        const hour = parseInt(hourMatch[1])
        if (hour >= 7 && hour <= 11) {
          return normalized + ' AM'
        } else if (hour >= 12 && hour <= 18) {
          return normalized + ' PM'
        }
      }
    }
    
    return normalized
  }
}

// Export utility functions for easy use
export const validateScheduleTimes = (schedule: ScheduleBlock[]): TimeValidationResult => {
  return ScheduleTimeValidator.validateSchedule(schedule)
}

export const quickTimeValidation = (time: string): boolean => {
  return ScheduleTimeValidator['isValidTimeFormat'](time)
}
