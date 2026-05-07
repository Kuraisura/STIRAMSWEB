// Mathematical Time Validator
// Uses geometric, statistical, and pattern analysis for time validation

export interface TimeValidationMetrics {
  geometricAccuracy: number
  statisticalConsistency: number
  patternAlignment: number
  borderIntegrity: number
  overallScore: number
}

export interface GeometricAnalysis {
  timeBlockPositions: { x: number, y: number, width: number, height: number }[]
  borderThickness: number[]
  alignmentScore: number
  spacingConsistency: number
}

export interface StatisticalAnalysis {
  timeDistribution: { [time: string]: number }
  durationDistribution: { [duration: string]: number }
  dayDistribution: { [day: string]: number }
  consistencyScore: number
}

export class MathematicalTimeValidator {
  private static readonly STANDARD_TIME_SLOTS = [
    '7:00 AM', '7:30 AM', '8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM',
    '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM',
    '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM',
    '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM', '6:00 PM', '6:30 PM',
    '7:00 PM', '7:30 PM', '8:00 PM', '8:30 PM'
  ]

  private static readonly STANDARD_DURATIONS = [90, 120, 150, 180] // minutes

  /**
   * Perform comprehensive mathematical validation
   */
  static validateWithMathematics(schedule: any[]): TimeValidationMetrics {
    const geometric = this.analyzeGeometricProperties(schedule)
    const statistical = this.analyzeStatisticalProperties(schedule)
    const pattern = this.analyzePatternAlignment(schedule)
    const border = this.analyzeBorderIntegrity(schedule)

    return {
      geometricAccuracy: geometric.alignmentScore,
      statisticalConsistency: statistical.consistencyScore,
      patternAlignment: pattern,
      borderIntegrity: border,
      overallScore: this.calculateOverallScore(geometric, statistical, pattern, border)
    }
  }

  /**
   * Analyze geometric properties of time blocks
   */
  private static analyzeGeometricProperties(schedule: any[]): GeometricAnalysis {
    const timeBlockPositions = schedule.map(block => ({
      x: block.visualData?.position?.x || 0,
      y: block.visualData?.position?.y || 0,
      width: block.visualData?.size?.width || 0,
      height: block.visualData?.size?.height || 0
    }))

    const borderThickness = schedule.map(block => 
      block.visualData?.borders ? 
        Object.values(block.visualData.borders).filter(Boolean).length : 0
    )

    const alignmentScore = this.calculateAlignmentScore(timeBlockPositions)
    const spacingConsistency = this.calculateSpacingConsistency(timeBlockPositions)

    return {
      timeBlockPositions,
      borderThickness,
      alignmentScore,
      spacingConsistency
    }
  }

  /**
   * Analyze statistical properties
   */
  private static analyzeStatisticalProperties(schedule: any[]): StatisticalAnalysis {
    const timeDistribution: { [time: string]: number } = {}
    const durationDistribution: { [duration: string]: number } = {}
    const dayDistribution: { [day: string]: number } = {}

    schedule.forEach(block => {
      // Time distribution
      const startTime = this.normalizeTime(block.time_start)
      const endTime = this.normalizeTime(block.time_end)
      
      timeDistribution[startTime] = (timeDistribution[startTime] || 0) + 1
      timeDistribution[endTime] = (timeDistribution[endTime] || 0) + 1

      // Duration distribution
      const duration = this.calculateDuration(startTime, endTime)
      durationDistribution[duration.toString()] = (durationDistribution[duration.toString()] || 0) + 1

      // Day distribution
      dayDistribution[block.day] = (dayDistribution[block.day] || 0) + 1
    })

    const consistencyScore = this.calculateConsistencyScore(timeDistribution, durationDistribution, dayDistribution)

    return {
      timeDistribution,
      durationDistribution,
      dayDistribution,
      consistencyScore
    }
  }

