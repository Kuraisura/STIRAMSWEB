"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { FileText, Users, Clock, AlertTriangle, CheckCircle, Calendar as CalendarIcon, RefreshCw, X, Download } from "lucide-react"
import { format, parseISO } from "date-fns"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { getEmployees, getAttendanceLogs } from "@/lib/offline-dashboard-client"
import { isSunday } from "@/lib/attendance-helpers"

interface DateRange {
  from: Date | undefined
  to: Date | undefined
}

interface EmployeeStats {
  employee_id: number
  full_name: string
  department: string
  total_days: number
  present_days: number
  late_days: number
  undertime_days: number
  absent_days: number
  attendance_rate: number
}

interface DailyAttendance {
  date: string
  timeIn: string | null
  timeOut: string | null
  status: string
  isLate: boolean
  isUndertime: boolean
}

export default function ReportsPage() {
  const { toast } = useToast()
  const [employees, setEmployees] = useState<any[]>([])
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDepartment, setSelectedDepartment] = useState("All Departments")
  
  // Date range for the main report
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(2025, 9, 26), // Oct 26, 2025
    to: new Date(2025, 10, 10),  // Nov 10, 2025
  })
  
  // Detail modal state
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailEmployee, setDetailEmployee] = useState<any | null>(null)
  const [detailDays, setDetailDays] = useState<DailyAttendance[]>([])
  const [detailDateRange, setDetailDateRange] = useState<DateRange>({
    from: undefined,
    to: undefined
  })

  // Fetch data
  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setIsLoading(true)
      const [employeesData, logsData] = await Promise.all([
        getEmployees(),
        getAttendanceLogs()
      ])
      
      setEmployees(employeesData || [])
      setAttendanceLogs(logsData || [])
      
      console.log('[Reports] Data loaded:', {
        employees: employeesData?.length,
        logs: logsData?.length
      })
    } catch (error) {
      console.error('[Reports] Error fetching data:', error)
      toast({
        title: "Error",
        description: "Failed to load attendance data",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Calculate employee statistics
  const calculateEmployeeStats = (): EmployeeStats[] => {
    if (!dateRange.from || !dateRange.to) return []

    console.log('[Reports] Calculating stats for date range:', {
      from: format(dateRange.from, 'yyyy-MM-dd'),
      to: format(dateRange.to, 'yyyy-MM-dd')
    })

    // Filter logs by date range
    const filteredLogs = attendanceLogs.filter(log => {
      const logDate = new Date(log.date)
      return logDate >= dateRange.from! && logDate <= dateRange.to!
    })

    console.log('[Reports] Filtered logs:', filteredLogs.length)

    // Filter employees by department
    const filteredEmployees = selectedDepartment === "All Departments"
      ? employees
      : employees.filter(emp => emp.department === selectedDepartment)

    return filteredEmployees.map(employee => {
      const employeeLogs = filteredLogs.filter(log => log.employee_id === employee.employee_id)
      
      // Get unique dates with attendance (excluding Sundays)
      const uniqueDates = [...new Set(employeeLogs.map(log => log.date))]
        .filter(date => !isSunday(date))
        .sort()

      // Calculate stats for each unique date
      const dailyStats = uniqueDates.map(date => {
        const dayLogs = employeeLogs.filter(log => log.date === date)
        
        // Determine status for this day
        const hasLate = dayLogs.some(log => log.is_late === true)
        const hasUndertime = dayLogs.some(log => log.is_early_out === true)
        const hasAbsent = dayLogs.some(log => log.attendance_status === 'absent')
        const hasAttendance = dayLogs.length > 0 && !hasAbsent

        return {
          date,
          isPresent: hasAttendance,
          isLate: hasLate,
          isUndertime: hasUndertime,
          isAbsent: hasAbsent
        }
      })

      // Count totals
      const presentDays = dailyStats.filter(d => d.isPresent).length
      const lateDays = dailyStats.filter(d => d.isLate).length
      const undertimeDays = dailyStats.filter(d => d.isUndertime).length

      // Calculate absent days
      const workingDays = getWorkingDaysInRange(dateRange.from!, dateRange.to!)
      const absentDays = workingDays - presentDays

      const attendanceRate = workingDays > 0 ? Math.round((presentDays / workingDays) * 100) : 0

      if (employee.employee_id === 5) {
        console.log('[Reports] Jomung stats:', {
          uniqueDates: uniqueDates.length,
          dailyStats,
          presentDays,
          lateDays,
          undertimeDays,
          absentDays,
          workingDays
        })
      }

      return {
        employee_id: employee.employee_id,
        full_name: employee.full_name,
        department: employee.department,
        total_days: workingDays,
        present_days: presentDays,
        late_days: lateDays,
        undertime_days: undertimeDays,
        absent_days: absentDays,
        attendance_rate: attendanceRate
      }
    })
  }

  // Get working days in range (excluding Sundays)
  const getWorkingDaysInRange = (from: Date, to: Date): number => {
    let count = 0
    const current = new Date(from)
    
    while (current <= to) {
      if (current.getDay() !== 0) { // Not Sunday
        count++
      }
      current.setDate(current.getDate() + 1)
    }
    
    return count
  }

  // Get unique departments
  const departments = ["All Departments", ...new Set(employees.map(emp => emp.department).filter(Boolean))]

  // Calculate stats
  const employeeStats = calculateEmployeeStats()

  // Summary cards
  const totalEmployees = employees.length
  const totalPresent = employeeStats.reduce((sum, stat) => sum + stat.present_days, 0)
  const totalLate = employeeStats.reduce((sum, stat) => sum + stat.late_days, 0)
  const totalAbsent = employeeStats.reduce((sum, stat) => sum + stat.absent_days, 0)

  // Open employee detail
  const openEmployeeDetail = (employee: any) => {
    const effectiveRange = detailDateRange.from && detailDateRange.to
      ? detailDateRange
      : dateRange

    if (!effectiveRange.from || !effectiveRange.to) return

    // Get employee logs for the date range
    const employeeLogs = attendanceLogs.filter(log => {
      const logDate = new Date(log.date)
      return log.employee_id === employee.employee_id &&
             logDate >= effectiveRange.from! &&
             logDate <= effectiveRange.to!
    })

    // Build daily attendance records
    const dates: string[] = []
    const current = new Date(effectiveRange.from)
    
    while (current <= effectiveRange.to) {
      const dateStr = format(current, 'yyyy-MM-dd')
      
      if (!isSunday(dateStr)) { // Exclude Sundays
        dates.push(dateStr)
      }
      
      current.setDate(current.getDate() + 1)
    }

    const dailyRecords: DailyAttendance[] = dates.map(date => {
      const dayLogs = employeeLogs.filter(log => log.date === date).sort((a, b) => 
        new Date(a.log_time).getTime() - new Date(b.log_time).getTime()
      )

      const timeInLog = dayLogs.find(log => log.log_type === 'IN')
      const timeOutLog = dayLogs.find(log => log.log_type === 'OUT')

      const hasLate = dayLogs.some(log => log.is_late === true)
      const hasUndertime = dayLogs.some(log => log.is_early_out === true)
      const hasAbsent = dayLogs.some(log => log.attendance_status === 'absent')
      
      let status = 'Absent'
      if (dayLogs.length > 0 && !hasAbsent) {
        if (hasLate && hasUndertime) status = 'Late/Undertime'
        else if (hasLate) status = 'Late'
        else if (hasUndertime) status = 'Undertime'
        else status = 'On-Time'
      }

      if (isSunday(date)) {
        status = 'Rest Day (Sunday)'
      }

      return {
        date,
        timeIn: timeInLog ? format(new Date(timeInLog.log_time), 'HH:mm') : null,
        timeOut: timeOutLog ? format(new Date(timeOutLog.log_time), 'HH:mm') : null,
        status,
        isLate: hasLate,
        isUndertime: hasUndertime
      }
    })

    const onTimeCount = dailyRecords.filter(d => d.status === 'On-Time').length
    const lateCount = dailyRecords.filter(d => d.isLate).length
    const undertimeCount = dailyRecords.filter(d => d.isUndertime).length
    const absentCount = dailyRecords.filter(d => d.status === 'Absent').length

    setDetailEmployee(employee)
    setDetailDays(dailyRecords)
    setDetailSummary({ onTime: onTimeCount, late: lateCount, undertime: undertimeCount, absent: absentCount })
    setDetailOpen(true)
  }

  const [detailSummary, setDetailSummary] = useState<{ onTime: number; late: number; undertime: number; absent: number } | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Reports & Analytics</h1>
        <p className="text-muted-foreground mt-2">Comprehensive attendance reports and performance analytics</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEmployees}</div>
            <p className="text-xs text-muted-foreground mt-1">Active workforce</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Present Days</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{totalPresent}</div>
            <p className="text-xs text-muted-foreground mt-1">Across all employees</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Late Days</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{totalLate}</div>
            <p className="text-xs text-muted-foreground mt-1">Need attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Absent Days</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{totalAbsent}</div>
            <p className="text-xs text-muted-foreground mt-1">Follow up required</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Employee Performance Report
              </CardTitle>
              <CardDescription className="mt-1.5">
                Detailed attendance statistics for all employees
              </CardDescription>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {/* Department Filter */}
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {departments.map(dept => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Date Range Picker */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("justify-start text-left font-normal", !dateRange.from && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from && dateRange.to ? (
                      `${format(dateRange.from, "MMM dd")} - ${format(dateRange.to, "MMM dd, yyyy")}`
                    ) : (
                      "Pick a date range"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="range"
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range) => {
                      if (range?.from && range?.to) {
                        setDateRange({ from: range.from, to: range.to })
                      }
                    }}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>

              {/* Refresh Button */}
              <Button onClick={fetchData} variant="outline" size="icon">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-center">Total Days</TableHead>
                  <TableHead className="text-center">Present</TableHead>
                  <TableHead className="text-center">Late</TableHead>
                  <TableHead className="text-center">Undertime</TableHead>
                  <TableHead className="text-center">Absent</TableHead>
                  <TableHead className="text-center">Attendance Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employeeStats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No employees found
                    </TableCell>
                  </TableRow>
                ) : (
                  employeeStats.map(stat => (
                    <TableRow 
                      key={stat.employee_id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openEmployeeDetail(employees.find(e => e.employee_id === stat.employee_id))}
                    >
                      <TableCell className="font-medium">{stat.full_name}</TableCell>
                      <TableCell>{stat.department}</TableCell>
                      <TableCell className="text-center">{stat.total_days}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          {stat.present_days}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                          {stat.late_days}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                          {stat.undertime_days}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                          {stat.absent_days}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={stat.attendance_rate >= 90 ? "bg-green-50 text-green-700" : stat.attendance_rate >= 70 ? "bg-yellow-50 text-yellow-700" : "bg-red-50 text-red-700"}>
                          {stat.attendance_rate}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Employee Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{detailEmployee?.full_name}</span>
              <Button variant="ghost" size="icon" onClick={() => setDetailOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {detailEmployee?.department} • {format(detailDateRange.from || dateRange.from!, 'MMM dd')} - {format(detailDateRange.to || dateRange.to!, 'MMM dd, yyyy')}
            </p>
          </DialogHeader>

          {/* Summary Stats */}
          {detailSummary && (
            <div className="grid grid-cols-4 gap-4 my-4">
              <div className="text-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                <div className="text-2xl font-bold text-green-700 dark:text-green-400">{detailSummary.onTime}</div>
                <div className="text-sm text-muted-foreground">On-Time</div>
              </div>
              <div className="text-center p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{detailSummary.late}</div>
                <div className="text-sm text-muted-foreground">Late</div>
              </div>
              <div className="text-center p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{detailSummary.undertime}</div>
                <div className="text-sm text-muted-foreground">Undertime</div>
              </div>
              <div className="text-center p-4 bg-red-50 dark:bg-red-950 rounded-lg">
                <div className="text-2xl font-bold text-red-700 dark:text-red-400">{detailSummary.absent}</div>
                <div className="text-sm text-muted-foreground">Absent</div>
              </div>
            </div>
          )}

          {/* Date Range Filter for Detail View */}
          <div className="flex justify-end mb-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {detailDateRange.from && detailDateRange.to ? (
                    `${format(detailDateRange.from, "MMM dd")} - ${format(detailDateRange.to, "MMM dd")}`
                  ) : (
                    "Filter dates"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="range"
                  selected={{ from: detailDateRange.from, to: detailDateRange.to }}
                  onSelect={(range) => {
                    if (range?.from && range?.to) {
                      setDetailDateRange({ from: range.from, to: range.to })
                      openEmployeeDetail(detailEmployee) // Refresh with new date range
                    }
                  }}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Daily Records Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-center">Time In</TableHead>
                  <TableHead className="text-center">Time Out</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailDays.map((day, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{format(parseISO(day.date), 'MMM dd, yyyy (EEE)')}</TableCell>
                    <TableCell className="text-center">{day.timeIn || '-'}</TableCell>
                    <TableCell className="text-center">{day.timeOut || '-'}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={
                        day.status === 'On-Time' ? 'default' :
                        day.status === 'Late' ? 'destructive' :
                        day.status === 'Undertime' ? 'secondary' :
                        day.status === 'Rest Day (Sunday)' ? 'outline' :
                        'destructive'
                      }>
                        {day.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

