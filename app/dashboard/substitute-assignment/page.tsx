"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  UserCheck, 
  Plus, 
  Search, 
  Calendar as CalendarIcon, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Trash2,
  RefreshCw
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { normalizeDayOfWeekInput } from "@/lib/substitution-conflict-helper"

const parseJsonOrThrow = async (res: Response) => {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err: any = new Error((body as any)?.error || `Request failed (${res.status})`)
    Object.assign(err, body)
    throw err
  }
  return body
}

const getEligibleSubstituteEmployees = async () => {
  const res = await fetch('/api/employees/eligible-substitutes', { cache: 'no-store' })
  const body = await parseJsonOrThrow(res)
  return Array.isArray(body) ? body : []
}

const getAvailableSubstituteEmployees = async (
  _dayOfWeek: string,
  startTime: string,
  endTime: string,
  originalEmployeeId: number,
  _term?: string,
  date?: string
) => {
  const params = new URLSearchParams({
    date: date || format(new Date(), 'yyyy-MM-dd'),
    time_start: startTime,
    time_end: endTime,
    original_employee_id: String(originalEmployeeId),
  })
  const res = await fetch(`/api/employees/available-substitutes?${params.toString()}`, { cache: 'no-store' })
  const body = await parseJsonOrThrow(res)
  return {
    availableTeachers: Array.isArray((body as any)?.availableTeachers) ? (body as any).availableTeachers : [],
    unavailableTeachers: Array.isArray((body as any)?.unavailableTeachers) ? (body as any).unavailableTeachers : [],
  }
}

const getClassSubstitutions = async () => {
  const res = await fetch('/api/substitution/records', { cache: 'no-store' })
  const body = await parseJsonOrThrow(res)
  return Array.isArray((body as any)?.items) ? (body as any).items : []
}

const createClassSubstitution = async (payload: {
  original_employee_id: number
  substitute_employee_id: number
  substitution_date: string
  start_time: string
  end_time: string
  reason?: string
}) => {
  const res = await fetch('/api/substitution/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return await parseJsonOrThrow(res)
}

const updateSubstitutionStatus = async (
  id: number,
  status: 'approved' | 'rejected' | 'cancelled',
  approvedBy?: number
) => {
  const res = await fetch('/api/substitution/records', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status, approved_by: approvedBy || null }),
  })
  return await parseJsonOrThrow(res)
}

const deleteClassSubstitution = async (id: number) => {
  const res = await fetch(`/api/substitution/records?id=${id}`, { method: 'DELETE' })
  return await parseJsonOrThrow(res)
}

