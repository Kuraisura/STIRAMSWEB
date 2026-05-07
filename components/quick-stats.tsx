"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, Clock, AlertTriangle, TrendingUp, TrendingDown, Minus, CheckCircle, CalendarX } from "lucide-react"

interface DashboardStats {
  totalEmployees: number
  workNotStartedCount?: number
  activeEmployeesCount?: number
  presentToday: number
  lateToday: number
  onTimeToday: number
  absentToday: number
  departmentsCount?: number
  avgHoursPerDay?: number
}

export function QuickStats() {
  const [stats, setStats] = useState<DashboardStats>({
    totalEmployees: 0,
    presentToday: 0,
    lateToday: 0,
    onTimeToday: 0,
    absentToday: 0,
    departmentsCount: 0,
    avgHoursPerDay: 0,
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setIsLoading(true)
        console.log('Quick Stats: Fetching dashboard stats')
        const res = await fetch('/api/dashboard/stats', { cache: 'no-store' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error || 'Failed to fetch dashboard stats')
        }
        const data = await res.json().catch(() => ({}))
        const dashboardStats = {
          totalEmployees: Number(data?.totalEmployees) || 0,
          workNotStartedCount: Number(data?.workNotStartedCount) || 0,
          activeEmployeesCount: Number(data?.activeEmployeesCount) || 0,
          presentToday: Number(data?.presentToday) || 0,
          lateToday: Number(data?.lateToday) || 0,
          onTimeToday: Number(data?.onTimeToday) || 0,
          absentToday: Number(data?.absentToday) || 0,
          departmentsCount: Number(data?.departmentsCount) || 0,
          avgHoursPerDay: Number(data?.avgHoursPerDay) || 0,
          undertimeToday: Number(data?.undertimeToday) || 0,
        }
        console.log('Quick Stats: Received dashboard stats', { stats: dashboardStats })
        setStats(dashboardStats)
      } catch (error) {
        console.error("Quick Stats: Error fetching dashboard stats:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStats()
    console.log('Quick Stats: Setting up periodic refresh (60s interval)')
    const interval = setInterval(fetchStats, 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const statsData = [
    {
      title: "Total Employees",
      value: stats.totalEmployees.toString(),
      icon: Users,
      color: "blue",
      description: "Registered employees",
    },
    {
      title: "Departments",
      value: String(stats.departmentsCount || 0),
      icon: Users,
      color: "blue",
      description: "Unique departments",
    },
    {
      title: "On-Time Arrivals",
      value: stats.onTimeToday.toString(),
      icon: CheckCircle,
      color: "green",
      description: "On-time arrivals today",
    },
    {
      title: "Late Arrivals",
      value: stats.lateToday.toString(),
      icon: Clock,
      color: "orange",
      description: "Late arrivals today",
    },
    {
      title: "Undertime",
      value: (stats as any).undertimeToday?.toString() || "0",
      icon: TrendingDown,
      color: "purple",
      description: "Undertime today",
    },
    {
      title: "Absent Today",
      value: stats.absentToday.toString(),
      icon: AlertTriangle,
      color: "red",
      description: "Absent today",
    },
    {
      title: "Work Has Not Started Yet",
      value: (stats.workNotStartedCount || 0).toString(),
      icon: CalendarX,
      color: "amber",
      description: "Scheduled to start",
    },
  ]

  const getChangeIcon = (type: "increase" | "decrease" | "neutral") => {
    switch (type) {
      case "increase":
        return <TrendingUp className="h-3 w-3" />
      case "decrease":
        return <TrendingDown className="h-3 w-3" />
      default:
        return <Minus className="h-3 w-3" />
    }
  }

  const getChangeColor = (type: "increase" | "decrease" | "neutral", context: string) => {
    if (type === "neutral") return "text-gray-600 dark:text-gray-400"

    // For late arrivals and absences, decrease is good (green), increase is bad (red)
    if (context === "Late Arrivals" || context === "Absent Today") {
      return type === "decrease" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
    }

    // For total employees and present today, increase is good (green)
    return type === "increase" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
  }

  const getIconColor = (color: string) => {
    const colors = {
      blue: "text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400",
      green: "text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400",
      orange: "text-orange-600 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400",
      red: "text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400",
      purple: "text-purple-600 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400",
      amber: "text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400",
    }
    return colors[color as keyof typeof colors] || colors.blue
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-6">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Card key={i} className="min-h-[150px] hover:shadow-md transition-shadow duration-200">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="h-3 sm:h-4 bg-gray-200 rounded mb-2 animate-pulse"></div>
                  <div className="h-6 sm:h-8 bg-gray-200 rounded mb-2 animate-pulse"></div>
                  <div className="h-3 sm:h-4 bg-gray-200 rounded w-2/3 animate-pulse"></div>
                </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-200 rounded-lg animate-pulse"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-6">
      {statsData.map((stat) => {
        const Icon = stat.icon
        return (
          <Card key={stat.title} className="group relative min-h-[150px] overflow-hidden bg-linear-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div className="absolute inset-0 bg-linear-to-r from-blue-500/0 to-purple-500/0 group-hover:from-blue-500/5 group-hover:to-purple-500/5 transition-all duration-300"></div>
            <CardContent className="p-4 sm:p-6 relative">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 leading-tight line-clamp-2 min-h-[2.1rem]">{stat.title}</p>
                  <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 sm:mb-2 group-hover:scale-105 transition-transform duration-200">{stat.value}</p>
                  <span className="text-[10px] sm:text-xs text-gray-700 dark:text-gray-300 font-medium leading-tight line-clamp-2">{stat.description}</span>
                </div>
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center ${getIconColor(stat.color)} shadow-md group-hover:scale-110 group-hover:shadow-lg transition-all duration-300 shrink-0`}>
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7" />
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
