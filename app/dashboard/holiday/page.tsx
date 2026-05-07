/**
 * Holiday Management Page
 * Route: /dashboard/holiday
 * Manage system-wide holidays, suspended classes, and online class days
 * 
 * BUSINESS RULES:
 * ============================================================================
 * 1. HOLIDAY (No Classes to All)
 *    - Example: "Santa Rosa Day", "Christmas"
 *    - Everyone has a day off, no attendance tracking
 *    - Settings: affects_attendance = true, reporting_staff_only = false
 * 
 * 2. CLASS SUSPENSION - REPORTING (suspended_asynchronous)
 *    - Example: "Typhoon", "LGU Announcement", "Earthquake"
 *    - Only employees with status [Part Time Full Load, Regular] report (no Part-Time)
 *    - Counts as Admin Time (not regular work)
 *    - Settings: affects_attendance = false, reporting_staff_only = true
 * 
 * 3. CLASS SUSPENSION - ONLINE CLASS (online_class)
 *    - Example: "Online Class due to Typhoon"
 *    - All employees work online [Part Time Full Load, Regular, Part-Time]
 *    - Attendance must follow class schedule; outside class = Admin Time
 *    - Settings: affects_attendance = false, reporting_staff_only = false
 * ============================================================================
 */

'use client'

import { useState, useEffect } from 'react'
import type { HolidayCalendar } from '@/lib/types/database.types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Calendar as CalendarPicker } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar, Plus, Trash2, Edit, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { format, differenceInDays } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

interface HolidayFormData {
  date: string
  endDate?: string
  isDateRange: boolean
  type: 'holiday' | 'suspended_asynchronous' | 'suspended_synchronous' | 'online_class'
  name: string
  description?: string
  affects_attendance: boolean
  reporting_staff_only?: boolean
}

