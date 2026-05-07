/**
 * Leave Request Page (Employee View)
 * Route: /dashboard/leave-request
 * Employees can file leave requests and view their leave credits
 */

'use client'

import { useState, useEffect } from 'react'
import type { LeaveRequest, LeaveType, LeaveCredit, Employee } from '@/lib/types/database.types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Plus, Calendar, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { format, differenceInDays } from 'date-fns'

export default function LeaveRequestPage() {
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [leaveCredits, setLeaveCredits] = useState<LeaveCredit[]>([])
  const [currentUser, setCurrentUser] = useState<Employee | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    leave_type_id: '',
    date_from: '',
    date_to: '',
    reason: ''
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/leave-requests?mine=true', { credentials: 'same-origin' })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load leave data')
      }

      setCurrentUser(data?.currentUser || null)
      setLeaveTypes((data?.leaveTypes || []) as LeaveType[])
      setLeaveCredits((data?.leaveCredits || []) as LeaveCredit[])
      setLeaveRequests((data?.leaveRequests || []) as LeaveRequest[])
    } catch (error: any) {
      console.error('Error fetching data:', error)
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!currentUser) {
      toast.error('User not found')
      return
    }

    // Calculate days requested
    const daysRequested = differenceInDays(
      new Date(formData.date_to),
      new Date(formData.date_from)
    ) + 1

    if (daysRequested <= 0) {
      toast.error('Invalid date range')
      return
    }

    // Check if user has enough credits
    const credit = leaveCredits.find(c => c.leave_type_id.toString() === formData.leave_type_id)
    if (!credit) {
      toast.error('Leave credit not found')
      return
    }

    if (credit.remaining_credits < daysRequested) {
      toast.error(`Insufficient leave credits. You have ${credit.remaining_credits} days remaining.`)
      return
    }

    try {
      const res = await fetch('/api/leave-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          leave_type_id: parseInt(formData.leave_type_id),
          date_from: formData.date_from,
          date_to: formData.date_to,
          reason: formData.reason,
          days_requested: daysRequested,
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to submit leave request')

      toast.success('Leave request submitted successfully')
      setDialogOpen(false)
      setFormData({ leave_type_id: '', date_from: '', date_to: '', reason: '' })
      fetchData()
    } catch (error: any) {
      console.error('Error submitting leave request:', error)
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

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Leave Requests</h1>
          <p className="text-muted-foreground mt-1">
            File and manage your leave requests
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Leave Request
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>File Leave Request</DialogTitle>
              <DialogDescription>
                Submit a new leave request for approval
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Leave Type</Label>
                <Select
                  value={formData.leave_type_id}
                  onValueChange={(value) => setFormData({ ...formData, leave_type_id: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select leave type" />
                  </SelectTrigger>
                  <SelectContent>
                    {leaveTypes.map(type => {
                      const credit = leaveCredits.find(c => c.leave_type_id === type.id)
                      return (
                        <SelectItem key={type.id} value={type.id.toString()}>
                          {type.leave_type_name}
                          {credit && ` (${credit.remaining_credits} days left)`}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date From</Label>
                  <Input
                    type="date"
                    value={formData.date_from}
                    onChange={(e) => setFormData({ ...formData, date_from: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date To</Label>
                  <Input
                    type="date"
                    value={formData.date_to}
                    onChange={(e) => setFormData({ ...formData, date_to: e.target.value })}
                    required
                  />
                </div>
              </div>

              {formData.date_from && formData.date_to && (
                <div className="text-sm text-muted-foreground">
                  Duration: {differenceInDays(new Date(formData.date_to), new Date(formData.date_from)) + 1} day(s)
                </div>
              )}

              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="Enter reason for leave..."
                  rows={4}
                  required
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" className="flex-1">Submit Request</Button>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Leave Credits Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {leaveCredits.map(credit => (
          <Card key={credit.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                {(credit.leave_types as any)?.leave_type_name}
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

      {/* Leave Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle>My Leave Requests</CardTitle>
          <CardDescription>View your leave request history</CardDescription>
        </CardHeader>
        <CardContent>
          {leaveRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No leave requests yet</p>
              <p className="text-muted-foreground">Click "New Leave Request" to file your first leave</p>
            </div>
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
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaveRequests.map(request => (
                  <TableRow key={request.id}>
                    <TableCell className="font-medium">
                      {(request.leave_types as any)?.leave_type_name}
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
                    <TableCell className="text-sm text-muted-foreground">
                      {request.remarks || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Important Notice */}
      <Card className="border-orange-200 bg-orange-50">
        <CardContent className="flex items-start gap-3 pt-6">
          <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-orange-900">Leave Request Policy</p>
            <p className="text-sm text-orange-700">
              • Submit leave requests at least 3 days in advance for approval<br />
              • Leave credits are automatically deducted upon approval<br />
              • Emergency leaves should be filed within 24 hours with supporting documents<br />
              • Contact HR for any questions about your leave credits
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
