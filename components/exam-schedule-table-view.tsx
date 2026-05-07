"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, MapPin, Users, BookOpen, Plus, Trash2, X, Edit2, FileText, UserCheck, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toManilaDate } from '@/lib/timezone-utils'
import { format } from 'date-fns'
import { getExamSchedulesForEmployee, deleteExamSchedule } from '@/lib/exam-schedule-api'
import { ExamSubstitutionDialog } from '@/components/exam-substitution-dialog'
import { toast } from 'sonner'

type ExamScheduleTableViewProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId: number
  employeeName: string
  employeeDepartment?: string
  showPastExams?: boolean
  onAddSchedule?: (dayOfWeek: number) => void
  onEditSchedule?: (schedule: any) => void
}

const DAYS_OF_WEEK = [
  { value: 1, label: 'Monday', color: 'bg-red-500', textColor: 'text-red-600', borderColor: 'border-red-500' },
  { value: 2, label: 'Tuesday', color: 'bg-orange-500', textColor: 'text-orange-600', borderColor: 'border-orange-500' },
  { value: 3, label: 'Wednesday', color: 'bg-green-500', textColor: 'text-green-600', borderColor: 'border-green-500' },
  { value: 4, label: 'Thursday', color: 'bg-blue-500', textColor: 'text-blue-600', borderColor: 'border-blue-500' },
  { value: 5, label: 'Friday', color: 'bg-purple-500', textColor: 'text-purple-500', borderColor: 'border-purple-500' },
  { value: 6, label: 'Saturday', color: 'bg-indigo-500', textColor: 'text-indigo-600', borderColor: 'border-indigo-500' },
]

