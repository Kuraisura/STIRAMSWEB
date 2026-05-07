// Enhanced Schedule Processor with Advanced Time Validation
import { validateScheduleTimes, ScheduleBlock, TimeValidationResult } from './schedule-validator'

export interface EnhancedScheduleResult {
  success: boolean
  data: {
    classes: ScheduleBlock[]
    validation: TimeValidationResult
    confidence: number
    corrections: ScheduleBlock[]
  }
  errors: string[]
  warnings: string[]
}

export class EnhancedScheduleProcessor {
  private static readonly TIME_EXTRACTION_PATTERNS = [
    // Pattern 1: Standard time ranges (8:00-10:00 AM)
    /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/gi,
    
    // Pattern 2: Time with AM/PM (8:00 AM - 10:00 AM)
    /(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/gi,
    
    // Pattern 3: 24-hour format (08:00-10:00)
    /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g,
    
    // Pattern 4: Single time with duration (8:00 AM for 2 hours)
    /(\d{1,2}):(\d{2})\s*(AM|PM)\s*(?:for|duration|length)\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/gi
  ]

  private static readonly DAY_PATTERNS = [
    /MONDAY|MON/i,
    /TUESDAY|TUE/i,
    /WEDNESDAY|WED/i,
    /THURSDAY|THU/i,
    /FRIDAY|FRI/i,
    /SATURDAY|SAT/i
  ]

  private static readonly SUBJECT_PATTERNS = [
    /HUMAN\s+COMP/i,
    /MEDINFO/i,
    /APPDEV/i,
    /WEB\s+DEV/i,
    /COMMUNICATION\s+ARTS/i,
    /STEM/i,
    /ABM/i
  ]

  /**
   * Process schedule image with enhanced validation
   */
  static async processScheduleImage(imageDescription: string): Promise<EnhancedScheduleResult> {
    try {
      // Step 1: Extract raw schedule data
      const rawSchedule = this.extractScheduleData(imageDescription)
      
      // Step 2: Validate the extracted data
      const validation = validateScheduleTimes(rawSchedule)
      
      // Step 3: Generate corrections if needed
      const corrections = this.generateCorrections(rawSchedule, validation)
      
      // Step 4: Calculate overall confidence
      const confidence = this.calculateConfidence(rawSchedule, validation)
      
      return {
        success: true,
        data: {
          classes: rawSchedule,
          validation,
          confidence,
          corrections
        },
        errors: validation.errors,
        warnings: validation.warnings
      }
    } catch (error) {
      return {
        success: false,
        data: {
          classes: [],
          validation: { isValid: false, confidence: 0, errors: [], warnings: [], suggestions: [] },
          confidence: 0,
          corrections: []
        },
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: []
      }
    }
  }

  /**
   * Extract schedule data from image description
   */
  private static extractScheduleData(description: string): ScheduleBlock[] {
    const schedule: ScheduleBlock[] = []
    const lines = description.split('\n').map(line => line.trim()).filter(line => line.length > 0)
    
    let currentDay = ''
    let currentTimeBlock = ''
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // Check for day headers
      const dayMatch = this.extractDay(line)
      if (dayMatch) {
        currentDay = dayMatch
        continue
      }
      
      // Check for time blocks
      const timeMatch = this.extractTimeBlock(line)
      if (timeMatch) {
        currentTimeBlock = timeMatch
        continue
      }
      
      // Check for class information
      const classInfo = this.extractClassInfo(line)
      if (classInfo && currentDay && currentTimeBlock) {
        const timeRange = this.parseTimeRange(currentTimeBlock)
        if (timeRange) {
          schedule.push({
            day: currentDay,
            time_start: timeRange.start,
            time_end: timeRange.end,
            subject: classInfo.subject,
            course_code: classInfo.course_code,
            room: classInfo.room,
            professor: classInfo.professor
          })
        }
      }
    }
    
    return schedule
  }

  /**
   * Extract day from line
   */
  private static extractDay(line: string): string | null {
    for (const pattern of this.DAY_PATTERNS) {
      const match = line.match(pattern)
      if (match) {
        return match[0].toUpperCase()
      }
    }
    return null
  }

  /**
   * Extract time block from line
   */
  private static extractTimeBlock(line: string): string | null {
    // Look for time patterns
    for (const pattern of this.TIME_EXTRACTION_PATTERNS) {
      const match = line.match(pattern)
      if (match) {
        return match[0]
      }
    }
    return null
  }

  /**
   * Extract class information from line
   */
  private static extractClassInfo(line: string): { subject: string, course_code: string, room: string, professor: string } | null {
    // Look for subject patterns
    const subjectMatch = line.match(/(HUMAN\s+COMP|MEDINFO|APPDEV|WEB\s+DEV|COMMUNICATION\s+ARTS|STEM|ABM)/i)
    if (!subjectMatch) return null

    // Extract course code (e.g., BSIT301A, CA/TO111-1A)
    const courseMatch = line.match(/([A-Z]{2,4}\d{3}[A-Z]?|[A-Z]{2,4}\/\w{2}\d{3}-\d{1,2}[A-Z]?)/i)
    
    // Extract room code (e.g., B3105, COMPL4)
    const roomMatch = line.match(/(B\d{4}|COMPL\d+)/i)
    
    // Extract professor name (usually at the end)
    const professorMatch = line.match(/([A-Z]\.\w+|[A-Z]\w+\.\w+)$/i)
    
    return {
      subject: subjectMatch[0],
      course_code: courseMatch ? courseMatch[0] : '',
      room: roomMatch ? roomMatch[0] : '',
      professor: professorMatch ? professorMatch[0] : ''
    }
  }

