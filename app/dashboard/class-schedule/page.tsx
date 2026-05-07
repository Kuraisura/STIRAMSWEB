"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Label } from "@/components/ui/label"
import { BookOpen, Search, Calendar, Clock, MapPin, Users as UsersIcon, Plus, X, Edit, Trash2, UserCheck, ChevronDown, ChevronUp, Grid3x3, List, AlertTriangle, CheckCircle2 } from "lucide-react"
import { getEmployees, getTeachingSchedulesForEmployee } from "@/lib/offline-dashboard-client"
import { AddClassModal, type ClassScheduleData } from "@/app/dashboard/employees/AddClassModal"
import { cn } from "@/lib/utils"
import { ClassScheduleTableView } from "@/components/class-schedule-table-view"
import { getCurrentAcademicTerm } from "@/lib/academic-term-utils"
import { useToast } from "@/hooks/use-toast"
import type { AcademicTerm, Employee } from "@/lib/types/database.types"
import { getSchedulesForEmployees, groupSchedulesByEmployee } from "@/lib/employee-schedules-bulk"

export default function ClassSchedulePage() {
  const router = useRouter()
  const { toast } = useToast()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [employeeSchedules, setEmployeeSchedules] = useState<Record<number, any[]>>({})
  const [viewSchedules, setViewSchedules] = useState<any[]>([])
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Partial<ClassScheduleData> | null>(null)
  const [loadingView, setLoadingView] = useState(false)
  const [isTableViewOpen, setIsTableViewOpen] = useState(false)
  const [currentAcademicTerm, setCurrentAcademicTerm] = useState<AcademicTerm | null>(null)
  const [expandedSchedules, setExpandedSchedules] = useState<Set<number>>(new Set())
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedDepartment, setSelectedDepartment] = useState("all")
  const [selectedEmploymentStatus, setSelectedEmploymentStatus] = useState("all")
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [feedbackDialogType, setFeedbackDialogType] = useState<'error' | 'success' | 'warning'>('error')
  const [errorDialogTitle, setErrorDialogTitle] = useState('')
  const [errorDialogMessage, setErrorDialogMessage] = useState('')
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
    if (term.term_name === '2nd Term') return '2nd_term'
    if (term.term_name === 'Summer') return 'summer'
    return '1st_term' // Default to 1st_term for '1st Term'
  }

  useEffect(() => {
    loadAcademicTermAndEmployees()
  }, [])

  const loadAcademicTermAndEmployees = async () => {
    try {
      setLoading(true)
      
      // Fetch current active academic term
      const activeTerm = await getCurrentAcademicTerm()
      setCurrentAcademicTerm(activeTerm)
      
      if (!activeTerm) {
        showErrorDialog(
          'No Active Academic Term',
          'Please set an active academic term in Academic Terms management before managing class schedules.'
        )
        setLoading(false)
        return
      }
      
      // Convert term name to term format (e.g., "1st Term" -> "1st_term")
      const termParam = getTermParam(activeTerm)
      
      const data = await getEmployees()
      // Filter to only Teaching staff and active employees
      const teachingStaff = data.filter((emp: any) => 
        emp.staff_type === "Teaching" && emp.is_active !== false
      )
      setEmployees(teachingStaff)
      
      const employeeIds = teachingStaff.map((emp: any) => emp.employee_id)
      const { teaching } = await getSchedulesForEmployees(employeeIds, termParam)
      const schedulesMap = groupSchedulesByEmployee(teaching)
      setEmployeeSchedules(schedulesMap)
    } catch (error) {
      console.error("Error loading employees:", error)
      showErrorDialog('Unable to Load Schedules', 'Failed to load employees and class schedules. Please try refreshing the page.')
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
    // Use local-safe image sources only (CSP blocks external URLs in offline mode).
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

  const scheduleCountsByEmployeeDay = useMemo(() => {
    return Object.entries(employeeSchedules).reduce<Record<number, Record<number, number>>>((acc, [employeeId, schedules]) => {
      const counts: Record<number, number> = {}
      for (const schedule of schedules || []) {
        const dayNumber =
          typeof schedule?.day_of_week === 'string'
            ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(schedule.day_of_week) + 1
            : Number(schedule?.day_of_week)

        if (dayNumber >= 1 && dayNumber <= 6) {
          counts[dayNumber] = (counts[dayNumber] || 0) + 1
        }
      }
      acc[Number(employeeId)] = counts
      return acc
    }, {})
  }, [employeeSchedules])

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

  const handleAddSchedule = (dayOfWeek?: number) => {
    if (dayOfWeek && dayOfWeek >= 1 && dayOfWeek <= 6) {
      setEditingSchedule({ day_of_week: dayOfWeek as 1 | 2 | 3 | 4 | 5 | 6 })
    } else {
      setEditingSchedule(null)
    }
    setIsAddModalOpen(true)
    setIsTableViewOpen(false)
  }

  const handleEditSchedule = (schedule: any) => {
    setEditingSchedule({
      day_of_week: typeof schedule.day_of_week === 'string' 
        ? (['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(schedule.day_of_week) + 1) as 1 | 2 | 3 | 4 | 5 | 6
        : schedule.day_of_week as 1 | 2 | 3 | 4 | 5 | 6,
      time_start: schedule.time_start,
      time_end: schedule.time_end,
      subject_name: schedule.subject_name || schedule.subject,
      section: schedule.section,
      room: schedule.room_code || schedule.room,
      type: schedule.class_type === 'LEC' ? 'Lecture' : 'Lab',
      teaching_schedule_id: schedule.teaching_schedule_id || schedule.id, // Pass the ID for conflict detection
    })
    setIsAddModalOpen(true)
    setIsTableViewOpen(false)
  }

  const handleDeleteSchedule = async (scheduleId: number) => {
    try {
      const res = await fetch(`/api/teaching-schedules/${scheduleId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody?.error || 'Failed to delete schedule')
      }

      showFeedbackDialog('success', 'Schedule Deleted', 'Class schedule deleted successfully.')
      showFeedbackDialog('success', 'Schedule Deleted', 'Class schedule deleted successfully.')
      
      // Reload schedules
      if (selectedEmployee) {
        const schedules = await getTeachingSchedulesForEmployee(selectedEmployee.employee_id, getTermParam())
        setViewSchedules(schedules || [])
        setEmployeeSchedules(prev => ({
          ...prev,
          [selectedEmployee.employee_id]: schedules || []
        }))
      }
    } catch (error) {
      showErrorDialog('Delete Failed', 'Failed to delete class schedule. Please try again.')
    }
  }

  const handleSubstitute = (schedule: any) => {
    if (!selectedEmployee) return
    
    // Navigate to Substitute Assignment with pre-filled data
    const params = new URLSearchParams({
      employeeId: selectedEmployee.employee_id.toString(),
      dayOfWeek: schedule.day_of_week, // "Monday", "Tuesday", etc.
      startTime: schedule.time_start,
      endTime: schedule.time_end,
      date: new Date().toISOString().split('T')[0] // Today's date
    })
    
    router.push(`/dashboard/substitute-assignment?${params.toString()}`)
  }

  const handleSaveSchedule = async (data: ClassScheduleData) => {
    if (!selectedEmployee) {
      const err = new Error('No employee selected')
      showErrorDialog('No Employee Selected', err.message)
      throw err
    }

    try {
      // Prepare schedule data        
      const scheduleData = {
        // Critical for edit mode: keep update identity so backend updates instead of creating a new row.
        schedule_id: data.teaching_schedule_id
          ?? ((editingSchedule as any)?.schedule_id || (editingSchedule as any)?.teaching_schedule_id),
        employee_id: selectedEmployee.employee_id,
        course_code: data.subject_name.substring(0, 8).toUpperCase() || 'COURSE',
        room_code: data.room.toUpperCase(),
        day_of_week: data.day_of_week, // Keep as number (1-6 for Mon-Sat)
        time_start: data.time_start,
        time_end: data.time_end,
        subject_name: data.subject_name,
        section: data.section.trim().length >= 2 ? data.section.trim().toUpperCase() : undefined,
        class_type: data.type === 'Lecture' ? 'LEC' : 'LAB',
        term: getTermParam()
      }

      const saveRes = await fetch('/api/teaching-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduleData),
      })

      if (!saveRes.ok) {
        const errBody = await saveRes.json().catch(() => ({}))
        throw new Error(errBody?.error || `Failed to save schedule (${saveRes.status})`)
      }

      showFeedbackDialog(
        'success',
        editingSchedule ? 'Schedule Updated' : 'Schedule Added',
        editingSchedule ? 'Class schedule updated successfully.' : 'Class schedule added successfully.'
      )

      // Reload schedules for this employee
      const schedules = await getTeachingSchedulesForEmployee(selectedEmployee.employee_id, getTermParam())
      setEmployeeSchedules(prev => ({
        ...prev,
        [selectedEmployee.employee_id]: schedules || []
      }))

      // Also reload all employees to update counts on main page
      await loadAcademicTermAndEmployees()

      // Close the add modal and re-open table view
      setIsAddModalOpen(false)
      setEditingSchedule(null)
      setIsTableViewOpen(true)
    } catch (error: any) {
      console.error('[ClassSchedulePage] Error saving schedule:', error)
      throw error
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
    <div className="min-h-screen flex flex-col bg-linear-to-br from-gray-50 via-blue-50/30 to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm shrink-0">
        <div className="px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                <div className="p-3 bg-linear-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
                  <BookOpen className="h-7 w-7 text-white" />
                </div>
                Class Schedule Management
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Manage teaching schedules for all faculty members
              </p>
            </div>
            {/* Active Term Badge */}
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
                  viewMode === 'grid' && "bg-blue-600 hover:bg-blue-700 text-white"
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
                  viewMode === 'list' && "bg-blue-600 hover:bg-blue-700 text-white"
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
      <div className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">Loading employees...</p>
            </div>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <Card className="p-12 text-center">
            <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
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
                <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 dark:bg-blue-950/30 border-l-4 border-blue-500 rounded-r-lg">
                  <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <h3 className="font-bold text-lg text-blue-900 dark:text-blue-100">{department}</h3>
                  <Badge variant="secondary" className="ml-auto bg-blue-600 text-white">
                    {deptEmployees.length} {deptEmployees.length === 1 ? 'Faculty' : 'Faculty'}
                  </Badge>
                </div>

                {/* Department Employees - Compact List */}
                <div className="space-y-2">
                  {deptEmployees.map((employee) => {
                    const schedules = employeeSchedules[employee.employee_id] || []
                    const totalClasses = schedules.length

                    return (
                      <Card 
                        key={employee.employee_id}
                        className="p-3 hover:shadow-lg hover:border-blue-400 dark:hover:border-blue-600 cursor-pointer transition-all duration-200 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
                        onClick={() => handleViewEmployee(employee)}
                      >
                        <div className="flex items-center gap-4">
                          {/* Avatar - Smaller */}
                          <Avatar className="w-12 h-12 ring-2 ring-blue-500/20 shrink-0">
                            <AvatarImage 
                              src={getEmployeeAvatarUrl(employee) || ''} 
                              alt={employee.full_name}
                            />
                            <AvatarFallback className="bg-linear-to-br from-blue-500 to-indigo-600 text-white text-sm font-bold">
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
                            {/* Total Classes */}
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Classes</span>
                              <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{totalClasses}</span>
                            </div>

                            {/* Expand Button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleScheduleExpansion(employee.employee_id)
                              }}
                              className="h-8 w-8 p-0 hover:bg-blue-100 dark:hover:bg-blue-900/30"
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
              const schedules = employeeSchedules[employee.employee_id] || []
              const totalClasses = schedules.length

              return (
                <Card 
                  key={employee.employee_id} 
                  className="p-6 hover:shadow-xl hover:border-blue-400 dark:hover:border-blue-600 cursor-pointer transition-all duration-200 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-800"
                  onClick={() => handleViewEmployee(employee)}
                >
                  {/* Employee Header */}
                  <div className="flex items-start gap-4 mb-4">
                    <Avatar className="w-16 h-16 ring-2 ring-blue-500/20">
                      <AvatarImage 
                        src={getEmployeeAvatarUrl(employee) || ''} 
                        alt={employee.full_name}
                      />
                      <AvatarFallback className="bg-linear-to-br from-blue-500 to-indigo-600 text-white text-lg font-bold">
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
                            className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700"
                          >
                            {employee.employment_status}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Total Classes Badge */}
                  <div className="mb-4 p-3 bg-linear-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Classes</span>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalClasses}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleScheduleExpansion(employee.employee_id)
                          }}
                          className="h-8 w-8 p-0 hover:bg-blue-100 dark:hover:bg-blue-900/30"
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
                            <span className="text-sm font-bold">{count} {count === 1 ? 'Class' : 'Classes'}</span>
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

      {/* View Employee Schedule Dialog - New Table View */}
      {selectedEmployee && (
        <ClassScheduleTableView
          open={isTableViewOpen}
          onOpenChange={setIsTableViewOpen}
          employeeId={selectedEmployee.employee_id}
          employeeName={selectedEmployee.full_name}
          employeeDepartment={selectedEmployee.department}
          onAddSchedule={handleAddSchedule}
          onEditSchedule={handleEditSchedule}
          onSubstitute={handleSubstitute}
        />
      )}

      {/* Add Class Modal */}
      {selectedEmployee && (
        <AddClassModal
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

      <AlertDialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <AlertDialogContent className="max-w-md border-0 bg-linear-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className={cn("flex items-center gap-3", feedbackDialogMeta.titleClass)}>
              <span className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1",
                feedbackDialogMeta.iconWrapClass
              )}>
                {feedbackDialogType === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
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
