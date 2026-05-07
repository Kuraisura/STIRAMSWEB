"use client"

import React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Clock, BookOpen, MapPin, Users, Calendar as CalendarIcon, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { ScrollArea } from '@/components/ui/scroll-area'

export type ViewScheduleItem = {
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
  type?: string
  substitute?: string
  exam_date?: string | Date
}

type ViewDayScheduleModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  day: number // 1-6 (Monday-Saturday)
  type: 'class' | 'exam'
  schedules: ViewScheduleItem[]
  employeeName?: string
}

const days = [
  { value: 1, label: 'Monday', color: 'bg-red-500', textColor: 'text-red-600', borderColor: 'border-red-500' },
  { value: 2, label: 'Tuesday', color: 'bg-orange-500', textColor: 'text-orange-600', borderColor: 'border-orange-500' },
  { value: 3, label: 'Wednesday', color: 'bg-green-500', textColor: 'text-green-600', borderColor: 'border-green-500' },
  { value: 4, label: 'Thursday', color: 'bg-blue-500', textColor: 'text-blue-600', borderColor: 'border-blue-500' },
  { value: 5, label: 'Friday', color: 'bg-purple-500', textColor: 'text-purple-500', borderColor: 'border-purple-500' },
  { value: 6, label: 'Saturday', color: 'bg-indigo-500', textColor: 'text-indigo-600', borderColor: 'border-indigo-500' },
]

// Utility function to clean subject name (remove parentheses and their contents)
const cleanSubjectName = (subjectName: string): string => {
  if (!subjectName || !subjectName.trim()) return subjectName
  return subjectName.replace(/\s*\([^()]*\)\s*/g, '').trim()
}

export function ViewDayScheduleModal({ 
  open, 
  onOpenChange, 
  day, 
  type, 
  schedules, 
  employeeName,
}: ViewDayScheduleModalProps) {
  const selectedDay = days.find(d => d.value === day)
  
  // Sort schedules by time
  const sortedSchedules = React.useMemo(() => {
    if (!schedules || schedules.length === 0) return []
    return [...schedules]
      .filter(s => s && (s.schedule_id || s.exam_schedule_id))
      .sort((a, b) => (a.time_start || '').localeCompare(b.time_start || ''))
  }, [schedules])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-[700px] w-[95vw] sm:w-[90vw] p-0 overflow-hidden rounded-2xl shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200 max-h-[90vh] flex flex-col"
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
                {type === 'class' ? <BookOpen className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
              </div>
              <div>
                <DialogTitle className="text-xl sm:text-2xl font-bold">
                  {selectedDay?.label} {type === 'class' ? 'Class' : 'Exam'} Schedule
                </DialogTitle>
                <DialogDescription className="text-white/90 text-sm sm:text-base mt-1">
                  {employeeName ? `${employeeName}'s ${selectedDay?.label} schedules` : `${selectedDay?.label} schedule details`}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Scrollable Content */}
        <ScrollArea className="flex-1 px-6 sm:px-8 py-4 sm:py-6 max-h-[calc(90vh-140px)]">
          {sortedSchedules.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 dark:bg-neutral-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-neutral-700">
              <Clock className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-base font-medium text-gray-600 dark:text-gray-400">No schedules for this day</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                {employeeName} has no {type === 'class' ? 'classes' : 'exams'} scheduled for {selectedDay?.label}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedSchedules.map((schedule, index) => (
                <div
                  key={schedule.schedule_id || schedule.exam_schedule_id || index}
                  className={cn(
                    "rounded-xl border-2 p-5 bg-white dark:bg-neutral-900 shadow-sm hover:shadow-md transition-all",
                    selectedDay?.borderColor || 'border-gray-300'
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "px-3 py-1 rounded-lg text-xs font-bold text-white",
                        selectedDay?.color || 'bg-blue-500'
                      )}>
                        #{index + 1}
                      </div>
                      <div className="flex items-center gap-1.5 text-base font-semibold text-blue-600 dark:text-blue-400">
                        <Clock className="h-4 w-4" />
                        {schedule.time_start} - {schedule.time_end}
                      </div>
                    </div>
                    {(schedule.class_type || schedule.type) && (
                      <span className={cn(
                        "text-xs font-semibold px-3 py-1 rounded-full",
                        schedule.class_type === 'LEC' || schedule.type === 'Lecture'
                          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                          : "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                      )}>
                        {schedule.class_type || schedule.type}
                      </span>
                    )}
                  </div>
                  
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <BookOpen className="h-5 w-5 text-purple-500 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-base font-bold text-gray-900 dark:text-gray-100 overflow-wrap-break-word">
                          {cleanSubjectName(schedule.subject_name || schedule.subject || 'Untitled')}
                        </p>
                        {schedule.course_code && (
                          <p className="text-xs font-mono bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded inline-block mt-1">
                            {schedule.course_code}
                          </p>
                        )}
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
                    
                    {type === 'exam' && schedule.exam_date && (
                      <div className="flex items-center gap-2.5 text-sm text-purple-700 dark:text-purple-400">
                        <CalendarIcon className="h-4 w-4 text-purple-500" />
                        <span className="font-medium">Exam Date:</span>
                        <span className="font-semibold">
                          {format(new Date(schedule.exam_date), 'MMMM dd, yyyy')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
