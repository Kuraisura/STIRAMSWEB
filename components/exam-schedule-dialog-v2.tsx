"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { 
  Plus, 
  Trash2,
  Clock, 
  MapPin, 
  FileText, 
  Calendar,
  Users,
  X,
  Save,
  GraduationCap,
  AlertCircle,
  ChevronDown,
  ChevronUp
} from "lucide-react"
import { toast } from "sonner"

interface Employee {
  employee_id: number
  full_name: string
  department: string
  photo_path?: string
  school_id: string
  staff_type?: string
  employment_status?: string
  email?: string
}

interface ExamSchedule {
  exam_schedule_id?: number
  employee_id: number
  day_of_week: number
  exam_date: string
  time_start: string
  time_end: string
  subject_name: string
  section: string
  room_code: string
  exam_type?: string
  class_type?: 'SHS' | 'Tertiary'
  term?: '1st_term' | '2nd_term'
  status?: string
}

interface ExamScheduleDialogProps {
  employee: Employee | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const mapAcademicTermNameToCode = (termName: unknown): '1st_term' | '2nd_term' | 'summer' => {
  const normalized = String(termName || '').trim().toLowerCase()
  if (normalized.includes('2nd') || normalized.includes('second')) return '2nd_term'
  if (normalized.includes('summer')) return 'summer'
  return '1st_term'
}

export function ExamScheduleDialog({ employee, open, onOpenChange }: ExamScheduleDialogProps) {
  const [schedules, setSchedules] = useState<ExamSchedule[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1])) // Start with Monday expanded
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [scheduleToDelete, setScheduleToDelete] = useState<ExamSchedule | null>(null)
  
  // Day of week selection (1=Monday, 2=Tuesday, ..., 6=Saturday)
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<number>(1) // Default to Monday
  
  // Form state
  const [formData, setFormData] = useState<Partial<ExamSchedule>>({
    exam_date: new Date().toISOString().split('T')[0],
    time_start: "07:00",
    time_end: "09:00",
    subject_name: "",
    section: "",
    room_code: "",
    class_type: "Tertiary",
    exam_type: "Prelim",
    status: 'available'
  })

  // Day options for selector
  const dayOptions = [
    { value: 1, label: 'Monday', color: 'bg-blue-600' },
    { value: 2, label: 'Tuesday', color: 'bg-green-600' },
    { value: 3, label: 'Wednesday', color: 'bg-yellow-600' },
    { value: 4, label: 'Thursday', color: 'bg-orange-600' },
    { value: 5, label: 'Friday', color: 'bg-purple-600' },
    { value: 6, label: 'Saturday', color: 'bg-pink-600' },
  ]

  // Helper function to get day of week from date (0=Sunday, 1=Monday, ..., 6=Saturday)
  const getDayOfWeek = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00')
    return date.getDay()
  }

  // Helper function to find next date matching the selected day of week
  const getNextDateForDay = (dayOfWeek: number) => {
    const today = new Date()
    const currentDay = today.getDay() // 0=Sunday, 1=Monday, etc.
    
    // Calculate days until the target day
    let daysUntil = dayOfWeek - currentDay
    if (daysUntil <= 0) {
      daysUntil += 7 // Move to next week if day has passed
    }
    
    const targetDate = new Date(today)
    targetDate.setDate(today.getDate() + daysUntil)
    return targetDate.toISOString().split('T')[0]
  }

  // Check if a date matches the selected day of week
  const isDateMatchingDay = (dateString: string, dayOfWeek: number) => {
    const dateDayOfWeek = getDayOfWeek(dateString)
    return dateDayOfWeek === dayOfWeek
  }

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

  // When day of week changes, update the selected date to match
  useEffect(() => {
    const nextDate = getNextDateForDay(selectedDayOfWeek)
    setSelectedDate(nextDate)
    setFormData(prev => ({ ...prev, exam_date: nextDate }))
  }, [selectedDayOfWeek])

  useEffect(() => {
    if (employee && open) {
      fetchSchedules()
    }
  }, [employee, open])

  const fetchSchedules = async () => {
    if (!employee) return
    
    setIsLoading(true)
    try {
      const res = await fetch(`/api/schedules/employee?employee_id=${employee.employee_id}`, {
        cache: 'no-store',
      })
      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(body?.error || 'Failed to load exam schedules')
      }

      setSchedules((body?.exam || []) as ExamSchedule[])
    } catch (error) {
      console.error("Error fetching exam schedules:", error)
      toast.error("Failed to load exam schedules")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (!employee) return

    if (!formData.subject_name || !formData.section || !formData.room_code || !formData.exam_date) {
      toast.error("Please fill in all required fields")
      return
    }

    setIsLoading(true)
    try {
      const termRes = await fetch('/api/academic-terms', { cache: 'no-store' })
      const termJson = await termRes.json().catch(() => ({}))
      const activeTerm = Array.isArray((termJson as any)?.data)
        ? (termJson as any).data.find((term: any) => Boolean(term?.is_active))
        : null
      const activeTermCode = mapAcademicTermNameToCode(activeTerm?.term_name)

      // Calculate day_of_week from exam_date
      const examDate = new Date(formData.exam_date)
      const jsDay = examDate.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      const day_of_week = jsDay === 0 ? 7 : jsDay // Convert: Sunday (0) -> 7, others stay same
      
      // Extract course code from subject name (first 8 characters)
      const course_code = formData.subject_name.substring(0, 8).toUpperCase() || 'COURSE'
      
      const scheduleData = {
        employee_id: employee.employee_id,
        exam_date: formData.exam_date,
        day_of_week: day_of_week,
        time_start: formData.time_start,
        time_end: formData.time_end,
        course_code: course_code,
        subject_name: formData.subject_name,
        section: formData.section,
        room_code: formData.room_code,
        class_type: formData.class_type || 'Tertiary',
        exam_type: formData.exam_type || "Midterm",
        term: activeTermCode,
        status: formData.status || 'available'
      }

      console.log('[exam-schedule-dialog-v2] Inserting schedule data:', scheduleData)

      const res = await fetch('/api/exam-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduleData),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        console.error('[exam-schedule-dialog-v2] Insert error:', data)
        throw new Error(data?.error || 'Failed to save exam schedule')
      }
      
      console.log('[exam-schedule-dialog-v2] Insert successful:', data)
      toast.success("Exam schedule added successfully")

      // Reset form
      setFormData({
        exam_date: selectedDate,
        time_start: "07:00",
        time_end: "09:00",
        subject_name: "",
        section: "",
        room_code: "",
        class_type: "Tertiary",
        exam_type: "Prelim",
        status: 'available'
      })
      fetchSchedules()
    } catch (error) {
      console.error("Error saving exam schedule:", error)
      toast.error("Failed to save exam schedule")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (examScheduleId: number) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/exam-schedules/${examScheduleId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(body?.error || 'Failed to delete exam schedule')
      }

      toast.success("Exam schedule deleted successfully")
      fetchSchedules()
    } catch (error) {
      console.error("Error deleting exam schedule:", error)
      toast.error("Failed to delete exam schedule")
    } finally {
      setIsLoading(false)
    }
  }

  const openDeleteDialog = (schedule: ExamSchedule) => {
    setScheduleToDelete(schedule)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!scheduleToDelete?.exam_schedule_id) {
      toast.error("Unable to delete exam schedule: missing id")
      setDeleteDialogOpen(false)
      setScheduleToDelete(null)
      return
    }

    await handleDelete(scheduleToDelete.exam_schedule_id)
    setDeleteDialogOpen(false)
    setScheduleToDelete(null)
  }

  const handleClear = () => {
    setFormData({
      exam_date: selectedDate,
      time_start: "07:00",
      time_end: "09:00",
      subject_name: "",
      section: "",
      room_code: "",
      class_type: "Tertiary",
      exam_type: "Prelim",
      status: 'available'
    })
  }

  // Handle class type change and reset exam type
  const handleClassTypeChange = (newClassType: 'SHS' | 'Tertiary') => {
    const newExamType = newClassType === 'SHS' ? '1st Quarter' : 'Prelim'
    setFormData({ 
      ...formData, 
      class_type: newClassType,
      exam_type: newExamType
    })
  }

  const toggleDayExpansion = (day: number) => {
    setExpandedDays(prev => {
      const newSet = new Set(prev)
      if (newSet.has(day)) {
        newSet.delete(day)
      } else {
        newSet.add(day)
      }
      return newSet
    })
  }

  const toMinutes = (timeValue?: string) => {
    const text = String(timeValue || '').trim()
    const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
    if (!match) return Number.MAX_SAFE_INTEGER
    const hh = Number(match[1])
    const mm = Number(match[2])
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return Number.MAX_SAFE_INTEGER
    return hh * 60 + mm
  }

  // Group schedules by day of week
  const schedulesByDay = dayOptions.reduce((acc, day) => {
    acc[day.value] = schedules
      .filter((s) => {
        // Fallback to day_of_week if date is invalid
        if (!s.exam_date) return Number(s.day_of_week) === day.value
        const scheduleDate = new Date(s.exam_date + 'T00:00:00+08:00')
        const jsDay = scheduleDate.getDay() // 0 = Sunday, 1 = Monday
        const normalizedDay = jsDay === 0 ? 7 : jsDay // Match DB day_of_week
        return normalizedDay === day.value || Number(s.day_of_week) === day.value
      })
      .sort((a, b) => {
        const byDate = String(a.exam_date || '').localeCompare(String(b.exam_date || ''))
        if (byDate !== 0) return byDate
        const byStart = toMinutes(a.time_start) - toMinutes(b.time_start)
        if (byStart !== 0) return byStart
        const byEnd = toMinutes(a.time_end) - toMinutes(b.time_end)
        if (byEnd !== 0) return byEnd
        return String(a.subject_name || '').localeCompare(String(b.subject_name || ''))
      })
    return acc
  }, {} as Record<number, ExamSchedule[]>)

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
  }

  if (!employee) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="w-[95vw] max-w-[1600px] h-[90vh] p-0 gap-0 overflow-hidden [&>button]:hidden" 
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="bg-linear-to-r from-purple-600 to-pink-500 px-8 py-6 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-4 text-white">
            <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
              <GraduationCap className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Exam Schedule Management</h2>
              <p className="text-sm opacity-90 mt-0.5">{employee.full_name} • {employee.department}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="text-white hover:bg-white/20 h-11 w-11 rounded-lg"
          >
            <X className="h-6 w-6" />
          </Button>
        </div>

        {/* Day Selector */}
        <div className="px-8 py-5 bg-linear-to-r from-purple-50 to-pink-50 border-b-2">
          <div className="flex items-center gap-3">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Day *
            </Label>
            <div className="flex gap-2">
              {dayOptions.map((day) => (
                <Button
                  key={day.value}
                  onClick={() => setSelectedDayOfWeek(day.value)}
                  variant={selectedDayOfWeek === day.value ? "default" : "outline"}
                  className={`h-10 px-6 font-semibold transition-all ${
                    selectedDayOfWeek === day.value 
                      ? `${day.color} hover:${day.color} text-white shadow-lg scale-105` 
                      : 'hover:bg-gray-100'
                  }`}
                >
                  {day.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Date Selector */}
        <div className="px-8 py-5 bg-white border-b-2">
          <div className="flex items-center gap-4">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Select Exam Date:
            </Label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                const newDate = e.target.value
                // Only allow dates that match the selected day of week
                if (isDateMatchingDay(newDate, selectedDayOfWeek)) {
                  setSelectedDate(newDate)
                  setFormData({ ...formData, exam_date: newDate })
                } else {
                  toast.error(`Please select a date that falls on ${dayOptions.find(d => d.value === selectedDayOfWeek)?.label}`)
                }
              }}
              className="max-w-xs h-12 text-base font-medium"
            />
            <div className="ml-auto text-sm text-gray-600 font-medium bg-gray-100 px-4 py-2 rounded-lg">
              {formatDate(selectedDate)}
            </div>
          </div>
        </div>

        {/* Content Layout - Redesigned */}
        <div className="flex flex-col overflow-hidden">
          {/* Top: Add Form - Wide Rectangle */}
          <div className="border-b-2 bg-linear-to-br from-purple-50 to-white max-h-[45vh] overflow-y-auto">
            <div className="px-8 py-6">
              <div className="bg-purple-600 text-white p-4 rounded-xl mb-6 shadow-lg flex items-center gap-3">
                <Plus className="h-6 w-6" />
                <div>
                  <h3 className="text-lg font-bold">Add New Exam Schedule</h3>
                  <p className="text-xs opacity-90 mt-0.5">Fill in all exam details to create a new schedule</p>
                </div>
              </div>
              
              <div className="grid grid-cols-6 gap-4">
                {/* Class Type */}
                <div>
                  <Label className="text-sm font-semibold flex items-center gap-2 mb-2.5 text-gray-700">
                    <GraduationCap className="h-4 w-4" />
                    Class Type *
                  </Label>
                  <Select
                    value={formData.class_type}
                    onValueChange={(v) => handleClassTypeChange(v as 'SHS' | 'Tertiary')}
                  >
                    <SelectTrigger className="text-base h-12 font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Tertiary">Tertiary</SelectItem>
                      <SelectItem value="SHS">SHS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Exam Date */}
                <div>
                  <Label className="text-sm font-semibold flex items-center gap-2 mb-2.5 text-gray-700">
                    <Calendar className="h-4 w-4" />
                    Exam Date *
                  </Label>
                  <Input
                    type="date"
                    value={formData.exam_date}
                    onChange={(e) => setFormData({ ...formData, exam_date: e.target.value })}
                    className="text-base h-12 font-medium"
                  />
                </div>

                {/* Time Start */}
                <div>
                  <Label className="text-sm font-semibold flex items-center gap-2 mb-2.5 text-gray-700">
                    <Clock className="h-4 w-4" />
                    Time Start *
                  </Label>
                  <Input
                    type="time"
                    value={formData.time_start}
                    onChange={(e) => setFormData({ ...formData, time_start: e.target.value })}
                    className="text-base h-12 font-medium"
                  />
                </div>

                {/* Time End */}
                <div>
                  <Label className="text-sm font-semibold flex items-center gap-2 mb-2.5 text-gray-700">
                    <Clock className="h-4 w-4" />
                    Time End *
                  </Label>
                  <Input
                    type="time"
                    value={formData.time_end}
                    onChange={(e) => setFormData({ ...formData, time_end: e.target.value })}
                    className="text-base h-12 font-medium"
                  />
                </div>

                {/* Subject Name */}
                <div className="col-span-2">
                  <Label className="text-sm font-semibold flex items-center gap-2 mb-2.5 text-gray-700">
                    <FileText className="h-4 w-4" />
                    Subject Name *
                  </Label>
                  <Input
                    value={formData.subject_name}
                    onChange={(e) => setFormData({ ...formData, subject_name: e.target.value })}
                    className="text-base h-12"
                    placeholder="e.g., Computer Programming 1"
                  />
                </div>

                {/* Exam Type - Dynamic based on Class Type */}
                <div>
                  <Label className="text-sm font-semibold flex items-center gap-2 mb-2.5 text-gray-700">
                    <GraduationCap className="h-4 w-4" />
                    {formData.class_type === 'SHS' ? 'Quarter *' : 'Exam Type *'}
                  </Label>
                  <Select
                    value={formData.exam_type}
                    onValueChange={(v) => setFormData({ ...formData, exam_type: v })}
                  >
                    <SelectTrigger className="text-base h-12 font-medium">
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

                {/* Section */}
                <div>
                  <Label className="text-sm font-semibold flex items-center gap-2 mb-2.5 text-gray-700">
                    <Users className="h-4 w-4" />
                    Section *
                  </Label>
                  <Input
                    value={formData.section}
                    onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                    className="text-base h-12"
                    placeholder="e.g., BSCS301A"
                  />
                </div>

                {/* Room */}
                <div className="col-span-2">
                  <Label className="text-sm font-semibold flex items-center gap-2 mb-2.5 text-gray-700">
                    <MapPin className="h-4 w-4" />
                    Room *
                  </Label>
                  <Input
                    value={formData.room_code}
                    onChange={(e) => setFormData({ ...formData, room_code: e.target.value })}
                    className="text-base h-12"
                    placeholder="e.g., COMPL4 or Room 301"
                  />
                </div>

                {/* Action Buttons */}
                <div className="col-span-3 flex gap-3">
                  <Button
                    onClick={handleClear}
                    variant="outline"
                    className="flex-1 h-12 font-semibold text-base"
                    size="lg"
                  >
                    Clear Form
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={isLoading}
                    className="flex-1 h-12 bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-lg text-base"
                    size="lg"
                  >
                    <Save className="h-5 w-5 mr-2" />
                    {isLoading ? 'Saving...' : 'Save Exam'}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom: Exam List */}
          <div className="flex-1 p-8 overflow-y-auto bg-gray-50">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold flex items-center gap-3 text-gray-900">
                <GraduationCap className="h-6 w-6 text-purple-600" />
                All Scheduled Exams
                <Badge variant="secondary" className="ml-2 bg-purple-600 text-white text-base px-3 py-1">
                  {schedules.length} total {schedules.length === 1 ? 'exam' : 'exams'}
                </Badge>
              </h3>
            </div>
            
            {schedules.length === 0 ? (
              <div className="border-2 border-dashed rounded-xl p-16 text-center bg-white">
                <GraduationCap className="h-20 w-20 text-gray-300 mx-auto mb-4" />
                <p className="text-lg font-semibold text-gray-500 mb-2">No exams scheduled yet</p>
                <p className="text-sm text-gray-400">Use the form above to add a new exam schedule</p>
              </div>
            ) : (
              <div className="space-y-4">
                {dayOptions.map((day) => {
                  const daySchedules = schedulesByDay[day.value] || []
                  if (daySchedules.length === 0) return null
                  
                  const isExpanded = expandedDays.has(day.value)
                  
                  return (
                    <div key={day.value} className="bg-white rounded-xl border-2 overflow-hidden">
                      {/* Day Header - Clickable */}
                      <button
                        onClick={() => toggleDayExpansion(day.value)}
                        className={`w-full flex items-center justify-between p-4 ${day.color} hover:opacity-90 text-white transition-all`}
                      >
                        <div className="flex items-center gap-3">
                          <Calendar className="h-5 w-5" />
                          <span className="font-bold text-lg">{day.label}</span>
                          <Badge className="bg-white/20 text-white border-white/30">
                            {daySchedules.length} {daySchedules.length === 1 ? 'exam' : 'exams'}
                          </Badge>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5" />
                        ) : (
                          <ChevronDown className="h-5 w-5" />
                        )}
                      </button>
                      
                      {/* Day Exams - Collapsible */}
                      {isExpanded && (
                        <div className="p-4 grid grid-cols-1 gap-4">
                          {daySchedules.map((schedule, index) => (
                            <div
                              key={schedule.exam_schedule_id}
                              className="bg-gray-50 border-2 rounded-xl p-5 hover:shadow-lg transition-all group relative"
                            >
                              <div className="flex items-start gap-4">
                                <div className={`${day.color} text-white rounded-xl w-12 h-12 flex items-center justify-center text-lg font-bold shadow-md shrink-0`}>
                                  {index + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start gap-2 mb-3">
                                    <Badge className={schedule.class_type === 'SHS' ? 'bg-blue-600 text-white font-semibold' : 'bg-purple-600 text-white font-semibold'}>
                                      {schedule.class_type || 'Tertiary'}
                                    </Badge>
                                    <Badge className="bg-pink-600 text-white font-semibold">
                                      {schedule.exam_type || "Midterm"}
                                    </Badge>
                                    <Badge variant="outline" className="text-xs">
                                      {formatDate(schedule.exam_date)}
                                    </Badge>
                                  </div>
                                  <h4 className="text-lg font-bold text-gray-900 mb-3 leading-tight">{schedule.subject_name}</h4>
                                  <div className="grid grid-cols-3 gap-3 text-sm">
                                    <div className="flex items-center gap-2 text-gray-600">
                                      <Clock className="h-4 w-4 text-gray-400" />
                                      <div>
                                        <div className="font-semibold text-gray-900">{schedule.time_start}</div>
                                        <div className="text-xs text-gray-500">to {schedule.time_end}</div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-600">
                                      <Users className="h-4 w-4 text-gray-400" />
                                      <div>
                                        <div className="font-semibold text-gray-900">{schedule.section}</div>
                                        <div className="text-xs text-gray-500">Section</div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-600">
                                      <MapPin className="h-4 w-4 text-gray-400" />
                                      <div>
                                        <div className="font-semibold text-gray-900">{schedule.room_code}</div>
                                        <div className="text-xs text-gray-500">Room</div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => openDeleteDialog(schedule)}
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50 h-10 w-10 opacity-0 group-hover:opacity-100 transition-opacity absolute top-3 right-3"
                                >
                                  <Trash2 className="h-5 w-5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Delete Exam Schedule
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2">
              <p>Are you sure you want to delete this exam schedule?</p>
              {scheduleToDelete && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600">Subject:</span>
                    <span className="font-medium text-right">{scheduleToDelete.subject_name || "Untitled"}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600">Exam Date:</span>
                    <span className="font-medium text-right">{formatDate(scheduleToDelete.exam_date)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600">Time:</span>
                    <span className="font-medium text-right">{scheduleToDelete.time_start} - {scheduleToDelete.time_end}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600">Room:</span>
                    <span className="font-medium text-right">{scheduleToDelete.room_code || "TBA"}</span>
                  </div>
                </div>
              )}
              <p className="font-medium text-red-600">This action cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setScheduleToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