const removeExamSubstitution = async (examScheduleId: number) => {
  const res = await fetch(`/api/exam-schedules/${examScheduleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'remove-substitution' }),
  })
  return await parseJsonOrThrow(res)
}

const normalizeTimeValue = (value: string) => {
  const input = String(value || '').trim()
  if (!input) return ''

  const match = input.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/)
  if (!match) return input

  let hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3] || '0')
  const period = match[4]?.toUpperCase()

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    Number.isNaN(seconds) ||
    minutes < 0 || minutes > 59 ||
    seconds < 0 || seconds > 59
  ) {
    return input
  }

  if (period) {
    if (hours < 1 || hours > 12) return input
    if (period === 'AM') {
      hours = hours === 12 ? 0 : hours
    } else {
      hours = hours === 12 ? 12 : hours + 12
    }
  } else if (hours < 0 || hours > 23) {
    return input
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const formatTimeAmPm = (value: string) => {
  const normalized = normalizeTimeValue(value)
  const match = normalized.match(/^(\d{2}):(\d{2}):(\d{2})$/)
  if (!match) return value || '--'

  const [hours, minutes, seconds] = match.slice(1).map(Number)
  const date = new Date(2000, 0, 1, hours, minutes, seconds)
  if (Number.isNaN(date.getTime())) return value || '--'
  return format(date, 'h:mm a')
}

const formatTimeRangeAmPm = (start: string, end: string) => `${formatTimeAmPm(start)} - ${formatTimeAmPm(end)}`

export default function SubstituteAssignmentPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [employees, setEmployees] = useState<any[]>([])
  const [substitutions, setSubstitutions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const { toast } = useToast()

  // Form state
  const [formData, setFormData] = useState({
    original_employee_id: 0,
    substitute_employee_id: 0,
    substitution_date: new Date(),
    start_time: "",
    end_time: "",
    reason: ""
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [originalEmployeeName, setOriginalEmployeeName] = useState<string>("")
  const [originalEmployeeDepartment, setOriginalEmployeeDepartment] = useState<string>("")
  const [restrictedDayOfWeek, setRestrictedDayOfWeek] = useState<number | null>(null) // 0=Sunday, 1=Monday, etc.
  const [warningDialogOpen, setWarningDialogOpen] = useState(false)
  const [warningMessage, setWarningMessage] = useState({ title: '', description: '' })
  const [isCheckingSubstitutes, setIsCheckingSubstitutes] = useState(false)
  const [substituteAvailabilityError, setSubstituteAvailabilityError] = useState<string>("")
  const [unavailableSubstitutes, setUnavailableSubstitutes] = useState<any[]>([])
  const [recommendedSubstituteId, setRecommendedSubstituteId] = useState<number | null>(null)
  const [successDialogOpen, setSuccessDialogOpen] = useState(false)
  const [successDialogMessage, setSuccessDialogMessage] = useState<string>('Substitution request created successfully.')
  
  // Dialog states for confirmations
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [selectedSubstitutionId, setSelectedSubstitutionId] = useState<number | null>(null)
  const [selectedSubstitution, setSelectedSubstitution] = useState<any>(null)

  const getNextDateForWeekday = (targetJsDay: number, baseDate?: Date) => {
    const now = baseDate ? new Date(baseDate) : new Date()
    now.setHours(0, 0, 0, 0)
    const currentJsDay = now.getDay()
    const delta = (targetJsDay - currentJsDay + 7) % 7
    const next = new Date(now)
    next.setDate(now.getDate() + delta)
    return next
  }

  const getRestrictedDayLabel = (jsDay: number | null) => {
    if (jsDay === null || jsDay === undefined) return null
    const labels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    return labels[jsDay] || null
  }

  const getNextValidDateHint = () => {
    if (restrictedDayOfWeek === null || restrictedDayOfWeek === undefined) return null
    const nextValidDate = getNextDateForWeekday(restrictedDayOfWeek)
    return `${getRestrictedDayLabel(restrictedDayOfWeek)} → ${format(nextValidDate, 'MMMM d, yyyy')}`
  }

  const pickRecommendedSubstitute = (available: any[], department: string) => {
    if (!Array.isArray(available) || available.length === 0) return null
    const dept = String(department || '').trim().toLowerCase()

    const sorted = [...available].sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')))
    const sameDepartment = dept
      ? sorted.find((emp) => String(emp.department || '').trim().toLowerCase() === dept)
      : null

    return sameDepartment || sorted[0]
  }

  useEffect(() => {
    loadData()
  }, [])

  // Handle URL parameters to pre-fill form
  useEffect(() => {
    const employeeId = searchParams.get('employeeId')
    const startTime = searchParams.get('startTime')
    const endTime = searchParams.get('endTime')
    const date = searchParams.get('date')
    const dayOfWeek = searchParams.get('dayOfWeek')

    if (employeeId && startTime && endTime && dayOfWeek) {
      // Avoid showing stale broad employee lists while availability/conflict analysis is still loading.
      setEmployees([])

      // Load available employees with conflict detection
      const loadAvailableEmployees = async () => {
        try {
          setSubstituteAvailabilityError("")
          // Get all employees to find original employee name
          const allEmployees = await getEligibleSubstituteEmployees()
          const originalEmp = allEmployees.find(emp => emp.employee_id === parseInt(employeeId))
          if (originalEmp) {
            setOriginalEmployeeName(`${originalEmp.full_name} - ${originalEmp.employment_status}`)
            setOriginalEmployeeDepartment(String(originalEmp.department || ''))
          }

          // Get available employees (excluding conflicts)
          const result = await getAvailableSubstituteEmployees(
            dayOfWeek,
            startTime,
            endTime,
            parseInt(employeeId),
            '1st_term',
            date || undefined  // Pass the date parameter if available
          )
          setEmployees(result.availableTeachers)
          setUnavailableSubstitutes(result.unavailableTeachers)
          const recommended = pickRecommendedSubstitute(result.availableTeachers, String(originalEmp?.department || ''))
          setRecommendedSubstituteId(recommended ? Number(recommended.employee_id) : null)
          if (recommended && Number(recommended.employee_id) && !formData.substitute_employee_id) {
            setFormData((prev) => ({ ...prev, substitute_employee_id: Number(recommended.employee_id) }))
          }
          console.log(`[SubstituteAssignment] Loaded ${result.availableTeachers.length} available employees (no conflicts)`)
        } catch (error) {
          console.error('[SubstituteAssignment] Error loading available employees:', error)
          // Do NOT fallback to broad eligible list to avoid accidental conflicting assignments.
          setEmployees([])
          setUnavailableSubstitutes([])
          setRecommendedSubstituteId(null)
          setSubstituteAvailabilityError('Unable to verify substitute conflicts right now. Please retry before creating substitution.')
        }
      }

      loadAvailableEmployees()

      // Set day of week restriction from either name or numeric input.
      const normalizedIsoDay = normalizeDayOfWeekInput(dayOfWeek)
      const jsDay = normalizedIsoDay === 7 ? 0 : normalizedIsoDay
      setRestrictedDayOfWeek(jsDay ?? null)

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      let autoDate = new Date(today)
      if (jsDay !== null && jsDay !== undefined) {
        autoDate = getNextDateForWeekday(jsDay, today)
      }

      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const parsed = new Date(`${date}T00:00:00`)
        const dateMatchesRestriction = jsDay === null || parsed.getDay() === jsDay
        if (!Number.isNaN(parsed.getTime()) && parsed >= today && dateMatchesRestriction) {
          autoDate = parsed
        }
      }

      setFormData(prev => ({
        ...prev,
        original_employee_id: parseInt(employeeId),
        start_time: normalizeTimeValue(startTime),
        end_time: normalizeTimeValue(endTime),
        substitution_date: autoDate
      }))
      setIsAddModalOpen(true)
    }
  }, [searchParams])

  useEffect(() => {
    const refreshAvailableSubstitutes = async () => {
      if (!isAddModalOpen) return
      if (!formData.original_employee_id || !formData.start_time || !formData.end_time || !formData.substitution_date) return

      try {
        setIsCheckingSubstitutes(true)
        setSubstituteAvailabilityError("")
        const dateStr = format(formData.substitution_date, 'yyyy-MM-dd')
        const result = await getAvailableSubstituteEmployees(
          String(restrictedDayOfWeek ?? ''),
          formData.start_time,
          formData.end_time,
          formData.original_employee_id,
          '1st_term',
          dateStr
        )

        setEmployees(result.availableTeachers)
        setUnavailableSubstitutes(result.unavailableTeachers)
        const recommended = pickRecommendedSubstitute(result.availableTeachers, originalEmployeeDepartment)
        setRecommendedSubstituteId(recommended ? Number(recommended.employee_id) : null)

        // Clear selected substitute if it became unavailable after date/time change.
        if (
          formData.substitute_employee_id &&
          !result.availableTeachers.some((emp: any) => Number(emp.employee_id) === Number(formData.substitute_employee_id))
        ) {
          setFormData((prev) => ({
            ...prev,
            substitute_employee_id: recommended ? Number(recommended.employee_id) : 0,
          }))
        } else if (!formData.substitute_employee_id && recommended) {
          // Auto-apply recommended substitute when field is still empty.
          setFormData((prev) => ({ ...prev, substitute_employee_id: Number(recommended.employee_id) }))
        }
      } catch (error) {
        console.error('[SubstituteAssignment] Failed to refresh available substitutes:', error)
        setEmployees([])
        setUnavailableSubstitutes([])
        setRecommendedSubstituteId(null)
        setSubstituteAvailabilityError('Conflict analysis failed. Substitute list was cleared to prevent unsafe assignment. Please try again.')
      } finally {
        setIsCheckingSubstitutes(false)
      }
    }

    refreshAvailableSubstitutes()
  }, [
    isAddModalOpen,
    formData.original_employee_id,
    formData.substitution_date,
    formData.start_time,
    formData.end_time,
    formData.substitute_employee_id,
    originalEmployeeDepartment,
    restrictedDayOfWeek,
  ])

  const loadData = async () => {
    try {
      setLoading(true)
      const substitutionsData = await getClassSubstitutions()
      setSubstitutions(substitutionsData)
    } catch (error) {
      console.error("Error loading data:", error)
      toast({
        title: "Error",
        description: "Failed to load data",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
  }

  const getEmployeeAvatarUrl = (employee: any) => {
    const photoPath = employee?.photo_url || employee?.photo_path || employee?.photo
    if (photoPath) return photoPath

    const rfid = employee.rfid_code
    if (!rfid) return null
    return `/photoprofile/${rfid}.jpg`
  }

  const showWarningDialog = (title: string, description: string) => {
    setWarningMessage({ title, description })
    setWarningDialogOpen(true)
  }

  const validate = (): { isValid: boolean; firstMessage?: string } => {
    const newErrors: Record<string, string> = {}
    const availableSubstitutes = employees.filter(emp => emp.employee_id !== formData.original_employee_id)

    if (!formData.original_employee_id) {
      newErrors.original_employee_id = "Please select the employee who needs a substitute"
    }
    if (!formData.substitute_employee_id) {
      newErrors.substitute_employee_id = "Please select a substitute employee"
    }
    if (formData.original_employee_id === formData.substitute_employee_id) {
      newErrors.substitute_employee_id = "Substitute must be a different employee"
    }
    if (availableSubstitutes.length === 0) {
      newErrors.substitute_employee_id = "No available employee can substitute at this schedule and time"
    }
    if (!formData.start_time || !formData.end_time) {
      newErrors.start_time = "Schedule time is required"
    }
    const selectedDate = new Date(formData.substitution_date)
    selectedDate.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (Number.isNaN(selectedDate.getTime())) {
      newErrors.substitution_date = "Please select a valid date"
    } else if (selectedDate < today) {
      newErrors.substitution_date = "Substitution date cannot be in the past"
    }
    if (restrictedDayOfWeek !== null && selectedDate.getDay() !== restrictedDayOfWeek) {
      newErrors.substitution_date = "Selected date must match the original class day only"
    }
    if (formData.reason && formData.reason.trim().length > 500) {
      newErrors.reason = "Reason must be 500 characters or less"
    }

    setErrors(newErrors)
    const firstMessage = Object.values(newErrors)[0]
    return { isValid: Object.keys(newErrors).length === 0, firstMessage }
  }

  const mapCreateSubstitutionError = (error: any): { title: string; message: string; field?: string } => {
    const code = error?.code
    const details = error?.details || {}

    switch (code) {
      case 'MISSING_REQUIRED_FIELDS':
        return { title: 'Missing Information', message: 'Please complete all required substitution fields before submitting.' }
      case 'SAME_EMPLOYEE':
        return { title: 'Invalid Substitute', message: 'The substitute must be different from the original employee.', field: 'substitute_employee_id' }
      case 'INVALID_TIME_RANGE':
        return { title: 'Invalid Time Range', message: 'Start time must be earlier than end time.', field: 'start_time' }
      case 'INVALID_DATE':
        return { title: 'Invalid Date', message: 'Please pick a valid substitution date.', field: 'substitution_date' }
      case 'ORIGINAL_NO_MATCHING_SCHEDULE':
        return {
          title: 'No Matching Schedule',
          message: `No class schedule found for the original employee on ${details?.substitutionDate || 'the selected date'} at ${details?.requestedRange || 'the selected time'}.`,
          field: 'substitution_date',
        }
      case 'SUBSTITUTE_NOT_ELIGIBLE':
        return { title: 'Ineligible Substitute', message: 'Selected substitute is not active Teaching Part Time/Part Time Full Load.', field: 'substitute_employee_id' }
      case 'DUPLICATE_SUBSTITUTION':
        return { title: 'Duplicate Request', message: 'The same substitution request already exists and is still active.', field: 'substitute_employee_id' }
      case 'SUBSTITUTE_CLASS_CONFLICT':
        return {
          title: 'Class Conflict',
          message: `Selected substitute has a class at ${details?.conflictRange || 'that time'} which overlaps ${details?.requestedRange || 'the requested slot'}. Please choose another substitute.`,
          field: 'substitute_employee_id',
        }
      case 'SUBSTITUTE_EXAM_CONFLICT':
        return {
          title: 'Exam Conflict',
          message: `Selected substitute has an exam at ${details?.conflictRange || 'that time'} which overlaps ${details?.requestedRange || 'the requested slot'}. Please choose another substitute.`,
          field: 'substitute_employee_id',
        }
      case 'SUBSTITUTE_ALREADY_ASSIGNED':
        return {
          title: 'Already Assigned',
          message: `Selected substitute already has another substitution at ${details?.conflictRange || 'that time'}.`,
          field: 'substitute_employee_id',
        }
      case 'REASON_TOO_LONG':
        return { title: 'Reason Too Long', message: 'Reason must be 500 characters or less.', field: 'reason' }
      default:
        return { title: 'Failed to Create Substitution', message: error?.message || 'An unexpected error occurred.' }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('[Class Substitution Submit Clicked]')
    const validation = validate()
    if (!validation.isValid) {
      showWarningDialog('Validation Warning', validation.firstMessage || 'Please review the substitution form fields.')
      return
    }

    try {
      console.log('[Class Substitution Submit]', {
        originalEmployeeId: formData.original_employee_id,
        substituteEmployeeId: formData.substitute_employee_id,
        substitutionDate: format(formData.substitution_date, 'yyyy-MM-dd'),
        startTime: formData.start_time,
        endTime: formData.end_time,
        reason: formData.reason || '',
      })

      await createClassSubstitution({
        original_employee_id: formData.original_employee_id,
        substitute_employee_id: formData.substitute_employee_id,
        substitution_date: format(formData.substitution_date, 'yyyy-MM-dd'),
        start_time: formData.start_time,
        end_time: formData.end_time,
        reason: formData.reason || undefined
      })

      toast({
        title: "Success",
        description: "Substitution request created successfully"
      })
      setSuccessDialogMessage('Successfully submitted a class substitution request.')
      setSuccessDialogOpen(true)

      setIsAddModalOpen(false)
      resetForm()
      loadData()
    } catch (error: any) {
      console.error("Error creating substitution:", error)
      console.error("Error creating substitution metadata:", {
        code: error?.code,
        details: error?.details,
        status: error?.status,
        message: error?.message,
      })
      const mapped = mapCreateSubstitutionError(error)
      if (mapped.field) {
        setErrors(prev => ({ ...prev, [mapped.field as string]: mapped.message }))
      }
      showWarningDialog(mapped.title, mapped.message)
    }
  }

  const resetForm = () => {
    setFormData({
      original_employee_id: 0,
      substitute_employee_id: 0,
      substitution_date: new Date(),
      start_time: "",
      end_time: "",
      reason: ""
    })
    setErrors({})
    setOriginalEmployeeName("")
    setOriginalEmployeeDepartment("")
    setRestrictedDayOfWeek(null)
    setUnavailableSubstitutes([])
    setRecommendedSubstituteId(null)
  }

  const handleCloseModal = () => {
    setIsAddModalOpen(false)
    resetForm()
    // Clear URL parameters to prevent modal from reopening on refresh
    router.push('/dashboard/substitute-assignment')
  }

  const handleStatusUpdate = async (id: number, status: 'approved' | 'rejected' | 'cancelled') => {
    try {
      // Get current user from localStorage
      const userStr = localStorage.getItem('rams_user')
      const currentUser = userStr ? JSON.parse(userStr) : null
      
      await updateSubstitutionStatus(id, status, currentUser?.employee_id)
      
      toast({
        title: "Success",
        description: `Substitution ${status} successfully`
      })
      
      // Close dialogs
      setApproveDialogOpen(false)
      setRejectDialogOpen(false)
      setSelectedSubstitutionId(null)
      setSelectedSubstitution(null)
      
      loadData()
    } catch (error) {
      console.error("Error updating status:", error)
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive"
      })
    }
  }

  const handleDelete = async () => {
    if (!selectedSubstitutionId || !selectedSubstitution) return

    try {
      if (selectedSubstitution.substitution_type === 'exam') {
        await removeExamSubstitution(Math.abs(Number(selectedSubstitutionId)))
      } else {
        await deleteClassSubstitution(selectedSubstitutionId)
      }
      toast({
        title: "Success",
        description: "Substitution deleted successfully"
      })
      setDeleteDialogOpen(false)
      setSelectedSubstitutionId(null)
      setSelectedSubstitution(null)
      loadData()
    } catch (error) {
      console.error("Error deleting substitution:", error)
      toast({
        title: "Error",
        description: (error as any)?.message || "Failed to delete substitution",
        variant: "destructive"
      })
    }
  }
  
  const openDeleteDialog = (sub: any) => {
    setSelectedSubstitution(sub)
    setSelectedSubstitutionId(sub.id)
    setDeleteDialogOpen(true)
  }
  
  const openApproveDialog = (sub: any) => {
    setSelectedSubstitution(sub)
    setSelectedSubstitutionId(sub.id)
    setApproveDialogOpen(true)
  }
  
  const openRejectDialog = (sub: any) => {
    setSelectedSubstitution(sub)
    setSelectedSubstitutionId(sub.id)
    setRejectDialogOpen(true)
  }

  const filteredSubstitutions = substitutions.filter(sub => {
    const matchesSearch = 
      sub.original_employee?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.substitute_employee?.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesStatus = statusFilter === "all" || sub.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const selectedSubstitute = employees.find(
    (emp) => Number(emp.employee_id) === Number(formData.substitute_employee_id)
  )
  const isRecommendedSelection =
    recommendedSubstituteId !== null &&
    Number(formData.substitute_employee_id) === Number(recommendedSubstituteId)

  const getStatusBadge = (status?: string | null) => {
    const variants: Record<string, { color: string; icon: any }> = {
      pending: { color: "bg-yellow-100 text-yellow-700 border-yellow-300", icon: AlertCircle },
      approved: { color: "bg-green-100 text-green-700 border-green-300", icon: CheckCircle },
      rejected: { color: "bg-red-100 text-red-700 border-red-300", icon: XCircle },
      cancelled: { color: "bg-gray-100 text-gray-700 border-gray-300", icon: XCircle }
    }

    const normalizedStatus = typeof status === 'string' && status.trim()
      ? status.trim().toLowerCase()
      : 'pending'
    const variant = variants[normalizedStatus] || variants.pending
    const Icon = variant.icon

    return (
      <Badge className={cn("border", variant.color)}>
        <Icon className="h-3 w-3 mr-1" />
        {normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1)}
      </Badge>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-gray-50 via-blue-50/30 to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                <div className="p-3 bg-linear-to-br from-purple-500 to-pink-600 rounded-xl shadow-lg">
                  <UserCheck className="h-7 w-7 text-white" />
                </div>
                Substitute Assignment
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Manage class substitutions for Part Time and Part Time Full Load teaching staff
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="mt-6 flex gap-4">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search by employee name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={loadData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-purple-600 border-r-transparent"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">Loading substitutions...</p>
            </div>
          </div>
        ) : filteredSubstitutions.length === 0 ? (
          <Card className="p-12 text-center">
            <UserCheck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No Substitutions Found
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {searchQuery || statusFilter !== "all" 
                ? "Try adjusting your filters" 
                : "Click 'Add Substitution' to create a new substitution request"}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredSubstitutions.map((sub) => (
              <Card key={sub.id} className="p-5 border border-slate-200/70 dark:border-slate-800 bg-linear-to-r from-white to-slate-50/70 dark:from-slate-900 dark:to-slate-900/70 hover:shadow-lg hover:-translate-y-[1px] transition-all">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-4">
                      {/* Original Employee */}
                      <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={getEmployeeAvatarUrl(sub.original_employee) || undefined} />
                          <AvatarFallback className="bg-linear-to-br from-blue-500 to-purple-600 text-white">
                            {getInitials(sub.original_employee?.full_name || '')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {sub.original_employee?.full_name}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {sub.original_employee?.department}
                          </p>
                        </div>
                      </div>

                      <div className="text-2xl text-gray-400">→</div>

                      {/* Substitute Employee */}
                      <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={getEmployeeAvatarUrl(sub.substitute_employee) || undefined} />
                          <AvatarFallback className="bg-linear-to-br from-green-500 to-teal-600 text-white">
                            {getInitials(sub.substitute_employee?.full_name || '')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {sub.substitute_employee?.full_name}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {sub.substitute_employee?.department}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="outline" className="rounded-full px-3 py-1 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                        <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                        {format(new Date(sub.substitution_date), 'MMM dd, yyyy')}
                      </Badge>
                      <Badge variant="outline" className="rounded-full px-3 py-1 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                        <Clock className="h-3.5 w-3.5 mr-1.5" />
                        {formatTimeRangeAmPm(sub.start_time, sub.end_time)}
                      </Badge>
                      {getStatusBadge(sub.status)}
                    </div>

                    <div className="mt-2 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Standardized Time Format: AM/PM
                    </div>

                    {sub.reason && (
                      <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          <span className="font-semibold">Reason:</span> {sub.reason}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 ml-4">
                    {sub.status === 'pending' && sub.substitution_type !== 'exam' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => openApproveDialog(sub)}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openRejectDialog(sub)}
                          className="border-red-500 text-red-600 hover:bg-red-50"
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openDeleteDialog(sub)}
                      className="border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      {sub.substitution_type === 'exam' ? 'Remove' : 'Delete'}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add Substitution Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={(open) => {
        if (!open) {
          handleCloseModal()
        }
      }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Substitution Request</DialogTitle>
            <DialogDescription>
              Assign a substitute teacher for a specific date and time period
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            {/* Original Employee - Read Only */}
            <div className="space-y-2">
              <Label>Employee Who Needs Substitute *</Label>
              <Input
                value={originalEmployeeName}
                readOnly
                className="bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
              />
            </div>

            {/* Substitute Employee */}
            <div className="space-y-2">
              <Label>Substitute Employee *</Label>
              {recommendedSubstituteId !== null && employees.some((emp) => Number(emp.employee_id) === Number(recommendedSubstituteId)) && (
                <p className="text-xs text-indigo-600 dark:text-indigo-400">
                  Recommended substitute is pre-selected based on schedule and department match.
                </p>
              )}
              <Select
                value={formData.substitute_employee_id.toString()}
                onValueChange={(value) => {
                  setFormData(prev => ({ ...prev, substitute_employee_id: parseInt(value) }))
                  if (errors.substitute_employee_id) {
                    setErrors(prev => {
                      const newErrors = { ...prev }
                      delete newErrors.substitute_employee_id
                      return newErrors
                    })
                  }
                }}
                disabled={employees.filter(emp => emp.employee_id !== formData.original_employee_id).length === 0}
              >
                <SelectTrigger className={cn("justify-between", errors.substitute_employee_id && "border-red-500")}>
                  {selectedSubstitute ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate">{selectedSubstitute.full_name}</span>
                      {isRecommendedSelection && (
                        <Badge variant="secondary" className="h-5 px-2 text-[10px] shrink-0">
                          Recommended
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <SelectValue placeholder="Select substitute" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {employees.filter(emp => emp.employee_id !== formData.original_employee_id).length === 0 ? (
                    <div className="px-2 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                      No available substitution
                    </div>
                  ) : (
                    <>
                      {employees
                        .filter(emp => emp.employee_id !== formData.original_employee_id && Number(emp.employee_id) === Number(recommendedSubstituteId))
                        .map(emp => (
                          <SelectItem key={emp.employee_id} value={emp.employee_id.toString()}>
                            {emp.full_name} - Recommended
                          </SelectItem>
                        ))}

                      {employees
                        .filter(emp => emp.employee_id !== formData.original_employee_id && Number(emp.employee_id) !== Number(recommendedSubstituteId))
                        .map(emp => (
                          <SelectItem key={emp.employee_id} value={emp.employee_id.toString()}>
                            {emp.full_name} - {emp.employment_status || 'Eligible'}
                          </SelectItem>
                        ))}

                      {unavailableSubstitutes.length > 0 && (
                        <>
                          <div className="px-2 pt-2 pb-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                            Not Available (Schedule/Attendance Conflict)
                          </div>
                          {unavailableSubstitutes.map((emp: any) => (
                            <SelectItem key={`unavailable-${emp.employee_id}`} value={`unavailable-${emp.employee_id}`} disabled>
                              {emp.full_name} - {emp.reason_label}
                            </SelectItem>
                          ))}
                        </>
                      )}
                    </>
                  )}
                </SelectContent>
              </Select>
              {isCheckingSubstitutes && (
                <p className="text-xs text-blue-600 dark:text-blue-400">Checking schedule conflicts for all substitutes...</p>
              )}
              {!isCheckingSubstitutes && employees.length > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400">Only conflict-free substitutes are shown for this date and time.</p>
              )}
              {!!substituteAvailabilityError && (
                <p className="text-xs text-red-600 dark:text-red-400">{substituteAvailabilityError}</p>
              )}
              {!isCheckingSubstitutes && !substituteAvailabilityError && unavailableSubstitutes.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-900/20 p-2">
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">
                    Excluded substitutes due to conflicts ({unavailableSubstitutes.length})
                  </p>
                  <ScrollArea className="h-24 pr-2">
                    <div className="space-y-1">
                      {unavailableSubstitutes.map((emp: any) => (
                        <div key={emp.employee_id} className="text-[11px] text-amber-900 dark:text-amber-200">
                          <span className="font-medium">{emp.full_name}</span>
                          <span className="opacity-80"> - {emp.reason_label}</span>
                          {emp.conflict_range && <span className="opacity-80"> ({emp.conflict_range})</span>}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>

            {/* Date - Restricted to specific day of week */}
            <div className="space-y-2">
              <Label>Substitution Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(formData.substitution_date, 'PPP')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.substitution_date}
                    onSelect={(date) => date && setFormData(prev => ({ ...prev, substitution_date: date }))}
                    disabled={(date) => {
                      const today = new Date()
                      today.setHours(0, 0, 0, 0)
                      
                      // Disable past dates
                      if (date < today) {
                        return true
                      }
                      
                      // If restrictedDayOfWeek is set, only allow that day
                      if (restrictedDayOfWeek !== null) {
                        return date.getDay() !== restrictedDayOfWeek
                      }
                      return false
                    }}
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {restrictedDayOfWeek !== null 
                  ? "Only dates matching the original class weekday can be selected" 
                  : "Past dates cannot be selected"}
              </p>
              {restrictedDayOfWeek !== null && (
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                  Next valid date: {getNextValidDateHint()}
                </p>
              )}
            </div>

            {/* Time Range - Read-only AM/PM display */}
            <div className="space-y-2">
              <Label>Schedule Time *</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-sky-200 bg-sky-50/70 dark:border-sky-900/60 dark:bg-sky-900/20 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-sky-700 dark:text-sky-300">Start</p>
                  <p className="text-base font-semibold text-sky-900 dark:text-sky-100">{formatTimeAmPm(formData.start_time)}</p>
                </div>
                <div className="rounded-xl border border-violet-200 bg-violet-50/70 dark:border-violet-900/60 dark:bg-violet-900/20 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-violet-700 dark:text-violet-300">End</p>
                  <p className="text-base font-semibold text-violet-900 dark:text-violet-100">{formatTimeAmPm(formData.end_time)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Time Format</p>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">AM/PM</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Auto-filled from class schedule and displayed in AM/PM format.
              </p>
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label>Reason (Optional)</Label>
              <Textarea
                value={formData.reason}
                onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Enter reason for substitution..."
                rows={3}
              />
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">Optional note for audit trail</span>
                <span className={cn((formData.reason?.length || 0) > 500 ? 'text-red-600' : 'text-gray-500 dark:text-gray-400')}>
                  {(formData.reason?.length || 0)}/500
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseModal}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isCheckingSubstitutes || !!substituteAvailabilityError}
                className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              >
                Create Substitution
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Substitution Successful</DialogTitle>
            <DialogDescription>{successDialogMessage}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end pt-4">
            <Button onClick={() => setSuccessDialogOpen(false)}>OK</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Delete Substitution Request
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2">
              <p>Are you sure you want to delete this substitution request?</p>
              {selectedSubstitution && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Original Employee:</span>
                    <span className="font-medium">{selectedSubstitution.original_employee?.full_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Substitute:</span>
                    <span className="font-medium">{selectedSubstitution.substitute_employee?.full_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Date:</span>
                    <span className="font-medium">{format(new Date(selectedSubstitution.substitution_date), 'MMM dd, yyyy')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Time:</span>
                    <span className="font-medium">{formatTimeRangeAmPm(selectedSubstitution.start_time, selectedSubstitution.end_time)}</span>
                  </div>
                </div>
              )}
              <p className="text-red-600 dark:text-red-400 font-medium">
                ⚠️ This action cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setDeleteDialogOpen(false)
              setSelectedSubstitutionId(null)
              setSelectedSubstitution(null)
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Validation/Conflict Warning Dialog */}
      <AlertDialog open={warningDialogOpen} onOpenChange={setWarningDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-5 w-5" />
              {warningMessage.title || 'Warning'}
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-2 text-sm">
              {warningMessage.description || 'Please review your input and try again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setWarningDialogOpen(false)}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approve Confirmation Dialog */}
      <AlertDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              Approve Substitution Request
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2">
              <p>Are you sure you want to approve this substitution request?</p>
              {selectedSubstitution && (
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 space-y-2 text-sm border border-green-200 dark:border-green-800">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Original Employee:</span>
                    <span className="font-medium">{selectedSubstitution.original_employee?.full_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Substitute:</span>
                    <span className="font-medium">{selectedSubstitution.substitute_employee?.full_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Date:</span>
                    <span className="font-medium">{format(new Date(selectedSubstitution.substitution_date), 'MMM dd, yyyy')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Time:</span>
                    <span className="font-medium">{formatTimeRangeAmPm(selectedSubstitution.start_time, selectedSubstitution.end_time)}</span>
                  </div>
                  {selectedSubstitution.reason && (
                    <div className="pt-2 border-t border-green-200 dark:border-green-800">
                      <span className="text-gray-600 dark:text-gray-400">Reason:</span>
                      <p className="font-medium mt-1">{selectedSubstitution.reason}</p>
                    </div>
                  )}
                </div>
              )}
              <p className="text-green-600 dark:text-green-400 font-medium">
                ✓ The original employee will be automatically marked as absent for this date.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setApproveDialogOpen(false)
              setSelectedSubstitutionId(null)
              setSelectedSubstitution(null)
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedSubstitutionId && handleStatusUpdate(selectedSubstitutionId, 'approved')}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Confirmation Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-orange-600">
              <XCircle className="h-5 w-5" />
              Reject Substitution Request
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2">
              <p>Are you sure you want to reject this substitution request?</p>
              {selectedSubstitution && (
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 space-y-2 text-sm border border-orange-200 dark:border-orange-800">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Original Employee:</span>
                    <span className="font-medium">{selectedSubstitution.original_employee?.full_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Substitute:</span>
                    <span className="font-medium">{selectedSubstitution.substitute_employee?.full_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Date:</span>
                    <span className="font-medium">{format(new Date(selectedSubstitution.substitution_date), 'MMM dd, yyyy')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Time:</span>
                    <span className="font-medium">{formatTimeRangeAmPm(selectedSubstitution.start_time, selectedSubstitution.end_time)}</span>
                  </div>
                </div>
              )}
              <p className="text-orange-600 dark:text-orange-400 font-medium">
                ℹ️ The substitution request will be marked as rejected.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setRejectDialogOpen(false)
              setSelectedSubstitutionId(null)
              setSelectedSubstitution(null)
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedSubstitutionId && handleStatusUpdate(selectedSubstitutionId, 'rejected')}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
