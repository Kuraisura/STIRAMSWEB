/**
 * Substitution Form Management Page
 * Route: /dashboard/substitution
 * View and print all substitution forms
 */

'use client'

import { useState, useEffect } from 'react'
import type { SubstitutionHistory, Employee } from '@/lib/types/database.types'
import { generatePrintableSubstitutionForm } from '@/lib/print-substitution-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Calendar, FileText, Printer, Search, Filter, Users, Download, Trash2, Eye, X } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

interface SubstitutionWithDetails extends SubstitutionHistory {
  originalEmployee: Employee
  substituteEmployee: Employee
  scheduleDetails?: {
    subject_name?: string
    section?: string
    room?: string
  }
  time_slot?: string
  status?: 'approved' | 'pending' | 'rejected'
  created_at?: string
  approved_at?: string
}

export default function SubstitutionFormPage() {
  const [substitutions, setSubstitutions] = useState<SubstitutionWithDetails[]>([])
  const [filteredSubstitutions, setFilteredSubstitutions] = useState<SubstitutionWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'teaching' | 'exam'>('all')
  const [selectedSubstitution, setSelectedSubstitution] = useState<SubstitutionWithDetails | null>(null)
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)

  // Get current user on mount
  useEffect(() => {
    const userStr = localStorage.getItem('rams_user')
    if (userStr) {
      setCurrentUser(JSON.parse(userStr))
    }
  }, [])

  useEffect(() => {
    fetchSubstitutions()
  }, [])

  useEffect(() => {
    filterSubstitutions()
  }, [searchTerm, dateFilter, typeFilter, substitutions])

  const fetchSubstitutions = async () => {
    try {
      setLoading(true)

      const res = await fetch('/api/substitution/records', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to load substitutions')
      }

      const data = json?.items || []

      console.log('Fetched substitutions:', data)

      // Map the data to match the expected format
      const substitutionsWithDetails = (data || []).map((sub: any) => {
        // Format time from HH:MM:SS to HH:MM AM/PM
        const formatTime = (time: string) => {
          if (!time) return ''
          const [hours, minutes] = time.split(':')
          const hour = parseInt(hours)
          const ampm = hour >= 12 ? 'PM' : 'AM'
          const displayHour = hour % 12 || 12
          return `${displayHour.toString().padStart(2, '0')}:${minutes} ${ampm}`
        }

        const isExam = String(sub?.substitution_type || '').toLowerCase() === 'exam'
        const scheduleType: 'teaching' | 'exam' = isExam ? 'exam' : 'teaching'

        return {
          ...sub,
          originalEmployee: sub.original_employee,
          substituteEmployee: sub.substitute_employee,
          date: sub.substitution_date,
          assigned_at: sub.created_at,
          schedule_type: scheduleType,
          time_slot: `${formatTime(sub.start_time)} - ${formatTime(sub.end_time)}`,
          scheduleDetails: {
            subject_name: isExam ? 'Exam Substitution' : 'Class Substitution',
            section: `${formatTime(sub.start_time)} - ${formatTime(sub.end_time)}`,
            room: sub.reason || 'No reason provided'
          }
        }
      })

      setSubstitutions(substitutionsWithDetails)
    } catch (error) {
      console.error('Error fetching substitutions:', error)
      toast.error('Failed to load substitutions')
    } finally {
      setLoading(false)
    }
  }

  const filterSubstitutions = () => {
    let filtered = [...substitutions]

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (sub) =>
          sub.originalEmployee?.full_name?.toLowerCase().includes(search) ||
          sub.substituteEmployee?.full_name?.toLowerCase().includes(search) ||
          sub.scheduleDetails?.subject_name?.toLowerCase().includes(search) ||
          sub.scheduleDetails?.section?.toLowerCase().includes(search)
      )
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

      filtered = filtered.filter((sub) => {
        const subDate = new Date(sub.date)
        const daysDiff = Math.floor((now.getTime() - subDate.getTime()) / (1000 * 60 * 60 * 24))

        if (dateFilter === 'today') {
          return subDate >= today
        } else if (dateFilter === 'week') {
          return daysDiff <= 7
        } else if (dateFilter === 'month') {
          return daysDiff <= 30
        }
        return true
      })
    }

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter((sub) => sub.schedule_type === typeFilter)
    }

    setFilteredSubstitutions(filtered)
  }

  const handlePrint = (substitution: SubstitutionWithDetails) => {
    if (!substitution.originalEmployee || !substitution.substituteEmployee) {
      toast.error('Missing employee information')
      return
    }

    generatePrintableSubstitutionForm({
      substitution,
      originalEmployee: substitution.originalEmployee,
      substituteEmployee: substitution.substituteEmployee,
      scheduleName: substitution.scheduleDetails?.subject_name,
      section: substitution.scheduleDetails?.section,
      room: substitution.scheduleDetails?.room
    })
  }

  const getReasonBadge = (reason: string) => {
    const colors = {
      sick_leave: 'bg-red-500',
      emergency: 'bg-orange-500',
      personal: 'bg-blue-500',
      training: 'bg-purple-500',
      meeting: 'bg-green-500',
      other: 'bg-gray-500'
    }
    return colors[reason as keyof typeof colors] || 'bg-gray-500'
  }

  const handleViewDetails = (substitution: SubstitutionWithDetails) => {
    setSelectedSubstitution(substitution)
    setIsDetailDialogOpen(true)
  }

  const handleDeleteClick = () => {
    setIsDetailDialogOpen(false)
    setIsDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!selectedSubstitution) return

    try {
      const isExam = selectedSubstitution.schedule_type === 'exam'
      if (isExam) {
        const examScheduleId = Math.abs(Number(selectedSubstitution.id))
        const res = await fetch(`/api/exam-schedules/${examScheduleId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'remove-substitution' }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(json?.error || 'Failed to remove exam substitution')
        }
      } else {
        const res = await fetch(`/api/substitution/records?id=${selectedSubstitution.id}`, {
          method: 'DELETE',
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(json?.error || 'Failed to delete substitution record')
        }
      }

      toast.success(isExam ? 'Exam substitution removed successfully' : 'Substitution record deleted successfully')
      setIsDeleteDialogOpen(false)
      setSelectedSubstitution(null)
      fetchSubstitutions()
    } catch (error: any) {
      console.error('Error deleting substitution:', error)
      toast.error(error.message || 'Failed to delete substitution record')
    }
  }

  // Allow super_admin, Academic Head, and Program Head to delete substitutions
  const isSuperAdmin = currentUser?.role === 'super_admin' || 
                       currentUser?.role === 'Academic Head' || 
                       currentUser?.role === 'Program Head' ||
                       currentUser?.role === 'academic_head' ||
                       currentUser?.role === 'program_head'

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6 animate-fadeInUp">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Substitution Forms</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            View and print faculty substitution records
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchSubstitutions}>
            <Download className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
          <CardDescription>Search and filter substitution records</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Name, subject, section..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Date Filter */}
            <div className="space-y-2">
              <Label htmlFor="date-filter">Date Range</Label>
              <Select value={dateFilter} onValueChange={(value: any) => setDateFilter(value)}>
                <SelectTrigger id="date-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">Last 7 Days</SelectItem>
                  <SelectItem value="month">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Type Filter */}
            <div className="space-y-2">
              <Label htmlFor="type-filter">Schedule Type</Label>
              <Select value={typeFilter} onValueChange={(value: any) => setTypeFilter(value)}>
                <SelectTrigger id="type-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="teaching">Teaching</SelectItem>
                  <SelectItem value="exam">Exam</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Stats */}
            <div className="space-y-2">
              <Label>Total Records</Label>
              <div className="flex items-center gap-2 h-10">
                <Users className="h-5 w-5 text-muted-foreground" />
                <span className="text-2xl font-bold">{filteredSubstitutions.length}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Substitutions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Substitution Records</CardTitle>
          <CardDescription>
            {filteredSubstitutions.length} record(s) found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Loading substitutions...</p>
            </div>
          ) : filteredSubstitutions.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium">No substitutions found</p>
              <p className="text-muted-foreground">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Subject/Section</TableHead>
                    <TableHead>Original Faculty</TableHead>
                    <TableHead>Substitute Faculty</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubstitutions.map((sub) => (
                    <TableRow 
                      key={sub.id} 
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => handleViewDetails(sub)}
                    >
                      <TableCell className="font-medium">
                        {format(new Date(sub.date), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell className="text-sm">
                        {sub.time_slot || 'Full Day'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={sub.schedule_type === 'teaching' ? 'default' : 'secondary'}>
                          {sub.schedule_type === 'teaching' ? 'Class' : 'Exam'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-medium">{sub.scheduleDetails?.subject_name || 'N/A'}</div>
                          {sub.scheduleDetails?.section && (
                            <div className="text-muted-foreground">{sub.scheduleDetails.section}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-medium">{sub.originalEmployee?.full_name}</div>
                          <div className="text-muted-foreground">{sub.originalEmployee?.school_id}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-medium">{sub.substituteEmployee?.full_name}</div>
                          <div className="text-muted-foreground">{sub.substituteEmployee?.school_id}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{sub.reason || 'No reason provided'}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            handlePrint(sub)
                          }}
                          className="gap-2"
                        >
                          <Printer className="h-4 w-4" />
                          Print
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail View Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Substitution Record Details
            </DialogTitle>
            <DialogDescription>
              View complete information about this substitution record
            </DialogDescription>
          </DialogHeader>

          {selectedSubstitution && (
            <div className="space-y-6">
              {/* Status Badge */}
              <div className="flex items-center justify-between">
                <Badge variant={selectedSubstitution.schedule_type === 'teaching' ? 'default' : 'secondary'} className="text-sm">
                  {selectedSubstitution.schedule_type === 'teaching' ? 'Class Substitution' : 'Exam Substitution'}
                </Badge>
                {selectedSubstitution.status && (
                  <Badge variant={selectedSubstitution.status === 'approved' ? 'default' : 'secondary'}>
                    {selectedSubstitution.status}
                  </Badge>
                )}
              </div>

              {/* Date and Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Date</Label>
                  <p className="font-medium">{format(new Date(selectedSubstitution.date), 'MMMM dd, yyyy')}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Time</Label>
                  <p className="font-medium">{selectedSubstitution.time_slot || 'Full Day'}</p>
                </div>
              </div>

              {/* Original Faculty */}
              <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                <Label className="text-muted-foreground">Original Faculty (Absent)</Label>
                <div className="space-y-1">
                  <p className="font-semibold text-lg">{selectedSubstitution.originalEmployee?.full_name}</p>
                  <p className="text-sm text-muted-foreground">ID: {selectedSubstitution.originalEmployee?.school_id}</p>
                  <p className="text-sm text-muted-foreground">Department: {selectedSubstitution.originalEmployee?.department}</p>
                  {selectedSubstitution.originalEmployee?.email && (
                    <p className="text-sm text-muted-foreground">Email: {selectedSubstitution.originalEmployee.email}</p>
                  )}
                </div>
              </div>

              {/* Substitute Faculty */}
              <div className="space-y-2 p-4 bg-primary/5 rounded-lg border border-primary/20">
                <Label className="text-muted-foreground">Substitute Faculty (Assigned)</Label>
                <div className="space-y-1">
                  <p className="font-semibold text-lg">{selectedSubstitution.substituteEmployee?.full_name}</p>
                  <p className="text-sm text-muted-foreground">ID: {selectedSubstitution.substituteEmployee?.school_id}</p>
                  <p className="text-sm text-muted-foreground">Department: {selectedSubstitution.substituteEmployee?.department}</p>
                  {selectedSubstitution.substituteEmployee?.email && (
                    <p className="text-sm text-muted-foreground">Email: {selectedSubstitution.substituteEmployee.email}</p>
                  )}
                </div>
              </div>

              {/* Reason */}
              <div className="space-y-2">
                <Label className="text-muted-foreground">Reason for Substitution</Label>
                <p className="p-3 bg-muted/30 rounded-md">{selectedSubstitution.reason || 'No reason provided'}</p>
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Created At</Label>
                  <p className="text-sm">{selectedSubstitution.created_at ? format(new Date(selectedSubstitution.created_at), 'MMM dd, yyyy hh:mm a') : 'N/A'}</p>
                </div>
                {selectedSubstitution.approved_at && (
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Approved At</Label>
                    <p className="text-sm">{format(new Date(selectedSubstitution.approved_at), 'MMM dd, yyyy hh:mm a')}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            {isSuperAdmin && (
              <Button
                variant="destructive"
                onClick={handleDeleteClick}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete Record
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => selectedSubstitution && handlePrint(selectedSubstitution)}
              className="gap-2"
            >
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button onClick={() => setIsDetailDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Delete Substitution Record?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the substitution record for:
              <div className="mt-3 p-3 bg-muted rounded-md space-y-1">
                <p className="font-medium">{selectedSubstitution?.originalEmployee?.full_name} → {selectedSubstitution?.substituteEmployee?.full_name}</p>
                <p className="text-sm">{selectedSubstitution?.date && format(new Date(selectedSubstitution.date), 'MMMM dd, yyyy')}</p>
                <p className="text-sm">{selectedSubstitution?.time_slot}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
