"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Bell,
  Search,
  Filter,
  Send,
  Mail,
  CheckCircle,
  XCircle,
  Clock,
  Settings,
  Plus,
} from "lucide-react"
import { format } from "date-fns"
import { useToast } from "@/hooks/use-toast"

const sampleNotifications = [
  {
    notification_id: 1,
    recipient_type: "admin",
    recipient_id: 1,
    recipient_name: "Madelyn B. Navello",
    notification_type: "late_arrival",
    title: "Late Arrival Alert",
    message: "Josh Kirby B. Palacio was late today at 7:15 AM. Scheduled time: 7:00 AM.",
    is_read: false,
    sent_via: "email",
    provider: "smtp",
    delivery_status: "delivered",
    sent_at: "2025-01-08T07:20:00Z",
    created_at: "2025-01-08T07:15:00Z",
  },
  {
    notification_id: 2,
    recipient_type: "employee",
    recipient_id: 1,
    recipient_name: "Josh Kirby B. Palacio",
    notification_type: "attendance_summary",
    title: "Weekly Attendance Summary",
    message: "Your attendance summary for Jan 1-7: 5 days present, 1 day late, 0 days absent.",
    is_read: true,
    sent_via: "email",
    provider: "smtp",
    delivery_status: "delivered",
    sent_at: "2025-01-07T18:00:00Z",
    created_at: "2025-01-07T18:00:00Z",
  },
  {
    notification_id: 3,
    recipient_type: "admin",
    recipient_id: 2,
    recipient_name: "Ariel Paglinawan",
    notification_type: "absence_alert",
    title: "Employee Absence Alert",
    message: "Mark Crysler H. Baddo is marked absent today. No prior leave request found.",
    is_read: false,
    sent_via: "sms",
    provider: "semaphore",
    delivery_status: "delivered",
    sent_at: "2025-01-08T08:30:00Z",
    created_at: "2025-01-08T08:30:00Z",
  },
  {
    notification_id: 4,
    recipient_type: "employee",
    recipient_id: 3,
    recipient_name: "Rohan Raphael L. Balingao",
    notification_type: "overtime_notification",
    title: "Overtime Recorded",
    message: "Overtime recorded: 2 hours on January 7, 2025.",
    is_read: true,
    sent_via: "system",
    provider: null,
    delivery_status: "delivered",
    sent_at: "2025-01-07T19:00:00Z",
    created_at: "2025-01-07T19:00:00Z",
  },
]

const notificationTypes = [
  "All Types",
  "late_arrival",
  "absence_alert",
  "attendance_summary",
  "overtime_notification",
  "system_alert",
]

const deliveryMethods = ["All Methods", "email", "system"]
const deliveryStatuses = ["All Statuses", "pending", "delivered", "failed"]

export default function NotificationsPage() {
  const [notifications] = useState([] as any[])
  const [filteredNotifications] = useState([] as any[])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedType, setSelectedType] = useState("All Types")
  const [selectedMethod, setSelectedMethod] = useState("All Methods")
  const [selectedStatus, setSelectedStatus] = useState("All Statuses")

  useEffect(() => {
    console.log("[Notifications] Page loaded")
  }, [])

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const getTypeBadge = (type: string) => {
    const typeConfig = {
      late_arrival: { className: "bg-orange-100 text-orange-800" },
      absence_alert: { className: "bg-red-100 text-red-800" },
      attendance_summary: { className: "bg-blue-100 text-blue-800" },
      overtime_notification: { className: "bg-purple-100 text-purple-800" },
      system_alert: { className: "bg-gray-100 text-gray-800" },
    }
    const config = typeConfig[type as keyof typeof typeConfig] || typeConfig.system_alert
    return <Badge className={config.className}>{type.replace("_", " ").toUpperCase()}</Badge>
  }

  const getMethodIcon = (method: string) => {
    const iconConfig = {
      email: Mail,
      system: Bell,
    }
    const Icon = iconConfig[method as keyof typeof iconConfig] || Bell
    return <Icon className="h-4 w-4" />
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { className: "bg-yellow-100 text-yellow-800", icon: Clock },
      delivered: { className: "bg-green-100 text-green-800", icon: CheckCircle },
      failed: { className: "bg-red-100 text-red-800", icon: XCircle },
    }
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending
    const Icon = config.icon
    return (
      <Badge className={config.className}>
        <Icon className="h-3 w-3 mr-1" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    )
  }

  const handleMarkAsRead = (_id: number) => {}
  const handleResendNotification = (_id: number) => {}

  const unreadCount = notifications.filter((notif) => !notif.is_read).length
  const deliveredCount = notifications.filter((notif) => notif.delivery_status === "delivered").length
  const failedCount = notifications.filter((notif) => notif.delivery_status === "failed").length

  return (
    <div className="space-y-6 animate-fadeInUp">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Notifications</h1>
      </div>

      <Card>
        <CardContent className="p-6 text-sm text-gray-600 dark:text-gray-300">
          This Notifications area is currently disabled.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filter Notifications
          </CardTitle>
          <CardDescription>Search and filter notifications by recipient, type, method, or status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search by recipient, title, or message..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-full lg:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {notificationTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type === "All Types" ? type : type.replace("_", " ").toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedMethod} onValueChange={setSelectedMethod}>
              <SelectTrigger className="w-full lg:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {deliveryMethods.map((method) => (
                  <SelectItem key={method} value={method}>
                    {method === "All Methods" ? method : method.charAt(0).toUpperCase() + method.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-full lg:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {deliveryStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status === "All Statuses" ? status : status.charAt(0).toUpperCase() + status.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>


    </div>
  )
}
