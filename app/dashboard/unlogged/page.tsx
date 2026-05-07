/**
 * Unlogged Employees Monitoring Page
 * Route: /dashboard/unlogged
 * Shows employees who haven't tapped IN or OUT for the day
 */

"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertCircle, Search, UserX, Users, RefreshCw } from "lucide-react"
import { format } from "date-fns"
import { getAttendanceLogs, getEmployees, getTeachingSchedulesForEmployee } from "@/lib/offline-dashboard-client"

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

export default function UnloggedEmployeesPage() {
  const [unloggedEmployees, setUnloggedEmployees] = useState<UnloggedEmployee[]>([])
  const [filteredEmployees, setFilteredEmployees] = useState<UnloggedEmployee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"))
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState<string>("all")
  const [departmentFilter, setDepartmentFilter] = useState<string>("all")
  const [departments, setDepartments] = useState<string[]>([])

  const fetchUnloggedEmployees = async () => {
    setIsLoading(true)
    try {
      // Get all active employees
      const employees = await getEmployees(false, true, false, null)

      // Get attendance logs for selected date
      const logs = await getAttendanceLogs(selectedDate, 5000)

      // Get day of week for selected date
      const selectedDateObj = new Date(selectedDate + 'T00:00:00')
      const dayOfWeek = selectedDateObj.getDay() // 0=Sunday, 6=Saturday
      
      // Check holidays
      const holidaysRes = await fetch('/api/holidays', { cache: 'no-store' })
      const holidays = holidaysRes.ok ? await holidaysRes.json().catch(() => []) : []

      const isHoliday = Array.isArray(holidays) && holidays.some((h: any) => {
        const start = String(h.start_date || h.date || '').slice(0, 10)
        const end = String(h.end_date || h.date || '').slice(0, 10)
        if (!start || !end) return false
        return selectedDate >= start && selectedDate <= end
      })

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

      // Build set of employees who have any schedule on the selected day
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
            console.error(`[Unlogged] Failed to load schedules for employee ${emp.employee_id}:`, error)
          }
        })
      )

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
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchUnloggedEmployees()
  }, [selectedDate])

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

  const teachingCount = filteredEmployees.filter(e => e.employee_type === 'teaching').length
  const nonTeachingCount = filteredEmployees.filter(e => e.employee_type === 'non_teaching').length

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Unlogged Employees</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Monitor employees who haven't logged IN or OUT
          </p>
        </div>
        <Button onClick={fetchUnloggedEmployees} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

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
          <CardTitle>Unlogged Employees List</CardTitle>
          <CardDescription>
            Showing {filteredEmployees.length} employee{filteredEmployees.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
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
    </div>
  )
}
