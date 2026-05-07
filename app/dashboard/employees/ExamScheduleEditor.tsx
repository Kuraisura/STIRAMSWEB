"use client"

import React, { memo, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Calendar } from '@/components/ui/calendar'
import { Clock, Trash2, AlertCircle, Calendar as CalendarLucide, BookOpen, MapPin, UserCheck, UserX, ArrowLeftRight, CalendarIcon, X, Check, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

export type ExamScheduleRow = {
  tempId: string
  exam_schedule_id?: number
  day_of_week: 1 | 2 | 3 | 4 | 5 | 6
  time_start: string
  time_end: string
  course_code: string
  subject_name: string
  section: string
  room_code: string
  exam_date?: string | null // Specific date when exam is scheduled (YYYY-MM-DD format). If null, follows weekly schedule
  exam_type?: 'prelims' | 'midterms' | 'prefinals' | 'finals' | 'quiz' | 'diagnostic' | 'practical' | 'oral' | 'regular' // Requirement #17: Exam type segregation
  status?: 'available' | 'unavailable' | 'on-leave' | 'substituted' | 'absent'
  substitute_employee_id?: number | null
  substitute_employee_name?: string
  unavailable_reason?: string
}

type Props = {
  rows: ExamScheduleRow[]
  onChange: (id: string, field: keyof ExamScheduleRow, value: any) => void
  onAdd: () => void
  onRemove: (row: ExamScheduleRow) => void
  onSubstitute?: (row: ExamScheduleRow) => void
  availableTeachers?: Array<{ employee_id: number; full_name: string }>
}

const days = [
  { v: 1 as const, t: 'Monday', short: 'Mon', color: 'bg-blue-500' },
  { v: 2 as const, t: 'Tuesday', short: 'Tues', color: 'bg-green-500' },
  { v: 3 as const, t: 'Wednesday', short: 'Wed', color: 'bg-yellow-500' },
  { v: 4 as const, t: 'Thursday', short: 'Thurs', color: 'bg-purple-500' },
  { v: 5 as const, t: 'Friday', short: 'Fri', color: 'bg-pink-500' },
  { v: 6 as const, t: 'Saturday', short: 'Sat', color: 'bg-indigo-500' },
]

// Building dictionary - all available building/room codes
const BUILDING_DICTIONARY = [
  "B1201",
  "B1202",
  "B1203",
  "B1204",
  "B1205",
  "B1206",
  "B1207",
  "B1208",
  "B1301",
  "B1302",
  "B1303",
  "B1304",
  "B1305",
  "B2101",
  "B2102",
  "B2202",
  "B2203",
  "B2204",
  "GYM3 (LEC)",
  "GYM2 (LEC)",
  "COMPL1",
  "COMPL2",
  "COMPL3",
  "COMPL4",
  "COMPL5",
  "B3101",
  "B3102",
  "B3103",
  "B3104",
  "B3105",
  "B3106",
  "B3107",
  "B3108",
  "B3201",
  "B3202",
  "B3203",
  "B3204",
  "B3205",
  "B3206",
  "B3207",
  "B3208",
  "B3301",
  "B3302",
  "B3303",
  "B3304",
  "B3305",
  "B3306",
  "B3307"
]

// Get all buildings for suggestions
const getAllBuildings = (): string[] => {
  return BUILDING_DICTIONARY
}

// Filter buildings based on search query
const filterBuildings = (query: string): string[] => {
  if (!query || !query.trim()) return getAllBuildings()
  const normalizedQuery = query.toUpperCase().trim()
  return getAllBuildings().filter(building => 
    building.toUpperCase().includes(normalizedQuery)
  )
}

const validateTime = (time: string): boolean => {
  if (!time) return false
  const timeRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM|am|pm)$/
  return timeRegex.test(time.trim())
}

// Convert time string to minutes since midnight for comparison
const timeToMinutes = (timeStr: string): number | null => {
  if (!timeStr || !validateTime(timeStr)) return null
  
  const trimmed = timeStr.trim()
  const match = trimmed.match(/^(0?[1-9]|1[0-2]):([0-5][0-9])\s?(AM|PM)$/i)
  if (!match) return null
  
  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const period = match[3].toUpperCase()
  
  // Convert to 24-hour format
  if (period === 'PM' && hours !== 12) {
    hours += 12
  } else if (period === 'AM' && hours === 12) {
    hours = 0
  }
  
  return hours * 60 + minutes
}