  /**
   * Analyze pattern alignment with standard schedules
   */
  private static analyzePatternAlignment(schedule: any[]): number {
    let alignmentScore = 0
    let totalChecks = 0

    schedule.forEach(block => {
      const startTime = this.normalizeTime(block.time_start)
      const endTime = this.normalizeTime(block.time_end)

      // Check if times align with standard slots
      if (this.STANDARD_TIME_SLOTS.includes(startTime)) {
        alignmentScore += 1
      }
      if (this.STANDARD_TIME_SLOTS.includes(endTime)) {
        alignmentScore += 1
      }

      // Check if duration is standard
      const duration = this.calculateDuration(startTime, endTime)
      if (this.STANDARD_DURATIONS.includes(duration)) {
        alignmentScore += 1
      }

      totalChecks += 3
    })

    return totalChecks > 0 ? (alignmentScore / totalChecks) * 100 : 0
  }

  /**
   * Analyze border integrity
   */
  private static analyzeBorderIntegrity(schedule: any[]): number {
    let borderScore = 0
    let totalBlocks = 0

    schedule.forEach(block => {
      if (block.visualData?.borders) {
        const borders = block.visualData.borders
        const borderCount = Object.values(borders).filter(Boolean).length
        
        // Time blocks should have at least top and bottom borders
        if (borderCount >= 2) {
          borderScore += 1
        }
        
        // Bonus for having all four borders
        if (borderCount === 4) {
          borderScore += 0.5
        }
      }
      totalBlocks++
    })

    return totalBlocks > 0 ? (borderScore / totalBlocks) * 100 : 0
  }

  /**
   * Calculate alignment score based on geometric properties
   */
  private static calculateAlignmentScore(positions: { x: number, y: number, width: number, height: number }[]): number {
    if (positions.length < 2) return 100

    // Check horizontal alignment
    const xPositions = positions.map(p => p.x)
    const xVariance = this.calculateVariance(xPositions)
    
    // Check vertical alignment
    const yPositions = positions.map(p => p.y)
    const yVariance = this.calculateVariance(yPositions)
    
    // Check size consistency
    const widths = positions.map(p => p.width)
    const heights = positions.map(p => p.height)
    const widthVariance = this.calculateVariance(widths)
    const heightVariance = this.calculateVariance(heights)

    // Calculate overall alignment score (lower variance = higher score)
    const maxVariance = 1000 // Maximum expected variance
    const alignmentScore = Math.max(0, 100 - (xVariance + yVariance + widthVariance + heightVariance) / maxVariance * 100)
    
    return alignmentScore
  }

  /**
   * Calculate spacing consistency
   */
  private static calculateSpacingConsistency(positions: { x: number, y: number, width: number, height: number }[]): number {
    if (positions.length < 2) return 100

    // Calculate distances between adjacent blocks
    const distances: number[] = []
    for (let i = 0; i < positions.length - 1; i++) {
      const distance = Math.sqrt(
        Math.pow(positions[i + 1].x - positions[i].x, 2) + 
        Math.pow(positions[i + 1].y - positions[i].y, 2)
      )
      distances.push(distance)
    }

    if (distances.length === 0) return 100

    const variance = this.calculateVariance(distances)
    const consistencyScore = Math.max(0, 100 - variance / 100)
    
    return consistencyScore
  }

  /**
   * Calculate consistency score for statistical properties
   */
  private static calculateConsistencyScore(
    timeDistribution: { [time: string]: number },
    durationDistribution: { [duration: string]: number },
    dayDistribution: { [day: string]: number }
  ): number {
    let score = 0
    let totalChecks = 0

    // Check time distribution consistency
    const timeValues = Object.values(timeDistribution)
    if (timeValues.length > 0) {
      const timeVariance = this.calculateVariance(timeValues)
      score += Math.max(0, 100 - timeVariance)
      totalChecks++
    }

    // Check duration distribution consistency
    const durationValues = Object.values(durationDistribution)
    if (durationValues.length > 0) {
      const durationVariance = this.calculateVariance(durationValues)
      score += Math.max(0, 100 - durationVariance)
      totalChecks++
    }

    // Check day distribution consistency
    const dayValues = Object.values(dayDistribution)
    if (dayValues.length > 0) {
      const dayVariance = this.calculateVariance(dayValues)
      score += Math.max(0, 100 - dayVariance)
      totalChecks++
    }

    return totalChecks > 0 ? score / totalChecks : 0
  }