const mapAcademicTermNameToCode = (termName: unknown): '1st_term' | '2nd_term' | 'summer' => {
  const normalized = String(termName || '').trim().toLowerCase()
  if (normalized.includes('2nd') || normalized.includes('second')) return '2nd_term'
  if (normalized.includes('summer')) return 'summer'
  return '1st_term'
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

// Utility function to clean subject name
const cleanSubjectName = (subjectName: string): string => {
  if (!subjectName || !subjectName.trim()) return subjectName
  return subjectName.replace(/\s*\([^()]*\)\s*/g, '').trim()
}

export function ExamScheduleTableView({ 
  open, 
  onOpenChange, 
  employeeId, 
  employeeName,
  employeeDepartment,
  showPastExams = false,
  onAddSchedule,
  onEditSchedule
}: ExamScheduleTableViewProps) {
  const [allSchedules, setAllSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedDay, setSelectedDay] = useState<number>(1)
  const [isSubstitutionDialogOpen, setIsSubstitutionDialogOpen] = useState(false)
  const [selectedExamForSubstitution, setSelectedExamForSubstitution] = useState<any>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [scheduleToDelete, setScheduleToDelete] = useState<any>(null)

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

  useEffect(() => {
    if (open && employeeId) {
      loadSchedules()
    }
  }, [open, employeeId])

  const loadSchedules = async () => {
    setLoading(true)
    try {
      const termRes = await fetch('/api/academic-terms', { cache: 'no-store' })
      const termJson = await termRes.json().catch(() => ({}))
      const activeTerm = Array.isArray(termJson?.data) ? termJson.data.find((term: any) => Boolean(term?.is_active)) : null
      const activeTermCode = mapAcademicTermNameToCode(activeTerm?.term_name)

      const data = await getExamSchedulesForEmployee(employeeId, activeTermCode)
      // Normalize data to ensure 'id' field exists for consistency
      const normalized = (data || []).map((schedule: any) => ({
        ...schedule,
        id: schedule.id || schedule.exam_schedule_id, // Ensure id field exists
      }))
      setAllSchedules(normalized)
    } catch (error) {
      console.error('[ExamScheduleTableView] Error loading schedules:', error)
      toast.error('Failed to load exam schedules')
    } finally {
      setLoading(false)
    }
  }

  const visibleSchedules = React.useMemo(() => {
    if (showPastExams) return allSchedules || []
    return (allSchedules || []).filter((schedule: any) => isFutureOrTodayExamSchedule(schedule))
  }, [allSchedules, showPastExams])

  // Filter and sort schedules for selected day
  const schedulesByDay = React.useMemo(() => {
    const grouped: Record<number, any[]> = {}

    for (const schedule of visibleSchedules || []) {
      if (!schedule) continue
      const day = normalizeDayOfWeek(schedule.day_of_week)
      if (!day) continue
      if (!grouped[day]) grouped[day] = []
      grouped[day].push(schedule)
    }

    for (const day of Object.keys(grouped)) {
      grouped[Number(day)] = grouped[Number(day)].sort((a, b) => (a.time_start || '').localeCompare(b.time_start || ''))
    }

    return grouped
  }, [visibleSchedules])

  const daySchedules = React.useMemo(() => schedulesByDay[selectedDay] || [], [schedulesByDay, selectedDay])

  // Format time for display
  const formatTimeForDisplay = (time: string) => {
    if (!time) return time
    if (time.includes('AM') || time.includes('PM')) return time
    
    const [hours, minutes] = time.split(':').map(Number)
    const period = hours >= 12 ? 'PM' : 'AM'
    const hour12 = hours % 12 || 12
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`
  }

  const formatExamDateForDisplay = (value: string) => {
    if (!value) return value
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return format(parsed, 'MMMM dd, yyyy')
  }

  const handleDelete = async (scheduleId: number) => {
    setLoading(true)
    try {
      await deleteExamSchedule(scheduleId)
      toast.success("Exam schedule deleted successfully")
      loadSchedules()
    } catch (error) {
      console.error("Error deleting exam schedule:", error)
      toast.error("Failed to delete exam schedule")
    } finally {
      setLoading(false)
    }
  }

  const openDeleteDialog = (schedule: any) => {
    setScheduleToDelete(schedule)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!scheduleToDelete) return
    const id = scheduleToDelete.id || scheduleToDelete.exam_schedule_id
    if (!id) {
      toast.error('Unable to delete: missing schedule id')
      setDeleteDialogOpen(false)
      setScheduleToDelete(null)
      return
    }

    await handleDelete(id)
    setDeleteDialogOpen(false)
    setScheduleToDelete(null)
  }

  const selectedDayData = DAYS_OF_WEEK.find(d => d.value === selectedDay) || DAYS_OF_WEEK[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-[700px] w-[95vw] sm:w-[90vw] p-0 overflow-hidden rounded-2xl shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200 max-h-[90vh] flex flex-col"
      >
        {/* Color-coded Header - Matches ViewDayScheduleModal exactly */}
        <div className={cn(
          "relative overflow-hidden px-6 sm:px-8 py-5 sm:py-6 text-white shrink-0",
          selectedDayData.color
        )}>
          <div className="absolute inset-0 bg-white/10" />
          <DialogHeader className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-white/20 rounded-xl">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl sm:text-2xl font-bold">
                  {selectedDayData.label} Exam Schedule
                </DialogTitle>
                <DialogDescription className="text-white/90 text-sm sm:text-base mt-1">
                  {employeeName ? `${employeeName}${employeeDepartment ? ` • ${employeeDepartment}` : ''} - ${selectedDayData.label} exam schedules` : `${selectedDayData.label} exam schedule details`}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Day Tabs */}
          <div className="flex gap-2 mt-4 relative z-10">
            {DAYS_OF_WEEK.map((day) => {
              // Calculate count for this day
              const dayCount = schedulesByDay[day.value]?.length || 0

              return (
                <button
                  key={day.value}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setSelectedDay(day.value)
                  }}
                  className={cn(
                    "relative flex-1 px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer pointer-events-auto select-none",
                    selectedDay === day.value 
                      ? "bg-white text-gray-900 shadow-md" 
                      : "bg-white/20 text-white hover:bg-white/30"
                  )}
                >
                  {day.label}
                  {dayCount > 0 && (
                    <span className={cn(
                      "absolute -top-1 -right-1 h-5 w-5 rounded-full text-[10px] font-bold flex items-center justify-center shadow-lg",
                      selectedDay === day.value 
                        ? "bg-red-500 text-white animate-pulse" 
                        : "bg-white text-gray-900 animate-pulse"
                    )}>
                      {dayCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          
          {/* Time Range Display */}
          {daySchedules.length > 0 && (() => {
            // Find earliest start time and latest end time
            let earliestStart = daySchedules[0].time_start || '00:00'
            let latestEnd = daySchedules[0].time_end || '00:00'
            
            daySchedules.forEach(schedule => {
              if (schedule.time_start && schedule.time_start < earliestStart) earliestStart = schedule.time_start
              if (schedule.time_end && schedule.time_end > latestEnd) latestEnd = schedule.time_end
            })
            
            return (
              <div className="mt-3 text-center">
                <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm font-semibold">
                    {formatTimeForDisplay(earliestStart)} - {formatTimeForDisplay(latestEnd)}
                  </span>
                </div>
              </div>
            )
          })()}
        </div>

        {/* Action Buttons */}
        <div className="px-6 sm:px-8 py-3 bg-gray-50 dark:bg-neutral-900 border-b flex gap-2 shrink-0">
          <Button
            onClick={() => {
              if (onAddSchedule) {
                onOpenChange(false)
                onAddSchedule(selectedDay)
              }
            }}
            size="sm"
            className={cn("flex-1 font-semibold", selectedDayData.color, "hover:opacity-90")}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Exam
          </Button>
        </div>

        {/* Scrollable Content - Matches ViewDayScheduleModal */}
        <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-4 sm:py-6 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 dark:[&::-webkit-scrollbar-track]:bg-gray-800 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-400 dark:hover:[&::-webkit-scrollbar-thumb]:bg-gray-500">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-purple-600 border-r-transparent"></div>
              <span className="ml-3 text-gray-600 dark:text-gray-400">Loading schedules...</span>
            </div>
          ) : daySchedules.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 dark:bg-neutral-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-neutral-700">
              <Clock className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-base font-medium text-gray-600 dark:text-gray-400">No exams for this day</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                {employeeName} has no exams scheduled for {selectedDayData.label}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {daySchedules.map((schedule: any, index: number) => (
                <div
                  key={schedule.id || index}
                  className={cn(
                    "rounded-xl border-2 p-5 bg-white dark:bg-neutral-900 shadow-sm hover:shadow-md transition-all",
                    selectedDayData.borderColor
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "px-3 py-1 rounded-lg text-xs font-bold text-white",
                        selectedDayData.color
                      )}>
                        #{index + 1}
                      </div>
                      <div className="flex items-center gap-1.5 text-base font-semibold text-blue-600 dark:text-blue-400">
                        <Clock className="h-4 w-4" />
                        {formatTimeForDisplay(schedule.time_start)} - {formatTimeForDisplay(schedule.time_end)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {schedule.class_type && (
                        <span className={cn(
                          "text-xs font-semibold px-3 py-1 rounded-full",
                          schedule.class_type === 'SHS'
                            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                            : "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                        )}>
                          {schedule.class_type}
                        </span>
                      )}
                      {(schedule.exam_type || schedule.type) && (
                        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300">
                          {schedule.exam_type || schedule.type}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <BookOpen className="h-5 w-5 text-purple-500 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-base font-bold text-gray-900 dark:text-gray-100">
                          {cleanSubjectName(schedule.subject_name || schedule.subject || 'Untitled')}
                        </p>
                      </div>
                    </div>
                    
                    {schedule.section && (
                      <div className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                        <Users className="h-4 w-4 text-cyan-500" />
                        <span className="font-medium">Section:</span>
                        <span className="font-semibold">{schedule.section}</span>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                      <MapPin className="h-4 w-4 text-red-500" />
                      <span className="font-medium">Room:</span>
                      <span className="font-semibold">{schedule.room_code || schedule.room || 'TBA'}</span>
                    </div>
                    
                    {schedule.substitute && (
                      <div className="flex items-center gap-2.5 text-sm text-green-700 dark:text-green-400">
                        <Users className="h-4 w-4 text-green-500" />
                        <span className="font-medium">Substitute:</span>
                        <span className="font-semibold">{schedule.substitute}</span>
                      </div>
                    )}
                    
                    {schedule.exam_date && (
                      <div className="flex items-center gap-2.5 text-sm text-purple-700 dark:text-purple-400">
                        <Calendar className="h-4 w-4 text-purple-500" />
                        <span className="font-medium">Exam Date:</span>
                        <span className="font-semibold">
                          {format(new Date(schedule.exam_date), 'MMMM dd, yyyy')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t">
                    <Button
                      onClick={() => {
                        if (onEditSchedule) {
                          onEditSchedule(schedule)
                          onOpenChange(false)
                        }
                      }}
                      variant="outline"
                      size="sm"
                      className="font-semibold text-blue-600 hover:bg-blue-50"
                    >
                      <Edit2 className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      onClick={() => openDeleteDialog(schedule)}
                      variant="outline"
                      size="sm"
                      className="font-semibold text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </Button>
                    <Button
                      onClick={() => {
                        setSelectedExamForSubstitution(schedule)
                        setIsSubstitutionDialogOpen(true)
                      }}
                      variant="outline"
                      size="sm"
                      className="font-semibold text-orange-600 hover:bg-orange-50"
                    >
                      <Users className="h-3 w-3 mr-1" />
                      Sub
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
                <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600 dark:text-gray-400">Subject:</span>
                    <span className="font-medium text-right">{cleanSubjectName(scheduleToDelete.subject_name || scheduleToDelete.subject || 'Untitled')}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600 dark:text-gray-400">Time:</span>
                    <span className="font-medium text-right">{formatTimeForDisplay(scheduleToDelete.time_start)} - {formatTimeForDisplay(scheduleToDelete.time_end)}</span>
                  </div>
                  {scheduleToDelete.exam_date && (
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-600 dark:text-gray-400">Exam Date:</span>
                      <span className="font-medium text-right">{formatExamDateForDisplay(String(scheduleToDelete.exam_date))}</span>
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
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ExamSubstitutionDialog
        open={isSubstitutionDialogOpen}
        onOpenChange={setIsSubstitutionDialogOpen}
        examSchedule={selectedExamForSubstitution}
        onSuccess={() => {
          loadSchedules()
          toast.success("Substitution created successfully")
        }}
      />

    </Dialog>
  )
}
