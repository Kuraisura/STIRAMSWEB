"use client"

import { useState, useEffect } from "react"
import { DepartmentPerformanceDialog } from "@/components/department-performance-dialog"
import { QuickStats } from "@/components/quick-stats"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, TrendingUp, Users, FileText } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { AdsCarousel } from "@/components/ads-carousel"
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { format, subDays } from "date-fns"
import { getStaffTypeFilter } from "@/lib/offline-dashboard-client"

// Custom Tooltip Component with Dark Mode Support
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center gap-2 text-xs">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-700 dark:text-gray-300">
              {entry.name}: <span className="font-semibold text-gray-900 dark:text-gray-100">{entry.value}</span>
            </span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

export default function DashboardPage() {
  const { t } = useLanguage()
  const [dashboardStats, setDashboardStats] = useState({
    totalEmployees: 0,
    workNotStartedCount: 0,
    activeEmployeesCount: 0,
    presentToday: 0,
    lateToday: 0,
    absentToday: 0,
    undertimeToday: 0,
    pendingRequests: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [employees, setEmployees] = useState<any[]>([])
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([])
  const [weeklyTrend, setWeeklyTrend] = useState<Array<{ date: string; present: number; late: number; undertime?: number; absent: number }>>([])
  const [deptPerf, setDeptPerf] = useState<Array<{ department: string; attendance_rate: number; late_rate: number; work_not_started_rate?: number; present: number; late: number; work_not_started_count?: number; total: number }>>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [isDeptDialogOpen, setIsDeptDialogOpen] = useState(false)

  // Get staff type filter based on current user
  const getStaffFilter = () => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('rams_user')
      const user = userStr ? JSON.parse(userStr) : null
      return getStaffTypeFilter(user?.email, user?.role)
    }
    return null
  }

  const getDepartmentAcronym = (deptName: string): string => {
    if (!deptName) return 'Unknown'
    const dept = departments.find((d: any) => d.name === deptName)
    return dept?.acronym || deptName
  }

  const getDepartmentSummary = () => {
    const today = new Date().toISOString().split('T')[0]
    const uniqueDepartmentNames = [...new Set(employees.map((emp) => emp.department))]
    return uniqueDepartmentNames.map((dept) => {
      const deptEmployees = employees.filter((emp) => emp.department === dept)
      const deptLogs = attendanceLogs.filter(
        (log) => log.date === today && deptEmployees.some((emp) => emp.employee_id === log.employee_id)
      )

      const presentCount = deptLogs.filter((log) => log.attendance_status === "present").length
      const lateCount = deptLogs.filter((log) => log.is_late).length
      
      const workNotStartedCount = deptEmployees.filter((emp: any) => {
        const startDate = (emp as any).start_date || emp.hire_date
        if (!startDate) return false
        const startDateObj = new Date(startDate + 'T00:00:00')
        const todayObj = new Date(today + 'T00:00:00')
        return startDateObj > todayObj
      }).length
      
      const totalEmployees = deptEmployees.length
      const totalLogs = deptLogs.length || 1

      return {
        department: getDepartmentAcronym(dept),
        department_full: dept,
        total_employees: totalEmployees,
        attendance_rate: Math.round((presentCount / totalLogs) * 100),
        late_rate: Math.round((lateCount / totalLogs) * 100),
        work_not_started_rate: totalEmployees > 0 ? Math.round((workNotStartedCount / totalEmployees) * 100) : 0,
        present_count: presentCount,
        late_count: lateCount,
        work_not_started_count: workNotStartedCount,
      }
    })
  }

  const getDailyAttendanceData = () => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), i)
      const dateStr = format(date, "yyyy-MM-dd")
      const dateObj = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      const dayLogs = attendanceLogs.filter((log) => log.date === dateStr)
      
      const employeesWhoseWorkStarted = employees.filter((emp: any) => {
        const startDate = (emp as any).start_date || emp.hire_date
        if (!startDate) return true
        const startDateObj = new Date(startDate + 'T00:00:00')
        return dateObj >= startDateObj
      })
      
      const workNotStartedCount = employees.length - employeesWhoseWorkStarted.length
      
      const presentCount = dayLogs.filter((log) => log.attendance_status === "present" || log.log_type === 'IN').length
      
      // No absent tracking - removed automated absent logic

      return {
        date: format(date, "MMM dd"),
        present: presentCount,
        late: dayLogs.filter((log) => log.is_late).length,
        undertime: dayLogs.filter((log) => (log as any).is_early_out).length,
        absent: 0, // Always 0 - no absent automation
        work_not_started: workNotStartedCount,
      }
    }).reverse()

    return last7Days
  }

  const getAttendanceLogsFromApi = async (staffTypeFilter?: 'Teaching' | 'Non-Teaching' | null) => {
    const today = new Date()
    const weekStart = subDays(today, 6)
    const params = new URLSearchParams({
      dateFrom: format(weekStart, 'yyyy-MM-dd'),
      dateTo: format(today, 'yyyy-MM-dd'),
      limit: '50000',
    })

    if (staffTypeFilter) {
      params.set('staffType', staffTypeFilter)
    }

    const res = await fetch(`/api/attendance/logs?${params.toString()}`, { cache: 'no-store' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error || 'Failed to load attendance logs from local API')
    }

    return await res.json()
  }

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        console.log("[Dashboard] Fetching dashboard data")
        setIsLoading(true)
        
        const userStr = localStorage.getItem('rams_user')
        const currentUser = userStr ? JSON.parse(userStr) : null
        
        const staffTypeFilter = getStaffFilter()
        const [statsRes, employeeRes, logsData, deptRes] = await Promise.all([
          fetch(`/api/dashboard/stats${staffTypeFilter ? `?staffType=${staffTypeFilter}` : ''}`, { cache: 'no-store' }),
          fetch(`/api/employees${staffTypeFilter ? `?staffTypeFilter=${staffTypeFilter}` : ''}`, { cache: 'no-store' }),
          getAttendanceLogsFromApi(staffTypeFilter),
          fetch(`/api/departments${staffTypeFilter ? `?category=${staffTypeFilter}` : ''}`, { cache: 'no-store' }),
        ])

        if (!statsRes.ok) {
          const body = await statsRes.json().catch(() => ({}))
          throw new Error(body?.error || 'Failed to load dashboard stats')
        }
        if (!employeeRes.ok) {
          const body = await employeeRes.json().catch(() => ({}))
          throw new Error(body?.error || 'Failed to load employees')
        }
        if (!deptRes.ok) {
          const body = await deptRes.json().catch(() => ({}))
          throw new Error(body?.error || 'Failed to load departments')
        }

        const stats = await statsRes.json().catch(() => ({}))
        const employeeData = await employeeRes.json().catch(() => ([]))
        const deptBody = await deptRes.json().catch(() => ({ data: [] }))
        const deptList = Array.isArray(deptBody?.data) ? deptBody.data : []
        console.log("[Dashboard] Dashboard stats received:", stats)

        setDashboardStats({
          totalEmployees: Number(stats?.totalEmployees) || 0,
          workNotStartedCount: Number((stats as any)?.workNotStartedCount) || 0,
          activeEmployeesCount: Number((stats as any)?.activeEmployeesCount) || 0,
          presentToday: Number(stats?.presentToday) || 0,
          lateToday: Number(stats?.lateToday) || 0,
          absentToday: Number(stats?.absentToday) || 0,
          undertimeToday: Number((stats as any)?.undertimeToday) || 0,
          pendingRequests: Number((stats as any)?.pendingRequests) || 0,
        })

        setEmployees(employeeData || [])
        setAttendanceLogs(logsData || [])
        setWeeklyTrend([])
        setDeptPerf([])
        setDepartments(deptList || [])
      } catch (error) {
        console.error("[Dashboard] Error fetching dashboard data:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchDashboardData()
  }, [])

  const departmentSummaryRaw = (deptPerf && deptPerf.length > 0) ? deptPerf : getDepartmentSummary()
  const departmentSummary = departmentSummaryRaw.map((dept: any) => {
    const deptName = dept.department_full || dept.department || 'Unknown'
    return {
      ...dept,
      department: getDepartmentAcronym(deptName)
    }
  })
  const dailyAttendanceData = (weeklyTrend && weeklyTrend.length > 0)
    ? weeklyTrend
    : getDailyAttendanceData()

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6 px-4 sm:px-6 py-4 sm:py-6 animate-fadeInUp">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6 px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-6 animate-fadeInUp">
      {/* Welcome Section - Mobile Responsive */}
      <div className="space-y-2 sm:space-y-3">
        <h2 className="text-base sm:text-lg md:text-xl font-semibold text-gray-900 dark:text-gray-100">{t('dashboard.welcome')}</h2>
        <AdsCarousel 
          items={[
            { src: "/CArousel ADS Dashboard/06KGJrl.png", alt: "STI RAMS - RFID Attendance Monitoring System" },
            { src: "/CArousel ADS Dashboard/kgYADNW.png", alt: "STI College Santa Rosa" },
            { src: "/CArousel ADS Dashboard/URaWOAg.png", alt: "STI RAMS - Real-time Monitoring System" },
          ]}
        />
      </div>

      {/* Overview Header - Mobile Responsive */}
      <div className="flex flex-col gap-2 sm:gap-3 md:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">{t('dashboard.overview')}</h1>
          <p className="text-xs sm:text-sm md:text-base text-gray-600 dark:text-gray-300 mt-1 sm:mt-2">{t('dashboard.subtitle')}</p>
        </div>
      </div>

      {/* Quick Stats Component */}
      <QuickStats />

      {/* MOBILE LAYOUT - Stacked Full Width Cards */}
      <div className="block lg:hidden space-y-3 sm:space-y-4">
        {/* Today's Attendance Card - Mobile First */}
        <Card className="group relative overflow-hidden bg-linear-to-br from-white to-blue-50/50 dark:from-gray-800 dark:to-blue-950/20 border-gray-200 dark:border-gray-700 shadow-md hover:shadow-lg transition-all duration-300">
          <div className="absolute inset-0 bg-linear-to-br from-blue-500/0 to-transparent group-hover:from-blue-500/5 group-hover:to-purple-500/5 transition-all duration-500"></div>
          <CardHeader className="pb-2 relative p-3 sm:p-4">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2 text-gray-900 dark:text-white">
              <div className="p-1.5 sm:p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 shadow-sm">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
              </div>
              {t('dashboard.todays_attendance')}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">{t('dashboard.real_time_status')}</CardDescription>
          </CardHeader>
          <CardContent className="relative p-3 sm:p-4 pt-0">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="flex flex-col items-center justify-center p-2 sm:p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <Badge className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 shadow-sm text-base sm:text-lg px-3 sm:px-4 py-1.5 sm:py-2 mb-1">{dashboardStats.presentToday}</Badge>
                <span className="text-xs sm:text-sm font-medium text-green-700 dark:text-green-300">{t('dashboard.present')}</span>
              </div>
              <div className="flex flex-col items-center justify-center p-2 sm:p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                <Badge className="bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400 shadow-sm text-base sm:text-lg px-3 sm:px-4 py-1.5 sm:py-2 mb-1">{dashboardStats.lateToday}</Badge>
                <span className="text-xs sm:text-sm font-medium text-orange-700 dark:text-orange-300">{t('dashboard.late')}</span>
              </div>
              <div className="flex flex-col items-center justify-center p-2 sm:p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <Badge className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 shadow-sm text-base sm:text-lg px-3 sm:px-4 py-1.5 sm:py-2 mb-1">{dashboardStats.undertimeToday}</Badge>
                <span className="text-xs sm:text-sm font-medium text-amber-700 dark:text-amber-300">Undertime</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Daily Attendance Trend - Mobile */}
        <Card className="group relative overflow-hidden bg-linear-to-br from-white to-emerald-50/30 dark:from-slate-900 dark:to-emerald-950/20 border-gray-200 dark:border-slate-700 shadow-md hover:shadow-lg transition-all duration-300">
          <div className="absolute inset-0 bg-linear-to-br from-emerald-500/0 via-transparent to-blue-500/0 group-hover:from-emerald-500/5 group-hover:to-blue-500/5 transition-all duration-500 pointer-events-none"></div>
          <CardHeader className="relative px-3 sm:px-4 pt-3 sm:pt-4 pb-2 sm:pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base text-gray-900 dark:text-white">
                  <div className="p-1.5 rounded-lg bg-linear-to-br from-emerald-500 to-teal-500 shadow-lg">
                    <TrendingUp className="h-4 w-4 text-white" />
                  </div>
                  Daily Attendance Trend
                </CardTitle>
                <CardDescription className="mt-1 text-xs text-gray-600 dark:text-slate-300">Last 7 days attendance overview</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="relative px-2 sm:px-3 pb-2 sm:pb-3">
            <div className="w-full h-[200px] sm:h-[250px] overflow-x-auto touch-pan-x rounded-xl border border-emerald-100/80 dark:border-slate-700 bg-white/70 dark:bg-slate-900/65">
              {dailyAttendanceData.length === 0 || dailyAttendanceData.every(d => d.present === 0 && d.late === 0 && d.undertime === 0) ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <FileText className="h-10 w-10 text-gray-400 dark:text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">No data shown</p>
                    <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">No attendance data available</p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={280}>
                  <AreaChart data={dailyAttendanceData} margin={{ top: 5, right: 5, left: -15, bottom: 40 }}>
                  <defs>
                    <linearGradient id="mobilePresent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="mobileLate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="mobileUndertime" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.05} />
                    </linearGradient>
                    
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.3} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#6B7280" 
                    fontSize={9}
                    tickLine={false}
                    axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }}
                    angle={-45}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis 
                    stroke="#6B7280" 
                    fontSize={9}
                    tickLine={false}
                    axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }}
                    width={30}
                  />
                  <Tooltip 
                    content={<CustomTooltip />}
                    cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
                  />
                  <Legend 
                    wrapperStyle={{ paddingTop: '10px', fontSize: '10px' }}
                    iconType="circle"
                    iconSize={8}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="present" 
                    stroke="#10B981" 
                    strokeWidth={2}
                    fill="url(#mobilePresent)"
                    animationDuration={1500}
                    dot={{ fill: '#10B981', strokeWidth: 1.5, r: 3 }}
                    activeDot={{ r: 5, fill: '#10B981', stroke: '#fff', strokeWidth: 1.5 }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="late" 
                    stroke="#F59E0B" 
                    strokeWidth={2}
                    fill="url(#mobileLate)"
                    animationDuration={1500}
                    dot={{ fill: '#F59E0B', strokeWidth: 1.5, r: 3 }}
                    activeDot={{ r: 5, fill: '#F59E0B', stroke: '#fff', strokeWidth: 1.5 }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="undertime" 
                    stroke="#8B5CF6" 
                    strokeWidth={1.5}
                    fill="url(#mobileUndertime)"
                    animationDuration={1500}
                    dot={{ fill: '#8B5CF6', strokeWidth: 1.5, r: 2.5 }}
                    activeDot={{ r: 4, fill: '#8B5CF6', stroke: '#fff', strokeWidth: 1.5 }}
                  />
                  
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Department Performance - Mobile */}
      <Card 
        className="group cursor-pointer relative overflow-hidden bg-linear-to-br from-white to-sky-50/35 dark:from-slate-900 dark:to-blue-950/25 border-gray-200 dark:border-slate-700 shadow-md hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-300"
        onClick={() => setIsDeptDialogOpen(true)}
      >
          <div className="absolute inset-0 bg-linear-to-br from-blue-500/0 via-transparent to-purple-500/0 group-hover:from-blue-500/5 group-hover:to-purple-500/5 transition-all duration-500 pointer-events-none"></div>
          <CardHeader className="relative px-3 sm:px-4 pt-3 sm:pt-4 pb-2 sm:pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base text-gray-900 dark:text-white">
                  <div className="p-1.5 rounded-lg bg-linear-to-br from-blue-500 to-indigo-500 shadow-lg">
                    <Users className="h-4 w-4 text-white" />
                  </div>
                  Department Performance
                </CardTitle>
                  <CardDescription className="mt-1 text-xs text-gray-600 dark:text-slate-300">Click to view full overview</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="relative px-2 sm:px-3 pb-2 sm:pb-3">
            <div className="w-full h-[200px] sm:h-[250px] overflow-x-auto touch-pan-x rounded-xl border border-blue-100/80 dark:border-slate-700 bg-white/70 dark:bg-slate-900/65">
              {departmentSummary.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Users className="h-10 w-10 text-gray-400 dark:text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">No data shown</p>
                    <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">No department data available</p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={Math.max(280, departmentSummary.length * 70)}>
                  <BarChart data={departmentSummary} margin={{ top: 5, right: 5, left: -15, bottom: 50 }}>
                  <defs>
                    <linearGradient id="mobileColorAttendance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10B981" stopOpacity={1} />
                      <stop offset="100%" stopColor="#34D399" stopOpacity={0.8} />
                    </linearGradient>
                    <linearGradient id="mobileColorLate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F59E0B" stopOpacity={1} />
                      <stop offset="100%" stopColor="#FBBF24" stopOpacity={0.8} />
                    </linearGradient>
                    <linearGradient id="mobileColorWorkNotStarted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F97316" stopOpacity={1} />
                      <stop offset="100%" stopColor="#FB923C" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.3} />
                  <XAxis 
                    dataKey="department" 
                    stroke="#6B7280"
                    fontSize={9}
                    tickLine={false}
                    axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    interval={0}
                  />
                  <YAxis 
                    stroke="#6B7280"
                    fontSize={9}
                    tickLine={false}
                    axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }}
                    width={30}
                  />
                  <Tooltip 
                    content={<CustomTooltip />}
                    cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
                  />
                  <Legend 
                    wrapperStyle={{ paddingTop: '10px', fontSize: '10px' }}
                    iconType="circle"
                    iconSize={8}
                  />
                  <Bar 
                    dataKey="attendance_rate" 
                    fill="url(#mobileColorAttendance)" 
                    name="Attendance %" 
                    radius={[6, 6, 0, 0]}
                    animationDuration={1500}
                  />
                  <Bar 
                    dataKey="late_rate" 
                    fill="url(#mobileColorLate)" 
                    name="Late %" 
                    radius={[6, 6, 0, 0]}
                    animationDuration={1500}
                  />
                  <Bar 
                    dataKey="work_not_started_rate" 
                    fill="url(#mobileColorWorkNotStarted)" 
                    name="Work Has Not Started Yet %" 
                    radius={[6, 6, 0, 0]}
                    animationDuration={1500}
                  />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DESKTOP LAYOUT - 3 Column Grid */}
      <div className="hidden lg:grid lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Daily Attendance Trend - Desktop */}
        <Card className="group relative overflow-hidden bg-linear-to-br from-white to-emerald-50/30 dark:from-slate-900 dark:to-emerald-950/20 border-gray-200 dark:border-slate-700 shadow-sm hover:shadow-xl transition-all duration-300">
          <div className="absolute inset-0 bg-linear-to-br from-emerald-500/0 via-transparent to-blue-500/0 group-hover:from-emerald-500/5 group-hover:to-blue-500/5 transition-all duration-500 pointer-events-none"></div>
          <CardHeader className="relative px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg text-gray-900 dark:text-white flex-wrap">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-linear-to-br from-emerald-500 to-teal-500 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                  </div>
                  Daily Attendance Trend
                </CardTitle>
                <CardDescription className="mt-1 text-xs sm:text-sm text-gray-600 dark:text-slate-300">Last 7 days attendance overview</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="relative px-2 sm:px-4 md:px-6 pb-2 sm:pb-4 md:pb-6">
            <div className="w-full h-[340px] lg:h-[400px] rounded-xl border border-emerald-100/80 dark:border-slate-700 bg-white/70 dark:bg-slate-900/65 p-1">
              {dailyAttendanceData.length === 0 || dailyAttendanceData.every(d => d.present === 0 && d.late === 0 && d.undertime === 0) ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <FileText className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">No data shown</p>
                    <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">There is no attendance data available for the last 7 days</p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={300}>
                  <AreaChart data={dailyAttendanceData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                  <defs>
                    <linearGradient id="rptPresent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="rptLate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="rptUndertime" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.05} />
                    </linearGradient>
                    
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.5} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#6B7280" 
                    fontSize={10}
                    tickLine={false}
                    axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis 
                    stroke="#6B7280" 
                    fontSize={10}
                    tickLine={false}
                    axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }}
                    width={40}
                  />
                  <Tooltip 
                    content={<CustomTooltip />}
                    cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
                  />
                  <Legend 
                    wrapperStyle={{ paddingTop: '20px' }}
                    iconType="circle"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="present" 
                    stroke="#10B981" 
                    strokeWidth={3}
                    fill="url(#rptPresent)"
                    animationDuration={1500}
                    dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: '#10B981', stroke: '#fff', strokeWidth: 2 }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="late" 
                    stroke="#F59E0B" 
                    strokeWidth={3}
                    fill="url(#rptLate)"
                    animationDuration={1500}
                    dot={{ fill: '#F59E0B', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: '#F59E0B', stroke: '#fff', strokeWidth: 2 }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="undertime" 
                    stroke="#8B5CF6" 
                    strokeWidth={2}
                    fill="url(#rptUndertime)"
                    animationDuration={1500}
                    dot={{ fill: '#8B5CF6', strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 5, fill: '#8B5CF6', stroke: '#fff', strokeWidth: 2 }}
                  />
                  
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Department Performance - Desktop */}
      <Card 
        className="group cursor-pointer relative overflow-hidden bg-linear-to-br from-white to-sky-50/35 dark:from-slate-900 dark:to-blue-950/25 border-gray-200 dark:border-slate-700 shadow-sm hover:shadow-xl hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-300"
        onClick={() => setIsDeptDialogOpen(true)}
      >
          <div className="absolute inset-0 bg-linear-to-br from-blue-500/0 via-transparent to-purple-500/0 group-hover:from-blue-500/5 group-hover:to-purple-500/5 transition-all duration-500 pointer-events-none"></div>
          <CardHeader className="relative px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg text-gray-900 dark:text-white flex-wrap">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-linear-to-br from-blue-500 to-indigo-500 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <Users className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                  </div>
                  Department Performance
                </CardTitle>
                <CardDescription className="mt-1 text-xs sm:text-sm text-gray-600 dark:text-slate-300">Click to view full overview</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="relative px-2 sm:px-4 md:px-6 pb-2 sm:pb-4 md:pb-6">
            <div className="w-full h-[340px] lg:h-[400px] rounded-xl border border-blue-100/80 dark:border-slate-700 bg-white/70 dark:bg-slate-900/65 p-1">
              {departmentSummary.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Users className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">No data shown</p>
                    <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">There is no department performance data available</p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={Math.max(300, departmentSummary.length * 80)}>
                  <BarChart data={departmentSummary} margin={{ top: 10, right: 10, left: 0, bottom: 60 }}>
                  <defs>
                    <linearGradient id="colorAttendance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10B981" stopOpacity={1} />
                      <stop offset="100%" stopColor="#34D399" stopOpacity={0.8} />
                    </linearGradient>
                    <linearGradient id="colorLate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F59E0B" stopOpacity={1} />
                      <stop offset="100%" stopColor="#FBBF24" stopOpacity={0.8} />
                    </linearGradient>
                    <linearGradient id="colorWorkNotStarted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F97316" stopOpacity={1} />
                      <stop offset="100%" stopColor="#FB923C" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" opacity={0.5} />
                  <XAxis 
                    dataKey="department" 
                    stroke="#6B7280"
                    fontSize={10}
                    tickLine={false}
                    axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    interval={0}
                  />
                  <YAxis 
                    stroke="#6B7280"
                    fontSize={10}
                    tickLine={false}
                    axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }}
                    width={40}
                  />
                  <Tooltip 
                    content={<CustomTooltip />}
                    cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
                  />
                  <Legend 
                    wrapperStyle={{ paddingTop: '20px' }}
                    iconType="circle"
                  />
                  <Bar 
                    dataKey="attendance_rate" 
                    fill="url(#colorAttendance)" 
                    name="Attendance %" 
                    radius={[8, 8, 0, 0]}
                    animationDuration={1500}
                  />
                  <Bar 
                    dataKey="late_rate" 
                    fill="url(#colorLate)" 
                    name="Late %" 
                    radius={[8, 8, 0, 0]}
                    animationDuration={1500}
                  />
                  <Bar 
                    dataKey="work_not_started_rate" 
                    fill="url(#colorWorkNotStarted)" 
                    name="Work Has Not Started Yet %" 
                    radius={[8, 8, 0, 0]}
                    animationDuration={1500}
                  />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Today's Attendance Card - Desktop */}
        <Card className="group relative overflow-hidden bg-linear-to-br from-white to-blue-50/50 dark:from-gray-800 dark:to-blue-950/20 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <div className="absolute inset-0 bg-linear-to-br from-blue-500/0 to-transparent group-hover:from-blue-500/5 group-hover:to-purple-500/5 transition-all duration-500"></div>
          <CardHeader className="pb-2 sm:pb-3 relative p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2 text-gray-900 dark:text-white">
              <div className="p-1.5 sm:p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 shadow-sm group-hover:scale-110 transition-transform duration-300">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
              </div>
              {t('dashboard.todays_attendance')}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">{t('dashboard.real_time_status')}</CardDescription>
          </CardHeader>
          <CardContent className="relative p-4 sm:p-6 pt-0 sm:pt-0">
            <div className="space-y-2 sm:space-y-3">
              <div className="flex justify-between items-center p-2 sm:p-3 rounded-lg bg-white/50 dark:bg-gray-700/30 group-hover:bg-white dark:group-hover:bg-gray-700/50 transition-colors duration-200">
                <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 font-medium">{t('dashboard.present')}</span>
                <Badge className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 shadow-sm text-xs sm:text-sm px-2 sm:px-3 py-1">{dashboardStats.presentToday}</Badge>
              </div>
              <div className="flex justify-between items-center p-2 sm:p-3 rounded-lg bg-white/50 dark:bg-gray-700/30 group-hover:bg-white dark:group-hover:bg-gray-700/50 transition-colors duration-200">
                <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 font-medium">{t('dashboard.late')}</span>
                <Badge className="bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400 shadow-sm text-xs sm:text-sm px-2 sm:px-3 py-1">{dashboardStats.lateToday}</Badge>
              </div>
              
              <div className="flex justify-between items-center p-2 sm:p-3 rounded-lg bg-white/50 dark:bg-gray-700/30 group-hover:bg-white dark:group-hover:bg-gray-700/50 transition-colors duration-200">
                <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 font-medium">Undertime</span>
                <Badge className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 shadow-sm text-xs sm:text-sm px-2 sm:px-3 py-1">{dashboardStats.undertimeToday}</Badge>
              </div>
              <div className="flex justify-between items-center p-2 sm:p-3 rounded-lg bg-white/50 dark:bg-gray-700/30 group-hover:bg-white dark:group-hover:bg-gray-700/50 transition-colors duration-200">
                <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 font-medium">{t('dashboard.on_leave')}</span>
                <Badge className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 shadow-sm text-xs sm:text-sm px-2 sm:px-3 py-1">0</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <DepartmentPerformanceDialog 
        open={isDeptDialogOpen} 
        onOpenChange={setIsDeptDialogOpen} 
        data={departmentSummary}
      />
    </div>
  )
}