  /**
   * Calculate overall score from all metrics
   */
  private static calculateOverallScore(
    geometric: GeometricAnalysis,
    statistical: StatisticalAnalysis,
    patternAlignment: number,
    borderIntegrity: number
  ): number {
    const weights = {
      geometric: 0.3,
      statistical: 0.25,
      pattern: 0.25,
      border: 0.2
    }

    return (
      geometric.alignmentScore * weights.geometric +
      statistical.consistencyScore * weights.statistical +
      patternAlignment * weights.pattern +
      borderIntegrity * weights.border
    )
  }

  /**
   * Calculate variance of an array of numbers
   */
  private static calculateVariance(values: number[]): number {
    if (values.length === 0) return 0
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2))
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length
  }

  /**
   * Normalize time string
   */
  private static normalizeTime(time: string): string {
    if (!time) return ''
    return time.trim().toUpperCase()
  }

  /**
   * Calculate duration between two times in minutes
   */
  private static calculateDuration(startTime: string, endTime: string): number {
    const startMinutes = this.timeToMinutes(startTime)
    const endMinutes = this.timeToMinutes(endTime)
    return endMinutes - startMinutes
  }

  /**
   * Convert time string to minutes since midnight
   */
  private static timeToMinutes(time: string): number {
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

  /**
   * Generate mathematical corrections for invalid times
   */
  static generateMathematicalCorrections(schedule: any[]): any[] {
    const corrections: any[] = []
    const metrics = this.validateWithMathematics(schedule)

    schedule.forEach((block, index) => {
      if (metrics.overallScore < 70) { // Low confidence
        const correctedBlock = this.correctBlockMathematically(block, metrics)
        if (correctedBlock) {
          corrections.push({
            original: block,
            corrected: correctedBlock,
            confidence: metrics.overallScore
          })
        }
      }
    })

    return corrections
  }

  /**
   * Correct a single block using mathematical analysis
   */
  private static correctBlockMathematically(block: any, metrics: TimeValidationMetrics): any | null {
    const correctedBlock = { ...block }

    // If geometric accuracy is low, try to align with standard positions
    if (metrics.geometricAccuracy < 70) {
      correctedBlock.time_start = this.alignToStandardTime(block.time_start)
      correctedBlock.time_end = this.alignToStandardTime(block.time_end)
    }

    // If pattern alignment is low, try to fit standard durations
    if (metrics.patternAlignment < 70) {
      const duration = this.calculateDuration(block.time_start, block.time_end)
      const closestStandardDuration = this.findClosestStandardDuration(duration)
      
      if (closestStandardDuration !== duration) {
        const startMinutes = this.timeToMinutes(block.time_start)
        const endMinutes = startMinutes + closestStandardDuration
        correctedBlock.time_end = this.minutesToTime(endMinutes)
      }
    }

    return correctedBlock
  }

  /**
   * Align time to standard time slots
   */
  private static alignToStandardTime(time: string): string {
    const minutes = this.timeToMinutes(time)
    const closestSlot = this.findClosestStandardSlot(minutes)
    return closestSlot
  }

  /**
   * Find closest standard time slot
   */
  private static findClosestStandardSlot(minutes: number): string {
    let closest = this.STANDARD_TIME_SLOTS[0]
    let minDiff = Math.abs(this.timeToMinutes(closest) - minutes)

    for (const slot of this.STANDARD_TIME_SLOTS) {
      const diff = Math.abs(this.timeToMinutes(slot) - minutes)
      if (diff < minDiff) {
        minDiff = diff
        closest = slot
      }
    }

    return closest
  }

  /**
   * Find closest standard duration
   */
  private static findClosestStandardDuration(duration: number): number {
    let closest = this.STANDARD_DURATIONS[0]
    let minDiff = Math.abs(closest - duration)

    for (const standardDuration of this.STANDARD_DURATIONS) {
      const diff = Math.abs(standardDuration - duration)
      if (diff < minDiff) {
        minDiff = diff
        closest = standardDuration
      }
    }

    return closest
  }

  /**
   * Convert minutes to time string
   */
  private static minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
    
    return `${displayHours}:${mins.toString().padStart(2, '0')} ${ampm}`
  }
}

// Export utility functions
export const validateWithMathematics = (schedule: any[]): TimeValidationMetrics => {
  return MathematicalTimeValidator.validateWithMathematics(schedule)
}

export const generateMathematicalCorrections = (schedule: any[]): any[] => {
  return MathematicalTimeValidator.generateMathematicalCorrections(schedule)
}