const normalizeDateOnly = (value?: string | null): string => {
  if (!value || typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return ''
  return formatInTimeZone(parsed, 'Asia/Manila', 'yyyy-MM-dd')
}

const parseDateAtMidnight = (value?: string | null): Date | null => {
  const normalized = normalizeDateOnly(value)
  if (!normalized) return null

  const date = new Date(`${normalized}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return date
}

const rangeContainsSunday = (start: Date, end: Date): boolean => {
  const cursor = new Date(start)
  cursor.setHours(0, 0, 0, 0)
  const limit = new Date(end)
  limit.setHours(0, 0, 0, 0)

  while (cursor <= limit) {
    if (cursor.getDay() === 0) return true
    cursor.setDate(cursor.getDate() + 1)
  }
  return false
}

const isSundayFromDateString = (value?: string | null): boolean => {
  const parsed = parseDateAtMidnight(value)
  if (!parsed) return false
  return parsed.getDay() === 0
}

const formatSafeDate = (value?: string | null, pattern: string = 'EEEE, MMMM d, yyyy') => {
  const parsed = parseDateAtMidnight(value)
  if (!parsed) return 'Invalid date'
  return format(parsed, pattern)
}

export default function HolidayManagementPage() {
  const [holidays, setHolidays] = useState<HolidayCalendar[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [warningDialogOpen, setWarningDialogOpen] = useState(false)
  const [warningMessage, setWarningMessage] = useState({ title: '', description: '', type: 'past' as 'past' | 'longRange' })
  const [validationDialogOpen, setValidationDialogOpen] = useState(false)
  const [validationIssues, setValidationIssues] = useState<string[]>([])
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
  const [duplicateHolidays, setDuplicateHolidays] = useState<HolidayCalendar[]>([])
  const [pendingSubmit, setPendingSubmit] = useState(false)
  const [startDatePickerOpen, setStartDatePickerOpen] = useState(false)
  const [endDatePickerOpen, setEndDatePickerOpen] = useState(false)
  const [holidayToDelete, setHolidayToDelete] = useState<HolidayCalendar | null>(null)
  const [editingHoliday, setEditingHoliday] = useState<HolidayCalendar | null>(null)
  const [formData, setFormData] = useState<HolidayFormData>({
    date: '',
    endDate: '',
    isDateRange: false,
    type: 'holiday',
    name: '',
    description: '',
    affects_attendance: true,
    reporting_staff_only: false
  })

  useEffect(() => {
    fetchHolidays()
  }, [])

  const fetchHolidays = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/holidays', { cache: 'no-store' })
      const data = await res.json().catch(() => [])
      if (!res.ok) {
        throw new Error((data as any)?.error || 'Failed to load holidays')
      }
      
      // Sort by start_date or date
      const sortedData = (data || []).sort((a, b) => {
        const aDate = normalizeDateOnly(a.start_date || a.date)
        const bDate = normalizeDateOnly(b.start_date || b.date)
        return aDate.localeCompare(bDate)
      })
      
      setHolidays(sortedData)
    } catch (error) {
      console.error('Error fetching holidays:', error)
      toast.error('Failed to load holidays')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    console.log('[Holiday Submit] Form data:', formData)
    const issues: string[] = []

    // Validation: Check if date is provided
    if (!formData.date) {
      issues.push('Please select a start date.')
    }

    // Validation: Date range validation
    const parsedStartDate = parseDateAtMidnight(formData.date)
    if (!parsedStartDate) {
      issues.push('Invalid start date. Please select a valid date.')
    }

    if (parsedStartDate && parsedStartDate.getDay() === 0) {
      issues.push('Sunday is not allowed. Please select Monday to Saturday only.')
    }

    if (formData.isDateRange) {
      if (!formData.endDate) {
        issues.push('Please select an end date for the date range.')
      }
      const parsedEndDate = parseDateAtMidnight(formData.endDate)
      if (formData.endDate && !parsedEndDate) {
        issues.push('Invalid end date. Please select a valid date.')
      }

      if (parsedStartDate && parsedEndDate && parsedEndDate < parsedStartDate) {
        issues.push('End date must be on or after the start date.')
      }

      if (parsedStartDate && parsedEndDate && rangeContainsSunday(parsedStartDate, parsedEndDate)) {
        issues.push('Date range includes Sunday. Please select Monday to Saturday only.')
      }

      if (parsedStartDate && parsedEndDate) {
        const daysDiff = differenceInDays(parsedEndDate, parsedStartDate)
        console.log(`[Holiday Submit] Date range: ${formData.date} to ${formData.endDate}, ${daysDiff + 1} days`)
      
        // Warn for long ranges
        if (daysDiff > 30 && !pendingSubmit) {
          setWarningMessage({
            title: '⚠️ Long Date Range Detected',
            description: `You are creating a ${daysDiff + 1}-day holiday range. This will create a single entry spanning from ${format(parsedStartDate, 'MMM d, yyyy')} to ${format(parsedEndDate, 'MMM d, yyyy')}.`,
            type: 'longRange'
          })
          setWarningDialogOpen(true)
          return
        }
      }
    }

    // Validation: Check if name is provided and not empty
    if (!formData.name.trim()) {
      issues.push('Please enter a holiday/event name.')
    }

    if (issues.length > 0) {
      setValidationIssues(issues)
      setValidationDialogOpen(true)
      return
    }

    // Validation: Check for duplicate/overlapping dates
    // For date ranges, we need to check if any existing holiday overlaps with our range
    if (!editingHoliday) {
      const startDate = normalizeDateOnly(formData.date)
      const endDate = formData.isDateRange && formData.endDate ? normalizeDateOnly(formData.endDate) : normalizeDateOnly(formData.date)
      
      // Check for overlapping holidays
      const overlapping = holidays.filter(h => {
        const hStart = normalizeDateOnly(h.start_date || h.date)
        const hEnd = normalizeDateOnly(h.end_date || h.date)
        if (!hStart || !hEnd) return false
        
        // Check if ranges overlap
        return (startDate <= hEnd && endDate >= hStart)
      })
      
      if (overlapping.length > 0) {
        // Show duplicate dialog instead of toast
        setDuplicateHolidays(overlapping)
        setDuplicateDialogOpen(true)
        return
      }
    } else {
      // When editing, check if another holiday (not this one) overlaps
      const startDate = normalizeDateOnly(formData.date)
      const endDate = formData.isDateRange && formData.endDate ? normalizeDateOnly(formData.endDate) : normalizeDateOnly(formData.date)
      
      const overlapping = holidays.filter(h => {
        if (h.id === editingHoliday.id) return false // Skip the current holiday being edited
        
        const hStart = normalizeDateOnly(h.start_date || h.date)
        const hEnd = normalizeDateOnly(h.end_date || h.date)
        if (!hStart || !hEnd) return false
        
        return (startDate <= hEnd && endDate >= hStart)
      })
      
      if (overlapping.length > 0) {
        // Show duplicate dialog instead of toast
        setDuplicateHolidays(overlapping)
        setDuplicateDialogOpen(true)
        return
      }
    }

    // Validation: Warn if date is in the past (but allow it)
    const selectedDate = parsedStartDate
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    if (selectedDate < today && !editingHoliday && !pendingSubmit) {
      const daysPast = differenceInDays(today, selectedDate)
      const endDate = formData.isDateRange && formData.endDate ? formData.endDate : formData.date
      
      setWarningMessage({
        title: '📅 Adding Holiday in the Past',
        description: `You are ${editingHoliday ? 'editing' : 'adding'} a holiday that ${daysPast === 1 ? 'was yesterday' : `was ${daysPast} days ago`}. ${
          formData.isDateRange 
            ? `This will create a range from ${formatSafeDate(formData.date, 'MMM d, yyyy')} to ${formatSafeDate(endDate, 'MMM d, yyyy')}.`
            : `Date: ${format(selectedDate, 'EEEE, MMMM d, yyyy')}`
        } Do you want to continue?`,
        type: 'past'
      })
      setWarningDialogOpen(true)
      return
    }

    // If we reach here and pendingSubmit is true, proceed with the actual submission
    await performSubmit()
  }

  const performSubmit = async () => {
    setPendingSubmit(false)
    setWarningDialogOpen(false)

    try {
      if (editingHoliday) {
        // Edit mode: support both single date and date range
        console.log('[Holiday Submit] Editing holiday:', {
          id: editingHoliday.id,
          isDateRange: formData.isDateRange,
          startDate: formData.date,
          endDate: formData.endDate
        })

        const updateData: any = {
          type: formData.type,
          name: formData.name,
          description: formData.description,
          affects_attendance: formData.affects_attendance,
          reporting_only: formData.reporting_staff_only || false,
          updated_at: new Date().toISOString()
        }

        if (formData.isDateRange && formData.endDate) {
          // Date range: use start_date and end_date
          updateData.start_date = formData.date
          updateData.end_date = formData.endDate
          updateData.date = formData.date // Keep for backwards compatibility
        } else {
          // Single date: use date, start_date = end_date
          updateData.date = formData.date
          updateData.start_date = formData.date
          updateData.end_date = formData.date
        }

        const res = await fetch('/api/holidays', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingHoliday.id,
            ...updateData,
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || 'Failed to update holiday')
        
        const dayCount = formData.isDateRange && formData.endDate 
          ? differenceInDays(
              parseDateAtMidnight(formData.endDate) || parseDateAtMidnight(formData.date)!,
              parseDateAtMidnight(formData.date)!
            ) + 1
          : 1
        
        toast.success(
          dayCount > 1 
            ? `Holiday updated as ${dayCount}-day range successfully`
            : 'Holiday updated successfully'
        )
      } else {
        // Add mode: support date range
        if (formData.isDateRange && formData.endDate) {
          const start = parseDateAtMidnight(formData.date)
          const end = parseDateAtMidnight(formData.endDate)

          if (!start || !end) {
            throw new Error('Invalid date range. Please review start and end dates.')
          }

          const dayCount = differenceInDays(end, start) + 1
          
          console.log('[Holiday Submit] Creating date range holiday:', {
            startDate: formData.date,
            endDate: formData.endDate,
            dayCount
          })
          
          // Create single entry with date range
          const res = await fetch('/api/holidays', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: formData.date,
              start_date: formData.date,
              end_date: formData.endDate,
              type: formData.type,
              name: formData.name,
              description: formData.description,
              affects_attendance: formData.affects_attendance,
              reporting_only: formData.reporting_staff_only || false,
            }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(json?.error || 'Failed to create holiday range')
          toast.success(`${dayCount}-day holiday range added successfully`)
        } else {
          // Single date entry
          console.log('[Holiday Submit] Creating single holiday:', formData.date)
          
          const res = await fetch('/api/holidays', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: formData.date,
              start_date: formData.date,
              end_date: formData.date,
              type: formData.type,
              name: formData.name,
              description: formData.description,
              affects_attendance: formData.affects_attendance,
              reporting_only: formData.reporting_staff_only || false,
            }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(json?.error || 'Failed to create holiday')
          toast.success('Holiday added successfully')
        }
      }

      setDialogOpen(false)
      resetForm()
      fetchHolidays()
    } catch (error: any) {
      console.error('Error saving holiday:', error)
      toast.error(error.message || 'Failed to save holiday')
    }
  }

  const handleWarningConfirm = () => {
    setPendingSubmit(true)
    performSubmit()
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/holidays?id=${id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Failed to delete holiday')
      toast.success('Holiday deleted successfully')
      fetchHolidays()
      setDeleteDialogOpen(false)
      setHolidayToDelete(null)
    } catch (error: any) {
      console.error('Error deleting holiday:', error)
      toast.error(error.message || 'Failed to delete holiday')
    }
  }

  const openDeleteDialog = (holiday: HolidayCalendar) => {
    setHolidayToDelete(holiday)
    setDeleteDialogOpen(true)
  }

  const handleEdit = (holiday: HolidayCalendar) => {
    const startDate = normalizeDateOnly(holiday.start_date || holiday.date)
    const endDate = normalizeDateOnly(holiday.end_date || holiday.date)
    const isRange = startDate !== endDate
    
    setEditingHoliday(holiday)
    setFormData({
      date: startDate,
      endDate: isRange ? endDate : '',
      isDateRange: isRange,
      type: holiday.type as 'holiday' | 'suspended_asynchronous' | 'suspended_synchronous' | 'online_class',
      name: holiday.name,
      description: holiday.description || '',
      affects_attendance: holiday.affects_attendance,
      reporting_staff_only: holiday.reporting_only || false
    })
    setDialogOpen(true)
  }

  const resetForm = () => {
    setEditingHoliday(null)
    setFormData({
      date: '',
      endDate: '',
      isDateRange: false,
      type: 'holiday',
      name: '',
      description: '',
      affects_attendance: true,
      reporting_staff_only: false
    })
  }

  const isStartDateDisabled = (date: Date) => {
    if (date.getDay() === 0) return true // Disable Sundays
    if (!editingHoliday) {
      const currentYearStart = new Date(`${new Date().getFullYear()}-01-01T00:00:00`)
      if (date < currentYearStart) return true
    }
    return false
  }

  const isEndDateDisabled = (date: Date) => {
    if (date.getDay() === 0) return true // Disable Sundays
    const start = parseDateAtMidnight(formData.date)
    if (start && date < start) return true
    if (!editingHoliday) {
      const currentYearStart = new Date(`${new Date().getFullYear()}-01-01T00:00:00`)
      if (date < currentYearStart) return true
    }
    return false
  }

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'holiday':
        return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">Holiday</Badge>
      case 'suspended':
      case 'suspended_asynchronous':
        return <Badge variant="default" className="bg-orange-500 hover:bg-orange-600">Class Suspension - Reporting</Badge>
      case 'online_class':
        return <Badge variant="secondary" className="bg-purple-500 hover:bg-purple-600 text-white">Class Suspension - Online</Badge>
      default:
        return <Badge variant="outline">{type}</Badge>
    }
  }

  const getTypeDescription = (type: string, affectsAttendance: boolean, reportingOnly: boolean) => {
    if (type === 'holiday' && affectsAttendance) {
      return "Everyone has a day off. No attendance tracking."
    }
    if ((type === 'suspended_asynchronous' || reportingOnly) && !affectsAttendance) {
      return "Only [Part Time Full Load, Regular] report physically. Counts as Admin Time."
    }
    if ((type === 'online_class' || !reportingOnly) && !affectsAttendance) {
      return "All staff work online. Must follow class schedule."
    }
    return "Custom configuration - check attendance settings."
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Holiday Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage system-wide holidays, suspended classes, and online class days
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) resetForm()
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Holiday
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>
                  {editingHoliday ? 'Edit Holiday' : 'Add New Holiday'}
                </DialogTitle>
                <DialogDescription>
                  {editingHoliday 
                    ? 'Update holiday information below'
                    : 'Add a new holiday, suspended class, or online class day'}
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="date">{formData.isDateRange ? 'Start Date *' : 'Date *'}</Label>
                  <Popover open={startDatePickerOpen} onOpenChange={setStartDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="date"
                        type="button"
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {formData.date ? formatSafeDate(formData.date, 'MMMM d, yyyy') : 'Select start date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarPicker
                        mode="single"
                        selected={parseDateAtMidnight(formData.date) || undefined}
                        onSelect={(date) => {
                          if (!date) return
                          if (date.getDay() === 0) {
                            toast.error('Sunday is not allowed. Please select Monday to Saturday only.')
                            return
                          }
                          const nextDate = format(date, 'yyyy-MM-dd')
                          setFormData((prev) => ({
                            ...prev,
                            date: nextDate,
                            endDate:
                              prev.isDateRange && prev.endDate && normalizeDateOnly(prev.endDate) < nextDate
                                ? nextDate
                                : prev.endDate,
                          }))
                          setStartDatePickerOpen(false)
                        }}
                        disabled={isStartDateDisabled}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground">
                    {formData.isDateRange 
                      ? 'Select the start date for your holiday range'
                      : 'Select the date for this holiday or class suspension'
                    }. Year must be {new Date().getFullYear()} or later.
                  </p>
                </div>

                <div className="flex items-center justify-between p-3 rounded-md border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                  <div className="space-y-0.5">
                    <Label 
                      htmlFor="date-range" 
                      className="text-blue-900 dark:text-blue-100 font-medium"
                    >
                      📅 Date Range Mode
                    </Label>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      {formData.isDateRange 
                        ? '✅ Enabled - You can select multiple consecutive days'
                        : 'Enable to create holidays spanning multiple days (e.g., Nov 15-20)'
                      }
                    </p>
                  </div>
                  <Switch
                    id="date-range"
                    checked={formData.isDateRange}
                    onCheckedChange={(checked) => {
                      console.log('[Date Range Toggle]', checked)
                      setFormData({ 
                        ...formData, 
                        isDateRange: checked,
                        endDate: checked ? formData.endDate : ''
                      })
                    }}
                  />
                </div>

                {formData.isDateRange && (
                  <div className="grid gap-2 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md">
                    <Label htmlFor="end-date" className="text-green-900 dark:text-green-100">End Date *</Label>
                    <Popover open={endDatePickerOpen} onOpenChange={setEndDatePickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          id="end-date"
                          type="button"
                          variant="outline"
                          className="w-full justify-start text-left font-normal border-green-300 dark:border-green-700"
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {formData.endDate ? formatSafeDate(formData.endDate, 'MMMM d, yyyy') : 'Select end date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarPicker
                          mode="single"
                          selected={parseDateAtMidnight(formData.endDate) || undefined}
                          onSelect={(date) => {
                            if (!date) return
                            if (date.getDay() === 0) {
                              toast.error('Sunday is not allowed. Please select Monday to Saturday only.')
                              return
                            }
                            const nextEndDate = format(date, 'yyyy-MM-dd')
                            console.log('[End Date Change]', nextEndDate)
                            setFormData((prev) => ({ ...prev, endDate: nextEndDate }))
                            setEndDatePickerOpen(false)
                          }}
                          disabled={isEndDateDisabled}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {(() => {
                      const start = parseDateAtMidnight(formData.date)
                      const end = parseDateAtMidnight(formData.endDate)
                      return Boolean(start && end && end >= start)
                    })() ? (
                      <div className="flex items-center gap-2 p-2 bg-green-100 dark:bg-green-900/30 rounded text-xs">
                        <span className="font-semibold text-green-800 dark:text-green-200">
                          📊 Range Summary:
                        </span>
                        <span className="text-green-700 dark:text-green-300">
                          {formatSafeDate(formData.date, 'MMM d')} - {formatSafeDate(formData.endDate, 'MMM d, yyyy')}
                        </span>
                        <Badge variant="outline" className="bg-green-200 dark:bg-green-900 text-green-800 dark:text-green-200 border-green-400">
                          {(() => {
                            const start = parseDateAtMidnight(formData.date)
                            const end = parseDateAtMidnight(formData.endDate)
                            if (!start || !end) return 'Invalid'
                            return `${differenceInDays(end, start) + 1} day(s)`
                          })()}
                        </Badge>
                      </div>
                    ) : (
                      <p className="text-xs text-orange-600 dark:text-orange-400">
                        ⚠️ End date must be on or after the start date
                      </p>
                    )}
                  </div>
                )}

                <div className="grid gap-2">
                  <Label htmlFor="type">Type *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value: 'holiday' | 'suspended_asynchronous' | 'suspended_synchronous' | 'online_class') => {
                      // Auto-set checkboxes based on business rules
                      let newData: HolidayFormData = { ...formData, type: value }
                      
                      if (value === 'holiday') {
                        // HOLIDAY: No attendance tracking, no one reports
                        newData.affects_attendance = true
                        newData.reporting_staff_only = false
                      } else if (value === 'suspended_asynchronous') {
                        // CLASS SUSPENSION - REPORTING: Attendance tracked, only reporting staff work
                        newData.affects_attendance = false
                        newData.reporting_staff_only = true
                      } else if (value === 'online_class') {
                        // ONLINE CLASS: Attendance tracked, all staff work online
                        newData.affects_attendance = false
                        newData.reporting_staff_only = false
                      }
                      
                      setFormData(newData)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="holiday">Holiday (No Classes to All)</SelectItem>
                      <SelectItem value="suspended_asynchronous">Class Suspension - Reporting</SelectItem>
                      <SelectItem value="online_class">Class Suspension - Online Class</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {/* Type Explanation */}
                  {formData.type === 'holiday' && (
                    <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md text-xs">
                      <AlertCircle className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                      <div className="text-blue-800 dark:text-blue-200">
                        <strong>Holiday (No Classes to All)</strong>
                        <p className="mt-1">Everyone has a day off. No attendance tracking. Example: "Santa Rosa Day", "Christmas"</p>
                      </div>
                    </div>
                  )}
                  
                  {formData.type === 'suspended_asynchronous' && (
                    <div className="flex items-start gap-2 p-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-md text-xs">
                      <AlertCircle className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400 mt-0.5 shrink-0" />
                      <div className="text-orange-800 dark:text-orange-200">
                        <strong>Class Suspension - Reporting</strong>
                        <p className="mt-1">Only staff with status [Part Time Full Load, Regular] must report physically. Counts as <strong>Admin Time</strong>. Example: "Typhoon", "Earthquake"</p>
                      </div>
                    </div>
                  )}
                  
                  {formData.type === 'online_class' && (
                    <div className="flex items-start gap-2 p-3 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-md text-xs">
                      <AlertCircle className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 mt-0.5 shrink-0" />
                      <div className="text-purple-800 dark:text-purple-200">
                        <strong>Class Suspension - Online Class</strong>
                        <p className="mt-1">All staff [Part Time Full Load, Regular, Part-Time] work online. Must time in/out during class schedule. Outside class hours = Admin Time. Example: "Online Class due to Typhoon"</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="name">Holiday/Event Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={
                      formData.type === 'holiday' 
                        ? "e.g., Christmas Day, Santa Rosa Day" 
                        : formData.type === 'suspended_asynchronous'
                        ? "e.g., Typhoon Signal #2, Earthquake"
                        : "e.g., Online Class due to Weather"
                    }
                    required
                    maxLength={100}
                  />
                  <p className="text-xs text-muted-foreground">
                    A clear, descriptive name for this entry.
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Add additional notes or details (e.g., LGU announcement number, specific instructions)"
                    rows={3}
                    maxLength={500}
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional: Add any relevant details, references, or instructions.
                  </p>
                </div>

                {/* Attendance Settings - Auto-configured and Read-only */}
                <div className="border-t pt-4 space-y-3">
                  <Label className="text-sm font-semibold">Attendance Settings</Label>
                  <p className="text-xs text-muted-foreground">
                    These settings are automatically configured based on the selected type above.
                  </p>
                  
                  {/* Indicator badges instead of checkboxes */}
                  <div className="grid grid-cols-1 gap-3">
                    {/* Attendance Tracking Status */}
                    <div className={`p-3 rounded-lg border transition-all ${
                      formData.affects_attendance 
                        ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" 
                        : "bg-gray-50/40 dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 opacity-50"
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-sm font-semibold ${
                          formData.affects_attendance 
                            ? "text-gray-700 dark:text-gray-300" 
                            : "text-gray-500 dark:text-gray-500"
                        }`}>
                          Attendance Tracking
                        </span>
                        <Badge variant={formData.affects_attendance ? "destructive" : "outline"} className={`text-xs ${
                          !formData.affects_attendance ? "opacity-50" : ""
                        }`}>
                          {formData.affects_attendance ? "Disabled" : "Enabled"}
                        </Badge>
                      </div>
                      <p className={`text-xs ${
                        formData.affects_attendance 
                          ? "text-gray-600 dark:text-gray-400" 
                          : "text-gray-400 dark:text-gray-600"
                      }`}>
                        {formData.affects_attendance 
                          ? "No attendance tracking - Everyone has the day off" 
                          : "Attendance tracking is active for eligible staff"}
                      </p>
                    </div>

                    {/* Who Reports Status */}
                    <div className={`p-3 rounded-lg border transition-all ${
                      !formData.affects_attendance && formData.reporting_staff_only 
                        ? "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800" 
                        : "bg-gray-50/40 dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 opacity-50"
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-sm font-semibold ${
                          !formData.affects_attendance && formData.reporting_staff_only 
                            ? "text-gray-700 dark:text-gray-300" 
                            : "text-gray-500 dark:text-gray-500"
                        }`}>
                          Who Reports
                        </span>
                        <Badge 
                          variant={formData.reporting_staff_only ? "secondary" : "outline"} 
                          className={`text-xs ${
                            formData.reporting_staff_only 
                              ? "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300" 
                              : "opacity-50"
                          }`}
                        >
                          {formData.reporting_staff_only ? "Reporting Staff Only" : "All Staff"}
                        </Badge>
                      </div>
                      <p className={`text-xs ${
                        !formData.affects_attendance && formData.reporting_staff_only 
                          ? "text-gray-600 dark:text-gray-400" 
                          : "text-gray-400 dark:text-gray-600"
                      }`}>
                        {formData.reporting_staff_only 
                          ? "Only [Part Time Full Load, Regular] report physically (Admin Time)" 
                          : "All staff [Part Time Full Load, Regular, Part-Time] work normally"}
                      </p>
                    </div>

                    {/* Time Type */}
                    <div className={`p-3 rounded-lg border transition-all ${
                      formData.affects_attendance 
                        ? "bg-gray-50/40 dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 opacity-50"
                        : formData.reporting_staff_only 
                          ? "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800" 
                          : "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-sm font-semibold ${
                          formData.affects_attendance 
                            ? "text-gray-500 dark:text-gray-500" 
                            : "text-gray-700 dark:text-gray-300"
                        }`}>
                          Time Type
                        </span>
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${
                            formData.affects_attendance 
                              ? "bg-gray-100/50 text-gray-500 opacity-50" 
                              : formData.reporting_staff_only 
                                ? "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-300" 
                                : "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300"
                          }`}
                        >
                          {formData.affects_attendance 
                            ? "No Work" 
                            : formData.reporting_staff_only 
                              ? "Admin Time" 
                              : "Teaching + Admin Time"}
                        </Badge>
                      </div>
                      <p className={`text-xs ${
                        formData.affects_attendance 
                          ? "text-gray-400 dark:text-gray-600" 
                          : "text-gray-600 dark:text-gray-400"
                      }`}>
                        {formData.affects_attendance 
                          ? "N/A - No work required" 
                          : formData.reporting_staff_only 
                            ? "All time logged counts as Admin Time" 
                            : "During class = Teaching Time, Outside class = Admin Time"}
                      </p>
                    </div>
                  </div>

                  {/* Configuration Summary with Detailed Rules */}
                  <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md">
                    <AlertCircle className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                    <div className="text-xs text-green-800 dark:text-green-200">
                      <strong>Current Configuration:</strong>
                      <ul className="mt-1.5 space-y-1 ml-1">
                        {formData.affects_attendance && (
                          <>
                            <li>• <strong>Attendance tracking:</strong> Disabled</li>
                            <li>• <strong>Who reports:</strong> No one (day off for all)</li>
                            <li>• <strong>Time type:</strong> N/A - No work required</li>
                          </>
                        )}
                        {!formData.affects_attendance && formData.reporting_staff_only && (
                          <>
                            <li>• <strong>Attendance tracking:</strong> Enabled for reporting staff</li>
                            <li>• <strong>Who reports:</strong> Only [Part Time Full Load, Regular]</li>
                            <li>• <strong>Part-Time staff:</strong> Do NOT report (day off)</li>
                            <li>• <strong>Time type:</strong> All time logged = <strong>Admin Time</strong></li>
                          </>
                        )}
                        {!formData.affects_attendance && !formData.reporting_staff_only && (
                          <>
                            <li>• <strong>Attendance tracking:</strong> Enabled for all staff</li>
                            <li>• <strong>Who works:</strong> All staff [Part Time Full Load, Regular, Part-Time]</li>
                            <li>• <strong>Time type:</strong> During class = Teaching Time, Outside class = Admin Time</li>
                            <li>• <strong>Requirement:</strong> Must follow class schedule</li>
                          </>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingHoliday ? 'Update' : 'Add'} Holiday
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Holiday List */}
      {loading ? (
        <div className="text-center py-12">Loading holidays...</div>
      ) : holidays.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No holidays added yet</p>
            <p className="text-muted-foreground">Add your first holiday to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {holidays.map((holiday) => (
            <Card key={holiday.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-lg">{holiday.name}</CardTitle>
                      {getTypeBadge(holiday.type)}
                      {holiday.affects_attendance && (
                        <Badge variant="outline" className="text-xs bg-gray-100 dark:bg-gray-800">
                          🚫 No Attendance
                        </Badge>
                      )}
                      {holiday.reporting_only && !holiday.affects_attendance && (
                        <Badge variant="outline" className="text-xs bg-yellow-100 dark:bg-yellow-900/30">
                          👤 Reporting Only
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="text-sm">
                      📅 {(() => {
                        const startDate = normalizeDateOnly(holiday.start_date || holiday.date)
                        const endDate = normalizeDateOnly(holiday.end_date || holiday.date)
                        
                        if (startDate === endDate) {
                          // Single day
                          return formatSafeDate(startDate)
                        } else {
                          // Date range
                          const start = parseDateAtMidnight(startDate)
                          const end = parseDateAtMidnight(endDate)
                          if (!start || !end) return 'Invalid date range'
                          const dayCount = differenceInDays(end, start) + 1
                          
                          // Check if same month
                          if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
                            return `${format(start, 'MMMM d')} - ${format(end, 'd, yyyy')} (${dayCount} days)`
                          } else if (start.getFullYear() === end.getFullYear()) {
                            return `${format(start, 'MMMM d')} - ${format(end, 'MMMM d, yyyy')} (${dayCount} days)`
                          } else {
                            return `${format(start, 'MMM d, yyyy')} - ${format(end, 'MMM d, yyyy')} (${dayCount} days)`
                          }
                        }
                      })()}
                    </CardDescription>
                    <p className="text-xs text-muted-foreground italic">
                      {getTypeDescription(holiday.type, holiday.affects_attendance, holiday.reporting_only || false)}
                    </p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(holiday)}
                      title="Edit holiday"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openDeleteDialog(holiday)}
                      title="Delete holiday"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {holiday.description && (
                <CardContent className="pt-0">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                    <p className="text-sm text-gray-700 dark:text-gray-300"><strong>Note:</strong> {holiday.description}</p>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this holiday?</AlertDialogTitle>
            <AlertDialogDescription>
              {holidayToDelete && (
                <div className="space-y-2 mt-2">
                  <p className="font-medium">{holidayToDelete.name}</p>
                  <p className="text-sm">
                    {formatSafeDate(holidayToDelete.start_date || holidayToDelete.date)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-4">
                    This action cannot be undone. The holiday will be permanently removed from the system.
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => holidayToDelete && handleDelete(holidayToDelete.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Custom Warning Dialog */}
      <AlertDialog open={warningDialogOpen} onOpenChange={setWarningDialogOpen}>
        <AlertDialogContent className="sm:max-w-[500px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-lg">
              {warningMessage.type === 'past' ? (
                <span className="text-2xl">📅</span>
              ) : (
                <span className="text-2xl">⚠️</span>
              )}
              {warningMessage.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base pt-2">
              {warningMessage.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className={`p-4 rounded-md border ${
            warningMessage.type === 'past' 
              ? 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800'
              : 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'
          }`}>
            <div className="flex items-start gap-3">
              <AlertCircle className={`h-5 w-5 mt-0.5 shrink-0 ${
                warningMessage.type === 'past'
                  ? 'text-yellow-600 dark:text-yellow-400'
                  : 'text-orange-600 dark:text-orange-400'
              }`} />
              <div className="space-y-2 text-sm">
                <p className={
                  warningMessage.type === 'past'
                    ? 'text-yellow-800 dark:text-yellow-200'
                    : 'text-orange-800 dark:text-orange-200'
                }>
                  <strong>What this means:</strong>
                </p>
                <ul className={`list-disc list-inside space-y-1 ml-2 ${
                  warningMessage.type === 'past'
                    ? 'text-yellow-700 dark:text-yellow-300'
                    : 'text-orange-700 dark:text-orange-300'
                }`}>
                  {warningMessage.type === 'past' ? (
                    <>
                      <li>This holiday date has already passed</li>
                      <li>It will still be saved in the system for record-keeping</li>
                      <li>You can edit or delete it later if needed</li>
                    </>
                  ) : (
                    <>
                      <li>A single database entry will be created</li>
                      <li>The holiday will span all days in the range</li>
                      <li>You can edit or delete it later as one unit</li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md p-3 text-xs text-blue-800 dark:text-blue-200">
            <strong>💡 Tip:</strong> You can always edit or delete this holiday later from the holiday list.
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setPendingSubmit(false)
              setWarningDialogOpen(false)
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleWarningConfirm}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Yes, Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Validation Issues Dialog */}
      <AlertDialog open={validationDialogOpen} onOpenChange={setValidationDialogOpen}>
        <AlertDialogContent className="sm:max-w-[520px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-lg text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-5 w-5" />
              Cannot Update Holiday Yet
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base pt-2">
              Please resolve the following warning{validationIssues.length > 1 ? 's' : ''} before saving:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="p-3 rounded-md border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
            <ul className="list-disc pl-5 text-sm text-amber-800 dark:text-amber-200 space-y-1">
              {validationIssues.map((issue, idx) => (
                <li key={`${issue}-${idx}`}>{issue}</li>
              ))}
            </ul>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setValidationDialogOpen(false)}>
              I&apos;ll fix these
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate Holiday Warning Dialog */}
      <AlertDialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <AlertDialogContent className="sm:max-w-[600px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-lg text-red-600 dark:text-red-400">
              <span className="text-2xl">🚫</span>
              Cannot Add Holiday - Date Already Exists
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base pt-2">
              {editingHoliday 
                ? "The date you're trying to edit overlaps with an existing holiday."
                : "A holiday already exists on this date. You cannot add another holiday to the same date."
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="p-4 rounded-md border bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
              <div className="space-y-3 flex-1">
                <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                  Existing Holiday{duplicateHolidays.length > 1 ? 's' : ''} on this date:
                </p>
                <div className="space-y-2">
                  {duplicateHolidays.map((holiday) => {
                    const hStart = normalizeDateOnly(holiday.start_date || holiday.date)
                    const hEnd = normalizeDateOnly(holiday.end_date || holiday.date)
                    const dateStr = hStart === hEnd 
                      ? formatSafeDate(hStart)
                      : `${formatSafeDate(hStart, 'MMM d')} - ${formatSafeDate(hEnd, 'MMM d, yyyy')}`
                    
                    return (
                      <div key={holiday.id} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-red-200 dark:border-red-700">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-semibold text-gray-900 dark:text-gray-100">{holiday.name}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              📅 {dateStr}
                            </p>
                            {holiday.description && (
                              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{holiday.description}</p>
                            )}
                          </div>
                          <Badge variant="outline" className="capitalize shrink-0">
                            {holiday.type.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-xs text-amber-800 dark:text-amber-200">
            <strong>💡 What you can do:</strong>
            <ul className="list-disc list-inside mt-1 space-y-1 ml-2">
              <li>Choose a different date for your new holiday</li>
              <li>Edit the existing holiday if you need to change its details</li>
              <li>Delete the existing holiday first, then add a new one</li>
            </ul>
          </div>

          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setDuplicateDialogOpen(false)}
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
            >
              OK, I Understand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
