"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { 
  Plus, 
  Trash2,
  Clock, 
  MapPin, 
  BookOpen, 
  Calendar,
  Users,
  X,
  Edit2,
  Save,
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

interface ClassSchedule {
  schedule_id?: number
  employee_id: number
  day_of_week: number
  time_start: string
  time_end: string
  subject_name: string
  section: string
  room_code: string
  class_type?: string
  term?: '1st_term' | '2nd_term'
}

interface ClassScheduleDialogProps {
  employee: Employee | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DAYS_OF_WEEK = [
  { value: 1, label: "Monday", color: "bg-green-500", hoverColor: "hover:bg-green-600", borderColor: "border-green-200", bgLight: "bg-green-50", textColor: "text-green-700" },
  { value: 2, label: "Tuesday", color: "bg-blue-500", hoverColor: "hover:bg-blue-600", borderColor: "border-blue-200", bgLight: "bg-blue-50", textColor: "text-blue-700" },
  { value: 3, label: "Wednesday", color: "bg-purple-500", hoverColor: "hover:bg-purple-600", borderColor: "border-purple-200", bgLight: "bg-purple-50", textColor: "text-purple-700" },
  { value: 4, label: "Thursday", color: "bg-orange-500", hoverColor: "hover:bg-orange-600", borderColor: "border-orange-200", bgLight: "bg-orange-50", textColor: "text-orange-700" },
  { value: 5, label: "Friday", color: "bg-pink-500", hoverColor: "hover:bg-pink-600", borderColor: "border-pink-200", bgLight: "bg-pink-50", textColor: "text-pink-700" },
  { value: 6, label: "Saturday", color: "bg-indigo-500", hoverColor: "hover:bg-indigo-600", borderColor: "border-indigo-200", bgLight: "bg-indigo-50", textColor: "text-indigo-700" },
]

export function ClassScheduleDialog({ employee, open, onOpenChange }: ClassScheduleDialogProps) {
  const [schedules, setSchedules] = useState<ClassSchedule[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedDay, setSelectedDay] = useState<number>(1)
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1])) // Start with Monday expanded
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [scheduleToDelete, setScheduleToDelete] = useState<ClassSchedule | null>(null)
  
  // Form state
  const [formData, setFormData] = useState<Partial<ClassSchedule>>({
    time_start: "12:00",
    time_end: "14:00",
    subject_name: "",
    section: "",
    room_code: "",
    class_type: "Lecture",
  })

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
        throw new Error(body?.error || 'Failed to load schedules')
      }

      setSchedules((body?.teaching || []) as ClassSchedule[])
    } catch (error) {
      console.error("Error fetching schedules:", error)
      toast.error("Failed to load schedules")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (!employee) return

    if (!formData.subject_name || !formData.section || !formData.room_code) {
      toast.error("Please fill in all required fields")
      return
    }

    setIsLoading(true)
    try {
      const scheduleData = {
        employee_id: employee.employee_id,
        day_of_week: selectedDay,
        time_start: formData.time_start,
        time_end: formData.time_end,
        course_code: (formData.subject_name || '').substring(0, 8).toUpperCase() || 'COURSE',
        subject_name: formData.subject_name,
        section: formData.section,
        room_code: formData.room_code,
        class_type: formData.class_type || "Lecture",
      }

      const res = await fetch('/api/teaching-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduleData),
      })
      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(body?.error || 'Failed to save schedule')
      }

      toast.success("Schedule added successfully")

      // Reset form
      setFormData({
        time_start: "12:00",
        time_end: "14:00",
        subject_name: "",
        section: "",
        room_code: "",
        class_type: "Lecture",
      })
      fetchSchedules()
    } catch (error) {
      console.error("Error saving schedule:", error)
      toast.error("Failed to save schedule")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (scheduleId: number) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/teaching-schedules/${scheduleId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(body?.error || 'Failed to delete schedule')
      }

      toast.success("Schedule deleted successfully")
      fetchSchedules()
    } catch (error) {
      console.error("Error deleting schedule:", error)
      toast.error("Failed to delete schedule")
    } finally {
      setIsLoading(false)
    }
  }

  const openDeleteDialog = (schedule: ClassSchedule) => {
    setScheduleToDelete(schedule)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!scheduleToDelete?.schedule_id) {
      toast.error("Unable to delete schedule: missing id")
      setDeleteDialogOpen(false)
      setScheduleToDelete(null)
      return
    }

    await handleDelete(scheduleToDelete.schedule_id)
    setDeleteDialogOpen(false)
    setScheduleToDelete(null)
  }

  const handleClear = () => {
    setFormData({
      time_start: "12:00",
      time_end: "14:00",
      subject_name: "",
      section: "",
      room_code: "",
      class_type: "Lecture",
    })
  }

  const getDayLabel = (day: number) => {
    return DAYS_OF_WEEK.find(d => d.value === day)?.label || "Unknown"
  }

  const getDayColor = (day: number) => {
    return DAYS_OF_WEEK.find(d => d.value === day) || DAYS_OF_WEEK[0]
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

  // Group schedules by day
  const schedulesByDay = DAYS_OF_WEEK.reduce((acc, day) => {
    acc[day.value] = schedules
      .filter((s) => Number(s.day_of_week) === day.value)
      .sort((a, b) => {
        const byStart = toMinutes(a.time_start) - toMinutes(b.time_start)
        if (byStart !== 0) return byStart
        const byEnd = toMinutes(a.time_end) - toMinutes(b.time_end)
        if (byEnd !== 0) return byEnd
        return String(a.subject_name || '').localeCompare(String(b.subject_name || ''))
      })
    return acc
  }, {} as Record<number, ClassSchedule[]>)

  if (!employee) return null

  const currentDayColor = getDayColor(selectedDay)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[1600px] h-[90vh] p-0 gap-0 overflow-hidden" onInteractOutside={(e) => e.preventDefault()}>
        {/* Header */}
        <div className={`${currentDayColor.color} px-8 py-6 flex items-center justify-between shadow-lg`}>
          <div className="flex items-center gap-4 text-white">
            <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
              <Calendar className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{getDayLabel(selectedDay)} Class Schedule</h2>
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
        <div className="px-8 py-5 bg-white border-b-2">
          <div className="flex gap-2">
            {DAYS_OF_WEEK.map((day) => (
              <Button
                key={day.value}
                onClick={() => setSelectedDay(day.value)}
                variant={selectedDay === day.value ? "default" : "outline"}
                size="lg"
                className={`flex-1 h-12 font-semibold text-base ${
                  selectedDay === day.value 
                    ? `${currentDayColor.color} ${currentDayColor.hoverColor} text-white shadow-md` 
                    : 'hover:bg-gray-100'
                }`}
              >
                {day.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Content Layout - Redesigned */}
        <div className="flex flex-col overflow-hidden">
          {/* Top: Add Form - Wide Rectangle */}
          <div className="border-b-2 bg-linear-to-br from-gray-50 to-white max-h-[45vh] overflow-y-auto">
            <div className="px-8 py-6">
              <div className={`${currentDayColor.color} text-white p-4 rounded-xl mb-6 shadow-lg flex items-center gap-3`}>
                <Plus className="h-6 w-6" />
                <div>
                  <h3 className="text-lg font-bold">Add New Class Schedule</h3>
                  <p className="text-xs opacity-90 mt-0.5">Fill in all details to create a new schedule</p>
                </div>
              </div>
              
              <div className="grid grid-cols-5 gap-4">
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
                    <BookOpen className="h-4 w-4" />
                    Subject Name *
                  </Label>
                  <Input
                    value={formData.subject_name}
                    onChange={(e) => setFormData({ ...formData, subject_name: e.target.value })}
                    className="text-base h-12"
                    placeholder="e.g., Computer Programming 1"
                  />
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
                    onChange={(e) => {
                      const room = e.target.value
                      setFormData({ 
                        ...formData, 
                        room_code: room,
                        class_type: room.toLowerCase().includes('compl') ? 'Laboratory' : 'Lecture'
                      })
                    }}
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
                    className={`flex-1 h-12 ${currentDayColor.color} ${currentDayColor.hoverColor} text-white font-bold shadow-lg text-base`}
                    size="lg"
                  >
                    <Save className="h-5 w-5 mr-2" />
                    {isLoading ? 'Saving...' : 'Save Schedule'}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom: Schedule List */}
          <div className="flex-1 p-8 overflow-y-auto bg-gray-50">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold flex items-center gap-3 text-gray-900">
                <BookOpen className="h-6 w-6 text-gray-600" />
                All Schedules
                <Badge variant="secondary" className={`ml-2 ${currentDayColor.color} text-white text-base px-3 py-1`}>
                  {schedules.length} total {schedules.length === 1 ? 'class' : 'classes'}
                </Badge>
              </h3>
            </div>
            
            {schedules.length === 0 ? (
              <div className="border-2 border-dashed rounded-xl p-16 text-center bg-white">
                <Calendar className="h-20 w-20 text-gray-300 mx-auto mb-4" />
                <p className="text-lg font-semibold text-gray-500 mb-2">No schedules yet</p>
                <p className="text-sm text-gray-400">Use the form above to add a new class schedule</p>
              </div>
            ) : (
              <div className="space-y-4">
                {DAYS_OF_WEEK.map((day) => {
                  const daySchedules = schedulesByDay[day.value] || []
                  if (daySchedules.length === 0) return null
                  
                  const isExpanded = expandedDays.has(day.value)
                  
                  return (
                    <div key={day.value} className="bg-white rounded-xl border-2 overflow-hidden">
                      {/* Day Header - Clickable */}
                      <button
                        onClick={() => toggleDayExpansion(day.value)}
                        className={`w-full flex items-center justify-between p-4 ${day.color} ${day.hoverColor} text-white transition-colors`}
                      >
                        <div className="flex items-center gap-3">
                          <Calendar className="h-5 w-5" />
                          <span className="font-bold text-lg">{day.label}</span>
                          <Badge className="bg-white/20 text-white border-white/30">
                            {daySchedules.length} {daySchedules.length === 1 ? 'class' : 'classes'}
                          </Badge>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5" />
                        ) : (
                          <ChevronDown className="h-5 w-5" />
                        )}
                      </button>
                      
                      {/* Day Schedules - Collapsible */}
                      {isExpanded && (
                        <div className="p-4 grid grid-cols-1 gap-4">
                          {daySchedules.map((schedule, index) => (
                            <div
                              key={schedule.schedule_id}
                              className="bg-gray-50 border-2 rounded-xl p-5 hover:shadow-lg transition-all group relative"
                            >
                              <div className="flex items-start gap-4">
                                <div className={`${day.color} text-white rounded-xl w-12 h-12 flex items-center justify-center text-lg font-bold shadow-md shrink-0`}>
                                  {index + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start gap-2 mb-3">
                                    <Badge className={`${schedule.class_type === 'Laboratory' ? 'bg-blue-600' : 'bg-green-600'} text-white font-semibold`}>
                                      {schedule.class_type || "Lecture"}
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
              Delete Class Schedule
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2">
              <p>Are you sure you want to delete this class schedule?</p>
              {scheduleToDelete && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600">Subject:</span>
                    <span className="font-medium text-right">{scheduleToDelete.subject_name || "Untitled"}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600">Day:</span>
                    <span className="font-medium text-right">{getDayLabel(scheduleToDelete.day_of_week)}</span>
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