  /**
   * Parse time range from time block
   */
  private static parseTimeRange(timeBlock: string): { start: string, end: string } | null {
    // Pattern 1: 8:00-10:00 AM
    const pattern1 = timeBlock.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i)
    if (pattern1) {
      return {
        start: `${pattern1[1]}:${pattern1[2]} ${pattern1[5].toUpperCase()}`,
        end: `${pattern1[3]}:${pattern1[4]} ${pattern1[5].toUpperCase()}`
      }
    }
    
    // Pattern 2: 8:00 AM - 10:00 AM
    const pattern2 = timeBlock.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i)
    if (pattern2) {
      return {
        start: `${pattern2[1]}:${pattern2[2]} ${pattern2[3].toUpperCase()}`,
        end: `${pattern2[4]}:${pattern2[5]} ${pattern2[6].toUpperCase()}`
      }
    }
    
    // Pattern 3: 08:00-10:00 (24-hour format)
    const pattern3 = timeBlock.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/i)
    if (pattern3) {
      const startHour = parseInt(pattern3[1])
      const endHour = parseInt(pattern3[3])
      
      return {
        start: this.convertTo12Hour(startHour, parseInt(pattern3[2])),
        end: this.convertTo12Hour(endHour, parseInt(pattern3[4]))
      }
    }
    
    return null
  }

  /**
   * Convert 24-hour time to 12-hour format
   */
  private static convertTo12Hour(hour: number, minute: number): string {
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
    return `${displayHour}:${minute.toString().padStart(2, '0')} ${ampm}`
  }

  /**
   * Generate corrections for invalid times
   */
  private static generateCorrections(schedule: ScheduleBlock[], validation: TimeValidationResult): ScheduleBlock[] {
    if (validation.isValid) return []
    
    const corrections: ScheduleBlock[] = []
    
    schedule.forEach((block, index) => {
      if (validation.errors.some(error => error.includes(`Block ${index + 1}`))) {
        // Try to correct this block
        const correctedBlock = this.correctScheduleBlock(block)
        if (correctedBlock) {
          corrections.push(correctedBlock)
        }
      }
    })
    
    return corrections
  }

  /**
   * Correct a single schedule block
   */
  private static correctScheduleBlock(block: ScheduleBlock): ScheduleBlock | null {
    const correctedBlock = { ...block }
    
    // Try to correct time format
    correctedBlock.time_start = this.correctTimeFormat(block.time_start)
    correctedBlock.time_end = this.correctTimeFormat(block.time_end)
    
    // Validate the corrected times
    if (this.isValidTimeFormat(correctedBlock.time_start) && 
        this.isValidTimeFormat(correctedBlock.time_end)) {
      return correctedBlock
    }
    
    return null
  }

  /**
   * Correct time format
   */
  private static correctTimeFormat(time: string): string {
    if (!time) return time
    
    // Remove extra spaces
    let corrected = time.trim()
    
    // Fix common format issues
    corrected = corrected.replace(/\./g, ':') // Replace dots with colons
    corrected = corrected.replace(/\s+/g, ' ') // Normalize spaces
    
    // Add AM/PM if missing
    if (!corrected.includes('AM') && !corrected.includes('PM')) {
      const hourMatch = corrected.match(/^(\d{1,2}):(\d{2})$/)
      if (hourMatch) {
        const hour = parseInt(hourMatch[1])
        if (hour >= 7 && hour <= 11) {
          corrected += ' AM'
        } else if (hour >= 12 && hour <= 18) {
          corrected += ' PM'
        }
      }
    }
    
    return corrected
  }

  /**
   * Check if time format is valid
   */
  private static isValidTimeFormat(time: string): boolean {
    const patterns = [
      /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i,
      /^(\d{1,2}):(\d{2})$/
    ]
    
    return patterns.some(pattern => pattern.test(time))
  }

  /**
   * Calculate overall confidence score
   */
  private static calculateConfidence(schedule: ScheduleBlock[], validation: TimeValidationResult): number {
    let confidence = 100
    
    // Reduce confidence based on errors
    confidence -= validation.errors.length * 10
    
    // Reduce confidence based on warnings
    confidence -= validation.warnings.length * 2
    
    // Reduce confidence if no classes found
    if (schedule.length === 0) {
      confidence = 0
    }
    
    // Increase confidence if all times are in standard slots
    const standardSlots = ['7:00 AM', '7:30 AM', '8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM',
                          '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM',
                          '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM',
                          '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM', '6:00 PM', '6:30 PM',
                          '7:00 PM', '7:30 PM', '8:00 PM', '8:30 PM']
    
    const standardTimeCount = schedule.filter(block => 
      standardSlots.includes(block.time_start) && standardSlots.includes(block.time_end)
    ).length
    
    if (schedule.length > 0) {
      confidence += (standardTimeCount / schedule.length) * 20
    }
    
    return Math.max(0, Math.min(100, confidence))
  }
}

// Export utility functions
export const processScheduleWithValidation = async (imageDescription: string): Promise<EnhancedScheduleResult> => {
  return EnhancedScheduleProcessor.processScheduleImage(imageDescription)
}

export const quickTimeValidation = (time: string): boolean => {
  const patterns = [
    /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i,
    /^(\d{1,2}):(\d{2})$/
  ]
  
  return patterns.some(pattern => pattern.test(time))
}
