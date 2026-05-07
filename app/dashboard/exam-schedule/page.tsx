"use client"

import { useState, useEffect, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Label } from "@/components/ui/label"
import { FileText, Search, Calendar, Clock, MapPin, Users as UsersIcon, Plus, X, Edit, Trash2, ChevronDown, ChevronUp, Grid3x3, List, AlertCircle, CheckCircle2 } from "lucide-react"
import { getTeachingEmployees, getExamSchedulesForEmployee, deleteExamSchedule, upsertExamSchedule } from "@/lib/exam-schedule-api"
import { AddExamModal, type ExamScheduleData } from "@/app/dashboard/employees/AddExamModal"
import { ExamScheduleTableView } from "@/components/exam-schedule-table-view"
import { cn } from "@/lib/utils"
import { getCurrentAcademicTerm } from "@/lib/academic-term-utils"
import { toManilaDate } from "@/lib/timezone-utils"
import { useToast } from "@/hooks/use-toast"
import type { AcademicTerm, Employee } from "@/lib/types/database.types"
import { getSchedulesForEmployees, groupSchedulesByEmployee } from "@/lib/employee-schedules-bulk"

export default function ExamSchedulePage() {
  const { toast } = useToast()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [employeeSchedules, setEmployeeSchedules] = useState<Record<number, any[]>>({})
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Partial<ExamScheduleData> | null>(null)
  const [viewSchedules, setViewSchedules] = useState<any[]>([])
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)
  const [isTableViewOpen, setIsTableViewOpen] = useState(false)
  const [loadingView, setLoadingView] = useState(false)
  const [currentAcademicTerm, setCurrentAcademicTerm] = useState<AcademicTerm | null>(null)
  const [expandedSchedules, setExpandedSchedules] = useState<Set<number>>(new Set())
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedDepartment, setSelectedDepartment] = useState("all")
  const [selectedEmploymentStatus, setSelectedEmploymentStatus] = useState("all")
  const [showPastExams, setShowPastExams] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [scheduleToDelete, setScheduleToDelete] = useState<any>(null)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [feedbackDialogType, setFeedbackDialogType] = useState<'error' | 'success' | 'warning'>('error')
  const [errorDialogTitle, setErrorDialogTitle] = useState('')
  const [errorDialogMessage, setErrorDialogMessage] = useState('')

  const getManilaTodayYmd = () => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date())

    const year = parts.find((p) => p.type === 'year')?.value || '1970'
    const month = parts.find((p) => p.type === 'month')?.value || '01'
    const day = parts.find((p) => p.type === 'day')?.value || '01'
    return `${year}-${month}-${day}`
  }

  const getNormalizedExamDate = (value: unknown): string | null => {
    const raw = String(value || '').trim()
    if (!raw) return null
    return toManilaDate(raw)
  }

  const isFutureOrTodayExamSchedule = (schedule: any): boolean => {
    const examDate = getNormalizedExamDate(schedule?.exam_date)
    if (!examDate) return true
    return examDate >= getManilaTodayYmd()
  }

  const filterActiveExamSchedules = (schedules: any[]): any[] => {
    return (schedules || []).filter((schedule) => isFutureOrTodayExamSchedule(schedule))
  }

  const visibleViewSchedules = useMemo(
    () => (showPastExams ? viewSchedules : filterActiveExamSchedules(viewSchedules)),
    [showPastExams, viewSchedules]
  )

  const showFeedbackDialog = (type: 'error' | 'success' | 'warning', title: string, message: string) => {
    setFeedbackDialogType(type)
    setErrorDialogTitle(title)
    setErrorDialogMessage(message)
    setErrorDialogOpen(true)
  }

  const showErrorDialog = (title: string, message: string) => {
    toast({
      title,
      description: message,
      variant: 'destructive',
    })
  }

  const feedbackDialogMeta = {
    titleFallback:
      feedbackDialogType === 'success'
        ? 'Success'
        : feedbackDialogType === 'warning'
          ? 'Please Review'
          : 'Action Failed',
    titleClass:
      feedbackDialogType === 'success'
        ? 'text-emerald-400'
        : feedbackDialogType === 'warning'
          ? 'text-amber-400'
          : 'text-red-400',
    iconWrapClass:
      feedbackDialogType === 'success'
        ? 'bg-emerald-500/15 ring-emerald-500/30'
        : feedbackDialogType === 'warning'
          ? 'bg-amber-500/15 ring-amber-500/30'
          : 'bg-red-500/15 ring-red-500/30',
    actionClass:
      feedbackDialogType === 'success'
        ? 'bg-emerald-600 hover:bg-emerald-700'
        : feedbackDialogType === 'warning'
          ? 'bg-amber-600 hover:bg-amber-700'
          : 'bg-red-600 hover:bg-red-700',
    actionLabel:
      feedbackDialogType === 'success'
        ? 'Great'
        : feedbackDialogType === 'warning'
          ? 'Review'
          : 'Okay',
  }

  // Helper function to convert term name to term format
  const getTermParam = (term: AcademicTerm | null = currentAcademicTerm): '1st_term' | '2nd_term' | 'summer' => {
    if (!term) return '1st_term'
    const normalized = String(term.term_name || '').trim().toLowerCase()
    if (normalized.includes('2nd') || normalized.includes('second')) return '2nd_term'
    if (normalized.includes('summer')) return 'summer'
    return '1st_term'
  }

  useEffect(() => {
    loadEmployees()
  }, [])

  const loadEmployees = async () => {
    try {
      setLoading(true)

      // Fetch current active academic term
      const activeTerm = await getCurrentAcademicTerm()
      setCurrentAcademicTerm(activeTerm)

      if (!activeTerm) {
        showErrorDialog(
          'No Active Academic Term',
          'Please set an active academic term in Academic Terms management before managing exam schedules.'
        )
        setLoading(false)
        return
      }

      // Convert term name to term format (e.g., "2nd Term" -> "2nd_term")
      const termParam = getTermParam(activeTerm)

      const teachingStaff = await getTeachingEmployees()
      setEmployees(teachingStaff)

      const employeeIds = teachingStaff.map((emp) => emp.employee_id)
      const { exam } = await getSchedulesForEmployees(employeeIds, termParam)
      const schedulesMap = groupSchedulesByEmployee(exam)
      setEmployeeSchedules(schedulesMap)
    } catch (error) {
      console.error("Error loading employees:", error)
      showErrorDialog('Unable to Load Schedules', 'Failed to load employees and exam schedules. Please refresh and try again.')
    } finally {
      setLoading(false)
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const getEmployeeAvatarUrl = (employee: Employee) => {
    // Use local-safe image sources only (CSP blocks external remote URLs in offline mode).
    const localPhoto = (employee as any).photo_url || employee.photo_path
    if (typeof localPhoto === 'string' && localPhoto.trim()) {
      if (localPhoto.startsWith('/')) return localPhoto
      if (!/^https?:\/\//i.test(localPhoto)) return `/${localPhoto.replace(/^\/+/, '')}`
    }

    if (employee.employee_id) {
      return `/api/photos/employee/${employee.employee_id}`
    }

    const rfid = employee.rfid_code
    if (!rfid) return null
    return `/photoprofile/${rfid}.jpg`
  }

  const getDayColor = (day: string) => {
    const colors: Record<string, string> = {
      Monday: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700",
      Tuesday: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700",
      Wednesday: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700",
      Thursday: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700",
      Friday: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700",
      Saturday: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700",
    }
    return colors[day] || "bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300"
  }

  const normalizeDayOfWeek = (value: unknown): number | null => {
    if (value === null || value === undefined) return null

    const direct = Number(value)
    if (Number.isFinite(direct) && direct >= 1 && direct <= 6) return direct

    const text = String(value).trim().toLowerCase()
    const map: Record<string, number> = {
      monday: 1,
      mon: 1,
      tuesday: 2,
      tue: 2,
      tues: 2,
      wednesday: 3,
      wed: 3,
      thursday: 4,
      thu: 4,
      thur: 4,
      thurs: 4,
      friday: 5,
      fri: 5,
      saturday: 6,
      sat: 6,
    }

    return map[text] || null
  }

  const scheduleCountsByEmployeeDay = useMemo(() => {
    return Object.entries(employeeSchedules).reduce<Record<number, Record<number, number>>>((acc, [employeeId, schedules]) => {
      const relevantSchedules = showPastExams ? (schedules || []) : filterActiveExamSchedules(schedules || [])
      const counts: Record<number, number> = {}

      for (const schedule of relevantSchedules) {
        const dayNumber = normalizeDayOfWeek(schedule?.day_of_week)

        if (dayNumber) {
          counts[dayNumber] = (counts[dayNumber] || 0) + 1
        }
      }

      acc[Number(employeeId)] = counts
      return acc
    }, {})
  }, [employeeSchedules, showPastExams])

  const getScheduleCountForDay = (employeeId: number, day: string) => {
    const dayMap: Record<string, number> = {
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    }
    return scheduleCountsByEmployeeDay[employeeId]?.[dayMap[day]] || 0
  }

  const formatTimeForDisplay = (time?: string) => {
    if (!time) return ''
    if (time.includes('AM') || time.includes('PM')) return time

    const [hours, minutes] = time.split(':').map(Number)
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return time

    const period = hours >= 12 ? 'PM' : 'AM'
    const hour12 = hours % 12 || 12
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`
  }

  const formatExamDateForDisplay = (value?: string) => {
    if (!value) return ''
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
    })
  }

  const departmentOptions = useMemo(
    () => Array.from(new Set(employees.map((emp) => emp.department).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [employees]
  )
  const employmentStatusOptions = useMemo(
    () => Array.from(new Set(employees.map((emp) => emp.employment_status).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [employees]
  )

  const filteredEmployees = useMemo(() => employees.filter((emp) => {
    const query = searchQuery.toLowerCase().trim()
    const matchesSearch =
      emp.full_name.toLowerCase().includes(query) ||
      emp.school_id.toLowerCase().includes(query) ||
      emp.department.toLowerCase().includes(query)
    if (!matchesSearch) return false

    if (selectedDepartment !== 'all' && (emp.department || '') !== selectedDepartment) return false
    if (selectedEmploymentStatus !== 'all' && (emp.employment_status || '') !== selectedEmploymentStatus) return false

    return true
  }), [employees, searchQuery, selectedDepartment, selectedEmploymentStatus])

  const hasActiveFilters = selectedDepartment !== 'all' || selectedEmploymentStatus !== 'all'

  // Group employees by department for list view
  const employeesByDepartment = useMemo(() => filteredEmployees.reduce((acc, emp) => {
    const dept = emp.department || 'No Department'
    if (!acc[dept]) {
      acc[dept] = []
    }
    acc[dept].push(emp)
    return acc
  }, {} as Record<string, Employee[]>), [filteredEmployees])

  const handleViewEmployee = async (employee: Employee) => {
    setSelectedEmployee(employee)
    setIsTableViewOpen(true)
  }

  const handleViewEmployeeDetailed = async (employee: Employee) => {
    setSelectedEmployee(employee)
    setIsViewDialogOpen(true)
    setLoadingView(true)
    try {
      const schedules = await getExamSchedulesForEmployee(employee.employee_id, getTermParam())
      setViewSchedules(schedules || [])
    } catch (error) {
      console.error("Error loading exam schedules:", error)
      showErrorDialog('Unable to Load Exam Schedules', 'Failed to load exam schedules for this employee.')
    } finally {
      setLoadingView(false)
    }
  }

  const handleAddSchedule = (dayOfWeek?: number) => {
    if (dayOfWeek) {
      setEditingSchedule({ day_of_week: dayOfWeek as 1 | 2 | 3 | 4 | 5 | 6 })
    } else {
      setEditingSchedule(null)
    }
    setIsAddModalOpen(true)
  }

  const handleEditSchedule = (schedule: any) => {
    setEditingSchedule({
      subject: schedule.subject_name || schedule.subject,
      section: schedule.section,
      room: schedule.room_code || schedule.room,
      day_of_week: schedule.day_of_week,
      time_start: schedule.time_start,
      time_end: schedule.time_end,
      class_type: schedule.class_type,
      type: schedule.exam_type || schedule.type,
      exam_date: schedule.exam_date ? new Date(schedule.exam_date) : undefined,
      exam_schedule_id: schedule.exam_schedule_id || schedule.id, // Pass the ID for edit mode + conflict skip
    } as any)
    setIsAddModalOpen(true)
  }


  const handleDeleteSchedule = async (scheduleId: number) => {
    try {
      await deleteExamSchedule(scheduleId)

      // Refresh view schedules
      if (selectedEmployee) {
        const updatedSchedules = await getExamSchedulesForEmployee(selectedEmployee.employee_id, getTermParam())
        setViewSchedules(updatedSchedules || [])

        // Also update the employeeSchedules map
        setEmployeeSchedules(prev => ({
          ...prev,
          [selectedEmployee.employee_id]: updatedSchedules || []
        }))
      }

      showFeedbackDialog('success', 'Schedule Deleted', 'Exam schedule deleted successfully.')
    } catch (error) {
      console.error("Error deleting exam schedule:", error)
      showErrorDialog('Delete Failed', 'Failed to delete exam schedule. Please try again.')
    }
  }

  const openDeleteDialog = (schedule: any) => {
    setScheduleToDelete(schedule)
    setDeleteDialogOpen(true)
  }

  const confirmDeleteSchedule = async () => {
    if (!scheduleToDelete) return
    const scheduleId = scheduleToDelete.id || scheduleToDelete.exam_schedule_id || scheduleToDelete.schedule_id
    if (!scheduleId) {
      showErrorDialog('Delete Failed', 'Unable to delete schedule because the schedule ID is missing.')
      setDeleteDialogOpen(false)
      setScheduleToDelete(null)
      return
    }

    await handleDeleteSchedule(scheduleId)
    setDeleteDialogOpen(false)
    setScheduleToDelete(null)
  }

  const handleSaveSchedule = async (data: ExamScheduleData) => {
    if (!selectedEmployee) {
      const err = new Error('No employee selected')
      showErrorDialog('No Employee Selected', err.message)
      throw err
    }

    try {

      // Calculate day_of_week from exam_date
      const examDate = data.exam_date ? new Date(data.exam_date) : new Date()
      const jsDay = examDate.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      const day_of_week = jsDay === 0 ? 7 : jsDay // Convert: Sunday (0) -> 7, others stay same

      // Convert 12-hour time format to 24-hour format for database
      const convertToDatabaseTime = (timeString: string): string => {
        if (!timeString) return ''

        // Handle formats like "8:30 AM", "10:00 AM", "1:00 PM"
        const match = timeString.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
        if (!match) return timeString

        let hours = parseInt(match[1])
        const minutes = match[2]
        const ampm = match[3].toUpperCase()

        // Convert to 24-hour format
        if (ampm === 'AM' && hours === 12) {
          hours = 0
        } else if (ampm === 'PM' && hours !== 12) {
          hours += 12
        }

        return `${hours.toString().padStart(2, '0')}:${minutes}:00`
      }

      const scheduleData = {
        // Critical for edit mode: keep update identity so backend updates instead of creating a new row.
        exam_schedule_id: data.exam_schedule_id ?? ((editingSchedule as any)?.exam_schedule_id || (editingSchedule as any)?.id),
        employee_id: selectedEmployee.employee_id,
        day_of_week: day_of_week,
        time_start: convertToDatabaseTime(data.time_start),
        time_end: convertToDatabaseTime(data.time_end),
        course_code: data.subject.substring(0, 8).toUpperCase() || 'COURSE',
        subject_name: data.subject.trim(),
        section: data.section.trim().length >= 2 ? data.section.trim().toUpperCase() : undefined,
        room_code: data.room.trim().toUpperCase(),
        exam_date: data.exam_date
          ? `${data.exam_date.getFullYear()}-${String(data.exam_date.getMonth() + 1).padStart(2, '0')}-${String(data.exam_date.getDate()).padStart(2, '0')}`
          : null,
        term: getTermParam(),
        class_type: data.class_type || 'Tertiary',
        exam_type: data.type || (data.class_type === 'SHS' ? '1st Quarter' : 'Prelim'),
        status: 'available'
      }

      await upsertExamSchedule(scheduleData as any)

      showFeedbackDialog('success', 'Schedule Saved', 'Exam schedule added successfully.')

      // Reload schedules after save
      const schedules = await getExamSchedulesForEmployee(selectedEmployee.employee_id, getTermParam())
      setViewSchedules(schedules || [])
      setEmployeeSchedules(prev => ({
        ...prev,
        [selectedEmployee.employee_id]: schedules || []
      }))

      // Don't close modal - let user add more schedules
      // setIsAddModalOpen(false)
    } catch (error: any) {
      console.error('[ExamSchedulePage] Error saving schedule:', error)
      throw error // Re-throw so modal knows it failed
    }
  }

  const toggleScheduleExpansion = (employeeId: number) => {
    setExpandedSchedules(prev => {
      const newSet = new Set(prev)
      if (newSet.has(employeeId)) {
        newSet.delete(employeeId)
      } else {
        newSet.add(employeeId)
      }
      return newSet
    })
  }

  return (
    <div className="h-full flex flex-col bg-linear-to-br from-gray-50 via-purple-50/30 to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                <div className="p-3 bg-linear-to-br from-purple-500 to-pink-600 rounded-xl shadow-lg">
                  <FileText className="h-7 w-7 text-white" />
                </div>
                Exam Schedule Management
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Manage exam proctoring schedules for all faculty members
              </p>
            </div>
            {/* Active Term Badge (match Class Schedule design) */}
            {currentAcademicTerm && (
              <div className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-900/20 border-2 border-green-500 rounded-lg">
                <Calendar className="h-5 w-5 text-green-600 dark:text-green-400" />
                <div>
                  <p className="text-xs text-green-600 dark:text-green-400 font-medium">Active Term</p>
                  <p className="text-sm font-bold text-green-700 dark:text-green-300">
                    {currentAcademicTerm.academic_year} - {currentAcademicTerm.term_name}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Search Bar and View Toggle */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[260px] max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, ID, or department..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
              />
            </div>

            <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
              <SelectTrigger className="w-[220px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departmentOptions.map((dept) => (
                  <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedEmploymentStatus} onValueChange={setSelectedEmploymentStatus}>
              <SelectTrigger className="w-[200px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {employmentStatusOptions.map((status) => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={showPastExams ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowPastExams((prev) => !prev)}
              className={cn("h-9", showPastExams && "bg-purple-600 hover:bg-purple-700 text-white")}
            >
              <AlertCircle className="h-4 w-4 mr-1" />
              {showPastExams ? 'Hide Past Exams' : 'Show Past Exams'}
            </Button>

            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedDepartment('all')
                  setSelectedEmploymentStatus('all')
                }}
                className="h-9"
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}

            {/* View Toggle */}
            <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg p-1">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className={cn(
                  "h-9 px-3",
                  viewMode === 'grid' && "bg-purple-600 hover:bg-purple-700 text-white"
                )}
              >
                <Grid3x3 className="h-4 w-4 mr-2" />
                Grid
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className={cn(
                  "h-9 px-3",
                  viewMode === 'list' && "bg-purple-600 hover:bg-purple-700 text-white"
                )}
              >
                <List className="h-4 w-4 mr-2" />
                List
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-purple-600 border-r-transparent"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">Loading employees...</p>
            </div>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <Card className="p-12 text-center">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No Teaching Staff Found
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {searchQuery || hasActiveFilters ? "Try adjusting your search/filter criteria" : "No teaching staff members available"}
            </p>
          </Card>
        ) : viewMode === 'list' ? (
          /* LIST VIEW - Grouped by Department */
          <div className="space-y-6">
            {Object.entries(employeesByDepartment).sort(([a], [b]) => a.localeCompare(b)).map(([department, deptEmployees]) => (
              <div key={department} className="space-y-3">
                {/* Department Header */}
                <div className="flex items-center gap-3 px-4 py-2 bg-purple-50 dark:bg-purple-950/30 border-l-4 border-purple-500 rounded-r-lg">
                  <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  <h3 className="font-bold text-lg text-purple-900 dark:text-purple-100">{department}</h3>
                  <Badge variant="secondary" className="ml-auto bg-purple-600 text-white">
                    {deptEmployees.length} {deptEmployees.length === 1 ? 'Faculty' : 'Faculty'}
                  </Badge>
                </div>

                {/* Department Employees - Compact List */}
                <div className="space-y-2">
                  {deptEmployees.map((employee) => {
                    const schedules = showPastExams
                      ? (employeeSchedules[employee.employee_id] || [])
                      : filterActiveExamSchedules(employeeSchedules[employee.employee_id] || [])
                    const totalExams = schedules.length

                    return (
                      <Card
                        key={employee.employee_id}
                        className="p-3 hover:shadow-lg hover:border-purple-400 dark:hover:border-purple-600 cursor-pointer transition-all duration-200 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
                        onClick={() => handleViewEmployee(employee)}
                      >
                        <div className="flex items-center gap-4">
                          {/* Avatar - Smaller */}
                          <Avatar className="w-12 h-12 ring-2 ring-purple-500/20 shrink-0">
                            <AvatarImage
                              src={getEmployeeAvatarUrl(employee) || ''}
                              alt={employee.full_name}
                            />
                            <AvatarFallback className="bg-linear-to-br from-purple-500 to-pink-600 text-white text-sm font-bold">
                              {getInitials(employee.full_name)}
                            </AvatarFallback>
                          </Avatar>

                          {/* Employee Info - Compact */}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-base text-gray-900 dark:text-white truncate">
                              {employee.full_name}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-gray-600 dark:text-gray-400">{employee.school_id}</span>
                              {employee.employment_status && (
                                <Badge variant="outline" className="text-xs h-5">
                                  {employee.employment_status}
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Quick Stats - Horizontal */}
                          <div className="flex items-center gap-4 shrink-0">
                            {/* Total Exams */}
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Exams</span>
                              <span className="text-lg font-bold text-purple-600 dark:text-purple-400">{totalExams}</span>
                            </div>

                            {/* Expand Button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleScheduleExpansion(employee.employee_id)
                              }}
                              className="h-8 w-8 p-0 hover:bg-purple-100 dark:hover:bg-purple-900/30"
                            >
                              {expandedSchedules.has(employee.employee_id) ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>

                        {/* Expandable Schedule Details */}
                        {expandedSchedules.has(employee.employee_id) && (
                          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                            <div className="grid grid-cols-6 gap-2">
                              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => {
                                const count = getScheduleCountForDay(employee.employee_id, day)
                                return (
                                  <div key={day} className={`flex flex-col items-center justify-center p-2 rounded-lg border ${getDayColor(day)}`}>
                                    <span className="text-xs font-medium">{day.substring(0, 3)}</span>
                                    <span className="text-sm font-bold mt-1">{count}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </Card>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* GRID VIEW - Original Layout */
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredEmployees.map((employee) => {
              const schedules = showPastExams
                ? (employeeSchedules[employee.employee_id] || [])
                : filterActiveExamSchedules(employeeSchedules[employee.employee_id] || [])
              const totalExams = schedules.length

              return (
                <Card
                  key={employee.employee_id}
                  className="p-6 cursor-pointer border-2 hover:shadow-xl hover:border-purple-400 dark:hover:border-purple-600 transition-all duration-200 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"
                  onClick={() => handleViewEmployee(employee)}
                >
                  {/* Employee Header */}
                  <div className="flex items-start gap-4 mb-4">
                    <Avatar className="w-16 h-16 ring-2 ring-purple-500/20">
                      <AvatarImage
                        src={getEmployeeAvatarUrl(employee) || ''}
                        alt={employee.full_name}
                      />
                      <AvatarFallback className="bg-linear-to-br from-purple-500 to-pink-600 text-white text-lg font-bold">
                        {getInitials(employee.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                        {employee.full_name}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                        {employee.school_id}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {employee.department}
                        </Badge>
                        {employee.employment_status && (
                          <Badge
                            variant="secondary"
                            className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700"
                          >
                            {employee.employment_status}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Total Exams Badge */}
                  <div className="mb-4 p-3 bg-linear-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Exams</span>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">{totalExams}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleScheduleExpansion(employee.employee_id)
                          }}
                          className="h-8 w-8 p-0 hover:bg-purple-100 dark:hover:bg-purple-900/30"
                          title={expandedSchedules.has(employee.employee_id) ? "Collapse schedule" : "Expand schedule"}
                        >
                          {expandedSchedules.has(employee.employee_id) ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Weekly Schedule Grid - Collapsible */}
                  {expandedSchedules.has(employee.employee_id) && (
                    <div className="space-y-2">
                      {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => {
                        const count = getScheduleCountForDay(employee.employee_id, day)
                        return (
                          <div key={day} className={`flex items-center justify-between p-2 rounded-lg border ${getDayColor(day)}`}>
                            <span className="text-sm font-medium">{day}</span>
                            <span className="text-sm font-bold">{count} {count === 1 ? 'Exam' : 'Exams'}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* View Employee Schedule Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen} modal>
        <DialogContent
          className="sm:max-w-[1000px] max-h-[90vh] p-0 overflow-hidden rounded-2xl shadow-2xl [&>button]:hidden"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="bg-linear-to-r from-purple-600 via-pink-600 to-purple-600 px-6 py-5 text-white">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-2xl font-bold">
                    {selectedEmployee?.full_name}
                  </DialogTitle>
                  <p className="text-purple-100 text-sm mt-1">
                    {selectedEmployee?.department} • {selectedEmployee?.school_id}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsViewDialogOpen(false)}
                  className="text-white hover:bg-white/20 rounded-full"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </DialogHeader>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Add Schedule Button */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-neutral-700">
              <Button
                onClick={handleAddSchedule}
                className="w-full bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add New Exam Schedule
              </Button>
            </div>

            {/* Schedules List - Weekly View */}
            <ScrollArea className="flex-1 p-6">
              {loadingView ? (
                <div className="flex items-center justify-center py-12">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-purple-600 border-r-transparent"></div>
                </div>
              ) : visibleViewSchedules.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400 font-semibold">No exam schedules yet</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Click the button above to add a schedule</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Weekly Overview */}
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => {
                    const daySchedules = visibleViewSchedules.filter((s: any) => s.day_of_week === day)
                    const dayColor = getDayColor(day)

                    if (daySchedules.length === 0) return null

                    return (
                      <div key={day} className="space-y-3">
                        {/* Day Header */}
                        <div className={cn(
                          "flex items-center gap-3 px-4 py-2 rounded-lg border-2",
                          dayColor
                        )}>
                          <Calendar className="h-5 w-5" />
                          <h3 className="font-bold text-lg">{day}</h3>
                          <span className="ml-auto text-sm font-semibold">
                            {daySchedules.length} {daySchedules.length === 1 ? 'Exam' : 'Exams'}
                          </span>
                        </div>

                        {/* Day's Exams */}
                        <div className="grid gap-3 ml-8">
                          {daySchedules.map((schedule: any, index: number) => (
                            <Card key={index} className="p-4 border-2 hover:shadow-lg hover:border-purple-400 dark:hover:border-purple-600 transition-all">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 space-y-3">
                                  {/* Badges Row */}
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge className={schedule.class_type === 'SHS' ? 'bg-blue-600' : 'bg-purple-600'}>
                                      {schedule.class_type || 'Tertiary'}
                                    </Badge>
                                    <Badge className="bg-pink-600">
                                      {schedule.exam_type || schedule.type || 'Midterm'}
                                    </Badge>
                                  </div>

                                  {/* Subject Name */}
                                  <h4 className="font-bold text-lg text-gray-900 dark:text-white">
                                    {schedule.subject_name || schedule.subject}
                                  </h4>

                                  {/* Details Grid */}
                                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                      <Clock className="h-4 w-4 text-purple-500" />
                                      <span className="font-semibold">{schedule.time_start} - {schedule.time_end}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                      <MapPin className="h-4 w-4 text-red-500" />
                                      <span className="font-semibold">{schedule.room_code || schedule.room}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                      <UsersIcon className="h-4 w-4 text-blue-500" />
                                      <span className="font-semibold">{schedule.section}</span>
                                    </div>
                                    {schedule.exam_date && (
                                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                        <Calendar className="h-4 w-4 text-green-500" />
                                        <span className="font-semibold">
                                          {new Date(schedule.exam_date).toLocaleDateString()}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex flex-col gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleEditSchedule(schedule)}
                                    className="hover:bg-purple-50 dark:hover:bg-purple-900/20 border-purple-300"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openDeleteDialog(schedule)}
                                    className="hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 border-red-300"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )
                  })}

                  {/* Summary Stats */}
                  <div className="mt-8 grid grid-cols-3 gap-4">
                    <Card className="p-4 bg-linear-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border-2 border-purple-200 dark:border-purple-800">
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Exams</p>
                      <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{visibleViewSchedules.length}</p>
                    </Card>
                    <Card className="p-4 bg-linear-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 border-2 border-blue-200 dark:border-blue-800">
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">SHS Exams</p>
                      <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                        {visibleViewSchedules.filter((s: any) => s.class_type === 'SHS').length}
                      </p>
                    </Card>
                    <Card className="p-4 bg-linear-to-br from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 border-2 border-purple-200 dark:border-purple-800">
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Tertiary Exams</p>
                      <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                        {visibleViewSchedules.filter((s: any) => s.class_type === 'Tertiary' || !s.class_type).length}
                      </p>
                    </Card>
                  </div>
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Exam Modal */}
      {selectedEmployee && (
        <AddExamModal
          open={isAddModalOpen}
          onOpenChange={(open) => {
            setIsAddModalOpen(open)
            if (!open) {
              setEditingSchedule(null)
            }
          }}
          onSubmit={handleSaveSchedule}
          initialData={editingSchedule || undefined}
          employeeName={selectedEmployee.full_name}
          employeeId={selectedEmployee.employee_id}
        />
      )}

      {/* Weekly Table View */}
      {selectedEmployee && (
        <ExamScheduleTableView
          open={isTableViewOpen}
          onOpenChange={setIsTableViewOpen}
          employeeId={selectedEmployee.employee_id}
          employeeName={selectedEmployee.full_name}
          employeeDepartment={selectedEmployee.department}
          showPastExams={showPastExams}
          onAddSchedule={(dayOfWeek) => {
            setIsTableViewOpen(false)
            handleAddSchedule(dayOfWeek)
          }}
          onEditSchedule={(schedule) => {
            setEditingSchedule({
              subject: schedule.subject_name || schedule.subject,
              section: schedule.section,
              room: schedule.room_code || schedule.room,
              day_of_week: schedule.day_of_week,
              time_start: schedule.time_start,
              time_end: schedule.time_end,
              class_type: schedule.class_type,
              type: schedule.exam_type || schedule.type,
              exam_date: schedule.exam_date ? new Date(schedule.exam_date) : undefined,
              exam_schedule_id: schedule.exam_schedule_id || schedule.id,
            } as any)
            setIsTableViewOpen(false)
            setIsAddModalOpen(true)
          }}
        />
      )}

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
                <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600 dark:text-gray-400">Subject:</span>
                    <span className="font-medium text-right">{scheduleToDelete.subject_name || scheduleToDelete.subject || 'Untitled'}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600 dark:text-gray-400">Time:</span>
                    <span className="font-medium text-right">{formatTimeForDisplay(scheduleToDelete.time_start)} - {formatTimeForDisplay(scheduleToDelete.time_end)}</span>
                  </div>
                  {scheduleToDelete.exam_date && (
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600 dark:text-gray-400">Exam Date:</span>
                      <span className="font-medium text-right">{formatExamDateForDisplay(scheduleToDelete.exam_date)}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600 dark:text-gray-400">Room:</span>
                    <span className="font-medium text-right">{scheduleToDelete.room_code || scheduleToDelete.room || 'TBA'}</span>
                  </div>
                </div>
              )}
              <p className="font-medium text-red-600 dark:text-red-400">This action cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setScheduleToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteSchedule}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <AlertDialogContent className="max-w-md border-0 bg-linear-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className={cn("flex items-center gap-3", feedbackDialogMeta.titleClass)}>
              <span className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1",
                feedbackDialogMeta.iconWrapClass
              )}>
                {feedbackDialogType === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
              </span>
              {errorDialogTitle || feedbackDialogMeta.titleFallback}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300 pt-1 leading-relaxed">
              {errorDialogMessage || 'Something went wrong. Please try again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className={cn("text-white", feedbackDialogMeta.actionClass)}>
              {feedbackDialogMeta.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
