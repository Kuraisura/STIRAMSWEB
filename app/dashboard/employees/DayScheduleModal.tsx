"use client"

import React, { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Clock, BookOpen, MapPin, Users, AlertCircle, Plus, Calendar, Timer, Check, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TimePicker } from '@/components/ui/time-picker'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  TERTIARY_COURSE_DICTIONARY,
  getAllPrograms,
  searchCourses,
  getCourseCodeBySubject,
  type Program,
} from '@/lib/tertiary-course-dictionary'

export type DayScheduleItem = {
  schedule_id?: number
  exam_schedule_id?: number
  time_start: string
  time_end: string
  subject_name?: string
  subject?: string
  course_code?: string
  section?: string
  room_code?: string
  room?: string
  class_type?: string
  type?: 'Lecture' | 'Lab' | 'Prelim' | 'Midterm' | 'Pre-Final' | 'Final'
  substitute?: string
  exam_date?: string | Date
}

type DayScheduleModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  day: number // 1-6 (Monday-Saturday)
  type: 'class' | 'exam'
  schedules: DayScheduleItem[]
  employeeName?: string
  onSave: (data: {
    time_start: string
    time_end: string
    subject_name?: string
    subject?: string
    course_code?: string
    section: string
    room: string
    substitute?: string
    type: 'Lecture' | 'Lab' | 'Prelim' | 'Midterm' | 'Pre-Final' | 'Final'
    exam_date?: Date
  }) => Promise<void>
  onDelete?: (scheduleId: number, isExam: boolean) => Promise<void>
}

const days = [
  { value: 1, label: 'Monday', color: 'bg-red-500', textColor: 'text-red-600', borderColor: 'border-red-500' },
  { value: 2, label: 'Tuesday', color: 'bg-orange-500', textColor: 'text-orange-600', borderColor: 'border-orange-500' },
  { value: 3, label: 'Wednesday', color: 'bg-green-500', textColor: 'text-green-600', borderColor: 'border-green-500' },
  { value: 4, label: 'Thursday', color: 'bg-blue-500', textColor: 'text-blue-600', borderColor: 'border-blue-500' },
  { value: 5, label: 'Friday', color: 'bg-purple-500', textColor: 'text-purple-500', borderColor: 'border-purple-500' },
  { value: 6, label: 'Saturday', color: 'bg-indigo-500', textColor: 'text-indigo-600', borderColor: 'border-indigo-500' },
]

// Subject dictionary
const SUBJECT_DICTIONARY = {
  SeniorHighSubjects: [
    "Oral Communication",
    "General Mathematics",
    "21st Century Literature from the Philippines and the World",
    "Media and Information Literacy",
    "Introduction to the Philosophy of the Human Person",
    "Physical Education and Health 1",
    "Computer Programming 1",
    "Computer Programming 2",
    "Reading and Writing",
    "Statistics and Probability",
    "Understanding Culture, Society and Politics",
    "Earth and Life Science",
    "Komunikasyon at Pananaliksik sa Wika at Kulturang Pilipino",
    "Physical Education and Health 2",
    "Practical Research 1",
    "Computer Programming 3",
    "Mobile App Programming 1",
    "Personal Development",
    "Pagbasa at Pagsusuri ng Iba't Ibang Teksto Tungo sa Pananaliksik",
    "Physical Science",
    "Physical Education and Health 3",
    "Practical Research 2",
    "Filipino sa Piling Larangan",
    "English for Academic and Professional Purposes",
    "Computer Programming 4",
    "Computer Programming 5",
    "Contemporary Philippine Arts from the Regions",
    "Physical Education and Health 4",
    "Empowerment Technologies",
    "Entrepreneurship",
    "Inquiries, Investigations and Immersion",
    "Computer Programming 6",
    "Mobile App Programming 2",
    "Work Immersion/Research/Career Advocacy/Culminating Activity",
    "Introduction to Culinary Operations",
    "Basic Food Production 101",
    "Basic Food Production 102",
    "Basic Food Production 103",
    "Introduction to Commercial Cookery",
    "Local & International Cuisines",
    "Catering Management & Control System",
    "Introduction to Bread & Pastry Production",
    "Database Management Systems",
    "Human Computer Interaction",
    "Software Engineering",
    "Information Management",
    "Networking Fundamentals"
  ],
  TertiarySubjects: []
}

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

// Utility function to clean subject name (remove parentheses and their contents)
const cleanSubjectName = (subjectName: string): string => {
  if (!subjectName || !subjectName.trim()) return subjectName
  // Remove parentheses and everything inside them (including nested parentheses)
  return subjectName.replace(/\s*\([^()]*\)\s*/g, '').trim()
}

// Utility function to check if subject is Senior High
// This function also handles subjects with parentheses by cleaning them first
const isSeniorHighSubject = (subjectName: string): boolean => {
  if (!subjectName || !subjectName.trim()) return false
  const cleaned = cleanSubjectName(subjectName)
  const normalized = cleaned.toLowerCase().trim()
  return SUBJECT_DICTIONARY.SeniorHighSubjects.some(sub => {
    const subNormalized = sub.toLowerCase().trim()
    return subNormalized === normalized || normalized.includes(subNormalized) || subNormalized.includes(normalized)
  })
}

// Get all subjects for suggestions
const getAllSubjects = (): string[] => {
  return [...SUBJECT_DICTIONARY.SeniorHighSubjects, ...SUBJECT_DICTIONARY.TertiarySubjects]
}

// Filter subjects based on search query
const filterSubjects = (query: string): string[] => {
  if (!query || !query.trim()) return getAllSubjects()
  const normalizedQuery = query.toLowerCase().trim()
  return getAllSubjects().filter(subject => 
    subject.toLowerCase().includes(normalizedQuery)
  )
}

const validateTime = (time: string): boolean => {
  if (!time) return false
  const timeRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM|am|pm)$/
  return timeRegex.test(time.trim())
}

