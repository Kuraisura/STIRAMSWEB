"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar as CalendarIcon, Clock, BookOpen, MapPin, Users, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { getExamSchedulesForEmployee } from '@/lib/exam-schedule-api'

export type ExamScheduleData = {
  day_of_week: 1 | 2 | 3 | 4 | 5 | 6
  time_start: string
  time_end: string
  subject: string
  section: string
  room: string
  class_type?: 'SHS' | 'Tertiary'
  type: string // Can be Prelim/Midterm/Pre-Final/Final or 1st/2nd/3rd/4th Quarter
  exam_date?: Date
  exam_schedule_id?: number
}

type AddExamModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: ExamScheduleData) => Promise<void>
  initialData?: Partial<ExamScheduleData>
  employeeName?: string
  employeeId?: number
}

const days = [
  { value: 1 as const, label: 'Monday', color: 'bg-red-500', textColor: 'text-red-600' },
  { value: 2 as const, label: 'Tuesday', color: 'bg-orange-500', textColor: 'text-orange-600' },
  { value: 3 as const, label: 'Wednesday', color: 'bg-green-500', textColor: 'text-green-600' },
  { value: 4 as const, label: 'Thursday', color: 'bg-blue-500', textColor: 'text-blue-600' },
  { value: 5 as const, label: 'Friday', color: 'bg-purple-500', textColor: 'text-purple-500' },
  { value: 6 as const, label: 'Saturday', color: 'bg-indigo-500', textColor: 'text-indigo-600' },
]

const getDefaultScheduleDay = (): 1 | 2 | 3 | 4 | 5 | 6 => {
  const jsDay = new Date().getDay() // 0..6 (Sun..Sat)
  if (jsDay === 0) return 1 // Sunday defaults to Monday for schedule forms
  return Math.min(jsDay, 6) as 1 | 2 | 3 | 4 | 5 | 6
}

const getNearestDateForDay = (dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6): Date => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Convert to JS day format for comparison: 1..6 (Mon..Sat) -> 1..6
  const targetJsDay = dayOfWeek
  const currentJsDay = today.getDay()

  let delta = targetJsDay - currentJsDay
  if (delta < 0) delta += 7
  if (currentJsDay === 0) {
    // Sunday -> next schedule day occurrence
    delta = targetJsDay
  }

  const nearest = new Date(today)
  nearest.setDate(today.getDate() + delta)
  return nearest
}

const validateTime = (time: string): boolean => {
  if (!time) return false
  const timeRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM|am|pm)$/
  return timeRegex.test(time.trim())
}

// Format time from database format (HH:mm:ss or HH:mm) to display format (h:mm AM/PM)
const formatDisplayTime = (time: string): string => {
  if (!time) return ''
  
  // Remove any existing AM/PM and extra spaces
  let cleanTime = time.replace(/\s*(AM|PM|am|pm)\s*/gi, '').trim()
  
  // Split by colon
  const parts = cleanTime.split(':')
  if (parts.length < 2) return time // Return original if invalid
  
  let hours = parseInt(parts[0], 10)
  const minutes = parts[1].padStart(2, '0')
  
  // Determine AM/PM
  const period = hours >= 12 ? 'PM' : 'AM'
  
  // Convert to 12-hour format
  if (hours === 0) hours = 12
  else if (hours > 12) hours -= 12
  
  return `${hours}:${minutes} ${period}`
}