// Check if two time ranges overlap
const doTimeRangesOverlap = (
  start1: number | null,
  end1: number | null,
  start2: number | null,
  end2: number | null
): boolean => {
  if (start1 === null || end1 === null || start2 === null || end2 === null) return false
  // Two ranges overlap if: start1 < end2 AND start2 < end1
  return start1 < end2 && start2 < end1
}

const validateRow = (row: ExamScheduleRow, allRows: ExamScheduleRow[]): string[] => {
  const errors: string[] = []
  
  if (!row.time_start || !validateTime(row.time_start)) {
    errors.push('Invalid time start format. Use format: 08:30 AM')
  }
  
  if (!row.time_end || !validateTime(row.time_end)) {
    errors.push('Invalid time end format. Use format: 10:00 AM')
  }
  
  // Validate time range - start must be before end, and not during invalid hours (12 AM - 6 AM)
  if (row.time_start && row.time_end && validateTime(row.time_start) && validateTime(row.time_end)) {
    const startMinutes = timeToMinutes(row.time_start)
    const endMinutes = timeToMinutes(row.time_end)
    
    if (startMinutes !== null && endMinutes !== null) {
      // Check if start is after end (invalid range)
      if (startMinutes >= endMinutes) {
        errors.push('Time start must be before time end. Invalid time range.')
      }
      
      // Validate acceptable time range: 7:00 AM to 9:00 PM only
      const sevenAM = 7 * 60 // 7:00 AM in minutes
      const ninePM = 21 * 60 // 9:00 PM in minutes (21:00 in 24-hour format)
      
      if (startMinutes < sevenAM || startMinutes > ninePM) {
        errors.push('Exam start time must be between 7:00 AM and 9:00 PM.')
      }
      
      if (endMinutes < sevenAM || endMinutes > ninePM) {
        errors.push('Exam end time must be between 7:00 AM and 9:00 PM.')
      }
      
      // Also check if the range spans beyond acceptable hours
      if (startMinutes < endMinutes && endMinutes - startMinutes > 14 * 60) {
        // More than 14 hours - likely invalid
        errors.push('Exam duration exceeds 14 hours. Please check your time range.')
      }
      
      // Check for time conflicts with other schedules on the same day
      const conflictingRow = allRows.find((otherRow) => {
        // Skip self
        if (otherRow.tempId === row.tempId) return false
        
        // Only check same day
        if (otherRow.day_of_week !== row.day_of_week) return false
        
        // Skip if the other row doesn't have valid times
        if (!otherRow.time_start || !otherRow.time_end || 
            !validateTime(otherRow.time_start) || !validateTime(otherRow.time_end)) {
          return false
        }
        
        const otherStart = timeToMinutes(otherRow.time_start)
        const otherEnd = timeToMinutes(otherRow.time_end)
        
        // Check if time ranges overlap
        return doTimeRangesOverlap(startMinutes, endMinutes, otherStart, otherEnd)
      })
      
      if (conflictingRow) {
        errors.push(`Conflicting time! Another exam schedule on the same day overlaps with this time range (${conflictingRow.time_start} - ${conflictingRow.time_end}). Please choose a different time range.`)
      }
    }
  }
  
  // Course code auto-generated in background (no validation needed - hidden from user)
  
  if (!row.subject_name || row.subject_name.trim().length < 3) {
    errors.push('Subject name is required (min 3 characters)')
  }
  
  // Building/Room code validation
  if (row.room_code && row.room_code.trim().length > 0) {
    const roomCode = row.room_code.trim().toUpperCase()
    // Valid formats:
    // - COMPL[1-6] (e.g., COMPL1, COMPL2, COMPL3, COMPL4, COMPL5, COMPL6)
    // - B[1-9][0-9]{3} (e.g., B1204, B2101, B3201)
    // - C[0-9]{3,4} (e.g., C101, C1234)
    const roomCodeRegex = /^(COMPL[1-6]|B[1-9]\d{3}|C\d{3,4})$/
    if (!roomCodeRegex.test(roomCode)) {
      errors.push('Invalid room code format. Use: COMPL[1-6] (e.g., COMPL4), B[building][room] (e.g., B3201), or C[room] (e.g., C101)')
    }
  } else {
    errors.push('Building/Room code is required')
  }
  
  // Exam date validation - REQUIRED
  if (!row.exam_date || row.exam_date.trim() === '') {
    errors.push('Exam date is required. Please select a specific date for this exam.')
  } else {
    // Validate that exam_date is a valid date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(row.exam_date.trim())) {
      errors.push('Exam date must be in YYYY-MM-DD format')
    } else {
      // Validate that the date is not in the past
      try {
        const examDate = new Date(row.exam_date + 'T00:00:00')
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        if (examDate < today) {
          errors.push('Exam date cannot be in the past')
        }
      } catch {
        errors.push('Invalid exam date format')
      }
    }
  }
  
  return errors
}

