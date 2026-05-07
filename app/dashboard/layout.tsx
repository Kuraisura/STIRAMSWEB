"use client"

import type React from "react"

import { useEffect, useState, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"
import Image from "next/image"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { DashboardHeader } from "@/components/dashboard-header"
import { SocialMediaFooter } from "@/components/social-media-footer"
import { Toaster } from "@/components/ui/toaster"
import { RouteLoadingBar } from "@/components/route-loading-bar"
import { ErrorBoundary } from "@/components/error-boundary"
import { useActiveTermCheck } from "@/hooks/use-active-term-check"
import { ActiveTermWarningModal } from "@/components/active-term-warning-modal"

interface User {
  id: number
  email: string
  name: string
  role: string
}

const IDLE_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true) // Always expanded
  const [recoveryOnly, setRecoveryOnly] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastActivityRef = useRef<number>(Date.now())
  const idleLogoutInProgressRef = useRef(false)
  
  // Active term check
  const { showWarning, redirectToAcademicTerm } = useActiveTermCheck()

  useEffect(() => {
    // Validate session with the server first, fall back to localStorage for display data.
    // The HttpOnly session cookie is sent automatically with the fetch request.
    async function validateSession() {
      try {
        if (pathname.startsWith('/dashboard/recovery-console')) {
          try {
            const rs = await fetch('/api/recovery/status', { credentials: 'same-origin', cache: 'no-store' })
            const rd = await rs.json().catch(() => ({}))
            if (rd?.guestMode && rd?.unlocked) {
              const guestUser = {
                id: 0,
                email: 'recovery@guest.local',
                name: 'Recovery console (guest)',
                role: 'recovery_guest',
              }
              setUser(guestUser)
              localStorage.setItem('rams_user', JSON.stringify(guestUser))
              setIsLoading(false)
              return
            }
          } catch {
            /* fall through to normal auth */
          }
        }

        const res = await fetch('/api/auth/session', { credentials: 'same-origin' })
        const data = await res.json().catch(() => null)

        if (res.ok && data?.user) {
          setUser(data.user)
          // Keep localStorage in sync for UI components that read it
          localStorage.setItem("rams_user", JSON.stringify(data.user))
          setIsLoading(false)
          return
        }

        // --- Single Active Session: detect displacement ---
        if (res.status === 401 && data?.displaced) {
          // Clear all local state so localStorage fallback can't re-authenticate
          localStorage.removeItem("rams_user")
          // Redirect to login with displacement message
          router.push("/auth/login?reason=displaced")
          return
        }

        // Session invalid — redirect to login.
        localStorage.removeItem("rams_user")
        if (pathname.startsWith('/dashboard/recovery-console')) {
          router.replace('/auth/recovery?next=/dashboard/recovery-console')
          setIsLoading(false)
          return
        }
        if (res.status === 401) {
          router.push("/auth/login?reason=expired")
        } else {
          router.push("/auth/login")
        }
        setIsLoading(false)
      } catch {
        // Network/session validation error — force explicit re-login.
        localStorage.removeItem("rams_user")
        if (pathname.startsWith('/dashboard/recovery-console')) {
          router.replace('/auth/recovery?next=/dashboard/recovery-console')
        } else {
          router.push("/auth/login")
        }
        setIsLoading(false)
      }
    }

    validateSession()

    // --- Session Watchdog: periodically re-validate to catch displacement ---
    const watchdogInterval = setInterval(async () => {
      try {
        const rs = await fetch('/api/recovery/status', { credentials: 'same-origin', cache: 'no-store' })
        const rd = await rs.json().catch(() => ({}))
        if (rd?.guestMode && rd?.unlocked) return

        const res = await fetch('/api/auth/session', { credentials: 'same-origin' })

        // Ignore temporary throttling/server errors in watchdog.
        if (res.status === 429 || res.status >= 500) {
          return
        }

        if (res.status === 401) {
          const errBody = await res.json().catch(() => null)
          if (errBody?.displaced) {
            clearInterval(watchdogInterval)
            localStorage.removeItem("rams_user")
            router.push("/auth/login?reason=displaced")
            return
          }
          // Any non-displaced 401 means session is gone — force re-login
          clearInterval(watchdogInterval)
          localStorage.removeItem("rams_user")
          router.push("/auth/login?reason=expired")
        }
      } catch { /* network error — skip this tick */ }
    }, 30_000) // Check every 30 seconds

    return () => clearInterval(watchdogInterval)
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, router])

  // Handle smooth page transitions
  useEffect(() => {
    setIsTransitioning(true)
    const timer = setTimeout(() => {
      setIsTransitioning(false)
    }, 50)

    return () => clearTimeout(timer)
  }, [pathname])

  // Removed navigation tracking (no longer needed without auto-logout)

  // Auto-logout after 10 minutes of inactivity.
  useEffect(() => {
    if (!user || user.role === 'recovery_guest') return

    const clearIdleTimer = () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
    }

    const performIdleLogout = async () => {
      if (idleLogoutInProgressRef.current) return
      idleLogoutInProgressRef.current = true

      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'same-origin',
        })
      } catch {
        // Continue with client cleanup even if network/logout API fails.
      }

      try {
        localStorage.removeItem('rams_user')
      } catch {}

      clearIdleTimer()
      router.push('/auth/login?reason=idle')
    }

    const resetIdleTimer = () => {
      clearIdleTimer()
      idleTimerRef.current = setTimeout(() => {
        const elapsed = Date.now() - lastActivityRef.current
        if (elapsed >= IDLE_TIMEOUT_MS) {
          performIdleLogout()
        } else {
          resetIdleTimer()
        }
      }, IDLE_TIMEOUT_MS)
    }

    const markActivity = () => {
      if (idleLogoutInProgressRef.current) return
      lastActivityRef.current = Date.now()
      if (!document.hidden) {
        resetIdleTimer()
      }
    }

    const handleVisibilityChange = () => {
      if (idleLogoutInProgressRef.current) return

      if (document.hidden) return

      const elapsed = Date.now() - lastActivityRef.current
      if (elapsed >= IDLE_TIMEOUT_MS) {
        performIdleLogout()
      } else {
        resetIdleTimer()
      }
    }

    const activityEvents: Array<keyof WindowEventMap> = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click',
      'focus',
    ]

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, markActivity, { passive: true })
    })
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Route navigation should count as activity.
    markActivity()

    return () => {
      clearIdleTimer()
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, markActivity)
      })
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [user, router, pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      setRecoveryOnly(sessionStorage.getItem('rams_recovery_only') === '1')
    } catch {
      setRecoveryOnly(false)
    }
  }, [pathname])

  useEffect(() => {
    if (!recoveryOnly) return
    if (pathname !== '/dashboard/recovery-console') {
      router.push('/dashboard/recovery-console')
    }
  }, [recoveryOnly, pathname, router])

  // ---------- Compact animated loading screen ----------
  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 overflow-hidden">
        {/* Animated background blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-[0.07] dark:opacity-[0.04]"
            style={{
              background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)',
              animation: 'blob-drift 8s ease-in-out infinite',
            }}
          />
          <div
            className="absolute -bottom-32 -right-32 w-[28rem] h-[28rem] rounded-full opacity-[0.06] dark:opacity-[0.03]"
            style={{
              background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)',
              animation: 'blob-drift 10s ease-in-out infinite reverse',
            }}
          />
          <div
            className="absolute top-1/3 right-1/4 w-64 h-64 rounded-full opacity-[0.05] dark:opacity-[0.025]"
            style={{
              background: 'radial-gradient(circle, #ec4899 0%, transparent 70%)',
              animation: 'blob-drift 12s ease-in-out infinite 2s',
            }}
          />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-8" style={{ animation: 'init-fade-in 0.6s cubic-bezier(0.16,1,0.3,1) both' }}>
          {/* Spinner rings around logo */}
          <div className="relative w-56 h-56">
            {/* Outer glow pulse */}
            <div
              className="absolute -inset-6 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 70%)',
                animation: 'ring-glow 2.5s ease-in-out infinite',
              }}
            />
            {/* Outer spinning ring */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                border: '3.5px solid transparent',
                borderTopColor: '#3b82f6',
                borderRightColor: '#8b5cf6',
                animation: 'spinner-rotate 1.4s cubic-bezier(0.4,0,0.6,1) infinite',
              }}
            />
            {/* Middle counter-spinning ring */}
            <div
              className="absolute inset-3 rounded-full"
              style={{
                border: '3px solid transparent',
                borderBottomColor: '#ec4899',
                borderLeftColor: '#f59e0b',
                animation: 'spinner-rotate 2s cubic-bezier(0.4,0,0.6,1) infinite reverse',
              }}
            />
            {/* Inner dashed orbit ring */}
            <div
              className="absolute inset-7 rounded-full"
              style={{
                border: '1.5px dashed rgba(139,92,246,0.25)',
                animation: 'spinner-rotate 6s linear infinite',
              }}
            />
            {/* Logo container with gentle float + rotate */}
            <div
              className="absolute inset-10 flex items-center justify-center"
              style={{
                animation: 'logo-breathe 3s ease-in-out infinite',
              }}
            >
              <Image
                src="/sti-logo.png"
                alt="STI"
                width={120}
                height={120}
                className="object-contain drop-shadow-lg"
                priority
                style={{
                  animation: 'logo-rotate 8s cubic-bezier(0.4,0,0.6,1) infinite',
                  filter: 'drop-shadow(0 8px 24px rgba(59,130,246,0.25))',
                }}
                onError={(e)=>{ try { (e.currentTarget as any).src = '/sign%20in%20page/sti-logo.png' } catch {} }}
              />
            </div>
          </div>

          {/* Animated progress dots */}
          <div className="flex items-center gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  animation: 'dot-wave 1.4s ease-in-out infinite',
                  animationDelay: `${i * 0.12}s`,
                }}
              />
            ))}
          </div>

          {/* Status text */}
          <p
            className="text-sm font-medium tracking-widest uppercase text-gray-400 dark:text-gray-500"
            style={{ animation: 'text-pulse 2s ease-in-out infinite' }}
          >
            {!user && !isLoading ? 'Redirecting…' : 'Loading…'}
          </p>
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes init-fade-in {
            from { opacity: 0; transform: translateY(12px) scale(0.96); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes spinner-rotate {
            0%   { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes logo-breathe {
            0%, 100% { transform: scale(1); }
            50%      { transform: scale(1.06); }
          }
          @keyframes logo-rotate {
            0%   { transform: rotate(0deg); }
            25%  { transform: rotate(3deg); }
            50%  { transform: rotate(0deg); }
            75%  { transform: rotate(-3deg); }
            100% { transform: rotate(0deg); }
          }
          @keyframes ring-glow {
            0%, 100% { opacity: 0.4; transform: scale(1); }
            50%      { opacity: 1; transform: scale(1.08); }
          }
          @keyframes dot-wave {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
            40%            { transform: scale(1.3); opacity: 1; }
          }
          @keyframes text-pulse {
            0%, 100% { opacity: 0.5; }
            50%      { opacity: 1; }
          }
          @keyframes blob-drift {
            0%, 100% { transform: translate(0, 0) scale(1); }
            33%      { transform: translate(30px, -20px) scale(1.05); }
            66%      { transform: translate(-20px, 15px) scale(0.95); }
          }
        `}} />
      </div>
    )
  }
  
  const displayUser = user

  return (
    <ErrorBoundary>
      <SidebarProvider>
        {/* Route Loading Bar — thin top progress strip */}
        <RouteLoadingBar />
        
        {/* Active Term Warning Modal */}
        <ActiveTermWarningModal 
          open={showWarning} 
          onSetTerm={redirectToAcademicTerm} 
        />
        
        <div className="min-h-screen flex w-full overflow-x-hidden bg-gray-50 dark:bg-gray-900">

          {/* Sidebar - Always visible, toggleable */}
          <div className={`transition-all duration-500 ease-in-out ${
            sidebarOpen ? 'w-64' : 'w-16'
          } overflow-hidden fixed left-0 top-0 h-screen z-40`}>
            <AppSidebar
              user={displayUser}
              isVisible={sidebarOpen}
              disableNavigation={recoveryOnly || displayUser.role === 'recovery_guest'}
            />
          </div>
          
          {/* Main Content - Padding offset avoids page-width overflow */}
          <div className={`flex-1 min-w-0 flex flex-col transition-all duration-500 ease-in-out ${
            sidebarOpen ? 'pl-64' : 'pl-16'
          }`}>
            <div
              className="fixed top-2 sm:top-3 right-2 sm:right-3 md:right-4 z-50 transition-all duration-500 ease-in-out"
              style={{
                left: sidebarOpen ? 'calc(16rem + 0.5rem)' : 'calc(4rem + 0.5rem)',
              }}
            >
              <DashboardHeader user={displayUser} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
            </div>
            <main className="relative flex-1 overflow-x-hidden p-4 sm:p-6 pt-24 sm:pt-28">
              {/* Page transition overlay */}
              <div
                className="absolute inset-0 pointer-events-none z-10 bg-gray-50 dark:bg-gray-900"
                style={{
                  opacity: isTransitioning ? 1 : 0,
                  transition: 'opacity 0.2s cubic-bezier(0.4,0,0.2,1)',
                }}
              />
              {/* Animated content wrapper */}
              <div
                key={pathname}
                className="min-w-0 text-gray-900 dark:text-gray-100"
                style={{
                  animation: 'page-enter 0.35s cubic-bezier(0.16,1,0.3,1) both',
                }}
              >
                {children}
              </div>
            </main>
            <SocialMediaFooter />
          </div>
        </div>

        {/* Page-enter animation */}
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes page-enter {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}} />

        <Toaster />
      </SidebarProvider>
    </ErrorBoundary>
  )
}
