"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Send, Clock, Eye, EyeOff, Search } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getEmployees, getEmployeeCutoffAttendance, getStaffTypeFilter } from "@/lib/offline-dashboard-client"
import type { Employee } from "@/lib/types/database.types"
import { Badge } from "@/components/ui/badge"
import { useLanguage } from "@/lib/language-context"
import { format } from "date-fns"
import { getManilaToday, parseManilaDate } from "@/lib/timezone-utils"

export default function EmailNotificationsPage() {
  const { t } = useLanguage()
  const { toast } = useToast()

  const [subject, setSubject] = useState("")
  const [isBulk, setIsBulk] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  // CRITICAL: Use Manila timezone to get today's date
  const todayManila = getManilaToday()
  const todayInit = parseManilaDate(todayManila)
  const [cutoffMonth, setCutoffMonth] = useState<string>(() => {
    // CRITICAL: Use Manila timezone for date calculations
    const y = todayInit.getFullYear(); let m = todayInit.getMonth()+1
    if (todayInit.getDate() >= 26) m = m + 1
    return `${todayInit.getFullYear() + Math.floor((m-1)/12)}-${String(((m-1)%12)+1).padStart(2,'0')}`
  })
  const [selectedHalf, setSelectedHalf] = useState<'first'|'second'>(() => {
    // CRITICAL: Use Manila timezone for date calculations
    const day = todayInit.getDate()
    return (day <= 10 ? 'first' : (day <= 25 ? 'second' : 'first'))
  })
  const [cutoffStart, setCutoffStart] = useState<string>("")
  const [cutoffEnd, setCutoffEnd] = useState<string>("")
  const [isSending, setIsSending] = useState(false)

  const [preview, setPreview] = useState<{present:number; absent:number; late:number; undertime:number} | null>(null)
  const [previewRows, setPreviewRows] = useState<Array<{date:string; timeIn:string|null; timeOut:string|null; status:string|null}>>([])
  const [showDetails, setShowDetails] = useState(false)
  const [bulkSearch, setBulkSearch] = useState("")
  const [hasActualAttendanceData, setHasActualAttendanceData] = useState(false)
  const [showEmailPreview, setShowEmailPreview] = useState(true)
  const selectedEmployee = useMemo(() => employees.find(e => e.employee_id === selectedId) || null, [employees, selectedId])

  const pad2 = (n: number) => String(n).padStart(2, '0')
  const monthBounds = (ym: string, half: 'first'|'second') => {
    const [yStr, mStr] = ym.split('-'); const y = Number(yStr); const m0 = Number(mStr)-1
    const lastPrev = new Date(y, m0, 0).getDate()
    const lastCurr = new Date(y, m0+1, 0).getDate()
    if (half === 'first') {
      const prevY = m0===0 ? y-1 : y
      const prevM = m0===0 ? 12 : m0
      return { start: `${prevY}-${pad2(prevM)}-26`, end: `${y}-${pad2(m0+1)}-10` }
    }
    return { start: `${y}-${pad2(m0+1)}-11`, end: `${y}-${pad2(m0+1)}-25` }
  }
  const isFirstHalfSelected = selectedHalf === 'first'
  const isSecondHalfSelected = selectedHalf === 'second'

  const applyHalf = (half: 'first' | 'second') => {
    if (selectedHalf === half) { toast({ title: 'Already applied', description: `Current month ${half==='first'?'1–15':'16–End'} is already selected.` }); return }
    setSelectedHalf(half)
    const b = monthBounds(cutoffMonth, half)
    setCutoffStart(b.start)
    setCutoffEnd(b.end)
  }

  const onMonthChange = (ym: string) => {
    if (!ym || !ym.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please select a valid month.',
        variant: 'destructive',
        duration: 3000
      })
      return
    }

    const [yStr, mStr] = ym.split('-')
    const year = Number(yStr)
    const month = Number(mStr)

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      toast({
        title: 'Validation Error',
        description: 'Invalid month format. Please select a valid month.',
        variant: 'destructive',
        duration: 3000
      })
      return
    }

    if (year < 2025) {
      toast({
        title: 'Year adjusted',
        description: 'Years before 2025 are not allowed. Adjusted to 2025-01.',
        duration: 3000
      })
      ym = '2025-01'
    }

    try {
    setCutoffMonth(ym)
    const b = monthBounds(ym, selectedHalf)
      if (b.start && b.end) {
    setCutoffStart(b.start)
    setCutoffEnd(b.end)
      } else {
        throw new Error('Invalid month bounds')
      }
    } catch (error: any) {
      console.error('[Email] Error calculating month bounds:', error)
      toast({
        title: 'Error',
        description: 'Failed to calculate cutoff dates. Please try again.',
        variant: 'destructive',
        duration: 5000
      })
    }
  }

  useEffect(() => {
    if (!cutoffStart || !cutoffEnd) {
      try {
      const b = monthBounds(cutoffMonth, selectedHalf)
        if (b.start && b.end) {
      setCutoffStart(b.start)
      setCutoffEnd(b.end)
    }
      } catch (error: any) {
        console.error('[Email] Error calculating month bounds in useEffect:', error)
      }
    }
    if (cutoffStart && cutoffEnd) {
    setSubject(`Attendance Report - ${cutoffStart} – ${cutoffEnd}`)
    } else {
      setSubject('Attendance Report')
    }
  }, [cutoffStart, cutoffEnd, cutoffMonth, selectedHalf])

  useEffect(() => {
    const run = async () => {
      try {
        // Get current user from localStorage
        const userStr = localStorage.getItem('rams_user')
        const currentUser = userStr ? JSON.parse(userStr) : null
        const staffTypeFilter = getStaffTypeFilter(currentUser?.email, currentUser?.role)
        
        const list = await getEmployees(true, true) // Include inactive employees and employees whose work hasn't started yet
        if (Array.isArray(list)) {
          const filteredList = staffTypeFilter
            ? list.filter((emp: any) => emp.staff_type === staffTypeFilter)
            : list
          
          setEmployees(filteredList)
          if (filteredList.length > 0 && !selectedId) {
            setSelectedId(filteredList[0].employee_id)
          }
        } else {
          console.error('[Email] Invalid employees data:', list)
          setEmployees([])
        }
      } catch (error: any) {
        console.error('[Email] Error loading employees:', error)
        toast({
          title: 'Error',
          description: error?.message || 'Failed to load employees. Please refresh the page.',
          variant: 'destructive',
          duration: 5000
        })
        setEmployees([])
      }
    }
    run()
  }, [])

  useEffect(() => {
    const run = async () => {
      if (!selectedEmployee || !cutoffStart || !cutoffEnd) {
        setPreview(null)
        setPreviewRows([])
        setHasActualAttendanceData(false)
        return
      }
      try {
      const rows = await getEmployeeCutoffAttendance(
        selectedEmployee.employee_id,
        cutoffStart,
        cutoffEnd,
        selectedEmployee.schedule_time_in,
        selectedEmployee.schedule_time_out,
        selectedEmployee.start_date || undefined,
        selectedEmployee.hire_date || undefined
      )
        if (Array.isArray(rows)) {
          // Create a map of date -> attendance data for quick lookup
          const attendanceMap = new Map<string, { timeIn: string | null; timeOut: string | null; status: string | null }>()
          rows.forEach(r => {
            if (r && r.date) {
              // Transform rows: clear 'absent' status when there's no actual time data
              const hasTimeIn = r.timeIn && r.timeIn.trim() !== '' && r.timeIn !== '-'
              const hasTimeOut = r.timeOut && r.timeOut.trim() !== '' && r.timeOut !== '-'
              const hasActualData = hasTimeIn || hasTimeOut
              
              // If there's NO actual data, clear status to show blank
              const finalStatus = hasActualData ? r.status : null
              attendanceMap.set(r.date, {
                timeIn: r.timeIn || null,
                timeOut: r.timeOut || null,
                status: finalStatus
              })
            }
          })
          
          // Generate ALL dates in the cutoff range (like Reports page does)
          const allDays: Array<{ date: string; timeIn: string | null; timeOut: string | null; status: string | null }> = []
          if (cutoffStart && cutoffEnd) {
            const start = new Date(cutoffStart + 'T00:00:00')
            const end = new Date(cutoffEnd + 'T00:00:00')
            const current = new Date(start)
            
            while (current <= end) {
              const dateStr = format(current, 'yyyy-MM-dd')
              const dayOfWeek = current.getDay() // 0 = Sunday, 1 = Monday, etc.
              
              // Get attendance data if available
              const attendanceData = attendanceMap.get(dateStr)
              
              // Include all dates in the range (including Sundays, which will show blank)
              allDays.push({
                date: dateStr,
                timeIn: attendanceData?.timeIn || null,
                timeOut: attendanceData?.timeOut || null,
                status: dayOfWeek === 0 ? null : (attendanceData?.status || null) // Sundays show blank
              })
              
              // Move to next day
              current.setDate(current.getDate() + 1)
            }
          }
          
          // For summary counts, only count rows with actual time data
          const rowsWithData = allDays.filter(r => {
            const hasTimeIn = r.timeIn && r.timeIn.trim() !== '' && r.timeIn !== '-'
            const hasTimeOut = r.timeOut && r.timeOut.trim() !== '' && r.timeOut !== '-'
            return hasTimeIn || hasTimeOut
          })
          
          const present = rowsWithData.filter(r => r && r.status && r.status !== 'absent' && r.status.toLowerCase() !== 'rest-day').length
          const late = rowsWithData.filter(r => r && r.status && (r.status || '').toLowerCase().includes('late')).length
          const absent = 0 // Always 0 - we show blank instead of absent when there's no data
          const undertime = rowsWithData.filter(r => r && r.status && (r.status || '').toLowerCase().includes('undertime')).length
          setPreview({ present, late, absent, undertime })
          setPreviewRows(allDays)
          
          // Check if there's actual attendance data (rows with timeIn or timeOut)
          // This determines if buttons should be enabled
          const hasActualData = rowsWithData.length > 0
          setHasActualAttendanceData(hasActualData)
        } else {
          console.error('[Email] Invalid attendance rows data:', rows)
          setPreview({ present: 0, late: 0, absent: 0, undertime: 0 })
          setPreviewRows([])
          setHasActualAttendanceData(false)
        }
      } catch (error: any) {
        console.error('[Email] Error loading attendance data:', error)
        setPreview(null)
        setPreviewRows([])
        setHasActualAttendanceData(false)
        if (!isBulk) {
          toast({
            title: 'Error',
            description: error?.message || 'Failed to load attendance data.',
            variant: 'destructive',
            duration: 5000
          })
        }
      }
    }
    if (!isBulk) run()
  }, [selectedEmployee, cutoffStart, cutoffEnd, isBulk, toast])

  const filteredBulkEmployees = useMemo(() => {
    console.log('Email: Filtering employees for bulk mode', { searchTerm: bulkSearch })
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('rams_user') : null
    const currentUser = userStr ? JSON.parse(userStr) : null
    const staffTypeFilter = getStaffTypeFilter(currentUser?.email, currentUser?.role)
    const scopedEmployees = staffTypeFilter
      ? employees.filter(e => (e as any).staff_type === staffTypeFilter)
      : employees

    if (!isBulk || !bulkSearch.trim()) return scopedEmployees
    const q = bulkSearch.toLowerCase()
    return scopedEmployees.filter(e =>
      e.full_name.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      (e.department || '').toLowerCase().includes(q)
    )
  }, [isBulk, bulkSearch, employees])

  const handleSend = async () => {
    if (employees.length === 0) {
      toast({ 
        title: t('email.send_failed'), 
        description: 'No employees available. Please add employees first.', 
        variant: 'destructive',
        duration: 5000
      })
      return
    }

    if (!cutoffStart || !cutoffEnd) {
      toast({
        title: 'Validation Error',
        description: 'Please select a valid cutoff period.',
        variant: 'destructive',
        duration: 5000
      })
      return
    }

    const startDate = new Date(cutoffStart)
    const endDate = new Date(cutoffEnd)
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      toast({
        title: 'Validation Error',
        description: 'Invalid date range. Please select valid dates.',
        variant: 'destructive',
        duration: 5000
      })
      return
    }

    if (startDate > endDate) {
      toast({
        title: 'Validation Error',
        description: 'Start date must be before or equal to end date.',
        variant: 'destructive',
        duration: 5000
      })
      return
    }
    
    setIsSending(true)
    try {
      const recipients = isBulk 
        ? employees.filter(e => e && e.employee_id && selectedIds.has(e.employee_id) && e.email && e.email.trim())
        : selectedEmployee && selectedEmployee.email && selectedEmployee.email.trim()
          ? [selectedEmployee]
          : []
      
      if (!recipients.length) {
        if (isBulk) {
          throw new Error('Please select at least one employee with a valid email address for bulk sending')
        } else {
          throw new Error('Please choose an employee with a valid email address')
        }
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      const invalidEmails = recipients.filter(emp => !emp.email || !emailRegex.test(emp.email.trim()))
      if (invalidEmails.length > 0) {
        throw new Error(`Invalid email addresses found for: ${invalidEmails.map(e => e.full_name).join(', ')}`)
      }

      let successCount = 0
      let failCount = 0
      const errors: string[] = []

      const tasks = recipients.map(async (emp) => {
        try {
          if (!emp.employee_id) {
            throw new Error(`Invalid employee ID for ${emp.full_name}`)
          }

          const rows = await getEmployeeCutoffAttendance(
            emp.employee_id,
            cutoffStart,
            cutoffEnd,
            emp.schedule_time_in || undefined,
            emp.schedule_time_out || undefined,
            emp.start_date || undefined,
            emp.hire_date || undefined
          )
          
          if (!Array.isArray(rows)) {
            throw new Error(`Invalid attendance data for ${emp.full_name}`)
          }

          // Validate minimum logs requirement (at least 4 logs)
          const validLogs = (rows || []).filter(r => r && (r.timeIn || r.timeOut))
          if (validLogs.length < 4) {
            throw new Error(`Insufficient attendance data (${validLogs.length} log(s)). Minimum 4 logs required to send email notification.`)
          }

          // Only count rows with actual time data (similar to preview logic)
          // Don't count 'absent' when there's no actual data
          const rowsWithData = rows.filter(r => {
            if (!r) return false
            const hasTimeIn = r.timeIn && r.timeIn.trim() !== '' && r.timeIn !== '-'
            const hasTimeOut = r.timeOut && r.timeOut.trim() !== '' && r.timeOut !== '-'
            return hasTimeIn || hasTimeOut // Only count rows with actual attendance data
          })
          
          const present = rowsWithData.filter(r => r && r.status && r.status !== 'absent' && r.status.toLowerCase() !== 'rest-day').length
          const late = rowsWithData.filter(r => r && r.status && (r.status || '').toLowerCase().includes('late')).length
          const absent = 0 // Don't count absent when there's no actual data
          const undertime = rowsWithData.filter(r => r && r.status && (r.status || '').toLowerCase().includes('undertime')).length

          const payload = {
            to: emp.email.trim(),
          template: 'employee_report',
            subject: (subject && subject.trim()) || `Attendance Report - ${cutoffStart} – ${cutoffEnd}`,
          variables: {
              employee_name: emp.full_name || 'Employee',
            report_period: `${cutoffStart} – ${cutoffEnd}`,
            days_present: String(present),
            days_absent: String(absent),
            late_arrivals: String(late),
            undertime_days: String(undertime),
              early_departures: '0',
              report_url: `${window.location.origin}/api/reports/view-timesheet?employee_id=${emp.employee_id}&start=${cutoffStart}&end=${cutoffEnd}`,
            notes: '',
          },
        }

          const res = await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })

          if (!res.ok) {
            let errorMessage = `HTTP ${res.status}`
            try {
              const text = await res.text()
              if (text) {
                try {
                  const json = JSON.parse(text)
                  errorMessage = json.error || json.message || text
                } catch {
                  errorMessage = text
                }
              }
            } catch {
              errorMessage = `HTTP ${res.status}: ${res.statusText}`
            }
            throw new Error(errorMessage)
          }

          const json = await res.json()
          if (!json || !json.success) {
            throw new Error(json?.error || json?.message || 'Failed to send email')
          }

          successCount++
        } catch (error: any) {
          failCount++
          const errorMsg = error?.message || String(error) || 'Unknown error'
          errors.push(`${emp.full_name}: ${errorMsg}`)
          console.error(`[Email] Failed to send to ${emp.email}:`, error)
        }
      })

      await Promise.all(tasks)

      if (failCount === 0) {
        toast({
          title: '✅ Email Sent Successfully',
          description: `Successfully sent ${successCount} email${successCount > 1 ? 's' : ''} to ${successCount === 1 && recipients.length === 1 ? recipients[0].full_name : 'selected employee(s)'}.`,
          duration: 5000
        })
      } else if (successCount > 0) {
        toast({
          title: '⚠️ Partially Successful',
          description: `Sent ${successCount} email${successCount > 1 ? 's' : ''} successfully, but ${failCount} failed. ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`,
          variant: 'destructive',
          duration: 8000
        })
      } else {
        throw new Error(`All emails failed. Errors: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`)
      }
    } catch (e: any) {
      console.error('[Email] Send error:', e)
      toast({
        title: '❌ Failed to Send Email',
        description: e?.message || String(e) || 'An unexpected error occurred while sending the email. Please try again.',
        variant: 'destructive',
        duration: 8000
      })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fadeInUp px-4 sm:px-6 py-4 sm:py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{t('email.title')}</h1>
          <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 mt-1 font-medium">{t('email.subtitle')}</p>
        </div>
        <div />
      </div>

      <Card className="transition-all duration-300 hover:shadow-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl text-gray-900 dark:text-white">
            <Send className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400 animate-subtle-rotate" />
            {t('email.compose')}
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">{t('email.template')}</CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-4 sm:space-y-6">
              <div className="bg-linear-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 p-3 sm:p-4 rounded-lg border border-blue-100 dark:border-gray-700">
                <h3 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2">
                  <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600" />
                  {t('email.cutoff_period')}
                </h3>
                
                <div className="space-y-2 sm:space-y-3">
                  <div>
                    <Label className="text-[10px] sm:text-xs font-medium text-gray-700 dark:text-gray-300">{t('email.cutoff_month')}</Label>
                    <Input 
                      type="month" 
                      min="2025-01" 
                      value={cutoffMonth} 
                      onChange={(e)=>onMonthChange(e.target.value)}
                      disabled={employees.length === 0}
                      className="mt-1 bg-white dark:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed h-9 sm:h-10 text-sm sm:text-base touch-manipulation"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                    <div>
                      <Label className="text-[10px] sm:text-xs font-medium text-gray-700 dark:text-gray-300">{t('email.start')}</Label>
                      <Input 
                        type="text" 
                        value={cutoffStart} 
                        disabled 
                        className="mt-1 bg-gray-50 dark:bg-gray-900 text-[10px] sm:text-xs h-9 sm:h-10"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] sm:text-xs font-medium text-gray-700 dark:text-gray-300">{t('email.end')}</Label>
                      <Input 
                        type="text" 
                        value={cutoffEnd} 
                        disabled 
                        className="mt-1 bg-gray-50 dark:bg-gray-900 text-[10px] sm:text-xs h-9 sm:h-10"
                      />
                    </div>
                  </div>
                  
                  <div className="flex gap-1.5 sm:gap-2">
                    <Button 
                      variant={isFirstHalfSelected ? "default" : "outline"} 
                      className="flex-1 text-[10px] sm:text-xs h-9 sm:h-10 touch-manipulation" 
                      disabled={isFirstHalfSelected || employees.length === 0} 
                      onClick={()=>applyHalf('first')}
                    >
                      26–10
                    </Button>
                    <Button 
                      variant={isSecondHalfSelected ? "default" : "outline"} 
                      className="flex-1 text-[10px] sm:text-xs h-9 sm:h-10 touch-manipulation" 
                      disabled={isSecondHalfSelected || employees.length === 0} 
                      onClick={()=>applyHalf('second')}
                    >
                      11–25
                    </Button>
                  </div>
                </div>
              </div>

              <div className="bg-linear-to-br from-purple-50 to-pink-50 dark:from-gray-800 dark:to-gray-900 p-3 sm:p-4 rounded-lg border border-purple-100 dark:border-gray-700">
                <h3 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2">
                  <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-600" />
                  {t('email.email_settings')}
                </h3>
                
                <div className="space-y-2 sm:space-y-3">
                  <div>
                    <Label className="text-[10px] sm:text-xs font-medium text-gray-700 dark:text-gray-300">{t('email.subject')}</Label>
                    <Input 
                      value={subject} 
                      onChange={(e)=>setSubject(e.target.value)} 
                      placeholder={t('email.subject_placeholder')} 
                      disabled={employees.length === 0}
                      className="mt-1 bg-white dark:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed h-9 sm:h-10 text-sm sm:text-base touch-manipulation"
                    />
                  </div>
                  
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <input 
                      id="bulk" 
                      type="checkbox" 
                      className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation" 
                      checked={isBulk} 
                      onChange={(e)=>setIsBulk(e.target.checked)} 
                      disabled={employees.length === 0}
                    />
                    <Label htmlFor="bulk" className={`text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 ${employees.length === 0 ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                      {t('email.bulk_send')}
                    </Label>
                  </div>
                </div>
              </div>

              {!isBulk ? (
                <div className="bg-linear-to-br from-green-50 to-emerald-50 dark:from-gray-800 dark:to-gray-900 p-3 sm:p-4 rounded-lg border border-green-100 dark:border-gray-700">
                  <h3 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2">
                    <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {t('email.select_employee')}
                  </h3>
                  
                  {employees.length === 0 ? (
                    <div className="text-center py-6 sm:py-8 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900">
                      <svg className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 dark:text-gray-600 mx-auto mb-2 sm:mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-lg font-medium">No data shown</p>
                      <p className="text-gray-400 dark:text-gray-500 text-xs sm:text-sm mt-1">No employees available. Please add employees first.</p>
                    </div>
                  ) : (
                  <select 
                    className="h-9 sm:h-10 w-full rounded-md border border-gray-300 dark:border-gray-700 px-2 sm:px-3 text-xs sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation" 
                    value={selectedId ?? ''} 
                    onChange={(e)=>setSelectedId(Number(e.target.value))}
                  >
                    <option value="">Select an employee...</option>
                    {employees
                      .filter(emp => (emp as any).staff_type === 'Teaching')
                      .map(emp => (
                      <option key={emp.employee_id} value={emp.employee_id}>
                        {emp.full_name} • {emp.email} • {emp.department || 'N/A'}
                      </option>
                    ))}
                  </select>
                  )}
                  
                  {preview && (
                    <>
                      <div className="flex items-center gap-1.5 sm:gap-2 mt-3 sm:mt-4 flex-wrap">
                        <Badge className="bg-green-100 text-green-800 border-green-200 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1">
                          {t('email.present')}: {preview.present}
                        </Badge>
                        <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1">
                          {t('email.late')}: {preview.late}
                        </Badge>
                        <Badge className="bg-red-100 text-red-800 border-red-200 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1">
                          {t('email.absent')}: {preview.absent}
                        </Badge>
                        <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1">
                          Undertime: {preview.undertime}
                        </Badge>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full mt-2 sm:mt-3 h-9 sm:h-10 text-xs sm:text-sm touch-manipulation" 
                        onClick={()=>setShowDetails(s=>!s)}
                      >
                        {showDetails ? t('email.hide_details') : t('email.show_details')}
                      </Button>
                      
                      {showDetails && previewRows.length > 0 && (
                        <div className="mt-2 sm:mt-3 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                          <div className="bg-gray-50 dark:bg-gray-800 px-2 sm:px-3 py-1.5 sm:py-2 border-b border-gray-200 dark:border-gray-700">
                            <h4 className="text-[10px] sm:text-xs font-semibold text-gray-900 dark:text-white">{t('email.attendance_details')}</h4>
                          </div>
                          <div className="overflow-auto max-h-40 sm:max-h-48 bg-white dark:bg-gray-800">
                            {/* Desktop Table View */}
                            <table className="min-w-full text-[10px] sm:text-xs hidden sm:table">
                              <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                                <tr>
                                  <th className="px-1.5 sm:px-2 py-1 text-left font-semibold text-gray-700 dark:text-gray-300">{t('email.date')}</th>
                                  <th className="px-1.5 sm:px-2 py-1 text-left font-semibold text-gray-700 dark:text-gray-300">{t('email.time_in')}</th>
                                  <th className="px-1.5 sm:px-2 py-1 text-left font-semibold text-gray-700 dark:text-gray-300">{t('email.time_out')}</th>
                                  <th className="px-1.5 sm:px-2 py-1 text-left font-semibold text-gray-700 dark:text-gray-300">{t('email.status')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {previewRows.map(r => (
                                  <tr key={r.date} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                                    <td className="px-1.5 sm:px-2 py-1 text-gray-900 dark:text-white">{format(new Date(r.date + 'T00:00:00'), 'MM/dd/yyyy')}</td>
                                    <td className="px-1.5 sm:px-2 py-1 text-gray-900 dark:text-white">
                                      {r.timeIn && r.timeIn.trim() !== '' && r.timeIn !== '-' 
                                        ? (() => {
                                            try {
                                              // Handle HH:MM:SS or HH:MM format
                                              const timeParts = r.timeIn.split(':')
                                              const hours = parseInt(timeParts[0])
                                              const minutes = parseInt(timeParts[1])
                                              const date = new Date()
                                              date.setHours(hours, minutes, 0, 0)
                                              return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                            } catch {
                                              return r.timeIn
                                            }
                                          })()
                                        : '-'}
                                    </td>
                                    <td className="px-1.5 sm:px-2 py-1 text-gray-900 dark:text-white">
                                      {r.timeOut && r.timeOut.trim() !== '' && r.timeOut !== '-' 
                                        ? (() => {
                                            try {
                                              const timeParts = r.timeOut.split(':')
                                              const hours = parseInt(timeParts[0])
                                              const minutes = parseInt(timeParts[1])
                                              const date = new Date()
                                              date.setHours(hours, minutes, 0, 0)
                                              return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                            } catch {
                                              return r.timeOut
                                            }
                                          })()
                                        : '-'}
                                    </td>
                                    <td className="px-1.5 sm:px-2 py-1">
                                      {(() => {
                                        // Check if it's a Sunday (rest day)
                                        const dateObj = new Date(r.date + 'T00:00:00')
                                        const isSunday = dateObj.getDay() === 0
                                        
                                        // If Sunday, show rest day badge
                                        if (isSunday) {
                                          return (
                                            <Badge className="bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 text-xs">
                                              Rest Day (Sunday)
                                            </Badge>
                                          )
                                        }
                                        
                                        // If status is null or empty, show blank (similar to Reports page)
                                        if (!r.status || r.status === null || r.status.trim() === '') {
                                          return <span className="text-gray-400 dark:text-gray-500">-</span>
                                        }
                                        
                                        const status = r.status
                                        const statusLower = status.toLowerCase()
                                        const isOnTime = statusLower.includes('on-time')
                                        const isLate = statusLower.includes('late')
                                        const isUndertime = statusLower.includes('undertime')
                                        const isAbsent = statusLower === 'absent'
                                        
                                        let badgeClass = 'text-xs'
                                        if (isAbsent) {
                                          badgeClass += ' bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400'
                                        } else if (isLate && isUndertime) {
                                          badgeClass += ' bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400'
                                        } else if (isLate) {
                                          badgeClass += ' bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400'
                                        } else if (isUndertime) {
                                          badgeClass += ' bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400'
                                        } else if (isOnTime) {
                                          badgeClass += ' bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400'
                                        } else {
                                          badgeClass += ' bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300'
                                        }
                                        
                                        return (
                                          <Badge className={badgeClass}>
                                            {status}
                                          </Badge>
                                        )
                                      })()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {/* Mobile Card View */}
                            <div className="sm:hidden space-y-1.5 p-1.5">
                              {previewRows.map(r => (
                                <div key={r.date} className="bg-gray-50 dark:bg-gray-800 rounded p-2 border border-gray-200 dark:border-gray-700">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-semibold text-gray-900 dark:text-white">{format(new Date(r.date + 'T00:00:00'), 'MM/dd/yyyy')}</span>
                                    {(() => {
                                      const dateObj = new Date(r.date + 'T00:00:00')
                                      const isSunday = dateObj.getDay() === 0
                                      if (isSunday) {
                                        return <Badge className="bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 text-[9px] px-1.5 py-0.5">Rest Day</Badge>
                                      }
                                      if (!r.status || r.status === null || r.status.trim() === '') {
                                        return <span className="text-gray-400 dark:text-gray-500 text-[9px]">-</span>
                                      }
                                      const statusLower = r.status.toLowerCase()
                                      const isLate = statusLower.includes('late')
                                      const isUndertime = statusLower.includes('undertime')
                                      const isAbsent = statusLower === 'absent'
                                      const isOnTime = statusLower.includes('on-time')
                                      let badgeClass = 'text-[9px] px-1.5 py-0.5'
                                      if (isAbsent) badgeClass += ' bg-red-100 text-red-800 border-red-200'
                                      else if (isLate && isUndertime) badgeClass += ' bg-orange-100 text-orange-800 border-orange-200'
                                      else if (isLate) badgeClass += ' bg-orange-100 text-orange-800 border-orange-200'
                                      else if (isUndertime) badgeClass += ' bg-amber-100 text-amber-800 border-amber-200'
                                      else if (isOnTime) badgeClass += ' bg-green-100 text-green-800 border-green-200'
                                      else badgeClass += ' bg-gray-100 text-gray-800 border-gray-200'
                                      return <Badge className={badgeClass}>{r.status}</Badge>
                                    })()}
                                  </div>
                                  <div className="grid grid-cols-2 gap-1 text-[9px] text-gray-600 dark:text-gray-400">
                                    <div>
                                      <span className="font-medium">IN:</span> {r.timeIn && r.timeIn.trim() !== '' && r.timeIn !== '-' ? (() => {
                                        try {
                                          const timeParts = r.timeIn.split(':')
                                          const hours = parseInt(timeParts[0])
                                          const minutes = parseInt(timeParts[1])
                                          const date = new Date()
                                          date.setHours(hours, minutes, 0, 0)
                                          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                        } catch {
                                          return r.timeIn
                                        }
                                      })() : '-'}
                                    </div>
                                    <div>
                                      <span className="font-medium">OUT:</span> {r.timeOut && r.timeOut.trim() !== '' && r.timeOut !== '-' ? (() => {
                                        try {
                                          const timeParts = r.timeOut.split(':')
                                          const hours = parseInt(timeParts[0])
                                          const minutes = parseInt(timeParts[1])
                                          const date = new Date()
                                          date.setHours(hours, minutes, 0, 0)
                                          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                        } catch {
                                          return r.timeOut
                                        }
                                      })() : '-'}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="bg-linear-to-br from-amber-50 to-yellow-50 dark:from-gray-800 dark:to-gray-900 p-3 sm:p-4 rounded-lg border border-amber-100 dark:border-gray-700">
                  <h3 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2">
                    <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    {t('email.bulk_selection')} ({selectedIds.size} {t('email.selected')})
                  </h3>
                  
                  <Input
                    placeholder={t('email.search_placeholder')}
                    value={bulkSearch}
                    onChange={(e)=>setBulkSearch(e.target.value)}
                    className="bg-white dark:bg-gray-800 h-9 sm:h-10 text-sm sm:text-base touch-manipulation"
                  />
                  
                  <div className="max-h-48 sm:max-h-64 overflow-auto rounded-md border border-gray-200 dark:border-gray-700 mt-2 sm:mt-3 bg-white dark:bg-gray-800 p-1.5 sm:p-2">
                    {employees.length === 0 ? (
                      <div className="text-center py-6 sm:py-8">
                        <svg className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 dark:text-gray-600 mx-auto mb-2 sm:mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-lg font-medium">No data shown</p>
                        <p className="text-gray-400 dark:text-gray-500 text-xs sm:text-sm mt-1">No employees available. Please add employees first.</p>
                      </div>
                    ) : filteredBulkEmployees.length === 0 ? (
                      <div className="text-center py-6 sm:py-8">
                        <Search className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 dark:text-gray-600 mx-auto mb-2 sm:mb-3" />
                        <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-lg font-medium">No employees found</p>
                        <p className="text-gray-400 dark:text-gray-500 text-xs sm:text-sm mt-1">No employees match your search criteria</p>
                      </div>
                    ) : (
                      filteredBulkEmployees.map(emp => (
                      <label 
                        key={emp.employee_id} 
                        className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm py-1.5 sm:py-2 px-1.5 sm:px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer touch-manipulation"
                      >
                        <input 
                          type="checkbox" 
                          checked={selectedIds.has(emp.employee_id)} 
                          onChange={(e)=>{
                            const next = new Set(selectedIds)
                            if (e.target.checked) next.add(emp.employee_id)
                            else next.delete(emp.employee_id)
                            setSelectedIds(next)
                          }} 
                          className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 touch-manipulation"
                        />
                        <span className="font-medium text-gray-900 dark:text-white truncate flex-1">{emp.full_name}</span>
                        <span className="text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs hidden sm:inline">• {emp.email}</span>
                      </label>
                      ))
                    )}
                  </div>
                </div>
              )}

              <Button 
                onClick={handleSend} 
                disabled={isSending || employees.length === 0 || !hasActualAttendanceData} 
                className="w-full h-12 sm:h-14 bg-linear-to-r from-purple-600 via-pink-600 to-purple-800 hover:from-purple-700 hover:via-pink-700 hover:to-purple-900 text-white font-bold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:transform-none text-base sm:text-lg touch-manipulation rounded-lg sm:rounded-xl"
              >
                {isSending ? (
                  <>
                    <Clock className="h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-2.5 animate-spin" />
                    <span className="text-sm sm:text-base">{t('email.sending')}</span>
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-2.5" />
                    <span className="text-sm sm:text-base">{t('email.send_email')}</span>
                  </>
                )}
              </Button>
            </div>

            <div className="space-y-3 sm:space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-red-500 rounded-full"></div>
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-yellow-500 rounded-full"></div>
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-500 rounded-full"></div>
                  <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 font-medium ml-1.5 sm:ml-2">{t('email.email_preview')}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowEmailPreview(!showEmailPreview)}
                  className="flex items-center gap-1.5 sm:gap-2 h-9 sm:h-10 text-xs sm:text-sm touch-manipulation w-full sm:w-auto"
                >
                  {showEmailPreview ? (
                    <>
                      <EyeOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      <span>{t('email.hide')}</span>
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      <span>{t('email.show')}</span>
                    </>
                  )}
                </Button>
              </div>
              
              {showEmailPreview && (
                <div className="bg-white border border-gray-200 rounded-lg sm:rounded-xl shadow-sm overflow-hidden max-h-[70vh] sm:max-h-[80vh] overflow-y-auto custom-scrollbar">
                  {/* Email Header - Mobile Optimized */}
                  <div className="bg-gray-50 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 sm:gap-2.5">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-600 rounded-full flex items-center justify-center shadow-md shrink-0">
                          <span className="text-white text-sm sm:text-base font-bold">R</span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{t('email.rams_system')}</div>
                          <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">{t('email.noreply')}</div>
                        </div>
                      </div>
                      <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 shrink-0 ml-2">Today</div>
                    </div>
                  </div>

                  <div className="space-y-0">
                    {/* RAMS Logo Section - Mobile Optimized */}
                    <div className="bg-yellow-400 text-center py-3 sm:py-4 lg:py-5">
                      <Image 
                        src="/Email%20Notif_/sti-logo.png" 
                        alt="RAMS Logo" 
                        width={60}
                        height={60}
                        className="h-14 sm:h-16 md:h-20 lg:h-24 w-auto mx-auto"
                        onError={(e)=>{ try { (e.currentTarget as any).src = '/sti-logo.png' } catch {} }}
                      />
                    </div>

                    {/* Banner Image - Mobile Responsive */}
                    <div className="relative w-full overflow-hidden">
                      <Image 
                        src="/Email%20Notif_/eq0pluX.jpeg" 
                        alt="STI Banner" 
                        width={640}
                        height={192}
                        className="w-full h-auto object-cover"
                        onError={(e)=>{ try { (e.currentTarget as any).src = '/placeholder.jpg' } catch {} }}
                      />
                    </div>

                    {/* Main Content - Mobile Optimized */}
                    <div className="bg-blue-900 text-white p-4 sm:p-5 md:p-6 lg:p-8">
                      <div className="mb-3 sm:mb-4">
                        <p className="text-sm sm:text-base md:text-lg text-gray-100 mb-2 sm:mb-3 font-medium">{t('email.hey')} {selectedEmployee?.full_name || 'Employee Name'},</p>
                      </div>

                      <p className="text-sm sm:text-base md:text-lg mb-5 sm:mb-6 lg:mb-8 leading-relaxed">{t('email.report_message')}</p>

                      {/* Weekly Report Button - Mobile Optimized */}
                      <div className="bg-yellow-400 text-black p-4 sm:p-5 lg:p-6 rounded-lg sm:rounded-xl mb-5 sm:mb-6 lg:mb-8 shadow-lg">
                        <div className="text-center">
                          <div className="font-bold text-base sm:text-lg md:text-xl mb-1.5 sm:mb-2">{t('email.weekly_report')}</div>
                          <div className="text-xs sm:text-sm md:text-base">{t('email.period')}: <strong className="font-semibold">{cutoffStart} – {cutoffEnd}</strong></div>
                        </div>
                      </div>

                      {/* Statistics Card - Mobile Optimized */}
                      <div className="bg-white text-black p-4 sm:p-5 lg:p-6 rounded-lg sm:rounded-xl mb-5 sm:mb-6 lg:mb-8 shadow-md">
                        <div className="space-y-2.5 sm:space-y-3 text-sm sm:text-base md:text-lg">
                          <div className="flex justify-between items-center py-1 border-b border-gray-200 last:border-0">
                            <span className="font-medium">{t('email.days_present')}</span>
                            <span className="font-bold text-lg sm:text-xl md:text-2xl text-blue-600">{preview?.present || 0}</span>
                          </div>
                          <div className="flex justify-between items-center py-1 border-b border-gray-200 last:border-0">
                            <span className="font-medium">{t('email.days_absent')}</span>
                            <span className="font-bold text-lg sm:text-xl md:text-2xl text-red-600">{preview?.absent || 0}</span>
                          </div>
                          <div className="flex justify-between items-center py-1 border-b border-gray-200 last:border-0">
                            <span className="font-medium">{t('email.late_arrivals')}</span>
                            <span className="font-bold text-lg sm:text-xl md:text-2xl text-orange-600">{preview?.late || 0}</span>
                          </div>
                          <div className="flex justify-between items-center py-1">
                            <span className="font-medium">{t('email.early_departures')}</span>
                            <span className="font-bold text-lg sm:text-xl md:text-2xl text-gray-600">0</span>
                          </div>
                        </div>
                      </div>

                      {/* Campaign Image - Mobile Responsive */}
                      <div className="mb-6 sm:mb-8">
                        <Image 
                          src="/Email%20Notif_/0c9OuVQ.jpeg" 
                          alt="STI Campaign" 
                          width={640}
                          height={192}
                          className="w-full h-auto object-cover rounded-lg sm:rounded-xl shadow-md"
                          onError={(e)=>{ try { (e.currentTarget as any).src = '/placeholder.jpg' } catch {} }}
                        />
                      </div>

                      {/* Social Media Icons - Mobile Optimized */}
                      <div className="flex justify-center items-center gap-3 sm:gap-4 lg:gap-5 mb-4 sm:mb-5 lg:mb-6">
                        <a 
                          href="https://elms.sti.edu/" 
                          className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 bg-yellow-400 rounded-full flex items-center justify-center hover:bg-yellow-300 active:bg-yellow-500 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-110 active:scale-95 touch-manipulation"
                        >
                          <Image 
                            src="/Email%20Notif_/TqEOF7H.png" 
                            alt="STI eLMS" 
                            width={32} 
                            height={32} 
                            className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8" 
                            onError={(e)=>{ try { (e.currentTarget as any).src = '/sti-logo.png' } catch {} }} 
                          />
                        </a>
                        <a 
                          href="https://www.facebook.com/santarosa.sti.edu" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 bg-blue-600 rounded-full flex items-center justify-center hover:bg-blue-500 active:bg-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-110 active:scale-95 touch-manipulation"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                          </svg>
                        </a>
                        <a 
                          href="https://www.youtube.com/@STI_College" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-500 active:bg-red-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-110 active:scale-95 touch-manipulation"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8">
                            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                          </svg>
                        </a>
                      </div>
                    </div>

                    {/* Footer - Mobile Optimized */}
                    <div className="bg-blue-900 text-white text-center py-3 sm:py-4">
                      <div className="text-xs sm:text-sm px-4">
                        {t('email.automated_email')}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


