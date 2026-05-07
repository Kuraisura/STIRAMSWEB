"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Search, CheckCircle, XCircle, Clock, FileText, Eye, MessageSquare, PlusCircle, CalendarIcon, UserCheck, ArrowLeftRight, Trash2, AlertCircle, Scan, Plus, Filter, Loader2, Calendar as CalendarIconLucide, ChevronLeft, ChevronRight } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { format } from "date-fns"
import { formatInTimeZone } from "date-fns-tz"
import { getManilaToday } from "@/lib/timezone-utils"
import { useToast } from "@/hooks/use-toast"
import { getEmployees, getTeachingSchedulesForEmployee, getExamSchedulesForEmployee, getDepartments, getStaffTypeFilter } from "@/lib/offline-dashboard-client"
import { filterVerificationRequests } from "@/lib/verification-filter-helper"
import { getCurrentAcademicTerm } from "@/lib/academic-term-utils"
import type { AcademicTerm, Employee } from "@/lib/types/database.types"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"

const formatDbTime12h = (time: string): string => {
  if (!time) return ''
  if (time.includes('AM') || time.includes('PM')) {
    const cleaned = time.trim()
    if (cleaned.match(/\s+(AM|PM)\s+(AM|PM)$/i)) {
      return cleaned.replace(/\s+(AM|PM)\s+(AM|PM)$/i, ' $1')
    }
    return cleaned
  }
  const [hStr, mStr] = time.split(':')
  const hNum = Number(hStr)
  const period = hNum >= 12 ? 'PM' : 'AM'
  const hh = hNum % 12 || 12
  const minutes = mStr ? mStr.split(' ')[0] : '00'
  return `${hh.toString().padStart(2,'0')}:${minutes} ${period}`
}

const READJUST_HALF_HOUR_MINUTES = ['00', '30'] as const
const READJUST_HOURS_12 = ['12', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11'] as const

const parseTimePartsFor12hPicker = (
  value: string
): { hour12: string; minute: string; period: 'AM' | 'PM' } => {
  const raw = String(value || '').trim()
  if (!raw) return { hour12: '12', minute: '00', period: 'AM' }

  const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i)
  if (ampmMatch) {
    const hourRaw = Number(ampmMatch[1])
    const minuteRaw = String(ampmMatch[2]).padStart(2, '0')
    const period = String(ampmMatch[3]).toUpperCase() === 'PM' ? 'PM' : 'AM'
    const safeHour = Number.isFinite(hourRaw) && hourRaw >= 1 && hourRaw <= 12 ? hourRaw : 12
    return {
      hour12: String(safeHour).padStart(2, '0'),
      minute: minuteRaw,
      period,
    }
  }

  const twentyFourHourMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (twentyFourHourMatch) {
    const hour24 = Number(twentyFourHourMatch[1])
    const minuteRaw = String(twentyFourHourMatch[2]).padStart(2, '0')
    const safe24 = Number.isFinite(hour24) && hour24 >= 0 && hour24 <= 23 ? hour24 : 0
    const period: 'AM' | 'PM' = safe24 >= 12 ? 'PM' : 'AM'
    const hour12 = safe24 % 12 || 12
    return {
      hour12: String(hour12).padStart(2, '0'),
      minute: minuteRaw,
      period,
    }
  }

  return { hour12: '12', minute: '00', period: 'AM' }
}

const build24HourTimeFrom12hParts = (
  hour12: string,
  minute: string,
  period: 'AM' | 'PM'
): string => {
  let hour = Number(hour12)
  if (!Number.isFinite(hour) || hour < 1 || hour > 12) hour = 12
  const minuteNum = Number(minute)
  const safeMinute = (Number.isFinite(minuteNum) && minuteNum >= 0 && minuteNum <= 59) 
    ? String(minuteNum).padStart(2, '0') 
    : '00'

  if (period === 'AM') {
    if (hour === 12) hour = 0
  } else if (hour !== 12) {
    hour += 12
  }

  return `${String(hour).padStart(2, '0')}:${safeMinute}`
}

const normalizeToHalfHourHhMm = (value: string): string => {
  const parts = parseTimePartsFor12hPicker(value)
  return build24HourTimeFrom12hParts(parts.hour12, parts.minute, parts.period)
}

/** Check if a 24h time string (HH:mm) is within 6:00 AM – 9:00 PM range */
const isTimeInMissedLogRange = (timeStr: string | null | undefined): boolean => {
  if (!timeStr) return true // No time selected yet — don't show error
  const match = String(timeStr).match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return true
  const hour = Number(match[1])
  const minute = Number(match[2])
  const totalMinutes = hour * 60 + minute
  return totalMinutes >= 360 && totalMinutes <= 1260 // 6:00 (360) to 21:00 (1260)
}

const requestStatuses = ["All Statuses", "pending", "approved", "rejected"]
const requestTypes = ["All Types", "missed_log", "leave"]

