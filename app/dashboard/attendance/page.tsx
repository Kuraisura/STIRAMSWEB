"use client"

import React, { useState, useEffect, useDeferredValue, startTransition, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MobileDrawer, MobileDrawerContent, MobileDrawerHeader, MobileDrawerTitle } from "@/components/ui/mobile-drawer"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Search, CalendarIcon, Clock, Users, UserCheck, UserX, AlertTriangle, AlertCircle, RefreshCw, X, Calendar, FileText, Filter, ChevronDown, Activity, BookOpen, GraduationCap } from "lucide-react"
import { format, parseISO, parse } from "date-fns"
import { formatInTimeZone } from "date-fns-tz"
import { cn, getPreferredTimeFormat } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { getAttendanceLogs, getAttendanceSummary, getAttendanceSummaryToday, getEmployees, getDepartments, getTeachingSchedulesForEmployee, getExamSchedulesForEmployee, getStaffTypeFilter, getClassSubstitutionsForEmployeeOnDate, getClassSubstitutions } from "@/lib/offline-dashboard-client"
import { canMarkAsAbsent, hasWorkStarted, getCorrectAttendanceStatus, isSunday } from "@/lib/attendance-helpers"
import { getManilaToday } from "@/lib/timezone-utils"
import useSWR from 'swr'
import { FixedSizeList as List, ListChildComponentProps } from 'react-window'
import RFIDConnectionStatus from "@/components/rfid-connection-status"
import { Switch } from "@/components/ui/switch"
import { useLanguage } from "@/lib/language-context"

const attendanceStatuses = ["All Statuses", "on-time", "late"]
const logTypes = ["All Types", "IN", "OUT"]
const staffTypes = ["All Staff", "Teaching", "Non-Teaching"]
const PHILIPPINES_TIMEZONE = "Asia/Manila"

