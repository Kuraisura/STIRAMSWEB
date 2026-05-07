"use client"

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar as CalendarIcon, UserX, Save } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { substituteExamSchedule } from '@/lib/offline-dashboard-client'

interface ExamSubstitutionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  examSchedule: any
  onSuccess: () => void
}

export function ExamSubstitutionDialog({ 
  open, 
  onOpenChange, 
  examSchedule,
  onSuccess 
}: ExamSubstitutionDialogProps) {
  const [substituteEmployeeId, setSubstituteEmployeeId] = useState<number | null>(null)
  const [unavailableReason, setUnavailableReason] = useState('')
  const [status, setStatus] = useState<'on-leave' | 'absent' | 'unavailable'>('on-leave')
  const [substitutionDate, setSubstitutionDate] = useState<Date | undefined>(
    examSchedule?.exam_date ? new Date(examSchedule.exam_date) : new Date()
  )
  const [employees, setEmployees] = useState<any[]>([])
  const [unavailableEmployees, setUnavailableEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [successOpen, setSuccessOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string>('Substitution created successfully.')

  // Get next occurrence of the same day of week
  const getNextOccurrence = (date: Date): Date => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const targetDayOfWeek = date.getDay()
    const daysUntilNext = (targetDayOfWeek - today.getDay() + 7) % 7
    const nextDate = new Date(today)
    nextDate.setDate(today.getDate() + (daysUntilNext === 0 ? 7 : daysUntilNext))
    return nextDate
  }

  useEffect(() => {
    if (open) {
      loadEmployees()
      // Reset when exam schedule changes
      if (examSchedule?.exam_date) {
        const examDate = new Date(examSchedule.exam_date)
        const nextOccurrence = getNextOccurrence(examDate)
        setSubstitutionDate(nextOccurrence)
      }
      setErrors({})
    }
  }, [open, examSchedule])

  const loadEmployees = async () => {
    try {
      const substitutionDateValue = substitutionDate
        ? format(substitutionDate, 'yyyy-MM-dd')
        : (examSchedule?.exam_date ? format(new Date(examSchedule.exam_date), 'yyyy-MM-dd') : '')
      const params = new URLSearchParams({
        date: substitutionDateValue,
        time_start: String(examSchedule?.time_start || ''),
        time_end: String(examSchedule?.time_end || ''),
        original_employee_id: String(examSchedule?.employee_id || ''),
      })

      const res = await fetch(`/api/employees/available-substitutes?${params.toString()}`, { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error((body as any)?.error || 'Failed to load employees')
      }

      setEmployees(Array.isArray((body as any)?.availableTeachers) ? (body as any).availableTeachers : [])
      setUnavailableEmployees(Array.isArray((body as any)?.unavailableTeachers) ? (body as any).unavailableTeachers : [])
    } catch (error) {
      console.error("Error loading employees:", error)
      setEmployees([])
      setUnavailableEmployees([])
      toast.error("Failed to load substitute employees")
    }
  }

  useEffect(() => {
    if (open && substitutionDate && examSchedule?.time_start && examSchedule?.time_end && examSchedule?.employee_id) {
      void loadEmployees()
    }
  }, [open, substitutionDate, examSchedule?.time_start, examSchedule?.time_end, examSchedule?.employee_id])

  const validate = () => {
    const newErrors: Record<string, string> = {}

    if (!substitutionDate) {
      newErrors.substitution_date = 'Please select a substitution date'
    }
    if (!substituteEmployeeId) {
      newErrors.substitute_employee_id = 'Please select a substitute employee'
    }
    if (!status) {
      newErrors.status = 'Please select a reason category'
    }
    if (!unavailableReason.trim()) {
      newErrors.unavailable_reason = 'Please provide a detailed reason'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    console.log('[Exam Substitution Submit Clicked]')
    if (!validate()) {
      toast.error("Please complete the required substitution fields")
      return
    }

    setLoading(true)
    try {
      const scheduleId = examSchedule.id || examSchedule.exam_schedule_id
      if (!scheduleId) {
        throw new Error('Missing exam schedule id')
      }

      const payloadDate = substitutionDate ? format(substitutionDate, 'yyyy-MM-dd') : undefined
      console.log('[Exam Substitution Submit]', {
        scheduleId: Number(scheduleId),
        originalEmployeeId: examSchedule?.employee_id,
        substituteEmployeeId,
        status,
        substitutionDate: payloadDate,
        timeStart: examSchedule?.time_start,
        timeEnd: examSchedule?.time_end,
        unavailableReason,
      })

      await substituteExamSchedule(
        Number(scheduleId),
        substituteEmployeeId,
        unavailableReason,
        status,
        undefined,
        payloadDate
      )

      toast.success("Substitution created successfully")
      setSuccessMessage('Successfully substituted this exam schedule.')
      setSuccessOpen(true)
      onSuccess()
      onOpenChange(false)
      
      // Reset form
      setSubstituteEmployeeId(null)
      setUnavailableReason('')
      setStatus('on-leave')
      setErrors({})
    } catch (error: any) {
      console.error("Error creating substitution:", error)
      toast.error(error?.message || "Failed to create substitution")
    } finally {
      setLoading(false)
    }
  }

  if (!examSchedule) return null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-3">
            <UserX className="h-6 w-6 text-orange-600" />
            Substitute Exam Schedule
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Current Schedule Info */}
          <div className="bg-gray-50 dark:bg-neutral-900 rounded-lg p-4 border">
            <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">Current Schedule</h4>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{examSchedule.subject_name || examSchedule.subject}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Section: {examSchedule.section} • Room: {examSchedule.room_code || examSchedule.room}
            </p>
            {examSchedule.exam_date && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Date: {format(new Date(examSchedule.exam_date), 'MMMM d, yyyy')}
              </p>
            )}
          </div>

          {/* Substitution Date */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Substitution Date *</Label>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-11 justify-start text-left font-normal",
                    !substitutionDate && "text-muted-foreground",
                    errors.substitution_date && "border-red-500"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {substitutionDate ? format(substitutionDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={substitutionDate}
                  onSelect={(date) => {
                    setSubstitutionDate(date)
                    setDatePickerOpen(false)
                  }}
                  disabled={(date) => {
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    return date < today
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Select a future date for the substitution. Past dates cannot be selected.
            </p>
            {errors.substitution_date && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.substitution_date}</p>
            )}
          </div>

          {/* Substitute Employee */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Substitute Employee *</Label>
            <Select 
              value={substituteEmployeeId?.toString()} 
              onValueChange={(value) => {
                setSubstituteEmployeeId(parseInt(value))
                if (errors.substitute_employee_id) {
                  setErrors((prev) => {
                    const next = { ...prev }
                    delete next.substitute_employee_id
                    return next
                  })
                }
              }}
            >
              <SelectTrigger className={cn("h-11", errors.substitute_employee_id && "border-red-500")}>
                <SelectValue placeholder="Select a substitute teacher" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((emp) => (
                  <SelectItem key={emp.employee_id} value={emp.employee_id.toString()}>
                    {emp.full_name} - {emp.department}
                  </SelectItem>
                ))}
                {unavailableEmployees.length > 0 && (
                  <>
                    <div className="px-2 pt-2 pb-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                      Not Available
                    </div>
                    {unavailableEmployees.map((emp) => (
                      <SelectItem key={`unavailable-${emp.employee_id}`} value={`unavailable-${emp.employee_id}`} disabled>
                        {emp.full_name} - {emp.reason_label}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            {errors.substitute_employee_id && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.substitute_employee_id}</p>
            )}
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Reason Category *</Label>
            <Select value={status} onValueChange={(value: any) => {
              setStatus(value)
              if (errors.status) {
                setErrors((prev) => {
                  const next = { ...prev }
                  delete next.status
                  return next
                })
              }
            }}>
              <SelectTrigger className={cn("h-11", errors.status && "border-red-500")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="on-leave">On Leave</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
                <SelectItem value="unavailable">Unavailable</SelectItem>
              </SelectContent>
            </Select>
            {errors.status && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.status}</p>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Detailed Reason *</Label>
            <Textarea
              value={unavailableReason}
              onChange={(e) => {
                setUnavailableReason(e.target.value)
                if (errors.unavailable_reason) {
                  setErrors((prev) => {
                    const next = { ...prev }
                    delete next.unavailable_reason
                    return next
                  })
                }
              }}
              placeholder="Please provide a detailed reason for the substitution..."
              className={cn("min-h-[100px] resize-none", errors.unavailable_reason && "border-red-500 focus-visible:ring-red-500")}
            />
            {errors.unavailable_reason && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.unavailable_reason}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              className="flex-1 h-11 font-semibold"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              className="flex-1 h-11 bg-orange-600 hover:bg-orange-700 text-white font-semibold"
              disabled={loading}
            >
              <Save className="h-5 w-5 mr-2" />
              {loading ? 'Creating...' : 'Create Substitution'}
            </Button>
          </div>
        </div>
        </DialogContent>
      </Dialog>

      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Substitution Successful</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">{successMessage}</div>
          <div className="flex justify-end pt-4">
            <Button onClick={() => setSuccessOpen(false)}>OK</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
