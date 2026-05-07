"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Clock, UserCheck, UserX, AlertTriangle, CheckCircle, XCircle } from "lucide-react"
import { format } from "date-fns"

interface Activity {
  id: number
  type: string
  employee: string
  department: string
  time: Date
  status: string
  details: string
}

export function RecentActivity() {
  const [recentActivities, setRecentActivities] = useState<Activity[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchRecentActivity = async () => {
      try {
        console.log("[RecentActivity] Fetching recent activity")
        setIsLoading(true)
        const res = await fetch('/api/dashboard/recent-activity?limit=10', { cache: 'no-store' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error || 'Failed to fetch recent activity')
        }
        const body = await res.json().catch(() => ({ items: [] }))
        const data = Array.isArray(body?.items)
          ? body.items.map((item: any) => ({
              ...item,
              time: new Date(item.time),
            }))
          : []
        console.log("[RecentActivity] Activity loaded:", data.length)
        setRecentActivities(data)
      } catch (error) {
        console.error("[RecentActivity] Error fetching recent activity:", error)
        setRecentActivities([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchRecentActivity()
    const interval = setInterval(fetchRecentActivity, 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const getActivityIcon = (type: string, status: string) => {
    switch (type) {
      case "check_in":
        return status === "late" ? (
          <Clock className="h-4 w-4 text-orange-600" />
        ) : (
          <UserCheck className="h-4 w-4 text-green-600" />
        )
      case "check_out":
        return <UserX className="h-4 w-4 text-blue-600" />
      case "absence":
        return <AlertTriangle className="h-4 w-4 text-red-600" />
      default:
        return <Clock className="h-4 w-4 text-gray-600" />
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      on_time: { className: "bg-green-100 text-green-800", icon: CheckCircle },
      late: { className: "bg-orange-100 text-orange-800", icon: Clock },
      early: { className: "bg-blue-100 text-blue-800", icon: CheckCircle },
      absent: { className: "bg-red-100 text-red-800", icon: XCircle },
    }
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.on_time
    const Icon = config.icon
    return (
      <Badge className={config.className}>
        <Icon className="h-3 w-3 mr-1" />
        {status.replace("_", " ").toUpperCase()}
      </Badge>
    )
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            Recent Activity
          </CardTitle>
          <CardDescription>Latest attendance events and system activities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-gray-50">
                <div className="w-4 h-4 bg-gray-200 rounded animate-pulse"></div>
                <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2 animate-pulse"></div>
                </div>
                <div className="w-16 h-4 bg-gray-200 rounded animate-pulse"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-600" />
          Recent Activity
        </CardTitle>
        <CardDescription>Latest attendance events and system activities</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recentActivities.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
              <p className="dark:text-gray-200">No recent activity</p>
              <p className="text-sm dark:text-gray-400">Attendance logs will appear here once employees start checking in</p>
            </div>
          ) : (
            recentActivities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="shrink-0">{getActivityIcon(activity.type, activity.status)}</div>
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-sm font-semibold">
                    {getInitials(activity.employee)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{activity.employee}</p>
                    {getStatusBadge(activity.status)}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{activity.department}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-300">{activity.details}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-gray-500 dark:text-gray-300">{format(activity.time, "h:mm a")}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-400">{format(activity.time, "MMM d")}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
