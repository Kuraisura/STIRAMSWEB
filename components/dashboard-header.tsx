/**
 * ⚠️ DESIGN LOCKED - DO NOT MODIFY ⚠️
 * 
 * This file is LOCKED and part of the FINAL design.
 * Backend developers should NOT modify this file.
 * This design has been finalized and approved.
 * 
 * Modifying this file will affect the dashboard header design.
 * All design changes must be approved by the design team.
 * 
 * For backend work, use: app/api/ and lib/ folders only.
 * 
 * Lock Status: ACTIVE
 * Lock Date: 2024
 */
"use client"

import { useState, useEffect, useRef } from "react"
import ReactDOM from "react-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Search, Bell, RefreshCw, Trash2 } from "lucide-react"
import { ModeToggle } from "@/components/mode-toggle"
import { useRouter } from "next/navigation"
import { useLanguage } from "@/lib/language-context"
import { toast } from "@/hooks/use-toast"
import { getStaffTypeFilter } from "@/lib/offline-dashboard-client"

interface NotificationItem {
  notification_id: number
  recipient_type?: string
  recipient_id?: number | null
  title: string
  message?: string
  is_read?: boolean
  read_at?: string | null
  created_at: string
}

interface NotificationDetailPayload {
  success: boolean
  notification?: {
    notification_id: number
    title?: string | null
    message?: string | null
    created_at?: string | null
  }
  employee?: {
    employee_id: number
    school_id?: string | null
    full_name?: string | null
    department?: string | null
    staff_type?: string | null
    schedule_time_in?: string | null
    schedule_time_out?: string | null
  } | null
  event_log?: {
    log_type?: string | null
    log_time?: string | null
    attendance_status?: string | null
    is_late?: boolean | null
    is_early_out?: boolean | null
  } | null
  daily_summary?: {
    date?: string | null
    time_in?: string | null
    time_out?: string | null
    status?: string | null
    is_late?: boolean
    is_early_out?: boolean
    schedule_time_in?: string | null
    schedule_time_out?: string | null
    schedule_source?: string | null
    absent_source?: string | null
    absent_reason?: string | null
    reason_source?: string | null
    reason_detail?: string | null
  } | null
  schedules?: Array<{
    source: string
    day_of_week: number
    time_start?: string | null
    time_end?: string | null
  }>
}

interface User {
  email: string
  name: string
  role: string
}

interface DashboardHeaderProps {
  user: User
  sidebarOpen?: boolean
  setSidebarOpen?: (open: boolean) => void
}