// Building Autocomplete Component
function BuildingAutocomplete({ 
  value, 
  onChange, 
  onBlur, 
  hasError,
  rowId 
}: { 
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  hasError: boolean
  rowId: string
}) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const filteredBuildings = filterBuildings(value)

  const selectBuilding = (building: string) => {
    onChange(building.toUpperCase())
    setOpen(false)
    setTimeout(() => {
      inputRef.current?.blur()
    }, 100)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Input
            ref={inputRef}
            className={cn(
              "h-10 font-mono border-gray-300 dark:border-neutral-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
              hasError && 'border-red-500 dark:border-red-500 focus:ring-red-500 focus:border-red-500'
            )}
            value={value}
            onChange={(e) => {
              onChange(e.target.value.toUpperCase())
              setOpen(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filteredBuildings.length === 1) {
                e.preventDefault()
                selectBuilding(filteredBuildings[0])
              }
              if (e.key === 'Escape') {
                setOpen(false)
              }
            }}
            onFocus={() => setOpen(true)}
            onBlur={onBlur}
            placeholder="B3201, COMPL4, GYM3 (LEC)"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent 
        className="w-(--radix-popover-trigger-width) p-0" 
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onWheel={(e) => {
          // Allow scrolling within the popover
          e.stopPropagation()
        }}
      >
        <Command shouldFilter={false}>
          <CommandList className="max-h-[300px] overflow-y-auto overscroll-contain">
            {filteredBuildings.length === 0 ? (
              <CommandEmpty>No buildings found.</CommandEmpty>
            ) : (
              <CommandGroup heading="Available Buildings">
                {filteredBuildings.map((building) => (
                  <CommandItem
                    key={building}
                    value={building}
                    onSelect={() => selectBuilding(building)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value.toUpperCase() === building.toUpperCase() ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {building}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export const ExamScheduleEditor = memo(function ExamScheduleEditor({ rows, onChange, onAdd, onRemove, onSubstitute, availableTeachers = [] }: Props) {
  const [validationErrors, setValidationErrors] = React.useState<Record<string, string[]>>({})
  // Cache for auto-filling course codes based on previous entries
  const [courseCodeCache, setCourseCodeCache] = React.useState<Record<string, { subject_name: string; section: string }>>({})
  // State for date picker dialogs - track which row's date picker is open
  const [openDatePickerForRow, setOpenDatePickerForRow] = React.useState<string | null>(null)

  // Initialize cache from existing rows
  React.useEffect(() => {
    const cache: Record<string, { subject_name: string; section: string }> = {}
    rows.forEach(row => {
      if (row.course_code && row.course_code.trim().length >= 4) {
        const code = row.course_code.trim().toUpperCase()
        if (!cache[code] || (!cache[code].subject_name && row.subject_name)) {
          cache[code] = {
            subject_name: row.subject_name || cache[code]?.subject_name || '',
            section: row.section || cache[code]?.section || ''
          }
        }
      }
    })
    setCourseCodeCache(cache)
  }, [rows])

  // Helper function to check if a specific field has an error
  const getFieldError = (rowId: string, fieldName: string): boolean => {
    const errors = validationErrors[rowId] || []
    return errors.some(err => {
      const lowerErr = err.toLowerCase()
      const lowerField = fieldName.toLowerCase()
      // Check if error mentions the field
      return lowerErr.includes(lowerField) || 
             (lowerField === 'time start' && (lowerErr.includes('time start') || lowerErr.includes('start time') || lowerErr.includes('conflicting'))) ||
             (lowerField === 'time end' && (lowerErr.includes('time end') || lowerErr.includes('end time') || lowerErr.includes('conflicting'))) ||
             (lowerField === 'course code' && (lowerErr.includes('course') || lowerErr.includes('subject code'))) ||
             (lowerField === 'subject name' && lowerErr.includes('subject name')) ||
             (lowerField === 'room code' && lowerErr.includes('room code')) ||
             (lowerField === 'exam date' && lowerErr.includes('exam date')) ||
             (lowerField === 'time' && (lowerErr.includes('time range') || lowerErr.includes('time start') || lowerErr.includes('time end') || lowerErr.includes('conflicting')))
    })
  }

  const handleBlur = (rowId: string) => {
    const row = rows.find(r => r.tempId === rowId)
    if (row) {
      const errors = validateRow(row, rows)
      setValidationErrors(prev => ({
        ...prev,
        [rowId]: errors
      }))
    }
  }

  // Real-time validation - clear errors when conditions are met
  const validateFieldOnChange = (rowId: string, field: keyof ExamScheduleRow, value: any) => {
    const row = rows.find(r => r.tempId === rowId)
    if (!row) return
    
    // Create updated row with new value
    const updatedRow = { ...row, [field]: value }
    
    // Re-validate the row (pass all rows for conflict checking)
    const errors = validateRow(updatedRow, rows)
    
    // Update validation errors - if all errors are cleared, remove the entry
    setValidationErrors(prev => {
      if (errors.length === 0) {
        const newErrors = { ...prev }
        delete newErrors[rowId]
        return newErrors
      }
      return {
        ...prev,
        [rowId]: errors
      }
    })
  }

  const handleTimeChange = (rowId: string, field: 'time_start' | 'time_end', value: string) => {
    // Auto-uppercase AM/PM, add spacing, and restrict to only AM or PM
    let processedValue = value
    
    // First, add space before AM/PM if missing (e.g., "12:00AM" -> "12:00 AM")
    // Match patterns like "12:00AM", "12:00PM", "12:00am", etc.
    processedValue = processedValue.replace(/(\d)([Aa][Mm]|[Pp][Mm])\b/g, '$1 $2')
    
    // Replace any lowercase/mixed case am/pm with uppercase AM/PM
    // This handles: "am", "pm", "Am", "Pm", "aM", "pM", "AM", "PM"
    processedValue = processedValue.replace(/\b([Aa][Mm]|[Pp][Mm])\b/g, (match) => {
      const upper = match.toUpperCase()
      // Only allow AM or PM
      if (upper === 'AM' || upper === 'PM') {
        return upper
      }
      return match
    })
    
    // Remove any invalid characters that might come after AM/PM
    // If user types something like "AMX" or "PM9", remove the extra characters
    processedValue = processedValue.replace(/(AM|PM)([^AMPM\s])/gi, '$1')
    
    onChange(rowId, field, processedValue)
  }

  const getDayColor = (dayOfWeek: number) => {
    const day = days.find(d => d.v === dayOfWeek)
    return day?.color || 'bg-gray-500'
  }

  const getDayShort = (dayOfWeek: number) => {
    const day = days.find(d => d.v === dayOfWeek)
    return day?.short || ''
  }

  return (
    <div className="space-y-4">
      {/* Exam Schedule Rows */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="relative mb-4">
            <div className="absolute inset-0 bg-red-500/10 dark:bg-red-500/20 rounded-full blur-2xl" />
            <div className="relative bg-linear-to-br from-red-50 to-pink-50 dark:from-red-950/50 dark:to-pink-950/50 p-6 rounded-full border-2 border-red-200 dark:border-red-800">
              <CalendarLucide className="h-12 w-12 text-red-600 dark:text-red-400" />
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">No Exam Schedules</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-sm">
            Start building your exam schedule by adding your first exam
          </p>
          <Button 
            onClick={onAdd}
            className="bg-linear-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white shadow-lg shadow-red-500/30"
          >
            <CalendarLucide className="h-4 w-4 mr-2" />
            Add First Exam
          </Button>
        </div>
      ) : (
        rows.map((row, index) => {
          const rowErrors = validationErrors[row.tempId] || []
          const hasErrors = rowErrors.length > 0
          const dayColor = getDayColor(row.day_of_week)
          const dayShort = getDayShort(row.day_of_week)
          
          return (
            <div 
              key={row.tempId} 
              className={`group relative bg-white dark:bg-neutral-900 rounded-xl border transition-all duration-200 overflow-hidden ${
                hasErrors 
                  ? 'border-red-300 dark:border-red-800 shadow-lg shadow-red-500/10' 
                  : 'border-gray-200 dark:border-neutral-700 hover:border-red-300 dark:hover:border-red-800 hover:shadow-lg hover:shadow-red-500/10'
              }`}
            >
              {/* Colored Left Border */}
              <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${dayColor} opacity-80`} />

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 bg-linear-to-r from-gray-50/80 to-transparent dark:from-neutral-800/50 border-b border-gray-100 dark:border-neutral-800">
                <div className="flex items-center gap-3">
                  <div className={`${dayColor} text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-sm`}>
                    {dayShort} #{index + 1}
                  </div>
                  <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Exam Schedule #{index + 1}
                  </div>
                  {row.status && row.status !== 'available' && (
                    <Badge 
                      variant="outline" 
                      className={
                        row.status === 'substituted' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-300 dark:border-green-700'
                          : row.status === 'on-leave'
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700'
                          : row.status === 'absent'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-300 dark:border-red-700'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400 border-gray-300 dark:border-gray-700'
                      }
                    >
                      {row.status === 'substituted' && <UserCheck className="h-3 w-3 mr-1" />}
                      {row.status === 'on-leave' && <ArrowLeftRight className="h-3 w-3 mr-1" />}
                      {row.status === 'absent' && <UserX className="h-3 w-3 mr-1" />}
                      {row.status.replace('-', ' ').toUpperCase()}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {onSubstitute && (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => onSubstitute(row)}
                      className="h-8 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" />
                      {row.status === 'substituted' ? 'Manage Sub' : 'Assign Sub'}
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => { 
                      onRemove(row);
                      setValidationErrors(prev => {
                        const newErrors = { ...prev }
                        delete newErrors[row.tempId]
                        return newErrors
                      })
                    }}
                    className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Remove
                  </Button>
                </div>
              </div>

              {/* Form Fields */}
              <div className="p-6 space-y-5">
                {/* Row 1: Day & Time */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                      <CalendarLucide className="h-3.5 w-3.5 text-blue-500" />
                      Day
                    </label>
                    <Select value={String(row.day_of_week)} onValueChange={(v) => {
                      onChange(row.tempId, 'day_of_week', Number(v))
                      // Re-validate the row after day change to check for conflicts
                      setTimeout(() => {
                        const updatedRow = rows.find(r => r.tempId === row.tempId)
                        if (updatedRow) {
                          const errors = validateRow(updatedRow, rows)
                          setValidationErrors(prev => ({
                            ...prev,
                            [row.tempId]: errors
                          }))
                        }
                      }, 100)
                    }}>
                      <SelectTrigger className="h-10 border-gray-300 dark:border-neutral-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        <SelectValue>
                          {(() => {
                            const day = days.find(d => d.v === row.day_of_week)
                            return day ? (
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${day.color}`} />
                                {day.short}
                              </div>
                            ) : null
                          })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {days.map(d => (
                          <SelectItem key={d.v} value={String(d.v)}>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${d.color}`} />
                              {d.t}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                      <Clock className="h-3.5 w-3.5 text-green-500" />
                      Time Start
                    </label>
                    <Input 
                      className={`h-10 border-gray-300 dark:border-neutral-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        getFieldError(row.tempId, 'time start') 
                          ? 'border-red-500 dark:border-red-500 focus:ring-red-500 focus:border-red-500' 
                          : ''
                      }`}
                      value={row.time_start} 
                      onChange={(e) => {
                        handleTimeChange(row.tempId, 'time_start', e.target.value)
                        // Validate after a short delay to allow time formatting
                        setTimeout(() => {
                          const updatedRow = rows.find(r => r.tempId === row.tempId)
                          if (updatedRow) {
                            // Re-validate both time fields and the entire row to check for conflicts
                            validateFieldOnChange(row.tempId, 'time_start', updatedRow.time_start)
                            validateFieldOnChange(row.tempId, 'time_end', updatedRow.time_end)
                            // Also trigger a full row validation to catch conflicts
                            const errors = validateRow(updatedRow, rows)
                            setValidationErrors(prev => ({
                              ...prev,
                              [row.tempId]: errors
                            }))
                          }
                        }, 150)
                      }}
                      onBlur={() => handleBlur(row.tempId)}
                      placeholder="07:00 AM (7:00 AM - 9:00 PM)" 
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                      <Clock className="h-3.5 w-3.5 text-orange-500" />
                      Time End
                    </label>
                    <Input 
                      className={`h-10 border-gray-300 dark:border-neutral-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        getFieldError(row.tempId, 'time end') 
                          ? 'border-red-500 dark:border-red-500 focus:ring-red-500 focus:border-red-500' 
                          : ''
                      }`}
                      value={row.time_end} 
                      onChange={(e) => {
                        handleTimeChange(row.tempId, 'time_end', e.target.value)
                        // Validate after a short delay to allow time formatting
                        setTimeout(() => {
                          const updatedRow = rows.find(r => r.tempId === row.tempId)
                          if (updatedRow) {
                            // Re-validate both time fields and the entire row to check for conflicts
                            validateFieldOnChange(row.tempId, 'time_start', updatedRow.time_start)
                            validateFieldOnChange(row.tempId, 'time_end', updatedRow.time_end)
                            // Also trigger a full row validation to catch conflicts
                            const errors = validateRow(updatedRow, rows)
                            setValidationErrors(prev => ({
                              ...prev,
                              [row.tempId]: errors
                            }))
                          }
                        }, 150)
                      }}
                      onBlur={() => handleBlur(row.tempId)}
                      placeholder="09:00 PM (7:00 AM - 9:00 PM)" 
                    />
                  </div>
                </div>

                {/* Row 2: Subject Name (Course Code auto-generated in background) */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                    <BookOpen className="h-3.5 w-3.5 text-indigo-500" />
                    Subject Name
                  </label>
                  <Input 
                    className={`h-10 border-gray-300 dark:border-neutral-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      getFieldError(row.tempId, 'subject name') 
                        ? 'border-red-500 dark:border-red-500 focus:ring-red-500 focus:border-red-500' 
                        : ''
                    }`}
                    value={row.subject_name || ''} 
                    onChange={(e) => {
                      const value = e.target.value
                      onChange(row.tempId, 'subject_name', value)
                      
                      // Auto-generate course code in background (hidden from user)
                      if (value) {
                        const autoCode = value.substring(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(8, '0')
                        onChange(row.tempId, 'course_code', autoCode)
                      }
                      
                      validateFieldOnChange(row.tempId, 'subject_name', value)
                    }}
                    onBlur={() => handleBlur(row.tempId)}
                    placeholder="Computer Programming 1" 
                  />
                </div>

                {/* Row 2.5: Section & Exam Type */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                      <BookOpen className="h-3.5 w-3.5 text-cyan-500" />
                      Section
                    </label>
                    <Input 
                      className="h-10 font-mono border-gray-300 dark:border-neutral-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                      value={row.section || ''} 
                      onChange={(e) => {
                        // Save the actual value the user types (converted to uppercase)
                        // The placeholder is just visual, never saved
                        onChange(row.tempId, 'section', e.target.value.toUpperCase())
                      }}
                      onBlur={() => handleBlur(row.tempId)}
                      placeholder="BSIT301A (optional)" 
                    />
                  </div>

                  {/* Requirement #17: Exam Type Segregation */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                      <FileText className="h-3.5 w-3.5 text-orange-500" />
                      Exam Type
                    </label>
                    <select
                      className="h-10 w-full rounded-md border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={row.exam_type || 'regular'}
                      onChange={(e) => {
                        onChange(row.tempId, 'exam_type', e.target.value)
                      }}
                    >
                      <option value="prelims">PRELIMS</option>
                      <option value="midterms">MIDTERMS</option>
                      <option value="prefinals">PREFINALS</option>
                      <option value="finals">FINALS</option>
                      <option value="quiz">Quiz</option>
                      <option value="practical">Practical</option>
                      <option value="oral">Oral Exam</option>
                      <option value="regular">Regular Exam</option>
                    </select>
                  </div>
                </div>

                {/* Row 2.75: Exam Date (Required) - Date picker dialog for exam proctoring start */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                    <CalendarIcon className="h-3.5 w-3.5 text-purple-500" />
                    Exam Date *
                  </label>
                  <Button
                    type="button"
                    variant={"outline"}
                    onClick={() => {
                      setOpenDatePickerForRow(row.tempId)
                    }}
                    className={cn(
                      "h-10 w-full justify-start text-left font-normal border-gray-300 dark:border-neutral-600",
                      !row.exam_date && "text-muted-foreground",
                      getFieldError(row.tempId, 'exam date') && "border-red-500 dark:border-red-500"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {row.exam_date ? (
                      format(new Date(row.exam_date + 'T00:00:00'), "PPP")
                    ) : (
                      <span className="text-gray-400">Select exam date *</span>
                    )}
                  </Button>
                  
                  {/* Date Picker Dialog */}
                  <Dialog 
                    open={openDatePickerForRow === row.tempId}
                    onOpenChange={(open) => {
                      if (!open) {
                        setOpenDatePickerForRow(null)
                      }
                    }}
                  >
                    <DialogContent className="sm:max-w-[425px] p-0">
                      <DialogHeader className="px-6 pt-6 pb-2">
                        <DialogTitle className="text-lg font-semibold">Select Exam Date</DialogTitle>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          Only {(() => {
                            const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                            return dayNames[row.day_of_week - 1] || 'selected day'
                          })()}s are selectable for this exam schedule.
                        </p>
                      </DialogHeader>
                      <div className="px-6 pb-2">
                        <Calendar
                          mode="single"
                          selected={row.exam_date ? (() => {
                            try {
                              // Ensure the date is parsed correctly - if it's already YYYY-MM-DD, parse it safely
                              const dateStr = String(row.exam_date).trim()
                              if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                                // Parse as UTC to avoid timezone shifts
                                return new Date(dateStr + 'T12:00:00Z')
                              }
                              // Fallback to original parsing
                              return new Date(row.exam_date + 'T00:00:00')
                            } catch {
                              return undefined
                            }
                          })() : undefined}
                          onSelect={(date) => {
                            if (date) {
                              // Format as YYYY-MM-DD using UTC to avoid timezone issues
                              const year = date.getFullYear()
                              const month = String(date.getMonth() + 1).padStart(2, '0')
                              const day = String(date.getDate()).padStart(2, '0')
                              const formattedDate = `${year}-${month}-${day}`
                              onChange(row.tempId, 'exam_date', formattedDate)
                              // Clear validation error when date is selected
                              validateFieldOnChange(row.tempId, 'exam_date', formattedDate)
                              // Close the dialog after selection
                              setOpenDatePickerForRow(null)
                            }
                          }}
                          disabled={(date) => {
                            // Disable dates before today (today and past dates are not choosable)
                            const today = new Date()
                            today.setHours(0, 0, 0, 0)
                            const dateToCheck = new Date(date)
                            dateToCheck.setHours(0, 0, 0, 0)
                            if (dateToCheck <= today) return true
                            
                            // CRITICAL: Only allow dates that match the schedule's day_of_week
                            // day_of_week: 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
                            // JavaScript getDay(): 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
                            const jsDay = date.getDay() // 0-6
                            const scheduleDay = row.day_of_week // 1-6
                            
                            // Disable all days that don't match the schedule day
                            // If schedule is Monday (1), JS Monday is 1, so allow it
                            // If schedule is Friday (5), JS Friday is 5, so allow it
                            // If schedule is Saturday (6), JS Saturday is 6, so allow it
                            return jsDay !== scheduleDay
                          }}
                          captionLayout="dropdown"
                          showOutsideDays={true}
                          classNames={{
                            disabled: "text-muted-foreground opacity-50 cursor-not-allowed",
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between px-6 pb-6 pt-2 border-t">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            onChange(row.tempId, 'exam_date', '')
                            setOpenDatePickerForRow(null)
                          }}
                          className="text-sm"
                        >
                          Clear
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            const today = new Date()
                            const jsDay = today.getDay()
                            const scheduleDay = row.day_of_week
                            
                            // Only set today if it matches the schedule day
                            if (jsDay === scheduleDay) {
                              const formattedDate = format(today, 'yyyy-MM-dd')
                              onChange(row.tempId, 'exam_date', formattedDate)
                              validateFieldOnChange(row.tempId, 'exam_date', formattedDate)
                              setOpenDatePickerForRow(null)
                            }
                          }}
                          disabled={(() => {
                            const today = new Date()
                            return today.getDay() !== row.day_of_week
                          })()}
                          className="text-sm"
                        >
                          Today
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">
                    This exam will override the class schedule for this specific date. Only {(() => {
                      const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                      return dayNames[row.day_of_week - 1] || 'selected day'
                    })()}s are selectable. Exam date is required.
                  </p>
                </div>

                {/* Row 3: Building Code */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                    <MapPin className="h-3.5 w-3.5 text-red-500" />
                    Building / Room Code *
                  </label>
                  <BuildingAutocomplete
                    value={row.room_code || ''}
                    onChange={(value) => {
                      onChange(row.tempId, 'room_code', value)
                      validateFieldOnChange(row.tempId, 'room_code', value)
                    }}
                    onBlur={() => handleBlur(row.tempId)}
                    hasError={!!(getFieldError(row.tempId, 'room code') || getFieldError(row.tempId, 'building'))}
                    rowId={row.tempId}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Select from available buildings or type to search. Valid formats: <span className="font-mono">COMPL1-6</span>, <span className="font-mono">B####</span>, <span className="font-mono">GYM2/3 (LEC)</span>
                  </p>
                </div>

                {/* Substitution Info */}
                {row.status === 'substituted' && row.substitute_employee_name && (
                  <div className="mt-4 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <UserCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <span className="font-medium text-green-900 dark:text-green-100">Substituted by:</span>
                      <span className="text-green-700 dark:text-green-300">{row.substitute_employee_name}</span>
                    </div>
                    {row.unavailable_reason && (
                      <div className="mt-2 text-xs text-green-600 dark:text-green-400">
                        <span className="font-medium">Reason:</span> {row.unavailable_reason}
                      </div>
                    )}
                  </div>
                )}
                {row.status === 'on-leave' && row.unavailable_reason && (
                  <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <ArrowLeftRight className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                      <span className="font-medium text-yellow-900 dark:text-yellow-100">Status: On Leave</span>
                    </div>
                    <div className="mt-2 text-xs text-yellow-600 dark:text-yellow-400">
                      <span className="font-medium">Reason:</span> {row.unavailable_reason}
                    </div>
                  </div>
                )}
              </div>

              {/* Validation Errors */}
              {hasErrors && (
                <div className="mx-6 mb-6 p-4 bg-linear-to-br from-red-50 to-red-100/50 dark:from-red-950/50 dark:to-red-900/30 border-l-4 border-red-500 rounded-lg shadow-sm">
                  <div className="flex items-start gap-2 mb-2">
                    <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                    <h4 className="text-xs font-semibold text-red-800 dark:text-red-300">Validation Errors</h4>
                  </div>
                  <div className="space-y-1.5 ml-6">
                    {rowErrors.map((error, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-red-700 dark:text-red-400">
                        <span className="text-red-500">•</span>
                        <span>{error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
})

export default ExamScheduleEditor

