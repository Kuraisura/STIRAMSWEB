"use client"

import React, { useState, useEffect, useDeferredValue, startTransition, useMemo, memo } from "react"
import useSWR from 'swr'
import { FixedSizeList as List, ListChildComponentProps } from 'react-window'
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
 
import { Download, Plus, Search, Edit, Trash2, User, Clock, Building, Users, Settings, Camera, X, Upload, ZoomIn, Calendar as CalendarIcon, CheckCircle, UserCheck, ArrowLeftRight, RefreshCw, FileText, AlertTriangle, AlertCircle, UserX, BookOpen, Loader2, XCircle, Archive, ChevronUp, MapPin, Layers3 } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import { getEmployees, createEmployee, updateEmployee, deleteEmployee, archiveEmployee, type Employee, getDepartments, getEmploymentStatuses, getDashboardStats, upsertCourse, upsertRoom, getSubjects, upsertSubject, type Subject, getTeachingSchedulesForEmployee, upsertTeachingSchedule, deleteTeachingSchedule, substituteExamSchedule, removeSubstitution, substituteTeachingSchedule, removeTeachingSubstitution, getEmployeeCutoffAttendance, getStaffTypeFilter } from "@/lib/offline-dashboard-client"
import { getExamSchedulesForEmployee, upsertExamSchedule, deleteExamSchedule } from "@/lib/exam-schedule-api"
import { validateStartDateChange, formatDateForDB, hasWorkStarted } from "@/lib/attendance-helpers"
import { getManilaToday, formatManilaDateLong, toManilaDate } from "@/lib/timezone-utils"
import { getCurrentAcademicTerm } from "@/lib/academic-term-utils"
import { getSchedulesForEmployees, groupSchedulesByEmployee } from "@/lib/employee-schedules-bulk"
import { format, parseISO } from "date-fns"
import { formatInTimeZone } from "date-fns-tz"
import dynamic from "next/dynamic"
import { AddClassModal, type ClassScheduleData } from './AddClassModal'
import { AddExamModal, type ExamScheduleData } from './AddExamModal'
import { DayScheduleModal, type DayScheduleItem } from './DayScheduleModal'
import { ViewDayScheduleModal } from './ViewDayScheduleModal'
const LazyScheduleEditor = dynamic(() => import('./EmployeeScheduleEditor'), { ssr: false })
const LazyExamScheduleEditor = dynamic(() => import('./ExamScheduleEditor'), { ssr: false })

interface Department {
  department_id: number
  name: string
  acronym?: string
  description?: string
  category?: 'Teaching' | 'Non-Teaching'
  is_active: boolean
}

interface EmploymentStatus {
  status_id: number
  name: string
  description?: string
  is_active: boolean
}

// Department-specific work schedules for Non-Teaching Staff
const DEPARTMENT_WORK_SCHEDULES: Record<string, Array<{ label: string; time_in: string; time_out: string }>> = {
  "MIS": [
    { label: "7:30 AM - 4:30 PM", time_in: "07:30:00", time_out: "16:30:00" },
    { label: "12:00 PM - 9:00 PM", time_in: "12:00:00", time_out: "21:00:00" }
  ],
  "Management Information System": [
    { label: "7:30 AM - 4:30 PM", time_in: "07:30:00", time_out: "16:30:00" },
    { label: "12:00 PM - 9:00 PM", time_in: "12:00:00", time_out: "21:00:00" }
  ],
  "Utility": [
    { label: "7:00 AM - 4:00 PM", time_in: "07:00:00", time_out: "16:00:00" },
    { label: "8:30 AM - 5:30 PM", time_in: "08:30:00", time_out: "17:30:00" },
    { label: "9:00 AM - 6:00 PM", time_in: "09:00:00", time_out: "18:00:00" },
    { label: "10:00 AM - 7:00 PM", time_in: "10:00:00", time_out: "19:00:00" },
    { label: "12:00 PM - 9:00 PM", time_in: "12:00:00", time_out: "21:00:00" }
  ],
  "Registrar": [
    { label: "7:00 AM - 4:00 PM", time_in: "07:00:00", time_out: "16:00:00" },
    { label: "8:30 AM - 5:00 PM", time_in: "08:30:00", time_out: "17:00:00" }
  ],
  "Admission": [
    { label: "8:30 AM - 5:30 PM", time_in: "08:30:00", time_out: "17:30:00" }
  ],
  "Accounting": [
    { label: "8:30 AM - 5:30 PM", time_in: "08:30:00", time_out: "17:30:00" },
    { label: "9:00 AM - 6:00 PM", time_in: "09:00:00", time_out: "18:00:00" }
  ],
  "HR": [
    { label: "8:30 AM - 5:30 PM", time_in: "08:30:00", time_out: "17:30:00" }
  ],
  "Human Resources": [
    { label: "8:30 AM - 5:30 PM", time_in: "08:30:00", time_out: "17:30:00" }
  ],
  "Human Resource": [
    { label: "8:30 AM - 5:30 PM", time_in: "08:30:00", time_out: "17:30:00" }
  ]
}

const MAX_FULL_NAME_LENGTH = 40
const MAX_EMAIL_LENGTH = 40
const DEFAULT_PROFILE_AVATAR = '/placeholder-user.jpg'

const REGULAR_SCHEDULE_PRESETS = [
  { label: 'Morning (7:00 AM - 5:00 PM)', timeIn: '07:00:00', timeOut: '17:00:00' },
  { label: 'Office (8:00 AM - 5:00 PM)', timeIn: '08:00:00', timeOut: '17:00:00' },
  { label: 'Late Shift (9:00 AM - 6:00 PM)', timeIn: '09:00:00', timeOut: '18:00:00' },
]

const REGULAR_SCHEDULE_TIME_OPTIONS = Array.from({ length: 31 }, (_, i) => {
  const totalMinutes = 6 * 60 + i * 30
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
  const mm = String(totalMinutes % 60).padStart(2, '0')
  const value = `${hh}:${mm}:00`
  const hourNum = Number(hh)
  const hour12 = hourNum % 12 || 12
  const suffix = hourNum >= 12 ? 'PM' : 'AM'
  const label = `${hour12}:${mm} ${suffix}`
  return { value, label }
})

const mapAcademicTermNameToCode = (termName: unknown): '1st_term' | '2nd_term' | 'summer' | null => {
  const normalized = String(termName || '').trim().toLowerCase()
  if (!normalized) return null
  if (normalized.includes('1st') || normalized.includes('first')) return '1st_term'
  if (normalized.includes('2nd') || normalized.includes('second')) return '2nd_term'
  if (normalized.includes('summer')) return 'summer'
  return null
}

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', error => reject(error))
    image.src = url
  })

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<string> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('No 2d context')
  }

  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  )

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve('')
        return
      }
      const reader = new FileReader()
      reader.readAsDataURL(blob)
      reader.onloadend = () => {
        resolve(reader.result as string)
      }
    }, 'image/jpeg', 0.9)
  })
}

function EmployeePhotoUpload({ 
  currentPhoto, 
  onPhotoChange, 
  employeeName,
  hasError
}: { 
  currentPhoto?: string
  onPhotoChange: (photo: string | null) => void
  employeeName: string
  hasError?: boolean
}) {
  const [preview, setPreview] = React.useState(currentPhoto || '')
  const [isCropOpen, setIsCropOpen] = React.useState(false)
  const [imageSrc, setImageSrc] = React.useState<string | null>(null)
  const [crop, setCrop] = React.useState({ x: 0, y: 0 })
  const [zoom, setZoom] = React.useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<Area | null>(null)
  const resolvedPreview = preview || DEFAULT_PROFILE_AVATAR

  React.useEffect(() => {
    setPreview(currentPhoto || '')
  }, [currentPhoto])

  const handleFileClick = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (e: any) => {
      const file = e.target?.files?.[0]
      if (!file) return
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file')
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('Image must be smaller than 5MB')
        return
      }
      const reader = new FileReader()
      reader.addEventListener('load', () => {
        setImageSrc(reader.result as string)
        setIsCropOpen(true)
        setZoom(1)
        setCrop({ x: 0, y: 0 })
      })
      reader.readAsDataURL(file)
    }
    input.click()
  }

  const onCropComplete = React.useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleCropSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return
    
    try {
      const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels)
      setPreview(croppedImage)
      onPhotoChange(croppedImage)
      setIsCropOpen(false)
      setImageSrc(null)
    } catch {}
  }

  const handleRemove = () => {
    setPreview('')
    onPhotoChange(null)
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(w => w.charAt(0)).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div className="space-y-4">
      <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Employee Photo</Label>
      <Card className="p-6 bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-2 border-dashed border-gray-300 dark:border-gray-600">
        <div className="flex flex-col items-center space-y-4">
          {/* Large Avatar Preview */}
          <div className="relative group">
            <div className={`rounded-full transition-all duration-300 ${hasError ? 'ring-4 ring-red-500 ring-offset-4 ring-offset-white dark:ring-offset-gray-800 animate-pulse' : ''}`}>
              <Avatar className="h-40 w-40 ring-4 ring-blue-500/20 ring-offset-4 ring-offset-white dark:ring-offset-gray-800 transition-all duration-300 group-hover:ring-blue-500/40">
                <AvatarImage src={resolvedPreview} alt={employeeName} className="object-cover" />
                <AvatarFallback className="text-3xl font-bold bg-linear-to-br from-blue-500 to-purple-600 text-white">
                  {getInitials(employeeName)}
                </AvatarFallback>
              </Avatar>
            </div>
            {hasError && (
              <div className="absolute -top-2 -right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-red-500 shadow-lg animate-bounce border-2 border-white dark:border-neutral-900" title="Profile picture is required">
                <AlertCircle className="h-5 w-5 text-white" />
              </div>
            )}
            {preview && (
              <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={handleRemove}
                  className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 w-full">
            <Button 
              type="button" 
              onClick={handleFileClick}
              className="w-full bg-linear-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
            >
              <Camera className="h-5 w-5 mr-2" />
              {preview ? 'Change Photo' : 'Upload Photo'}
            </Button>
            {preview && (
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleRemove}
                className="w-full border-2 border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
              >
                <X className="h-4 w-4 mr-2" />
                Remove Photo
              </Button>
            )}
          </div>

          {/* Info Text */}
          <p className="text-xs text-center text-gray-500 dark:text-gray-400">
            Supported: JPEG, PNG, GIF • Max 5MB
          </p>
        </div>
      </Card>

      {/* Crop Dialog */}
      <Dialog open={isCropOpen} onOpenChange={setIsCropOpen}>
        <DialogContent className="sm:max-w-[600px] p-0 gap-0 overflow-hidden">
          <div className="relative border-b p-6 bg-linear-to-r from-blue-600 via-indigo-600 to-purple-600">
            <div className="absolute inset-0 bg-black/10"></div>
            <DialogTitle className="text-xl font-bold text-white flex items-center gap-3 relative z-10">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <Camera className="h-6 w-6" />
              </div>
              Adjust Your Photo
            </DialogTitle>
            <p className="text-sm text-white/80 mt-1 relative z-10">Drag to reposition • Scroll or slide to zoom</p>
          </div>
          
          <div className="relative bg-linear-to-br from-gray-900 via-gray-800 to-black" style={{ height: '450px' }}>
            {/* Corner Decorations */}
            <div className="absolute top-4 left-4 w-12 h-12 border-l-2 border-t-2 border-white/20 z-10"></div>
            <div className="absolute top-4 right-4 w-12 h-12 border-r-2 border-t-2 border-white/20 z-10"></div>
            <div className="absolute bottom-4 left-4 w-12 h-12 border-l-2 border-b-2 border-white/20 z-10"></div>
            <div className="absolute bottom-4 right-4 w-12 h-12 border-r-2 border-b-2 border-white/20 z-10"></div>

            {/* React Easy Crop Component */}
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                style={{
                  containerStyle: {
                    background: 'transparent',
                  },
                  cropAreaStyle: {
                    border: '4px solid rgba(59, 130, 246, 0.8)',
                    boxShadow: '0 0 50px rgba(59, 130, 246, 0.4)',
                  },
                }}
              />
            )}

            {/* Instructions */}
            <div className="absolute bottom-6 left-6 right-6 text-center z-10">
              <div className="inline-flex items-center gap-3 px-6 py-3 bg-black/60 backdrop-blur-md rounded-full border border-white/10">
                <span className="text-xs text-white/90">🖱️ Drag to move</span>
                <span className="text-white/30">•</span>
                <span className="text-xs text-white/90">🔍 Zoom below</span>
              </div>
            </div>
          </div>
          
          <div className="p-6 space-y-6 bg-white dark:bg-gray-900">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ZoomIn className="h-4 w-4 text-gray-500" />
                  <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Zoom Level</Label>
                </div>
                <span className="text-lg font-bold text-blue-600 dark:text-blue-400 tabular-nums px-3 py-1 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  {Math.round(zoom * 100)}%
                </span>
              </div>
              <Slider value={[zoom]} min={1} max={4} step={0.01} onValueChange={(v) => setZoom(v[0])} className="py-2" />
              <div className="flex justify-between px-1 text-xs text-gray-400">
                <span>100%</span>
                <span>200%</span>
                <span>300%</span>
                <span>400%</span>
              </div>
            </div>
            
            <div className="flex gap-3">
              <Button 
                type="button"
                variant="outline" 
                className="flex-1 h-12 border-2 hover:border-gray-400 dark:hover:border-gray-500" 
                onClick={() => setIsCropOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                type="button"
                className="flex-1 h-12 bg-linear-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white font-semibold shadow-lg hover:shadow-xl" 
                onClick={handleCropSave}
              >
                <Upload className="h-5 w-5 mr-2" />
                Save Photo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function EmployeesPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string; role: string } | null>(null)
  const [showArchivedEmployees, setShowArchivedEmployees] = useState(false)
  
  // Get staff type filter based on current user
  const staffTypeFilter = useMemo(() => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('rams_user')
      const user = userStr ? JSON.parse(userStr) : null
      return getStaffTypeFilter(user?.email, user?.role)
    }
    return null
  }, [])
  const effectiveStaffType = staffTypeFilter === 'Non-Teaching' ? 'Non-Teaching' : 'Teaching'
  const isNonTeachingScopedAdmin = effectiveStaffType === 'Non-Teaching'
  const isTeachingScopedAdmin = !isNonTeachingScopedAdmin
  
  const { data: swrEmployees, mutate } = useSWR(
    ['employees', showArchivedEmployees, staffTypeFilter], 
    () => getEmployees(false, true, showArchivedEmployees, staffTypeFilter), 
    { revalidateOnFocus: false }
  ) // When toggle is on, fetch only archived employees
  const [allEmployees, setAllEmployees] = useState<Employee[]>([])
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [employmentStatuses, setEmploymentStatuses] = useState<EmploymentStatus[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const [selectedDepartment, setSelectedDepartment] = useState("All Departments")
  const [selectedStatus, setSelectedStatus] = useState("All Statuses")
  const [selectedLastInitial, setSelectedLastInitial] = useState("All")
  // Layout toggle removed: keep directory consistent with the standard UI.
  const directoryLayout: 'comfortable' | 'compact' = 'comfortable'
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false)
  const [restoringEmployee, setRestoringEmployee] = useState<Employee | null>(null)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false)
  const [reopenEditAfterSchedule, setReopenEditAfterSchedule] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isAddClassModalOpen, setIsAddClassModalOpen] = useState(false)
  const [isAddExamModalOpen, setIsAddExamModalOpen] = useState(false)
  const [editingClassSchedule, setEditingClassSchedule] = useState<Partial<ClassScheduleData> | null>(null)
  const [editingExamSchedule, setEditingExamSchedule] = useState<Partial<ExamScheduleData> | null>(null)
  const [isDayScheduleModalOpen, setIsDayScheduleModalOpen] = useState(false)
  const [selectedDay, setSelectedDay] = useState<number>(1)
  const [selectedScheduleType, setSelectedScheduleType] = useState<'class' | 'exam'>('class')
  const [startDatePickerOpen, setStartDatePickerOpen] = useState(false) // For create form
  const [editStartDatePickerOpen, setEditStartDatePickerOpen] = useState(false) // For edit form
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [employeeToDelete, setEmployeeToDelete] = useState<{ id: number; name: string } | null>(null)
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)
  const [viewEmployee, setViewEmployee] = useState<Employee | null>(null)
  const [isLandscapeViewOpen, setIsLandscapeViewOpen] = useState(false)
  const [focusFullOverviewToday, setFocusFullOverviewToday] = useState(false)
  const [showBackToTopInOverview, setShowBackToTopInOverview] = useState(false)
  const [staffTypeChangeDialogOpen, setStaffTypeChangeDialogOpen] = useState(false)
  const [pendingStaffTypeChange, setPendingStaffTypeChange] = useState<{ from: 'Teaching' | 'Non-Teaching', to: 'Teaching' | 'Non-Teaching' } | null>(null)
  const [viewSchedules, setViewSchedules] = useState<any[]>([])
  const [viewExamSchedules, setViewExamSchedules] = useState<any[]>([])
  const [isLoadingView, setIsLoadingView] = useState(false)
  const [selectedTerm, setSelectedTerm] = useState<'1st_term' | '2nd_term' | 'summer'>('1st_term')
  const [isDeptDialogOpen, setIsDeptDialogOpen] = useState(false)
  const [deptFormName, setDeptFormName] = useState("")
  const [deptFormAcronym, setDeptFormAcronym] = useState("")
  const [deptFormDesc, setDeptFormDesc] = useState("")
  const [deptFormCategory, setDeptFormCategory] = useState<'Teaching' | 'Non-Teaching' | ''>('')
  const [editingDept, setEditingDept] = useState<Department | null>(null)
  const [isDeptSubmitting, setIsDeptSubmitting] = useState(false)
  const [showDeptValidationDialog, setShowDeptValidationDialog] = useState(false)
  const [deptValidationErrors, setDeptValidationErrors] = useState<string[]>([])
  const [deptInvalidFields, setDeptInvalidFields] = useState<Set<string>>(new Set())
  const [deleteDeptDialogOpen, setDeleteDeptDialogOpen] = useState(false)
  const [deptToDelete, setDeptToDelete] = useState<Department | null>(null)
  const [isDeptDeleting, setIsDeptDeleting] = useState(false)
  const [isDeptReassigning, setIsDeptReassigning] = useState(false)
  const [deptEmployeesToReassign, setDeptEmployeesToReassign] = useState<Employee[]>([])
  const [deptEmployeeReassignments, setDeptEmployeeReassignments] = useState<Record<number, string>>({})
  const [deptDialogSource, setDeptDialogSource] = useState<'manage' | 'add-employee' | 'edit-employee' | 'restore-employee'>('manage')
  const todaysDetailedBlocksRef = React.useRef<HTMLDivElement | null>(null)
  const fullOverviewScrollAreaRef = React.useRef<HTMLDivElement | null>(null)
  const NAME_SUFFIXES = useMemo(() => new Set([
    'jr', 'jr.', 'sr', 'sr.',
    'ii', 'iii', 'iv', 'v', 'vi', 'vii',
    'phd', 'ph.d', 'md', 'm.d', 'esq',
  ]), [])

  useEffect(() => {
    let cancelled = false

    const loadActiveTerm = async () => {
      try {
        const activeTerm = await getCurrentAcademicTerm()
        const mapped = mapAcademicTermNameToCode(activeTerm?.term_name)
        if (!cancelled && mapped) {
          setSelectedTerm(mapped)
        }
      } catch {
        // Keep existing fallback term if lookup fails.
      }
    }

    loadActiveTerm()
    return () => {
      cancelled = true
    }
  }, [])

  const parseEmployeeNameParts = React.useCallback((fullName?: string) => {
    const safe = String(fullName || '').trim().replace(/\s+/g, ' ')
    if (!safe) return { given: '', last: '', suffix: '', formatted: '', sortKey: '' }

    const parts = safe.split(' ').filter(Boolean)
    if (parts.length === 1) {
      const only = parts[0]
      return { given: '', last: only, suffix: '', formatted: only, sortKey: only.toLowerCase() }
    }

    const lastToken = parts[parts.length - 1]
    const normalizedLast = lastToken.toLowerCase().replace(/[^a-z0-9.]/g, '')
    const hasSuffix = NAME_SUFFIXES.has(normalizedLast)
    const suffix = hasSuffix ? parts[parts.length - 1] : ''
    const lastNameIndex = hasSuffix ? parts.length - 2 : parts.length - 1
    const last = parts[lastNameIndex] || ''
    const given = parts.slice(0, Math.max(0, lastNameIndex)).join(' ')

    const formatted = [
      last ? `${last},` : '',
      given,
      suffix ? `, ${suffix}` : '',
    ].join(' ').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim()

    const sortKey = `${last} ${given} ${suffix}`.toLowerCase().trim()

    return { given, last, suffix, formatted, sortKey }
  }, [NAME_SUFFIXES])

  const getEmployeeDisplayName = React.useCallback((fullName?: string) => {
    const parsed = parseEmployeeNameParts(fullName)
    return parsed.formatted || String(fullName || '')
  }, [parseEmployeeNameParts])

  const getEmployeeSortKey = React.useCallback((fullName?: string) => {
    const parsed = parseEmployeeNameParts(fullName)
    return parsed.sortKey || String(fullName || '').toLowerCase()
  }, [parseEmployeeNameParts])

  const getEmployeeLastInitial = React.useCallback((fullName?: string) => {
    const parsed = parseEmployeeNameParts(fullName)
    const base = (parsed.last || parsed.given || String(fullName || '')).trim()
    const initial = base.charAt(0).toUpperCase()
    return /^[A-Z]$/.test(initial) ? initial : '#'
  }, [parseEmployeeNameParts])
  const now = new Date()
  const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  
  // Initialize cutoff dates to current payroll period
  const initialPayrollPeriod = (() => {
    const today = new Date()
    const year = today.getFullYear()
    const month0 = today.getMonth()
    const day = today.getDate()
    
    if (day >= 1 && day <= 10) {
      // 26-10 period: Previous month 26th to current month 10th
      const prevMonth0 = month0 === 0 ? 11 : month0 - 1
      const prevYear = month0 === 0 ? year - 1 : year
      return {
        start: `${prevYear}-${String(prevMonth0 + 1).padStart(2, '0')}-26`,
        end: `${year}-${String(month0 + 1).padStart(2, '0')}-10`
      }
    } else if (day >= 11 && day <= 25) {
      // 11-25 period: Current month 11th to 25th
      return {
        start: `${year}-${String(month0 + 1).padStart(2, '0')}-11`,
        end: `${year}-${String(month0 + 1).padStart(2, '0')}-25`
      }
    } else {
      // 26-10 period: Current month 26th to next month 10th
      const nextMonth0 = month0 === 11 ? 0 : month0 + 1
      const nextYear = month0 === 11 ? year + 1 : year
      return {
        start: `${year}-${String(month0 + 1).padStart(2, '0')}-26`,
        end: `${nextYear}-${String(nextMonth0 + 1).padStart(2, '0')}-10`
      }
    }
  })()
  
  const [cutoffStart, setCutoffStart] = useState<string>(initialPayrollPeriod.start)
  const [cutoffEnd, setCutoffEnd] = useState<string>(initialPayrollPeriod.end)
  const [cutoffRows, setCutoffRows] = useState<Array<{ date: string; timeIn: string | null; timeOut: string | null; status?: string }>>([])
  
  // Attendance log state for Reports-style display
  const [attendanceDetailDays, setAttendanceDetailDays] = useState<Array<{ date: string; timeIn: string | null; timeOut: string | null; status: string | null }>>([])
  const [attendanceDetailSummary, setAttendanceDetailSummary] = useState<{ onTime: number; late: number; undertime: number; absent: number } | null>(null)
  const [attendanceCutoffMode, setAttendanceCutoffMode] = useState<'26-10' | '11-25'>('26-10')
  const [attendanceDateRange, setAttendanceDateRange] = useState<{ from: Date; to: Date }>(() => {
    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth()
    const day = today.getDate()
    
    // Default to 26-10 period
    if (day >= 26) {
      return { from: new Date(year, month, 26), to: new Date(year, month + 1, 10) }
    } else {
      return { from: new Date(year, month - 1, 26), to: new Date(year, month, 10) }
    }
  })
  const [preferredTimeFormat, setPreferredTimeFormat] = useState<'12h' | '24h'>('12h')
  const PH_TZ = 'Asia/Manila'
  const [stats, setStats] = useState({
    totalEmployees: 0,
    presentToday: 0,
    lateToday: 0,
    absentToday: 0,
  })
  const { toast } = useToast()

  // Next Employee ID placeholder for Add dialog
  const [nextIdPlaceholder, setNextIdPlaceholder] = useState<string>("")

  const RFID_REGEX = /^\d{10}$/
  // Updated School ID format: T### for Teaching, N### for Non-Teaching (where ### is 3-5 digits)
  const SCHOOL_ID_REGEX = /^[TN]\d{3,5}$/
  const LEGACY_SCHOOL_ID_REGEX = /^07\d{9}$/ // Keep for backward compatibility
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const PHONE_REGEX = /^09\d{9}$/

  // Helper function to generate next School ID based on staff type
  const generateNextSchoolId = (staffType: string): string => {
    const employees = (swrEmployees as any) || []
    const prefix = staffType === 'Teaching' ? 'T' : 'N'

    // Find all existing IDs with this prefix
    const existingIds = employees
      .map((e: any) => e.school_id || '')
      .filter((id: string) => id.startsWith(prefix))
      .map((id: string) => {
        const num = parseInt(id.substring(1), 10)
        return isNaN(num) ? 0 : num
      })

    // Find the highest number and increment
    // Start at 100 for Teaching (T100, T101, T102...), 101 for Non-Teaching (N101, N102, N103...)
    const startNumber = staffType === 'Teaching' ? 99 : 100
    const maxId = existingIds.length > 0 ? Math.max(...existingIds) : startNumber
    const nextId = maxId + 1

    return `${prefix}${nextId}`
  }

  const [showValidationDialog, setShowValidationDialog] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set())
  const [substitutionValidationErrors, setSubstitutionValidationErrors] = useState<string[]>([])
  const [substitutionInvalidFields, setSubstitutionInvalidFields] = useState<Set<string>>(new Set())
  const [showSubstitutionValidationDialog, setShowSubstitutionValidationDialog] = useState(false)
  const [employmentTransitionDialogOpen, setEmploymentTransitionDialogOpen] = useState(false)
  const [employmentTransitionMessage, setEmploymentTransitionMessage] = useState('')
  const [skipEmploymentTransitionPrompt, setSkipEmploymentTransitionPrompt] = useState(false)
  
  // RFID locking state - once RFID is scanned/entered, lock it until employee is created
  const [isRfidLocked, setIsRfidLocked] = useState(false)
  
  // RFID real-time validation states
  const [isCheckingRfid, setIsCheckingRfid] = useState(false)
  const [rfidCheckResult, setRfidCheckResult] = useState<'available' | 'taken' | null>(null)
  const [rfidCheckTimeout, setRfidCheckTimeout] = useState<NodeJS.Timeout | null>(null)
  
  // Dialog state for schedule removal confirmation
  const [scheduleRemovedDialogOpen, setScheduleRemovedDialogOpen] = useState(false)
  const [removedScheduleDetails, setRemovedScheduleDetails] = useState<{
    type: 'class' | 'exam'
    subjectName: string
    section: string
    dayName: string
    timeRange: string
    roomCode: string
  } | null>(null)
  
  // Dialog state for moving schedules
  const [moveScheduleDialogOpen, setMoveScheduleDialogOpen] = useState(false)
  const [scheduleToMove, setScheduleToMove] = useState<{ scheduleId: number; scheduleType: 'teaching' | 'exam'; currentDay: number; timeStart: string; timeEnd: string } | null>(null)
  const [isMovingSchedule, setIsMovingSchedule] = useState(false)

  // Dialog state for permanent deletion
  const [permanentDeleteDialogOpen, setPermanentDeleteDialogOpen] = useState(false)
  const [employeeToPermanentlyDelete, setEmployeeToPermanentlyDelete] = useState<{ id: number; name: string } | null>(null)
  const [isPermanentlyDeleting, setIsPermanentlyDeleting] = useState(false)
  
  // Helper function to convert time to minutes for conflict detection (handles both 12-hour and 24-hour formats)
  const timeToMinutesForConflict = (timeStr: string): number => {
    if (!timeStr) return 0
    // Handle 12-hour format (e.g., "08:00 AM")
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
    if (match) {
      let hours = parseInt(match[1], 10)
      const minutes = parseInt(match[2], 10)
      const period = match[3].toUpperCase()
      if (period === 'PM' && hours !== 12) hours += 12
      if (period === 'AM' && hours === 12) hours = 0
      return hours * 60 + minutes
    }
    // Handle 24-hour format (e.g., "08:00:00" or "08:00")
    const parts = timeStr.split(':')
    const h = parseInt(parts[0] || '0', 10)
    const m = parseInt(parts[1] || '0', 10)
    return h * 60 + m
  }
  
  // Check if two time ranges overlap
  const doTimeRangesOverlap = (start1: string, end1: string, start2: string, end2: string): boolean => {
    const start1Min = timeToMinutesForConflict(start1)
    const end1Min = timeToMinutesForConflict(end1)
    const start2Min = timeToMinutesForConflict(start2)
    const end2Min = timeToMinutesForConflict(end2)
    
    // Two ranges overlap if: start1 < end2 AND start2 < end1
    return start1Min < end2Min && start2Min < end1Min
  }

  const normalizeDayOfWeek = (day: any): number | null => {
    if (typeof day === 'number' && Number.isFinite(day)) {
      if (day >= 1 && day <= 6) return day
      return null
    }

    if (typeof day === 'string') {
      const trimmed = day.trim()
      if (!trimmed) return null

      if (/^\d+$/.test(trimmed)) {
        const parsed = parseInt(trimmed, 10)
        return parsed >= 1 && parsed <= 6 ? parsed : null
      }

      const dayMap: Record<string, number> = {
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
      }

      return dayMap[trimmed.toLowerCase()] || null
    }

    return null
  }

  const getNormalizedExamDate = (value: unknown): string | null => {
    const raw = String(value || '').trim()
    if (!raw) return null
    const match = raw.match(/\d{4}-\d{2}-\d{2}/)
    if (!match) return null
    if (raw.includes('T')) {
      return toManilaDate(raw)
    }
    return match[0]
  }

  const isFutureOrTodayExamSchedule = (schedule: any): boolean => {
    const examDate = getNormalizedExamDate(schedule?.exam_date)
    if (!examDate) return true
    const manilaToday = formatInTimeZone(new Date(), 'Asia/Manila', 'yyyy-MM-dd')
    return examDate >= manilaToday
  }

  const getScheduleConflictDetails = (
    targetDay: number,
    timeStart: string,
    timeEnd: string,
    excludeScheduleId?: number,
    scheduleType?: 'teaching' | 'exam'
  ) => {
    const normalizedTargetDay = normalizeDayOfWeek(targetDay)
    if (!normalizedTargetDay) return null

    if (scheduleType !== 'exam' && viewSchedules && viewSchedules.length > 0) {
      for (const schedule of viewSchedules as any[]) {
        const scheduleDay = normalizeDayOfWeek(schedule?.day_of_week)
        if (scheduleDay !== normalizedTargetDay) continue
        if (excludeScheduleId && scheduleType === 'teaching' && schedule.schedule_id === excludeScheduleId) continue

        if (doTimeRangesOverlap(timeStart, timeEnd, schedule?.time_start || '', schedule?.time_end || '')) {
          return {
            type: 'class' as const,
            subject: schedule?.subject_name || schedule?.course_code || 'Existing class',
            time_start: schedule?.time_start || '',
            time_end: schedule?.time_end || '',
          }
        }
      }
    }

    if (scheduleType !== 'teaching' && viewExamSchedules && viewExamSchedules.length > 0) {
      for (const schedule of viewExamSchedules as any[]) {
        if (!isFutureOrTodayExamSchedule(schedule)) continue
        const scheduleDay = normalizeDayOfWeek(schedule?.day_of_week)
        if (scheduleDay !== normalizedTargetDay) continue
        if (excludeScheduleId && scheduleType === 'exam' && schedule.exam_schedule_id === excludeScheduleId) continue

        if (doTimeRangesOverlap(timeStart, timeEnd, schedule?.time_start || '', schedule?.time_end || '')) {
          return {
            type: 'exam' as const,
            subject: schedule?.subject_name || schedule?.course_code || 'Existing exam',
            time_start: schedule?.time_start || '',
            time_end: schedule?.time_end || '',
          }
        }
      }
    }

    return null
  }
  
  // Check if moving schedule would conflict with existing schedules on target day
  const hasTimeConflict = (targetDay: number, timeStart: string, timeEnd: string, excludeScheduleId?: number, scheduleType?: 'teaching' | 'exam'): boolean => {
    return !!getScheduleConflictDetails(targetDay, timeStart, timeEnd, excludeScheduleId, scheduleType)
  }

  const validateEmployeeForm = (data: typeof formData): { errors: string[]; invalid: Set<string> } => {
    const errors: string[] = []
    const invalid = new Set<string>()
    const school = (data.school_id || '').trim()
    const rfid = (data.rfid_code || '').trim()
    const email = (data.email || '').trim()
    const phone = (data.phone || '').trim()

    // Full Name validation
    if (!data.full_name.trim()) { 
      errors.push('Full Name is required. Please enter the full name of the employee.'); 
      invalid.add('full_name') 
    } else if (data.full_name.trim().length > MAX_FULL_NAME_LENGTH) {
      errors.push(`Full Name must not exceed ${MAX_FULL_NAME_LENGTH} characters.`)
      invalid.add('full_name')
    }
    
    // Employee ID validation
    if (!school) { 
      errors.push('Employee ID is required. Please enter a valid Employee ID (T### for Teaching, N### for Non-Teaching).'); 
      invalid.add('school_id') 
    } else if (!SCHOOL_ID_REGEX.test(school) && !LEGACY_SCHOOL_ID_REGEX.test(school)) { 
      errors.push('Employee ID must be in format T### for Teaching staff or N### for Non-Teaching staff (e.g., T100, N100). Legacy format 07XXXXXXXXX also supported.'); 
      invalid.add('school_id') 
    } else if (SCHOOL_ID_REGEX.test(school)) {
      // Validate prefix matches staff type
      const prefix = school.charAt(0)
      const staffType = data.staff_type || ''
      if (prefix === 'T' && staffType !== 'Teaching') {
        errors.push('Employee ID starting with "T" can only be used for Teaching staff. Please use "N" prefix for Non-Teaching staff.')
        invalid.add('school_id')
      } else if (prefix === 'N' && staffType !== 'Non-Teaching') {
        errors.push('Employee ID starting with "N" can only be used for Non-Teaching staff. Please use "T" prefix for Teaching staff.')
        invalid.add('school_id')
      }
    }
    
    // RFID Code validation
    if (!rfid) { 
      errors.push('RFID Code is required. Please enter a valid 10-digit RFID code.'); 
      invalid.add('rfid_code') 
    } else if (!RFID_REGEX.test(rfid)) { 
      errors.push('RFID Code must be exactly 10 digits (e.g., 1234567890)'); 
      invalid.add('rfid_code') 
    }
    
    // Department validation
    if (!data.department) { 
      errors.push('Department is required. Please select a department for the employee.'); 
      invalid.add('department') 
    }
    
    // Employment Status validation (for Teaching staff)
    if (data.staff_type === 'Teaching' && !data.employment_status) { 
      errors.push('Employment Status is required for Teaching staff. Please select an employment status.'); 
      invalid.add('employment_status') 
    }

    // Work Schedule validation (for Non-Teaching staff)
    if (data.staff_type === 'Non-Teaching') {
      const timeIn = String(data.schedule_time_in || '').trim()
      const timeOut = String(data.schedule_time_out || '').trim()
      if (!timeIn || !timeOut) {
        errors.push('Work Schedule is required for Non-Teaching staff. Please select a work schedule.')
        invalid.add('schedule_time_in')
        invalid.add('schedule_time_out')
      }
    }
    
    // Email validation
    if (!email) { 
      errors.push('Email address is required. Please enter a valid email address.'); 
      invalid.add('email') 
    } else if (email.length > MAX_EMAIL_LENGTH) {
      errors.push(`Email must not exceed ${MAX_EMAIL_LENGTH} characters.`)
      invalid.add('email')
    } else if (!EMAIL_REGEX.test(email)) { 
      errors.push('Please enter a valid email address (e.g., name@example.com)'); 
      invalid.add('email') 
    }
    
    // Start Date validation
    if (!data.start_date) { 
      errors.push('Start Date is required. Please select a start date for the employee.'); 
      invalid.add('start_date') 
    } else {
      const startDateObj = new Date(data.start_date)
      const maxDate = new Date()
      maxDate.setFullYear(maxDate.getFullYear() + 1)
      if (startDateObj > maxDate) {
        errors.push('Start date cannot be more than 1 year in the future. Please select a valid date.'); 
        invalid.add('start_date')
      }
    }
    
    // Phone validation (optional but must be valid if provided)
    if (phone && !PHONE_REGEX.test(phone)) { 
      errors.push('Phone number must be exactly 11 digits starting with 09 (e.g., 09123456789)'); 
      invalid.add('phone') 
    }
    
    return { errors, invalid }
  }

  const checkDuplicateConflicts = (data: typeof formData, mode: 'add' | 'edit', currentId?: number): { errors: string[]; invalid: Set<string> } => {
    const errors: string[] = []
    const invalid = new Set<string>()
    const list: Employee[] = (swrEmployees as any) || []
    const norm = {
      school_id: (data.school_id || '').trim().toUpperCase(), // Keep T/N prefix, uppercase for consistency
      rfid_code: (data.rfid_code || '').replace(/\D+/g, ''),
      email: (data.email || '').trim().toLowerCase(),
      full_name: (data.full_name || '').trim().toLowerCase(),
      phone: (data.phone || '').replace(/\D+/g, ''),
    }
    // CRITICAL: Only check against active employees (exclude archived employees)
    // Filter out archived employees (is_active = false) and NULL RFID codes
    const activeList = list.filter((e: any) => 
      (e.is_active === true || e.is_active === null || e.is_active === undefined)
    )
    const isOther = (e: Employee) => (mode === 'edit' ? e.employee_id !== currentId : true)
    const findBy = (pred: (e: Employee) => boolean) => activeList.find((e) => isOther(e) && pred(e))

    const bySchool = norm.school_id && findBy((e) => (e.school_id || '').trim().toUpperCase() === norm.school_id)
    if (bySchool) { 
      errors.push(`Employee ID already exists: ${bySchool.full_name} (${bySchool.school_id})`); 
      invalid.add('school_id') 
    }

    // Check RFID code only against active employees with non-NULL RFID codes
    const byRfid = norm.rfid_code ? findBy((e) => 
      !!e.rfid_code && 
      String(e.rfid_code || '').replace(/\D+/g, '') === norm.rfid_code
    ) : null
    if (byRfid) { 
      errors.push(`RFID Code already exists: ${byRfid.full_name} (${byRfid.rfid_code})`); 
      invalid.add('rfid_code') 
    }

    const byEmail = norm.email && findBy((e) => (e.email || '').trim().toLowerCase() === norm.email)
    if (byEmail) { 
      errors.push(`Email already exists: ${byEmail.full_name} (${byEmail.email})`); 
      invalid.add('email') 
    }

    const byName = norm.full_name && findBy((e) => (e.full_name || '').trim().toLowerCase() === norm.full_name)
    if (byName) { 
      errors.push(`Employee name already exists: ${byName.full_name}`); 
      invalid.add('full_name') 
    }

    const byPhone = norm.phone && findBy((e) => (e.phone || '').replace(/\D+/g, '') === norm.phone)
    if (byPhone) { 
      errors.push(`Phone number already exists: ${byPhone.full_name} (${byPhone.phone})`); 
      invalid.add('phone') 
    }

    return { errors, invalid }
  }

  const checkDuplicateConflictsServer = async (data: typeof formData, mode: 'add' | 'edit', currentId?: number): Promise<{ errors: string[]; invalid: Set<string> }> => {
    const errors: string[] = []
    const invalid = new Set<string>()
    const norm = {
      school_id: (data.school_id || '').trim().toUpperCase(),
      rfid_code: (data.rfid_code || '').replace(/\D+/g, ''),
      email: (data.email || '').trim().toLowerCase(),
      full_name: (data.full_name || '').trim().toLowerCase(),
    }
    try {
      const res = await fetch('/api/employees?includeInactive=true&includeNotStarted=true', { cache: 'no-store' })
      const employees: any[] = res.ok ? await res.json().catch(() => []) : []
      const activeEmployees = (employees || []).filter((e: any) => e?.is_active === true || e?.is_active === null || e?.is_active === undefined)

      if (norm.school_id) {
        const row = activeEmployees.find((e: any) => (e.school_id || '').toString().trim().toUpperCase() === norm.school_id)
        if (row && (mode === 'add' || row.employee_id !== currentId)) {
          errors.push(`School ID already exists: ${row.full_name} (${row.school_id})`)
          invalid.add('school_id')
        }
      }
      if (norm.rfid_code) {
        const row = activeEmployees.find((e: any) => {
          const rfid = (e.rfid_code || '').toString().replace(/\D+/g, '')
          return !!rfid && rfid === norm.rfid_code
        })
        if (row && (mode === 'add' || row.employee_id !== currentId)) {
          errors.push(`RFID Code already exists: ${row.full_name} (${row.rfid_code})`)
          invalid.add('rfid_code')
        }
      }
      if (norm.email) {
        const row = activeEmployees.find((e: any) => (e.email || '').toString().trim().toLowerCase() === norm.email)
        if (row && (mode === 'add' || row.employee_id !== currentId)) {
          errors.push(`Email already exists: ${row.full_name} (${row.email})`)
          invalid.add('email')
        }
      }

      if (norm.full_name) {
        const row = activeEmployees.find((e: any) => (e.full_name || '').toString().trim().toLowerCase() === norm.full_name)
        if (row && (mode === 'add' || row.employee_id !== currentId)) {
          errors.push(`Employee name already exists: ${row.full_name}`)
          invalid.add('full_name')
        }
      }
      
      // Check for phone number duplicates (if provided)
      if (data.phone) {
        const phoneNorm = (data.phone || '').replace(/\D+/g, '')
        if (phoneNorm) {
          const row = activeEmployees.find((e: any) => (e.phone || '').toString().replace(/\D+/g, '') === phoneNorm)
          if (row && (mode === 'add' || row.employee_id !== currentId)) {
            errors.push(`Phone number already exists: ${row.full_name} (${row.phone})`)
            invalid.add('phone')
          }
        }
      }
    } catch {}
    return { errors, invalid }
  }

  type ScheduleRow = {
    tempId: string
    schedule_id?: number
    day_of_week: 1 | 2 | 3 | 4 | 5 | 6
    time_start: string
    time_end: string
    subject_name: string
    subject_id?: number
    class_type?: string
    section?: string
    room_code: string
    substitute_employee_id?: number | null
    substitute_employee_name?: string | null
    unavailable_reason?: string | null
    status?: 'on-leave' | 'absent' | 'unavailable' | 'substituted' | 'available' | null
  }
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([])
  const [examScheduleRows, setExamScheduleRows] = useState<ExamScheduleRow[]>([])
  const [isSavingSchedule, setIsSavingSchedule] = useState(false)
  const [isSavingExamSchedule, setIsSavingExamSchedule] = useState(false)
  const [isExamScheduleDialogOpen, setIsExamScheduleDialogOpen] = useState(false)
  const [isSubstitutionDialogOpen, setIsSubstitutionDialogOpen] = useState(false)
  const [selectedExamForSubstitution, setSelectedExamForSubstitution] = useState<any>(null)
  const [selectedTeachingForSubstitution, setSelectedTeachingForSubstitution] = useState<ScheduleRow | null>(null)
  const [substitutionType, setSubstitutionType] = useState<'exam' | 'teaching'>('exam')
  const [substitutionForm, setSubstitutionForm] = useState({
    substituteEmployeeId: '',
    unavailableReason: '',
    status: 'on-leave' as 'on-leave' | 'absent' | 'unavailable'
  })
  
  // Refs for auto-scrolling to bottom when adding new schedule rows
  const scheduleListRef = React.useRef<HTMLDivElement>(null)
  const examScheduleListRef = React.useRef<HTMLDivElement>(null)
  const [approvedLeaveRequests, setApprovedLeaveRequests] = useState<any[]>([])
  const [selectedVerificationRequest, setSelectedVerificationRequest] = useState<number | null>(null)
  const [scheduleView, setScheduleView] = useState<'grid'|'list'>('grid')
  const [todaysHoursByEmployee, setTodaysHoursByEmployee] = useState<Record<number, string>>({})
  type ScheduleSource = 'exam' | 'class' | 'office' | 'no_today' | 'no_schedules' | 'rest_day' | 'unknown'
  type ScheduleDisplayInfo = {
    summary: string
    source: ScheduleSource
    scheduleCount?: number
    substitutionAdjusted?: boolean
  }
  const [todaysScheduleInfoByEmployee, setTodaysScheduleInfoByEmployee] = useState<Record<number, ScheduleDisplayInfo>>({})
  const DEPARTMENT_OPTIONS = ["BSIT", "SHS"]
  const COURSE_CODES = [
    'BSIT301P','BSIT302P','BSIT303P','BSIT401P','BSIT402P','IT211','IT212','IT313',
    'GEC101','GEC104','PROG1','PROG2','DBSYS1','DBSYS2','NET101','NET202','HUMANCOMP','MEDINFO','STEM111'
  ]
  const BUILDING_CODES = [
    'B1204 / COMPL5','B1301 / COMPL2','B2203 / COMPL3','B2101 / COMPL6','B1102 / COMPL4','B1405 / COMPL1'
  ]
  const getRandom = (arr: string[]) => arr[Math.floor(Math.random()*arr.length)]
  const getRandomCourseCode = () => getRandom(COURSE_CODES)
  const getRandomRoomCode = () => getRandom(BUILDING_CODES)

  // Clear schedule rows and reset base form when opening the Add dialog
  useEffect(() => {
    if (isAddDialogOpen) {
      const defaultStaffType = effectiveStaffType
      setScheduleRows([])
      setFormData({
        full_name: "",
        school_id: "",
        rfid_code: "",
        department: "",
        employment_status: defaultStaffType === 'Non-Teaching' ? 'Regular' : 'Part Time',
        staff_type: defaultStaffType,
        email: "",
        phone: "",
        password: "admin123",
        // Teaching staff schedule is derived from class/exam schedules, not a fixed admin-time window.
        schedule_time_in: null,
        schedule_time_out: null,
        hire_date: new Date().toISOString().split('T')[0],
        start_date: (() => {
          // CRITICAL: Use Manila timezone to get tomorrow's date
          // Get today's date in Manila timezone
          const today = getManilaToday()
          const todayObj = new Date(today + 'T00:00:00+08:00')
          
          // Calculate tomorrow in Manila timezone
          const tomorrow = new Date(todayObj)
          tomorrow.setDate(tomorrow.getDate() + 1)
          const dayOfWeek = tomorrow.getDay()
          
          // If tomorrow is Sunday, move to Monday
          if (dayOfWeek === 0) {
            tomorrow.setDate(tomorrow.getDate() + 1)
          }
          
          return format(tomorrow, 'yyyy-MM-dd')
        })(), // Default to tomorrow (cannot start today)
        photo_path: "",
        is_active: true,
        is_reporting_staff: false,
        is_standby: false
      })
      // Reset RFID lock when opening Add dialog
      setIsRfidLocked(false)
    }
  }, [isAddDialogOpen, effectiveStaffType])

  // Load current user from localStorage
  useEffect(() => {
    try {
      const userStr = localStorage.getItem('rams_user')
      if (userStr) {
        const user = JSON.parse(userStr)
        setCurrentUser(user)
      }
    } catch {}
  }, [])

  // Random generators for codes
  // Removed auto-fill helpers per request

  // Form state
  const [formData, setFormData] = useState({
    full_name: "",
    school_id: "",
    rfid_code: "",
    department: "",
    employment_status: "Part Time",
    staff_type: effectiveStaffType as 'Teaching' | 'Non-Teaching',
    email: "",
    phone: "",
    password: "admin123", // Default password
    // Teaching staff schedule is derived from class/exam schedules, not a fixed admin-time window.
    schedule_time_in: null,
    schedule_time_out: null,
    hire_date: "", // Will be automatically set to current date/time when creating employee
    start_date: (() => {
      // Use Manila timezone to get today's date
      const today = getManilaToday()
      return today // Default to today - user can select today or any future date
    })(),
    photo_path: "",
    is_active: true, // Active by default
    is_reporting_staff: false, // Default: not reporting unless admin marks otherwise
    is_standby: false
  })

  // CRITICAL: Ensure staff_type is always set correctly when Add Dialog opens
  React.useEffect(() => {
    if (isAddDialogOpen) {
      setFormData(prev => ({
        ...prev,
        staff_type: effectiveStaffType as 'Teaching' | 'Non-Teaching'
      }))
    }
  }, [isAddDialogOpen, effectiveStaffType])

  // Unified employment status options (DB + defaults)
  const EMPLOYMENT_STATUS_OPTIONS = React.useMemo(() => {
    const defaults = ["Regular", "Part Time", "Part Time Full Load"]
    const fromDb = (employmentStatuses || []).map((s) => s.name).filter(Boolean)
    return Array.from(new Set([...defaults, ...fromDb]))
  }, [employmentStatuses])
  
  // Get employment status options filtered by staff type
  // - Teaching: "Part Time", "Part Time Full Load", "Regular" (Requirement #15: ordered as specified)
  // - Non-Teaching: "Regular", "Provisionary" (Requirement #15: ordered as specified)
  const getEmploymentStatusOptions = React.useCallback((staffType: string): string[] => {
    if (staffType === 'Teaching') {
      // Teaching: Part Time, Part Time Full Load, Regular (in this order per Requirement #15)
      return ["Part Time", "Part Time Full Load", "Regular"]
    } else if (staffType === 'Non-Teaching') {
      // Non-Teaching: Regular, Provisionary (in this order per Requirement #15)
      return ["Regular", "Provisionary"]
    }
    // Default: return all options
    return EMPLOYMENT_STATUS_OPTIONS
  }, [EMPLOYMENT_STATUS_OPTIONS])

  const visibleEmploymentStatusFilters = React.useMemo(() => {
    const base = (employmentStatuses || []).map((status) => status.name).filter(Boolean)
    if (effectiveStaffType === 'Teaching') {
      return base.filter((name) => String(name).trim().toLowerCase() !== 'full time')
    }
    return base
  }, [employmentStatuses, effectiveStaffType])

  // Sync swrEmployees data to allEmployees state and apply filters
  useEffect(() => {
    if (swrEmployees && Array.isArray(swrEmployees)) {
      // Staff type filtering is now handled by the database query via staffTypeFilter parameter
      setAllEmployees(swrEmployees)
      
      // Apply filters
      // CRITICAL: Database query already filters by archive status
      // When "Show Archived Employees" is ON: getEmployees fetches ONLY archived employees (is_active = false)
      // When "Show Archived Employees" is OFF: getEmployees fetches ONLY active employees (is_active = true or null)
      // So we don't need to filter by archive status here - just apply other filters
      let filtered = swrEmployees.filter((emp) => {
        // Filter by search term
        if (deferredSearchTerm) {
          const search = deferredSearchTerm.toLowerCase()
          const displayName = getEmployeeDisplayName(emp.full_name).toLowerCase()
          const matchName = emp.full_name?.toLowerCase().includes(search) || displayName.includes(search)
          const matchId = emp.school_id?.toLowerCase().includes(search)
          const matchEmail = emp.email?.toLowerCase().includes(search)
          const matchRfid = emp.rfid_code?.toLowerCase().includes(search)
          if (!matchName && !matchId && !matchEmail && !matchRfid) return false
        }
        
        // Filter by department
        if (selectedDepartment !== "All Departments" && emp.department !== selectedDepartment) {
          return false
        }
        
        // Filter by employment status
        if (selectedStatus !== "All Statuses" && emp.employment_status !== selectedStatus) {
          return false
        }

        // Filter by surname initial
        if (selectedLastInitial !== "All" && getEmployeeLastInitial(emp.full_name) !== selectedLastInitial) {
          return false
        }
        
        return true
      })
      
      // CRITICAL: Sort employees alphabetically by name
      // When "Show Archived Employees" is ON: All shown employees are archived, sort by name
      // When "Show Archived Employees" is OFF: All shown employees are active, sort by name
      filtered.sort((a, b) => getEmployeeSortKey(a.full_name).localeCompare(getEmployeeSortKey(b.full_name)))
      
      setFilteredEmployees(filtered)
    }
  }, [swrEmployees, showArchivedEmployees, deferredSearchTerm, selectedDepartment, selectedStatus, selectedLastInitial, getEmployeeDisplayName, getEmployeeSortKey, getEmployeeLastInitial])

  // Fetch supporting data on component mount (employees are handled by SWR)
  useEffect(() => {
    const fetchSupportingData = async () => {
      try {
        setIsLoading(true)
        const [departmentsData, statusesData, statsData, subjectsData] = await Promise.all([
          getDepartments(),
          getEmploymentStatuses(),
          getDashboardStats(),
          getSubjects()
        ])
        
        setDepartments(departmentsData)
        setEmploymentStatuses(statusesData)
        setStats(statsData)
      } catch {
        toast({
          title: "Error",
          description: "Failed to load some data. Please try again.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchSupportingData()
  }, [])

  // Prefill search from ?q=
  useEffect(() => {
    const q = searchParams.get("q") || ""
    if (q && q !== searchTerm) {
      setSearchTerm(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Compute and cache today's work hours per employee from teaching schedules
  // OPTIMIZED: Use batch queries instead of per-employee queries to prevent buffering
  useEffect(() => {
    let isCancelled = false
    let timeoutId: NodeJS.Timeout | null = null
    
    const run = async () => {
      if (isCancelled) return
      
      // Use the same list the UI renders to avoid mismatches with SWR cache
      const employeesList: Employee[] = filteredEmployees || []
      if (employeesList.length === 0) { 
        if (!isCancelled) {
          setTodaysHoursByEmployee({})
          setTodaysScheduleInfoByEmployee({})
        }
        return 
      }
      
      const isoDayInManila = Number(formatInTimeZone(new Date(), 'Asia/Manila', 'i'))
      const dayIdx = isoDayInManila === 7 ? undefined : (isoDayInManila as 1|2|3|4|5|6)
      if (!dayIdx) { 
        if (!isCancelled) {
          setTodaysHoursByEmployee({})
          setTodaysScheduleInfoByEmployee({})
        }
        return 
      }
      
      const toMinutes = (t: string) => {
        if (!t) return Number.POSITIVE_INFINITY
        const [hh, mm] = t.split(':').map(Number)
        return hh * 60 + mm
      }
      const toMinutesEnd = (t: string) => {
        if (!t) return Number.NEGATIVE_INFINITY
        const [hh, mm] = t.split(':').map(Number)
        return hh * 60 + mm
      }
      
      try {
        const today = getManilaToday()
        const map: Record<number, string> = {}
        const infoMap: Record<number, ScheduleDisplayInfo> = {}
        const employeeIds = employeesList.map((emp) => emp.employee_id)
        const { teaching, exam } = await getSchedulesForEmployees(employeeIds, selectedTerm || undefined)
        const teachingByEmployee = groupSchedulesByEmployee(teaching)
        const examByEmployee = groupSchedulesByEmployee(exam)

        employeesList.forEach((emp) => {
          const examSchedulesAll = examByEmployee[emp.employee_id] || []
          const teachingSchedulesAll = teachingByEmployee[emp.employee_id] || []
          const examSchedules = examSchedulesAll.filter((s: any) => {
            const rawExamDate = String(s?.exam_date || '').trim()
            const examDate = rawExamDate ? toManilaDate(rawExamDate) : ''
            if (examDate) return examDate === today

            const dow = Number(s?.day_of_week)
            return Number.isFinite(dow) && dow === dayIdx
          })
          const hasSubstitutionImpact = [...examSchedulesAll, ...teachingSchedulesAll].some((s: any) => {
            const substituteId = Number(s?.substitute_employee_id || 0)
            const status = String(s?.status || '').toLowerCase()
            return substituteId > 0 || status === 'substituted'
          })
          const todaysTeaching = teachingSchedulesAll.filter((s: any) => {
            const dow = Number(s?.day_of_week)
            return Number.isFinite(dow) && dow === dayIdx
          })

          if (examSchedules.length > 0) {
            const start = examSchedules.reduce((min: string, r: any) => {
              return toMinutes(r.time_start || '') < toMinutes(min) ? (r.time_start || '') : min
            }, examSchedules[0].time_start || '')
            const end = examSchedules.reduce((max: string, r: any) => {
              return toMinutesEnd(r.time_end || '') > toMinutesEnd(max) ? (r.time_end || '') : max
            }, examSchedules[0].time_end || '')
            if (start && end) {
              const summary = `${formatDbTime12h(start)} - ${formatDbTime12h(end)}`
              map[emp.employee_id] = summary
              infoMap[emp.employee_id] = { summary, source: 'exam', substitutionAdjusted: hasSubstitutionImpact }
              return
            }
          }

          if (todaysTeaching.length > 0) {
            const start = todaysTeaching.reduce((min: string, r: any) => {
              return toMinutes(r.time_start || '') < toMinutes(min) ? (r.time_start || '') : min
            }, todaysTeaching[0].time_start || '')
            const end = todaysTeaching.reduce((max: string, r: any) => {
              return toMinutesEnd(r.time_end || '') > toMinutesEnd(max) ? (r.time_end || '') : max
            }, todaysTeaching[0].time_end || '')
            if (start && end) {
              const summary = `${formatDbTime12h(start)} - ${formatDbTime12h(end)}`
              map[emp.employee_id] = summary
              infoMap[emp.employee_id] = { summary, source: 'class', substitutionAdjusted: hasSubstitutionImpact }
              return
            }
          }

          const scheduleCount = teachingSchedulesAll.length + examSchedulesAll.length
          if (scheduleCount > 0) {
            const summary = `No Class/Exam Schedule Today (${scheduleCount} total)`
            map[emp.employee_id] = summary
            infoMap[emp.employee_id] = { summary, source: 'no_today', scheduleCount, substitutionAdjusted: hasSubstitutionImpact }
            return
          }

          if (((emp as any).staff_type || '') === 'Teaching') {
            const summary = 'No Class Schedules Found'
            map[emp.employee_id] = summary
            infoMap[emp.employee_id] = { summary, source: 'no_schedules' }
            return
          }

          if (emp.schedule_time_in && emp.schedule_time_out) {
            const summary = `${formatDbTime12h(emp.schedule_time_in)} - ${formatDbTime12h(emp.schedule_time_out)}`
            map[emp.employee_id] = summary
            infoMap[emp.employee_id] = { summary, source: 'office' }
            return
          }

          map[emp.employee_id] = '-'
          infoMap[emp.employee_id] = { summary: '-', source: 'unknown' }
        })
        
        if (!isCancelled) {
          setTodaysHoursByEmployee(map)
          setTodaysScheduleInfoByEmployee(infoMap)
        }
      } catch {
        if (!isCancelled) {
          setTodaysHoursByEmployee({})
          setTodaysScheduleInfoByEmployee({})
        }
      }
    }
    
    // Debounce to prevent running too frequently when filteredEmployees changes
    const debouncedRun = () => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        run()
      }, 300) // Wait 300ms after last change
    }
    
    // Initial run
    debouncedRun()
    
    // Periodically re-evaluate so the value updates when the day changes in Manila (reduced frequency)
    const interval = window.setInterval(() => {
      if (!isCancelled) run()
    }, 5 * 60 * 1000) // Every 5 minutes instead of 1 minute
    
    return () => { 
      isCancelled = true
      if (timeoutId) clearTimeout(timeoutId)
      window.clearInterval(interval) 
    }
  }, [filteredEmployees, selectedTerm])

  // Filter employees based on search and filters
  useEffect(() => {
    const employeesList: Employee[] = allEmployees || []
    let filtered = employeesList

    // Check if current user should only see Teaching staff
    try {
      const storedUser = localStorage.getItem("rams_user")
      if (storedUser) {
        const userData = JSON.parse(storedUser)
        const userName = (userData.name || '').toLowerCase()
        
        // List of users who should only see Teaching staff
        const teachingOnlyUsers = [
          'madelyn navallo',
          'madelyn b. navallo',
          'rostelito lazaga',
          'rostelito j. lazaga',
          'lara mae rayos',
          'lara mae e. rayos'
        ]
        
        // If current user is in the teaching-only list, filter to show only Teaching staff
        if (teachingOnlyUsers.some(name => userName.includes(name.toLowerCase()))) {
          filtered = filtered.filter((employee) => employee.staff_type === 'Teaching')
        }
      }
    } catch {}

    if (deferredSearchTerm) {
      const term = (deferredSearchTerm || '').toLowerCase()
      filtered = filtered.filter((employee) => {
        const name = (employee.full_name || '').toLowerCase()
        const displayName = getEmployeeDisplayName(employee.full_name).toLowerCase()
        const sid = (employee.school_id || '').toLowerCase()
        const email = (employee.email || '').toLowerCase()
        const rfid = (employee.rfid_code || '')
        return (
          name.includes(term) || displayName.includes(term) || sid.includes(term) || email.includes(term) || rfid.includes(deferredSearchTerm)
        )
      })
    }

    if (selectedDepartment !== "All Departments") {
      filtered = filtered.filter((employee) => employee.department === selectedDepartment)
    }

    if (selectedStatus !== "All Statuses") {
      filtered = filtered.filter((employee) => employee.employment_status === selectedStatus)
    }

    if (selectedLastInitial !== "All") {
      filtered = filtered.filter((employee) => getEmployeeLastInitial(employee.full_name) === selectedLastInitial)
    }

    filtered.sort((a, b) => getEmployeeSortKey(a.full_name).localeCompare(getEmployeeSortKey(b.full_name)))

    setFilteredEmployees(filtered)
  }, [deferredSearchTerm, selectedDepartment, selectedStatus, selectedLastInitial, allEmployees, getEmployeeDisplayName, getEmployeeSortKey, getEmployeeLastInitial])

  // Auto-clear invalid substitution form values and show error (employee cannot be their own substitute)
  useEffect(() => {
    if (isSubstitutionDialogOpen && editingEmployee && substitutionForm.substituteEmployeeId) {
      const substituteId = Number(substitutionForm.substituteEmployeeId)
      if (substituteId === editingEmployee.employee_id) {
        // Clear the invalid value and set error
        setSubstitutionForm(prev => ({ ...prev, substituteEmployeeId: '' }))
        setSubstitutionInvalidFields(prev => new Set([...prev, 'substituteEmployeeId']))
        setSubstitutionValidationErrors(prev => {
          const filtered = prev.filter(e => !e.includes('substitute') && !e.includes('self'))
          return [...filtered, "An employee cannot be assigned as their own substitute. Please select a different teacher."]
        })
      }
    }
  }, [isSubstitutionDialogOpen, editingEmployee?.employee_id, substitutionForm.substituteEmployeeId])

  // Helper function to get employee avatar URL with lightweight optimization
  const getEmployeeNameByIdLocal = React.useCallback((employeeId?: number | null): string | null => {
    if (!employeeId) return null
    const match = (allEmployees || []).find((e: any) => e.employee_id === employeeId)
    return match?.full_name || null
  }, [allEmployees])

  const getEmployeeAvatarUrl = React.useCallback((employee: any): string | null => {
    const photoPath = employee?.photo_url || employee?.photo_path || employee?.photo
    if (!photoPath) return null

    const employeeId = Number(employee?.employee_id)

    // CSP-safe rule: block external origins and use local photo endpoint instead.
    if (typeof photoPath === 'string' && (photoPath.startsWith('http://') || photoPath.startsWith('https://'))) {
      try {
        const parsed = new URL(photoPath)
        if (parsed.origin === window.location.origin) {
          return photoPath
        }
      } catch {
        // fall through to local endpoint
      }
      if (Number.isFinite(employeeId) && employeeId > 0) {
        return `/api/photos/employee/${employeeId}`
      }
      return null
    }

    // Local-first fallback: serve from app public/static paths.
    if (typeof photoPath === 'string') {
      if (photoPath.startsWith('/')) return photoPath
      return `/${photoPath}`
    }
    
    return null
  }, [])

  const getEmployeeScheduleDisplay = React.useCallback((employee: any): ScheduleDisplayInfo => {
    const manilaDay = Number(formatInTimeZone(new Date(), 'Asia/Manila', 'i'))
    if (manilaDay === 7) {
      return { summary: 'Rest Day', source: 'rest_day' }
    }

    const knownInfo = todaysScheduleInfoByEmployee?.[employee?.employee_id]
    if (knownInfo) return knownInfo

    if (employee?.schedule_time_in && employee?.schedule_time_out) {
      return {
        summary: `${formatDbTime12h(employee.schedule_time_in)} - ${formatDbTime12h(employee.schedule_time_out)}`,
        source: 'office'
      }
    }

    return { summary: '-', source: 'unknown' }
  }, [todaysScheduleInfoByEmployee])

  const getScheduleSourceBadge = React.useCallback((source: ScheduleSource, scheduleCount?: number) => {
    const sourceConfig: Record<ScheduleSource, { label: string; className: string }> = {
      exam: { label: 'Exam', className: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800' },
      class: { label: 'Class', className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800' },
      office: { label: 'Office Hours', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' },
      no_today: { label: scheduleCount && scheduleCount > 0 ? `No Schedule Today (${scheduleCount})` : 'No Schedule Today', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800' },
      no_schedules: { label: 'No Schedules Found', className: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 border border-rose-200 dark:border-rose-800' },
      rest_day: { label: 'Rest Day', className: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700' },
      unknown: { label: 'Unavailable', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700' },
    }
    const config = sourceConfig[source] || sourceConfig.unknown
    return (
      <Badge className={`text-[10px] font-medium px-2 py-0.5 ${config.className}`}>
        {config.label}
      </Badge>
    )
  }, [])

  const getSubstitutionImpactBadge = React.useCallback((info: ScheduleDisplayInfo) => {
    if (!info.substitutionAdjusted) return null
    return (
      <Badge className="text-[10px] font-medium px-2 py-0.5 bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-300 border border-fuchsia-200 dark:border-fuchsia-800">
        Substitution Adjusted
      </Badge>
    )
  }, [])

  const getEmployeeScheduleIssue = React.useCallback((employee: any): string | null => {
    const staffType = String(employee?.staff_type || '').trim().toLowerCase()
    if (staffType !== 'teaching') return null

    const info = getEmployeeScheduleDisplay(employee)
    if (info.source === 'unknown') return 'No schedule source available for this employee.'
    if (info.source === 'no_schedules') return 'No class or exam schedules found for the selected term.'
    return null
  }, [getEmployeeScheduleDisplay])

  const EmployeeRow = memo(function EmployeeRow({ index, style }: ListChildComponentProps) {
    const employee = filteredEmployees[index]
    const avatarUrl = React.useMemo(() => getEmployeeAvatarUrl(employee), [employee, getEmployeeAvatarUrl])
    const scheduleIssue = getEmployeeScheduleIssue(employee)
    const scheduleDisplay = getEmployeeScheduleDisplay(employee)
    return (
      <div
        style={style}
        key={employee.employee_id}
        onClick={() => openViewEmployee(employee)}
        className={cn(
          "grid grid-cols-1 lg:grid-cols-12 items-center gap-x-3 xl:gap-x-4 gap-y-1.5 px-4 xl:px-5 border-b border-gray-200 dark:border-neutral-700 hover:bg-cyan-50/40 dark:hover:bg-cyan-950/20 transition-colors duration-200 cursor-pointer bg-white dark:bg-neutral-900",
          directoryLayout === 'compact' ? 'py-3' : 'py-4'
        )}
      >
        <div className="lg:col-span-2 flex items-center justify-center lg:justify-start">
          <div className="flex items-center gap-3">
            <div className="relative">
            <div className="w-10 h-10 xl:w-11 xl:h-11 rounded-full bg-linear-to-br from-blue-500 to-purple-600 dark:from-blue-600 dark:to-purple-700 flex items-center justify-center text-white text-[11px] font-semibold overflow-hidden shrink-0 ring-2 ring-blue-200 dark:ring-blue-800 shadow-md">
              { avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img 
                  src={avatarUrl} 
                  alt={employee.full_name} 
                  className="w-full h-full object-cover" 
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                    const parent = target.parentElement
                    if (parent && !parent.querySelector('.avatar-fallback')) {
                      const fallback = document.createElement('span')
                      fallback.className = 'avatar-fallback text-white font-bold'
                      fallback.textContent = getInitials(employee.full_name)
                      parent.appendChild(fallback)
                    }
                  }}
                />
              ) : getInitials(employee.full_name) }
            </div>
            {scheduleIssue && (
              <div
                className="absolute -top-1 -right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow-lg border-2 border-white dark:border-neutral-900 animate-pulse"
                title={scheduleIssue}
              >
                <AlertCircle className="h-3.5 w-3.5 animate-bounce" />
              </div>
            )}
            </div>
            <div className="flex flex-col items-center lg:items-start min-w-0">
              <h3 className="font-semibold text-xs xl:text-[13px] text-gray-900 dark:text-gray-100 leading-snug truncate max-w-[150px] xl:max-w-[170px]">
                {getEmployeeDisplayName(employee.full_name)}
              </h3>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-mono leading-tight truncate max-w-[150px] xl:max-w-[170px]">
                {employee.school_id}
              </p>
              {directoryLayout === 'comfortable' ? (
                <p className="text-[9px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight truncate max-w-[150px] xl:max-w-[170px]">
                  Hired: {new Date(employee.hire_date).toLocaleDateString()}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        
        <div className="lg:col-span-2 flex items-center justify-center">
          <p className="text-xs xl:text-[13px] font-medium text-gray-900 dark:text-gray-100 text-center leading-snug truncate max-w-[200px]">
            {employee.department}
          </p>
        </div>
        
        <div className="lg:col-span-2 space-y-1 flex flex-col items-center justify-center">
          <p className="text-xs xl:text-[13px] text-gray-900 dark:text-gray-100 text-center leading-snug truncate max-w-[220px]">
            {employee.email}
          </p>
          {directoryLayout === 'comfortable' && employee.phone && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center">{employee.phone}</p>
          )}
        </div>
        
        <div className="lg:col-span-2 space-y-1 flex flex-col items-center justify-center">
          <p className="text-[13px] xl:text-sm font-medium text-gray-900 dark:text-gray-100 text-center">RFID: <span className="font-mono text-[11px]">{employee.rfid_code}</span></p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center">{scheduleDisplay.summary}</p>
          <div className="pt-0.5 flex flex-wrap items-center justify-center gap-1">
            {getScheduleSourceBadge(scheduleDisplay.source, scheduleDisplay.scheduleCount)}
            {getSubstitutionImpactBadge(scheduleDisplay)}
          </div>
        </div>
        
        <div className="lg:col-span-1 flex items-center justify-center py-2">
          <div className="flex items-center justify-center">
            {getStatusBadge(employee.employment_status, employee.staff_type)}
          </div>
        </div>
        
        <div className="lg:col-span-2 flex items-center justify-center min-w-0 py-2">
          <div className="flex items-center justify-center w-full">
            {getWorkStatusBadge(employee)}
          </div>
        </div>
        
        <div className="lg:col-span-1 flex items-center justify-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => openViewEmployee(employee)} disabled={isDeleting} className="h-7 px-2 text-[11px] font-medium whitespace-nowrap">
            View
          </Button>
          {employee.is_active === false ? (
            <Button 
              variant="default" 
              size="sm" 
              onClick={() => handleRestoreEmployee(employee.employee_id, employee.full_name)} 
              disabled={isDeleting} 
              className="h-7 px-2.5 text-[11px] font-medium whitespace-nowrap bg-green-600 hover:bg-green-700 text-white"
            >
              Restore
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => handleEditEmployee(employee)} disabled={isDeleting} className="h-7 px-2.5 text-[11px] font-medium whitespace-nowrap">Edit</Button>
          )}
        </div>
      </div>
    )
  })

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const getStatusBadge = (status: string, staffType?: string) => {
    // Define status configurations for both Non-Teaching and Teaching staff
    const statusConfig = {
      // Non-Teaching statuses
      "Regular": { className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300", icon: CheckCircle },
      "Provisionary": { className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", icon: AlertTriangle },
      // Teaching statuses
      "Full Time": { className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300", icon: UserCheck },
      "Part Time": { className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: Clock },
      "Part Time Full Load": { className: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300", icon: BookOpen },
    }
    
    // Get the actual status value or default based on staff type
    const displayStatus = status || (staffType === 'Non-Teaching' ? 'Regular' : 'Part Time')
    const config = statusConfig[displayStatus as keyof typeof statusConfig] || { className: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400", icon: User }
    const Icon = config.icon
    
    return (
      <div className="flex flex-col items-center justify-center gap-0.5">
        <Badge className={`${config.className} text-center whitespace-nowrap text-[11px] font-medium px-2 py-0.5`}>
          <Icon className="h-3 w-3 mr-1" />
          {displayStatus}
        </Badge>
      </div>
    )
  }

  const formatDateSafe = (value: unknown, fallback = 'N/A') => {
    if (!value) return fallback

    const raw = String(value).trim()
    if (!raw) return fallback

    // Keep YYYY-MM-DD values in Manila midnight; otherwise parse as provided.
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? new Date(`${raw}T00:00:00+08:00`)
      : new Date(raw)

    if (Number.isNaN(parsedDate.getTime())) return fallback
    return format(parsedDate, 'MMM dd, yyyy')
  }

  const getWorkStatusBadge = (employee: any) => {
    const startDate = (employee as any).start_date || employee.hire_date
    const hireDate = employee.hire_date
    
    if (!startDate && !hireDate) {
      return (
        <div className="flex flex-col items-center justify-center gap-0.5">
          <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200 whitespace-nowrap text-center text-[11px] font-medium px-2 py-0.5">
            N/A
          </Badge>
        </div>
      )
    }
    
    // Use Manila timezone for today's date
    const today = getManilaToday()
    
    // Check if work has started using Manila timezone
    const workStarted = hasWorkStarted(today, startDate, hireDate)
    
    if (!workStarted) {
      const startDateForDisplay = startDate || hireDate
      const formattedStartDate = formatDateSafe(startDateForDisplay)
      
      return (
        <div className="flex flex-col items-center justify-center gap-1 min-w-0 w-full">
          <Badge className="bg-amber-500/20 dark:bg-amber-500/30 text-amber-700 dark:text-amber-400 border border-amber-500/30 dark:border-amber-500/40 text-[11px] font-medium px-2 py-0.5 whitespace-nowrap text-center">
            Not Started
          </Badge>
          <span className="text-[10px] text-gray-500 dark:text-gray-400 font-normal leading-tight text-center">
            Starts: {formattedStartDate}
          </span>
        </div>
      )
    }
    
    // Work has started - show active badge
    return (
      <div className="flex flex-col items-center justify-center gap-0.5">
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 whitespace-nowrap text-center text-[11px] font-medium px-2 py-0.5">
          Active
        </Badge>
      </div>
    )
  }


  const handleCreateDepartment = async () => {
    // Validate all required fields
    const errors: string[] = []
    const invalid = new Set<string>()
    
    if (!deptFormName.trim()) {
      errors.push('Department Name is required. Please input a value.')
      invalid.add('dept-name')
    }
    
    if (!deptFormAcronym.trim()) {
      errors.push('Acronym is required. Please input a value.')
      invalid.add('dept-acronym')
    }
    
    if (!deptFormCategory) {
      errors.push('Category is required. Please select a value.')
      invalid.add('dept-category')
    }
    
    // If there are validation errors, show the dialog
    if (errors.length > 0) {
      setDeptValidationErrors(errors)
      setDeptInvalidFields(invalid)
      setShowDeptValidationDialog(true)
      return
    }

    setIsDeptSubmitting(true)
    try {
      const response = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: deptFormName, 
          acronym: deptFormAcronym, 
          description: deptFormDesc,
          category: deptFormCategory || undefined
        })
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create department')
      }

      // Refresh departments list
      const updatedDepartments = await getDepartments()
      setDepartments(updatedDepartments)

      // Save department name before clearing (needed for auto-selection)
      const createdDeptName = deptFormName

      toast({
        title: "Success",
        description: "Department created successfully"
      })

      // If opened from employee form, auto-select the newly created department
      if (deptDialogSource === 'add-employee' || deptDialogSource === 'edit-employee') {
        handleInputChange('department', createdDeptName)
      }

      // Clear form but keep dialog open for "Add More" functionality
      setDeptFormName("")
      setDeptFormAcronym("")
      setDeptFormDesc("")
      setDeptFormCategory("")
      setEditingDept(null)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      })
    } finally {
      setIsDeptSubmitting(false)
    }
  }

  const handleUpdateDepartment = async () => {
    if (!editingDept) return
    if (!canManageDepartment(editingDept)) {
      toast({
        title: 'Access denied',
        description: `You can only edit ${effectiveStaffType.toLowerCase()} departments.`,
        variant: 'destructive'
      })
      return
    }
    if (!deptFormName.trim()) {
      toast({
        title: "Validation Error",
        description: "Department name is required",
        variant: "destructive"
      })
      return
    }

    setIsDeptSubmitting(true)
    try {
      const response = await fetch('/api/departments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          department_id: editingDept.department_id,
          name: deptFormName,
          acronym: deptFormAcronym,
          description: deptFormDesc,
          category: deptFormCategory || undefined
        })
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to update department')
      }

      // Refresh departments list
      const updatedDepartments = await getDepartments()
      setDepartments(updatedDepartments)

      toast({
        title: "Success",
        description: "Department updated successfully"
      })

      setIsDeptDialogOpen(false)
      setEditingDept(null)
      setDeptFormName("")
      setDeptFormAcronym("")
      setDeptFormDesc("")
      setDeptFormCategory("")
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      })
    } finally {
      setIsDeptSubmitting(false)
    }
  }

  const openDeleteDeptDialog = (dept: Department) => {
    if (!canManageDepartment(dept)) {
      toast({
        title: 'Access denied',
        description: `You can only delete ${effectiveStaffType.toLowerCase()} departments.`,
        variant: 'destructive'
      })
      return
    }
    setDeptToDelete(dept)
    const boundEmployees = (Array.isArray(allEmployees) ? allEmployees : []).filter((emp: any) => {
      return String(emp?.department || '').trim() === String(dept?.name || '').trim()
    })
    setDeptEmployeesToReassign(boundEmployees)
    setDeptEmployeeReassignments({})
    setDeleteDeptDialogOpen(true)
  }

  const handleConfirmDeleteDepartment = async () => {
    if (!deptToDelete) return
    if (!canManageDepartment(deptToDelete)) {
      toast({
        title: 'Access denied',
        description: `You can only delete ${effectiveStaffType.toLowerCase()} departments.`,
        variant: 'destructive'
      })
      return
    }

    const deptName = deptToDelete.name
    const deptId = deptToDelete.department_id

    // Block deletion when any employee is still assigned to the department.
    // Requirement: admin must archive/delete those employees first.
    const boundEmployees = (Array.isArray(allEmployees) ? allEmployees : []).filter((emp: any) => {
      return String(emp?.department || '').trim() === String(deptName || '').trim()
    })
    if (boundEmployees.length > 0) {
      toast({
        title: 'Cannot delete department',
        description: `“${deptName}” is still assigned to ${boundEmployees.length} employee(s). Please archive/delete those employees first before deleting this department.`,
        variant: 'destructive',
        duration: 6000,
      })
      return
    }

    setIsDeptDeleting(true)

    try {
      const response = await fetch(`/api/departments?id=${deptId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete department')
      }

      // Refresh departments list (only shows active departments)
      const updatedDepartments = await getDepartments()
      setDepartments(updatedDepartments)

      // Close dialog
      setDeleteDeptDialogOpen(false)
      setDeptToDelete(null)

      toast({
        title: "✓ Deleted Successfully",
        description: `"${deptName}" has been permanently removed from the database`,
        duration: 3000,
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || 'Failed to delete department',
        variant: "destructive",
        duration: 5000,
      })
    } finally {
      setIsDeptDeleting(false)
    }
  }

  const handleReassignAndDeleteDepartment = async () => {
    if (!deptToDelete) return
    if (!canManageDepartment(deptToDelete)) {
      toast({
        title: 'Access denied',
        description: `You can only delete ${effectiveStaffType.toLowerCase()} departments.`,
        variant: 'destructive'
      })
      return
    }

    setIsDeptReassigning(true)
    try {
      const sourceId = deptToDelete.department_id
      const employees = deptEmployeesToReassign || []

      if (employees.length === 0) {
        toast({
          title: 'No employees to reassign',
          description: 'This department has no assigned employees.',
        })
      } else {
        const missing = employees.filter((emp) => !deptEmployeeReassignments?.[emp.employee_id])
        if (missing.length > 0) {
          toast({
            title: 'Select a new department for each employee',
            description: `Please choose a target department for all ${employees.length} employee(s) before continuing.`,
            variant: 'destructive',
            duration: 6000,
          })
          return
        }

        // Reassign employees one-by-one so admin can control each profile.
        for (const emp of employees) {
          const targetDepartmentId = Number(deptEmployeeReassignments[emp.employee_id])
          const targetDept = (scopedDepartments || []).find((d) => d.department_id === targetDepartmentId)
          if (!targetDept) {
            throw new Error('Selected target department was not found. Please refresh and try again.')
          }

          const res = await fetch('/api/employees', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employee_id: emp.employee_id,
              department: targetDept.name,
            }),
          })
          const body = await res.json().catch(() => ({}))
          if (!res.ok) {
            throw new Error(body?.error || `Failed to reassign ${emp.full_name}`)
          }
        }

        await mutate()
        const updatedDepartments = await getDepartments()
        setDepartments(updatedDepartments)

        toast({
          title: 'Employees reassigned',
          description: `${employees.length} employee(s) reassigned. You can now delete the department.`,
        })
      }

      // Now delete the department.
      await handleConfirmDeleteDepartment()
    } catch (error: any) {
      toast({
        title: 'Reassignment failed',
        description: error.message || 'Unable to reassign employees',
        variant: 'destructive',
      })
    } finally {
      setIsDeptReassigning(false)
    }
  }

  const handleEditDepartment = (dept: Department) => {
    if (!canManageDepartment(dept)) {
      toast({
        title: 'Access denied',
        description: `You can only edit ${effectiveStaffType.toLowerCase()} departments.`,
        variant: 'destructive'
      })
      return
    }
    setEditingDept(dept)
    setDeptFormName(dept.name)
    setDeptFormAcronym(dept.acronym || "")
    setDeptFormDesc(dept.description || "")
    setDeptFormCategory(dept.category || "")
    // Clear validation errors when editing
    setDeptInvalidFields(new Set())
    setDeptValidationErrors([])
    setShowDeptValidationDialog(false)
  }

  const getDepartmentEmployeeCount = (departmentName: string) => {
    const list = Array.isArray(allEmployees) ? allEmployees : []
    return list.filter((emp: any) => (emp?.department || '').trim() === departmentName.trim()).length
  }

  // Real-time RFID availability check with debounce
  const checkRfidAvailability = async (rfidCode: string) => {
    // Clear previous timeout
    if (rfidCheckTimeout) {
      clearTimeout(rfidCheckTimeout)
    }
    
    // Reset states
    setRfidCheckResult(null)
    
    // Only check if RFID is valid format (10 digits)
    const normalized = rfidCode.replace(/\D+/g, '')
    if (!normalized || normalized.length !== 10) {
      return
    }
    
    // Set loading state with debounce (wait 800ms after user stops typing)
    const timeout = setTimeout(async () => {
      setIsCheckingRfid(true)
      
      try {
        // Check against local API data (exclude archived employees).
        const res = await fetch('/api/employees?includeInactive=true&includeNotStarted=true', { cache: 'no-store' })
        const employees = res.ok ? await res.json().catch(() => []) : []
        const existingEmployee = (employees || []).find((e: any) => {
          const rfid = (e?.rfid_code || '').toString().replace(/\D+/g, '')
          const active = e?.is_active === true || e?.is_active === null || e?.is_active === undefined
          return !!rfid && rfid === normalized && active
        })

        if (existingEmployee) {
          // RFID is already taken by another active employee
          setRfidCheckResult('taken')
        } else {
          // RFID is available
          setRfidCheckResult('available')
        }
      } catch {
        setRfidCheckResult(null)
      } finally {
        setIsCheckingRfid(false)
      }
    }, 800) // 800ms debounce
    
    setRfidCheckTimeout(timeout)
  }

  const handleInputChange = React.useCallback((field: string, value: string | boolean) => {
    // Direct synchronous update for optimal performance
    setFormData(prev => {
      let processedValue = value

      if (field === 'staff_type') {
        processedValue = effectiveStaffType
      }
      
      // For full_name field, only allow letters, spaces, and Ñ/ñ (auto-capitalize)
      if (field === 'full_name' && typeof value === 'string') {
        // Remove all characters except letters (including Ñ/ñ), spaces, hyphens, apostrophes, and periods
        // Allow: A-Z, a-z, Ñ, ñ, spaces, hyphens (-), apostrophes ('), and periods (.)
        let cleaned = value.replace(/[^a-zA-ZñÑ\s\-'.]/g, '')
        
        // Auto-capitalize: Capitalize first letter of each word as user types
        // Handle names like "Juan Dela Cruz", "Mary-Jane O'Brien", "Dr. Smith"
        processedValue = cleaned
          .split(/([\s\-'.])/)
          .map((part) => {
            // Keep separators (spaces, hyphens, apostrophes, periods) as-is
            if (/^[\s\-'.]+$/.test(part)) {
              return part
            }
            // Capitalize first letter of each word part, lowercase the rest
            if (part.length > 0) {
              return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
            }
            return part
          })
          .join('')
          .slice(0, MAX_FULL_NAME_LENGTH)
      }

      if (field === 'email' && typeof value === 'string') {
        processedValue = value.trim().toLowerCase().slice(0, MAX_EMAIL_LENGTH)
      }
      
      const updated = { ...prev, [field]: processedValue }
      // Handle staff type changes with confirmation dialog
      if (field === 'staff_type' && editingEmployee) {
        const currentStaffType = (editingEmployee as any).staff_type || prev.staff_type
        const newStaffType = processedValue as 'Teaching' | 'Non-Teaching'
        
        // Only show confirmation if actually changing between Teaching and Non-Teaching
        if (currentStaffType !== newStaffType && (currentStaffType === 'Teaching' || currentStaffType === 'Non-Teaching')) {
          // Store pending change and show confirmation dialog
          setPendingStaffTypeChange({ from: currentStaffType, to: newStaffType })
          setStaffTypeChangeDialogOpen(true)
          // Don't update the form yet - wait for confirmation
          return prev
        }
      }
      
      // Enforce employment status based on staff type
      if (field === 'staff_type') {
        if (processedValue === 'Non-Teaching') {
          // Non-Teaching: Default to "Regular" if empty or invalid
          const nonTeachingOptions = ["Regular", "Provisionary"]
          if (!updated.employment_status || !nonTeachingOptions.includes(updated.employment_status)) {
            updated.employment_status = 'Regular'
          }
        } else if (processedValue === 'Teaching') {
          // Teaching: Set to "Part Time" if empty or if current status is not valid for Teaching
          const teachingOptions = ["Part Time", "Part Time Full Load", "Regular"]
          if (!updated.employment_status || !teachingOptions.includes(updated.employment_status)) {
            updated.employment_status = 'Part Time'
          }
        }
      }
      
      // Also enforce when employment_status changes directly
      if (field === 'employment_status' && typeof value === 'string') {
        const currentStaffType = updated.staff_type || prev.staff_type
        if (currentStaffType === 'Non-Teaching') {
          // Non-Teaching: Only allow "Regular" or "Provisionary"
          const nonTeachingOptions = ["Regular", "Provisionary"]
          if (!nonTeachingOptions.includes(value)) {
            // If invalid, default to "Regular"
            updated.employment_status = 'Regular'
          } else {
            // Valid value, use it
            updated.employment_status = value
          }
        } else if (currentStaffType === 'Teaching') {
          // Teaching: Allow "Part Time", "Part Time Full Load", and "Regular"
          const teachingOptions = ["Part Time", "Part Time Full Load", "Regular"]
          if (!teachingOptions.includes(value)) {
            // If invalid, default to "Part Time"
            updated.employment_status = 'Part Time'
          }
        }
      }

      if (field === 'department') {
        const staffType = updated.staff_type || prev.staff_type
        const departmentName = String(processedValue || '').trim()
        if (staffType === 'Non-Teaching') {
          const schedules = DEPARTMENT_WORK_SCHEDULES[departmentName]
          if (Array.isArray(schedules) && schedules.length > 0) {
            updated.schedule_time_in = schedules[0].time_in
            updated.schedule_time_out = schedules[0].time_out
            setInvalidFields(prev => {
              const next = new Set(prev)
              next.delete('schedule_time_in')
              next.delete('schedule_time_out')
              return next
            })
          } else {
            updated.schedule_time_in = null
            updated.schedule_time_out = null
          }
        }
      }
      return updated
    })
  }, [effectiveStaffType, setInvalidFields])

  const handleInputBlur = React.useCallback((field: string, value: string) => {
    if (field === 'school_id') {
      const sanitized = value.replace(/\D+/g, '').slice(0, 11)
      setFormData(prev => ({ ...prev, school_id: sanitized }))
    } else if (field === 'rfid_code') {
      const sanitized = value.replace(/\D+/g, '').slice(0, 10)
      setFormData(prev => ({ ...prev, rfid_code: sanitized }))
      // Lock RFID if it has a valid value (10 digits)
      if (sanitized.length === 10) {
        setIsRfidLocked(true)
      }
    } else if (field === 'phone') {
      const sanitized = value.replace(/[^+\d]+/g, '').slice(0, 13)
      setFormData(prev => ({ ...prev, phone: sanitized }))
    }
  }, [])

  const resetForm = () => {
      // CRITICAL: Use Manila timezone to get tomorrow's date
      // Get today's date in Manila timezone
      const today = getManilaToday()
      const todayObj = new Date(today + 'T00:00:00+08:00')
      
      // Calculate tomorrow in Manila timezone
      const tomorrow = new Date(todayObj)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dayOfWeek = tomorrow.getDay()
      
      // If tomorrow is Sunday, move to Monday
      if (dayOfWeek === 0) {
        tomorrow.setDate(tomorrow.getDate() + 1)
      }
      
      const tomorrowStr = format(tomorrow, 'yyyy-MM-dd')
      
      // Set staff_type and employment_status based on current user
      const defaultStaffType = effectiveStaffType as 'Teaching' | 'Non-Teaching'
      const defaultEmploymentStatus = defaultStaffType === 'Non-Teaching' ? 'Regular' : 'Part Time'
      
      // Generate school_id based on staff type
      let defaultSchoolId = ""
      try {
        defaultSchoolId = generateNextSchoolId(defaultStaffType)
      } catch {
        defaultSchoolId = defaultStaffType === 'Non-Teaching' ? 'N101' : 'T100'
      }
      
      // Fallback if generation returns empty or invalid
      if (!defaultSchoolId || defaultSchoolId.trim() === '') {
        defaultSchoolId = defaultStaffType === 'Non-Teaching' ? 'N101' : 'T100'
      }

      setFormData({
        full_name: "",
        school_id: defaultSchoolId,  // ✅ Set generated ID instead of empty string
        rfid_code: "",
        department: "",
        employment_status: defaultEmploymentStatus,
        staff_type: defaultStaffType as 'Teaching' | 'Non-Teaching',
        email: "",
        phone: "",
        password: "admin123",
        // Teaching staff schedule is derived from class/exam schedules, not a fixed admin-time window.
        schedule_time_in: null,
        schedule_time_out: null,
        hire_date: "", // Will be automatically set to current date/time when creating employee
        start_date: tomorrowStr, // Default to tomorrow (cannot start today)
        photo_path: "",
        is_active: true,
        is_reporting_staff: false,
        is_standby: false
      })
      // Reset RFID lock when form is reset
      setIsRfidLocked(false)
  }

  // Upload a data URL to storage and return a public URL (or empty string on failure)
  // Compress image to reduce file size and database load (target: max 200KB, 800x800px)
  const compressImage = async (blob: Blob, maxWidth: number = 400, maxHeight: number = 400, quality: number = 0.75): Promise<Blob> => {
    return new Promise((resolve) => {
      const img = new Image()
      
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        // Calculate new dimensions maintaining aspect ratio (more aggressive resizing for lightweight)
        const aspectRatio = width / height
        
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            width = Math.min(width, maxWidth)
            height = width / aspectRatio
            if (height > maxHeight) {
              height = maxHeight
              width = height * aspectRatio
            }
          } else {
            height = Math.min(height, maxHeight)
            width = height / aspectRatio
            if (width > maxWidth) {
              width = maxWidth
              height = width / aspectRatio
            }
          }
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(blob)
          return
        }
        
        // Use better image rendering for quality
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, width, height)
        
        canvas.toBlob(
          (newBlob) => {
            if (newBlob) {
              resolve(newBlob)
            } else {
              resolve(blob)
            }
          },
          'image/jpeg',
          quality // Configurable quality for better compression
        )
      }
      
      img.onerror = () => {
        resolve(blob)
      }
      
      img.src = URL.createObjectURL(blob)
    })
  }

  const uploadPhotoDataUrl = async (dataUrl: string, keyHint: string): Promise<string> => {
    try {
      // Use the backend API route which has the service role key (bypasses RLS)
      const res = await fetch('/api/upload/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: dataUrl, employeeId: keyHint }),
      })
      
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || `Upload failed with status ${res.status}`)
      }
      
      const { url } = await res.json()
      return url || ''
    } catch (error) {
      throw error
    }
  }

  const clearValidationState = () => {
    setInvalidFields(new Set())
    setValidationErrors([])
    setShowValidationDialog(false)
  }

  const handleAddEmployee = async () => {
    // Validate required fields
    // For Non-Teaching staff, employment_status is not required
    // school_id is NOT in required fields - it uses nextIdPlaceholder which is auto-generated
    const requiredFields = ['full_name', 'rfid_code', 'department', 'email', 'phone', 'staff_type', 'hire_date', 'start_date']
    if (formData.staff_type === 'Teaching') {
      requiredFields.push('employment_status')
    }
    if (formData.staff_type === 'Non-Teaching') {
      requiredFields.push('schedule_time_in', 'schedule_time_out')
    }
    // Filter out empty values, but school_id is allowed to be empty (uses nextIdPlaceholder)
    const missingFields = requiredFields.filter(field => !formData[field as keyof typeof formData])
    
    if (missingFields.length > 0) {
      const pretty = missingFields.map((f) => {
        if (f === 'full_name') return 'No Employee Name. Please input a value.'
        if (f === 'school_id') return 'No School ID. Please input a value.'
        if (f === 'rfid_code') return 'No RFID Code. Please input a value.'
        if (f === 'department') return 'No Department. Please select a value.'
        if (f === 'employment_status') return 'No Employment Status. Please select a value.'
        if (f === 'email') return 'No Email Address. Please input a value.'
        if (f === 'phone') return 'No Phone Number. Please input a value.'
        if (f === 'staff_type') return 'No Staff Type. Please choose Teaching or Non-Teaching.'
        if (f === 'hire_date') return 'No Hire Date. Please select a value.'
        if (f === 'start_date') return 'No Start Date. Please select a value.'
        if (f === 'schedule_time_in' || f === 'schedule_time_out') return 'No Work Schedule. Please select a work schedule.'
        return `${f} is required`
      })
      setValidationErrors(Array.from(new Set(pretty)))
      setInvalidFields(new Set(missingFields))
      setShowValidationDialog(true)
      return
    }

    try {
      // Basic format validations (field-level)
      // Use nextIdPlaceholder if available, otherwise use formData.school_id
      const validationData = { 
        ...formData, 
        school_id: nextIdPlaceholder || formData.school_id 
      }
      const { errors, invalid } = validateEmployeeForm(validationData)
      if (errors.length > 0) {
        setValidationErrors(errors)
        setInvalidFields(invalid)
        setShowValidationDialog(true)
        return
      }
      setInvalidFields(new Set())
      // Duplicate checks against live database to avoid stale cache issues
      const dup = await checkDuplicateConflictsServer(validationData, 'add')
      if (dup.errors.length > 0) {
        setValidationErrors(dup.errors)
        setInvalidFields(dup.invalid)
        setShowValidationDialog(true)
        setIsSubmitting(false)
        return
      }
      const employeeIdUpper = (formData.school_id || '').toString().trim().toUpperCase()
      const rfidSanitized = (formData.rfid_code || '').replace(/\D+/g, '').slice(0, 10)

      setIsSubmitting(true)
      
      const phoneSanitized = (formData.phone || '').replace(/\D+/g, '').slice(0, 11)
      let photoUrl = formData.photo_path
      let pendingPhotoDataUrl: string | null = null
      if (photoUrl && photoUrl.startsWith('data:image')) {
        // Defer upload until employee_id exists.
        pendingPhotoDataUrl = photoUrl
        photoUrl = ''
      }
      // Use provided hire_date if set, otherwise default to current date/time (ISO)
      const currentDateTime = new Date().toISOString()
      const normalizedHireDate = (() => {
        const hd = (formData.hire_date || '').trim()
        if (!hd) return currentDateTime
        // If user typed/selected a date (yyyy-MM-dd), keep as date string to store in DB date column
        if (/^\d{4}-\d{2}-\d{2}$/.test(hd)) return hd
        return hd
      })()
      
      // Use nextIdPlaceholder as the school_id (this is the Employee ID shown in UI)
      const finalSchoolId = nextIdPlaceholder || formData.school_id || ''
      
      // Enforce employment status based on staff type
      const employeePayload: any = { 
        ...formData, 
        photo_path: photoUrl || '', 
        rfid_code: rfidSanitized, 
        school_id: finalSchoolId, // Use the nextIdPlaceholder value (e.g., T103, N101)
        email: formData.email.trim(), 
        phone: phoneSanitized,
        hire_date: normalizedHireDate,
        is_reporting_staff: false,
      }

      // Enforce employment status based on staff type
      if (formData.staff_type === 'Non-Teaching') {
        // Non-Teaching: Only "Regular" or "Provisionary"
        const nonTeachingOptions = ["Regular", "Provisionary"]
        if (!employeePayload.employment_status || !nonTeachingOptions.includes(employeePayload.employment_status)) {
          employeePayload.employment_status = 'Regular' // Default for Non-Teaching
        }
      } else if (formData.staff_type === 'Teaching') {
        // Teaching: "Part Time", "Part Time Full Load", or "Regular"
        const teachingOptions = ["Part Time", "Part Time Full Load", "Regular"]
        if (!employeePayload.employment_status || !teachingOptions.includes(employeePayload.employment_status)) {
          employeePayload.employment_status = 'Part Time' // Default for Teaching
        }
      }

      // Teaching staff should never persist admin-time windows (schedule is derived from class/exam schedules).
      if (formData.staff_type === 'Teaching') {
        employeePayload.schedule_time_in = null
        employeePayload.schedule_time_out = null
      }
      
      let newEmployee
      try {
        newEmployee = await createEmployee(employeePayload)
      } catch (error: any) {
        const errorMessage = error?.message || error?.error || "Unknown error"
        
        // Check for specific error types - improved error message formatting
        if (errorMessage.includes('duplicate') || errorMessage.includes('already exists') || errorMessage.includes('already in use') || errorMessage.includes('unique constraint')) {
          // Parse database constraint errors
          let formattedError = errorMessage
          if (errorMessage.includes('employees_rfid_code_key')) {
            formattedError = `RFID Code is already in use by another employee. Please use a different RFID Code.`
            setInvalidFields(new Set(['rfid_code']))
          } else if (errorMessage.includes('employees_school_id_key') || errorMessage.includes('school_id')) {
            formattedError = `School ID is already in use by another employee. Please use a different School ID.`
            setInvalidFields(new Set(['school_id']))
          } else if (errorMessage.includes('employees_email_key') || errorMessage.includes('email')) {
            formattedError = `Email address is already registered to another employee. Please use a different email address.`
            setInvalidFields(new Set(['email']))
          } else if (errorMessage.toLowerCase().includes('phone')) {
            formattedError = `Phone number is already registered to another employee. Please use a different phone number.`
            setInvalidFields(new Set(['phone']))
          } else if (errorMessage.toLowerCase().includes('full name') || errorMessage.toLowerCase().includes('employee name')) {
            formattedError = `An employee with this full name already exists. Please review the name and try again.`
            setInvalidFields(new Set(['full_name']))
          } else if (errorMessage.includes('School ID')) {
            setInvalidFields(new Set(['school_id']))
          } else if (errorMessage.includes('RFID')) {
            setInvalidFields(new Set(['rfid_code']))
          } else if (errorMessage.includes('Email')) {
            setInvalidFields(new Set(['email']))
          } else if (errorMessage.toLowerCase().includes('phone')) {
            setInvalidFields(new Set(['phone']))
          } else if (errorMessage.toLowerCase().includes('name')) {
            setInvalidFields(new Set(['full_name']))
          }
          
          setValidationErrors([formattedError])
          setShowValidationDialog(true)
          return
        }
        
        toast({
          title: "Error",
          description: errorMessage || "Failed to create employee. Please check all fields and try again.",
          variant: "destructive",
        })
        return
      }

      // Upload profile photo after employee creation so we can store by employee_id.
      if (pendingPhotoDataUrl && newEmployee?.employee_id) {
        try {
          const uploadedPhotoUrl = await uploadPhotoDataUrl(pendingPhotoDataUrl, String(newEmployee.employee_id))
          if (uploadedPhotoUrl) {
            await updateEmployee(newEmployee.employee_id, { photo_path: uploadedPhotoUrl } as any)
          } else {
            toast({
              title: "Warning",
              description: "Employee was created, but photo upload failed. You can add the photo by editing the employee.",
              variant: "default"
            })
          }
        } catch (error: any) {
          toast({
            title: "Warning",
            description: error?.message || "Employee was created, but photo upload failed. You can add the photo by editing the employee.",
            variant: "default"
          })
        }
      }
      
      // If Teaching staff and rows were added, persist schedules
      if (formData.staff_type === 'Teaching' && scheduleRows.length > 0 && newEmployee) {
        let scheduleErrors: string[] = []
        for (const row of scheduleRows) {
          try {
            const room = await upsertRoom({ code: row.room_code })
            let subject = null
            if (row.subject_name) {
              subject = await upsertSubject({ name: row.subject_name.trim() })
            }
            
            await upsertTeachingSchedule({
              employee_id: newEmployee.employee_id,
              room_id: room.room_id,
              subject_id: subject?.subject_id,
              subject_name: row.subject_name,
              class_type: row.class_type,
              day_of_week: row.day_of_week,
              time_start: convertToDatabaseTime(row.time_start),
              time_end: convertToDatabaseTime(row.time_end),
            } as any)
          } catch (scheduleError: any) {
            scheduleErrors.push(`Failed to save schedule for ${row.subject_name || 'unknown'}: ${scheduleError?.message || 'Unknown error'}`)
          }
        }
        
        if (scheduleErrors.length > 0) {
          toast({
            title: "Warning",
            description: `Employee created successfully, but ${scheduleErrors.length} schedule(s) failed to save. You can add them manually later.`,
            variant: "default",
          })
        }
      }
      
      // Refresh list and update counts
      try {
        if (mutate) await mutate()
      } catch {
        // Don't block success message if refresh fails
      }
      
      toast({
        title: "Success",
        description: `${newEmployee?.full_name || 'Employee'} has been successfully added to the system.`,
      })
      
      setIsAddDialogOpen(false)
      resetForm()
    } catch (error: any) {
      const errorMessage = error?.message || error?.error || "Unknown error occurred"
      toast({
        title: "Error",
        description: errorMessage || "Failed to add employee. Please check all fields and try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteClick = (employeeId: number, employeeName: string) => {
    setEmployeeToDelete({ id: employeeId, name: employeeName })
    setDeleteDialogOpen(true)
  }

  const handleArchiveEmployee = async () => {
    if (!employeeToDelete) return

    try {
      setIsDeleting(true)
      // Archive the employee (set is_active to false)
      await archiveEmployee(employeeToDelete.id, true)
      
      // Refresh list
      if (mutate) await mutate()
      
      toast({
        title: "Success",
        description: `${employeeToDelete.name} has been archived successfully. You can restore them anytime.`,
      })
      // Close any open dialogs/windows after successful archiving
      setIsEditDialogOpen(false)
      setIsViewDialogOpen(false)
      setDeleteDialogOpen(false)
      setDeleteConfirmOpen(false)
      setEditingEmployee(null)
      resetForm()
    } catch (error: any) {
      // Extract detailed error message
      let errorMessage = "Unknown error occurred"
      if (error?.message) {
        errorMessage = error.message
      } else if (error?.error?.message) {
        errorMessage = error.error.message
      } else if (typeof error === 'string') {
        errorMessage = error
      }
      toast({
        title: "Error",
        description: `Failed to archive employee: ${errorMessage}`,
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setDeleteConfirmOpen(false)
      setEmployeeToDelete(null)
    }
  }

  const handlePermanentlyDeleteEmployee = async () => {
    if (!employeeToPermanentlyDelete) return

    try {
      setIsPermanentlyDeleting(true)
      // Call the permanent delete API route
      await deleteEmployee(employeeToPermanentlyDelete.id)
      
      // Refresh list
      if (mutate) await mutate()
      
      toast({
        title: "Success",
        description: `${employeeToPermanentlyDelete.name} has been permanently deleted from the system.`,
      })
      // Close any open dialogs/windows after successful deletion
      setIsEditDialogOpen(false)
      setIsViewDialogOpen(false)
      setPermanentDeleteDialogOpen(false)
      setEditingEmployee(null)
      resetForm()
    } catch (error: any) {
      const errorMessage = error?.message || error?.error?.message || (typeof error === 'string' ? error : "Unknown error occurred")
      
      toast({
        title: "Error",
        description: `Failed to permanently delete employee: ${errorMessage}`,
        variant: "destructive",
      })
    } finally {
      setIsPermanentlyDeleting(false)
      setPermanentDeleteDialogOpen(false)
      setEmployeeToPermanentlyDelete(null)
    }
  }
  
  const handleRestoreEmployee = async (employeeId: number, employeeName: string) => {
    // Find the employee to restore
    let employee = allEmployees.find(emp => emp.employee_id === employeeId)

    // Fallback: if local state is stale, fetch from local API before failing.
    if (!employee) {
      try {
        const res = await fetch('/api/employees?includeInactive=true&includeNotStarted=true&onlyArchived=true', {
          cache: 'no-store',
        })
        if (res.ok) {
          const latestEmployees = await res.json().catch(() => [])
          employee = (latestEmployees || []).find((emp: any) => emp.employee_id === employeeId)
        }
      } catch {}
    }

    if (!employee) {
      toast({
        title: "Error",
        description: "Employee not found.",
        variant: "destructive",
      })
      return
    }

    if (isTeachingScopedAdmin && ((employee as any).staff_type || '') === 'Non-Teaching') {
      toast({
        title: "Access restricted",
        description: "Your account is restricted to Teaching staff only.",
        variant: "destructive",
      })
      return
    }
    
    // Set the employee to restore
    setRestoringEmployee(employee)
    
    // Clear validation state
    clearValidationState()
    
    // Normalize and enforce employment status based on staff type
    const staffType = ((employee as any).staff_type || effectiveStaffType) as 'Teaching' | 'Non-Teaching'
    let normalizedStatus = employee.employment_status || ''
    
    // Enforce employment status based on staff type
    if (staffType === 'Non-Teaching') {
      // Non-Teaching: Only "Regular" or "Provisionary"
      const nonTeachingOptions = ["Regular", "Provisionary"]
      if (!normalizedStatus || !nonTeachingOptions.includes(normalizedStatus)) {
        normalizedStatus = 'Regular' // Default for Non-Teaching
      }
    } else if (staffType === 'Teaching') {
      const teachingOptions = ["Part Time", "Part Time Full Load"]
      if (!normalizedStatus || !teachingOptions.includes(normalizedStatus)) {
        normalizedStatus = 'Part Time'
      }
    }
    
    // Reset start_date to tomorrow (Manila timezone) when restoring (cannot start today)
    const today = new Date(getManilaToday() + 'T00:00:00+08:00')
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    // If tomorrow is Sunday, move to Monday
    if (tomorrow.getDay() === 0) {
      tomorrow.setDate(tomorrow.getDate() + 1)
    }
    
    const tomorrowStr = format(tomorrow, 'yyyy-MM-dd')
    
    setFormData({
      full_name: employee.full_name,
      school_id: employee.school_id,
      rfid_code: employee.rfid_code,
      department: employee.department,
      employment_status: normalizedStatus,
      staff_type: effectiveStaffType as 'Teaching' | 'Non-Teaching',
      email: employee.email,
      phone: employee.phone,
      password: employee.password,
      schedule_time_in: employee.schedule_time_in,
      schedule_time_out: employee.schedule_time_out,
      hire_date: employee.hire_date,
      start_date: tomorrowStr, // CRITICAL: Reset start_date to tomorrow when restoring (cannot start today)
      photo_path: (employee as any).photo_path || "",
      is_active: true, // Set to active when restoring
      is_reporting_staff: (employee as any).is_reporting_staff || false,
      is_standby: (employee as any).is_standby || false
    })
    
    // Open restore dialog (locked - can't close by clicking outside)
    setIsRestoreDialogOpen(true)
    setIsEditDialogOpen(false)
    setIsAddDialogOpen(false)
    
    // Load teaching schedules and exam schedules if Teaching staff
    ;(async () => {
      try {
        const rows = await getTeachingSchedulesForEmployee(employee.employee_id)
        const mappedWithSubs = await Promise.all(rows.map(async (r: any) => {
          const scheduleRow: ScheduleRow = {
            tempId: `s-${r.schedule_id}`,
            schedule_id: r.schedule_id,
            day_of_week: r.day_of_week as any,
            time_start: formatDbTime12h(r.time_start),
            time_end: formatDbTime12h(r.time_end),
            subject_name: r.subject_name || '',
            room_code: r.room_code || '',
            section: r.section ? String(r.section).trim() : "",
            class_type: r.class_type || ''
          }
          return scheduleRow
        }))
        // Set schedules for restore dialog (these are used in the restore form)
        setScheduleRows(mappedWithSubs)
        
        const examRows = await getExamSchedulesForEmployee(employee.employee_id)
        const mappedExamRows = examRows.map((r: any) => ({
          tempId: `e-${r.exam_schedule_id}`,
          exam_schedule_id: r.exam_schedule_id,
          day_of_week: r.day_of_week as any,
          time_start: formatDbTime12h(r.time_start),
          time_end: formatDbTime12h(r.time_end),
          subject_name: r.subject_name || '',
          room_code: r.room_code || '',
          section: r.section || '',
          exam_date: r.exam_date || null,
          exam_type: r.exam_type || 'regular' // Requirement #17: Exam type segregation
        }))
        setExamScheduleRows(mappedExamRows)
      } catch {}
    })()
  }
  
  const handleConfirmRestore = async () => {
    if (!restoringEmployee) return
    
    try {
      setIsSubmitting(true)
      
      // Validate form data
      const errors: string[] = []
      const invalid = new Set<string>()
      
      if (!formData.full_name?.trim()) {
        errors.push('Full Name is required.')
        invalid.add('full_name')
      }
      if (!formData.school_id?.trim()) {
        errors.push('School ID is required.')
        invalid.add('school_id')
      }
      if (!formData.phone?.trim()) {
        errors.push('Phone Number is required.')
        invalid.add('phone')
      }
      if (!formData.staff_type?.trim()) {
        errors.push('Staff Type is required.')
        invalid.add('staff_type')
      }
      if (!formData.hire_date?.trim()) {
        errors.push('Hire Date is required.')
        invalid.add('hire_date')
      }
      if (!formData.start_date) {
        errors.push('Start Date is required.')
        invalid.add('start_date')
      }
      if (formData.staff_type === 'Non-Teaching' && (!formData.schedule_time_in || !formData.schedule_time_out)) {
        errors.push('Work Schedule is required for Non-Teaching staff.')
        invalid.add('schedule_time_in')
        invalid.add('schedule_time_out')
      }
      
      if (errors.length > 0) {
        setInvalidFields(invalid)
        setValidationErrors(errors)
        setShowValidationDialog(true)
        setIsSubmitting(false)
        return
      }
      
      // Format start_date and hire_date
      let formattedStartDate = formData.start_date
      let formattedHireDate = formData.hire_date
      
      try {
        if (formData.start_date) {
          const dateObj = new Date(formData.start_date + 'T00:00:00+08:00')
          formattedStartDate = format(dateObj, 'yyyy-MM-dd')
        }
      } catch {}
      
      try {
        if (formData.hire_date) {
          // Parse date string in local timezone to prevent UTC offset issues
          const dateStr = formData.hire_date.toString()
          if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            // Already in YYYY-MM-DD format, keep as is
            formattedHireDate = dateStr
          } else {
            // Parse and format to YYYY-MM-DD in local timezone
            const hireDateObj = new Date(dateStr)
            if (!isNaN(hireDateObj.getTime())) {
              const year = hireDateObj.getFullYear()
              const month = String(hireDateObj.getMonth() + 1).padStart(2, '0')
              const day = String(hireDateObj.getDate()).padStart(2, '0')
              formattedHireDate = `${year}-${month}-${day}`
            }
          }
        }
      } catch {}
      
      // Prepare update payload
      const payload: any = {
        full_name: formData.full_name.trim(),
        school_id: formData.school_id.trim(),
        rfid_code: formData.rfid_code?.trim() || null,
        department: formData.department || null,
        employment_status: formData.employment_status || null,
        staff_type: effectiveStaffType,
        email: formData.email?.trim() || null,
        phone: formData.phone?.trim() || null,
        password: formData.password?.trim() || null,
        schedule_time_in: formData.schedule_time_in || null,
        schedule_time_out: formData.schedule_time_out || null,
        hire_date: formattedHireDate || null,
        start_date: formattedStartDate, // Updated start_date
        photo_path: formData.photo_path || null,
        is_active: true // Restore employee (set to active)
      }
      
      // Update employee
      await updateEmployee(restoringEmployee.employee_id, payload)
      
      // Update schedules if Teaching staff
      // CRITICAL: All schedules and attendance logs are preserved when archiving
      // When restoring, all historical data is still accessible
      if (formData.staff_type === 'Teaching') {
        // Update teaching schedules (preserved from archive)
        for (const schedule of scheduleRows) {
          if (schedule.schedule_id) {
            // Note: This is a simplified restore - proper course_id and room_id
            // would need to be looked up from the schedule data
            await upsertTeachingSchedule({
              schedule_id: schedule.schedule_id,
              employee_id: restoringEmployee.employee_id,
              course_id: 1, // Default course - should be looked up
              room_id: 1, // Default room - should be looked up
              day_of_week: schedule.day_of_week,
              time_start: schedule.time_start,
              time_end: schedule.time_end,
              subject_name: schedule.subject_name,
              section: schedule.section,
              class_type: schedule.class_type
            })
          }
        }
        
        // Update exam schedules (preserved from archive)
        for (const exam of examScheduleRows) {
          if (exam.exam_schedule_id) {
            await upsertExamSchedule({
              exam_schedule_id: exam.exam_schedule_id,
              employee_id: restoringEmployee.employee_id,
              day_of_week: exam.day_of_week,
              time_start: exam.time_start,
              time_end: exam.time_end,
              subject_name: exam.subject_name,
              room_code: exam.room_code,
              section: exam.section,
              exam_date: exam.exam_date
            })
          }
        }
      }
      
      // Refresh list
      if (mutate) await mutate()
      
      // Close restore dialog
      setIsRestoreDialogOpen(false)
      setRestoringEmployee(null)
      
      toast({
        title: "Success",
        description: `${formData.full_name} has been restored successfully with updated information.`,
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to restore employee. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditEmployee = (employee: Employee) => {
    if (isTeachingScopedAdmin && ((employee as any).staff_type || '') === 'Non-Teaching') {
      toast({
        title: "Access restricted",
        description: "Your account is restricted to Teaching staff only.",
        variant: "destructive",
      })
      return
    }

    clearValidationState()
    setEditingEmployee(employee)
    
    // Normalize and enforce employment status based on staff type
    const staffType = ((employee as any).staff_type || effectiveStaffType) as 'Teaching' | 'Non-Teaching'
    let normalizedStatus = employee.employment_status || ''
    
    // Enforce employment status based on staff type
    if (staffType === 'Non-Teaching') {
      // Non-Teaching: Only "Regular" or "Provisionary"
      const nonTeachingOptions = ["Regular", "Provisionary"]
      if (!normalizedStatus || !nonTeachingOptions.includes(normalizedStatus)) {
        normalizedStatus = 'Regular' // Default for Non-Teaching
      }
    } else if (staffType === 'Teaching') {
      // Teaching: Only "Part Time" or "Part Time Full Load"
      const teachingOptions = ["Part Time", "Part Time Full Load"]
      if (!normalizedStatus || !teachingOptions.includes(normalizedStatus)) {
        normalizedStatus = 'Part Time' // Default for Teaching
      }
    }
    
    setFormData({
      full_name: employee.full_name,
      school_id: employee.school_id,
      rfid_code: employee.rfid_code,
      department: employee.department,
      employment_status: normalizedStatus,
      staff_type: effectiveStaffType as 'Teaching' | 'Non-Teaching',
      email: employee.email,
      phone: employee.phone,
      password: employee.password,
      schedule_time_in: employee.schedule_time_in,
      schedule_time_out: employee.schedule_time_out,
      hire_date: employee.hire_date,
      start_date: (employee as any).start_date || employee.hire_date, // Default to hire_date if start_date not set
      photo_path: (employee as any).photo_path || "",
      is_active: (employee as any).is_active ?? true,
      is_reporting_staff: (employee as any).is_reporting_staff || false,
      is_standby: (employee as any).is_standby || false
    })
    setIsEditDialogOpen(true)
    setIsAddDialogOpen(false)

    // Load teaching schedules and exam schedules if Teaching staff
    ;(async () => {
      try {
        const rows = await getTeachingSchedulesForEmployee(employee.employee_id)
        const mappedWithSubs = await Promise.all(rows.map(async (r: any) => {
          const scheduleRow: ScheduleRow = {
            tempId: `s-${r.schedule_id}`,
            schedule_id: r.schedule_id,
            day_of_week: r.day_of_week as any,
            time_start: formatDbTime12h(r.time_start),
            time_end: formatDbTime12h(r.time_end),
            subject_name: r.subject_name || '',
            subject_id: r.subject_id,
            class_type: r.class_type || '',
            section: r.section ? String(r.section).trim() : "",
            room_code: r.room_code || r.rooms?.code || "",
            substitute_employee_id: r.substitute_employee_id || null,
            unavailable_reason: r.unavailable_reason || null,
            status: r.status || null,
          }
          
          if (r.substitute_employee_id) {
            const subName = getEmployeeNameByIdLocal(r.substitute_employee_id)
            if (subName) {
              scheduleRow.substitute_employee_name = subName
            }
          }
          
          return scheduleRow
        }))
        setScheduleRows(mappedWithSubs)
      } catch {
        setScheduleRows([])
      }
      try {
        const examRows = await getExamSchedulesForEmployee(employee.employee_id)
        const examWithSubs = examRows.map((r: any) => {
          // Normalize exam_date to ensure it's in YYYY-MM-DD format
          let normalizedExamDate: string | null = null
          if (r.exam_date) {
            try {
              // If it's already in YYYY-MM-DD format, use it directly
              const dateStr = String(r.exam_date).trim()
              if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                normalizedExamDate = dateStr
              } else {
                // Try to parse and format it
                const dateObj = new Date(dateStr + 'T00:00:00')
                if (!isNaN(dateObj.getTime())) {
                  // Format back to YYYY-MM-DD
                  normalizedExamDate = dateObj.toISOString().split('T')[0]
                }
              }
            } catch {
              // If parsing fails, try to extract YYYY-MM-DD from the string
              const dateMatch = String(r.exam_date).match(/(\d{4}-\d{2}-\d{2})/)
              if (dateMatch) {
                normalizedExamDate = dateMatch[1]
              }
            }
          }
          
          return {
            tempId: `es-${r.exam_schedule_id}`,
            exam_schedule_id: r.exam_schedule_id,
            day_of_week: r.day_of_week as any,
            time_start: formatDbTime12h(r.time_start),
            time_end: formatDbTime12h(r.time_end),
            course_code: r.course_code || '',
            subject_name: r.subject_name || '',
            section: r.section || '',
            room_code: r.room_code || '',
            exam_date: normalizedExamDate, // Use normalized date
            status: r.status || 'available',
            substitute_employee_id: r.substitute_employee_id || null,
            substitute_employee_name: r.substitute_employee_name || null,
            unavailable_reason: r.unavailable_reason || '',
          }
        })
        
        setExamScheduleRows(examWithSubs)
      } catch {
        setExamScheduleRows([])
      }
    })()
  }

  const handleSubstituteExam = async (row: ExamScheduleRow) => {
    if (!viewEmployee && !editingEmployee) {
      toast({
        title: "Error",
        description: "Employee information not available",
        variant: "destructive",
      })
      return
    }

    const employee = viewEmployee || editingEmployee
    if (!employee) return

    try {
      // Use exam_date if available, otherwise calculate from day_of_week
      let requestedTime: string
      if (row.exam_date) {
        requestedTime = `${row.exam_date}T00:00:00`
      } else if (row.day_of_week) {
        // Calculate a date that falls on this day of week (next occurrence)
        const today = new Date()
        const currentDay = today.getDay() // 0=Sunday, 1=Monday, etc.
        // Convert to our format: 1=Monday, 2=Tuesday, ..., 6=Saturday
        const jsToScheduleDay = (jsDay: number) => jsDay === 0 ? null : jsDay
        let daysUntilSchedule = row.day_of_week - jsToScheduleDay(currentDay)!
        if (daysUntilSchedule <= 0) {
          daysUntilSchedule += 7 // Next week
        }
        const scheduleDate = new Date(today)
        scheduleDate.setDate(today.getDate() + daysUntilSchedule)
        const dateStr = scheduleDate.toISOString().split('T')[0]
        requestedTime = `${dateStr}T00:00:00`
      } else {
        toast({
          title: "Error",
          description: "Exam date or schedule day information not available",
          variant: "destructive",
        })
        return
      }

      // Create a leave verification request automatically
      const res = await fetch('/api/verification-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employee.employee_id,
          request_type: 'leave',
          requested_time: requestedTime,
          reason: `Substitute assignment filing for ${row.subject_name || 'exam'} on ${row.time_start || ''} - ${row.time_end || ''}`,
          requested_by: employee.employee_id,
          schedule_id: row.exam_schedule_id,
          schedule_type: 'exam',
        })
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to create verification request')
      }

      // Store the schedule info in sessionStorage to pass to verification page
      sessionStorage.setItem('pending_substitution', JSON.stringify({
        requestId: json.item?.request_id,
        scheduleType: 'exam',
        scheduleId: row.exam_schedule_id,
        employeeId: employee.employee_id,
      }))

      // Navigate to verification page
      router.push('/dashboard/verification')

      toast({
        title: "Redirecting to Verification",
        description: "A leave filing has been created. Please approve it to assign a substitute.",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to create verification request",
        variant: "destructive",
      })
    }
  }

  const handleSubstituteTeaching = async (row: ScheduleRow) => {
    if (!viewEmployee && !editingEmployee) {
      toast({
        title: "Error",
        description: "Employee information not available",
        variant: "destructive",
      })
      return
    }

    const employee = viewEmployee || editingEmployee
    if (!employee) return

    try {
      // Get the day of week for this schedule
      const dayOfWeek = row.day_of_week
      if (!dayOfWeek) {
        toast({
          title: "Error",
          description: "Schedule day information not available",
          variant: "destructive",
        })
        return
      }

      // Calculate a date that falls on this day of week (next occurrence)
      const today = new Date()
      const currentDay = today.getDay() // 0=Sunday, 1=Monday, etc.
      // Convert to our format: 1=Monday, 2=Tuesday, ..., 6=Saturday
      const jsToScheduleDay = (jsDay: number) => jsDay === 0 ? null : jsDay
      let daysUntilSchedule = dayOfWeek - jsToScheduleDay(currentDay)!
      if (daysUntilSchedule <= 0) {
        daysUntilSchedule += 7 // Next week
      }
      const scheduleDate = new Date(today)
      scheduleDate.setDate(today.getDate() + daysUntilSchedule)
      const dateStr = scheduleDate.toISOString().split('T')[0]
      const requestedTime = `${dateStr}T00:00:00`

      // Create a leave verification request automatically
      const res = await fetch('/api/verification-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employee.employee_id,
          request_type: 'leave',
          requested_time: requestedTime,
          reason: `Substitute assignment filing for ${row.subject_name || 'class'} on ${row.time_start || ''} - ${row.time_end || ''}`,
          requested_by: employee.employee_id,
          schedule_id: row.schedule_id,
          schedule_type: 'teaching',
        })
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to create verification request')
      }

      // Store the schedule info in sessionStorage to pass to verification page
      sessionStorage.setItem('pending_substitution', JSON.stringify({
        requestId: json.item?.request_id,
        scheduleType: 'teaching',
        scheduleId: row.schedule_id,
        employeeId: employee.employee_id,
      }))

      // Navigate to verification page
      router.push('/dashboard/verification')

      toast({
        title: "Redirecting to Verification",
        description: "A leave filing has been created. Please approve it to assign a substitute.",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to create verification request",
        variant: "destructive",
      })
    }
  }

  const handleSaveSubstitution = async () => {
    const selectedItem = substitutionType === 'exam' ? selectedExamForSubstitution : selectedTeachingForSubstitution
    const errors: string[] = []
    const invalidFieldsSet = new Set<string>()
    
    // Validate required fields
    if (!selectedItem) {
      errors.push("No schedule selected for substitution.")
    }
    
    if (!substitutionForm.substituteEmployeeId) {
      errors.push("Please select a substitute teacher.")
      invalidFieldsSet.add('substituteEmployeeId')
    }
    
    if (!substitutionForm.unavailableReason.trim()) {
      errors.push("Please provide a reason for unavailability.")
      invalidFieldsSet.add('unavailableReason')
    }
    
    // Validate that the substitute is not the same as the original employee
    if (substitutionForm.substituteEmployeeId) {
      const substituteEmployeeId = Number(substitutionForm.substituteEmployeeId)
      if (editingEmployee && substituteEmployeeId === editingEmployee.employee_id) {
        errors.push("An employee cannot be assigned as their own substitute. Please select a different teacher.")
        invalidFieldsSet.add('substituteEmployeeId')
      }
    }
    
    // Show validation dialog if there are errors
    if (errors.length > 0) {
      setSubstitutionValidationErrors(errors)
      setSubstitutionInvalidFields(invalidFieldsSet)
      setShowSubstitutionValidationDialog(true)
      return
    }
    
    // Clear validation errors if all checks pass
    setSubstitutionValidationErrors([])
    setSubstitutionInvalidFields(new Set())

    try {
      if (!editingEmployee) {
        toast({ 
          title: "Error", 
          description: "No employee selected",
          variant: "destructive" 
        })
        return
      }

      // Get current admin user from localStorage
      const userStr = localStorage.getItem('rams_user')
      const adminUser = userStr ? JSON.parse(userStr) : null

      if (substitutionType === 'exam') {
        const examRow = selectedItem as ExamScheduleRow
        if (examRow.exam_schedule_id) {
          // Update existing exam schedule with substitution
          await substituteExamSchedule(
            examRow.exam_schedule_id,
            Number(substitutionForm.substituteEmployeeId),
            substitutionForm.unavailableReason.trim(),
            substitutionForm.status,
            adminUser?.id
          )
        } else {
          // For new exams, update the row in state
          await upsertExamSchedule({
            exam_schedule_id: examRow.exam_schedule_id,
            employee_id: editingEmployee.employee_id,
            day_of_week: examRow.day_of_week,
            time_start: examRow.time_start,
            time_end: examRow.time_end,
            subject_name: examRow.subject_name,
            section: examRow.section,
            room_code: examRow.room_code,
            status: 'substituted',
            substitute_employee_id: Number(substitutionForm.substituteEmployeeId),
            unavailable_reason: substitutionForm.unavailableReason.trim(),
          })
        }

        // Refresh exam schedules
        const refreshed = await getExamSchedulesForEmployee(editingEmployee.employee_id)
        const examWithSubs = await Promise.all(refreshed.map(async (r) => {
          const examRow = {
            tempId: `es-${r.exam_schedule_id}`,
            exam_schedule_id: r.exam_schedule_id,
            day_of_week: r.day_of_week as any,
            time_start: formatDbTime12h(r.time_start),
            time_end: formatDbTime12h(r.time_end),
            course_code: r.course_code || '',
            subject_name: r.subject_name || '',
            section: r.section || '',
            room_code: r.room_code || '',
            exam_date: r.exam_date || null,
            status: r.status,
            substitute_employee_id: r.substitute_employee_id,
            unavailable_reason: r.unavailable_reason,
          }
          
          if (r.substitute_employee_id) {
            return { ...examRow, substitute_employee_name: getEmployeeNameByIdLocal(r.substitute_employee_id) || null }
          }
          return examRow
        }))
        setExamScheduleRows(examWithSubs)
      } else {
        const teachingRow = selectedItem as ScheduleRow
        if (teachingRow.schedule_id) {
          await substituteTeachingSchedule(
            teachingRow.schedule_id,
            Number(substitutionForm.substituteEmployeeId),
            substitutionForm.unavailableReason.trim(),
            substitutionForm.status,
            adminUser?.id
          )
        }

        // Refresh teaching schedules
        const refreshed = await getTeachingSchedulesForEmployee(editingEmployee.employee_id)
        const teachingWithSubs = await Promise.all(refreshed.map(async (r: any) => {
          const scheduleRow: ScheduleRow = {
            tempId: `s-${r.schedule_id}`,
            schedule_id: r.schedule_id,
            day_of_week: r.day_of_week as any,
            time_start: formatDbTime12h(r.time_start),
            time_end: formatDbTime12h(r.time_end),
            subject_name: r.subject_name || '',
            subject_id: r.subject_id,
            class_type: r.class_type || '',
            section: r.section ? String(r.section).trim() : "",
            room_code: r.room_code || r.rooms?.code || "",
            substitute_employee_id: r.substitute_employee_id || null,
            unavailable_reason: r.unavailable_reason || null,
            status: r.status || null,
          }
          
          if (r.substitute_employee_id) {
            const subName = getEmployeeNameByIdLocal(r.substitute_employee_id)
            if (subName) {
              scheduleRow.substitute_employee_name = subName
            }
          }
          
          return scheduleRow
        }))
        setScheduleRows(teachingWithSubs)
      }

      toast({ 
        title: "Success", 
        description: "Substitution assigned successfully" 
      })

      setIsSubstitutionDialogOpen(false)
      setSelectedExamForSubstitution(null)
      setSelectedTeachingForSubstitution(null)
      setSubstitutionForm({ substituteEmployeeId: '', unavailableReason: '', status: 'on-leave' })
    } catch (e: any) {
      toast({ 
        title: "Error", 
        description: e?.message || "Failed to assign substitution",
        variant: "destructive" 
      })
    }
  }

  const handleRemoveSubstitution = async (row: ExamScheduleRow) => {
    if (!row.exam_schedule_id) return

    try {
      await removeSubstitution(row.exam_schedule_id)
      toast({ title: "Success", description: "Substitution removed" })

      // Refresh exam schedules
      if (editingEmployee) {
        const refreshed = await getExamSchedulesForEmployee(editingEmployee.employee_id)
        const examWithSubs = await Promise.all(refreshed.map(async (r) => {
          const examRow = {
            tempId: `es-${r.exam_schedule_id}`,
            exam_schedule_id: r.exam_schedule_id,
            day_of_week: r.day_of_week as any,
            time_start: formatDbTime12h(r.time_start),
            time_end: formatDbTime12h(r.time_end),
            course_code: r.course_code || '',
            subject_name: r.subject_name || '',
            section: r.section || '',
            room_code: r.room_code || '',
            exam_date: r.exam_date || null,
            status: r.status,
            substitute_employee_id: r.substitute_employee_id,
            unavailable_reason: r.unavailable_reason,
          }
          
          if (r.substitute_employee_id) {
            return { ...examRow, substitute_employee_name: getEmployeeNameByIdLocal(r.substitute_employee_id) || null }
          }
          return examRow
        }))
        setExamScheduleRows(examWithSubs)
      }
    } catch (e: any) {
      toast({ 
        title: "Error", 
        description: e?.message || "Failed to remove substitution",
        variant: "destructive" 
      })
    }
  }

  const handleRemoveTeachingSubstitution = async (row: ScheduleRow) => {
    if (!row.schedule_id) return

    try {
      await removeTeachingSubstitution(row.schedule_id)
      toast({ title: "Success", description: "Substitution removed" })

      // Refresh teaching schedules
      if (editingEmployee) {
        const refreshed = await getTeachingSchedulesForEmployee(editingEmployee.employee_id)
        const teachingWithSubs = await Promise.all(refreshed.map(async (r: any) => {
          const scheduleRow: ScheduleRow = {
            tempId: `s-${r.schedule_id}`,
            schedule_id: r.schedule_id,
            day_of_week: r.day_of_week as any,
            time_start: formatDbTime12h(r.time_start),
            time_end: formatDbTime12h(r.time_end),
            subject_name: r.subject_name || '',
            subject_id: r.subject_id,
            class_type: r.class_type || '',
            section: r.section ? String(r.section).trim() : "",
            room_code: r.room_code || r.rooms?.code || "",
            substitute_employee_id: r.substitute_employee_id || null,
            unavailable_reason: r.unavailable_reason || null,
            status: r.status || null,
          }
          
          if (r.substitute_employee_id) {
            const subName = getEmployeeNameByIdLocal(r.substitute_employee_id)
            if (subName) {
              scheduleRow.substitute_employee_name = subName
            }
          }
          
          return scheduleRow
        }))
        setScheduleRows(teachingWithSubs)
      }
    } catch (e: any) {
      toast({ 
        title: "Error", 
        description: e?.message || "Failed to remove substitution",
        variant: "destructive" 
      })
    }
  }

  const handleUpdateEmployee = async () => {
    if (!editingEmployee) return

    // Validate required fields
    // For Non-Teaching staff, employment_status is not required
    const requiredFields = ['full_name', 'school_id', 'rfid_code', 'department', 'email', 'phone', 'staff_type', 'hire_date', 'start_date']
    if (formData.staff_type === 'Teaching') {
      requiredFields.push('employment_status')
    }
    if (formData.staff_type === 'Non-Teaching') {
      requiredFields.push('schedule_time_in', 'schedule_time_out')
    }
    const missingFields = requiredFields.filter(field => !formData[field as keyof typeof formData])
    
    if (missingFields.length > 0) {
      const pretty = missingFields.map((f) => {
        if (f === 'full_name') return 'No Employee Name. Please input a value.'
        if (f === 'school_id') return 'No School ID. Please input a value.'
        if (f === 'rfid_code') return 'No RFID Code. Please input a value.'
        if (f === 'department') return 'No Department. Please select a value.'
        if (f === 'employment_status') return 'No Employment Status. Please select a value.'
        if (f === 'email') return 'No Email Address. Please input a value.'
        if (f === 'schedule_time_in' || f === 'schedule_time_out') return 'No Work Schedule. Please select a work schedule.'
        return `${f} is required`
      })
      setValidationErrors(Array.from(new Set(pretty)))
      setInvalidFields(new Set(missingFields))
      setShowValidationDialog(true)
      return
    }

    try {
      // Basic format validations (field-level)
      const { errors, invalid } = validateEmployeeForm(formData)
      if (errors.length > 0) {
        setValidationErrors(errors)
        setInvalidFields(invalid)
        setShowValidationDialog(true)
        return
      }
      setInvalidFields(new Set())
      // Duplicate checks against live database (exclude current employee)
      const dup = await checkDuplicateConflictsServer(formData, 'edit', editingEmployee.employee_id)
      if (dup.errors.length > 0) {
        setValidationErrors(dup.errors)
        setInvalidFields(dup.invalid)
        setShowValidationDialog(true)
        setIsSubmitting(false)
        return
      }
      // Keep alphanumeric Employee ID (T/N codes) intact
      const employeeIdUpper = (formData.school_id || '').toString().trim().toUpperCase()
      const rfidSanitized = (formData.rfid_code || '').replace(/\D+/g, '').slice(0, 10)

      setIsSubmitting(true)
      const phoneSanitized = (formData.phone || '').replace(/\D+/g, '').slice(0, 11)
      // Ensure dates are in YYYY-MM-DD format for database
      let formattedStartDate = formData.start_date
      let formattedHireDate = formData.hire_date
      
      if (formattedStartDate) {
        try {
          // Parse date string in local timezone to prevent UTC offset issues
          const dateStr = formattedStartDate.toString()
          if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            // Already in YYYY-MM-DD format, keep as is
            formattedStartDate = dateStr
          } else {
            // Parse and format to YYYY-MM-DD in local timezone
            const startDateObj = new Date(dateStr)
            if (!isNaN(startDateObj.getTime())) {
              const year = startDateObj.getFullYear()
              const month = String(startDateObj.getMonth() + 1).padStart(2, '0')
              const day = String(startDateObj.getDate()).padStart(2, '0')
              formattedStartDate = `${year}-${month}-${day}`
            }
          }
        } catch {}
      }
      if (formattedHireDate) {
        try {
          // Parse date string in local timezone to prevent UTC offset issues
          const dateStr = formattedHireDate.toString()
          if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            // Already in YYYY-MM-DD format, keep as is
            formattedHireDate = dateStr
          } else {
            // Parse and format to YYYY-MM-DD in local timezone
            const hireDateObj = new Date(dateStr)
            if (!isNaN(hireDateObj.getTime())) {
              const year = hireDateObj.getFullYear()
              const month = String(hireDateObj.getMonth() + 1).padStart(2, '0')
              const day = String(hireDateObj.getDate()).padStart(2, '0')
              formattedHireDate = `${year}-${month}-${day}`
            }
          }
        } catch {}
      }
      
      const payload: any = {
        ...formData,
        rfid_code: rfidSanitized,
        school_id: employeeIdUpper,
        email: formData.email.trim(),
        phone: phoneSanitized,
        start_date: formattedStartDate, // Explicitly set formatted date
        hire_date: formattedHireDate || null,
        is_reporting_staff: false,
      }
      
      // Enforce employment status based on staff type
      if (formData.staff_type === 'Non-Teaching') {
        // Non-Teaching: Only "Regular" or "Provisionary"
        const nonTeachingOptions = ["Regular", "Provisionary"]
        if (!payload.employment_status || !nonTeachingOptions.includes(payload.employment_status)) {
          payload.employment_status = 'Regular' // Default for Non-Teaching
        }
      } else if (formData.staff_type === 'Teaching') {
        // Teaching: "Part Time", "Part Time Full Load", or "Regular"
        const teachingOptions = ["Part Time", "Part Time Full Load", "Regular"]
        if (!payload.employment_status || !teachingOptions.includes(payload.employment_status)) {
          payload.employment_status = 'Part Time' // Default for Teaching
        }
      }

      const previousEmploymentStatus = String((editingEmployee as any)?.employment_status || '')
      const nextEmploymentStatus = String(payload.employment_status || '')

      // Teaching staff schedule is derived from class/exam schedules (no fixed admin-time window).
      if (payload.staff_type === 'Teaching') {
        payload.schedule_time_in = null
        payload.schedule_time_out = null
      }
      // Part Time employees should not carry admin-time windows.
      else if (nextEmploymentStatus === 'Part Time') {
        payload.schedule_time_in = null
        payload.schedule_time_out = null
      }

      // CRITICAL: Handle photo_path properly - upload if new, keep existing, or set to null if removed
      if (formData.photo_path === null || formData.photo_path === undefined || formData.photo_path === '') {
        // Photo was removed - explicitly set to null
        payload.photo_path = null
      } else if (typeof formData.photo_path === 'string' && formData.photo_path.startsWith('data:image')) {
        // New photo uploaded - upload it and replace with public URL
        try {
          const url = await uploadPhotoDataUrl(formData.photo_path, String(editingEmployee.employee_id))
          if (!url) {
            toast({
              title: "Warning",
              description: "Photo upload failed, but employee will be updated without photo change. You can try again later.",
              variant: "default"
            })
            payload.photo_path = editingEmployee.photo_path || ''
          } else {
            payload.photo_path = url
          }
        } catch (error: any) {
          toast({
            title: "Warning",
            description: error?.message || "Photo upload failed, but employee will be updated without photo change. You can try again later.",
            variant: "default"
          })
          // Keep existing photo if upload fails
          payload.photo_path = editingEmployee.photo_path || ''
        }
      } else {
        // Photo is an existing URL - keep it as is
        payload.photo_path = formData.photo_path
      }

      const fieldsToCheck: Array<keyof typeof payload> = [
        'full_name','school_id','rfid_code','department','employment_status','email','phone','photo_path','staff_type','start_date','hire_date','schedule_time_in','schedule_time_out','is_active','is_reporting_staff','is_standby'
      ]
      const changedFields = fieldsToCheck.filter((k) => {
        // Special handling for photo_path to compare null properly
        if (k === 'photo_path') {
          const payloadPhoto = payload[k] === null ? null : (payload[k] || '').toString()
          const employeePhoto = ((editingEmployee as any)[k] === null || (editingEmployee as any)[k] === undefined) ? null : ((editingEmployee as any)[k] || '').toString()
          return payloadPhoto !== employeePhoto
        }
        // Boolean fields: compare as booleans, not strings
        if (k === 'is_active' || k === 'is_reporting_staff' || k === 'is_standby') {
          const payloadVal = !!payload[k]
          const employeeVal = !!(editingEmployee as any)[k]
          return payloadVal !== employeeVal
        }
        const payloadValue = (payload[k] || '').toString()
        const employeeValue = ((editingEmployee as any)[k] || '').toString()
        return payloadValue !== employeeValue
      })

      const isPtflToPt = previousEmploymentStatus === 'Part Time Full Load' && nextEmploymentStatus === 'Part Time'
      const isPtToPtfl = previousEmploymentStatus === 'Part Time' && nextEmploymentStatus === 'Part Time Full Load'
      const isChangingToRegular = previousEmploymentStatus !== 'Regular' && nextEmploymentStatus === 'Regular'

      if (
        (isPtflToPt || isPtToPtfl || isChangingToRegular) &&
        !skipEmploymentTransitionPrompt &&
        payload.staff_type === 'Non-Teaching'
      ) {
        if (isPtflToPt) {
          setEmploymentTransitionMessage('This employee will be transferred from Part Time Full Load to Part Time. Regular Schedule is no longer required for this employee.')
        } else if (isPtToPtfl) {
          setEmploymentTransitionMessage('This employee will be transferred from Part Time to Part Time Full Load. Regular Schedule can now be configured for this employee.')
        } else {
          setEmploymentTransitionMessage('This employee will be set to Regular. Regular employees use Regular Schedule and should no longer keep class and exam schedules.')
        }
        setEmploymentTransitionDialogOpen(true)
        setIsSubmitting(false)
        return
      }

      if (skipEmploymentTransitionPrompt) {
        setSkipEmploymentTransitionPrompt(false)
      }
      
      if (changedFields.length === 0) {
        toast({ title: 'Saved!', description: 'No changes have been made.' })
        setIsSubmitting(false)
        // Close dialog immediately when nothing changed
        setIsEditDialogOpen(false)
        setEditingEmployee(null)
        resetForm()
        return
      }

      let updatedEmployee
      try {
        updatedEmployee = await updateEmployee(editingEmployee.employee_id, payload)
      } catch (error: any) {
        const errorMessage = error?.message || error?.error || "Unknown error"
        
        // Check for specific error types - improved error message formatting
        if (errorMessage.includes('duplicate') || errorMessage.includes('already exists') || errorMessage.includes('already in use') || errorMessage.includes('unique constraint')) {
          // Parse database constraint errors
          let formattedError = errorMessage
          if (errorMessage.includes('employees_rfid_code_key')) {
            formattedError = `RFID Code is already in use by another employee. Please use a different RFID Code.`
            setInvalidFields(new Set(['rfid_code']))
          } else if (errorMessage.includes('employees_school_id_key') || errorMessage.includes('school_id')) {
            formattedError = `School ID is already in use by another employee. Please use a different School ID.`
            setInvalidFields(new Set(['school_id']))
          } else if (errorMessage.includes('employees_email_key') || errorMessage.includes('email')) {
            formattedError = `Email address is already registered to another employee. Please use a different email address.`
            setInvalidFields(new Set(['email']))
          } else if (errorMessage.toLowerCase().includes('phone')) {
            formattedError = `Phone number is already registered to another employee. Please use a different phone number.`
            setInvalidFields(new Set(['phone']))
          } else if (errorMessage.toLowerCase().includes('full name') || errorMessage.toLowerCase().includes('employee name')) {
            formattedError = `An employee with this full name already exists. Please review the name and try again.`
            setInvalidFields(new Set(['full_name']))
          } else if (errorMessage.includes('School ID')) {
            setInvalidFields(new Set(['school_id']))
          } else if (errorMessage.includes('RFID')) {
            setInvalidFields(new Set(['rfid_code']))
          } else if (errorMessage.includes('Email') || errorMessage.includes('email')) {
            setInvalidFields(new Set(['email']))
          } else if (errorMessage.toLowerCase().includes('phone')) {
            setInvalidFields(new Set(['phone']))
          } else if (errorMessage.toLowerCase().includes('name')) {
            setInvalidFields(new Set(['full_name']))
          }
          
          setValidationErrors([formattedError])
          setShowValidationDialog(true)
          return
        }
        
        toast({
          title: "Error",
          description: errorMessage || "Failed to update employee. Please check all fields and try again.",
          variant: "destructive",
        })
        return
      }

      // Verify persistence: compare returned row vs desired payload
      if (updatedEmployee) {
        const persisted = fieldsToCheck.every((k) => {
          const a = ((updatedEmployee as any)[k] || '').toString()
          const b = ((payload as any)[k] || '').toString()
          // For date fields, normalize format for comparison
          if (k === 'start_date' || k === 'hire_date') {
            const aDate = a ? new Date(a).toISOString().split('T')[0] : ''
            const bDate = b ? new Date(b).toISOString().split('T')[0] : ''
            return aDate === bDate
          }
          return a === b || (k === 'photo_path' && (a.endsWith(b) || b.endsWith(a)))
        })
        if (persisted) {
          toast({ title: 'Success', description: `${updatedEmployee.full_name} has been successfully updated.` })
        } else {
          toast({ title: 'Warning', description: 'Some changes may not have been saved. Please verify values or permissions.' })
        }

        // Regular employees should not keep class/exam schedules.
        if (previousEmploymentStatus !== 'Regular' && nextEmploymentStatus === 'Regular') {
          try {
            const [teachingRows, examRows] = await Promise.all([
              getTeachingSchedulesForEmployee(editingEmployee.employee_id),
              getExamSchedulesForEmployee(editingEmployee.employee_id),
            ])

            for (const row of teachingRows || []) {
              if (row?.schedule_id) {
                await deleteTeachingSchedule(row.schedule_id)
              }
            }
            for (const row of examRows || []) {
              if (row?.exam_schedule_id) {
                await deleteExamSchedule(row.exam_schedule_id)
              }
            }

            toast({
              title: 'Regular schedule mode applied',
              description: 'Class and exam schedules were removed. This employee now follows Regular Schedule only.',
            })
          } catch (cleanupError: any) {
            toast({
              title: 'Regular mode warning',
              description: cleanupError?.message || 'Employee was updated, but schedule cleanup needs manual review.',
              variant: 'destructive',
            })
          }
        }
      }

      // Refresh list from server to keep cache consistent and update counts
      try {
        if (mutate) await mutate()
      } catch {
        // Don't block success message if refresh fails
      }
      
      // Trigger real-time refresh of attendance data when start_date changes
      // This ensures all attendance-related pages update immediately
      if (changedFields.includes('start_date')) {
        // Use a small delay to ensure database update completes
        setTimeout(() => {
          // Trigger a page refresh notification via custom event
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('employee-start-date-changed', {
              detail: { employeeId: editingEmployee.employee_id }
            }))
          }
        }, 500)
      }
      
      // Show success message with reminder about attendance impact
      if (changedFields.includes('start_date')) {
        toast({
          title: 'Start date updated',
          description: 'Attendance records will be recalculated. Employees will not be marked absent until the day after their start date.',
          variant: 'default'
        })
      }
      
      setIsEditDialogOpen(false)
      setEditingEmployee(null)
      resetForm()
    } catch (error) {
      toast({
        title: "Error",
        description: (error instanceof Error && error.message) ? error.message : "Failed to update employee. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Helper function to format error messages for better readability
  const formatErrorMessage = (error: string): { field: string; message: string; icon: string } => {
    // Map common error patterns to user-friendly messages
    if (error.toLowerCase().includes('rfid') || error.toLowerCase().includes('rfid_code')) {
      if (error.toLowerCase().includes('duplicate') || error.toLowerCase().includes('already exists') || error.toLowerCase().includes('already in use')) {
        // Extract employee name if available
        const match = error.match(/already exists:?\s*([^(]+)/i) || error.match(/already in use by\s+([^(]+)/i)
        const employeeName = match ? match[1].trim() : 'another employee'
        return {
          field: 'RFID Code',
          message: `This RFID Code is already assigned to ${employeeName}. Please use a different RFID Code.`,
          icon: '🔑'
        }
      }
      if (error.toLowerCase().includes('no rfid') || error.toLowerCase().includes('required')) {
        return {
          field: 'RFID Code',
          message: 'RFID Code is required. Please enter a valid 10-digit RFID code.',
          icon: '🔑'
        }
      }
      if (error.toLowerCase().includes('must be 10 digits')) {
        return {
          field: 'RFID Code',
          message: 'RFID Code must be exactly 10 digits (e.g., 1234567890).',
          icon: '🔑'
        }
      }
    }
    
    if (error.toLowerCase().includes('school id') || error.toLowerCase().includes('school_id')) {
      if (error.toLowerCase().includes('duplicate') || error.toLowerCase().includes('already exists') || error.toLowerCase().includes('already in use')) {
        const match = error.match(/already exists:?\s*([^(]+)/i) || error.match(/already in use by\s+([^(]+)/i)
        const employeeName = match ? match[1].trim() : 'another employee'
        return {
          field: 'School ID',
          message: `This School ID is already assigned to ${employeeName}. Please use a different School ID.`,
          icon: '🆔'
        }
      }
      if (error.toLowerCase().includes('no school') || error.toLowerCase().includes('required')) {
        return {
          field: 'School ID',
          message: 'School ID is required. Please enter a valid 11-digit School ID starting with 07.',
          icon: '🆔'
        }
      }
      if (error.toLowerCase().includes('must start with 07') || error.toLowerCase().includes('11 digits')) {
        return {
          field: 'School ID',
          message: 'School ID must start with 07 and be exactly 11 digits (e.g., 07123456789).',
          icon: '🆔'
        }
      }
    }
    
    if (error.toLowerCase().includes('email')) {
      if (error.toLowerCase().includes('duplicate') || error.toLowerCase().includes('already exists')) {
        const match = error.match(/already exists:?\s*([^(]+)/i)
        const employeeName = match ? match[1].trim() : 'another employee'
        return {
          field: 'Email',
          message: `This email address is already registered to ${employeeName}. Please use a different email address.`,
          icon: '📧'
        }
      }
      if (error.toLowerCase().includes('invalid') || error.toLowerCase().includes('format')) {
        return {
          field: 'Email',
          message: 'Please enter a valid email address (e.g., name@example.com).',
          icon: '📧'
        }
      }
      if (error.toLowerCase().includes('no email') || error.toLowerCase().includes('required')) {
        return {
          field: 'Email',
          message: 'Email address is required. Please enter a valid email address.',
          icon: '📧'
        }
      }
    }
    
    if (error.toLowerCase().includes('phone')) {
      if (error.toLowerCase().includes('duplicate') || error.toLowerCase().includes('already exists')) {
        const match = error.match(/already exists:?\s*([^(]+)/i)
        const employeeName = match ? match[1].trim() : 'another employee'
        return {
          field: 'Phone',
          message: `This phone number is already registered to ${employeeName}. Please use a different phone number.`,
          icon: '📱'
        }
      }
      if (error.toLowerCase().includes('must be 11 digits') || error.toLowerCase().includes('starting with 09')) {
        return {
          field: 'Phone',
          message: 'Phone number must be exactly 11 digits starting with 09 (e.g., 09123456789).',
          icon: '📱'
        }
      }
    }
    
    if (error.toLowerCase().includes('full name') || error.toLowerCase().includes('employee name')) {
      if (error.toLowerCase().includes('duplicate') || error.toLowerCase().includes('already exists')) {
        return {
          field: 'Full Name',
          message: 'An employee with this name already exists. Please use a different name or add a middle initial.',
          icon: '👤'
        }
      }
      if (error.toLowerCase().includes('required') || error.toLowerCase().includes('no employee name')) {
        return {
          field: 'Full Name',
          message: 'Employee name is required. Please enter the full name of the employee.',
          icon: '👤'
        }
      }
    }
    
    if (error.toLowerCase().includes('start date')) {
      if (error.toLowerCase().includes('required')) {
        return {
          field: 'Start Date',
          message: 'Start Date is required. Please select a start date for the employee.',
          icon: '📅'
        }
      }
      if (error.toLowerCase().includes('future') || error.toLowerCase().includes('more than 1 year')) {
        return {
          field: 'Start Date',
          message: 'Start date cannot be more than 1 year in the future. Please select a valid date.',
          icon: '📅'
        }
      }
    }
    
    if (error.toLowerCase().includes('department')) {
      return {
        field: 'Department',
        message: 'Department is required. Please select a department for the employee.',
        icon: '🏢'
      }
    }
    
    if (error.toLowerCase().includes('employment status')) {
      return {
        field: 'Employment Status',
        message: 'Employment Status is required for Teaching staff. Please select an employment status.',
        icon: '💼'
      }
    }
    
    // Default formatting for unknown errors
    return {
      field: 'Validation Error',
      message: error,
      icon: '⚠️'
    }
  }

  // Validation dialog UI - Improved with better formatting and icons
  const ValidationDialog = (
    <AlertDialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <span className="text-2xl">⚠️</span>
            </div>
            <div className="flex-1">
              <AlertDialogTitle className="text-xl">Validation Error</AlertDialogTitle>
              <AlertDialogDescription className="text-base mt-1">
                Please fix the following errors before saving.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">
          {validationErrors.map((err, idx) => {
            const formatted = formatErrorMessage(err)
            return (
              <div key={idx} className="flex items-start gap-3 p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
                <span className="text-xl mt-0.5">{formatted.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-red-900 dark:text-red-200 text-sm mb-1">
                    {formatted.field}
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {formatted.message}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
        <AlertDialogFooter className="mt-4">
          <AlertDialogAction 
            onClick={() => {
              setShowValidationDialog(false)
              // Focus on first invalid field if available
              if (invalidFields.size > 0) {
                const firstField = Array.from(invalidFields)[0]
                const fieldElement = document.querySelector(`[name="${firstField}"], #${firstField}`) as HTMLElement
                if (fieldElement) {
                  setTimeout(() => {
                    fieldElement.focus()
                    fieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }, 100)
                }
              }
            }}
            className="w-full sm:w-auto"
          >
            Got it
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  // Substitution validation dialog UI
  const SubstitutionValidationDialog = (
    <AlertDialog open={showSubstitutionValidationDialog} onOpenChange={setShowSubstitutionValidationDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Substitution Validation Error</AlertDialogTitle>
          <AlertDialogDescription>
            Please fix the following errors before saving the substitution.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="mt-2 space-y-1 text-left">
          {substitutionValidationErrors.map((err, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="mt-1 h-2 w-2 rounded-full bg-destructive" />
              <span>{err}</span>
            </div>
          ))}
        </div>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => setShowSubstitutionValidationDialog(false)}>Got it</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  // Time validation helper
  const validateTimeFormat = (time: string): boolean => {
    // Strict AM/PM format only
    const timeRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM)$/i
    return timeRegex.test(time.trim())
  }

  const validateTimeRange = (startTime: string, endTime: string): boolean => {
    if (!validateTimeFormat(startTime) || !validateTimeFormat(endTime)) {
      return false
    }

    // Convert to 24-hour format for comparison
    const start24 = convertTo24Hour(startTime)
    const end24 = convertTo24Hour(endTime)
    
    return start24 < end24
  }

  const convertTo24Hour = (time: string): number => {
    const [timePart, period] = time.split(/\s+(AM|PM)/i)
    const [hours, minutes] = timePart.split(':').map(Number)
    
    let hour24 = hours
    if (period?.toUpperCase() === 'PM' && hours !== 12) {
      hour24 += 12
    } else if (period?.toUpperCase() === 'AM' && hours === 12) {
      hour24 = 0
    }
    
    return hour24 * 60 + minutes // Return minutes since midnight
  }

  const validateAllScheduleTimes = (): { isValid: boolean; errors: string[] } => {
    const errors: string[] = []
    
    scheduleRows.forEach((row, index) => {
      if (!validateTimeFormat(row.time_start)) {
        errors.push(`Row ${index + 1}: Invalid start time format`)
      }
      if (!validateTimeFormat(row.time_end)) {
        errors.push(`Row ${index + 1}: Invalid end time format`)
      }
      if (!validateTimeRange(row.time_start, row.time_end)) {
        errors.push(`Row ${index + 1}: End time must be after start time`)
      }
    })
    
    return { isValid: errors.length === 0, errors }
  }

  // Teaching schedule helpers
  const addScheduleRow = () => {
    setScheduleRows(prev => ([...prev, { 
      tempId: crypto.randomUUID(), 
      day_of_week: 1, 
      time_start: "07:00 AM", 
      time_end: "09:00 PM", 
      subject_name: "", 
      subject_id: undefined,
      course_code: "", 
      section: "",
      room_code: "" 
    }]))
    
    // Auto-scroll to bottom after adding row
    setTimeout(() => {
      if (scheduleListRef.current) {
        scheduleListRef.current.scrollTo({
          top: scheduleListRef.current.scrollHeight,
          behavior: 'smooth'
        })
      }
    }, 100)
  }

  type ExamScheduleRow = {
    tempId: string
    exam_schedule_id?: number
    day_of_week: 1 | 2 | 3 | 4 | 5 | 6
    time_start: string
    time_end: string
    subject_name: string
    section: string
    room_code: string
    exam_date?: string | null // Specific date when exam is scheduled (YYYY-MM-DD format). If null, follows weekly schedule
    substitute_employee_id?: number | null
    unavailable_reason?: string | null
    status?: 'on-leave' | 'absent' | 'unavailable' | 'substituted' | 'available' | null
  }

  const addExamScheduleRow = () => {
    setExamScheduleRows(prev => ([...prev, { 
      tempId: crypto.randomUUID(), 
      day_of_week: 5, 
      time_start: "07:00 AM", 
      time_end: "09:00 PM", 
      subject_name: "", 
      section: "",
      room_code: "",
      exam_date: '' // Default to empty string (must be set by user)
    }]))
    
    // Auto-scroll to bottom after adding row
    setTimeout(() => {
      if (examScheduleListRef.current) {
        examScheduleListRef.current.scrollTo({
          top: examScheduleListRef.current.scrollHeight,
          behavior: 'smooth'
        })
      }
    }, 100)
  }

  const updateExamScheduleField = (id: string, field: keyof ExamScheduleRow, value: any) => {
    setExamScheduleRows(prev => prev.map(r => r.tempId === id ? { ...r, [field]: value } : r))
  }

  const removeExamScheduleRow = async (row: ExamScheduleRow) => {
    try {
      // Build descriptive message about what's being removed
      const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const dayName = dayNames[row.day_of_week] || `Day ${row.day_of_week}`
      const subjectName = row.subject_name || 'Untitled Exam'
      const timeRange = `${row.time_start} - ${row.time_end}`
      const sectionInfo = row.section && row.section.trim() ? row.section.trim() : ''
      const roomInfo = row.room_code || ''
      
      if (row.exam_schedule_id) {
        await deleteExamSchedule(row.exam_schedule_id)
      }
      
      // Remove from local state
      setExamScheduleRows(prev => prev.filter(r => r.tempId !== row.tempId))
      
      // Show dialog with specific details about what was removed
      setRemovedScheduleDetails({
        type: 'exam',
        subjectName,
        section: sectionInfo,
        dayName,
        timeRange,
        roomCode: roomInfo
      })
      setScheduleRemovedDialogOpen(true)
      
      // Refresh schedule display in employee directory in real-time
      if (editingEmployee) {
        await refreshScheduleDisplay(editingEmployee.employee_id)
      }
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to delete exam schedule", variant: "destructive" })
    }
  }

  const saveAllExamSchedules = async (): Promise<boolean> => {
    const hasEditingEmployee = !!editingEmployee
    try {
      setIsSavingExamSchedule(true)
      const errors: string[] = []
      let nonEmptyRowCount = 0
      
      examScheduleRows.forEach((row, idx) => {
        const rowNum = idx + 1
        const hasAny = (row.section?.trim() || row.subject_name?.trim() || row.room_code?.trim() || row.time_start?.trim() || row.time_end?.trim())
        if (hasAny) nonEmptyRowCount++
        if (!hasAny) return
        
        // Section validation - REQUIRED field
        // Section must be provided and have at least 2 characters
        const sectionValue = (row.section || '').trim()
        if (!sectionValue || sectionValue.length === 0) {
          errors.push(`Exam Schedule #${rowNum}: Section is required`)
        } else if (sectionValue.length < 2) {
          errors.push(`Exam Schedule #${rowNum}: Section must be at least 2 characters`)
        }
        
        // Subject Name validation
        if (!row.subject_name || row.subject_name.trim().length < 3) {
          errors.push(`Exam Schedule #${rowNum}: Subject name is required (minimum 3 characters)`)
        }
        
        // Room Code validation
        // Check if room_code exists and has actual content (not just whitespace or empty)
        const roomCodeValue = (row.room_code || '').trim()
        if (!roomCodeValue || roomCodeValue.length === 0) {
          errors.push(`Exam Schedule #${rowNum}: Room code is required`)
        } else if (roomCodeValue.length < 2) {
          errors.push(`Exam Schedule #${rowNum}: Room code must be at least 2 characters`)
        }
        
        // Exam date validation - REQUIRED
        if (!row.exam_date || (row.exam_date || '').trim() === '') {
          errors.push(`Exam Schedule #${rowNum}: Exam date is required. Please select a specific date for this exam.`)
        } else {
          // Validate that exam_date is a valid date format (YYYY-MM-DD)
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/
          const examDateStr = (row.exam_date || '').trim()
          if (!dateRegex.test(examDateStr)) {
            errors.push(`Exam Schedule #${rowNum}: Exam date must be in YYYY-MM-DD format`)
          } else {
            // Validate that the date is not in the past
            try {
              const examDate = new Date(examDateStr + 'T00:00:00')
              const today = new Date()
              today.setHours(0, 0, 0, 0)
              if (examDate < today) {
                errors.push(`Exam Schedule #${rowNum}: Exam date cannot be in the past`)
              }
            } catch {
              errors.push(`Exam Schedule #${rowNum}: Invalid exam date format`)
            }
          }
        }
        
        // Time format validation
        if (!validateTimeFormat(row.time_start)) {
          errors.push(`Exam Schedule #${rowNum}: Invalid start time format. Use format: 07:00 AM`)
        }
        if (!validateTimeFormat(row.time_end)) {
          errors.push(`Exam Schedule #${rowNum}: Invalid end time format. Use format: 09:00 PM`)
        }
        
        // Time range validation
        if (validateTimeFormat(row.time_start) && validateTimeFormat(row.time_end)) {
          if (!validateTimeRange(row.time_start, row.time_end)) {
            errors.push(`Exam Schedule #${rowNum}: End time must be after start time`)
          }
          
          // Check time range (7:00 AM - 9:00 PM)
          const startMinutes = timeToMinutes(row.time_start)
          const endMinutes = timeToMinutes(row.time_end)
          const sevenAM = 7 * 60
          const ninePM = 21 * 60
          
          if (startMinutes !== null && (startMinutes < sevenAM || startMinutes > ninePM)) {
            errors.push(`Exam Schedule #${rowNum}: Start time must be between 7:00 AM and 9:00 PM`)
          }
          if (endMinutes !== null && (endMinutes < sevenAM || endMinutes > ninePM)) {
            errors.push(`Exam Schedule #${rowNum}: End time must be between 7:00 AM and 9:00 PM`)
          }
          
          // Check for time conflicts with other schedules on the same day
          if (startMinutes !== null && endMinutes !== null) {
            const conflictingRow = examScheduleRows.find((otherRow, otherIdx) => {
              // Skip self and empty rows
              if (idx === otherIdx) return false
              
              const otherHasAny = (otherRow.section?.trim() || otherRow.subject_name?.trim() || otherRow.room_code?.trim() || otherRow.time_start?.trim() || otherRow.time_end?.trim())
              if (!otherHasAny) return false
              
              // Only check same day
              if (otherRow.day_of_week !== row.day_of_week) return false
              
              // Skip if the other row doesn't have valid times
              if (!validateTimeFormat(otherRow.time_start) || !validateTimeFormat(otherRow.time_end)) {
                return false
              }
              
              const otherStart = timeToMinutes(otherRow.time_start)
              const otherEnd = timeToMinutes(otherRow.time_end)
              
              if (otherStart === null || otherEnd === null) return false
              
              // Check if time ranges overlap: start1 < end2 AND start2 < end1
              return startMinutes < otherEnd && otherStart < endMinutes
            })
            
            if (conflictingRow) {
              const otherRowNum = examScheduleRows.indexOf(conflictingRow) + 1
              errors.push(`Exam Schedule #${rowNum}: Conflicting time! This schedule overlaps with Exam Schedule #${otherRowNum} on the same day (${conflictingRow.time_start} - ${conflictingRow.time_end}). Please choose a different time range.`)
            }
          }
        }
      })
      
      if (nonEmptyRowCount === 0) {
        setIsSavingExamSchedule(false)
        return true // Allow closing if nothing to save
      }
      
      if (errors.length > 0) {
        setValidationErrors(errors)
        setShowValidationDialog(true)
        setIsSavingExamSchedule(false)
        return false // Prevent modal from closing
      }
      
      if (!hasEditingEmployee) {
        toast({ title: 'Saved', description: 'Exam schedule rows prepared. Finish creating the employee to save them.', })
        setIsSavingExamSchedule(false)
        return true
      }
      
      for (const row of examScheduleRows) {
        // Convert time format - strict AM/PM format expected
        const timeStart = convertToDatabaseTime(row.time_start)
        const timeEnd = convertToDatabaseTime(row.time_end)
        
        // Process section: ensure only actual user input is saved (not empty strings)
        // The placeholder "BSIT301A" is only visual - if user actually typed it, that's fine
        // But empty strings should become null/undefined
        let sectionValue: string | null | undefined = undefined
        const sectionTrimmed = (row.section || '').trim()
        // Only save if there's actual content (at least 2 characters)
        // Empty strings, null, undefined all become undefined
        if (sectionTrimmed.length >= 2) {
          sectionValue = sectionTrimmed.toUpperCase()
        }
        
        await upsertExamSchedule({
          exam_schedule_id: row.exam_schedule_id,
          employee_id: editingEmployee.employee_id,
          day_of_week: row.day_of_week,
          time_start: timeStart,
          time_end: timeEnd,
          subject_name: row.subject_name.trim(),
          section: sectionValue,
          room_code: row.room_code.trim().toUpperCase(),
          exam_date: row.exam_date || '', // Save exam_date (required, so should always be set)
          // TODO: Add exam_type to database schema and function signature
          // exam_type: row.exam_type || 'regular', // Requirement #17: Exam type segregation
        })
      }
      
      toast({ title: "Saved", description: "Exam schedules updated." })
      
      const refreshed = await getExamSchedulesForEmployee(editingEmployee.employee_id)
      const examWithSubs = await Promise.all(refreshed.map(async (r) => {
        // Normalize exam_date to ensure it's in YYYY-MM-DD format
        let normalizedExamDate: string | null = null
        if (r.exam_date) {
          try {
            // If it's already in YYYY-MM-DD format, use it directly
            const dateStr = String(r.exam_date).trim()
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
              normalizedExamDate = dateStr
            } else {
              // Try to parse and format it
              const dateObj = new Date(dateStr + 'T00:00:00')
              if (!isNaN(dateObj.getTime())) {
                // Format back to YYYY-MM-DD
                normalizedExamDate = dateObj.toISOString().split('T')[0]
              }
            }
          } catch {
            // If parsing fails, try to extract YYYY-MM-DD from the string
            const dateMatch = String(r.exam_date).match(/(\d{4}-\d{2}-\d{2})/)
            if (dateMatch) {
              normalizedExamDate = dateMatch[1]
            }
          }
        }
        
        const examRow = {
          tempId: `es-${r.exam_schedule_id}`,
          exam_schedule_id: r.exam_schedule_id,
          day_of_week: r.day_of_week as any,
          time_start: formatDbTime12h(r.time_start),
          time_end: formatDbTime12h(r.time_end),
          subject_name: r.subject_name || '',
          section: r.section || '',
          room_code: r.room_code || '',
          exam_date: normalizedExamDate, // Use normalized date
          status: r.status || 'available',
          substitute_employee_id: r.substitute_employee_id || null,
          unavailable_reason: r.unavailable_reason || '',
        }
        
        if (r.substitute_employee_id) {
            return { ...examRow, substitute_employee_name: getEmployeeNameByIdLocal(r.substitute_employee_id) || null }
          }
        
        return examRow
      }))
      setExamScheduleRows(examWithSubs)
      
      // Real-time refresh
      await refreshScheduleDisplay(editingEmployee.employee_id)
      
      // Also refresh the viewExamSchedules for the View dialog
      setViewExamSchedules(examWithSubs)
      
      setIsSavingExamSchedule(false)
      return true // Success - allow modal to close
    } catch (e: any) {
      const errorMessage = e?.message || "Failed to save exam schedules"
      const apiErrors: string[] = []
      
      if (typeof errorMessage === 'string' && errorMessage.includes('validation')) {
        apiErrors.push(errorMessage)
      } else {
        apiErrors.push(`Error saving exam schedules: ${errorMessage}`)
      }
      
      setValidationErrors(apiErrors)
      setShowValidationDialog(true)
      setIsSavingExamSchedule(false)
      return false // Prevent modal from closing on error
    }
  }

  const openViewEmployee = async (employee: Employee) => {
    setViewEmployee(employee)
    setIsViewDialogOpen(true)
    setIsLoadingView(true)
    
    // Calculate and set cutoff dates to current payroll period when opening view
    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth()
    const day = today.getDate()
    
    // Determine which period we're in
    let mode: '26-10' | '11-25'
    let startDate: Date
    let endDate: Date
    
    if (day >= 1 && day <= 10) {
      // 26-10 period: Previous month 26th to current month 10th
      mode = '26-10'
      startDate = new Date(year, month - 1, 26)
      endDate = new Date(year, month, 10)
    } else if (day >= 11 && day <= 25) {
      // 11-25 period: Current month 11th to 25th
      mode = '11-25'
      startDate = new Date(year, month, 11)
      endDate = new Date(year, month, 25)
    } else {
      // 26-10 period: Current month 26th to next month 10th
      mode = '26-10'
      startDate = new Date(year, month, 26)
      endDate = new Date(year, month + 1, 10)
    }
    
    setAttendanceCutoffMode(mode)
    setAttendanceDateRange({ from: startDate, to: endDate })
    
    // Update legacy state
    const attendanceCutoffStart = toISO(startDate)
    const attendanceCutoffEnd = toISO(endDate)
    setCutoffStart(attendanceCutoffStart)
    setCutoffEnd(attendanceCutoffEnd)
    
    try {
      // Load schedules for the selected term (default to 1st_term)
      const rows = await getTeachingSchedulesForEmployee(employee.employee_id, selectedTerm)
      // Ensure section data is properly preserved from database
      // The section should already be normalized in getTeachingSchedulesForEmployee
      // But we'll double-check and ensure it's preserved
      const processedRows = (rows || []).map((r: any) => {
        // Explicitly preserve section field - check all possible locations
        let sectionValue: string | null = null
        
        // Try multiple ways the section might be stored
        if (r.section !== undefined && r.section !== null && String(r.section).trim() !== '') {
          sectionValue = String(r.section).trim()
        }
        
        // Format times only if needed (avoid double formatting)
        const formatTimeIfNeeded = (t: string) => {
          if (!t) return t
          if (t.includes('AM') || t.includes('PM')) {
            return t.replace(/\s+(AM|PM)\s+(AM|PM)$/i, ' $1').trim()
          }
          return formatDbTime12h(t)
        }

        return {
          ...r,
          day_of_week: getScheduleDayName(r.day_of_week) || r.day_of_week,
          time_start: r.time_start ? formatTimeIfNeeded(r.time_start) : r.time_start,
          time_end: r.time_end ? formatTimeIfNeeded(r.time_end) : r.time_end,
          section: sectionValue, // Explicitly set section
        }
      })
      setViewSchedules(processedRows)
      
      // Also load exam schedules for view
      try {
        const examRows = await getExamSchedulesForEmployee(employee.employee_id, selectedTerm)
        // Preserve section for exam schedules and format times like teaching schedules
        const processedExamRows = (examRows || []).map((r: any) => {
          let sectionValue: string | null = null
          if (r.section !== undefined && r.section !== null && String(r.section).trim() !== '') {
            sectionValue = String(r.section).trim()
          }
          // Format times only if they're in 24-hour format (don't double-format)
          const formatTimeIfNeeded = (t: string) => {
            if (!t) return t
            // If already has AM/PM, return as-is (but clean up duplicates)
            if (t.includes('AM') || t.includes('PM')) {
              return t.replace(/\s+(AM|PM)\s+(AM|PM)$/i, ' $1').trim()
            }
            // Otherwise format from 24-hour to 12-hour
            return formatDbTime12h(t)
          }
          
          // Convert day_of_week number to day name string for display compatibility
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
          let dayOfWeek = r.day_of_week
          if (typeof dayOfWeek === 'number') {
            // If it's 1-7 (Monday=1, Sunday=7), convert to name
            dayOfWeek = dayNames[dayOfWeek === 7 ? 0 : dayOfWeek]
          }
          
          return {
            ...r,
            section: sectionValue,
            day_of_week: dayOfWeek, // Ensure it's a day name string
            time_start: r.time_start ? formatTimeIfNeeded(r.time_start) : r.time_start,
            time_end: r.time_end ? formatTimeIfNeeded(r.time_end) : r.time_end,
            exam_date: r.exam_date || null,
            substitute_employee_id: r.substitute_employee_id || null,
            substitute_employee_name: r.substitute_employee_name || null,
            unavailable_reason: r.unavailable_reason || null,
            status: r.status || null,
          }
        })
        setViewExamSchedules(processedExamRows)
      } catch {
        setViewExamSchedules([])
      }
      // Fetch attendance data using Reports API endpoint (same as Reports page)
      await fetchEmployeeAttendanceDetail(employee, startDate, endDate)
    } catch {
      setViewSchedules([])
    } finally { setIsLoadingView(false) }
  }

  const getLastDayOfMonth = (year: number, monthIndex0: number) => {
    return new Date(year, monthIndex0 + 1, 0).getDate()
  }

  // Compute cutoff range like Reports page
  const computeCutoffRange = (mode: '26-10' | '11-25', ref: Date = new Date()) => {
    const year = ref.getFullYear()
    const month = ref.getMonth() // 0-based
    const day = ref.getDate()
    if (mode === '26-10') {
      // Most recent 26–10 window relative to today
      // - If today >= 26: current 26 to next 10
      // - Else: previous 26 to current 10
      const start = day >= 26 ? new Date(year, month, 26) : new Date(year, month - 1, 26)
      const end = day >= 26 ? new Date(year, month + 1, 10) : new Date(year, month, 10)
      return { start, end }
    } else {
      // 11–25 window
      // - If today >= 11: current 11 to current 25
      // - Else: previous 11 to previous 25
      const start = day >= 11 ? new Date(year, month, 11) : new Date(year, month - 1, 11)
      const end = day >= 11 ? new Date(year, month, 25) : new Date(year, month - 1, 25)
      return { start, end }
    }
  }
  
  const toISO = (d: Date) => formatInTimeZone(d, PH_TZ, 'yyyy-MM-dd')
  
  // Fetch employee attendance detail (same as Reports page)
  const fetchEmployeeAttendanceDetail = async (employee: Employee, from: Date, to: Date) => {
    try {
      setAttendanceDetailDays([])
      setAttendanceDetailSummary(null)
      const res = await fetch(`/api/attendance/irregularities/detail?employeeId=${employee.employee_id}&start=${toISO(from)}&end=${toISO(to)}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to load attendance details')
      setAttendanceDetailDays(json.days || [])
      setAttendanceDetailSummary(json.summary || null)
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || 'Failed to load attendance details', variant: 'destructive' })
      setAttendanceDetailDays([])
      setAttendanceDetailSummary(null)
    }
  }

  // Calculate current payroll period based on today's date
  // Returns { start: string, end: string } for 26-10 or 11-25 periods
  const getCurrentPayrollPeriod = (): { start: string; end: string } => {
    const today = new Date()
    const year = today.getFullYear()
    const month0 = today.getMonth() // 0-indexed (0=Jan, 10=Nov)
    const day = today.getDate()
    
    if (day >= 1 && day <= 10) {
      // 26-10 period: Previous month 26th to current month 10th
      const prevMonth0 = month0 === 0 ? 11 : month0 - 1
      const prevYear = month0 === 0 ? year - 1 : year
      return {
        start: `${prevYear}-${String(prevMonth0 + 1).padStart(2, '0')}-26`,
        end: `${year}-${String(month0 + 1).padStart(2, '0')}-10`
      }
    } else if (day >= 11 && day <= 25) {
      // 11-25 period: Current month 11th to 25th
      return {
        start: `${year}-${String(month0 + 1).padStart(2, '0')}-11`,
        end: `${year}-${String(month0 + 1).padStart(2, '0')}-25`
      }
    } else {
      // 26-10 period: Current month 26th to next month 10th
      const nextMonth0 = month0 === 11 ? 0 : month0 + 1
      const nextYear = month0 === 11 ? year + 1 : year
      return {
        start: `${year}-${String(month0 + 1).padStart(2, '0')}-26`,
        end: `${nextYear}-${String(nextMonth0 + 1).padStart(2, '0')}-10`
      }
    }
  }

  const snapCutoff = (baseDate: string, half: 'first' | 'second') => {
    const d = new Date(baseDate + 'T00:00:00')
    const y = d.getFullYear()
    const m0 = d.getMonth()
    const last = getLastDayOfMonth(y, m0)
    if (half === 'first') {
      setCutoffStart(`${y}-${String(m0 + 1).padStart(2,'0')}-01`)
      setCutoffEnd(`${y}-${String(m0 + 1).padStart(2,'0')}-15`)
    } else {
      setCutoffStart(`${y}-${String(m0 + 1).padStart(2,'0')}-16`)
      setCutoffEnd(`${y}-${String(m0 + 1).padStart(2,'0')}-${String(last).padStart(2,'0')}`)
    }
  }

  const normalizeCutoffRange = (startStr: string, endStr: string): { start: string; end: string } => {
    const s = new Date(startStr + 'T00:00:00')
    const y = s.getFullYear()
    const m0 = s.getMonth()
    const day = s.getDate()
    const last = getLastDayOfMonth(y, m0)
    if (day <= 15) {
      return {
        start: `${y}-${String(m0 + 1).padStart(2,'0')}-01`,
        end: `${y}-${String(m0 + 1).padStart(2,'0')}-15`,
      }
    }
    return {
      start: `${y}-${String(m0 + 1).padStart(2,'0')}-16`,
      end: `${y}-${String(m0 + 1).padStart(2,'0')}-${String(last).padStart(2,'0')}`,
    }
  }

  // Apply helper to update cutoff range and reload rows (used by month and quick buttons)
  const applyCutoffRange = async (startStr: string, endStr: string) => {
    if (!viewEmployee) return
    try {
      // Update attendance using Reports API (same as Reports page)
      const startDate = new Date(startStr + 'T00:00:00')
      const endDate = new Date(endStr + 'T00:00:00')
      setAttendanceDateRange({ from: startDate, to: endDate })
      await fetchEmployeeAttendanceDetail(viewEmployee, startDate, endDate)
      
      // Keep state in sync for legacy compatibility
      setCutoffStart(startStr)
      setCutoffEnd(endStr)
    } catch {
      setAttendanceDetailDays([])
      setAttendanceDetailSummary(null)
    }
  }

  // helper: HH:MM:SS to minutes from midnight
  const toMinutes = (t?: string | null) => {
    if (!t) return Number.POSITIVE_INFINITY
    const [hh, mm, ss] = t.split(':').map((n: any) => Number(n))
    return (hh || 0) * 60 + (mm || 0)
  }

  // Format HH:MM:SS (24h) to 12h with AM/PM without creating Date (avoids TZ drift)
  const formatTime12h = (t: string) => {
    const [hStr, mStr] = t.split(':')
    const h = Number(hStr)
    const period = h >= 12 ? 'PM' : 'AM'
    const hh = h % 12 || 12
    return `${String(hh).padStart(2,'0')}:${mStr.padStart(2,'0')} ${period}`
  }

  const updateScheduleField = (id: string, field: keyof ScheduleRow, value: any) => {
    setScheduleRows(prev => prev.map(r => r.tempId === id ? { ...r, [field]: value } : r))
  }

  const removeScheduleRow = async (row: ScheduleRow) => {
    try {
      // Build descriptive message about what's being removed
      const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const dayName = dayNames[row.day_of_week] || `Day ${row.day_of_week}`
      const subjectName = row.subject_name || 'Untitled Class'
      const timeRange = `${row.time_start} - ${row.time_end}`
      const sectionInfo = row.section && row.section.trim() ? row.section.trim() : ''
      const roomInfo = row.room_code || ''
      
      if (row.schedule_id) {
        await deleteTeachingSchedule(row.schedule_id)
      }
      
      // Remove from local state
      setScheduleRows(prev => prev.filter(r => r.tempId !== row.tempId))
      
      // Show dialog with specific details about what was removed
      setRemovedScheduleDetails({
        type: 'class',
        subjectName,
        section: sectionInfo,
        dayName,
        timeRange,
        roomCode: roomInfo
      })
      setScheduleRemovedDialogOpen(true)
      
      // Refresh schedule display in employee directory in real-time
      if (editingEmployee) {
        await refreshScheduleDisplay(editingEmployee.employee_id)
      }
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to delete schedule", variant: "destructive" })
    }
  }

  const saveAllSchedules = async (): Promise<boolean> => {
    // If modal opened from Add Employee (no editingEmployee), we only validate and keep rows in memory
    const hasEditingEmployee = !!editingEmployee
    try {
      setIsSavingSchedule(true)
      // Comprehensive validation per row
      const errors: string[] = []
      let nonEmptyRowCount = 0
      
      scheduleRows.forEach((row, idx) => {
        const rowNum = idx + 1
        
        // Check if row has any data at all (determine if it's a row to validate)
        const hasAny = (
          (row.section || '').trim() || 
          (row.room_code || '').trim() || 
          (row.time_start || '').trim() || 
          (row.time_end || '').trim() || 
          (row.subject_name || '').trim()
        )
        
        if (hasAny) nonEmptyRowCount++
        if (!hasAny) return // Skip empty rows
        
        // Section validation - REQUIRED field
        // Section must be provided and have at least 2 characters
        const sectionValue = (row.section || '').trim()
        if (!sectionValue || sectionValue.length === 0) {
          errors.push(`Class Schedule #${rowNum}: Section is required`)
        } else if (sectionValue.length < 2) {
          errors.push(`Class Schedule #${rowNum}: Section must be at least 2 characters`)
        }
        
        // Subject Name validation
        const subjectNameValue = (row.subject_name || '').trim()
        if (!subjectNameValue || subjectNameValue.length < 3) {
          errors.push(`Class Schedule #${rowNum}: Subject name is required (minimum 3 characters)`)
        }
        
        // Room/Building Code validation
        // Check if room_code exists and has actual content (not just whitespace or empty)
        // Important: This checks the actual value, not the placeholder text
        const roomCodeValue = (row.room_code || '').trim()
        if (!roomCodeValue || roomCodeValue.length === 0) {
          errors.push(`Class Schedule #${rowNum}: Building/Room code is required`)
        } else if (roomCodeValue.length < 2) {
          errors.push(`Class Schedule #${rowNum}: Building/Room code must be at least 2 characters`)
        }
        
        // Time format validation
        if (!validateTimeFormat(row.time_start)) {
          errors.push(`Class Schedule #${rowNum}: Invalid start time format. Use format: 07:00 AM`)
        }
        if (!validateTimeFormat(row.time_end)) {
          errors.push(`Class Schedule #${rowNum}: Invalid end time format. Use format: 09:00 PM`)
        }
        
        // Time range validation
        if (validateTimeFormat(row.time_start) && validateTimeFormat(row.time_end)) {
          if (!validateTimeRange(row.time_start, row.time_end)) {
            errors.push(`Class Schedule #${rowNum}: End time must be after start time`)
          }
          
          // Check time range (7:00 AM - 9:00 PM)
          const startMinutes = timeToMinutes(row.time_start)
          const endMinutes = timeToMinutes(row.time_end)
          const sevenAM = 7 * 60
          const ninePM = 21 * 60
          
          if (startMinutes !== null && (startMinutes < sevenAM || startMinutes > ninePM)) {
            errors.push(`Class Schedule #${rowNum}: Start time must be between 7:00 AM and 9:00 PM`)
          }
          if (endMinutes !== null && (endMinutes < sevenAM || endMinutes > ninePM)) {
            errors.push(`Class Schedule #${rowNum}: End time must be between 7:00 AM and 9:00 PM`)
          }
          
          // Check for time conflicts with other schedules on the same day
          if (startMinutes !== null && endMinutes !== null) {
            const conflictingRow = scheduleRows.find((otherRow, otherIdx) => {
              // Skip self and empty rows
              if (idx === otherIdx) return false
              
              const otherHasAny = (
                (otherRow.section || '').trim() || 
                (otherRow.room_code || '').trim() || 
                (otherRow.time_start || '').trim() || 
                (otherRow.time_end || '').trim() || 
                (otherRow.subject_name || '').trim()
              )
              if (!otherHasAny) return false
              
              // Only check same day
              if (otherRow.day_of_week !== row.day_of_week) return false
              
              // Skip if the other row doesn't have valid times
              if (!validateTimeFormat(otherRow.time_start) || !validateTimeFormat(otherRow.time_end)) {
                return false
              }
              
              const otherStart = timeToMinutes(otherRow.time_start)
              const otherEnd = timeToMinutes(otherRow.time_end)
              
              if (otherStart === null || otherEnd === null) return false
              
              // Check if time ranges overlap: start1 < end2 AND start2 < end1
              return startMinutes < otherEnd && otherStart < endMinutes
            })
            
            if (conflictingRow) {
              const otherRowNum = scheduleRows.indexOf(conflictingRow) + 1
              errors.push(`Class Schedule #${rowNum}: Conflicting time! This schedule overlaps with Class Schedule #${otherRowNum} on the same day (${conflictingRow.time_start} - ${conflictingRow.time_end}). Please choose a different time range.`)
            }
          }
        }
      })
      
      if (nonEmptyRowCount === 0) {
        // Nothing to save; just close modal silently
        setIsSavingSchedule(false)
        return true // Return true to allow closing if nothing to save
      }
      
      if (errors.length > 0) {
        setValidationErrors(errors)
        setShowValidationDialog(true)
        setIsSavingSchedule(false)
        return false // Return false to prevent modal from closing
      }
      
      if (!hasEditingEmployee) {
        // In Add mode, we don't write to DB yet
        toast({ title: 'Saved', description: 'Schedule rows prepared. Finish creating the employee to save them.', })
        setIsSavingSchedule(false)
        return true
      }
      
      // Save to database
      for (const row of scheduleRows) {
        // Ensure room and subject exist
        const room = await upsertRoom({ code: (row.room_code || '').trim().toUpperCase() })
        // Subject is optional text in schedules; attempt upsert but do not block on errors
        if (row.subject_name && row.subject_name.trim()) {
          try {
            await upsertSubject({ name: row.subject_name.trim() })
          } catch {}
        }
        
        // Process section: ensure only actual user input is saved (not empty strings)
        // The placeholder "BSIT301A" is only visual - if user actually typed it, that's fine
        // But empty strings should become null
        let sectionValue: string | null = null
        const sectionTrimmed = (row.section || '').trim()
        // Only save if there's actual content (at least 2 characters)
        // Empty strings, null, undefined all become null
        if (sectionTrimmed.length >= 2) {
          sectionValue = sectionTrimmed.toUpperCase()
        }
        
        await upsertTeachingSchedule({
          schedule_id: row.schedule_id,
          employee_id: editingEmployee.employee_id,
          room_id: room.room_id,
          subject_name: row.subject_name,
          class_type: row.class_type,
          section: sectionValue,
          day_of_week: row.day_of_week,
          time_start: convertToDatabaseTime(row.time_start),
          time_end: convertToDatabaseTime(row.time_end),
        } as any)
      }
      
      toast({ title: "Saved", description: "Teaching schedules updated." })
      
      // Refresh from DB to capture IDs and substitution data
      const refreshed = await getTeachingSchedulesForEmployee(editingEmployee.employee_id)
      const refreshedWithSubs = await Promise.all(refreshed.map(async (r: any) => {
        const scheduleRow: ScheduleRow = {
          tempId: `s-${r.schedule_id}`,
          schedule_id: r.schedule_id,
          day_of_week: r.day_of_week as any,
          time_start: formatDbTime12h(r.time_start),
          time_end: formatDbTime12h(r.time_end),
          subject_name: r.subject_name || '',
          subject_id: r.subject_id,
          class_type: r.class_type || '',
          section: r.section ? String(r.section).trim() : "",
          room_code: r.room_code || r.rooms?.code || "",
          substitute_employee_id: r.substitute_employee_id || null,
          unavailable_reason: r.unavailable_reason || null,
          status: r.status || null,
        }
        
        if (r.substitute_employee_id) {
            const subName = getEmployeeNameByIdLocal(r.substitute_employee_id)
            if (subName) {
              scheduleRow.substitute_employee_name = subName
            }
          }
        
        return scheduleRow
      }))
      setScheduleRows(refreshedWithSubs)
      
      // Real-time refresh of employee directory schedule display
      await refreshScheduleDisplay(editingEmployee.employee_id)
      
      // Also refresh the viewSchedules for the View dialog
      setViewSchedules(refreshedWithSubs)
      
      setIsSavingSchedule(false)
      return true // Success - allow modal to close
    } catch (e: any) {
      const errorMessage = e?.message || "Failed to save schedules"
      const apiErrors: string[] = []
      
      // Check if error contains validation details
      if (typeof errorMessage === 'string' && errorMessage.includes('validation')) {
        apiErrors.push(errorMessage)
      } else {
        apiErrors.push(`Error saving schedules: ${errorMessage}`)
      }
      
      setValidationErrors(apiErrors)
      setShowValidationDialog(true)
      setIsSavingSchedule(false)
      return false // Return false to prevent modal from closing on error
    }
  }

  // Handler for saving class schedule from AddClassModal
  const handleSaveClassSchedule = async (data: ClassScheduleData) => {
    if (!viewEmployee || !viewEmployee.employee_id) {
      toast({
        title: "Error",
        description: "Cannot save schedule: No employee selected. Please close this dialog and select an employee first.",
        variant: "destructive"
      })
      // Force close the modal since we can't save without an employee
      setIsAddClassModalOpen(false)
      return
    }
    const classConflict = getScheduleConflictDetails(
      data.day_of_week,
      data.time_start,
      data.time_end,
      data.teaching_schedule_id ?? (editingClassSchedule ? (editingClassSchedule as any).schedule_id : undefined),
      'teaching'
    )

    if (classConflict) {
      throw new Error(
        `Time conflict detected. This overlaps with ${classConflict.type} schedule "${classConflict.subject}" (${classConflict.time_start} - ${classConflict.time_end}).`
      )
    }

    try {
      setIsSavingSchedule(true)
      
      // Ensure course, room, and subject exist
      const course = await upsertCourse({ code: data.subject_name.substring(0, 8).toUpperCase() || 'COURSE' })
      
      const room = await upsertRoom({ code: data.room.trim().toUpperCase() })
      
      if (data.subject_name && data.subject_name.trim()) {
        try {
          await upsertSubject({ name: data.subject_name.trim() })
        } catch {}
      }
      
      const sectionValue = data.section.trim().length >= 2 ? data.section.trim().toUpperCase() : null
      
      const scheduleData = {
        // Prefer modal-provided ID (edit-in-modal flow), fallback to parent state.
        schedule_id: data.teaching_schedule_id ?? (editingClassSchedule ? (editingClassSchedule as any).schedule_id : undefined),
        employee_id: viewEmployee.employee_id,
        course_id: course.course_id,
        room_id: room.room_id,
        subject_name: data.subject_name,
        class_type: data.type === 'Lecture' ? 'LEC' : 'LAB',
        section: sectionValue,
        day_of_week: data.day_of_week,
        time_start: convertToDatabaseTime(data.time_start),
        time_end: convertToDatabaseTime(data.time_end),
        term: selectedTerm,
      }
      await upsertTeachingSchedule(scheduleData as any)
      
      toast({ title: "Success", description: "Class schedule saved successfully." })
      
      // Refresh schedules
      await refreshScheduleDisplay(viewEmployee.employee_id)
      const refreshed = await getTeachingSchedulesForEmployee(viewEmployee.employee_id, selectedTerm)
      
      const processedRows = (refreshed || []).map((r: any) => {
        let sectionValue: string | null = null
        if (r.section !== undefined && r.section !== null && String(r.section).trim() !== '') {
          sectionValue = String(r.section).trim()
        }
        return {
          ...r,
          section: sectionValue,
          room_code: r.room_code || r.rooms?.code || '',
          course_code: r.course_code || r.courses?.code || '',
          time_start: r.time_start ? formatDbTime12h(r.time_start) : r.time_start,
          time_end: r.time_end ? formatDbTime12h(r.time_end) : r.time_end,
        }
      })
      setViewSchedules(processedRows)
      
      // Reset editing state but DON'T close the modal
      setEditingClassSchedule(null)
      // setIsAddClassModalOpen(false) // COMMENTED OUT - Keep modal open!
    } finally {
      setIsSavingSchedule(false)
    }
  }

  // Handler for saving day-specific schedule from DayScheduleModal
  const handleSaveDaySchedule = async (data: {
    schedule_id?: number
    exam_schedule_id?: number
    time_start: string
    time_end: string
    subject_name?: string
    subject?: string
    section: string
    room: string
    substitute?: string
    type: 'Lecture' | 'Lab' | 'Prelim' | 'Midterm' | 'Pre-Final' | 'Final'
    exam_date?: Date
  }) => {
    if (!viewEmployee) return

    try {
      if (selectedScheduleType === 'class') {
        setIsSavingSchedule(true)
        
        const courseCode = (data.subject_name || '').substring(0, 8).toUpperCase() || 'COURSE'
        const course = await upsertCourse({ code: courseCode })
        const room = await upsertRoom({ code: data.room.trim().toUpperCase() })
        
        if (data.subject_name && data.subject_name.trim()) {
          try {
            await upsertSubject({ name: data.subject_name.trim() })
          } catch {}
        }
        
        const sectionValue = data.section.trim().length >= 2 ? data.section.trim().toUpperCase() : null
        
        await upsertTeachingSchedule({
          schedule_id: data.schedule_id, // Include schedule_id for updates
          employee_id: viewEmployee.employee_id,
          course_id: course.course_id,
          room_id: room.room_id,
          subject_name: data.subject_name || '',
          class_type: data.type === 'Lecture' ? 'LEC' : 'LAB',
          section: sectionValue,
          day_of_week: selectedDay,
          time_start: convertToDatabaseTime(data.time_start),
          time_end: convertToDatabaseTime(data.time_end),
          term: selectedTerm,
        } as any)
        
        toast({ 
          title: "Success", 
          description: data.schedule_id 
            ? "Class schedule updated successfully." 
            : "Class schedule added successfully." 
        })
        
        // Refresh schedules with proper formatting
        await refreshScheduleDisplay(viewEmployee.employee_id)
        const refreshed = await getTeachingSchedulesForEmployee(viewEmployee.employee_id)
        // Format schedules the same way as in openViewEmployee
        const processedRows = await Promise.all((refreshed || []).map(async (r: any) => {
          let sectionValue: string | null = null
          if (r.section !== undefined && r.section !== null && String(r.section).trim() !== '') {
            sectionValue = String(r.section).trim()
          }
          let substituteEmployeeName: string | null = null
          if (r.substitute_employee_id) {
            substituteEmployeeName = getEmployeeNameByIdLocal(r.substitute_employee_id)
          }
          return {
            ...r,
            section: sectionValue,
            substitute_employee_name: substituteEmployeeName,
            room_code: r.room_code || r.rooms?.code || '',
            course_code: r.course_code || r.courses?.code || '',
            time_start: r.time_start ? formatDbTime12h(r.time_start) : r.time_start,
            time_end: r.time_end ? formatDbTime12h(r.time_end) : r.time_end,
            day_of_week: r.day_of_week
          }
        }))
        setViewSchedules(processedRows)
      } else {
        setIsSavingExamSchedule(true)
        
        const sectionValue = data.section.trim().length >= 2 ? data.section.trim().toUpperCase() : undefined
        const examDate = data.exam_date
          ? `${data.exam_date.getFullYear()}-${String(data.exam_date.getMonth() + 1).padStart(2, '0')}-${String(data.exam_date.getDate()).padStart(2, '0')}`
          : ''
        
        const examCourseCode = (data.subject || '').substring(0, 8).toUpperCase() || 'COURSE'
        await upsertExamSchedule({
          exam_schedule_id: data.exam_schedule_id, // Include exam_schedule_id for updates
          employee_id: viewEmployee.employee_id,
          day_of_week: selectedDay,
          time_start: convertToDatabaseTime(data.time_start),
          time_end: convertToDatabaseTime(data.time_end),
          course_code: examCourseCode,
          subject_name: (data.subject || '').trim(),
          section: sectionValue,
          room_code: data.room.trim().toUpperCase(),
          exam_date: examDate,
          term: selectedTerm,
        })
        
        toast({ 
          title: "Success", 
          description: data.exam_schedule_id 
            ? "Exam schedule updated successfully." 
            : "Exam schedule added successfully." 
        })
        
        // Refresh schedules with proper formatting
        await refreshScheduleDisplay(viewEmployee.employee_id)
        const refreshed = await getExamSchedulesForEmployee(viewEmployee.employee_id, selectedTerm)
        // Format exam schedules the same way as in openViewEmployee
        const processedExamRows = (refreshed || []).map((r: any) => {
          let sectionValue: string | null = null
          if (r.section !== undefined && r.section !== null && String(r.section).trim() !== '') {
            sectionValue = String(r.section).trim()
          }
          const formatTimeIfNeeded = (t: string) => {
            if (!t) return t
            if (t.includes('AM') || t.includes('PM')) {
              return t.replace(/\s+(AM|PM)\s+(AM|PM)$/i, ' $1').trim()
            }
            return formatDbTime12h(t)
          }
          return {
            ...r,
            section: sectionValue,
            time_start: r.time_start ? formatTimeIfNeeded(r.time_start) : r.time_start,
            time_end: r.time_end ? formatTimeIfNeeded(r.time_end) : r.time_end,
            exam_date: r.exam_date || null,
            substitute_employee_id: r.substitute_employee_id || null,
            substitute_employee_name: r.substitute_employee_name || null,
            unavailable_reason: r.unavailable_reason || null,
            status: r.status || null,
          }
        })
        setViewExamSchedules(processedExamRows)
      }
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || `Failed to save ${selectedScheduleType} schedule`,
        variant: "destructive"
      })
      throw e // Re-throw to prevent modal from closing
    } finally {
      setIsSavingSchedule(false)
      setIsSavingExamSchedule(false)
    }
  }

  // Handler for moving schedule to a different day
  const handleMoveSchedule = (scheduleId: number, scheduleType: 'teaching' | 'exam', currentDay: number) => {
    // Find the schedule being moved to get its time information
    let schedule: any = null
    
    if (scheduleType === 'teaching') {
      schedule = viewSchedules.find((s: any) => s.schedule_id === scheduleId)
    } else if (scheduleType === 'exam') {
      schedule = viewExamSchedules.find((s: any) => s.exam_schedule_id === scheduleId)
    }
    
    if (!schedule) {
      toast({
        title: "Error",
        description: "Schedule not found",
        variant: "destructive"
      })
      return
    }
    
    setScheduleToMove({ 
      scheduleId, 
      scheduleType, 
      currentDay,
      timeStart: schedule.time_start || '',
      timeEnd: schedule.time_end || ''
    })
    setMoveScheduleDialogOpen(true)
  }

  // Helper function to get day name
  const getDayName = (dayNum: number): string => {
    const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    return days[dayNum] || `Day ${dayNum}`
  }

  // Handler for confirming schedule move
  const handleConfirmMoveSchedule = async (newDay: number) => {
    if (!scheduleToMove || !viewEmployee) return

    // Double-check for conflicts before moving (defense in depth)
    if (hasTimeConflict(newDay, scheduleToMove.timeStart, scheduleToMove.timeEnd, scheduleToMove.scheduleId, scheduleToMove.scheduleType)) {
      toast({
        title: "Cannot Move Schedule",
        description: "This schedule conflicts with an existing schedule on the target day. Please choose a different day or time.",
        variant: "destructive"
      })
      return
    }

    try {
      setIsMovingSchedule(true)
      
      const response = await fetch('/api/employees/update-schedule-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId: scheduleToMove.scheduleId,
          scheduleType: scheduleToMove.scheduleType,
          newDayOfWeek: newDay,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to move schedule')
      }

      const result = await response.json()
      
      // Verify the update was successful by checking the response
      if (!result.success || !result.data) {
        throw new Error('Schedule update verification failed')
      }

      toast({
        title: "Success",
        description: `Schedule moved from ${getDayName(scheduleToMove.currentDay)} to ${getDayName(newDay)}. All schedule details (subject, time, section, room) have been preserved in the database.`,
      })

      // Refresh schedules based on type
      await refreshScheduleDisplay(viewEmployee.employee_id)
      
      if (scheduleToMove.scheduleType === 'teaching') {
        const refreshed = await getTeachingSchedulesForEmployee(viewEmployee.employee_id)
        const processedRows = await Promise.all((refreshed || []).map(async (r: any) => {
          let sectionValue: string | null = null
          if (r.section !== undefined && r.section !== null && String(r.section).trim() !== '') {
            sectionValue = String(r.section).trim()
          }
          let substituteEmployeeName: string | null = null
          if (r.substitute_employee_id) {
            substituteEmployeeName = getEmployeeNameByIdLocal(r.substitute_employee_id)
          }
          return {
            ...r,
            section: sectionValue,
            substitute_employee_name: substituteEmployeeName,
            room_code: r.room_code || r.rooms?.code || '',
            course_code: r.course_code || r.courses?.code || '',
            time_start: r.time_start ? formatDbTime12h(r.time_start) : r.time_start,
            time_end: r.time_end ? formatDbTime12h(r.time_end) : r.time_end,
            day_of_week: r.day_of_week
          }
        }))
        setViewSchedules(processedRows)
      } else if (scheduleToMove.scheduleType === 'exam') {
        const refreshed = await getExamSchedulesForEmployee(viewEmployee.employee_id)
        // Format exam schedules the same way as in openViewEmployee
        const processedExamRows = (refreshed || []).map((r: any) => {
          let sectionValue: string | null = null
          if (r.section !== undefined && r.section !== null && String(r.section).trim() !== '') {
            sectionValue = String(r.section).trim()
          }
          const formatTimeIfNeeded = (t: string) => {
            if (!t) return t
            if (t.includes('AM') || t.includes('PM')) {
              return t.replace(/\s+(AM|PM)\s+(AM|PM)$/i, ' $1').trim()
            }
            return formatDbTime12h(t)
          }
          return {
            ...r,
            section: sectionValue,
            time_start: r.time_start ? formatTimeIfNeeded(r.time_start) : r.time_start,
            time_end: r.time_end ? formatTimeIfNeeded(r.time_end) : r.time_end,
            exam_date: r.exam_date || null,
            substitute_employee_id: r.substitute_employee_id || null,
            substitute_employee_name: r.substitute_employee_name || null,
            unavailable_reason: r.unavailable_reason || null,
            status: r.status || null,
          }
        })
        setViewExamSchedules(processedExamRows)
      }

      setMoveScheduleDialogOpen(false)
      setScheduleToMove(null)
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to move schedule",
        variant: "destructive"
      })
    } finally {
      setIsMovingSchedule(false)
    }
  }

  // Handler for deleting day-specific schedule
  const handleDeleteDaySchedule = async (scheduleId: number, isExam: boolean) => {
    if (!viewEmployee) return

    try {
      if (isExam) {
        await deleteExamSchedule(scheduleId)
        toast({ title: "Success", description: "Exam schedule deleted successfully." })
        
        await refreshScheduleDisplay(viewEmployee.employee_id)
        const refreshed = await getExamSchedulesForEmployee(viewEmployee.employee_id)
        // Format exam schedules the same way as in openViewEmployee
        const processedExamRows = (refreshed || []).map((r: any) => {
          let sectionValue: string | null = null
          if (r.section !== undefined && r.section !== null && String(r.section).trim() !== '') {
            sectionValue = String(r.section).trim()
          }
          const formatTimeIfNeeded = (t: string) => {
            if (!t) return t
            if (t.includes('AM') || t.includes('PM')) {
              return t.replace(/\s+(AM|PM)\s+(AM|PM)$/i, ' $1').trim()
            }
            return formatDbTime12h(t)
          }
          return {
            ...r,
            section: sectionValue,
            time_start: r.time_start ? formatTimeIfNeeded(r.time_start) : r.time_start,
            time_end: r.time_end ? formatTimeIfNeeded(r.time_end) : r.time_end,
            exam_date: r.exam_date || null,
            substitute_employee_id: r.substitute_employee_id || null,
            substitute_employee_name: r.substitute_employee_name || null,
            unavailable_reason: r.unavailable_reason || null,
            status: r.status || null,
          }
        })
        setViewExamSchedules(processedExamRows)
      } else {
        await deleteTeachingSchedule(scheduleId)
        toast({ title: "Success", description: "Class schedule deleted successfully." })
        
        await refreshScheduleDisplay(viewEmployee.employee_id)
        const refreshed = await getTeachingSchedulesForEmployee(viewEmployee.employee_id)
        // Format schedules the same way as in openViewEmployee
        const processedRows = await Promise.all((refreshed || []).map(async (r: any) => {
          let sectionValue: string | null = null
          if (r.section !== undefined && r.section !== null && String(r.section).trim() !== '') {
            sectionValue = String(r.section).trim()
          }
          let substituteEmployeeName: string | null = null
          if (r.substitute_employee_id) {
            substituteEmployeeName = getEmployeeNameByIdLocal(r.substitute_employee_id)
          }
          return {
            ...r,
            section: sectionValue,
            substitute_employee_name: substituteEmployeeName,
            room_code: r.room_code || r.rooms?.code || '',
            course_code: r.course_code || r.courses?.code || '',
            time_start: r.time_start ? formatDbTime12h(r.time_start) : r.time_start,
            time_end: r.time_end ? formatDbTime12h(r.time_end) : r.time_end,
            day_of_week: r.day_of_week
          }
        }))
        setViewSchedules(processedRows)
      }
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to delete schedule",
        variant: "destructive"
      })
    }
  }

  // Handler for saving exam schedule from AddExamModal
  const handleSaveExamSchedule = async (data: ExamScheduleData) => {
    if (!viewEmployee || !viewEmployee.employee_id) {
      toast({
        title: "Error",
        description: "Cannot save schedule: No employee selected. Please close this dialog and select an employee first.",
        variant: "destructive"
      })
      // Force close the modal since we can't save without an employee
      setIsAddExamModalOpen(false)
      throw new Error('No employee selected')
    }
    const examConflict = getScheduleConflictDetails(
      data.day_of_week,
      data.time_start,
      data.time_end,
      data.exam_schedule_id ?? (editingExamSchedule ? (editingExamSchedule as any).exam_schedule_id : undefined),
      'exam'
    )

    if (examConflict) {
      throw new Error(
        `Time conflict detected. This overlaps with ${examConflict.type} schedule "${examConflict.subject}" (${examConflict.time_start} - ${examConflict.time_end}).`
      )
    }

    try {
      setIsSavingExamSchedule(true)
      
      const sectionValue = data.section.trim().length >= 2 ? data.section.trim().toUpperCase() : undefined
      const examDate = data.exam_date
        ? `${data.exam_date.getFullYear()}-${String(data.exam_date.getMonth() + 1).padStart(2, '0')}-${String(data.exam_date.getDate()).padStart(2, '0')}`
        : ''

      const convertedTimeStart = convertToDatabaseTime(data.time_start)
      const convertedTimeEnd = convertToDatabaseTime(data.time_end)
      
      const examData = {
        // Prefer modal-provided ID (edit-in-modal flow), fallback to parent state.
        exam_schedule_id: data.exam_schedule_id ?? (editingExamSchedule ? (editingExamSchedule as any).exam_schedule_id : undefined),
        employee_id: viewEmployee.employee_id,
        day_of_week: data.day_of_week,
        time_start: convertedTimeStart,
        time_end: convertedTimeEnd,
        course_code: data.subject.substring(0, 8).toUpperCase() || 'COURSE',
        subject_name: data.subject.trim(),
        section: sectionValue,
        room_code: data.room.trim().toUpperCase(),
        exam_date: examDate,
        term: selectedTerm,
        class_type: data.class_type || 'Tertiary',
        exam_type: data.type || (data.class_type === 'SHS' ? '1st Quarter' : 'Prelim'),
      }

      await upsertExamSchedule(examData)
      
      toast({ title: "Success", description: "Exam schedule saved successfully." })
      
      // Refresh schedules
      await refreshScheduleDisplay(viewEmployee.employee_id)
      const refreshed = await getExamSchedulesForEmployee(viewEmployee.employee_id, selectedTerm)
      
      const processedExamRows = (refreshed || []).map((r: any) => {
        let sectionValue: string | null = null
        if (r.section !== undefined && r.section !== null && String(r.section).trim() !== '') {
          sectionValue = String(r.section).trim()
        }
        const formatTimeIfNeeded = (t: string) => {
          if (!t) return t
          if (t.includes('AM') || t.includes('PM')) {
            return t.replace(/\s+(AM|PM)\s+(AM|PM)$/i, ' $1').trim()
          }
          return formatDbTime12h(t)
        }
        return {
          ...r,
          section: sectionValue,
          time_start: r.time_start ? formatTimeIfNeeded(r.time_start) : r.time_start,
          time_end: r.time_end ? formatTimeIfNeeded(r.time_end) : r.time_end,
          exam_date: r.exam_date || null,
          substitute_employee_id: r.substitute_employee_id || null,
          substitute_employee_name: r.substitute_employee_name || null,
          unavailable_reason: r.unavailable_reason || null,
          status: r.status || null,
        }
      })
      setViewExamSchedules(processedExamRows)
      
      // Reset editing state but DON'T close the modal
      setEditingExamSchedule(null)
      // setIsAddExamModalOpen(false) // COMMENTED OUT - Keep modal open!
    } finally {
      setIsSavingExamSchedule(false)
    }
  }

  // Helper to refresh schedule display in Employee Directory
  const refreshScheduleDisplay = async (employeeId: number) => {
    try {
      // Refresh the employee list from SWR
      if (mutate) {
        await mutate()
      }
      
      // Force a re-fetch to get updated schedule data
      // The useEffect that watches swrEmployees will update allEmployees automatically
      // But we need to manually refresh the schedule display for this employee
      const isoDayInManila = Number(formatInTimeZone(new Date(), 'Asia/Manila', 'i'))
      const dayIdx = isoDayInManila === 7 ? undefined : (isoDayInManila as 1|2|3|4|5|6)
      
      if (!dayIdx) {
        // Sunday - show "Rest Day"
        setTodaysHoursByEmployee(prev => ({ ...prev, [employeeId]: 'Rest Day' }))
        setTodaysScheduleInfoByEmployee(prev => ({ ...prev, [employeeId]: { summary: 'Rest Day', source: 'rest_day' } }))
        return
      }
      
      // Fetch fresh schedule data for this employee using the currently selected active term.
      try {
        const [schedules, examSchedulesAll] = await Promise.all([
          getTeachingSchedulesForEmployee(employeeId, selectedTerm),
          getExamSchedulesForEmployee(employeeId, selectedTerm),
        ])

        const today = getManilaToday()
        const examSchedules = (examSchedulesAll || []).filter((s: any) => {
          const rawExamDate = String(s?.exam_date || '').trim()
          const examDate = rawExamDate ? toManilaDate(rawExamDate) : ''
          if (examDate) return examDate === today

          const dow = Number(s?.day_of_week)
          return Number.isFinite(dow) && dow === dayIdx
        })

        // Check if employee has ANY schedules (not just today's)
        if ((schedules && schedules.length > 0) || (examSchedulesAll && examSchedulesAll.length > 0)) {
          // Exam schedule takes priority for today
          if (examSchedules.length > 0) {
            const toMinutes = (t: string) => {
              if (!t) return Number.POSITIVE_INFINITY
              const [hh, mm] = t.split(':').map(Number)
              return hh * 60 + mm
            }
            const toMinutesEnd = (t: string) => {
              if (!t) return Number.NEGATIVE_INFINITY
              const [hh, mm] = t.split(':').map(Number)
              return hh * 60 + mm
            }
            const start = examSchedules.reduce((min: string, r: any) => {
              return toMinutes(r.time_start || '') < toMinutes(min) ? (r.time_start || '') : min
            }, examSchedules[0].time_start || '')
            const end = examSchedules.reduce((max: string, r: any) => {
              return toMinutesEnd(r.time_end || '') > toMinutesEnd(max) ? (r.time_end || '') : max
            }, examSchedules[0].time_end || '')
            if (start && end) {
              const display = `${formatDbTime12h(start)} - ${formatDbTime12h(end)}`
              setTodaysHoursByEmployee(prev => ({ ...prev, [employeeId]: display }))
              setTodaysScheduleInfoByEmployee(prev => ({ ...prev, [employeeId]: { summary: display, source: 'exam' } }))
              return
            }
          }

          // Employee has schedules - check if there's one for today
          const todaysScheds = (schedules || []).filter((s: any) => s.day_of_week === dayIdx)
          
          if (todaysScheds.length > 0) {
            // Has schedule for today - show today's schedule time
            const toMinutes = (t: string) => {
              if (!t) return Number.POSITIVE_INFINITY
              const [hh, mm] = t.split(':').map(Number)
              return hh * 60 + mm
            }
            const sorted = todaysScheds.sort((a: any, b: any) => toMinutes(a.time_start) - toMinutes(b.time_start))
            const earliest = sorted[0]
            const latest = sorted[sorted.length - 1]
            const display = `${formatDbTime12h(earliest.time_start)} - ${formatDbTime12h(latest.time_end)}`
            setTodaysHoursByEmployee(prev => ({ ...prev, [employeeId]: display }))
            setTodaysScheduleInfoByEmployee(prev => ({ ...prev, [employeeId]: { summary: display, source: 'class' } }))
          } else {
            // Has schedules but not for today - show schedule count
            const display = 'No Class/Exam Schedule Today'
            setTodaysHoursByEmployee(prev => ({ ...prev, [employeeId]: display }))
            setTodaysScheduleInfoByEmployee(prev => ({ ...prev, [employeeId]: { summary: display, source: 'no_today' } }))
          }
        } else {
          // No schedules at all - check if this is a Teaching staff member
          const updatedEmployees = await getEmployees(false, true) // Only active employees for schedule display
          const emp = updatedEmployees.find(e => e.employee_id === employeeId)
          if (emp && (emp as any).staff_type === 'Teaching') {
            setTodaysHoursByEmployee(prev => ({ ...prev, [employeeId]: 'No Class Schedules Found' }))
            setTodaysScheduleInfoByEmployee(prev => ({ ...prev, [employeeId]: { summary: 'No Class Schedules Found', source: 'no_schedules' } }))
          } else if (emp && emp.schedule_time_in && emp.schedule_time_out) {
            const display = `${formatDbTime12h(emp.schedule_time_in)} - ${formatDbTime12h(emp.schedule_time_out)}`
            setTodaysHoursByEmployee(prev => ({
              ...prev,
              [employeeId]: display
            }))
            setTodaysScheduleInfoByEmployee(prev => ({ ...prev, [employeeId]: { summary: display, source: 'office' } }))
          } else {
            setTodaysHoursByEmployee(prev => ({ ...prev, [employeeId]: '-' }))
            setTodaysScheduleInfoByEmployee(prev => ({ ...prev, [employeeId]: { summary: '-', source: 'unknown' } }))
          }
        }
      } catch {
        // Fallback: check employee's default schedule
        const updatedEmployees = await getEmployees(true, true, false) // Fetch all employees (active and archived)
        const emp = updatedEmployees.find(e => e.employee_id === employeeId)
        if (emp && (emp as any).staff_type === 'Teaching') {
          setTodaysHoursByEmployee(prev => ({ ...prev, [employeeId]: 'No Class Schedules Found' }))
          setTodaysScheduleInfoByEmployee(prev => ({ ...prev, [employeeId]: { summary: 'No Class Schedules Found', source: 'no_schedules' } }))
        } else if (emp && emp.schedule_time_in && emp.schedule_time_out) {
          const display = `${formatDbTime12h(emp.schedule_time_in)} - ${formatDbTime12h(emp.schedule_time_out)}`
          setTodaysHoursByEmployee(prev => ({
            ...prev,
            [employeeId]: display
          }))
          setTodaysScheduleInfoByEmployee(prev => ({ ...prev, [employeeId]: { summary: display, source: 'office' } }))
        } else {
          setTodaysScheduleInfoByEmployee(prev => ({ ...prev, [employeeId]: { summary: '-', source: 'unknown' } }))
        }
      }
    } catch {}
  }

  // Helper function to convert time to minutes for validation
  const timeToMinutes = (timeStr: string): number | null => {
    if (!timeStr) return null
    const trimmed = timeStr.trim()
    const match = trimmed.match(/^(0?[1-9]|1[0-2]):([0-5][0-9])\s?(AM|PM)$/i)
    if (!match) return null
    
    let hours = parseInt(match[1], 10)
    const minutes = parseInt(match[2], 10)
    const period = match[3].toUpperCase()
    
    if (period === 'PM' && hours !== 12) {
      hours += 12
    } else if (period === 'AM' && hours === 12) {
      hours = 0
    }
    
    return hours * 60 + minutes
  }


  // Helper function to convert day names to numbers
  const getDayNumber = (dayName: string): 1|2|3|4|5|6 => {
    const dayMap: { [key: string]: 1|2|3|4|5|6 } = {
      'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 
      'Thursday': 4, 'Friday': 5, 'Saturday': 6
    }
    return dayMap[dayName] || 1
  }

  // Helper function to convert user-friendly time to database format
  const convertToDatabaseTime = (timeString: string): string => {
    if (!timeString) return ''
    
    // Handle formats like "8:30 AM", "10:00 AM", "1:00 PM"
    const match = timeString.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
    if (!match) return timeString
    
    let hours = parseInt(match[1])
    const minutes = match[2]
    const ampm = match[3].toUpperCase()
    
    // Convert to 24-hour format
    if (ampm === 'AM' && hours === 12) {
      hours = 0
    } else if (ampm === 'PM' && hours !== 12) {
      hours += 12
    }
    
    return `${hours.toString().padStart(2, '0')}:${minutes}:00`
  }

  // Enhanced time detection based on schedule structure
  const detectTimePeriod = (time: string): 'AM' | 'PM' => {
    const [hours, minutes] = time.split(':').map(Number)
    const timeInMinutes = hours * 60 + minutes
    
    // AM period: 7:00 AM to 11:30 AM (420 to 690 minutes)
    // PM period: 12:00 PM to 8:30 PM (720 to 1290 minutes)
    if (timeInMinutes >= 420 && timeInMinutes <= 690) {
      return 'AM'
    } else if (timeInMinutes >= 720 && timeInMinutes <= 1290) {
      return 'PM'
    } else if (timeInMinutes < 420) {
      // Early morning (before 7:00 AM) - treat as AM
      return 'AM'
    } else {
      // Late evening (after 8:30 PM) - treat as PM
      return 'PM'
    }
  }

  // Helper function to format time for input fields with proper AM/PM detection
  const formatTimeForInput = (time: string): string => {
    const [hours, minutes] = time.split(':').map(Number)
    const period = detectTimePeriod(time)
    
    // Convert to 12-hour format
    let displayHours = hours
    if (hours > 12) {
      displayHours = hours - 12
    } else if (hours === 0) {
      displayHours = 12
    }
    
    return `${displayHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${period}`
  }

  // Calculate real stats from database
  // Helpers for viewing schedule
  const formatDbTime12h = (time: string): string => {
    if (!time) return ''
    // Check if time is already in 12-hour format (contains AM/PM)
    if (time.includes('AM') || time.includes('PM')) {
      // Already formatted - remove any duplicate AM/PM and return cleaned version
      const cleaned = time.trim()
      // Remove trailing AM/PM if there are duplicates (e.g., "09:00 AM AM" -> "09:00 AM")
      if (cleaned.match(/\s+(AM|PM)\s+(AM|PM)$/i)) {
        return cleaned.replace(/\s+(AM|PM)\s+(AM|PM)$/i, ' $1')
      }
      return cleaned
    }
    // Time is in 24-hour format (HH:MM:SS or HH:MM) - convert to 12-hour
    const [hStr, mStr] = time.split(':')
    const hNum = Number(hStr)
    const period = hNum >= 12 ? 'PM' : 'AM'
    const hh = hNum % 12 || 12
    // Extract just minutes (remove seconds if present)
    const minutes = mStr ? mStr.split(' ')[0] : '00'
    return `${hh.toString().padStart(2,'0')}:${minutes} ${period}`
  }

  const getScheduleDayName = (value: any): string | null => {
    if (value === null || value === undefined) return null

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value >= 1 && value <= 7) return dayNames[value === 7 ? 0 : value]
      if (value >= 0 && value <= 6) return dayNames[value]
    }

    const text = String(value).trim()
    if (!text) return null

    const numValue = Number(text)
    if (Number.isFinite(numValue)) {
      if (numValue >= 1 && numValue <= 7) return dayNames[numValue === 7 ? 0 : numValue]
      if (numValue === 0) return dayNames[0]
    }

    const lower = text.toLowerCase()
    const direct = dayNames.find((d) => d.toLowerCase() === lower)
    if (direct) return direct

    const abbreviated = dayNames.find((d) => d.toLowerCase().startsWith(lower.slice(0, 3)))
    if (abbreviated) return abbreviated

    return null
  }

  const isScheduleOnDay = (scheduleDay: any, targetDayName: string) => {
    const normalized = getScheduleDayName(scheduleDay)
    return normalized === targetDayName
  }
  
  const dayShort = (d: number) => ['Mon','Tue','Wed','Thu','Fri','Sat'][d-1] || ''

  const visibleExamSchedules = useMemo(
    () => (viewExamSchedules || []).filter((schedule: any) => isFutureOrTodayExamSchedule(schedule)),
    [viewExamSchedules]
  )

  const todaysScheduleOverview = useMemo(() => {
    const manilaNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }))
    const manilaToday = formatInTimeZone(new Date(), 'Asia/Manila', 'yyyy-MM-dd')
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const jsDay = manilaNow.getDay()
    const todayName = dayNames[jsDay]
    const isNonTeaching = String((viewEmployee as any)?.staff_type || '').trim().toLowerCase() === 'non-teaching'

    if (isNonTeaching) {
      return {
        todayName,
        isSunday: jsDay === 0,
        classesCount: 0,
        examsCount: 0,
        totalCount: 0,
        timeRange: '',
        items: [],
      }
    }

    const toMinutes = (timeStr: string): number => {
      if (!timeStr) return 0
      const cleanTime = timeStr.replace(/\s*(AM|PM)/gi, '').trim()
      const [hours, minutes] = cleanTime.split(':').map(Number)
      return hours * 60 + (minutes || 0)
    }

    const classRows = (viewSchedules || []).filter((s: any) => isScheduleOnDay(s.day_of_week, todayName))
    const examRows = visibleExamSchedules.filter((s: any) => {
      // Dated exams override day-of-week matching.
      const normalizedExamDate = getNormalizedExamDate(s.exam_date)
      if (normalizedExamDate) {
        return normalizedExamDate === manilaToday
      }

      // Weekly exams (no specific date) follow day-of-week.
      return isScheduleOnDay(s.day_of_week, todayName)
    })

    // Strict priority rule:
    // If any exam exists for today, show only exam schedules.
    // Class schedules are shown only when there are no exams for today.
    const effectiveClassRows = examRows.length > 0 ? [] : classRows

    const normalizedRows = [
      ...effectiveClassRows.map((row: any) => ({
        kind: 'Class',
        time_start: row.time_start,
        time_end: row.time_end,
        title: row.subject_name || row.subject || 'Untitled Subject',
        room: row.room_code || row.room || '-',
        section: row.section || '-',
      })),
      ...examRows.map((row: any) => ({
        kind: 'Exam',
        time_start: row.time_start,
        time_end: row.time_end,
        title: row.subject_name || row.subject || 'Untitled Subject',
        room: row.room_code || row.room || '-',
        section: row.section || '-',
        examType: row.exam_type || row.type || '-',
      })),
    ].sort((a, b) => toMinutes(a.time_start) - toMinutes(b.time_start))

    const first = normalizedRows[0]
    const last = normalizedRows[normalizedRows.length - 1]

    return {
      todayName,
      isSunday: jsDay === 0,
      classesCount: effectiveClassRows.length,
      examsCount: examRows.length,
      totalCount: normalizedRows.length,
      timeRange:
        first && last
          ? `${formatDbTime12h(first.time_start)} - ${formatDbTime12h(last.time_end)}`
          : '',
      items: normalizedRows,
    }
  }, [viewSchedules, visibleExamSchedules, viewEmployee])

  const weeklyScheduleConflicts = useMemo(() => {
    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

    const toMinutes = (timeStr: string): number => {
      if (!timeStr) return 0
      const cleanTime = timeStr.replace(/\s*(AM|PM)/gi, '').trim()
      const [hours, minutes] = cleanTime.split(':').map(Number)
      return (hours || 0) * 60 + (minutes || 0)
    }

    const detectDayConflicts = (rows: any[], kind: 'Class' | 'Exam', dayName: string) => {
      const sortedRows = [...rows].sort((a, b) => toMinutes(a.time_start) - toMinutes(b.time_start))
      const conflicts: Array<{
        day: string
        kind: 'Class' | 'Exam'
        currentTitle: string
        currentTime: string
        overlapsWith: string
        overlapsTime: string
      }> = []

      for (let i = 1; i < sortedRows.length; i++) {
        const prev = sortedRows[i - 1]
        const curr = sortedRows[i]

        if (toMinutes(prev.time_end) > toMinutes(curr.time_start)) {
          conflicts.push({
            day: dayName,
            kind,
            currentTitle: curr.subject_name || curr.subject || 'Untitled',
            currentTime: `${formatDbTime12h(curr.time_start)} - ${formatDbTime12h(curr.time_end)}`,
            overlapsWith: prev.subject_name || prev.subject || 'Untitled',
            overlapsTime: `${formatDbTime12h(prev.time_start)} - ${formatDbTime12h(prev.time_end)}`,
          })
        }
      }

      return conflicts
    }

    const allConflicts = weekdays.flatMap((dayName) => {
      const classes = (viewSchedules || []).filter((row: any) => isScheduleOnDay(row.day_of_week, dayName))
      const exams = visibleExamSchedules.filter((row: any) => isScheduleOnDay(row.day_of_week, dayName))
      return [
        ...detectDayConflicts(classes, 'Class', dayName),
        ...detectDayConflicts(exams, 'Exam', dayName),
      ]
    })

    return {
      total: allConflicts.length,
      items: allConflicts,
    }
  }, [viewSchedules, visibleExamSchedules])

  // Compute today's working hours from teaching schedule (Mon-Sat), fallback to default schedule
  const todaysWorkHours = useMemo(() => {
    if (todaysScheduleOverview.isSunday) {
      return 'Rest Day'
    }

    if (todaysScheduleOverview.timeRange) {
      return todaysScheduleOverview.timeRange
    }
    
    const directoryComputedHours = viewEmployee?.employee_id ? (todaysHoursByEmployee[viewEmployee.employee_id] || '').trim() : ''

    // For Teaching staff, keep snapshot strictly "today" scoped.
    // If there is no class/exam block today, show an explicit today-miss message.
    if (viewEmployee?.staff_type === 'Teaching') {
      if (
        directoryComputedHours &&
        directoryComputedHours !== '-' &&
        !/No Class\/Exam Schedule Today/i.test(directoryComputedHours)
      ) {
        return directoryComputedHours
      }
      return 'No Class/Exam Schedule'
    }
    
    // For Non-Teaching staff, fallback to employee's default schedule if no class schedules for today
    if (viewEmployee?.schedule_time_in && viewEmployee?.schedule_time_out) {
      return `${formatDbTime12h(viewEmployee.schedule_time_in)} - ${formatDbTime12h(viewEmployee.schedule_time_out)}`
    }
    
    return '-'
  }, [todaysScheduleOverview, viewEmployee, todaysHoursByEmployee])

  const isViewingNonTeaching = String((viewEmployee as any)?.staff_type || '').trim().toLowerCase() === 'non-teaching'

  useEffect(() => {
    if (!isLandscapeViewOpen || !focusFullOverviewToday) return
    const timer = setTimeout(() => {
      todaysDetailedBlocksRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setFocusFullOverviewToday(false)
    }, 120)
    return () => clearTimeout(timer)
  }, [isLandscapeViewOpen, focusFullOverviewToday])

  useEffect(() => {
    if (!isLandscapeViewOpen) {
      setShowBackToTopInOverview(false)
      return
    }

    const viewport = fullOverviewScrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null
    if (!viewport) return

    const handleScroll = () => {
      setShowBackToTopInOverview(viewport.scrollTop > 240)
    }

    handleScroll()
    viewport.addEventListener('scroll', handleScroll, { passive: true })
    return () => viewport.removeEventListener('scroll', handleScroll)
  }, [isLandscapeViewOpen])

  // Prepare component render data

  // Employee statistics calculations
  // CRITICAL: Calculate totalEmployees based on current filter state
  // When showing archived: count only archived employees
  // When showing active: count only active employees
  const totalEmployees = showArchivedEmployees
    ? allEmployees.filter((emp) => emp.is_active === false).length
    : allEmployees.filter((emp) => emp.is_active !== false).length

  const scopedDepartments = useMemo(() => {
    const staffType = String(effectiveStaffType || '').trim().toLowerCase()
    const inScopeDepartmentNames = new Set(
      (allEmployees || [])
        .map((emp) => String(emp?.department || '').trim())
        .filter(Boolean)
    )

    return (departments || [])
      .filter((dept) => {
        const category = String(dept?.category || '').trim().toLowerCase()
        if (category) return category === staffType
        return inScopeDepartmentNames.has(String(dept?.name || '').trim())
      })
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')))
  }, [allEmployees, departments, effectiveStaffType])

  const manageableDepartmentIds = new Set(scopedDepartments.map((dept) => dept.department_id))
  const canManageDepartment = (dept?: Department | null) => {
    if (!dept) return false
    return manageableDepartmentIds.has(dept.department_id)
  }

  useEffect(() => {
    if (selectedDepartment === 'All Departments') return
    const existsInScope = scopedDepartments.some((dept) => dept.name === selectedDepartment)
    if (!existsInScope) {
      setSelectedDepartment('All Departments')
    }
  }, [selectedDepartment, scopedDepartments])
  
  // CRITICAL: Exclude archived employees from all counts for stats
  const activeEmployees = allEmployees.filter((emp) => emp.is_active !== false)
  const activeToday = stats.presentToday
  const uniqueDepartments = scopedDepartments.length
  const avgWorkHours = 8.0
  
  // Count teaching staff by employment type (only active employees)
  const regularCount = activeEmployees.filter((emp) => {
    return emp.staff_type === 'Teaching' && (emp.employment_status || '').toLowerCase() === 'regular'
  }).length
  const partTimeCount = activeEmployees.filter((emp) => {
    return emp.staff_type === 'Teaching' && (emp.employment_status || '').toLowerCase() === 'part time'
  }).length
  const partTimeFullLoadCount = activeEmployees.filter((emp) => {
    return emp.staff_type === 'Teaching' && (emp.employment_status || '').toLowerCase() === 'part time full load'
  }).length
  const nonTeachingCount = activeEmployees.filter((emp) => {
    return emp.staff_type === 'Non-Teaching'
  }).length

  const employeePageThemeVars: React.CSSProperties = {
    ['--emp-surface' as any]: '#f4fbfb',
    ['--emp-surface-2' as any]: '#ecf8ff',
    ['--emp-border' as any]: '#cfe8ef',
    ['--emp-accent' as any]: '#0f766e',
    ['--emp-accent-soft' as any]: '#ccfbf1',
  }

  const availableSurnameInitials = useMemo(() => {
    const term = (deferredSearchTerm || '').toLowerCase()
    const set = new Set<string>()

    ;(allEmployees || []).forEach((emp) => {
      if (term) {
        const name = (emp.full_name || '').toLowerCase()
        const displayName = getEmployeeDisplayName(emp.full_name).toLowerCase()
        const sid = (emp.school_id || '').toLowerCase()
        const email = (emp.email || '').toLowerCase()
        const rfid = (emp.rfid_code || '')
        const hit = name.includes(term) || displayName.includes(term) || sid.includes(term) || email.includes(term) || rfid.includes(deferredSearchTerm)
        if (!hit) return
      }

      if (selectedDepartment !== 'All Departments' && emp.department !== selectedDepartment) return
      if (selectedStatus !== 'All Statuses' && emp.employment_status !== selectedStatus) return

      set.add(getEmployeeLastInitial(emp.full_name))
    })

    return set
  }, [allEmployees, deferredSearchTerm, selectedDepartment, selectedStatus, getEmployeeDisplayName, getEmployeeLastInitial])

  useEffect(() => {
    if (selectedLastInitial === 'All') return
    if (!availableSurnameInitials.has(selectedLastInitial)) {
      setSelectedLastInitial('All')
    }
  }, [selectedLastInitial, availableSurnameInitials])

  const hasActiveFilters =
    searchTerm.trim().length > 0 ||
    selectedDepartment !== 'All Departments' ||
    selectedStatus !== 'All Statuses' ||
    selectedLastInitial !== 'All' ||
    showArchivedEmployees

  const visibleActiveCount = filteredEmployees.filter((emp) => emp.is_active !== false).length
  const visibleArchivedCount = filteredEmployees.filter((emp) => emp.is_active === false).length
  const visibleTeachingCount = filteredEmployees.filter((emp) => emp.staff_type === 'Teaching').length
  const visibleNonTeachingCount = filteredEmployees.filter((emp) => emp.staff_type === 'Non-Teaching').length
  const rowHeight = directoryLayout === 'compact' ? 76 : 96

  const clearAllFilters = () => {
    setSearchTerm('')
    setSelectedDepartment('All Departments')
    setSelectedStatus('All Statuses')
    setSelectedLastInitial('All')
    setShowArchivedEmployees(false)
  }

  const openAddEmployeeDialog = () => {
    resetForm()
    clearValidationState()
    const defaultStaffType = effectiveStaffType as 'Teaching' | 'Non-Teaching'
    const defaultEmploymentStatus = defaultStaffType === 'Non-Teaching' ? 'Regular' : 'Part Time'

    try {
      const nextId = generateNextSchoolId(defaultStaffType)
      const finalId = nextId || (defaultStaffType === 'Non-Teaching' ? 'N101' : 'T100')

      setFormData(prev => ({
        ...prev,
        staff_type: defaultStaffType,
        employment_status: defaultEmploymentStatus,
        school_id: finalId,
      }))
      setNextIdPlaceholder(finalId)
    } catch {
      const fallbackId = defaultStaffType === 'Non-Teaching' ? 'N101' : 'T100'
      setFormData(prev => ({
        ...prev,
        staff_type: defaultStaffType,
        employment_status: defaultEmploymentStatus,
        school_id: fallbackId,
      }))
      setNextIdPlaceholder(fallbackId)
    }

    setIsAddDialogOpen(true)
  }

  return (
    <div style={employeePageThemeVars} className="relative space-y-4 sm:space-y-6 px-4 sm:px-6 py-4 sm:py-6 animate-fadeInUp overflow-hidden">
      <div className="pointer-events-none absolute -top-12 -left-12 h-48 w-48 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="pointer-events-none absolute top-16 -right-10 h-56 w-56 rounded-full bg-amber-300/20 blur-3xl" />

      {/* Header - Mobile Responsive */}
      <div className="relative flex flex-col gap-3 sm:gap-4 rounded-2xl border border-[var(--emp-border)] bg-linear-to-br from-white via-[var(--emp-surface)] to-[var(--emp-surface-2)] dark:from-neutral-900 dark:via-cyan-950/20 dark:to-amber-950/10 p-4 sm:p-6 shadow-lg">
        <div>
          <p className="text-[11px] sm:text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Staff Console</p>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Employee Management</h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mt-1 sm:mt-2">
            {isNonTeachingScopedAdmin
              ? 'Manage all non-teaching staff at STI College Santa Rosa'
              : 'Manage all teaching staff at STI College Santa Rosa'}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Dialog open={isAddDialogOpen} onOpenChange={(open)=>{
            // LOCKED: Prevent closing by clicking outside or pressing Escape
            // Only allow closing via Cancel button or after successful submission
            if (!open) {
              // Don't close - this is a locked dialog
              return
            }
            if (open) {
              // Reset form to ensure clean state with proper defaults
              resetForm()
              clearValidationState()
              // Default Staff Type based on resolved staff scope
              const defaultStaffType = effectiveStaffType as 'Teaching' | 'Non-Teaching'
              const defaultEmploymentStatus = defaultStaffType === 'Non-Teaching' ? 'Regular' : 'Part Time'
              try {
                const nextId = generateNextSchoolId(defaultStaffType)
                
                // Ensure we have a valid ID, fallback to default if generation fails
                const finalId = nextId || (defaultStaffType === 'Non-Teaching' ? 'N101' : 'T100')
                
                setFormData(prev => ({
                  ...prev,
                  staff_type: defaultStaffType,
                  employment_status: defaultEmploymentStatus,
                  school_id: finalId,
                }))
                setNextIdPlaceholder(finalId)
              } catch {
                // Fallback to default
                const fallbackId = defaultStaffType === 'Non-Teaching' ? 'N101' : 'T100'
                setFormData(prev => ({
                  ...prev,
                  staff_type: defaultStaffType,
                  employment_status: defaultEmploymentStatus,
                  school_id: fallbackId,
                }))
                setNextIdPlaceholder(fallbackId)
              }
            }
            
            // Clear RFID validation states when dialog closes
            if (!open) {
              if (rfidCheckTimeout) {
                clearTimeout(rfidCheckTimeout)
                setRfidCheckTimeout(null)
              }
              setIsCheckingRfid(false)
              setRfidCheckResult(null)
            }
            
            setIsAddDialogOpen(open)
          }}>
            <DialogTrigger asChild>
              <Button className="hidden">
                <Plus className="h-4 w-4" />
                Add Employee
              </Button>
            </DialogTrigger>
            <DialogContent 
              className="w-[95vw] sm:w-full sm:max-w-[1600px] h-[95vh] sm:h-[900px] min-w-0 sm:min-w-[1400px] min-h-[600px] sm:min-h-[750px] max-w-[98vw] max-h-[95vh] bg-linear-to-br from-white via-blue-50/30 to-purple-50/20 dark:from-neutral-900 dark:via-blue-950/20 dark:to-purple-950/20 p-0 overflow-hidden rounded-2xl shadow-2xl border-0 flex flex-col" 
              onOpenAutoFocus={(e) => e.preventDefault()}
              onInteractOutside={(e) => {
                // Prevent closing when clicking outside
                e.preventDefault()
              }}
              onEscapeKeyDown={(e) => {
                // Prevent closing with Escape key
                e.preventDefault()
              }}
              showCloseButton={false}
            >
              {/* Beautiful Header with Gradient - Mobile Responsive */}
              <div className="bg-linear-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 text-white relative overflow-hidden shrink-0">
                <div className="absolute inset-0 bg-white/5 backdrop-blur-sm" />
                <div className="relative w-full">
                  <DialogHeader>
                    <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
                      <div className="p-2 sm:p-2.5 lg:p-3 bg-white/20 backdrop-blur-md rounded-lg sm:rounded-xl shadow-lg">
                        <User className="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <DialogTitle className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight mb-1">Add New Employee</DialogTitle>
                        <DialogDescription className="text-blue-100 text-xs sm:text-sm lg:text-base">
                          Enter the details for the new employee. All fields marked with * are required.
                        </DialogDescription>
                      </div>
                    </div>
                  </DialogHeader>
                </div>
              </div>

              {/* Scrollable Content Area - Mobile Responsive */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar bg-gray-50 dark:bg-neutral-900">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8">
                  {/* Photo Upload Section - Full width on mobile, left side on desktop */}
                  <div className="lg:col-span-4">
                    <div className="lg:sticky lg:top-8">
                      <div className="bg-white dark:bg-neutral-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg border border-gray-200 dark:border-neutral-700">
                        <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-900 dark:text-gray-100">Employee Photo</h3>
                        <EmployeePhotoUpload
                          currentPhoto={formData.photo_path}
                          onPhotoChange={(photoPath) => {
                            handleInputChange('photo_path', photoPath || '')
                          }}
                          employeeName={formData.full_name || "Employee"}
                          hasError={invalidFields.has('photo_path')}
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Form Fields - Full width on mobile, right side on desktop */}
                  <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-neutral-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg border border-gray-200 dark:border-neutral-700">
                      <h3 className="text-base sm:text-lg font-semibold mb-4 sm:mb-6 text-gray-900 dark:text-gray-100">Employee Information</h3>
                      <div className="space-y-4 sm:space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                          <div className="space-y-2">
                            <Label htmlFor="full_name" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Full Name *</Label>
                            <Input 
                              id="full_name" 
                              placeholder="Enter full name"
                              maxLength={MAX_FULL_NAME_LENGTH}
                              value={formData.full_name}
                              onChange={(e) => {
                                handleInputChange('full_name', e.target.value.toUpperCase())
                                // Clear validation error when user starts typing
                                if (invalidFields.has('full_name')) {
                                  setInvalidFields(prev => {
                                    const next = new Set(prev)
                                    next.delete('full_name')
                                    return next
                                  })
                                }
                              }}
                              onBlur={(e) => {
                                // Validate on blur
                                const fullName = (e.target.value || '').trim()
                                if (!fullName) {
                                  setInvalidFields(prev => new Set(prev).add('full_name'))
                                }
                              }}
                              autoFocus={false}
                              className={`uppercase h-11 sm:h-12 text-sm sm:text-base border-gray-300 dark:border-neutral-600 focus:border-blue-500 focus:ring-blue-500 touch-manipulation ${invalidFields.has('full_name') ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                            />
                            {invalidFields.has('full_name') && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                Full Name is required. Please input a value.
                              </p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="school_id" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Employee ID *</Label>
                            <div className="h-11 sm:h-12 px-4 rounded-lg border border-gray-300 dark:border-neutral-600 bg-linear-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 flex items-center justify-between">
                              <span className="text-base sm:text-lg font-bold font-mono text-green-700 dark:text-green-300">
                                {nextIdPlaceholder || formData.school_id || (formData.staff_type === 'Non-Teaching' ? 'N101' : 'T100')}
                              </span>
                              <Badge className="bg-green-600 text-white dark:bg-green-700 border-0">
                                Next Available
                              </Badge>
                            </div>
                            <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" />
                              {formData.staff_type === 'Non-Teaching' 
                                ? 'Next ID will be automatically assigned (Format: N101, N102, N103...)' 
                                : 'Next ID will be automatically assigned (Format: T100, T101, T102...)'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label htmlFor="rfid_code" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">RFID Code *</Label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() => setIsRfidLocked(!isRfidLocked)}
                              >
                                {isRfidLocked ? (
                                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                    Locked
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                    </svg>
                                    Unlocked
                                  </span>
                                )}
                              </Button>
                            </div>
                            <Input 
                              id="rfid_code" 
                              autoComplete="off"
                              placeholder="0000000000"
                              value={formData.rfid_code}
                              onChange={(e) => {
                                if (!isRfidLocked) {
                                  const normalized = e.target.value.replace(/\D+/g, '').slice(0, 10)
                                  handleInputChange('rfid_code', normalized)
                                  // Clear validation error when user starts typing
                                  if (invalidFields.has('rfid_code')) {
                                    setInvalidFields(prev => {
                                      const next = new Set(prev)
                                      next.delete('rfid_code')
                                      return next
                                    })
                                  }
                                  // Trigger real-time RFID availability check
                                  checkRfidAvailability(normalized)
                                }
                              }}
                              onBlur={(e) => {
                                handleInputBlur('rfid_code', e.target.value)
                                // Validate on blur
                                const rfid = (e.target.value || '').trim()
                                if (rfid && !RFID_REGEX.test(rfid)) {
                                  setInvalidFields(prev => new Set(prev).add('rfid_code'))
                                }
                              }}
                              inputMode="numeric"
                              pattern="^\d{10}$"
                              maxLength={10 as any}
                              title="RFID must be 10 digits"
                              disabled={isRfidLocked}
                              className={`h-11 sm:h-12 text-sm sm:text-base border-gray-300 dark:border-neutral-600 focus:border-blue-500 focus:ring-blue-500 touch-manipulation ${invalidFields.has('rfid_code') ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''} ${isRfidLocked ? 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed' : ''}`}
                            />
                            
                            {/* Real-time RFID Availability Indicator */}
                            {isCheckingRfid && (
                              <div className="flex items-center gap-2 text-xs sm:text-sm text-blue-600 dark:text-blue-400 mt-1">
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Checking RFID availability...
                              </div>
                            )}
                            {!isCheckingRfid && rfidCheckResult === 'available' && formData.rfid_code.length === 10 && (
                              <div className="flex items-center gap-2 text-xs sm:text-sm text-green-600 dark:text-green-400 mt-1">
                                <CheckCircle className="h-4 w-4" />
                                RFID is available - ready to use
                              </div>
                            )}
                            {!isCheckingRfid && rfidCheckResult === 'taken' && formData.rfid_code.length === 10 && (
                              <div className="flex items-center gap-2 text-xs sm:text-sm text-red-600 dark:text-red-400 mt-1">
                                <XCircle className="h-4 w-4" />
                                RFID already exists - please use a different code
                              </div>
                            )}
                            
                            {invalidFields.has('rfid_code') && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                RFID Code must be exactly 10 digits (e.g., 1234567890)
                              </p>
                            )}
                          </div>
                          {/* Staff Type - locked to current admin scope */}
                          <div className="space-y-2">
                            <Label htmlFor="staff_type" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Staff Type *</Label>
                            <Select 
                              value={effectiveStaffType}
                              onValueChange={(value: 'Teaching' | 'Non-Teaching') => {
                                handleInputChange('staff_type', value)
                              }}
                              disabled={true}
                            >
                              <SelectTrigger className="h-11 sm:h-12 text-sm sm:text-base border-gray-300 dark:border-neutral-600 touch-manipulation bg-gray-100 dark:bg-gray-800 cursor-not-allowed">
                                <SelectValue placeholder="Select staff type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={effectiveStaffType}>{effectiveStaffType}</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {isNonTeachingScopedAdmin
                                ? 'Your account is restricted to Non-Teaching staff only.'
                                : 'Your account is restricted to Teaching staff only.'}
                            </p>
                          </div>
                          {/* Employment Status: Dropdown for both Teaching and Non-Teaching */}
                          <div className="space-y-2">
                            <Label htmlFor="employment_status" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                              Employment Status *
                            </Label>
                            <Select 
                              value={formData.employment_status} 
                              onValueChange={(value) => handleInputChange('employment_status', value)}
                            >
                              <SelectTrigger className="h-11 sm:h-12 text-sm sm:text-base border-gray-300 dark:border-neutral-600 touch-manipulation">
                                <SelectValue placeholder="Select employment status" />
                              </SelectTrigger>
                              <SelectContent>
                                {getEmploymentStatusOptions(formData.staff_type || 'Teaching').map((name: string) => (
                                  <SelectItem key={name} value={name}>{name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {/* Department moved below Staff Type + Employment Status */}
                          <div className="space-y-2">
                            <Label htmlFor="department" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Department *</Label>
                            <Select value={formData.department} onValueChange={(value) => {
                              if (value === '__ADD_MORE__') {
                                setDeptDialogSource('add-employee')
                                setEditingDept(null)
                                setDeptFormName("")
                                setDeptFormAcronym("")
                                setDeptFormDesc("")
                                // Auto-set category based on staff type
                                setDeptFormCategory(formData.staff_type === 'Teaching' || formData.staff_type === 'Non-Teaching' ? formData.staff_type : '')
                                // Clear validation errors when opening dialog
                                setDeptInvalidFields(new Set())
                                setDeptValidationErrors([])
                                setShowDeptValidationDialog(false)
                                setIsDeptDialogOpen(true)
                              } else {
                                handleInputChange('department', value)
                                // Clear validation error when user selects a department
                                if (invalidFields.has('department') && value && value !== '__ADD_MORE__') {
                                  setInvalidFields(prev => {
                                    const next = new Set(prev)
                                    next.delete('department')
                                    return next
                                  })
                                }
                              }
                            }}>
                              <SelectTrigger className={`h-11 sm:h-12 text-sm sm:text-base border-gray-300 dark:border-neutral-600 touch-manipulation ${invalidFields.has('department') ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}>
                                <SelectValue placeholder="Select department" />
                              </SelectTrigger>
                              <SelectContent>
                                {departments
                                  .filter((dept) => {
                                    if (!formData.staff_type) return false
                                    return dept.category === formData.staff_type
                                  })
                                  .map((dept) => (
                                    <SelectItem key={dept.department_id} value={dept.name}>
                                      {dept.acronym ? `${dept.acronym} - ${dept.name}` : dept.name}
                                    </SelectItem>
                                  ))}
                                <SelectItem value="__ADD_MORE__" className="text-blue-600 dark:text-blue-400 font-medium">
                                  <div className="flex items-center gap-2">
                                    <Plus className="h-4 w-4" />
                                    Add More...
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            {invalidFields.has('department') && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                Department is required. Please select a value.
                              </p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="email" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Email Address *</Label>
                            <Input 
                              id="email" 
                              type="email" 
                              autoComplete="off"
                              placeholder="employee@santarosa.sti.edu"
                              maxLength={MAX_EMAIL_LENGTH}
                              value={formData.email}
                              onChange={(e) => {
                                handleInputChange('email', e.target.value)
                                // Clear validation error when user starts typing
                                if (invalidFields.has('email')) {
                                  setInvalidFields(prev => {
                                    const next = new Set(prev)
                                    next.delete('email')
                                    return next
                                  })
                                }
                              }}
                              onBlur={(e) => {
                                // Validate on blur
                                const email = (e.target.value || '').trim()
                                if (email && !EMAIL_REGEX.test(email)) {
                                  setInvalidFields(prev => new Set(prev).add('email'))
                                }
                              }}
                              pattern="^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"
                              title="Enter a valid email address"
                              className={`h-11 sm:h-12 text-sm sm:text-base border-gray-300 dark:border-neutral-600 focus:border-blue-500 focus:ring-blue-500 touch-manipulation ${invalidFields.has('email') ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                            />
                            {invalidFields.has('email') && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                Please enter a valid email address (e.g., name@example.com)
                              </p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="phone" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Phone Number *</Label>
                            <Input 
                              id="phone" 
                              autoComplete="off"
                              placeholder="11 digits"
                              value={formData.phone}
                              onChange={(e) => {
                                handleInputChange('phone', e.target.value.replace(/\D+/g, '').slice(0, 11))
                                // Clear validation error when user starts typing
                                if (invalidFields.has('phone')) {
                                  setInvalidFields(prev => {
                                    const next = new Set(prev)
                                    next.delete('phone')
                                    return next
                                  })
                                }
                              }}
                              onBlur={(e) => {
                                handleInputBlur('phone', e.target.value)
                                // Validate on blur
                                const phone = (e.target.value || '').trim()
                                if (!phone) {
                                  setInvalidFields(prev => new Set(prev).add('phone'))
                                } else if (!PHONE_REGEX.test(phone)) {
                                  setInvalidFields(prev => new Set(prev).add('phone'))
                                }
                              }}
                              inputMode="numeric"
                              pattern="^09\d{9}$"
                              maxLength={11 as any}
                              title="Phone must be 11 digits starting with 09"
                              className={`h-11 sm:h-12 text-sm sm:text-base border-gray-300 dark:border-neutral-600 focus:border-blue-500 focus:ring-blue-500 touch-manipulation ${invalidFields.has('phone') ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                            />
                            {invalidFields.has('phone') && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                {!formData.phone ? "Phone Number is required. Please input a value." : "Phone must be 11 digits starting with 09"}
                              </p>
                            )}
                          </div>
                          {/* Hire Date field */}
                          <div className="space-y-2">
                            <Label htmlFor="hire_date" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Hire Date *</Label>
                            <Input
                              id="hire_date"
                              type="date"
                              value={(formData.hire_date || '').split('T')[0] || ''}
                              onChange={(e)=> handleInputChange('hire_date', e.target.value)}
                              className="h-11 sm:h-12 text-sm sm:text-base border-gray-300 dark:border-neutral-600 focus:border-blue-500 focus:ring-blue-500 touch-manipulation"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="start_date" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Start Date (Work Begin) *</Label>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setStartDatePickerOpen(true)}
                              className={cn(
                                "h-11 sm:h-12 w-full justify-start text-left font-normal border-gray-300 dark:border-neutral-600 text-sm sm:text-base touch-manipulation",
                                !formData.start_date && "text-muted-foreground",
                                invalidFields.has('start_date') && "border-red-500 dark:border-red-500"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {formData.start_date ? (
                                formatManilaDateLong(formData.start_date)
                              ) : (
                                <span className="text-gray-400">Select start date *</span>
                              )}
                            </Button>
                            
                            {/* Start Date Picker Dialog */}
                            <Dialog open={startDatePickerOpen} onOpenChange={setStartDatePickerOpen}>
                              <DialogContent className="sm:max-w-[425px] p-0">
                                <DialogHeader className="px-6 pt-6 pb-2">
                                  <DialogTitle className="text-lg font-semibold">Select Start Date</DialogTitle>
                                  <DialogDescription className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    Sundays are not selectable. Start date must be tomorrow or later (today cannot be selected), and on or after the hire date.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="px-6 pb-2">
                                  <Calendar
                                    mode="single"
                                    selected={formData.start_date ? (() => {
                                      try {
                                        const dateStr = String(formData.start_date).trim()
                                        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                                          return new Date(dateStr + 'T12:00:00Z')
                                        }
                                        return new Date(formData.start_date + 'T00:00:00')
                                      } catch {
                                        return undefined
                                      }
                                    })() : undefined}
                                    onSelect={(date) => {
                                      if (date) {
                                        const year = date.getFullYear()
                                        const month = String(date.getMonth() + 1).padStart(2, '0')
                                        const day = String(date.getDate()).padStart(2, '0')
                                        const formattedDate = `${year}-${month}-${day}`
                                        
                                        // Validate the date
                                        const validation = validateStartDateChange(
                                          formattedDate,
                                          formData.hire_date,
                                          editingEmployee ? (editingEmployee as any).start_date : undefined
                                        )
                                        
                                        if (!validation.valid) {
                                          toast({
                                            title: "Invalid date",
                                            description: validation.error || "Invalid start date",
                                            variant: "destructive"
                                          })
                                          return
                                        }
                                        
                                        handleInputChange('start_date', formattedDate)
                                        
                                        // Show warning if applicable
                                        if (validation.warning && editingEmployee) {
                                          toast({
                                            title: "Start date changed",
                                            description: validation.warning,
                                            variant: "default"
                                          })
                                        }
                                        
                                        setStartDatePickerOpen(false)
                                      }
                                    }}
                                    disabled={(date) => {
                                      // Disable Sundays (0 = Sunday)
                                      const dayOfWeek = date.getDay()
                                      if (dayOfWeek === 0) return true
                                      
                                      // CRITICAL: Use Manila timezone for today's date to ensure accurate comparison
                                      // Get today's date in Manila timezone (YYYY-MM-DD format)
                                      const today = getManilaToday()
                                      const todayObj = new Date(today + 'T00:00:00+08:00')
                                      todayObj.setHours(0, 0, 0, 0)
                                      
                                      // Convert selected date to Manila timezone for comparison
                                      const dateStr = format(date, 'yyyy-MM-dd')
                                      const dateToCheck = new Date(dateStr + 'T00:00:00+08:00')
                                      dateToCheck.setHours(0, 0, 0, 0)
                                      
                                      // Disable today and past dates (must be tomorrow or later)
                                      // CRITICAL: Use <= to exclude today (cannot start today)
                                      if (dateToCheck <= todayObj) return true
                                      
                                      // Disable dates before hire date
                                      if (formData.hire_date) {
                                        const hireDateStr = formData.hire_date.includes('T') ? formData.hire_date.split('T')[0] : formData.hire_date
                                        const hireDate = new Date(hireDateStr + 'T00:00:00+08:00')
                                        hireDate.setHours(0, 0, 0, 0)
                                        if (dateToCheck < hireDate) return true
                                      }
                                      
                                      // Disable dates more than 1 year in the future
                                      const maxDate = new Date(todayObj)
                                      maxDate.setFullYear(maxDate.getFullYear() + 1)
                                      if (dateToCheck > maxDate) return true
                                      
                                      return false
                                    }}
                                    captionLayout="dropdown"
                                    showOutsideDays={true}
                                    classNames={{
                                      disabled: "text-muted-foreground opacity-50 cursor-not-allowed",
                                    }}
                                  />
                                </div>
                                <div className="flex items-center justify-between px-6 pb-6 pt-2 border-t">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => {
                                      handleInputChange('start_date', '')
                                      setStartDatePickerOpen(false)
                                    }}
                                    className="text-sm"
                                  >
                                    Clear
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => {
                                      // CRITICAL: Use Manila timezone to get tomorrow's date
                                      // Get today's date in Manila timezone
                                      const today = getManilaToday()
                                      const todayObj = new Date(today + 'T00:00:00+08:00')
                                      
                                      // Calculate tomorrow in Manila timezone
                                      const tomorrow = new Date(todayObj)
                                      tomorrow.setDate(tomorrow.getDate() + 1)
                                      const dayOfWeek = tomorrow.getDay()
                                      
                                      // If tomorrow is Sunday, move to Monday
                                      if (dayOfWeek === 0) {
                                        tomorrow.setDate(tomorrow.getDate() + 1)
                                      }
                                      
                                      const formattedDate = format(tomorrow, 'yyyy-MM-dd')
                                      const validation = validateStartDateChange(
                                        formattedDate,
                                        formData.hire_date,
                                        editingEmployee ? (editingEmployee as any).start_date : undefined
                                      )
                                      
                                      if (validation.valid) {
                                        handleInputChange('start_date', formattedDate)
                                        setStartDatePickerOpen(false)
                                      } else {
                                        toast({
                                          title: "Invalid date",
                                          description: validation.error || "Cannot set tomorrow as start date",
                                          variant: "destructive"
                                        })
                                      }
                                    }}
                                    className="text-sm"
                                  >
                                    Tomorrow
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                            
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              Attendance logs will only be tracked from this date onwards. Dates before this will not show as "Absent". Today and Sundays are not allowed.
                            </p>
                            {formData.start_date && (
                              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mt-1">
                                This employee will start working on {formatManilaDateLong(formData.start_date)}.
                              </p>
                            )}
                          </div>
                          
                          {/* Work Schedule (Non-Teaching only). Teaching staff schedule is derived from class/exam schedules. */}
                          {formData.staff_type === 'Non-Teaching' && (
                            <div className="space-y-2">
                              <Label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                                Work Schedule
                                {formData.department && (
                                  <span className="ml-2 text-xs font-normal text-blue-600 dark:text-blue-400">
                                    ({formData.department})
                                  </span>
                                )}
                              </Label>
                              {formData.department && DEPARTMENT_WORK_SCHEDULES[formData.department] ? (
                                <div className="space-y-2">
                                  <Select 
                                    value={formData.schedule_time_in && formData.schedule_time_out 
                                      ? `${formData.schedule_time_in}|${formData.schedule_time_out}` 
                                      : ""
                                    } 
                                    onValueChange={(value) => {
                                      const [timeIn, timeOut] = value.split('|')
                                      handleInputChange('schedule_time_in', timeIn)
                                      handleInputChange('schedule_time_out', timeOut)
                                      if (invalidFields.has('schedule_time_in') || invalidFields.has('schedule_time_out')) {
                                        setInvalidFields(prev => {
                                          const next = new Set(prev)
                                          next.delete('schedule_time_in')
                                          next.delete('schedule_time_out')
                                          return next
                                        })
                                      }
                                    }}
                                  >
                                    <SelectTrigger className={cn(
                                      "h-11 sm:h-12 text-sm sm:text-base border-gray-300 dark:border-neutral-600",
                                      (invalidFields.has('schedule_time_in') || invalidFields.has('schedule_time_out')) && "border-red-500 focus:border-red-500 focus:ring-red-500"
                                    )}>
                                      <SelectValue placeholder="Select work schedule..." />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[300px]">
                                      {DEPARTMENT_WORK_SCHEDULES[formData.department].map((schedule, index) => (
                                        <SelectItem 
                                          key={index} 
                                          value={`${schedule.time_in}|${schedule.time_out}`}
                                        >
                                          {schedule.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {(invalidFields.has('schedule_time_in') || invalidFields.has('schedule_time_out')) && (
                                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                      Work Schedule is required for Non-Teaching staff.
                                    </p>
                                  )}
                                  <p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded p-2">
                                    ✓ Showing official {formData.department} department schedules
                                  </p>
                                </div>
                              ) : (
                                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                                  <p className="text-xs text-amber-800 dark:text-amber-300">
                                    ⚠️ Please select a department first to see available work schedules
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Beautiful Footer with Actions - Mobile Responsive */}
              <div className="bg-white dark:bg-neutral-800 border-t border-gray-200 dark:border-neutral-700 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 shrink-0">
                <div className={`flex flex-col sm:flex-row gap-2 sm:gap-4 w-full sm:ml-auto`}>
                  <Button 
                    size="lg"
                    variant="outline" 
                    onClick={() => {
                      setIsAddDialogOpen(false)
                      clearValidationState()
                      resetForm()
                    }}
                    className="px-4 sm:px-8 h-11 sm:h-12 font-medium w-full sm:w-auto text-sm sm:text-base touch-manipulation"
                  >
                    Cancel
                  </Button>
                  <Button 
                    size="lg"
                    onClick={handleAddEmployee} 
                    className="btn-sti-primary px-4 sm:px-8 h-11 sm:h-12 font-semibold shadow-lg hover:shadow-xl transition-all duration-200 w-full sm:w-auto text-sm sm:text-base touch-manipulation"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Employee
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          
          {/* Edit Employee Dialog */}
          <Dialog open={isEditDialogOpen} onOpenChange={(open)=>{
            // LOCKED: Prevent closing by clicking outside or pressing Escape
            // Only allow closing via Cancel button or after successful submission
            if (!open) {
              // Don't close - this is a locked dialog
              return
            }
            setIsEditDialogOpen(open)
            clearValidationState()
          }}>
            <DialogContent 
              className="w-[95vw] sm:w-full sm:max-w-[1600px] h-[95vh] sm:h-[900px] min-w-0 sm:min-w-[1400px] min-h-[600px] sm:min-h-[750px] max-w-[98vw] max-h-[95vh] bg-linear-to-br from-white via-blue-50/30 to-purple-50/20 dark:from-neutral-900 dark:via-blue-950/20 dark:to-purple-950/20 p-0 overflow-hidden rounded-2xl shadow-2xl border-0 flex flex-col" 
              onOpenAutoFocus={(e) => e.preventDefault()}
              onInteractOutside={(e) => {
                // Prevent closing when clicking outside
                e.preventDefault()
              }}
              onEscapeKeyDown={(e) => {
                // Prevent closing with Escape key
                e.preventDefault()
              }}
              showCloseButton={false}
            >
              {/* Beautiful Header with Gradient - Mobile Responsive */}
              <div className="bg-linear-to-r from-indigo-600 via-purple-600 to-pink-600 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 text-white relative overflow-hidden shrink-0">
                <div className="absolute inset-0 bg-white/5 backdrop-blur-sm" />
                <div className="relative w-full">
                  <DialogHeader>
                    <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
                      <div className="p-2 sm:p-2.5 lg:p-3 bg-white/20 backdrop-blur-md rounded-lg sm:rounded-xl shadow-lg">
                        <Edit className="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <DialogTitle className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight mb-1">Edit Employee</DialogTitle>
                        <DialogDescription className="text-indigo-100 text-xs sm:text-sm lg:text-base">
                          Update the details for <span className="font-semibold text-white">{editingEmployee?.full_name}</span>. All fields marked with * are required.
                        </DialogDescription>
                      </div>
                    </div>
                  </DialogHeader>
                </div>
              </div>

              {/* Scrollable Content Area - Mobile Responsive */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar bg-gray-50 dark:bg-neutral-900">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8">
                  {/* Photo Upload Section - Full width on mobile, left side on desktop */}
                  <div className="lg:col-span-4">
                    <div className="lg:sticky lg:top-8">
                      <div className="bg-white dark:bg-neutral-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg border border-gray-200 dark:border-neutral-700">
                        <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-900 dark:text-gray-100">Employee Photo</h3>
                        <EmployeePhotoUpload
                          currentPhoto={formData.photo_path}
                          onPhotoChange={(photoPath) => handleInputChange('photo_path', photoPath || '')}
                          employeeName={formData.full_name || editingEmployee?.full_name || "Employee"}
                          hasError={invalidFields.has('photo_path')}
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Form Fields - Full width on mobile, right side on desktop */}
                  <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-neutral-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg border border-gray-200 dark:border-neutral-700">
                      <h3 className="text-base sm:text-lg font-semibold mb-4 sm:mb-6 text-gray-900 dark:text-gray-100">Employee Information</h3>
                      <div className="space-y-4 sm:space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                          <div className="space-y-2">
                            <Label htmlFor="edit-full_name" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Full Name *</Label>
                            <Input 
                              id="edit-full_name" 
                              placeholder="Enter full name"
                              maxLength={MAX_FULL_NAME_LENGTH}
                              value={formData.full_name}
                              onChange={(e) => handleInputChange('full_name', e.target.value.toUpperCase())}
                              className={`uppercase h-11 sm:h-12 text-sm sm:text-base border-gray-300 dark:border-neutral-600 focus:border-indigo-500 focus:ring-indigo-500 touch-manipulation ${invalidFields.has('full_name') ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                              autoFocus={false}
                            />
                            {invalidFields.has('full_name') && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                Full Name is required. Please input a value.
                              </p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="edit-school_id" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Employee ID *</Label>
                            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                              <span>
                                {editingEmployee?.staff_type === 'Non-Teaching' 
                                  ? 'Format: N### for Non-Teaching (e.g., N100, N101)' 
                                  : 'Format: T### for Teaching (e.g., T100, T101)'}
                              </span>
                              <span className="text-green-600 dark:text-green-400">Locked</span>
                            </div>
                            <Input 
                              id="edit-school_id" 
                              placeholder="T### or N###"
                              value={formData.school_id}
                              disabled={true}
                              title="Employee ID is locked and cannot be edited"
                              className={`h-11 sm:h-12 text-sm sm:text-base border-gray-300 dark:border-neutral-600 touch-manipulation bg-gray-100 dark:bg-gray-700 cursor-not-allowed`}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="edit-rfid_code" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">RFID Code *</Label>
                            <Input 
                              id="edit-rfid_code" 
                              placeholder="0000000000"
                              value={formData.rfid_code}
                              onChange={(e) => handleInputChange('rfid_code', e.target.value.replace(/\D+/g, '').slice(0, 10))}
                              onBlur={(e) => handleInputBlur('rfid_code', e.target.value)}
                              inputMode="numeric"
                              pattern="^05\\d{8}$"
                              maxLength={10 as any}
                              className={`h-11 sm:h-12 text-sm sm:text-base border-gray-300 dark:border-neutral-600 focus:border-indigo-500 focus:ring-indigo-500 touch-manipulation ${invalidFields.has('rfid_code') ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="edit-department" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Department *</Label>
                            <Select value={formData.department} onValueChange={(value) => {
                              if (value === '__ADD_MORE__') {
                                setDeptDialogSource('edit-employee')
                                setEditingDept(null)
                                setDeptFormName("")
                                setDeptFormAcronym("")
                                setDeptFormDesc("")
                                // Auto-set category based on staff type
                                setDeptFormCategory(formData.staff_type === 'Teaching' || formData.staff_type === 'Non-Teaching' ? formData.staff_type : '')
                                // Clear validation errors when opening dialog
                                setDeptInvalidFields(new Set())
                                setDeptValidationErrors([])
                                setShowDeptValidationDialog(false)
                                setIsDeptDialogOpen(true)
                              } else {
                                handleInputChange('department', value)
                                // Clear validation error when user selects a department
                                if (invalidFields.has('department') && value && value !== '__ADD_MORE__') {
                                  setInvalidFields(prev => {
                                    const next = new Set(prev)
                                    next.delete('department')
                                    return next
                                  })
                                }
                              }
                            }}>
                              <SelectTrigger className={`h-11 border-gray-300 dark:border-neutral-600 ${invalidFields.has('department') ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}>
                                <SelectValue placeholder="Select department" />
                              </SelectTrigger>
                              <SelectContent>
                                {departments
                                  .filter((dept) => {
                                    // STRICT FILTERING: Only show departments that exactly match the selected staff type category
                                    // Teaching Staff can ONLY see Teaching departments
                                    // Non-Teaching Staff can ONLY see Non-Teaching departments
                                    if (!formData.staff_type) return false // Don't show any if no staff type selected
                                    // Only show departments that have the exact matching category (no departments without category)
                                    return dept.category === formData.staff_type
                                  })
                                  .map((dept) => (
                                    <SelectItem key={dept.department_id} value={dept.name}>
                                      {dept.acronym ? `${dept.acronym} - ${dept.name}` : dept.name}
                                    </SelectItem>
                                  ))}
                                <SelectItem value="__ADD_MORE__" className="text-blue-600 dark:text-blue-400 font-medium">
                                  <div className="flex items-center gap-2">
                                    <Plus className="h-4 w-4" />
                                    Add More...
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            {invalidFields.has('department') && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                Department is required. Please select a value.
                              </p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="edit-staff_type" className="text-sm font-medium text-gray-700 dark:text-gray-300">Staff Type *</Label>
                            <Select 
                              value={effectiveStaffType}
                              onValueChange={(value: 'Teaching' | 'Non-Teaching') => {
                                handleInputChange('staff_type', value)
                              }}
                              disabled={true}
                            >
                              <SelectTrigger className="h-11 border-gray-300 dark:border-neutral-600 opacity-60 cursor-not-allowed">
                                <SelectValue placeholder="Select staff type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={effectiveStaffType}>{effectiveStaffType}</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {isNonTeachingScopedAdmin
                                ? 'Staff Type is locked to Non-Teaching for your account.'
                                : 'Staff Type is locked to Teaching for your account.'}
                            </p>
                          </div>
                          {/* Employment Status: Dropdown for both Teaching and Non-Teaching */}
                          <div className="space-y-2">
                            <Label htmlFor="employment_status" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Employment Status *
                            </Label>
                            <Select 
                              value={formData.employment_status} 
                              onValueChange={(value) => handleInputChange('employment_status', value)}
                            >
                              <SelectTrigger className="h-11 border-gray-300 dark:border-neutral-600">
                                <SelectValue placeholder="Select employment status" />
                              </SelectTrigger>
                              <SelectContent>
                                {getEmploymentStatusOptions(formData.staff_type || 'Teaching').map((name: string) => (
                                  <SelectItem key={name} value={name}>{name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="edit-email" className="text-sm font-medium text-gray-700 dark:text-gray-300">Email Address *</Label>
                            <Input 
                              id="edit-email" 
                              type="email" 
                              placeholder="employee@santarosa.sti.edu"
                              maxLength={MAX_EMAIL_LENGTH}
                              value={formData.email}
                              onChange={(e) => handleInputChange('email', e.target.value)}
                              className={`h-11 border-gray-300 dark:border-neutral-600 focus:border-indigo-500 focus:ring-indigo-500 ${invalidFields.has('email') ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="edit-phone" className="text-sm font-medium text-gray-700 dark:text-gray-300">Phone Number *</Label>
                            <Input 
                              id="edit-phone" 
                              placeholder="11 digits"
                              value={formData.phone}
                              onChange={(e) => {
                                handleInputChange('phone', e.target.value.replace(/\D+/g, '').slice(0, 11))
                                // Clear validation error when user starts typing
                                if (invalidFields.has('phone')) {
                                  setInvalidFields(prev => {
                                    const next = new Set(prev)
                                    next.delete('phone')
                                    return next
                                  })
                                }
                              }}
                              onBlur={(e) => {
                                handleInputBlur('phone', e.target.value)
                                // Validate on blur
                                const phone = (e.target.value || '').trim()
                                if (!phone) {
                                  setInvalidFields(prev => new Set(prev).add('phone'))
                                } else if (!PHONE_REGEX.test(phone)) {
                                  setInvalidFields(prev => new Set(prev).add('phone'))
                                }
                              }}
                              inputMode="numeric"
                              pattern="^09\\d{9}$"
                              maxLength={11 as any}
                              className={`h-11 border-gray-300 dark:border-neutral-600 focus:border-indigo-500 focus:ring-indigo-500 ${invalidFields.has('phone') ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                            />
                            {invalidFields.has('phone') && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                {!formData.phone ? "Phone Number is required. Please input a value." : "Phone must be 11 digits starting with 09"}
                              </p>
                            )}
                          </div>
                          {/* Hire Date field */}
                          <div className="space-y-2">
                            <Label htmlFor="edit-hire_date" className="text-sm font-medium text-gray-700 dark:text-gray-300">Hire Date *</Label>
                            <Input
                              id="edit-hire_date"
                              type="date"
                              value={(formData.hire_date || '').split('T')[0] || ''}
                              onChange={(e)=> handleInputChange('hire_date', e.target.value)}
                              className={`h-11 border-gray-300 dark:border-neutral-600 focus:border-indigo-500 focus:ring-indigo-500 ${invalidFields.has('hire_date') ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                            />
                            {invalidFields.has('hire_date') && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                Hire Date is required. Please select a date.
                              </p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="edit-start_date" className="text-sm font-medium text-gray-700 dark:text-gray-300">Start Date (Work Begin) *</Label>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setEditStartDatePickerOpen(true)}
                              className={cn(
                                "h-11 w-full justify-start text-left font-normal border-gray-300 dark:border-neutral-600",
                                !formData.start_date && "text-muted-foreground",
                                invalidFields.has('start_date') && "border-red-500 dark:border-red-500"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {formData.start_date ? (
                                formatManilaDateLong(formData.start_date)
                              ) : (
                                <span className="text-gray-400">Select start date *</span>
                              )}
                            </Button>
                            
                            {/* Edit Start Date Picker Dialog */}
                            <Dialog open={editStartDatePickerOpen} onOpenChange={setEditStartDatePickerOpen}>
                              <DialogContent className="sm:max-w-[425px] p-0">
                                <DialogHeader className="px-6 pt-6 pb-2">
                                  <DialogTitle className="text-lg font-semibold">Select Start Date</DialogTitle>
                                  <DialogDescription className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    Sundays are not selectable. Start date must be tomorrow or later (today cannot be selected), and on or after the hire date.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="px-6 pb-2">
                                  <Calendar
                                    mode="single"
                                    selected={formData.start_date ? (() => {
                                      try {
                                        const dateStr = String(formData.start_date).trim()
                                        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                                          return new Date(dateStr + 'T12:00:00Z')
                                        }
                                        return new Date(formData.start_date + 'T00:00:00')
                                      } catch {
                                        return undefined
                                      }
                                    })() : undefined}
                                    onSelect={(date) => {
                                      if (date) {
                                        const year = date.getFullYear()
                                        const month = String(date.getMonth() + 1).padStart(2, '0')
                                        const day = String(date.getDate()).padStart(2, '0')
                                        const formattedDate = `${year}-${month}-${day}`
                                        
                                        // Validate the date
                                        const validation = validateStartDateChange(
                                          formattedDate,
                                          formData.hire_date,
                                          editingEmployee ? (editingEmployee as any).start_date : undefined
                                        )
                                        
                                        if (!validation.valid) {
                                          toast({
                                            title: "Invalid date",
                                            description: validation.error || "Invalid start date",
                                            variant: "destructive"
                                          })
                                          return
                                        }
                                        
                                        handleInputChange('start_date', formattedDate)
                                        
                                        // Show warning if applicable
                                        if (validation.warning && editingEmployee) {
                                          toast({
                                            title: "Start date changed",
                                            description: validation.warning,
                                            variant: "default"
                                          })
                                        }
                                        
                                        setEditStartDatePickerOpen(false)
                                      }
                                    }}
                                    disabled={(date) => {
                                      // Disable Sundays (0 = Sunday)
                                      const dayOfWeek = date.getDay()
                                      if (dayOfWeek === 0) return true
                                      
                                      // CRITICAL: Use Manila timezone for today's date to ensure accurate comparison
                                      // Get today's date in Manila timezone (YYYY-MM-DD format)
                                      const today = getManilaToday()
                                      const todayObj = new Date(today + 'T00:00:00+08:00')
                                      todayObj.setHours(0, 0, 0, 0)
                                      
                                      // Convert selected date to Manila timezone for comparison
                                      const dateStr = format(date, 'yyyy-MM-dd')
                                      const dateToCheck = new Date(dateStr + 'T00:00:00+08:00')
                                      dateToCheck.setHours(0, 0, 0, 0)
                                      
                                      // Disable today and past dates (must be tomorrow or later)
                                      // CRITICAL: Use <= to exclude today (cannot start today)
                                      if (dateToCheck <= todayObj) return true
                                      
                                      // Disable dates before hire date
                                      if (formData.hire_date) {
                                        const hireDateStr = formData.hire_date.includes('T') ? formData.hire_date.split('T')[0] : formData.hire_date
                                        const hireDate = new Date(hireDateStr + 'T00:00:00+08:00')
                                        hireDate.setHours(0, 0, 0, 0)
                                        if (dateToCheck < hireDate) return true
                                      }
                                      
                                      // Disable dates more than 1 year in the future
                                      const maxDate = new Date(todayObj)
                                      maxDate.setFullYear(maxDate.getFullYear() + 1)
                                      if (dateToCheck > maxDate) return true
                                      
                                      return false
                                    }}
                                    captionLayout="dropdown"
                                    showOutsideDays={true}
                                    classNames={{
                                      disabled: "text-muted-foreground opacity-50 cursor-not-allowed",
                                    }}
                                  />
                                </div>
                                <div className="flex items-center justify-between px-6 pb-6 pt-2 border-t">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => {
                                      handleInputChange('start_date', '')
                                      setEditStartDatePickerOpen(false)
                                    }}
                                    className="text-sm"
                                  >
                                    Clear
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => {
                                      // CRITICAL: Use Manila timezone to get tomorrow's date
                                      // Get today's date in Manila timezone
                                      const today = getManilaToday()
                                      const todayObj = new Date(today + 'T00:00:00+08:00')
                                      
                                      // Calculate tomorrow in Manila timezone
                                      const tomorrow = new Date(todayObj)
                                      tomorrow.setDate(tomorrow.getDate() + 1)
                                      const dayOfWeek = tomorrow.getDay()
                                      
                                      // If tomorrow is Sunday, move to Monday
                                      if (dayOfWeek === 0) {
                                        tomorrow.setDate(tomorrow.getDate() + 1)
                                      }
                                      
                                      const formattedDate = format(tomorrow, 'yyyy-MM-dd')
                                      const validation = validateStartDateChange(
                                        formattedDate,
                                        formData.hire_date,
                                        editingEmployee ? (editingEmployee as any).start_date : undefined
                                      )
                                      
                                      if (validation.valid) {
                                        handleInputChange('start_date', formattedDate)
                                        setEditStartDatePickerOpen(false)
                                      } else {
                                        toast({
                                          title: "Invalid date",
                                          description: validation.error || "Cannot set tomorrow as start date",
                                          variant: "destructive"
                                        })
                                      }
                                    }}
                                    className="text-sm"
                                  >
                                    Tomorrow
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                            
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              Attendance logs will only be tracked from this date onwards. Dates before this will not show as "Absent". Today and Sundays are not allowed.
                            </p>
                            {formData.start_date && (
                              <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mt-1">
                                This employee will start working on {formatManilaDateLong(formData.start_date)}.
                              </p>
                            )}
                          </div>
                          
                          {/* Work Schedule (Non-Teaching only). Teaching staff schedule is derived from class/exam schedules. */}
                          {formData.staff_type === 'Non-Teaching' && (
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Work Schedule
                                {formData.department && (
                                  <span className="ml-2 text-xs font-normal text-blue-600 dark:text-blue-400">
                                    ({formData.department})
                                  </span>
                                )}
                              </Label>
                              {formData.department && DEPARTMENT_WORK_SCHEDULES[formData.department] ? (
                                <div className="space-y-2">
                                  <Select 
                                    value={formData.schedule_time_in && formData.schedule_time_out 
                                      ? `${formData.schedule_time_in}|${formData.schedule_time_out}` 
                                      : ""
                                    } 
                                    onValueChange={(value) => {
                                      const [timeIn, timeOut] = value.split('|')
                                      handleInputChange('schedule_time_in', timeIn)
                                      handleInputChange('schedule_time_out', timeOut)
                                      if (invalidFields.has('schedule_time_in') || invalidFields.has('schedule_time_out')) {
                                        setInvalidFields(prev => {
                                          const next = new Set(prev)
                                          next.delete('schedule_time_in')
                                          next.delete('schedule_time_out')
                                          return next
                                        })
                                      }
                                    }}
                                  >
                                    <SelectTrigger className={cn(
                                      "h-11 border-gray-300 dark:border-neutral-600",
                                      (invalidFields.has('schedule_time_in') || invalidFields.has('schedule_time_out')) && "border-red-500 focus:border-red-500 focus:ring-red-500"
                                    )}>
                                      <SelectValue placeholder="Select work schedule..." />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[300px]">
                                      {DEPARTMENT_WORK_SCHEDULES[formData.department].map((schedule, index) => (
                                        <SelectItem 
                                          key={index} 
                                          value={`${schedule.time_in}|${schedule.time_out}`}
                                        >
                                          {schedule.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {(invalidFields.has('schedule_time_in') || invalidFields.has('schedule_time_out')) && (
                                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                      Work Schedule is required for Non-Teaching staff.
                                    </p>
                                  )}
                                  <p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded p-2">
                                    ✓ Showing official {formData.department} department schedules
                                  </p>
                                </div>
                              ) : (
                                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                                  <p className="text-xs text-amber-800 dark:text-amber-300">
                                    ⚠️ Please select a department first to see available work schedules
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Beautiful Footer with Actions - Mobile Responsive */}
              <div className="bg-white dark:bg-neutral-800 border-t border-gray-200 dark:border-neutral-700 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 sm:gap-4 shrink-0">
                <div className={`flex flex-col sm:flex-row gap-2 sm:gap-4 w-full sm:w-auto sm:ml-auto`}>
                  <Button
                    size="lg"
                    variant="destructive"
                    onClick={() => handleDeleteClick(editingEmployee!.employee_id, formData.full_name || editingEmployee?.full_name || 'Employee')}
                    className="px-4 sm:px-8 h-11 sm:h-12 font-medium shadow-lg hover:shadow-xl transition-all duration-200 w-full sm:w-auto text-sm sm:text-base touch-manipulation"
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    Archive Employee
                  </Button>
                  <Button
                    size="lg"
                    variant="destructive"
                    onClick={() => {
                      setEmployeeToPermanentlyDelete({ id: editingEmployee!.employee_id, name: formData.full_name || editingEmployee?.full_name || 'Employee' })
                      setPermanentDeleteDialogOpen(true)
                    }}
                    className="px-4 sm:px-8 h-11 sm:h-12 font-medium shadow-lg hover:shadow-xl transition-all duration-200 w-full sm:w-auto text-sm sm:text-base touch-manipulation bg-red-700 hover:bg-red-800 dark:bg-red-900 dark:hover:bg-red-800"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Permanently Delete
                  </Button>
                  <Button 
                    size="lg"
                    variant="outline" 
                    onClick={() => {
                      setIsEditDialogOpen(false)
                      setEditingEmployee(null)
                      clearValidationState()
                      resetForm()
                    }}
                    className="px-4 sm:px-8 h-11 sm:h-12 font-medium w-full sm:w-auto text-sm sm:text-base touch-manipulation"
                  >
                    Cancel
                  </Button>
                  <Button 
                    size="lg"
                    onClick={handleUpdateEmployee} 
                    className="btn-sti-primary px-4 sm:px-8 h-11 sm:h-12 font-semibold shadow-lg hover:shadow-xl transition-all duration-200 w-full sm:w-auto text-sm sm:text-base touch-manipulation"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <Edit className="h-4 w-4 mr-2" />
                        Update Employee
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Restore Employee Dialog - Locked (Cannot close by clicking outside) */}
          <Dialog 
            open={isRestoreDialogOpen} 
            onOpenChange={(open) => {
              // LOCKED: Prevent closing by clicking outside
              // Only allow closing programmatically or via Cancel button
              if (!open) {
                // Don't close - this is a locked dialog
                return
              }

              setIsRestoreDialogOpen(open)
            }}
          >
            <DialogContent 
              className="w-[95vw] sm:w-full sm:max-w-[1600px] h-[95vh] sm:h-[900px] min-w-0 sm:min-w-[1400px] min-h-[600px] sm:min-h-[750px] max-w-[98vw] max-h-[95vh] bg-linear-to-br from-white via-green-50/30 to-emerald-50/20 dark:from-neutral-900 dark:via-green-950/20 dark:to-emerald-950/20 p-0 overflow-hidden rounded-2xl shadow-2xl border-0 flex flex-col" 
              onOpenAutoFocus={(e) => e.preventDefault()}
              showCloseButton={false}
              onInteractOutside={(e) => {
                // LOCKED: Prevent closing by clicking outside
                e.preventDefault()
              }}
              onEscapeKeyDown={(e) => {
                // LOCKED: Prevent closing by pressing ESC
                e.preventDefault()
              }}
            >
              {/* Beautiful Header with Gradient - Green theme for restore */}
              <div className="bg-linear-to-r from-green-600 via-emerald-600 to-teal-600 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 text-white relative overflow-hidden shrink-0">
                <div className="absolute inset-0 bg-white/5 backdrop-blur-sm" />
                <div className="relative w-full">
                  <DialogHeader>
                    <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
                      <div className="p-2 sm:p-2.5 lg:p-3 bg-white/20 backdrop-blur-md rounded-lg sm:rounded-xl shadow-lg">
                        <RefreshCw className="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <DialogTitle className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight mb-1">Restore Employee</DialogTitle>
                        <DialogDescription className="text-green-100 text-xs sm:text-sm lg:text-base">
                          Review and update the details for <span className="font-semibold text-white">{restoringEmployee?.full_name}</span> before restoring. <span className="font-semibold text-yellow-200">Start Date has been reset to tomorrow (today cannot be selected).</span> All fields marked with * are required.
                        </DialogDescription>
                      </div>
                    </div>
                  </DialogHeader>
                </div>
              </div>

              {/* Scrollable Content Area - Mobile Responsive */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar bg-gray-50 dark:bg-neutral-900">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8">
                  {/* Photo Upload Section - Full width on mobile, left side on desktop */}
                  <div className="lg:col-span-4">
                    <div className="lg:sticky lg:top-8">
                      <div className="bg-white dark:bg-neutral-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg border border-gray-200 dark:border-neutral-700">
                        <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-900 dark:text-gray-100">Employee Photo</h3>
                        <EmployeePhotoUpload
                          currentPhoto={formData.photo_path}
                          onPhotoChange={(photoPath) => handleInputChange('photo_path', photoPath || '')}
                          employeeName={formData.full_name || restoringEmployee?.full_name || "Employee"}
                          hasError={invalidFields.has('photo_path')}
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Form Fields - Full width on mobile, right side on desktop */}
                  <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-neutral-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg border border-gray-200 dark:border-neutral-700">
                      <h3 className="text-base sm:text-lg font-semibold mb-4 sm:mb-6 text-gray-900 dark:text-gray-100">Employee Information</h3>
                      <div className="space-y-4 sm:space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                          <div className="space-y-2">
                            <Label htmlFor="restore-full_name" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Full Name *</Label>
                            <Input 
                              id="restore-full_name" 
                              placeholder="Enter full name"
                              maxLength={MAX_FULL_NAME_LENGTH}
                              value={formData.full_name}
                              onChange={(e) => handleInputChange('full_name', e.target.value)}
                              className={`h-11 sm:h-12 text-sm sm:text-base border-gray-300 dark:border-neutral-600 focus:border-green-500 focus:ring-green-500 touch-manipulation ${invalidFields.has('full_name') ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                              autoFocus={false}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="restore-school_id" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Employee ID *</Label>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                              {restoringEmployee?.staff_type === 'Non-Teaching' 
                                ? 'Format: N### for Non-Teaching (e.g., N100, N101)' 
                                : 'Format: T### for Teaching (e.g., T100, T101)'}
                            </div>
                            <Input 
                              id="restore-school_id" 
                              placeholder="T### or N###"
                              value={formData.school_id}
                              onChange={(e) => {
                                let val = e.target.value.trim().toUpperCase()
                                handleInputChange('school_id', val)
                              }}
                              onBlur={(e) => handleInputBlur('school_id', e.target.value)}
                              title="School ID format: T### for Teaching, N### for Non-Teaching"
                              className={`h-11 sm:h-12 text-sm sm:text-base border-gray-300 dark:border-neutral-600 focus:border-green-500 focus:ring-green-500 touch-manipulation ${invalidFields.has('school_id') ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="restore-rfid_code" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">RFID Code *</Label>
                            <Input 
                              id="restore-rfid_code" 
                              placeholder="0000000000"
                              value={formData.rfid_code}
                              onChange={(e) => handleInputChange('rfid_code', e.target.value.replace(/\D+/g, '').slice(0, 10))}
                              onBlur={(e) => handleInputBlur('rfid_code', e.target.value)}
                              inputMode="numeric"
                              pattern="^05\\d{8}$"
                              maxLength={10 as any}
                              className={`h-11 sm:h-12 text-sm sm:text-base border-gray-300 dark:border-neutral-600 focus:border-green-500 focus:ring-green-500 touch-manipulation ${invalidFields.has('rfid_code') ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="restore-department" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Department *</Label>
                            <Select value={formData.department} onValueChange={(value) => {
                              if (value === '__ADD_MORE__') {
                                setDeptDialogSource('restore-employee')
                                setEditingDept(null)
                                setDeptFormName("")
                                setDeptFormAcronym("")
                                setDeptFormDesc("")
                                setDeptFormCategory(formData.staff_type === 'Teaching' || formData.staff_type === 'Non-Teaching' ? formData.staff_type : '')
                                setDeptInvalidFields(new Set())
                                setDeptValidationErrors([])
                                setShowDeptValidationDialog(false)
                                setIsDeptDialogOpen(true)
                              } else {
                                handleInputChange('department', value)
                              }
                            }}>
                              <SelectTrigger className="h-11 border-gray-300 dark:border-neutral-600">
                                <SelectValue placeholder="Select department" />
                              </SelectTrigger>
                              <SelectContent>
                                {departments
                                  .filter((dept) => {
                                    if (!formData.staff_type) return false
                                    return dept.category === formData.staff_type
                                  })
                                  .map((dept) => (
                                    <SelectItem key={dept.department_id} value={dept.name}>
                                      {dept.acronym ? `${dept.acronym} - ${dept.name}` : dept.name}
                                    </SelectItem>
                                  ))}
                                <SelectItem value="__ADD_MORE__" className="text-blue-600 dark:text-blue-400 font-medium">
                                  <div className="flex items-center gap-2">
                                    <Plus className="h-4 w-4" />
                                    Add More...
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="restore-staff_type" className="text-sm font-medium text-gray-700 dark:text-gray-300">Staff Type *</Label>
                            <Select 
                              value={effectiveStaffType}
                              onValueChange={(value: 'Teaching' | 'Non-Teaching') => {
                                handleInputChange('staff_type', value)
                              }}
                              disabled={true}
                            >
                              <SelectTrigger className="h-11 border-gray-300 dark:border-neutral-600 opacity-60 cursor-not-allowed">
                                <SelectValue placeholder="Select staff type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={effectiveStaffType}>{effectiveStaffType}</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {isNonTeachingScopedAdmin
                                ? 'Staff Type is locked to Non-Teaching for your account.'
                                : 'Staff Type is locked to Teaching for your account.'}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="restore-employment_status" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Employment Status {formData.staff_type === 'Teaching' ? '*' : ''}
                            </Label>
                            <Select 
                              value={formData.employment_status} 
                              onValueChange={(value) => handleInputChange('employment_status', value)}
                            >
                              <SelectTrigger className="h-11 border-gray-300 dark:border-neutral-600">
                                <SelectValue placeholder="Select employment status" />
                              </SelectTrigger>
                              <SelectContent>
                                {getEmploymentStatusOptions(formData.staff_type || 'Teaching').map((name: string) => (
                                  <SelectItem key={name} value={name}>{name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="restore-email" className="text-sm font-medium text-gray-700 dark:text-gray-300">Email Address *</Label>
                            <Input 
                              id="restore-email" 
                              type="email" 
                              placeholder="employee@santarosa.sti.edu"
                              maxLength={MAX_EMAIL_LENGTH}
                              value={formData.email}
                              onChange={(e) => handleInputChange('email', e.target.value)}
                              className={`h-11 border-gray-300 dark:border-neutral-600 focus:border-green-500 focus:ring-green-500 ${invalidFields.has('email') ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="restore-phone" className="text-sm font-medium text-gray-700 dark:text-gray-300">Phone Number</Label>
                            <Input 
                              id="restore-phone" 
                              placeholder="11 digits"
                              value={formData.phone}
                              onChange={(e) => handleInputChange('phone', e.target.value.replace(/\D+/g, '').slice(0, 11))}
                              onBlur={(e) => handleInputBlur('phone', e.target.value)}
                              inputMode="numeric"
                              pattern="^09\\d{9}$"
                              maxLength={11 as any}
                              className={`h-11 border-gray-300 dark:border-neutral-600 focus:border-green-500 focus:ring-green-500 ${invalidFields.has('phone') ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                            />
                          </div>
                          {/* Hire Date field */}
                          <div className="space-y-2">
                            <Label htmlFor="restore-hire_date" className="text-sm font-medium text-gray-700 dark:text-gray-300">Hire Date *</Label>
                            <Input
                              id="restore-hire_date"
                              type="date"
                              value={(formData.hire_date || '').split('T')[0] || ''}
                              onChange={(e)=> handleInputChange('hire_date', e.target.value)}
                              className={`h-11 border-gray-300 dark:border-neutral-600 focus:border-green-500 focus:ring-green-500 ${invalidFields.has('hire_date') ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                            />
                            {invalidFields.has('hire_date') && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                Hire Date is required. Please select a date.
                              </p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="restore-start_date" className="text-sm font-medium text-gray-700 dark:text-gray-300">Start Date (Work Begin) *</Label>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setEditStartDatePickerOpen(true)}
                              className={cn(
                                "h-11 w-full justify-start text-left font-normal border-gray-300 dark:border-neutral-600",
                                !formData.start_date && "text-muted-foreground",
                                invalidFields.has('start_date') && "border-red-500 dark:border-red-500"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {formData.start_date ? (
                                formatManilaDateLong(formData.start_date)
                              ) : (
                                <span className="text-gray-400">Select start date *</span>
                              )}
                            </Button>
                            
                            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1 font-semibold">
                              ⚠️ Start Date has been reset to tomorrow (today cannot be selected). You can change it if needed.
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              Attendance logs will only be tracked from this date onwards. Dates before this will not show as "Absent". Today and Sundays are not allowed.
                            </p>
                          </div>
                        </div>
                        
                        {/* Employee Status Section */}
                        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-neutral-700">
                          <div className="flex items-center justify-between p-4 bg-linear-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-xl border border-green-200 dark:border-green-800">
                            <div className="space-y-1">
                              <Label htmlFor="restore-is_active" className="text-base font-semibold text-gray-900 dark:text-gray-100">Employee Status</Label>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                ✅ Employee will be restored as active and will appear in attendance logs
                              </p>
                            </div>
                            <Switch
                              id="restore-is_active"
                              checked={true}
                              disabled={true}
                              className="opacity-50"
                            />
                          </div>
                          {/* Reporting staff toggle for restore dialog */}
                          <div className="mt-3">
                            <div className="flex items-center justify-between p-4 bg-linear-to-r from-slate-50 to-gray-50 dark:from-neutral-900/10 dark:to-neutral-800/10 rounded-xl border border-gray-200 dark:border-neutral-700">
                              <div className="space-y-1">
                                <Label htmlFor="restore-is_reporting_staff" className="text-base font-semibold text-gray-900 dark:text-gray-100">Reporting Staff</Label>
                                <p className="text-sm text-gray-600 dark:text-gray-400">If enabled, this employee is expected to report physically on reporting-only holidays and suspensions. If not set, system falls back to heuristics.</p>
                              </div>
                              <Switch
                                id="restore-is_reporting_staff"
                                checked={formData.is_reporting_staff ?? false}
                                onCheckedChange={(checked) => handleInputChange('is_reporting_staff', checked)}
                              />
                            </div>
                          </div>
                          <div className="mt-3">
                            <div className="flex items-center justify-between p-4 bg-linear-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 rounded-xl border border-amber-200 dark:border-amber-800">
                              <div className="space-y-1">
                                <Label htmlFor="restore-is_standby" className="text-base font-semibold text-gray-900 dark:text-gray-100">Standby Mode</Label>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Enable if employee has started but is waiting for schedule setup. Attendance gaps will be tracked as standby under review.</p>
                              </div>
                              <Switch
                                id="restore-is_standby"
                                checked={formData.is_standby ?? false}
                                onCheckedChange={(checked) => handleInputChange('is_standby', checked)}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Beautiful Footer with Actions - Mobile Responsive */}
              <div className="bg-white dark:bg-neutral-800 border-t border-gray-200 dark:border-neutral-700 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 sm:gap-4 shrink-0">
                <div className={`flex flex-col sm:flex-row gap-2 sm:gap-4 w-full sm:w-auto sm:ml-auto`}>
                  <Button 
                    size="lg"
                    variant="outline" 
                    onClick={() => {
                      setIsRestoreDialogOpen(false)
                      setRestoringEmployee(null)
                      clearValidationState()
                      resetForm()
                    }}
                    className="px-4 sm:px-8 h-11 sm:h-12 font-medium w-full sm:w-auto text-sm sm:text-base touch-manipulation"
                  >
                    Cancel
                  </Button>
                  <Button 
                    size="lg"
                    onClick={handleConfirmRestore} 
                    className="bg-green-600 hover:bg-green-700 text-white px-4 sm:px-8 h-11 sm:h-12 font-semibold shadow-lg hover:shadow-xl transition-all duration-200 w-full sm:w-auto text-sm sm:text-base touch-manipulation"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Restoring...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Restore Employee
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Schedule Editor Dialog */}
          <Dialog open={isScheduleDialogOpen} onOpenChange={(open)=>{
            setIsScheduleDialogOpen(open)
            if(!open){
              // Always return to View dialog after closing schedule editor
              setTimeout(()=>{ 
                setIsViewDialogOpen(true)
                setReopenEditAfterSchedule(false)
              }, 0)
            }
          }}>
            <DialogContent className="w-[1200px] max-w-[95vw] h-[90vh] max-h-[90vh] p-0 flex flex-col overflow-hidden border-0 shadow-2xl">
              {/* Modern Header with Gradient */}
              <div className="shrink-0 bg-linear-to-br from-blue-600 via-indigo-600 to-purple-600 px-8 py-6 text-white relative overflow-hidden">
                <div className="absolute inset-0 bg-white/5 backdrop-blur-sm" />
                <div className="relative">
                  <DialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-xl shadow-lg">
                        <CalendarIcon className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <DialogTitle className="text-2xl font-bold tracking-tight">
                          Teaching Schedule
                        </DialogTitle>
                        <DialogDescription className="text-blue-100 text-sm mt-1">
                          Manage class schedule for <span className="font-semibold text-white">{editingEmployee?.full_name || formData.full_name || 'Employee'}</span>
                        </DialogDescription>
                      </div>
                    </div>
                  </DialogHeader>
                  
                  {/* Stats & Action Bar */}
                  <div className="mt-4 flex items-center justify-between gap-4 bg-white/10 backdrop-blur-md rounded-lg px-4 py-3 border border-white/20">
                    <div className="flex items-center gap-2">
                      <div className="px-3 py-1 bg-white/20 rounded-full text-sm font-semibold">
                        {scheduleRows.length}
                      </div>
                      <span className="text-sm font-medium">
                        {scheduleRows.length === 1 ? 'Class Scheduled' : 'Classes Scheduled'}
                      </span>
                    </div>
                    <Button 
                      size="sm" 
                      onClick={() => { addScheduleRow(); }}
                      className="h-9 bg-white hover:bg-white/90 text-blue-600 font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Class
                    </Button>
                  </div>
                </div>
              </div>

              {/* Content - Scrollable with Custom Scrollbar */}
              <div ref={scheduleListRef} className="flex-1 overflow-y-auto bg-linear-to-br from-gray-50 to-blue-50/30 dark:from-neutral-950 dark:to-neutral-900 p-8 custom-scrollbar">
                <LazyScheduleEditor rows={scheduleRows as any} onChange={updateScheduleField as any} onAdd={addScheduleRow} onRemove={removeScheduleRow} />
              </div>

              {/* Modern Footer with Actions */}
              <div className="shrink-0 bg-white dark:bg-neutral-900 border-t border-gray-200 dark:border-neutral-800 px-8 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Changes will be saved to the database
                  </p>
                  <div className="flex gap-3">
                    <Button 
                      variant="outline" 
                      onClick={()=>setIsScheduleDialogOpen(false)}
                      className="h-10 px-6 font-medium"
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={async ()=>{
                        const success = await saveAllSchedules()
                        // Only close modal if save was successful (no errors)
                        if (success) {
                          setIsScheduleDialogOpen(false)
                        }
                        // If success is false, modal stays open and errors are shown in validation dialog
                      }}
                      disabled={isSavingSchedule}
                      className="h-10 px-6 bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all duration-200"
                    >
                      {isSavingSchedule ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

      {/* Exam Schedule Dialog */}
      <Dialog open={isExamScheduleDialogOpen} onOpenChange={(open)=>{
        setIsExamScheduleDialogOpen(open)
        if(!open){
          // Always return to View dialog after closing exam schedule editor
          setTimeout(()=>{ 
            setIsViewDialogOpen(true)
            setReopenEditAfterSchedule(false)
          }, 0)
        }
      }}>
        <DialogContent className="w-[1200px] max-w-[95vw] h-[90vh] max-h-[90vh] p-0 flex flex-col overflow-hidden border-0 shadow-2xl">
          {/* Modern Header with Gradient */}
          <div className="shrink-0 bg-linear-to-br from-red-600 via-pink-600 to-orange-600 px-8 py-6 text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-white/5 backdrop-blur-sm" />
            <div className="relative">
              <DialogHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-xl shadow-lg">
                    <CalendarIcon className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-bold tracking-tight">
                      Exam Schedule
                    </DialogTitle>
                    <DialogDescription className="text-red-100 text-sm mt-1">
                      Manage exam schedule for <span className="font-semibold text-white">{editingEmployee?.full_name || formData.full_name || 'Employee'}</span>
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              
              {/* Stats & Action Bar */}
              <div className="mt-4 flex items-center justify-between gap-4 bg-white/10 backdrop-blur-md rounded-lg px-4 py-3 border border-white/20">
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1 bg-white/20 rounded-full text-sm font-semibold">
                    {examScheduleRows.length}
                  </div>
                  <span className="text-sm font-medium">
                    Exam{examScheduleRows.length !== 1 ? 's' : ''} Scheduled
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={addExamScheduleRow}
                    className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Add Exam
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div ref={examScheduleListRef} className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-neutral-950">
            <div className="max-w-6xl mx-auto">
              <LazyExamScheduleEditor 
                rows={examScheduleRows as any} 
                onChange={updateExamScheduleField as any} 
                onAdd={addExamScheduleRow} 
                onRemove={removeExamScheduleRow} 
              />
            </div>
          </div>

          {/* Modern Footer with Actions */}
          <div className="shrink-0 bg-white dark:bg-neutral-900 border-t border-gray-200 dark:border-neutral-800 px-8 py-4 flex items-center justify-between">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {examScheduleRows.length > 0 
                ? `${examScheduleRows.length} exam${examScheduleRows.length !== 1 ? 's' : ''} configured`
                : 'No exams scheduled'}
            </div>
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                onClick={() => {
                  setIsExamScheduleDialogOpen(false)
                  if (reopenEditAfterSchedule) {
                    setTimeout(() => { setIsEditDialogOpen(true); setReopenEditAfterSchedule(false) }, 0)
                  }
                }}
                disabled={isSavingExamSchedule}
              >
                Cancel
              </Button>
              <Button 
                onClick={async () => {
                  const success = await saveAllExamSchedules()
                  // Only close modal if save was successful (no errors)
                  if (success) {
                    setIsExamScheduleDialogOpen(false)
                    if (reopenEditAfterSchedule) {
                      setTimeout(() => { setIsEditDialogOpen(true); setReopenEditAfterSchedule(false) }, 0)
                    }
                  }
                  // If success is false, modal stays open and errors are shown in validation dialog
                }}
                className="bg-linear-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white shadow-lg shadow-red-500/30"
                disabled={isSavingExamSchedule}
              >
                {isSavingExamSchedule ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Calendar className="h-4 w-4 mr-2" />
                    Save Exam Schedule
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Substitution Dialog */}
      <Dialog open={isSubstitutionDialogOpen} onOpenChange={setIsSubstitutionDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assign Substitute Teacher</DialogTitle>
            <DialogDescription>
              {substitutionType === 'exam' 
                ? `Assign a substitute teacher for ${selectedExamForSubstitution?.subject_name || 'this exam'} when the original teacher is unavailable`
                : `Assign a substitute teacher for ${selectedTeachingForSubstitution?.subject_name || 'this class'} when the original teacher is unavailable`
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Schedule Details */}
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                {substitutionType === 'exam' ? 'Exam Details' : 'Class Details'}
              </h3>
              <div className="grid grid-cols-2 gap-2 text-sm text-blue-800 dark:text-blue-200">
                <div><span className="font-medium">Subject:</span> {
                  substitutionType === 'exam' 
                    ? selectedExamForSubstitution?.subject_name || 'N/A'
                    : selectedTeachingForSubstitution?.subject_name || 'N/A'
                }</div>
                <div><span className="font-medium">Section:</span> {
                  substitutionType === 'exam'
                    ? selectedExamForSubstitution?.section || 'N/A'
                    : selectedTeachingForSubstitution?.section || 'N/A'
                }</div>
                <div><span className="font-medium">Room:</span> {
                  substitutionType === 'exam'
                    ? selectedExamForSubstitution?.room_code || 'N/A'
                    : selectedTeachingForSubstitution?.room_code || 'N/A'
                }</div>
                <div><span className="font-medium">Time:</span> {
                  substitutionType === 'exam'
                    ? `${selectedExamForSubstitution?.time_start} - ${selectedExamForSubstitution?.time_end}`
                    : `${selectedTeachingForSubstitution?.time_start} - ${selectedTeachingForSubstitution?.time_end}`
                }</div>
              </div>
            </div>

            {/* Approved Leave Requests (if any) */}
            {approvedLeaveRequests.length > 0 && (
              <div className="space-y-2">
                <Label>Link to Approved Leave Request (Optional)</Label>
                <Select 
                  value={selectedVerificationRequest?.toString() || ''} 
                  onValueChange={(value) => {
                    if (!value) {
                      setSelectedVerificationRequest(null)
                      return
                    }
                    const requestId = Number(value)
                    const request = approvedLeaveRequests.find(r => r.request_id === requestId)
                    if (request) {
                      setSelectedVerificationRequest(requestId)
                      // Pre-populate form with leave request data
                      setSubstitutionForm(prev => ({
                        ...prev,
                        status: 'on-leave',
                        unavailableReason: request.reason || prev.unavailableReason
                      }))
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an approved leave request..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None - Manual assignment</SelectItem>
                    {approvedLeaveRequests.map((req) => (
                      <SelectItem key={req.request_id} value={req.request_id.toString()}>
                        {req.requested_time 
                            ? formatDateSafe(req.requested_time, 'Unknown date')
                          : 'Unknown date'} - {req.reason || 'Leave request'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedVerificationRequest && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    ✓ Linked to approved leave request - Status and reason pre-filled
                  </p>
                )}
              </div>
            )}

            {/* Substitute Selection */}
            <div className="space-y-2">
              <Label htmlFor="substitute-employee">Select Substitute Teacher *</Label>
              {(() => {
                const availableSubstitutes = allEmployees.filter(
                  e => (e as any).staff_type === 'Teaching' && e.employee_id !== editingEmployee?.employee_id
                )
                
                // Check if current value is invalid (employee selected themselves)
                const currentValue = substitutionForm.substituteEmployeeId
                const isInvalidValue = editingEmployee && currentValue && Number(currentValue) === editingEmployee.employee_id
                const hasError = substitutionInvalidFields.has('substituteEmployeeId')
                
                if (availableSubstitutes.length === 0) {
                  return (
                    <>
                      <Select disabled value="">
                        <SelectTrigger className={hasError ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}>
                          <SelectValue placeholder="No Substitute Available" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="" disabled>No Substitute Available</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        ⚠ No other teaching staff available to assign as substitute
                      </p>
                    </>
                  )
                }
                
                return (
                  <>
                    <Select 
                      value={isInvalidValue ? '' : substitutionForm.substituteEmployeeId}
                      onValueChange={(value) => {
                        if (!value) {
                          setSubstitutionForm(prev => ({ ...prev, substituteEmployeeId: '' }))
                          // Clear error when field is cleared
                          setSubstitutionInvalidFields(prev => {
                            const next = new Set(prev)
                            next.delete('substituteEmployeeId')
                            return next
                          })
                          setSubstitutionValidationErrors(prev => prev.filter(e => !e.includes('substitute')))
                          return
                        }
                        
                        // Validate that the selected employee is not the same as the editing employee
                        const selectedId = Number(value)
                        if (editingEmployee && selectedId === editingEmployee.employee_id) {
                          // Show toast notification
                          toast({
                            title: "Invalid Selection",
                            description: "An employee cannot be assigned as their own substitute.",
                            variant: "destructive"
                          })
                          // Clear the invalid value
                          setSubstitutionForm(prev => ({ ...prev, substituteEmployeeId: '' }))
                          // Set error state to show red border and error message
                          setSubstitutionInvalidFields(prev => new Set([...prev, 'substituteEmployeeId']))
                          setSubstitutionValidationErrors(prev => {
                            const filtered = prev.filter(e => !e.includes('substitute') && !e.includes('self'))
                            return [...filtered, "An employee cannot be assigned as their own substitute. Please select a different teacher."]
                          })
                          // Show error dialog immediately
                          setShowSubstitutionValidationDialog(true)
                          return
                        }
                        setSubstitutionForm(prev => ({ ...prev, substituteEmployeeId: value }))
                        // Clear error when valid selection is made
                        setSubstitutionInvalidFields(prev => {
                          const next = new Set(prev)
                          next.delete('substituteEmployeeId')
                          return next
                        })
                        setSubstitutionValidationErrors(prev => prev.filter(e => !e.includes('substitute')))
                      }}
                    >
                      <SelectTrigger className={hasError ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}>
                        <SelectValue placeholder="Select a teaching staff..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableSubstitutes.map(emp => (
                          <SelectItem key={emp.employee_id} value={emp.employee_id.toString()}>
                            {getEmployeeDisplayName(emp.full_name)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isInvalidValue && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        ⚠ Invalid selection cleared - please select a different substitute
                      </p>
                    )}
                    {hasError && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        ⚠ {substitutionValidationErrors.find(e => e.includes('substitute')) || 'Please select a valid substitute teacher'}
                      </p>
                    )}
                  </>
                )
              })()}
            </div>

            {/* Unavailability Status */}
            <div className="space-y-2">
              <Label htmlFor="status">Original Teacher Status *</Label>
              <Select 
                value={substitutionForm.status} 
                onValueChange={(value) => setSubstitutionForm(prev => ({ ...prev, status: value as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on-leave">On Leave</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="unavailable">Unavailable</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Unavailability *</Label>
              <Input
                id="reason"
                placeholder="e.g., Sick leave, Personal emergency, etc."
                value={substitutionForm.unavailableReason}
                onChange={(e) => {
                  setSubstitutionForm(prev => ({ ...prev, unavailableReason: e.target.value }))
                  // Clear error when field is changed
                  if (e.target.value.trim()) {
                    setSubstitutionInvalidFields(prev => {
                      const next = new Set(prev)
                      next.delete('unavailableReason')
                      return next
                    })
                    setSubstitutionValidationErrors(prev => prev.filter(e => !e.includes('reason')))
                  }
                }}
                className={substitutionInvalidFields.has('unavailableReason') ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}
              />
              {substitutionInvalidFields.has('unavailableReason') && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  ⚠ {substitutionValidationErrors.find(e => e.includes('reason')) || 'Please provide a reason for unavailability'}
                </p>
              )}
            </div>

            {/* Existing Substitution Info */}
            {((substitutionType === 'exam' && selectedExamForSubstitution?.status === 'substituted' && selectedExamForSubstitution?.substitute_employee_name) ||
              (substitutionType === 'teaching' && selectedTeachingForSubstitution?.status === 'substituted' && selectedTeachingForSubstitution?.substitute_employee_name)) && (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <span className="font-medium">Current Substitute:</span> {
                    substitutionType === 'exam'
                      ? selectedExamForSubstitution?.substitute_employee_name
                      : selectedTeachingForSubstitution?.substitute_employee_name
                  }
                </p>
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                  Assigning a new substitute will replace the current one.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={() => {
                setIsSubstitutionDialogOpen(false)
                setSelectedExamForSubstitution(null)
                setSelectedTeachingForSubstitution(null)
                setSubstitutionForm({ substituteEmployeeId: '', unavailableReason: '', status: 'on-leave' })
                setApprovedLeaveRequests([])
                setSelectedVerificationRequest(null)
                // Clear validation errors when closing
                setSubstitutionValidationErrors([])
                setSubstitutionInvalidFields(new Set())
                setShowSubstitutionValidationDialog(false)
              }}
            >
              Cancel
            </Button>
            {((substitutionType === 'exam' && selectedExamForSubstitution?.status === 'substituted') ||
              (substitutionType === 'teaching' && selectedTeachingForSubstitution?.status === 'substituted')) && (
              <Button 
                variant="destructive"
                onClick={() => {
                  if (substitutionType === 'exam' && selectedExamForSubstitution) {
                    handleRemoveSubstitution(selectedExamForSubstitution)
                  } else if (substitutionType === 'teaching' && selectedTeachingForSubstitution) {
                    handleRemoveTeachingSubstitution(selectedTeachingForSubstitution)
                  }
                  setIsSubstitutionDialogOpen(false)
                }}
              >
                Remove Substitution
              </Button>
            )}
            <Button 
              onClick={handleSaveSubstitution}
              className="bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
            >
              Save Substitution
            </Button>
          </div>
        </DialogContent>
      </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
        <Card className="border border-slate-200/70 dark:border-slate-700/70 shadow-md bg-white/90 dark:bg-neutral-900/80 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 sm:px-6 pt-4 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium">Visible Employees</CardTitle>
            <Users className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
            <div className="text-xl sm:text-2xl font-bold">{filteredEmployees.length}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">{visibleActiveCount} active, {visibleArchivedCount} archived</p>
          </CardContent>
        </Card>

        <Card className="border border-slate-200/70 dark:border-slate-700/70 shadow-md bg-white/90 dark:bg-neutral-900/80 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 sm:px-6 pt-4 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium">Staff Mix</CardTitle>
            <UserCheck className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
            <div className="text-xl sm:text-2xl font-bold">{visibleTeachingCount}/{visibleNonTeachingCount}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Teaching / Non-Teaching in current results</p>
          </CardContent>
        </Card>

        <Card className="border border-slate-200/70 dark:border-slate-700/70 shadow-md bg-white/90 dark:bg-neutral-900/80 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 sm:px-6 pt-4 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium">Departments</CardTitle>
            <Building className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
            <div className="text-xl sm:text-2xl font-bold">{uniqueDepartments}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Cross-functional coverage</p>
          </CardContent>
        </Card>

        <Card className="border border-slate-200/70 dark:border-slate-700/70 shadow-md bg-white/90 dark:bg-neutral-900/80 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 sm:px-6 pt-4 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Records</CardTitle>
            <Archive className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
            <div className="text-xl sm:text-2xl font-bold">{totalEmployees}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
              {regularCount} Regular + {partTimeCount} Part Time + {partTimeFullLoadCount} PT Full Load + {nonTeachingCount} Non-Teaching
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-xl border border-[var(--emp-border)] bg-white/90 dark:bg-neutral-900/80 backdrop-blur-sm">
        <CardHeader className="px-4 sm:px-6 xl:px-8 pt-5 sm:pt-7 pb-4 sm:pb-6">
          <CardTitle className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Find Employees Fast</CardTitle>
          <CardDescription className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Search by name, ID, RFID, email, or narrow down by department and employment status.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 xl:px-8 pb-5 sm:pb-7">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 sm:gap-6">
            <div className="xl:col-span-8 space-y-5 sm:space-y-6">
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Search Directory</Label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                  <Input
                    placeholder="Type a name, school ID, email, phone, or RFID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-12 h-12 sm:h-14 text-sm sm:text-base touch-manipulation border-2 border-gray-200 dark:border-neutral-700 focus:border-blue-500 dark:focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 items-end">
                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Department</Label>
                  <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                    <SelectTrigger className="w-full h-12 sm:h-14 text-sm sm:text-base touch-manipulation border-2 border-gray-200 dark:border-neutral-700">
                      <SelectValue placeholder="All Departments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All Departments">All Departments</SelectItem>
                      {scopedDepartments.map((dept) => (
                        <SelectItem key={dept.department_id} value={dept.name}>
                          {dept.acronym ? `${dept.acronym} - ${dept.name}` : dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Employment Status</Label>
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="w-full h-12 sm:h-14 text-sm sm:text-base touch-manipulation border-2 border-gray-200 dark:border-neutral-700">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All Statuses">All Statuses</SelectItem>
                      {visibleEmploymentStatusFilters.map((statusName) => (
                        <SelectItem key={statusName} value={statusName}>
                          {statusName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 sm:p-5 border-2 border-gray-200 dark:border-neutral-700 rounded-lg bg-gray-50 dark:bg-neutral-800">
                <div className="flex items-center gap-3">
                  <UserX className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  <div>
                    <Label htmlFor="show-archived" className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 cursor-pointer">
                      Show Archived Employees
                    </Label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Include inactive employee records in results</p>
                  </div>
                </div>
                <Switch
                  id="show-archived"
                  checked={showArchivedEmployees}
                  onCheckedChange={setShowArchivedEmployees}
                />
              </div>

              {hasActiveFilters ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Active Filters:</span>
                  {searchTerm.trim() ? (
                    <Badge variant="secondary" className="bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300">Search: {searchTerm}</Badge>
                  ) : null}
                  {selectedDepartment !== 'All Departments' ? (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Dept: {selectedDepartment}</Badge>
                  ) : null}
                  {selectedStatus !== 'All Statuses' ? (
                    <Badge variant="secondary" className="bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300">Status: {selectedStatus}</Badge>
                  ) : null}
                  {selectedLastInitial !== 'All' ? (
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">Surname: {selectedLastInitial}</Badge>
                  ) : null}
                  {showArchivedEmployees ? (
                    <Badge variant="secondary" className="bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200">Archived Included</Badge>
                  ) : null}
                  <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-7 px-2 text-xs">
                    <X className="h-3 w-3 mr-1" />
                    Clear all
                  </Button>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Quick Status Filters:</span>
                {['Regular', 'Part Time', 'Part Time Full Load'].map((quickStatus) => (
                  <Button
                    key={quickStatus}
                    type="button"
                    variant={selectedStatus === quickStatus ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedStatus((prev) => (prev === quickStatus ? 'All Statuses' : quickStatus))}
                    className="h-8"
                  >
                    {quickStatus}
                  </Button>
                ))}
              </div>

              <div className="space-y-2 pt-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Browse By Surname Initial:</span>
                <div className="flex items-center gap-1 overflow-x-auto pb-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={selectedLastInitial === 'All' ? 'default' : 'outline'}
                    onClick={() => setSelectedLastInitial('All')}
                    className="h-7 min-w-[44px] px-2"
                  >
                    All
                  </Button>
                  {Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).map((letter) => (
                    <Button
                      key={letter}
                      type="button"
                      size="sm"
                      variant={selectedLastInitial === letter ? 'default' : 'outline'}
                      onClick={() => setSelectedLastInitial(letter)}
                      disabled={!availableSurnameInitials.has(letter)}
                      className="h-7 min-w-[32px] px-2"
                      title={availableSurnameInitials.has(letter) ? `Filter by ${letter}` : `No ${letter} surnames in current results`}
                    >
                      {letter}
                    </Button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {Array.from(availableSurnameInitials).filter((x) => x !== '#').sort().length} initials available in current results
                </p>
              </div>
            </div>

            <div className="xl:col-span-4">
              <div className="h-full rounded-2xl border border-cyan-200/80 dark:border-cyan-900/70 bg-linear-to-b from-cyan-50/80 via-white to-blue-50/60 dark:from-cyan-950/25 dark:via-neutral-900 dark:to-blue-950/20 p-4 sm:p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">Department Management</p>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Department Command Center</h3>
                  </div>
                  <Building className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-neutral-900/70 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Configured</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{departments.length}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-neutral-900/70 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">In Results</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{uniqueDepartments}</p>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <Button
                    onClick={() => {
                      setEditingDept(null)
                      setDeptFormName("")
                      setDeptFormAcronym("")
                      setDeptFormDesc("")
                      setDeptFormCategory("")
                      setDeptInvalidFields(new Set())
                      setDeptValidationErrors([])
                      setShowDeptValidationDialog(false)
                      setIsDeptDialogOpen(true)
                    }}
                    title="Add or Manage Departments"
                    className="w-full h-11 bg-linear-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-semibold"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Open Department Manager
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingDept(null)
                      setDeptFormName("")
                      setDeptFormAcronym("")
                      setDeptFormDesc("")
                      setDeptFormCategory("")
                      setDeptInvalidFields(new Set())
                      setDeptValidationErrors([])
                      setShowDeptValidationDialog(false)
                      setIsDeptDialogOpen(true)
                    }}
                    className="w-full h-10 border-slate-300 dark:border-slate-700"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Department
                  </Button>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Quick Department Focus</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={selectedDepartment === 'All Departments' ? 'default' : 'outline'}
                      onClick={() => setSelectedDepartment('All Departments')}
                      className="h-7"
                    >
                      All
                    </Button>
                    {scopedDepartments.slice(0, 6).map((dept) => (
                      <Button
                        key={dept.department_id}
                        type="button"
                        size="sm"
                        variant={selectedDepartment === dept.name ? 'default' : 'outline'}
                        onClick={() => setSelectedDepartment(dept.name)}
                        className="h-7"
                      >
                        {dept.acronym || dept.name}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-xl border border-[var(--emp-border)] bg-white/95 dark:bg-neutral-900/85 backdrop-blur-sm">
        <CardHeader className="px-6 sm:px-8 pt-5 sm:pt-7 pb-4 sm:pb-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 mb-1.5">Employee Directory</CardTitle>
              <CardDescription className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                Showing {filteredEmployees.length} of {totalEmployees} employees
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={openAddEmployeeDialog}
                className="h-7 px-2.5 text-[11px] sm:text-xs rounded-lg border-0 bg-linear-to-r from-slate-900 via-cyan-700 to-teal-600 hover:from-slate-800 hover:via-cyan-600 hover:to-teal-500 text-white"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Employee
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-6 sm:px-8 pb-5 sm:pb-7">
          {isLoading ? (
            <div className="py-6 space-y-3">
              <div className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
              <div className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
              <div className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
              <p className="mt-2 text-sm text-gray-600 text-center">Loading employees...</p>
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="text-center py-10 sm:py-12">
              <div className="relative mx-auto mb-4 h-24 w-24 sm:h-28 sm:w-28">
                <div className="absolute inset-0 rounded-full bg-cyan-200/50 dark:bg-cyan-800/30 animate-pulse" />
                <div className="absolute inset-3 rounded-full bg-white dark:bg-neutral-900 border border-cyan-200 dark:border-cyan-700" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Search className="h-9 w-9 text-cyan-700 dark:text-cyan-300 animate-bounce" />
                </div>
                <div className="absolute -right-1 top-2 h-3 w-3 rounded-full bg-amber-300 animate-ping" />
              </div>
              <p className="text-base font-semibold text-slate-700 dark:text-slate-200">No employees found</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Try a different search keyword or reset active filters.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => {
                setSearchTerm('')
                setSelectedDepartment('All Departments')
                setSelectedStatus('All Statuses')
                setShowArchivedEmployees(false)
              }}>
                <RefreshCw className="h-3.5 w-3.5 mr-2" />
                Reset Filters
              </Button>
            </div>
          ) : (
            <div className="space-y-0">
              <div className="sticky top-0 z-20 mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-neutral-900/95 backdrop-blur px-3 py-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mr-1">Jump by Surname:</span>
                  <Button
                    type="button"
                    size="sm"
                    variant={selectedLastInitial === 'All' ? 'default' : 'outline'}
                    onClick={() => setSelectedLastInitial('All')}
                    className="h-6 min-w-[34px] px-2 text-[11px]"
                  >
                    All
                  </Button>
                  {Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).map((letter) => (
                    <Button
                      key={`dir-${letter}`}
                      type="button"
                      size="sm"
                      variant={selectedLastInitial === letter ? 'default' : 'outline'}
                      onClick={() => setSelectedLastInitial(letter)}
                      disabled={!availableSurnameInitials.has(letter)}
                      className="h-6 min-w-[26px] px-1.5 text-[11px]"
                      title={availableSurnameInitials.has(letter) ? `Filter by ${letter}` : `No ${letter} surnames in current results`}
                    >
                      {letter}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="hidden lg:grid grid-cols-12 gap-3 xl:gap-6 px-4 xl:px-6 py-3 xl:py-4 bg-linear-to-r from-slate-50 to-cyan-50/60 dark:from-neutral-800 dark:to-cyan-950/20 border-b border-slate-200 dark:border-slate-700 rounded-t-lg min-w-[1080px]">
                <div className="col-span-2 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">Employee</div>
                <div className="col-span-2 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 text-center">Department</div>
                <div className="col-span-2 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 text-center">Contact</div>
                <div className="col-span-2 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 text-center">RFID and Schedule</div>
                <div className="col-span-1 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 text-center">Staff Type</div>
                <div className="col-span-2 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 text-center">Work Status</div>
                <div className="col-span-1 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 text-center">Actions</div>
              </div>
              
              <div className="hidden lg:block border border-slate-200 dark:border-slate-700 rounded-lg overflow-auto bg-white dark:bg-neutral-900 shadow-inner">
                <div className="min-w-[1080px]">
                  {filteredEmployees.length > 0 && (
                    <List height={560} itemCount={filteredEmployees.length} itemSize={rowHeight} width={'100%'}>
                      {EmployeeRow as any}
                    </List>
                  )}
                </div>
              </div>

              {/* Mobile View - Card Layout */}
              <div className="lg:hidden grid grid-cols-1 gap-4">
                {filteredEmployees.map((employee) => {
                  const avatarUrl = getEmployeeAvatarUrl(employee)
                  const mobileScheduleDisplay = getEmployeeScheduleDisplay(employee)
                  const mobileScheduleIssue = getEmployeeScheduleIssue(employee)
                  
                  return (
                  <Card 
                    key={employee.employee_id} 
                    className="h-full border-2 border-gray-200 dark:border-neutral-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800/50 hover:shadow-md transition-all duration-200 touch-manipulation"
                    onClick={() => openViewEmployee(employee)}
                  >
                    <CardContent className="p-6 space-y-4">
                      {/* Employee Info */}
                      <div className="flex items-start gap-4">
                        <div className="relative shrink-0">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-linear-to-br from-blue-500 to-purple-600 dark:from-blue-600 dark:to-purple-700 flex items-center justify-center text-white text-base sm:text-lg font-semibold overflow-hidden ring-2 ring-blue-200 dark:ring-blue-800 shadow-lg">
                          {avatarUrl ? (
                            <img 
                              src={avatarUrl} 
                              alt={employee.full_name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                // Replace image with fallback initials on error
                                const target = e.target as HTMLImageElement
                                target.style.display = 'none'
                                const parent = target.parentElement
                                if (parent && !parent.querySelector('.avatar-fallback')) {
                                  const fallback = document.createElement('span')
                                  fallback.className = 'avatar-fallback text-white font-bold'
                                  fallback.textContent = getInitials(employee.full_name)
                                  parent.appendChild(fallback)
                                }
                              }}
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <span className="text-white font-bold">
                              {getInitials(employee.full_name)}
                            </span>
                          )}
                        </div>
                        {mobileScheduleIssue && (
                          <div className="absolute -top-1 -right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow-lg border-2 border-white dark:border-neutral-900 animate-pulse" title={mobileScheduleIssue}>
                            <AlertCircle className="h-3.5 w-3.5 animate-bounce" />
                          </div>
                        )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-base sm:text-lg text-gray-900 dark:text-gray-100 mb-2 leading-tight">{getEmployeeDisplayName(employee.full_name)}</h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                            Hired: {new Date(employee.hire_date).toLocaleDateString()}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{employee.school_id}</p>
                        </div>
                        {employee.is_active === false ? (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRestoreEmployee(employee.employee_id, employee.full_name)
                            }}
                            disabled={isDeleting}
                            className="h-9 px-4 text-sm font-medium touch-manipulation shrink-0 bg-green-600 hover:bg-green-700 text-white"
                          >
                            <RefreshCw className="h-4 w-4 mr-1.5" />
                            Restore
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEditEmployee(employee)
                            }}
                            className="h-9 px-4 text-sm font-medium touch-manipulation shrink-0"
                          >
                            <Edit className="h-4 w-4 mr-1.5" />
                            Edit
                          </Button>
                        )}
                      </div>

                      {/* Department */}
                      <div className="pt-4 border-t border-gray-200 dark:border-neutral-700">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Department</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{employee.department}</p>
                      </div>

                      {/* Contact Info */}
                      <div className="grid grid-cols-1 gap-3 pt-4 border-t border-gray-200 dark:border-neutral-700">
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Email</p>
                          <p className="text-sm text-gray-900 dark:text-gray-100 wrap-break-word">{employee.email}</p>
                        </div>
                        {employee.phone && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Phone</p>
                            <p className="text-sm text-gray-900 dark:text-gray-100">{employee.phone}</p>
                          </div>
                        )}
                      </div>

                      {/* RFID */}
                      <div className="pt-4 border-t border-gray-200 dark:border-neutral-700">
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">RFID</p>
                          <p className="text-sm font-mono text-gray-900 dark:text-gray-100">{employee.rfid_code}</p>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Today's Schedule</p>
                          <p className="text-sm text-gray-900 dark:text-gray-100">{mobileScheduleDisplay.summary}</p>
                          <div className="flex flex-wrap items-center gap-1">
                            {getScheduleSourceBadge(mobileScheduleDisplay.source, mobileScheduleDisplay.scheduleCount)}
                            {getSubstitutionImpactBadge(mobileScheduleDisplay)}
                          </div>
                        </div>
                      </div>

                      {/* Status Badges */}
                      <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-gray-200 dark:border-neutral-700">
                        <div className="flex items-center justify-center">
                          {getStatusBadge(employee.employment_status, employee.staff_type)}
                        </div>
                        <div className="flex items-center justify-center">
                          {getWorkStatusBadge(employee)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Employee Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent showCloseButton={false} className="w-[calc(100vw-1.25rem)] sm:max-w-[96vw] lg:max-w-[1180px] xl:max-w-[1320px] h-auto max-h-[94vh] bg-white dark:bg-neutral-900 p-0 overflow-hidden rounded-2xl shadow-2xl border-0 flex flex-col" onOpenAutoFocus={(e) => e.preventDefault()}>
          {/* Header with Gradient */}
          <div className="bg-linear-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 sm:px-8 py-5 sm:py-6 text-white relative overflow-hidden shrink-0">
            <div className="relative flex items-center justify-between w-full">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <Avatar className="w-16 h-16 ring-4 ring-white/30 shadow-xl shrink-0">
                  <AvatarImage 
                    src={viewEmployee ? getEmployeeAvatarUrl(viewEmployee) || '' : ''} 
                    alt={viewEmployee?.full_name || 'Employee'}
                    className="object-cover"
                  />
                  <AvatarFallback className="text-2xl font-bold bg-linear-to-br from-white/20 to-white/10 text-white">
                    {viewEmployee ? getInitials(viewEmployee.full_name) : 'E'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{getEmployeeDisplayName(viewEmployee?.full_name) || 'Employee Details'}</h2>
                  <p className="text-blue-100 text-sm mt-1 truncate">
                    {viewEmployee?.department || 'No department'} • {(viewEmployee as any)?.staff_type || 'Staff'}
                  </p>
                </div>
              </div>
              {viewEmployee?.staff_type === 'Teaching' && (
                <Button
                  onClick={() => {
                    setIsLandscapeViewOpen(true)
                  }}
                  className="bg-white/20 hover:bg-white/30 text-white border-2 border-white/30 backdrop-blur-sm shrink-0"
                  size="lg"
                >
                  <ZoomIn className="h-5 w-5 mr-2" />
                  Full Schedule Overview
                </Button>
              )}
            </div>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar bg-gray-50 dark:bg-neutral-800">
            <div className="space-y-6 max-w-full">
              {/* Employee Information Card */}
              <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-neutral-700 space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    Employee Information
                  </h3>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                      {(viewEmployee as any)?.staff_type || 'Teaching'}
                    </Badge>
                    <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300">
                      {viewEmployee?.employment_status || 'Part Time'}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-1">RFID Code</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{viewEmployee?.rfid_code || '-'}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-1">School ID</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{viewEmployee?.school_id || '-'}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 lg:col-span-2">
                    <p className="text-[11px] uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-1">Department</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{viewEmployee?.department || '-'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Email Address</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-all">{viewEmployee?.email || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Phone Number</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{viewEmployee?.phone || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Hire Date</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{viewEmployee ? new Date(viewEmployee.hire_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Start Date (Work Begin)</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{viewEmployee && (viewEmployee as any).start_date ? new Date((viewEmployee as any).start_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-cyan-200/70 dark:border-cyan-800/50 bg-cyan-50/50 dark:bg-cyan-950/20 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                      {String((viewEmployee as any)?.staff_type || '').toLowerCase() === 'non-teaching'
                        ? `Today's Work Snapshot (${todaysScheduleOverview.todayName})`
                        : `Today's Schedule Snapshot (${todaysScheduleOverview.todayName})`}
                    </p>
                    {String((viewEmployee as any)?.staff_type || '').toLowerCase() === 'non-teaching' ? (
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px]">
                        Non-Teaching Dynamic
                      </Badge>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 text-[10px]">
                          {todaysScheduleOverview.classesCount} Classes
                        </Badge>
                        <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 text-[10px]">
                          {todaysScheduleOverview.examsCount} Exams
                        </Badge>
                      </div>
                    )}
                  </div>

                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    {todaysWorkHours}
                  </p>

                  {String((viewEmployee as any)?.staff_type || '').toLowerCase() === 'non-teaching' ? (
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      This employee follows non-teaching work assignments. Class and exam schedule blocks are intentionally hidden.
                    </p>
                  ) : todaysScheduleOverview.items.length > 0 ? (
                    <div className="space-y-2">
                      {todaysScheduleOverview.items.slice(0, 4).map((item, idx) => (
                        <button
                          key={`${item.kind}-${idx}`}
                          type="button"
                          onClick={() => {
                            setIsLandscapeViewOpen(true)
                            setFocusFullOverviewToday(true)
                          }}
                          className="w-full text-left rounded-lg border border-cyan-200/60 dark:border-cyan-800/40 bg-white/70 dark:bg-neutral-900/40 px-3 py-2 hover:bg-cyan-100/60 dark:hover:bg-cyan-900/30 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">
                              {item.title}
                            </p>
                            <Badge className={item.kind === 'Exam' ? 'bg-purple-600 text-white text-[10px]' : 'bg-blue-600 text-white text-[10px]'}>
                              {item.kind}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-1">
                            {formatDbTime12h(item.time_start)} - {formatDbTime12h(item.time_end)} • {item.room} • {item.section}
                          </p>
                        </button>
                      ))}
                      {todaysScheduleOverview.items.length > 4 && (
                        <p className="text-[11px] text-gray-600 dark:text-gray-400">
                          +{todaysScheduleOverview.items.length - 4} more schedule blocks today
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      No specific class or exam blocks found for today. Default schedule is shown above when available.
                    </p>
                  )}
                </div>
              </div>

              {/* Work Status Banner */}
              {(() => {
                const today = getManilaToday()
                const startDate = (viewEmployee as any)?.start_date || viewEmployee?.hire_date
                const workStarted = hasWorkStarted(today, startDate, viewEmployee?.hire_date)
                
                if (!workStarted) {
                  return (
                    <div className="bg-linear-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl p-6 border border-amber-200 dark:border-amber-700">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-amber-500 dark:bg-amber-600 rounded-lg shrink-0">
                          <CalendarIcon className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base font-bold text-amber-900 dark:text-amber-100">Work Has Not Started Yet</h3>
                          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                            This employee's work begins on <span className="font-semibold">{new Date(startDate + 'T00:00:00+08:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                          </p>
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                            Attendance logs, reports, and statistics will be available once the employee's work start date arrives.
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                }
                
                return null
              })()}


            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Archived View Employee Dialog - Keep original complex one for now */}
      <Dialog open={false}>
        <DialogContent className="hidden">
          <div>Placeholder</div>
        </DialogContent>
      </Dialog>

      {/* Add Class Schedule Modal */}
      <AddClassModal
        open={isAddClassModalOpen && !!viewEmployee}
        onOpenChange={(open) => {
          if (!viewEmployee) {
            setIsAddClassModalOpen(false)
            return
          }
          setIsAddClassModalOpen(open)
          if (!open) setEditingClassSchedule(null)
        }}
        onSubmit={handleSaveClassSchedule}
        initialData={editingClassSchedule || undefined}
        employeeName={getEmployeeDisplayName(viewEmployee?.full_name)}
        employeeId={viewEmployee?.employee_id}
      />

      {/* Add Exam Schedule Modal */}
      <AddExamModal
        open={isAddExamModalOpen && !!viewEmployee}
        onOpenChange={(open) => {
          if (!viewEmployee) {
            setIsAddExamModalOpen(false)
            return
          }
          setIsAddExamModalOpen(open)
          if (!open) setEditingExamSchedule(null)
        }}
        onSubmit={handleSaveExamSchedule}
        initialData={editingExamSchedule || undefined}
        employeeName={getEmployeeDisplayName(viewEmployee?.full_name)}
        employeeId={viewEmployee?.employee_id}
      />

      {/* Day Schedule Modal - Read-only view of schedules for a specific day */}
      <ViewDayScheduleModal
        open={isDayScheduleModalOpen}
        onOpenChange={setIsDayScheduleModalOpen}
        day={selectedDay}
        type={selectedScheduleType}
        schedules={
          selectedScheduleType === 'class'
            ? (viewSchedules || [])
                .filter((s: any) => {
                  const dayName = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][selectedDay - 1]
                  return isScheduleOnDay(s.day_of_week, dayName)
                })
                .map((s: any) => ({
                  schedule_id: s.schedule_id,
                  time_start: s.time_start,
                  time_end: s.time_end,
                  subject_name: s.subject_name,
                  course_code: s.course_code,
                  section: s.section,
                  room_code: s.room_code,
                  room: s.room_code,
                  class_type: s.class_type,
                  type: s.class_type === 'LEC' ? 'Lecture' : 'Lab',
                }))
            : visibleExamSchedules
                .filter((s: any) => {
                  const dayName = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][selectedDay - 1]
                  return isScheduleOnDay(s.day_of_week, dayName)
                })
                .map((s: any) => ({
                  exam_schedule_id: s.exam_schedule_id,
                  time_start: s.time_start,
                  time_end: s.time_end,
                  subject: s.subject_name,
                  course_code: s.course_code,
                  section: s.section,
                  room_code: s.room_code,
                  room: s.room_code,
                  type: s.exam_type || 'Midterm',
                  exam_date: s.exam_date,
                  substitute: s.substitute_employee_name,
                }))
        }
        employeeName={getEmployeeDisplayName(viewEmployee?.full_name)}
      />

      {/* Department Creation/Edit Dialog */}
      <Dialog open={isDeptDialogOpen} onOpenChange={setIsDeptDialogOpen}>
        <DialogContent 
          className="sm:max-w-[760px]"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{editingDept ? 'Edit Department' : 'Create New Department'}</DialogTitle>
            <DialogDescription>
              {editingDept ? 'Update the department details below.' : 'Enter the details for the new department. All fields marked with * are required.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 py-4">
            <div className="space-y-4 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-neutral-700 pb-4 lg:pb-0 lg:pr-5">
              <div className="space-y-2">
                <Label htmlFor="dept-name">Department Name *</Label>
                <Input
                  id="dept-name"
                  placeholder="e.g., Computer Science"
                  value={deptFormName}
                  onChange={(e) => {
                    setDeptFormName(e.target.value)
                    if (deptInvalidFields.has('dept-name')) {
                      setDeptInvalidFields(prev => {
                        const next = new Set(prev)
                        next.delete('dept-name')
                        return next
                      })
                    }
                  }}
                  className={cn(
                    "border-gray-300 dark:border-neutral-600",
                    deptInvalidFields.has('dept-name') && "border-red-500 focus:border-red-500 focus:ring-red-500"
                  )}
                />
                {deptInvalidFields.has('dept-name') && (
                  <p className="text-xs text-red-600 dark:text-red-400">Department Name is required</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="dept-acronym">Acronym *</Label>
                <Input
                  id="dept-acronym"
                  placeholder="e.g., CS"
                  value={deptFormAcronym}
                  onChange={(e) => {
                    setDeptFormAcronym(e.target.value.toUpperCase())
                    if (deptInvalidFields.has('dept-acronym')) {
                      setDeptInvalidFields(prev => {
                        const next = new Set(prev)
                        next.delete('dept-acronym')
                        return next
                      })
                    }
                  }}
                  className={cn(
                    "border-gray-300 dark:border-neutral-600 uppercase",
                    deptInvalidFields.has('dept-acronym') && "border-red-500 focus:border-red-500 focus:ring-red-500"
                  )}
                />
                {deptInvalidFields.has('dept-acronym') && (
                  <p className="text-xs text-red-600 dark:text-red-400">Acronym is required</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="dept-category">Category *</Label>
                <Select 
                  value={deptFormCategory} 
                  onValueChange={(value) => {
                    setDeptFormCategory(value as 'Teaching' | 'Non-Teaching')
                    if (deptInvalidFields.has('dept-category')) {
                      setDeptInvalidFields(prev => {
                        const next = new Set(prev)
                        next.delete('dept-category')
                        return next
                      })
                    }
                  }}
                >
                  <SelectTrigger className={cn(
                    "border-gray-300 dark:border-neutral-600",
                    deptInvalidFields.has('dept-category') && "border-red-500 focus:border-red-500 focus:ring-red-500"
                  )}>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffTypeFilter === 'Non-Teaching' ? (
                      <SelectItem value="Non-Teaching">Non-Teaching</SelectItem>
                    ) : staffTypeFilter === 'Teaching' ? (
                      <SelectItem value="Teaching">Teaching</SelectItem>
                    ) : (
                      <>
                        <SelectItem value="Teaching">Teaching</SelectItem>
                        <SelectItem value="Non-Teaching">Non-Teaching</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
                {deptInvalidFields.has('dept-category') && (
                  <p className="text-xs text-red-600 dark:text-red-400">Category is required</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="dept-desc">Description (Optional)</Label>
                <Input
                  id="dept-desc"
                  placeholder="Brief description"
                  value={deptFormDesc}
                  onChange={(e) => setDeptFormDesc(e.target.value)}
                  className="border-gray-300 dark:border-neutral-600"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">Existing Departments</h4>
                <span className="text-xs text-gray-500 dark:text-gray-400">{scopedDepartments.length} total</span>
              </div>
              <div className="max-h-72 overflow-y-auto border border-gray-200 dark:border-neutral-700 rounded-lg divide-y divide-gray-200 dark:divide-neutral-700">
                {scopedDepartments.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500 dark:text-gray-400">No departments found.</div>
                ) : (
                  scopedDepartments.map((dept) => {
                    const usage = getDepartmentEmployeeCount(dept.name)
                    return (
                      <div key={dept.department_id} className="p-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{dept.acronym ? `${dept.acronym} - ${dept.name}` : dept.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{dept.category || 'Uncategorized'}{usage > 0 ? ` • ${usage} employee(s)` : ''}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditDepartment(dept)}
                            title="Edit department"
                          >
                            <Edit className="h-4 w-4 text-blue-600" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => openDeleteDeptDialog(dept)}
                            title="Delete department"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Departments assigned to employees cannot be deleted until reassigned.</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDeptDialogOpen(false)
                setDeptFormName("")
                setDeptFormAcronym("")
                setDeptFormDesc("")
                setDeptFormCategory("")
                setEditingDept(null)
                setDeptInvalidFields(new Set())
                setDeptValidationErrors([])
              }}
              disabled={isDeptSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={editingDept ? handleUpdateDepartment : handleCreateDepartment}
              disabled={isDeptSubmitting}
            >
              {isDeptSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {editingDept ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                editingDept ? 'Update Department' : 'Create Department'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Department Confirmation Dialog */}
      <AlertDialog open={deleteDeptDialogOpen} onOpenChange={setDeleteDeptDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Delete Department
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2">
              {deptToDelete && (
                <>
                  <p>
                    You are about to delete <span className="font-semibold">{deptToDelete.acronym ? `${deptToDelete.acronym} - ${deptToDelete.name}` : deptToDelete.name}</span>.
                  </p>
                  {getDepartmentEmployeeCount(deptToDelete.name) > 0 ? (
                    <div className="space-y-3">
                      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-800">
                        Cannot delete this department because <span className="font-semibold">{getDepartmentEmployeeCount(deptToDelete.name)}</span> employee(s) are assigned to it. Reassign each employee first.
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Reassign employees</Label>
                        <div className="space-y-2">
                          {(deptEmployeesToReassign || []).map((emp) => (
                            <div key={emp.employee_id} className="flex flex-col gap-1">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                  {emp.full_name}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 font-mono">
                                  {emp.school_id}
                                </span>
                              </div>
                              <Select
                                value={deptEmployeeReassignments[emp.employee_id] || ''}
                                onValueChange={(value) => {
                                  setDeptEmployeeReassignments((prev) => ({ ...prev, [emp.employee_id]: value }))
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select new department" />
                                </SelectTrigger>
                                <SelectContent>
                                  {scopedDepartments
                                    .filter((d) => !deptToDelete || d.department_id !== deptToDelete.department_id)
                                    .map((d) => (
                                      <SelectItem key={d.department_id} value={String(d.department_id)}>
                                        {d.acronym ? `${d.acronym} - ${d.name}` : d.name}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Only employee department assignments will be updated. Historical attendance logs remain unchanged.</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-red-600 dark:text-red-400 font-medium">This action cannot be undone.</p>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeptToDelete(null)}>Cancel</AlertDialogCancel>
            {deptToDelete && getDepartmentEmployeeCount(deptToDelete.name) > 0 && (
              <AlertDialogAction
                onClick={handleReassignAndDeleteDepartment}
                disabled={isDeptReassigning || isDeptDeleting}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isDeptReassigning ? 'Reassigning...' : 'Reassign & Delete'}
              </AlertDialogAction>
            )}
            <AlertDialogAction
              onClick={handleConfirmDeleteDepartment}
              disabled={!deptToDelete || getDepartmentEmployeeCount(deptToDelete.name) > 0 || isDeptDeleting || isDeptReassigning}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeptDeleting ? 'Deleting...' : 'Delete Department'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Department Validation Error Dialog */}
      <Dialog open={showDeptValidationDialog} onOpenChange={setShowDeptValidationDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Validation Error
            </DialogTitle>
            <DialogDescription>
              Please fix the following errors before proceeding:
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
              {deptValidationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowDeptValidationDialog(false)}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full Schedule Overview Dialog */}
      <Dialog open={isLandscapeViewOpen} onOpenChange={setIsLandscapeViewOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-[96vw] lg:max-w-[1220px] xl:max-w-[1360px] max-h-[94vh] p-0 overflow-hidden [&>button]:hidden">
          {/* Header */}
          <div className="sticky top-0 z-20 bg-white/95 dark:bg-neutral-900/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:supports-[backdrop-filter]:bg-neutral-900/80 border-b border-slate-200 dark:border-slate-700 px-3 sm:px-6 py-3 sm:py-4 shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar className="w-10 h-10 sm:w-12 sm:h-12 ring-2 ring-blue-200 dark:ring-blue-900/60 shadow-sm">
                <AvatarImage 
                  src={viewEmployee ? getEmployeeAvatarUrl(viewEmployee) || '' : ''} 
                  alt={viewEmployee?.full_name || 'Employee'}
                  className="object-cover"
                />
                <AvatarFallback className="text-sm font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  {viewEmployee ? getInitials(viewEmployee.full_name) : 'E'}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{getEmployeeDisplayName(viewEmployee?.full_name)}</h2>
                <p className="text-[11px] sm:text-xs text-gray-600 dark:text-gray-400 truncate">
                  {viewEmployee?.school_id || 'No ID'} • {viewEmployee?.department || 'No Department'}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-[10px] sm:text-xs">
                    {(viewEmployee as any)?.staff_type || 'Teaching'}
                  </Badge>
                  <Badge className="hidden sm:inline-flex bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300 text-[10px] sm:text-xs">
                    {viewEmployee?.employment_status || 'Part Time'}
                  </Badge>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsLandscapeViewOpen(false)}
              className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-full h-8 w-8 sm:h-9 sm:w-9 shrink-0"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          </div>

          {/* Content - Scrollable Area */}
          <ScrollArea ref={fullOverviewScrollAreaRef} className="max-h-[calc(90vh-120px)]">
            <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-neutral-900">
              {/* Employee Information */}
              <div className="bg-white dark:bg-neutral-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-neutral-700 space-y-4">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  Employee Information
                </h3>
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                    <p className="text-gray-500 dark:text-gray-400 mb-1">RFID Code</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{viewEmployee?.rfid_code || '-'}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                    <p className="text-gray-500 dark:text-gray-400 mb-1">School ID</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{viewEmployee?.school_id || '-'}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 col-span-2 xl:col-span-2">
                    <p className="text-gray-500 dark:text-gray-400 mb-1">Department</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{viewEmployee?.department || '-'}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 col-span-2 xl:col-span-2">
                    <p className="text-gray-500 dark:text-gray-400 mb-1">Email</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{viewEmployee?.email || '-'}</p>
                  </div>
                  <div className="rounded-lg border border-cyan-200/70 dark:border-cyan-800/60 bg-cyan-50/60 dark:bg-cyan-950/20 p-3 col-span-2 xl:col-span-2 space-y-2">
                    <p className="text-cyan-700 dark:text-cyan-300 mb-1">
                      {String((viewEmployee as any)?.staff_type || '').toLowerCase() === 'non-teaching'
                        ? `Today's Work Snapshot (${todaysScheduleOverview.todayName})`
                        : `Today's Schedule Snapshot (${todaysScheduleOverview.todayName})`}
                    </p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{todaysWorkHours}</p>
                    {String((viewEmployee as any)?.staff_type || '').toLowerCase() === 'non-teaching' ? (
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px] w-fit">
                        Non-Teaching Dynamic
                      </Badge>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 text-[10px]">
                          {todaysScheduleOverview.classesCount} Classes
                        </Badge>
                        <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 text-[10px]">
                          {todaysScheduleOverview.examsCount} Exams
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-xl border border-blue-200/70 dark:border-blue-900/50 bg-blue-50/70 dark:bg-blue-950/30 p-3">
                  <p className="text-[11px] text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                    {isViewingNonTeaching ? 'Schedule Mode' : 'Total Class Blocks'}
                  </p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                    {isViewingNonTeaching ? 'Dynamic' : (viewSchedules?.length || 0)}
                  </p>
                </div>
                <div className="rounded-xl border border-purple-200/70 dark:border-purple-900/50 bg-purple-50/70 dark:bg-purple-950/30 p-3">
                  <p className="text-[11px] text-purple-700 dark:text-purple-300 uppercase tracking-wide">
                    {isViewingNonTeaching ? 'Default Shift' : 'Total Exam Blocks'}
                  </p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                    {isViewingNonTeaching
                      ? (viewEmployee?.schedule_time_in && viewEmployee?.schedule_time_out
                        ? `${formatDbTime12h(viewEmployee.schedule_time_in)} - ${formatDbTime12h(viewEmployee.schedule_time_out)}`
                        : '-')
                      : (visibleExamSchedules.length || 0)}
                  </p>
                </div>
                <div className="rounded-xl border border-cyan-200/70 dark:border-cyan-900/50 bg-cyan-50/70 dark:bg-cyan-950/30 p-3">
                  <p className="text-[11px] text-cyan-700 dark:text-cyan-300 uppercase tracking-wide">
                    {isViewingNonTeaching ? "Today's Assignment" : "Today's Blocks"}
                  </p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{todaysScheduleOverview.totalCount}</p>
                </div>
                <div className="rounded-xl border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/30 p-3">
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">Today's Time Span</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-2 truncate">{todaysWorkHours}</p>
                </div>
              </div>

              <div className={weeklyScheduleConflicts.total > 0 ? 'rounded-xl border border-rose-300 dark:border-rose-700/60 bg-rose-50/70 dark:bg-rose-950/25 p-4 space-y-3' : 'rounded-xl border border-emerald-200 dark:border-emerald-700/50 bg-emerald-50/70 dark:bg-emerald-950/25 p-4 space-y-3'}>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <AlertTriangle className={weeklyScheduleConflicts.total > 0 ? 'h-4 w-4 text-rose-600 dark:text-rose-400' : 'h-4 w-4 text-emerald-600 dark:text-emerald-400'} />
                    {isViewingNonTeaching ? 'Work Assignment Notes' : 'Resolve Conflicts'}
                  </h4>
                  <Badge className={weeklyScheduleConflicts.total > 0 ? 'bg-rose-600 text-white text-[10px]' : 'bg-emerald-600 text-white text-[10px]'}>
                    {weeklyScheduleConflicts.total} Issue{weeklyScheduleConflicts.total === 1 ? '' : 's'}
                  </Badge>
                </div>

                {!isViewingNonTeaching && weeklyScheduleConflicts.total > 0 ? (
                  <div className="space-y-2">
                    {weeklyScheduleConflicts.items.slice(0, 6).map((conflict, idx) => (
                      <div key={`${conflict.kind}-${conflict.day}-${idx}`} className="rounded-lg border border-rose-200 dark:border-rose-800/50 bg-white/80 dark:bg-neutral-900/60 px-3 py-2">
                        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                          {conflict.day} • {conflict.kind} overlap
                        </p>
                        <p className="text-[11px] text-gray-700 dark:text-gray-300 mt-1">
                          {conflict.currentTitle} ({conflict.currentTime}) overlaps with {conflict.overlapsWith} ({conflict.overlapsTime})
                        </p>
                      </div>
                    ))}
                    {weeklyScheduleConflicts.total > 6 && (
                      <p className="text-[11px] text-rose-700 dark:text-rose-300 font-medium">
                        +{weeklyScheduleConflicts.total - 6} more conflicts in this weekly view
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    {isViewingNonTeaching
                      ? 'Class and exam conflict checks are not applicable for non-teaching dynamic schedules.'
                      : 'No overlapping class or exam blocks found across Monday to Saturday.'}
                  </p>
                )}
              </div>

              <div ref={todaysDetailedBlocksRef} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-neutral-800 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {isViewingNonTeaching ? "Today's Work Notes" : "Today's Detailed Blocks"}
                  </h4>
                  <Badge className="bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100 text-[10px]">
                    {todaysScheduleOverview.todayName}
                  </Badge>
                </div>

                {!isViewingNonTeaching && todaysScheduleOverview.items.length > 0 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                    {todaysScheduleOverview.items.map((item, idx) => (
                      <div key={`${item.kind}-${idx}`} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 bg-slate-50/80 dark:bg-neutral-900/50">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{item.title}</p>
                          <Badge className={item.kind === 'Exam' ? 'bg-purple-600 text-white text-[10px]' : 'bg-blue-600 text-white text-[10px]'}>
                            {item.kind}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-1">
                          {formatDbTime12h(item.time_start)} - {formatDbTime12h(item.time_end)} • {item.room} • {item.section}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {isViewingNonTeaching
                      ? 'Non-teaching staff schedules are event-based; class and exam entries are intentionally hidden.'
                      : 'No class or exam entries found for today.'}
                  </p>
                )}
              </div>

              {!isViewingNonTeaching && (viewSchedules?.length || 0) === 0 && visibleExamSchedules.length === 0 && (
                <div className="rounded-xl border border-red-300 dark:border-red-700/60 bg-red-50/80 dark:bg-red-950/25 p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-full bg-red-600 p-1.5 text-white animate-pulse">
                      <AlertCircle className="h-4 w-4 animate-bounce" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-red-800 dark:text-red-300">No class or exam schedules found for this employee in the selected term.</p>
                      <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                        Update this employee by adding Class Schedule and/or Exam Schedule blocks, or switch the active academic term if this profile belongs to a different term.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!isViewingNonTeaching && (
              <>
              {/* Class Schedule Section */}
              <div className="space-y-4">
                <div className="rounded-xl border border-blue-200/70 dark:border-blue-800/60 bg-blue-50/60 dark:bg-blue-950/20 p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-2 sm:gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                        <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">Class Schedule</h3>
                        <p className="text-[11px] sm:text-xs text-gray-600 dark:text-gray-400">
                          {viewSchedules?.length || 0} {viewSchedules?.length === 1 ? 'class' : 'classes'} scheduled
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-blue-600 text-white dark:bg-blue-500 text-[10px] sm:text-xs">
                      Teaching Load
                    </Badge>
                  </div>
                </div>

                {(!viewSchedules || viewSchedules.length === 0) ? (
                  <div className="text-center py-10 text-gray-500 bg-white dark:bg-neutral-800 rounded-xl border border-dashed border-gray-300 dark:border-neutral-700">
                    <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <p className="text-sm font-medium mt-3">No classes scheduled</p>
                    <p className="text-xs text-gray-400 mt-1">Assign a teaching schedule to display class blocks here.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2.5 sm:gap-3 lg:gap-4">
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => {
                      const dayClasses = viewSchedules?.filter((s: any) => isScheduleOnDay(s.day_of_week, day)) || []
                      const sortedDayClasses = [...dayClasses].sort((a: any, b: any) => a.time_start.localeCompare(b.time_start))
                      const toMinutes = (time: string) => {
                        if (!time) return 0
                        const clean = String(time).replace(/\s*(AM|PM)/gi, '').trim()
                        const [hours, minutes] = clean.split(':').map(Number)
                        return (hours || 0) * 60 + (minutes || 0)
                      }
                      const classConflictFlags = sortedDayClasses.map(() => false)
                      for (let i = 1; i < sortedDayClasses.length; i++) {
                        const prev = sortedDayClasses[i - 1]
                        const curr = sortedDayClasses[i]
                        if (toMinutes(prev.time_end) > toMinutes(curr.time_start)) {
                          classConflictFlags[i - 1] = true
                          classConflictFlags[i] = true
                        }
                      }
                      const classConflictCount = classConflictFlags.filter(Boolean).length
                      const dayTotalMinutes = sortedDayClasses.reduce((acc: number, schedule: any) => {
                        const start = schedule.time_start ? schedule.time_start.split(':').map(Number) : [0, 0]
                        const end = schedule.time_end ? schedule.time_end.split(':').map(Number) : [0, 0]
                        const startMins = (start[0] || 0) * 60 + (start[1] || 0)
                        const endMins = (end[0] || 0) * 60 + (end[1] || 0)
                        return acc + Math.max(0, endMins - startMins)
                      }, 0)
                      
                      const dayColors = [
                        { bg: 'bg-red-100 dark:bg-red-900/30', border: 'border-red-400', text: 'text-red-700 dark:text-red-300', header: 'bg-red-500' },
                        { bg: 'bg-orange-100 dark:bg-orange-900/30', border: 'border-orange-400', text: 'text-orange-700 dark:text-orange-300', header: 'bg-orange-500' },
                        { bg: 'bg-green-100 dark:bg-green-900/30', border: 'border-green-400', text: 'text-green-700 dark:text-green-300', header: 'bg-green-500' },
                        { bg: 'bg-blue-100 dark:bg-blue-900/30', border: 'border-blue-400', text: 'text-blue-700 dark:text-blue-300', header: 'bg-blue-500' },
                        { bg: 'bg-purple-100 dark:bg-purple-900/30', border: 'border-purple-400', text: 'text-purple-700 dark:text-purple-300', header: 'bg-purple-500' },
                        { bg: 'bg-indigo-100 dark:bg-indigo-900/30', border: 'border-indigo-400', text: 'text-indigo-700 dark:text-indigo-300', header: 'bg-indigo-500' },
                      ]

                      return (
                        <div key={day} className={`bg-white dark:bg-neutral-800 rounded-xl border ${dayColors[index].border} border-opacity-40 overflow-hidden shadow-sm`}>
                          <div className={`${dayColors[index].header} px-3 py-2 text-white flex items-center justify-between gap-2`}>
                            <p className="font-semibold text-sm">{day}</p>
                            <Badge className="bg-white/20 text-white border border-white/25 hover:bg-white/20 text-[10px]">
                              {dayClasses.length} {dayClasses.length === 1 ? 'class' : 'classes'}
                            </Badge>
                          </div>
                          
                          <div className="p-3 space-y-2 min-h-[108px] xl:min-h-[120px]">
                            {dayClasses.length === 0 ? (
                              <p className="text-xs text-gray-400 text-center py-5">No classes</p>
                            ) : (
                              <>
                                <div className="flex items-center justify-between rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 px-2 py-1">
                                  <p className="text-[10px] font-medium text-blue-700 dark:text-blue-300 flex items-center gap-1">
                                    <Layers3 className="h-3 w-3" />
                                    Total Load
                                  </p>
                                  <div className="flex items-center gap-1.5">
                                    {classConflictCount > 0 && (
                                      <Badge className="bg-rose-600 text-white text-[10px] px-1.5 py-0">
                                        {classConflictCount} Conflict{classConflictCount > 1 ? 's' : ''}
                                      </Badge>
                                    )}
                                    <p className="text-[10px] font-semibold text-blue-700 dark:text-blue-200">
                                      {(dayTotalMinutes / 60).toFixed(dayTotalMinutes % 60 === 0 ? 0 : 1)} hrs
                                    </p>
                                  </div>
                                </div>
                                {sortedDayClasses.map((schedule: any, idx: number) => {
                                  const formatTime = (time: string) => formatDbTime12h(time)

                                  return (
                                    <div key={idx} className={classConflictFlags[idx] ? 'bg-rose-50 dark:bg-rose-900/20 rounded-lg p-2.5 border border-rose-300 dark:border-rose-700/70' : 'bg-gray-50 dark:bg-neutral-700/50 rounded-lg p-2.5 border border-gray-200 dark:border-neutral-600'}>
                                      <div className="flex items-start gap-2">
                                        <div className="h-5 w-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                                          {idx + 1}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <h4 className="font-semibold text-xs text-gray-900 dark:text-gray-100 mb-1.5 leading-tight flex items-center gap-1.5">
                                            <BookOpen className="h-3 w-3 text-blue-500" />
                                            <span className="truncate">{schedule.subject_name || schedule.subject}</span>
                                          </h4>
                                          {classConflictFlags[idx] && (
                                            <p className="text-[10px] mb-1 text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-1">
                                              <AlertTriangle className="h-3 w-3" />
                                              Time conflict detected on this day
                                            </p>
                                          )}
                                          <div className="space-y-1 text-[10px] text-gray-600 dark:text-gray-400">
                                            <div className="flex items-center gap-1">
                                              <Clock className="h-3 w-3 shrink-0" />
                                              <span>{formatTime(schedule.time_start)} - {formatTime(schedule.time_end)}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <MapPin className="h-3 w-3 shrink-0" />
                                              <span>{schedule.room_code || schedule.room}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <Users className="h-3 w-3 shrink-0" />
                                              <span className="truncate">{schedule.section}</span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Exam Schedule Section */}
              <div className="space-y-4">
                <div className="rounded-xl border border-purple-200/70 dark:border-purple-800/60 bg-purple-50/60 dark:bg-purple-950/20 p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-2 sm:gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                        <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">Exam Schedule</h3>
                        <p className="text-[11px] sm:text-xs text-gray-600 dark:text-gray-400">
                          {visibleExamSchedules.length || 0} {visibleExamSchedules.length === 1 ? 'exam' : 'exams'} scheduled
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-purple-600 text-white dark:bg-purple-500 text-[10px] sm:text-xs">
                      Assessment Load
                    </Badge>
                  </div>
                </div>

                {(visibleExamSchedules.length === 0) ? (
                  <div className="bg-white dark:bg-neutral-800 rounded-xl border border-dashed border-gray-300 dark:border-neutral-700 p-6">
                    <div className="max-w-md mx-auto space-y-4">
                      <div className="rounded-lg border border-purple-200/70 dark:border-purple-800/60 bg-purple-50/70 dark:bg-purple-950/20 p-3">
                        <div className="h-2 w-24 rounded bg-purple-300/70 dark:bg-purple-700/70 mb-2" />
                        <div className="h-2 w-full rounded bg-purple-200/70 dark:bg-purple-800/60 mb-1.5" />
                        <div className="h-2 w-3/4 rounded bg-purple-200/70 dark:bg-purple-800/60" />
                      </div>
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-neutral-900/40 p-3">
                        <div className="h-2 w-20 rounded bg-slate-300/70 dark:bg-slate-600/70 mb-2" />
                        <div className="h-2 w-full rounded bg-slate-200/80 dark:bg-slate-700/70 mb-1.5" />
                        <div className="h-2 w-2/3 rounded bg-slate-200/80 dark:bg-slate-700/70" />
                      </div>
                    </div>

                    <div className="text-center mt-5 text-gray-500 dark:text-gray-400">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">No exams scheduled</p>
                      <p className="text-xs mt-1">Exam blocks will appear here once an exam schedule is assigned.</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2.5 sm:gap-3 lg:gap-4">
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => {
                      const dayExams = visibleExamSchedules.filter((s: any) => isScheduleOnDay(s.day_of_week, day))
                      const sortedDayExams = [...dayExams].sort((a: any, b: any) => a.time_start.localeCompare(b.time_start))
                      const toMinutes = (time: string) => {
                        if (!time) return 0
                        const clean = String(time).replace(/\s*(AM|PM)/gi, '').trim()
                        const [hours, minutes] = clean.split(':').map(Number)
                        return (hours || 0) * 60 + (minutes || 0)
                      }
                      const examConflictFlags = sortedDayExams.map(() => false)
                      for (let i = 1; i < sortedDayExams.length; i++) {
                        const prev = sortedDayExams[i - 1]
                        const curr = sortedDayExams[i]
                        if (toMinutes(prev.time_end) > toMinutes(curr.time_start)) {
                          examConflictFlags[i - 1] = true
                          examConflictFlags[i] = true
                        }
                      }
                      const examConflictCount = examConflictFlags.filter(Boolean).length
                      
                      const dayColors = [
                        { bg: 'bg-red-100 dark:bg-red-900/30', border: 'border-red-400', text: 'text-red-700 dark:text-red-300', header: 'bg-red-500' },
                        { bg: 'bg-orange-100 dark:bg-orange-900/30', border: 'border-orange-400', text: 'text-orange-700 dark:text-orange-300', header: 'bg-orange-500' },
                        { bg: 'bg-green-100 dark:bg-green-900/30', border: 'border-green-400', text: 'text-green-700 dark:text-green-300', header: 'bg-green-500' },
                        { bg: 'bg-blue-100 dark:bg-blue-900/30', border: 'border-blue-400', text: 'text-blue-700 dark:text-blue-300', header: 'bg-blue-500' },
                        { bg: 'bg-purple-100 dark:bg-purple-900/30', border: 'border-purple-400', text: 'text-purple-700 dark:text-purple-300', header: 'bg-purple-500' },
                        { bg: 'bg-indigo-100 dark:bg-indigo-900/30', border: 'border-indigo-400', text: 'text-indigo-700 dark:text-indigo-300', header: 'bg-indigo-500' },
                      ]

                      return (
                        <div key={day} className={`bg-white dark:bg-neutral-800 rounded-xl border ${dayColors[index].border} border-opacity-40 overflow-hidden shadow-sm`}>
                          <div className={`${dayColors[index].header} px-3 py-2 text-white flex items-center justify-between gap-2`}>
                            <p className="font-semibold text-sm">{day}</p>
                            <Badge className="bg-white/20 text-white border border-white/25 hover:bg-white/20 text-[10px]">
                              {dayExams.length} {dayExams.length === 1 ? 'exam' : 'exams'}
                            </Badge>
                          </div>
                          
                          <div className="p-3 space-y-2 min-h-[108px] xl:min-h-[120px]">
                            {dayExams.length === 0 ? (
                              <p className="text-xs text-gray-400 text-center py-5">No exams</p>
                            ) : (
                              <>
                                {examConflictCount > 0 && (
                                  <div className="flex items-center justify-between rounded-md bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-700/40 px-2 py-1">
                                    <p className="text-[10px] font-medium text-rose-700 dark:text-rose-300 flex items-center gap-1">
                                      <AlertTriangle className="h-3 w-3" />
                                      Conflict Alert
                                    </p>
                                    <p className="text-[10px] font-semibold text-rose-700 dark:text-rose-200">
                                      {examConflictCount} Overlap{examConflictCount > 1 ? 's' : ''}
                                    </p>
                                  </div>
                                )}
                                {sortedDayExams.map((schedule: any, idx: number) => {
                                  const formatTime = (time: string) => formatDbTime12h(time)

                                  return (
                                    <div key={idx} className={examConflictFlags[idx] ? 'bg-rose-50 dark:bg-rose-900/20 rounded-lg p-2.5 border border-rose-300 dark:border-rose-700/70' : 'bg-gray-50 dark:bg-neutral-700/50 rounded-lg p-2.5 border border-gray-200 dark:border-neutral-600'}>
                                      <div className="flex items-center justify-between gap-2 mb-1.5">
                                        <div className="h-5 w-5 rounded-full bg-purple-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                                          {idx + 1}
                                        </div>
                                        <Badge className="bg-pink-600 text-white text-[10px] px-1.5 py-0">
                                          {schedule.exam_type || schedule.type}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                        <Badge className={schedule.class_type === 'SHS' ? 'bg-blue-600 text-white text-[10px] px-1.5 py-0' : 'bg-purple-600 text-white text-[10px] px-1.5 py-0'}>
                                          {schedule.class_type || 'Tertiary'}
                                        </Badge>
                                        {schedule.exam_date && (
                                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex items-center gap-1">
                                            <CalendarIcon className="h-3 w-3" />
                                            {new Date(schedule.exam_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                          </Badge>
                                        )}
                                      </div>
                                      
                                      <h4 className="font-semibold text-xs text-gray-900 dark:text-gray-100 mb-1.5 leading-tight">
                                        {schedule.subject_name || schedule.subject}
                                      </h4>
                                      {examConflictFlags[idx] && (
                                        <p className="text-[10px] mb-1 text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-1">
                                          <AlertTriangle className="h-3 w-3" />
                                          Exam time conflict detected
                                        </p>
                                      )}
                                      
                                      <div className="space-y-1 text-[10px] text-gray-600 dark:text-gray-400">
                                        <div className="flex items-center gap-1">
                                          <Clock className="h-3 w-3 shrink-0" />
                                          <span>{formatTime(schedule.time_start)} - {formatTime(schedule.time_end)}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <MapPin className="h-3 w-3 shrink-0" />
                                          <span>{schedule.room_code || schedule.room}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <Users className="h-3 w-3 shrink-0" />
                                          <span className="truncate">{schedule.section}</span>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              </>
              )}
            </div>
          </ScrollArea>

          {showBackToTopInOverview && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const viewport = fullOverviewScrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null
                viewport?.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              className="absolute bottom-4 right-4 z-30 bg-slate-900 text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-lg"
            >
              <ChevronUp className="h-4 w-4 mr-1" />
              Back to Top Summary
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {ValidationDialog}
      {SubstitutionValidationDialog}

      <AlertDialog open={employmentTransitionDialogOpen} onOpenChange={setEmploymentTransitionDialogOpen}>
        <AlertDialogContent className="sm:max-w-[560px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Employment Status Transition</AlertDialogTitle>
            <AlertDialogDescription>
              {employmentTransitionMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setEmploymentTransitionDialogOpen(false)
                setSkipEmploymentTransitionPrompt(false)
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                setEmploymentTransitionDialogOpen(false)
                setSkipEmploymentTransitionPrompt(true)
                setTimeout(() => {
                  handleUpdateEmployee()
                }, 0)
              }}
            >
              Continue Update
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanently Delete Confirmation Dialog */}
      <AlertDialog open={permanentDeleteDialogOpen} onOpenChange={setPermanentDeleteDialogOpen}>
        <AlertDialogContent className="sm:max-w-[425px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Permanently Delete Employee
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-700 dark:text-gray-300">
              Are you absolutely sure you want to permanently delete <span className="font-bold">{employeeToPermanentlyDelete?.name}</span>? 
              <br/><br/>
              <span className="font-semibold text-red-600 dark:text-red-400">WARNING:</span> This action cannot be undone. All data, schedules, and attendances connected to this employee will be deleted forever, and it may cause broken constraints if they are linked to current classes. If you just want to disable this employee, use <span className="font-semibold text-blue-600 mx-1">Archive Employee</span> instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPermanentlyDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault()
                handlePermanentlyDeleteEmployee()
              }}
              className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600 disabled:opacity-50 border-0"
              disabled={isPermanentlyDeleting}
            >
              {isPermanentlyDeleting ? "Deleting forever..." : "Yes, permanently delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

