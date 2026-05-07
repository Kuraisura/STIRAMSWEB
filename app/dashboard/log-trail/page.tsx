/**
 * Log Trail UI
 * Route: /dashboard/log-trail
 * Display user and system activity history
 */

'use client'

import { useState, useEffect } from 'react'
import type { LogTrail } from '@/lib/types/database.types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FileText, Filter, ChevronLeft, ChevronRight, Eye, Activity, Trash2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

const ITEMS_PER_PAGE = 50

export default function LogTrailPage() {
  const [logs, setLogs] = useState<LogTrail[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [selectedLog, setSelectedLog] = useState<LogTrail | null>(null)
  const [detailsDialog, setDetailsDialog] = useState(false)
  
  // Delete confirmation dialogs
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [actionType, setActionType] = useState('all')
  const [userType, setUserType] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [archiveEventsOnly, setArchiveEventsOnly] = useState(false)

  useEffect(() => {
    fetchLogs()
  }, [page, actionType, userType, archiveEventsOnly])

  const fetchLogs = async () => {
    try {
      setLoading(true)

      const params = new URLSearchParams({
        page: String(page),
        limit: String(ITEMS_PER_PAGE),
        actionType,
        userType,
        archiveEventsOnly: archiveEventsOnly ? 'true' : 'false',
      })

      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (searchQuery.trim()) params.set('search', searchQuery.trim())

      const response = await fetch(`/api/log-trail?${params.toString()}`, {
        cache: 'no-store',
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load logs')
      }

      setLogs(Array.isArray(payload?.logs) ? payload.logs : [])
      setTotalCount(Number(payload?.totalCount) || 0)
    } catch (error: any) {
      console.error('Error fetching logs:', error)
      toast.error(error?.message || 'Failed to fetch logs')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    if (page !== 1) {
      setPage(1)
      return
    }
    fetchLogs()
  }

  const handleReset = () => {
    setDateFrom('')
    setDateTo('')
    setActionType('all')
    setUserType('all')
    setSearchQuery('')
    setArchiveEventsOnly(false)
    if (page !== 1) {
      setPage(1)
      return
    }
    fetchLogs()
  }

  const openDetails = (log: LogTrail) => {
    setSelectedLog(log)
    setDetailsDialog(true)
  }

  const handleDeleteLog = async (logId: number) => {
    const foundLog = logs.find(log => log.id === logId)
    if (foundLog) setSelectedLog(foundLog)
    setShowDeleteConfirm(true)
  }

  const confirmDeleteLog = async () => {
    if (!selectedLog) return

    try {
      const response = await fetch('/api/log-trail', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedLog.id }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to delete log entry')
      }

      toast.success('Log entry deleted successfully')
      setShowDeleteConfirm(false)
      setDetailsDialog(false)
      setSelectedLog(null)
      fetchLogs() // Refresh the list
    } catch (error: any) {
      console.error('Error deleting log:', error)
      toast.error('Failed to delete log entry: ' + error.message)
    }
  }

  const getActionBadge = (actionType: string) => {
    const colorMap: Record<string, string> = {
      attendance_updated: 'bg-blue-50 text-blue-700 border-blue-300',
      leave_approved: 'bg-green-50 text-green-700 border-green-300',
      leave_rejected: 'bg-red-50 text-red-700 border-red-300',
      substitution_assigned: 'bg-purple-50 text-purple-700 border-purple-300',
      substitution_removed: 'bg-orange-50 text-orange-700 border-orange-300',
      employee_created: 'bg-green-50 text-green-700 border-green-300',
      employee_updated: 'bg-blue-50 text-blue-700 border-blue-300',
      employee_deleted: 'bg-red-50 text-red-700 border-red-300',
      schedule_updated: 'bg-indigo-50 text-indigo-700 border-indigo-300',
      login: 'bg-green-50 text-green-700 border-green-300',
      logout: 'bg-gray-50 text-gray-700 border-gray-300'
    }

    const color = colorMap[actionType] || 'bg-gray-50 text-gray-700 border-gray-300'

    return (
      <Badge variant="outline" className={color}>
        {actionType.replace(/_/g, ' ')}
      </Badge>
    )
  }

  const getUserTypeBadge = (type: string | undefined) => {
    if (!type) return <Badge variant="outline">system</Badge>

    const colorMap: Record<string, string> = {
      admin: 'bg-purple-50 text-purple-700 border-purple-300',
      employee: 'bg-blue-50 text-blue-700 border-blue-300',
      system: 'bg-gray-50 text-gray-700 border-gray-300'
    }

    return <Badge variant="outline" className={colorMap[type]}>{type}</Badge>
  }

  const filteredLogs = logs.filter(log => {
    return Boolean(log)
  })

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  return (
    <div className="container mx-auto max-w-full overflow-x-hidden p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="h-8 w-8 text-indigo-600" />
            Log Trail
          </h1>
          <p className="text-muted-foreground mt-1">
            System activity and audit history
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Date From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Date To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Action Type</Label>
              <Select value={actionType} onValueChange={setActionType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="archive_auto_closed">Archive Auto-Close</SelectItem>
                  <SelectItem value="attendance_updated">Attendance Updated</SelectItem>
                  <SelectItem value="leave_approved">Leave Approved</SelectItem>
                  <SelectItem value="leave_rejected">Leave Rejected</SelectItem>
                  <SelectItem value="substitution_assigned">Substitution Assigned</SelectItem>
                  <SelectItem value="substitution_removed">Substitution Removed</SelectItem>
                  <SelectItem value="employee_created">Employee Created</SelectItem>
                  <SelectItem value="employee_updated">Employee Updated</SelectItem>
                  <SelectItem value="employee_deleted">Employee Deleted</SelectItem>
                  <SelectItem value="login">Login</SelectItem>
                  <SelectItem value="logout">Logout</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>User Type</Label>
              <Select value={userType} onValueChange={setUserType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Search</Label>
            <Input
              placeholder="Search by name, email, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSearch}>Apply Filters</Button>
            <Button variant="outline" onClick={handleReset}>Reset</Button>
            <Button
              variant={archiveEventsOnly ? 'default' : 'outline'}
              onClick={() => {
                setArchiveEventsOnly((prev) => !prev)
                setPage(1)
              }}
            >
              Archive Auto-Close Events
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Logs</CardTitle>
          <CardDescription>
            Showing {filteredLogs.length} of {totalCount} log(s) • Page {page} of {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 px-2 sm:px-6">
          {loading ? (
            <p className="text-center py-8">Loading logs...</p>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium">No logs found</p>
              <p className="text-muted-foreground">Try adjusting your filters</p>
            </div>
          ) : (
            <>
              <div className="w-full overflow-x-auto overscroll-x-contain">
                <Table className="min-w-[960px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>User Type</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => (
                      <TableRow key={log.id} className="hover:bg-accent/50">
                        <TableCell className="font-mono text-sm whitespace-nowrap">
                          {format(new Date(log.created_at), 'MMM dd, yyyy HH:mm:ss')}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{log.user_name || 'System'}</p>
                            <p className="text-sm text-muted-foreground break-all">{log.user_email || '-'}</p>
                          </div>
                        </TableCell>
                        <TableCell>{getUserTypeBadge(log.user_type)}</TableCell>
                        <TableCell>{getActionBadge(log.action_type)}</TableCell>
                        <TableCell className="max-w-md truncate">
                          {log.description || '-'}
                        </TableCell>
                        <TableCell className="font-mono text-sm whitespace-nowrap">
                          {log.ip_address || '-'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDetails(log)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * ITEMS_PER_PAGE + 1} to {Math.min(page * ITEMS_PER_PAGE, totalCount)} of {totalCount}
                </p>
                <div className="flex gap-2 sm:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={detailsDialog} onOpenChange={setDetailsDialog}>
        <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="pb-4 border-b">
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <FileText className="h-6 w-6 text-white" />
              </div>
              Log Details
            </DialogTitle>
            <DialogDescription className="text-base">
              Complete information about this activity
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <ScrollArea className="flex-1 pr-4 -mr-4">
              <div className="space-y-6 py-4">
                {/* Header Info Card - Log ID & Timestamp */}
                <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 p-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Log ID</p>
                      <p className="text-2xl font-bold font-mono text-blue-900 dark:text-blue-100">{selectedLog.id}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Timestamp</p>
                      <p className="text-lg font-semibold text-indigo-900 dark:text-indigo-100">
                        {format(new Date(selectedLog.created_at), 'MMMM dd, yyyy')}
                      </p>
                      <p className="text-base font-mono text-indigo-700 dark:text-indigo-300">
                        {format(new Date(selectedLog.created_at), 'HH:mm:ss')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* User Information Card */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                      <Eye className="h-4 w-4 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">User Information</h3>
                  </div>
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                      <div className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Name:</span>
                        <span className="text-base font-semibold text-gray-900 dark:text-gray-100">{selectedLog.user_name || 'System'}</span>
                      </div>
                      <div className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Email:</span>
                        <span className="text-base font-medium text-gray-900 dark:text-gray-100">{selectedLog.user_email || '-'}</span>
                      </div>
                      <div className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Type:</span>
                        {getUserTypeBadge(selectedLog.user_type)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Details Card */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                      <Activity className="h-4 w-4 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Action Details</h3>
                  </div>
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                      <div className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Action Type:</span>
                        {getActionBadge(selectedLog.action_type)}
                      </div>
                      <div className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Table:</span>
                        <span className="text-base font-mono font-semibold text-gray-900 dark:text-gray-100">{selectedLog.table_name || '-'}</span>
                      </div>
                      <div className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Record ID:</span>
                        <span className="text-base font-mono font-semibold text-gray-900 dark:text-gray-100">{selectedLog.record_id || '-'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Description Card */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Description</h3>
                  </div>
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 p-5 shadow-sm">
                    <p className="text-base leading-relaxed text-gray-800 dark:text-gray-200">
                      {selectedLog.description || 'No description provided'}
                    </p>
                  </div>
                </div>

                {/* Technical Details Card */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                      <Activity className="h-4 w-4 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Technical Details</h3>
                  </div>
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                      <div className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">IP Address:</span>
                        <span className="text-base font-mono font-semibold text-gray-900 dark:text-gray-100">{selectedLog.ip_address || '-'}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">User Agent:</span>
                        <span className="text-sm text-right font-medium text-gray-900 dark:text-gray-100 max-w-md break-all">
                          {selectedLog.user_agent || '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Old and New Values */}
                {(selectedLog.old_value || selectedLog.new_value) && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                        <FileText className="h-4 w-4 text-white" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Data Changes</h3>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {selectedLog.old_value && (
                        <div className="space-y-2">
                          <p className="text-sm font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-red-500"></span>
                            Old Value
                          </p>
                          <pre className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 text-xs overflow-auto max-h-60 font-mono shadow-sm">
                            {JSON.stringify(selectedLog.old_value, null, 2)}
                          </pre>
                        </div>
                      )}
                      {selectedLog.new_value && (
                        <div className="space-y-2">
                          <p className="text-sm font-semibold text-green-600 dark:text-green-400 flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-green-500"></span>
                            New Value
                          </p>
                          <pre className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-4 text-xs overflow-auto max-h-60 font-mono shadow-sm">
                            {JSON.stringify(selectedLog.new_value, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                {selectedLog.metadata && (
                  <div className="space-y-4">
                    {selectedLog.metadata.archive_transition === 'active_to_archived' && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center">
                            <AlertCircle className="h-4 w-4 text-white" />
                          </div>
                          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Archive Auto-Close Summary</h3>
                        </div>
                        <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/20 p-5 shadow-sm">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs uppercase tracking-wider text-rose-700 dark:text-rose-300 font-semibold">Transition</p>
                              <p className="text-base font-semibold text-rose-900 dark:text-rose-100">Active → Archived</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wider text-rose-700 dark:text-rose-300 font-semibold">Pending Verification Auto-Closed</p>
                              <p className="text-2xl font-bold text-rose-900 dark:text-rose-100">
                                {Number(selectedLog.metadata.archive_auto_closed_verification_count) || 0}
                              </p>
                            </div>
                          </div>
                          {selectedLog.metadata.archive_auto_close_note && (
                            <p className="text-sm text-rose-800 dark:text-rose-200 mt-3">
                              Note: {String(selectedLog.metadata.archive_auto_close_note)}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-gray-500 to-slate-600 flex items-center justify-center">
                          <FileText className="h-4 w-4 text-white" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Additional Metadata</h3>
                      </div>
                      <pre className="rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 p-5 text-xs overflow-auto max-h-60 font-mono shadow-sm">
                        {JSON.stringify(selectedLog.metadata, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          {/* Dialog Footer with Buttons */}
          {selectedLog && (
            <div className="flex flex-col-reverse sm:flex-row justify-between sm:items-center pt-4 border-t gap-3">
              <Button 
                variant="outline" 
                onClick={() => setDetailsDialog(false)}
                className="w-full sm:w-auto px-6"
              >
                Close
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => handleDeleteLog(selectedLog.id)}
                className="w-full sm:w-auto px-6"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Log Entry
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Single Log Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Delete Log Entry?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2">
              <p className="text-base">
                This will <span className="font-semibold text-red-600">permanently delete</span> this log entry from the database.
              </p>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                  ⚠️ This action cannot be undone
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteLog}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
