'use client'

import { useState, useEffect } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO, startOfWeek, endOfWeek } from 'date-fns'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronLeft, ChevronRight, Clock, Calendar, User, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface Employee {
  employee_id: number
  full_name: string
  department_name?: string
}

interface TimesheetEntry {
  timesheet_id: number
  employee_id: number
  date: string
  teaching_hours: number
  admin_hours: number
  substitution_hours: number
  total_hours: number
  time_in?: string
  time_out?: string
  remarks?: string
}

interface AdminTimeLog {
  admin_time_id: number
  admin_type: string
  duration_hours: number
  time_start: string
  time_end: string
  reason: string
}

export default function FacultyTimesheetPage() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [timesheetData, setTimesheetData] = useState<TimesheetEntry[]>([])
  const [adminTimeLogs, setAdminTimeLogs] = useState<AdminTimeLog[]>([])
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month')

  // Fetch all active employees
  useEffect(() => {
    fetchEmployees()
  }, [])

  // Fetch timesheet data when employee or date changes
  useEffect(() => {
    if (selectedEmployeeId) {
      fetchTimesheetData()
    }
  }, [selectedEmployeeId, selectedDate, viewMode])

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/api/employees', { cache: 'no-store' })
      const data = await res.json().catch(() => [])
      if (!res.ok) {
        throw new Error((data as any)?.error || 'Failed to fetch employees')
      }
      setEmployees(data || [])
      
      // Auto-select first employee
      if (data && data.length > 0 && !selectedEmployeeId) {
        setSelectedEmployeeId(data[0].employee_id)
      }
    } catch (error) {
      console.error('Error fetching employees:', error)
    }
  }

  const fetchTimesheetData = async () => {
    if (!selectedEmployeeId) return

    setLoading(true)
    try {
      let startDate: Date
      let endDate: Date

      if (viewMode === 'month') {
        startDate = startOfMonth(selectedDate)
        endDate = endOfMonth(selectedDate)
      } else if (viewMode === 'week') {
        startDate = startOfWeek(selectedDate, { weekStartsOn: 0 })
        endDate = endOfWeek(selectedDate, { weekStartsOn: 0 })
      } else {
        startDate = selectedDate
        endDate = selectedDate
      }

      const startStr = format(startDate, 'yyyy-MM-dd')
      const endStr = format(endDate, 'yyyy-MM-dd')

      const params = new URLSearchParams({
        employee_id: String(selectedEmployeeId),
        start: startStr,
        end: endStr,
        include_admin_logs: viewMode === 'day' ? 'true' : 'false',
      })

      const res = await fetch(`/api/timesheet/employee?${params.toString()}`, { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error((body as any)?.error || 'Failed to fetch timesheet data')
      }

      setTimesheetData(Array.isArray((body as any)?.timesheets) ? (body as any).timesheets : [])
      setAdminTimeLogs(Array.isArray((body as any)?.admin_logs) ? (body as any).admin_logs : [])
    } catch (error) {
      console.error('Error fetching timesheet data:', error)
    } finally {
      setLoading(false)
    }
  }

  const navigateDate = (direction: 'prev' | 'next') => {
    setSelectedDate((prev) => {
      const newDate = new Date(prev)
      if (viewMode === 'month') {
        newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1))
      } else if (viewMode === 'week') {
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7))
      } else {
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1))
      }
      return newDate
    })
  }

  const selectedEmployee = employees.find((e) => e.employee_id === selectedEmployeeId)

  const getTotalHours = () => {
    return timesheetData.reduce((sum, entry) => sum + entry.total_hours, 0)
  }

  const getTotalTeachingHours = () => {
    return timesheetData.reduce((sum, entry) => sum + entry.teaching_hours, 0)
  }

  const getTotalAdminHours = () => {
    return timesheetData.reduce((sum, entry) => sum + entry.admin_hours, 0)
  }

  const getTotalSubstitutionHours = () => {
    return timesheetData.reduce((sum, entry) => sum + entry.substitution_hours, 0)
  }

  const getAdminTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      no_schedule: 'No Schedule',
      early_arrival: 'Early Arrival',
      vacant_period: 'Vacant Period',
      overtime: 'Overtime',
      other: 'Other'
    }
    return labels[type] || type
  }

  const getAdminTypeBadgeColor = (type: string) => {
    const colors: Record<string, string> = {
      no_schedule: 'bg-blue-500/10 text-blue-600',
      early_arrival: 'bg-green-500/10 text-green-600',
      vacant_period: 'bg-yellow-500/10 text-yellow-600',
      overtime: 'bg-purple-500/10 text-purple-600',
      other: 'bg-gray-500/10 text-gray-600'
    }
    return colors[type] || colors.other
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Faculty Timesheet</h1>
          <p className="text-muted-foreground">
            View teaching and non-teaching load for faculty members
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={viewMode} onValueChange={(value: any) => setViewMode(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Employee Selector */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <User className="h-5 w-5 text-muted-foreground" />
          <Select
            value={selectedEmployeeId?.toString()}
            onValueChange={(value) => setSelectedEmployeeId(parseInt(value))}
          >
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Select an employee" />
            </SelectTrigger>
            <SelectContent>
              {employees.map((emp) => (
                <SelectItem key={emp.employee_id} value={emp.employee_id.toString()}>
                  {emp.full_name} {emp.department_name && `(${emp.department_name})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Date Navigation */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <Button variant="outline" size="icon" onClick={() => navigateDate('prev')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <span className="text-lg font-semibold">
              {viewMode === 'month' && format(selectedDate, 'MMMM yyyy')}
              {viewMode === 'week' &&
                `${format(startOfWeek(selectedDate, { weekStartsOn: 0 }), 'MMM dd')} - ${format(
                  endOfWeek(selectedDate, { weekStartsOn: 0 }),
                  'MMM dd, yyyy'
                )}`}
              {viewMode === 'day' && format(selectedDate, 'EEEE, MMMM dd, yyyy')}
            </span>
          </div>
          <Button variant="outline" size="icon" onClick={() => navigateDate('next')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {/* Summary Cards */}
      {selectedEmployee && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-6 bg-linear-to-br from-blue-500/10 to-blue-500/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Hours</p>
                <p className="text-3xl font-bold">{getTotalHours().toFixed(2)}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-500" />
            </div>
          </Card>

          <Card className="p-6 bg-linear-to-br from-green-500/10 to-green-500/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Teaching Load</p>
                <p className="text-3xl font-bold">{getTotalTeachingHours().toFixed(2)}</p>
              </div>
              <FileText className="h-8 w-8 text-green-500" />
            </div>
          </Card>

          <Card className="p-6 bg-linear-to-br from-yellow-500/10 to-yellow-500/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Admin Time</p>
                <p className="text-3xl font-bold">{getTotalAdminHours().toFixed(2)}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500" />
            </div>
          </Card>

          <Card className="p-6 bg-linear-to-br from-purple-500/10 to-purple-500/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Substitution</p>
                <p className="text-3xl font-bold">{getTotalSubstitutionHours().toFixed(2)}</p>
              </div>
              <User className="h-8 w-8 text-purple-500" />
            </div>
          </Card>
        </div>
      )}

      {/* Timesheet Table */}
      {loading ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">Loading timesheet data...</p>
        </Card>
      ) : timesheetData.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">
            No timesheet data found for the selected period
          </p>
        </Card>
      ) : (
        <Card className="p-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Daily Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3">Date</th>
                    <th className="text-right p-3">Time In</th>
                    <th className="text-right p-3">Time Out</th>
                    <th className="text-right p-3">Teaching</th>
                    <th className="text-right p-3">Admin</th>
                    <th className="text-right p-3">Substitution</th>
                    <th className="text-right p-3">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {timesheetData.map((entry) => (
                    <tr key={entry.timesheet_id} className="border-b hover:bg-muted/50">
                      <td className="p-3">{format(parseISO(entry.date), 'MMM dd, yyyy')}</td>
                      <td className="text-right p-3 text-sm text-muted-foreground">
                        {entry.time_in ? format(parseISO(entry.time_in), 'h:mm a') : '—'}
                      </td>
                      <td className="text-right p-3 text-sm text-muted-foreground">
                        {entry.time_out ? format(parseISO(entry.time_out), 'h:mm a') : '—'}
                      </td>
                      <td className="text-right p-3 font-medium text-green-600">
                        {entry.teaching_hours.toFixed(2)}
                      </td>
                      <td className="text-right p-3 font-medium text-yellow-600">
                        {entry.admin_hours.toFixed(2)}
                      </td>
                      <td className="text-right p-3 font-medium text-purple-600">
                        {entry.substitution_hours.toFixed(2)}
                      </td>
                      <td className="text-right p-3 font-bold">
                        {entry.total_hours.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-bold">
                    <td className="p-3" colSpan={3}>
                      Total
                    </td>
                    <td className="text-right p-3 text-green-600">
                      {getTotalTeachingHours().toFixed(2)}
                    </td>
                    <td className="text-right p-3 text-yellow-600">
                      {getTotalAdminHours().toFixed(2)}
                    </td>
                    <td className="text-right p-3 text-purple-600">
                      {getTotalSubstitutionHours().toFixed(2)}
                    </td>
                    <td className="text-right p-3">{getTotalHours().toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </Card>
      )}

      {/* Admin Time Detail (Day View Only) */}
      {viewMode === 'day' && adminTimeLogs.length > 0 && (
        <Card className="p-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Admin Time Details</h3>
            <div className="space-y-3">
              {adminTimeLogs.map((log) => (
                <div
                  key={log.admin_time_id}
                  className="flex items-center justify-between p-4 rounded-lg border"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={getAdminTypeBadgeColor(log.admin_type)}>
                        {getAdminTypeLabel(log.admin_type)}
                      </Badge>
                      <span className="text-sm font-medium">
                        {log.duration_hours.toFixed(2)} hours
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{log.reason}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(parseISO(log.time_start), 'h:mm a')} -{' '}
                      {format(parseISO(log.time_end), 'h:mm a')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

