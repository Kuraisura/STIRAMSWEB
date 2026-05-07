"use client"

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { OperationsScenarioHealthCard } from '@/components/operations-scenario-health-card'
import { getStaffTypeFilter } from '@/lib/offline-dashboard-client'
import { useToast } from '@/hooks/use-toast'
import { Search, ShieldAlert, Lock, Trash2, Edit, KeyRound, RefreshCw, Loader2 } from 'lucide-react'

type RecoveryLog = {
  log_id: number
  employee_id: number 
  full_name?: string
  department?: string
  school_id?: string
  rfid_code: string
  date: string
  log_time: string
  log_type: 'IN' | 'OUT' | 'LEAVE'
  attendance_status: string
  is_late: boolean
  is_early_out: boolean
  notes?: string | null
}

type RecoveryAdminUser = {
  id: number
  full_name: string
  email: string
  role?: string | null
  is_active: boolean
}

type ScheduleIntegritySummary = {
  term: string
  max_rows: number
  total_issues: number
  orphan_teaching_owner_count: number
  orphan_exam_owner_count: number
  non_teaching_teaching_owner_count: number
  non_teaching_exam_owner_count: number
  invalid_teaching_substitute_count: number
  invalid_exam_substitute_count: number
  self_teaching_substitute_count: number
  self_exam_substitute_count: number
}

type ScheduleIntegrityPayload = {
  summary: ScheduleIntegritySummary
  details: Record<string, any[]>
}

type DbTableResult = {
  table: string
  connected: boolean
  rowCount: number | null
  sampleColumns: string[]
  sampleRows: any[]
  error: string | null
  queryTimeMs: number
  schemaColumns?: { column_name: string; data_type: string }[]
}

const DB_TABLE_LABELS: Record<string, string> = {
  employees: 'Employees',
  teaching_schedules: 'Teaching Schedules',
  exam_schedules: 'Exam Schedules',
  attendance_logs: 'Attendance Logs',
  verification_requests: 'Verification Requests',
  holiday_calendar: 'Holiday Calendar',
  departments: 'Departments',
  admin_users: 'Admin Users',
  academic_terms: 'Academic Terms',
  courses: 'Courses',
  rooms: 'Rooms',
}