export default function VerificationPage() {
  type CoverageSlot = {
    start: string
    end: string
    label: string
    source: 'substituted' | 'own' | 'original-remaining'
  }

  type CoveragePreview = {
    slots: CoverageSlot[]
    substitutedSlots: CoverageSlot[]
    ownSlots: CoverageSlot[]
    remainingOriginalSlots: CoverageSlot[]
    finalStart: string
    finalEnd: string
    hasOverlapConflict: boolean
  }

  const getScheduleSelectionKey = (schedule: any): string => {
    return `${String(schedule?.schedule_type || '').toLowerCase()}-${Number(schedule?.schedule_id || 0)}`
  }

  const parseTimeToMinutes = (timeRaw: string): number | null => {
    const value = String(timeRaw || '').trim()
    if (!value) return null
    const [h, m] = value.split(':').slice(0, 2).map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null
    return (h * 60) + m
  }

  const convertTimeToDbFormat = (timeRaw: string): string => {
    const value = String(timeRaw || '').trim()
    if (!value) return '00:00:00'
    const split = value.split(':')
    if (split.length >= 3) return `${split[0].padStart(2, '0')}:${split[1].padStart(2, '0')}:${split[2].padStart(2, '0')}`
    if (split.length === 2) return `${split[0].padStart(2, '0')}:${split[1].padStart(2, '0')}:00`
    return value
  }

  const [verificationRequests, setVerificationRequests] = useState<any[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [workflowCategory, setWorkflowCategory] = useState<'all' | 'needs_action' | 'done'>('needs_action')
  const [selectedStatus, setSelectedStatus] = useState("All Statuses")
  const [selectedType, setSelectedType] = useState("All Types")
  const [selectedDepartment, setSelectedDepartment] = useState("All Departments")
  const [selectedSort, setSelectedSort] = useState<'requested_desc' | 'requested_asc'>("requested_desc")
  const [selectedDateRange, setSelectedDateRange] = useState<'all' | 'today' | 'last_7_days' | 'this_month' | 'custom'>('all')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [selectedRequest, setSelectedRequest] = useState<any>(null)
  const [substitutionDetails, setSubstitutionDetails] = useState<any>(null)
  const [reviewNotes, setReviewNotes] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [showBulkReviewConfirm, setShowBulkReviewConfirm] = useState(false)
  const [bulkReviewAction, setBulkReviewAction] = useState<'approved' | 'rejected'>('approved')
  const [bulkReviewInProgress, setBulkReviewInProgress] = useState(false)
  const [bulkReviewWizardStep, setBulkReviewWizardStep] = useState<1 | 2 | 3>(1)
  const [showBulkReviewCloseConfirm, setShowBulkReviewCloseConfirm] = useState(false)
  const [bulkReviewAttendanceComparison, setBulkReviewAttendanceComparison] = useState<any[]>([])
  const [bulkReviewComparisonLoading, setBulkReviewComparisonLoading] = useState(false)
  const [bulkReviewShowConflictsOnly, setBulkReviewShowConflictsOnly] = useState(false)
  const [deleteInProgress, setDeleteInProgress] = useState(false)
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<number>>(new Set())
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<any>({
    employee_id: 0,
    request_type: '', // Start empty - user must select after choosing employee
    date: '',
    time: '',
    time_start: '', 
    time_end: '', 
    requires_substitution: false, 
    substitute_employee_id: 0, 
    manual_schedule_override: false,
    reason: '',
    notes: ''
  })
  const [employeeScheduledDays, setEmployeeScheduledDays] = useState<Set<number>>(new Set())
  const [currentAcademicTerm, setCurrentAcademicTerm] = useState<AcademicTerm | null>(null)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [showSubstitutionDialog, setShowSubstitutionDialog] = useState(false)
  const [substitutionDialogViewMode, setSubstitutionDialogViewMode] = useState<'view' | 'approve'>('approve') // 'view' for viewing pending, 'approve' for approving
  const [pendingApproval, setPendingApproval] = useState<{ requestId: number, employee_id: number, schedules: any[], allSchedules?: any[], specificScheduleId?: number | null, specificScheduleType?: 'teaching' | 'exam' | 'manual' | null } | null>(null)
  const [showSubstitutionWarningDialog, setShowSubstitutionWarningDialog] = useState(false)
  const [substitutionWarningMessage, setSubstitutionWarningMessage] = useState('')
  const [substitutionForms, setSubstitutionForms] = useState<Record<string, {
    substituteEmployeeId: string,
    unavailableReason: string,
    status: 'on-leave' | 'absent' | 'unavailable',
    substitutionDate?: string,
    manualMode?: boolean,
    manualTimeStart?: string,
    manualTimeEnd?: string,
  }>>({})
  const [substitutionDatePickerOpen, setSubstitutionDatePickerOpen] = useState<Record<string, boolean>>({})
  const [selectedScheduleForSubstitution, setSelectedScheduleForSubstitution] = useState<{ scheduleId: number, scheduleType: 'teaching' | 'exam' | 'manual' } | null>(null)
  const [availableSubstitutesMap, setAvailableSubstitutesMap] = useState<Record<string, any[]>>({}) // Store available substitutes per schedule
  const [retapInProgress, setRetapInProgress] = useState(false)
  const [reviewDayLogs, setReviewDayLogs] = useState<any[]>([])
  const [reviewOverviewLoading, setReviewOverviewLoading] = useState(false)
  const [coveragePreviewLoading, setCoveragePreviewLoading] = useState<Record<string, boolean>>({})
  const [coveragePreviewMap, setCoveragePreviewMap] = useState<Record<string, CoveragePreview | null>>({})
  const { toast} = useToast()

  // Validation dialog state
  const [validationOpen, setValidationOpen] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set()) // Track which fields are invalid for red highlighting

  // Generic page-level error dialog (replaces red toast on this page)
  const [pageErrorOpen, setPageErrorOpen] = useState(false)
  const [pageErrorTitle, setPageErrorTitle] = useState('Error')
  const [pageErrorMessage, setPageErrorMessage] = useState<string>('')
  const openPageError = (title: string, message: string) => {
    setPageErrorTitle(title)
    setPageErrorMessage(message)
    setPageErrorOpen(true)
  }

  const [leaveRequests, setLeaveRequests] = useState<any[]>([])
  const [leaveTypes, setLeaveTypes] = useState<any[]>([])
  const [leaveCredits, setLeaveCredits] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [leaveLoading, setLeaveLoading] = useState(true)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [leaveFormData, setLeaveFormData] = useState({
    leave_type_id: '',
    date_from: '',
    date_to: '',
    reason: ''
  })
  const [leaveApprovalRequests, setLeaveApprovalRequests] = useState<any[]>([])
  const [selectedLeaveRequest, setSelectedLeaveRequest] = useState<any>(null)
  const [leaveReviewDialog, setLeaveReviewDialog] = useState(false)
  const [leaveReviewAction, setLeaveReviewAction] = useState<'approve' | 'deny'>('approve')
  const [leaveRemarks, setLeaveRemarks] = useState('')
  const [leaveFilterStatus, setLeaveFilterStatus] = useState<string>('pending')
  const [showReviewDialog, setShowReviewDialog] = useState(false)
  const [leaveSearchQuery, setLeaveSearchQuery] = useState('')

  // Time Correction enhancement states
  const [actualAttendanceLog, setActualAttendanceLog] = useState<any>(null)
  const [loadingAttendanceLog, setLoadingAttendanceLog] = useState(false)
  const [correctedTime, setCorrectedTime] = useState<string>('')
  const [correctedStatus, setCorrectedStatus] = useState<string>('on-time')

  // New Filing enhancement states - Attendance log selection
  const [availableAttendanceLogs, setAvailableAttendanceLogs] = useState<any[]>([])
  const [loadingAvailableLogs, setLoadingAvailableLogs] = useState(false)
  const [selectedAttendanceLog, setSelectedAttendanceLog] = useState<string>('')
  const [employeeAttendanceDates, setEmployeeAttendanceDates] = useState<Set<string>>(new Set())
  const [employeeCompleteDates, setEmployeeCompleteDates] = useState<Set<string>>(new Set()) // Dates with BOTH IN and OUT
  const [employeePartialDates, setEmployeePartialDates] = useState<Set<string>>(new Set()) // Dates with only IN or only OUT
  const [loadingAttendanceDates, setLoadingAttendanceDates] = useState(false)
  const [employeeHasAnyLogs, setEmployeeHasAnyLogs] = useState<boolean>(false) // Track if employee has any logs at all

  // Leave restriction warning dialog
  const [leaveRestrictionDialogOpen, setLeaveRestrictionDialogOpen] = useState(false)
  const [leaveRestrictionMessage, setLeaveRestrictionMessage] = useState({ employeeName: '', daysRemaining: 0 })
  const [leaveLimits, setLeaveLimits] = useState<{ teaching: number; nonTeaching: number }>({ teaching: 10, nonTeaching: 10 })
  const [leaveLimitsLoading, setLeaveLimitsLoading] = useState(false)
  const [leaveLimitsSaving, setLeaveLimitsSaving] = useState(false)
  const [createLeaveScheduleLoading, setCreateLeaveScheduleLoading] = useState(false)
  const [createLeaveScheduleOptions, setCreateLeaveScheduleOptions] = useState<any[]>([])
  const [createSelectedLeaveScheduleKeys, setCreateSelectedLeaveScheduleKeys] = useState<Set<string>>(new Set())
  const [createSubstituteConflictLoading, setCreateSubstituteConflictLoading] = useState(false)
  const [createSubstituteConflictMap, setCreateSubstituteConflictMap] = useState<Record<string, {
    hasConflict: boolean
    reason: string
    conflictRange?: string
  }>>({})
  const [createLeaveCoveragePreview, setCreateLeaveCoveragePreview] = useState<{
    finalStart: string
    finalEnd: string
    hasOverlapConflict: boolean
    selectedCount: number
    remainingCount: number
  } | null>(null)

  const getReviewerId = (): number | null => {
    const stateId = Number((currentUser as any)?.id || 0)
    if (Number.isFinite(stateId) && stateId > 0) return stateId

    if (typeof window === 'undefined') return null

    const userKeys = ['rams_user', 'user']
    for (const key of userKeys) {
      try {
        const raw = localStorage.getItem(key)
        if (!raw) continue
        const parsed = JSON.parse(raw)
        const candidateId = Number(parsed?.id || 0)
        if (Number.isFinite(candidateId) && candidateId > 0) return candidateId
      } catch {
        // Ignore malformed local storage values and continue checking other keys.
      }
    }

    return null
  }

  // Get staff type filter
  const getStaffFilter = () => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('rams_user')
      const user = userStr ? JSON.parse(userStr) : null
      return getStaffTypeFilter(user?.email, user?.role)
    }
    return null
  }

  useEffect(() => {
    ;(async () => {
      await loadData()
    })()
    
    // Fetch current academic term
    console.log('[DEBUG] Fetching current academic term...')
    getCurrentAcademicTerm().then((term) => {
      console.log('[DEBUG] Academic term fetched successfully:', {
        term_name: term?.term_name,
        academic_year: term?.academic_year,
        is_active: term?.is_active,
        start_date: term?.start_date,
        end_date: term?.end_date,
        full_data: term
      })
      setCurrentAcademicTerm(term)
    }).catch((error) => {
      console.error('[DEBUG] Error fetching academic term:', error)
    })
    
    const staffTypeFilter = getStaffFilter()
    getEmployees(true, true, false, staffTypeFilter).then((allEmployees) => {
      // Store ALL employees (no 1-year restriction here)
      // The 1-year check will be done in the dropdown filter for LEAVE requests only
      setEmployees(allEmployees)
    }).catch(()=>{})
    getDepartments().then(setDepartments).catch(()=>{}) // Fetch departments for acronym lookup
    
    fetchLeaveData()
    fetchLeaveApprovalRequests()
    loadLeaveLimits()
  }, [])

  const loadLeaveLimits = async () => {
    try {
      setLeaveLimitsLoading(true)
      const res = await fetch('/api/settings', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Failed to load leave limit settings')

      const items = Array.isArray(json?.items) ? json.items : []
      const getSetting = (key: string): string | null => {
        const row = items.find((it: any) => String(it?.setting_key || '') === key)
        return row?.setting_value != null ? String(row.setting_value) : null
      }

      const teaching = Number(getSetting('max_leaves_per_year_teaching') ?? '10')
      const nonTeaching = Number(getSetting('max_leaves_per_year_non_teaching') ?? '10')

      setLeaveLimits({
        teaching: Number.isFinite(teaching) && teaching >= 0 ? teaching : 10,
        nonTeaching: Number.isFinite(nonTeaching) && nonTeaching >= 0 ? nonTeaching : 10,
      })
    } catch (error: any) {
      console.error('[Verification] Failed to load leave limits:', error)
      setLeaveLimits({ teaching: 10, nonTeaching: 10 })
    } finally {
      setLeaveLimitsLoading(false)
    }
  }

  const saveLeaveLimits = async () => {
    const teaching = Math.max(0, Math.floor(Number(leaveLimits.teaching || 0)))
    const nonTeaching = Math.max(0, Math.floor(Number(leaveLimits.nonTeaching || 0)))

    try {
      setLeaveLimitsSaving(true)
      const requests = [
        fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ setting_key: 'max_leaves_per_year_teaching', setting_value: String(teaching) }),
        }),
        fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ setting_key: 'max_leaves_per_year_non_teaching', setting_value: String(nonTeaching) }),
        }),
      ]

      const results = await Promise.all(requests)
      for (const res of results) {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.error || 'Failed to save leave limit settings')
        }
      }

      setLeaveLimits({ teaching, nonTeaching })
      toast({ title: 'Success', description: 'Leave token limits updated successfully.' })
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to save leave token limits.', variant: 'destructive' })
    } finally {
      setLeaveLimitsSaving(false)
    }
  }

  // Refetch leave approval requests when filter changes
  useEffect(() => {
    if (leaveFilterStatus) {
      fetchLeaveApprovalRequests()
    }
  }, [leaveFilterStatus])

  // Helper function to get department acronym
  const getDepartmentAcronym = (deptName: string): string => {
    if (!deptName) return 'N/A'
    const dept = departments.find((d: any) => d.name === deptName)
    return dept?.acronym || deptName // Fallback to full name if acronym not found
  }

  const getTermParam = (): '1st_term' | '2nd_term' | 'summer' | null => {
    if (currentAcademicTerm?.term_name === '1st Term') return '1st_term'
    if (currentAcademicTerm?.term_name === '2nd Term') return '2nd_term'
    if (currentAcademicTerm?.term_name === 'Summer') return 'summer'
    return null
  }

  const toDatePart = (value: unknown): string | null => {
    const raw = String(value || '').trim()
    if (!raw) return null
    const datePart = raw.slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null
  }

  const getEmployeeStartDatePart = (employeeData: any): string | null => {
    // Missed Log eligibility is based on START DATE (not hire date).
    // Fallback to hire_date only when start_date is missing (legacy rows).
    return toDatePart(employeeData?.start_date) || toDatePart(employeeData?.hire_date)
  }

  const hasEmployeeStartedForMissedLog = (employeeData: any): boolean => {
    const startDatePart = getEmployeeStartDatePart(employeeData)
    if (!startDatePart) return false
    return getManilaToday() >= startDatePart
  }

  const getLeaveRestriction = (employeeData: any): { allowed: boolean; daysRemaining: number } => {
    const hireDatePart = toDatePart(employeeData?.hire_date)
    if (!hireDatePart) return { allowed: false, daysRemaining: 0 }
    const hireDate = new Date(`${hireDatePart}T00:00:00+08:00`)
    const oneYearFromHire = new Date(hireDate)
    oneYearFromHire.setFullYear(oneYearFromHire.getFullYear() + 1)
    const todayManila = new Date(`${getManilaToday()}T00:00:00+08:00`)
    if (todayManila >= oneYearFromHire) return { allowed: true, daysRemaining: 0 }
    const daysRemaining = Math.ceil((oneYearFromHire.getTime() - todayManila.getTime()) / (1000 * 60 * 60 * 24))
    return { allowed: false, daysRemaining: Math.max(0, daysRemaining) }
  }

  const getLeaveEligibleDatePart = (employeeData: any): string | null => {
    const hireDatePart = toDatePart(employeeData?.hire_date)
    if (!hireDatePart) return null
    const hireDate = new Date(`${hireDatePart}T00:00:00+08:00`)
    hireDate.setFullYear(hireDate.getFullYear() + 1)
    const y = hireDate.getFullYear()
    const m = String(hireDate.getMonth() + 1).padStart(2, '0')
    const d = String(hireDate.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const hasScheduleCoverageForDate = (employeeId: number, dateStr: string): boolean => {
    const employeeData: any = employees.find((e: any) => e.employee_id === employeeId) || null
    if (!employeeData) return false

    const staffType = String(employeeData.staff_type || '').trim()
    if (staffType === 'Non-Teaching') {
      return Boolean(employeeData.schedule_time_in && employeeData.schedule_time_out)
    }

    // Part Time Full Load Teaching staff: all weekdays (Mon-Sat) always have coverage
    const empStatus = String(employeeData.employment_status || '').toLowerCase().replace(/[\s_-]+/g, '')
    if (staffType === 'Teaching' && empStatus === 'parttimefullload') {
      if (!dateStr) return false
      const dateObj = new Date(`${dateStr}T00:00:00+08:00`)
      return dateObj.getDay() !== 0 // All days except Sunday
    }

    if (!dateStr) return false
    const dateObj = new Date(`${dateStr}T00:00:00+08:00`)
    const jsDay = dateObj.getDay()
    if (jsDay === 0) return false
    return employeeScheduledDays.has(jsDay)
  }

  const getDateDisableReason = (date: Date): 'past' | 'future' | 'before_hire' | 'sunday' | 'unscheduled' | 'has_complete_logs' | null => {
    const todayStr = getManilaToday()
    const dateStr = formatInTimeZone(date, 'Asia/Manila', 'yyyy-MM-dd')
    const jsDayInManila = Number(formatInTimeZone(date, 'Asia/Manila', 'i')) // 1=Mon .. 7=Sun
    if (jsDayInManila === 7) return 'sunday'

    if (createForm.request_type === 'missed_log') {
      // MISSED LOG: only past dates allowed (today is also allowed — employee may have missed a tap earlier today)
      if (dateStr > todayStr) return 'future'
      
      // Block dates before the employee's START DATE (not hire date)
      const selectedEmployee = employees.find((emp: any) => Number(emp.employee_id) === Number(createForm.employee_id)) as any
      const startDatePart = toDatePart(selectedEmployee?.start_date)
      const effectiveStartDatePart = startDatePart || toDatePart(selectedEmployee?.hire_date) // fallback only if missing
      if (effectiveStartDatePart && dateStr < effectiveStartDatePart) return 'before_hire'
      
      // Block dates that already have both IN and OUT logs (complete attendance)
      if (employeeCompleteDates.has(dateStr)) return 'has_complete_logs'
    } else {
      // LEAVE and other types: only future dates allowed
      if (dateStr < todayStr) return 'past'
    }

    const requiresSchedule = createForm.request_type === 'missed_log' || createForm.request_type === 'leave'
    if (requiresSchedule && createForm.employee_id && createForm.employee_id > 0) {
      // Part Time Full Load Teaching staff can file missed logs for ANY weekday (Mon-Sat)
      const selectedEmp = employees.find((emp: any) => Number(emp.employee_id) === Number(createForm.employee_id)) as any
      const isPartTimeFullLoadTeaching =
        createForm.request_type === 'missed_log' &&
        String(selectedEmp?.staff_type || '').toLowerCase() === 'teaching' &&
        String(selectedEmp?.employment_status || '').toLowerCase().replace(/[\s_-]+/g, '') === 'parttimefullload'
      
      if (!isPartTimeFullLoadTeaching) {
        // Normal schedule check for other staff
        if (employeeScheduledDays.size === 0) return 'unscheduled'
        const jsDayOfWeek = jsDayInManila % 7 // 1..6 for Mon..Sat, 0 for Sun (already handled)
        if (!employeeScheduledDays.has(jsDayOfWeek)) return 'unscheduled'
      }
      // Part Time Full Load Teaching: Mon-Sat all allowed (Sunday already blocked above)
    }

    return null
  }

  const isDateDisabled = (date: Date) => getDateDisableReason(date) !== null

  // Handle pending substitution from employees page after data loads
  useEffect(() => {
    if (verificationRequests.length === 0 || isLoading) return
    
    // Check for pending substitution from employees page
    const pendingSub = sessionStorage.getItem('pending_substitution')
    if (pendingSub) {
      try {
        const subData = JSON.parse(pendingSub)
        
        // Find the request
        const request = verificationRequests.find(r => r.request_id === subData.requestId)
        if (request) {
          // Just show a toast notification - don't auto-open the dialog
          // User must click the view button to see the substitution dialog
          toast({
            title: "Substitute Filing Created",
            description: "Please click the view button to review and assign a substitute for the schedule.",
          })
          // Clear the sessionStorage so it doesn't trigger again
          sessionStorage.removeItem('pending_substitution')
        } else {
          // Request not found, clear the pending data
          sessionStorage.removeItem('pending_substitution')
          openPageError('Request Not Found', 'The verification request was not found. Please try again.')
        }
      } catch (e) {
        console.error('Error parsing pending_substitution:', e)
        sessionStorage.removeItem('pending_substitution')
      }
    }
  }, [verificationRequests, isLoading])

  const filteredRequests = useMemo(() => {
    return filterVerificationRequests(verificationRequests as any[], {
      searchTerm,
      selectedStatus,
      selectedType,
      selectedDepartment,
      selectedDateRange,
      customStartDate,
      customEndDate,
      workflowCategory,
      selectedSort,
      staffTypeFilter: getStaffFilter(),
    }) as any[]
  }, [
    verificationRequests,
    searchTerm,
    selectedStatus,
    selectedType,
    selectedDepartment,
    selectedDateRange,
    customStartDate,
    customEndDate,
    workflowCategory,
    selectedSort,
  ])

  useEffect(() => {
    const visibleIds = new Set(
      filteredRequests.map((r: any) => Number(r.request_id)).filter((id: number) => Number.isFinite(id))
    )
    setSelectedRequestIds((prev) => {
      const next = new Set<number>()
      prev.forEach((id) => {
        if (visibleIds.has(id)) next.add(id)
      })
      return next
    })
  }, [filteredRequests])

  // Fetch employee schedules when employee is selected
  useEffect(() => {
    const fetchEmployeeSchedules = async () => {
      if (!createForm.employee_id || createForm.employee_id === 0) {
        setEmployeeScheduledDays(new Set())
        return
      }

      try {
        console.log('=== SCHEDULE DEBUG START ===')
        console.log('[Verification] Fetching schedules for employee_id:', createForm.employee_id)
        console.log('[Verification] Current academic term:', currentAcademicTerm)

        // Use already-loaded employees list to avoid direct DB calls from the page.
        const employeeData: any = employees.find((e: any) => e.employee_id === createForm.employee_id) || null
        
        console.log('[DEBUG] Employee data:', employeeData)
        
        // If Non-Teaching staff with work schedule, they work Monday-Saturday
        if (employeeData?.staff_type === 'Non-Teaching' && employeeData.schedule_time_in && employeeData.schedule_time_out) {
          console.log('[DEBUG] Non-Teaching staff detected with work schedule')
          console.log('[DEBUG] Work hours:', employeeData.schedule_time_in, '-', employeeData.schedule_time_out)
          
          // Non-Teaching staff work Monday (1) through Saturday (6)
          const nonTeachingSchedule = new Set<number>([1, 2, 3, 4, 5, 6])
          console.log('[DEBUG] Setting Non-Teaching schedule: Monday-Saturday')
          console.log('[DEBUG] Final scheduled days Set:', Array.from(nonTeachingSchedule))
          console.log('=== SCHEDULE DEBUG END ===')
          
          setEmployeeScheduledDays(nonTeachingSchedule)
          
          // Auto-select default type if not already set
          if (!createForm.request_type) {
            const leaveRestriction = getLeaveRestriction(employeeData)
            const canMissedLog = hasEmployeeStartedForMissedLog(employeeData)
            const defaultType = leaveRestriction.allowed ? 'leave' : (canMissedLog ? 'missed_log' : '')
            if (defaultType) {
              setCreateForm((p: any) => ({ ...p, request_type: defaultType }))
              console.log(`[Verification] Auto-selected type: ${defaultType} (Non-Teaching)`)
            }
          }
          
          return // Exit early for Non-Teaching staff
        }
        
        // For Teaching staff, use helper methods and filter by active term client-side.
        console.log('[DEBUG] Teaching staff or no work schedule - checking class/exam schedules')
        const [allTeachingSchedules, allExamSchedules] = await Promise.all([
          getTeachingSchedulesForEmployee(createForm.employee_id),
          getExamSchedulesForEmployee(createForm.employee_id),
        ])

        const termParam = getTermParam()
        console.log('[Verification] Using term parameter:', termParam)

        const teachingData = termParam
          ? (allTeachingSchedules || []).filter((s: any) => s.term === termParam)
          : (allTeachingSchedules || [])
        const examData = termParam
          ? (allExamSchedules || []).filter((s: any) => s.term === termParam)
          : (allExamSchedules || [])

        const effectiveTeaching = teachingData.length > 0 ? teachingData : (allTeachingSchedules || [])
        const effectiveExam = examData.length > 0 ? examData : (allExamSchedules || [])

        console.log('[DEBUG] Filtered teaching schedules:', {
          count: effectiveTeaching.length || 0,
          data: effectiveTeaching
        })
        console.log('[DEBUG] Filtered exam schedules:', {
          count: effectiveExam.length || 0,
          data: effectiveExam
        })

        // Collect all scheduled days of week
        const scheduledDays = new Set<number>()
        
        // Add teaching schedule days (1=Monday, 2=Tuesday, ..., 6=Saturday)
        effectiveTeaching.forEach((sched: any, index: number) => {
          console.log(`[DEBUG] Teaching schedule #${index + 1}:`, sched)
          console.log(`[DEBUG]   - day_of_week: ${sched.day_of_week} (type: ${typeof sched.day_of_week})`)
          console.log(`[DEBUG]   - term: ${sched.term}`)
          
          if (sched.day_of_week && sched.day_of_week >= 1 && sched.day_of_week <= 6) {
            scheduledDays.add(sched.day_of_week)
            console.log(`[DEBUG]   - ✓ Added day ${sched.day_of_week} to scheduled days`)
          } else {
            console.log(`[DEBUG]   - ✗ Skipped (invalid day_of_week)`)
          }
        })

        // Add exam schedule days
        effectiveExam.forEach((exam: any, index: number) => {
          console.log(`[DEBUG] Exam schedule #${index + 1}:`, exam)
          console.log(`[DEBUG]   - day_of_week: ${exam.day_of_week} (type: ${typeof exam.day_of_week})`)
          
          if (exam.day_of_week && exam.day_of_week >= 1 && exam.day_of_week <= 6) {
            scheduledDays.add(exam.day_of_week)
            console.log(`[DEBUG]   - ✓ Added day ${exam.day_of_week} to scheduled days`)
          }
          // Also check for specific exam_date entries
          if (exam.exam_date) {
            try {
              const examDate = new Date(exam.exam_date + 'T00:00:00+08:00')
              const dayOfWeek = examDate.getDay()
              console.log(`[DEBUG]   - exam_date: ${exam.exam_date}, dayOfWeek: ${dayOfWeek}`)
              // Convert JS day (0=Sunday, 1=Monday) to schedule day (1=Monday, 2=Tuesday, ..., 6=Saturday)
              if (dayOfWeek > 0) {
                scheduledDays.add(dayOfWeek) // JS Monday (1) = Schedule Monday (1), etc.
                console.log(`[DEBUG]   - ✓ Added day ${dayOfWeek} from exam_date`)
              }
            } catch {}
          }
        })

        console.log('[DEBUG] Final scheduled days Set:', Array.from(scheduledDays))
        console.log('=== SCHEDULE DEBUG END ===')
        console.log('[Verification] Collected scheduled days:', Array.from(scheduledDays))
        setEmployeeScheduledDays(scheduledDays)
        
        // Auto-select default type based on what's available
        if (!createForm.request_type) {
          // Priority: 1. Leave (1-year tenure met), 2. Missed Log (work has started), 3. Nothing
          if (scheduledDays.size > 0) {
            const leaveRestriction = getLeaveRestriction(employeeData)
            const canMissedLog = hasEmployeeStartedForMissedLog(employeeData)
            const defaultType = leaveRestriction.allowed ? 'leave' : (canMissedLog ? 'missed_log' : '')
            if (defaultType) {
              setCreateForm((p: any) => ({ ...p, request_type: defaultType }))
              console.log(`[Verification] Auto-selected type: ${defaultType}`)
            }
          }
        }
      } catch (error) {
        console.error('[Verification] Error fetching employee schedules:', error)
        setEmployeeScheduledDays(new Set())
      }
    }

    fetchEmployeeSchedules()
  }, [createForm.employee_id, currentAcademicTerm, employees])

  // Fetch all attendance dates when employee is selected (for all request types to determine availability)
  useEffect(() => {
    if (createForm.employee_id) {
      fetchEmployeeAttendanceDates(createForm.employee_id)
    } else {
      setEmployeeAttendanceDates(new Set())
      setEmployeeHasAnyLogs(false)
    }
  }, [createForm.employee_id])
  // Clear field error highlights when user modifies the form
  useEffect(() => {
    if (fieldErrors.size > 0) setFieldErrors(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createForm.employee_id, createForm.request_type, createForm.date, createForm.log_type, createForm.reason, createForm.time, createForm.time_start, createForm.time_end])

  // Fetch available attendance logs when employee, date, or request type changes
  useEffect(() => {
    const shouldFetchLogs = createForm.employee_id && 
                           createForm.date && 
                           createForm.request_type === 'missed_log'
    
    if (shouldFetchLogs) {
      if (!hasScheduleCoverageForDate(createForm.employee_id, createForm.date)) {
        setAvailableAttendanceLogs([])
        setSelectedAttendanceLog('')
        setCreateForm((prev: any) => ({ ...prev, time: '' }))
        openPageError(
          'No Schedule Found for Selected Date',
          'Missed-log filing is only allowed when the employee has a class/exam schedule (or fixed non-teaching shift) on the selected date.'
        )
        return
      }
      fetchAvailableAttendanceLogs(createForm.employee_id, createForm.date)
    } else {
      setAvailableAttendanceLogs([])
      setSelectedAttendanceLog('')
    }
  }, [createForm.employee_id, createForm.date, createForm.request_type])

  // Auto-fill form fields when attendance log is selected
  useEffect(() => {
    if (!selectedAttendanceLog || availableAttendanceLogs.length === 0) return
    
    const selectedLog = availableAttendanceLogs.find(log => log.log_id.toString() === selectedAttendanceLog)
    if (!selectedLog) return
    
    console.log("[Verification] Auto-filling from selected log:", selectedLog)
    
    // Auto-fill log type
    if (selectedLog.log_type) {
      setCreateForm((prev: any) => ({
        ...prev,
        log_type: selectedLog.log_type
      }))
    }
    
    // Auto-fill time from log_time
    if (selectedLog.log_time) {
      const logDate = new Date(selectedLog.log_time)
      const hours = logDate.getHours().toString().padStart(2, '0')
      const minutes = logDate.getMinutes().toString().padStart(2, '0')
      setCreateForm((prev: any) => ({
        ...prev,
        time: `${hours}:${minutes}`
      }))
    }
  }, [selectedAttendanceLog, availableAttendanceLogs])

  // Auto-fill time for ALL staff MISSED LOG based on their schedule
  // - Non-Teaching: use schedule_time_in / schedule_time_out
  // - Teaching / Part Time Full Load: use earliest class/exam start and latest end for the selected date's day-of-week
  // - Fallback: 6:00 AM (IN) / 9:00 PM (OUT)
  useEffect(() => {
    const autoFillMissedLogTime = async () => {
      // Only auto-fill for MISSED LOG requests
      if (createForm.request_type !== 'missed_log') return
      
      // Only if employee is selected and log type is set
      if (!createForm.employee_id || !createForm.log_type) return
      
      // Need a date to determine the day-of-week for schedule lookup
      if (!createForm.date) return

      // For BOTH mode: skip if BOTH times are already manually set
      if (createForm.log_type === 'BOTH' && createForm.time_start && createForm.time_end) return
      // For IN/OUT single mode: skip if time is already set
      if (createForm.log_type !== 'BOTH' && createForm.time) return

      const FALLBACK_IN = '06:00'  // 6:00 AM
      const FALLBACK_OUT = '21:00' // 9:00 PM

      try {
        const employeeData: any = employees.find((e: any) => e.employee_id === createForm.employee_id) || null
        if (!employeeData) return

        let scheduleIn: string | null = null
        let scheduleOut: string | null = null

        // ── Non-Teaching: use their fixed work schedule ──
        if (employeeData.staff_type === 'Non-Teaching' && employeeData.schedule_time_in && employeeData.schedule_time_out) {
          scheduleIn = String(employeeData.schedule_time_in).substring(0, 5)
          scheduleOut = String(employeeData.schedule_time_out).substring(0, 5)
          console.log('[AutoFill] Non-Teaching schedule:', scheduleIn, '-', scheduleOut)
        }

        // ── Teaching (all employment types): find class/exam times for the day ──
        if (employeeData.staff_type === 'Teaching' || String(employeeData.staff_type || '').toLowerCase().includes('teaching')) {
          try {
            const selectedDate = new Date(createForm.date + 'T00:00:00+08:00')
            const jsDayOfWeek = selectedDate.getDay() // 0=Sun, 1=Mon, ..., 6=Sat

            const termParam = getTermParam()
            const [allTeaching, allExams] = await Promise.all([
              getTeachingSchedulesForEmployee(createForm.employee_id),
              getExamSchedulesForEmployee(createForm.employee_id),
            ])

            // Filter by term
            const teaching = termParam
              ? (allTeaching || []).filter((s: any) => s.term === termParam)
              : (allTeaching || [])
            const exams = termParam
              ? (allExams || []).filter((s: any) => s.term === termParam)
              : (allExams || [])

            // Use all if term filter produced nothing
            const effectiveTeaching = teaching.length > 0 ? teaching : (allTeaching || [])
            const effectiveExams = exams.length > 0 ? exams : (allExams || [])

            // Collect start/end times for schedules that match this EXACT date
            const toMin = (hhmm: string): number | null => {
              const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/)
              if (!m) return null
              return Number(m[1]) * 60 + Number(m[2])
            }
            const toHhMm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

            let earliestStart: number | null = null
            let latestEnd: number | null = null
            const matchedSchedules: string[] = [] // For debug logging

            // Teaching schedules: match by day_of_week only
            for (const sched of effectiveTeaching) {
              if (Number(sched.day_of_week) === jsDayOfWeek && sched.time_start && sched.time_end) {
                const s = toMin(sched.time_start)
                const e = toMin(sched.time_end)
                if (s !== null && (earliestStart === null || s < earliestStart)) earliestStart = s
                if (e !== null && (latestEnd === null || e > latestEnd)) latestEnd = e
                matchedSchedules.push(`Teaching "${sched.subject_name || sched.schedule_id}": ${sched.time_start}-${sched.time_end} (day=${sched.day_of_week})`)
              }
            }

            // Exam schedules: match ONLY by exact exam_date, NOT by day_of_week
            // This prevents phantom times from exams on other dates that share a day_of_week
            for (const exam of effectiveExams) {
              const matchesExamDate = exam.exam_date && String(exam.exam_date).slice(0, 10) === createForm.date
              if (matchesExamDate && exam.time_start && exam.time_end) {
                const s = toMin(exam.time_start)
                const e = toMin(exam.time_end)
                if (s !== null && (earliestStart === null || s < earliestStart)) earliestStart = s
                if (e !== null && (latestEnd === null || e > latestEnd)) latestEnd = e
                matchedSchedules.push(`Exam "${exam.subject_name || exam.schedule_id}": ${exam.time_start}-${exam.time_end} (date=${exam.exam_date})`)
              }
            }

            if (earliestStart !== null && latestEnd !== null) {
              scheduleIn = toHhMm(earliestStart)
              scheduleOut = toHhMm(latestEnd)
              console.log('[AutoFill] Teaching schedule for day', jsDayOfWeek, `(${createForm.date}):`, scheduleIn, '-', scheduleOut)
              console.log('[AutoFill] Matched schedules:', matchedSchedules)
            } else {
              console.log('[AutoFill] No teaching/exam schedule found for day', jsDayOfWeek, `(${createForm.date})`)
            }
          } catch (err) {
            console.error('[AutoFill] Error fetching teaching schedules:', err)
          }
        }

        // Apply fallbacks if no schedule found
        const effectiveIn = scheduleIn || FALLBACK_IN
        const effectiveOut = scheduleOut || FALLBACK_OUT
        console.log('[AutoFill] Effective times:', effectiveIn, '-', effectiveOut, scheduleIn ? '(from schedule)' : '(fallback)')

        // Apply to form
        if (createForm.log_type === 'BOTH') {
          setCreateForm((prev: any) => ({
            ...prev,
            time_start: prev.time_start || effectiveIn,
            time_end: prev.time_end || effectiveOut,
          }))
          console.log('[AutoFill] BOTH mode auto-filled:', effectiveIn, '-', effectiveOut)
        } else if (createForm.log_type === 'IN') {
          setCreateForm((prev: any) => ({
            ...prev,
            time: prev.time || effectiveIn,
          }))
          console.log('[AutoFill] IN mode auto-filled:', effectiveIn)
        } else if (createForm.log_type === 'OUT') {
          setCreateForm((prev: any) => ({
            ...prev,
            time: prev.time || effectiveOut,
          }))
          console.log('[AutoFill] OUT mode auto-filled:', effectiveOut)
        }
      } catch (error) {
        console.error('[AutoFill] Error auto-filling time:', error)
      }
    }
    
    autoFillMissedLogTime()
  }, [createForm.employee_id, createForm.request_type, createForm.log_type, createForm.date])

  useEffect(() => {
    const buildCoveragePreviews = async () => {
      if (!showSubstitutionDialog || !pendingApproval || pendingApproval.schedules.length === 0) {
        setCoveragePreviewMap({})
        setCoveragePreviewLoading({})
        return
      }

      const parseScheduleSlot = (schedule: any, form: any): CoverageSlot | null => {
        const manualMode = Boolean(form?.manualMode || schedule.schedule_type === 'manual')
        const start = String(manualMode ? form?.manualTimeStart : (schedule.time_start || '')).slice(0, 5)
        const end = String(manualMode ? form?.manualTimeEnd : (schedule.time_end || '')).slice(0, 5)
        if (!start || !end) return null
        return {
          start,
          end,
          label: schedule.subject_name || `${schedule.schedule_type === 'exam' ? 'Exam' : 'Class'} #${schedule.schedule_id}`,
          source: 'substituted',
        }
      }

      const getDateDay = (dateStr: string): number => {
        const dateObj = new Date(`${dateStr}T00:00:00+08:00`)
        return dateObj.getDay()
      }

      const overlapsSlots = (a: CoverageSlot, b: CoverageSlot): boolean => {
        const aStart = parseTimeToMinutes(a.start)
        const aEnd = parseTimeToMinutes(a.end)
        const bStart = parseTimeToMinutes(b.start)
        const bEnd = parseTimeToMinutes(b.end)
        if (aStart === null || aEnd === null || bStart === null || bEnd === null) return false
        return aStart < bEnd && aEnd > bStart
      }

      const convertRowToOwnSlot = (row: any, isExam: boolean): CoverageSlot | null => {
        const start = String(row?.time_start || '').slice(0, 5)
        const end = String(row?.time_end || '').slice(0, 5)
        if (!start || !end) return null
        return {
          start,
          end,
          label: row?.subject_name || (isExam ? 'Existing exam schedule' : 'Existing class schedule'),
          source: 'own',
        }
      }

      const convertScheduleToOriginalSlot = (schedule: any): CoverageSlot | null => {
        const start = String(schedule?.time_start || '').slice(0, 5)
        const end = String(schedule?.time_end || '').slice(0, 5)
        if (!start || !end) return null
        return {
          start,
          end,
          label: schedule?.subject_name || `${schedule?.schedule_type === 'exam' ? 'Exam' : 'Class'} #${schedule?.schedule_id}`,
          source: 'original-remaining',
        }
      }

      const nextLoading: Record<string, boolean> = {}
      const nextMap: Record<string, CoveragePreview | null> = {}

      const previewTargets = pendingApproval.schedules.filter((schedule: any) => {
        const formKey = `${schedule.schedule_type}-${schedule.schedule_id}`
        const form = substitutionForms[formKey]
        return Boolean(form?.substituteEmployeeId && form?.substitutionDate)
      })

      for (const schedule of previewTargets) {
        const formKey = `${schedule.schedule_type}-${schedule.schedule_id}`
        const form = substitutionForms[formKey]
        const substituteEmployeeId = Number(form?.substituteEmployeeId)
        const substitutionDate = String(form?.substitutionDate || '').trim()
        if (!substituteEmployeeId || !substitutionDate) {
          nextMap[formKey] = null
          continue
        }

        nextLoading[formKey] = true

        try {
          const linkedSubstitutedSlots = pendingApproval.schedules
            .map((sched: any) => {
              const key = `${sched.schedule_type}-${sched.schedule_id}`
              const linkedForm = substitutionForms[key]
              if (!linkedForm) return null
              if (Number(linkedForm.substituteEmployeeId || 0) !== substituteEmployeeId) return null
              if (String(linkedForm.substitutionDate || '').trim() !== substitutionDate) return null
              return parseScheduleSlot(sched, linkedForm)
            })
            .filter((slot): slot is CoverageSlot => Boolean(slot))

          const selectedKeysForThisPreview = new Set(
            pendingApproval.schedules
              .filter((sched: any) => {
                const key = `${sched.schedule_type}-${sched.schedule_id}`
                const linkedForm = substitutionForms[key]
                if (!linkedForm) return false
                if (Number(linkedForm.substituteEmployeeId || 0) !== substituteEmployeeId) return false
                if (String(linkedForm.substitutionDate || '').trim() !== substitutionDate) return false
                return true
              })
              .map((sched: any) => `${sched.schedule_type}-${sched.schedule_id}`)
          )

          const allCandidateOriginalSchedules = Array.isArray(pendingApproval.allSchedules) && pendingApproval.allSchedules.length > 0
            ? pendingApproval.allSchedules
            : pendingApproval.schedules

          const remainingOriginalSlots = allCandidateOriginalSchedules
            .filter((sched: any) => !selectedKeysForThisPreview.has(`${sched.schedule_type}-${sched.schedule_id}`))
            .map((sched: any) => convertScheduleToOriginalSlot(sched))
            .filter((slot): slot is CoverageSlot => Boolean(slot))
            .sort((a, b) => {
              const aStart = parseTimeToMinutes(a.start) ?? 0
              const bStart = parseTimeToMinutes(b.start) ?? 0
              return aStart - bStart
            })

          const [teachingRows, examRows] = await Promise.all([
            getTeachingSchedulesForEmployee(substituteEmployeeId),
            getExamSchedulesForEmployee(substituteEmployeeId),
          ])

          const targetDay = getDateDay(substitutionDate)
          const ownTeachingSlots = (teachingRows || [])
            .filter((row: any) => Number(row.day_of_week) === Number(targetDay))
            .map((row: any) => convertRowToOwnSlot(row, false))
            .filter((slot): slot is CoverageSlot => Boolean(slot))

          const ownExamSlots = (examRows || [])
            .filter((row: any) => {
              const examDate = String(row.exam_date || '').slice(0, 10)
              return examDate === substitutionDate || Number(row.day_of_week) === Number(targetDay)
            })
            .map((row: any) => convertRowToOwnSlot(row, true))
            .filter((slot): slot is CoverageSlot => Boolean(slot))

          const ownSlots = [...ownTeachingSlots, ...ownExamSlots]
          const allSlots = [...linkedSubstitutedSlots, ...ownSlots].sort((a, b) => {
            const aStart = parseTimeToMinutes(a.start) ?? 0
            const bStart = parseTimeToMinutes(b.start) ?? 0
            return aStart - bStart
          })

          const startValues = allSlots
            .map((slot) => parseTimeToMinutes(slot.start))
            .filter((value): value is number => value !== null)
          const endValues = allSlots
            .map((slot) => parseTimeToMinutes(slot.end))
            .filter((value): value is number => value !== null)

          const finalStartMinutes = startValues.length > 0 ? Math.min(...startValues) : null
          const finalEndMinutes = endValues.length > 0 ? Math.max(...endValues) : null
          const toHhMm = (minutes: number | null): string => {
            if (minutes === null) return ''
            const h = Math.floor(minutes / 60)
            const m = minutes % 60
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
          }

          const hasOverlapConflict = linkedSubstitutedSlots.some((subSlot) =>
            ownSlots.some((ownSlot) => overlapsSlots(subSlot, ownSlot))
          )

          nextMap[formKey] = {
            slots: allSlots,
            substitutedSlots: linkedSubstitutedSlots,
            ownSlots,
            remainingOriginalSlots,
            finalStart: toHhMm(finalStartMinutes),
            finalEnd: toHhMm(finalEndMinutes),
            hasOverlapConflict,
          }
        } catch (error) {
          console.error('[Verification] Failed to compute coverage preview:', error)
          nextMap[formKey] = null
        } finally {
          nextLoading[formKey] = false
        }
      }

      setCoveragePreviewLoading((prev) => ({ ...prev, ...nextLoading }))
      setCoveragePreviewMap((prev) => ({ ...prev, ...nextMap }))
    }

    buildCoveragePreviews()
  }, [showSubstitutionDialog, pendingApproval, substitutionForms])

  useEffect(() => {
    const loadCreateLeaveScheduleOptions = async () => {
      const shouldLoad =
        createForm.request_type === 'leave' &&
        Boolean(createForm.requires_substitution) &&
        Boolean(createForm.employee_id) &&
        Boolean(createForm.date)

      if (!shouldLoad) {
        setCreateLeaveScheduleOptions([])
        setCreateSelectedLeaveScheduleKeys(new Set())
        return
      }

      const selectedEmployee: any = employees.find((emp: any) => Number(emp.employee_id) === Number(createForm.employee_id))
      const isTeaching = String(selectedEmployee?.staff_type || '').toLowerCase() === 'teaching'
      if (!isTeaching) {
        setCreateLeaveScheduleOptions([])
        setCreateSelectedLeaveScheduleKeys(new Set())
        return
      }

      try {
        setCreateLeaveScheduleLoading(true)
        const [teachingSchedulesRaw, examSchedulesRaw] = await Promise.all([
          getTeachingSchedulesForEmployee(createForm.employee_id),
          getExamSchedulesForEmployee(createForm.employee_id),
        ])

        const termParam = getTermParam()
        const teachingSchedules = termParam
          ? (teachingSchedulesRaw || []).filter((s: any) => s.term === termParam)
          : (teachingSchedulesRaw || [])
        const examSchedules = termParam
          ? (examSchedulesRaw || []).filter((s: any) => s.term === termParam)
          : (examSchedulesRaw || [])

        const dateObj = new Date(`${createForm.date}T00:00:00+08:00`)
        const dateStr = createForm.date
        const dayOfWeek = dateObj.getDay()

        const options: any[] = []

        teachingSchedules.forEach((sched: any) => {
          if (Number(sched.day_of_week) !== Number(dayOfWeek)) return
          options.push({
            ...sched,
            schedule_type: 'teaching',
            schedule_id: Number(sched.schedule_id),
          })
        })

        examSchedules.forEach((exam: any) => {
          const examDate = String(exam.exam_date || '').slice(0, 10)
          if (examDate !== dateStr && Number(exam.day_of_week) !== Number(dayOfWeek)) return
          options.push({
            ...exam,
            schedule_type: 'exam',
            schedule_id: Number(exam.exam_schedule_id),
            exam_date: exam.exam_date || null,
          })
        })

        options.sort((a: any, b: any) => {
          const aStart = parseTimeToMinutes(String(a.time_start || '')) ?? 0
          const bStart = parseTimeToMinutes(String(b.time_start || '')) ?? 0
          return aStart - bStart
        })

        setCreateLeaveScheduleOptions(options)
        setCreateSelectedLeaveScheduleKeys((prev) => {
          const validKeys = new Set(options.map((item) => getScheduleSelectionKey(item)))
          const next = new Set<string>()
          prev.forEach((key) => {
            if (validKeys.has(key)) next.add(key)
          })
          if (next.size === 0 && validKeys.size > 0) {
            validKeys.forEach((key) => next.add(key))
          }
          return next
        })
      } catch (error) {
        console.error('[Verification] Error loading leave schedule options:', error)
        setCreateLeaveScheduleOptions([])
        setCreateSelectedLeaveScheduleKeys(new Set())
      } finally {
        setCreateLeaveScheduleLoading(false)
      }
    }

    loadCreateLeaveScheduleOptions()
  }, [
    createForm.request_type,
    createForm.requires_substitution,
    createForm.employee_id,
    createForm.date,
    employees,
    currentAcademicTerm,
  ])

  useEffect(() => {
    const loadCreateSubstituteConflicts = async () => {
      const shouldCheck =
        createForm.request_type === 'leave' &&
        Boolean(createForm.requires_substitution) &&
        Number(createForm.substitute_employee_id) > 0 &&
        Boolean(createForm.date) &&
        createSelectedLeaveScheduleKeys.size > 0

      if (!shouldCheck) {
        setCreateSubstituteConflictMap({})
        setCreateSubstituteConflictLoading(false)
        return
      }

      const selectedSchedules = createLeaveScheduleOptions.filter((schedule) =>
        createSelectedLeaveScheduleKeys.has(getScheduleSelectionKey(schedule))
      )

      if (selectedSchedules.length === 0) {
        setCreateSubstituteConflictMap({})
        setCreateSubstituteConflictLoading(false)
        return
      }

      setCreateSubstituteConflictLoading(true)
      try {
        const substituteId = Number(createForm.substitute_employee_id)
        const results = await Promise.all(
          selectedSchedules.map(async (schedule) => {
            const key = getScheduleSelectionKey(schedule)
            const result = await checkSpecificSubstituteConflict(schedule, createForm.date, substituteId)
            return { key, result }
          })
        )

        const nextMap: Record<string, { hasConflict: boolean; reason: string; conflictRange?: string }> = {}
        results.forEach(({ key, result }) => {
          nextMap[key] = result
        })
        setCreateSubstituteConflictMap(nextMap)
      } finally {
        setCreateSubstituteConflictLoading(false)
      }
    }

    loadCreateSubstituteConflicts()
  }, [
    createForm.request_type,
    createForm.requires_substitution,
    createForm.substitute_employee_id,
    createForm.date,
    createLeaveScheduleOptions,
    createSelectedLeaveScheduleKeys,
  ])

  useEffect(() => {
    const buildCreateLeaveCoveragePreview = async () => {
      const selectedEmployee: any = employees.find((emp: any) => Number(emp.employee_id) === Number(createForm.employee_id))
      const isTeaching = String(selectedEmployee?.staff_type || '').toLowerCase() === 'teaching'
      const shouldCompute =
        createForm.request_type === 'leave' &&
        Boolean(createForm.requires_substitution) &&
        isTeaching &&
        Number(createForm.substitute_employee_id) > 0 &&
        Boolean(createForm.date) &&
        createLeaveScheduleOptions.length > 0 &&
        createSelectedLeaveScheduleKeys.size > 0

      if (!shouldCompute) {
        setCreateLeaveCoveragePreview(null)
        return
      }

      try {
        const selectedSchedules = createLeaveScheduleOptions.filter((schedule) =>
          createSelectedLeaveScheduleKeys.has(getScheduleSelectionKey(schedule))
        )
        if (selectedSchedules.length === 0) {
          setCreateLeaveCoveragePreview(null)
          return
        }

        const dateObj = new Date(`${createForm.date}T00:00:00+08:00`)
        const dayOfWeek = dateObj.getDay()
        const dateStr = String(createForm.date)
        const termParam = getTermParam()
        const substituteEmployeeId = Number(createForm.substitute_employee_id)

        const [subTeachingRaw, subExamRaw] = await Promise.all([
          getTeachingSchedulesForEmployee(substituteEmployeeId),
          getExamSchedulesForEmployee(substituteEmployeeId),
        ])

        const subTeaching = termParam
          ? (subTeachingRaw || []).filter((s: any) => s.term === termParam)
          : (subTeachingRaw || [])
        const subExams = termParam
          ? (subExamRaw || []).filter((s: any) => s.term === termParam)
          : (subExamRaw || [])

        const selectedSlots = selectedSchedules
          .map((schedule) => ({
            start: String(schedule?.time_start || '').slice(0, 5),
            end: String(schedule?.time_end || '').slice(0, 5),
          }))
          .filter((slot) => slot.start && slot.end)

        const substituteOwnTeachingSlots = subTeaching
          .filter((s: any) => Number(s?.day_of_week) === Number(dayOfWeek))
          .map((s: any) => ({
            start: String(s?.time_start || '').slice(0, 5),
            end: String(s?.time_end || '').slice(0, 5),
          }))
          .filter((slot) => slot.start && slot.end)

        const substituteOwnExamSlots = subExams
          .filter((s: any) => {
            const examDate = String(s?.exam_date || '').slice(0, 10)
            return examDate === dateStr || Number(s?.day_of_week) === Number(dayOfWeek)
          })
          .map((s: any) => ({
            start: String(s?.time_start || '').slice(0, 5),
            end: String(s?.time_end || '').slice(0, 5),
          }))
          .filter((slot) => slot.start && slot.end)

        const ownSlots = [...substituteOwnTeachingSlots, ...substituteOwnExamSlots]
        const allSlots = [...selectedSlots, ...ownSlots]
        if (allSlots.length === 0) {
          setCreateLeaveCoveragePreview(null)
          return
        }

        const startValues = allSlots
          .map((slot) => parseTimeToMinutes(slot.start))
          .filter((value): value is number => value !== null)
        const endValues = allSlots
          .map((slot) => parseTimeToMinutes(slot.end))
          .filter((value): value is number => value !== null)

        if (!startValues.length || !endValues.length) {
          setCreateLeaveCoveragePreview(null)
          return
        }

        const minStart = Math.min(...startValues)
        const maxEnd = Math.max(...endValues)
        const toHhMm = (minutes: number): string => {
          const h = Math.floor(minutes / 60)
          const m = minutes % 60
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
        }

        const hasOverlapConflict = selectedSlots.some((subSlot) =>
          ownSlots.some((ownSlot) => overlapsSlots(subSlot, ownSlot))
        )

        setCreateLeaveCoveragePreview({
          finalStart: toHhMm(minStart),
          finalEnd: toHhMm(maxEnd),
          hasOverlapConflict,
          selectedCount: selectedSchedules.length,
          remainingCount: Math.max(0, createLeaveScheduleOptions.length - selectedSchedules.length),
        })
      } catch (error) {
        console.error('[Verification] Failed to compute create leave coverage preview:', error)
        setCreateLeaveCoveragePreview(null)
      }
    }

    buildCreateLeaveCoveragePreview()
  }, [
    createForm.request_type,
    createForm.requires_substitution,
    createForm.employee_id,
    createForm.substitute_employee_id,
    createForm.date,
    createLeaveScheduleOptions,
    createSelectedLeaveScheduleKeys,
    employees,
    currentAcademicTerm,
  ])


  const loadData = async () => {
    try {
      console.log("[Verification] Loading verification requests")
      setIsLoading(true)
      const staffTypeFilter = getStaffFilter()
      const qs = staffTypeFilter ? `?staffTypeFilter=${encodeURIComponent(staffTypeFilter)}` : ''
      const res = await fetch(`/api/verification-requests${qs}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to load')
      const requests = json.items || []
      console.log("[Verification] Verification requests loaded:", requests?.length)
      setVerificationRequests(requests)
    } catch (error) {
      console.error("[Verification] Error loading verification requests:", error)
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      if (errorMessage.includes("not found") || errorMessage.includes("relationship")) {
        openPageError(
          'Database Not Set Up',
          'Please run the local database setup scripts. Check setup documentation for offline PostgreSQL instructions.'
        )
      } else {
        openPageError('Error', 'Failed to load verification filings')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const fetchSubstitutionDetails = async (requestId: number) => {
    try {
      console.log("[Verification] Fetching substitution details for request:", requestId)
      const res = await fetch(`/api/verification-requests/substitution-details?requestId=${requestId}`, { 
        cache: 'no-store' 
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to fetch substitution details')
      
      console.log("[Verification] Substitution details fetched:", json.substitutionDetails)
      setSubstitutionDetails(json.substitutionDetails)
    } catch (error) {
      console.error("[Verification] Error fetching substitution details:", error)
      // Don't show error toast as substitution details are optional
      setSubstitutionDetails(null)
    }
  }

  // Fetch available attendance logs for New Filing (Missed Log)
  const fetchAvailableAttendanceLogs = async (employeeId: number, dateStr: string) => {
    if (!employeeId || !dateStr) {
      setAvailableAttendanceLogs([])
      return
    }

    try {
      setLoadingAvailableLogs(true)
      console.log("[Verification] Fetching attendance logs for employee:", employeeId, "date:", dateStr)

      const res = await fetch(
        `/api/attendance/logs?employeeId=${employeeId}&date=${encodeURIComponent(dateStr)}&limit=500`,
        { cache: 'no-store' }
      )
      const data = await res.json().catch(() => [])
      if (!res.ok) {
        throw new Error((data as any)?.error || 'Failed to fetch attendance logs')
      }
      
      console.log("[Verification] Found attendance logs:", data?.length || 0)
      setAvailableAttendanceLogs(data || [])
      
      // Auto-select first log if available
      if (data && data.length > 0) {
        setSelectedAttendanceLog(data[0].log_id.toString())
      }
    } catch (error) {
      console.error("[Verification] Error fetching attendance logs:", error)
      setAvailableAttendanceLogs([])
    } finally {
      setLoadingAvailableLogs(false)
    }
  }

  // Fetch all dates with attendance logs for the selected employee
  const fetchEmployeeAttendanceDates = async (employeeId: number) => {
    if (!employeeId) {
      setEmployeeAttendanceDates(new Set())
      setEmployeeCompleteDates(new Set())
      setEmployeePartialDates(new Set())
      setEmployeeHasAnyLogs(false)
      return
    }

    try {
      setLoadingAttendanceDates(true)

      const res = await fetch(`/api/attendance/logs?employeeId=${employeeId}&limit=5000`, {
        cache: 'no-store',
      })
      const data = await res.json().catch(() => [])
      if (!res.ok) {
        throw new Error((data as any)?.error || 'Failed to fetch attendance dates')
      }
      
      // Create a Set of unique dates + track which dates have both IN and OUT
      const uniqueDates = new Set<string>()
      const dateLogTypes = new Map<string, Set<string>>()
      data?.forEach((log: any) => {
        if (log.date) {
          uniqueDates.add(log.date)
          if (!dateLogTypes.has(log.date)) dateLogTypes.set(log.date, new Set())
          const logType = String(log.log_type || '').toUpperCase().trim()
          if (logType === 'IN' || logType === 'OUT') {
            dateLogTypes.get(log.date)!.add(logType)
          }
        }
      })
      
      // Dates with both IN and OUT are "complete" — skip them in missed log picker
      // Dates with only IN or only OUT are "partial" — highlight them for attention
      const completeDates = new Set<string>()
      const partialDates = new Set<string>()
      dateLogTypes.forEach((types, dateStr) => {
        if (types.has('IN') && types.has('OUT')) {
          completeDates.add(dateStr)
        } else if (types.has('IN') || types.has('OUT')) {
          partialDates.add(dateStr)
        }
      })
      
      setEmployeeAttendanceDates(uniqueDates)
      setEmployeeCompleteDates(completeDates)
      setEmployeePartialDates(partialDates)
      setEmployeeHasAnyLogs(uniqueDates.size > 0)
    } catch (error) {
      console.error("[Verification] Error fetching attendance dates:", error)
      setEmployeeAttendanceDates(new Set())
      setEmployeeCompleteDates(new Set())
      setEmployeePartialDates(new Set())
      setEmployeeHasAnyLogs(false)
    } finally {
      setLoadingAttendanceDates(false)
    }
  }

  const fetchAvailableSubstitutes = async (schedule: any, requestedDate: string) => {
    try {
      const scheduleType = String(schedule?.schedule_type || '').toLowerCase()
      if (scheduleType === 'manual') {
        const sourceStaffType = String(schedule?.source_staff_type || '').toLowerCase()
        const targetStaffType = sourceStaffType.includes('non') ? 'non-teaching' : 'teaching'
        return employees.filter((e: any) => {
          const employeeStaffType = String(e?.staff_type || '').toLowerCase()
          const isActive = e?.is_active === true || e?.is_active === null || e?.is_active === undefined
          return isActive &&
            employeeStaffType === targetStaffType &&
            Number(e?.employee_id) !== Number(schedule?.employee_id)
        })
      }

      const timeStart = convertTimeToDbFormat(schedule.time_start)
      const timeEnd = convertTimeToDbFormat(schedule.time_end)
      
      console.log("[Verification] Fetching available substitutes for:", {
        date: requestedDate,
        timeStart,
        timeEnd,
        originalEmployeeId: schedule.employee_id || 0
      })
      
      const res = await fetch(
        `/api/employees/available-substitutes?date=${requestedDate}&time_start=${timeStart}&time_end=${timeEnd}&original_employee_id=${schedule.employee_id || 0}`,
        { cache: 'no-store' }
      )
      
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to fetch available substitutes')
      
      return json.availableTeachers || []
    } catch (error) {
      console.error("[Verification] Error fetching available substitutes:", error)
      // Return all employees as fallback
      return employees.filter(
        e => 
          (e as any).staff_type === 'Teaching' && 
          e.employee_id !== schedule.employee_id &&
          (e.is_active === true || e.is_active === null || e.is_active === undefined)
      )
    }
  }

  const checkSpecificSubstituteConflict = async (
    schedule: any,
    requestedDate: string,
    substituteEmployeeId: number,
  ): Promise<{ hasConflict: boolean; reason: string; conflictRange?: string }> => {
    const scheduleType = String(schedule?.schedule_type || '').toLowerCase()
    if (scheduleType === 'manual') {
      return { hasConflict: false, reason: '' }
    }

    const timeStart = convertTimeToDbFormat(schedule.time_start)
    const timeEnd = convertTimeToDbFormat(schedule.time_end)

    try {
      const res = await fetch(
        `/api/employees/available-substitutes?date=${requestedDate}&time_start=${timeStart}&time_end=${timeEnd}&original_employee_id=${schedule.employee_id || 0}`,
        { cache: 'no-store' }
      )

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        return { hasConflict: true, reason: json?.error || 'Failed to check substitute availability' }
      }

      const availableTeachers = Array.isArray(json?.availableTeachers) ? json.availableTeachers : []
      const unavailableTeachers = Array.isArray(json?.unavailableTeachers) ? json.unavailableTeachers : []

      const isAvailable = availableTeachers.some((emp: any) => Number(emp?.employee_id) === Number(substituteEmployeeId))
      if (isAvailable) {
        return { hasConflict: false, reason: '' }
      }

      const unavailable = unavailableTeachers.find((emp: any) => Number(emp?.employee_id) === Number(substituteEmployeeId))
      if (unavailable) {
        const baseReason = String(unavailable.reason_label || 'Unavailable due to schedule conflict')
        const conflictRange = String(unavailable.conflict_range || '').trim()
        return {
          hasConflict: true,
          reason: conflictRange ? `${baseReason} (${conflictRange})` : baseReason,
          conflictRange: conflictRange || undefined,
        }
      }

      return { hasConflict: true, reason: 'Selected substitute is not available for this schedule.' }
    } catch (error) {
      console.error('[Verification] Failed to check substitute conflict:', error)
      return { hasConflict: true, reason: 'Failed to check substitute availability.' }
    }
  }

  const handleDeleteRequest = async (requestId: number) => {
    try {
      setDeleteInProgress(true)
      console.log("[Verification] Deleting verification request:", requestId)
      
      // Get user info from localStorage for log trail
      const userStr = localStorage.getItem('user')
      const user = userStr ? JSON.parse(userStr) : null
      const userId = user?.id || 0
      
      const res = await fetch(`/api/verification-requests/delete?requestId=${requestId}&userId=${userId}`, {
        method: 'DELETE',
      })
      
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to delete request')
      
      toast({
        title: "Request Deleted",
        description: "Verification request and all related changes have been reverted successfully.",
      })
      
      // Reload data and close dialogs
      loadData()
      setSelectedRequest(null)
      setSubstitutionDetails(null)
      setReviewNotes("")
      setShowDeleteConfirm(false)
    } catch (error) {
      console.error("[Verification] Error deleting request:", error)
      openPageError('Delete Failed', error instanceof Error ? error.message : 'Failed to delete verification request')
    } finally {
      setDeleteInProgress(false)
    }
  }

  const handleBulkDeleteRequests = async () => {
    const ids = Array.from(selectedRequestIds)
    if (ids.length === 0) return
    if (bulkDeleteConfirmText.trim().toUpperCase() !== 'DELETE') return

    try {
      setDeleteInProgress(true)
      console.log('[Verification] Bulk deleting verification requests:', ids)

      const res = await fetch('/api/verification-requests/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestIds: ids }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Failed to delete selected requests')

      const deletedCount = Number(json?.deletedCount || 0)
      const failureCount = Array.isArray(json?.failures) ? json.failures.length : 0

      if (failureCount > 0) {
        toast({
          title: 'Bulk Delete Partially Completed',
          description: `${deletedCount} deleted, ${failureCount} failed.`,
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Selected Requests Deleted',
          description: `${deletedCount} verification request(s) deleted and reverted successfully.`,
        })
      }

      setShowBulkDeleteConfirm(false)
      setBulkDeleteConfirmText('')
      setSelectedRequestIds(new Set())
      setSelectedRequest(null)
      setSubstitutionDetails(null)
      setReviewNotes('')
      await loadData()
    } catch (error) {
      console.error('[Verification] Error bulk deleting requests:', error)
      openPageError('Bulk Delete Failed', error instanceof Error ? error.message : 'Failed to delete selected requests')
    } finally {
      setDeleteInProgress(false)
    }
  }

  const toggleSelectRequest = (requestId: number, checked: boolean) => {
    const request = verificationRequests.find((r) => Number(r?.request_id) === requestId)
    const paired = request ? getPairedMissedLogRequest(request, { pendingOnly: true }) : null
    const pairedId = Number(paired?.request_id)

    setSelectedRequestIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(requestId)
        if (Number.isFinite(pairedId)) next.add(pairedId)
      } else {
        next.delete(requestId)
        if (Number.isFinite(pairedId)) next.delete(pairedId)
      }
      return next
    })
  }

  const toggleSelectAllFiltered = (checked: boolean) => {
    if (!checked) {
      setSelectedRequestIds(new Set())
      return
    }

    const next = new Set<number>()
    filteredRequests.forEach((request: any) => {
      const id = Number(request.request_id)
      if (Number.isFinite(id)) next.add(id)

      const pair = getPairedMissedLogRequest(request, { pendingOnly: true })
      const pairId = Number(pair?.request_id)
      if (Number.isFinite(pairId)) next.add(pairId)
    })
    setSelectedRequestIds(next)
  }

  const selectPendingFiltered = () => {
    const next = new Set<number>()
    filteredRequests.forEach((request: any) => {
      if (request.status === 'pending') {
        const id = Number(request.request_id)
        if (Number.isFinite(id)) next.add(id)

        const pair = getPairedMissedLogRequest(request, { pendingOnly: true })
        const pairId = Number(pair?.request_id)
        if (Number.isFinite(pairId)) next.add(pairId)
      }
    })
    setSelectedRequestIds(next)
  }

  const deriveRequestDate = (req: any): string | null => {
    const raw = String(req?.requested_time || req?.original_time || '').trim()
    if (!raw) return null
    const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/)
    if (direct) return direct[1]
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toISOString().slice(0, 10)
  }

  const normalizeScheduleType = (value: any): 'teaching' | 'exam' | null => {
    const normalized = String(value || '').trim().toLowerCase()
    if (normalized === 'teaching' || normalized === 'exam') return normalized
    return null
  }

  const getRequestScheduleLink = (req: any): { scheduleId: number | null; scheduleType: 'teaching' | 'exam' | null } => {
    const rawId = req?.schedule_id
    const numericId = Number(rawId)
    const scheduleId = Number.isFinite(numericId) ? numericId : null
    return {
      scheduleId,
      scheduleType: normalizeScheduleType(req?.schedule_type),
    }
  }

  const getRequestScheduleLabel = (req: any): string => {
    const link = getRequestScheduleLink(req)
    if (!link.scheduleId || !link.scheduleType) return 'Auto-matched by date/time'
    return `${link.scheduleType === 'exam' ? 'Exam' : 'Class'} #${link.scheduleId}`
  }

  const getRequestScheduleLabelClass = (req: any): string => {
    const label = getRequestScheduleLabel(req)
    if (label === 'Auto-matched by date/time') {
      return 'text-amber-700 dark:text-amber-300 font-medium'
    }
    return 'text-gray-500 dark:text-gray-400'
  }

  const parseLeaveSubstitutionPlan = (req: any): {
    substituteEmployeeId: number | null
    manualMode: boolean
    manualTimeStart: string
    manualTimeEnd: string
    selectedScheduleKeys: string[]
  } => {
    const reasonRaw = String(req?.reason || '')
    const subMatch = reasonRaw.match(/\[LEAVE_SUB_EMP:(\d+)\]/i)
    const manualMode = /\[LEAVE_MANUAL_MODE:1\]/i.test(reasonRaw)
    const manualTimeMatch = reasonRaw.match(/\[LEAVE_MANUAL_TIME:([0-2]\d:[0-5]\d)-([0-2]\d:[0-5]\d)\]/i)
    const selectedScheduleMatch = reasonRaw.match(/\[LEAVE_SUB_SCHEDULES:([^\]]+)\]/i)
    const selectedScheduleKeys = String(selectedScheduleMatch?.[1] || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)

    return {
      substituteEmployeeId: subMatch ? Number(subMatch[1]) : null,
      manualMode,
      manualTimeStart: manualTimeMatch?.[1] || '',
      manualTimeEnd: manualTimeMatch?.[2] || '',
      selectedScheduleKeys,
    }
  }

  const normalizeMissedLogType = (value: any): 'IN' | 'OUT' | null => {
    const normalized = String(value || '').trim().toUpperCase().replace(/\s+/g, '_').replace(/-/g, '_')
    if (['IN', 'TIME_IN', 'CLOCK_IN', 'TIMEIN', 'CLOCKIN'].includes(normalized)) return 'IN'
    if (['OUT', 'TIME_OUT', 'CLOCK_OUT', 'TIMEOUT', 'CLOCKOUT'].includes(normalized)) return 'OUT'
    return null
  }

  const getMissedLogType = (req: any): 'IN' | 'OUT' | null => {
    const fromField = normalizeMissedLogType(req?.log_type)
    if (fromField) return fromField

    const reason = String(req?.reason || '').toUpperCase()
    if (reason.includes('NO ATTENDANCE IN')) return 'IN'
    if (reason.includes('NO ATTENDANCE OUT')) return 'OUT'
    return null
  }

  const getPairedMissedLogRequest = (
    request: any,
    options: { pendingOnly?: boolean } = {},
  ): any | null => {
    if (!request) return null
    if (String(request.request_type || '') !== 'missed_log') return null

    const currentType = getMissedLogType(request)
    if (!currentType) return null

    const requestDate = deriveRequestDate(request)
    if (!requestDate) return null

    const oppositeType: 'IN' | 'OUT' = currentType === 'IN' ? 'OUT' : 'IN'
    const requestLink = getRequestScheduleLink(request)

    const candidates = verificationRequests
      .filter((other) => {
        if (!other || Number(other.request_id) === Number(request.request_id)) return false
        if (Number(other.employee_id) !== Number(request.employee_id)) return false
        if (String(other.request_type || '') !== 'missed_log') return false
        if (options.pendingOnly && String(other.status || '') !== 'pending') return false

        const otherType = getMissedLogType(other)
        if (otherType !== oppositeType) return false

        const otherDate = deriveRequestDate(other)
        if (!otherDate || otherDate !== requestDate) return false

        const otherLink = getRequestScheduleLink(other)
        if (requestLink.scheduleId && requestLink.scheduleType && otherLink.scheduleId && otherLink.scheduleType) {
          return requestLink.scheduleId === otherLink.scheduleId && requestLink.scheduleType === otherLink.scheduleType
        }

        return true
      })
      .sort((a, b) => {
        const aTs = new Date(a.requested_at || 0).getTime()
        const bTs = new Date(b.requested_at || 0).getTime()
        return bTs - aTs
      })

    return candidates[0] || null
  }

  const applyPairedMissedLogDecision = async (
    request: any,
    targetStatus: 'approved' | 'rejected',
  ): Promise<boolean> => {
    if (!request || String(request.request_type || '') !== 'missed_log' || String(request.status || '') !== 'pending') {
      return false
    }

    const pair = getPairedMissedLogRequest(request, { pendingOnly: true })
    if (!pair) return false

    const requestIds = [Number(request.request_id), Number(pair.request_id)].filter((id) => Number.isFinite(id))
    const nowIso = new Date().toISOString()
    let successCount = 0
    let failedCount = 0

    for (const id of requestIds) {
      try {
        const updates: any = {
          status: targetStatus,
          reviewed_by: getReviewerId(),
          review_notes: reviewNotes || `Paired ${targetStatus === 'approved' ? 'approval' : 'rejection'} by admin`,
          reviewed_at: nowIso,
        }

        if (targetStatus === 'approved') {
          updates.substitution_applied = false
        }

        const res = await fetch('/api/verification-requests', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: id, updates }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || 'Failed to update request')
        successCount++
      } catch {
        failedCount++
      }
    }

    if (failedCount > 0) {
      toast({
        title: 'Paired Review Partially Completed',
        description: `${successCount} updated, ${failedCount} failed.`,
        variant: 'destructive',
      })
    } else {
      toast({
        title: targetStatus === 'approved' ? 'IN/OUT Pair Approved' : 'IN/OUT Pair Rejected',
        description: 'Paired missed-log entries were processed together.',
      })
    }

    await loadData()
    setSelectedRequest(null)
    setSubstitutionDetails(null)
    setReviewNotes('')
    setShowReviewDialog(false)
    setShowSubstitutionDialog(false)
    setPendingApproval(null)
    setSubstitutionForms({})
    return true
  }

  const getBulkAttendanceConflictInfo = (entry: any) => {
    const existing = Array.isArray(entry?.existingLogs) && entry.existingLogs.length > 0 ? entry.existingLogs[0] : null
    const existingIn = existing?.time_in || existing?.clock_in_time || existing?.actual_time_in || 'N/A'
    const existingOut = existing?.time_out || existing?.clock_out_time || existing?.actual_time_out || 'N/A'
    const existingStatus = existing?.attendance_status || existing?.status || 'N/A'

    const normalizedLogType = String(entry?.request?.log_type || '').trim().toUpperCase()
    const isInLog = ['IN', 'TIME_IN', 'TIME-IN', 'CLOCK_IN', 'CLOCK-IN'].includes(normalizedLogType)
    const isOutLog = ['OUT', 'TIME_OUT', 'TIME-OUT', 'CLOCK_OUT', 'CLOCK-OUT'].includes(normalizedLogType)
    const hasExistingIn = String(existingIn).trim() !== '' && String(existingIn).toUpperCase() !== 'N/A'
    const hasExistingOut = String(existingOut).trim() !== '' && String(existingOut).toUpperCase() !== 'N/A'
    const hasConflict = (isInLog && hasExistingIn) || (isOutLog && hasExistingOut)

    const conflictMessage = isInLog
      ? 'Conflict: existing Time In is already populated.'
      : isOutLog
        ? 'Conflict: existing Time Out is already populated.'
        : 'Potential conflict detected.'

    return {
      existing,
      existingIn,
      existingOut,
      existingStatus,
      isInLog,
      isOutLog,
      hasExistingIn,
      hasExistingOut,
      hasConflict,
      conflictMessage,
    }
  }

  const openBulkReviewWizard = (action: 'approved' | 'rejected') => {
    setBulkReviewAction(action)
    setBulkReviewWizardStep(1)
    setBulkReviewAttendanceComparison([])
    setBulkReviewShowConflictsOnly(false)
    setShowBulkReviewConfirm(true)
  }

  const requestCloseBulkReviewWizard = () => {
    if (bulkReviewInProgress) return
    setShowBulkReviewCloseConfirm(true)
  }

  const confirmCloseBulkReviewWizard = () => {
    setShowBulkReviewCloseConfirm(false)
    setShowBulkReviewConfirm(false)
    setBulkReviewWizardStep(1)
    setBulkReviewAttendanceComparison([])
    setBulkReviewShowConflictsOnly(false)
  }

  const selectedRowsForBulkReview = verificationRequests.filter((req) => selectedRequestIds.has(Number(req.request_id)))
  const pendingRowsForBulkReview = selectedRowsForBulkReview.filter((req) => req.status === 'pending')
  const duplicateRowsForBulkReview = pendingRowsForBulkReview
    .map((req) => {
      const reqDate = deriveRequestDate(req)
      const reqType = String(req.request_type || '')
      const reqLogType = String(req.log_type || '').toUpperCase()
      const reqLink = getRequestScheduleLink(req)

      const matches = verificationRequests.filter((other) => {
        if (!other || Number(other.request_id) === Number(req.request_id)) return false
        if (Number(other.employee_id) !== Number(req.employee_id)) return false
        if (String(other.request_type || '') !== reqType) return false
        if (String(other.status || '') !== 'approved' && String(other.status || '') !== 'pending') return false

        const otherLink = getRequestScheduleLink(other)
        if (reqLink.scheduleId && reqLink.scheduleType) {
          return otherLink.scheduleId === reqLink.scheduleId && otherLink.scheduleType === reqLink.scheduleType
        }

        // If only one side has a concrete schedule linkage, do not consider it a duplicate.
        if ((otherLink.scheduleId && otherLink.scheduleType) || (reqLink.scheduleId && reqLink.scheduleType)) return false

        const otherDate = deriveRequestDate(other)
        if (reqDate && otherDate && reqDate !== otherDate) return false

        if (reqType === 'missed_log' || reqType === 'time_correction' || reqType === 'late_justification') {
          const otherLogType = String(other.log_type || '').toUpperCase()
          if (reqLogType && otherLogType && reqLogType !== otherLogType) return false
        }

        return true
      })

      return { request: req, matches }
    })
    .filter((item) => item.matches.length > 0)

  const bulkReviewConflictCount = bulkReviewAttendanceComparison.filter((entry: any) => getBulkAttendanceConflictInfo(entry).hasConflict).length
  const displayedBulkReviewAttendanceComparison = bulkReviewShowConflictsOnly
    ? bulkReviewAttendanceComparison.filter((entry: any) => getBulkAttendanceConflictInfo(entry).hasConflict)
    : bulkReviewAttendanceComparison

  const handleBulkReviewRequests = async () => {
    const ids = Array.from(selectedRequestIds)
    if (ids.length === 0) return

    const selectedRows = verificationRequests.filter((req) => selectedRequestIds.has(Number(req.request_id)))
    const pendingRows = selectedRows.filter((req) => req.status === 'pending')

    if (pendingRows.length === 0) {
      toast({
        title: 'No Pending Requests Selected',
        description: 'Only pending verification requests can be accepted or declined in bulk.',
        variant: 'destructive',
      })
      setShowBulkReviewConfirm(false)
      return
    }

    const nowIso = new Date().toISOString()
    const targetStatus = bulkReviewAction

    let successCount = 0
    let failedCount = 0

    try {
      setBulkReviewInProgress(true)

      for (const req of pendingRows) {
        try {
          const payload: any = {
            status: targetStatus,
            reviewed_by: getReviewerId(),
            review_notes: reviewNotes || `Bulk ${targetStatus === 'approved' ? 'approved' : 'rejected'} by admin`,
            reviewed_at: nowIso,
          }

          if (targetStatus === 'approved') {
            payload.substitution_applied = false
          }

          const res = await fetch('/api/verification-requests', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestId: req.request_id, updates: payload }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(json?.error || 'Failed to update request')

          successCount++
        } catch {
          failedCount++
        }
      }

      const skippedCount = Math.max(0, selectedRows.length - pendingRows.length)
      if (failedCount > 0) {
        toast({
          title: 'Bulk Review Partially Completed',
          description: `${successCount} updated, ${failedCount} failed${skippedCount > 0 ? `, ${skippedCount} skipped (not pending)` : ''}.`,
          variant: 'destructive',
        })
      } else {
        toast({
          title: targetStatus === 'approved' ? 'Selected Requests Accepted' : 'Selected Requests Declined',
          description: `${successCount} request(s) updated${skippedCount > 0 ? `, ${skippedCount} skipped (not pending)` : ''}.`,
        })
      }

      setShowBulkReviewConfirm(false)
      setSelectedRequestIds(new Set())
      setSelectedRequest(null)
      setSubstitutionDetails(null)
      setReviewNotes('')
      await loadData()
    } finally {
      setBulkReviewInProgress(false)
    }
  }

  useEffect(() => {
    const loadBulkAttendanceComparison = async () => {
      if (!showBulkReviewConfirm || bulkReviewWizardStep !== 3) return
      const targetRows = pendingRowsForBulkReview.slice(0, 40)
      if (targetRows.length === 0) {
        setBulkReviewAttendanceComparison([])
        return
      }

      try {
        setBulkReviewComparisonLoading(true)
        const results: any[] = []

        for (const req of targetRows) {
          const d = deriveRequestDate(req)
          if (!d || !req?.employee_id) {
            results.push({ request: req, existingLogs: [], error: 'Missing date or employee' })
            continue
          }

          try {
            const res = await fetch(`/api/attendance/logs?employeeId=${req.employee_id}&date=${d}&limit=20`, { cache: 'no-store' })
            const data = await res.json().catch(() => [])
            if (!res.ok) {
              results.push({ request: req, existingLogs: [], error: 'Failed to fetch attendance logs' })
              continue
            }

            results.push({ request: req, existingLogs: Array.isArray(data) ? data : [], error: null })
          } catch {
            results.push({ request: req, existingLogs: [], error: 'Failed to fetch attendance logs' })
          }
        }

        setBulkReviewAttendanceComparison(results)
      } finally {
        setBulkReviewComparisonLoading(false)
      }
    }

    loadBulkAttendanceComparison()
  }, [showBulkReviewConfirm, bulkReviewWizardStep, selectedRequestIds, verificationRequests])

  const handleRetap = async (requestId: number) => {
    try {
      setRetapInProgress(true)
      console.log("[Verification] Processing RFID re-tap for request:", requestId)
      
      const request = verificationRequests.find(r => r.request_id === requestId)
      if (!request) {
        openPageError('Error', 'Request not found')
        return
      }

      // Validate that this is a true missed_log request (not an under-review placeholder)
      if (request.request_type !== 'missed_log' || String(request.reason || '').startsWith('[UNDER_REVIEW]')) {
        openPageError('Invalid Request Type', 'Re-tap is only available for missed log requests')
        return
      }

      // Get user info from localStorage for log trail
      const userStr = localStorage.getItem('rams_user')
      const user = userStr ? JSON.parse(userStr) : null
      const adminUserId = user?.id || 0

      const res = await fetch('/api/verification-requests/retap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, adminUserId })
      })
      
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to process re-tap')

      toast({
        title: "RFID Re-tap Successful",
        description: `${json.tapType} tap recorded at ${json.tapTime}. Verification request has been completed.`,
      })

      // Reload data and close dialog
      loadData()
      setSelectedRequest(null)
      setReviewNotes("")
    } catch (error) {
      console.error("[Verification] Error processing re-tap:", error)
      openPageError('Re-tap Failed', error instanceof Error ? error.message : 'Failed to process RFID re-tap')
    } finally {
      setRetapInProgress(false)
    }
  }

  const handleApproveRequest = async (requestId: number, skipSubstitution: boolean = false) => {
    try {
      const request = verificationRequests.find(r => r.request_id === requestId)
      if (!request) {
        openPageError('Error', 'Filing not found')
        return
      }

      if (request.request_type === 'missed_log') {
        const handledAsPair = await applyPairedMissedLogDecision(request, 'approved')
        if (handledAsPair) return
      }

      // Check if this is a leave request and has schedules for the requested date
      if (!skipSubstitution && request.request_type === 'leave' && request.requested_time) {
        const requestDate = new Date(request.requested_time)
        const dateStr = requestDate.toISOString().split('T')[0]
        // Convert JavaScript day (0=Sunday, 1=Monday, ..., 6=Saturday) to our format (1=Monday, ..., 6=Saturday)
        // Note: Sunday=0 won't match any schedules since we don't schedule on Sundays
        const jsDay = requestDate.getDay()
        const dayOfWeek = jsDay === 0 ? null : jsDay // Sunday is null (no schedules), Monday=1, etc.
        
        // Fetch schedules for the employee
        const [teachingSchedules, examSchedules] = await Promise.all([
          getTeachingSchedulesForEmployee(request.employee_id),
          getExamSchedulesForEmployee(request.employee_id),
        ])

        // Find schedules that match the date or day of week
        const matchingSchedules: any[] = []
        
        // Get time range from request (if time-based leave)
        const timeStart = (request as any).time_start || null
        const timeEnd = (request as any).time_end || null
        const leavePlanFromReason = parseLeaveSubstitutionPlan(request)
        const selectedScheduleKeysFromFiling = new Set(leavePlanFromReason.selectedScheduleKeys)
        
        // Check if there's a pending substitution from filing (with substitute employee ID)
        const pendingSubFromFiling = sessionStorage.getItem('pending_substitution_from_filing')
        let substituteEmployeeIdFromFiling: number | null = leavePlanFromReason.substituteEmployeeId
        let manualModeFromFiling = leavePlanFromReason.manualMode
        let manualTimeStartFromFiling = leavePlanFromReason.manualTimeStart
        let manualTimeEndFromFiling = leavePlanFromReason.manualTimeEnd
        if (pendingSubFromFiling) {
          try {
            const subData = JSON.parse(pendingSubFromFiling)
            if (subData.requestId === requestId && subData.employeeId === request.employee_id) {
              substituteEmployeeIdFromFiling = subData.substituteEmployeeId
              manualModeFromFiling = Boolean(subData.manualMode)
              manualTimeStartFromFiling = String(subData.manualTimeStart || manualTimeStartFromFiling || '')
              manualTimeEndFromFiling = String(subData.manualTimeEnd || manualTimeEndFromFiling || '')
              // Clear it after reading
              sessionStorage.removeItem('pending_substitution_from_filing')
            }
          } catch (e) {
            console.error('Error parsing pending_substitution_from_filing:', e)
            sessionStorage.removeItem('pending_substitution_from_filing')
          }
        }
        
        // PRIORITY 1: Use schedule linkage saved in the verification request record.
        const requestSchedule = getRequestScheduleLink(request)

        // PRIORITY 2: Check if there's a pending substitution from employees page (specific schedule)
        const pendingSub = sessionStorage.getItem('pending_substitution')
        let specificScheduleId: number | null = requestSchedule.scheduleId
        let specificScheduleType: 'teaching' | 'exam' | null = requestSchedule.scheduleType
        if (pendingSub) {
          try {
            const subData = JSON.parse(pendingSub)
            if (!specificScheduleId && subData.requestId === requestId && subData.scheduleId && subData.employeeId === request.employee_id) {
              specificScheduleId = subData.scheduleId
              specificScheduleType = subData.scheduleType
              // Clear it after reading
              sessionStorage.removeItem('pending_substitution')
            }
          } catch (e) {
            console.error('Error parsing pending_substitution:', e)
            sessionStorage.removeItem('pending_substitution')
          }
        }
        
        // If specific schedule was requested, ONLY show that one (don't show other schedules)
        if (specificScheduleId && specificScheduleType) {
          if (specificScheduleType === 'teaching') {
            const specificSchedule = teachingSchedules.find((s: any) => s.schedule_id === specificScheduleId)
            if (specificSchedule) {
              matchingSchedules.push({
                ...specificSchedule,
                schedule_type: 'teaching',
                schedule_id: specificSchedule.schedule_id,
              })
            }
          } else if (specificScheduleType === 'exam') {
            const specificSchedule = examSchedules.find((e: any) => e.exam_schedule_id === specificScheduleId)
            if (specificSchedule) {
              matchingSchedules.push({
                ...specificSchedule,
                schedule_type: 'exam',
                schedule_id: specificSchedule.exam_schedule_id,
                exam_date: specificSchedule.exam_date || null,
              })
            }
          }
          if (matchingSchedules.length === 0) {
            openPageError(
              'Schedule Link Mismatch',
              'This verification request is linked to a specific schedule, but that schedule was not found for this employee. Approval was stopped to avoid comparing the wrong schedule.'
            )
            return
          }
          // Don't add any other schedules - only show the linked one
        } else {
          // Normal flow: find all matching schedules for the day
          // If time range is specified, filter schedules that fall within the time range
          if (dayOfWeek !== null) {
            teachingSchedules.forEach((sched: any) => {
              if (sched.day_of_week === dayOfWeek) {
                // If time range is specified, check if schedule falls within the range
                if (timeStart && timeEnd) {
                  const schedStart = sched.time_start || ''
                  const schedEnd = sched.time_end || ''
                  
                  // Convert times to minutes for comparison
                  const timeStartMinutes = timeStart.split(':').slice(0, 2).map(Number).reduce((h: number, m: number) => h * 60 + m, 0)
                  const timeEndMinutes = timeEnd.split(':').slice(0, 2).map(Number).reduce((h: number, m: number) => h * 60 + m, 0)
                  const schedStartMinutes = schedStart.split(':').slice(0, 2).map(Number).reduce((h: number, m: number) => h * 60 + m, 0)
                  const schedEndMinutes = schedEnd.split(':').slice(0, 2).map(Number).reduce((h: number, m: number) => h * 60 + m, 0)
                  
                  // Check if schedule overlaps with leave time range
                  if (schedStartMinutes < timeEndMinutes && schedEndMinutes > timeStartMinutes) {
                    matchingSchedules.push({
                      ...sched,
                      schedule_type: 'teaching',
                      schedule_id: sched.schedule_id,
                    })
                  }
                } else {
                  // No time range - include all schedules for the day
                  matchingSchedules.push({
                    ...sched,
                    schedule_type: 'teaching',
                    schedule_id: sched.schedule_id,
                  })
                }
              }
            })
          }

          // Check exam schedules for matching day of week or specific exam_date
          examSchedules.forEach((exam: any) => {
            if (exam.exam_date === dateStr || (dayOfWeek !== null && exam.day_of_week === dayOfWeek)) {
              // If time range is specified, check if exam schedule falls within the range
              if (timeStart && timeEnd) {
                const examStart = exam.time_start || ''
                const examEnd = exam.time_end || ''
                
                // Convert times to minutes for comparison
                const timeStartMinutes = timeStart.split(':').slice(0, 2).map(Number).reduce((h: number, m: number) => h * 60 + m, 0)
                const timeEndMinutes = timeEnd.split(':').slice(0, 2).map(Number).reduce((h: number, m: number) => h * 60 + m, 0)
                const examStartMinutes = examStart.split(':').slice(0, 2).map(Number).reduce((h: number, m: number) => h * 60 + m, 0)
                const examEndMinutes = examEnd.split(':').slice(0, 2).map(Number).reduce((h: number, m: number) => h * 60 + m, 0)
                
                // Check if exam schedule overlaps with leave time range
                if (examStartMinutes < timeEndMinutes && examEndMinutes > timeStartMinutes) {
                  matchingSchedules.push({
                    ...exam,
                    schedule_type: 'exam',
                    schedule_id: exam.exam_schedule_id,
                    exam_date: exam.exam_date || null,
                  })
                }
              } else {
                // No time range - include all exam schedules for the day
                matchingSchedules.push({
                  ...exam,
                  schedule_type: 'exam',
                  schedule_id: exam.exam_schedule_id,
                  exam_date: exam.exam_date || null,
                })
              }
            }
          })
        }
        
        const totalMatchedSchedules = matchingSchedules.length
        const matchedSchedulesForApproval = selectedScheduleKeysFromFiling.size > 0
          ? matchingSchedules.filter((schedule) => selectedScheduleKeysFromFiling.has(getScheduleSelectionKey(schedule)))
          : matchingSchedules

        if (matchingSchedules.length > 0 && selectedScheduleKeysFromFiling.size > 0 && matchedSchedulesForApproval.length === 0) {
          openPageError(
            'No Schedules Selected From Filing',
            'The leave filing contains selected schedule entries, but none matched the current employee schedule snapshot. Please review the filing and try again.'
          )
          return
        }

        // If substitute employee ID was provided from filing, pre-populate substitution forms
        if (substituteEmployeeIdFromFiling && matchedSchedulesForApproval.length > 0) {
          const shouldMarkOriginalAbsent = totalMatchedSchedules > 0 && matchedSchedulesForApproval.length === totalMatchedSchedules
          const prePopulatedForms: Record<string, {
            substituteEmployeeId: string,
            unavailableReason: string,
            status: 'on-leave' | 'absent' | 'unavailable',
            substitutionDate?: string,
            manualMode?: boolean,
            manualTimeStart?: string,
            manualTimeEnd?: string,
          }> = {}
          matchedSchedulesForApproval.forEach((schedule) => {
            const formKey = `${schedule.schedule_type}-${schedule.schedule_id}`
            prePopulatedForms[formKey] = {
              substituteEmployeeId: String(substituteEmployeeIdFromFiling),
              unavailableReason: shouldMarkOriginalAbsent ? 'On Leave (Full-day class coverage assigned)' : 'On Leave',
              status: shouldMarkOriginalAbsent ? 'absent' : 'on-leave',
              substitutionDate: dateStr,
              manualMode: manualModeFromFiling,
              manualTimeStart: manualTimeStartFromFiling || String(schedule.time_start || '').slice(0, 5),
              manualTimeEnd: manualTimeEndFromFiling || String(schedule.time_end || '').slice(0, 5),
            }
          })
          setSubstitutionForms(prePopulatedForms)
        }

        // If there are matching schedules, show substitution dialog
        if (matchedSchedulesForApproval.length > 0) {
          setSubstitutionDialogViewMode('approve') // Set to approve mode for approval flow
          setPendingApproval({ 
            requestId, 
            employee_id: request.employee_id, 
            schedules: matchedSchedulesForApproval,
            allSchedules: matchingSchedules,
            specificScheduleId: specificScheduleId || null,
            specificScheduleType: specificScheduleType || null,
          })
          
          // Fetch available substitutes for each schedule
          const requestedDate = request.requested_time ? new Date(request.requested_time).toISOString().split('T')[0] : ''
          if (requestedDate) {
            const substitutesMap: Record<string, any[]> = {}
            for (const schedule of matchedSchedulesForApproval) {
              const formKey = `${schedule.schedule_type}-${schedule.schedule_id}`
              const availableTeachers = await fetchAvailableSubstitutes(schedule, requestedDate)
              substitutesMap[formKey] = availableTeachers
            }
            setAvailableSubstitutesMap(substitutesMap)
          }
          
          setShowSubstitutionDialog(true)
          return
        }

        // No schedulable teaching/exam blocks found for leave request.
        // Provide a manual substitution flow (useful for non-teaching shifting/coverage).
        const sourceEmployee = employees.find((emp) => Number((emp as any)?.employee_id) === Number(request.employee_id))
        const sourceStaffType = String((request as any)?.employees?.staff_type || (sourceEmployee as any)?.staff_type || '').trim()
        const manualSchedule = {
          schedule_type: 'manual',
          schedule_id: Number(requestId),
          employee_id: request.employee_id,
          source_staff_type: sourceStaffType,
          subject_name: sourceStaffType.toLowerCase().includes('non') ? 'Non-Teaching Coverage' : 'Manual Leave Coverage',
          room_code: (request as any)?.employees?.department || (sourceEmployee as any)?.department || 'N/A',
          time_start: (request as any)?.time_start || (sourceEmployee as any)?.schedule_time_in || '',
          time_end: (request as any)?.time_end || (sourceEmployee as any)?.schedule_time_out || '',
        }

        const requestedDate = request.requested_time ? new Date(request.requested_time).toISOString().split('T')[0] : getManilaToday()
        const formKey = `manual-${requestId}`
        const manualSubstitutes = await fetchAvailableSubstitutes(manualSchedule, requestedDate)

        setSubstitutionDialogViewMode('approve')
        setPendingApproval({
          requestId,
          employee_id: request.employee_id,
          schedules: [manualSchedule],
          allSchedules: [manualSchedule],
          specificScheduleId: Number(requestId),
          specificScheduleType: 'manual',
        })
        setSelectedScheduleForSubstitution({ scheduleId: Number(requestId), scheduleType: 'manual' })
        setAvailableSubstitutesMap({ [formKey]: manualSubstitutes })
        setSubstitutionForms((prev) => ({
          ...prev,
          [formKey]: {
            substituteEmployeeId: substituteEmployeeIdFromFiling ? String(substituteEmployeeIdFromFiling) : '',
            unavailableReason: 'On Leave',
            status: 'on-leave',
            substitutionDate: requestedDate,
            manualMode: manualModeFromFiling || true,
            manualTimeStart: manualTimeStartFromFiling || manualSchedule.time_start || '',
            manualTimeEnd: manualTimeEndFromFiling || manualSchedule.time_end || '',
          }
        }))
        setShowSubstitutionDialog(true)
        return
      }

      // Proceed with approval (no schedules or skipping substitution)
      await performApproval(requestId, skipSubstitution)
    } catch (error) {
      console.error("[Verification] Error approving request:", error)
      openPageError('Error', 'Failed to approve request')
    }
  }

  const performApproval = async (requestId: number, skipSubstitution: boolean = false) => {
    try {
      const request = verificationRequests.find(r => r.request_id === requestId)
      if (!request) {
        toast({
          title: "Error",
          description: "Filing not found",
          variant: "destructive",
        })
        return
      }

      const manualOverrideLines = (pendingApproval?.schedules || []).flatMap((schedule: any) => {
        const formKey = `${schedule.schedule_type}-${schedule.schedule_id}`
        const form = substitutionForms[formKey]
        if (!form || !(form.manualMode || schedule.schedule_type === 'manual')) return []
        if (!form.manualTimeStart || !form.manualTimeEnd) return []
        const dateText = form.substitutionDate || 'N/A'
        const label = schedule.schedule_type === 'manual' ? 'manual-coverage' : `${schedule.schedule_type}-${schedule.schedule_id}`
        return [`[MANUAL_FINAL_SCHEDULE] ${label} ${dateText} ${form.manualTimeStart}-${form.manualTimeEnd}`]
      })

      const normalizedReviewNotes = [
        String(reviewNotes || '').trim(),
        ...manualOverrideLines,
      ].filter(Boolean).join('\n')

      const res = await fetch('/api/verification-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          requestId, 
          updates: { 
            status: 'approved', 
            reviewed_by: getReviewerId(), 
            review_notes: normalizedReviewNotes, 
            reviewed_at: new Date().toISOString(),
            // Include substitution data if available and not skipping
            ...(pendingApproval?.schedules.length && !skipSubstitution ? {
              substitution_applied: true,
            } : {
              substitution_applied: false,
            })
          } 
        })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to update')

      // Apply substitutions if any were assigned AND not skipping substitution
      // IMPORTANT: Substitutions are only applied AFTER the request is approved (status = 'approved')
      if (pendingApproval && pendingApproval.schedules.length > 0 && !skipSubstitution) {
        await applySubstitutions(pendingApproval.schedules, requestId, pendingApproval.employee_id)
      }

      toast({
        title: "Filing Approved",
        description: pendingApproval?.schedules.length && !skipSubstitution
          ? "Verification filing approved and substitutes assigned."
          : pendingApproval?.schedules.length && skipSubstitution
          ? "Verification filing approved without substitution. Employee marked as absent."
          : "Verification filing has been approved successfully.",
      })

      loadData()
      setSelectedRequest(null)
      setReviewNotes("")
      setShowReviewDialog(false)
      setShowSubstitutionDialog(false)
      setPendingApproval(null)
      setSubstitutionForms({})
    } catch (error) {
      console.error("[Verification] Error performing approval:", error)
      openPageError('Error', 'Failed to approve request')
    }
  }

  const applySubstitutions = async (schedules: any[], requestId: number, originalEmployeeId: number) => {
    try {
      const userStr = localStorage.getItem('rams_user')
      const adminUser = userStr ? JSON.parse(userStr) : null

      // IMPORTANT: Substitutions are only applied AFTER the verification filing is approved
      // This function is called from performApproval which first sets status to 'approved'
      for (const schedule of schedules) {
        const formKey = `${schedule.schedule_type}-${schedule.schedule_id}`
        const form = substitutionForms[formKey]
        
        if (form && form.substituteEmployeeId && form.unavailableReason.trim() && form.substitutionDate) {
          if (form.manualMode || schedule.schedule_type === 'manual') {
            const manualStart = String(form.manualTimeStart || '').trim()
            const manualEnd = String(form.manualTimeEnd || '').trim()

            if (!manualStart || !manualEnd) {
              throw new Error('Manual schedule time range is required for manual substitution mode')
            }

            const res = await fetch('/api/substitution/create', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                originalEmployeeId,
                substituteEmployeeId: Number(form.substituteEmployeeId),
                substitutionDate: form.substitutionDate,
                startTime: manualStart,
                endTime: manualEnd,
                verificationRequestId: requestId,
              })
            })

            if (!res.ok) {
              const json = await res.json().catch(() => ({}))
              throw new Error(json?.error || 'Failed to create manual substitution schedule')
            }

            continue
          }

          if (schedule.schedule_type === 'exam') {
            const res = await fetch('/api/verification-requests/substitute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                schedule_type: 'exam',
                schedule_id: schedule.schedule_id,
                substitute_employee_id: Number(form.substituteEmployeeId),
                unavailable_reason: form.unavailableReason.trim(),
                status: form.status,
                substitution_date: form.substitutionDate, // CRITICAL: Include substitution date
                admin_user_id: adminUser?.id,
                verification_request_id: requestId, // Link substitution to verification filing
              })
            })
            if (!res.ok) {
              const json = await res.json()
              throw new Error(json?.error || 'Failed to assign substitute')
            }
          } else if (schedule.schedule_type === 'teaching') {
            const res = await fetch('/api/verification-requests/substitute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                schedule_type: 'teaching',
                schedule_id: schedule.schedule_id,
                substitute_employee_id: Number(form.substituteEmployeeId),
                unavailable_reason: form.unavailableReason.trim(),
                status: form.status,
                substitution_date: form.substitutionDate, // CRITICAL: Include substitution date
                admin_user_id: adminUser?.id,
                verification_request_id: requestId, // Link substitution to verification filing
              })
            })
            if (!res.ok) {
              const json = await res.json()
              throw new Error(json?.error || 'Failed to assign substitute')
            }
          }
        }
      }
    } catch (error) {
      console.error("[Verification] Error applying substitutions:", error)
      openPageError('Substitution Warning', 'Filing approved but some substitutions may have failed. Please check manually.')
      throw error // Re-throw to allow calling code to handle
    }
  }

  const handleRejectRequest = async (requestId: number) => {
    try {
      const request = verificationRequests.find(r => r.request_id === requestId)
      if (!request) {
        openPageError('Error', 'Filing not found')
        return
      }

      if (request.request_type === 'missed_log') {
        const handledAsPair = await applyPairedMissedLogDecision(request, 'rejected')
        if (handledAsPair) return
      }

      console.log("[Verification] Rejecting request:", requestId)
      const res = await fetch('/api/verification-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, updates: { status: 'rejected', reviewed_by: getReviewerId(), review_notes: reviewNotes, reviewed_at: new Date().toISOString() } })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to update')

      toast({
        title: "Filing Rejected",
        description: "Verification filing has been rejected.",
      })

      loadData()
      setSelectedRequest(null)
      setReviewNotes("")
      setShowReviewDialog(false)
    } catch (error) {
      console.error("[Verification] Error rejecting request:", error)
      toast({
        title: "Error",
        description: "Failed to reject filing",
        variant: "destructive",
      })
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { className: "bg-yellow-100 text-yellow-800", icon: Clock },
      approved: { className: "bg-green-100 text-green-800", icon: CheckCircle },
      rejected: { className: "bg-red-100 text-red-800", icon: XCircle },
    }
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending
    const Icon = config.icon
    return (
      <Badge className={config.className}>
        <Icon className="h-3 w-3 mr-1" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    )
  }

  const getTypeBadge = (type: string, reason?: string) => {
    void reason

    const typeConfig = {
      missed_log: { className: "bg-purple-100 text-purple-800" },
      leave: { className: "bg-green-100 text-green-800" },
    }
    const config = typeConfig[type as keyof typeof typeConfig] || { className: "bg-gray-100 text-gray-800" }
    return <Badge className={config.className}>{type.replace("_", " ").toUpperCase()}</Badge>
  }

  const getRequestSourceBadge = (source?: string) => {
    const normalized = String(source || '').toLowerCase()
    if (normalized === 'automatic') {
      return <Badge variant="outline" className="text-[10px] border-indigo-300 text-indigo-700 dark:border-indigo-700 dark:text-indigo-300">Automatic</Badge>
    }
    return <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300">Manual</Badge>
  }

  const formatRequestTypeText = (value: any): string => {
    const raw = String(value || '').trim().replace(/_/g, ' ')
    if (!raw) return 'N/A'
    return raw
      .split(' ')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  const formatReasonForDisplay = (value: any): string => {
    const raw = String(value || '').trim()
    if (!raw) return 'N/A'
    const cleaned = raw.replace(/^(\[[^\]]+\]\s*)+/g, '').trim()
    return cleaned || raw
  }

  const formatRequestDateTime = (value: any): string => {
    const raw = String(value || '').trim()
    if (!raw) return 'N/A'
    try {
      const normalized = raw.includes(' ') ? raw.replace(' ', 'T') : raw
      const withTz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}+08:00`
      const parsed = new Date(withTz)
      if (Number.isNaN(parsed.getTime())) return raw
      return formatInTimeZone(parsed, 'Asia/Manila', 'MMM dd, yyyy h:mm a').replace(/\s?am/i, ' AM').replace(/\s?pm/i, ' PM')
    } catch {
      return raw
    }
  }

  const pendingCount = verificationRequests.filter((req) => req.status === "pending").length
  const approvedCount = verificationRequests.filter((req) => req.status === "approved").length
  const rejectedCount = verificationRequests.filter((req) => req.status === "rejected").length
  const doneCount = approvedCount + rejectedCount
  const workflowCategoryLabel =
    workflowCategory === 'needs_action'
      ? 'Needs Action'
      : workflowCategory === 'done'
        ? 'Done'
        : 'All / Custom'
  const selectedCount = selectedRequestIds.size
  const filteredPendingCount = filteredRequests.filter((req) => req.status === 'pending').length
  const selectedPendingCount = verificationRequests.filter((req) => selectedRequestIds.has(Number(req.request_id)) && req.status === 'pending').length
  const allFilteredSelected = filteredRequests.length > 0 && filteredRequests.every((req) => selectedRequestIds.has(Number(req.request_id)))
  const partiallySelected = selectedCount > 0 && !allFilteredSelected
  const selectedRequestPendingPair = selectedRequest ? getPairedMissedLogRequest(selectedRequest, { pendingOnly: true }) : null
  const selectedRequestPairGroup = selectedRequest
    ? [selectedRequest, selectedRequestPendingPair]
        .filter(Boolean)
        .filter((req: any, idx: number, arr: any[]) => idx === arr.findIndex((item: any) => Number(item?.request_id) === Number(req?.request_id)))
        .sort((a: any, b: any) => {
          const aType = getMissedLogType(a)
          const bType = getMissedLogType(b)
          const rank = (type: 'IN' | 'OUT' | null) => (type === 'IN' ? 0 : type === 'OUT' ? 1 : 2)
          const byType = rank(aType) - rank(bType)
          if (byType !== 0) return byType
          const aTs = new Date(a?.requested_time || a?.requested_at || 0).getTime()
          const bTs = new Date(b?.requested_time || b?.requested_at || 0).getTime()
          return aTs - bTs
        })
    : []
  const selectedRequestPairIndex = selectedRequestPairGroup.findIndex((req: any) => Number(req?.request_id) === Number(selectedRequest?.request_id))

  const navigateSelectedRequestPair = (direction: 'prev' | 'next') => {
    if (selectedRequestPairGroup.length <= 1) return
    if (selectedRequestPairIndex < 0) return

    const nextIndex = direction === 'next' ? selectedRequestPairIndex + 1 : selectedRequestPairIndex - 1
    if (nextIndex < 0 || nextIndex >= selectedRequestPairGroup.length) return

    const target = selectedRequestPairGroup[nextIndex]
    if (!target) return

    setSelectedRequest(target)
    setReviewNotes(target.review_notes || "")

    if (target.status === 'approved') {
      fetchSubstitutionDetails(target.request_id)
    } else {
      setSubstitutionDetails(null)
    }
  }

  useEffect(() => {
    if (!showReviewDialog) return
    if (selectedRequestPairGroup.length <= 1) return

    const handlePairKeyNavigation = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = String(target?.tagName || '').toUpperCase()
      const isTypingTarget = tag === 'INPUT' || tag === 'TEXTAREA' || Boolean(target?.isContentEditable)
      if (isTypingTarget) return
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        navigateSelectedRequestPair('prev')
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        navigateSelectedRequestPair('next')
      }
    }

    window.addEventListener('keydown', handlePairKeyNavigation)
    return () => {
      window.removeEventListener('keydown', handlePairKeyNavigation)
    }
  }, [showReviewDialog, selectedRequestPairGroup, selectedRequestPairIndex, selectedRequest])

  const activeFilterCount = [
    searchTerm.trim() ? 1 : 0,
    selectedStatus !== 'All Statuses' ? 1 : 0,
    selectedType !== 'All Types' ? 1 : 0,
    selectedDepartment !== 'All Departments' ? 1 : 0,
    selectedSort !== 'requested_desc' ? 1 : 0,
    selectedDateRange !== 'all' ? 1 : 0,
  ].reduce((acc, cur) => acc + cur, 0)
  const departmentOptions = Array.from(
    new Set(
      verificationRequests
        .map((req) => req.employees?.department)
        .filter((dept): dept is string => Boolean(dept))
    )
  ).sort((a, b) => a.localeCompare(b))
  const missedLogNoScheduleCoverage =
    createForm.request_type === 'missed_log' &&
    Boolean(createForm.employee_id) &&
    Boolean(createForm.date) &&
    !hasScheduleCoverageForDate(createForm.employee_id, createForm.date)
  const selectedCreateEmployee = employees.find((emp: any) => Number(emp.employee_id) === Number(createForm.employee_id)) as any
  const leaveRestriction = getLeaveRestriction(selectedCreateEmployee)
  const canSelectLeaveByTenure = leaveRestriction.allowed
  const canSelectMissedLogByStartDate = hasEmployeeStartedForMissedLog(selectedCreateEmployee)
  const leaveEligibleOn = getLeaveEligibleDatePart(selectedCreateEmployee)
  const missedLogStartsOn = getEmployeeStartDatePart(selectedCreateEmployee)

  const applyQuickFilter = (preset: 'all' | 'needs_action' | 'done' | 'approved' | 'rejected') => {
    if (preset === 'all') {
      setWorkflowCategory('all')
      setSelectedStatus('All Statuses')
      setSelectedType('All Types')
      return
    }

    if (preset === 'needs_action') {
      setWorkflowCategory('needs_action')
      setSelectedStatus('pending')
      setSelectedType('All Types')
      return
    }

    if (preset === 'done') {
      setWorkflowCategory('done')
      setSelectedStatus('All Statuses')
      setSelectedType('All Types')
      return
    }

    setWorkflowCategory('all')
    setSelectedStatus(preset)
    setSelectedType('All Types')
  }

  const applyQuickDateFilter = (preset: 'all' | 'today' | 'last_7_days' | 'this_month') => {
    setSelectedDateRange(preset)
    if (preset !== 'custom') {
      setCustomStartDate('')
      setCustomEndDate('')
    }
  }

  const clearFilters = () => {
    setWorkflowCategory('needs_action')
    setSearchTerm('')
    setSelectedStatus('All Statuses')
    setSelectedType('All Types')
    setSelectedDepartment('All Departments')
    setSelectedSort('requested_desc')
    setSelectedDateRange('all')
    setCustomStartDate('')
    setCustomEndDate('')
    setSelectedRequestIds(new Set())
  }

  useEffect(() => {
    const fetchReviewDayLogs = async () => {
      if (!showReviewDialog || !selectedRequest?.employee_id) {
        setReviewDayLogs([])
        return
      }

      const reqDate = String(selectedRequest.requested_time || '').slice(0, 10)
      if (!reqDate) {
        setReviewDayLogs([])
        return
      }

      try {
        setReviewOverviewLoading(true)
        const res = await fetch(`/api/attendance/logs?employeeId=${selectedRequest.employee_id}&date=${reqDate}&limit=20`, { cache: 'no-store' })
        const data = await res.json().catch(() => [])
        if (!res.ok) {
          setReviewDayLogs([])
          return
        }
        setReviewDayLogs(Array.isArray(data) ? data : [])
      } catch {
        setReviewDayLogs([])
      } finally {
        setReviewOverviewLoading(false)
      }
    }

    fetchReviewDayLogs()
  }, [showReviewDialog, selectedRequest?.request_id, selectedRequest?.employee_id, selectedRequest?.requested_time])

  // Leave Management Functions
  const fetchLeaveData = async () => {
    try {
      setLeaveLoading(true)
      const res = await fetch('/api/leave-requests?mine=true', { credentials: 'same-origin' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to load leave data')

      setCurrentUser(data?.currentUser || null)
      setLeaveTypes((data?.leaveTypes || []) as any[])
      setLeaveCredits((data?.leaveCredits || []) as any[])
      setLeaveRequests((data?.leaveRequests || []) as any[])
    } catch (error: any) {
      console.error('Error fetching leave data:', error)
    } finally {
      setLeaveLoading(false)
    }
  }

  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser) return
    const { differenceInDays } = await import('date-fns')
    const daysRequested = differenceInDays(new Date(leaveFormData.date_to), new Date(leaveFormData.date_from)) + 1
    if (daysRequested <= 0) {
      toast({ title: "Error", description: "Invalid date range", variant: "destructive" })
      return
    }
    const credit = leaveCredits.find(c => c.leave_type_id.toString() === leaveFormData.leave_type_id)
    if (!credit || credit.remaining_credits < daysRequested) {
      toast({ title: "Error", description: `Insufficient leave credits. You have ${credit?.remaining_credits || 0} days remaining.`, variant: "destructive" })
      return
    }
    try {
      const res = await fetch('/api/leave-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          leave_type_id: parseInt(leaveFormData.leave_type_id),
          date_from: leaveFormData.date_from,
          date_to: leaveFormData.date_to,
          reason: leaveFormData.reason,
          days_requested: daysRequested,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to submit leave request')

      toast({ title: "Success", description: "Leave request submitted successfully" })
      setLeaveDialogOpen(false)
      setLeaveFormData({ leave_type_id: '', date_from: '', date_to: '', reason: '' })
      fetchLeaveData()
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
    }
  }

  const fetchLeaveApprovalRequests = async () => {
    try {
      setLeaveLoading(true)
      const qs = leaveFilterStatus !== 'all' ? `?status=${encodeURIComponent(leaveFilterStatus)}` : ''
      const res = await fetch(`/api/leave-requests${qs}`, { credentials: 'same-origin' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to load leave approval requests')
      setLeaveApprovalRequests((data?.leaveRequests as any) || [])
    } catch (error: any) {
      console.warn('[Verification] Leave approval requests unavailable:', error?.message || error)
      setLeaveApprovalRequests([])
    } finally {
      setLeaveLoading(false)
    }
  }

  const handleLeaveReview = async () => {
    if (!selectedLeaveRequest) return
    try {
      const res = await fetch('/api/leave-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          requestId: selectedLeaveRequest.id,
          action: leaveReviewAction,
          remarks: leaveRemarks || null,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to review leave request')

      toast({ title: "Success", description: `Leave request ${leaveReviewAction === 'approve' ? 'approved' : 'denied'} successfully` })
      setLeaveReviewDialog(false)
      fetchLeaveApprovalRequests()
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
    }
  }

  const getLeaveStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">Pending</Badge>
      case 'approved': return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Approved</Badge>
      case 'denied': return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">Denied</Badge>
      case 'cancelled': return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300">Cancelled</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  const filteredLeaveApprovalRequests = leaveApprovalRequests.filter((request) =>
    request.employees.full_name.toLowerCase().includes(leaveSearchQuery.toLowerCase()) ||
    request.leave_types.leave_type_name.toLowerCase().includes(leaveSearchQuery.toLowerCase())
  )

  // Summary counts for Leave Approval cards
  const pendingLeaveCount = leaveApprovalRequests.filter((r) => r.status === 'pending').length
  const approvedLeaveCount = leaveApprovalRequests.filter((r) => r.status === 'approved').length
  const deniedLeaveCount = leaveApprovalRequests.filter((r) => r.status === 'denied').length

  // Comprehensive validation for the Create Filing form
  const validateCreateForm = async (): Promise<string[]> => {
    const errors: string[] = []
    const normalizeLogType = (value: string | null | undefined): 'IN' | 'OUT' | 'BOTH' | null => {
      const normalized = String(value || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '_')
        .replace(/-/g, '_')
      if (['IN', 'TIME_IN', 'CLOCK_IN', 'TIMEIN', 'CLOCKIN'].includes(normalized)) return 'IN'
      if (['OUT', 'TIME_OUT', 'CLOCK_OUT', 'TIMEOUT', 'CLOCKOUT'].includes(normalized)) return 'OUT'
      if (['BOTH', 'IN_OUT', 'INOUT', 'IN_AND_OUT'].includes(normalized)) return 'BOTH'
      return null
    }

    if (!createForm.employee_id || createForm.employee_id === 0) errors.push('Employee is required.')
    if (!createForm.request_type || createForm.request_type === '') errors.push('Request Type is required.')
    if (!createForm.date) errors.push('Date is required.')
    if (!createForm.reason || !String(createForm.reason).trim()) {
      errors.push('Reason/justification is required.')
    } else if (createForm.request_type === 'missed_log' && String(createForm.reason).trim().length < 20) {
      errors.push(`Missed Log reason must be at least 20 characters. Currently: ${String(createForm.reason).trim().length} characters.`)
    }

    if (createForm.request_type === 'missed_log' && !createForm.log_type) {
      errors.push('Log Type is required for Missed Log (choose IN, OUT, or BOTH).')
    }

    // Missed Log time validation: enforce 6:00 AM – 9:00 PM range
    if (createForm.request_type === 'missed_log' && createForm.log_type) {
      const selectedLogType = normalizeLogType(createForm.log_type)
      const parseHhMmToMinutes = (hhmm: string): number | null => {
        if (!hhmm) return null
        const [h, m] = hhmm.split(':').map(Number)
        if (!Number.isFinite(h) || !Number.isFinite(m)) return null
        return h * 60 + m
      }
      const MIN_MINUTES = 6 * 60  // 6:00 AM
      const MAX_MINUTES = 21 * 60 // 9:00 PM

      if (selectedLogType === 'BOTH') {
        if (!createForm.time_start || !createForm.time_end) {
          errors.push('Both Time In and Time Out are required for Missed Log (BOTH).')
        } else {
          const startMin = parseHhMmToMinutes(createForm.time_start)
          const endMin = parseHhMmToMinutes(createForm.time_end)
          if (startMin !== null && endMin !== null) {
            if (startMin >= endMin) errors.push('Time In must be earlier than Time Out.')
            if (startMin < MIN_MINUTES || startMin > MAX_MINUTES) errors.push('Time In must be between 6:00 AM and 9:00 PM.')
            if (endMin < MIN_MINUTES || endMin > MAX_MINUTES) errors.push('Time Out must be between 6:00 AM and 9:00 PM.')
          }
        }
      } else if (selectedLogType === 'IN' || selectedLogType === 'OUT') {
        if (!createForm.time) {
          errors.push(`Time is required for Missed Log (${selectedLogType}).`)
        } else {
          const timeMin = parseHhMmToMinutes(createForm.time)
          if (timeMin !== null && (timeMin < MIN_MINUTES || timeMin > MAX_MINUTES)) {
            errors.push(`Missed Log time must be between 6:00 AM and 9:00 PM.`)
          }
        }
      }
    }

    if (createForm.employee_id && createForm.date && createForm.request_type === 'missed_log') {
      const hasIn = availableAttendanceLogs.some((log: any) => normalizeLogType(log?.log_type) === 'IN')
      const hasOut = availableAttendanceLogs.some((log: any) => normalizeLogType(log?.log_type) === 'OUT')

      if (hasIn && hasOut) {
        errors.push('Cannot file Missed Log for this date because both Time In and Time Out already exist.')
      } else {
        const selectedLogType = normalizeLogType(createForm.log_type)
        if (selectedLogType === 'BOTH' && (hasIn || hasOut)) {
          errors.push('Cannot file Missed Log (BOTH) because Time In or Time Out already exists for this date.')
        }
        if (selectedLogType === 'IN' && hasIn) {
          errors.push('Cannot file Missed Log (IN) because Time In already exists for this date.')
        }
        if (selectedLogType === 'OUT' && hasOut) {
          errors.push('Cannot file Missed Log (OUT) because Time Out already exists for this date.')
        }
      }
    }

    if (createForm.employee_id && createForm.date && createForm.request_type === 'leave') {
      try {
        const res = await fetch(
          `/api/attendance/logs?employeeId=${createForm.employee_id}&date=${encodeURIComponent(createForm.date)}&limit=200`,
          { cache: 'no-store' }
        )
        const existingLogs = await res.json().catch(() => [])
        if (res.ok && Array.isArray(existingLogs) && existingLogs.length > 0) {
          errors.push('Cannot file Leave for this date because attendance data already exists.')
        }
      } catch {
        // Backend has final enforcement; avoid blocking due to temporary fetch issues.
      }
    }

    // Validate that selected date matches employee's schedule (for all request types)
    // CRITICAL: Must have actual class/exam schedule on that specific date
    if (createForm.employee_id && createForm.date) {
      const selectedDate = new Date(createForm.date + 'T00:00:00')
      const dayOfWeek = selectedDate.getDay() // 0=Sunday, 1=Monday, ..., 6=Saturday
      
      // First check: Is this day in the employee's general schedule?
      // BYPASS: Part Time Full Load Teaching staff can file missed logs for any weekday
      const selectedEmployeeForScheduleCheck = employees.find((e: any) => Number(e.employee_id) === Number(createForm.employee_id)) as any
      const isPartTimeFullLoadTeaching =
        createForm.request_type === 'missed_log' &&
        String(selectedEmployeeForScheduleCheck?.staff_type || '').toLowerCase() === 'teaching' &&
        String(selectedEmployeeForScheduleCheck?.employment_status || '').toLowerCase().replace(/[\s_-]+/g, '') === 'parttimefullload'

      if (!isPartTimeFullLoadTeaching && employeeScheduledDays.size > 0 && !employeeScheduledDays.has(dayOfWeek)) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        const selectedDayName = dayNames[dayOfWeek]
        const scheduledDayNames = Array.from(employeeScheduledDays).sort().map(d => dayNames[d]).join(', ')
        
        if (createForm.request_type === 'missed_log') {
          errors.push(`Cannot file Missed Log for ${selectedDayName}. Employee is only scheduled on: ${scheduledDayNames}.`)
        } else {
          errors.push(`Selected date (${selectedDayName}) does not match employee's work schedule. Employee works on: ${scheduledDayNames}.`)
        }
      } else {
        // Second check: Verify there's an actual class/exam on this specific date
        // This is CRITICAL for Teaching staff - they must have a class/exam on the chosen date
        try {
            const selectedEmployeeRecord = employees.find((e: any) => e.employee_id === createForm.employee_id)
            if (selectedEmployeeRecord?.staff_type === 'Teaching') {
              const dateStr = format(selectedDate, 'yyyy-MM-dd')

              let termParam: '1st_term' | '2nd_term' | 'summer' | undefined = undefined
              if (currentAcademicTerm?.term_name) {
                if (currentAcademicTerm.term_name === '1st Term') termParam = '1st_term'
                else if (currentAcademicTerm.term_name === '2nd Term') termParam = '2nd_term'
                else if (currentAcademicTerm.term_name === 'Summer') termParam = 'summer'
              }

              const [teachingSchedules, examSchedules] = await Promise.all([
                getTeachingSchedulesForEmployee(createForm.employee_id, termParam),
                getExamSchedulesForEmployee(createForm.employee_id, termParam),
              ])

              const hasTeachingSchedule = (teachingSchedules || []).some((s: any) => Number(s.day_of_week) === dayOfWeek)
              const hasExamSchedule = (examSchedules || []).some((s: any) => {
                const examDate = String(s.exam_date || '').slice(0, 10)
                return examDate === dateStr || Number(s.day_of_week) === dayOfWeek
              })

              if (!hasTeachingSchedule && !hasExamSchedule) {
                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                const selectedDayName = dayNames[dayOfWeek]
                errors.push(`No class or exam schedule found for ${selectedDayName}, ${dateStr}. Verification requests can only be filed for dates with actual teaching or exam schedules.`)
              }
            }
        } catch (error) {
          console.error('[Validation] Error checking schedule:', error)
          // Don't block submission if API fails, just log it
        }
      }
    }

    if (createForm.request_type === 'leave' && createForm.manual_schedule_override) {
      const manualStart = String(createForm.time_start || '').trim()
      const manualEnd = String(createForm.time_end || '').trim()
      if (!manualStart || !manualEnd) {
        errors.push('Manual final schedule requires both start and end time.')
      } else {
        const manualStartMinute = Number(manualStart.split(':')[1] || -1)
        const manualEndMinute = Number(manualEnd.split(':')[1] || -1)
        if (![0, 30].includes(manualStartMinute) || ![0, 30].includes(manualEndMinute)) {
          errors.push('Manual final schedule must use 30-minute increments only (:00 or :30).')
        }
      }
      if (manualStart && manualEnd && manualStart >= manualEnd) {
        errors.push('Manual final schedule is invalid. End time must be later than start time.')
      }
    }

    if (createForm.request_type === 'leave' && createForm.requires_substitution) {
      if (!createForm.substitute_employee_id || createForm.substitute_employee_id === 0) {
        errors.push('Substitute teacher is required when substitution is enabled.')
      }
      if (createForm.substitute_employee_id && createForm.substitute_employee_id === createForm.employee_id) {
        errors.push('Employee cannot be their own substitute. Please choose a different teacher.')
      }

      const selectedEmployeeForLeave = employees.find((e: any) => Number(e.employee_id) === Number(createForm.employee_id)) as any
      const isTeaching = String(selectedEmployeeForLeave?.staff_type || '').toLowerCase() === 'teaching'
      const isNonTeaching = String(selectedEmployeeForLeave?.staff_type || '').toLowerCase().includes('non')
      if (isTeaching && createLeaveScheduleOptions.length > 0 && createSelectedLeaveScheduleKeys.size === 0) {
        errors.push('Select at least one class/exam schedule for leave coverage.')
      }

      if (isTeaching && Number(createForm.substitute_employee_id) > 0 && createSelectedLeaveScheduleKeys.size > 0 && createForm.date) {
        const selectedSchedules = createLeaveScheduleOptions.filter((schedule) =>
          createSelectedLeaveScheduleKeys.has(getScheduleSelectionKey(schedule))
        )

        if (selectedSchedules.length > 0) {
          const conflictResults = await Promise.all(
            selectedSchedules.map(async (schedule) => {
              const result = await checkSpecificSubstituteConflict(
                schedule,
                createForm.date,
                Number(createForm.substitute_employee_id)
              )
              return { schedule, result }
            })
          )

          const conflicts = conflictResults.filter((item) => item.result.hasConflict)
          if (conflicts.length > 0) {
            const conflictSummary = conflicts
              .slice(0, 3)
              .map((item) => {
                const start = formatDbTime12h(String(item.schedule?.time_start || '').slice(0, 5))
                const end = formatDbTime12h(String(item.schedule?.time_end || '').slice(0, 5))
                return `${item.schedule?.subject_name || 'Schedule'} (${start}-${end})`
              })
              .join('; ')
            errors.push(`Proposed substitute has attendance/schedule conflicts on selected blocks: ${conflictSummary}${conflicts.length > 3 ? '; ...' : ''}`)
          }
        }
      }

      if (isNonTeaching && !createForm.manual_schedule_override) {
        errors.push('Non-Teaching leave substitution requires Manual Final Schedule Override for mixed shift coverage.')
      }
    }

    try {
      if (createForm.date) {
        const today = new Date(); today.setHours(0,0,0,0)
        const picked = new Date(createForm.date + 'T00:00:00')
        if (picked.getDay() === 0) errors.push('Sunday is not allowed.')

        if (createForm.request_type === 'missed_log') {
          // Missed Log: must be today or in the past
          const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
          if (picked >= tomorrow) errors.push('Missed Log date must be today or in the past — you cannot file a missed log for a future date.')
          
          // Enforce hire date floor
          const selectedEmployee = employees.find((emp: any) => Number(emp.employee_id) === Number(createForm.employee_id)) as any
          if (selectedEmployee?.hire_date) {
            const hireDate = new Date(selectedEmployee.hire_date + 'T00:00:00')
            hireDate.setHours(0, 0, 0, 0)
            if (picked < hireDate) errors.push(`Date cannot be before the employee's start date (${selectedEmployee.hire_date}).`)
          }
        } else {
          // Leave: must be today or in the future
          if (picked < today) errors.push('Date cannot be in the past.')
        }
      }
    } catch {}

    if (createForm.request_type === 'leave' && createForm.employee_id) {
      const selectedEmployee: any = employees.find((e: any) => e.employee_id === createForm.employee_id)
      if (selectedEmployee?.hire_date) {
        try {
          const hireDate = new Date(selectedEmployee.hire_date + 'T00:00:00+08:00')
          const oneYearFromHire = new Date(hireDate)
          oneYearFromHire.setFullYear(oneYearFromHire.getFullYear() + 1)
          const today = new Date(); today.setHours(0,0,0,0)
          if (today < oneYearFromHire) {
            const daysRemaining = Math.ceil((oneYearFromHire.getTime() - today.getTime()) / (1000*60*60*24))
            errors.push(`Employee must be employed for at least 1 year before filing leave. ${daysRemaining} day(s) remaining until eligible.`)
          }
        } catch {}
      } else {
        errors.push('Employee hire date is missing. Cannot validate 1-year leave eligibility.')
      }

      try {
        const currentYear = new Date().getFullYear()
        const leaveCount = (verificationRequests || []).filter((r: any) => {
          if (Number(r.employee_id) !== Number(createForm.employee_id)) return false
          if (String(r.request_type || '').toLowerCase() !== 'leave') return false
          const status = String(r.status || '').toLowerCase()
          if (status !== 'pending' && status !== 'approved') return false
          if (!r.requested_time) return false
          const year = new Date(r.requested_time).getFullYear()
          return year === currentYear
        }).length

        const staffType = String(selectedEmployee?.staff_type || '').toLowerCase()
        const maxLeaves = staffType === 'non-teaching' ? leaveLimits.nonTeaching : leaveLimits.teaching
        if (leaveCount >= maxLeaves) {
          errors.push(`Leave token limit reached (${maxLeaves} per year). The token count resets next year.`)
        }
      } catch {}
    }

    return errors
  }

  const selectedCreateEmployeeStaffType = String(selectedCreateEmployee?.staff_type || '').toLowerCase()
  const createLeaveSubstituteOptions = employees.filter((emp: any) => {
    const isActive = emp?.is_active === true || emp?.is_active === null || emp?.is_active === undefined
    if (!isActive) return false
    if (Number(emp?.employee_id) === Number(createForm.employee_id)) return false
    const sameStaffType = String(emp?.staff_type || '').toLowerCase() === selectedCreateEmployeeStaffType
    return sameStaffType
  })

  return (
    <div className="space-y-4 sm:space-y-6 px-4 sm:px-6 py-4 sm:py-6 animate-fadeInUp">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Verification Management</h1>
      </div>

      {/* Header Section - Mobile Responsive */}
      <div className="flex flex-col gap-4 sm:gap-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">Verification Filings</h2>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 mt-1 sm:mt-2">Admin-only verification system. Only 3 authorized administrators can review and manage employee attendance verification filings.</p>
        </div>
        {/* Action Buttons - Mobile Stack */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="btn-sti-primary w-full sm:w-auto h-11 sm:h-12 text-sm sm:text-base touch-manipulation" onClick={()=>setShowCreate(true)}>
              <PlusCircle className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
              New Filing
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[98vw] sm:w-[96vw] lg:w-[92vw] xl:w-[90vw] 2xl:w-[86vw] sm:max-w-[1700px] max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl sm:text-2xl font-bold">Create Verification Filing</DialogTitle>
              <DialogDescription className="text-sm">Program/Academic Heads can submit leave or justification filings here.</DialogDescription>
            </DialogHeader>
            
            {/* Request Type Guide - Collapsible Info Section */}
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mt-4">
              <details className="group">
                <summary className="cursor-pointer font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2 text-sm">
                  <span className="text-lg">ℹ️</span>
                  <span>Request Type Guide - Click to expand</span>
                  <span className="ml-auto transform transition-transform group-open:rotate-90">▶</span>
                </summary>
                <div className="mt-3 space-y-3 text-xs text-blue-800 dark:text-blue-200">
                  <div className="bg-white dark:bg-gray-800 rounded p-2.5 border border-blue-100 dark:border-blue-900">
                    <strong className="text-green-600 dark:text-green-400">🟢 LEAVE:</strong>
                    <p className="mt-1">File for scheduled absence. Only shows employee's work days. Employee must have 1+ year service.</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded p-2.5 border border-blue-100 dark:border-blue-900">
                    <strong className="text-purple-600 dark:text-purple-400">🟣 MISSED LOG:</strong>
                    <p className="mt-1">Add missing IN/OUT tap that was never recorded. <u>Only shows employee's scheduled work days</u>. Use when attendance was never logged.</p>
                  </div>
                </div>
              </details>
            </div>
            
            <div className="space-y-6 mt-4">
              {/* Employee Selection Section */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Employee <span className="text-red-500">*</span></Label>
                <select
                  className={`mt-1.5 w-full h-12 rounded-lg border-2 bg-white dark:bg-gray-800 px-4 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all touch-manipulation ${fieldErrors.has('employee') ? 'border-red-500 dark:border-red-400 ring-2 ring-red-200' : 'border-gray-300 dark:border-gray-600'}`}
                  value={createForm.employee_id}
                  onChange={(e)=>{
                    const newEmployeeId = Number(e.target.value)
                    setCreateForm((p:any)=>({ ...p, employee_id: newEmployeeId, date: '' })) // Clear date when employee changes
                  }}
                >
                  <option value={0}>Select employee…</option>
                  {employees.map(emp => (
                    <option key={emp.employee_id} value={emp.employee_id}>
                      {emp.full_name} • {(emp as any).staff_type || 'Teaching'} • {emp.department || 'N/A'}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 flex items-start gap-1.5">
                  <span className="text-base">ℹ️</span>
                  <span>All employees are shown (no restrictions for this request type)</span>
                </p>
                {createForm.employee_id > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <p className={`text-xs ${canSelectLeaveByTenure ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'}`}>
                      {canSelectLeaveByTenure
                        ? `Leave: Eligible now (1-year tenure met${leaveEligibleOn ? ` since ${leaveEligibleOn}` : ''}).`
                        : `Leave: Eligible on ${leaveEligibleOn || 'N/A'} (${leaveRestriction.daysRemaining} day/s remaining).`}
                    </p>
                    <p className={`text-xs ${canSelectMissedLogByStartDate ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'}`}>
                      {canSelectMissedLogByStartDate
                        ? `Missed Log: Available now (work started${missedLogStartsOn ? ` on ${missedLogStartsOn}` : ''}).`
                        : `Missed Log: Starts on ${missedLogStartsOn || 'N/A'}.`}
                    </p>
                  </div>
                )}
              </div>

              {/* Request Type Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Type <span className="text-red-500">*</span></Label>
                  <select
                    className={`mt-1.5 w-full h-12 rounded-lg border-2 bg-white dark:bg-gray-800 px-4 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${fieldErrors.has('request_type') ? 'border-red-500 dark:border-red-400 ring-2 ring-red-200' : 'border-gray-300 dark:border-gray-600'}`}
                    value={createForm.request_type}
                    onChange={(e)=>{
                      const selectedType = e.target.value
                      
                      // Check if trying to select LEAVE for any employee without 1-year tenure
                      if (selectedType === 'leave' && createForm.employee_id) {
                        const restriction = getLeaveRestriction(selectedCreateEmployee)
                        if (!restriction.allowed) {
                          setLeaveRestrictionMessage({
                            employeeName: selectedCreateEmployee?.full_name || 'Selected employee',
                            daysRemaining: restriction.daysRemaining
                          })
                          setLeaveRestrictionDialogOpen(true)
                          return
                        }
                      }

                      if (selectedType === 'missed_log' && createForm.employee_id) {
                        if (!hasEmployeeStartedForMissedLog(selectedCreateEmployee)) {
                          openPageError(
                            'Missed Log Not Yet Available',
                            'Missed Log can only be filed starting on the employee start date (or hire date if start date is not set).'
                          )
                          return
                        }
                      }
                      
                      setCreateForm((p:any)=>({
                        ...p,
                        request_type: selectedType,
                        ...(selectedType !== 'leave' ? {
                          requires_substitution: false,
                          substitute_employee_id: 0,
                          manual_schedule_override: false,
                          time_start: '',
                          time_end: '',
                        } : {}),
                      }))
                      setCreateLeaveScheduleOptions([])
                      setCreateSelectedLeaveScheduleKeys(new Set())
                      // Reset selected log when changing request type
                      setSelectedAttendanceLog('')
                    }}
                    disabled={!createForm.employee_id || loadingAttendanceDates}
                  >
                    <option value="" disabled>Select type...</option>
                    <option 
                      value="leave"
                      disabled={!employeeScheduledDays || employeeScheduledDays.size === 0 || !canSelectLeaveByTenure}
                    >
                      LEAVE {!employeeScheduledDays || employeeScheduledDays.size === 0 ? '(No schedule)' : !canSelectLeaveByTenure ? `(Available in ${leaveRestriction.daysRemaining} day/s)` : ''}
                    </option>
                    <option 
                      value="missed_log"
                      disabled={!employeeScheduledDays || employeeScheduledDays.size === 0 || !canSelectMissedLogByStartDate}
                    >
                      MISSED LOG {!employeeScheduledDays || employeeScheduledDays.size === 0 ? '(No schedule)' : !canSelectMissedLogByStartDate ? '(Starts on employee start date)' : ''}
                    </option>
                  </select>
                  {!createForm.employee_id && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                      ℹ️ Please select an employee first to enable request types
                    </p>
                  )}
                  {loadingAttendanceDates && createForm.employee_id && (
                    <p className="text-xs text-blue-500 dark:text-blue-400 mt-1.5 flex items-center gap-1">
                      <span className="animate-spin">⏳</span> Loading employee data...
                    </p>
                  )}
                  {createForm.employee_id && !loadingAttendanceDates && !employeeScheduledDays.size && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1.5">
                      ⚠️ No schedules found for this employee. Only limited options available.
                    </p>
                  )}
                </div>
                
                {/* Log Type selector - shown for MISSED LOG only */}
                {createForm.request_type === 'missed_log' && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Log Type <span className="text-red-500">*</span></Label>
                    <select
                      className={`mt-1.5 w-full h-12 rounded-lg border-2 bg-white dark:bg-gray-800 px-4 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all touch-manipulation ${fieldErrors.has('log_type') ? 'border-red-500 dark:border-red-400 ring-2 ring-red-200' : 'border-gray-300 dark:border-gray-600'}`}
                      value={createForm.log_type || ''}
                      onChange={(e)=>setCreateForm((p:any)=>({ ...p, log_type: e.target.value, time: '', time_start: '', time_end: '' }))}
                    >
                      <option value="">Select log type...</option>
                      <option value="IN">IN (Time In only)</option>
                      <option value="OUT">OUT (Time Out only)</option>
                      <option value="BOTH">BOTH (Time In & Time Out)</option>
                    </select>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                      Select whether this is for Time In, Time Out, or Both. Time must be between 6:00 AM and 9:00 PM.
                    </p>
                  </div>
                )}
              </div>

              {/* Missed Log Helper - show existing logs to help identify what's missing */}
              {createForm.request_type === 'missed_log' && createForm.date && createForm.employee_id && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Existing Logs for This Date</Label>
                  {loadingAvailableLogs ? (
                    <div className="flex items-center justify-center h-12 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-600">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                    </div>
                  ) : availableAttendanceLogs.length > 0 ? (
                    <div className="bg-amber-50 dark:bg-amber-950/20 border-2 border-amber-200 dark:border-amber-800 rounded-lg p-4">
                      <p className="text-sm font-medium text-amber-900 dark:text-amber-100 mb-2">
                        Found {availableAttendanceLogs.length} log(s):
                      </p>
                      {availableAttendanceLogs.map((log) => {
                        const logTime = log.log_time ? format(new Date(log.log_time), 'h:mm a') : 'N/A'
                        return (
                          <div key={log.log_id} className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
                            <span className={log.log_type === 'IN' ? 'text-green-600' : 'text-blue-600'}>
                              {log.log_type === 'IN' ? '→' : '←'}
                            </span>
                            <span className="font-medium">{log.log_type}</span>
                            <span>at {logTime}</span>
                          </div>
                        )
                      })}
                      <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
                        {availableAttendanceLogs.some(l => l.log_type === 'IN') && !availableAttendanceLogs.some(l => l.log_type === 'OUT') && 
                          'Missing Time OUT - Select "OUT" in Log Type'}
                        {!availableAttendanceLogs.some(l => l.log_type === 'IN') && availableAttendanceLogs.some(l => l.log_type === 'OUT') && 
                          'Missing Time IN - Select "IN" in Log Type'}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-gray-50 dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        No logs found - both Time IN and Time OUT are missing.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Date Section */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Date <span className="text-red-500">*</span></Label>
                <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-12 sm:h-14 text-sm sm:text-base touch-manipulation mt-1.5",
                      "border-2 hover:border-primary hover:bg-primary/5 transition-all",
                      !createForm.date && "text-muted-foreground",
                      createForm.date && "border-primary/50 bg-primary/5",
                      fieldErrors.has('date') && "border-red-500 dark:border-red-400 ring-2 ring-red-200"
                    )}
                    onClick={() => setDatePickerOpen(true)}
                  >
                    <CalendarIcon className="mr-3 h-5 w-5 text-primary" />
                    <span className="flex-1">
                      {createForm.date ? format(new Date(createForm.date + 'T00:00:00'), "EEEE, MMMM dd, yyyy") : "Select a date"}
                    </span>
                  </Button>
                  <Dialog open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <DialogContent className="w-[95vw] sm:w-full sm:max-w-[500px]">
                      <DialogHeader>
                        <DialogTitle className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                          <CalendarIcon className="h-6 w-6 text-primary" />
                          Select Date
                        </DialogTitle>
                        <DialogDescription className="text-sm">
                          {createForm.request_type === 'missed_log' && (
                            <span className="text-purple-600 dark:text-purple-400 font-medium">
                              📅 Only past dates on the employee's scheduled work days are selectable — starting from the employee's hire date.
                            </span>
                          )}
                          {createForm.request_type === 'leave' && (
                            <span className="text-green-600 dark:text-green-400 font-medium">
                              📅 Only employee's scheduled work days are selectable.
                            </span>
                          )}
                          {!createForm.request_type && (
                            <span>Choose a date for your verification filing.</span>
                          )}
                        </DialogDescription>
                      </DialogHeader>
                      
                      {/* Helper info about date restrictions */}
                      {createForm.employee_id && (
                        <div className="px-4 pb-2">
                          {createForm.request_type === 'missed_log' && (() => {
                            const emp = employees.find((e: any) => Number(e.employee_id) === Number(createForm.employee_id)) as any
                            const isPTFL = String(emp?.staff_type || '').toLowerCase() === 'teaching' &&
                              String(emp?.employment_status || '').toLowerCase().replace(/[\s_-]+/g, '') === 'parttimefullload'
                            return (
                            <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                              <p className="text-xs text-purple-800 dark:text-purple-300">
                                <strong>ℹ️ Past Dates Only:</strong> Only past/today dates are selectable (from employee's start date).
                                {isPTFL ? (
                                  <span className="ml-1 text-indigo-600 dark:text-indigo-400 font-semibold">
                                    🟢 Part Time Full Load — All weekdays (Mon–Sat) are available.
                                  </span>
                                ) : (
                                  <>
                                    {employeeScheduledDays.size === 0 && (
                                      <span className="ml-1 text-red-600 dark:text-red-400 font-semibold">No schedules found for this employee.</span>
                                    )}
                                    {employeeScheduledDays.size > 0 && (
                                      <span className="ml-1 text-green-600 dark:text-green-400 font-semibold">
                                        Scheduled: {Array.from(employeeScheduledDays).sort().map(d => ['Mon','Tue','Wed','Thu','Fri','Sat'][d-1]).join(', ')}
                                      </span>
                                    )}
                                  </>
                                )}
                                {emp?.hire_date && (
                                  <span className="ml-1 text-blue-600 dark:text-blue-400 font-semibold">
                                    • Start date: {emp.hire_date}
                                  </span>
                                )}
                              </p>
                            </div>
                            )
                          })()}
                          {createForm.request_type === 'leave' && employeeScheduledDays.size > 0 && (
                            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                              <p className="text-xs text-green-800 dark:text-green-300">
                                <strong>ℹ️ Scheduled Days:</strong> Employee works on: {Array.from(employeeScheduledDays).sort().map(d => ['Mon','Tue','Wed','Thu','Fri','Sat'][d-1]).join(', ')}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="p-4 bg-muted/30 rounded-lg">
                        <Calendar
                        mode="single"
                        selected={createForm.date ? new Date(createForm.date + 'T00:00:00') : undefined}
                        modifiers={{
                          blockedPast: (date) => getDateDisableReason(date) === 'past',
                          blockedFuture: (date) => getDateDisableReason(date) === 'future',
                          blockedBeforeHire: (date) => getDateDisableReason(date) === 'before_hire',
                          blockedCompleteLogs: (date) => getDateDisableReason(date) === 'has_complete_logs',
                          blockedSunday: (date) => getDateDisableReason(date) === 'sunday',
                          blockedSchedule: (date) => getDateDisableReason(date) === 'unscheduled',
                          // ── Color-coded attendance status (missed_log mode only) ──
                          scheduledNoLogs: (date) => {
                            if (createForm.request_type !== 'missed_log') return false
                            if (getDateDisableReason(date) !== null) return false // Already disabled
                            const yyyy = date.getFullYear()
                            const mm = String(date.getMonth() + 1).padStart(2, '0')
                            const dd = String(date.getDate()).padStart(2, '0')
                            const dateStr = `${yyyy}-${mm}-${dd}`
                            // Has schedule for this day + NO logs at all → needs missed log
                            return !employeeAttendanceDates.has(dateStr)
                          },
                          partialLogs: (date) => {
                            if (createForm.request_type !== 'missed_log') return false
                            if (getDateDisableReason(date) !== null) return false
                            const yyyy = date.getFullYear()
                            const mm = String(date.getMonth() + 1).padStart(2, '0')
                            const dd = String(date.getDate()).padStart(2, '0')
                            const dateStr = `${yyyy}-${mm}-${dd}`
                            // Has only IN or only OUT → partial, needs the other log
                            return employeePartialDates.has(dateStr)
                          },
                        }}
                        modifiersClassNames={{
                          blockedPast: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300 line-through',
                          blockedFuture: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300 line-through',
                          blockedBeforeHire: 'bg-gray-100 text-gray-400 dark:bg-gray-800/50 dark:text-gray-500 line-through',
                          blockedCompleteLogs: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 line-through',
                          blockedSunday: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300',
                          blockedSchedule: 'bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300',
                          // Scheduled but no logs → vivid indicator
                          scheduledNoLogs: 'ring-2 ring-inset ring-rose-500 dark:ring-rose-400 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold',
                          // Partial logs (only IN or only OUT) → amber indicator
                          partialLogs: 'ring-2 ring-inset ring-amber-500 dark:ring-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-semibold',
                        }}
                        onSelect={(date) => {
                          if (date) {
                            const dateStr = format(date, 'yyyy-MM-dd')
                            setCreateForm((p: any) => ({ ...p, date: dateStr, time: '', time_start: '', time_end: '' }))
                            setDatePickerOpen(false)
                          }
                        }}
                        disabled={isDateDisabled}
                        initialFocus
                        className="mx-auto"
                      />
                        <div className="mt-3 rounded-lg border border-border/60 bg-background/70 p-3 text-xs space-y-1.5">
                          {createForm.request_type === 'missed_log' ? (
                            <>
                              <p className="font-semibold text-foreground/80 mb-1">📅 Calendar Legend</p>
                              <p><span className="inline-block w-3 h-3 rounded ring-2 ring-inset ring-rose-500 bg-rose-50 dark:ring-rose-400 dark:bg-rose-950/40 mr-2 align-middle" />Scheduled — No logs filed (needs missed log)</p>
                              <p><span className="inline-block w-3 h-3 rounded ring-2 ring-inset ring-amber-500 bg-amber-50 dark:ring-amber-400 dark:bg-amber-950/40 mr-2 align-middle" />Partial logs — Only IN or OUT exists</p>
                              <p><span className="inline-block w-3 h-3 rounded-full bg-emerald-500 mr-2 align-middle" />Complete logs — Both IN & OUT exist (blocked)</p>
                              <p><span className="inline-block w-3 h-3 rounded-full bg-blue-500 mr-2 align-middle" />Future dates (blocked)</p>
                              <p><span className="inline-block w-3 h-3 rounded-full bg-gray-400 mr-2 align-middle" />Before hire date (blocked)</p>
                            </>
                          ) : (
                            <p><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-2 align-middle" />Red with strike-through: Past dates</p>
                          )}
                          <p><span className="inline-block w-3 h-3 rounded-full bg-red-700 mr-2 align-middle" />Sundays — Rest day (blocked)</p>
                          <p><span className="inline-block w-3 h-3 rounded-full bg-orange-500 mr-2 align-middle" />Not in employee schedule (blocked)</p>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row justify-end gap-2 pt-4">
                        <Button variant="outline" onClick={() => {
                          setCreateForm((p: any) => ({ ...p, date: '' }))
                          setDatePickerOpen(false)
                        }} className="w-full sm:w-auto h-12 text-base touch-manipulation">
                          <XCircle className="h-4 w-4 mr-2" />
                          Clear
                        </Button>
                        <Button onClick={() => setDatePickerOpen(false)} className="w-full sm:w-auto h-12 text-base touch-manipulation btn-sti-primary">
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Done
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  
                  {/* Show helpful schedule/attendance info below date field */}
                  {createForm.employee_id && (
                    <div className="mt-2 space-y-1.5">
                      {(createForm.request_type === 'missed_log' || createForm.request_type === 'leave') && employeeScheduledDays.size > 0 && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                          📋 Employee works on: {Array.from(employeeScheduledDays).sort().map(d => ['Mon','Tue','Wed','Thu','Fri','Sat'][d-1]).join(', ')}
                        </p>
                      )}
                      
                      {employeeScheduledDays.size === 0 && !loadingAttendanceDates && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          ⚠️ No work schedule found for this employee
                        </p>
                      )}

                      {missedLogNoScheduleCoverage && (
                        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                          ⚠️ No class/exam schedule found for this selected date. Missed-log filing is blocked for this date.
                        </div>
                      )}
                    </div>
                  )}
              </div>


              {/* Time Section — Missed Log: Detailed 12h AM/PM Picker (6:00 AM – 9:00 PM) */}
              {createForm.request_type === 'missed_log' && createForm.log_type && (
                <div className="space-y-3">
                  {/* BOTH mode: two separate time pickers */}
                  {createForm.log_type === 'BOTH' ? (
                    <>
                      <div className="space-y-4">
                        {/* Time In picker */}
                        <div className="space-y-1.5">
                          <Label className="text-sm font-semibold">Time In <span className="text-red-500">*</span></Label>
                          <div className="grid grid-cols-3 gap-1.5 max-w-xs">
                            <Select
                              value={(() => { const p = parseTimePartsFor12hPicker(String(createForm.time_start || '')); return p.hour12 })()}
                              onValueChange={(hour12) => {
                                setCreateForm((p: any) => {
                                  const current = parseTimePartsFor12hPicker(String(p.time_start || '06:00'))
                                  return { ...p, time_start: build24HourTimeFrom12hParts(hour12, current.minute, current.period) }
                                })
                              }}
                            >
                              <SelectTrigger className="h-10"><SelectValue placeholder="Hour" /></SelectTrigger>
                              <SelectContent>
                                {READJUST_HOURS_12.map((h) => (
                                  <SelectItem key={`ml-in-hour-${h}`} value={h}>{h}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={(() => { const p = parseTimePartsFor12hPicker(String(createForm.time_start || '')); return p.minute })()}
                              onValueChange={(minute) => {
                                setCreateForm((p: any) => {
                                  const current = parseTimePartsFor12hPicker(String(p.time_start || '06:00'))
                                  return { ...p, time_start: build24HourTimeFrom12hParts(current.hour12, minute, current.period) }
                                })
                              }}
                            >
                              <SelectTrigger className="h-10"><SelectValue placeholder="Min" /></SelectTrigger>
                              <SelectContent>
                                {['00','05','10','15','20','25','30','35','40','45','50','55'].map((m) => (
                                  <SelectItem key={`ml-in-min-${m}`} value={m}>{m}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={(() => { const p = parseTimePartsFor12hPicker(String(createForm.time_start || '')); return p.period })()}
                              onValueChange={(period) => {
                                setCreateForm((p: any) => {
                                  const current = parseTimePartsFor12hPicker(String(p.time_start || '06:00'))
                                  return { ...p, time_start: build24HourTimeFrom12hParts(current.hour12, current.minute, period === 'PM' ? 'PM' : 'AM') }
                                })
                              }}
                            >
                              <SelectTrigger className="h-10"><SelectValue placeholder="AM/PM" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="AM">AM</SelectItem>
                                <SelectItem value="PM">PM</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {createForm.time_start && !isTimeInMissedLogRange(createForm.time_start) ? (
                            <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1 font-medium">
                              ❌ Invalid — Time must be between 6:00 AM and 9:00 PM. Currently: {(() => { const p = parseTimePartsFor12hPicker(createForm.time_start); return `${p.hour12}:${p.minute} ${p.period}` })()}
                            </p>
                          ) : createForm.time_start ? (
                            <p className="text-xs text-green-600 dark:text-green-400">
                              ✓ Time In: {(() => { const p = parseTimePartsFor12hPicker(createForm.time_start); return `${p.hour12}:${p.minute} ${p.period}` })()}
                            </p>
                          ) : null}
                        </div>

                        {/* Time Out picker */}
                        <div className="space-y-1.5">
                          <Label className="text-sm font-semibold">Time Out <span className="text-red-500">*</span></Label>
                          <div className="grid grid-cols-3 gap-1.5 max-w-xs">
                            <Select
                              value={(() => { const p = parseTimePartsFor12hPicker(String(createForm.time_end || '')); return p.hour12 })()}
                              onValueChange={(hour12) => {
                                setCreateForm((p: any) => {
                                  const current = parseTimePartsFor12hPicker(String(p.time_end || '17:00'))
                                  return { ...p, time_end: build24HourTimeFrom12hParts(hour12, current.minute, current.period) }
                                })
                              }}
                            >
                              <SelectTrigger className="h-10"><SelectValue placeholder="Hour" /></SelectTrigger>
                              <SelectContent>
                                {READJUST_HOURS_12.map((h) => (
                                  <SelectItem key={`ml-out-hour-${h}`} value={h}>{h}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={(() => { const p = parseTimePartsFor12hPicker(String(createForm.time_end || '')); return p.minute })()}
                              onValueChange={(minute) => {
                                setCreateForm((p: any) => {
                                  const current = parseTimePartsFor12hPicker(String(p.time_end || '17:00'))
                                  return { ...p, time_end: build24HourTimeFrom12hParts(current.hour12, minute, current.period) }
                                })
                              }}
                            >
                              <SelectTrigger className="h-10"><SelectValue placeholder="Min" /></SelectTrigger>
                              <SelectContent>
                                {['00','05','10','15','20','25','30','35','40','45','50','55'].map((m) => (
                                  <SelectItem key={`ml-out-min-${m}`} value={m}>{m}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={(() => { const p = parseTimePartsFor12hPicker(String(createForm.time_end || '')); return p.period })()}
                              onValueChange={(period) => {
                                setCreateForm((p: any) => {
                                  const current = parseTimePartsFor12hPicker(String(p.time_end || '17:00'))
                                  return { ...p, time_end: build24HourTimeFrom12hParts(current.hour12, current.minute, period === 'PM' ? 'PM' : 'AM') }
                                })
                              }}
                            >
                              <SelectTrigger className="h-10"><SelectValue placeholder="AM/PM" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="AM">AM</SelectItem>
                                <SelectItem value="PM">PM</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {createForm.time_end && !isTimeInMissedLogRange(createForm.time_end) ? (
                            <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1 font-medium">
                              ❌ Invalid — Time must be between 6:00 AM and 9:00 PM. Currently: {(() => { const p = parseTimePartsFor12hPicker(createForm.time_end); return `${p.hour12}:${p.minute} ${p.period}` })()}
                            </p>
                          ) : createForm.time_end ? (
                            <p className="text-xs text-green-600 dark:text-green-400">
                              ✓ Time Out: {(() => { const p = parseTimePartsFor12hPicker(createForm.time_end); return `${p.hour12}:${p.minute} ${p.period}` })()}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                        <p className="text-xs text-purple-800 dark:text-purple-300">
                          <strong>⏰ Allowed Range:</strong> 6:00 AM – 9:00 PM only. Both Time In and Time Out will be saved as separate attendance logs with status <span className="font-semibold">"Missed Log"</span>.
                        </p>
                      </div>
                    </>
                  ) : (
                    /* Single time picker for IN or OUT */
                    <>
                      <Label className="text-sm font-semibold">
                        {createForm.log_type === 'IN' ? 'Time In' : 'Time Out'} <span className="text-red-500">*</span>
                      </Label>
                      <div className="grid grid-cols-3 gap-1.5 max-w-sm">
                        <Select
                          value={(() => { const p = parseTimePartsFor12hPicker(String(createForm.time || '')); return p.hour12 })()}
                          onValueChange={(hour12) => {
                            setCreateForm((p: any) => {
                              const current = parseTimePartsFor12hPicker(String(p.time || '08:00'))
                              const newTime = build24HourTimeFrom12hParts(hour12, current.minute, current.period)
                              return { ...p, time: newTime }
                            })
                          }}
                        >
                          <SelectTrigger className="h-12"><SelectValue placeholder="Hour" /></SelectTrigger>
                          <SelectContent>
                            {READJUST_HOURS_12.map((h) => (
                              <SelectItem key={`ml-single-hour-${h}`} value={h}>{h}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={(() => { const p = parseTimePartsFor12hPicker(String(createForm.time || '')); return p.minute })()}
                          onValueChange={(minute) => {
                            setCreateForm((p: any) => {
                              const current = parseTimePartsFor12hPicker(String(p.time || '08:00'))
                              const newTime = build24HourTimeFrom12hParts(current.hour12, minute, current.period)
                              return { ...p, time: newTime }
                            })
                          }}
                        >
                          <SelectTrigger className="h-12"><SelectValue placeholder="Min" /></SelectTrigger>
                          <SelectContent>
                            {['00','05','10','15','20','25','30','35','40','45','50','55'].map((m) => (
                              <SelectItem key={`ml-single-min-${m}`} value={m}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={(() => { const p = parseTimePartsFor12hPicker(String(createForm.time || '')); return p.period })()}
                          onValueChange={(period) => {
                            setCreateForm((p: any) => {
                              const current = parseTimePartsFor12hPicker(String(p.time || '08:00'))
                              const newTime = build24HourTimeFrom12hParts(current.hour12, current.minute, period === 'PM' ? 'PM' : 'AM')
                              return { ...p, time: newTime }
                            })
                          }}
                        >
                          <SelectTrigger className="h-12"><SelectValue placeholder="AM/PM" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="AM">AM</SelectItem>
                            <SelectItem value="PM">PM</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {createForm.time && !isTimeInMissedLogRange(createForm.time) ? (
                        <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1 font-medium bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded p-2">
                          ❌ Invalid — Time must be between 6:00 AM and 9:00 PM. Currently: {(() => { const p = parseTimePartsFor12hPicker(createForm.time); return `${p.hour12}:${p.minute} ${p.period}` })()}
                        </p>
                      ) : createForm.time ? (
                        <p className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded p-2">
                          ✓ {createForm.log_type === 'IN' ? 'Time In' : 'Time Out'}: {(() => { const p = parseTimePartsFor12hPicker(createForm.time); return `${p.hour12}:${p.minute} ${p.period}` })()}
                        </p>
                      ) : null}
                      <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                        <p className="text-xs text-purple-800 dark:text-purple-300">
                          <strong>⏰ Allowed Range:</strong> 6:00 AM – 9:00 PM only. This will be saved as an attendance log with status <span className="font-semibold">"Missed Log"</span>.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}


              {createForm.request_type === 'leave' && (
                <div className="space-y-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 p-4">
                  <Label className="text-sm font-semibold">Leave Coverage Planning</Label>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={Boolean(createForm.requires_substitution)}
                      onCheckedChange={(checked) => {
                        setCreateForm((p: any) => ({
                          ...p,
                          requires_substitution: Boolean(checked),
                          substitute_employee_id: Boolean(checked) ? p.substitute_employee_id : 0,
                        }))
                        if (!checked) {
                          setCreateLeaveScheduleOptions([])
                          setCreateSelectedLeaveScheduleKeys(new Set())
                        }
                      }}
                    />
                    <Label className="text-sm m-0">Require substitute coverage for this leave</Label>
                  </div>

                  {createForm.requires_substitution && (
                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs sm:text-sm font-semibold">Proposed Substitute *</Label>
                        <select
                          className="w-full h-11 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm"
                          value={createForm.substitute_employee_id || 0}
                          onChange={(e) => setCreateForm((p: any) => ({ ...p, substitute_employee_id: Number(e.target.value) }))}
                        >
                          <option value={0}>Select substitute employee...</option>
                          {createLeaveSubstituteOptions.map((emp: any) => (
                            <option key={emp.employee_id} value={emp.employee_id}>
                              {emp.full_name} • {emp.department || 'N/A'}
                            </option>
                          ))}
                        </select>
                        {createLeaveSubstituteOptions.length === 0 && (
                          <p className="text-xs text-amber-600 dark:text-amber-400">No same-staff-type substitutes available right now.</p>
                        )}
                      </div>

                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={Boolean(createForm.manual_schedule_override)}
                        onCheckedChange={(checked) => {
                          setCreateForm((p: any) => ({
                            ...p,
                            manual_schedule_override: Boolean(checked),
                            time_start: normalizeToHalfHourHhMm(p.time_start || String(selectedCreateEmployee?.schedule_time_in || '').slice(0, 5)),
                            time_end: normalizeToHalfHourHhMm(p.time_end || String(selectedCreateEmployee?.schedule_time_out || '').slice(0, 5)),
                          }))
                        }}
                      />
                      <Label className="text-sm m-0">Manual Final Schedule Override</Label>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                      Use this when you want to manually set the final covered schedule window (for both teaching and non-teaching leave).
                    </p>
                  </div>

                  {createForm.requires_substitution && createForm.manual_schedule_override && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs sm:text-sm font-semibold">Final Coverage Start *</Label>
                        {(() => {
                          const parts = parseTimePartsFor12hPicker(String(createForm.time_start || ''))
                          return (
                            <div className="grid grid-cols-3 gap-2 mt-1">
                              <Select
                                value={parts.hour12}
                                onValueChange={(hour12) => {
                                  setCreateForm((p: any) => {
                                    const current = parseTimePartsFor12hPicker(String(p.time_start || ''))
                                    return {
                                      ...p,
                                      time_start: build24HourTimeFrom12hParts(hour12, current.minute, current.period),
                                    }
                                  })
                                }}
                              >
                                <SelectTrigger className="h-11">
                                  <SelectValue placeholder="Hour" />
                                </SelectTrigger>
                                <SelectContent>
                                  {READJUST_HOURS_12.map((h) => (
                                    <SelectItem key={`manual-start-hour-${h}`} value={h}>{h}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select
                                value={parts.minute}
                                onValueChange={(minute) => {
                                  setCreateForm((p: any) => {
                                    const current = parseTimePartsFor12hPicker(String(p.time_start || ''))
                                    return {
                                      ...p,
                                      time_start: build24HourTimeFrom12hParts(current.hour12, minute, current.period),
                                    }
                                  })
                                }}
                              >
                                <SelectTrigger className="h-11">
                                  <SelectValue placeholder="Min" />
                                </SelectTrigger>
                                <SelectContent>
                                  {READJUST_HALF_HOUR_MINUTES.map((m) => (
                                    <SelectItem key={`manual-start-minute-${m}`} value={m}>{m}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select
                                value={parts.period}
                                onValueChange={(period) => {
                                  setCreateForm((p: any) => {
                                    const current = parseTimePartsFor12hPicker(String(p.time_start || ''))
                                    return {
                                      ...p,
                                      time_start: build24HourTimeFrom12hParts(current.hour12, current.minute, period === 'PM' ? 'PM' : 'AM'),
                                    }
                                  })
                                }}
                              >
                                <SelectTrigger className="h-11">
                                  <SelectValue placeholder="AM/PM" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="AM">AM</SelectItem>
                                  <SelectItem value="PM">PM</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )
                        })()}
                      </div>
                      <div>
                        <Label className="text-xs sm:text-sm font-semibold">Final Coverage End *</Label>
                        {(() => {
                          const parts = parseTimePartsFor12hPicker(String(createForm.time_end || ''))
                          return (
                            <div className="grid grid-cols-3 gap-2 mt-1">
                              <Select
                                value={parts.hour12}
                                onValueChange={(hour12) => {
                                  setCreateForm((p: any) => {
                                    const current = parseTimePartsFor12hPicker(String(p.time_end || ''))
                                    return {
                                      ...p,
                                      time_end: build24HourTimeFrom12hParts(hour12, current.minute, current.period),
                                    }
                                  })
                                }}
                              >
                                <SelectTrigger className="h-11">
                                  <SelectValue placeholder="Hour" />
                                </SelectTrigger>
                                <SelectContent>
                                  {READJUST_HOURS_12.map((h) => (
                                    <SelectItem key={`manual-end-hour-${h}`} value={h}>{h}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select
                                value={parts.minute}
                                onValueChange={(minute) => {
                                  setCreateForm((p: any) => {
                                    const current = parseTimePartsFor12hPicker(String(p.time_end || ''))
                                    return {
                                      ...p,
                                      time_end: build24HourTimeFrom12hParts(current.hour12, minute, current.period),
                                    }
                                  })
                                }}
                              >
                                <SelectTrigger className="h-11">
                                  <SelectValue placeholder="Min" />
                                </SelectTrigger>
                                <SelectContent>
                                  {READJUST_HALF_HOUR_MINUTES.map((m) => (
                                    <SelectItem key={`manual-end-minute-${m}`} value={m}>{m}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select
                                value={parts.period}
                                onValueChange={(period) => {
                                  setCreateForm((p: any) => {
                                    const current = parseTimePartsFor12hPicker(String(p.time_end || ''))
                                    return {
                                      ...p,
                                      time_end: build24HourTimeFrom12hParts(current.hour12, current.minute, period === 'PM' ? 'PM' : 'AM'),
                                    }
                                  })
                                }}
                              >
                                <SelectTrigger className="h-11">
                                  <SelectValue placeholder="AM/PM" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="AM">AM</SelectItem>
                                  <SelectItem value="PM">PM</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )
                        })()}
                      </div>
                      <p className="sm:col-span-2 text-xs text-muted-foreground">
                        Manual coverage time accepts 30-minute steps only (`:00` or `:30`) with explicit AM/PM.
                      </p>
                    </div>
                  )}

                  {createForm.requires_substitution && String(selectedCreateEmployee?.staff_type || '').toLowerCase() === 'teaching' && createForm.date && (
                    <div className="space-y-2 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs sm:text-sm font-semibold m-0">Schedules To Substitute *</Label>
                        <p className="text-[11px] sm:text-xs text-sky-700 dark:text-sky-300">
                          Selected {createSelectedLeaveScheduleKeys.size} of {createLeaveScheduleOptions.length}
                        </p>
                      </div>
                      {createLeaveScheduleOptions.length > 0 && (
                        <p className="text-[11px] sm:text-xs text-sky-700 dark:text-sky-300">
                          If all schedules are selected, the original teacher is marked as absent for that day. If only some are selected, only those class blocks are substituted.
                        </p>
                      )}

                      {createSubstituteConflictLoading && Number(createForm.substitute_employee_id) > 0 && createSelectedLeaveScheduleKeys.size > 0 && (
                        <p className="text-[11px] sm:text-xs text-sky-700 dark:text-sky-300">Checking substitute attendance conflicts for selected schedules...</p>
                      )}

                      {!createSubstituteConflictLoading && Number(createForm.substitute_employee_id) > 0 && (
                        (() => {
                          const selectedKeys = Array.from(createSelectedLeaveScheduleKeys)
                          const conflictCount = selectedKeys.reduce((count, key) => {
                            return count + (createSubstituteConflictMap[key]?.hasConflict ? 1 : 0)
                          }, 0)
                          if (conflictCount <= 0) return null
                          return (
                            <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-3 py-2">
                              <p className="text-[11px] sm:text-xs text-red-700 dark:text-red-300">
                                Conflict detected on {conflictCount} selected schedule block(s). Submission is blocked until a conflict-free substitute is selected.
                              </p>
                            </div>
                          )
                        })()
                      )}

                      {createLeaveScheduleLoading ? (
                        <p className="text-xs text-sky-700 dark:text-sky-300">Loading class/exam schedules for selected date...</p>
                      ) : createLeaveScheduleOptions.length === 0 ? (
                        <p className="text-xs text-amber-700 dark:text-amber-300">No class/exam schedule found for this employee on the selected date.</p>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => {
                                setCreateSelectedLeaveScheduleKeys(new Set(createLeaveScheduleOptions.map((item) => getScheduleSelectionKey(item))))
                              }}
                            >
                              Select All
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => setCreateSelectedLeaveScheduleKeys(new Set())}
                            >
                              Clear
                            </Button>
                          </div>

                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {createLeaveScheduleOptions.map((schedule, idx) => {
                              const scheduleKey = getScheduleSelectionKey(schedule)
                              const isChecked = createSelectedLeaveScheduleKeys.has(scheduleKey)
                              const scheduleConflict = createSubstituteConflictMap[scheduleKey]
                              return (
                                <label key={scheduleKey} className="flex items-start gap-2 rounded-md border border-sky-200 dark:border-sky-800 bg-white dark:bg-gray-900 px-2.5 py-2 cursor-pointer">
                                  <Checkbox
                                    checked={isChecked}
                                    onCheckedChange={(checked) => {
                                      setCreateSelectedLeaveScheduleKeys((prev) => {
                                        const next = new Set(prev)
                                        if (checked) next.add(scheduleKey)
                                        else next.delete(scheduleKey)
                                        return next
                                      })
                                    }}
                                  />
                                  <div className="min-w-0">
                                    <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100">
                                      {idx + 1}. {schedule.subject_name || (schedule.schedule_type === 'exam' ? 'Exam Coverage' : 'Class Coverage')}
                                    </p>
                                    <p className="text-[11px] sm:text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                                      {formatDbTime12h(String(schedule.time_start || ''))} - {formatDbTime12h(String(schedule.time_end || ''))}
                                      {schedule.room_code ? ` • ${schedule.room_code}` : ''}
                                      {schedule.section ? ` • ${schedule.section}` : ''}
                                    </p>
                                    {Number(createForm.substitute_employee_id) > 0 && isChecked && !createSubstituteConflictLoading && scheduleConflict && (
                                      <p className={`text-[11px] sm:text-xs mt-1 ${scheduleConflict.hasConflict ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                                        {scheduleConflict.hasConflict ? `Conflict: ${scheduleConflict.reason}` : 'No attendance conflict for selected substitute.'}
                                      </p>
                                    )}
                                  </div>
                                </label>
                              )
                            })}
                          </div>

                          {createLeaveCoveragePreview && (
                            <div className="rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 space-y-1">
                              <p className="text-[11px] sm:text-xs text-emerald-800 dark:text-emerald-300">
                                Computed Final Coverage Range: <span className="font-semibold">{formatDbTime12h(createLeaveCoveragePreview.finalStart)} - {formatDbTime12h(createLeaveCoveragePreview.finalEnd)}</span>
                              </p>
                              <p className="text-[11px] sm:text-xs text-emerald-800/90 dark:text-emerald-300/90">
                                Selected substituted classes: {createLeaveCoveragePreview.selectedCount} • Remaining original classes: {createLeaveCoveragePreview.remainingCount}
                              </p>
                              {createLeaveCoveragePreview.hasOverlapConflict && (
                                <p className="text-[11px] sm:text-xs text-amber-700 dark:text-amber-300">
                                  Note: overlap detected between selected substituted classes and substitute's own schedule. Final range still includes all covered windows.
                                </p>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Reason Section */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Reason <span className="text-red-500">*</span></Label>
                <Textarea rows={4} value={createForm.reason} onChange={(e)=>setCreateForm((p:any)=>({ ...p, reason: e.target.value }))} placeholder={createForm.request_type === 'missed_log' ? 'Explain why you missed this log (minimum 20 characters)...' : 'Reason/justification'} className={`text-sm mt-1.5 rounded-lg border-2 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none ${fieldErrors.has('reason') ? 'border-red-500 dark:border-red-400 ring-2 ring-red-200' : ''}`} />
                {/* Character counter */}
                {(() => {
                  const len = String(createForm.reason || '').trim().length
                  const minRequired = createForm.request_type === 'missed_log' ? 20 : 0
                  if (minRequired === 0 && len === 0) return null
                  const isMet = len >= minRequired
                  const isClose = len > 0 && len >= minRequired - 5 && !isMet
                  return (
                    <div className="flex items-center justify-between mt-1">
                      <p className={`text-xs ${isMet ? 'text-green-600 dark:text-green-400' : isClose ? 'text-amber-600 dark:text-amber-400' : 'text-red-500 dark:text-red-400'}`}>
                        {isMet ? '✓' : '⚠'} {len} / {minRequired > 0 ? `${minRequired} min characters` : 'characters'}
                        {!isMet && minRequired > 0 && ` — ${minRequired - len} more needed`}
                      </p>
                    </div>
                  )
                })()}
              </div>

              {/* Notes Section */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Notes (optional)</Label>
                <Input value={createForm.notes} onChange={(e)=>setCreateForm((p:any)=>({ ...p, notes: e.target.value }))} placeholder="Additional notes or information" className="h-12 text-sm mt-1.5 rounded-lg border-2 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all" />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={()=>setShowCreate(false)} className="w-full sm:w-auto h-12 text-sm font-medium touch-manipulation hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</Button>
                <Button className="btn-sti-primary w-full sm:w-auto h-12 text-sm font-medium touch-manipulation" disabled={Boolean(missedLogNoScheduleCoverage)} onClick={async()=>{
                  try {
                    if (missedLogNoScheduleCoverage) {
                      openPageError(
                        'No Schedule Found for Selected Date',
                        'This missed-log request cannot be filed because there is no class/exam schedule on the selected date.'
                      )
                      return
                    }

                    // Run comprehensive validation and show dialog if issues exist
                    const issues = await validateCreateForm()
                    if (issues.length > 0) {
                      // Compute which fields are invalid for red highlighting
                      const errors = new Set<string>()
                      if (!createForm.employee_id || createForm.employee_id === 0) errors.add('employee')
                      if (!createForm.request_type) errors.add('request_type')
                      if (!createForm.date) errors.add('date')
                      if (!createForm.reason || !String(createForm.reason).trim()) errors.add('reason')
                      if (createForm.request_type === 'missed_log') {
                        if (!createForm.log_type) errors.add('log_type')
                        if (createForm.log_type === 'BOTH') {
                          if (!createForm.time_start) errors.add('time_start')
                          if (!createForm.time_end) errors.add('time_end')
                        } else if (createForm.log_type && !createForm.time) {
                          errors.add('time')
                        }
                      }
                      setFieldErrors(errors)
                      setValidationErrors(issues)
                      setValidationOpen(true)
                      return
                    }
                    setFieldErrors(new Set()) // Clear errors on success
                    
                    // Additional leave tenure/credit checks are handled in validateCreateForm()
                    
                    // Format requested_time
                    // For missed_log BOTH: use time_start as the primary requested_time
                    // For missed_log IN/OUT: use createForm.time
                    let requested_time: string
                    if (createForm.request_type === 'missed_log' && createForm.log_type === 'BOTH') {
                      // BOTH: use time_start as the primary timestamp
                      const startTime = String(createForm.time_start || '08:00').trim()
                      // Ensure we don't double-add seconds (time is HH:MM from picker)
                      requested_time = startTime.length === 5
                        ? `${createForm.date}T${startTime}:00`
                        : `${createForm.date}T${startTime}`
                    } else if (createForm.request_type === 'missed_log') {
                      // IN/OUT single mode: use createForm.time (HH:MM from picker)
                      const singleTime = String(createForm.time || '08:00').trim()
                      requested_time = singleTime.length === 5
                        ? `${createForm.date}T${singleTime}:00`
                        : `${createForm.date}T${singleTime}`
                    } else {
                      // Leave and other types
                      requested_time = createForm.time ? `${createForm.date}T${createForm.time}:00` : `${createForm.date}T00:00:00`
                    }
                    
                    // Compute leave coverage range:
                    // - manual override wins
                    // - otherwise for teaching+substitution use computed merged range
                    // - fallback to raw form times
                    const selectedSubstituteEmployee = employees.find(
                      (emp: any) => Number(emp?.employee_id) === Number(createForm.substitute_employee_id)
                    ) as any
                    const originalNonTeachingStart = String(selectedCreateEmployee?.schedule_time_in || '').slice(0, 5)
                    const originalNonTeachingEnd = String(selectedCreateEmployee?.schedule_time_out || '').slice(0, 5)
                    const substituteNonTeachingStart = String(selectedSubstituteEmployee?.schedule_time_in || '').slice(0, 5)
                    const substituteNonTeachingEnd = String(selectedSubstituteEmployee?.schedule_time_out || '').slice(0, 5)
                    const originalNonTeachingStartMin = parseTimeToMinutes(originalNonTeachingStart)
                    const originalNonTeachingEndMin = parseTimeToMinutes(originalNonTeachingEnd)
                    const substituteNonTeachingStartMin = parseTimeToMinutes(substituteNonTeachingStart)
                    const substituteNonTeachingEndMin = parseTimeToMinutes(substituteNonTeachingEnd)
                    const toHhMmFromMinutes = (minutes: number): string => {
                      const h = Math.floor(minutes / 60)
                      const m = minutes % 60
                      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
                    }
                    const hasNonTeachingMergeWindow =
                      createForm.request_type === 'leave' &&
                      createForm.requires_substitution &&
                      String(selectedCreateEmployee?.staff_type || '').toLowerCase().includes('non') &&
                      originalNonTeachingStartMin !== null &&
                      originalNonTeachingEndMin !== null &&
                      substituteNonTeachingStartMin !== null &&
                      substituteNonTeachingEndMin !== null
                    const mergedNonTeachingStart = hasNonTeachingMergeWindow
                      ? toHhMmFromMinutes(Math.min(originalNonTeachingStartMin as number, substituteNonTeachingStartMin as number))
                      : ''
                    const mergedNonTeachingEnd = hasNonTeachingMergeWindow
                      ? toHhMmFromMinutes(Math.max(originalNonTeachingEndMin as number, substituteNonTeachingEndMin as number))
                      : ''

                    const effectiveStartHhMm =
                      createForm.manual_schedule_override
                        ? String(createForm.time_start || '').trim()
                        : (
                            createForm.request_type === 'leave' &&
                            createForm.requires_substitution &&
                            String(selectedCreateEmployee?.staff_type || '').toLowerCase() === 'teaching' &&
                            createLeaveCoveragePreview?.finalStart
                          )
                          ? String(createLeaveCoveragePreview.finalStart || '').trim()
                          : hasNonTeachingMergeWindow
                            ? mergedNonTeachingStart
                            : String(createForm.time_start || '').trim()
                    const effectiveEndHhMm =
                      createForm.manual_schedule_override
                        ? String(createForm.time_end || '').trim()
                        : (
                            createForm.request_type === 'leave' &&
                            createForm.requires_substitution &&
                            String(selectedCreateEmployee?.staff_type || '').toLowerCase() === 'teaching' &&
                            createLeaveCoveragePreview?.finalEnd
                          )
                          ? String(createLeaveCoveragePreview.finalEnd || '').trim()
                          : hasNonTeachingMergeWindow
                            ? mergedNonTeachingEnd
                            : String(createForm.time_end || '').trim()

                    // Format time_start and time_end (convert HH:MM to HH:MM:SS)
                    const time_start = effectiveStartHhMm ? `${effectiveStartHhMm}:00` : null
                    const time_end = effectiveEndHhMm ? `${effectiveEndHhMm}:00` : null
                    const reasonTags: string[] = []
                    if (createForm.request_type === 'leave' && createForm.requires_substitution && createForm.substitute_employee_id) {
                      reasonTags.push(`[LEAVE_SUB_EMP:${createForm.substitute_employee_id}]`)
                    }
                    if (createForm.request_type === 'leave' && createForm.requires_substitution && createSelectedLeaveScheduleKeys.size > 0) {
                      const encodedScheduleKeys = Array.from(createSelectedLeaveScheduleKeys).sort().join(',')
                      reasonTags.push(`[LEAVE_SUB_SCHEDULES:${encodedScheduleKeys}]`)
                    }
                    if (createForm.request_type === 'leave' && createForm.manual_schedule_override) {
                      reasonTags.push('[LEAVE_MANUAL_MODE:1]')
                      if (effectiveStartHhMm && effectiveEndHhMm) {
                        reasonTags.push(`[LEAVE_MANUAL_TIME:${effectiveStartHhMm}-${effectiveEndHhMm}]`)
                      }
                    }
                    if (
                      createForm.request_type === 'leave' &&
                      createForm.requires_substitution &&
                      String(selectedCreateEmployee?.staff_type || '').toLowerCase() === 'teaching' &&
                      createLeaveCoveragePreview?.finalStart &&
                      createLeaveCoveragePreview?.finalEnd
                    ) {
                      reasonTags.push(`[LEAVE_COVERAGE_RANGE:${createLeaveCoveragePreview.finalStart}-${createLeaveCoveragePreview.finalEnd}]`)
                    }
                    if (
                      createForm.request_type === 'leave' &&
                      createForm.requires_substitution &&
                      String(selectedCreateEmployee?.staff_type || '').toLowerCase().includes('non') &&
                      hasNonTeachingMergeWindow
                    ) {
                      reasonTags.push(`[LEAVE_COVERAGE_RANGE:${mergedNonTeachingStart}-${mergedNonTeachingEnd}]`)
                    }
                    const reasonWithMetadata = [...reasonTags, String(createForm.reason || '').trim()].filter(Boolean).join(' ')
                    const userStr = localStorage.getItem('rams_user')
                    const filingUser = userStr ? JSON.parse(userStr) : null
                    
                    const payload = {
                      employee_id: createForm.employee_id,
                      request_type: createForm.request_type,
                      requested_time,
                      time_start: time_start, // Time range start (HH:MM:SS format)
                      time_end: time_end, // Time range end (HH:MM:SS format)
                      reason: reasonWithMetadata,
                      notes: createForm.notes,
                      requested_by: filingUser?.id || null,
                      log_type: createForm.log_type, // IN or OUT for missed_log requests
                      // Store substitution info in notes if substitution is required
                      ...(createForm.request_type === 'leave' && createForm.requires_substitution && createForm.substitute_employee_id ? {
                        notes: `${createForm.notes || ''}\n[Substitution Requested: Employee ID ${createForm.substitute_employee_id}]`.trim()
                      } : {})
                    }
                    console.log('[Verification] CREATE payload:', JSON.stringify(payload, null, 2))
                    
                    const res = await fetch('/api/verification-requests', { 
                      method:'POST', 
                      headers:{'Content-Type':'application/json'}, 
                      body: JSON.stringify(payload) 
                    })
                    const json = await res.json()
                    if (!res.ok) {
                      console.error('[Verification] CREATE failed:', res.status, json)
                      throw new Error(json?.error || 'Failed to create')
                    }
                    
                    // If substitution is required, store the substitution info for later use during approval
                    if (createForm.request_type === 'leave' && createForm.requires_substitution && createForm.substitute_employee_id) {
                      // Store substitution info in sessionStorage for approval process
                      sessionStorage.setItem('pending_substitution_from_filing', JSON.stringify({
                        requestId: json.item?.request_id,
                        employeeId: createForm.employee_id,
                        substituteEmployeeId: createForm.substitute_employee_id,
                        manualMode: Boolean(createForm.manual_schedule_override),
                        manualTimeStart: effectiveStartHhMm || '',
                        manualTimeEnd: effectiveEndHhMm || '',
                        date: createForm.date,
                        time_start: time_start,
                        time_end: time_end
                      }))
                    }
                    
                    toast({ 
                      title: 'Filing Created', 
                      description: createForm.requires_substitution 
                        ? 'Verification filing submitted with substitution request. Please approve to assign the substitute.'
                        : 'Verification filing submitted.' 
                    })
                    setShowCreate(false)
                    setCreateForm({ 
                      employee_id: 0, 
                      request_type: 'leave', 
                      date: '', 
                      time: '', 
                      time_start: '',
                      time_end: '',
                      requires_substitution: false,
                      substitute_employee_id: 0,
                      manual_schedule_override: false,
                      reason: '', 
                      notes: '' 
                    })
                    setCreateLeaveScheduleOptions([])
                    setCreateSelectedLeaveScheduleKeys(new Set())
                    loadData()
                  } catch (e:any) {
                    toast({ title: 'Error', description: e?.message || 'Failed to create filing', variant: 'destructive' })
                  }
                }}>
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Create
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        {/* Centered Validation Dialog */}
        <Dialog open={validationOpen} onOpenChange={setValidationOpen}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="h-5 w-5" />
                Cannot Create Filing
              </DialogTitle>
              <DialogDescription>
                Please fix the following issues before submitting. Fields with errors are highlighted in red.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {validationErrors.length > 0 ? (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-4">
                  <ul className="list-disc pl-5 text-sm text-red-700 dark:text-red-300 space-y-1.5">
                    {validationErrors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No issues found.</p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={()=>setValidationOpen(false)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
        {/* Generic Page Error Dialog */}
        <Dialog open={pageErrorOpen} onOpenChange={setPageErrorOpen}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>{pageErrorTitle}</DialogTitle>
              <DialogDescription>{pageErrorMessage}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={()=>setPageErrorOpen(false)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <UserCheck className="h-4 w-4 sm:h-5 sm:w-5" />
            Leave Token Settings
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Configure yearly leave token limits per staff type. Tokens are shared across Verification and Leave Requests and reset every new year.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Teaching Leave Tokens / Year</Label>
              <Input
                type="number"
                min={0}
                step={1}
                value={leaveLimits.teaching}
                onChange={(e) => setLeaveLimits((prev) => ({ ...prev, teaching: Number(e.target.value || 0) }))}
                className="h-11"
                disabled={leaveLimitsLoading || leaveLimitsSaving}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Non-Teaching Leave Tokens / Year</Label>
              <Input
                type="number"
                min={0}
                step={1}
                value={leaveLimits.nonTeaching}
                onChange={(e) => setLeaveLimits((prev) => ({ ...prev, nonTeaching: Number(e.target.value || 0) }))}
                className="h-11"
                disabled={leaveLimitsLoading || leaveLimitsSaving}
              />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button
              type="button"
              onClick={saveLeaveLimits}
              disabled={leaveLimitsLoading || leaveLimitsSaving}
              className="h-10"
            >
              {(leaveLimitsLoading || leaveLimitsSaving) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Leave Token Limits
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards - Mobile Responsive */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6">
        <Card className="group relative overflow-hidden bg-linear-to-br from-white to-blue-50/50 dark:from-gray-800 dark:to-blue-950/20 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <div className="absolute inset-0 bg-linear-to-br from-blue-500/0 to-transparent group-hover:from-blue-500/5 group-hover:to-purple-500/5 transition-all duration-500"></div>
          <CardContent className="p-4 sm:p-6 relative">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Total Filings</p>
                <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform duration-200">{verificationRequests.length}</p>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">All time</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shadow-md group-hover:scale-110 group-hover:shadow-lg transition-all duration-300 shrink-0">
                <FileText className="h-5 w-5 sm:h-7 sm:w-7 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden bg-linear-to-br from-white to-yellow-50/50 dark:from-gray-800 dark:to-yellow-950/20 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <div className="absolute inset-0 bg-linear-to-br from-yellow-500/0 to-transparent group-hover:from-yellow-500/5 group-hover:to-amber-500/5 transition-all duration-500"></div>
          <CardContent className="p-4 sm:p-6 relative">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Pending</p>
                <p className="text-2xl sm:text-3xl font-bold text-yellow-600 dark:text-yellow-400 group-hover:scale-105 transition-transform duration-200">{pendingCount}</p>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Awaiting review</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center shadow-md group-hover:scale-110 group-hover:shadow-lg transition-all duration-300 shrink-0">
                <Clock className="h-5 w-5 sm:h-7 sm:w-7 text-yellow-600 dark:text-yellow-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden bg-linear-to-br from-white to-green-50/50 dark:from-gray-800 dark:to-green-950/20 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <div className="absolute inset-0 bg-linear-to-br from-green-500/0 to-transparent group-hover:from-green-500/5 group-hover:to-emerald-500/5 transition-all duration-500"></div>
          <CardContent className="p-4 sm:p-6 relative">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Approved</p>
                <p className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400 group-hover:scale-105 transition-transform duration-200">{approvedCount}</p>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {verificationRequests.length > 0
                    ? Math.round((approvedCount / verificationRequests.length) * 100)
                    : 0}
                  % approval rate
                </p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center shadow-md group-hover:scale-110 group-hover:shadow-lg transition-all duration-300 shrink-0">
                <CheckCircle className="h-5 w-5 sm:h-7 sm:w-7 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden bg-linear-to-br from-white to-red-50/50 dark:from-gray-800 dark:to-red-950/20 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <div className="absolute inset-0 bg-linear-to-br from-red-500/0 to-transparent group-hover:from-red-500/5 group-hover:to-rose-500/5 transition-all duration-500"></div>
          <CardContent className="p-4 sm:p-6 relative">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Rejected</p>
                <p className="text-2xl sm:text-3xl font-bold text-red-600 dark:text-red-400 group-hover:scale-105 transition-transform duration-200">{rejectedCount}</p>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Declined requests</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shadow-md group-hover:scale-110 group-hover:shadow-lg transition-all duration-300 shrink-0">
                <XCircle className="h-5 w-5 sm:h-7 sm:w-7 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden bg-linear-to-br from-white to-indigo-50/50 dark:from-gray-800 dark:to-indigo-950/20 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <div className="absolute inset-0 bg-linear-to-br from-indigo-500/0 to-transparent group-hover:from-indigo-500/5 group-hover:to-blue-500/5 transition-all duration-500"></div>
          <CardContent className="p-4 sm:p-6 relative">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Done</p>
                <p className="text-2xl sm:text-3xl font-bold text-indigo-600 dark:text-indigo-400 group-hover:scale-105 transition-transform duration-200">{doneCount}</p>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Approved + rejected</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shadow-md group-hover:scale-110 group-hover:shadow-lg transition-all duration-300 shrink-0">
                <CheckCircle className="h-5 w-5 sm:h-7 sm:w-7 text-indigo-600 dark:text-indigo-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Requests Table Card - Mobile Responsive */}
      <Card>
        <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
            Verification Filings
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Admin-only access. Review and manage employee attendance verification filings with approve/reject actions.</CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
          {/* Search and Filters - Redesigned */}
          <div className="mb-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Search by employee name, department, reason, or review notes..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 h-11 sm:h-12 text-sm sm:text-base"
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11 sm:h-12 w-full sm:w-auto"
                onClick={clearFilters}
              >
                <Filter className="h-4 w-4 mr-2" />
                Clear Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
              </Button>
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 space-y-2">
              {(() => {
                const quickChipButtonClass = "h-8 px-2.5 text-xs sm:text-sm"

                return (
                  <>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className={quickChipButtonClass}
                  variant={workflowCategory === 'all' && selectedStatus === 'All Statuses' && selectedType === 'All Types' ? 'default' : 'outline'}
                  onClick={() => applyQuickFilter('all')}
                >
                  All ({verificationRequests.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={quickChipButtonClass}
                  variant={workflowCategory === 'needs_action' && selectedStatus === 'pending' && selectedType === 'All Types' ? 'default' : 'outline'}
                  onClick={() => applyQuickFilter('needs_action')}
                >
                  Needs Action ({pendingCount})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={quickChipButtonClass}
                  variant={workflowCategory === 'done' && selectedStatus === 'All Statuses' && selectedType === 'All Types' ? 'default' : 'outline'}
                  onClick={() => applyQuickFilter('done')}
                >
                  Done ({doneCount})
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className={quickChipButtonClass}
                  variant={selectedDateRange === 'all' ? 'default' : 'outline'}
                  onClick={() => applyQuickDateFilter('all')}
                >
                  All Dates
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={quickChipButtonClass}
                  variant={selectedDateRange === 'today' ? 'default' : 'outline'}
                  onClick={() => applyQuickDateFilter('today')}
                >
                  Today
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={quickChipButtonClass}
                  variant={selectedDateRange === 'last_7_days' ? 'default' : 'outline'}
                  onClick={() => applyQuickDateFilter('last_7_days')}
                >
                  Last 7 Days
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={quickChipButtonClass}
                  variant={selectedDateRange === 'this_month' ? 'default' : 'outline'}
                  onClick={() => applyQuickDateFilter('this_month')}
                >
                  This Month
                </Button>
              </div>
                  </>
                )
              })()}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
              <Select value={selectedStatus} onValueChange={(value) => { setWorkflowCategory('all'); setSelectedStatus(value) }}>
                <SelectTrigger className="w-full h-11 sm:h-12 text-sm sm:text-base touch-manipulation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {requestStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status === "All Statuses" ? status : status.charAt(0).toUpperCase() + status.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedType} onValueChange={(value) => { setWorkflowCategory('all'); setSelectedType(value) }}>
                <SelectTrigger className="w-full h-11 sm:h-12 text-sm sm:text-base touch-manipulation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {requestTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type === "All Types" ? type : type.replace("_", " ").toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger className="w-full h-11 sm:h-12 text-sm sm:text-base touch-manipulation">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Departments">All Departments</SelectItem>
                  {departmentOptions.map((dept) => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedSort} onValueChange={(value) => setSelectedSort(value as 'requested_desc' | 'requested_asc')}>
                <SelectTrigger className="w-full h-11 sm:h-12 text-sm sm:text-base touch-manipulation">
                  <SelectValue placeholder="Requested Order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="requested_desc">Requested Date: Descending</SelectItem>
                  <SelectItem value="requested_asc">Requested Date: Ascending</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedDateRange} onValueChange={(value) => setSelectedDateRange(value as 'all' | 'today' | 'last_7_days' | 'this_month' | 'custom')}>
                <SelectTrigger className="w-full h-11 sm:h-12 text-sm sm:text-base touch-manipulation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dates</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedDateRange === 'custom' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="h-11 sm:h-12"
                />
                <Input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="h-11 sm:h-12"
                />
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span>Showing {filteredRequests.length} of {verificationRequests.length} verification filings</span>
              <Badge variant="outline" className="text-[10px]">
                Viewing: {workflowCategoryLabel}
              </Badge>
            </div>

            {filteredRequests.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => toggleSelectAllFiltered(!allFilteredSelected)}
                >
                  {allFilteredSelected ? 'Unselect All' : 'Select All'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={filteredPendingCount === 0}
                  onClick={selectPendingFiltered}
                >
                  Select Pending ({filteredPendingCount})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  disabled={selectedCount === 0 || bulkReviewInProgress}
                  onClick={() => openBulkReviewWizard('approved')}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Accept All ({selectedCount})
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 border-red-300 text-red-600 hover:text-red-700"
                  disabled={selectedCount === 0 || bulkReviewInProgress}
                  onClick={() => openBulkReviewWizard('rejected')}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Decline All ({selectedCount})
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-8"
                  disabled={selectedCount === 0 || deleteInProgress}
                  onClick={() => {
                    setBulkDeleteConfirmText('')
                    setShowBulkDeleteConfirm(true)
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete Selected ({selectedCount})
                </Button>
              </div>
            )}
          </div>
          
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
            <Table className="w-full table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">
                    <Checkbox
                      checked={allFilteredSelected ? true : (partiallySelected ? 'indeterminate' : false)}
                      onCheckedChange={(checked) => toggleSelectAllFiltered(Boolean(checked))}
                      aria-label="Select all verification requests"
                    />
                  </TableHead>
                  <TableHead className="text-center">Employee</TableHead>
                  <TableHead className="text-center">Request Type</TableHead>
                  <TableHead className="text-center">Original Time</TableHead>
                  <TableHead className="text-center">Requested Time</TableHead>
                  <TableHead className="text-center">Reason</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Requested</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-gray-500 dark:text-gray-400">
                      {verificationRequests.length === 0
                        ? "No verification filings found."
                        : "No filings match your current filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRequests.map((request) => (
                    <TableRow key={request.request_id}>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={selectedRequestIds.has(Number(request.request_id))}
                          onCheckedChange={(checked) => toggleSelectRequest(Number(request.request_id), Boolean(checked))}
                          aria-label={`Select request ${request.request_id}`}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <div>
                          <p className="font-medium dark:text-gray-100">{request.employees?.full_name || "Unknown Employee"}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{request.employees?.department ? getDepartmentAcronym(request.employees.department) : "N/A"}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="space-y-1">
                          <div>{getTypeBadge(request.request_type, request.reason)}</div>
                          <div>{getRequestSourceBadge((request as any).request_source)}</div>
                          <p className={`text-[11px] ${getRequestScheduleLabelClass(request)}`}>{getRequestScheduleLabel(request)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {request.original_time ? (
                          <div className="text-sm">
                            <p className="dark:text-gray-100">{format(new Date(request.original_time), "MMM d, yyyy")}</p>
                            <p className="text-gray-500 dark:text-gray-400">{format(new Date(request.original_time), "h:mm a")}</p>
                          </div>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {request.requested_time ? (
                          <div className="text-sm">
                            <p className="dark:text-gray-100">{format(new Date(request.requested_time), "MMM d, yyyy")}</p>
                            <p className="text-gray-500 dark:text-gray-400">{format(new Date(request.requested_time), "h:mm a")}</p>
                          </div>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="max-w-xs mx-auto">
                          <p className="text-sm truncate dark:text-gray-100" title={formatReasonForDisplay(request.reason)}>
                            {formatReasonForDisplay(request.reason)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{getStatusBadge(request.status)}</TableCell>
                      <TableCell className="text-center">
                        <div className="text-sm">
                          <p className="dark:text-gray-100">{format(new Date(request.requested_at), "MMM d, yyyy")}</p>
                          <p className="text-gray-500 dark:text-gray-400">{format(new Date(request.requested_at), "h:mm a")}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Dialog
                            open={showReviewDialog && selectedRequest?.request_id === request.request_id}
                            onOpenChange={(open) => {
                              if (!open) setShowReviewDialog(false)
                            }}
                          >
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async (e) => {
                                  // Check if this is a leave request with schedules - show substitution dialog for viewing
                                  if (request.request_type === 'leave' && request.requested_time && request.status === 'pending') {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    
                                    try {
                                      const [teachingSchedules, examSchedules] = await Promise.all([
                                        getTeachingSchedulesForEmployee(request.employee_id),
                                        getExamSchedulesForEmployee(request.employee_id),
                                      ])
                                      
                                      const matchingSchedules: any[] = []
                                      
                                      // PRIORITY 1: Check if request has a specific schedule_id and schedule_type stored (from database)
                                      const requestScheduleId = (request as any).schedule_id
                                      const requestScheduleType = (request as any).schedule_type
                                      
                                      // PRIORITY 2: Check sessionStorage for pending substitution (temporary, from employees page)
                                      const pendingSub = sessionStorage.getItem('pending_substitution')
                                      let specificScheduleId: number | null = requestScheduleId || null
                                      let specificScheduleType: 'teaching' | 'exam' | null = requestScheduleType || null
                                      
                                      if (!specificScheduleId && pendingSub) {
                                        try {
                                          const subData = JSON.parse(pendingSub)
                                          if (subData.requestId === request.request_id && subData.scheduleId && subData.employeeId === request.employee_id) {
                                            specificScheduleId = subData.scheduleId
                                            specificScheduleType = subData.scheduleType
                                            sessionStorage.removeItem('pending_substitution')
                                          }
                                        } catch (e) {
                                          console.error('Error parsing pending_substitution:', e)
                                          sessionStorage.removeItem('pending_substitution')
                                        }
                                      }
                                      
                                      // If specific schedule was requested, ONLY show that one
                                      if (specificScheduleId && specificScheduleType) {
                                        if (specificScheduleType === 'teaching') {
                                          const specificSchedule = teachingSchedules.find((s: any) => s.schedule_id === specificScheduleId)
                                          if (specificSchedule) {
                                            matchingSchedules.push({
                                              ...specificSchedule,
                                              schedule_type: 'teaching',
                                              schedule_id: specificSchedule.schedule_id,
                                            })
                                          }
                                        } else if (specificScheduleType === 'exam') {
                                          const specificSchedule = examSchedules.find((e: any) => e.exam_schedule_id === specificScheduleId)
                                          if (specificSchedule) {
                                            matchingSchedules.push({
                                              ...specificSchedule,
                                              schedule_type: 'exam',
                                              schedule_id: specificSchedule.exam_schedule_id,
                                              exam_date: specificSchedule.exam_date || null,
                                            })
                                          }
                                        }

                                        if (matchingSchedules.length === 0) {
                                          openPageError(
                                            'Schedule Link Mismatch',
                                            'This verification request is linked to a specific schedule, but that schedule was not found for this employee. Review was stopped to avoid comparing the wrong schedule.'
                                          )
                                          return
                                        }
                                      }
                                      
                                      // If there are matching schedules, show substitution dialog directly instead of review dialog
                                      if (matchingSchedules.length > 0) {
                                        // Set the dialog mode to view mode for pending requests
                                        setSubstitutionDialogViewMode('view')
                                        
                                        setPendingApproval({ 
                                          requestId: request.request_id, 
                                          employee_id: request.employee_id, 
                                          schedules: matchingSchedules,
                                          allSchedules: matchingSchedules,
                                          specificScheduleId: specificScheduleId || null,
                                          specificScheduleType: specificScheduleType || null,
                                        })
                                        
                                        // Store the selected request for later reference
                                        setSelectedRequest(request)
                                        
                                        // Fetch available substitutes for each schedule
                                        const requestedDate = request.requested_time ? new Date(request.requested_time).toISOString().split('T')[0] : ''
                                        if (requestedDate) {
                                          const substitutesMap: Record<string, any[]> = {}
                                          for (const schedule of matchingSchedules) {
                                            const formKey = `${schedule.schedule_type}-${schedule.schedule_id}`
                                            const availableTeachers = await fetchAvailableSubstitutes(schedule, requestedDate)
                                            substitutesMap[formKey] = availableTeachers
                                          }
                                          setAvailableSubstitutesMap(substitutesMap)
                                        }
                                        
                                        setShowSubstitutionDialog(true)
                                        return // Don't show review dialog
                                      }
                                    } catch (error) {
                                      console.error('Error checking schedules:', error)
                                      // If error, fall through to show review dialog
                                    }
                                  }
                                  
                                  // If no schedules or not a leave request, show review dialog as normal
                                  setSelectedRequest(request)
                                  setReviewNotes(request.review_notes || "")
                                  
                                  // Fetch substitution details if the request is approved
                                  if (request.status === 'approved') {
                                    fetchSubstitutionDetails(request.request_id)
                                  } else {
                                    setSubstitutionDetails(null)
                                  }
                                  
                                  // Open the dialog
                                  setShowReviewDialog(true)
                                }}
                                className="touch-manipulation"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            <DialogContent className="w-[95vw] sm:w-full sm:max-w-[1600px] max-w-[96vw] max-h-[90vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle className="text-lg sm:text-xl">Review Verification Filing</DialogTitle>
                                <DialogDescription className="text-xs sm:text-sm">
                                  Review and approve or reject this verification filing
                                </DialogDescription>
                              </DialogHeader>
                              {selectedRequest && (
                                <div className="space-y-4">
                                  <div className="rounded-lg border border-indigo-300/40 bg-indigo-50/60 dark:bg-indigo-950/20 dark:border-indigo-800 p-3">
                                    <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">Review Overview</p>
                                    <p className="text-xs text-indigo-800 dark:text-indigo-200 mt-1">
                                      Validate employee identity, check schedule alignment for requested date, confirm if IN/OUT logs already exist, then approve only if reason and timeline are consistent.
                                    </p>
                                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs text-indigo-900 dark:text-indigo-200">
                                      <div>Request: {String(selectedRequest.request_type || '').replace('_', ' ').toUpperCase()}</div>
                                      <div>Log Type: {(selectedRequest as any).log_type || 'N/A'}</div>
                                      <div>Requested Day: {selectedRequest.requested_time ? format(new Date(selectedRequest.requested_time), 'PPP') : 'N/A'}</div>
                                      <div>
                                        Linked Schedule:{' '}
                                        <span className={getRequestScheduleLabelClass(selectedRequest)}>{getRequestScheduleLabel(selectedRequest)}</span>
                                      </div>
                                    </div>
                                    {selectedRequestPendingPair && (
                                      <p className="mt-2 text-xs text-indigo-900 dark:text-indigo-200">
                                        Paired pending request detected: <span className="font-semibold">{getMissedLogType(selectedRequestPendingPair) || 'N/A'}</span> on {selectedRequestPendingPair.requested_time ? format(new Date(selectedRequestPendingPair.requested_time), 'MMM d, yyyy h:mm a') : 'N/A'}. Approve/Reject will process both IN and OUT together.
                                      </p>
                                    )}
                                    {selectedRequestPairGroup.length > 1 && (
                                      <div className="mt-2 flex items-center justify-between rounded-md border border-indigo-200/60 dark:border-indigo-800 bg-white/70 dark:bg-gray-900/40 px-2 py-1.5">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 px-2"
                                          onClick={() => navigateSelectedRequestPair('prev')}
                                          disabled={selectedRequestPairIndex <= 0}
                                        >
                                          <ChevronLeft className="h-4 w-4 mr-1" />
                                          Back
                                        </Button>
                                        <p className="text-[11px] text-indigo-900 dark:text-indigo-200">
                                          Pair {selectedRequestPairIndex + 1} of {selectedRequestPairGroup.length} ({getMissedLogType(selectedRequest) || 'N/A'})
                                        </p>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 px-2"
                                          onClick={() => navigateSelectedRequestPair('next')}
                                          disabled={selectedRequestPairIndex >= selectedRequestPairGroup.length - 1}
                                        >
                                          Next
                                          <ChevronRight className="h-4 w-4 ml-1" />
                                        </Button>
                                      </div>
                                    )}
                                    <div className="mt-2 rounded-md border border-indigo-200/60 dark:border-indigo-800 bg-white/60 dark:bg-gray-900/40 p-2">
                                      <p className="text-xs font-medium text-indigo-900 dark:text-indigo-100">Attendance Logs on Requested Day</p>
                                      {reviewOverviewLoading ? (
                                        <p className="text-xs text-gray-500 mt-1">Loading day logs...</p>
                                      ) : reviewDayLogs.length === 0 ? (
                                        <p className="text-xs text-gray-500 mt-1">No existing attendance logs found for that day.</p>
                                      ) : (
                                        <div className="mt-1 space-y-1">
                                          {reviewDayLogs.slice(0, 4).map((log: any) => (
                                            <p key={log.log_id} className="text-xs text-gray-700 dark:text-gray-200">
                                              {log.log_type || 'N/A'} at {log.log_time ? format(new Date(log.log_time), 'p') : 'N/A'} | status: {log.attendance_status || 'N/A'}
                                            </p>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <EmployeeStats employeeId={selectedRequest.employee_id} />
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                      <Label className="text-xs sm:text-sm">Employee</Label>
                                      <p className="text-sm font-medium dark:text-gray-100 mt-1">{selectedRequest.employees?.full_name}</p>
                                    </div>
                                    <div>
                                      <Label className="text-xs sm:text-sm">Department</Label>
                                      <p className="text-sm dark:text-gray-100 mt-1">{selectedRequest.employees?.department}</p>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                      <Label className="text-xs sm:text-sm">Request Type</Label>
                                      <div className="mt-1 flex flex-wrap items-center gap-2">
                                        <p className="text-sm dark:text-gray-100">
                                          {selectedRequest.request_type.replace("_", " ").toUpperCase()}
                                        </p>
                                        {getRequestSourceBadge((selectedRequest as any).request_source)}
                                      </div>
                                    </div>
                                    {selectedRequest.request_type === 'missed_log' && !String(selectedRequest.reason || '').startsWith('[UNDER_REVIEW]') && (selectedRequest as any).log_type && (
                                      <div>
                                        <Label className="text-xs sm:text-sm">Log Type</Label>
                                        <p className="text-sm dark:text-gray-100 mt-1">
                                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            (selectedRequest as any).log_type === 'IN' 
                                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                          }`}>
                                            {(selectedRequest as any).log_type === 'IN' ? '→ Time In' : '← Time Out'}
                                          </span>
                                        </p>
                                      </div>
                                    )}
                                    {(selectedRequest.request_type !== 'missed_log' || String(selectedRequest.reason || '').startsWith('[UNDER_REVIEW]')) && (
                                    <div>
                                      <Label className="text-xs sm:text-sm">Status</Label>
                                      <div className="mt-1">{getStatusBadge(selectedRequest.status)}</div>
                                    </div>
                                    )}
                                  </div>
                                  {selectedRequest.request_type === 'missed_log' && !String(selectedRequest.reason || '').startsWith('[UNDER_REVIEW]') && (
                                  <div className="grid grid-cols-1 gap-4">
                                    <div>
                                      <Label className="text-xs sm:text-sm">Status</Label>
                                      <div className="mt-1">{getStatusBadge(selectedRequest.status)}</div>
                                    </div>
                                  </div>
                                  )}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                      <Label className="text-xs sm:text-sm">Original Time</Label>
                                      <p className="text-sm dark:text-gray-100 mt-1">
                                        {selectedRequest.original_time
                                          ? format(new Date(selectedRequest.original_time), "PPp")
                                          : "N/A"}
                                      </p>
                                    </div>
                                    <div>
                                      <Label className="text-xs sm:text-sm">Requested Time</Label>
                                      <p className="text-sm dark:text-gray-100 mt-1">
                                        {selectedRequest.requested_time
                                          ? format(new Date(selectedRequest.requested_time), "PPp")
                                          : "N/A"}
                                      </p>
                                    </div>
                                  </div>
                                  <div>
                                    <Label className="text-xs sm:text-sm">Reason</Label>
                                    <p className="text-xs sm:text-sm bg-gray-50 dark:bg-gray-800 dark:text-gray-100 p-3 rounded-md mt-1">{formatReasonForDisplay(selectedRequest.reason)}</p>
                                  </div>
                                  
                                  {/* Substitution Details Section */}
                                  {selectedRequest.status === 'approved' && substitutionDetails && (
                                    <div className="border-t pt-4">
                                      <Label className="text-xs sm:text-sm font-semibold">Substitution Details</Label>
                                      <div className="mt-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                          <div>
                                            <Label className="text-xs text-gray-600 dark:text-gray-400">Substitute Teacher</Label>
                                            <p className="text-sm font-medium dark:text-gray-100 mt-1">
                                              {substitutionDetails.substituteEmployee?.full_name || 'N/A'}
                                            </p>
                                          </div>
                                          <div>
                                            <Label className="text-xs text-gray-600 dark:text-gray-400">Department</Label>
                                            <p className="text-sm dark:text-gray-100 mt-1">
                                              {substitutionDetails.substituteEmployee?.department || 'N/A'}
                                            </p>
                                          </div>
                                        </div>
                                        
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                          <div>
                                            <Label className="text-xs text-gray-600 dark:text-gray-400">Substitution Date</Label>
                                            <p className="text-sm dark:text-gray-100 mt-1">
                                              {substitutionDetails.substitutionDate 
                                                ? format(new Date(substitutionDetails.substitutionDate), "PPP")
                                                : 'N/A'}
                                            </p>
                                          </div>
                                          <div>
                                            <Label className="text-xs text-gray-600 dark:text-gray-400">Schedule Type</Label>
                                            <p className="text-sm dark:text-gray-100 mt-1 capitalize">
                                              {substitutionDetails.scheduleType || 'N/A'}
                                            </p>
                                          </div>
                                        </div>
                                        
                                        {substitutionDetails.scheduleDetails && (
                                          <div className="border-t border-blue-200 dark:border-blue-800 pt-3 mt-3">
                                            <Label className="text-xs text-gray-600 dark:text-gray-400 mb-2 block">Schedule Information</Label>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                              <div>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">Subject</p>
                                                <p className="text-sm dark:text-gray-100 font-medium">
                                                  {substitutionDetails.scheduleDetails.subjectName || 'N/A'}
                                                </p>
                                              </div>
                                              <div>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">Section</p>
                                                <p className="text-sm dark:text-gray-100 font-medium">
                                                  {substitutionDetails.scheduleDetails.section || 'N/A'}
                                                </p>
                                              </div>
                                              <div>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">Time</p>
                                                <p className="text-sm dark:text-gray-100 font-medium">
                                                  {substitutionDetails.scheduleDetails.timeStart && substitutionDetails.scheduleDetails.timeEnd
                                                    ? `${formatDbTime12h(substitutionDetails.scheduleDetails.timeStart)} - ${formatDbTime12h(substitutionDetails.scheduleDetails.timeEnd)}`
                                                    : 'N/A'}
                                                </p>
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                        
                                        <div>
                                          <Label className="text-xs text-gray-600 dark:text-gray-400">Reason</Label>
                                          <p className="text-sm dark:text-gray-100 mt-1">
                                            {substitutionDetails.unavailableReason || 'N/A'}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                  
                                  <div>
                                    <Label className="text-xs sm:text-sm">Review Notes</Label>
                                    <Textarea
                                      value={reviewNotes}
                                      onChange={(e) => setReviewNotes(e.target.value)}
                                      placeholder="Add your review notes here..."
                                      rows={3}
                                      className="mt-1 text-sm sm:text-base"
                                    />
                                  </div>
                                  {selectedRequest.status === "pending" && (
                                    <div className="flex flex-col sm:flex-row justify-between gap-2 sm:gap-3 pt-2">
                                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                                        <Button
                                          variant="destructive"
                                          size="sm"
                                          onClick={() => setShowDeleteConfirm(true)}
                                          className="w-full sm:w-auto h-11 sm:h-12 text-sm sm:text-base touch-manipulation"
                                        >
                                          <Trash2 className="h-4 w-4 mr-2" />
                                          Delete
                                        </Button>
                                        {/* Re-tap button for missed_log requests */}
                                        {selectedRequest.request_type === 'missed_log' && !String(selectedRequest.reason || '').startsWith('[UNDER_REVIEW]') && (
                                          <Button
                                            variant="outline"
                                            onClick={() => handleRetap(selectedRequest.request_id)}
                                            disabled={retapInProgress}
                                            className="text-blue-600 hover:text-blue-700 border-blue-600 w-full sm:w-auto h-11 sm:h-12 text-sm sm:text-base touch-manipulation"
                                          >
                                            <Scan className="h-4 w-4 mr-2" />
                                            {retapInProgress ? 'Processing...' : 'RFID Re-tap'}
                                          </Button>
                                        )}
                                      </div>
                                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                                        <Button
                                          variant="outline"
                                          onClick={() => handleRejectRequest(selectedRequest.request_id)}
                                          className="text-red-600 hover:text-red-700 w-full sm:w-auto h-11 sm:h-12 text-sm sm:text-base touch-manipulation"
                                        >
                                          <XCircle className="h-4 w-4 mr-2" />
                                          Reject
                                        </Button>
                                        {/* Show two approval buttons for leave requests with schedules */}
                                        {selectedRequest.request_type === 'leave' && pendingApproval && pendingApproval.requestId === selectedRequest.request_id && pendingApproval.schedules.length > 0 ? (
                                          <>
                                            <Button
                                              variant="outline"
                                              onClick={() => handleApproveRequest(selectedRequest.request_id, true)}
                                              className="text-blue-600 hover:text-blue-700 border-blue-600 w-full sm:w-auto h-11 sm:h-12 text-sm sm:text-base touch-manipulation"
                                            >
                                              <CheckCircle className="h-4 w-4 mr-2" />
                                              Approve Without Substitution
                                            </Button>
                                            <Button
                                              onClick={() => handleApproveRequest(selectedRequest.request_id, false)}
                                              className="btn-sti-primary w-full sm:w-auto h-11 sm:h-12 text-sm sm:text-base touch-manipulation"
                                            >
                                              <CheckCircle className="h-4 w-4 mr-2" />
                                              Approve With Substitution
                                            </Button>
                                          </>
                                        ) : (
                                          <Button
                                            onClick={() => handleApproveRequest(selectedRequest.request_id, true)}
                                            className="btn-sti-primary w-full sm:w-auto h-11 sm:h-12 text-sm sm:text-base touch-manipulation"
                                          >
                                            <CheckCircle className="h-4 w-4 mr-2" />
                                            Approve
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  {(selectedRequest.status === "approved" || selectedRequest.status === "rejected") && (
                                    <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-2">
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => setShowDeleteConfirm(true)}
                                        className="w-full sm:w-auto h-11 sm:h-12 text-sm sm:text-base touch-manipulation"
                                      >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View */}
          <div className="lg:hidden space-y-4">
            {filteredRequests.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                {verificationRequests.length === 0
                  ? "No verification filings found."
                  : "No requests match your current filters."}
              </div>
            ) : (
              filteredRequests.map((request) => (
                <Card key={request.request_id} className="border-2">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-end">
                      <Checkbox
                        checked={selectedRequestIds.has(Number(request.request_id))}
                        onCheckedChange={(checked) => toggleSelectRequest(Number(request.request_id), Boolean(checked))}
                        aria-label={`Select request ${request.request_id}`}
                      />
                    </div>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-sm dark:text-gray-100">{request.employees?.full_name || "Unknown Employee"}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{request.employees?.department ? getDepartmentAcronym(request.employees.department) : "N/A"}</p>
                      </div>
                      <div>{getStatusBadge(request.status)}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Type</p>
                        <div className="mt-1">{getTypeBadge(request.request_type, request.reason)}</div>
                        <div className="mt-1">{getRequestSourceBadge((request as any).request_source)}</div>
                        <p className={`text-[11px] mt-1 ${getRequestScheduleLabelClass(request)}`}>{getRequestScheduleLabel(request)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Requested</p>
                        <p className="text-xs dark:text-gray-100 mt-1">{format(new Date(request.requested_at), "MMM d, yyyy")}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{format(new Date(request.requested_at), "h:mm a")}</p>
                      </div>
                    </div>
                    {request.original_time && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Original Time</p>
                        <p className="text-xs dark:text-gray-100 mt-1">{format(new Date(request.original_time), "MMM d, yyyy h:mm a")}</p>
                      </div>
                    )}
                    {request.requested_time && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Requested Time</p>
                        <p className="text-xs dark:text-gray-100 mt-1">{format(new Date(request.requested_time), "MMM d, yyyy h:mm a")}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Reason</p>
                      <p className="text-xs dark:text-gray-100 mt-1 line-clamp-2">{formatReasonForDisplay(request.reason)}</p>
                    </div>
                    <div className="pt-2 border-t">
                      <Dialog
                        open={showReviewDialog && selectedRequest?.request_id === request.request_id}
                        onOpenChange={(open) => {
                          if (!open) setShowReviewDialog(false)
                        }}
                      >
                          <Button
                            variant="outline"
                            className="w-full h-11 text-sm touch-manipulation"
                            onClick={async (e) => {
                              // Check if this is a PENDING leave request with schedules - show substitution dialog for viewing
                              if (request.request_type === 'leave' && request.requested_time && request.status === 'pending') {
                                e.preventDefault()
                                e.stopPropagation()
                                // Check for schedules before showing review dialog
                                const requestDate = new Date(request.requested_time)
                                const dateStr = requestDate.toISOString().split('T')[0]
                                const jsDay = requestDate.getDay()
                                const dayOfWeek = jsDay === 0 ? null : jsDay
                                
                                try {
                                  const [teachingSchedules, examSchedules] = await Promise.all([
                                    getTeachingSchedulesForEmployee(request.employee_id),
                                    getExamSchedulesForEmployee(request.employee_id),
                                  ])
                                  
                                  const matchingSchedules: any[] = []
                                  const timeStart = (request as any).time_start || null
                                  const timeEnd = (request as any).time_end || null
                                  
                                  // PRIORITY 1: Use schedule linkage saved in the verification request record.
                                  const requestSchedule = getRequestScheduleLink(request)

                                  // PRIORITY 2: Check if there's a pending substitution from employees page (specific schedule)
                                  const pendingSub = sessionStorage.getItem('pending_substitution')
                                  let specificScheduleId: number | null = requestSchedule.scheduleId
                                  let specificScheduleType: 'teaching' | 'exam' | null = requestSchedule.scheduleType
                                  if (pendingSub) {
                                    try {
                                      const subData = JSON.parse(pendingSub)
                                      if (!specificScheduleId && subData.requestId === request.request_id && subData.scheduleId && subData.employeeId === request.employee_id) {
                                        specificScheduleId = subData.scheduleId
                                        specificScheduleType = subData.scheduleType
                                        sessionStorage.removeItem('pending_substitution')
                                      }
                                    } catch (e) {
                                      console.error('Error parsing pending_substitution:', e)
                                      sessionStorage.removeItem('pending_substitution')
                                    }
                                  }
                                  
                                  // If specific schedule was requested, ONLY show that one
                                  if (specificScheduleId && specificScheduleType) {
                                    if (specificScheduleType === 'teaching') {
                                      const specificSchedule = teachingSchedules.find((s: any) => s.schedule_id === specificScheduleId)
                                      if (specificSchedule) {
                                        matchingSchedules.push({
                                          ...specificSchedule,
                                          schedule_type: 'teaching',
                                          schedule_id: specificSchedule.schedule_id,
                                        })
                                      }
                                    } else if (specificScheduleType === 'exam') {
                                    if (matchingSchedules.length === 0) {
                                      openPageError(
                                        'Schedule Link Mismatch',
                                        'This verification request is linked to a specific schedule, but that schedule was not found for this employee. Review was stopped to avoid comparing the wrong schedule.'
                                      )
                                      return
                                    }
                                      const specificSchedule = examSchedules.find((e: any) => e.exam_schedule_id === specificScheduleId)
                                      if (specificSchedule) {
                                        matchingSchedules.push({
                                          ...specificSchedule,
                                          schedule_type: 'exam',
                                          schedule_id: specificSchedule.exam_schedule_id,
                                          exam_date: specificSchedule.exam_date || null,
                                        })
                                      }
                                    }
                                  } else if (dayOfWeek !== null && timeStart && timeEnd) {
                                    // ONLY show schedules that EXACTLY match the leave time request
                                    // Convert leave request times to minutes
                                    const leaveStartMinutes = timeStart.split(':').slice(0, 2).map(Number).reduce((h: number, m: number) => h * 60 + m, 0)
                                    const leaveEndMinutes = timeEnd.split(':').slice(0, 2).map(Number).reduce((h: number, m: number) => h * 60 + m, 0)
                                    
                                    // Find the ONE schedule that matches the exact leave time
                                    teachingSchedules.forEach((sched: any) => {
                                      if (sched.day_of_week === dayOfWeek) {
                                        const schedStart = sched.time_start || ''
                                        const schedEnd = sched.time_end || ''
                                        const schedStartMinutes = schedStart.split(':').slice(0, 2).map(Number).reduce((h: number, m: number) => h * 60 + m, 0)
                                        const schedEndMinutes = schedEnd.split(':').slice(0, 2).map(Number).reduce((h: number, m: number) => h * 60 + m, 0)
                                        
                                        // EXACT match: schedule must be within or equal to the leave time range
                                        if (schedStartMinutes >= leaveStartMinutes && schedEndMinutes <= leaveEndMinutes) {
                                          matchingSchedules.push({
                                            ...sched,
                                            schedule_type: 'teaching',
                                            schedule_id: sched.schedule_id,
                                          })
                                        }
                                      }
                                    })
                                    
                                    // Check exam schedules
                                    examSchedules.forEach((exam: any) => {
                                      if (exam.exam_date === dateStr || (dayOfWeek !== null && exam.day_of_week === dayOfWeek)) {
                                        const examStart = exam.time_start || ''
                                        const examEnd = exam.time_end || ''
                                        const examStartMinutes = examStart.split(':').slice(0, 2).map(Number).reduce((h: number, m: number) => h * 60 + m, 0)
                                        const examEndMinutes = examEnd.split(':').slice(0, 2).map(Number).reduce((h: number, m: number) => h * 60 + m, 0)
                                        
                                        // EXACT match: exam must be within or equal to the leave time range
                                        if (examStartMinutes >= leaveStartMinutes && examEndMinutes <= leaveEndMinutes) {
                                          matchingSchedules.push({
                                            ...exam,
                                            schedule_type: 'exam',
                                            schedule_id: exam.exam_schedule_id,
                                            exam_date: exam.exam_date || null,
                                          })
                                        }
                                      }
                                    })
                                  }
                                  
                                  // If there are matching schedules, show substitution dialog
                                  if (matchingSchedules.length > 0) {
                                    // Set the dialog mode based on request status
                                    setSubstitutionDialogViewMode(request.status === 'pending' ? 'view' : 'view')
                                    
                                    setPendingApproval({ 
                                      requestId: request.request_id, 
                                      employee_id: request.employee_id, 
                                      schedules: matchingSchedules,
                                      allSchedules: matchingSchedules,
                                      specificScheduleId: specificScheduleId || null,
                                      specificScheduleType: specificScheduleType || null,
                                    })
                                    
                                    // Store the selected request for later reference
                                    setSelectedRequest(request)
                                    
                                    // Fetch available substitutes for each schedule
                                    const requestedDate = request.requested_time ? new Date(request.requested_time).toISOString().split('T')[0] : ''
                                    if (requestedDate) {
                                      const substitutesMap: Record<string, any[]> = {}
                                      for (const schedule of matchingSchedules) {
                                        const formKey = `${schedule.schedule_type}-${schedule.schedule_id}`
                                        const availableTeachers = await fetchAvailableSubstitutes(schedule, requestedDate)
                                        substitutesMap[formKey] = availableTeachers
                                      }
                                      setAvailableSubstitutesMap(substitutesMap)
                                    }
                                    
                                    setShowSubstitutionDialog(true)
                                    return // Don't show review dialog
                                  }
                                } catch (error) {
                                  console.error('Error checking schedules:', error)
                                  // If error, fall through to show review dialog
                                }
                              }
                              
                              // If no schedules or not a leave request, show review dialog as normal
                              setSelectedRequest(request)
                              setReviewNotes(request.review_notes || "")
                              
                              // Fetch substitution details if the request is approved
                              if (request.status === 'approved') {
                                fetchSubstitutionDetails(request.request_id)
                              } else {
                                setSubstitutionDetails(null)
                              }
                              setShowReviewDialog(true)
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </Button>
                        <DialogContent className="w-[95vw] sm:w-full sm:max-w-[1600px] max-w-[96vw] max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle className="text-lg sm:text-xl">Review Verification Filing</DialogTitle>
                            <DialogDescription className="text-xs sm:text-sm">
                              Review and approve or reject this verification filing
                            </DialogDescription>
                          </DialogHeader>
                          {selectedRequest && (
                            <div className="space-y-4">
                              <div className="rounded-lg border border-indigo-300/40 bg-indigo-50/60 dark:bg-indigo-950/20 dark:border-indigo-800 p-3">
                                <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">Review Overview</p>
                                <p className="text-xs text-indigo-800 dark:text-indigo-200 mt-1">
                                  Validate employee identity, schedule alignment for the date, existing IN/OUT logs, and reason consistency before approval.
                                </p>
                                <div className="mt-2 grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs text-indigo-900 dark:text-indigo-200">
                                  <div>Request: {String(selectedRequest.request_type || '').replace('_', ' ').toUpperCase()}</div>
                                  <div>Log Type: {(selectedRequest as any).log_type || 'N/A'}</div>
                                  <div>Requested Day: {selectedRequest.requested_time ? format(new Date(selectedRequest.requested_time), 'PPP') : 'N/A'}</div>
                                  <div>
                                    Linked Schedule:{' '}
                                    <span className={getRequestScheduleLabelClass(selectedRequest)}>{getRequestScheduleLabel(selectedRequest)}</span>
                                  </div>
                                </div>
                                {selectedRequestPendingPair && (
                                  <p className="mt-2 text-xs text-indigo-900 dark:text-indigo-200">
                                    Paired pending request detected: <span className="font-semibold">{getMissedLogType(selectedRequestPendingPair) || 'N/A'}</span> on {selectedRequestPendingPair.requested_time ? format(new Date(selectedRequestPendingPair.requested_time), 'MMM d, yyyy h:mm a') : 'N/A'}. Approve/Reject will process both IN and OUT together.
                                  </p>
                                )}
                                {selectedRequestPairGroup.length > 1 && (
                                  <div className="mt-2 flex items-center justify-between rounded-md border border-indigo-200/60 dark:border-indigo-800 bg-white/70 dark:bg-gray-900/40 px-2 py-1.5">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2"
                                      onClick={() => navigateSelectedRequestPair('prev')}
                                      disabled={selectedRequestPairIndex <= 0}
                                    >
                                      <ChevronLeft className="h-4 w-4 mr-1" />
                                      Back
                                    </Button>
                                    <p className="text-[11px] text-indigo-900 dark:text-indigo-200">
                                      Pair {selectedRequestPairIndex + 1} of {selectedRequestPairGroup.length} ({getMissedLogType(selectedRequest) || 'N/A'})
                                    </p>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2"
                                      onClick={() => navigateSelectedRequestPair('next')}
                                      disabled={selectedRequestPairIndex >= selectedRequestPairGroup.length - 1}
                                    >
                                      Next
                                      <ChevronRight className="h-4 w-4 ml-1" />
                                    </Button>
                                  </div>
                                )}
                                <div className="mt-2 rounded-md border border-indigo-200/60 dark:border-indigo-800 bg-white/60 dark:bg-gray-900/40 p-2">
                                  <p className="text-xs font-medium text-indigo-900 dark:text-indigo-100">Attendance Logs on Requested Day</p>
                                  {reviewOverviewLoading ? (
                                    <p className="text-xs text-gray-500 mt-1">Loading day logs...</p>
                                  ) : reviewDayLogs.length === 0 ? (
                                    <p className="text-xs text-gray-500 mt-1">No existing attendance logs found for that day.</p>
                                  ) : (
                                    <div className="mt-1 space-y-1">
                                      {reviewDayLogs.slice(0, 4).map((log: any) => (
                                        <p key={log.log_id} className="text-xs text-gray-700 dark:text-gray-200">
                                          {log.log_type || 'N/A'} at {log.log_time ? format(new Date(log.log_time), 'p') : 'N/A'} | status: {log.attendance_status || 'N/A'}
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <EmployeeStats employeeId={selectedRequest.employee_id} />
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <Label className="text-xs sm:text-sm">Employee</Label>
                                  <p className="text-sm font-medium dark:text-gray-100 mt-1">{selectedRequest.employees?.full_name}</p>
                                </div>
                                <div>
                                  <Label className="text-xs sm:text-sm">Department</Label>
                                  <p className="text-sm dark:text-gray-100 mt-1">{selectedRequest.employees?.department}</p>
                                </div>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <Label className="text-xs sm:text-sm">Request Type</Label>
                                  <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <p className="text-sm dark:text-gray-100">
                                      {selectedRequest.request_type.replace("_", " ").toUpperCase()}
                                    </p>
                                    {getRequestSourceBadge((selectedRequest as any).request_source)}
                                  </div>
                                </div>
                                <div>
                                  <Label className="text-xs sm:text-sm">Status</Label>
                                  <div className="mt-1">{getStatusBadge(selectedRequest.status)}</div>
                                </div>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <Label className="text-xs sm:text-sm">Original Time</Label>
                                  <p className="text-sm dark:text-gray-100 mt-1">
                                    {selectedRequest.original_time
                                      ? format(new Date(selectedRequest.original_time), "PPp")
                                      : "N/A"}
                                  </p>
                                </div>
                                <div>
                                  <Label className="text-xs sm:text-sm">Requested Time</Label>
                                  <p className="text-sm dark:text-gray-100 mt-1">
                                    {selectedRequest.requested_time
                                      ? format(new Date(selectedRequest.requested_time), "PPp")
                                      : "N/A"}
                                  </p>
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs sm:text-sm">Reason</Label>
                                <p className="text-xs sm:text-sm bg-gray-50 dark:bg-gray-800 dark:text-gray-100 p-3 rounded-md mt-1">{formatReasonForDisplay(selectedRequest.reason)}</p>
                              </div>
                              
                              {/* Substitution Details Section */}
                              {selectedRequest.status === 'approved' && substitutionDetails && (
                                <div className="border-t pt-4">
                                  <Label className="text-xs sm:text-sm font-semibold">Substitution Details</Label>
                                  <div className="mt-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                      <div>
                                        <Label className="text-xs text-gray-600 dark:text-gray-400">Substitute Teacher</Label>
                                        <p className="text-sm font-medium dark:text-gray-100 mt-1">
                                          {substitutionDetails.substituteEmployee?.full_name || 'N/A'}
                                        </p>
                                      </div>
                                      <div>
                                        <Label className="text-xs text-gray-600 dark:text-gray-400">Department</Label>
                                        <p className="text-sm dark:text-gray-100 mt-1">
                                          {substitutionDetails.substituteEmployee?.department || 'N/A'}
                                        </p>
                                      </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                      <div>
                                        <Label className="text-xs text-gray-600 dark:text-gray-400">Substitution Date</Label>
                                        <p className="text-sm dark:text-gray-100 mt-1">
                                          {substitutionDetails.substitutionDate 
                                            ? format(new Date(substitutionDetails.substitutionDate), "PPP")
                                            : 'N/A'}
                                        </p>
                                      </div>
                                      <div>
                                        <Label className="text-xs text-gray-600 dark:text-gray-400">Schedule Type</Label>
                                        <p className="text-sm dark:text-gray-100 mt-1 capitalize">
                                          {substitutionDetails.scheduleType || 'N/A'}
                                        </p>
                                      </div>
                                    </div>
                                    
                                    {substitutionDetails.scheduleDetails && (
                                      <div className="border-t border-blue-200 dark:border-blue-800 pt-3 mt-3">
                                        <Label className="text-xs text-gray-600 dark:text-gray-400 mb-2 block">Schedule Information</Label>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                          <div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Subject</p>
                                            <p className="text-sm dark:text-gray-100 font-medium">
                                              {substitutionDetails.scheduleDetails.subjectName || 'N/A'}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Section</p>
                                            <p className="text-sm dark:text-gray-100 font-medium">
                                              {substitutionDetails.scheduleDetails.section || 'N/A'}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Time</p>
                                            <p className="text-sm dark:text-gray-100 font-medium">
                                              {substitutionDetails.scheduleDetails.timeStart && substitutionDetails.scheduleDetails.timeEnd
                                                ? `${formatDbTime12h(substitutionDetails.scheduleDetails.timeStart)} - ${formatDbTime12h(substitutionDetails.scheduleDetails.timeEnd)}`
                                                : 'N/A'}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    
                                    <div>
                                      <Label className="text-xs text-gray-600 dark:text-gray-400">Reason</Label>
                                      <p className="text-sm dark:text-gray-100 mt-1">
                                        {substitutionDetails.unavailableReason || 'N/A'}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )}
                              
                              <div>
                                <Label className="text-xs sm:text-sm">Review Notes</Label>
                                <Textarea
                                  value={reviewNotes}
                                  onChange={(e) => setReviewNotes(e.target.value)}
                                  placeholder="Add your review notes here..."
                                  rows={3}
                                  className="mt-1 text-sm sm:text-base"
                                />
                              </div>
                              {selectedRequest.status === "pending" && (
                                <div className="flex flex-col sm:flex-row justify-between gap-2 sm:gap-3 pt-2">
                                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => setShowDeleteConfirm(true)}
                                      className="w-full sm:w-auto h-11 sm:h-12 text-sm sm:text-base touch-manipulation"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete
                                    </Button>
                                    {/* Re-tap button for missed_log requests */}
                                    {selectedRequest.request_type === 'missed_log' && !String(selectedRequest.reason || '').startsWith('[UNDER_REVIEW]') && (
                                      <Button
                                        variant="outline"
                                        onClick={() => handleRetap(selectedRequest.request_id)}
                                        disabled={retapInProgress}
                                        className="text-blue-600 hover:text-blue-700 border-blue-600 w-full sm:w-auto h-11 sm:h-12 text-sm sm:text-base touch-manipulation"
                                      >
                                        <Scan className="h-4 w-4 mr-2" />
                                        {retapInProgress ? 'Processing...' : 'RFID Re-tap'}
                                      </Button>
                                    )}
                                  </div>
                                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                                    <Button
                                      variant="outline"
                                      onClick={() => handleRejectRequest(selectedRequest.request_id)}
                                      className="text-red-600 hover:text-red-700 w-full sm:w-auto h-11 sm:h-12 text-sm sm:text-base touch-manipulation"
                                    >
                                      <XCircle className="h-4 w-4 mr-2" />
                                      Reject
                                    </Button>
                                    <Button
                                      onClick={() => handleApproveRequest(selectedRequest.request_id)}
                                      className="btn-sti-primary w-full sm:w-auto h-11 sm:h-12 text-sm sm:text-base touch-manipulation"
                                    >
                                      <CheckCircle className="h-4 w-4 mr-2" />
                                      Approve
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Substitution Assignment Dialog - Mobile Responsive */}
      <Dialog open={showSubstitutionDialog} onOpenChange={(open) => {
        setShowSubstitutionDialog(open)
        if (!open) {
          // When closing the dialog, clear all state and don't show the review dialog
          setPendingApproval(null)
          setSubstitutionForms({})
          setSubstitutionDatePickerOpen({})
          setSelectedRequest(null)
          setSubstitutionDialogViewMode('approve')
        }
      }}>
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-[1600px] max-w-[96vw] max-h-[90vh] overflow-hidden flex flex-col p-0">
          {/* Fixed Header - Mobile Responsive */}
          <div className="shrink-0 border-b bg-linear-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
                {substitutionDialogViewMode === 'view' ? 'View Leave Request Details' : 'Assign Substitutes for Schedules'}
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-base mt-2 text-gray-600 dark:text-gray-300">
                {substitutionDialogViewMode === 'view' 
                  ? 'Review the leave request and the affected schedules. You can assign substitutes and approve or reject this request.' 
                  : 'The employee has assigned schedules on the requested leave date. Please assign substitutes for each schedule.'}
              </DialogDescription>
            </DialogHeader>
            
            {/* Request Information - Only show in view mode */}
            {substitutionDialogViewMode === 'view' && selectedRequest && (
              <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">Employee</p>
                    <p className="font-semibold text-gray-900 dark:text-white mt-0.5">{selectedRequest.employees?.full_name}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">Department</p>
                    <p className="font-semibold text-gray-900 dark:text-white mt-0.5">{selectedRequest.employees?.department}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">Request Date</p>
                    <p className="font-semibold text-gray-900 dark:text-white mt-0.5">
                      {selectedRequest.requested_time ? format(new Date(selectedRequest.requested_time), "PPP") : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">Status</p>
                    <div className="mt-0.5">{getStatusBadge(selectedRequest.status)}</div>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">Request Source</p>
                    <div className="mt-0.5">{getRequestSourceBadge((selectedRequest as any).request_source)}</div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-gray-500 dark:text-gray-400 text-xs">Reason</p>
                  <p className="text-sm text-gray-900 dark:text-white mt-1 bg-gray-50 dark:bg-gray-900 p-2 rounded">
                    {formatReasonForDisplay(selectedRequest.reason)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Scrollable Content - Mobile Responsive */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {pendingApproval && pendingApproval.schedules.length > 0 && (
              <div className="space-y-4 sm:space-y-6">
                {/* Show schedule selection list if no specific schedule is selected */}
                {!selectedScheduleForSubstitution && !pendingApproval.specificScheduleId ? (
                  <div className="space-y-3">
                    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                      <p className="text-sm text-blue-900 dark:text-blue-100">
                        <strong>Review selected schedules</strong> below. You can open a schedule card to adjust details before approving substitution.
                      </p>
                    </div>
                    {pendingApproval.schedules.map((schedule, idx) => (
                      <Card key={`${schedule.schedule_type}-${schedule.schedule_id}`} className="border-2 hover:border-blue-500 transition-colors cursor-pointer">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-3">
                                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                                  {schedule.schedule_type === 'exam' ? '📝' : '📚'}
                                </div>
                                <div>
                                  <h3 className="font-bold text-base text-gray-900 dark:text-white">
                                    {schedule.schedule_type === 'exam' ? 'Exam Schedule' : 'Class Schedule'} #{idx + 1}
                                  </h3>
                                  <p className="text-sm text-gray-600 dark:text-gray-300">{schedule.subject_name || 'N/A'}</p>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                                <div>
                                  <span className="text-gray-500 dark:text-gray-400">Room:</span>
                                  <span className="ml-1 font-medium text-gray-900 dark:text-gray-100">{schedule.room_code || 'TBA'}</span>
                                </div>
                                <div className="col-span-2">
                                  <span className="text-gray-500 dark:text-gray-400">Time:</span>
                                  <span className="ml-1 font-medium text-gray-900 dark:text-gray-100">
                                    {formatDbTime12h(schedule.time_start || '')} - {formatDbTime12h(schedule.time_end || '')}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <Button
                              onClick={() => {
                                setSelectedScheduleForSubstitution({
                                  scheduleId: schedule.schedule_id,
                                  scheduleType: schedule.schedule_type
                                })
                              }}
                              className="ml-4 bg-blue-600 hover:bg-blue-700 text-white"
                            >
                              <ArrowLeftRight className="h-4 w-4 mr-2" />
                              Assign
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  // Show form for selected schedule
                  pendingApproval.schedules
                    .filter((schedule) => {
                      // Show only the selected schedule
                      if (selectedScheduleForSubstitution) {
                        return schedule.schedule_id === selectedScheduleForSubstitution.scheduleId && 
                               schedule.schedule_type === selectedScheduleForSubstitution.scheduleType
                      }
                      // Or the one from sessionStorage
                      if (pendingApproval?.specificScheduleId && pendingApproval?.specificScheduleType) {
                        return schedule.schedule_id === pendingApproval.specificScheduleId && 
                               schedule.schedule_type === pendingApproval.specificScheduleType
                      }
                      return false
                    })
                    .map((schedule, idx) => {
                      const formKey = `${schedule.schedule_type}-${schedule.schedule_id}`
                      const form = substitutionForms[formKey] || {
                        substituteEmployeeId: '',
                        unavailableReason: '',
                        status: 'on-leave' as const,
                        substitutionDate: '',
                        manualMode: schedule.schedule_type === 'manual',
                        manualTimeStart: '',
                        manualTimeEnd: '',
                      }
                      const approvalRequest = verificationRequests.find((req) => Number(req.request_id) === Number(pendingApproval?.requestId))
                      const leavePlan = approvalRequest ? parseLeaveSubstitutionPlan(approvalRequest) : {
                        substituteEmployeeId: null,
                        manualMode: false,
                        manualTimeStart: '',
                        manualTimeEnd: '',
                      }
                      const plannedSubstituteEmployee = leavePlan.substituteEmployeeId
                        ? employees.find((emp) => Number((emp as any)?.employee_id) === Number(leavePlan.substituteEmployeeId))
                        : null
                      const selectedSubstituteEmployee = form.substituteEmployeeId
                        ? employees.find((emp) => Number((emp as any)?.employee_id) === Number(form.substituteEmployeeId))
                        : null
                      const hasPlannedSubstitute = Number(leavePlan.substituteEmployeeId || 0) > 0
                      const hasCurrentSelection = Number(form.substituteEmployeeId || 0) > 0
                      const isSubstituteMismatch = hasPlannedSubstitute && hasCurrentSelection && Number(leavePlan.substituteEmployeeId) !== Number(form.substituteEmployeeId)
                      const effectiveManualMode = Boolean(form.manualMode || schedule.schedule_type === 'manual')
                      const effectiveStartTime = (form.manualTimeStart || '').trim() || String(schedule.time_start || '').slice(0, 5)
                      const effectiveEndTime = (form.manualTimeEnd || '').trim() || String(schedule.time_end || '').slice(0, 5)
                      const coveragePreview = coveragePreviewMap[formKey]
                      const isCoveragePreviewLoading = Boolean(coveragePreviewLoading[formKey])
                      const isClickSchedule = true // Always true when showing the form
                  
                  return (
                    <Card 
                      key={`${schedule.schedule_type}-${schedule.schedule_id}`} 
                      className="border-2 shadow-md border-gray-200 dark:border-gray-700"
                    >
                      <CardHeader className="border-b p-4 sm:p-6 bg-linear-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-700">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className="p-1.5 sm:p-2 rounded-lg text-sm sm:text-base bg-green-500">
                              {schedule.schedule_type === 'exam' ? '📝' : '📚'}
                            </div>
                            <div>
                              <CardTitle className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                                {schedule.schedule_type === 'exam' ? 'Exam Schedule' : 'Class Schedule'}
                              </CardTitle>
                              <CardDescription className="text-xs sm:text-sm mt-1">
                                {schedule.subject_name || 'N/A'}
                              </CardDescription>
                            </div>
                          </div>
                          {selectedScheduleForSubstitution && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedScheduleForSubstitution(null)}
                              className="text-gray-600 hover:text-gray-700"
                            >
                              ← Back to List
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 sm:p-6">
                        {/* Schedule Details Grid - Mobile Responsive */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6 pb-3 sm:pb-4 border-b">
                          <div>
                            <Label className="text-[10px] sm:text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Subject</Label>
                            <p className="text-xs sm:text-sm font-medium mt-1 text-gray-900 dark:text-gray-100">{schedule.subject_name || 'N/A'}</p>
                          </div>
                          <div>
                            <Label className="text-[10px] sm:text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Room</Label>
                            <p className="text-xs sm:text-sm font-medium mt-1 text-gray-900 dark:text-gray-100">{schedule.room_code || 'TBA'}</p>
                          </div>
                          <div>
                            <Label className="text-[10px] sm:text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Time</Label>
                            <p className="text-xs sm:text-sm font-medium mt-1 text-gray-900 dark:text-gray-100">
                              {formatDbTime12h(schedule.time_start || '')} - {formatDbTime12h(schedule.time_end || '')}
                            </p>
                          </div>
                          {schedule.section && (
                            <div className="col-span-1 sm:col-span-2 lg:col-span-3">
                              <Label className="text-[10px] sm:text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Section</Label>
                              <p className="text-xs sm:text-sm font-medium mt-1 text-gray-900 dark:text-gray-100">{schedule.section}</p>
                            </div>
                          )}
                        </div>

                        {/* Filing Plan Summary - Read-only */}
                        <div className="mb-4 sm:mb-6 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/20 p-3 sm:p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-xs sm:text-sm font-semibold text-emerald-900 dark:text-emerald-100">Filing Plan Summary</p>
                              <p className="text-[11px] sm:text-xs text-emerald-700/90 dark:text-emerald-300 mt-0.5">Read-only snapshot from filing plan and current form values.</p>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300">Read-only</Badge>
                              {isSubstituteMismatch && (
                                <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300">Substitute differs from filing plan</Badge>
                              )}
                            </div>
                          </div>
                          {isSubstituteMismatch && (
                            <div className="mt-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
                              <p className="text-[11px] sm:text-xs text-amber-800 dark:text-amber-200">
                                Proposed: <span className="font-semibold">{plannedSubstituteEmployee?.full_name || 'N/A'}</span> • Current: <span className="font-semibold">{selectedSubstituteEmployee?.full_name || 'N/A'}</span>
                              </p>
                            </div>
                          )}
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] sm:text-xs">
                            <div className="rounded-md bg-white/70 dark:bg-gray-900/40 border border-emerald-100 dark:border-emerald-900 p-2.5">
                              <p className="text-gray-500 dark:text-gray-400 uppercase tracking-wide">Proposed Substitute</p>
                              <p className="text-sm sm:text-xs font-semibold text-gray-900 dark:text-gray-100 mt-1">
                                {plannedSubstituteEmployee?.full_name || 'Not specified during filing'}
                              </p>
                            </div>
                            <div className="rounded-md bg-white/70 dark:bg-gray-900/40 border border-emerald-100 dark:border-emerald-900 p-2.5">
                              <p className="text-gray-500 dark:text-gray-400 uppercase tracking-wide">Current Selection</p>
                              <p className="text-sm sm:text-xs font-semibold text-gray-900 dark:text-gray-100 mt-1">
                                {selectedSubstituteEmployee?.full_name || 'Not selected yet'}
                              </p>
                            </div>
                            <div className="rounded-md bg-white/70 dark:bg-gray-900/40 border border-emerald-100 dark:border-emerald-900 p-2.5">
                              <p className="text-gray-500 dark:text-gray-400 uppercase tracking-wide">Planned Final Schedule</p>
                              <p className="text-sm sm:text-xs font-semibold text-gray-900 dark:text-gray-100 mt-1">
                                {leavePlan.manualMode
                                  ? `${formatDbTime12h(leavePlan.manualTimeStart || '')} - ${formatDbTime12h(leavePlan.manualTimeEnd || '')}`
                                  : 'Use selected schedule time window'}
                              </p>
                            </div>
                            <div className="rounded-md bg-white/70 dark:bg-gray-900/40 border border-emerald-100 dark:border-emerald-900 p-2.5">
                              <p className="text-gray-500 dark:text-gray-400 uppercase tracking-wide">Effective Final Schedule</p>
                              <p className="text-sm sm:text-xs font-semibold text-gray-900 dark:text-gray-100 mt-1">
                                {effectiveManualMode
                                  ? `${formatDbTime12h(effectiveStartTime || '')} - ${formatDbTime12h(effectiveEndTime || '')}`
                                  : `${formatDbTime12h(schedule.time_start || '')} - ${formatDbTime12h(schedule.time_end || '')}`}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        {/* Substitution Form - Mobile Responsive */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                          <div className="lg:col-span-2">
                            <Label 
                              htmlFor={`substitute-${formKey}`} 
                              className="text-xs sm:text-sm font-semibold mb-2 block"
                            >
                              Select Substitute Teacher *
                            </Label>
                            <Select
                              value={form.substituteEmployeeId}
                              onValueChange={(value) => {
                                // Validate that the selected employee is not the same as the original employee
                                const selectedId = Number(value)
                                if (pendingApproval && selectedId === pendingApproval.employee_id) {
                                  toast({
                                    title: "Invalid Selection",
                                    description: "An employee cannot be assigned as their own substitute.",
                                    variant: "destructive"
                                  })
                                  return
                                }
                                setSubstitutionForms(prev => ({
                                  ...prev,
                                  [formKey]: { ...form, substituteEmployeeId: value }
                                }))
                              }}
                              disabled={(() => {
                                const formKey = `${schedule.schedule_type}-${schedule.schedule_id}`
                                const availableSubstitutes = availableSubstitutesMap[formKey] || []
                                return availableSubstitutes.length === 0
                              })()}
                            >
                              <SelectTrigger className="h-11 sm:h-12 text-sm sm:text-base touch-manipulation">
                                <SelectValue placeholder={
                                  (() => {
                                    const formKey = `${schedule.schedule_type}-${schedule.schedule_id}`
                                    const availableSubstitutes = availableSubstitutesMap[formKey] || []
                                    return availableSubstitutes.length === 0 
                                      ? "No Substitute Available (all have conflicts)" 
                                      : "Select substitute employee..."
                                  })()
                                } />
                              </SelectTrigger>
                              <SelectContent>
                                {(() => {
                                  const formKey = `${schedule.schedule_type}-${schedule.schedule_id}`
                                  const availableSubstitutes = availableSubstitutesMap[formKey] || []
                                  
                                  // Don't render SelectItem with empty value - just return empty array
                                  // The Select is already disabled when there are no substitutes
                                  if (availableSubstitutes.length === 0) {
                                    return null
                                  }
                                  
                                  return availableSubstitutes.map(emp => (
                                    <SelectItem key={emp.employee_id} value={emp.employee_id.toString()}>
                                      {emp.full_name} {emp.department ? `• ${emp.department}` : ''}
                                    </SelectItem>
                                  ))
                                })()}
                              </SelectContent>
                            </Select>
                            {(() => {
                              const formKey = `${schedule.schedule_type}-${schedule.schedule_id}`
                              const availableSubstitutes = availableSubstitutesMap[formKey] || []
                              if (availableSubstitutes.length === 0) {
                                return (
                                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                                    ⚠ No substitute employees available for this request right now
                                  </p>
                                )
                              }
                              if (form.substituteEmployeeId && pendingApproval && Number(form.substituteEmployeeId) === pendingApproval.employee_id) {
                                return (
                                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                                    ⚠ Cannot select the same employee as substitute
                                  </p>
                                )
                              }
                              return null
                            })()}
                          </div>
                          
                          <div>
                            <Label 
                              htmlFor={`status-${formKey}`} 
                              className="text-xs sm:text-sm font-semibold mb-2 block"
                            >
                              Original Teacher Status *
                            </Label>
                            <Select
                              value={form.status}
                              onValueChange={(value) => {
                                setSubstitutionForms(prev => ({
                                  ...prev,
                                  [formKey]: { ...form, status: value as any }
                                }))
                              }}
                            >
                              <SelectTrigger className="h-11 sm:h-12 text-sm sm:text-base touch-manipulation">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="on-leave">On Leave</SelectItem>
                                <SelectItem value="absent">Absent</SelectItem>
                                <SelectItem value="unavailable">Unavailable</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div className="lg:col-span-3">
                            <Label 
                              htmlFor={`reason-${formKey}`} 
                              className="text-xs sm:text-sm font-semibold mb-2 block"
                            >
                              Reason for Unavailability *
                            </Label>
                            <Input
                              id={`reason-${formKey}`}
                              placeholder="e.g., Leave approved, Sick leave, etc."
                              value={form.unavailableReason}
                              onChange={(e) => {
                                setSubstitutionForms(prev => ({
                                  ...prev,
                                  [formKey]: { ...form, unavailableReason: e.target.value }
                                }))
                              }}
                              className="h-11 sm:h-12 text-sm sm:text-base"
                            />
                          </div>
                          
                          {/* Substitution Date Picker */}
                          <div className="lg:col-span-3">
                            <Label 
                              htmlFor={`substitution-date-${formKey}`} 
                              className="text-xs sm:text-sm font-semibold mb-2 block"
                            >
                              Substitution Date *
                            </Label>
                            
                            {/* Substitution Date Picker Popover (avoids nested Dialog issue) */}
                            <Popover open={substitutionDatePickerOpen[formKey] || false} onOpenChange={(open) => {
                              setSubstitutionDatePickerOpen(prev => ({ ...prev, [formKey]: open }))
                            }}>
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={cn(
                                    "h-11 sm:h-12 w-full justify-start text-left font-normal text-sm sm:text-base touch-manipulation",
                                    !form.substitutionDate && "text-muted-foreground"
                                  )}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {form.substitutionDate ? (
                                    format(new Date(form.substitutionDate + 'T00:00:00+08:00'), "PPP")
                                  ) : (
                                    <span className="text-gray-400">Select substitution date *</span>
                                  )}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <div className="p-4 border-b">
                                  <p className="text-sm font-semibold">Select Substitution Date</p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    {(() => {
                                      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                                      const scheduleDayName = schedule.day_of_week ? dayNames[schedule.day_of_week] : 'scheduled day'
                                      return `Only ${scheduleDayName}s can be selected to match the selected schedule.`
                                    })()}
                                  </p>
                                </div>
                                <Calendar
                                  mode="single"
                                  selected={form.substitutionDate ? new Date(form.substitutionDate + 'T00:00:00+08:00') : undefined}
                                  onSelect={(date) => {
                                    if (date) {
                                      const dateStr = formatInTimeZone(date, 'Asia/Manila', 'yyyy-MM-dd')
                                      setSubstitutionForms(prev => ({
                                        ...prev,
                                        [formKey]: { ...form, substitutionDate: dateStr }
                                      }))
                                      setSubstitutionDatePickerOpen(prev => ({ ...prev, [formKey]: false }))
                                    }
                                  }}
                                  disabled={(date) => {
                                    const today = getManilaToday()
                                    const todayObj = new Date(today + 'T00:00:00+08:00')
                                    todayObj.setHours(0, 0, 0, 0)
                                    
                                    const dateStr = formatInTimeZone(date, 'Asia/Manila', 'yyyy-MM-dd')
                                    const dateToCheck = new Date(dateStr + 'T00:00:00+08:00')
                                    dateToCheck.setHours(0, 0, 0, 0)
                                    
                                    // Disable past dates
                                    if (dateToCheck < todayObj) return true
                                    
                                    // Disable Sundays
                                    if (date.getDay() === 0) return true
                                    
                                    // CRITICAL: Only allow dates that match the schedule's day_of_week
                                    if (schedule.day_of_week && date.getDay() !== schedule.day_of_week) {
                                      return true
                                    }
                                    
                                    return false
                                  }}
                                  className="border-0"
                                />
                                <div className="flex items-center justify-between p-3 border-t">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSubstitutionForms(prev => ({
                                        ...prev,
                                        [formKey]: { ...form, substitutionDate: '' }
                                      }))
                                      setSubstitutionDatePickerOpen(prev => ({ ...prev, [formKey]: false }))
                                    }}
                                  >
                                    Clear
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const today = getManilaToday()
                                      const todayObj = new Date(today + 'T00:00:00+08:00')
                                      const todayDayOfWeek = todayObj.getDay()
                                      
                                      if (schedule.day_of_week && todayDayOfWeek === schedule.day_of_week) {
                                        setSubstitutionForms(prev => ({
                                          ...prev,
                                          [formKey]: { ...form, substitutionDate: today }
                                        }))
                                        setSubstitutionDatePickerOpen(prev => ({ ...prev, [formKey]: false }))
                                      } else {
                                        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                                        const scheduleDayName = schedule.day_of_week ? dayNames[schedule.day_of_week] : 'the scheduled day'
                                        toast({
                                          title: "Invalid Date",
                                          description: `Today is not a ${scheduleDayName}. Please select a ${scheduleDayName} that matches the selected schedule.`,
                                          variant: "destructive"
                                        })
                                      }
                                    }}
                                  >
                                    Today
                                  </Button>
                                </div>
                              </PopoverContent>
                            </Popover>
                            
                            {schedule.day_of_week && (
                              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 flex items-center gap-1">
                                <span>ℹ️</span>
                                <span>
                                  Only {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][schedule.day_of_week]}s can be selected to match this schedule
                                </span>
                              </p>
                            )}
                          </div>

                          <div className="lg:col-span-3 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 p-3 sm:p-4 bg-indigo-50/40 dark:bg-indigo-950/20">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={Boolean(form.manualMode || schedule.schedule_type === 'manual')}
                                onCheckedChange={(checked) => {
                                  setSubstitutionForms(prev => ({
                                    ...prev,
                                    [formKey]: {
                                      ...form,
                                      manualMode: Boolean(checked),
                                      manualTimeStart: form.manualTimeStart || (schedule.time_start ? String(schedule.time_start).slice(0, 5) : ''),
                                      manualTimeEnd: form.manualTimeEnd || (schedule.time_end ? String(schedule.time_end).slice(0, 5) : ''),
                                    }
                                  }))
                                }}
                              />
                              <Label className="text-xs sm:text-sm font-semibold m-0">Manual Final Schedule Override</Label>
                            </div>
                            <p className="text-[11px] sm:text-xs text-gray-600 dark:text-gray-300 mt-1">
                              Enable this when the final duty window should be manually encoded (for mixed shifts like 8:00 AM to 9:00 PM).
                            </p>

                            {(form.manualMode || schedule.schedule_type === 'manual') && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                                <div>
                                  <Label className="text-[10px] sm:text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Manual Start Time *</Label>
                                  <Input
                                    type="time"
                                    value={form.manualTimeStart || ''}
                                    onChange={(e) => {
                                      setSubstitutionForms(prev => ({
                                        ...prev,
                                        [formKey]: { ...form, manualTimeStart: e.target.value }
                                      }))
                                    }}
                                    className="h-11 mt-1"
                                  />
                                </div>
                                <div>
                                  <Label className="text-[10px] sm:text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Manual End Time *</Label>
                                  <Input
                                    type="time"
                                    value={form.manualTimeEnd || ''}
                                    onChange={(e) => {
                                      setSubstitutionForms(prev => ({
                                        ...prev,
                                        [formKey]: { ...form, manualTimeEnd: e.target.value }
                                      }))
                                    }}
                                    className="h-11 mt-1"
                                  />
                                </div>
                              </div>
                            )}
                          </div>

                          {form.substituteEmployeeId && form.substitutionDate && (
                            <div className="lg:col-span-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20 p-3 sm:p-4">
                              <p className="text-xs sm:text-sm font-semibold text-emerald-900 dark:text-emerald-100">Merged Coverage Preview</p>
                              <p className="text-[11px] sm:text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                                Final duty window combines substituted class blocks and the substitute employee&apos;s own schedule for this date.
                              </p>

                              {isCoveragePreviewLoading ? (
                                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-2">Computing coverage window...</p>
                              ) : coveragePreview ? (
                                <div className="mt-3 space-y-3">
                                  <div className="rounded-md border border-emerald-200 dark:border-emerald-800 bg-white/70 dark:bg-gray-900/40 px-3 py-2">
                                    <p className="text-[11px] sm:text-xs text-gray-600 dark:text-gray-300">Final Range</p>
                                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5">
                                      {coveragePreview.finalStart && coveragePreview.finalEnd
                                        ? `${formatDbTime12h(coveragePreview.finalStart)} - ${formatDbTime12h(coveragePreview.finalEnd)}`
                                        : 'N/A'}
                                    </p>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="rounded-md border border-emerald-200 dark:border-emerald-800 bg-white/70 dark:bg-gray-900/40 px-3 py-2">
                                      <p className="text-[11px] sm:text-xs font-medium text-gray-700 dark:text-gray-300">Selected substituted blocks</p>
                                      <div className="mt-1 space-y-1">
                                        {coveragePreview.substitutedSlots.length === 0 ? (
                                          <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">No substituted slots selected yet.</p>
                                        ) : coveragePreview.substitutedSlots.map((slot, slotIdx) => (
                                          <p key={`sub-${slotIdx}`} className="text-[11px] sm:text-xs text-gray-700 dark:text-gray-200">
                                            {formatDbTime12h(slot.start)} - {formatDbTime12h(slot.end)} • {slot.label}
                                          </p>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="rounded-md border border-emerald-200 dark:border-emerald-800 bg-white/70 dark:bg-gray-900/40 px-3 py-2">
                                      <p className="text-[11px] sm:text-xs font-medium text-gray-700 dark:text-gray-300">Substitute&apos;s existing schedules</p>
                                      <div className="mt-1 space-y-1">
                                        {coveragePreview.ownSlots.length === 0 ? (
                                          <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">No existing schedule blocks on this date.</p>
                                        ) : coveragePreview.ownSlots.map((slot, slotIdx) => (
                                          <p key={`own-${slotIdx}`} className="text-[11px] sm:text-xs text-gray-700 dark:text-gray-200">
                                            {formatDbTime12h(slot.start)} - {formatDbTime12h(slot.end)} • {slot.label}
                                          </p>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2">
                                      <p className="text-[11px] sm:text-xs font-medium text-amber-800 dark:text-amber-300">Remaining original teacher blocks</p>
                                      <div className="mt-1 space-y-1">
                                        {coveragePreview.remainingOriginalSlots.length === 0 ? (
                                          <p className="text-[11px] sm:text-xs text-amber-700/80 dark:text-amber-300/80">No remaining blocks for the original teacher on this date.</p>
                                        ) : coveragePreview.remainingOriginalSlots.map((slot, slotIdx) => (
                                          <p key={`remaining-${slotIdx}`} className="text-[11px] sm:text-xs text-amber-900 dark:text-amber-200">
                                            {formatDbTime12h(slot.start)} - {formatDbTime12h(slot.end)} • {slot.label}
                                          </p>
                                        ))}
                                      </div>
                                    </div>
                                  </div>

                                  {coveragePreview.hasOverlapConflict && (
                                    <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-3 py-2">
                                      <p className="text-[11px] sm:text-xs text-red-700 dark:text-red-300">
                                        Conflict detected: the substitute has an existing schedule that overlaps one or more selected substituted blocks.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">Coverage preview will appear after selecting substitute and date.</p>
                              )}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                    )
                  })
                )}
              </div>
            )}
          </div>

          {/* Fixed Footer - Mobile Responsive */}
          <div className="shrink-0 border-t bg-white dark:bg-gray-900 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowSubstitutionDialog(false)
                  setPendingApproval(null)
                  setSubstitutionForms({})
                  setSubstitutionDatePickerOpen({})
                  setSelectedScheduleForSubstitution(null)
                  setSelectedRequest(null)
                  setSubstitutionDialogViewMode('approve')
                }}
                className="w-full sm:w-auto h-11 sm:h-12 text-sm sm:text-base touch-manipulation order-4 sm:order-1"
              >
                {substitutionDialogViewMode === 'view' ? 'Close' : 'Cancel'}
              </Button>
              
              {/* Reject button - only in view mode for pending requests */}
              {substitutionDialogViewMode === 'view' && selectedRequest?.status === 'pending' && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (pendingApproval) {
                      handleRejectRequest(pendingApproval.requestId)
                    }
                  }}
                  className="w-full sm:w-auto h-11 sm:h-12 text-sm sm:text-base touch-manipulation order-3 sm:order-2 text-red-600 hover:text-red-700 border-red-300 hover:border-red-400"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject Request
                </Button>
              )}
              
              {/* Approve buttons - show for pending requests or in approve mode */}
              {(substitutionDialogViewMode === 'approve' || selectedRequest?.status === 'pending') && pendingApproval && (
                <Button
                  variant="outline"
                  onClick={() => {
                    handleApproveRequest(pendingApproval.requestId, true)
                  }}
                  className="w-full sm:w-auto h-11 sm:h-12 text-sm sm:text-base touch-manipulation order-2 sm:order-3"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve Without Substitution
                </Button>
              )}
              {(substitutionDialogViewMode === 'approve' || selectedRequest?.status === 'pending') && pendingApproval?.schedules?.length > 0 && (
                <Button
                  onClick={() => {
                    if (pendingApproval) {
                      const schedulesToValidate = pendingApproval.specificScheduleId
                        ? pendingApproval.schedules.filter((s) =>
                            s.schedule_id === pendingApproval.specificScheduleId &&
                            s.schedule_type === pendingApproval.specificScheduleType
                          )
                        : pendingApproval.schedules

                      if (schedulesToValidate.length === 0) {
                        toast({
                          title: "Error",
                          description: "Schedule not found.",
                          variant: "destructive",
                        })
                        return
                      }

                      for (const schedule of schedulesToValidate) {
                        const formKey = `${schedule.schedule_type}-${schedule.schedule_id}`
                        const form = substitutionForms[formKey]

                        if (!form || !form.substituteEmployeeId || !form.unavailableReason.trim() || !form.substitutionDate) {
                          setSubstitutionWarningMessage("Please fill in all required fields for each selected schedule:\n\n• Select a substitute teacher\n• Provide a reason for unavailability\n• Select a substitution date")
                          setShowSubstitutionWarningDialog(true)
                          return
                        }

                        if (form.manualMode || schedule.schedule_type === 'manual') {
                          if (!form.manualTimeStart || !form.manualTimeEnd) {
                            setSubstitutionWarningMessage("Manual mode is enabled. Please provide both start and end time for the final schedule.")
                            setShowSubstitutionWarningDialog(true)
                            return
                          }
                          if (form.manualTimeStart >= form.manualTimeEnd) {
                            setSubstitutionWarningMessage("Manual schedule time range is invalid. End time must be later than start time.")
                            setShowSubstitutionWarningDialog(true)
                            return
                          }
                        }

                        const substituteId = Number(form.substituteEmployeeId)
                        if (pendingApproval && substituteId === pendingApproval.employee_id) {
                          setSubstitutionWarningMessage("An employee cannot be assigned as their own substitute. Please select a different teacher.")
                          setShowSubstitutionWarningDialog(true)
                          return
                        }
                      }

                      performApproval(pendingApproval.requestId)
                    }
                  }}
                  className="bg-linear-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 active:from-green-800 active:to-emerald-800 text-white w-full sm:w-auto h-11 sm:h-12 text-sm sm:text-base touch-manipulation order-1 sm:order-4"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve With Substitution
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog
        open={showBulkDeleteConfirm}
        onOpenChange={(open) => {
          setShowBulkDeleteConfirm(open)
          if (!open) setBulkDeleteConfirmText('')
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Verification Requests</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to delete <span className="font-semibold">{selectedCount}</span> verification request(s). This will:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Remove the selected verification requests permanently</li>
                <li>Revert substitutions assigned through these requests</li>
                <li>Undo related attendance changes for approved requests</li>
                <li>Delete related verification notifications</li>
              </ul>
              <p className="mt-3 font-semibold text-red-600">This action cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="bulk-delete-confirm" className="text-sm font-medium">
              Type DELETE to confirm
            </Label>
            <Input
              id="bulk-delete-confirm"
              value={bulkDeleteConfirmText}
              onChange={(e) => setBulkDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              className="h-10"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteInProgress}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDeleteRequests}
              disabled={deleteInProgress || selectedCount === 0 || bulkDeleteConfirmText.trim().toUpperCase() !== 'DELETE'}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteInProgress ? 'Deleting Selected...' : `Delete Selected (${selectedCount})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Review Wizard Dialog */}
      <Dialog
        open={showBulkReviewConfirm}
        onOpenChange={(open) => {
          if (!open) {
            requestCloseBulkReviewWizard()
          }
        }}
      >
        <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[90vh] min-h-0 flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {bulkReviewAction === 'approved' ? 'Bulk Accept Review' : 'Bulk Decline Review'}
            </DialogTitle>
            <DialogDescription>
              Step {bulkReviewWizardStep} of 3
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0 pr-4 -mr-4">
            <div className="space-y-4 py-2">
              {bulkReviewWizardStep === 1 && (
                <div className="space-y-3">
                  <p className="text-sm">
                    You selected <span className="font-semibold">{selectedCount}</span> request(s). Pending requests eligible for bulk review: <span className="font-semibold">{selectedPendingCount}</span>.
                  </p>
                  {selectedCount > selectedPendingCount && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      {selectedCount - selectedPendingCount} request(s) are not pending and will be skipped.
                    </p>
                  )}
                  <div className="rounded-md border p-3 text-xs space-y-1">
                    <div>Action: {bulkReviewAction === 'approved' ? 'Accept Selected' : 'Decline Selected'}</div>
                    <div>Selected IDs: {Array.from(selectedRequestIds).slice(0, 20).join(', ')}{selectedCount > 20 ? ' ...' : ''}</div>
                  </div>
                </div>
              )}

              {bulkReviewWizardStep === 2 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Existing Verification Comparison</p>
                  {duplicateRowsForBulkReview.length === 0 ? (
                    <p className="text-xs text-green-700 dark:text-green-300">No existing pending/approved duplicate requests detected for selected rows.</p>
                  ) : (
                    <div className="rounded-md border max-h-[42vh] overflow-auto overscroll-contain">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Selected Req</TableHead>
                            <TableHead>Existing Req</TableHead>
                            <TableHead>Employee</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Log</TableHead>
                            <TableHead>Selected Time</TableHead>
                            <TableHead>Existing Time</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {duplicateRowsForBulkReview.slice(0, 20).flatMap((item: any) =>
                            item.matches.map((match: any) => (
                              <TableRow key={`dup-${item.request.request_id}-${match.request_id}`}>
                                <TableCell className="font-medium">#{item.request.request_id}</TableCell>
                                <TableCell className="font-medium">#{match.request_id}</TableCell>
                                <TableCell>{item.request.employees?.full_name || `Employee ${item.request.employee_id}`}</TableCell>
                                <TableCell>{deriveRequestDate(item.request) || deriveRequestDate(match) || 'N/A'}</TableCell>
                                <TableCell>{formatRequestTypeText(item.request.request_type)}</TableCell>
                                <TableCell>{String(item.request.log_type || 'N/A').toUpperCase()}</TableCell>
                                <TableCell>{formatRequestDateTime(item.request.requested_time || item.request.original_time)}</TableCell>
                                <TableCell>{formatRequestDateTime(match.requested_time || match.original_time)}</TableCell>
                                <TableCell>
                                  <Badge variant={match.status === 'approved' ? 'default' : 'secondary'} className="capitalize">
                                    {String(match.status || 'unknown')}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}

              {bulkReviewWizardStep === 3 && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <p className="text-sm font-medium">Existing Attendance Data Comparison</p>
                    <div className="flex items-center gap-2">
                      <Badge variant={bulkReviewConflictCount > 0 ? 'destructive' : 'secondary'}>
                        {bulkReviewConflictCount} conflict{bulkReviewConflictCount === 1 ? '' : 's'}
                      </Badge>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setBulkReviewShowConflictsOnly((prev) => !prev)}
                      >
                        {bulkReviewShowConflictsOnly ? 'Show All' : 'Show Conflicts Only'}
                      </Button>
                    </div>
                  </div>
                  {bulkReviewComparisonLoading ? (
                    <p className="text-xs text-gray-500">Loading attendance comparison...</p>
                  ) : bulkReviewAttendanceComparison.length === 0 ? (
                    <p className="text-xs text-gray-500">No comparison data available.</p>
                  ) : bulkReviewShowConflictsOnly && displayedBulkReviewAttendanceComparison.length === 0 ? (
                    <p className="text-xs text-gray-500">No conflict rows found in this selection.</p>
                  ) : (
                    <div className="rounded-md border max-h-[42vh] overflow-auto overscroll-contain">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Req</TableHead>
                            <TableHead>Employee</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Log</TableHead>
                            <TableHead>Requested Time</TableHead>
                            <TableHead>Existing Time In</TableHead>
                            <TableHead>Existing Time Out</TableHead>
                            <TableHead>Existing Status</TableHead>
                            <TableHead>Notes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {displayedBulkReviewAttendanceComparison.map((entry: any, idx: number) => {
                            const {
                              existingIn,
                              existingOut,
                              existingStatus,
                              isInLog,
                              isOutLog,
                              hasExistingIn,
                              hasExistingOut,
                              hasConflict,
                              conflictMessage,
                            } = getBulkAttendanceConflictInfo(entry)
                            const requestDate = deriveRequestDate(entry.request)
                            return (
                              <TableRow key={`cmp-${idx}`} className={hasConflict ? 'bg-red-50/60 dark:bg-red-950/20' : ''}>
                                <TableCell className="font-medium">#{entry.request?.request_id || 'N/A'}</TableCell>
                                <TableCell>{entry.request?.employees?.full_name || `Employee ${entry.request?.employee_id || 'N/A'}`}</TableCell>
                                <TableCell>{requestDate || 'N/A'}</TableCell>
                                <TableCell>{formatRequestTypeText(entry.request?.request_type)}</TableCell>
                                <TableCell>{String(entry.request?.log_type || 'N/A').toUpperCase()}</TableCell>
                                <TableCell className={hasConflict ? 'text-red-700 dark:text-red-300 font-medium' : ''}>{formatRequestDateTime(entry.request?.requested_time || entry.request?.original_time)}</TableCell>
                                <TableCell className={isInLog && hasExistingIn ? 'text-red-700 dark:text-red-300 font-medium' : ''}>{String(existingIn)}</TableCell>
                                <TableCell className={isOutLog && hasExistingOut ? 'text-red-700 dark:text-red-300 font-medium' : ''}>{String(existingOut)}</TableCell>
                                <TableCell>
                                  <Badge variant={existingStatus === 'N/A' ? 'secondary' : 'default'} className="capitalize">
                                    {String(existingStatus)}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {entry.error ? (
                                    <span className="text-red-600 dark:text-red-400">{entry.error}</span>
                                  ) : hasConflict ? (
                                    <span className="text-red-700 dark:text-red-300 font-medium">{conflictMessage}</span>
                                  ) : (
                                    <span>{Array.isArray(entry.existingLogs) ? `${entry.existingLogs.length} log(s) found` : '0 log(s) found'}</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="flex flex-col sm:flex-row justify-between gap-2 pt-3 border-t">
            <Button variant="outline" onClick={requestCloseBulkReviewWizard} disabled={bulkReviewInProgress}>
              Close
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setBulkReviewWizardStep((prev) => (prev > 1 ? (prev - 1) as 1 | 2 | 3 : prev))}
                disabled={bulkReviewWizardStep === 1 || bulkReviewInProgress}
              >
                Previous
              </Button>
              {bulkReviewWizardStep < 3 ? (
                <Button onClick={() => setBulkReviewWizardStep((prev) => (prev < 3 ? (prev + 1) as 1 | 2 | 3 : prev))} disabled={bulkReviewInProgress}>
                  Next
                </Button>
              ) : (
                <Button
                  onClick={handleBulkReviewRequests}
                  disabled={bulkReviewInProgress || selectedPendingCount === 0}
                  className={bulkReviewAction === 'approved' ? '' : 'bg-red-600 hover:bg-red-700'}
                >
                  {bulkReviewInProgress
                    ? (bulkReviewAction === 'approved' ? 'Accepting Selected...' : 'Declining Selected...')
                    : (bulkReviewAction === 'approved' ? `Accept Selected (${selectedPendingCount})` : `Decline Selected (${selectedPendingCount})`)}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Review Close Confirmation */}
      <AlertDialog open={showBulkReviewCloseConfirm} onOpenChange={setShowBulkReviewCloseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close Bulk Review?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to close this review wizard? Unsaved step progress will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCloseBulkReviewWizard}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Verification Request</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this verification request? This will:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Remove the verification request permanently</li>
                <li>Revert any substitutions assigned to schedules</li>
                <li>Restore schedules to their original state</li>
                <li>Undo any attendance changes made when approved</li>
              </ul>
              <p className="mt-3 font-semibold text-red-600">This action cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteInProgress}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedRequest && handleDeleteRequest(selectedRequest.request_id)}
              disabled={deleteInProgress}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteInProgress ? "Deleting..." : "Delete Request"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Substitution Validation Warning Dialog */}
      <AlertDialog open={showSubstitutionWarningDialog} onOpenChange={setShowSubstitutionWarningDialog}>
        <AlertDialogContent className="sm:max-w-[500px]">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-full">
                <AlertCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <AlertDialogTitle className="text-xl">
                Missing Required Information
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base mt-2 whitespace-pre-line">
              {substitutionWarningMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setShowSubstitutionWarningDialog(false)}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave Restriction Warning Dialog */}
      <AlertDialog open={leaveRestrictionDialogOpen} onOpenChange={setLeaveRestrictionDialogOpen}>
        <AlertDialogContent className="sm:max-w-[520px] bg-linear-to-br from-white to-orange-50 dark:from-gray-900 dark:to-orange-950/20 border-2 border-orange-200 dark:border-orange-800">
          <AlertDialogHeader>
            <div className="flex flex-col items-center text-center gap-4 mb-2">
              <div className="relative">
                <div className="absolute inset-0 bg-orange-400 dark:bg-orange-600 rounded-full blur-xl opacity-30 animate-pulse"></div>
                <div className="relative p-4 bg-linear-to-br from-orange-100 to-orange-200 dark:from-orange-900/50 dark:to-orange-800/50 rounded-full border-4 border-orange-300 dark:border-orange-700">
                  <AlertCircle className="h-12 w-12 text-orange-600 dark:text-orange-400" />
                </div>
              </div>
              <div>
                <AlertDialogTitle className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  Cannot File Leave Request
                </AlertDialogTitle>
                <div className="h-1 w-24 bg-linear-to-r from-orange-400 to-red-400 rounded-full mx-auto"></div>
              </div>
            </div>
            <AlertDialogDescription className="text-center space-y-4 pt-4">
              <div className="bg-white dark:bg-gray-800/50 rounded-xl p-4 border-2 border-orange-100 dark:border-orange-900/50">
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  {leaveRestrictionMessage.employeeName}
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Must complete <span className="font-bold text-orange-600 dark:text-orange-400">1 year of service</span> before filing leave requests.
                </p>
              </div>
              
              <div className="bg-linear-to-br from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30 rounded-xl p-4 border-2 border-orange-200 dark:border-orange-800">
                <div className="flex items-center justify-center gap-3 mb-2">
                  <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Time Remaining
                  </p>
                </div>
                <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                  {leaveRestrictionMessage.daysRemaining}
                  <span className="text-lg font-normal text-gray-600 dark:text-gray-400 ml-2">
                    {leaveRestrictionMessage.daysRemaining === 1 ? 'day' : 'days'}
                  </span>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  until eligible for leave requests
                </p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2">
                  <span className="text-base">ℹ️</span>
                  <span className="text-left">
                    Other request types (Missed Log, Time Correction, Late Justification) are still available for this employee.
                  </span>
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogAction
              onClick={() => setLeaveRestrictionDialogOpen(false)}
              className="bg-linear-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-semibold px-8 py-6 text-base rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
            >
              I Understand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function EmployeeStats({ employeeId }: { employeeId: number }) {
  const [stats, setStats] = useState<any | null>(null)
  useEffect(() => {
    const y = new Date().getFullYear()
    fetch('/api/verification-requests/stats', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ year: y, employee_id: employeeId })})
      .then(r=>r.json()).then(json=>{
        const row = (json?.results||[])[0]
        setStats(row ? { ...row, max_leaves: row?.max_leaves ?? json?.max_leaves } : null)
      }).catch(()=>setStats(null))
  }, [employeeId])
  if (!stats) return null
  return (
    <div className="rounded-md border p-3 sm:p-4 bg-gray-50 dark:bg-gray-800">
      <div className="text-xs sm:text-sm font-semibold mb-2 sm:mb-3">This Year Summary</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 text-xs sm:text-sm">
        <div>Leaves: <span className="font-bold">{stats.leaves_used}</span> / {stats.max_leaves} (Remaining: {stats.leaves_remaining}) - shared across Verification and Leave Requests</div>
        <div>Late days: <span className="font-bold">{stats.late_days}</span></div>
        <div>Undertime days: <span className="font-bold">{stats.undertime_days}</span></div>
        <div>Absent days: <span className="font-bold">{stats.absent_days}</span></div>
      </div>
    </div>
  )
}
