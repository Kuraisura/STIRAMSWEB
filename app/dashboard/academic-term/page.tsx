/**
 * Academic Term Management UI
 * Route: /dashboard/academic-term
 * Manage academic terms for filtering and reporting
 */

'use client'

import { useState, useEffect } from 'react'
import type { AcademicTerm } from '@/lib/types/database.types'
import { getAcademicYearBounds, getAllowedTermWindow } from '@/lib/academic-term-policy'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Plus, Edit, Trash2, Calendar, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { format, isAfter, isBefore, parseISO } from 'date-fns'

export default function AcademicTermPage() {
  const [terms, setTerms] = useState<AcademicTerm[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [currentTerm, setCurrentTerm] = useState<AcademicTerm | null>(null)
  const [deleteWarningOpen, setDeleteWarningOpen] = useState(false)
  const [termToDelete, setTermToDelete] = useState<number | null>(null)
  const [validationWarningOpen, setValidationWarningOpen] = useState(false)
  const [validationWarningTitle, setValidationWarningTitle] = useState('Cannot Save Academic Term')
  const [validationWarningMessage, setValidationWarningMessage] = useState('Please review the term dates and try again.')

  const [formData, setFormData] = useState({
    academic_year: '',
    term_name: '1st Term',
    start_date: '',
    end_date: '',
    is_active: false,
  })

  useEffect(() => {
    fetchTerms()
  }, [])

  const getAuditHeaders = (): Record<string, string> => {
    if (typeof window === 'undefined') {
      return {
        'x-user-id': '0',
        'x-user-email': 'unknown',
        'x-user-name': 'Unknown User',
      }
    }
    try {
      const raw = localStorage.getItem('rams_user')
      const user = raw ? JSON.parse(raw) : null
      return {
        'x-user-id': String(user?.id || 0),
        'x-user-email': String(user?.email || 'unknown'),
        'x-user-name': String(user?.name || user?.full_name || 'Unknown User'),
      }
    } catch {
      return {
        'x-user-id': '0',
        'x-user-email': 'unknown',
        'x-user-name': 'Unknown User',
      }
    }
  }

  const parseError = async (res: Response, fallback: string) => {
    const body = await res.json().catch(() => ({}))
    return body?.error || fallback
  }

  const fetchTerms = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/academic-terms', { cache: 'no-store' })
      if (!res.ok) {
        throw new Error(await parseError(res, 'Failed to fetch terms'))
      }
      const payload = await res.json().catch(() => ({}))
      setTerms(Array.isArray(payload?.data) ? payload.data : [])
    } catch (error: any) {
      console.error('Error fetching terms:', error)
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const openDialog = (term?: AcademicTerm) => {
    if (term) {
      setEditMode(true)
      setCurrentTerm(term)
      setFormData({
        academic_year: term.academic_year,
        term_name: term.term_name,
        start_date: term.start_date,
        end_date: term.end_date,
        is_active: term.is_active,
      })
    } else {
      setEditMode(false)
      setCurrentTerm(null)
      setFormData({
        academic_year: '',
        term_name: '1st Term',
        start_date: '',
        end_date: '',
        is_active: false,
      })
    }
    setDialogOpen(true)
  }

  const openValidationWarning = (title: string, message: string) => {
    setValidationWarningTitle(title)
    setValidationWarningMessage(message)
    setValidationWarningOpen(true)
  }

  const normalizeAcademicYearInput = (value: string) => {
    // Strictly enforce YYYY-YYYY with +1 rule by shaping the input.
    // - only digits and one dash
    // - max 9 chars
    const digits = value.replace(/[^\d-]/g, '')
    const parts = digits.split('-')
    const left = (parts[0] || '').slice(0, 4)
    const right = (parts[1] || '').slice(0, 4)
    return right ? `${left}-${right}` : left.length === 4 && digits.includes('-') ? `${left}-` : left
  }

  const getTermDefaultDates = (academicYear: string, termName: string) => {
    const bounds = getAcademicYearBounds(academicYear)
    const window = getAllowedTermWindow(termName)
    if (!bounds || !window) return null

    const startYear = window.expectedStartYearFromAcademicYear === 1 ? bounds.startYear : bounds.endYear
    const endYear = window.expectedEndYearFromAcademicYear === 1 ? bounds.startYear : bounds.endYear
    const startDate = `${startYear}-${String(window.startMonth).padStart(2, '0')}-01`
    const lastDay = new Date(Date.UTC(endYear, window.endMonth, 0)).getUTCDate()
    const endDate = `${endYear}-${String(window.endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    return { startDate, endDate }
  }

  useEffect(() => {
    // When academic year + term name are valid, auto-suggest the standard date window
    // (Aug-Dec / Jan-May / Jun-Jul) so users don't need to guess.
    const defaults = getTermDefaultDates(formData.academic_year, formData.term_name)
    if (!defaults) return

    setFormData((prev) => {
      const next = { ...prev }
      if (!prev.start_date) next.start_date = defaults.startDate
      if (!prev.end_date) next.end_date = defaults.endDate
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.academic_year, formData.term_name])

  const validateDates = () => {
    const bounds = getAcademicYearBounds(formData.academic_year)
    if (!bounds) {
      openValidationWarning(
        'Invalid Academic Year',
        'Academic Year must be in YYYY-YYYY format and the second year must be exactly the first year + 1 (example: 2025-2026).'
      )
      return false
    }

    if (!formData.start_date || !formData.end_date) {
      toast.error('Please fill in all date fields')
      return false
    }

    const startDate = parseISO(formData.start_date)
    const endDate = parseISO(formData.end_date)

    if (isAfter(startDate, endDate)) {
      toast.error('Start date must be before end date')
      return false
    }

    const overlapping = terms.find(term => {
      if (editMode && term.id === currentTerm?.id) return false

      const termStart = parseISO(term.start_date)
      const termEnd = parseISO(term.end_date)

      return (
        (isAfter(startDate, termStart) && isBefore(startDate, termEnd)) ||
        (isAfter(endDate, termStart) && isBefore(endDate, termEnd)) ||
        (isBefore(startDate, termStart) && isAfter(endDate, termEnd))
      )
    })

    if (overlapping) {
      toast.error(`Date range overlaps with ${overlapping.academic_year} - ${overlapping.term_name}`)
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateDates()) return

    try {
      if (editMode && currentTerm) {
        const res = await fetch('/api/academic-terms', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...getAuditHeaders(),
          },
          body: JSON.stringify({ id: currentTerm.id, ...formData }),
        })

        if (!res.ok) throw new Error(await parseError(res, 'Failed to update term'))

        toast.success('Academic term updated successfully')
      } else {
        const res = await fetch('/api/academic-terms', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuditHeaders(),
          },
          body: JSON.stringify(formData),
        })

        if (!res.ok) throw new Error(await parseError(res, 'Failed to create term'))

        toast.success('Academic term created successfully')
      }

      setDialogOpen(false)
      fetchTerms()
    } catch (error: any) {
      console.error('Error saving term:', error)
      toast.error(error.message)
    }
  }

  const handleDelete = async (id: number) => {
    if (terms.length === 1) {
      toast.error('Cannot delete the last academic term', {
        description: 'At least one academic term must exist in the system.',
      })
      return
    }

    setTermToDelete(id)
    setDeleteWarningOpen(true)
  }

  const confirmDelete = async () => {
    if (!termToDelete) return

    try {
      const res = await fetch(`/api/academic-terms?id=${termToDelete}`, {
        method: 'DELETE',
        headers: getAuditHeaders(),
      })

      if (!res.ok) throw new Error(await parseError(res, 'Failed to delete term'))

      toast.success('Academic term deleted successfully')
      fetchTerms()
    } catch (error: any) {
      console.error('Error deleting term:', error)
      toast.error(error.message)
    } finally {
      setDeleteWarningOpen(false)
      setTermToDelete(null)
    }
  }

  const toggleActive = async (term: AcademicTerm) => {
    try {
      // Prevent leaving the system without an active term.
      // Admin must create/activate a new term first.
      if (term.is_active) {
        openValidationWarning(
          'Cannot Turn Off Active Term',
          'Please create a new academic term and set it as Active first. The current active term cannot be set to inactive without another active term.'
        )
        return
      }

      if (!term.is_active) {
        const endDate = parseISO(term.end_date)
        if (isAfter(new Date(), endDate)) {
          toast.error(
            'This term has already ended. Please edit the term and update its dates before setting it as active.',
            { duration: 5000 }
          )
          return
        }
      }

      const res = await fetch('/api/academic-terms', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuditHeaders(),
        },
        body: JSON.stringify({
          id: term.id,
          academic_year: term.academic_year,
          term_name: term.term_name,
          start_date: term.start_date,
          end_date: term.end_date,
          is_active: !term.is_active,
        }),
      })

      if (!res.ok) throw new Error(await parseError(res, 'Failed to update active status'))

      toast.success(`Term ${term.is_active ? 'deactivated' : 'set as active'}`)
      fetchTerms()
    } catch (error: any) {
      console.error('Error toggling active status:', error)
      toast.error(error.message)
    }
  }

  const activeTerm = terms.find(t => t.is_active)
  const { minDate, maxDate } = (() => {
    const bounds = getAcademicYearBounds(formData.academic_year)
    const window = getAllowedTermWindow(formData.term_name)

    if (!bounds) return { minDate: undefined, maxDate: undefined }
    if (!window) return { minDate: undefined, maxDate: undefined }

    const startYear = window.expectedStartYearFromAcademicYear === 1 ? bounds.startYear : bounds.endYear
    const endYear = window.expectedEndYearFromAcademicYear === 1 ? bounds.startYear : bounds.endYear
    const minDate = `${startYear}-${String(window.startMonth).padStart(2, '0')}-01`
    const maxDay = new Date(Date.UTC(endYear, window.endMonth, 0)).getUTCDate()
    const maxDate = `${endYear}-${String(window.endMonth).padStart(2, '0')}-${String(maxDay).padStart(2, '0')}`
    return { minDate, maxDate }
  })()

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6 animate-fadeInUp">
      {/* Header - Mobile Responsive */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600" />
            Academic Term Management
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Configure academic years and terms for scheduling and reporting
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Button onClick={() => openDialog()} className="h-11 sm:h-12" variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Add Term
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">{editMode ? 'Edit Academic Term' : 'Create Academic Term'}</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {editMode ? 'Update the academic term details' : 'Add a new academic term to the system'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Academic Year *</Label>
              <Input
                placeholder="e.g., 2025-2026"
                value={formData.academic_year}
                inputMode="numeric"
                maxLength={9}
                onChange={(e) => setFormData({ ...formData, academic_year: normalizeAcademicYearInput(e.target.value) })}
                required
                className="h-11 sm:h-12"
              />
              <p className="text-xs text-muted-foreground">Format: YYYY-YYYY (e.g., 2025-2026)</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Term Name *</Label>
              <Select
                value={formData.term_name}
                onValueChange={(value) =>
                  setFormData((prev) => {
                    // When term changes, reset dates so defaults can be applied for the selected term.
                    return { ...prev, term_name: value, start_date: '', end_date: '' }
                  })
                }
              >
                <SelectTrigger className="h-11 sm:h-12 touch-manipulation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1st Term">1st Term</SelectItem>
                  <SelectItem value="2nd Term">2nd Term</SelectItem>
                  <SelectItem value="Summer">Summer</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {formData.term_name === '1st Term'
                  ? 'Aug to Dec (First Semester)'
                  : formData.term_name === '2nd Term'
                    ? 'Jan to May (Second Semester)'
                    : 'Jun to Jul (Inter-term / Summer)'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Start Date *</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  required
                  min={minDate}
                  max={maxDate}
                  className="h-11 sm:h-12"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">End Date *</Label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  required
                  min={minDate}
                  max={maxDate}
                  className="h-11 sm:h-12"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div>
                <Label className="text-sm">Set as Active Term</Label>
                <p className="text-xs text-muted-foreground">
                  Only one term can be active at a time
                </p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button type="submit" className="flex-1 h-11 sm:h-12 touch-manipulation">
                {editMode ? 'Update Term' : 'Create Term'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="h-11 sm:h-12 touch-manipulation">
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Active Term Indicator - Enhanced Display */}
      {activeTerm ? (
        <Card className="border-2 border-green-500 bg-linear-to-r from-green-50 via-emerald-50 to-green-50 dark:from-green-950 dark:via-emerald-950 dark:to-green-950 shadow-lg">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-green-500 rounded-xl shadow-md">
                  <CheckCircle2 className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg sm:text-xl font-bold text-green-900 dark:text-green-100">
                      Active Academic Term
                    </h3>
                    <Badge className="bg-green-600 text-white border-0 shadow-sm">
                      Current
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <p className="text-2xl sm:text-3xl font-bold text-green-800 dark:text-green-200">
                        {activeTerm.academic_year}
                      </p>
                      <span className="text-xl text-green-600 dark:text-green-400">•</span>
                      <p className="text-xl sm:text-2xl font-semibold text-green-700 dark:text-green-300">
                        {activeTerm.term_name}
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-green-700 dark:text-green-300">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <span className="font-medium">
                          {format(parseISO(activeTerm.start_date), 'MMMM dd, yyyy')} - {format(parseISO(activeTerm.end_date), 'MMMM dd, yyyy')}
                        </span>
                      </div>
                      <span className="hidden sm:inline text-green-500">•</span>
                      <span className="font-semibold">
                        {Math.ceil((parseISO(activeTerm.end_date).getTime() - parseISO(activeTerm.start_date).getTime()) / (1000 * 60 * 60 * 24))} days
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-2 border-yellow-500 bg-linear-to-r from-yellow-50 via-amber-50 to-yellow-50 dark:from-yellow-950 dark:via-amber-950 dark:to-yellow-950">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-yellow-500 rounded-xl shadow-md">
                <Calendar className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-yellow-900 dark:text-yellow-100">
                  No Active Term Set
                </h3>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  Please activate an academic term to enable scheduling and reporting features
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Terms Table/Cards */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">Academic Terms</CardTitle>
          <CardDescription className="text-sm">
            {terms.length} term(s) configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            </div>
          ) : terms.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-base sm:text-lg font-medium">No academic terms yet</p>
              <p className="text-sm text-muted-foreground">Click "Add Term" to create your first term</p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Academic Year</TableHead>
                      <TableHead>Term Name</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {terms.map((term) => {
                      const startDate = parseISO(term.start_date)
                      const endDate = parseISO(term.end_date)
                      const today = new Date()
                      const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

                      let dateStatus = 'Upcoming'
                      let dateStatusColor = 'bg-blue-50 text-blue-700 border-blue-300'
                      
                      if (isAfter(today, endDate)) {
                        dateStatus = 'Past'
                        dateStatusColor = 'bg-gray-50 text-gray-700 border-gray-300'
                      } else if (isAfter(today, startDate) && isBefore(today, endDate)) {
                        dateStatus = 'Ongoing'
                        dateStatusColor = 'bg-green-50 text-green-700 border-green-300'
                      }

                      return (
                        <TableRow key={term.id}>
                          <TableCell className="font-medium">{term.academic_year}</TableCell>
                          <TableCell>{term.term_name}</TableCell>
                          <TableCell>{format(startDate, 'MMM dd, yyyy')}</TableCell>
                          <TableCell>{format(endDate, 'MMM dd, yyyy')}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {durationDays} days
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {term.is_active && (
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                                  Active
                                </Badge>
                              )}
                              <Badge variant="outline" className={dateStatusColor}>
                                {dateStatus}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={term.is_active}
                                onCheckedChange={() => toggleActive(term)}
                                title="Set as active term"
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openDialog(term)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 border-red-300 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => handleDelete(term.id)}
                                disabled={terms.length === 1}
                                title={terms.length === 1 ? "Cannot delete the last academic term" : "Delete term"}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card View */}
              <div className="lg:hidden space-y-4">
                {terms.map((term) => {
                  const startDate = parseISO(term.start_date)
                  const endDate = parseISO(term.end_date)
                  const today = new Date()
                  const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

                  let dateStatus = 'Upcoming'
                  let dateStatusColor = 'bg-blue-50 text-blue-700 border-blue-300'
                  
                  if (isAfter(today, endDate)) {
                    dateStatus = 'Past'
                    dateStatusColor = 'bg-gray-50 text-gray-700 border-gray-300'
                  } else if (isAfter(today, startDate) && isBefore(today, endDate)) {
                    dateStatus = 'Ongoing'
                    dateStatusColor = 'bg-green-50 text-green-700 border-green-300'
                  }

                  return (
                    <Card key={term.id} className="border-2">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-bold text-base">{term.academic_year}</p>
                            <p className="text-sm text-muted-foreground">{term.term_name}</p>
                          </div>
                          <div className="flex gap-2">
                            {term.is_active && (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 text-xs">
                                Active
                              </Badge>
                            )}
                            <Badge variant="outline" className={`${dateStatusColor} text-xs`}>
                              {dateStatus}
                            </Badge>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-2 border-t text-xs">
                          <div>
                            <p className="text-muted-foreground">Start Date</p>
                            <p className="font-medium mt-1">{format(startDate, 'MMM dd, yyyy')}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">End Date</p>
                            <p className="font-medium mt-1">{format(endDate, 'MMM dd, yyyy')}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-muted-foreground">Duration</p>
                            <p className="font-medium mt-1">{durationDays} days</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={term.is_active}
                              onCheckedChange={() => toggleActive(term)}
                              title="Set as active term"
                            />
                            <span className="text-xs text-muted-foreground">Set Active</span>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openDialog(term)}
                              className="h-9 touch-manipulation"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 border-red-300 hover:bg-red-50 h-9 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                              onClick={() => handleDelete(term.id)}
                              disabled={terms.length === 1}
                              title={terms.length === 1 ? "Cannot delete the last academic term" : "Delete term"}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Delete Warning Dialog */}
      <AlertDialog open={deleteWarningOpen} onOpenChange={setDeleteWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this term?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the academic term and may affect associated schedules.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTermToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={validationWarningOpen} onOpenChange={setValidationWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{validationWarningTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {validationWarningMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setValidationWarningOpen(false)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
