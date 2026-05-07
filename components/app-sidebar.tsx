"use client"

import * as React from "react"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { 
  Home, 
  Users, 
  BarChart3, 
  Settings, 
  LogOut, 
  ChevronUp,
  UserCheck,
  Mail,
  CheckCircle,
  FileSearch,
  Calendar,
  Clock,
  FileText,
  UserPlus,
  CalendarCheck,
  CalendarX,
  Shield,
  BookOpen,
  Database,
  UserX,
  UserCog,
} from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { useMemo } from "react"
import { getStaffTypeFilter } from "@/lib/offline-dashboard-client"

interface User {
  id?: number
  email: string
  name: string
  role: string
}

interface AppSidebarProps {
  user: User
  isVisible?: boolean
  disableNavigation?: boolean
}

export function AppSidebar({ user, isVisible = true, disableNavigation = false }: AppSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { t, language } = useLanguage()
  const [activeTerm, setActiveTerm] = React.useState<{academic_year: string, term_name: string} | null>(null)
  const [isNavigating, setIsNavigating] = React.useState(false)
  const lastNavAtRef = React.useRef(0)
  const navDisabled = Boolean(disableNavigation)
  const isRecoveryRoute = (url: string) => url === '/dashboard/recovery-console'
  const canNavigateTo = (url: string) => !navDisabled || isRecoveryRoute(url)

  const isFinanceUser = getStaffTypeFilter(user.email, user.role) === 'Non-Teaching'

  // Fetch active academic term
  React.useEffect(() => {
    const fetchActiveTerm = async () => {
      try {
        const res = await fetch('/api/academic-terms', { cache: 'no-store' })
        if (!res.ok) return
        const payload = await res.json().catch(() => ({}))
        const active = Array.isArray(payload?.data)
          ? payload.data.find((t: any) => t?.is_active)
          : null
        if (active) {
          setActiveTerm({ academic_year: active.academic_year, term_name: active.term_name })
        }
      } catch (error) {
        console.error('Error fetching active term:', error)
      }
    }
    
    fetchActiveTerm()
  }, [])

  const menuItems = useMemo(() => {
    const allItems = [
      {
        title: '',
        items: [
          { title: t('sidebar.dashboard'), url: '/dashboard', icon: Home },
        ]
      },
      {
        title: 'Attendance & Records',
        items: [
          { title: t('sidebar.attendance'), url: '/dashboard/attendance', icon: UserCheck },
          { title: t('sidebar.reports'), url: '/dashboard/reports', icon: BarChart3 },
        ]
      },
      // Schedule Management section
      ...(!isFinanceUser ? [{
        title: 'Schedule Management',
        items: [
          { title: 'Class Schedule', url: '/dashboard/class-schedule', icon: BookOpen },
          { title: 'Exam Schedule', url: '/dashboard/exam-schedule', icon: FileText },
        ]
      }] : []),
      {
        title: t('sidebar.management'),
        items: [
          { title: 'Employee Management', url: '/dashboard/employees', icon: Users },
          // Hide Holiday Management for Finance users (Evelyn Barron)
          ...(!isFinanceUser ? [
            { title: 'Holiday Management', url: '/dashboard/holiday', icon: CalendarCheck },
          ] : []),
          ...(!isFinanceUser ? [
            { title: 'Substitute Assignment', url: '/dashboard/substitute-assignment', icon: UserPlus },
          ] : []),
          { title: 'Substitution Forms', url: '/dashboard/substitution', icon: FileText },
          { title: t('sidebar.verification'), url: '/dashboard/verification', icon: CheckCircle },
        ]
      },
      // Hide entire System section for Finance users (Evelyn Barron)
      ...(!isFinanceUser ? [{
        title: t('sidebar.system'),
        items: [
          { title: 'Log Trail', url: '/dashboard/log-trail', icon: Shield },
          { title: 'Academic Terms', url: '/dashboard/academic-term', icon: BookOpen },
          { title: 'Backup', url: '/dashboard/settings', icon: Database }
        ]
      }] : [])
    ]
    
    // Filter out empty sections
    const visible = allItems.filter(section => section.items && section.items.length > 0)
    if (!navDisabled) return visible

    return [
      {
        title: 'Recovery Mode',
        items: [
          { title: 'Recovery Console', url: '/dashboard/recovery-console', icon: Shield },
        ],
      },
    ]
  }, [t, language, isFinanceUser])

  const handleLogout = async () => {
    console.log('Sidebar: User logging out', { user: user.name })
    
    // Call logout API endpoint
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(user.id),
          'x-user-email': user.email,
          'x-user-name': user.name,
        }
      })
      
      if (!response.ok) {
        console.warn('[Logout] Server responded with error:', response.status)
      } else {
        console.log('[Logout] Server-side session cleared successfully')
      }
    } catch (error) {
      console.error('[Logout] Failed to call logout API:', error)
      // Continue with client-side cleanup even if API call fails
    }
    
    try {
      // Clear localStorage
      localStorage.removeItem("rams_user")
      localStorage.removeItem("rams_remember_me")
      sessionStorage.removeItem("rams_recovery_only")
      sessionStorage.removeItem("rams_recovery_signin_gate")
      
      // Clear authentication cookies
      document.cookie = 'rams_auth=; path=/; max-age=0'
      document.cookie = 'rams_user_id=; path=/; max-age=0'
      document.cookie = 'rams_user_email=; path=/; max-age=0'
      
      console.log('[Logout] Client-side cleanup completed')
      
      // Redirect to login
      router.push("/auth/login?reason=manual_logout")
    } catch (error) {
      console.error('[Logout] Error during client-side cleanup:', error)
      // Force redirect even if cleanup fails
      window.location.href = "/auth/login?reason=manual_logout"
    }
  }

  const handleLogoClick = () => {
    console.log('Sidebar: Logo clicked - scrolling to top')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCategoryNavigation = (targetUrl: string) => {
    if (!canNavigateTo(targetUrl)) return
    if (!targetUrl || targetUrl === pathname || isNavigating) return

    const now = Date.now()
    if (now - lastNavAtRef.current < 250) return
    lastNavAtRef.current = now

    setIsNavigating(true)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('rams:navigation-start', { detail: { to: targetUrl } }))
    }
    router.push(targetUrl)
  }

  React.useEffect(() => {
    setIsNavigating(false)
  }, [pathname])

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
  }

  const storedUserRaw = typeof window !== 'undefined' ? localStorage.getItem("rams_user") : null
  const storedUser = storedUserRaw ? (() => { try { return JSON.parse(storedUserRaw) } catch { return null } })() : null
  const photoUrl: string | undefined = storedUser?.photo

  return (
        <div className={`border-r border-gray-200/80 dark:border-gray-800/80 h-full bg-linear-to-b from-white via-gray-50/30 to-white dark:from-gray-900 dark:via-gray-900/95 dark:to-gray-900 shadow-xl ${isVisible ? 'w-64' : 'w-16'} flex flex-col transition-all duration-300 ease-in-out`}>
      <div className="border-b border-gray-200/80 dark:border-gray-800/80 shrink-0 bg-linear-to-br from-blue-50/50 via-white to-indigo-50/30 dark:from-gray-900 dark:via-gray-900/95 dark:to-gray-900 backdrop-blur-sm">
        <div className={`flex transition-all duration-300 ${isVisible ? 'flex-col gap-3 px-4 py-5' : 'flex-col items-center px-2 py-4'}`}>
          {isVisible && (
            <div className="flex items-center gap-3">
              <button 
                onClick={handleLogoClick}
                className="flex items-center justify-center hover:opacity-80 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 rounded-lg p-2 hover:scale-105 active:scale-95 bg-white dark:bg-gray-800 shadow-md"
                title="Scroll to top"
              >
                <Image
                  src="/sti-logo.png"
                  alt="STI College Santa Rosa"
                  width={48}
                  height={48}
                  className="object-contain transition-all duration-300"
                  onError={(e)=>{ try { (e.currentTarget as any).src = '/sign%20in%20page/sti-logo.png' } catch {} }}
                />
              </button>
              <div className="flex flex-col flex-1 transition-all duration-500 ease-in-out">
                <h2 className="font-bold text-base text-gray-900 dark:text-white leading-tight">STI College</h2>
                <h2 className="font-bold text-base text-gray-900 dark:text-white leading-tight">Santa Rosa</h2>
              </div>
            </div>
          )}
          {!isVisible && (
            <button 
              onClick={handleLogoClick}
              className="flex items-center justify-center hover:opacity-80 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 rounded-lg p-1.5 hover:scale-105 active:scale-95 bg-white dark:bg-gray-800 shadow-md"
              title="Scroll to top"
            >
              <Image
                src="/sti-logo.png"
                alt="STI College Santa Rosa"
                width={32}
                height={32}
                className="object-contain transition-all duration-300"
                onError={(e)=>{ try { (e.currentTarget as any).src = '/sign%20in%20page/sti-logo.png' } catch {} }}
              />
            </button>
          )}
          {isVisible && activeTerm && (
            <div className="px-3 py-2 bg-linear-to-r from-blue-500/10 to-indigo-500/10 dark:from-blue-600/20 dark:to-indigo-600/20 rounded-lg border border-blue-200/50 dark:border-blue-700/50">
              <p className="text-xs text-blue-700 dark:text-blue-300 font-semibold text-center">
                {activeTerm.academic_year}
              </p>
              <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium text-center mt-0.5">
                {activeTerm.term_name}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 py-4 overflow-y-auto min-h-0 custom-scrollbar px-1">
        {isVisible ? (
          <>
            {menuItems.map((group, groupIndex) => (
              <div 
                key={group.title} 
                className="mb-4 animate-slideInLeft"
                style={{ 
                  animationDelay: `${groupIndex * 50}ms`,
                  animationFillMode: 'backwards'
                }}
              >
                {group.title && (
                  <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3 px-4 py-2 mx-2 bg-gray-100/80 dark:bg-gray-800/50 rounded-lg transition-all duration-200">
                    {group.title}
                  </div>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item, itemIndex) => (
                    <div 
                      key={item.title} 
                      className="transition-all duration-200"
                      style={{ 
                        animationDelay: `${(groupIndex * 50) + (itemIndex * 30)}ms`
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleCategoryNavigation(item.url)}
                        disabled={isNavigating || !canNavigateTo(item.url)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 mx-2 text-left border-0 bg-transparent appearance-none group rounded-xl transition-all duration-200 ease-out disabled:opacity-50 disabled:cursor-not-allowed ${
                          pathname === item.url 
                            ? 'bg-linear-to-r from-blue-500/90 to-indigo-600/90 text-white shadow-md shadow-blue-500/20' 
                            : 'hover:bg-gray-100/80 dark:hover:bg-gray-800/50 text-gray-700 dark:text-gray-300'
                        } ${!canNavigateTo(item.url) ? 'pointer-events-none' : ''}`}
                      >
                        <item.icon className={`h-[18px] w-[18px] shrink-0 transition-all duration-200 ${
                          pathname === item.url 
                            ? 'text-white' 
                            : 'text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400'
                        }`} />
                        <span className={`text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                          pathname === item.url 
                            ? 'text-white font-semibold' 
                            : 'text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white'
                        }`}>
                          {item.title}
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                          {typeof (item as any).alertCount === 'number' && (item as any).alertCount > 0 && (
                            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold">
                              {(item as any).alertCount > 99 ? '99+' : (item as any).alertCount}
                            </span>
                          )}
                          {pathname === item.url && (
                            <div className="w-1 h-1 rounded-full bg-white/80" />
                          )}
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            {menuItems.map((group, groupIndex) => (
              <div 
                key={group.title} 
                className="mb-4"
                style={{ 
                  animationDelay: `${groupIndex * 50}ms`
                }}
              >
                {group.items.map((item, itemIndex) => (
                  <div 
                    key={item.title} 
                    className="mb-0.5 transition-all duration-200"
                    style={{ 
                      animationDelay: `${(groupIndex * 50) + (itemIndex * 30)}ms`
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleCategoryNavigation(item.url)}
                      disabled={isNavigating || !canNavigateTo(item.url)}
                      className={`w-full flex items-center justify-center p-3 mx-1 border-0 bg-transparent appearance-none rounded-xl transition-all duration-200 ease-out disabled:opacity-50 disabled:cursor-not-allowed ${
                        pathname === item.url 
                          ? 'bg-linear-to-r from-blue-500/90 to-indigo-600/90 text-white shadow-md shadow-blue-500/20' 
                          : 'hover:bg-gray-100/80 dark:hover:bg-gray-800/50'
                      } ${!canNavigateTo(item.url) ? 'pointer-events-none' : ''}`} 
                      title={item.title}
                    >
                      <div className="relative">
                        <item.icon className={`h-5 w-5 transition-all duration-200 ${
                        pathname === item.url 
                          ? 'text-white' 
                          : 'text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'
                        }`} />
                        {typeof (item as any).alertCount === 'number' && (item as any).alertCount > 0 && (
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-600 border border-white dark:border-gray-900" />
                        )}
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="border-t border-gray-200/80 dark:border-gray-800/80 shrink-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
        <div className={`transition-all duration-300 ${isVisible ? "p-3" : "p-2"}`}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={navDisabled}
                className={`w-full ${isVisible ? 'justify-between' : 'justify-center'} flex items-center gap-3 px-2 py-2 hover:bg-gray-100/80 dark:hover:bg-gray-800/50 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none`}
              >
                <div className={isVisible ? "flex items-center gap-3" : "flex items-center"}>
                  <Avatar className="h-10 w-10 border-2 border-blue-500/80 dark:border-blue-400/80 shadow-sm shrink-0 transition-all duration-200">
                    {photoUrl ? (
                      <img src={photoUrl} alt={user.name} className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <AvatarFallback className="bg-linear-to-br from-blue-500 to-indigo-600 text-white text-sm font-bold">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  {isVisible && (
                    <div className="flex flex-col items-start transition-all duration-500 ease-in-out">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[120px]">{user.name}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-500 font-medium">{user.role}</span>
                    </div>
                  )}
                </div>
                {isVisible && <ChevronUp className="h-4 w-4 text-gray-500 dark:text-gray-400 transition-all duration-200" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" className="w-[300px]">
            <DropdownMenuItem className="flex flex-col items-start p-3">
              <span className="font-medium text-gray-900 dark:text-white">{user.name}</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">{user.email}</span>
              <span className="text-xs text-blue-600 dark:text-blue-400 mt-1">{user.role}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={navDisabled} onClick={() => router.push('/dashboard/account')} className="text-gray-700 dark:text-gray-300">
              <Settings className="h-4 w-4 mr-2" />
              {t('sidebar.account_settings')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={navDisabled} onClick={handleLogout} className="text-red-600 dark:text-red-400">
              <LogOut className="h-4 w-4 mr-2" />
              {t('sidebar.sign_out')}
            </DropdownMenuItem>
          </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