export function DashboardHeader({ user, sidebarOpen, setSidebarOpen }: DashboardHeaderProps) {
  const { t } = useLanguage()
  const [currentDateTime, setCurrentDateTime] = useState(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [isNotifOpen, setIsNotifOpen] = useState(false)
  const [notifMounted, setNotifMounted] = useState(false)
  const [notifPanelStyle, setNotifPanelStyle] = useState<{ top: number; left?: number; right?: number; maxHeight: number }>({ top: 64, right: 16, maxHeight: 640 })
  const [showAll, setShowAll] = useState(false)
  const [allNotifications, setAllNotifications] = useState<NotificationItem[]>([])
  const [isAllLoading, setIsAllLoading] = useState(false)
  const [totalNotificationCount, setTotalNotificationCount] = useState(0)
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null)
  const [notificationDetail, setNotificationDetail] = useState<NotificationDetailPayload | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false)
  const [isDeletingAllNotifications, setIsDeletingAllNotifications] = useState(false)
  const lastNotificationIdRef = useRef<number | null>(null)
  const notifEventSourceRef = useRef<EventSource | null>(null)
  const notifButtonRef = useRef<HTMLButtonElement | null>(null)

  const formatDateTimeShort = (value?: string | null) => {
    if (!value) return 'N/A'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Manila',
    })
  }

  const formatTimeOnly = (value?: string | null) => {
    if (!value) return 'N/A'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      const timeMatch = String(value).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
      if (!timeMatch) return value
      const hourRaw = Number(timeMatch[1])
      const minute = timeMatch[2]
      if (!Number.isFinite(hourRaw)) return value
      const suffix = hourRaw >= 12 ? 'PM' : 'AM'
      const hour12 = ((hourRaw + 11) % 12) + 1
      return `${hour12}:${minute} ${suffix}`
    }
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Manila',
    })
  }

  const formatReasonSource = (value?: string | null) => {
    const raw = String(value || '').trim()
    if (!raw) return 'N/A'
    return raw
      .split('_')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const openNotificationDetails = async (notification: NotificationItem) => {
    setSelectedNotification(notification)
    setIsDetailOpen(true)
    setIsDetailLoading(true)
    setNotificationDetail(null)

    try {
      const res = await fetch(`/api/notifications/detail?notificationId=${notification.notification_id}`, {
        cache: 'no-store',
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data?.error || `Failed to load details (${res.status})`)
      }

      setNotificationDetail(data as NotificationDetailPayload)

      if (!notification.is_read) {
        try {
          await fetch('/api/notifications', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [notification.notification_id] }),
          })
          await loadNotificationCount()
          setNotifications((prev) => prev.map((n) => (
            n.notification_id === notification.notification_id
              ? { ...n, is_read: true, read_at: new Date().toISOString() }
              : n
          )))
        } catch {
          // Best effort only.
        }
      }
    } catch (err: any) {
      toast({
        title: 'Unable to load notification details',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsDetailLoading(false)
    }
  }

  // Get current admin ID helper
  const getCurrentAdminId = (): number | null => {
    try {
      const storedUser = localStorage.getItem("rams_user")
      if (storedUser) {
        const userData = JSON.parse(storedUser)
        const rawId = userData?.id ?? userData?.user_id ?? userData?.admin_id ?? null
        const parsed = rawId !== null && rawId !== undefined ? Number(rawId) : NaN
        return Number.isFinite(parsed) ? parsed : null
      }
    } catch {}
    return null
  }

  const handleDeleteAllNotifications = async () => {
    try {
      setIsDeletingAllNotifications(true)
      const currentAdminId = getCurrentAdminId()
      if (currentAdminId === null) {
        toast({ title: "Delete failed", description: "Unable to resolve current admin account.", variant: "destructive" })
        return
      }

      const res = await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete_all_for_admin: true, admin_id: currentAdminId, include_broadcast: false })
      })

      const result = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: "Delete failed", description: result?.error || "Failed to delete notifications.", variant: "destructive" })
        return
      }

      setAllNotifications([])
      setNotifications([])
      setTotalNotificationCount(0)
      await loadNotificationCount()
      toast({ title: "Notifications cleared", description: `Deleted ${Number(result?.deleted || 0)} notifications.` })
    } catch (error) {
      console.error('[Delete All] Error:', error)
      toast({ title: "Delete failed", description: "An unexpected error occurred while deleting notifications.", variant: "destructive" })
    } finally {
      setIsDeletingAllNotifications(false)
      setConfirmDeleteAllOpen(false)
    }
  }

  const isForCurrentAdmin = (notif: NotificationItem, currentAdminId: number | null) => {
    if (notif.recipient_type !== 'admin') return false
    if (currentAdminId === null) return true
    const notifRecipientId = notif.recipient_id === null || notif.recipient_id === undefined
      ? null
      : Number(notif.recipient_id)
    return notifRecipientId === currentAdminId || notifRecipientId === null
  }

  const buildNotificationUrl = (status: 'all' | 'unread') => {
    const currentAdminId = getCurrentAdminId()
    const params = new URLSearchParams({ status, recipient_type: 'admin' })
    const staffTypeFilter = getStaffTypeFilter(user?.email, user?.role)
    if (currentAdminId !== null) {
      params.set('recipient_id', String(currentAdminId))
    }
    if (staffTypeFilter) {
      params.set('staffTypeFilter', staffTypeFilter)
    }
    return `/api/notifications?${params.toString()}`
  }

  // Load total notification count
  const loadNotificationCount = async () => {
    try {
      const currentAdminId = getCurrentAdminId()
      const res = await fetch(buildNotificationUrl('unread'), { cache: 'no-store' })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        console.warn('[Dashboard Header] unread notifications API failed:', res.status, errBody)
        setTotalNotificationCount(0)
        return
      }
      const body = await res.json().catch(() => ({ items: [] }))
      const items = Array.isArray(body?.items) ? body.items : []
      const count = items.filter((notif: NotificationItem) => isForCurrentAdmin(notif, currentAdminId)).length
      setTotalNotificationCount(count)
      console.log(`[Dashboard Header] Total unread notifications: ${count}`)
    } catch (err) {
      console.error('[Dashboard Header] Error loading notification count:', err)
    }
  }

  // Unified load function
  const loadNotifications = async (limit: number) => {
    try {
      const currentAdminId = getCurrentAdminId()
      console.log('[Dashboard Header] Loading notifications for admin ID:', currentAdminId)

      let data: NotificationItem[] = []

      const res = await fetch(buildNotificationUrl('all'), { cache: 'no-store' })
      if (res.ok) {
        const body = await res.json().catch(() => ({ items: [] }))
        data = Array.isArray(body?.items) ? body.items : []
      } else {
        const errBody = await res.json().catch(() => ({}))
        console.warn('[Dashboard Header] notifications API failed:', res.status, errBody)
      }
      
      console.log(`[Dashboard Header] Loaded ${data?.length || 0} notifications`)
      
      // Additional client-side filter as backup (should already be filtered by DB query)
      if (data && data.length > 0) {
        data = data.filter((notif: NotificationItem) => isForCurrentAdmin(notif, currentAdminId))
      }
      
      const result = (data || []).slice(0, limit)
      console.log(`[Dashboard Header] Returning ${result.length} notifications after filtering`)
      
      // Also load the total count
      await loadNotificationCount()
      
      return result
    } catch (err) {
      console.error('[Dashboard Header] Error loading notifications:', err)
      return []
    }
  }

  // Request browser notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log('[Dashboard Header] Notification permission:', permission)
      })
    }
  }, [])

  // Play notification sound
  const playNotificationSound = () => {
    try {
      // Create a pleasant notification sound using Web Audio API
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      
      // Set frequency for a pleasant notification tone (800Hz)
      oscillator.frequency.value = 800
      oscillator.type = 'sine'
      
      // Set volume envelope (quick fade in/out)
      gainNode.gain.setValueAtTime(0, audioContext.currentTime)
      gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.01)
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.15)
      
      // Play two short beeps
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.15)
      
      // Second beep after a short delay
      setTimeout(() => {
        const oscillator2 = audioContext.createOscillator()
        const gainNode2 = audioContext.createGain()
        oscillator2.connect(gainNode2)
        gainNode2.connect(audioContext.destination)
        oscillator2.frequency.value = 800
        oscillator2.type = 'sine'
        gainNode2.gain.setValueAtTime(0, audioContext.currentTime)
        gainNode2.gain.linearRampToValueAtTime(0.45, audioContext.currentTime + 0.01)
        gainNode2.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.1)
        oscillator2.start(audioContext.currentTime)
        oscillator2.stop(audioContext.currentTime + 0.1)
      }, 100)
    } catch (err) {
      console.warn('[Dashboard Header] Failed to play notification sound:', err)
    }
  }

  const applyNotificationData = (data: NotificationItem[]) => {
    const latestNotificationId = data && data.length > 0 ? data[0].notification_id || 0 : null

    // Set initial reference without alerting so first render is silent.
    if (lastNotificationIdRef.current === null && latestNotificationId !== null) {
      lastNotificationIdRef.current = latestNotificationId
    }

    // Alert when a newer notification arrives after initial sync.
    if (
      lastNotificationIdRef.current !== null &&
      latestNotificationId !== null &&
      latestNotificationId > lastNotificationIdRef.current
    ) {
      playNotificationSound()
    }

    if (latestNotificationId !== null) {
      lastNotificationIdRef.current = latestNotificationId
    }

    setNotifications(data || [])
  }

  const refreshTopNotifications = async () => {
    const data = await loadNotifications(5)
    applyNotificationData(data || [])
  }

  // Load notifications with polling only (offline PostgreSQL mode)
  useEffect(() => {
    let cancelled = false
    
    // Initial load
    const load = async () => {
      console.log('[Dashboard Header] Loading initial notifications...')
      const data = await loadNotifications(5)
      console.log('[Dashboard Header] Initial notifications loaded:', data?.length || 0, data?.map(n => ({ id: n.notification_id, title: n.title })))
      if (!cancelled) {
        applyNotificationData(data || [])
        console.log('[Dashboard Header] State updated with notifications:', data?.length || 0)
      }
    }
    load()
    
    // Fallback: Also poll every 10 seconds as backup (reduced from 30s for faster updates)
    const t = setInterval(() => {
      if (!cancelled) load()
    }, 10000)
    
    return () => { 
      cancelled = true
      clearInterval(t)
    }
  }, [])

  // Live stream (SSE) for instant local notifications, with polling retained as fallback.
  useEffect(() => {
    let disposed = false

    const connectStream = () => {
      if (disposed) return

      const currentAdminId = getCurrentAdminId()
      const params = new URLSearchParams({ recipient_type: 'admin' })
      if (currentAdminId !== null) {
        params.set('recipient_id', String(currentAdminId))
      }

      try {
        const es = new EventSource(`/api/notifications/stream?${params.toString()}`)
        notifEventSourceRef.current = es

        es.onmessage = async (event) => {
          if (disposed) return
          try {
            const payload = JSON.parse(event.data || '{}')
            if (payload?.type === 'notification-created') {
              await refreshTopNotifications()
            }
          } catch {
            // Ignore malformed events
          }
        }

        es.onerror = () => {
          if (disposed) return
          try { es.close() } catch {}
          notifEventSourceRef.current = null
          setTimeout(() => {
            if (!disposed) connectStream()
          }, 3000)
        }
      } catch (err) {
        console.warn('[Dashboard Header] Notification stream failed to connect:', err)
      }
    }

    connectStream()

    return () => {
      disposed = true
      try {
        notifEventSourceRef.current?.close()
      } catch {}
      notifEventSourceRef.current = null
    }
  }, [])

  // Mount/unmount with exit animation
  useEffect(() => {
    if (isNotifOpen) {
      setNotifMounted(true)
      return
    }
    const t = setTimeout(() => setNotifMounted(false), 180)
    return () => clearTimeout(t)
  }, [isNotifOpen])

  // Keep notifications panel anchored to the bell button while scrolling/resizing.
  useEffect(() => {
    if (!notifMounted) return

    const updateNotifPanelPosition = () => {
      const btn = notifButtonRef.current
      if (!btn || typeof window === 'undefined') return

      const rect = btn.getBoundingClientRect()
      const margin = 16
      const gap = 8
      const panelWidth = 26 * 16 // w-[26rem]

      const top = Math.max(56, rect.bottom + gap)
      const maxHeight = Math.max(280, window.innerHeight - top - margin)
      const spaceToRight = window.innerWidth - rect.left - margin
      const spaceToLeft = rect.right - margin

      // Prefer opening toward the side with enough room; fallback to clamped right placement.
      if (spaceToRight >= panelWidth) {
        const left = Math.max(margin, Math.min(rect.left, window.innerWidth - panelWidth - margin))
        setNotifPanelStyle({ top, left, right: undefined, maxHeight })
        return
      }

      if (spaceToLeft >= panelWidth) {
        const right = Math.max(margin, Math.min(window.innerWidth - rect.right, window.innerWidth - panelWidth - margin))
        setNotifPanelStyle({ top, left: undefined, right, maxHeight })
        return
      }

      // Extremely narrow screens: keep panel inside viewport with equal margins.
      setNotifPanelStyle({ top, left: margin, right: margin, maxHeight })
    }

    updateNotifPanelPosition()
    window.addEventListener('resize', updateNotifPanelPosition)
    window.addEventListener('scroll', updateNotifPanelPosition, { passive: true })

    return () => {
      window.removeEventListener('resize', updateNotifPanelPosition)
      window.removeEventListener('scroll', updateNotifPanelPosition)
    }
  }, [notifMounted, sidebarOpen])

  // Close notifications on outside click / Esc
  useEffect(() => {
    if (!isNotifOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsNotifOpen(false) }
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest?.('#rams-notif-panel') || target.closest?.('#rams-notif-button')) return
      setIsNotifOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick) }
  }, [isNotifOpen])
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState("")
  const [searchResults, setSearchResults] = useState<Array<{ type: "page" | "employee" | "log"; title: string; url: string; subtitle?: string; group?: string }>>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(-1)
  const searchContainerRef = useRef<HTMLDivElement | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined)

  const highlightMatches = (text: string, query: string) => {
    if (!text) return text
    const q = query.trim()
    if (!q) return text

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const regex = new RegExp(`(${escaped})`, 'ig')
    const parts = text.split(regex)

    return parts.map((part, i) => {
      if (part.toLowerCase() === q.toLowerCase()) {
        return (
          <mark key={`${part}-${i}`} className="bg-amber-200/80 dark:bg-amber-500/30 px-0.5 rounded-sm">
            {part}
          </mark>
        )
      }
      return <span key={`${part}-${i}`}>{part}</span>
    })
  }

  // Update date and time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const handleRefresh = () => {
    setIsRefreshing(true)
    // Refresh the current page
    router.refresh()
    // Reset refreshing state after a short delay
    setTimeout(() => {
      setIsRefreshing(false)
    }, 1000)
  }

  const formatDateTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  }

  // Debounced global search
  useEffect(() => {
    const controller = new AbortController()
    if (!searchTerm.trim()) {
      setSearchResults([])
      setSelectedSearchIndex(-1)
      return
    }
    setIsSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchTerm)}`, {
          method: "GET",
          signal: controller.signal,
        })
        if (!res.ok) throw new Error("Search failed")
        const json = await res.json()
        setSearchResults(Array.isArray(json.results) ? json.results : [])
        setSelectedSearchIndex(-1)
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setSearchResults([])
          setSelectedSearchIndex(-1)
        }
      } finally {
        setIsSearching(false)
      }
    }, 300)
    return () => {
      controller.abort()
      clearTimeout(t)
    }
  }, [searchTerm])

  // Close search results on outside click
  useEffect(() => {
    function onClickOutside(ev: MouseEvent) {
      if (!searchContainerRef.current) return
      if (!searchContainerRef.current.contains(ev.target as Node)) {
        setIsSearchOpen(false)
        setSelectedSearchIndex(-1)
      }
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  // Load profile photo from local session
  useEffect(() => {
    try {
      const raw = localStorage.getItem("rams_user")
      if (raw) {
        const parsed = JSON.parse(raw)
        setPhotoUrl(parsed?.photo)
      }
    } catch {}
  }, [])

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <header className="w-full rounded-2xl border border-white/15 dark:border-slate-600/40 bg-white/55 dark:bg-slate-900/55 shadow-[0_18px_40px_-24px_rgba(2,6,23,0.7)] backdrop-blur-xl supports-backdrop-filter:bg-white/40 supports-backdrop-filter:dark:bg-slate-900/45">
      <div className="flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4 md:px-6">
        {/* Left Section */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          {/* Hamburger Menu */}
          <button
            type="button"
            onClick={() => setSidebarOpen?.(!sidebarOpen)}
            className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Toggle sidebar"
          >
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          {/* Profile avatar/name removed per request to declutter top bar */}
          <div className="relative w-40 sm:w-56 md:w-72 lg:w-80 focus-within:w-44 sm:focus-within:w-64 md:focus-within:w-80 lg:focus-within:w-[26rem] transition-[width] duration-200 ease-out" ref={searchContainerRef}>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder={t('common.search_placeholder')}
              className="pl-9 sm:pl-10 h-9 sm:h-10 text-sm w-full"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setIsSearchOpen(true)
              }}
              onFocus={() => setIsSearchOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault()
                  if (searchResults.length > 0) {
                    setSelectedSearchIndex((prev) => (prev + 1) % searchResults.length)
                  }
                  return
                }

                if (e.key === "ArrowUp") {
                  e.preventDefault()
                  if (searchResults.length > 0) {
                    setSelectedSearchIndex((prev) => {
                      if (prev <= 0) return searchResults.length - 1
                      return prev - 1
                    })
                  }
                  return
                }

                if (e.key === "Escape") {
                  e.preventDefault()
                  setIsSearchOpen(false)
                  setSelectedSearchIndex(-1)
                  return
                }

                if (e.key === "Enter") {
                  e.preventDefault()
                  const selected = selectedSearchIndex >= 0 ? searchResults[selectedSearchIndex] : searchResults[0]
                  if (selected?.url) {
                    router.push(selected.url)
                  } else if (searchTerm.trim()) {
                    router.push(`/dashboard/employees?q=${encodeURIComponent(searchTerm.trim())}`)
                  }
                  setIsSearchOpen(false)
                  setSelectedSearchIndex(-1)
                }
              }}
            />
            {isSearchOpen && (searchTerm.trim().length > 0 || isSearching) && (
              <div className="absolute mt-2 w-full max-w-none left-0 rounded-md border bg-white dark:bg-gray-900 shadow-lg z-50 overflow-hidden">
                <div className="max-h-80 overflow-auto">
                  {isSearching ? (
                    <div className="px-3 py-3 text-sm text-gray-500">{t('common.search')}…</div>
                  ) : searchResults.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-gray-500">No results</div>
                  ) : (
                    <ul className="divide-y divide-gray-100/60 dark:divide-gray-800/60">
                      {searchResults.map((item, idx) => (
                        <li
                          key={idx}
                          className={idx === selectedSearchIndex ? "bg-gray-50 dark:bg-gray-800/60" : "hover:bg-gray-50 dark:hover:bg-gray-800/60"}
                        >
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2"
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={() => setSelectedSearchIndex(idx)}
                            onClick={() => {
                              router.push(item.url)
                              setIsSearchOpen(false)
                              setSelectedSearchIndex(-1)
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{highlightMatches(item.title, searchTerm)}</div>
                              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                                {item.group || item.type}
                              </span>
                            </div>
                            {item.subtitle ? (
                              <div className="text-xs text-gray-500 truncate">{highlightMatches(item.subtitle, searchTerm)}</div>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-1 sm:gap-3 shrink-0">
          {/* Date and Time */}
          <div className="hidden lg:flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 font-medium">
            <span className="inline">{formatDateTime(currentDateTime)}</span>
          </div>

          {/* Theme Toggle */}
          <div className="block">
            <ModeToggle size="icon" />
          </div>

          {/* Notifications (Popover to avoid scroll lock/clipping) */}
          <Popover>
            <PopoverTrigger asChild>
              <Button ref={notifButtonRef} id="rams-notif-button" onClick={() => setIsNotifOpen(v => !v)} variant="ghost" size="sm" className="relative h-10 w-10 p-0">
                <Bell className="h-5 w-5" />
                {totalNotificationCount > 0 && (
                  <Badge className="absolute -top-1.5 -right-1.5 min-w-[1.55rem] h-6 px-1.5 rounded-full text-[10px] leading-none font-semibold bg-red-500 text-white flex items-center justify-center">
                    {totalNotificationCount > 99 ? '99+' : totalNotificationCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            {/* Keep Popover mounted for consistency, but render our own fixed panel */}
            {notifMounted && ReactDOM.createPortal(
              <div
                id="rams-notif-panel"
                className={`fixed w-[26rem] max-w-[95vw] p-0 overflow-hidden rounded-2xl shadow-[0_22px_60px_-22px_rgba(2,6,23,0.6)] z-[1000] bg-white/95 dark:bg-slate-950/95 border border-slate-200/80 dark:border-slate-700/70 backdrop-blur-xl transition-all duration-200 ease-out transform ${isNotifOpen ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-95 pointer-events-none'}`}
                style={{
                  top: `${notifPanelStyle.top}px`,
                  left: notifPanelStyle.left !== undefined ? `${notifPanelStyle.left}px` : undefined,
                  right: notifPanelStyle.right !== undefined ? `${notifPanelStyle.right}px` : undefined,
                  maxHeight: `${notifPanelStyle.maxHeight}px`,
                }}
              >
              <div className="px-4 py-3 border-b border-slate-200/80 dark:border-slate-700/70 bg-linear-to-r from-slate-50/90 via-white to-cyan-50/70 dark:from-slate-900 dark:via-slate-900 dark:to-cyan-950/40">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h4 className="font-semibold text-base text-slate-900 dark:text-slate-100">{t('common.notifications')}</h4>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">Live attendance updates</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {totalNotificationCount > 0 && (
                      <button
                        className="text-[11px] font-medium text-blue-700 dark:text-blue-300 px-2 py-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                        onClick={async () => {
                          try {
                            const currentAdminId = getCurrentAdminId()
                            
                            // Use API endpoint for more reliable "Mark All Read"
                            const res = await fetch('/api/notifications/mark-all-read', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ admin_id: currentAdminId })
                            })
                            
                            const result = await res.json()
                            
                            if (res.ok && result.success) {
                              // Immediately update local state to mark all as read
                              setNotifications(prev => prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() })))
                              setTotalNotificationCount(0)
                              
                              // Reload notifications and count after marking all as read to ensure consistency
                              const data = await loadNotifications(5)
                              setNotifications(data)
                              await loadNotificationCount()
                              
                              // Show success toast
                              toast({
                                title: "All notifications marked as read",
                                description: `Marked ${result.marked || 0} notifications as read.`,
                              })
                            } else {
                              toast({
                                title: "Failed to mark all as read",
                                description: result.error || "Please try again.",
                                variant: "destructive",
                              })
                            }
                          } catch (error) {
                            console.error('[Mark All Read] Error:', error)
                            toast({
                              title: "Error",
                              description: "Failed to mark all notifications as read.",
                              variant: "destructive",
                            })
                          }
                        }}
                      >
                        Mark all read
                        </button>
                      )}
                      {notifications.length > 0 && (
                        <button
                          className="text-[11px] font-medium text-red-600 dark:text-red-400 px-2 py-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors flex items-center gap-1"
                          onClick={() => setConfirmDeleteAllOpen(true)}
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete all
                        </button>
                      )}
                    </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {notifications.length > 0 ? `${notifications.length} recent` : 'No recent items'}
                  </span>
                  {notifications.length > 0 && (
                    <span className="text-[11px] font-medium text-blue-700 dark:text-blue-300 bg-blue-100/80 dark:bg-blue-950/50 px-2 py-0.5 rounded-full">
                      {notifications.filter(n=>!n.is_read).length} unread
                    </span>
                  )}
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto overflow-x-hidden custom-scrollbar bg-gradient-to-b from-transparent to-slate-50/40 dark:to-slate-900/30">
                {notifications.length === 0 ? (
                  <div className="px-5 py-8 text-sm text-slate-500 dark:text-slate-400 flex flex-col items-center gap-2 text-center">
                    <span className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <Bell className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                    </span>
                    <span>No new notifications</span>
                  </div>
                  ) : notifications.map((n) => (
                  <div
                    key={n.notification_id}
                    className="mx-2 my-2 p-3 rounded-xl border border-slate-200/70 dark:border-slate-700/70 bg-white/90 dark:bg-slate-900/80 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/90 cursor-pointer"
                    onClick={() => openNotificationDetails(n)}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`${n.is_read ? 'bg-slate-300 dark:bg-slate-600' : 'bg-blue-500 animate-pulse'} mt-1.5 h-2 w-2 rounded-full shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{n.title}</p>
                        {n.message ? <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 mt-1">{n.message}</p> : null}
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">{new Date(n.created_at).toLocaleString()}</p>
                      </div>
                      {/* Delete button for individual notification */}
                      <button
                        title="Delete"
                        className="text-slate-400 hover:text-red-600 shrink-0 transition-colors"
                        onClick={async (e) => {
                          e.stopPropagation()
                          try {
                            const idToDelete = n.notification_id
                            console.log('[Delete] Deleting notification id:', idToDelete)
                            const res = await fetch(`/api/notifications`, {
                              method: 'DELETE',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ ids: [idToDelete] })
                            })
                            const result = await res.json()
                            console.log('[Delete] Response:', result)
                            if (!res.ok) {
                              console.warn('Failed to delete notification:', result)
                              return
                            }
                            // Immediately filter local state
                            setNotifications(prev => prev.filter(x => x.notification_id !== idToDelete))
                            setAllNotifications(prev => prev.filter(x => x.notification_id !== idToDelete))
                            // Then refetch to ensure sync
                            const fresh = await loadNotifications(5)
                            setNotifications(fresh)
                            await loadNotificationCount()
                          } catch (err) {
                            console.error('[Delete] Error:', err)
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {notifications.length > 0 && <div className="border-t border-slate-200/80 dark:border-slate-700/70" />}
              <div
                className="px-4 py-3 text-center text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors cursor-pointer text-sm font-medium"
                onClick={async () => {
                  setIsNotifOpen(false) // Close the notification popover first
                  setShowAll(true)
                  setIsAllLoading(true)
                  try {
                    // Load all notifications (use a high limit like 1000 to get all)
                    const data = await loadNotifications(1000)
                    setAllNotifications(data)
                  } finally {
                    setIsAllLoading(false)
                  }
                }}
              >
                {t('common.view_all')} {totalNotificationCount > 5 && `(${totalNotificationCount})`}
              </div>
              </div>, document.body)
            }
          </Popover>

          {/* View All Notifications Dialog */}
          <Dialog open={showAll} onOpenChange={setShowAll}>
            <DialogContent className="w-full max-w-xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
              <DialogHeader className="p-4 border-b">
                <DialogTitle className="text-lg">All notifications</DialogTitle>
              </DialogHeader>
              <div className="max-h-[70vh] overflow-y-auto overflow-x-hidden custom-scrollbar">
                {isAllLoading ? (
                  <div className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">Loading…</div>
                ) : allNotifications.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                    No notifications found
                  </div>
                ) : (
                  <ul>
                    {allNotifications.map((n) => (
                      <li
                        key={n.notification_id}
                        className="px-4 py-3 border-b last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                        onClick={() => openNotificationDetails(n)}
                      >
                        <div className="flex items-start gap-3">
                          <span className={`${n.is_read ? 'bg-gray-300 dark:bg-gray-600' : 'bg-blue-500'} mt-1 h-2 w-2 rounded-full shrink-0`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{n.title}</p>
                            {n.message ? <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mt-0.5">{n.message}</p> : null}
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{new Date(n.created_at).toLocaleString()}</p>
                          </div>
                          {/* Delete button for individual notification */}
                          <button
                            title="Delete"
                            className="text-gray-400 hover:text-red-600 shrink-0 transition-colors"
                            onClick={async (e) => {
                              e.stopPropagation()
                              try {
                                const idToDelete = n.notification_id
                                console.log('[Delete All] Deleting notification id:', idToDelete)
                                const res = await fetch(`/api/notifications`, {
                                  method: 'DELETE',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ ids: [idToDelete] })
                                })
                                const result = await res.json()
                                console.log('[Delete All] Response:', result)
                                if (!res.ok) {
                                  console.warn('Failed to delete notification:', result)
                                  return
                                }
                                // Filter local state
                                setAllNotifications(prev => prev.filter(x => x.notification_id !== idToDelete))
                                setNotifications(prev => prev.filter(x => x.notification_id !== idToDelete))
                                // Refetch to sync
                                const freshAll = await loadNotifications(1000)
                                setAllNotifications(freshAll)
                                const freshTop = await loadNotifications(5)
                                setNotifications(freshTop)
                                await loadNotificationCount()
                              } catch (err) {
                                console.error('[Delete All] Error:', err)
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {/* Footer with Delete All button */}
              {allNotifications.length > 0 && (
                <div className="p-4 border-t bg-gray-50 dark:bg-gray-900/50 flex justify-end">
                  <button
                    onClick={() => setConfirmDeleteAllOpen(true)}
                    className="text-sm text-red-600 hover:text-red-700 dark:text-red-500 dark:hover:text-red-600 flex items-center gap-2 transition-colors px-4 py-2 rounded-md hover:bg-red-50 dark:hover:bg-red-950/20"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Delete All</span>
                  </button>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
            <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-hidden p-0 flex flex-col">
              <DialogHeader className="px-5 py-4 border-b bg-slate-50/70 dark:bg-slate-900/60">
                <DialogTitle className="text-base sm:text-lg">
                  {selectedNotification?.title || 'Notification details'}
                </DialogTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {formatDateTimeShort(selectedNotification?.created_at)}
                </p>
              </DialogHeader>

              <div className="overflow-y-auto p-4 sm:p-5 space-y-4">
                {isDetailLoading ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400">Loading employee details...</div>
                ) : !notificationDetail ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400">No details found for this notification.</div>
                ) : (
                  <>
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-4">
                      <h5 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Employee</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <div><span className="text-slate-500 dark:text-slate-400">Name:</span> <span className="font-medium text-slate-900 dark:text-slate-100">{notificationDetail.employee?.full_name || 'N/A'}</span></div>
                        <div><span className="text-slate-500 dark:text-slate-400">ID:</span> <span className="font-medium text-slate-900 dark:text-slate-100">{notificationDetail.employee?.employee_id || 'N/A'}</span></div>
                        <div><span className="text-slate-500 dark:text-slate-400">Department:</span> <span className="font-medium text-slate-900 dark:text-slate-100">{notificationDetail.employee?.department || 'N/A'}</span></div>
                        <div><span className="text-slate-500 dark:text-slate-400">Staff Type:</span> <span className="font-medium text-slate-900 dark:text-slate-100">{notificationDetail.employee?.staff_type || 'N/A'}</span></div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-4">
                      <h5 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Attendance Summary</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <div><span className="text-slate-500 dark:text-slate-400">Date:</span> <span className="font-medium text-slate-900 dark:text-slate-100">{notificationDetail.daily_summary?.date || 'N/A'}</span></div>
                        <div><span className="text-slate-500 dark:text-slate-400">Status:</span> <span className="font-medium text-slate-900 dark:text-slate-100">{notificationDetail.daily_summary?.status || notificationDetail.event_log?.attendance_status || 'N/A'}</span></div>
                        <div><span className="text-slate-500 dark:text-slate-400">Time In:</span> <span className="font-medium text-slate-900 dark:text-slate-100">{formatTimeOnly(notificationDetail.daily_summary?.time_in)}</span></div>
                        <div><span className="text-slate-500 dark:text-slate-400">Time Out:</span> <span className="font-medium text-slate-900 dark:text-slate-100">{formatTimeOnly(notificationDetail.daily_summary?.time_out)}</span></div>
                        {notificationDetail.daily_summary?.reason_source || notificationDetail.daily_summary?.absent_source ? (
                          <div className="sm:col-span-2"><span className="text-slate-500 dark:text-slate-400">Reason Source:</span> <span className="font-medium text-slate-900 dark:text-slate-100">{formatReasonSource(notificationDetail.daily_summary?.reason_source || notificationDetail.daily_summary?.absent_source)}</span></div>
                        ) : null}
                        {notificationDetail.daily_summary?.reason_detail || notificationDetail.daily_summary?.absent_reason ? (
                          <div className="sm:col-span-2"><span className="text-slate-500 dark:text-slate-400">Reason Detail:</span> <span className="font-medium text-slate-900 dark:text-slate-100">{notificationDetail.daily_summary?.reason_detail || notificationDetail.daily_summary?.absent_reason}</span></div>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-4">
                      <h5 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Schedule Comparison</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <div><span className="text-slate-500 dark:text-slate-400">Scheduled In:</span> <span className="font-medium text-slate-900 dark:text-slate-100">{formatTimeOnly(notificationDetail.daily_summary?.schedule_time_in)}</span></div>
                        <div><span className="text-slate-500 dark:text-slate-400">Scheduled Out:</span> <span className="font-medium text-slate-900 dark:text-slate-100">{formatTimeOnly(notificationDetail.daily_summary?.schedule_time_out)}</span></div>
                        <div><span className="text-slate-500 dark:text-slate-400">Late:</span> <span className="font-medium text-slate-900 dark:text-slate-100">{notificationDetail.daily_summary?.is_late ? 'Yes' : 'No'}</span></div>
                        <div><span className="text-slate-500 dark:text-slate-400">Undertime:</span> <span className="font-medium text-slate-900 dark:text-slate-100">{notificationDetail.daily_summary?.is_early_out ? 'Yes' : 'No'}</span></div>
                        <div className="sm:col-span-2"><span className="text-slate-500 dark:text-slate-400">Expected Source:</span> <span className="font-medium text-slate-900 dark:text-slate-100">{notificationDetail.daily_summary?.schedule_source || 'Unknown'}</span></div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-4">
                      <h5 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Day Schedules</h5>
                      {notificationDetail.schedules && notificationDetail.schedules.length > 0 ? (
                        <div className="space-y-2">
                          {notificationDetail.schedules.map((schedule, idx) => (
                            <div key={`${schedule.source}-${schedule.day_of_week}-${idx}`} className="text-sm rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 bg-slate-50/70 dark:bg-slate-900/40 flex items-center justify-between">
                              <span className="font-medium text-slate-800 dark:text-slate-200 uppercase">{schedule.source}</span>
                              <span className="text-slate-600 dark:text-slate-300">{formatTimeOnly(schedule.time_start)} - {formatTimeOnly(schedule.time_end)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 dark:text-slate-400">No class or exam schedules found for this day.</p>
                      )}
                    </div>

                    {notificationDetail.notification?.message ? (
                      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-4">
                        <h5 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Original Notification</h5>
                        <p className="text-sm text-slate-700 dark:text-slate-200">{notificationDetail.notification.message}</p>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <AlertDialog open={confirmDeleteAllOpen} onOpenChange={setConfirmDeleteAllOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all notifications?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all current notifications for your admin account. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeletingAllNotifications}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault()
                    void handleDeleteAllNotifications()
                  }}
                  disabled={isDeletingAllNotifications}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {isDeletingAllNotifications ? 'Deleting...' : 'Delete All'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </header>
  )
}