export function AddExamModal({ open, onOpenChange, onSubmit, initialData, employeeName, employeeId }: AddExamModalProps) {
  const defaultDayOfWeek = getDefaultScheduleDay()
  const [formData, setFormData] = useState<ExamScheduleData>({
    day_of_week: defaultDayOfWeek as 1 | 2 | 3 | 4 | 5 | 6,
    time_start: '8:00 AM',
    time_end: '9:30 AM',
    subject: '',
    section: '',
    room: '',
    class_type: 'Tertiary',
    type: 'Prelim',
    exam_date: getNearestDateForDay(defaultDayOfWeek),
  })

  // Get exam type options based on class type
  const getExamTypeOptions = (classType: 'SHS' | 'Tertiary') => {
    if (classType === 'SHS') {
      return [
        { value: '1st Quarter', label: '1st Quarter' },
        { value: '2nd Quarter', label: '2nd Quarter' },
        { value: '3rd Quarter', label: '3rd Quarter' },
        { value: '4th Quarter', label: '4th Quarter' },
      ]
    }
    return [
      { value: 'Prelim', label: 'Prelim' },
      { value: 'Midterm', label: 'Midterm' },
      { value: 'Pre-Final', label: 'Pre-Final' },
      { value: 'Final', label: 'Final' },
    ]
  }

  // Handle class type change and reset exam type
  const handleClassTypeChange = (newClassType: 'SHS' | 'Tertiary') => {
    const newExamType = newClassType === 'SHS' ? '1st Quarter' : 'Prelim'
    setFormData({ 
      ...formData, 
      class_type: newClassType,
      type: newExamType
    })
  }

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [formAlert, setFormAlert] = useState<{ type: 'error' | 'warning'; title: string; message: string } | null>(null)
  const [allExistingSchedules, setAllExistingSchedules] = useState<any[]>([])
  const [existingSchedules, setExistingSchedules] = useState<any[]>([])
  const [loadingSchedules, setLoadingSchedules] = useState(false)
  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editingScheduleSignature, setEditingScheduleSignature] = useState<string | null>(null)

  const getExamScheduleId = (schedule: any): number | null => {
    const raw = schedule?.exam_schedule_id ?? schedule?.id
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }

  const normalizeExamDateKey = (value: unknown): string => {
    const raw = String(value || '').trim()
    if (!raw) return ''
    const match = raw.match(/\d{4}-\d{2}-\d{2}/)
    return match ? match[0] : raw
  }

  const getScheduleSignature = (schedule: any): string => {
    const idPart = String(schedule?.exam_schedule_id ?? schedule?.id ?? '').trim()
    const dayPart = String(schedule?.day_of_week ?? '').trim().toLowerCase()
    const startPart = formatDisplayTime(String(schedule?.time_start || '')).trim().toLowerCase()
    const endPart = formatDisplayTime(String(schedule?.time_end || '')).trim().toLowerCase()
    const subjectPart = String(schedule?.subject_name || schedule?.subject || '').trim().toLowerCase()
    const sectionPart = String(schedule?.section || '').trim().toLowerCase()
    const roomPart = String(schedule?.room_code || schedule?.room || '').trim().toLowerCase()
    const datePart = normalizeExamDateKey(schedule?.exam_date)
    return [idPart, dayPart, startPart, endPart, subjectPart, sectionPart, roomPart, datePart].join('|')
  }
  
  // Time picker states
  const [selectedStartHour, setSelectedStartHour] = useState<number>(8)
  const [selectedStartMinute, setSelectedStartMinute] = useState<number>(0)
  const [selectedStartPeriod, setSelectedStartPeriod] = useState<'AM' | 'PM'>('AM')
  const [selectedEndHour, setSelectedEndHour] = useState<number>(9)
  const [selectedEndMinute, setSelectedEndMinute] = useState<number>(30)
  const [selectedEndPeriod, setSelectedEndPeriod] = useState<'AM' | 'PM'>('AM')
  const formScrollContainerRef = useRef<HTMLDivElement | null>(null)
  
  // Handle editing an existing schedule
  const handleEditSchedule = (schedule: any) => {
    setEditMode(true)
    setEditingScheduleId(getExamScheduleId(schedule))
    
    // Parse and set the time
    const parseTime = (timeStr: string) => {
      if (!timeStr) return { hour: 8, minute: 0, period: 'AM' as 'AM' | 'PM' }
      
      // If already in 12h format
      if (timeStr.includes('AM') || timeStr.includes('PM')) {
        const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
        if (match) {
          return {
            hour: parseInt(match[1]),
            minute: parseInt(match[2]),
            period: match[3].toUpperCase() as 'AM' | 'PM'
          }
        }
      }
      
      // If in 24h format (HH:mm or HH:mm:ss)
      const parts = timeStr.split(':')
      if (parts.length >= 2) {
        let hours = parseInt(parts[0])
        const minutes = parseInt(parts[1])
        const period = hours >= 12 ? 'PM' : 'AM'
        if (hours > 12) hours -= 12
        if (hours === 0) hours = 12
        
        return { hour: hours, minute: minutes, period }
      }
      
      return { hour: 8, minute: 0, period: 'AM' as 'AM' | 'PM' }
    }
    
    const startTime = parseTime(schedule.time_start)
    const endTime = parseTime(schedule.time_end)
    
    // Set time picker states
    setSelectedStartHour(startTime.hour)
    setSelectedStartMinute(startTime.minute)
    setSelectedStartPeriod(startTime.period as 'AM' | 'PM')
    setSelectedEndHour(endTime.hour)
    setSelectedEndMinute(endTime.minute)
    setSelectedEndPeriod(endTime.period as 'AM' | 'PM')
    
    // Format times for display
    const formatTimeDisplay = (h: number, m: number, p: 'AM' | 'PM') => 
      `${h}:${m.toString().padStart(2, '0')} ${p}`
    
    // Set form data
    const currentEditId = getExamScheduleId(schedule)
    setEditingScheduleSignature(getScheduleSignature(schedule))
    setFormData({
      day_of_week: schedule.day_of_week || 1,
      time_start: formatTimeDisplay(startTime.hour, startTime.minute, startTime.period as 'AM' | 'PM'),
      time_end: formatTimeDisplay(endTime.hour, endTime.minute, endTime.period as 'AM' | 'PM'),
      subject: schedule.subject_name || schedule.subject || '',
      section: schedule.section || '',
      room: schedule.room_code || schedule.room || '',
      class_type: schedule.class_type || 'Tertiary',
      type: schedule.exam_type || schedule.type || 'Prelim',
      exam_date: schedule.exam_date ? new Date(schedule.exam_date) : undefined,
      exam_schedule_id: currentEditId || undefined,
    })
  }
  
  // Parse time to minutes
  const parseTimeToMinutes = (timeStr: string): number | null => {
    if (!timeStr) return null
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
    if (!match) return null
    
    let hours = parseInt(match[1], 10)
    const minutes = parseInt(match[2], 10)
    const period = match[3].toUpperCase()
    
    if (period === 'PM' && hours !== 12) hours += 12
    if (period === 'AM' && hours === 12) hours = 0
    
    return hours * 60 + minutes
  }
  
  // Validate duration for exam schedule
  const validateDuration = (start: string, end: string): { isValid: boolean; message: string } => {
    if (!start || !end) {
      return { isValid: true, message: '' }
    }
    
    const startMinutes = parseTimeToMinutes(start)
    const endMinutes = parseTimeToMinutes(end)
    
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      return { isValid: true, message: '' }
    }
    
    const durationMinutes = endMinutes - startMinutes
    
    // Exam schedule: exactly 1 hour 30 minutes (90 minutes)
    if (durationMinutes !== 90) {
      const hours = Math.floor(durationMinutes / 60)
      const minutes = durationMinutes % 60
      return {
        isValid: false,
        message: `Exam duration is ${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}. Exam duration must be exactly 1 hour and 30 minutes.`
      }
    }
    
    return { isValid: true, message: '' }
  }

  // Check for time conflicts with existing exam schedules
  // Check for time conflicts with existing exam schedules (supports editing and changing day)
  const checkTimeConflict = (start: string, end: string, selectedDay?: number): { hasConflict: boolean; conflictingSchedule?: any; message: string } => {
    if (!start || !end) {
      return { hasConflict: false, message: '' }
    }
    const newStartMinutes = parseTimeToMinutes(start)
    const newEndMinutes = parseTimeToMinutes(end)
    if (newStartMinutes === null || newEndMinutes === null) {
      return { hasConflict: false, message: '' }
    }
    // Only compare with schedules on the selected day
    const dayToCheck = selectedDay ?? formData.day_of_week
    for (const schedule of existingSchedules) {
      // Only check schedules on the selected day
      const scheduleDay = typeof schedule.day_of_week === 'string'
        ? days.find(d => d.label === schedule.day_of_week)?.value
        : schedule.day_of_week
      if (scheduleDay !== dayToCheck) continue
      // Skip if this is the schedule being edited
      const existingScheduleId = getExamScheduleId(schedule)
      const activeEditId = editingScheduleId ?? (Number(formData.exam_schedule_id || 0) || null)
      if (editMode && activeEditId !== null && existingScheduleId !== null && existingScheduleId === activeEditId) {
        continue
      }
      if (editMode && editingScheduleSignature && getScheduleSignature(schedule) === editingScheduleSignature) {
        continue
      }
      // Fallback self-skip when schedule IDs are missing/mismatched but values clearly match the current edited row.
      if (editMode && editingScheduleId === null) {
        const sameWindow =
          formatDisplayTime(schedule.time_start) === formatDisplayTime(start) &&
          formatDisplayTime(schedule.time_end) === formatDisplayTime(end)
        const sameSubject = String(schedule.subject_name || schedule.subject || '').trim().toLowerCase() === String(formData.subject || '').trim().toLowerCase()
        const sameSection = String(schedule.section || '').trim().toLowerCase() === String(formData.section || '').trim().toLowerCase()
        if (sameWindow && sameSubject && sameSection) {
          continue
        }
      }
      const existingStart = parseTimeToMinutes(formatDisplayTime(schedule.time_start))
      const existingEnd = parseTimeToMinutes(formatDisplayTime(schedule.time_end))
      if (existingStart === null || existingEnd === null) continue
      // Check for overlap
      const startsInside = newStartMinutes >= existingStart && newStartMinutes < existingEnd
      const endsInside = newEndMinutes > existingStart && newEndMinutes <= existingEnd
      const encompassesExisting = newStartMinutes <= existingStart && newEndMinutes >= existingEnd
      if (startsInside || endsInside || encompassesExisting) {
        const existingStartFormatted = formatDisplayTime(schedule.time_start)
        const existingEndFormatted = formatDisplayTime(schedule.time_end)
        return {
          hasConflict: true,
          conflictingSchedule: schedule,
          message: `Time conflict detected! This exam overlaps with "${schedule.subject_name || schedule.subject || 'Existing exam'}" (${existingStartFormatted} - ${existingEndFormatted}). Please choose a different time slot.`
        }
      }
    }

    return { hasConflict: false, message: '' }
  }

  const liveConflict = useMemo(
    () => checkTimeConflict(formData.time_start, formData.time_end, formData.day_of_week),
    [formData.time_start, formData.time_end, formData.day_of_week, existingSchedules, editingScheduleId, editMode]
  )

  const handleReviewForm = () => {
    const firstErrorField = Object.keys(errors)[0]
    const targetField = firstErrorField || (liveConflict.hasConflict ? 'time_start' : 'subject')

    setFormAlert(null)

    window.requestAnimationFrame(() => {
      const container = formScrollContainerRef.current
      if (!container) return

      const target =
        container.querySelector<HTMLElement>(`[data-field="${targetField}"]`) ||
        container.querySelector<HTMLElement>(`#${targetField}`)

      if (!target) return

      target.scrollIntoView({ behavior: 'smooth', block: 'center' })

      const focusable = target.matches('input, select, textarea, button')
        ? target
        : target.querySelector<HTMLElement>('input, select, textarea, button')

      focusable?.focus()
    })
  }

  // Load existing schedules when modal opens
  useEffect(() => {
    if (open && employeeId) {
      loadExistingSchedules()
    }
  }, [open, employeeId])

  useEffect(() => {
    const filtered = (allExistingSchedules || []).filter((s: any) => {
      const scheduleDayOfWeek = typeof s.day_of_week === 'string'
        ? days.findIndex(d => d.label === s.day_of_week) + 1
        : s.day_of_week

      return scheduleDayOfWeek === formData.day_of_week
    })

    setExistingSchedules(filtered)
  }, [allExistingSchedules, formData.day_of_week])

  const loadExistingSchedules = async () => {
    if (!employeeId) return
    setLoadingSchedules(true)
    try {
      const schedules = await getExamSchedulesForEmployee(employeeId)
      setAllExistingSchedules(schedules || [])
    } catch {
      setAllExistingSchedules([])
      setExistingSchedules([])
    } finally {
      setLoadingSchedules(false)
    }
  }

  const parseTimeString = (timeStr: string) => {
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
    if (!match) return null
    return {
      hour: parseInt(match[1]),
      minute: parseInt(match[2]),
      period: match[3].toUpperCase() as 'AM' | 'PM'
    }
  }

  const formatTime = (hour: number, minute: number, period: 'AM' | 'PM') => {
    // Format WITHOUT padding the hour - use natural hour format (8:00 AM not 08:00 AM)
    return `${hour}:${minute.toString().padStart(2, '0')} ${period}`
  }

  // Initialize form data when modal opens or initialData changes
  useEffect(() => {
    if (open) {
      const initialEditId = initialData ? getExamScheduleId(initialData) : null
      const resolvedDayOfWeek = (initialData?.day_of_week || defaultDayOfWeek) as 1 | 2 | 3 | 4 | 5 | 6

      if (initialData && initialEditId !== null) {
        setEditingScheduleSignature(getScheduleSignature(initialData))
        setFormData({
          day_of_week: resolvedDayOfWeek,
          time_start: initialData.time_start || '8:00 AM',
          time_end: initialData.time_end || '9:30 AM',
          subject: initialData.subject || '',
          section: initialData.section || '',
          room: initialData.room || '',
          class_type: initialData.class_type || 'Tertiary',
          type: initialData.type || 'Prelim',
          exam_date: initialData.exam_date
            ? new Date(initialData.exam_date)
            : getNearestDateForDay(resolvedDayOfWeek),
          exam_schedule_id: initialEditId,
        })
        setEditingScheduleId(initialEditId)
        setEditMode(true)
        // Parse time if provided
        if (initialData.time_start) {
          const parsed = parseTimeString(initialData.time_start)
          if (parsed) {
            setSelectedStartHour(parsed.hour)
            setSelectedStartMinute(parsed.minute)
            setSelectedStartPeriod(parsed.period)
          }
        }
        if (initialData.time_end) {
          const parsed = parseTimeString(initialData.time_end)
          if (parsed) {
            setSelectedEndHour(parsed.hour)
            setSelectedEndMinute(parsed.minute)
            setSelectedEndPeriod(parsed.period)
          }
        }
      } else if (initialData) {
        setEditingScheduleSignature(null)
        setFormData({
          day_of_week: resolvedDayOfWeek,
          time_start: initialData.time_start || '8:00 AM',
          time_end: initialData.time_end || '9:30 AM',
          subject: initialData.subject || '',
          section: initialData.section || '',
          room: initialData.room || '',
          class_type: initialData.class_type || 'Tertiary',
          type: initialData.type || 'Prelim',
          exam_date: initialData.exam_date
            ? new Date(initialData.exam_date)
            : getNearestDateForDay(resolvedDayOfWeek),
        })
        setEditingScheduleId(null)
        setEditMode(false)
        const parsedStart = initialData.time_start ? parseTimeString(initialData.time_start) : null
        const parsedEnd = initialData.time_end ? parseTimeString(initialData.time_end) : null
        setSelectedStartHour(parsedStart?.hour ?? 8)
        setSelectedStartMinute(parsedStart?.minute ?? 0)
        setSelectedStartPeriod(parsedStart?.period ?? 'AM')
        setSelectedEndHour(parsedEnd?.hour ?? 9)
        setSelectedEndMinute(parsedEnd?.minute ?? 30)
        setSelectedEndPeriod(parsedEnd?.period ?? 'AM')
      } else {
        // Reset to defaults
        setEditingScheduleSignature(null)
        setFormData({
          day_of_week: defaultDayOfWeek as 1 | 2 | 3 | 4 | 5 | 6,
          time_start: '8:00 AM',
          time_end: '9:30 AM',
          subject: '',
          section: '',
          room: '',
          class_type: 'Tertiary',
          type: 'Prelim',
          exam_date: getNearestDateForDay(defaultDayOfWeek as 1 | 2 | 3 | 4 | 5 | 6),
        })
        setEditingScheduleId(null)
        setEditMode(false)
        setSelectedStartHour(8)
        setSelectedStartMinute(0)
        setSelectedStartPeriod('AM')
        setSelectedEndHour(9)
        setSelectedEndMinute(30)
        setSelectedEndPeriod('AM')
      }
      setErrors({})
      setFormAlert(null)
    }
  }, [open, initialData, defaultDayOfWeek])

  const selectedDay = days.find(d => d.value === formData.day_of_week)

  const handleTimeChange = (field: 'time_start' | 'time_end', value: string) => {
    // Auto-uppercase AM/PM, add spacing
    let processedValue = value
    processedValue = processedValue.replace(/(\d)([Aa][Mm]|[Pp][Mm])\b/g, '$1 $2')
    processedValue = processedValue.replace(/\b([Aa][Mm]|[Pp][Mm])\b/g, (match) => match.toUpperCase())
    
    setFormData(prev => ({ ...prev, [field]: processedValue }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  const handleRoomChange = (value: string) => {
    // Auto-uppercase room code
    const upperValue = value.toUpperCase()
    setFormData(prev => ({ ...prev, room: upperValue }))
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.time_start || !validateTime(formData.time_start)) {
      newErrors.time_start = 'Invalid time format. Use format: 08:00 AM'
    }

    if (!formData.time_end || !validateTime(formData.time_end)) {
      newErrors.time_end = 'Invalid time format. Use format: 10:00 AM'
    }

    if (formData.time_start && formData.time_end && validateTime(formData.time_start) && validateTime(formData.time_end)) {
      // Check if start is before end
      const startMatch = formData.time_start.match(/^(0?[1-9]|1[0-2]):([0-5][0-9])\s?(AM|PM)$/i)
      const endMatch = formData.time_end.match(/^(0?[1-9]|1[0-2]):([0-5][0-9])\s?(AM|PM)$/i)
      
      if (startMatch && endMatch) {
        let startHours = parseInt(startMatch[1])
        let endHours = parseInt(endMatch[1])
        const startMinutes = parseInt(startMatch[2])
        const endMinutes = parseInt(endMatch[2])
        const startPeriod = startMatch[3].toUpperCase()
        const endPeriod = endMatch[3].toUpperCase()
        
        if (startPeriod === 'PM' && startHours !== 12) startHours += 12
        if (startPeriod === 'AM' && startHours === 12) startHours = 0
        if (endPeriod === 'PM' && endHours !== 12) endHours += 12
        if (endPeriod === 'AM' && endHours === 12) endHours = 0

        const startTotalMinutes = startHours * 60 + startMinutes
        const endTotalMinutes = endHours * 60 + endMinutes
        const sevenAM = 7 * 60
        const ninePM = 21 * 60

        if (startTotalMinutes < sevenAM || startTotalMinutes > ninePM) {
          newErrors.time_start = 'Start time must be between 7:00 AM and 9:00 PM'
        }

        if (endTotalMinutes < sevenAM || endTotalMinutes > ninePM) {
          newErrors.time_end = 'End time must be between 7:00 AM and 9:00 PM'
        }
        
        if (startTotalMinutes >= endTotalMinutes) {
          newErrors.time_end = 'End time must be after start time'
        } else {
          // Validate duration
          const durationValidation = validateDuration(formData.time_start, formData.time_end)
          if (!durationValidation.isValid) {
            newErrors.time_end = durationValidation.message
          }
        }
      }
    }

    if (!formData.subject.trim()) {
      newErrors.subject = 'Subject is required'
    }

    if (!formData.section.trim()) {
      newErrors.section = 'Section is required'
    }

    if (!formData.room.trim()) {
      newErrors.room = 'Room is required'
    } else {
      // Validate room code format
      const roomCode = formData.room.trim().toUpperCase()
      const roomCodeRegex = /^(COMPL[1-6]|B[1-9]\d{3}|C\d{3,4})$/
      if (!roomCodeRegex.test(roomCode)) {
        newErrors.room = 'Invalid room format. Use: COMPL1-6, B####, or C###'
      }
    }

    if (!formData.exam_date) {
      newErrors.exam_date = 'Exam date is required'
    } else {
      // Check if date is in the past
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const examDate = new Date(formData.exam_date)
      examDate.setHours(0, 0, 0, 0)
      
      if (examDate < today) {
        newErrors.exam_date = 'Exam date cannot be in the past'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const isValid = validate()
    if (!isValid) {
      setFormAlert({
        type: 'error',
        title: 'Review Form',
        message: 'Complete all required fields and resolve invalid values before saving.',
      })
      return
    }
    setFormAlert(null)
    
    if (formData.time_start && formData.time_end) {
      const durationValidation = validateDuration(formData.time_start, formData.time_end)
      if (!durationValidation.isValid) {
        setErrors(prev => ({ ...prev, time_end: durationValidation.message }))
        setFormAlert({
          type: 'warning',
          title: 'Review Form',
          message: durationValidation.message,
        })
        return
      }
      // Check for time conflicts with existing exam schedules (pass selected day)
      const conflictCheck = checkTimeConflict(formData.time_start, formData.time_end, formData.day_of_week)
      if (conflictCheck.hasConflict) {
        setErrors(prev => ({ ...prev, time_end: conflictCheck.message }))
        setFormAlert({
          type: 'error',
          title: 'Review Form',
          message: conflictCheck.message,
        })
        return
      }
    }
    
    try {
      await onSubmit(formData)
      await loadExistingSchedules()

      setFormData({
        day_of_week: formData.day_of_week, // Keep the same day
        time_start: '8:00 AM',
        time_end: '9:30 AM',
        subject: '',
        section: '',
        room: '',
        class_type: formData.class_type || 'Tertiary', // Keep the same class type
        type: formData.class_type === 'SHS' ? '1st Quarter' : 'Prelim', // Reset to first option
        exam_date: getNearestDateForDay(formData.day_of_week),
      })
      setErrors({})
      setFormAlert(null)
    } catch (error) {
      const message = (error as any)?.message || 'Failed to save exam schedule. Please review your inputs and try again.'
      setFormAlert({
        type: 'error',
        title: 'Review Form',
        message,
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal>
      <DialogContent 
        className="sm:max-w-[900px] max-h-[90vh] p-0 overflow-hidden rounded-2xl shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Color-coded Header - Purple/Pink gradient for exams */}
        <div className="relative overflow-hidden px-6 py-5 text-white bg-linear-to-br from-purple-600 via-pink-600 to-orange-600">
          <div className="absolute inset-0 bg-white/10 backdrop-blur-sm" />
          <DialogHeader className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-white/20 backdrop-blur-md rounded-xl">
                <CalendarIcon className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">
                  {editMode ? 'Edit Exam Schedule' : 'Add Exam Schedule'}
                </DialogTitle>
                <DialogDescription className="text-white/90 text-sm mt-1">
                  {employeeName ? `For ${employeeName}` : 'Add a new exam to the schedule'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Form Content - Two Column Layout */}
        <div className="flex max-h-[calc(90vh-120px)]">
          {/* Left Side - Existing Schedules */}
          <div className="w-64 border-r border-gray-200 dark:border-neutral-700 bg-purple-50 dark:bg-neutral-900/50">
            <div className="p-4 border-b border-gray-200 dark:border-neutral-700">
              <h3 className="font-semibold text-sm text-gray-900 dark:text-white">
                Existing Exams
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {days.find(d => d.value === formData.day_of_week)?.label}
              </p>
            </div>
            <ScrollArea className="h-[calc(90vh-240px)]">
              <div className="p-4 space-y-3">
                {loadingSchedules ? (
                  <div className="text-center py-8">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-purple-600 border-r-transparent"></div>
                  </div>
                ) : existingSchedules.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                    <p className="text-xs text-gray-500 dark:text-gray-400">No exams yet</p>
                  </div>
                ) : (
                  existingSchedules.map((schedule: any, index: number) => {
                    // Format time for display (convert 24h to 12h if needed)
                    const formatTimeForDisplay = (time: string) => {
                      if (!time) return time
                      // If already in 12h format, return as-is
                      if (time.includes('AM') || time.includes('PM')) return time
                      // Convert 24h to 12h
                      const [hours, minutes] = time.split(':').map(Number)
                      const period = hours >= 12 ? 'PM' : 'AM'
                      const hour12 = hours % 12 || 12
                      return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`
                    }
                    
                    return (
                      <div 
                        key={index} 
                        onClick={() => handleEditSchedule(schedule)}
                        className="bg-white dark:bg-neutral-800 rounded-lg p-3 border border-gray-200 dark:border-neutral-700 shadow-sm hover:shadow-md hover:border-purple-400 dark:hover:border-purple-600 transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded font-semibold",
                            schedule.class_type === 'SHS' 
                              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                              : "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                          )}>
                            {schedule.class_type || 'Tertiary'}
                          </span>
                          <span className="text-xs bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 px-2 py-0.5 rounded font-semibold">
                            {schedule.exam_type || schedule.type}
                          </span>
                        </div>
                        <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                          {schedule.subject_name || schedule.subject}
                        </p>
                        {schedule.exam_date && (
                          <p className="text-xs text-purple-600 dark:text-purple-400 mt-1 font-medium">
                            📅 {format(new Date(schedule.exam_date), 'MMM d, yyyy')}
                          </p>
                        )}
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 font-medium">
                          🕐 {formatTimeForDisplay(schedule.time_start)} - {formatTimeForDisplay(schedule.time_end)}
                        </p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className="text-xs bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded font-medium">
                            📍 {schedule.room_code || schedule.room}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                            👥 {schedule.section}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right Side - Form */}
          <div ref={formScrollContainerRef} className="relative flex-1 overflow-y-auto">
            {formAlert && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/45 backdrop-blur-[1px] p-6">
                <div className={cn(
                  'w-full max-w-lg rounded-xl border p-4 shadow-2xl',
                  formAlert.type === 'error'
                    ? 'border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-950/90'
                    : 'border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/90'
                )}>
                  <p className={cn(
                    'text-base font-semibold flex items-start gap-2',
                    formAlert.type === 'error' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'
                  )}>
                    <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                    <span>{formAlert.title}</span>
                  </p>
                  <p className={cn(
                    'text-sm mt-2',
                    formAlert.type === 'error' ? 'text-red-700/90 dark:text-red-300/90' : 'text-amber-700/90 dark:text-amber-300/90'
                  )}>
                    {formAlert.message}
                  </p>
                  <div className="mt-4 flex justify-end">
                    <Button
                      type="button"
                      onClick={handleReviewForm}
                      className={cn(
                        formAlert.type === 'error'
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-amber-600 hover:bg-amber-700 text-white'
                      )}
                    >
                      Review Form
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Day Selection */}
          <div className="space-y-2" data-field="day_of_week">
            <Label htmlFor="day" className="flex items-center gap-2 text-sm font-semibold">
              <CalendarIcon className="h-4 w-4 text-gray-500" />
              Day *
            </Label>
            <Select
              value={String(formData.day_of_week)}
              onValueChange={(value) => {
                const selectedDay = parseInt(value) as 1 | 2 | 3 | 4 | 5 | 6
                setFormData(prev => ({
                  ...prev,
                  day_of_week: selectedDay,
                  exam_date: getNearestDateForDay(selectedDay),
                }))
                if (errors.day_of_week) {
                  setErrors(prev => {
                    const newErrors = { ...prev }
                    delete newErrors.day_of_week
                    return newErrors
                  })
                }
              }}
            >
              <SelectTrigger className="h-11 border-2 focus:ring-2 focus:ring-purple-500">
                <SelectValue>
                  {selectedDay && (
                    <div className="flex items-center gap-2">
                      <div className={cn("w-3 h-3 rounded-full", selectedDay.color)} />
                      <span>{selectedDay.label}</span>
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {days.map(day => (
                  <SelectItem key={day.value} value={String(day.value)}>
                    <div className="flex items-center gap-2">
                      <div className={cn("w-3 h-3 rounded-full", day.color)} />
                      <span>{day.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Exam Date */}
          <div className="space-y-2" data-field="exam_date">
            <Label htmlFor="exam_date" className="flex items-center gap-2 text-sm font-semibold">
              <CalendarIcon className="h-4 w-4 text-purple-500" />
              Exam Date *
            </Label>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-11 justify-start text-left font-normal border-2",
                    !formData.exam_date && "text-muted-foreground",
                    errors.exam_date && "border-red-500 focus:ring-red-500"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.exam_date ? format(formData.exam_date, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={formData.exam_date}
                  onSelect={(date) => {
                    if (!date) {
                      setFormData(prev => ({ ...prev, exam_date: undefined }))
                    } else {
                      const jsDay = date.getDay()
                      const selectedDay = (jsDay === 0 ? 7 : jsDay) as 1 | 2 | 3 | 4 | 5 | 6
                      setFormData(prev => ({ ...prev, exam_date: date, day_of_week: selectedDay }))
                    }
                    setDatePickerOpen(false)
                    if (errors.exam_date) {
                      setErrors(prev => {
                        const newErrors = { ...prev }
                        delete newErrors.exam_date
                        return newErrors
                      })
                    }
                  }}
                  disabled={(date) => {
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    
                    // Disable dates before today
                    if (date < today) {
                      return true
                    }
                    
                    // If a day is selected, only allow dates that match that day of the week
                    if (formData.day_of_week) {
                      // JavaScript getDay(): 0 = Sunday, 1 = Monday, ..., 6 = Saturday
                      // Our day_of_week: 1 = Monday, 2 = Tuesday, ..., 6 = Saturday, 7 = Sunday
                      const jsDay = date.getDay() // 0-6
                      const ourDay = jsDay === 0 ? 7 : jsDay // Convert: Sunday (0) -> 7, others stay same
                      
                      // Only allow dates that match the selected day
                      return ourDay !== formData.day_of_week
                    }
                    
                    return false
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {errors.exam_date && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.exam_date}
              </p>
            )}
          </div>

          {/* Time Range with Scrollable Pickers */}
          <div className="grid grid-cols-2 gap-4">
            {/* Time Start Picker */}
            <div className="space-y-2" data-field="time_start">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4 text-green-500" />
                Time Start *
              </Label>
              <div className="border-2 rounded-lg p-3 bg-white dark:bg-neutral-800">
                <div className="flex gap-2 items-center justify-center">
                  {/* Hour Scroll */}
                  <ScrollArea className="h-32 w-16 border rounded">
                    <div className="p-1">
                      {[...Array(12)].map((_, i) => {
                        const hour = i + 1
                        return (
                          <button
                            key={hour}
                            type="button"
                            onClick={() => {
                              setSelectedStartHour(hour)
                              setFormData(prev => ({
                                ...prev,
                                time_start: formatTime(hour, selectedStartMinute, selectedStartPeriod)
                              }))
                            }}
                            className={cn(
                              "w-full py-2 text-center hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded transition-colors",
                              selectedStartHour === hour && "bg-purple-500 text-white hover:bg-purple-600"
                            )}
                          >
                            {hour.toString().padStart(2, '0')}
                          </button>
                        )
                      })}
                    </div>
                  </ScrollArea>
                  
                  <span className="text-2xl font-bold">:</span>
                  
                  {/* Minute Scroll */}
                  <ScrollArea className="h-32 w-16 border rounded">
                    <div className="p-1">
                      {[0, 30].map((minute) => (
                        <button
                          key={minute}
                          type="button"
                          onClick={() => {
                            setSelectedStartMinute(minute)
                            setFormData(prev => ({
                              ...prev,
                              time_start: formatTime(selectedStartHour, minute, selectedStartPeriod)
                            }))
                          }}
                          className={cn(
                            "w-full py-2 text-center hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded transition-colors",
                            selectedStartMinute === minute && "bg-purple-500 text-white hover:bg-purple-600"
                          )}
                        >
                          {minute.toString().padStart(2, '0')}
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                  
                  {/* AM/PM Toggle */}
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStartPeriod('AM')
                        setFormData(prev => ({
                          ...prev,
                          time_start: formatTime(selectedStartHour, selectedStartMinute, 'AM')
                        }))
                      }}
                      className={cn(
                        "px-3 py-2 text-sm font-semibold rounded border-2 transition-colors",
                        selectedStartPeriod === 'AM' 
                          ? "bg-green-500 text-white border-green-500" 
                          : "bg-white dark:bg-neutral-800 border-gray-300 dark:border-neutral-600 hover:border-green-500"
                      )}
                    >
                      AM
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStartPeriod('PM')
                        setFormData(prev => ({
                          ...prev,
                          time_start: formatTime(selectedStartHour, selectedStartMinute, 'PM')
                        }))
                      }}
                      className={cn(
                        "px-3 py-2 text-sm font-semibold rounded border-2 transition-colors",
                        selectedStartPeriod === 'PM' 
                          ? "bg-green-500 text-white border-green-500" 
                          : "bg-white dark:bg-neutral-800 border-gray-300 dark:border-neutral-600 hover:border-green-500"
                      )}
                    >
                      PM
                    </button>
                  </div>
                </div>
                <p className="text-center mt-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {formatTime(selectedStartHour, selectedStartMinute, selectedStartPeriod)}
                </p>
              </div>
              {errors.time_start && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.time_start}
                </p>
              )}
            </div>

            {/* Time End Picker */}
            <div className="space-y-2" data-field="time_end">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4 text-orange-500" />
                Time End *
              </Label>
              <div className="border-2 rounded-lg p-3 bg-white dark:bg-neutral-800">
                <div className="flex gap-2 items-center justify-center">
                  {/* Hour Scroll */}
                  <ScrollArea className="h-32 w-16 border rounded">
                    <div className="p-1">
                      {[...Array(12)].map((_, i) => {
                        const hour = i + 1
                        return (
                          <button
                            key={hour}
                            type="button"
                            onClick={() => {
                              setSelectedEndHour(hour)
                              setFormData(prev => ({
                                ...prev,
                                time_end: formatTime(hour, selectedEndMinute, selectedEndPeriod)
                              }))
                            }}
                            className={cn(
                              "w-full py-2 text-center hover:bg-pink-100 dark:hover:bg-pink-900/30 rounded transition-colors",
                              selectedEndHour === hour && "bg-pink-500 text-white hover:bg-pink-600"
                            )}
                          >
                            {hour.toString().padStart(2, '0')}
                          </button>
                        )
                      })}
                    </div>
                  </ScrollArea>
                  
                  <span className="text-2xl font-bold">:</span>
                  
                  {/* Minute Scroll */}
                  <ScrollArea className="h-32 w-16 border rounded">
                    <div className="p-1">
                      {[0, 30].map((minute) => (
                        <button
                          key={minute}
                          type="button"
                          onClick={() => {
                            setSelectedEndMinute(minute)
                            setFormData(prev => ({
                              ...prev,
                              time_end: formatTime(selectedEndHour, minute, selectedEndPeriod)
                            }))
                          }}
                          className={cn(
                            "w-full py-2 text-center hover:bg-pink-100 dark:hover:bg-pink-900/30 rounded transition-colors",
                            selectedEndMinute === minute && "bg-pink-500 text-white hover:bg-pink-600"
                          )}
                        >
                          {minute.toString().padStart(2, '0')}
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                  
                  {/* AM/PM Toggle */}
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEndPeriod('AM')
                        setFormData(prev => ({
                          ...prev,
                          time_end: formatTime(selectedEndHour, selectedEndMinute, 'AM')
                        }))
                      }}
                      className={cn(
                        "px-3 py-2 text-sm font-semibold rounded border-2 transition-colors",
                        selectedEndPeriod === 'AM' 
                          ? "bg-pink-500 text-white border-pink-500" 
                          : "bg-white dark:bg-neutral-800 border-gray-300 dark:border-neutral-600 hover:border-pink-500"
                      )}
                    >
                      AM
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEndPeriod('PM')
                        setFormData(prev => ({
                          ...prev,
                          time_end: formatTime(selectedEndHour, selectedEndMinute, 'PM')
                        }))
                      }}
                      className={cn(
                        "px-3 py-2 text-sm font-semibold rounded border-2 transition-colors",
                        selectedEndPeriod === 'PM' 
                          ? "bg-pink-500 text-white border-pink-500" 
                          : "bg-white dark:bg-neutral-800 border-gray-300 dark:border-neutral-600 hover:border-pink-500"
                      )}
                    >
                      PM
                    </button>
                  </div>
                </div>
                <p className="text-center mt-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {formatTime(selectedEndHour, selectedEndMinute, selectedEndPeriod)}
                </p>
              </div>
              {errors.time_end && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.time_end}
                </p>
              )}
            </div>
          </div>

          {formData.time_start && formData.time_end && liveConflict.hasConflict && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-950/30">
              <p className="text-xs font-medium text-red-700 dark:text-red-300 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{liveConflict.message}</span>
              </p>
            </div>
          )}

          {/* Subject */}
          <div className="space-y-2" data-field="subject">
            <Label htmlFor="subject" className="flex items-center gap-2 text-sm font-semibold">
              <BookOpen className="h-4 w-4 text-purple-500" />
              Subject *
            </Label>
            <Input
              id="subject"
              value={formData.subject}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, subject: e.target.value }))
                if (errors.subject) {
                  setErrors(prev => {
                    const newErrors = { ...prev }
                    delete newErrors.subject
                    return newErrors
                  })
                }
              }}
              placeholder="Computer Programming 1"
              className={cn(
                "h-11 border-2 focus:ring-2 focus:ring-purple-500",
                errors.subject && "border-red-500 focus:ring-red-500"
              )}
            />
            {errors.subject && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.subject}
              </p>
            )}
          </div>

          {/* Section */}
          <div className="space-y-2" data-field="section">
            <Label htmlFor="section" className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-cyan-500" />
              Section *
            </Label>
            <Input
              id="section"
              value={formData.section}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, section: e.target.value.toUpperCase() }))
                if (errors.section) {
                  setErrors(prev => {
                    const newErrors = { ...prev }
                    delete newErrors.section
                    return newErrors
                  })
                }
              }}
              placeholder="BSIT301A"
              className={cn(
                "h-11 border-2 font-mono focus:ring-2 focus:ring-purple-500",
                errors.section && "border-red-500 focus:ring-red-500"
              )}
            />
            {errors.section && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.section}
              </p>
            )}
          </div>

          {/* Room */}
          <div className="space-y-2" data-field="room">
            <Label htmlFor="room" className="flex items-center gap-2 text-sm font-semibold">
              <MapPin className="h-4 w-4 text-red-500" />
              Room *
            </Label>
            <Input
              id="room"
              value={formData.room}
              onChange={(e) => {
                handleRoomChange(e.target.value)
                if (errors.room) {
                  setErrors(prev => {
                    const newErrors = { ...prev }
                    delete newErrors.room
                    return newErrors
                  })
                }
              }}
              placeholder="B3201, COMPL4, or C101"
              className={cn(
                "h-11 border-2 font-mono focus:ring-2 focus:ring-purple-500",
                errors.room && "border-red-500 focus:ring-red-500"
              )}
            />
            {errors.room && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.room}
              </p>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Valid formats: <span className="font-mono">COMPL1-6</span>, <span className="font-mono">B####</span>, <span className="font-mono">C###</span>
            </p>
          </div>

          {/* Class Type */}
          <div className="space-y-2" data-field="class_type">
            <Label htmlFor="class_type" className="flex items-center gap-2 text-sm font-semibold">
              <BookOpen className="h-4 w-4 text-blue-500" />
              Class Type *
            </Label>
            <Select
              value={formData.class_type}
              onValueChange={(value: 'SHS' | 'Tertiary') => handleClassTypeChange(value)}
            >
              <SelectTrigger className="h-11 border-2 focus:ring-2 focus:ring-purple-500">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Tertiary">Tertiary</SelectItem>
                <SelectItem value="SHS">SHS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Type - Dynamic based on Class Type */}
          <div className="space-y-2" data-field="type">
            <Label htmlFor="type" className="flex items-center gap-2 text-sm font-semibold">
              {formData.class_type === 'SHS' ? 'Quarter *' : 'Exam Type *'}
            </Label>
            <Select
              value={formData.type}
              onValueChange={(value: string) => {
                setFormData(prev => ({ ...prev, type: value }))
              }}
            >
              <SelectTrigger className="h-11 border-2 focus:ring-2 focus:ring-purple-500">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getExamTypeOptions(formData.class_type || 'Tertiary').map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-neutral-700">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 h-11 font-medium"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 h-11 font-semibold shadow-lg hover:shadow-xl transition-all bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
            >
              Save Exam
            </Button>
          </div>
        </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

