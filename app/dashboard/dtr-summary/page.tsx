/**
 * Merged DTR Summary & Reports Page
 * Combines functionality from both Reports and DTR Summary
 * Employee filtering follows centralized staff-scope policy
 */

'use client'

import { useState, useEffect } from 'react'
import type { Employee, AttendanceLog, AcademicTerm } from '@/lib/types/database.types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Download, FileText, Filter, Printer, Users, CheckSquare, Square, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { MANILA_TZ } from '@/lib/timezone-utils'
import { getStaffTypeFilter } from '@/lib/offline-dashboard-client'

interface DTRData {
  employee: Employee
  logs: AttendanceLog[]
  totalLateMinutes: number
  totalUndertimeMinutes: number
  totalDaysPresent: number
  totalDaysLate: number
  totalDaysAbsent: number
  totalAdminTimeDays: number
}

export default function DTRSummaryPage() {
  const [dtrData, setDtrData] = useState<DTRData[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [academicTerms, setAcademicTerms] = useState<AcademicTerm[]>([])
  const [loading, setLoading] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)

  // Bulk export state
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([])
  const [bulkExportMode, setBulkExportMode] = useState(false)
  const [isBulkExporting, setIsBulkExporting] = useState(false)
  const [isSendingEmails, setIsSendingEmails] = useState(false)

  const resolveStaffFilter = (user: any): 'Teaching' | 'Non-Teaching' | null =>
    getStaffTypeFilter(user?.email, user?.role)

  const isAbsentOrLeaveStatus = (status?: string | null): boolean => {
    const s = String(status || '').trim().toLowerCase()
    return s === 'absent' || s === 'leave' || s === 'excused'
  }

  // Filters
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all')
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all')
  const [selectedTerm, setSelectedTerm] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    fetchInitialData()
  }, [])

  const fetchInitialData = async () => {
    try {
      // Get current user from localStorage
      const userStr = localStorage.getItem('rams_user')
      const user = userStr ? JSON.parse(userStr) : null
      setCurrentUser(user)

      const staffFilter = resolveStaffFilter(user)

      // Fetch all employees
      const employeeParams = new URLSearchParams()
      if (staffFilter) {
        employeeParams.set('staffTypeFilter', staffFilter)
      }

      const empRes = await fetch(`/api/employees?${employeeParams.toString()}`, {
        cache: 'no-store',
      })

      if (!empRes.ok) {
        const body = await empRes.json().catch(() => ({}))
        throw new Error(body?.error || 'Failed to load employees')
      }

      const empData = (await empRes.json().catch(() => [])) as Employee[]

      if (empData) {
        setEmployees(empData)

        const filtered = staffFilter ? empData.filter((e: any) => e.staff_type === staffFilter) : empData
        
        setFilteredEmployees(filtered)
        
        // Extract unique departments from filtered employees
        const depts = [...new Set(filtered.map((e: any) => e.department).filter(Boolean))]
        setDepartments(depts as string[])
      }

      // Fetch academic terms
      const termRes = await fetch('/api/academic-terms', { cache: 'no-store' })

      if (!termRes.ok) {
        const body = await termRes.json().catch(() => ({}))
        throw new Error(body?.error || 'Failed to load academic terms')
      }

      const termBody = await termRes.json().catch(() => ({ success: false, data: [] }))
      const termData = (termBody?.data || []) as AcademicTerm[]

      if (termData) {
        setAcademicTerms(termData)
        // Set default date range to active term if exists
        const activeTerm = termData.find(t => t.is_active)
        if (activeTerm) {
          setDateFrom(activeTerm.start_date)
          setDateTo(activeTerm.end_date)
          setSelectedTerm(activeTerm.id.toString())
        } else {
          // Default to current month
          const now = new Date()
          setDateFrom(format(startOfMonth(now), 'yyyy-MM-dd'))
          setDateTo(format(endOfMonth(now), 'yyyy-MM-dd'))
        }
      }
    } catch (error) {
      console.error('Error fetching initial data:', error)
      toast.error('Failed to load initial data')
    }
  }

  const fetchDTRData = async () => {
    if (!dateFrom || !dateTo) {
      toast.error('Please select a date range')
      return
    }

    try {
      setLoading(true)

      const staffFilter = resolveStaffFilter(currentUser)
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
        limit: '50000',
      })
      if (selectedEmployee !== 'all') params.set('employeeId', selectedEmployee)
      if (selectedDepartment !== 'all') params.set('department', selectedDepartment)
      if (staffFilter) params.set('staffType', staffFilter)

      const logsRes = await fetch(`/api/attendance/logs?${params.toString()}`, {
        cache: 'no-store',
      })

      if (!logsRes.ok) {
        const body = await logsRes.json().catch(() => ({}))
        throw new Error(body?.error || 'Failed to load attendance logs')
      }

      const logs = (await logsRes.json().catch(() => [])) as any[]

      // Group by employee and compute totals
      const employeeMap = new Map<number, DTRData>()

      logs?.forEach((log: any) => {
        const empId = log.employee_id
        if (!employeeMap.has(empId)) {
          employeeMap.set(empId, {
            employee: log.employees,
            logs: [],
            totalLateMinutes: 0,
            totalUndertimeMinutes: 0,
            totalDaysPresent: 0,
            totalDaysLate: 0,
            totalDaysAbsent: 0,
            totalAdminTimeDays: 0
          })
        }

        const dtr = employeeMap.get(empId)!
        dtr.logs.push(log)
        dtr.totalLateMinutes += log.late_minutes || 0
        dtr.totalUndertimeMinutes += log.undertime_minutes || 0

        const status = String(log.attendance_status || '').toLowerCase()
        if (isAbsentOrLeaveStatus(status)) {
          dtr.totalDaysAbsent++
          return
        }

        if (log.log_type === 'IN') {
          if (log.is_late) {
            dtr.totalDaysLate++
          } else if (log.is_admin_time) {
            dtr.totalAdminTimeDays++
          } else {
            dtr.totalDaysPresent++
          }
        }
      })

      setDtrData(Array.from(employeeMap.values()))
    } catch (error: any) {
      console.error('Error fetching DTR data:', error)
      toast.error(error.message || 'Failed to load DTR data')
    } finally {
      setLoading(false)
    }
  }

  // Bulk DTR Export Handler
  const handleBulkExport = async () => {
    if (selectedEmployeeIds.length === 0) {
      toast.error('Please select at least one employee')
      return
    }

    if (!dateFrom || !dateTo) {
      toast.error('Please select a date range')
      return
    }

    try {
      setIsBulkExporting(true)

      const response = await fetch('/api/reports/export-bulk-dtr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeIds: selectedEmployeeIds,
          dateFrom,
          dateTo
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate bulk DTR')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      
      let filename = `Bulk_DTR_${selectedEmployeeIds.length}_employees.zip`
      const contentDisposition = response.headers.get('Content-Disposition')
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+)"?/)
        if (match) filename = match[1]
      }
      
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success(`Bulk DTR exported successfully (${selectedEmployeeIds.length} employees)`)
      setBulkExportMode(false)
      setSelectedEmployeeIds([])
    } catch (error: any) {
      console.error('Bulk DTR export error:', error)
      toast.error(error.message || 'Failed to generate bulk DTR')
    } finally {
      setIsBulkExporting(false)
    }
  }

  // Bulk DTR Email Handler
  const handleSendAllEmails = async () => {
    if (selectedEmployeeIds.length === 0) {
      toast.error('Please select at least one employee')
      return
    }

    if (!dateFrom || !dateTo) {
      toast.error('Please select a date range')
      return
    }

    const confirmed = confirm(
      `Are you sure you want to send DTR emails to ${selectedEmployeeIds.length} employee(s)?`
    )

    if (!confirmed) return

    try {
      setIsSendingEmails(true)
      toast.info(`Sending DTR emails to ${selectedEmployeeIds.length} employee(s)...`)

      const response = await fetch('/api/reports/send-bulk-dtr-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeIds: selectedEmployeeIds,
          dateFrom,
          dateTo
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send emails')
      }

      toast.success(
        `Successfully sent ${result.successCount} of ${result.totalEmployees} DTR emails`
      )

      if (result.failCount > 0) {
        toast.warning(
          `${result.failCount} email(s) failed to send. Check employee email addresses.`
        )
      }

      setBulkExportMode(false)
      setSelectedEmployeeIds([])
    } catch (error: any) {
      console.error('Bulk DTR email error:', error)
      toast.error(error.message || 'Failed to send DTR emails')
    } finally {
      setIsSendingEmails(false)
    }
  }

  // Toggle employee selection
  const toggleEmployeeSelection = (employeeId: number) => {
    setSelectedEmployeeIds(prev => {
      if (prev.includes(employeeId)) {
        return prev.filter(id => id !== employeeId)
      } else {
        return [...prev, employeeId]
      }
    })
  }

  // Select all visible employees
  const selectAllEmployees = () => {
    if (selectedEmployeeIds.length === dtrData.length) {
      setSelectedEmployeeIds([])
    } else {
      setSelectedEmployeeIds(dtrData.map(d => d.employee.employee_id))
    }
  }

  const exportToPDF = async (dtr: DTRData) => {
    toast.info('PDF export feature coming soon!')
  }

  const printDTR = (dtr: DTRData) => {
    window.print()
  }

  const formatMinutesToHours = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours === 0) return `${mins}m`
    return `${hours}h ${mins}m`
  }

  // Get role display text
  const getRoleText = () => {
    const staffFilter = resolveStaffFilter(currentUser)
    if (staffFilter === 'Non-Teaching') {
      return 'Non-Teaching Staff'
    }
    if (staffFilter === 'Teaching') {
      return 'Teaching Staff'
    }
    return 'All Staff'
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6 animate-fadeInUp">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">DTR Summary & Reports</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Daily Time Record with late/undertime computation
            {currentUser && (
              <span className="block sm:inline sm:ml-2">
                • Viewing: <span className="font-semibold">{getRoleText()}</span>
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button
            variant={bulkExportMode ? "default" : "outline"}
            onClick={() => {
              setBulkExportMode(!bulkExportMode)
              if (bulkExportMode) {
                setSelectedEmployeeIds([])
              }
            }}
            className="flex-1 sm:flex-initial"
          >
            <Users className="mr-2 h-4 w-4" />
            {bulkExportMode ? 'Cancel Bulk' : 'Bulk Export'}
          </Button>
          {bulkExportMode && selectedEmployeeIds.length > 0 && (
            <>
              <Button
                onClick={handleBulkExport}
                disabled={isBulkExporting || isSendingEmails}
                className="flex-1 sm:flex-initial"
              >
                <Download className="mr-2 h-4 w-4" />
                {isBulkExporting ? 'Exporting...' : `Export ${selectedEmployeeIds.length} DTR(s)`}
              </Button>
              <Button
                onClick={handleSendAllEmails}
                disabled={isBulkExporting || isSendingEmails}
                className="flex-1 sm:flex-initial bg-green-600 hover:bg-green-700"
              >
                <Mail className="mr-2 h-4 w-4" />
                {isSendingEmails ? 'Sending...' : `Email ${selectedEmployeeIds.length} DTR(s)`}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Filter className="h-4 w-4 sm:h-5 sm:w-5" />
            Filters
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Select criteria to generate DTR reports
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Academic Term</Label>
              <Select value={selectedTerm} onValueChange={(value) => {
                setSelectedTerm(value)
                if (value !== 'all') {
                  const term = academicTerms.find(t => t.id.toString() === value)
                  if (term) {
                    setDateFrom(term.start_date)
                    setDateTo(term.end_date)
                  }
                }
              }}>
                <SelectTrigger className="h-10 sm:h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Custom Range</SelectItem>
                  {academicTerms.map(term => (
                    <SelectItem key={term.id} value={term.id.toString()}>
                      {term.academic_year} - {term.term_name}
                      {term.is_active && ' (Active)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Date From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-10 sm:h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Date To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-10 sm:h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Department</Label>
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger className="h-10 sm:h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map(dept => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Employee</Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="h-10 sm:h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {filteredEmployees.map(emp => (
                    <SelectItem key={emp.employee_id} value={emp.employee_id.toString()}>
                      {emp.full_name} ({emp.department})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={fetchDTRData} disabled={loading} className="w-full sm:w-auto">
            {loading ? 'Loading...' : 'Generate DTR'}
          </Button>
        </CardContent>
      </Card>

      {/* Bulk Export Mode - Select All */}
      {bulkExportMode && dtrData.length > 0 && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="flex items-center justify-between pt-4 sm:pt-6">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={selectedEmployeeIds.length === dtrData.length}
                onCheckedChange={selectAllEmployees}
                className="h-5 w-5"
              />
              <div>
                <p className="font-semibold text-sm sm:text-base">
                  Select All Employees ({selectedEmployeeIds.length}/{dtrData.length})
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Check the boxes below to select individual employees for bulk export
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* DTR Results */}
      {dtrData.length > 0 && (
        <div className="space-y-4 sm:space-y-6">
          {dtrData.map((dtr) => (
            <Card key={dtr.employee.employee_id} className={bulkExportMode ? 'border-2' : ''}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    {bulkExportMode && (
                      <Checkbox
                        checked={selectedEmployeeIds.includes(dtr.employee.employee_id)}
                        onCheckedChange={() => toggleEmployeeSelection(dtr.employee.employee_id)}
                        className="h-5 w-5 mt-1"
                      />
                    )}
                    <div className="flex-1">
                      <CardTitle className="text-lg sm:text-xl">{dtr.employee.full_name}</CardTitle>
                      <CardDescription className="text-xs sm:text-sm">
                        {dtr.employee.unique_employee_id} • {dtr.employee.department} • {dtr.employee.staff_type}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => printDTR(dtr)} className="h-9">
                      <Printer className="mr-2 h-4 w-4" />
                      Print
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => exportToPDF(dtr)} className="h-9">
                      <FileText className="mr-2 h-4 w-4" />
                      PDF
                    </Button>
                  </div>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mt-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Total Days</p>
                    <p className="text-xl sm:text-2xl font-bold">
                      {dtr.logs.filter(l => l.log_type === 'IN' || isAbsentOrLeaveStatus(l.attendance_status)).length}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Present</p>
                    <p className="text-xl sm:text-2xl font-bold text-green-600">{dtr.totalDaysPresent}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Late</p>
                    <p className="text-xl sm:text-2xl font-bold text-orange-600">{dtr.totalDaysLate}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Absent</p>
                    <p className="text-xl sm:text-2xl font-bold text-red-600">{dtr.totalDaysAbsent}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Total Late</p>
                    <p className="text-lg sm:text-xl font-bold text-orange-600">
                      {formatMinutesToHours(dtr.totalLateMinutes)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Total Undertime</p>
                    <p className="text-lg sm:text-xl font-bold text-red-600">
                      {formatMinutesToHours(dtr.totalUndertimeMinutes)}
                    </p>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Time In</TableHead>
                      <TableHead className="text-xs">Time Out</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Late</TableHead>
                      <TableHead className="text-xs">Undertime</TableHead>
                      <TableHead className="text-xs">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dtr.logs
                      .filter(log => log.log_type === 'IN' || isAbsentOrLeaveStatus(log.attendance_status))
                      .map((inLog) => {
                      const isAbsent = isAbsentOrLeaveStatus(inLog.attendance_status)
                      const outLog = dtr.logs.find(l => 
                        l.log_type === 'OUT' && l.date === inLog.date
                      )
                      return (
                        <TableRow key={inLog.log_id}>
                          <TableCell className="font-medium text-xs sm:text-sm">
                            {format(new Date(inLog.date + 'T00:00:00'), 'MMM dd, yyyy')}
                          </TableCell>
                          <TableCell className="text-xs sm:text-sm">
                            {isAbsent ? '-' : (inLog.log_time ? format(new Date(inLog.log_time), 'hh:mm a') : '-')}
                          </TableCell>
                          <TableCell className="text-xs sm:text-sm">
                            {isAbsent ? '-' : (outLog?.log_time ? format(new Date(outLog.log_time), 'hh:mm a') : '-')}
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              isAbsent ? 'destructive' :
                              inLog.is_late ? 'destructive' :
                              inLog.is_admin_time ? 'secondary' :
                              'default'
                            } className="text-xs">
                              {isAbsent ? 'Absent/Leave' :
                               inLog.is_admin_time ? 'Admin Time' :
                               inLog.is_late ? 'Late' :
                               inLog.attendance_status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-orange-600 text-xs sm:text-sm">
                            {inLog.late_minutes ? `${inLog.late_minutes}m` : '-'}
                          </TableCell>
                          <TableCell className="text-red-600 text-xs sm:text-sm">
                            {isAbsent ? '-' : (outLog?.undertime_minutes ? `${outLog.undertime_minutes}m` : '-')}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                            {inLog.notes || '-'}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {dtrData.length === 0 && !loading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No DTR data found</p>
            <p className="text-muted-foreground text-center mt-2">
              {dateFrom && dateTo
                ? 'No attendance records found for the selected criteria'
                : 'Select filters and click "Generate DTR" to view reports'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