export function DayScheduleModal({ 
  open, 
  onOpenChange, 
  day, 
  type, 
  schedules, 
  employeeName,
  onSave,
  onDelete 
}: DayScheduleModalProps) {
  const [formData, setFormData] = useState({
    time_start: '',
    time_end: '',
    course_code: '',
    subject_name: '',
    section: '',
    room: '',
    substitute: '',
    type: (type === 'class' ? 'Lecture' : 'Midterm') as 'Lecture' | 'Lab' | 'Prelim' | 'Midterm' | 'Pre-Final' | 'Final',
    exam_date: undefined as Date | undefined,
  })
  
  const [lastUsedTimeRange, setLastUsedTimeRange] = useState<{ start: string; end: string } | null>(null)

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [showDurationWarning, setShowDurationWarning] = useState(false)
  const [durationWarningMessage, setDurationWarningMessage] = useState('')
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [showValidationDialog, setShowValidationDialog] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<DayScheduleItem | null>(null)
  const [subjectSuggestionsOpen, setSubjectSuggestionsOpen] = useState(false)
  const [buildingSuggestionsOpen, setBuildingSuggestionsOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [scheduleToDelete, setScheduleToDelete] = useState<{ id: number; isExam: boolean } | null>(null)
  const [selectedProgram, setSelectedProgram] = useState<Program | 'none'>('none')
  const subjectInputRef = useRef<HTMLInputElement>(null)
  const buildingInputRef = useRef<HTMLInputElement>(null)
  const formScrollContainerRef = useRef<HTMLDivElement>(null)

  const scrollToFormField = (preferredField?: string) => {
    const targetField = preferredField || Object.keys(errors)[0] || 'subject_name'

    setShowValidationDialog(false)
    setShowDurationWarning(false)

    window.requestAnimationFrame(() => {
      const container = formScrollContainerRef.current
      if (!container) return

      const target =
        container.querySelector<HTMLElement>(`[data-field="${targetField}"]`) ||
        container.querySelector<HTMLElement>(`#${targetField}`) ||
        container.querySelector<HTMLElement>('[data-field="time_start"]')

      if (!target) return

      target.scrollIntoView({ behavior: 'smooth', block: 'center' })

      const focusable = target.matches('input, select, textarea, button')
        ? target
        : target.querySelector<HTMLElement>('input, select, textarea, button')

      focusable?.focus()
    })
  }
  
  // Determine if Course Code should be shown/required based on subject
  const isCourseCodeRequired = formData.subject_name && !isSeniorHighSubject(formData.subject_name)
  const isCourseCodeDisabled = !!(formData.subject_name && isSeniorHighSubject(formData.subject_name))
  
  // Get filtered suggestions for current input
  const getFilteredSuggestions = (): string[] => {
    const seniorHighSubjects = filterSubjects(formData.subject_name)
    
    // If no program selected, return Senior High subjects only
    if (selectedProgram === 'none') {
      return seniorHighSubjects
    }
    
    // If a program is selected, show ONLY tertiary subjects for that program (no SHS)
    const tertiaryCourses = searchCourses(selectedProgram as Program, formData.subject_name)
    const tertiarySubjects = tertiaryCourses.map(course => course.subject_name)
    
    // If there's no input, show all tertiary subjects for the selected program
    if (!formData.subject_name.trim()) {
      const allTertiaryCourses = TERTIARY_COURSE_DICTIONARY[selectedProgram as Program] || []
      return allTertiaryCourses.map(course => course.subject_name)
    }
    
    // If there's input, return only matching tertiary subjects
    return tertiarySubjects
  }
  
  const filteredSuggestions = getFilteredSuggestions()
  const filteredBuildingSuggestions = filterBuildings(formData.room)
  
  // Function to select a subject
  const selectSubject = (subject: string) => {
    const cleanedSubject = cleanSubjectName(subject)
    
    // Check if it's a Senior High subject first
    const isSHS = isSeniorHighSubject(cleanedSubject)
    
    if (isSHS) {
      // If Senior High subject is selected, clear course_code and set program to none
      setSelectedProgram('none')
      setFormData(prev => ({
        ...prev,
        subject_name: cleanedSubject,
        course_code: ''
      }))
    } else {
      // It's a tertiary subject - try to auto-fill course code
      let detectedProgram: Program | 'none' = selectedProgram
      let courseCode = ''
      
      if (selectedProgram && selectedProgram !== 'none') {
        // Try to get course code from selected program
        courseCode = getCourseCodeBySubject(selectedProgram as Program, cleanedSubject) || ''
      }
      
      // If not found in selected program, try to find it in any program
      if (!courseCode) {
        const programs = getAllPrograms()
        for (const program of programs) {
          const code = getCourseCodeBySubject(program, cleanedSubject)
          if (code) {
            courseCode = code
            detectedProgram = program // Auto-select the detected program
            break
          }
        }
      }
      
      // Update program if we detected a different one
      if (detectedProgram !== selectedProgram) {
        setSelectedProgram(detectedProgram)
      }
      
      // Update form data with subject and course code
      setFormData(prev => ({
        ...prev,
        subject_name: cleanedSubject,
        course_code: courseCode
      }))
    }
    
    setSubjectSuggestionsOpen(false)
    // Clear errors
    if (errors.subject_name) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors.subject_name
        return newErrors
      })
    }
    if (errors.course_code) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors.course_code
        return newErrors
      })
    }
  }
  
  // Handle program selection change
  const handleProgramChange = (program: Program | 'none') => {
    setSelectedProgram(program)
    // Clear subject and course code when program changes
    setFormData(prev => ({
      ...prev,
      subject_name: '',
      course_code: '',
    }))
    // Clear errors
    setErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors.subject_name
      delete newErrors.course_code
      return newErrors
    })
  }

  const selectedDay = days.find(d => d.value === day)

  // Reset form when modal opens - and show form immediately
  useEffect(() => {
    if (open) {
      setSelectedProgram('none')
      setFormData({
        time_start: '',
        time_end: '',
        course_code: '',
        subject_name: '',
        section: '',
        room: '',
        substitute: '',
        type: (type === 'class' ? 'Lecture' : 'Midterm') as 'Lecture' | 'Lab' | 'Prelim' | 'Midterm' | 'Pre-Final' | 'Final',
        exam_date: undefined,
      })
      setErrors({})
      setShowAddForm(true) // Show form immediately when modal opens
      setEditingSchedule(null) // Reset editing state
    }
  }, [open, type])

  // Function to detect program from course code
  const detectProgramFromCourseCode = (courseCode: string): Program | '' => {
    if (!courseCode) return ''
    // Try to find which program this course code belongs to
    const programs = getAllPrograms()
    for (const program of programs) {
      const courses = TERTIARY_COURSE_DICTIONARY[program]
      const found = courses.find(c => c.course_code === courseCode.toUpperCase())
      if (found) return program
    }
    return ''
  }
  
  // Function to load schedule into form for editing
  const loadScheduleIntoForm = (schedule: DayScheduleItem) => {
    setEditingSchedule(schedule)
    const subjectName = schedule.subject_name || schedule.subject || ''
    // Clean subject name (remove parentheses) when loading
    const cleanedSubjectName = cleanSubjectName(subjectName)
    // If subject is Senior High, course_code should be empty (NULL in DB)
    // Otherwise, use the course_code from schedule
    const courseCode = (cleanedSubjectName && isSeniorHighSubject(cleanedSubjectName)) ? '' : (schedule.course_code || '')
    
    // Try to detect program from course code
    const detectedProgram = courseCode ? detectProgramFromCourseCode(courseCode) : ''
    if (detectedProgram) {
      setSelectedProgram(detectedProgram)
    } else {
      setSelectedProgram('none')
    }
    
    setFormData({
      time_start: schedule.time_start || '',
      time_end: schedule.time_end || '',
      course_code: courseCode,
      subject_name: cleanedSubjectName,
      section: schedule.section || '',
      room: schedule.room_code || schedule.room || '',
      substitute: schedule.substitute || '',
      type: (schedule.type || (schedule.class_type === 'LEC' ? 'Lecture' : 'Lab')) as 'Lecture' | 'Lab' | 'Midterm' | 'Final',
      exam_date: schedule.exam_date ? new Date(schedule.exam_date) : undefined,
    })
    setErrors({})
  }

  // Function to clear form and start new
  const clearForm = () => {
    setEditingSchedule(null)
    setSelectedProgram('none')
    setFormData({
      time_start: '',
      time_end: '',
      course_code: '',
      subject_name: '',
      section: '',
      room: '',
      substitute: '',
      type: (type === 'class' ? 'Lecture' : 'Midterm') as 'Lecture' | 'Lab' | 'Prelim' | 'Midterm' | 'Pre-Final' | 'Final',
      exam_date: undefined,
    })
    setErrors({})
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
  
  // Calculate duration between times
  const calculateDuration = (start: string, end: string): string => {
    if (!start || !end) return ''
    
    const startMinutes = parseTimeToMinutes(start)
    const endMinutes = parseTimeToMinutes(end)
    
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return ''
    
    const diffMinutes = endMinutes - startMinutes
    const hours = Math.floor(diffMinutes / 60)
    const minutes = diffMinutes % 60
    
    if (hours === 0) return `${minutes} minute${minutes !== 1 ? 's' : ''}`
    if (minutes === 0) return `${hours} hour${hours !== 1 ? 's' : ''}`
    return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`
  }
  
  // Validate duration based on schedule type
  const validateDuration = (start: string, end: string): { isValid: boolean; message: string } => {
    if (!start || !end) {
      return { isValid: true, message: '' } // Let other validations handle empty fields
    }
    
    const startMinutes = parseTimeToMinutes(start)
    const endMinutes = parseTimeToMinutes(end)
    
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      return { isValid: true, message: '' } // Let other validations handle invalid times
    }
    
    const durationMinutes = endMinutes - startMinutes
    
    if (type === 'class') {
      // Class schedule: minimum 1 hour (60 minutes), maximum 3 hours (180 minutes)
      if (durationMinutes < 60) {
        return {
          isValid: false,
          message: `Class duration is ${Math.floor(durationMinutes / 60)} hour${Math.floor(durationMinutes / 60) !== 1 ? 's' : ''} ${durationMinutes % 60} minute${durationMinutes % 60 !== 1 ? 's' : ''}. Minimum duration is 1 hour.`
        }
      }
      if (durationMinutes > 180) {
        return {
          isValid: false,
          message: `Class duration is ${Math.floor(durationMinutes / 60)} hour${Math.floor(durationMinutes / 60) !== 1 ? 's' : ''} ${durationMinutes % 60} minute${durationMinutes % 60 !== 1 ? 's' : ''}. Maximum duration is 3 hours.`
        }
      }
    } else if (type === 'exam') {
      // Exam schedule: exactly 1 hour 30 minutes (90 minutes)
      if (durationMinutes !== 90) {
        const hours = Math.floor(durationMinutes / 60)
        const minutes = durationMinutes % 60
        return {
          isValid: false,
          message: `Exam duration is ${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}. Exam duration must be exactly 1 hour and 30 minutes.`
        }
      }
    }
    
    return { isValid: true, message: '' }
  }
  
  // Sort schedules by time, ensuring we have valid schedules
  const sortedSchedules = React.useMemo(() => {
    if (!schedules || schedules.length === 0) return []
    return [...schedules]
      .filter(s => s && (s.schedule_id || s.exam_schedule_id))
      .sort((a, b) => (a.time_start || '').localeCompare(b.time_start || ''))
  }, [schedules])
  
  // Check for time conflicts
  const checkTimeConflict = (start: string, end: string): string | null => {
    if (!start || !end || type !== 'exam') return null
    
    const parseTime = (timeStr: string): number | null => {
      const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
      if (!match) return null
      let hours = parseInt(match[1], 10)
      const minutes = parseInt(match[2], 10)
      const period = match[3].toUpperCase()
      if (period === 'PM' && hours !== 12) hours += 12
      if (period === 'AM' && hours === 12) hours = 0
      return hours * 60 + minutes
    }
    
    const newStart = parseTime(start)
    const newEnd = parseTime(end)
    if (newStart === null || newEnd === null) return null
    
    for (const schedule of sortedSchedules) {
      if (editingSchedule && 
          ((schedule.schedule_id && schedule.schedule_id === editingSchedule.schedule_id) ||
           (schedule.exam_schedule_id && schedule.exam_schedule_id === editingSchedule.exam_schedule_id))) {
        continue
      }
      
      const existingStart = parseTime(schedule.time_start || '')
      const existingEnd = parseTime(schedule.time_end || '')
      
      if (existingStart === null || existingEnd === null) continue
      
      if ((newStart >= existingStart && newStart < existingEnd) ||
          (newEnd > existingStart && newEnd <= existingEnd) ||
          (newStart <= existingStart && newEnd >= existingEnd)) {
        return `Conflicts with existing schedule: ${schedule.time_start} - ${schedule.time_end}`
      }
    }
    
    return null
  }
  
  // Copy last used time range
  const handleCopyLastUsedTime = () => {
    if (lastUsedTimeRange) {
      setFormData(prev => ({
        ...prev,
        time_start: lastUsedTimeRange.start,
        time_end: lastUsedTimeRange.end,
      }))
    }
  }

  // Update schedules when they change (so modal shows new schedules after save)
  useEffect(() => {
    // This ensures the modal re-renders when schedules prop changes
    // The schedules are already sorted in the component, so we just need to trigger re-render
  }, [schedules])

  const handleTimeChange = (field: 'time_start' | 'time_end', value: string) => {
    let processedValue = value
    processedValue = processedValue.replace(/(\d)([Aa][Mm]|[Pp][Mm])\b/g, '$1 $2')
    processedValue = processedValue.replace(/\b([Aa][Mm]|[Pp][Mm])\b/g, (match) => match.toUpperCase())
    
    setFormData(prev => ({ ...prev, [field]: processedValue }))
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  // Function to select a building
  const selectBuilding = (building: string) => {
    const upperValue = building.toUpperCase()
    setFormData(prev => {
      const newData = { ...prev, room: upperValue }
      // Auto-categorize type based on building code
      if (type === 'class') {
        if (upperValue.startsWith('B') || upperValue.includes('GYM')) {
          newData.type = 'Lecture'
        } else if (upperValue.startsWith('C') || upperValue.startsWith('COMPL')) {
          newData.type = 'Lab'
        }
      }
      return newData
    })
    setBuildingSuggestionsOpen(false)
    // Clear errors
    if (errors.room) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors.room
        return newErrors
      })
    }
  }

  const handleRoomChange = (value: string) => {
    const upperValue = value.toUpperCase()
    setFormData(prev => {
      const newData = { ...prev, room: upperValue }
      // Auto-categorize type based on building code
      if (type === 'class') {
        if (upperValue.startsWith('B') || upperValue.includes('GYM')) {
          newData.type = 'Lecture'
        } else if (upperValue.startsWith('C') || upperValue.startsWith('COMPL')) {
          newData.type = 'Lab'
        }
      }
      return newData
    })
    // Show suggestions when typing
    setBuildingSuggestionsOpen(true)
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
        
        // Convert to minutes for easier comparison
        const startTotalMinutes = startHours * 60 + startMinutes
        const endTotalMinutes = endHours * 60 + endMinutes
        
        // Validate acceptable time range: 7:00 AM to 9:00 PM only
        const sevenAM = 7 * 60 // 7:00 AM in minutes
        const ninePM = 21 * 60 // 9:00 PM in minutes (21:00 in 24-hour format)
        
        if (startTotalMinutes < sevenAM || startTotalMinutes > ninePM) {
          newErrors.time_start = `${type === 'class' ? 'Class' : 'Exam'} start time must be between 7:00 AM and 9:00 PM.`
        }
        
        if (endTotalMinutes < sevenAM || endTotalMinutes > ninePM) {
          newErrors.time_end = `${type === 'class' ? 'Class' : 'Exam'} end time must be between 7:00 AM and 9:00 PM.`
        }
        
        if (startTotalMinutes >= endTotalMinutes) {
          newErrors.time_end = 'End time must be after start time'
        } else {
          // Validate duration
          const durationValidation = validateDuration(formData.time_start, formData.time_end)
          if (!durationValidation.isValid) {
            newErrors.time_end = durationValidation.message
          }
          
          // Check for conflicts (only for exams)
          const conflict = checkTimeConflict(formData.time_start, formData.time_end)
          if (conflict) {
            newErrors.time_end = conflict
          }
        }
      }
    }

    if (type === 'class') {
      if (!formData.subject_name.trim()) {
        newErrors.subject_name = 'Subject name is required'
      } else {
        // Validate Course Code based on subject type
        const isSHS = isSeniorHighSubject(formData.subject_name)
        if (!isSHS && !formData.course_code.trim()) {
          // Course Code is required for Tertiary subjects
          newErrors.course_code = 'Course code is required for tertiary subjects'
        }
        // If it's SHS, course code is not required (allow empty)
      }
    } else {
      if (!formData.subject_name.trim()) {
        newErrors.subject_name = 'Subject is required'
      } else {
        // Validate Course Code based on subject type
        const isSHS = isSeniorHighSubject(formData.subject_name)
        if (!isSHS && !formData.course_code.trim()) {
          // Course Code is required for Tertiary subjects
          newErrors.course_code = 'Course code is required for tertiary subjects'
        }
        // If it's SHS, course code is not required (allow empty)
      }
      if (!formData.exam_date) {
        newErrors.exam_date = 'Exam date is required'
      } else {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const examDate = new Date(formData.exam_date)
        examDate.setHours(0, 0, 0, 0)
        
        if (examDate < today) {
          newErrors.exam_date = 'Exam date cannot be in the past'
        }
      }
    }

    if (!formData.section.trim()) {
      newErrors.section = 'Section is required'
    }

    if (!formData.room.trim()) {
      newErrors.room = 'Room is required'
    } else {
      const roomCode = formData.room.trim().toUpperCase()
      const roomCodeRegex = /^(COMPL[1-6]|B[1-9]\d{3}|C\d{3,4})$/
      if (!roomCodeRegex.test(roomCode)) {
        newErrors.room = 'Invalid room format. Use: COMPL1-6, B####, or C###'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // First validate all fields
    if (!validate()) {
      // Collect all validation error messages
      const errorMessages: string[] = []
      if (errors.time_start) errorMessages.push(`Time Start: ${errors.time_start}`)
      if (errors.time_end) errorMessages.push(`Time End: ${errors.time_end}`)
      if (errors.subject_name) errorMessages.push(`Subject: ${errors.subject_name}`)
      if (errors.course_code) errorMessages.push(`Course Code: ${errors.course_code}`)
      if (errors.section) errorMessages.push(`Section: ${errors.section}`)
      if (errors.room) errorMessages.push(`Room: ${errors.room}`)
      if (errors.exam_date) errorMessages.push(`Exam Date: ${errors.exam_date}`)
      
      // Show validation dialog with all errors
      setValidationErrors(errorMessages)
      setShowValidationDialog(true)
      return
    }
    
    // Then check duration validation separately to show warning dialog
    if (formData.time_start && formData.time_end) {
      const durationValidation = validateDuration(formData.time_start, formData.time_end)
      if (!durationValidation.isValid) {
        setDurationWarningMessage(durationValidation.message)
        setShowDurationWarning(true)
        return
      }
    }

    setIsSaving(true)
    try {
      // Determine course_code based on subject type
      // If subject is Senior High, set course_code to null (or undefined)
      // If subject is Tertiary, use the provided course_code
      // Clean subject name (remove parentheses) before saving
      const cleanedSubjectName = cleanSubjectName(formData.subject_name)
      const isSHS = isSeniorHighSubject(cleanedSubjectName)
      const courseCodeValue = isSHS ? null : (formData.course_code || undefined)
      
      await onSave({
        ...(editingSchedule && {
          schedule_id: editingSchedule.schedule_id,
          exam_schedule_id: editingSchedule.exam_schedule_id,
        }),
        time_start: formData.time_start,
        time_end: formData.time_end,
        course_code: courseCodeValue,
        ...(type === 'class' 
          ? { subject_name: cleanedSubjectName }
          : { subject: cleanedSubjectName }
        ),
        section: formData.section,
        room: formData.room,
        substitute: formData.substitute || undefined,
        type: formData.type,
        exam_date: type === 'exam' ? formData.exam_date : undefined,
      } as any)
      
      // Save time range for next use
      setLastUsedTimeRange({ start: formData.time_start, end: formData.time_end })

      // Reset form after successful save (modal stays open)
      clearForm()
    } catch {
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = (scheduleId: number, isExam: boolean) => {
    if (!onDelete) return
    setScheduleToDelete({ id: scheduleId, isExam })
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!onDelete || !scheduleToDelete) return
    await onDelete(scheduleToDelete.id, scheduleToDelete.isExam)
    setDeleteConfirmOpen(false)
    setScheduleToDelete(null)
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-[900px] lg:max-w-[1000px] w-[95vw] sm:w-[90vw] p-0 overflow-hidden rounded-2xl shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200 max-h-[95vh] flex flex-col"
        onInteractOutside={(e) => {
          e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault()
        }}
      >
        {/* Color-coded Header */}
        <div className={cn(
          "relative overflow-hidden px-6 sm:px-8 py-5 sm:py-6 text-white shrink-0",
          selectedDay?.color || 'bg-blue-500'
        )}>
          <div className="absolute inset-0 bg-white/10 backdrop-blur-sm" />
          <DialogHeader className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-white/20 backdrop-blur-md rounded-xl">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl sm:text-2xl font-bold">
                  {selectedDay?.label} {type === 'class' ? 'Class' : 'Exam'} Schedule
                </DialogTitle>
                <DialogDescription className="text-white/90 text-sm sm:text-base mt-1">
                  {employeeName ? `${employeeName}'s ${selectedDay?.label} schedules` : `${selectedDay?.label} schedule management`}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-hidden flex flex-col min-h-0">
          <div className="grid grid-cols-1 lg:grid-cols-[45%_55%] gap-4 sm:gap-6 h-full min-h-0 flex-1">
            {/* Left Column: Existing Schedules */}
            <div className="flex flex-col space-y-4 h-full">
              <h3 className="text-sm sm:text-base font-semibold text-gray-700 dark:text-gray-300 mb-2 shrink-0">
                Existing Schedules ({sortedSchedules.length})
              </h3>
              {sortedSchedules.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 dark:bg-neutral-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-neutral-700 shrink-0">
                  <Clock className="h-8 w-8 text-gray-400 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">No schedules for this day</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto pr-2 space-y-3 min-h-0">
                  {sortedSchedules.map((schedule, index) => {
                    const isSelected = editingSchedule && 
                      (editingSchedule.schedule_id === schedule.schedule_id || 
                       editingSchedule.exam_schedule_id === schedule.exam_schedule_id)
                    return (
                    <div
                      key={schedule.schedule_id || schedule.exam_schedule_id || index}
                      onClick={() => loadScheduleIntoForm(schedule)}
                      className={cn(
                        "rounded-lg border-2 p-4 bg-white dark:bg-neutral-900 cursor-pointer transition-all",
                        selectedDay?.borderColor || 'border-gray-300',
                        isSelected 
                          ? selectedDay?.borderColor?.replace('border-', 'border-4 border-') || 'border-4 border-blue-500'
                          : 'hover:shadow-md hover:scale-[1.02]'
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <div className={cn(
                              "px-2 py-1 rounded text-xs font-bold text-white",
                              selectedDay?.color || 'bg-blue-500'
                            )}>
                              #{index + 1}
                            </div>
                            <div className="flex items-center gap-1 text-sm font-semibold text-blue-600 dark:text-blue-400">
                              <Clock className="h-3.5 w-3.5" />
                              {schedule.time_start} - {schedule.time_end}
                            </div>
                            {(schedule.class_type || schedule.type) && (
                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-neutral-700 px-2 py-0.5 rounded">
                                {schedule.class_type || schedule.type}
                              </span>
                            )}
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-start gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 min-w-0">
                              <BookOpen className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
                              <span className="break-words break-all hyphens-auto overflow-wrap-anywhere flex-1">{cleanSubjectName(schedule.subject_name || schedule.subject || 'Untitled')}</span>
                            </div>
                            {schedule.course_code && (
                              <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                                <span className="font-mono bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded">
                                  {schedule.course_code}
                                </span>
                              </div>
                            )}
                            {schedule.section && (
                              <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                                <Users className="h-3.5 w-3.5 text-cyan-500" />
                                Section: {schedule.section}
                              </div>
                            )}
                            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                              <MapPin className="h-3.5 w-3.5 text-red-500" />
                              Room: {schedule.room_code || schedule.room || 'TBA'}
                            </div>
                            {schedule.substitute && (
                              <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                                <Users className="h-3.5 w-3.5" />
                                Substitute: {schedule.substitute}
                              </div>
                            )}
                            {type === 'exam' && schedule.exam_date && (
                              <div className="flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400">
                                <Calendar className="h-3.5 w-3.5" />
                                Date: {format(new Date(schedule.exam_date), 'MMM dd, yyyy')}
                              </div>
                            )}
                          </div>
                        </div>
                        {onDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation() // Prevent loading schedule into form when clicking delete
                              handleDelete(
                                (schedule.schedule_id || schedule.exam_schedule_id) as number,
                                type === 'exam'
                              )
                            }}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Add/Edit Schedule Form */}
            <div className="flex flex-col h-full min-h-0">
              <div className={cn(
                "rounded-xl border-2 bg-white dark:bg-neutral-900 shadow-lg h-full flex flex-col overflow-hidden min-h-0",
                "border-gray-200 dark:border-neutral-700",
                selectedDay?.borderColor || 'border-gray-300'
              )}>
                <div className="flex items-center justify-between px-5 sm:px-6 py-4 shrink-0 border-b border-gray-200 dark:border-neutral-700">
                  <div className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-bold text-white",
                    selectedDay?.color || 'bg-blue-500'
                  )}>
                    {editingSchedule ? (
                      <>
                        <BookOpen className="h-4 w-4 inline mr-1.5" />
                        Edit {type === 'class' ? 'Class' : 'Exam'}
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 inline mr-1.5" />
                        New {type === 'class' ? 'Class' : 'Exam'}
                      </>
                    )}
                  </div>
                  {editingSchedule && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearForm}
                      className="text-xs h-8"
                    >
                      New Entry
                    </Button>
                  )}
                </div>

                <div ref={formScrollContainerRef} className="flex-1 overflow-y-auto min-h-0 overscroll-contain scroll-smooth">
                  <form id="schedule-form" onSubmit={handleSubmit} className="px-5 sm:px-6 py-4 sm:py-5 space-y-5 pb-6">
                  {/* Exam Date (only for exams) */}
                  {type === 'exam' && (
                    <div className="space-y-2" data-field="exam_date">
                      <Label htmlFor="exam_date" className="flex items-center gap-2 text-sm font-semibold">
                        <Calendar className="h-4 w-4 text-purple-500" />
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
                            <Calendar className="mr-2 h-4 w-4" />
                            {formData.exam_date ? format(formData.exam_date, "PPP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={formData.exam_date}
                            onSelect={(date) => {
                              setFormData(prev => ({ ...prev, exam_date: date }))
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
                              if (date < today) return true
                              
                              // CRITICAL: Only allow dates that match the schedule's day_of_week
                              // day prop: 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
                              // JavaScript getDay(): 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
                              const jsDay = date.getDay() // 0-6
                              const scheduleDay = day // 1-6
                              
                              // Disable all days that don't match the schedule day
                              // If schedule is Friday (5), JS Friday is 5, so allow it
                              // If schedule is Monday (1), JS Monday is 1, so allow it
                              return jsDay !== scheduleDay
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
                  )}

                  {/* Time Range */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2" data-field="time_start">
                        <Label htmlFor="time_start" className="flex items-center gap-2 text-sm font-semibold">
                          <Clock className="h-4 w-4 text-green-500" />
                          Time Start *
                        </Label>
                        <TimePicker
                          value={formData.time_start}
                          onChange={(value) => {
                            setFormData(prev => ({ ...prev, time_start: value }))
                            if (errors.time_start) {
                              setErrors(prev => {
                                const newErrors = { ...prev }
                                delete newErrors.time_start
                                return newErrors
                              })
                            }
                          }}
                          placeholder="Select Start Time"
                          error={errors.time_start}
                          lastUsedTime={lastUsedTimeRange?.start}
                          onCopyTime={() => handleCopyLastUsedTime()}
                        />
                        {errors.time_start && (
                          <p className="text-xs text-red-600 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {errors.time_start}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2" data-field="time_end">
                        <Label htmlFor="time_end" className="flex items-center gap-2 text-sm font-semibold">
                          <Clock className="h-4 w-4 text-orange-500" />
                          Time End *
                        </Label>
                        <TimePicker
                          value={formData.time_end}
                          onChange={(value) => {
                            setFormData(prev => ({ ...prev, time_end: value }))
                            if (errors.time_end) {
                              setErrors(prev => {
                                const newErrors = { ...prev }
                                delete newErrors.time_end
                                return newErrors
                              })
                            }
                          }}
                          placeholder="Select End Time"
                          error={errors.time_end}
                          lastUsedTime={lastUsedTimeRange?.end}
                          onCopyTime={() => handleCopyLastUsedTime()}
                        />
                        {errors.time_end && (
                          <p className="text-xs text-red-600 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {errors.time_end}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {/* Duration Display */}
                    {formData.time_start && formData.time_end && calculateDuration(formData.time_start, formData.time_end) && (() => {
                      const durationValidation = validateDuration(formData.time_start, formData.time_end)
                      const isValid = durationValidation.isValid
                      return (
                        <div className={cn(
                          "flex items-center gap-2 p-2 rounded-lg border",
                          isValid 
                            ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
                            : "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800"
                        )}>
                          <Timer className={cn(
                            "h-4 w-4",
                            isValid 
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-yellow-600 dark:text-yellow-400"
                          )} />
                          <span className={cn(
                            "text-sm font-medium",
                            isValid
                              ? "text-blue-900 dark:text-blue-100"
                              : "text-yellow-900 dark:text-yellow-100"
                          )}>
                            Duration: {calculateDuration(formData.time_start, formData.time_end)}
                            {!isValid && (
                              <span className="ml-2 text-xs">⚠ Invalid</span>
                            )}
                          </span>
                        </div>
                      )
                    })()}
                    
                    {/* Conflict Warning for Exams */}
                    {type === 'exam' && formData.time_start && formData.time_end && checkTimeConflict(formData.time_start, formData.time_end) && (
                      <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
                        <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                        <span className="text-xs font-medium text-red-900 dark:text-red-100">
                          {checkTimeConflict(formData.time_start, formData.time_end)}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Program Selector (for Tertiary subjects) */}
                  <div className="space-y-2" data-field="program">
                    <Label htmlFor="program" className="flex items-center gap-2 text-sm font-semibold">
                      <BookOpen className="h-4 w-4 text-blue-500" />
                      Program (Optional - for Tertiary subjects)
                    </Label>
                    <Select
                      value={selectedProgram}
                      onValueChange={handleProgramChange}
                    >
                      <SelectTrigger className="h-11 border-2">
                        <SelectValue placeholder="Select a program (BSA, BSBA, BSCpE, etc.)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (Senior High)</SelectItem>
                        {getAllPrograms().map((program) => (
                          <SelectItem key={program} value={program}>
                            {program}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedProgram && selectedProgram !== 'none' && (
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        Tertiary subjects for {selectedProgram} will be available
                      </p>
                    )}
                  </div>
                  
                  {/* Subject Name */}
                  <div className="space-y-2" data-field="subject_name">
                    <Label htmlFor="subject_name" className="flex items-center gap-2 text-sm font-semibold">
                      <BookOpen className="h-4 w-4 text-purple-500" />
                      {type === 'class' ? 'Subject Name' : 'Subject'} *
                    </Label>
                    <Popover open={subjectSuggestionsOpen} onOpenChange={setSubjectSuggestionsOpen}>
                      <PopoverTrigger asChild>
                        <div className="relative">
                          <Input
                            ref={subjectInputRef}
                            id="subject_name"
                            value={formData.subject_name}
                            onChange={(e) => {
                              const value = e.target.value
                              setFormData(prev => {
                                const newData = { ...prev, subject_name: value }
                                // If Senior High subject is selected, clear course_code
                                if (isSeniorHighSubject(value)) {
                                  newData.course_code = ''
                                }
                                return newData
                              })
                              // Always show suggestions when typing (even if empty to show all)
                              setSubjectSuggestionsOpen(true)
                              // Clear errors
                              if (errors.subject_name) {
                                setErrors(prev => {
                                  const newErrors = { ...prev }
                                  delete newErrors.subject_name
                                  return newErrors
                                })
                              }
                              if (errors.course_code) {
                                setErrors(prev => {
                                  const newErrors = { ...prev }
                                  delete newErrors.course_code
                                  return newErrors
                                })
                              }
                            }}
                            onKeyDown={(e) => {
                              // If Enter is pressed and there's only one suggestion, select it
                              if (e.key === 'Enter' && filteredSuggestions.length === 1) {
                                e.preventDefault()
                                selectSubject(filteredSuggestions[0])
                                subjectInputRef.current?.blur()
                              }
                              // If Escape is pressed, close suggestions
                              if (e.key === 'Escape') {
                                setSubjectSuggestionsOpen(false)
                              }
                            }}
                            onFocus={() => {
                              setSubjectSuggestionsOpen(true)
                            }}
                            placeholder={type === 'class' ? "Computer Programming 1" : "Computer Programming 1"}
                            className={cn(
                              "h-11 border-2 focus:ring-2 focus:ring-blue-500",
                              errors.subject_name && "border-red-500 focus:ring-red-500"
                            )}
                          />
                        </div>
                      </PopoverTrigger>
                      <PopoverContent 
                        className="w-[var(--radix-popover-trigger-width)] p-0" 
                        align="start" 
                        onOpenAutoFocus={(e) => e.preventDefault()}
                        onInteractOutside={(e) => {
                          // Don't close if clicking on the input
                          if (subjectInputRef.current?.contains(e.target as Node)) {
                            e.preventDefault()
                          }
                        }}
                        onWheel={(e) => {
                          // Allow scrolling within the popover
                          e.stopPropagation()
                        }}
                      >
                        <Command shouldFilter={false}>
                          <CommandList className="max-h-[300px] overflow-y-auto overscroll-contain">
                            {filteredSuggestions.length === 0 ? (
                              <CommandEmpty>No subjects found.</CommandEmpty>
                            ) : (
                              <CommandGroup heading={selectedProgram !== 'none' ? `Suggestions (${selectedProgram})` : 'Suggestions (SHS)'}>
                                {filteredSuggestions.map((subject) => {
                                // Clean subject name for display and matching
                                const cleanedSubject = cleanSubjectName(subject)
                                const isSHS = isSeniorHighSubject(cleanedSubject)
                                
                                // Get course code for tertiary subjects
                                // When a program is selected, all subjects should be tertiary (no SHS)
                                let courseCode = ''
                                let subjectProgram: Program | null = null
                                
                                // If program is selected, all subjects are tertiary
                                if (selectedProgram && selectedProgram !== 'none') {
                                  courseCode = getCourseCodeBySubject(selectedProgram as Program, cleanedSubject) || ''
                                  if (courseCode) {
                                    subjectProgram = selectedProgram as Program
                                  }
                                } else if (!isSHS) {
                                  // No program selected but it's a tertiary subject - search all programs
                                  const programs = getAllPrograms()
                                  for (const program of programs) {
                                    const code = getCourseCodeBySubject(program, cleanedSubject)
                                    if (code) {
                                      courseCode = code
                                      subjectProgram = program
                                      break
                                    }
                                  }
                                }
                                
                                return (
                                <CommandItem
                                  key={subject}
                                  value={subject}
                                  onSelect={() => {
                                    selectSubject(subject)
                                    setTimeout(() => {
                                      subjectInputRef.current?.blur()
                                    }, 100)
                                  }}
                                  className={cn(
                                    (selectedProgram !== 'none' || !isSHS) && "bg-blue-50/50 dark:bg-blue-950/20"
                                  )}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      formData.subject_name === cleanedSubject ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex-1 flex flex-col gap-0.5">
                                    <span className="break-words font-medium">{cleanedSubject}</span>
                                    {courseCode && (
                                      <span className="text-xs text-blue-600 dark:text-blue-400 font-mono font-semibold">
                                        {courseCode}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 ml-2">
                                    {selectedProgram !== 'none' && (
                                      <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded font-semibold">
                                        {selectedProgram}
                                      </span>
                                    )}
                                    {selectedProgram === 'none' && isSHS && (
                                      <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">SHS</span>
                                    )}
                                    {selectedProgram === 'none' && !isSHS && subjectProgram && (
                                      <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded font-semibold">
                                        {subjectProgram}
                                      </span>
                                    )}
                                  </div>
                                </CommandItem>
                              )
                              })}
                              </CommandGroup>
                            )}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {errors.subject_name && (
                      <p className="text-xs text-red-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {errors.subject_name}
                      </p>
                    )}
                    {isCourseCodeDisabled && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Course Code not required for SHS subjects.
                      </p>
                    )}
                  </div>

                  {/* Course Code - MOVED AFTER SUBJECT */}
                  <div className={cn("space-y-2 transition-opacity", isCourseCodeDisabled && "opacity-50")} data-field="course_code">
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Label 
                            htmlFor="course_code" 
                            className={cn(
                              "flex items-center gap-2 text-sm font-semibold",
                              isCourseCodeDisabled && "cursor-not-allowed"
                            )}
                          >
                            <BookOpen className="h-4 w-4 text-indigo-500" />
                            Course Code {isCourseCodeRequired ? '*' : ''}
                          </Label>
                        </TooltipTrigger>
                        {isCourseCodeDisabled && (
                          <TooltipContent>
                            <p>Course Code not required for Senior High subjects</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                    <Input
                      id="course_code"
                      value={formData.course_code}
                      onChange={(e) => {
                        let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                        if (value.length > 8) value = value.slice(0, 8)
                        const letters = value.match(/[A-Z]/g)?.join('') || ''
                        const numbers = value.match(/\d/g)?.join('') || ''
                        value = (letters.slice(0, 4) + numbers.slice(0, 4)).slice(0, 8)
                        setFormData(prev => ({ ...prev, course_code: value }))
                        if (errors.course_code) {
                          setErrors(prev => {
                            const newErrors = { ...prev }
                            delete newErrors.course_code
                            return newErrors
                          })
                        }
                      }}
                      placeholder="INTE1044 (4 letters + 4 numbers)"
                      maxLength={8}
                      disabled={isCourseCodeDisabled}
                      className={cn(
                        "h-11 border-2 font-mono focus:ring-2 focus:ring-blue-500",
                        errors.course_code && "border-red-500 focus:ring-red-500",
                        isCourseCodeDisabled && "cursor-not-allowed bg-gray-50 dark:bg-gray-800"
                      )}
                    />
                    {!isCourseCodeDisabled && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Format: 4 letters + 4 numbers (e.g., INTE1044)
                      </p>
                    )}
                    {errors.course_code && (
                      <p className="text-xs text-red-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {errors.course_code}
                      </p>
                    )}
                  </div>

                  {/* Section and Room - Side by side on desktop */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                          "h-11 border-2 font-mono focus:ring-2 focus:ring-blue-500",
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
                      <Popover open={buildingSuggestionsOpen} onOpenChange={setBuildingSuggestionsOpen}>
                        <PopoverTrigger asChild>
                          <div className="relative">
                            <Input
                              ref={buildingInputRef}
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
                              onKeyDown={(e) => {
                                // If Enter is pressed and there's only one suggestion, select it
                                if (e.key === 'Enter' && filteredBuildingSuggestions.length === 1) {
                                  e.preventDefault()
                                  selectBuilding(filteredBuildingSuggestions[0])
                                  buildingInputRef.current?.blur()
                                }
                                // If Escape is pressed, close suggestions
                                if (e.key === 'Escape') {
                                  setBuildingSuggestionsOpen(false)
                                }
                              }}
                              onFocus={() => {
                                setBuildingSuggestionsOpen(true)
                              }}
                              placeholder="B3201, COMPL4, GYM3 (LEC)"
                              className={cn(
                                "h-11 border-2 font-mono focus:ring-2 focus:ring-blue-500",
                                errors.room && "border-red-500 focus:ring-red-500"
                              )}
                            />
                          </div>
                        </PopoverTrigger>
                        <PopoverContent 
                          className="w-[var(--radix-popover-trigger-width)] p-0" 
                          align="start" 
                          onOpenAutoFocus={(e) => e.preventDefault()}
                          onInteractOutside={(e) => {
                            // Don't close if clicking on the input
                            if (buildingInputRef.current?.contains(e.target as Node)) {
                              e.preventDefault()
                            }
                          }}
                          onWheel={(e) => {
                            // Allow scrolling within the popover
                            e.stopPropagation()
                          }}
                        >
                          <Command shouldFilter={false}>
                            <CommandList className="max-h-[300px] overflow-y-auto overscroll-contain">
                              {filteredBuildingSuggestions.length === 0 ? (
                                <CommandEmpty>No buildings found.</CommandEmpty>
                              ) : (
                                <CommandGroup heading="Available Buildings">
                                  {filteredBuildingSuggestions.map((building) => (
                                    <CommandItem
                                      key={building}
                                      value={building}
                                      onSelect={() => {
                                        selectBuilding(building)
                                        setTimeout(() => {
                                          buildingInputRef.current?.blur()
                                        }, 100)
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          formData.room.toUpperCase() === building.toUpperCase() ? "opacity-100" : "opacity-0"
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
                      {errors.room && (
                        <p className="text-xs text-red-600 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {errors.room}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Room format hint - full width */}
                  <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
                    Select from available buildings or type to search. Valid formats: <span className="font-mono">COMPL1-6</span>, <span className="font-mono">B####</span>, <span className="font-mono">GYM2/3 (LEC)</span>
                  </p>

                  {/* Type */}
                  <div className="space-y-2" data-field="type">
                    <Label htmlFor="type" className="flex items-center gap-2 text-sm font-semibold">
                      Type *
                    </Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value: 'Lecture' | 'Lab' | 'Prelim' | 'Midterm' | 'Pre-Final' | 'Final') => {
                      setFormData(prev => ({ ...prev, type: value }))
                    }}
                  >
                    <SelectTrigger className="h-11 border-2 focus:ring-2 focus:ring-blue-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {type === 'class' ? (
                        <>
                          <SelectItem value="Lecture">Lecture (LEC)</SelectItem>
                          <SelectItem value="Lab">Lab (LAB)</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="Prelim">Prelim</SelectItem>
                          <SelectItem value="Midterm">Midterm</SelectItem>
                          <SelectItem value="Pre-Final">Pre-Final</SelectItem>
                          <SelectItem value="Final">Final</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                  {formData.type && type === 'class' && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Auto-categorized from room code: <span className="font-semibold text-blue-600 dark:text-blue-400">{formData.type}</span>
                    </p>
                  )}
                  </div>

                  </form>
                </div>

                {/* Action Buttons - Fixed at bottom */}
                <div className="flex gap-3 px-5 sm:px-6 py-4 border-t border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={clearForm}
                    className="flex-1 h-11 font-medium text-sm"
                  >
                    {editingSchedule ? 'Cancel Edit' : 'Clear'}
                  </Button>
                  <Button
                    type="submit"
                    form="schedule-form"
                    disabled={isSaving}
                    className={cn(
                      "flex-1 h-11 font-semibold shadow-lg hover:shadow-xl transition-all text-white text-sm",
                      selectedDay?.color || 'bg-blue-600 hover:bg-blue-700'
                    )}
                  >
                    {isSaving ? 'Saving...' : editingSchedule ? 'Update Schedule' : 'Save Schedule'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="sm:max-w-[500px] rounded-2xl shadow-2xl border-2 border-red-200 dark:border-red-800">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
                <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <AlertDialogTitle className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Delete {type === 'class' ? 'Class' : 'Exam'} Schedule?
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base text-gray-600 dark:text-gray-400 mt-2">
              Are you sure you want to delete this {type === 'class' ? 'class' : 'exam'} schedule? This action cannot be undone.
              {scheduleToDelete && (() => {
                const schedule = schedules.find(s => 
                  (s.schedule_id && s.schedule_id === scheduleToDelete.id) || 
                  (s.exam_schedule_id && s.exam_schedule_id === scheduleToDelete.id)
                )
                if (schedule) {
                  return (
                    <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-blue-500" />
                          <span className="font-semibold">{schedule.time_start} - {schedule.time_end}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4 text-purple-500" />
                          <span>{cleanSubjectName(schedule.subject_name || schedule.subject || 'Untitled')}</span>
                        </div>
                        {schedule.section && (
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-cyan-500" />
                            <span>Section: {schedule.section}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-red-500" />
                          <span>Room: {schedule.room_code || schedule.room || 'TBA'}</span>
                        </div>
                      </div>
                    </div>
                  )
                }
                return null
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 mt-6">
            <AlertDialogCancel 
              className="h-11 px-6 font-medium border-2 hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={() => {
                setDeleteConfirmOpen(false)
                setScheduleToDelete(null)
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="h-11 px-6 font-semibold bg-red-600 hover:bg-red-700 text-white shadow-lg hover:shadow-xl transition-all"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Schedule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duration Warning Dialog */}
      <AlertDialog open={showDurationWarning} onOpenChange={setShowDurationWarning}>
        <AlertDialogContent className="sm:max-w-[500px]">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-full">
                <AlertCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <AlertDialogTitle className="text-xl">
                Review Form
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base mt-2">
              {durationWarningMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => scrollToFormField('time_end')}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              Review Form
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Validation Summary Dialog */}
      <AlertDialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
        <AlertDialogContent className="sm:max-w-[500px] rounded-2xl shadow-2xl border-2 border-red-200 dark:border-red-800">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <AlertDialogTitle className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Review Form
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base text-gray-600 dark:text-gray-400 mt-2">
              Please fix the following errors before saving:
              <div className="mt-4 space-y-2">
                {validationErrors.map((error, index) => (
                  <div key={index} className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                    <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <span className="text-sm text-red-800 dark:text-red-200 font-medium">{error}</span>
                  </div>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogAction
              onClick={() => scrollToFormField()}
              className="h-11 px-6 font-semibold bg-red-600 hover:bg-red-700 text-white shadow-lg hover:shadow-xl transition-all"
            >
              Review Form
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}