export default function AttendanceLogsPage() {
  const { t } = useLanguage()
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([])
  const [filteredLogs, setFilteredLogs] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const [selectedStatus, setSelectedStatus] = useState("All Statuses")
  const [selectedType, setSelectedType] = useState("All Types")
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [stickToToday, setStickToToday] = useState(true)
  const [selectedStaffType, setSelectedStaffType] = useState("All Staff")
  const [selectedDepartment, setSelectedDepartment] = useState("All Departments")
  const [departments, setDepartments] = useState<any[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const pageSize = 10
  const [sortBy, setSortBy] = useState<"name" | "time">("time")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false) // Changed default to false
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [employees, setEmployees] = useState<any[]>([])
  const [includeAbsences, setIncludeAbsences] = useState(true)
  const [hideNotStarted, setHideNotStarted] = useState(false)
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false)
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting')
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [selectedLogForSchedule, setSelectedLogForSchedule] = useState<any>(null)
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [employeeScheduleData, setEmployeeScheduleData] = useState<{
    teachingSchedules: any[]
    examSchedules: any[]
    substitutionSchedules?: any[]
    attendanceLogs: any[]
  } | null>(null)
  const [stats, setStats] = useState({
    totalEmployees: 0,
    presentToday: 0,
    lateToday: 0,
    absentToday: 0,
    workNotStarted: 0,
    activeStarted: 0,
    undertimeToday: 0,
    adminTimeToday: 0,
  })
  const [kpiModalOpen, setKpiModalOpen] = useState(false)
  const [activeKpiModal, setActiveKpiModal] = useState<'total' | 'onTime' | 'late' | 'absent' | 'undertime' | 'adminTime' | 'workNotStarted'>('total')
  const { toast } = useToast()
  // REMOVED: savedAbsentDates - no longer needed since we don't save absent records from the frontend

  // Auto-refresh for Attendance Logs (configurable interval)
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(false)
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(10) // seconds

  // Real-Time Monitoring State
  const [realtimeStats, setRealtimeStats] = useState({
    onTime: 0,
    late: 0,
    absent: 0,
    onLeave: 0,
    adminTime: 0,
    total: 0
  })
  const [realtimeDayLogs, setRealtimeDayLogs] = useState<any[]>([])
  const [realtimeRecentLogs, setRealtimeRecentLogs] = useState<any[]>([])
  const [realtimeNotLoggedIn, setRealtimeNotLoggedIn] = useState<any[]>([]) // Employees without IN log today
  const [realtimeNotLoggedOut, setRealtimeNotLoggedOut] = useState<any[]>([]) // Employees with IN but no OUT
  const [realtimeModalOpen, setRealtimeModalOpen] = useState(false)
  const [activeRealtimeMetric, setActiveRealtimeMetric] = useState<'onTime' | 'late' | 'absent' | 'onLeave' | 'total'>('onTime')
  const [realtimeLoading, setRealtimeLoading] = useState(true)
  const [realtimeLastUpdate, setRealtimeLastUpdate] = useState<Date>(new Date())
  const realtimeIntervalRef = useRef<NodeJS.Timeout>()
  // Employees involved in approved substitutions for currently selected date
  const [substitutionEmployeeIds, setSubstitutionEmployeeIds] = useState<Set<number>>(new Set())
  
  // Employee Profile Modal State
  const [employeeProfileOpen, setEmployeeProfileOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null)
  const [employeeSchedules, setEmployeeSchedules] = useState<{
    classSchedules: any[]
    examSchedules: any[]
    substitutionSchedules?: any[]
    staffType?: string
    scheduleTimeIn?: string | null
    scheduleTimeOut?: string | null
    restDay?: boolean
    effectiveSchedule?: Array<{ start: string; end: string; label: string }>
  } | null>(null)
  const [loadingEmployeeSchedules, setLoadingEmployeeSchedules] = useState(false)
  
  // Holidays state
  const [holidays, setHolidays] = useState<any[]>([])

  const dateKey = selectedDate ? formatInTimeZone(selectedDate, PHILIPPINES_TIMEZONE, 'yyyy-MM-dd') : undefined
  // Always fetch fresh data from local API - disable caching
  const { data: swrLogs, isLoading: swrLogsLoading, mutate: mutateLogs } = useSWR(
    ['attendanceLogs', dateKey],
    async ([, d]) => {
      console.log('[Attendance] Fetching logs directly from local API for date:', d)
      return await getAttendanceLogs(d, 1000)
    },
    { 
      revalidateOnFocus: false, 
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      dedupingInterval: 0, // Disable deduplication
      suspense: false,
      refreshInterval: 0, // Disable automatic polling (we use manual polling)
      keepPreviousData: true // Keep previous data while refreshing (no loading flash)
    }
  )
  // Load approved substitutions for selected date and cache all involved employee IDs
  useEffect(() => {
    const loadSubs = async () => {
      if (!dateKey) { setSubstitutionEmployeeIds(new Set()); return }
      try {
        const subs = await getClassSubstitutions({ date: dateKey, status: 'approved' })
        const ids = new Set<number>()
        ;(subs || []).forEach((s: any) => {
          if (s?.original_employee_id) ids.add(s.original_employee_id)
          if (s?.substitute_employee_id) ids.add(s.substitute_employee_id)
        })
        setSubstitutionEmployeeIds(ids)
      } catch (e) {
        console.error('[Attendance] Error loading substitutions for date', dateKey, e)
        setSubstitutionEmployeeIds(new Set())
      }
    }
    loadSubs()
  }, [dateKey])
  const { data: swrSummary, isLoading: swrSummaryLoading, mutate: mutateSummary } = useSWR(
    ['attendanceSummary', dateKey],
    async ([, d]) => {
      console.log('[Attendance] Fetching summary directly from local API for date:', d)
      return await getAttendanceSummary(d)
    },
    { 
      revalidateOnFocus: false, 
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      dedupingInterval: 0,
      suspense: false,
      refreshInterval: 0, // Disable automatic polling (we use manual polling)
      keepPreviousData: true // Keep previous data while refreshing (no loading flash)
    }
  )
  const getStaffFilter = (): 'Teaching' | 'Non-Teaching' | null => {
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('rams_user') : null
    const currentUser = userStr ? JSON.parse(userStr) : null

    return getStaffTypeFilter(currentUser?.email, currentUser?.role)
  }

  // Get current user to use in SWR key
  const userStr = typeof window !== 'undefined' ? localStorage.getItem('rams_user') : null
  const currentUser = userStr ? JSON.parse(userStr) : null
  const currentUserEmail = currentUser?.email || 'unknown'
  const currentUserName = currentUser?.name || 'unknown'

  const { data: swrEmployees, mutate: mutateEmployees, isLoading: swrEmpLoading } = useSWR(
    ['employees', currentUserName], // Include user name in key to refetch when user changes
    async () => {
      console.log('[Attendance] Fetching employees directly from local API')
      const staffTypeFilter = getStaffFilter()
      console.log('[Attendance] Staff filter for', currentUserName, ':', staffTypeFilter)
      return await getEmployees(true, true, false, staffTypeFilter) // Get all employees including those whose work hasn't started
    },
    { 
      revalidateOnFocus: false, 
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      dedupingInterval: 0,
      suspense: false,
      refreshInterval: 0,
      keepPreviousData: true // Keep previous data while refreshing (no loading flash)
    }
  )

  // Cache for employee scheduled days: Map<employeeId, Set<dayOfWeek>>
  // dayOfWeek: 1=Monday, 2=Tuesday, ..., 6=Saturday, 0=Sunday (but Sunday should be excluded)
  const [employeeScheduledDays, setEmployeeScheduledDays] = useState<Map<number, Set<number>>>(new Map())
  const [dailyExpectedScheduleMap, setDailyExpectedScheduleMap] = useState<Map<number, {
    expectedIn: number | null
    expectedOut: number | null
    source: 'exam' | 'class' | 'non_teaching' | 'none'
  }>>(new Map())

  // Fetch scheduled days for all employees when employees list changes
  useEffect(() => {
    if (!swrEmployees || swrEmployees.length === 0) {
      setEmployeeScheduledDays(new Map())
      return
    }

    const fetchScheduledDays = async () => {
      const scheduleMap = new Map<number, Set<number>>()
      
      for (const employee of swrEmployees) {
        if (!employee.employee_id) continue
        
        const scheduledDays = new Set<number>()
        
        try {
          // Get teaching schedules
          const teachingSchedules = await getTeachingSchedulesForEmployee(employee.employee_id)
          if (teachingSchedules && Array.isArray(teachingSchedules)) {
            teachingSchedules.forEach((sched: any) => {
              if (sched.day_of_week && sched.day_of_week >= 1 && sched.day_of_week <= 6) {
                scheduledDays.add(sched.day_of_week)
              }
            })
          }
          
          // Get exam schedules
          const examSchedules = await getExamSchedulesForEmployee(employee.employee_id)
          if (examSchedules && Array.isArray(examSchedules)) {
            examSchedules.forEach((sched: any) => {
              if (sched.day_of_week && sched.day_of_week >= 1 && sched.day_of_week <= 6) {
                scheduledDays.add(sched.day_of_week)
              }
            })
          }
        } catch (error) {
          console.error(`[Attendance] Error fetching schedules for employee ${employee.employee_id}:`, error)
        }
        
        if (scheduledDays.size > 0) {
          scheduleMap.set(employee.employee_id, scheduledDays)
        }
      }
      
      setEmployeeScheduledDays(scheduleMap)
      console.log('[Attendance] Loaded scheduled days for employees:', Array.from(scheduleMap.entries()).map(([id, days]) => ({
        employee_id: id,
        days: Array.from(days).sort()
      })))
    }

    fetchScheduledDays()
  }, [swrEmployees])

  useEffect(() => {
    let cancelled = false

    const buildExpectedScheduleMap = async () => {
      try {
        const nextMap = new Map<number, {
          expectedIn: number | null
          expectedOut: number | null
          source: 'exam' | 'class' | 'non_teaching' | 'none'
        }>()
        const targetDate = dateKey || getManilaToday()
        const targetDateObj = new Date(`${targetDate}T00:00:00+08:00`)
        const jsDay = targetDateObj.getDay()
        const scheduleDay = jsDay === 0 ? null : jsDay

        const toNumericDay = (val: any): number | null => {
          if (typeof val === 'number') return val
          if (typeof val === 'string') {
            const upper = val.trim().toUpperCase()
            const map: Record<string, number> = {
              MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6, SUNDAY: 0,
              MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 0,
            }
            if (upper in map) return map[upper]
            const asNum = Number(val)
            return Number.isNaN(asNum) ? null : asNum
          }
          return null
        }

        const getBlockRange = (schedules: any[]) => {
          const starts = schedules
            .map((s) => getMinutesFromTimeString(s?.time_start))
            .filter((value): value is number => value !== null)
          const ends = schedules
            .map((s) => getMinutesFromTimeString(s?.time_end))
            .filter((value): value is number => value !== null)
          if (starts.length === 0 || ends.length === 0) return { expectedIn: null, expectedOut: null }
          return {
            expectedIn: Math.min(...starts),
            expectedOut: Math.max(...ends),
          }
        }

        await Promise.all((swrEmployees || []).map(async (emp: any) => {
          const empId = Number(emp?.employee_id)
          if (!Number.isFinite(empId) || empId <= 0) return

          const staffType = String(emp?.staff_type || '').toLowerCase()
          if (staffType === 'non-teaching') {
            nextMap.set(empId, {
              expectedIn: getMinutesFromTimeString(emp?.schedule_time_in),
              expectedOut: getMinutesFromTimeString(emp?.schedule_time_out),
              source: 'non_teaching',
            })
            return
          }

          if (!scheduleDay) {
            nextMap.set(empId, { expectedIn: null, expectedOut: null, source: 'none' })
            return
          }

          try {
            const [examSchedules, classSchedules] = await Promise.all([
              getExamSchedulesForEmployee(empId),
              getTeachingSchedulesForEmployee(empId),
            ])

            const dayExamSchedules = (examSchedules || []).filter((s: any) => {
              const examDate = String(s?.exam_date || '').slice(0, 10)
              if (examDate && examDate === targetDate) return true
              return toNumericDay(s?.day_of_week) === scheduleDay
            })
            const dayClassSchedules = (classSchedules || []).filter((s: any) => toNumericDay(s?.day_of_week) === scheduleDay)

            if (dayExamSchedules.length > 0) {
              nextMap.set(empId, { ...getBlockRange(dayExamSchedules), source: 'exam' })
              return
            }
            if (dayClassSchedules.length > 0) {
              nextMap.set(empId, { ...getBlockRange(dayClassSchedules), source: 'class' })
              return
            }

            nextMap.set(empId, { expectedIn: null, expectedOut: null, source: 'none' })
          } catch {
            nextMap.set(empId, { expectedIn: null, expectedOut: null, source: 'none' })
          }
        }))

        if (!cancelled) setDailyExpectedScheduleMap(nextMap)
      } catch {
        if (!cancelled) setDailyExpectedScheduleMap(new Map())
      }
    }

    buildExpectedScheduleMap()
    return () => {
      cancelled = true
    }
  }, [dateKey, swrEmployees])

  // Always sync fresh data from local API (via SWR) to local state
  useEffect(() => {
    if (swrLogs) {
      console.log('[Attendance] Syncing logs from local API to state:', swrLogs.length, 'logs')
      setAttendanceLogs(Array.isArray(swrLogs) ? swrLogs : [])
      setLastUpdate(new Date())
    } else if (!swrLogsLoading) {
      setAttendanceLogs([])
    }
    if (swrSummary) {
      console.log('[Attendance] Syncing summary from local API to state')
      // Compute Admin Time count from logs for the same day and staff filter
      let adminCount = 0
      try {
        const staffTypeFilter = getStaffFilter()
        const srcLogs = Array.isArray(swrLogs) ? swrLogs : []
        adminCount = srcLogs.filter((l: any) => {
          const status = (l?.attendance_status || '').toString().toLowerCase()
          const isAdmin = l?.is_admin_time || l?.admin_time || status === 'admin_time' || status === 'admin-time'
          if (!isAdmin) return false
          if (staffTypeFilter) {
            return (l?.employees?.staff_type === staffTypeFilter)
          }
          return true
        }).length
      } catch {}

      setStats({
        totalEmployees: Number(swrSummary?.totalEmployees) || 0,
        presentToday: Number(swrSummary?.presentToday) || 0,
        lateToday: Number(swrSummary?.lateToday) || 0,
        absentToday: Number(swrSummary?.absentToday) || 0,
        workNotStarted: Number(swrSummary?.workNotStarted) || 0,
        activeStarted: Number(swrSummary?.activeStarted) || 0,
        undertimeToday: Number(swrSummary?.undertimeToday) || 0,
        adminTimeToday: adminCount || 0,
      })
    } else if (!swrSummaryLoading) {
      setStats({ totalEmployees: 0, presentToday: 0, lateToday: 0, absentToday: 0, workNotStarted: 0, activeStarted: 0, undertimeToday: 0, adminTimeToday: 0 })
    }
    if (swrEmployees) {
      console.log('[Attendance] Syncing employees from local API to state:', swrEmployees.length, 'employees')
      setEmployees(Array.isArray(swrEmployees) ? swrEmployees : [])
    } else if (!swrEmpLoading) {
      setEmployees([])
    }
    setIsLoading(swrLogsLoading || swrSummaryLoading || swrEmpLoading)
  }, [swrLogs, swrSummary, swrEmployees, swrLogsLoading, swrSummaryLoading, swrEmpLoading])

  // Load departments on mount
  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const depts = await getDepartments()
        // Also get unique departments from employees as fallback
        const employeeDepts = [...new Set((swrEmployees || []).map((e: any) => e.department).filter(Boolean))]
        
        // Combine database departments and employee departments
        const allDepts = [...new Set([
          ...depts.map(d => d.name),
          ...employeeDepts
        ])].sort()
        
        setDepartments(allDepts)
      } catch (error) {
        console.error("Error loading departments:", error)
        // Fallback to employee departments only
        const employeeDepts = [...new Set((swrEmployees || []).map((e: any) => e.department).filter(Boolean))].sort()
        setDepartments(employeeDepts)
      }
    }
    
    if (swrEmployees) {
      loadDepartments()
    }
  }, [swrEmployees])
  
  // Fetch holidays on component mount
  useEffect(() => {
    fetchHolidays()
  }, [])

  useEffect(() => {
    if (!stickToToday) return
    const interval = setInterval(() => {
    }, 30000)
    return () => clearInterval(interval)
  }, [stickToToday])

  useEffect(() => {
    if (!stickToToday) return
    const timer = setInterval(() => {
      try {
        const todayStr = format(new Date(), "yyyy-MM-dd")
        const selStr = format(selectedDate, "yyyy-MM-dd")
        if (todayStr !== selStr) {
          setSelectedDate(new Date())
        }
      } catch {}
    }, 60000)
    return () => clearInterval(timer)
  }, [selectedDate, stickToToday])

  useEffect(() => {
    // filterLogs is async now (it may fetch exam schedules) — call and handle errors
    filterLogs().catch(err => console.error('[Attendance] Error filtering logs:', err))
  }, [deferredSearchTerm, selectedStatus, selectedType, selectedDate, selectedStaffType, selectedDepartment, includeAbsences, hideNotStarted, employees, attendanceLogs, sortBy, sortDir, page, employeeScheduledDays])

  useEffect(() => {
    // Force revalidation to fetch fresh data from local API when date changes
    console.log('[Attendance] Date changed, forcing fresh fetch from local API')
    mutateLogs(undefined, { revalidate: true })
    mutateSummary(undefined, { revalidate: true })
    // Date changed - data will be reloaded automatically
  }, [selectedDate, mutateLogs, mutateSummary])

  // Listen for start_date changes from employee management
  useEffect(() => {
    const handleStartDateChanged = () => {
      console.log('[Attendance] Employee start_date changed, refreshing data...')
      // Refresh all attendance-related data
      mutateLogs()
      mutateSummary()
      mutateEmployees()
      setLastUpdate(new Date())
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('employee-start-date-changed', handleStartDateChanged)
      return () => {
        window.removeEventListener('employee-start-date-changed', handleStartDateChanged)
      }
    }
  }, [mutateLogs, mutateSummary, mutateEmployees])

  // Local polling for attendance logs (offline PostgreSQL mode)
  useEffect(() => {
    let cancelled = false
    setRealtimeStatus('connected')
    setIsRealtimeConnected(true)

    if (!autoRefreshEnabled) {
      return () => {
        setRealtimeStatus('disconnected')
        setIsRealtimeConnected(false)
      }
    }

    const pollingInterval = setInterval(async () => {
      if (cancelled) return
      setIsBackgroundRefreshing(true)
      try {
        await Promise.all([
          mutateLogs(undefined, { revalidate: true }),
          mutateSummary(undefined, { revalidate: true }),
          mutateEmployees(undefined, { revalidate: true })
        ])
        setLastUpdate(new Date())
      } catch (error) {
        console.error('[Attendance] Error during background refresh:', error)
      } finally {
        setTimeout(() => {
          setIsBackgroundRefreshing(false)
        }, 500)
      }
    }, 10000)

    return () => {
      cancelled = true
      clearInterval(pollingInterval)
      setRealtimeStatus('disconnected')
      setIsRealtimeConnected(false)
    }
  }, [mutateEmployees, mutateLogs, mutateSummary, autoRefreshEnabled])

  // Auto-refresh Attendance Logs (configurable interval)
  useEffect(() => {
    if (!autoRefreshLogs) return

    const intervalMs = autoRefreshInterval * 1000
    console.log(`[Attendance] Auto-refresh enabled for Attendance Logs (${autoRefreshInterval}s interval)`)
    const interval = setInterval(async () => {
      console.log('[Attendance] Auto-refreshing logs...')
      await mutateLogs()
      await mutateSummary()
      setLastUpdate(new Date())
    }, intervalMs)

    return () => {
      console.log('[Attendance] Auto-refresh disabled')
      clearInterval(interval)
    }
  }, [autoRefreshLogs, autoRefreshInterval, mutateLogs, mutateSummary])

  // Real-Time Monitoring Functions
  const fetchRealtimeData = async () => {
    try {
      setRealtimeLoading(true)
      
      // Get current user from localStorage
      const userStr = localStorage.getItem('rams_user')
      const currentUser = userStr ? JSON.parse(userStr) : null
      
      console.log('[Real-Time] Current user:', currentUser?.name, '| Email:', currentUser?.email)
      
      const today = format(new Date(), 'yyyy-MM-dd')
      
      // Fetch all active employees (including those whose work hasn't started yet)
      const staffTypeFilter = getStaffFilter()
      console.log('[Real-Time] Staff filter:', staffTypeFilter)
      let allEmployees = await getEmployees(false, false, false, staffTypeFilter) // Staff type filtering handled by database query
      console.log('[Real-Time] Fetched employees:', allEmployees.length, '| Sample:', allEmployees.slice(0, 2).map(e => ({ name: e.full_name, staff_type: e.staff_type })))

      // Real-Time Monitoring: this view should focus on Teaching staff only.
      allEmployees = (allEmployees || []).filter((e: any) => String(e?.staff_type || '').toLowerCase() === 'teaching')
      
      const allLogs = await getAttendanceLogs(today, 2000)
      setRealtimeDayLogs(allLogs || [])
      const inLogs = (allLogs || []).filter((log: any) => String(log?.log_type || '').toUpperCase() === 'IN' && !isAbsentLog(log))
      const outLogs = (allLogs || []).filter((log: any) => String(log?.log_type || '').toUpperCase() === 'OUT')
      
      // Manually join IN logs with employees data
      const inLogsWithEmployees = (inLogs || []).map(log => {
        const employee = allEmployees.find((emp: any) => emp.employee_id === log.employee_id)
        return {
          ...log,
          employees: employee || null
        }
      })
      
      // Manually join OUT logs with employees data
      const outLogsWithEmployees = (outLogs || []).map(log => {
        const employee = allEmployees.find((emp: any) => emp.employee_id === log.employee_id)
        return {
          ...log,
          employees: employee || null
        }
      })
      
      let typedInLogs = inLogsWithEmployees
      let typedOutLogs = outLogsWithEmployees
      
      // Keep log visibility aligned with strict staff ownership filter.
      if (staffTypeFilter) {
        typedInLogs = typedInLogs.filter(l => l.employees?.staff_type === staffTypeFilter)
        typedOutLogs = typedOutLogs.filter(l => l.employees?.staff_type === staffTypeFilter)
      }

      // Force Teaching-only in real-time lists/stats.
      typedInLogs = typedInLogs.filter(l => String(l?.employees?.staff_type || '').toLowerCase() === 'teaching')
      typedOutLogs = typedOutLogs.filter(l => String(l?.employees?.staff_type || '').toLowerCase() === 'teaching')
      
      // Calculate stats from the same set shown in Recent Attendance Logs (IN + OUT)
      const statusLogs = [...typedInLogs, ...typedOutLogs]
      const absentLogs = (allLogs || []).filter((l: any) => {
        if (!isAbsentLog(l)) return false
        if (staffTypeFilter) return l?.employees?.staff_type === staffTypeFilter
        return true
      })

      const onTimeCount = statusLogs.filter(l => {
        const status = (l?.attendance_status || '').toString().toLowerCase()
        const isAdmin = l?.is_admin_time || l?.admin_time || status === 'admin_time' || status === 'admin-time'
        return !l.is_late && !isAdmin && (status === 'present' || status === 'on_time' || status === 'on-time')
      }).length

      const onLeaveEmployeeIds = new Set(
        (allLogs || [])
          .filter((log: any) => isApprovedLeaveLog(log))
          .map((log: any) => Number(log?.employee_id))
          .filter((id: number) => Number.isFinite(id))
      )

      const newStats = {
        onTime: onTimeCount,
        late: statusLogs.filter(l => l.is_late).length,
        absent: absentLogs.length,
        onLeave: onLeaveEmployeeIds.size,
        adminTime: statusLogs.filter(l => {
          const status = (l?.attendance_status || '').toString().toLowerCase()
          return l?.is_admin_time || l?.admin_time || status === 'admin_time' || status === 'admin-time'
        }).length,
        total: statusLogs.length
      }
      
      // Build set of employees with schedule today from preloaded map.
      const todayJsDay = new Date().getDay()
      const todayScheduleDay = todayJsDay === 0 ? null : todayJsDay
      const employeesWithScheduleToday = new Set<number>()
      if (todayScheduleDay !== null) {
        employeeScheduledDays.forEach((days, employeeId) => {
          if (days.has(todayScheduleDay)) {
            employeesWithScheduleToday.add(employeeId)
          }
        })
      }
      
      // Find employees who haven't logged IN yet
      const employeesWithInLog = new Set(typedInLogs.map(l => l.employee_id))
      const notLoggedIn = allEmployees.filter((emp: any) => {
        // Exclude employees who already logged in
        if (employeesWithInLog.has(emp.employee_id)) return false
        
        // For Part-Time employees, only show them if they have a class schedule today
        if (emp.employment_status === 'Part Time') {
          return employeesWithScheduleToday.has(emp.employee_id)
        }
        
        return true
      })
      
      console.log('[Real-Time] Total employees:', allEmployees.length)
      console.log('[Real-Time] Employees with IN log:', employeesWithInLog.size)
      console.log('[Real-Time] Employees NOT logged in yet (excluding Part Time):', notLoggedIn.length)
      
      // Find employees who logged IN but haven't logged OUT yet
      const employeesWithOutLog = new Set(typedOutLogs.map(l => l.employee_id))
      const notLoggedOut = typedInLogs
        .filter(l => !employeesWithOutLog.has(l.employee_id))
        .map(l => l.employees)
        .filter((emp, index, self) => {
          if (!emp) return false
          // Remove duplicates
          if (self.findIndex(e => e?.employee_id === emp?.employee_id) !== index) return false
          // For Part-Time employees, only show if they have a schedule today
          if (emp.employment_status === 'Part Time') {
            return employeesWithScheduleToday.has(emp.employee_id)
          }
          return true
        })
      
      console.log('[Real-Time] Employees with OUT log:', employeesWithOutLog.size)
      console.log('[Real-Time] Employees NOT logged out yet (excluding Part Time):', notLoggedOut.length)
      
      // Combine IN and OUT logs for recent activity display, sorted by time descending
      const allRecentLogs = [...typedInLogs, ...typedOutLogs]
        .sort((a, b) => {
          const timeA = a.log_time || ''
          const timeB = b.log_time || ''
          return timeB.localeCompare(timeA)
        })
      
      setRealtimeStats(newStats)
      setRealtimeRecentLogs(allRecentLogs.slice(0, 20))
      setRealtimeNotLoggedIn(notLoggedIn)
      setRealtimeNotLoggedOut(notLoggedOut)
      setRealtimeLastUpdate(new Date())
    } catch (error: any) {
      console.error('Error fetching realtime data:', error)
    } finally {
      setRealtimeLoading(false)
    }
  }

  useEffect(() => {
    fetchRealtimeData()
    realtimeIntervalRef.current = setInterval(() => {
      fetchRealtimeData()
    }, 10000)
    return () => {
      if (realtimeIntervalRef.current) clearInterval(realtimeIntervalRef.current)
    }
  }, [employeeScheduledDays])

  useEffect(() => {
    const handleRealtimeEnter = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return
      if (realtimeModalOpen) {
        event.preventDefault()
        setRealtimeModalOpen(false)
      } else if (kpiModalOpen) {
        event.preventDefault()
        setKpiModalOpen(false)
      }
    }

    window.addEventListener('keydown', handleRealtimeEnter)
    return () => window.removeEventListener('keydown', handleRealtimeEnter)
  }, [realtimeModalOpen, kpiModalOpen])

  const getTodayScheduleStatus = (employee: any): { label: string; badgeClass: string } => {
    const context = getRealtimeDayContext(employee)
    return { label: context.label, badgeClass: context.badgeClass }
  }

  const getRealtimeLogStatusLabel = (log: any): string => {
    if (!log) return 'On-Time'
    const status = String(log?.attendance_status || '').toLowerCase()
    if (log?.is_admin_time || status.includes('admin')) return 'Admin Time'
    if (isApprovedLeaveLog(log)) return 'Approved Leave'
    if (log?.is_late || status.includes('late')) return 'Late'
    if (log?.is_early_out || status.includes('undertime')) return 'Undertime'
    if (status === 'absent') return 'Absent'
    return 'On-Time'
  }

  const getRealtimeLogStatusClass = (label: string): string => {
    switch (label) {
      case 'Admin Time':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200'
      case 'Approved Leave':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200'
      case 'Late':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
      case 'Undertime':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200'
      case 'Absent':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200'
      default:
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
    }
  }

  // Handle employee click to show profile with schedules
  const handleEmployeeClick = async (employee: any) => {
    setSelectedEmployee(employee)
    setEmployeeProfileOpen(true)
    setLoadingEmployeeSchedules(true)
    setEmployeeSchedules(null)

    try {
      const normalizedStaffType = String(employee?.staff_type || '').trim().toLowerCase()
      if (normalizedStaffType === 'non-teaching') {
        setEmployeeSchedules({
          classSchedules: [],
          examSchedules: [],
          substitutionSchedules: [],
          staffType: 'Non-Teaching',
          scheduleTimeIn: employee?.schedule_time_in || null,
          scheduleTimeOut: employee?.schedule_time_out || null,
        })
        return
      }

      const today = format(new Date(), 'yyyy-MM-dd')
      const jsDay = new Date().getDay()
      const scheduleDay = jsDay === 0 ? null : jsDay

      if (!scheduleDay) {
        setEmployeeSchedules({
          classSchedules: [],
          examSchedules: [],
          substitutionSchedules: [],
          staffType: employee?.staff_type || 'Teaching',
          scheduleTimeIn: null,
          scheduleTimeOut: null,
          restDay: true,
        })
        return
      }

      const [allClassSchedules, allExamSchedules, substitutionSchedules] = await Promise.all([
        getTeachingSchedulesForEmployee(employee.employee_id),
        getExamSchedulesForEmployee(employee.employee_id),
        getClassSubstitutionsForEmployeeOnDate(employee.employee_id, today),
      ])

      const classSchedules = (allClassSchedules || []).filter((sched: any) => {
        if (!scheduleDay) return false
        return Number(sched?.day_of_week) === scheduleDay
      })

      const examSchedules = (allExamSchedules || []).filter((sched: any) => {
        if (sched?.exam_date && String(sched.exam_date) === today) return true
        if (!scheduleDay) return false
        return Number(sched?.day_of_week) === scheduleDay
      })

      const toMinutes = (value?: string | null): number | null => {
        if (!value) return null
        const [h, m] = String(value).split(':').map((part) => parseInt(part || '0', 10))
        if (!Number.isFinite(h) || !Number.isFinite(m)) return null
        return (h * 60) + m
      }

      const toInterval = (startRaw?: string | null, endRaw?: string | null): { start: number; end: number } | null => {
        const start = toMinutes(startRaw)
        const end = toMinutes(endRaw)
        if (start === null || end === null || end <= start) return null
        return { start, end }
      }

      const mergeIntervals = (intervals: Array<{ start: number; end: number }>) => {
        if (!intervals.length) return [] as Array<{ start: number; end: number }>
        const sorted = [...intervals].sort((a, b) => a.start - b.start)
        const merged: Array<{ start: number; end: number }> = [sorted[0]]
        for (let i = 1; i < sorted.length; i++) {
          const current = sorted[i]
          const last = merged[merged.length - 1]
          if (current.start <= last.end) {
            last.end = Math.max(last.end, current.end)
          } else {
            merged.push({ ...current })
          }
        }
        return merged
      }

      const subtractIntervals = (
        base: Array<{ start: number; end: number }>,
        removals: Array<{ start: number; end: number }>
      ) => {
        let result = [...base]
        for (const rem of removals) {
          const next: Array<{ start: number; end: number }> = []
          for (const b of result) {
            if (rem.end <= b.start || rem.start >= b.end) {
              next.push(b)
              continue
            }
            if (rem.start > b.start) next.push({ start: b.start, end: rem.start })
            if (rem.end < b.end) next.push({ start: rem.end, end: b.end })
          }
          result = next
        }
        return result.filter((r) => r.end > r.start)
      }

      const toDisplay = (minutes: number) => {
        const hh = Math.floor(minutes / 60)
        const mm = minutes % 60
        const dateTmp = new Date()
        dateTmp.setHours(hh, mm, 0, 0)
        return format(dateTmp, 'h:mm a')
      }

      const baseIntervals = mergeIntervals([
        ...(classSchedules || []).map((s: any) => toInterval(s?.time_start, s?.time_end)).filter(Boolean),
        ...(examSchedules || []).map((s: any) => toInterval(s?.time_start, s?.time_end)).filter(Boolean),
      ] as Array<{ start: number; end: number }>)

      const removedIntervals = (substitutionSchedules || [])
        .filter((s: any) => Number(s?.original_employee_id) === Number(employee.employee_id))
        .map((s: any) => toInterval(s?.start_time, s?.end_time))
        .filter(Boolean) as Array<{ start: number; end: number }>

      const addedIntervals = (substitutionSchedules || [])
        .filter((s: any) => Number(s?.substitute_employee_id) === Number(employee.employee_id))
        .map((s: any) => toInterval(s?.start_time, s?.end_time))
        .filter(Boolean) as Array<{ start: number; end: number }>

      const remainingIntervals = subtractIntervals(baseIntervals, removedIntervals)
      const effectiveIntervals = mergeIntervals([...remainingIntervals, ...addedIntervals])

      const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
        a.start < b.end && b.start < a.end

      const effectiveSchedule = effectiveIntervals.map((interval) => {
        const isSub = addedIntervals.some((sub) => overlaps(interval, sub))
        return {
          start: toDisplay(interval.start),
          end: toDisplay(interval.end),
          label: isSub ? 'Substitution' : 'Schedule',
        }
      })

      setEmployeeSchedules({
        classSchedules: classSchedules || [],
        examSchedules: examSchedules || [],
        substitutionSchedules: substitutionSchedules || [],
        staffType: employee?.staff_type || 'Teaching',
        scheduleTimeIn: employee?.schedule_time_in || null,
        scheduleTimeOut: employee?.schedule_time_out || null,
        restDay: false,
        effectiveSchedule,
      })
    } catch (error) {
      console.error('[Employee Profile] Error loading schedules:', error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load employee schedules"
      })
    } finally {
      setLoadingEmployeeSchedules(false)
    }
  }

  const loadData = async (silent = false) => {
    try {
      if (!silent) {
        setIsLoading(true)
      }
      setIsRefreshing(true)
      
      const dateStr = selectedDate ? formatInTimeZone(selectedDate, PHILIPPINES_TIMEZONE, 'yyyy-MM-dd') : undefined
      console.log('[Attendance Page] Loading data directly from local API for date:', dateStr)
      
      // Get current user from localStorage
      const userStr = localStorage.getItem('rams_user')
      const currentUser = userStr ? JSON.parse(userStr) : null
      
      // Force fresh fetch from local API - bypass cache
      const staffTypeFilter = getStaffFilter()
      const [logs, summary, emps] = await Promise.all([
        getAttendanceLogs(dateStr, 1000),
        getAttendanceSummary(dateStr),
        getEmployees(true, true, false, staffTypeFilter), // Get all employees including those whose work hasn't started
      ])

      console.log('[Attendance Page] Loaded logs:', logs?.length, 'logs')
      console.log('[Attendance Page] Sample log data:', logs?.[0])
      console.log('[Attendance Page] Summary:', summary)

      // Staff type filtering is now handled by the database query via staffTypeFilter parameter
      setEmployees(emps || [])
      mutateSummary(summary, false)
      mutateEmployees(emps, false)
      setAttendanceLogs(logs || [])
      // Compute Admin Time count from freshly loaded logs
      const adminFromLoad = (logs || []).filter((l: any) => {
        const status = (l?.attendance_status || '').toString().toLowerCase()
        return l?.is_admin_time || l?.admin_time || status === 'admin_time' || status === 'admin-time'
      }).length
      setStats({
        totalEmployees: Number(summary?.totalEmployees) || 0,
        presentToday: Number(summary?.presentToday) || 0,
        lateToday: Number(summary?.lateToday) || 0,
        absentToday: Number(summary?.absentToday) || 0,
        workNotStarted: Number(summary?.workNotStarted) || 0,
        activeStarted: Number(summary?.activeStarted) || 0,
        undertimeToday: Number(summary?.undertimeToday) || 0,
        adminTimeToday: adminFromLoad || 0,
      })
      setLastUpdate(new Date())
      
      if (!silent) {
        toast({
          title: t('attendance.data_updated'),
          description: `${t('attendance.loaded_logs')} ${logs?.length || 0} ${t('attendance.attendance_logs')}`,
        })
      }
    } catch (error) {
      console.error("Error loading attendance data:", error)
      if (!silent) {
        toast({
          title: t('attendance.error'),
          description: t('attendance.load_failed'),
          variant: "destructive",
        })
      }
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  const deriveLogDate = (log: any): string => {
    if (!log) return ''
    try {
      if (log.date != null) {
        const rawDate = String(log.date)
        if (rawDate.length >= 10) {
          const datePart = rawDate.substring(0, 10)
          if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart
        }

        const parsedDate = new Date(rawDate)
        if (!isNaN(parsedDate.getTime())) {
          return formatInTimeZone(parsedDate, PHILIPPINES_TIMEZONE, 'yyyy-MM-dd')
        }
      }
      if (log.log_time && typeof log.log_time === 'string') {
        const parsed = parseISO(log.log_time)
        if (!isNaN(parsed.getTime())) {
          return formatInTimeZone(parsed, PHILIPPINES_TIMEZONE, 'yyyy-MM-dd')
        }
      }
      if (log.local_date && typeof log.local_date === 'string') {
        const parsed = parseISO(log.local_date)
        if (!isNaN(parsed.getTime())) {
          return formatInTimeZone(parsed, PHILIPPINES_TIMEZONE, 'yyyy-MM-dd')
        }
      }
      if (log.created_at && typeof log.created_at === 'string') {
        const parsed = parseISO(log.created_at)
        if (!isNaN(parsed.getTime())) {
          return formatInTimeZone(parsed, PHILIPPINES_TIMEZONE, 'yyyy-MM-dd')
        }
      }
    } catch (error) {
      console.error('[Attendance] Error deriving log date:', error, log)
    }
    return ''
  }

  const isAbsentLog = (log: any): boolean => {
    const status = String(log?.attendance_status || '').toLowerCase()
    return status === 'absent'
  }

  const isTimedAttendanceLog = (log: any): boolean => {
    const logType = String(log?.log_type || '').toUpperCase()
    if (logType !== 'IN' && logType !== 'OUT') return false
    if (isAbsentLog(log)) return false
    return !!log?.log_time
  }

  function getMinutesFromTimeString(timeValue: string | null | undefined): number | null {
    const raw = String(timeValue || '').trim()
    if (!raw) return null
    const match = raw.match(/^(\d{1,2}):(\d{2})/)
    if (!match) return null
    const hh = Number(match[1])
    const mm = Number(match[2])
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
    return (hh * 60) + mm
  }

  function getLogTimeMinutes(log: any): number | null {
    if (!log?.log_time) return null
    try {
      const parsed = new Date(log.log_time)
      if (Number.isNaN(parsed.getTime())) return null
      const hh = Number(formatInTimeZone(parsed, PHILIPPINES_TIMEZONE, 'HH'))
      const mm = Number(formatInTimeZone(parsed, PHILIPPINES_TIMEZONE, 'mm'))
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
      return (hh * 60) + mm
    } catch {
      return null
    }
  }

  function formatMinutesTo12Hour(minutes: number | null): string {
    if (minutes === null || !Number.isFinite(minutes)) return 'N/A'
    const normalized = Math.max(0, Math.min(1439, Math.round(minutes)))
    const hh24 = Math.floor(normalized / 60)
    const mm = normalized % 60
    const period = hh24 >= 12 ? 'PM' : 'AM'
    const hh12 = (hh24 % 12) || 12
    return `${String(hh12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${period}`
  }

  const shouldHideLogTime = (log: any): boolean => {
    const status = String(log?.attendance_status || '').toLowerCase()
    return status === 'absent' || status === 'not-started'
  }

  const dayKey = selectedDate ? formatInTimeZone(selectedDate, PHILIPPINES_TIMEZONE, 'yyyy-MM-dd') : ''
  const { presentIdsMemo, lateIdsMemo } = React.useMemo(() => {
    if (!dayKey || !Array.isArray(attendanceLogs)) {
      return { presentIdsMemo: new Set<number>(), lateIdsMemo: new Set<number>() }
    }
    try {
      const dayLogs = attendanceLogs
        .filter((l) => l != null && deriveLogDate(l) === dayKey)
      const present = new Set<number>(
        dayLogs
          .filter((l) => 
            l && 
            l.employee_id && 
            (!isAbsentLog(l) && (l.log_type === 'IN' || l.log_type === 'OUT' || 
             l.attendance_status === 'present' || 
             l.attendance_status === 'on_time' || 
             l.attendance_status === 'on-time'))
          )
          .map((l) => Number(l.employee_id))
          .filter((id) => !isNaN(id) && id > 0)
      )
      const late = new Set<number>(
        dayLogs
          .filter((l) => l && l.is_late === true && l.employee_id)
          .map((l) => Number(l.employee_id))
          .filter((id) => !isNaN(id) && id > 0)
      )
      return { presentIdsMemo: present, lateIdsMemo: late }
    } catch (error) {
      console.error('[Attendance] Error calculating present/late IDs:', error)
      return { presentIdsMemo: new Set<number>(), lateIdsMemo: new Set<number>() }
    }
  }, [attendanceLogs, dayKey])

  // Derived KPI counts from logs for the selected day
  const derivedKpis = React.useMemo(() => {
    try {
      if (!dayKey || !Array.isArray(attendanceLogs)) {
        return { onTime: 0, late: 0, undertime: 0, adminTime: 0 }
      }
      const staffTypeFilter = getStaffFilter()
      const dayLogs = attendanceLogs.filter((l) => l != null && deriveLogDate(l) === dayKey)
      const byEmp = new Map<number, any[]>()
      dayLogs.forEach((log) => {
        const empId = Number(log?.employee_id)
        if (!Number.isFinite(empId) || empId <= 0) return
        if (staffTypeFilter && log?.employees?.staff_type !== staffTypeFilter) return
        const list = byEmp.get(empId) || []
        list.push(log)
        byEmp.set(empId, list)
      })

      const adminSet = new Set<number>()
      const lateSet = new Set<number>()
      const undertimeSet = new Set<number>()
      const onTimeSet = new Set<number>()

      byEmp.forEach((empLogs, empId) => {
        const hasAbsent = empLogs.some((log) => isAbsentLog(log))
        if (hasAbsent) return

        const hasAdmin = empLogs.some((log) => {
          const status = String(log?.attendance_status || '').toLowerCase()
          return !!(log?.is_admin_time || log?.admin_time || status === 'admin_time' || status === 'admin-time')
        })
        const hasLate = empLogs.some((log) => {
          const status = String(log?.attendance_status || '').toLowerCase()
          return !!(log?.is_late || status.includes('late'))
        })
        const hasUndertime = empLogs.some((log) => {
          const status = String(log?.attendance_status || '').toLowerCase()
          return !!(log?.is_early_out || status.includes('undertime'))
        })

        if (hasAdmin) adminSet.add(empId)
        if (hasLate) lateSet.add(empId)
        if (hasUndertime) undertimeSet.add(empId)

        const inLogs = empLogs.filter((log) => String(log?.log_type || '').toUpperCase() === 'IN')
        const outLogs = empLogs.filter((log) => String(log?.log_type || '').toUpperCase() === 'OUT')
        const expectedIn = getMinutesFromTimeString(empLogs[0]?.employees?.schedule_time_in)
        const expectedOut = getMinutesFromTimeString(empLogs[0]?.employees?.schedule_time_out)
        const actualIn = inLogs
          .map((log) => getLogTimeMinutes(log))
          .filter((value): value is number => value !== null)
          .sort((a, b) => a - b)[0] ?? null
        const actualOut = outLogs
          .map((log) => getLogTimeMinutes(log))
          .filter((value): value is number => value !== null)
          .sort((a, b) => b - a)[0] ?? null

        const hasExplicitOnTimeTap = empLogs.some((log) => {
          const status = String(log?.attendance_status || '').toLowerCase()
          const type = String(log?.log_type || '').toUpperCase()
          if (type !== 'IN' && type !== 'OUT') return false
          return status === 'on_time' || status === 'on-time' || status === 'present'
        })

        const hasOnTimeTap =
          (expectedIn !== null && actualIn !== null && actualIn <= expectedIn) ||
          (expectedOut !== null && actualOut !== null && actualOut >= expectedOut) ||
          hasExplicitOnTimeTap

        if (hasOnTimeTap) {
          onTimeSet.add(empId)
        }
      })

      return {
        onTime: onTimeSet.size,
        late: lateSet.size,
        undertime: undertimeSet.size,
        adminTime: adminSet.size,
      }
    } catch {
      return { onTime: 0, late: 0, undertime: 0, adminTime: 0 }
    }
  }, [attendanceLogs, dayKey])

  const kpiEmployeeBuckets = React.useMemo(() => {
    const staffTypeFilter = getStaffFilter()
    const selectedDayKey = dayKey || getManilaToday()
    const scopedEmployees = (employees || []).filter((emp: any) => {
      if (!emp?.employee_id) return false
      if (staffTypeFilter && emp?.staff_type !== staffTypeFilter) return false
      return true
    })

    const employeeById = new Map<number, any>(
      scopedEmployees
        .map((emp: any) => [Number(emp.employee_id), emp] as const)
        .filter(([id]) => Number.isFinite(id) && id > 0)
    )

    const dayLogs = (attendanceLogs || []).filter((log: any) => {
      if (!log?.employee_id) return false
      return deriveLogDate(log) === selectedDayKey && employeeById.has(Number(log.employee_id))
    })

    const present = new Set<number>()
    const late = new Set<number>()
    const absent = new Set<number>()
    const undertime = new Set<number>()
    const adminTime = new Set<number>()
    const onTimeDetailByEmployee = new Map<number, Array<{
      type: 'IN' | 'OUT'
      expectedMinutes: number
      actualMinutes: number
      expectedDisplay: string
      actualDisplay: string
      partneredStatus: string
      scheduleSource: string
    }>>()

    dayLogs.forEach((log: any) => {
      const id = Number(log.employee_id)
      if (!Number.isFinite(id) || id <= 0) return

      const status = String(log?.attendance_status || '').toLowerCase()
      if (isAbsentLog(log)) absent.add(id)
      if (log?.is_late || status.includes('late')) late.add(id)
      if (status.includes('undertime') || log?.is_early_out) undertime.add(id)
      if (log?.is_admin_time || log?.admin_time || status === 'admin_time' || status === 'admin-time') adminTime.add(id)

      const isPresent = !isAbsentLog(log) && (log?.log_type === 'IN' || log?.log_type === 'OUT' || status === 'present' || status === 'on_time' || status === 'on-time')
      if (isPresent) present.add(id)
    })

    present.forEach((id) => {
      const empLogs = dayLogs.filter((log: any) => Number(log?.employee_id) === id && !isAbsentLog(log))
      if (empLogs.length === 0) return

      const dayExpected = dailyExpectedScheduleMap.get(id)
      const expectedIn = dayExpected?.expectedIn ?? getMinutesFromTimeString(empLogs[0]?.employees?.schedule_time_in)
      const expectedOut = dayExpected?.expectedOut ?? getMinutesFromTimeString(empLogs[0]?.employees?.schedule_time_out)
      const inLogs = empLogs
        .filter((log: any) => String(log?.log_type || '').toUpperCase() === 'IN')
        .map((log: any) => ({ minutes: getLogTimeMinutes(log), log }))
        .filter((entry: any) => entry.minutes !== null)
        .sort((a: any, b: any) => a.minutes - b.minutes)
      const outLogs = empLogs
        .filter((log: any) => String(log?.log_type || '').toUpperCase() === 'OUT')
        .map((log: any) => ({ minutes: getLogTimeMinutes(log), log }))
        .filter((entry: any) => entry.minutes !== null)
        .sort((a: any, b: any) => b.minutes - a.minutes)

      const details: Array<{
        type: 'IN' | 'OUT'
        expectedMinutes: number
        actualMinutes: number
        expectedDisplay: string
        actualDisplay: string
        partneredStatus: string
        scheduleSource: string
      }> = []
      const partneredStatus = inLogs.length > 0 && outLogs.length > 0
        ? 'Paired IN/OUT'
        : (inLogs.length > 0 ? 'IN only' : (outLogs.length > 0 ? 'OUT only' : 'No paired taps'))
      const scheduleSource = dayExpected?.source === 'exam'
        ? 'Exam'
        : dayExpected?.source === 'class'
          ? 'Class'
          : dayExpected?.source === 'non_teaching'
            ? 'Non-Teaching'
            : 'N/A'

      if (expectedIn !== null && inLogs[0]?.minutes != null && inLogs[0].minutes <= expectedIn) {
        details.push({
          type: 'IN',
          expectedMinutes: expectedIn,
          actualMinutes: inLogs[0].minutes,
          expectedDisplay: formatMinutesTo12Hour(expectedIn),
          actualDisplay: formatMinutesTo12Hour(inLogs[0].minutes),
          partneredStatus,
          scheduleSource,
        })
      }
      if (expectedOut !== null && outLogs[0]?.minutes != null && outLogs[0].minutes >= expectedOut) {
        details.push({
          type: 'OUT',
          expectedMinutes: expectedOut,
          actualMinutes: outLogs[0].minutes,
          expectedDisplay: formatMinutesTo12Hour(expectedOut),
          actualDisplay: formatMinutesTo12Hour(outLogs[0].minutes),
          partneredStatus,
          scheduleSource,
        })
      }

      // Fallback path: if schedule_time_in/out is unavailable for teaching staff,
      // still reflect explicit on-time tap records and label expected as N/A.
      if (details.length === 0) {
        const onTimeIn = inLogs.find((entry: any) => {
          const status = String(entry?.log?.attendance_status || '').toLowerCase()
          return status === 'on_time' || status === 'on-time' || status === 'present'
        })
        const onTimeOut = outLogs.find((entry: any) => {
          const status = String(entry?.log?.attendance_status || '').toLowerCase()
          return status === 'on_time' || status === 'on-time' || status === 'present'
        })

        if (onTimeIn?.minutes != null) {
          details.push({
            type: 'IN',
            expectedMinutes: -1,
            actualMinutes: onTimeIn.minutes,
            expectedDisplay: 'N/A',
            actualDisplay: formatMinutesTo12Hour(onTimeIn.minutes),
            partneredStatus,
            scheduleSource,
          })
        }
        if (onTimeOut?.minutes != null) {
          details.push({
            type: 'OUT',
            expectedMinutes: -1,
            actualMinutes: onTimeOut.minutes,
            expectedDisplay: 'N/A',
            actualDisplay: formatMinutesTo12Hour(onTimeOut.minutes),
            partneredStatus,
            scheduleSource,
          })
        }
      }

      if (details.length > 0) {
        onTimeDetailByEmployee.set(id, details)
      }
    })

    const workNotStarted = new Set<number>()
    scopedEmployees.forEach((emp: any) => {
      const startDate = emp?.start_date || emp?.hire_date
      if (!hasWorkStarted(selectedDayKey, startDate, emp?.hire_date)) {
        workNotStarted.add(Number(emp.employee_id))
      }
    })

    const total = new Set<number>(Array.from(employeeById.keys()))
    const onTime = new Set<number>(Array.from(present).filter((id) => !absent.has(id) && onTimeDetailByEmployee.has(id)))

    const toRows = (set: Set<number>) =>
      Array.from(set)
        .map((id) => employeeById.get(id))
        .filter(Boolean)
        .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')))

    return {
      total: toRows(total),
      onTime: toRows(onTime),
      late: toRows(late),
      absent: toRows(absent),
      undertime: toRows(undertime),
      adminTime: toRows(adminTime),
      workNotStarted: toRows(workNotStarted),
      onTimeDetailByEmployee,
      selectedDayKey,
    }
  }, [attendanceLogs, dayKey, employees, dailyExpectedScheduleMap])

  const openKpiModal = (kpi: 'total' | 'onTime' | 'late' | 'absent' | 'undertime' | 'adminTime' | 'workNotStarted') => {
    setActiveKpiModal(kpi)
    setKpiModalOpen(true)
  }

  const filterLogs = async () => {
    if (!Array.isArray(attendanceLogs)) {
      setFilteredLogs([])
      return
    }

    const staffTypeFilter = getStaffFilter()
    const effectiveSelectedStaffType = staffTypeFilter || selectedStaffType

    let filtered = attendanceLogs.filter(log => {
      if (!log) return false
      
      // Exclude Sundays (rest day - no classes or exams)
      const logDate = deriveLogDate(log)
      if (logDate) {
        try {
          const dateObj = new Date(logDate + 'T00:00:00+08:00')
          const dayOfWeek = dateObj.getDay() // 0 = Sunday, 1 = Monday, etc.
          if (dayOfWeek === 0) {
            return false // Skip Sundays
          }
        } catch (e) {
          // If date parsing fails, include the log (don't filter it out)
        }
      }
      
      return true
    })

    console.log('[filterLogs] Logs after base filtering:', filtered.length)
    console.log('[filterLogs] Employees array count:', employees.length)
    console.log('[filterLogs] Sample employees:', employees.slice(0, 3).map(e => ({
      name: e.full_name,
      staff_type: e.staff_type
    })))

    // Enforce owner scope before applying any user-facing filters.
    if (staffTypeFilter) {
      filtered = filtered.filter((log) => log && (log.employees?.staff_type || '') === staffTypeFilter)
    }

    if (deferredSearchTerm && deferredSearchTerm.trim()) {
      const searchLower = deferredSearchTerm.toLowerCase().trim()
      filtered = filtered.filter(
        (log) =>
          (log.employees?.full_name || '').toLowerCase().includes(searchLower) ||
          (log.employees?.school_id || '').toLowerCase().includes(searchLower) ||
          (log.employees?.department || '').toLowerCase().includes(searchLower),
      )
    }

    if (selectedStatus !== "All Statuses") {
      if (selectedStatus === "late") {
        filtered = filtered.filter((log) => log && log.is_late === true)
      } else if (selectedStatus === "on-time") {
        const synonyms = new Set(["present", "on_time", "on-time"])
        filtered = filtered.filter((log) => log && synonyms.has(log.attendance_status) && log.is_late !== true)
      } else {
        filtered = filtered.filter((log) => log && log.attendance_status === selectedStatus)
      }
    }

    if (selectedType !== "All Types") {
      // Filter by log type, but keep entries with '-' log_type (synthetic entries like not-started/absent)
      filtered = filtered.filter((log) => log && (log.log_type === selectedType || log.log_type === '-'))
    }

    if (effectiveSelectedStaffType !== "All Staff") {
      filtered = filtered.filter((log) => log && (log.employees?.staff_type || "") === effectiveSelectedStaffType)
    }

    if (selectedDepartment !== "All Departments") {
      filtered = filtered.filter((log) => log && (log.employees?.department || "") === selectedDepartment)
    }

    if (selectedDate) {
      try {
        const dateStr = formatInTimeZone(selectedDate, PHILIPPINES_TIMEZONE, 'yyyy-MM-dd')
        filtered = filtered.filter((log) => {
          if (!log) return false
          const logDate = deriveLogDate(log)
          if (!logDate) return true
          return logDate === dateStr
        })

        const lateEmployeeIds = lateIdsMemo
        if (lateEmployeeIds && lateEmployeeIds.size > 0) {
          filtered = filtered.map((l) => {
            if (!l || !l.employee_id) return l
            return lateEmployeeIds.has(l.employee_id)
              ? { ...l, is_late: true }
              : l
          })
        }
      } catch (error) {
        console.error('[Attendance] Error filtering by date:', error)
      }
    }

    // Fallback: if strict filters removed all rows but source logs exist for selected day,
    // show those day rows to avoid false "No match" states caused by format mismatches.
    if (filtered.length === 0 && Array.isArray(attendanceLogs) && attendanceLogs.length > 0 && selectedDate) {
      const dateStr = formatInTimeZone(selectedDate, PHILIPPINES_TIMEZONE, 'yyyy-MM-dd')
      const fallbackByDay = attendanceLogs.filter((log) => {
        if (!log) return false
        const d = deriveLogDate(log)
        if (d !== dateStr) return false
        if (staffTypeFilter && (log?.employees?.staff_type || '') !== staffTypeFilter) return false
        return true
      })

      if (fallbackByDay.length > 0) {
        console.warn('[Attendance] Applied fallback day filter due empty strict filter result', {
          sourceCount: attendanceLogs.length,
          fallbackCount: fallbackByDay.length,
          dateStr,
        })
        filtered = fallbackByDay
      }
    }

    // Always include employees whose work hasn't started (even if includeAbsences is false)
    // Also include absences if includeAbsences is true
    // BUT: Skip Sundays (rest day - no classes or exams)
    if (selectedDate) {
      const dateStr = formatInTimeZone(selectedDate, PHILIPPINES_TIMEZONE, 'yyyy-MM-dd')
      const selectedDateObj = new Date(dateStr + 'T00:00:00+08:00')
      
      // Skip processing for Sundays - no attendance tracking on rest days
      const dayOfWeek = selectedDateObj.getDay() // 0 = Sunday
      if (dayOfWeek === 0) {
        // Sunday - don't show synthetic entries or process attendance for Sundays
        setFilteredLogs(filtered)
        return
      }
      
      const presentIds = presentIdsMemo
      const lateIds = lateIdsMemo
      // ENRICHMENT: fetch exam and class schedules for employees present in the filtered list for the selected date
      try {
        const employeeIds = Array.from(new Set(filtered.filter(l => l && l.employee_id).map(l => l.employee_id)))
        const examMap = new Map<number, any[]>()
        const classMap = new Map<number, any[]>()
        // Helper to normalize day_of_week values
        const toNumericDay = (val: any): number | null => {
          if (typeof val === 'number') return val
          if (typeof val === 'string') {
            const upper = val.trim().toUpperCase()
            const map: Record<string, number> = { MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6, SUNDAY: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 0 }
            if (upper in map) return map[upper]
            const asNum = Number(val)
            return isNaN(asNum) ? null : asNum
          }
          return null
        }

        await Promise.all(employeeIds.map(async (id) => {
          try {
            const [exams, classes] = await Promise.all([
              getExamSchedulesForEmployee(id),
              getTeachingSchedulesForEmployee(id),
            ])

            if (!exams || !Array.isArray(exams)) {
              examMap.set(id, [])
            } else {
              const matchedExams = exams.filter((s: any) => {
                // Match by exact exam_date or by day_of_week matching the selected date
                const normalizedExamDate = s?.exam_date ? String(s.exam_date).split('T')[0] : ''
                const dateMatches = !!(normalizedExamDate && normalizedExamDate === dateStr)
                const dowMatches = (() => {
                  const sd = toNumericDay(s?.day_of_week)
                  if (sd === null) return false
                  // selectedDateObj exists in this scope
                  return sd === selectedDateObj.getDay()
                })()
                return dateMatches || dowMatches
              })
              examMap.set(id, matchedExams)
            }

            if (!classes || !Array.isArray(classes)) {
              classMap.set(id, [])
            } else {
              const matchedClasses = classes.filter((s: any) => {
                const sd = toNumericDay(s?.day_of_week)
                if (sd === null) return false
                return sd === selectedDateObj.getDay()
              })
              classMap.set(id, matchedClasses)
            }
          } catch (err) {
            examMap.set(id, [])
            classMap.set(id, [])
          }
        }))

        // Attach per-day schedule context to each log for downstream badge detection
        filtered = filtered.map((l) => {
          if (!l || !l.employee_id) return l
          return {
            ...l,
            employee_exam_schedules: examMap.get(l.employee_id) || [],
            employee_class_schedules: classMap.get(l.employee_id) || [],
          }
        })
      } catch (err) {
        console.error('[Attendance] Error enriching logs with exam schedules:', err)
      }
      // CRITICAL: Get only active employees (exclude archived employees)
      // Archived employees (is_active = false) should NOT appear in Attendance page
      // Only include employees where is_active = true or is_active IS NULL (backward compatibility)
      const activeEmployees = (employees || []).filter((emp: any) => {
        // Strictly exclude archived employees (is_active = false)
        if (emp.is_active === false) {
          return false
        }
        // Include active employees (is_active = true or null/undefined for backward compatibility)
        return emp.is_active === true || emp.is_active === null || emp.is_active === undefined
      })
      
      // Separate employees whose work hasn't started from those who are absent
      // Show for ALL dates where work hasn't started (from hire_date until start_date)
      // This works dynamically - for ANY date selected, if work hasn't started, show employee
      // CRITICAL: This includes restored employees with future start dates (e.g., Jomung De Castro)
      const employeesNotStarted = activeEmployees.filter((e: any) => {
        const startDate = (e as any).start_date || e.hire_date
        const hireDate = e.hire_date
        
        // If no dates at all, skip
        if (!startDate && !hireDate) return false
        
        // CRITICAL: Use the hasWorkStarted helper which handles all edge cases
        // This properly checks if work has started using Manila timezone
        const workStarted = hasWorkStarted(dateStr, startDate, hireDate)
        
        // Show employee if:
        // 1. Work hasn't started for this date (e.g., start_date is in the future)
        // 2. Selected date is on or after hire_date (can't show before hire)
        let showForDate = !workStarted
        
        if (hireDate) {
          try {
            const hireDateStr = hireDate.includes('T') ? hireDate.split('T')[0] : hireDate
            const selectedDateStr = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr
            
            // CRITICAL: Use Manila timezone for date comparisons
            const hireDateObj = new Date(hireDateStr + 'T00:00:00+08:00')
            const selectedDateObj = new Date(selectedDateStr + 'T00:00:00+08:00')
            
            // Don't show if selected date is before hire date
            if (selectedDateObj < hireDateObj) {
              showForDate = false
            }
          } catch (err) {
            console.warn('[Attendance] Error comparing dates:', err)
          }
        }
        
        if (showForDate) {
          console.log('[Attendance] ✅ Showing employee with "Work Has Not Started Yet" status:', {
            name: e.full_name,
            employee_id: e.employee_id,
            is_active: e.is_active,
            start_date: startDate,
            hire_date: hireDate,
            selectedDate: dateStr,
            workStarted,
            showForDate
          })
        } else {
          console.log('[Attendance] ❌ NOT showing employee for date:', {
            name: e.full_name,
            employee_id: e.employee_id,
            is_active: e.is_active,
            start_date: startDate,
            hire_date: hireDate,
            selectedDate: dateStr,
            workStarted,
            reason: workStarted ? 'Work has started' : 'Before hire date or other issue'
          })
        }
        
        return showForDate
      })
      
      console.log('[Attendance] Employees not started count:', employeesNotStarted.length, 'out of', activeEmployees.length, 'active employees')
      
      const employeesWithoutLogs = activeEmployees.filter((e) => !presentIds.has(e.employee_id))
      
      // Create entries for employees whose work hasn't started (always show these)
      const syntheticNotStarted = employeesNotStarted
        .filter((e) => !presentIds.has(e.employee_id))
        .filter((e) => (effectiveSelectedStaffType === 'All Staff') ? true : ((e.staff_type || '') === effectiveSelectedStaffType))
        .filter((e) => (selectedDepartment === 'All Departments') ? true : ((e.department || '') === selectedDepartment))
        .filter((e) => {
          if (!deferredSearchTerm) return true
          const term = deferredSearchTerm.toLowerCase()
          return (
            (e.full_name || '').toLowerCase().includes(term) ||
            (e.rfid_code || '').toLowerCase().includes(term) ||
            (e.department || '').toLowerCase().includes(term) ||
            (e.school_id || '').toLowerCase().includes(term)
          )
        })
        .map((e) => {
          // CRITICAL: Exclude Sundays (rest day)
          if (isSunday(dateStr)) {
            return null // Don't show Sunday entries
          }

          // CRITICAL: For "Work Has Not Started Yet" employees, show them regardless of schedule
          // They should appear in the table even if they don't have a schedule yet
          // The schedule check is only for employees whose work has started
          
          // CRITICAL: Use Manila timezone for today's date comparison
          const today = getManilaToday()
          const todayObj = new Date(today + 'T00:00:00+08:00')
          const selectedDateObj = new Date(dateStr + 'T00:00:00+08:00')
          
          // CRITICAL: Show "Not Started" entries for today and past dates
          // Only exclude future dates (dates after today in Manila timezone)
          if (selectedDateObj > todayObj) {
            // Future date - don't create any entry (should be blank)
            return null
          }

          const startDateForDisplay = (e as any).start_date || e.hire_date
          let startDateNote: string | null = null
          if (startDateForDisplay) {
            try {
              const raw = String(startDateForDisplay)
              const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw)
                ? new Date(`${raw}T00:00:00+08:00`)
                : new Date(raw)
              if (!isNaN(parsed.getTime())) {
                startDateNote = `Work begins: ${formatInTimeZone(parsed, PHILIPPINES_TIMEZONE, 'MMM dd, yyyy')}`
              }
            } catch {
              startDateNote = null
            }
          }
          
          const entry = {
            id: `not-started-${e.employee_id}-${dateStr}`, // Add id field for table key
            log_id: `not-started-${e.employee_id}-${dateStr}`,
            employee_id: e.employee_id,
            rfid_code: e.rfid_code || null,
            log_type: '-' as const,
            log_time: null as null,
            date: dateStr,
            attendance_status: 'not-started' as const,
            is_late: false,
            notes: startDateNote,
            start_date: startDateForDisplay,
            employees: {
              full_name: e.full_name || 'Unknown',
              department: e.department || null,
              staff_type: e.staff_type || null,
              school_id: e.school_id || null,
            },
          }
          
          // Ensure all required fields are present
          if (!entry.employee_id || !entry.employees || !entry.date) {
            console.warn('[Attendance] Invalid synthetic entry:', entry)
            return null
          }
          
          return entry
        })
        .filter((entry) => entry !== null)
        .filter((entry) => {
          // Apply status filter if needed
          if (selectedStatus !== 'All Statuses') {
            if (selectedStatus === "late" || selectedStatus === "on-time") {
              return false // Not applicable for not-started
            }
            // For other statuses, only show if status matches
            if (entry.attendance_status !== selectedStatus) return false
          }
          return true
        })
      
      // REMOVED: No more synthetic absent entries - only show what's in the database
      // Absent records will only appear if they were saved to the database by the daily absent marking process
      const syntheticAbsent: any[] = []

      // Combine all entries: regular logs and employees whose work hasn't started
      // NOTE: Absent entries are only shown if they exist in the database (saved by daily absent marking process)
      console.log('[Attendance] Adding synthetic entries:', {
        syntheticNotStarted: syntheticNotStarted.length,
        syntheticAbsent: 0, // No longer generating synthetic absent entries
        dateStr,
        hideNotStarted,
        beforeCount: filtered.length,
        sampleEntry: syntheticNotStarted[0]
      })
      
      // CRITICAL: Ensure synthetic entries are valid before adding
      const validNotStarted = syntheticNotStarted.filter((e) => e != null && e.employee_id && e.date)
      
      console.log('[Attendance] Valid synthetic entries:', {
        validNotStarted: validNotStarted.length,
        validAbsent: 0, // No synthetic absent entries
        sampleValid: validNotStarted[0]
      })
      
      // REMOVED: No longer saving absent records here - that's handled by the daily absent marking API
      // The daily absent marking API runs at the end of each day and automatically saves absent records to the database
      
      filtered = [...filtered, ...validNotStarted]
      console.log('[Attendance] After adding synthetic entries, total:', filtered.length, 'of which not-started:', validNotStarted.length)
    }

    // Apply hideNotStarted filter to all entries (including regular logs)
    // Only hide if toggle is explicitly ON
    if (hideNotStarted) {
      const beforeCount = filtered.length
      filtered = filtered.filter((log) => log && log.attendance_status !== 'not-started')
      console.log('[Attendance] hideNotStarted filter:', { beforeCount, afterCount: filtered.length })
    } else {
      // Ensure not-started entries are visible when toggle is OFF
      const notStartedCount = filtered.filter((log) => log && log.attendance_status === 'not-started').length
      console.log('[Attendance] Not-started entries visible:', notStartedCount, 'out of', filtered.length, 'total entries')
      
      // Debug: Log sample not-started entries
      const notStartedEntries = filtered.filter((log) => log && log.attendance_status === 'not-started')
      if (notStartedEntries.length > 0) {
        console.log('[Attendance] Sample not-started entry:', notStartedEntries[0])
      } else {
        console.warn('[Attendance] WARNING: No not-started entries found after all filters!')
      }
    }

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'name') {
        const an = (a.employees?.full_name || '').toLowerCase()
        const bn = (b.employees?.full_name || '').toLowerCase()
        return an.localeCompare(bn)
      } else {
        const at = a.log_time ? new Date(a.log_time).getTime() : 0
        const bt = b.log_time ? new Date(b.log_time).getTime() : 0
        return at - bt
      }
    })

    if (sortDir === 'desc') sorted.reverse()

    const total = sorted.length
    const tp = Math.max(1, Math.ceil(total / pageSize))
    setTotalPages(tp)
    const currentPage = Math.min(page, tp)
    const start = (currentPage - 1) * pageSize
    const end = start + pageSize
    const paginated = sorted.slice(start, end)
    
    console.log('[Attendance] Final filtered logs:', {
      totalAfterFilter: sorted.length,
      page,
      pageSize,
      start,
      end,
      paginatedCount: paginated.length,
      notStartedInPage: paginated.filter((l: any) => l.attendance_status === 'not-started').length
    })
    
    setFilteredLogs(paginated)
  }

  const getStatusBadge = (log: any) => {
    console.log('[getStatusBadge]', { 
      attendance_status: log.attendance_status, 
      is_late: log.is_late, 
      log_type: log.log_type,
      notes: log.notes,
      employee: log.employees?.full_name
    })
    
    // Handle absence records (attendance_status is 'absent')
    if (log.attendance_status === 'absent') {
      return (
        <div className="flex flex-col items-center gap-1">
          <Badge className="bg-rose-500/20 dark:bg-rose-500/30 text-rose-700 dark:text-rose-400 border-rose-500/30 dark:border-rose-500/40">
            Absent
          </Badge>
          {log.notes && (
            <span className="text-[10px] text-gray-600 dark:text-gray-400 italic text-center max-w-[150px]">
              {log.notes}
            </span>
          )}
        </div>
      )
    }
    
    const status = (log.attendance_status || '').toLowerCase()
    const isOUT = log.log_type === 'OUT'

    // Some imported/legacy OUT logs can have an empty attendance_status.
    // For OUT taps, default to On-Time unless they are explicitly marked undertime/early-out.
    if (!status && isOUT) {
      if (log.is_early_out) {
        return <Badge className="bg-violet-500/20 dark:bg-violet-500/30 text-violet-700 dark:text-violet-400 border-violet-500/30 dark:border-violet-500/40">Undertime</Badge>
      }
      return <Badge className="bg-emerald-500/20 dark:bg-emerald-500/30 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 dark:border-emerald-500/40">On-Time</Badge>
    }
    
    // Handle compound statuses first (e.g., 'late/undertime', 'late/on-time', 'on-time/undertime')
    if (status.includes('late') && status.includes('undertime')) {
      return <Badge className="bg-purple-500/20 dark:bg-purple-500/30 text-purple-700 dark:text-purple-400 border-purple-500/30 dark:border-purple-500/40">Late/Undertime</Badge>
    } else if (status.includes('late') && status.includes('on-time')) {
      return <Badge className="bg-amber-500/20 dark:bg-amber-500/30 text-amber-700 dark:text-amber-400 border-amber-500/30 dark:border-amber-500/40">Late/On-Time</Badge>
    } else if (status.includes('on-time') && status.includes('undertime')) {
      return <Badge className="bg-violet-500/20 dark:bg-violet-500/30 text-violet-700 dark:text-violet-400 border-violet-500/30 dark:border-violet-500/40">On-Time/Undertime</Badge>
    }
    
    // For OUT entries, check for "On-Time" or "Present" status first (before checking for "Late")
    // This ensures OUT entries that are at or after scheduled time show "On-Time", not "Late"
    if (isOUT && (status.includes('on-time') || status.includes('on_time') || status === 'present')) {
      return <Badge className="bg-emerald-500/20 dark:bg-emerald-500/30 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 dark:border-emerald-500/40">On-Time</Badge>
    }
    
    // Handle undertime for OUT entries (should be checked before late)
    if (isOUT && status.includes('undertime')) {
      return <Badge className="bg-violet-500/20 dark:bg-violet-500/30 text-violet-700 dark:text-violet-400 border-violet-500/30 dark:border-violet-500/40">Undertime</Badge>
    }
    
    // Handle simple late status (check both is_late flag and status string)
    // BUT: For OUT entries, only show "Late" if the status explicitly includes "late" AND not "on-time" or "present"
    // For OUT entries, "Late" from is_late flag should be ignored (OUT entries can't be "Late", they're either "On-Time" or "Undertime")
    if (isOUT) {
      // For OUT entries, ignore is_late flag - check status string only
      // But don't show "Late" if status is "on-time" or "present" (already handled above)
      if (status.includes('late') && !status.includes('on-time') && !status.includes('on_time') && status !== 'present') {
        return <Badge className="bg-amber-500/20 dark:bg-amber-500/30 text-amber-700 dark:text-amber-400 border-amber-500/30 dark:border-amber-500/40">Late</Badge>
      }
    } else {
      // For IN entries, use both is_late flag and status string
      if (log.is_late || status.includes('late')) {
        return <Badge className="bg-amber-500/20 dark:bg-amber-500/30 text-amber-700 dark:text-amber-400 border-amber-500/30 dark:border-amber-500/40">Late</Badge>
      }
    }

    // Handle undertime (but not if already handled above)
    if (status.includes('undertime')) {
      return <Badge className="bg-violet-500/20 dark:bg-violet-500/30 text-violet-700 dark:text-violet-400 border-violet-500/30 dark:border-violet-500/40">Undertime</Badge>
    }

    const statusConfig: Record<string, { className: string; label: string }> = {
      present: { className: "bg-emerald-500/20 dark:bg-emerald-500/30 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 dark:border-emerald-500/40", label: "On-Time" },
      "on_time": { className: "bg-emerald-500/20 dark:bg-emerald-500/30 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 dark:border-emerald-500/40", label: "On-Time" },
      "on-time": { className: "bg-emerald-500/20 dark:bg-emerald-500/30 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 dark:border-emerald-500/40", label: "On-Time" },
      absent: { className: "bg-rose-500/20 dark:bg-rose-500/30 text-rose-700 dark:text-rose-400 border-rose-500/30 dark:border-rose-500/40", label: "Absent" },
      missed_log: { className: "bg-amber-500/20 dark:bg-amber-500/30 text-amber-700 dark:text-amber-400 border-amber-500/30 dark:border-amber-500/40", label: "Missed Log" },
      "not-started": { className: "bg-amber-500/20 dark:bg-amber-500/30 text-amber-700 dark:text-amber-400 border-amber-500/30 dark:border-amber-500/40", label: t('attendance.work_not_started') },
    }

    const key = status
    const cfg = statusConfig[key] || statusConfig[log.attendance_status]
    
    // For "not-started" status, include the start date below the badge
    if (key === 'not-started' && log.start_date) {
      const rawStartDate = String(log.start_date)
      const parsedStartDate = /^\d{4}-\d{2}-\d{2}$/.test(rawStartDate)
        ? new Date(`${rawStartDate}T00:00:00+08:00`)
        : new Date(rawStartDate)
      const startDateFormatted = !isNaN(parsedStartDate.getTime())
        ? formatInTimeZone(parsedStartDate, PHILIPPINES_TIMEZONE, 'MMM dd, yyyy')
        : rawStartDate
      const safeCfg = cfg || statusConfig['not-started']
      return (
        <div className="flex flex-col items-center gap-1">
          <Badge className={safeCfg.className}>{safeCfg.label}</Badge>
          <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">
            Starts: {startDateFormatted}
          </span>
        </div>
      )
    }
    
    // For "absent" status, show the reason from notes if available
    if (key === 'absent' && log.notes) {
      return (
        <div className="flex flex-col items-center gap-1">
          <Badge className={cfg.className}>{cfg.label}</Badge>
          <span className="text-[10px] text-gray-600 dark:text-gray-400 italic text-center max-w-[150px]">
            {log.notes}
          </span>
        </div>
      )
    }
    
    if (cfg) return <Badge className={cfg.className}>{cfg.label}</Badge>
    return <Badge>{String(log.attendance_status || '').replace(/\b\w/g, (c) => c.toUpperCase())}</Badge>
  }

  const getAttendanceContextLabel = (log?: any): string => {
    if (!log) return 'Other'

    const status = String(log.attendance_status || '').toLowerCase()
    const scheduleType = String(log.schedule_type || '').toLowerCase().trim()
    const holidayType = getHolidayType(log.date)

    if (status === 'missed_log' || status === 'missed-log') return 'Missed Log'

    if (scheduleType === 'exam' || scheduleType === 'exam_schedule') return 'Exam Schedule'
    if (scheduleType === 'class' || scheduleType === 'class_schedule' || scheduleType === 'teaching') return 'Class Schedule'
    if (scheduleType === 'substituted' || scheduleType === 'substitution' || scheduleType === 'substituted_schedule') return 'Substituted Schedule'
    if (scheduleType === 'leave' || scheduleType === 'on_leave') return 'Leave'
    if (scheduleType === 'holiday') return 'Holiday'
    if (scheduleType === 'admin_time' || scheduleType === 'admin-time') return 'Admin Time'
    if (scheduleType === 'missed_log' || scheduleType === 'missed-log') return 'Missed Log'

    if (holidayType === 'suspended_asynchronous') return 'Holiday'
    if (holidayType === 'online_class') return 'Online Class'

    if (
      log.substitution_id ||
      substitutionEmployeeIds.has(log.employee_id) ||
      (log.notes && /substitution/i.test(String(log.notes)))
    ) {
      return 'Substituted Schedule'
    }

    if (
      log.is_on_leave ||
      log.leave_status === 'approved' ||
      status === 'excused' ||
      (log.notes && /leave/i.test(String(log.notes)))
    ) {
      return 'Leave'
    }

    if (log.is_admin_time || log.admin_time || status === 'admin_time' || status === 'admin-time') {
      return 'Admin Time'
    }

    const hasExamSchedule = Boolean(
      log.schedule_type === 'exam' ||
      log.exam_schedule_id ||
      log.examSchedules ||
      (Array.isArray(log.employee_exam_schedules) && log.employee_exam_schedules.length > 0)
    )

    if (hasExamSchedule) return 'Exam Schedule'

    const hasClassSchedule = Boolean(
      log.schedule_type === 'class' ||
      log.class_schedule_id ||
      log.teachingSchedules ||
      (Array.isArray(log.employee_class_schedules) && log.employee_class_schedules.length > 0)
    )

    if (hasClassSchedule) return 'Class Schedule'

    if (log.is_missed_log) return 'Missed Log'

    return 'Other'
  }

  const getAttendanceContextBadgeClass = (label: string): string => {
    const classes: Record<string, string> = {
      'Class Schedule': 'bg-green-500/20 dark:bg-green-500/30 text-green-700 dark:text-green-400 border-green-500/30',
      'Exam Schedule': 'bg-pink-500/20 dark:bg-pink-500/30 text-pink-700 dark:text-pink-400 border-pink-500/30',
      'Substituted Schedule': 'bg-purple-500/20 dark:bg-purple-500/30 text-purple-700 dark:text-purple-400 border-purple-500/30',
      'Leave': 'bg-rose-500/20 dark:bg-rose-500/30 text-rose-700 dark:text-rose-400 border-rose-500/30',
      'Holiday': 'bg-orange-500/20 dark:bg-orange-500/30 text-orange-700 dark:text-orange-400 border-orange-500/30',
      'Online Class': 'bg-blue-500/20 dark:bg-blue-500/30 text-blue-700 dark:text-blue-400 border-blue-500/30',
      'Admin Time': 'bg-indigo-500/20 dark:bg-indigo-500/30 text-indigo-700 dark:text-indigo-400 border-indigo-500/30',
      'Missed Log': 'bg-amber-500/20 dark:bg-amber-500/30 text-amber-700 dark:text-amber-400 border-amber-500/30',
      'Other': 'bg-gray-500/20 dark:bg-gray-500/30 text-gray-700 dark:text-gray-400 border-gray-500/30',
    }
    return classes[label] || classes.Other
  }

  const getLogTypeBadge = (type: string, log?: any) => {
    if (!type) {
      const contextLabel = getAttendanceContextLabel(log)
      return <Badge className={getAttendanceContextBadgeClass(contextLabel)}>{contextLabel}</Badge>
    }

    const typeConfig = {
      IN: { className: "bg-sky-500/20 dark:bg-sky-500/30 text-sky-700 dark:text-sky-400 border-sky-500/30 dark:border-sky-500/40" },
      OUT: { className: "bg-indigo-500/20 dark:bg-indigo-500/30 text-indigo-700 dark:text-indigo-400 border-indigo-500/30 dark:border-indigo-500/40" },
    }
    const config = typeConfig[type as keyof typeof typeConfig]
    if (!config) return <span className="text-gray-400 dark:text-gray-600">-</span>

    const reason = getAttendanceContextLabel(log)
    const reasonColor = getAttendanceContextBadgeClass(reason)

    return (
      <div className="flex flex-col gap-1">
        <Badge className={config.className}>{type}</Badge>
        <Badge variant="outline" className={`text-[10px] ${reasonColor}`}>{reason}</Badge>
      </div>
    )
  }

  const formatDateTime = (dateTimeString: string, formatType: 'time' | 'date' | 'full') => {
    try {
      const date = parseISO(dateTimeString)
      
      switch (formatType) {
        case 'time':
          const pref = getPreferredTimeFormat()
          return pref === '24h'
            ? formatInTimeZone(date, PHILIPPINES_TIMEZONE, "HH:mm")
            : formatInTimeZone(date, PHILIPPINES_TIMEZONE, "h:mm a").replace(/\s?am/i,'AM').replace(/\s?pm/i,'PM')
        case 'date':
          return formatInTimeZone(date, PHILIPPINES_TIMEZONE, "MMM d, yyyy")
        case 'full':
          const pf = getPreferredTimeFormat()
          return pf === '24h'
            ? formatInTimeZone(date, PHILIPPINES_TIMEZONE, "MMM d, yyyy 'at' HH:mm")
            : formatInTimeZone(date, PHILIPPINES_TIMEZONE, "MMM d, yyyy 'at' h:mm a").replace(/\s?am/i,'AM').replace(/\s?pm/i,'PM')
        default:
          return formatInTimeZone(date, PHILIPPINES_TIMEZONE, "MMM d, yyyy")
      }
    } catch (error) {
      console.error("Error formatting date:", error)
      return "Invalid Date"
    }
  }

  const formatLogTime = (iso: string | null, logType?: 'IN' | 'OUT') => {
    if (!iso) return ''
    try {
      const pref = getPreferredTimeFormat()
      const d = parseISO(iso)
      if (pref === '24h') {
        // 24h format with IN/OUT differentiation
        let hh = parseInt(formatInTimeZone(d, PHILIPPINES_TIMEZONE, 'HH'))
        const mm = formatInTimeZone(d, PHILIPPINES_TIMEZONE, 'mm')
        
        if (logType === 'IN') {
          // Time IN: Display in 01-12 range
          if (hh === 0) hh = 12
          else if (hh > 12) hh = hh - 12
        } else if (logType === 'OUT') {
          // Time OUT: Display in 13-24 range
          if (hh === 0) return '24:00'
          else if (hh > 0 && hh < 12) hh = hh + 12
        }
        
        return `${String(hh).padStart(2,'0')}:${mm}`
      }
      // 12h preference - format as h:mm AM/PM (without seconds)
      return formatInTimeZone(d, PHILIPPINES_TIMEZONE, 'h:mm a').replace(/\s?am/i,' AM').replace(/\s?pm/i,' PM')
    } catch {
      return ''
    }
  }

  const formatDayOfWeek = (dateString: string) => {
    try {
      const date = parseISO(dateString)
      return formatInTimeZone(date, PHILIPPINES_TIMEZONE, "EEEE")
    } catch (error) {
      return "Unknown"
    }
  }

  // Format scheduled time from employee's schedule_time_in and schedule_time_out
  const formatScheduledTime = (employee: any) => {
    if (!employee) {
      console.log('[formatScheduledTime] No employee data provided')
      return '-'
    }
    
    const timeIn = employee.schedule_time_in
    const timeOut = employee.schedule_time_out
    
    console.log('[formatScheduledTime]', {
      employee_id: employee.employee_id,
      full_name: employee.full_name,
      staff_type: employee.staff_type,
      timeIn,
      timeOut
    })
    
    if (!timeIn || !timeOut) {
      console.log('[formatScheduledTime] Missing time data - timeIn:', timeIn, 'timeOut:', timeOut)
      return '-'
    }
    
    try {
      // Parse time strings (format: HH:MM:SS or HH:MM)
      const formatTime = (timeStr: string) => {
        const parts = timeStr.split(':')
        if (parts.length < 2) return timeStr
        
        let hours = parseInt(parts[0])
        const minutes = parts[1]
        
        const period = hours >= 12 ? 'PM' : 'AM'
        hours = hours % 12 || 12 // Convert to 12-hour format
        
        return `${hours}:${minutes} ${period}`
      }
      
      const formatted = `${formatTime(timeIn)} - ${formatTime(timeOut)}`
      console.log('[formatScheduledTime] Formatted result:', formatted)
      return formatted
    } catch (error) {
      console.error('[formatScheduledTime] Error formatting time:', error)
      return '-'
    }
  }
  
  // Fetch holidays from database
  const fetchHolidays = async () => {
    try {
      const response = await fetch('/api/holidays', { cache: 'no-store' })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        console.error('[Attendance] Error fetching holidays:', body)
        return
      }

      const data = await response.json().catch(() => [])
      setHolidays(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('[Attendance] Error fetching holidays:', error)
    }
  }
  
  // Get holiday type for a specific date
  const getHolidayType = (date: string): string | null => {
    if (!date || holidays.length === 0) return null
    
    const checkDate = date.includes('T') ? date.split('T')[0] : date
    
    for (const holiday of holidays) {
      const startDate = holiday.start_date || holiday.date
      const endDate = holiday.end_date || holiday.date
      
      if (!startDate) continue
      
      // Check if the date falls within the holiday range
      if (checkDate >= startDate && checkDate <= endDate) {
        return holiday.type || null
      }
    }
    
    return null
  }

  // Load employee schedule comparison data
  const loadEmployeeScheduleComparison = async (log: any) => {
    if (!log.employee_id || !log.date) return
    
    setLoadingSchedule(true)
    try {
      const employeeId = log.employee_id
      const logDate = deriveLogDate(log)
      
      // Set the selected employee from the log
      if (log.employees) {
        setSelectedEmployee(log.employees)
      } else {
        // If employee data is not in the log, find it from the employees list
        const employee = employees?.find((e: any) => e.employee_id === employeeId)
        setSelectedEmployee(employee || null)
      }
      
      if (!logDate) {
        setEmployeeScheduleData(null)
        setLoadingSchedule(false)
        return
      }

      // Get day of week for the log date (1=Monday, 2=Tuesday, ..., 6=Saturday)
      const dateObj = new Date(logDate + 'T00:00:00+08:00')
      const jsDayOfWeek = dateObj.getDay()
      const scheduleDayOfWeek = jsDayOfWeek === 0 ? null : jsDayOfWeek // Exclude Sunday

      // Fetch teaching, exam schedules and any approved substitutions for this date
      const [teachingSchedules, examSchedules, substitutionSchedules] = await Promise.all([
        getTeachingSchedulesForEmployee(employeeId),
        getExamSchedulesForEmployee(employeeId),
        getClassSubstitutionsForEmployeeOnDate(employeeId, logDate),
      ])

      // Filter schedules for the specific day of week
      // Handle variations where day_of_week can be a number (1-6) or a day name string (e.g., 'Wednesday')
      const toNumericDay = (val: any): number | null => {
        if (typeof val === 'number') return val
        if (typeof val === 'string') {
          const upper = val.trim().toUpperCase()
          const map: Record<string, number> = {
            MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6, SUNDAY: 0,
            MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 0,
          }
          if (upper in map) return map[upper]
          const asNum = Number(val)
          return isNaN(asNum) ? null : asNum
        }
        return null
      }

      const dayTeachingSchedules = scheduleDayOfWeek
        ? (teachingSchedules || []).filter((s: any) => toNumericDay(s?.day_of_week) === scheduleDayOfWeek)
        : []
      
      // For exam schedules, check both day_of_week and exam_date
      const dayExamSchedules = scheduleDayOfWeek
        ? (examSchedules || []).filter((s: any) => {
            const dowMatches = toNumericDay(s?.day_of_week) === scheduleDayOfWeek
            const dateMatches = !!(s?.exam_date && s.exam_date === logDate)
            return dowMatches || dateMatches
          })
        : []

      // Get all attendance logs for this employee on this date
      const allLogsForDate = attendanceLogs.filter((l: any) => {
        const lDate = deriveLogDate(l)
        return l && l.employee_id === employeeId && lDate === logDate
      })

      // Map substitution schedules into a simplified structure for UI consumption
      const mappedSubstitutions = (substitutionSchedules || []).map((sub: any) => {
        const formatTime = (time: string) => {
          if (!time) return '—'
          try {
            const [h, m] = time.split(':')
            const dateTmp = new Date()
            dateTmp.setHours(Number(h), Number(m), 0, 0)
            return format(dateTmp, 'h:mm a')
          } catch { return time.substring(0,5) }
        }
        const startDisplay = formatTime(sub.start_time)
        const endDisplay = formatTime(sub.end_time)
        const role = sub.original_employee_id === employeeId ? 'Original' : 'Substitute'
        const counterpart = sub.original_employee_id === employeeId ? sub.substitute_employee?.full_name : sub.original_employee?.full_name
        return {
          id: sub.id,
            substitution_date: sub.substitution_date,
            start_time: sub.start_time,
            end_time: sub.end_time,
            start_end_display: `${startDisplay} - ${endDisplay}`,
            role,
            counterpart,
            reason: sub.reason,
        }
      })

      setEmployeeScheduleData({
        teachingSchedules: dayTeachingSchedules,
        examSchedules: dayExamSchedules,
        substitutionSchedules: mappedSubstitutions,
        attendanceLogs: allLogsForDate,
      })
    } catch (error) {
      console.error('[Attendance] Error loading schedule comparison:', error)
      toast({
        title: "Error",
        description: "Failed to load employee schedule data.",
        variant: "destructive",
      })
      setEmployeeScheduleData(null)
    } finally {
      setLoadingSchedule(false)
    }
  }

  // Calculate time difference between actual and scheduled time
  // NEW LOGIC:
  // IN: Before/At schedule = On-Time, After = Late
  // OUT: Before schedule = Undertime, At/After = On-Time
  const calculateTimeDifference = (actualTime: string, scheduledTime: string, type: 'IN' | 'OUT'): { minutes: number; status: 'early' | 'late' | 'on-time' | 'undertime' } => {
    try {
      const actual = new Date(actualTime)
      const [schedHours, schedMinutes] = scheduledTime.split(':').map(Number)
      const scheduled = new Date(actual)
      scheduled.setHours(schedHours, schedMinutes, 0, 0)
      
      const diffMinutes = Math.round((actual.getTime() - scheduled.getTime()) / (1000 * 60))
      
      if (type === 'IN') {
        // IN Logic: Before/At schedule = On-Time, After = Late
        if (diffMinutes <= 0) {
          // Before or exactly at schedule → On-Time (earliest tap-in is On-Time)
          return { minutes: Math.abs(diffMinutes), status: 'on-time' }
        } else {
          // After schedule → Late
          return { minutes: diffMinutes, status: 'late' }
        }
      } else {
        // OUT Logic: Before schedule = Undertime, At/After = On-Time
        if (diffMinutes < 0) {
          // Before schedule → Undertime
          return { minutes: Math.abs(diffMinutes), status: 'undertime' }
        } else {
          // At or after schedule → On-Time
          return { minutes: diffMinutes, status: 'on-time' }
        }
      }
    } catch {
      return { minutes: 0, status: 'on-time' }
    }
  }

  const showInitialLoading = isLoading && attendanceLogs.length === 0 && employees.length === 0

  if (showInitialLoading) {
    return (
      <div className="space-y-4 sm:space-y-6 px-4 sm:px-6 py-4 sm:py-6 animate-fadeInUp">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
        </div>
      </div>
    )
  }

  const kpiModalMeta: Record<'total' | 'onTime' | 'late' | 'absent' | 'undertime' | 'adminTime' | 'workNotStarted', {
    title: string
    description: string
    icon: React.ComponentType<{ className?: string }>
    iconClass: string
    iconBgClass: string
  }> = {
    total: { title: 'Total Employees', description: 'Active employees in the current scope.', icon: Users, iconClass: 'text-blue-600 dark:text-blue-400', iconBgClass: 'bg-blue-100 dark:bg-blue-900/30' },
    onTime: { title: 'On-Time Today', description: 'Employees with on-time attendance for the selected date.', icon: UserCheck, iconClass: 'text-green-600 dark:text-green-400', iconBgClass: 'bg-green-100 dark:bg-green-900/30' },
    late: { title: 'Late Today', description: 'Employees flagged late for the selected date.', icon: AlertTriangle, iconClass: 'text-orange-600 dark:text-orange-400', iconBgClass: 'bg-orange-100 dark:bg-orange-900/30' },
    absent: { title: 'Absent Today', description: 'Employees marked absent for the selected date.', icon: UserX, iconClass: 'text-rose-600 dark:text-rose-400', iconBgClass: 'bg-rose-100 dark:bg-rose-900/30' },
    undertime: { title: 'Undertime Today', description: 'Employees flagged undertime for the selected date.', icon: Clock, iconClass: 'text-amber-600 dark:text-amber-400', iconBgClass: 'bg-amber-100 dark:bg-amber-900/30' },
    adminTime: { title: 'Admin Time', description: 'Employees currently tagged as admin time.', icon: FileText, iconClass: 'text-indigo-600 dark:text-indigo-400', iconBgClass: 'bg-indigo-100 dark:bg-indigo-900/30' },
    workNotStarted: { title: 'Work Has Not Started Yet', description: 'Employees whose work start date has not begun.', icon: UserX, iconClass: 'text-amber-600 dark:text-amber-400', iconBgClass: 'bg-amber-100 dark:bg-amber-900/30' },
  }
  const ActiveKpiIcon = kpiModalMeta[activeKpiModal].icon
  const kpiModalRows = (kpiEmployeeBuckets[activeKpiModal] || []) as any[]
  const kpiModalFilteredRows = kpiModalRows.filter((emp: any) => {
    // Real-Time Monitoring/KPI drilldowns should not show Non-Teaching here.
    if (String(emp?.staff_type || '').toLowerCase() !== 'teaching') return false
    return true
  })
  const kpiModalSections = kpiModalFilteredRows.reduce((acc: Array<{ label: string; rows: any[] }>, emp: any) => {
    const label = String(emp?.department || 'No Department')
    const existing = acc.find((section) => section.label === label)
    if (existing) {
      existing.rows.push(emp)
      return acc
    }
    acc.push({ label, rows: [emp] })
    return acc
  }, [])
    .map((section) => ({
      ...section,
      rows: section.rows.sort((a, b) => String(a?.full_name || '').localeCompare(String(b?.full_name || ''))),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const attendanceCategoryCards = [
    {
      key: 'total' as const,
      title: t('attendance.total_employees'),
      value: stats.totalEmployees,
      subtitle: t('attendance.active_employees'),
      icon: Users,
      iconClass: 'text-blue-600 dark:text-blue-400',
      iconBgClass: 'bg-blue-100 dark:bg-blue-900/30',
      valueClass: 'text-blue-600 dark:text-blue-400',
      borderClass: 'border-blue-200/70 dark:border-blue-800/40',
      surfaceClass: 'from-blue-50/80 to-white dark:from-blue-950/25 dark:to-gray-900',
    },
    {
      key: 'onTime' as const,
      title: t('attendance.on_time_today'),
      value: derivedKpis.onTime,
      subtitle: `${stats.totalEmployees > 0 ? Math.round(((derivedKpis.onTime || 0) / stats.totalEmployees) * 100) : 0}% ${t('reports.attendance')}`,
      icon: UserCheck,
      iconClass: 'text-green-600 dark:text-green-400',
      iconBgClass: 'bg-green-100 dark:bg-green-900/30',
      valueClass: 'text-green-600 dark:text-green-400',
      borderClass: 'border-green-200/70 dark:border-green-800/40',
      surfaceClass: 'from-green-50/80 to-white dark:from-green-950/25 dark:to-gray-900',
    },
    ...(getStaffFilter() === 'Teaching'
      ? [{
          key: 'adminTime' as const,
          title: 'Admin Time',
          value: derivedKpis.adminTime,
          subtitle: 'Not counted as On-Time',
          icon: FileText,
          iconClass: 'text-indigo-600 dark:text-indigo-400',
          iconBgClass: 'bg-indigo-100 dark:bg-indigo-900/30',
          valueClass: 'text-indigo-600 dark:text-indigo-400',
          borderClass: 'border-indigo-200/70 dark:border-indigo-800/40',
          surfaceClass: 'from-indigo-50/80 to-white dark:from-indigo-950/25 dark:to-gray-900',
        }]
      : []),
    {
      key: 'late' as const,
      title: t('attendance.late_today'),
      value: derivedKpis.late,
      subtitle: t('attendance.requires_attention'),
      icon: AlertTriangle,
      iconClass: 'text-orange-600 dark:text-orange-400',
      iconBgClass: 'bg-orange-100 dark:bg-orange-900/30',
      valueClass: 'text-orange-600 dark:text-orange-400',
      borderClass: 'border-orange-200/70 dark:border-orange-800/40',
      surfaceClass: 'from-orange-50/80 to-white dark:from-orange-950/25 dark:to-gray-900',
    },
    {
      key: 'absent' as const,
      title: 'Absent Today',
      value: stats.absentToday,
      subtitle: 'Employees absent today',
      icon: UserX,
      iconClass: 'text-rose-600 dark:text-rose-400',
      iconBgClass: 'bg-rose-100 dark:bg-rose-900/30',
      valueClass: 'text-rose-600 dark:text-rose-400',
      borderClass: 'border-rose-200/70 dark:border-rose-800/40',
      surfaceClass: 'from-rose-50/80 to-white dark:from-rose-950/25 dark:to-gray-900',
    },
    {
      key: 'undertime' as const,
      title: 'Undertime Today',
      value: derivedKpis.undertime,
      subtitle: 'Early departures',
      icon: Clock,
      iconClass: 'text-amber-600 dark:text-amber-400',
      iconBgClass: 'bg-amber-100 dark:bg-amber-900/30',
      valueClass: 'text-amber-600 dark:text-amber-400',
      borderClass: 'border-amber-200/70 dark:border-amber-800/40',
      surfaceClass: 'from-amber-50/80 to-white dark:from-amber-950/25 dark:to-gray-900',
    },
    {
      key: 'workNotStarted' as const,
      title: t('attendance.work_not_started'),
      value: stats.workNotStarted,
      subtitle: t('attendance.need_followup'),
      icon: UserX,
      iconClass: 'text-yellow-700 dark:text-yellow-400',
      iconBgClass: 'bg-yellow-100 dark:bg-yellow-900/30',
      valueClass: 'text-yellow-700 dark:text-yellow-400',
      borderClass: 'border-yellow-200/70 dark:border-yellow-800/40',
      surfaceClass: 'from-yellow-50/80 to-white dark:from-yellow-950/25 dark:to-gray-900',
    },
  ]

  const getHolidayForDate = (date: string): any | null => {
    if (!date || holidays.length === 0) return null
    const checkDate = date.includes('T') ? date.split('T')[0] : date
    for (const holiday of holidays) {
      const startDate = holiday.start_date || holiday.date
      const endDate = holiday.end_date || holiday.date
      if (!startDate) continue
      if (checkDate >= startDate && checkDate <= endDate) return holiday
    }
    return null
  }

  const formatHolidayContext = (holiday: any): { label: string; detail?: string } => {
    if (!holiday) return { label: 'Holiday' }
    const name = holiday.name || holiday.title || holiday.description
    if (holiday.reporting_only) {
      return { label: 'Reporting Day', detail: name || 'Reporting only' }
    }
    if (holiday.type === 'online_class') {
      return { label: 'Online Class', detail: name || 'Online class schedule' }
    }
    if (holiday.affects_attendance === false || holiday.type === 'suspended_asynchronous') {
      return { label: 'Holiday', detail: name ? `No attendance: ${name}` : 'No attendance' }
    }
    return { label: 'Holiday', detail: name || undefined }
  }

  const extractLeaveReason = (notes?: string | null): string | null => {
    if (!notes) return null
    const trimmed = String(notes).trim()
    if (!trimmed) return null
    const match = trimmed.match(/reason\s*[:\-]\s*(.+)$/i) || trimmed.match(/leave\s*[:\-]\s*(.+)$/i)
    if (match?.[1]) return match[1].trim()
    return trimmed
  }

  const isApprovedLeaveLog = (log: any): boolean => {
    if (!log) return false
    const status = String(log?.attendance_status || '').toLowerCase()
    const scheduleType = String(log?.schedule_type || '').toLowerCase()
    return !!(
      log?.is_on_leave ||
      log?.leave_status === 'approved' ||
      status === 'excused' ||
      status === 'approved_leave' ||
      status === 'approved-leave' ||
      scheduleType === 'leave' ||
      scheduleType === 'on_leave' ||
      (log?.notes && /leave/i.test(String(log.notes)))
    )
  }

  const getApprovedLeaveInfo = (employeeId: number, dateStr: string): { label: string; detail?: string } | null => {
    if (!employeeId || !dateStr) return null
    const logs = (realtimeDayLogs && realtimeDayLogs.length > 0) ? realtimeDayLogs : attendanceLogs
    const leaveLog = (logs || []).find((log: any) => {
      if (Number(log?.employee_id) !== Number(employeeId)) return false
      return deriveLogDate(log) === dateStr && isApprovedLeaveLog(log)
    })
    if (!leaveLog) return null
    const reason = extractLeaveReason(leaveLog?.notes) || leaveLog?.leave_reason || leaveLog?.reason
    return {
      label: 'Approved Leave',
      detail: reason ? `Reason: ${reason}` : 'Approved leave on file',
    }
  }

  const getRealtimeDayContext = (employee: any): { label: string; detail?: string; badgeClass: string; isSpecial: boolean } => {
    const todayKey = format(new Date(), 'yyyy-MM-dd')
    const employeeId = Number(employee?.employee_id)
    const leaveInfo = employeeId ? getApprovedLeaveInfo(employeeId, todayKey) : null
    if (leaveInfo) {
      return {
        label: leaveInfo.label,
        detail: leaveInfo.detail,
        badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200',
        isSpecial: true,
      }
    }

    const holiday = getHolidayForDate(todayKey)
    if (holiday) {
      const context = formatHolidayContext(holiday)
      const label = context.label || 'Holiday'
      let badgeClass = 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200'
      if (label === 'Online Class') {
        badgeClass = 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
      } else if (label === 'Reporting Day') {
        badgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
      }
      return {
        label,
        detail: context.detail,
        badgeClass,
        isSpecial: true,
      }
    }

    if (employeeId && substitutionEmployeeIds.has(employeeId)) {
      return {
        label: 'Substitution Schedule',
        detail: 'Has substitution schedule today',
        badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200',
        isSpecial: true,
      }
    }

    return {
      label: 'Regular Day',
      badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-200',
      isSpecial: false,
    }
  }

  const realtimeMetricBuckets = (() => {
    const staffFilter = getStaffFilter()
    const todayKey = format(new Date(), 'yyyy-MM-dd')
    const employeeById = new Map<number, any>()
    ;(employees || []).forEach((emp: any) => {
      const id = Number(emp?.employee_id)
      if (!Number.isFinite(id) || id <= 0) return
      if (staffFilter && emp?.staff_type !== staffFilter) return
      employeeById.set(id, emp)
    })

    const addRow = (bucket: Map<number, any>, row: any) => {
      const id = Number(row?.employee_id)
      if (!Number.isFinite(id) || id <= 0) return
      if (staffFilter && row?.staff_type !== staffFilter) return
      if (!bucket.has(id)) bucket.set(id, row)
    }

    const onTime = new Map<number, any>()
    const late = new Map<number, any>()
    const absent = new Map<number, any>()
    const onLeave = new Map<number, any>()
    const total = new Map<number, any>()

    ;(realtimeRecentLogs || []).forEach((log: any) => {
      const emp = log?.employees
      if (!emp?.employee_id) return

      addRow(total, emp)
      const status = String(log?.attendance_status || '').toLowerCase()
      const isAdmin = !!(log?.is_admin_time || log?.admin_time || status === 'admin_time' || status === 'admin-time')
      if (log?.is_late) addRow(late, emp)
      if (!log?.is_late && !isAdmin && (status === 'present' || status === 'on_time' || status === 'on-time')) addRow(onTime, emp)
    })

    const dayLogs = (realtimeDayLogs && realtimeDayLogs.length > 0) ? realtimeDayLogs : attendanceLogs

    ;(dayLogs || []).forEach((log: any) => {
      if (deriveLogDate(log) !== todayKey) return
      const status = String(log?.attendance_status || '').toLowerCase()
      const row = log?.employees || employeeById.get(Number(log?.employee_id))
      if (!row) return
      if (isApprovedLeaveLog(log)) {
        addRow(onLeave, row)
        return
      }
      if (isAbsentLog(log)) addRow(absent, row)
      if (status === 'excused' || log?.is_on_leave || log?.leave_status === 'approved') addRow(onLeave, row)
    })

    ;(realtimeNotLoggedIn || []).forEach((emp: any) => addRow(total, emp))
    ;(realtimeNotLoggedOut || []).forEach((emp: any) => addRow(total, emp))

    const toRows = (map: Map<number, any>) =>
      Array.from(map.values()).sort((a: any, b: any) => String(a?.full_name || '').localeCompare(String(b?.full_name || '')))

    return {
      onTime: toRows(onTime),
      late: toRows(late),
      absent: toRows(absent),
      onLeave: toRows(onLeave),
      total: toRows(total),
    }
  })()

  const realtimeModalMeta: Record<'onTime' | 'late' | 'absent' | 'onLeave' | 'total', { title: string; description: string }> = {
    onTime: { title: 'On-Time', description: 'Employees who arrived on-time in real-time monitoring.' },
    late: { title: 'Late', description: 'Employees currently flagged as late.' },
    absent: { title: 'Absent', description: 'Employees marked absent for today.' },
    onLeave: { title: 'On Leave', description: 'Employees with approved leave or excused attendance.' },
    total: { title: 'Total', description: 'Employees in the current real-time scope.' },
  }
  const realtimeModalRows = (realtimeMetricBuckets[activeRealtimeMetric] || []) as any[]
  const realtimeModalFilteredRows = realtimeModalRows.filter((emp: any) => {
    // Real-Time Monitoring drilldowns should not show Non-Teaching here.
    if (String(emp?.staff_type || '').toLowerCase() !== 'teaching') return false
    return true
  })
  const realtimeModalSections = realtimeModalFilteredRows.reduce((acc: Array<{ label: string; rows: any[] }>, emp: any) => {
    const label = String(emp?.department || 'No Department')
    const existing = acc.find((section) => section.label === label)
    if (existing) {
      existing.rows.push(emp)
      return acc
    }
    acc.push({ label, rows: [emp] })
    return acc
  }, [])
    .map((section) => ({
      ...section,
      rows: section.rows.sort((a, b) => String(a?.full_name || '').localeCompare(String(b?.full_name || ''))),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const realtimeCategoryCards = [
    {
      key: 'onTime' as const,
      title: 'On-Time',
      value: realtimeStats.onTime,
      subtitle: 'Arrived as scheduled',
      icon: UserCheck,
      iconClass: 'text-green-600 dark:text-green-400',
      iconBgClass: 'bg-green-100 dark:bg-green-900/30',
      valueClass: 'text-green-600 dark:text-green-400',
      borderClass: 'border-green-200/70 dark:border-green-800/40',
      surfaceClass: 'from-green-50/80 to-white dark:from-green-950/25 dark:to-gray-900',
    },
    {
      key: 'late' as const,
      title: 'Late',
      value: realtimeStats.late,
      subtitle: 'Needs attention',
      icon: Clock,
      iconClass: 'text-amber-600 dark:text-amber-400',
      iconBgClass: 'bg-amber-100 dark:bg-amber-900/30',
      valueClass: 'text-amber-600 dark:text-amber-400',
      borderClass: 'border-amber-200/70 dark:border-amber-800/40',
      surfaceClass: 'from-amber-50/80 to-white dark:from-amber-950/25 dark:to-gray-900',
    },
    {
      key: 'absent' as const,
      title: 'Absent',
      value: realtimeStats.absent,
      subtitle: 'No logs today',
      icon: UserX,
      iconClass: 'text-rose-600 dark:text-rose-400',
      iconBgClass: 'bg-rose-100 dark:bg-rose-900/30',
      valueClass: 'text-rose-600 dark:text-rose-400',
      borderClass: 'border-rose-200/70 dark:border-rose-800/40',
      surfaceClass: 'from-rose-50/80 to-white dark:from-rose-950/25 dark:to-gray-900',
    },
    {
      key: 'onLeave' as const,
      title: 'On Leave',
      value: realtimeStats.onLeave,
      subtitle: 'Approved leave',
      icon: AlertTriangle,
      iconClass: 'text-orange-600 dark:text-orange-400',
      iconBgClass: 'bg-orange-100 dark:bg-orange-900/30',
      valueClass: 'text-orange-600 dark:text-orange-400',
      borderClass: 'border-orange-200/70 dark:border-orange-800/40',
      surfaceClass: 'from-orange-50/80 to-white dark:from-orange-950/25 dark:to-gray-900',
    },
    {
      key: 'total' as const,
      title: 'Total',
      value: realtimeStats.total,
      subtitle: 'Employees in scope',
      icon: Users,
      iconClass: 'text-blue-600 dark:text-blue-400',
      iconBgClass: 'bg-blue-100 dark:bg-blue-900/30',
      valueClass: 'text-blue-600 dark:text-blue-400',
      borderClass: 'border-blue-200/70 dark:border-blue-800/40',
      surfaceClass: 'from-blue-50/80 to-white dark:from-blue-950/25 dark:to-gray-900',
    },
  ]

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6 px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-6 animate-fadeInUp">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Attendance & Monitoring</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">Track attendance logs and real-time monitoring</p>
      </div>

      <Tabs defaultValue="logs" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="logs">Attendance Logs</TabsTrigger>
          <TabsTrigger value="realtime">Real-Time Monitoring</TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="space-y-6 mt-6">
      {/* MOBILE HEADER - Simplified Design */}
      <div className="block lg:hidden space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{t('attendance.title')}</h2>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mt-0.5">{t('attendance.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border rounded-lg px-3 py-2">
              <Switch
                checked={autoRefreshLogs}
                onCheckedChange={setAutoRefreshLogs}
                className="data-[state=checked]:bg-green-600"
              />
              <Select value={String(autoRefreshInterval)} onValueChange={(v) => setAutoRefreshInterval(Number(v))}>
                <SelectTrigger className="h-7 w-[70px] text-xs border-0 p-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5s</SelectItem>
                  <SelectItem value="10">10s</SelectItem>
                  <SelectItem value="15">15s</SelectItem>
                  <SelectItem value="30">30s</SelectItem>
                  <SelectItem value="60">60s</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button 
              onClick={() => loadData(false)} 
              className="btn-sti-primary h-10 sm:h-11 px-3 sm:px-4 touch-manipulation shrink-0"
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 sm:h-5 sm:w-5 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="text-xs sm:text-sm">Refresh</span>
            </Button>
          </div>
        </div>
      </div>

      {/* DESKTOP HEADER - Simplified Design */}
      <div className="hidden lg:flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">{t('attendance.title')}</h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 mt-1">{t('attendance.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 bg-white dark:bg-gray-800 border rounded-lg px-4 py-2.5">
            <Switch
              checked={autoRefreshLogs}
              onCheckedChange={setAutoRefreshLogs}
              className="data-[state=checked]:bg-green-600"
            />
            <span className="text-sm font-medium">Auto-refresh</span>
            <Select value={String(autoRefreshInterval)} onValueChange={(v) => setAutoRefreshInterval(Number(v))}>
              <SelectTrigger className="h-8 w-[75px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5s</SelectItem>
                <SelectItem value="10">10s</SelectItem>
                <SelectItem value="15">15s</SelectItem>
                <SelectItem value="30">30s</SelectItem>
                <SelectItem value="60">60s</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button 
            onClick={() => loadData(false)} 
            className="btn-sti-primary h-11 sm:h-12 px-4 sm:px-6 text-sm sm:text-base touch-manipulation"
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 sm:h-5 sm:w-5 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? t('attendance.refreshing') : t('attendance.refresh_data')}
          </Button>
        </div>
      </div>

      {/* Attendance Category - Unified Redesign */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">Attendance Categories</h3>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Click a category to view employee details.</p>
          </div>
          <Badge variant="outline" className="text-xs sm:text-sm">
            {attendanceCategoryCards.length} Metrics
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5 sm:gap-3">
          {attendanceCategoryCards.map((card) => {
            const Icon = card.icon
            return (
              <Card
                key={card.key}
                onClick={() => openKpiModal(card.key)}
                className={cn(
                  'group relative overflow-hidden border shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 cursor-pointer h-full',
                  'bg-linear-to-br',
                  card.borderClass,
                  card.surfaceClass,
                )}
              >
                <CardContent className="p-2.5 sm:p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className={cn('inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg', card.iconBgClass)}>
                      <Icon className={cn('h-4 w-4', card.iconClass)} />
                    </div>
                    <span className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200">View</span>
                  </div>

                  <div className="mt-2.5 space-y-1">
                    <p className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 leading-tight">{card.title}</p>
                    <p className={cn('text-2xl sm:text-[28px] font-bold tracking-tight', card.valueClass)}>{card.value}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug line-clamp-2">{card.subtitle}</p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Attendance Logs Card - Mobile Responsive */}
      <Card className="relative isolate">
        {/* MOBILE HEADER - Compact */}
        <CardHeader className="block lg:hidden px-3 sm:px-4 pt-3 sm:pt-4 pb-2 sm:pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              {t('attendance.logs')}
            </CardTitle>
            <Badge variant="secondary" className="text-xs px-2 py-0.5">
              {filteredLogs.length}
            </Badge>
          </div>
        </CardHeader>
        
        {/* DESKTOP HEADER - Full */}
        <CardHeader className="hidden lg:block px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl flex-wrap">
            <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('attendance.logs')}
            <Badge variant="secondary" className="ml-2 text-xs sm:text-sm">
              {filteredLogs.length} {t('attendance.logs_word')}
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">{t('attendance.realtime')}</CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-4 md:px-6 pb-3 sm:pb-4 md:pb-6">
          {/* MOBILE FILTERS - Simplified */}
          <div className="block lg:hidden space-y-3 relative pointer-events-auto">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none z-10" />
              <Input
                placeholder={t('attendance.search_placeholder')}
                value={searchTerm}
                onChange={(e) => startTransition(() => setSearchTerm(e.target.value))}
                className="pl-10 h-11 text-sm touch-manipulation"
              />
            </div>
            
            {/* Date and Department Filters */}
            <div className="grid grid-cols-2 gap-2">
              {/* Date Picker */}
              <div className="relative">
                <CalendarIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none z-10" />
                <Input
                  type="date"
                  value={selectedDate ? formatInTimeZone(selectedDate, PHILIPPINES_TIMEZONE, 'yyyy-MM-dd') : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      const [year, month, day] = e.target.value.split('-').map(Number)
                      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+08:00`
                      const date = new Date(dateStr)
                      setSelectedDate(date)
                      setStickToToday(false)
                    }
                  }}
                  className="pl-9 cursor-pointer h-11 text-sm touch-manipulation"
                />
              </div>
              
              {/* Department Filter */}
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger className="w-full h-11 text-sm touch-manipulation">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Departments">All Departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Today Button */}
            <Button 
              variant="outline" 
              type="button"
              className="w-full h-11 text-sm touch-manipulation"
              onClick={() => {
                const now = new Date()
                setSelectedDate(now)
                setStickToToday(true)
              }}
            >
              <CalendarIcon className="h-4 w-4 mr-2" />
              {t('attendance.today')}
            </Button>
          </div>

          {/* DESKTOP FILTERS - Simplified */}
          <div className="hidden lg:block relative mb-4 pointer-events-auto">
            {/* Search Bar - Full Width */}
            <div className="mb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder={t('attendance.search_placeholder')}
                  value={searchTerm}
                  onChange={(e) => startTransition(() => setSearchTerm(e.target.value))}
                  className="pl-10 h-11 sm:h-12 text-sm sm:text-base w-full"
                />
              </div>
            </div>
            
            {/* Date, Today Button, and Department Filter */}
            <div className="grid grid-cols-3 gap-3">
              {/* Date Picker */}
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none z-10" />
                <Input
                  type="date"
                  value={selectedDate ? formatInTimeZone(selectedDate, PHILIPPINES_TIMEZONE, 'yyyy-MM-dd') : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      const [year, month, day] = e.target.value.split('-').map(Number)
                      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+08:00`
                      const date = new Date(dateStr)
                      setSelectedDate(date)
                      setStickToToday(false)
                    }
                  }}
                  className="pl-10 cursor-pointer h-11 sm:h-12 text-sm sm:text-base touch-manipulation w-full"
                />
              </div>
              
              {/* Today Button */}
              <Button 
                variant="outline" 
                type="button"
                className="whitespace-nowrap h-11 sm:h-12 text-sm sm:text-base touch-manipulation"
                onClick={() => {
                  const now = new Date()
                  setSelectedDate(now)
                  setStickToToday(true)
                }}
              >
                <CalendarIcon className="h-4 w-4 mr-2" />
                {t('attendance.today')}
              </Button>
              
              {/* Department Filter */}
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger className="w-full h-11 sm:h-12 text-sm sm:text-base touch-manipulation">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Departments">All Departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto border rounded-lg">
            <Table className="w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center w-[20%]">{t('attendance.employee')}</TableHead>
                  <TableHead className="text-center w-[12%]">{t('attendance.school_id')}</TableHead>
                  <TableHead className="text-center w-[15%]">{t('attendance.department')}</TableHead>
                  <TableHead className="text-center w-[12%]">{t('attendance.log_type')}</TableHead>
                  <TableHead className="text-center w-[12%]">{t('attendance.time')}</TableHead>
                  <TableHead className="text-center w-[15%]">{t('attendance.date')}</TableHead>
                  <TableHead className="text-center w-[14%]">{t('attendance.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
                      {attendanceLogs.length === 0
                        ? t('attendance.no_logs')
                        : t('attendance.no_match')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow 
                      key={log.id || log.log_id}
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      onClick={() => {
                        if (log.employee_id && log.date) {
                          setSelectedLogForSchedule(log)
                          setScheduleDialogOpen(true)
                          loadEmployeeScheduleComparison(log)
                        }
                      }}
                    >
                      <TableCell className="text-center align-middle">
                        <p className="font-medium dark:text-gray-100 text-sm">{log.employees?.full_name || t('attendance.unknown_employee')}</p>
                      </TableCell>
                      <TableCell className="text-center align-middle">
                        <div className="flex justify-center">
                          <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-1 rounded border border-slate-200 dark:border-slate-700">{log.employees?.school_id || '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center dark:text-gray-100 text-sm align-middle">{log.employees?.department || t('attendance.na')}</TableCell>
                      <TableCell className="text-center align-middle">
                        <div className="flex flex-col items-center justify-center gap-1">
                          {getLogTypeBadge(log.log_type, log)}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium dark:text-gray-100 text-center text-sm align-middle">
                        {shouldHideLogTime(log) ? '-' : formatLogTime(log.log_time, log.log_type)}
                      </TableCell>
                      <TableCell className="text-center align-middle">
                        <p className="dark:text-gray-100 text-xs">{log.date ? formatDateTime(log.date, 'date') : '-'}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{formatDayOfWeek(log.date)}</p>
                      </TableCell>
                      <TableCell className="text-center align-middle">{getStatusBadge(log)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* MOBILE CARD VIEW - Enhanced Design */}
          <div className="lg:hidden space-y-2 sm:space-y-3">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <FileText className="h-12 w-12 mx-auto mb-3 text-gray-400 dark:text-gray-600" />
                <p className="text-sm font-medium">
                  {attendanceLogs.length === 0
                    ? t('attendance.no_logs')
                    : t('attendance.no_match')}
                </p>
              </div>
            ) : (
              filteredLogs.map((log) => (
                <Card 
                  key={log.id || log.log_id}
                  className="border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-all touch-manipulation active:scale-[0.98]"
                  onClick={() => {
                    if (log.employee_id && log.date) {
                      setSelectedLogForSchedule(log)
                      setScheduleDialogOpen(true)
                      loadEmployeeScheduleComparison(log)
                    }
                  }}
                >
                  <CardContent className="p-3 sm:p-4">
                    {/* Header Row - Name and Status */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-base sm:text-lg dark:text-gray-100 truncate">
                          {log.employees?.full_name || t('attendance.unknown_employee')}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {log.employees?.department || t('attendance.na')}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {getLogTypeBadge(log.log_type, log)}
                        </div>
                      </div>
                      <div className="ml-2 shrink-0">{getStatusBadge(log)}</div>
                    </div>

                    {/* Info Grid - 2 Columns */}
                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      {/* School ID */}
                      <div className="bg-blue-50 dark:bg-blue-950/20 p-2 sm:p-2.5 rounded-lg border border-blue-100 dark:border-blue-900">
                        <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">School ID</p>
                        <span className="font-mono text-xs sm:text-sm font-semibold text-blue-900 dark:text-blue-100">
                          {log.employees?.school_id || '-'}
                        </span>
                      </div>
                      
                      {/* Log Type */}
                      <div className="bg-purple-50 dark:bg-purple-950/20 p-2 sm:p-2.5 rounded-lg border border-purple-100 dark:border-purple-900 flex flex-col justify-center">
                        <p className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-1">Log Type</p>
                        <div className="shrink-0">{getLogTypeBadge(log.log_type, log)}</div>
                      </div>
                      
                      {/* Time */}
                      <div className="bg-green-50 dark:bg-green-950/20 p-2 sm:p-2.5 rounded-lg border border-green-100 dark:border-green-900">
                        <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">Actual Time</p>
                        <p className="text-sm sm:text-base font-bold text-green-900 dark:text-green-100">
                          {shouldHideLogTime(log) ? '-' : formatLogTime(log.log_time, log.log_type)}
                        </p>
                      </div>
                      
                      {/* Date */}
                      <div className="bg-orange-50 dark:bg-orange-950/20 p-2 sm:p-2.5 rounded-lg border border-orange-100 dark:border-orange-900">
                        <p className="text-xs font-medium text-orange-700 dark:text-orange-300 mb-1">Date</p>
                        <p className="text-xs sm:text-sm font-semibold text-orange-900 dark:text-orange-100">
                          {log.date ? formatDateTime(log.date, 'date') : '-'}
                        </p>
                        <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                          {formatDayOfWeek(log.date)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
          {/* Pagination - Mobile Responsive */}
          {totalPages > 1 && (
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
              <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('attendance.page_of')} {page} {t('attendance.of')} {totalPages}</div>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <Button 
                  variant="outline" 
                  disabled={page === 1} 
                  onClick={() => setPage((p) => Math.max(1, p - 1))} 
                  className="dark:border-gray-700 dark:hover:bg-gray-800 h-9 sm:h-10 text-xs sm:text-sm touch-manipulation"
                >
                  {t('attendance.prev')}
                </Button>
                <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-center">
                  {Array.from({ length: totalPages }).slice(0, Math.min(totalPages, 7)).map((_, idx) => {
                    const target = idx + 1
                    return (
                      <Button 
                        key={idx} 
                        variant={target === page ? "default" : "outline"} 
                        onClick={() => setPage(target)} 
                        className={`${target !== page ? "dark:border-gray-700 dark:hover:bg-gray-800" : ""} h-9 sm:h-10 w-9 sm:w-10 text-xs sm:text-sm touch-manipulation`}
                      >
                        {target}
                      </Button>
                    )
                  })}
                </div>
                <Button 
                  variant="outline" 
                  disabled={page === totalPages} 
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))} 
                  className="dark:border-gray-700 dark:hover:bg-gray-800 h-9 sm:h-10 text-xs sm:text-sm touch-manipulation"
                >
                  {t('attendance.next')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schedule Comparison Dialog - Mobile Swipeable Drawer */}
      <MobileDrawer open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <MobileDrawerContent onClose={() => setScheduleDialogOpen(false)} className="w-[95vw] sm:w-full max-w-4xl">
          <MobileDrawerHeader className="pb-4">
            <MobileDrawerTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
              Attendance vs Schedule Comparison
            </MobileDrawerTitle>
          </MobileDrawerHeader>
          {loadingSchedule ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
            </div>
          ) : selectedLogForSchedule && employeeScheduleData ? (
            <div className="space-y-6 pb-4">
              {/* Employee Info - Mobile Responsive */}
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-base sm:text-lg">{selectedLogForSchedule.employees?.full_name || 'Unknown Employee'}</h3>
                      <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {selectedLogForSchedule.employees?.school_id || '-'} • {selectedLogForSchedule.employees?.department || '-'}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs sm:text-sm whitespace-nowrap">
                      {formatDateTime(selectedLogForSchedule.date, 'date')} ({formatDayOfWeek(selectedLogForSchedule.date)})
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Schedule Display - Teaching staff: always show teaching/exam schedules when available */}
              {selectedEmployee && String(selectedEmployee.staff_type || '').toLowerCase() === 'teaching' && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <CalendarIcon className="h-5 w-5 text-blue-600" />
                      {(() => {
                        const hasClass = (employeeScheduleData?.teachingSchedules || []).length > 0
                        const hasExam = (employeeScheduleData?.examSchedules || []).length > 0
                        const hasSub = (employeeScheduleData?.substitutionSchedules || []).length > 0

                        if (hasExam && !hasClass && !hasSub) return 'Exam Schedule'
                        if (hasSub && !hasClass && !hasExam) return 'Substituted Schedule'
                        if (hasClass && !hasExam && !hasSub) return 'Class Schedule'
                        if (hasClass || hasExam || hasSub) return 'Schedule Details'
                        return 'Attendance Schedule'
                      })()} ({(() => {
                        try {
                          const dStr = deriveLogDate(selectedLogForSchedule)
                          if (dStr) {
                            const d = parse(dStr, 'yyyy-MM-dd', new Date())
                            return format(d, 'MMMM d, yyyy')
                          }
                        } catch {}
                        // Fallback to today if something goes wrong
                        return format(new Date(), 'MMMM d, yyyy')
                      })()})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const hasClassSchedule = (employeeScheduleData.teachingSchedules || []).length > 0;
                      const hasExamSchedule = (employeeScheduleData.examSchedules || []).length > 0;
                      const hasSubstitution = (employeeScheduleData.substitutionSchedules || []).length > 0;

                      // If there are no class/exam/substitution schedules for the selected date, show Admin Time range from attendance_logs
                      if (!hasClassSchedule && !hasExamSchedule && !hasSubstitution) {
                        const dayLogs = (employeeScheduleData.attendanceLogs || []) as any[]
                        const inLogs = dayLogs.filter(l => l && l.log_type === 'IN' && l.log_time && !isAbsentLog(l))
                        const outLogs = dayLogs.filter(l => l && l.log_type === 'OUT' && l.log_time)

                        // Earliest IN, Latest OUT
                        const earliestIn = inLogs.length > 0 ? inLogs.reduce((min, l) => (new Date(l.log_time) < new Date(min.log_time) ? l : min), inLogs[0]) : null
                        const latestOut = outLogs.length > 0 ? outLogs.reduce((max, l) => (new Date(l.log_time) > new Date(max.log_time) ? l : max), outLogs[0]) : null

                        const displayIn = earliestIn ? formatLogTime(earliestIn.log_time, 'IN') : 'Not Timed In Yet'
                        const displayOut = latestOut ? formatLogTime(latestOut.log_time, 'OUT') : 'Not Timed Out Yet'

                        return (
                          <div className="text-center py-8 bg-indigo-50 dark:bg-indigo-950/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
                            <Clock className="h-10 w-10 mx-auto mb-3 text-indigo-600 dark:text-indigo-400" />
                            <p className="font-semibold text-indigo-700 dark:text-indigo-300">Admin Time Only</p>
                            <p className="text-xs text-indigo-700/80 dark:text-indigo-300/90 mt-2">
                              {displayIn} - {displayOut}
                            </p>
                            {/* If there were absolutely no logs captured for the day, give a subtle hint */}
                            {dayLogs.length === 0 && (
                              <p className="text-[11px] mt-2 text-indigo-600/70 dark:text-indigo-300/70">No attendance logs found for this date.</p>
                            )}
                          </div>
                        )
                      }

                      return (
                        <div className="space-y-4">
                          {/* Substitution Schedules */}
                          {hasSubstitution && (
                            <div>
                              <h4 className="font-medium mb-2 text-xs sm:text-sm text-yellow-600 dark:text-yellow-400">Class Substitution</h4>
                              {(employeeScheduleData.substitutionSchedules || []).map((sub: any) => (
                                <div key={sub.id} className="bg-yellow-50 dark:bg-yellow-950/20 p-3 sm:p-4 rounded-lg mb-2 border border-yellow-200 dark:border-yellow-800">
                                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
                                    <div className="flex-1">
                                      <p className="font-medium text-sm sm:text-base">{sub.start_end_display}</p>
                                      <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
                                        {sub.role === 'Original' ? `Substituted by: ${sub.counterpart || 'N/A'}` : `Substituting for: ${sub.counterpart || 'N/A'}`}
                                      </p>
                                      {sub.reason && (
                                        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-500 mt-1">Reason: {sub.reason}</p>
                                      )}
                                    </div>
                                    <div className="text-left sm:text-right w-full sm:w-auto">
                                      <Badge variant="outline" className="text-[10px] sm:text-xs">Approved</Badge>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Exam Schedules */}
                          {hasExamSchedule && (
                            <div>
                              <h4 className="font-medium mb-2 text-xs sm:text-sm text-green-600 dark:text-green-400">Exam Schedule</h4>
                              {(employeeScheduleData.examSchedules || []).map((sched: any, idx: number) => (
                                <div key={idx} className="bg-green-50 dark:bg-green-950/20 p-3 sm:p-4 rounded-lg mb-2 border border-green-200 dark:border-green-800">
                                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
                                    <div className="flex-1">
                                      <p className="font-medium text-sm sm:text-base">{sched.subject_name || sched.courses?.name || 'Exam'}</p>
                                      <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
                                        Section: {sched.section || 'N/A'} • Room: {sched.rooms?.code || sched.room_code || 'N/A'}
                                      </p>
                                    </div>
                                    <div className="text-left sm:text-right w-full sm:w-auto">
                                      <p className="font-semibold text-sm sm:text-base">
                                        {(() => {
                                          try {
                                            const start = sched.time_start?.substring(0, 5) || '00:00';
                                            const end = sched.time_end?.substring(0, 5) || '00:00';
                                            const startTime = parse(start, 'HH:mm', new Date());
                                            const endTime = parse(end, 'HH:mm', new Date());
                                            return `${format(startTime, 'h:mm a')} - ${format(endTime, 'h:mm a')}`;
                                          } catch {
                                            return `${sched.time_start?.substring(0, 5) || '00:00'} - ${sched.time_end?.substring(0, 5) || '00:00'}`;
                                          }
                                        })()}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Class Schedules */}
                          {hasClassSchedule && (
                            <div>
                              <h4 className="font-medium mb-2 text-xs sm:text-sm text-blue-600 dark:text-blue-400">Teaching Schedule</h4>
                              {(employeeScheduleData.teachingSchedules || []).map((sched: any, idx: number) => (
                                <div key={idx} className="bg-blue-50 dark:bg-blue-950/20 p-3 sm:p-4 rounded-lg mb-2 border border-blue-200 dark:border-blue-800">
                                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
                                    <div className="flex-1">
                                      <p className="font-medium text-sm sm:text-base">{sched.subject_name || sched.courses?.name || 'Class'}</p>
                                      <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
                                        {sched.class_type || ''} • Section: {sched.section || 'N/A'} • Room: {sched.rooms?.code || sched.room_code || 'N/A'}
                                      </p>
                                    </div>
                                    <div className="text-left sm:text-right w-full sm:w-auto">
                                      <p className="font-semibold text-sm sm:text-base">
                                        {(() => {
                                          try {
                                            const start = sched.time_start?.substring(0, 5) || '00:00';
                                            const end = sched.time_end?.substring(0, 5) || '00:00';
                                            const startTime = parse(start, 'HH:mm', new Date());
                                            const endTime = parse(end, 'HH:mm', new Date());
                                            return `${format(startTime, 'h:mm a')} - ${format(endTime, 'h:mm a')}`;
                                          } catch {
                                            return `${sched.time_start?.substring(0, 5) || '00:00'} - ${sched.time_end?.substring(0, 5) || '00:00'}`;
                                          }
                                        })()}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </CardContent>
                </Card>
              )}
            {/* Non-Teaching Staff Work Schedule */}
            {selectedEmployee && String(selectedEmployee.staff_type || '').toLowerCase() === 'non-teaching' && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5 text-green-600" />
                    Work Schedule
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-green-50 dark:bg-green-950/20 p-4 sm:p-5 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-center justify-center">
                      <div className="text-center">
                        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2">Working Schedule</p>
                        <p className="font-semibold text-lg sm:text-2xl text-green-700 dark:text-green-300">
                          {formatScheduledTime(selectedEmployee)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          {selectedEmployee.department || 'Department'} • {selectedEmployee.employment_type || 'Regular'}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : null}
        <div className="flex justify-end pt-4">
          <Button onClick={() => setScheduleDialogOpen(false)}>
            Close
          </Button>
        </div>
      </MobileDrawerContent>
    </MobileDrawer>
  </TabsContent>

  {/* Real-Time Monitoring Tab */}
  <TabsContent value="realtime" className="mt-6">
    <div className="grid gap-6">
      {/* Stats Cards */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">Real-Time Categories</h3>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Live attendance distribution across your current scope.</p>
          </div>
          <Badge variant="outline" className="text-xs sm:text-sm">{realtimeCategoryCards.length} Metrics</Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5 gap-2.5 sm:gap-3">
          {realtimeCategoryCards.map((card) => {
            const Icon = card.icon
            return (
              <Card
                key={card.key}
                onClick={() => {
                  setActiveRealtimeMetric(card.key)
                  setRealtimeModalOpen(true)
                }}
                className={cn(
                  'group relative overflow-hidden border shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 cursor-pointer h-full',
                  'bg-linear-to-br',
                  card.borderClass,
                  card.surfaceClass,
                )}
              >
                <CardContent className="p-2.5 sm:p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className={cn('inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg', card.iconBgClass)}>
                      <Icon className={cn('h-4 w-4', card.iconClass)} />
                    </div>
                    <span className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200">View</span>
                  </div>

                  <div className="mt-2.5 space-y-1">
                    <p className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 leading-tight">{card.title}</p>
                    <p className={cn('text-2xl sm:text-[28px] font-bold tracking-tight', card.valueClass)}>{card.value}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug line-clamp-2">{card.subtitle}</p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Recent Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Attendance Logs
            <Badge variant="outline" className="ml-auto">
              Last updated: {format(realtimeLastUpdate, 'h:mm:ss a')}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {realtimeLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : realtimeRecentLogs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No attendance logs yet today
            </div>
          ) : (
            <div className="space-y-2">
              {realtimeRecentLogs.slice(0, 10).map((log) => {
                const statusLabel = getRealtimeLogStatusLabel(log)
                const statusDot = statusLabel === 'Admin Time'
                  ? 'bg-indigo-500'
                  : statusLabel === 'Approved Leave'
                    ? 'bg-purple-500'
                    : statusLabel === 'Late'
                      ? 'bg-amber-500'
                      : statusLabel === 'Undertime'
                        ? 'bg-orange-500'
                        : statusLabel === 'Absent'
                          ? 'bg-rose-500'
                          : 'bg-green-500'
                return (
                <div
                  key={log.log_id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      statusDot
                    )} />
                    <div>
                      <p className="font-medium">{log.employees?.full_name}</p>
                      <p className="text-sm text-gray-500">{log.employees?.department}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={log.log_type === 'IN' ? 'default' : 'secondary'}>
                      {log.log_type}
                    </Badge>
                    <p className="text-sm text-gray-500 mt-1">
                      {isTimedAttendanceLog(log) ? formatLogTime(log.log_time, log.log_type) : '-'}
                    </p>
                    <Badge variant="outline" className={`mt-1 text-[10px] ${getRealtimeLogStatusClass(statusLabel)}`}>
                      {statusLabel}
                    </Badge>
                  </div>
                </div>
              )})}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Not Logged In Yet */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-rose-600" />
            Not Logged In Yet ({realtimeNotLoggedIn.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {realtimeNotLoggedIn.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              All employees have logged in today
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {realtimeNotLoggedIn
                .filter((emp: any) => String(emp?.staff_type || '').toLowerCase() === 'teaching')
                .map((emp: any) => {
                  const sched = getRealtimeDayContext(emp)
                  return (
                <div
                  key={emp.employee_id}
                  className="p-3 bg-rose-50 dark:bg-rose-950/20 rounded-lg border border-rose-200 dark:border-rose-800 cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-950/30 transition-colors"
                  onClick={() => emp && handleEmployeeClick(emp)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-rose-900 dark:text-rose-100 truncate">{emp.full_name}</p>
                      <p className="text-sm text-rose-600 dark:text-rose-400 mt-1 truncate">{emp.department}</p>
                      <p className="text-xs text-rose-500 dark:text-rose-500 mt-1">{emp.school_id}</p>
                      {sched.detail ? (
                        <p className="text-[11px] text-rose-600/80 dark:text-rose-300/80 mt-1 line-clamp-2">{sched.detail}</p>
                      ) : null}
                    </div>
                    <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${sched.badgeClass}`}>
                      {sched.label}
                    </Badge>
                  </div>
                </div>
              )})}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Not Logged Out Yet */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600" />
            Not Logged Out Yet ({realtimeNotLoggedOut.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {realtimeNotLoggedOut.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              All employees have logged out
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {realtimeNotLoggedOut
                .filter((emp: any) => String(emp?.staff_type || '').toLowerCase() === 'teaching')
                .map((emp: any) => {
                  const sched = getRealtimeDayContext(emp)
                  return (
                <div
                  key={emp?.employee_id}
                  className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-950/30 transition-colors"
                  onClick={() => emp && handleEmployeeClick(emp)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-amber-900 dark:text-amber-100 truncate">{emp?.full_name}</p>
                      <p className="text-sm text-amber-600 dark:text-amber-400 mt-1 truncate">{emp?.department}</p>
                      <p className="text-xs text-amber-500 dark:text-amber-500 mt-1">{emp?.school_id}</p>
                      {sched.detail ? (
                        <p className="text-[11px] text-amber-600/80 dark:text-amber-300/80 mt-1 line-clamp-2">{sched.detail}</p>
                      ) : null}
                    </div>
                    <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${sched.badgeClass}`}>
                      {sched.label}
                    </Badge>
                  </div>
                </div>
              )})}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  </TabsContent>

  {/* Employee Profile Drawer for Real-Time Monitoring */}
  <MobileDrawer open={employeeProfileOpen} onOpenChange={setEmployeeProfileOpen}>
    <MobileDrawerContent onClose={() => setEmployeeProfileOpen(false)} className="w-[95vw] sm:w-full max-w-2xl">
      <MobileDrawerHeader className="pb-4">
        <MobileDrawerTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <Users className="h-4 w-4 sm:h-5 sm:w-5" />
          Employee Profile
        </MobileDrawerTitle>
      </MobileDrawerHeader>
      {selectedEmployee && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-2">
                <h3 className="font-bold text-lg">{selectedEmployee.full_name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{selectedEmployee.department}</p>
                <p className="text-xs text-gray-500">{selectedEmployee.school_id} • {selectedEmployee.employment_status || selectedEmployee.staff_type}</p>
              </div>
            </CardContent>
          </Card>

          {(() => {
            const context = getRealtimeDayContext(selectedEmployee)
            if (!context?.isSpecial && !context?.detail) return null
            return (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-md flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    Day Policy
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">{context.label}</p>
                      {context.detail ? (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{context.detail}</p>
                      ) : null}
                    </div>
                    <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${context.badgeClass}`}>
                      {context.label}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )
          })()}

          {loadingEmployeeSchedules ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
            </div>
          ) : employeeSchedules ? (
            <div className="space-y-4">
              {employeeSchedules.restDay ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-md flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-slate-600" />
                      Expected Schedule
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8 bg-slate-50 dark:bg-slate-950/20 rounded-lg border border-slate-200 dark:border-slate-800">
                      <p className="font-semibold text-slate-700 dark:text-slate-200">Rest Day (Sunday)</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">No work schedules are expected today.</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
              String(employeeSchedules.staffType || selectedEmployee?.staff_type || '').toLowerCase() === 'non-teaching' ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-md flex items-center gap-2">
                      <Clock className="h-4 w-4 text-emerald-600" />
                      Work Schedule
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800">
                      <p className="font-medium text-sm">
                        {employeeSchedules.scheduleTimeIn && employeeSchedules.scheduleTimeOut
                          ? `${employeeSchedules.scheduleTimeIn.substring(0, 5)} - ${employeeSchedules.scheduleTimeOut.substring(0, 5)}`
                          : 'Dynamic / Event-based shift'}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Non-teaching staff do not use class or exam schedule blocks in this modal.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
              {employeeSchedules.examSchedules.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-md flex items-center gap-2">
                      <GraduationCap className="h-4 w-4 text-green-600" />
                      Today&apos;s Exam Schedule (Priority)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {employeeSchedules.examSchedules.map((sched: any, idx: number) => (
                      <div key={idx} className="bg-green-50 dark:bg-green-950/20 p-3 rounded-lg mb-2 border border-green-200 dark:border-green-800">
                        <p className="font-medium text-sm">{sched.subject_name || 'Exam'}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          Section: {sched.section || 'N/A'} • Room: {sched.room_code || 'N/A'}
                        </p>
                        {(String(sched?.status || '').toLowerCase() === 'substituted' || sched?.substitute_employee_id) && (
                          <p className="text-[10px] sm:text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                            Substituted schedule
                          </p>
                        )}
                        <p className="text-xs font-semibold mt-1">
                          {(() => {
                            try {
                              const start = sched.time_start?.substring(0, 5) || '00:00';
                              const end = sched.time_end?.substring(0, 5) || '00:00';
                              const startTime = parse(start, 'HH:mm', new Date());
                              const endTime = parse(end, 'HH:mm', new Date());
                              return `${format(startTime, 'h:mm a')} - ${format(endTime, 'h:mm a')}`;
                            } catch {
                              return `${sched.time_start?.substring(0, 5) || ''} - ${sched.time_end?.substring(0, 5) || ''}`;
                            }
                          })()}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {(employeeSchedules.substitutionSchedules || []).length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-md flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-yellow-600" />
                      Today&apos;s Substitutions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(employeeSchedules.substitutionSchedules || []).map((sub: any, idx: number) => (
                      <div key={`${sub?.id || idx}`} className="bg-yellow-50 dark:bg-yellow-950/20 p-3 rounded-lg mb-2 border border-yellow-200 dark:border-yellow-800">
                        <p className="font-medium text-sm">{sub?.start_end_display || 'Substitution Block'}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {sub?.role === 'Original' ? `Substituted by: ${sub?.counterpart || 'N/A'}` : `Substituting for: ${sub?.counterpart || 'N/A'}`}
                        </p>
                        {sub?.reason && (
                          <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-500 mt-1">Reason: {sub.reason}</p>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {(employeeSchedules.substitutionSchedules || []).length > 0 && (employeeSchedules.effectiveSchedule || []).length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-md flex items-center gap-2">
                      <Clock className="h-4 w-4 text-indigo-600" />
                      Effective Schedule (After Substitution)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(employeeSchedules.effectiveSchedule || []).map((block, idx) => (
                      <div key={`${block.start}-${block.end}-${idx}`} className="bg-indigo-50 dark:bg-indigo-950/20 p-3 rounded-lg mb-2 border border-indigo-200 dark:border-indigo-800">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-sm">{block.start} - {block.end}</p>
                          <Badge variant="outline" className="text-[10px]">{block.label}</Badge>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {employeeSchedules.classSchedules.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-md flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-blue-600" />
                      Today&apos;s Class Schedule
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {employeeSchedules.classSchedules.map((sched: any, idx: number) => (
                      <div key={idx} className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg mb-2 border border-blue-200 dark:border-blue-800">
                        <p className="font-medium text-sm">{sched.subject_name || sched.course_code || 'Class'}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          Section: {sched.section || 'N/A'} • Room: {sched.room_code || 'N/A'}
                        </p>
                        <p className="text-xs font-semibold mt-1">
                          {(() => {
                            try {
                              const start = sched.time_start?.substring(0, 5) || '00:00';
                              const end = sched.time_end?.substring(0, 5) || '00:00';
                              const startTime = parse(start, 'HH:mm', new Date());
                              const endTime = parse(end, 'HH:mm', new Date());
                              return `${format(startTime, 'h:mm a')} - ${format(endTime, 'h:mm a')}`;
                            } catch {
                              return `${sched.time_start?.substring(0, 5) || ''} - ${sched.time_end?.substring(0, 5) || ''}`;
                            }
                          })()}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {employeeSchedules.classSchedules.length === 0 && employeeSchedules.examSchedules.length === 0 && (employeeSchedules.substitutionSchedules || []).length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No schedules found for today
                </div>
              )}
                </>
              )
              )}
            </div>
          ) : null}
        </div>
      )}
      <div className="flex justify-end pt-4">
        <Button onClick={() => setEmployeeProfileOpen(false)}>
          Close
        </Button>
      </div>
    </MobileDrawerContent>
  </MobileDrawer>

  {/* KPI Details Drawer */}
  <MobileDrawer open={kpiModalOpen} onOpenChange={setKpiModalOpen}>
    <MobileDrawerContent onClose={() => setKpiModalOpen(false)} className="w-[95vw] sm:w-full max-w-3xl">
      <MobileDrawerHeader className="pb-4">
        <MobileDrawerTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <span className={cn('inline-flex items-center justify-center rounded-md p-1.5', kpiModalMeta[activeKpiModal].iconBgClass)}>
            <ActiveKpiIcon className={cn('h-4 w-4 sm:h-5 sm:w-5', kpiModalMeta[activeKpiModal].iconClass)} />
          </span>
          {kpiModalMeta[activeKpiModal].title}
          <Badge variant="outline" className="ml-auto">
            {kpiModalFilteredRows.length}
          </Badge>
        </MobileDrawerTitle>
      </MobileDrawerHeader>

      <div className="space-y-4 pb-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">{kpiModalMeta[activeKpiModal].description}</p>

        {kpiModalFilteredRows.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              No employees found for this metric and filter.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3 max-h-[56vh] overflow-y-auto pr-1">
            {kpiModalSections.map((section) => (
              <Card key={section.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm sm:text-base flex items-center justify-between">
                    <span>{section.label}</span>
                    <Badge variant="outline">{section.rows.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {section.rows.map((emp: any) => (
                    <button
                      key={emp.employee_id}
                      type="button"
                      className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      onClick={() => {
                        setKpiModalOpen(false)
                        handleEmployeeClick(emp)
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-sm sm:text-base">{emp.full_name || 'Unknown Employee'}</p>
                          <p className="text-xs text-gray-500 mt-1">{emp.school_id || '-'}</p>
                          {activeKpiModal === 'onTime' && (
                            <div className="mt-2 space-y-1">
                              {((kpiEmployeeBuckets.onTimeDetailByEmployee?.get(Number(emp.employee_id)) || []) as any[]).map((detail, idx) => (
                                <p key={`${emp.employee_id}-${detail.type}-${idx}`} className="text-xs text-gray-600 dark:text-gray-300">
                                  <span className="font-semibold">{detail.type === 'IN' ? 'Time In' : 'Time Out'}</span>
                                  {`: expected ${detail.expectedDisplay}, actual ${detail.actualDisplay} • ${detail.scheduleSource} • ${detail.partneredStatus}`}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                        <Badge variant="secondary" className="capitalize">
                          {String(emp.staff_type || 'staff').toLowerCase()}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={() => setKpiModalOpen(false)}>Close</Button>
      </div>
    </MobileDrawerContent>
  </MobileDrawer>

  {/* Real-Time Metric Details Drawer */}
  <MobileDrawer open={realtimeModalOpen} onOpenChange={setRealtimeModalOpen}>
    <MobileDrawerContent onClose={() => setRealtimeModalOpen(false)} className="w-[95vw] sm:w-full max-w-3xl">
      <MobileDrawerHeader className="pb-4">
        <MobileDrawerTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <Activity className="h-4 w-4 sm:h-5 sm:w-5" />
          {realtimeModalMeta[activeRealtimeMetric].title}
          <Badge variant="outline" className="ml-auto">{realtimeModalFilteredRows.length}</Badge>
        </MobileDrawerTitle>
      </MobileDrawerHeader>

      <div className="space-y-4 pb-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">{realtimeModalMeta[activeRealtimeMetric].description}</p>

        {realtimeModalFilteredRows.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              No employees found for this metric and filter.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3 max-h-[56vh] overflow-y-auto pr-1">
            {realtimeModalSections.map((section) => (
              <Card key={section.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm sm:text-base flex items-center justify-between">
                    <span>{section.label}</span>
                    <Badge variant="outline">{section.rows.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {section.rows.map((emp: any) => (
                    <button
                      key={emp.employee_id}
                      type="button"
                      className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      onClick={() => {
                        setRealtimeModalOpen(false)
                        handleEmployeeClick(emp)
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-sm sm:text-base">{emp.full_name || 'Unknown Employee'}</p>
                          <p className="text-xs text-gray-500 mt-1">{emp.school_id || '-'}</p>
                        </div>
                        <Badge variant="secondary" className="capitalize">
                          {String(emp.staff_type || 'staff').toLowerCase()}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={() => setRealtimeModalOpen(false)}>Close</Button>
      </div>
    </MobileDrawerContent>
  </MobileDrawer>

</Tabs>
</div>
);
}
