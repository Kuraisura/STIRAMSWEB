/**
 * Leave Approval Page (Admin View)
 * Route: /dashboard/leave-approval
 * Admins can review and approve/deny leave requests
 */

'use client'

import { useState, useEffect } from 'react'
import type { LeaveRequest, LeaveType, Employee } from '@/lib/types/database.types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle, XCircle, Eye, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface LeaveRequestWithDetails extends LeaveRequest {
  employees: Employee
  leave_types: LeaveType
}

export default function LeaveApprovalPage() {
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequestWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequestWithDetails | null>(null)
  const [reviewDialog, setReviewDialog] = useState(false)
  const [reviewAction, setReviewAction] = useState<'approve' | 'deny'>('approve')
  const [remarks, setRemarks] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('pending')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchLeaveRequests()
  }, [filterStatus])

  const fetchLeaveRequests = async () => {
    try {
      setLoading(true)
      const qs = filterStatus !== 'all' ? `?status=${encodeURIComponent(filterStatus)}` : ''
      const res = await fetch(`/api/leave-requests${qs}`, { credentials: 'same-origin' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to load leave requests')
      setLeaveRequests(((data?.leaveRequests || []) as any) || [])
    } catch (error: any) {
      console.error('Error fetching leave requests:', error)
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const openReviewDialog = (request: LeaveRequestWithDetails, action: 'approve' | 'deny') => {
    setSelectedRequest(request)
    setReviewAction(action)
    setRemarks('')
    setReviewDialog(true)
  }

  const handleReview = async () => {
    if (!selectedRequest) return

    try {
      const res = await fetch('/api/leave-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          requestId: selectedRequest.id,
          action: reviewAction,
          remarks: remarks || null,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to review leave request')

      toast.success(`Leave request ${reviewAction === 'approve' ? 'approved' : 'denied'} successfully`)
      setReviewDialog(false)
      fetchLeaveRequests()
    } catch (error: any) {
      console.error('Error reviewing leave request:', error)
      toast.error(error.message)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">Pending</Badge>
      case 'approved':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Approved</Badge>
      case 'denied':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">Denied</Badge>
      case 'cancelled':
        return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300">Cancelled</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const filteredRequests = leaveRequests.filter(request =>
    request.employees.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    request.leave_types.leave_type_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const pendingCount = leaveRequests.filter(r => r.status === 'pending').length
  const approvedCount = leaveRequests.filter(r => r.status === 'approved').length
  const deniedCount = leaveRequests.filter(r => r.status === 'denied').length

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Leave Approval</h1>
        <p className="text-muted-foreground mt-1">
          Review and manage employee leave requests
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{pendingCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Approved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{approvedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Denied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{deniedCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by employee name or leave type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Requests</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="denied">Denied</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Leave Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle>Leave Requests</CardTitle>
          <CardDescription>
            {filteredRequests.length} request(s) found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>Loading...</p>
          ) : filteredRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No leave requests found</p>
              <p className="text-muted-foreground">Try adjusting your filters</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Leave Type</TableHead>
                  <TableHead>Date From</TableHead>
                  <TableHead>Date To</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map(request => (
                  <TableRow key={request.id}>
                    <TableCell className="font-medium">
                      <div>
                        <p>{request.employees.full_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {request.employees.unique_employee_id}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{request.employees.department}</TableCell>
                    <TableCell>{request.leave_types.leave_type_name}</TableCell>
                    <TableCell>
                      {format(new Date(request.date_from + 'T00:00:00'), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell>
                      {format(new Date(request.date_to + 'T00:00:00'), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell>{request.days_requested}</TableCell>
                    <TableCell>{getStatusBadge(request.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {request.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 border-green-300 hover:bg-green-50"
                              onClick={() => openReviewDialog(request, 'approve')}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 border-red-300 hover:bg-red-50"
                              onClick={() => openReviewDialog(request, 'deny')}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Deny
                            </Button>
                          </>
                        )}
                        {request.status !== 'pending' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedRequest(request)
                              // Could open a view-only dialog here
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={reviewDialog} onOpenChange={setReviewDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {reviewAction === 'approve' ? 'Approve' : 'Deny'} Leave Request
            </DialogTitle>
            <DialogDescription>
              Review the leave request details before making a decision
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-6">
              {/* Employee Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Employee</Label>
                  <p className="font-medium">{selectedRequest.employees.full_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedRequest.employees.unique_employee_id}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Department</Label>
                  <p className="font-medium">{selectedRequest.employees.department}</p>
                </div>
              </div>

              {/* Leave Details */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-muted-foreground">Leave Type</Label>
                  <p className="font-medium">{selectedRequest.leave_types.leave_type_name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Date From</Label>
                  <p className="font-medium">
                    {format(new Date(selectedRequest.date_from + 'T00:00:00'), 'MMM dd, yyyy')}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Date To</Label>
                  <p className="font-medium">
                    {format(new Date(selectedRequest.date_to + 'T00:00:00'), 'MMM dd, yyyy')}
                  </p>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">Total Days Requested</Label>
                <p className="text-2xl font-bold">{selectedRequest.days_requested} days</p>
              </div>

              <div>
                <Label className="text-muted-foreground">Reason</Label>
                <p className="font-medium">{selectedRequest.reason}</p>
              </div>

              {/* Remarks/Notes */}
              <div className="space-y-2">
                <Label>Remarks {reviewAction === 'deny' && <span className="text-red-500">*</span>}</Label>
                <Textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder={
                    reviewAction === 'approve'
                      ? 'Optional: Add any notes for this approval...'
                      : 'Required: Explain why this request is being denied...'
                  }
                  rows={4}
                  required={reviewAction === 'deny'}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={handleReview}
                  disabled={reviewAction === 'deny' && !remarks}
                  className={
                    reviewAction === 'approve'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }
                >
                  {reviewAction === 'approve' ? (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Confirm Approval
                    </>
                  ) : (
                    <>
                      <XCircle className="mr-2 h-4 w-4" />
                      Confirm Denial
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={() => setReviewDialog(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
