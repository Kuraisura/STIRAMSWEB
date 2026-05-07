/**
 * Real-Time Monitoring Dashboard
 * Route: /dashboard/realtime
 * Live attendance monitoring with auto-refresh and local API polling
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import {
  getAttendanceLogs,
  getAttendanceSummary,
  getEmployees,
  getTeachingSchedulesForEmployee,
} from '@/lib/offline-dashboard-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RefreshCcw, Users, Clock, XCircle, Calendar as CalendarIcon, Activity, UserX, Search, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface AttendanceStats {
  present: number
  late: number
  absent: number
  onLeave: number
  adminTime: number
  total: number
}

interface RecentLog {
  log_id: number
  log_time: string
  log_type: string
  attendance_status?: string | null
  is_late?: boolean | null
  is_admin_time?: boolean | null
  late_minutes?: number | null
  employees: {
    full_name: string
    department?: string | null
    school_id?: string | null
  }
}

interface UnloggedEmployee {
  employee_id: number
  full_name: string
  department: string
  employee_type: string
  employment_subtype: string
  schedule_time_in: string
  schedule_time_out: string
  has_schedule_today: boolean
  missing_logs: string[]
}

const COLORS = {
  present: '#10b981',
  late: '#f59e0b',
  absent: '#ef4444',
  onLeave: '#8b5cf6',
  adminTime: '#6366f1'
}

export default function RealtimePage() {
  const [stats, setStats] = useState<AttendanceStats>({
    present: 0,
    late: 0,
    absent: 0,
    onLeave: 0,
    adminTime: 0,
    total: 0
  })
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Unlogged employees state
  const [unloggedEmployees, setUnloggedEmployees] = useState<UnloggedEmployee[]>([])
  const [filteredEmployees, setFilteredEmployees] = useState<UnloggedEmployee[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"))
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState<string>("all")
  const [departmentFilter, setDepartmentFilter] = useState<string>("all")
  const [departments, setDepartments] = useState<string[]>([])
  const [loadingUnlogged, setLoadingUnlogged] = useState(false)

  useEffect(() => {
    fetchData()

    // Poll for updates every 10 seconds in offline mode.
    intervalRef.current = setInterval(() => {
      fetchData()
    }, 10000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const today = format(new Date(), 'yyyy-MM-dd')
      const [summary, logs] = await Promise.all([
        getAttendanceSummary(today),
        getAttendanceLogs(today, 1000),
      ])

      const typedLogs = ((logs as any[]) || [])
        .filter((l) => String(l.log_type || '').toUpperCase() === 'IN')
        .sort((a, b) => {
          const left = new Date(String(b.log_time || '')).getTime()
          const right = new Date(String(a.log_time || '')).getTime()
          return left - right
        }) as RecentLog[]

      // Calculate statistics
      const newStats: AttendanceStats = {
        present: Number(summary?.presentToday ?? summary?.present ?? 0),
        late: Number(summary?.lateToday ?? summary?.late ?? 0),
        absent: Number(summary?.absentToday ?? summary?.absent ?? 0),
        onLeave: typedLogs.filter(l => l.log_type === 'LEAVE' || l.attendance_status === 'excused').length,
        adminTime: typedLogs.filter(l => l.is_admin_time).length,
        total: typedLogs.length
      }

      setStats(newStats)
      setRecentLogs(typedLogs.slice(0, 20)) // Show latest 20 logs
      setLastUpdate(new Date())
    } catch (error: any) {
      console.error('Error fetching data:', error)
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    toast.info('Refreshing data...')
    fetchData()
  }

  // Fetch unlogged employees
  const fetchUnloggedEmployees = async () => {
    setLoadingUnlogged(true)
    try {
      const employees = await getEmployees(false, true, false, null)
      const logs = await getAttendanceLogs(selectedDate, 5000)

      // Get day of week for selected date
      const selectedDateObj = new Date(selectedDate + 'T00:00:00')
      const dayOfWeek = selectedDateObj.getDay() // 0=Sunday, 6=Saturday
      
      const holidaysRes = await fetch('/api/holidays', { cache: 'no-store' })
      const holidays = holidaysRes.ok ? await holidaysRes.json().catch(() => []) : []
      const isHoliday = Array.isArray(holidays) && holidays.some((h: any) => {
        const start = String(h.start_date || h.date || '').slice(0, 10)
        const end = String(h.end_date || h.date || '').slice(0, 10)
        if (!start || !end) return false
        return selectedDate >= start && selectedDate <= end
      })

      const scheduledEmployeeIds = new Set<number>()
      await Promise.all(
        (employees || []).map(async (emp: any) => {
          try {
            const schedules = await getTeachingSchedulesForEmployee(emp.employee_id)
            const hasToday = (schedules || []).some((s: any) => Number(s.day_of_week) === dayOfWeek)
            if (hasToday) {
              scheduledEmployeeIds.add(emp.employee_id)
            }
          } catch (error) {
            console.error(`[Realtime] Failed to load schedules for employee ${emp.employee_id}:`, error)
          }
        })
      )

      // Create map of employee logs
      const employeeLogsMap = new Map<number, string[]>()
      logs?.forEach((log: any) => {
        if (!employeeLogsMap.has(log.employee_id)) {
          employeeLogsMap.set(log.employee_id, [])
        }
        if (log.log_type) {
          employeeLogsMap.get(log.employee_id)!.push(String(log.log_type).toUpperCase())
        }
      })

      // Identify unlogged employees
      const unlogged: UnloggedEmployee[] = []
      
      employees?.forEach((emp: any) => {
        // Skip if employee's work hasn't started
        const startDate = emp.start_date || emp.hire_date
        if (startDate) {
          const startDateObj = new Date(startDate + 'T00:00:00')
          if (selectedDateObj <= startDateObj) return // Work not started yet
        }

        // Skip if holiday
        if (isHoliday) return

        const empLogs = employeeLogsMap.get(emp.employee_id) || []
        const hasIn = empLogs.includes('IN')
        const hasOut = empLogs.includes('OUT')
        
        // Determine if employee has schedule today
        const staffType = String(emp.staff_type || '').toLowerCase()
        const hasFixedShift = Boolean(emp.schedule_time_in && emp.schedule_time_out)
        const hasScheduleToday = staffType === 'non-teaching'
          ? hasFixedShift
          : scheduledEmployeeIds.has(emp.employee_id)
        
        // Only track unlogged if they have schedule today
        if (!hasScheduleToday) return

        const missingLogs: string[] = []
        if (!hasIn) missingLogs.push('IN')
        if (!hasOut) missingLogs.push('OUT')

        if (missingLogs.length > 0) {
          unlogged.push({
            employee_id: emp.employee_id,
            full_name: emp.full_name,
            department: emp.department || 'No Department',
            employee_type: staffType === 'non-teaching' ? 'non_teaching' : 'teaching',
            employment_subtype: emp.employment_type || 'N/A',
            schedule_time_in: emp.schedule_time_in || 'N/A',
            schedule_time_out: emp.schedule_time_out || 'N/A',
            has_schedule_today: hasScheduleToday,
            missing_logs: missingLogs
          })
        }
      })

      setUnloggedEmployees(unlogged)
      
      // Extract unique departments
      const uniqueDepts = Array.from(new Set(unlogged.map(e => e.department)))
      setDepartments(uniqueDepts)
      
    } catch (error) {
      console.error('Error fetching unlogged employees:', error)
      toast.error('Failed to fetch unlogged employees')
    } finally {
      setLoadingUnlogged(false)
    }
  }

  // Filter unlogged employees based on filters
  useEffect(() => {
    let filtered = unloggedEmployees

    // Filter by employee type
    if (employeeTypeFilter !== 'all') {
      filtered = filtered.filter(e => e.employee_type === employeeTypeFilter)
    }

    // Filter by department
    if (departmentFilter !== 'all') {
      filtered = filtered.filter(e => e.department === departmentFilter)
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(e => 
        e.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.employee_id.toString().includes(searchTerm)
      )
    }

    setFilteredEmployees(filtered)
  }, [unloggedEmployees, employeeTypeFilter, departmentFilter, searchTerm])

  // Load unlogged employees when date changes
  useEffect(() => {
    fetchUnloggedEmployees()
  }, [selectedDate])

  const teachingCount = filteredEmployees.filter(e => e.employee_type === 'teaching').length
  const nonTeachingCount = filteredEmployees.filter(e => e.employee_type === 'non_teaching').length

  // Prepare chart data
  const chartData = [
    { name: 'Present', value: stats.present, color: COLORS.present },
    { name: 'Late', value: stats.late, color: COLORS.late },
    { name: 'Absent', value: stats.absent, color: COLORS.absent },
    { name: 'On Leave', value: stats.onLeave, color: COLORS.onLeave },
    { name: 'Admin Time', value: stats.adminTime, color: COLORS.adminTime }
  ]

  const barChartData = chartData.map(item => ({
    name: item.name,
    count: item.value
  }))

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="h-8 w-8 text-green-600" />
            Real-Time Monitoring
          </h1>
          <p className="text-muted-foreground mt-1">
            Live attendance tracking & unlogged employees • Last update: {format(lastUpdate, 'hh:mm:ss a')}
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={loading}>
          <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Tabs for Live Activity and Unlogged Employees */}
      <Tabs defaultValue="live-activity" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="live-activity">Live Activity</TabsTrigger>
          <TabsTrigger value="unlogged">Unlogged Employees</TabsTrigger>
        </TabsList>

        {/* LIVE ACTIVITY TAB */}
        <TabsContent value="live-activity" className="space-y-6 mt-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <Users className="inline h-3 w-3 mr-1" />
              All logs
            </p>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50 dark:bg-green-950">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-green-700 dark:text-green-400">
              Present
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {stats.present}
            </div>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              On time
            </p>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-400">
              Late
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
              {stats.late}
            </div>
            <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
              <Clock className="inline h-3 w-3 mr-1" />
              Tardy
            </p>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50 dark:bg-red-950">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-red-700 dark:text-red-400">
              Absent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600 dark:text-red-400">
              {stats.absent}
            </div>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              <XCircle className="inline h-3 w-3 mr-1" />
              No log
            </p>
          </CardContent>
        </Card>

        <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-400">
              On Leave
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
              {stats.onLeave}
            </div>
            <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
              <CalendarIcon className="inline h-3 w-3 mr-1" />
              Approved
            </p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-400">
              Admin Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {stats.adminTime}
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              No teaching load
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Attendance Distribution</CardTitle>
            <CardDescription>Today's attendance breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#3b82f6">
                  {barChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={chartData[index].color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Status Overview</CardTitle>
            <CardDescription>Percentage distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Logs Feed */}
      <Card>
        <CardHeader>
          <CardTitle>Live Activity Feed</CardTitle>
          <CardDescription>
            Latest {recentLogs.length} attendance logs • Auto-updates every 10 seconds
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {loading && recentLogs.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">Loading logs...</p>
            ) : recentLogs.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No logs for today yet</p>
            ) : (
              recentLogs.map((log) => (
                <div
                  key={log.log_id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center justify-center w-16 h-16 rounded-lg bg-primary/10">
                      <span className="text-xs font-medium text-muted-foreground">
                        {format(new Date(log.log_time), 'HH:mm')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(log.log_time), 'a')}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold">{log.employees.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {log.employees.school_id || 'N/A'} • {log.employees.department || 'No Department'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {log.is_late && (
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
                        Late {log.late_minutes}m
                      </Badge>
                    )}
                    {log.is_admin_time && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                        Admin Time
                      </Badge>
                    )}
                    {!log.is_late && !log.is_admin_time && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                        On Time
                      </Badge>
                    )}
                    <Badge variant="secondary">
                      {log.log_type}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
      </TabsContent>

      {/* UNLOGGED EMPLOYEES TAB */}
      <TabsContent value="unlogged" className="space-y-6 mt-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <UserX className="h-4 w-4 text-red-600" />
                Total Unlogged
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">{filteredEmployees.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-600" />
                Teaching Staff
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{teachingCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-green-600" />
                Non-Teaching Staff
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{nonTeachingCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Date</label>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Employee Type</label>
                <Select value={employeeTypeFilter} onValueChange={setEmployeeTypeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="teaching">Teaching</SelectItem>
                    <SelectItem value="non_teaching">Non-Teaching</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Department</label>
                <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                  <SelectTrigger>
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

              <div>
                <label className="text-sm font-medium mb-2 block">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Name or ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Unlogged Employees Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Unlogged Employees List</CardTitle>
                <CardDescription>
                  Showing {filteredEmployees.length} employee{filteredEmployees.length !== 1 ? 's' : ''} who haven't logged IN or OUT
                </CardDescription>
              </div>
              <Button onClick={fetchUnloggedEmployees} disabled={loadingUnlogged} variant="outline">
                <RefreshCcw className={`h-4 w-4 mr-2 ${loadingUnlogged ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingUnlogged ? (
              <div className="flex justify-center items-center py-12">
                <RefreshCcw className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="text-center py-12">
                <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 dark:text-gray-400">
                  {unloggedEmployees.length === 0 
                    ? 'All employees have logged in/out!'
                    : 'No employees match your filters'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium">ID</th>
                      <th className="text-left p-3 font-medium">Name</th>
                      <th className="text-left p-3 font-medium">Type</th>
                      <th className="text-left p-3 font-medium">Department</th>
                      <th className="text-left p-3 font-medium">Schedule</th>
                      <th className="text-left p-3 font-medium">Missing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((employee) => (
                      <tr key={employee.employee_id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="p-3">
                          <span className="font-mono text-sm">{employee.employee_id}</span>
                        </td>
                        <td className="p-3">
                          <div>
                            <div className="font-medium">{employee.full_name}</div>
                            <div className="text-xs text-gray-500">{employee.employment_subtype}</div>
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge variant={employee.employee_type === 'teaching' ? 'default' : 'secondary'}>
                            {employee.employee_type === 'teaching' ? 'Teaching' : 'Non-Teaching'}
                          </Badge>
                        </td>
                        <td className="p-3 text-sm">{employee.department}</td>
                        <td className="p-3 text-sm">
                          {employee.schedule_time_in} - {employee.schedule_time_out}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            {employee.missing_logs.map(log => (
                              <Badge key={log} variant="destructive" className="text-xs">
                                {log}
                              </Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
      </Tabs>
    </div>
  )
}
