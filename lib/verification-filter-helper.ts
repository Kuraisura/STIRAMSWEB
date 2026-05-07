import { formatInTimeZone } from 'date-fns-tz'
import { getManilaToday } from '@/lib/timezone-utils'

export type VerificationDateRange = 'all' | 'today' | 'last_7_days' | 'this_month' | 'custom'
export type VerificationWorkflowCategory = 'all' | 'needs_action' | 'done'
export type VerificationSort = 'requested_desc' | 'requested_asc'

type VerificationEmployee = {
  full_name?: string | null
  department?: string | null
  staff_type?: string | null
}

export type VerificationRequestLike = {
  request_id?: number
  status?: string | null
  request_type?: string | null
  reason?: string | null
  requested_at?: string | null
  created_at?: string | null
  requested_time?: string | null
  employees?: VerificationEmployee | null
}

export type VerificationFilterOptions = {
  searchTerm: string
  selectedStatus: string
  selectedType: string
  selectedDepartment: string
  selectedDateRange: VerificationDateRange
  customStartDate: string
  customEndDate: string
  workflowCategory: VerificationWorkflowCategory
  selectedSort: VerificationSort
  staffTypeFilter?: 'Teaching' | 'Non-Teaching' | null
}

function normalizeStatus(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase()
}

function normalizeType(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase()
}

function getComparableDateOnly(value: string | null | undefined): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  try {
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) return null
    return formatInTimeZone(parsed, 'Asia/Manila', 'yyyy-MM-dd')
  } catch {
    return null
  }
}

function getTimestampForSort(item: VerificationRequestLike): number {
  const source = item.requested_at || item.created_at || item.requested_time || ''
  const ts = new Date(source).getTime()
  return Number.isFinite(ts) ? ts : 0
}

export function filterVerificationRequests(
  requests: VerificationRequestLike[],
  options: VerificationFilterOptions
): VerificationRequestLike[] {
  const {
    searchTerm,
    selectedStatus,
    selectedType,
    selectedDepartment,
    selectedDateRange,
    customStartDate,
    customEndDate,
    workflowCategory,
    selectedSort,
    staffTypeFilter = null,
  } = options

  const search = String(searchTerm || '').trim().toLowerCase()
  const todayStr = getManilaToday()
  const todayObj = new Date(`${todayStr}T00:00:00+08:00`)
  const sevenDaysStart = new Date(todayObj)
  sevenDaysStart.setDate(sevenDaysStart.getDate() - 6)
  const monthStart = new Date(todayObj.getFullYear(), todayObj.getMonth(), 1)

  const filtered = (Array.isArray(requests) ? requests : []).filter((request) => {
    const status = normalizeStatus(request.status)
    const reqType = normalizeType(request.request_type)
    const department = String(request.employees?.department || '')
    const fullName = String(request.employees?.full_name || '')
    const reason = String(request.reason || '')
    const staffType = String(request.employees?.staff_type || '').trim()

    if (staffTypeFilter && staffType !== staffTypeFilter) return false

    if (search) {
      const inSearch =
        fullName.toLowerCase().includes(search) ||
        department.toLowerCase().includes(search) ||
        reason.toLowerCase().includes(search)
      if (!inSearch) return false
    }

    if (selectedStatus !== 'All Statuses' && status !== normalizeStatus(selectedStatus)) {
      return false
    }

    if (workflowCategory === 'needs_action' && status !== 'pending') return false
    if (workflowCategory === 'done' && status !== 'approved' && status !== 'rejected') return false

    if (selectedType !== 'All Types' && reqType !== normalizeType(selectedType)) {
      return false
    }

    if (selectedDepartment !== 'All Departments' && department !== selectedDepartment) {
      return false
    }

    if (selectedDateRange !== 'all') {
      const dateSource = request.requested_at || request.created_at || request.requested_time || null
      const requestDateStr = getComparableDateOnly(dateSource)
      if (!requestDateStr) return false
      const requestDateObj = new Date(`${requestDateStr}T00:00:00+08:00`)

      if (selectedDateRange === 'today' && requestDateStr !== todayStr) return false
      if (selectedDateRange === 'last_7_days' && (requestDateObj < sevenDaysStart || requestDateObj > todayObj)) return false
      if (selectedDateRange === 'this_month' && (requestDateObj < monthStart || requestDateObj > todayObj)) return false
      if (selectedDateRange === 'custom') {
        const hasStart = Boolean(customStartDate)
        const hasEnd = Boolean(customEndDate)
        if (hasStart && requestDateStr < customStartDate) return false
        if (hasEnd && requestDateStr > customEndDate) return false
      }
    }

    return true
  })

  filtered.sort((a, b) => {
    const aTs = getTimestampForSort(a)
    const bTs = getTimestampForSort(b)
    return selectedSort === 'requested_desc' ? bTs - aTs : aTs - bTs
  })

  return filtered
}
