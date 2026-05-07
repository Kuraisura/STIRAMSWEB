/**
 * Employee Profile Page
 * Route: /dashboard/employees/[id]
 * Detailed employee information with attendance and leave records
 */

'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import type { Employee, AttendanceLog } from '@/lib/types/database.types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { User, Briefcase, Mail, Phone, Calendar, MapPin, CheckCircle, XCircle, Clock, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { format, startOfMonth, endOfMonth } from 'date-fns'

export default function EmployeeProfilePage() {
  const params = useParams()
  const employeeId = params?.id as string

  const [employee, setEmployee] = useState<Employee | null>(null)
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([])
  const [leaveRequests, setLeaveRequests] = useState<any[]>([])
  const [leaveCredits, setLeaveCredits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Monthly stats
  const [monthlyStats, setMonthlyStats] = useState({
    present: 0,
    late: 0,
    absent: 0,
    totalMinutesLate: 0
  })

  useEffect(() => {
    if (employeeId) {
      fetchEmployeeData()
    }
  }, [employeeId])

  const fetchJson = async <T,>(url: string): Promise<T> => {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload?.error || `Request failed with status ${response.status}`)
    }
    return response.json()
  }

  const fetchEmployeeData = async () => {
    try {
      setLoading(true)

      // Fetch employee details and locate this profile by numeric employee_id.
      const employeeIdNum = Number(employeeId)
      if (!Number.isFinite(employeeIdNum) || employeeIdNum <= 0) {
        throw new Error('Invalid employee ID')
      }
      const employeesData = await fetchJson<Employee[]>(`/api/employees?includeInactive=true&employeeId=${employeeIdNum}`)
      const employeeRecord = employeesData[0]

      if (!employeeRecord) {
        setEmployee(null)
        setAttendanceLogs([])
        setLeaveCredits([])
        setLeaveRequests([])
        setMonthlyStats({ present: 0, late: 0, absent: 0, totalMinutesLate: 0 })
        return
      }

      setEmployee(employeeRecord)

      const startDate = format(startOfMonth(new Date()), 'yyyy-MM-dd')
      const endDate = format(endOfMonth(new Date()), 'yyyy-MM-dd')

      const logsData = await fetchJson<AttendanceLog[]>(
        `/api/attendance/logs?employeeId=${employeeIdNum}&dateFrom=${startDate}&dateTo=${endDate}&limit=2000`
      )
      setAttendanceLogs(logsData || [])

      // Calculate monthly stats
      const inLogs = logsData?.filter(l => l.log_type === 'IN') || []
      const stats = {
        present: inLogs.filter(l => !l.is_late && l.attendance_status === 'present').length,
        late: inLogs.filter(l => l.is_late).length,
        absent: inLogs.filter(l => l.attendance_status === 'absent').length,
        totalMinutesLate: inLogs.reduce((sum, l) => sum + (l.late_minutes || 0), 0)
      }
      setMonthlyStats(stats)

      const leaveData = await fetchJson<{ leaveCredits?: any[]; leaveRequests?: any[] }>(
        `/api/leave-requests?employeeId=${employeeIdNum}&limit=10`
      )
      setLeaveCredits(leaveData.leaveCredits || [])
      setLeaveRequests(leaveData.leaveRequests || [])

    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <p>Loading employee profile...</p>
      </div>
    )
  }

  if (!employee) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <User className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Employee not found</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2)
  }

  const getEmployeePhotoSrc = (emp: Employee): string | undefined => {
    const photoPath = (emp as any)?.photo_url || (emp as any)?.photo_path || (emp as any)?.photo
    if (!photoPath) return `/api/photos/employee/${emp.employee_id}`

    if (typeof photoPath === 'string' && (photoPath.startsWith('http://') || photoPath.startsWith('https://'))) {
      try {
        const parsed = new URL(photoPath)
        if (typeof window !== 'undefined' && parsed.origin === window.location.origin) {
          return photoPath
        }
      } catch {
        // fall through to local endpoint
      }
      return `/api/photos/employee/${emp.employee_id}`
    }

    if (typeof photoPath === 'string') {
      if (photoPath.startsWith('/')) return photoPath
      return `/${photoPath}`
    }

    return `/api/photos/employee/${emp.employee_id}`
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">Pending</Badge>
      case 'approved':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Approved</Badge>
      case 'denied':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">Denied</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-6">
        <Avatar className="h-24 w-24">
          <AvatarImage src={getEmployeePhotoSrc(employee)} alt={employee.full_name} />
          <AvatarFallback className="text-2xl">{getInitials(employee.full_name)}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{employee.full_name}</h1>
          <p className="text-muted-foreground mt-1">{employee.unique_employee_id}</p>
          <div className="flex items-center gap-4 mt-2">
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
              {employee.role === 'teaching' ? 'Teaching Staff' : 'Non-Teaching Staff'}
            </Badge>
            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300">
              {employee.employment_type?.replace(/_/g, ' ')}
            </Badge>
            {employee.is_active && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                Active
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Monthly Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Present This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-3xl font-bold text-green-600">{monthlyStats.present}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Late This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-600" />
              <span className="text-3xl font-bold text-orange-600">{monthlyStats.late}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Absent This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" />
              <span className="text-3xl font-bold text-red-600">{monthlyStats.absent}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Late (Minutes)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-600" />
              <span className="text-3xl font-bold">{monthlyStats.totalMinutesLate}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">Profile Info</TabsTrigger>
          <TabsTrigger value="attendance">Attendance Logs</TabsTrigger>
          <TabsTrigger value="leave">Leave Records</TabsTrigger>
        </TabsList>

        {/* Profile Info Tab */}
        <TabsContent value="profile" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Personal Information */}
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Full Name</p>
                    <p className="font-medium">{employee.full_name}</p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Email Address</p>
                    <p className="font-medium">{employee.email}</p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Phone Number</p>
                    <p className="font-medium">{employee.phone}</p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <Briefcase className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Department</p>
                    <p className="font-medium">{employee.department}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Employment Details */}
            <Card>
              <CardHeader>
                <CardTitle>Employment Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Employee ID</p>
                    <p className="font-medium font-mono">{employee.unique_employee_id}</p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <Briefcase className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Employment Type</p>
                    <p className="font-medium capitalize">{employee.employment_type?.replace(/_/g, ' ')}</p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Hire Date</p>
                    <p className="font-medium">
                      {employee.hire_date ? format(new Date(employee.hire_date + 'T00:00:00'), 'MMMM dd, yyyy') : 'N/A'}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Schedule</p>
                    <p className="font-medium">
                      {employee.schedule_time_in} - {employee.schedule_time_out}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Leave Credits */}
          {leaveCredits.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Leave Credits</CardTitle>
                <CardDescription>Available leave balances</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {leaveCredits.map(credit => (
                    <Card key={credit.id} className="border-2">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">
                          {credit.leave_types?.leave_type_name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">
                          {credit.remaining_credits}
                          <span className="text-sm text-muted-foreground ml-1">/ {credit.total_credits}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {credit.used_credits} used
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Attendance Logs Tab */}
        <TabsContent value="attendance">
          <Card>
            <CardHeader>
              <CardTitle>Attendance Logs</CardTitle>
              <CardDescription>
                Current month: {format(new Date(), 'MMMM yyyy')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {attendanceLogs.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No attendance logs for this month</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time In</TableHead>
                      <TableHead>Time Out</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Late</TableHead>
                      <TableHead>Undertime</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendanceLogs.filter(log => log.log_type === 'IN').map((inLog) => {
                      const outLog = attendanceLogs.find(l => 
                        l.log_type === 'OUT' && l.date === inLog.date
                      )
                      return (
                        <TableRow key={inLog.log_id}>
                          <TableCell className="font-medium">
                            {format(new Date(inLog.date + 'T00:00:00'), 'MMM dd, yyyy')}
                          </TableCell>
                          <TableCell className="font-mono">
                            {inLog.log_time ? format(new Date(inLog.log_time), 'hh:mm a') : '-'}
                          </TableCell>
                          <TableCell className="font-mono">
                            {outLog?.log_time ? format(new Date(outLog.log_time), 'hh:mm a') : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              inLog.is_late ? 'destructive' :
                              inLog.is_admin_time ? 'secondary' :
                              'default'
                            }>
                              {inLog.is_admin_time ? 'Admin Time' :
                               inLog.is_late ? 'Late' :
                               inLog.attendance_status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-orange-600">
                            {inLog.late_minutes ? `${inLog.late_minutes}m` : '-'}
                          </TableCell>
                          <TableCell className="text-red-600">
                            {outLog?.undertime_minutes ? `${outLog.undertime_minutes}m` : '-'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                            {inLog.notes || '-'}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leave Records Tab */}
        <TabsContent value="leave">
          <Card>
            <CardHeader>
              <CardTitle>Leave Request History</CardTitle>
              <CardDescription>Recent leave requests</CardDescription>
            </CardHeader>
            <CardContent>
              {leaveRequests.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No leave requests yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Leave Type</TableHead>
                      <TableHead>Date From</TableHead>
                      <TableHead>Date To</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaveRequests.map(request => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">
                          {request.leave_types?.leave_type_name}
                        </TableCell>
                        <TableCell>
                          {format(new Date(request.date_from + 'T00:00:00'), 'MMM dd, yyyy')}
                        </TableCell>
                        <TableCell>
                          {format(new Date(request.date_to + 'T00:00:00'), 'MMM dd, yyyy')}
                        </TableCell>
                        <TableCell>{request.days_requested}</TableCell>
                        <TableCell>{getStatusBadge(request.status)}</TableCell>
                        <TableCell className="max-w-xs truncate">{request.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