function DbTableTestCard() {
  const { toast } = useToast()
  const [dbTestResults, setDbTestResults] = useState<DbTableResult[]>([])
  const [dbTestLoading, setDbTestLoading] = useState(false)
  const [dbTestExpandedTable, setDbTestExpandedTable] = useState<string | null>(null)
  const [dbTestFilterTerm, setDbTestFilterTerm] = useState('')
  const [dbTestFilterEmployeeId, setDbTestFilterEmployeeId] = useState('')
  const [dbTestTestedAt, setDbTestTestedAt] = useState<string | null>(null)
  const [dbTestSingleLoading, setDbTestSingleLoading] = useState<string | null>(null)

  const runAllDbTests = async () => {
    setDbTestLoading(true)
    setDbTestResults([])
    try {
      const params = new URLSearchParams()
      if (dbTestFilterTerm && dbTestFilterTerm !== 'all_terms') params.set('term', dbTestFilterTerm)
      if (dbTestFilterEmployeeId) params.set('employee_id', dbTestFilterEmployeeId)
      const res = await fetch(`/api/recovery/db-test?${params.toString()}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Database test failed')
      setDbTestResults(Array.isArray(data?.results) ? data.results : [])
      setDbTestTestedAt(data?.testedAt || new Date().toISOString())
      const failCount = (data?.results || []).filter((r: DbTableResult) => !r.connected).length
      toast({
        title: failCount > 0 ? `${failCount} table(s) failed` : 'All tables connected!',
        description: `Tested ${data?.results?.length || 0} tables.`,
        variant: failCount > 0 ? 'destructive' : 'default',
      })
    } catch (err: any) {
      toast({ title: 'Database test failed', description: err?.message || 'Unknown error', variant: 'destructive' })
    } finally {
      setDbTestLoading(false)
    }
  }

  const runSingleTableTest = async (tableName: string) => {
    setDbTestSingleLoading(tableName)
    try {
      const params = new URLSearchParams({ table: tableName })
      if (dbTestFilterTerm && dbTestFilterTerm !== 'all_terms') params.set('term', dbTestFilterTerm)
      if (dbTestFilterEmployeeId) params.set('employee_id', dbTestFilterEmployeeId)
      const res = await fetch(`/api/recovery/db-test?${params.toString()}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Table test failed')
      const results = Array.isArray(data?.results) ? data.results : []
      if (results.length > 0) {
        setDbTestResults(prev => {
          const existing = prev.filter(r => r.table !== tableName)
          return [...existing, ...results]
        })
        setDbTestExpandedTable(tableName)
      }
    } catch (err: any) {
      toast({ title: 'Table test failed', description: err?.message || 'Unknown error', variant: 'destructive' })
    } finally {
      setDbTestSingleLoading(null)
    }
  }

  const passedCount = dbTestResults.filter(r => r.connected).length
  const failedCount = dbTestResults.filter(r => !r.connected).length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-cyan-600" />
          Database Table Connectivity Test
        </CardTitle>
        <CardDescription>
          Test each database table to verify connectivity, row counts, and sample data. Use term/employee filters for schedule tables.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="rounded-lg border border-cyan-200/70 dark:border-cyan-800 bg-cyan-50/40 dark:bg-cyan-950/20 p-3">
          <p className="text-xs font-semibold text-cyan-900 dark:text-cyan-100 mb-2">Filters (for schedule tables)</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Academic Term</Label>
              <Select
                value={dbTestFilterTerm}
                onValueChange={setDbTestFilterTerm}
              >
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue placeholder="All terms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_terms">All Terms</SelectItem>
                  <SelectItem value="1st_term">1st Term</SelectItem>
                  <SelectItem value="2nd_term">2nd Term</SelectItem>
                  <SelectItem value="summer">Summer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Employee ID</Label>
              <Input
                type="number"
                min={1}
                placeholder="Any employee"
                value={dbTestFilterEmployeeId}
                onChange={(e) => setDbTestFilterEmployeeId(e.target.value)}
                className="h-9 mt-1"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                type="button"
                onClick={runAllDbTests}
                disabled={dbTestLoading}
                className="h-9"
              >
                {dbTestLoading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Testing...</> : <><RefreshCw className="h-4 w-4 mr-1" /> Test All Tables</>}
              </Button>
              {dbTestFilterTerm || dbTestFilterEmployeeId ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => { setDbTestFilterTerm(''); setDbTestFilterEmployeeId('') }}
                >
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Summary */}
        {dbTestResults.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="default" className="bg-green-600 text-white">{passedCount} Connected</Badge>
            {failedCount > 0 && <Badge variant="destructive">{failedCount} Failed</Badge>}
            {dbTestTestedAt && (
              <span className="text-xs text-muted-foreground">
                Tested at {new Date(dbTestTestedAt).toLocaleString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}
              </span>
            )}
          </div>
        )}

        {/* Table buttons row */}
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(DB_TABLE_LABELS).map(([key, label]) => {
            const result = dbTestResults.find(r => r.table === key)
            const isLoading = dbTestSingleLoading === key
            return (
              <Button
                key={key}
                type="button"
                variant="outline"
                size="sm"
                className={`h-8 text-xs ${result ? (result.connected ? 'border-green-400 bg-green-50/60 dark:bg-green-950/20 dark:border-green-700 text-green-800 dark:text-green-200' : 'border-red-400 bg-red-50/60 dark:bg-red-950/20 dark:border-red-700 text-red-800 dark:text-red-200') : ''}`}
                onClick={() => runSingleTableTest(key)}
                disabled={isLoading || dbTestLoading}
              >
                {isLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                {label}
                {result && result.connected ? ` (${result.rowCount ?? '?'})` : ''}
                {result && !result.connected ? ' ✗' : ''}
              </Button>
            )
          })}
        </div>

        {/* Results detail */}
        {dbTestResults.length > 0 && (
          <div className="space-y-2">
            {dbTestResults.map(result => (
              <div key={result.table} className={`rounded-lg border p-3 ${result.connected ? 'border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/10' : 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/10'}`}>
                <div className="flex items-center justify-between cursor-pointer" onClick={() => setDbTestExpandedTable(dbTestExpandedTable === result.table ? null : result.table)}>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${result.connected ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                      {result.connected ? '✓' : '✗'} {DB_TABLE_LABELS[result.table] || result.table}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">{result.rowCount ?? 'N/A'} rows</Badge>
                    <span className="text-[10px] text-muted-foreground">{result.queryTimeMs}ms</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{dbTestExpandedTable === result.table ? '▲' : '▼'}</span>
                </div>

                {result.error && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-mono">{result.error}</p>
                )}

                {dbTestExpandedTable === result.table && result.schemaColumns && result.schemaColumns.length > 0 && (
                  <div className="mt-2 mb-1">
                    <p className="text-[10px] font-semibold text-muted-foreground mb-1">Schema: {result.schemaColumns.length} columns</p>
                    <div className="flex flex-wrap gap-1">
                      {result.schemaColumns.map(sc => (
                        <span key={sc.column_name} className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 font-mono">
                          <span className="font-semibold">{sc.column_name}</span>
                          <span className="text-muted-foreground">:{sc.data_type}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {dbTestExpandedTable === result.table && result.sampleRows.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-100 dark:bg-neutral-800">
                          {result.sampleColumns.map(col => (
                            <th key={col} className="text-left p-1.5 border-b border-gray-200 dark:border-neutral-700 font-semibold whitespace-nowrap">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.sampleRows.map((row, idx) => (
                          <tr key={idx} className="border-b border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-900">
                            {result.sampleColumns.map(col => (
                              <td key={col} className="p-1.5 font-mono max-w-[200px] truncate whitespace-nowrap" title={String(row[col] ?? '')}>
                                {row[col] === null ? <span className="text-gray-400 italic">null</span> : String(row[col])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {dbTestExpandedTable === result.table && result.sampleRows.length === 0 && result.connected && (
                  <p className="text-xs text-muted-foreground mt-2 italic">No rows in this table{dbTestFilterTerm || dbTestFilterEmployeeId ? ' (with current filters)' : ''}.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function RecoveryConsolePage() {
  const { toast } = useToast()
  const router = useRouter()
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [recoveryGuestActive, setRecoveryGuestActive] = useState(false)
  const [recoveryOnly, setRecoveryOnly] = useState(false)
  const [signInRecoveryGateRestricted] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return sessionStorage.getItem('rams_recovery_signin_gate') === '1'
    } catch {
      return false
    }
  })
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<RecoveryLog[]>([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<RecoveryLog | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<RecoveryLog | null>(null)
  const [selectedLogIds, setSelectedLogIds] = useState<Set<number>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [adminUsers, setAdminUsers] = useState<RecoveryAdminUser[]>([])
  const [loadingAdmins, setLoadingAdmins] = useState(false)
  const [scheduleIntegrity, setScheduleIntegrity] = useState<ScheduleIntegrityPayload | null>(null)
  const [loadingScheduleIntegrity, setLoadingScheduleIntegrity] = useState(false)
  const [integrityDialogOpen, setIntegrityDialogOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<RecoveryAdminUser | null>(null)
  const [newAdminPassword, setNewAdminPassword] = useState('')
  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const [emailTarget, setEmailTarget] = useState<RecoveryAdminUser | null>(null)
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [isSavingAdminEmail, setIsSavingAdminEmail] = useState(false)
  const [repairScheduleInProgress, setRepairScheduleInProgress] = useState(false)
  const [repairSchedulePreviewInProgress, setRepairSchedulePreviewInProgress] = useState(false)
  const [repairStartDate, setRepairStartDate] = useState('')
  const [repairEndDate, setRepairEndDate] = useState('')
  const [repairEmployeeId, setRepairEmployeeId] = useState('')
  const [repairAggressiveMode, setRepairAggressiveMode] = useState(true)
  const [repairScheduleSummary, setRepairScheduleSummary] = useState<any | null>(null)
  const staffTypeScope = useMemo(() => {
    if (typeof window === 'undefined') return null
    const userStr = localStorage.getItem('rams_user')
    const user = userStr ? JSON.parse(userStr) : null
    return getStaffTypeFilter(user?.email, user?.role)
  }, [])

  const teamMembers = [
    { name: 'Mark Crysler Baddo', role: 'Lead Developer', initials: 'MC', photo: '/Learn%20more%20Page/afb9Q2Y.png' },
    { name: 'Gabriel Clint Manzanilla', role: 'Web Developer & Designer', initials: 'GM', photo: '/Learn%20more%20Page/JOq12NA.jpeg' },
    { name: 'Josh Kirby Palacio', role: 'C# UI Designer', initials: 'JP', photo: '/Learn%20more%20Page/noe74PC.jpeg' },
    { name: 'Rohan Raphael Balingao', role: 'Backend Developer', initials: 'RB', photo: '/Learn%20more%20Page/nXOE9aq.jpeg' },
  ]

  const generateSecurePassword = (length = 16) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+'
    const out: string[] = []
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
      const bytes = new Uint32Array(length)
      window.crypto.getRandomValues(bytes)
      for (let i = 0; i < length; i++) {
        out.push(chars[bytes[i] % chars.length])
      }
      return out.join('')
    }
    for (let i = 0; i < length; i++) {
      out.push(chars[Math.floor(Math.random() * chars.length)])
    }
    return out.join('')
  }

  const extractDateValue = (log: RecoveryLog) => {
    const direct = String(log.date || '').slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct
    const dt = new Date(log.log_time)
    if (Number.isNaN(dt.getTime())) return ''
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  }

  const extractTimeValue = (log: RecoveryLog) => {
    const iso = String(log.log_time || '')
    const isoMatch = iso.match(/T(\d{2}):(\d{2})/)
    if (isoMatch) return `${isoMatch[1]}:${isoMatch[2]}`

    const dt = new Date(iso)
    if (Number.isNaN(dt.getTime())) return ''
    return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
  }

  const formatLogDateTimeDisplay = (log: RecoveryLog) => {
    const raw = String(log.log_time || '').trim()
    const parsed = raw ? new Date(raw) : null

    if (parsed && !Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: 'Asia/Manila',
      })
    }

    // Fallback for invalid timestamps: show readable date + extracted 12h time.
    const datePart = extractDateValue(log)
    const time24 = extractTimeValue(log)
    const timeMatch = time24.match(/^(\d{1,2}):(\d{2})$/)
    if (timeMatch) {
      const hour = Number(timeMatch[1])
      const minute = timeMatch[2]
      const suffix = hour >= 12 ? 'PM' : 'AM'
      const hour12 = ((hour + 11) % 12) + 1
      return `${datePart || 'Unknown date'}, ${hour12}:${minute}:00 ${suffix}`
    }

    return datePart || raw || '-'
  }

  const openEditDialog = (log: RecoveryLog) => {
    setEditing(log)
    setEditDate(extractDateValue(log))
    setEditTime(extractTimeValue(log))
  }

  const loadStatus = async () => {
    const res = await fetch('/api/recovery/status', { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    setRecoveryGuestActive(Boolean(data?.guestMode))
    setIsUnlocked(Boolean(data?.unlocked))
  }

  const loadLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '300' })
      if (search.trim()) params.set('search', search.trim())
      if (staffTypeScope) params.set('staffType', staffTypeScope)
      const res = await fetch(`/api/recovery/attendance-logs?${params.toString()}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load logs')
      setLogs(Array.isArray(data?.logs) ? data.logs : [])
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to load logs', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const loadAdminUsers = async () => {
    setLoadingAdmins(true)
    try {
      const res = await fetch('/api/recovery/admin-users', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load admin users')
      setAdminUsers(Array.isArray(data?.admins) ? data.admins : [])
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to load admin users', variant: 'destructive' })
    } finally {
      setLoadingAdmins(false)
    }
  }

  const loadScheduleIntegrity = async () => {
    setLoadingScheduleIntegrity(true)
    try {
      const res = await fetch('/api/schedules/integrity?maxRows=50', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load schedule integrity')
      setScheduleIntegrity(data as ScheduleIntegrityPayload)
    } catch (error: any) {
      toast({ title: 'Schedule integrity failed', description: error?.message || 'Failed to load schedule integrity', variant: 'destructive' })
    } finally {
      setLoadingScheduleIntegrity(false)
    }
  }

  useEffect(() => {
    loadStatus()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      setRecoveryOnly(sessionStorage.getItem('rams_recovery_only') === '1')
    } catch {
      setRecoveryOnly(false)
    }
  }, [])

  useEffect(() => {
    if (recoveryOnly && !isUnlocked) {
      setUnlockOpen(true)
    }
  }, [recoveryOnly, isUnlocked])

  useEffect(() => {
    if (!isUnlocked) return
    loadAdminUsers()
    if (signInRecoveryGateRestricted) return
    loadLogs()
    loadScheduleIntegrity()
  }, [isUnlocked, staffTypeScope, signInRecoveryGateRestricted])

  useEffect(() => {
    if (!isUnlocked) return

    // Auto-lock recovery console when navigating away from this page/category.
    return () => {
      try {
        const payload = new Blob([], { type: 'application/json' })
        const sent = typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
          ? navigator.sendBeacon('/api/recovery/lock', payload)
          : false

        if (!sent) {
          void fetch('/api/recovery/lock', {
            method: 'POST',
            keepalive: true,
          })
        }
      } catch {
        void fetch('/api/recovery/lock', {
          method: 'POST',
          keepalive: true,
        })
      }
    }
  }, [isUnlocked])

  useEffect(() => {
    if (!isUnlocked) return

    const lockNow = () => {
      try {
        const payload = new Blob([], { type: 'application/json' })
        const sent = typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
          ? navigator.sendBeacon('/api/recovery/lock', payload)
          : false

        if (!sent) {
          void fetch('/api/recovery/lock', {
            method: 'POST',
            keepalive: true,
          })
        }
      } catch {
        void fetch('/api/recovery/lock', {
          method: 'POST',
          keepalive: true,
        })
      }
    }

    // Lock immediately when user clicks a dashboard category/menu link.
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return

      const anchor = target.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) return

      const href = anchor.getAttribute('href') || ''
      if (!href.startsWith('/dashboard')) return
      if (href.startsWith('/dashboard/recovery-console')) return

      lockNow()
    }

    document.addEventListener('click', onDocumentClick, true)
    return () => document.removeEventListener('click', onDocumentClick, true)
  }, [isUnlocked])

  useEffect(() => {
    setSelectedLogIds((prev) => {
      const currentIds = new Set(logs.map((l) => l.log_id))
      const next = new Set<number>()
      prev.forEach((id) => {
        if (currentIds.has(id)) next.add(id)
      })
      return next
    })
  }, [logs])

  const filtered = useMemo(() => {
    if (!search.trim()) return logs
    const q = search.toLowerCase()
    return logs.filter((l) =>
      String(l.log_id).includes(q) ||
      String(l.employee_id).includes(q) ||
      String(l.full_name || '').toLowerCase().includes(q) ||
      String(l.department || '').toLowerCase().includes(q) ||
      String(l.rfid_code || '').toLowerCase().includes(q) ||
      String(l.attendance_status || '').toLowerCase().includes(q)
    )
  }, [logs, search])

  const doUnlock = async () => {
    try {
      const res = await fetch('/api/recovery/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ passphrase }),
      })
      const data = await res.json().catch(() => ({}))

      if (res.status === 429) {
        const sec =
          typeof (data as any)?.retryAfterSec === 'number' && Number((data as any).retryAfterSec) > 0
            ? Math.ceil(Number((data as any).retryAfterSec))
            : Number(res.headers.get('Retry-After')) || undefined
        const msg =
          (data as any)?.error ||
          (typeof sec === 'number' ? `Too many attempts. Retry in ${sec}s.` : 'Too many attempts. Please wait.')
        toast({ title: 'Temporarily locked', description: msg, variant: 'destructive' })
        return
      }

      if (!res.ok) throw new Error(data?.error || 'Unlock failed')
      setPassphrase('')
      setUnlockOpen(false)
      setIsUnlocked(true)
      toast({ title: 'Recovery console unlocked' })
    } catch (error: any) {
      toast({ title: 'Unlock failed', description: error?.message || 'Invalid passphrase', variant: 'destructive' })
    }
  }

  const doLock = async () => {
    await fetch('/api/recovery/lock', { method: 'POST', credentials: 'same-origin' })
    try {
      sessionStorage.removeItem('rams_recovery_signin_gate')
    } catch {
      /* ignore */
    }
    setIsUnlocked(false)
    setLogs([])
    setSelectedLogIds(new Set())
    setAdminUsers([])
    toast({ title: 'Recovery console locked' })
    if (recoveryGuestActive) {
      try {
        localStorage.removeItem('rams_user')
      } catch {}
      router.replace('/auth/recovery')
      return
    }
    router.push('/dashboard')
  }

  const saveEdit = async () => {
    if (!editing) return

    if (!/^\d{4}-\d{2}-\d{2}$/.test(editDate)) {
      toast({ title: 'Invalid date', description: 'Please provide a valid date.', variant: 'destructive' })
      return
    }
    if (!/^\d{2}:\d{2}$/.test(editTime)) {
      toast({ title: 'Invalid time', description: 'Please provide a valid time.', variant: 'destructive' })
      return
    }

    try {
      const res = await fetch('/api/recovery/attendance-logs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          log_id: editing.log_id,
          attendance_status: editing.attendance_status,
          notes: editing.notes,
          date: editDate,
          time: editTime,
          log_type: editing.log_type,
          is_late: editing.is_late,
          is_early_out: editing.is_early_out,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to update log')
      setEditing(null)
      setEditDate('')
      setEditTime('')
      toast({ title: 'Attendance log updated' })
      loadLogs()
    } catch (error: any) {
      toast({ title: 'Update failed', description: error?.message || 'Failed to update log', variant: 'destructive' })
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch('/api/recovery/attendance-logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log_id: deleteTarget.log_id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to delete log')
      setDeleteTarget(null)
      toast({ title: 'Attendance log deleted' })
      loadLogs()
    } catch (error: any) {
      toast({ title: 'Delete failed', description: error?.message || 'Failed to delete log', variant: 'destructive' })
    }
  }

  const visibleSelectedCount = filtered.filter((l) => selectedLogIds.has(l.log_id)).length
  const allVisibleSelected = filtered.length > 0 && visibleSelectedCount === filtered.length

  const toggleSelectAllVisible = (checked: boolean | 'indeterminate') => {
    const shouldSelect = checked === true
    setSelectedLogIds((prev) => {
      const next = new Set(prev)
      if (shouldSelect) {
        filtered.forEach((log) => next.add(log.log_id))
      } else {
        filtered.forEach((log) => next.delete(log.log_id))
      }
      return next
    })
  }

  const toggleSelectOne = (logId: number, checked: boolean | 'indeterminate') => {
    setSelectedLogIds((prev) => {
      const next = new Set(prev)
      if (checked === true) next.add(logId)
      else next.delete(logId)
      return next
    })
  }

  const confirmBulkDelete = async () => {
    const ids = Array.from(selectedLogIds)
    if (ids.length === 0) return

    setIsBulkDeleting(true)
    let successCount = 0
    try {
      for (const id of ids) {
        const res = await fetch('/api/recovery/attendance-logs', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ log_id: id }),
        })
        if (res.ok) successCount += 1
      }

      setBulkDeleteOpen(false)
      setSelectedLogIds(new Set())
      await loadLogs()

      if (successCount === ids.length) {
        toast({ title: `Deleted ${successCount} attendance logs` })
      } else {
        toast({
          title: 'Partial delete completed',
          description: `${successCount} of ${ids.length} logs were deleted`,
          variant: 'destructive',
        })
      }
    } catch (error: any) {
      toast({ title: 'Bulk delete failed', description: error?.message || 'Failed to delete selected logs', variant: 'destructive' })
    } finally {
      setIsBulkDeleting(false)
    }
  }

  const openResetPasswordDialog = (admin: RecoveryAdminUser) => {
    setResetTarget(admin)
    setNewAdminPassword(generateSecurePassword())
  }

  const openEditEmailDialog = (admin: RecoveryAdminUser) => {
    setEmailTarget(admin)
    setNewAdminEmail(String(admin.email || ''))
  }

  const saveAdminEmail = async () => {
    if (!emailTarget) return
    const trimmed = newAdminEmail.trim().toLowerCase()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!emailRegex.test(trimmed)) {
      toast({ title: 'Invalid email', description: 'Please provide a valid email address.', variant: 'destructive' })
      return
    }

    setIsSavingAdminEmail(true)
    try {
      const res = await fetch('/api/recovery/admin-users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_id: emailTarget.id, email: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to update admin email')

      toast({ title: 'Admin email updated', description: `${emailTarget.full_name}'s email was updated to ${trimmed}.` })
      setEmailTarget(null)
      setNewAdminEmail('')
      loadAdminUsers()
    } catch (error: any) {
      toast({ title: 'Email update failed', description: error?.message || 'Failed to update admin email', variant: 'destructive' })
    } finally {
      setIsSavingAdminEmail(false)
    }
  }

  const resetAdminPassword = async () => {
    if (!resetTarget) return
    const trimmed = newAdminPassword.trim()
    if (trimmed.length < 8) {
      toast({ title: 'Invalid password', description: 'Password must be at least 8 characters.', variant: 'destructive' })
      return
    }

    setIsResettingPassword(true)
    try {
      const res = await fetch('/api/recovery/admin-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_id: resetTarget.id, new_password: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to reset password')

      toast({ title: 'Password updated', description: `${resetTarget.full_name}'s password was securely re-hashed and updated.` })
      setResetTarget(null)
      setNewAdminPassword('')
      loadAdminUsers()
    } catch (error: any) {
      toast({ title: 'Password reset failed', description: error?.message || 'Failed to reset admin password', variant: 'destructive' })
    } finally {
      setIsResettingPassword(false)
    }
  }

  const handleRepairScheduleTimes = async () => {
    try {
      setRepairScheduleInProgress(true)
      setRepairScheduleSummary(null)

      const scopedEmployeeId = Number(repairEmployeeId)
      const payload: any = { limit: 5000, staffTypeFilter: staffTypeScope, aggressive: repairAggressiveMode }
      if (/^\d{4}-\d{2}-\d{2}$/.test(repairStartDate)) payload.startDate = repairStartDate
      if (/^\d{4}-\d{2}-\d{2}$/.test(repairEndDate)) payload.endDate = repairEndDate
      if (Number.isFinite(scopedEmployeeId) && scopedEmployeeId > 0) payload.employeeId = scopedEmployeeId

      const res = await fetch('/api/attendance/repair-schedule-times', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) throw new Error(data?.error || 'Failed to repair schedule times')

      setRepairScheduleSummary(data)
      toast({
        title: 'Schedule-time repair complete',
        description: `Scanned ${Number(data?.scanned || 0)} logs; repaired ${Number(data?.repaired || 0)} entries.`,
      })

      await loadLogs()
    } catch (error: any) {
      toast({
        title: 'Schedule-time repair failed',
        description: error?.message || 'Unable to repair schedule times right now.',
        variant: 'destructive',
      })
    } finally {
      setRepairScheduleInProgress(false)
    }
  }

  const handlePreviewRepairScheduleTimes = async () => {
    try {
      setRepairSchedulePreviewInProgress(true)
      setRepairScheduleSummary(null)

      const scopedEmployeeId = Number(repairEmployeeId)
      const payload: any = { limit: 5000, previewLimit: 80, staffTypeFilter: staffTypeScope, aggressive: repairAggressiveMode, dryRun: true }
      if (/^\d{4}-\d{2}-\d{2}$/.test(repairStartDate)) payload.startDate = repairStartDate
      if (/^\d{4}-\d{2}-\d{2}$/.test(repairEndDate)) payload.endDate = repairEndDate
      if (Number.isFinite(scopedEmployeeId) && scopedEmployeeId > 0) payload.employeeId = scopedEmployeeId

      const res = await fetch('/api/attendance/repair-schedule-times', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) throw new Error(data?.error || 'Failed to preview schedule-time repair')

      setRepairScheduleSummary(data)
      toast({
        title: 'Repair preview ready',
        description: `Scanned ${Number(data?.scanned || 0)} logs; would repair ${Number(data?.wouldRepair || 0)} entries.`,
      })
    } catch (error: any) {
      toast({
        title: 'Repair preview failed',
        description: error?.message || 'Unable to preview schedule-time repair right now.',
        variant: 'destructive',
      })
    } finally {
      setRepairSchedulePreviewInProgress(false)
    }
  }

  const handleApplyPreviewScopeNow = async () => {
    await handleRepairScheduleTimes()
  }

  return (
    <div className="container mx-auto px-6 py-6 space-y-6">
      <Card className="border-amber-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            Recovery Console
          </CardTitle>
          <CardDescription>
            Emergency-only tools for attendance log repair. Every action is audited. Historical records remain explicit and are not auto-overwritten by this tool.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Badge variant={isUnlocked ? 'default' : 'secondary'}>{isUnlocked ? 'Unlocked' : 'Locked'}</Badge>
          {!isUnlocked ? (
            <Button onClick={() => setUnlockOpen(true)}>
              <Lock className="h-4 w-4 mr-2" />
              Unlock Recovery Console
            </Button>
          ) : (
            <Button variant="outline" onClick={doLock}>Lock Console</Button>
          )}
        </CardContent>
      </Card>

      {isUnlocked && !signInRecoveryGateRestricted && (
        <Card>
          <CardHeader>
            <CardTitle>Verification Recovery Operations</CardTitle>
            <CardDescription>
              Manual maintenance tools moved from Verification: schedule-time repair.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {repairScheduleSummary && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-4">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                  {repairScheduleSummary?.dryRun ? 'Repair Schedule Times Preview' : 'Repair Schedule Times Summary'}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  {repairScheduleSummary?.dryRun
                    ? `Scanned ${Number(repairScheduleSummary?.scanned || 0)} logs; would repair ${Number(repairScheduleSummary?.wouldRepair || 0)} attendance entries.`
                    : `Scanned ${Number(repairScheduleSummary?.scanned || 0)} logs; repaired ${Number(repairScheduleSummary?.repaired || 0)} attendance entries.`}
                </p>
                {repairScheduleSummary?.dryRun && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      className="h-8"
                      onClick={handleApplyPreviewScopeNow}
                      disabled={repairScheduleInProgress || repairSchedulePreviewInProgress || Number(repairScheduleSummary?.wouldRepair || 0) === 0}
                    >
                      {repairScheduleInProgress ? 'Applying...' : 'Apply This Preview Scope Now'}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {repairScheduleInProgress && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-4">
                <div className="flex items-center gap-2 text-amber-900 dark:text-amber-100 text-sm font-semibold">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Repairing attendance log times based on linked schedule windows...
                </div>
              </div>
            )}

            {repairSchedulePreviewInProgress && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-4">
                <div className="flex items-center gap-2 text-amber-900 dark:text-amber-100 text-sm font-semibold">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Previewing schedule-time repairs (no changes will be saved)...
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleRepairScheduleTimes}
                disabled={repairScheduleInProgress || repairSchedulePreviewInProgress}
              >
                {repairScheduleInProgress ? 'Repairing...' : 'Repair Schedule Times'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handlePreviewRepairScheduleTimes}
                disabled={repairScheduleInProgress || repairSchedulePreviewInProgress}
              >
                {repairSchedulePreviewInProgress ? 'Previewing...' : 'Preview Repair'}
              </Button>
            </div>

            <div className="rounded-lg border border-amber-200/70 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 p-3">
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">Repair Scope (Optional)</p>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-4 gap-2">
                <Input
                  type="date"
                  value={repairStartDate}
                  onChange={(e) => setRepairStartDate(e.target.value)}
                  className="h-10"
                  disabled={repairScheduleInProgress}
                />
                <Input
                  type="date"
                  value={repairEndDate}
                  onChange={(e) => setRepairEndDate(e.target.value)}
                  className="h-10"
                  disabled={repairScheduleInProgress}
                />
                <Input
                  type="number"
                  min={1}
                  placeholder="Employee ID"
                  value={repairEmployeeId}
                  onChange={(e) => setRepairEmployeeId(e.target.value)}
                  className="h-10"
                  disabled={repairScheduleInProgress}
                />
                <div className="flex items-center gap-2 rounded border border-amber-200/70 dark:border-amber-800 px-3 h-10">
                  <Checkbox
                    id="repair-aggressive"
                    checked={repairAggressiveMode}
                    onCheckedChange={(checked) => setRepairAggressiveMode(Boolean(checked))}
                    disabled={repairScheduleInProgress}
                  />
                  <Label htmlFor="repair-aggressive" className="text-xs">Aggressive repair mode</Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isUnlocked && !signInRecoveryGateRestricted && (
        <OperationsScenarioHealthCard staffTypeFilter={staffTypeScope} />
      )}

      {isUnlocked && !signInRecoveryGateRestricted && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              Schedule Integrity
            </CardTitle>
            <CardDescription>
              Verifies class and exam schedule ownership/substitute consistency for assigned employees.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant={scheduleIntegrity?.summary?.total_issues ? 'destructive' : 'default'}>
                  {scheduleIntegrity?.summary?.total_issues ?? 0} issue(s)
                </Badge>
                <span className="text-sm text-muted-foreground">Term: {scheduleIntegrity?.summary?.term || 'all'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={loadScheduleIntegrity} disabled={loadingScheduleIntegrity}>
                  <RefreshCw className={loadingScheduleIntegrity ? 'h-4 w-4 mr-1 animate-spin' : 'h-4 w-4 mr-1'} />
                  Refresh
                </Button>
                <Button size="sm" onClick={() => setIntegrityDialogOpen(true)} disabled={!scheduleIntegrity}>
                  View Details
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 border rounded-lg"><div className="text-xs text-muted-foreground">Orphan Teaching Owners</div><div className="text-xl font-semibold">{scheduleIntegrity?.summary?.orphan_teaching_owner_count ?? 0}</div></div>
              <div className="p-3 border rounded-lg"><div className="text-xs text-muted-foreground">Orphan Exam Owners</div><div className="text-xl font-semibold">{scheduleIntegrity?.summary?.orphan_exam_owner_count ?? 0}</div></div>
              <div className="p-3 border rounded-lg"><div className="text-xs text-muted-foreground">Non-Teaching Class Owners</div><div className="text-xl font-semibold">{scheduleIntegrity?.summary?.non_teaching_teaching_owner_count ?? 0}</div></div>
              <div className="p-3 border rounded-lg"><div className="text-xs text-muted-foreground">Non-Teaching Exam Owners</div><div className="text-xl font-semibold">{scheduleIntegrity?.summary?.non_teaching_exam_owner_count ?? 0}</div></div>
              <div className="p-3 border rounded-lg"><div className="text-xs text-muted-foreground">Invalid Class Substitutes</div><div className="text-xl font-semibold">{scheduleIntegrity?.summary?.invalid_teaching_substitute_count ?? 0}</div></div>
              <div className="p-3 border rounded-lg"><div className="text-xs text-muted-foreground">Invalid Exam Substitutes</div><div className="text-xl font-semibold">{scheduleIntegrity?.summary?.invalid_exam_substitute_count ?? 0}</div></div>
              <div className="p-3 border rounded-lg"><div className="text-xs text-muted-foreground">Self Class Substitutes</div><div className="text-xl font-semibold">{scheduleIntegrity?.summary?.self_teaching_substitute_count ?? 0}</div></div>
              <div className="p-3 border rounded-lg"><div className="text-xs text-muted-foreground">Self Exam Substitutes</div><div className="text-xl font-semibold">{scheduleIntegrity?.summary?.self_exam_substitute_count ?? 0}</div></div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Database Table Connectivity Test */}
      {isUnlocked && !signInRecoveryGateRestricted && (
        <DbTableTestCard />
      )}

      {isUnlocked && !signInRecoveryGateRestricted && (
        <Card>
          <CardHeader>
            <CardTitle>Attendance Logs</CardTitle>
            <CardDescription>Edit or delete attendance logs for emergency recovery.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative max-w-lg flex-1 min-w-[280px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search logs..." className="pl-10" />
              </div>
              <Button
                variant="outline"
                className="text-red-600 border-red-300 hover:text-red-700"
                disabled={selectedLogIds.size === 0 || loading}
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected ({selectedLogIds.size})
              </Button>
            </div>

            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-neutral-800">
                  <tr>
                    <th className="text-left p-2 w-10">
                      <Checkbox
                        checked={allVisibleSelected ? true : visibleSelectedCount > 0 ? 'indeterminate' : false}
                        onCheckedChange={toggleSelectAllVisible}
                        aria-label="Select all visible logs"
                      />
                    </th>
                    <th className="text-left p-2">Log ID</th>
                    <th className="text-left p-2">Employee</th>
                    <th className="text-left p-2">Date/Time</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td className="p-4" colSpan={7}>Loading...</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td className="p-4" colSpan={7}>No logs found.</td></tr>
                  ) : (
                    filtered.map((log) => (
                      <tr key={log.log_id} className="border-t">
                        <td className="p-2">
                          <Checkbox
                            checked={selectedLogIds.has(log.log_id)}
                            onCheckedChange={(checked) => toggleSelectOne(log.log_id, checked)}
                            aria-label={`Select log ${log.log_id}`}
                          />
                        </td>
                        <td className="p-2">{log.log_id}</td>
                        <td className="p-2">{log.full_name || `#${log.employee_id}`}</td>
                        <td className="p-2 whitespace-nowrap">{formatLogDateTimeDisplay(log)}</td>
                        <td className="p-2">{log.log_type}</td>
                        <td className="p-2">{log.attendance_status}</td>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => setEditing(log)}>
                              <Edit className="h-3 w-3 mr-1" />Edit
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600" onClick={() => setDeleteTarget(log)}>
                              <Trash2 className="h-3 w-3 mr-1" />Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Development Team</CardTitle>
          <CardDescription>Core developers and contributors of the RAMS platform.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {teamMembers.map((member, idx) => (
              <div key={idx} className="flex flex-col items-center text-center">
                {member.photo ? (
                  <div className="w-20 h-20 rounded-full overflow-hidden mb-3 shadow-lg ring-2 ring-white/30">
                    <Image src={member.photo} alt={member.name} width={80} height={80} className="object-cover w-full h-full" />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg mb-3 shadow-lg">
                    {member.initials}
                  </div>
                )}
                <p className="text-sm font-semibold text-foreground">{member.name}</p>
                <p className="text-xs text-muted-foreground">{member.role}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {isUnlocked && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-amber-600" />
              Admin Password Recovery
            </CardTitle>
            <CardDescription>
              Reset admin passwords securely. Raw password is sent only for server-side hashing and is never stored as plain text.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">Use this only for emergency account recovery.</p>
              <Button variant="outline" size="sm" onClick={loadAdminUsers} disabled={loadingAdmins}>
                <RefreshCw className={loadingAdmins ? 'h-4 w-4 mr-1 animate-spin' : 'h-4 w-4 mr-1'} />
                Refresh
              </Button>
            </div>
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-neutral-800">
                  <tr>
                    <th className="text-left p-2">Admin</th>
                    <th className="text-left p-2">Email</th>
                    <th className="text-left p-2">Role</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingAdmins ? (
                    <tr><td className="p-4" colSpan={5}>Loading admin users...</td></tr>
                  ) : adminUsers.length === 0 ? (
                    <tr><td className="p-4" colSpan={5}>No admin users found.</td></tr>
                  ) : (
                    adminUsers.map((admin) => (
                      <tr key={admin.id} className="border-t">
                        <td className="p-2 font-medium">{admin.full_name}</td>
                        <td className="p-2">{admin.email}</td>
                        <td className="p-2">{admin.role || '-'}</td>
                        <td className="p-2">
                          <Badge variant={admin.is_active ? 'default' : 'secondary'}>{admin.is_active ? 'Active' : 'Inactive'}</Badge>
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => openEditEmailDialog(admin)}>
                              <Edit className="h-3 w-3 mr-1" />Edit Email
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openResetPasswordDialog(admin)}>
                              <KeyRound className="h-3 w-3 mr-1" />Reset Password
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={unlockOpen} onOpenChange={setUnlockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlock Recovery Console</DialogTitle>
            <DialogDescription>Enter recovery passphrase to continue.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Passphrase</Label>
            <Input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder="Recovery passphrase" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockOpen(false)}>Cancel</Button>
            <Button onClick={doUnlock}>Unlock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(emailTarget)} onOpenChange={(o) => !o && setEmailTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Admin Email</DialogTitle>
            <DialogDescription>
              Add or update the email address for {emailTarget?.full_name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Email Address</Label>
            <Input
              type="email"
              value={newAdminEmail}
              onChange={(e) => setNewAdminEmail(e.target.value)}
              placeholder="name@domain.com"
            />
            <p className="text-xs text-muted-foreground">
              This email is used for login and admin notification routing.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailTarget(null)} disabled={isSavingAdminEmail}>Cancel</Button>
            <Button onClick={saveAdminEmail} disabled={isSavingAdminEmail}>
              {isSavingAdminEmail ? 'Saving...' : 'Save Email'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(o) => {
        if (!o) {
          setEditing(null)
          setEditDate('')
          setEditTime('')
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Attendance Log</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Time</Label>
                  <Input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Attendance Status</Label>
                <Input value={editing.attendance_status} onChange={(e) => setEditing({ ...editing, attendance_status: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setEditing(null)
              setEditDate('')
              setEditTime('')
            }}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Attendance Log</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete log #{deleteTarget?.log_id}. This action is audited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Attendance Logs</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedLogIds.size} selected attendance logs. Every deletion is audited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-red-600 hover:bg-red-700" disabled={isBulkDeleting}>
              {isBulkDeleting ? 'Deleting...' : 'Delete Selected'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(resetTarget)} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Admin Password</DialogTitle>
            <DialogDescription>
              Set a new password for {resetTarget?.full_name}. The server hashes this password with bcrypt before database storage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>New Password</Label>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={newAdminPassword}
                onChange={(e) => setNewAdminPassword(e.target.value)}
                placeholder="Enter secure password"
              />
              <Button type="button" variant="outline" onClick={() => setNewAdminPassword(generateSecurePassword())}>
                Generate
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Tip: Use at least 12 characters with letters, numbers, and symbols.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)} disabled={isResettingPassword}>Cancel</Button>
            <Button onClick={resetAdminPassword} disabled={isResettingPassword}>
              {isResettingPassword ? 'Updating...' : 'Reset Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={integrityDialogOpen} onOpenChange={setIntegrityDialogOpen}>
        <DialogContent className="max-w-[95vw] md:max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Schedule Integrity Details</DialogTitle>
            <DialogDescription>
              Detailed rows flagged by the schedule integrity audit endpoint.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[65vh] pr-4">
            <div className="space-y-4">
              {Object.entries(scheduleIntegrity?.details || {}).map(([key, rows]) => (
                <Card key={key}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm capitalize">{key.replace(/_/g, ' ')}</CardTitle>
                    <CardDescription>{Array.isArray(rows) ? rows.length : 0} row(s)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!Array.isArray(rows) || rows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No flagged rows.</p>
                    ) : (
                      <pre className="text-xs overflow-x-auto bg-muted p-3 rounded-md">{JSON.stringify(rows, null, 2)}</pre>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

    </div>
  )
}
