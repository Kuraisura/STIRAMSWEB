"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Shield, Search, Plus, Edit, Trash2, UserCheck, UserX, Key, Clock, Activity, Users } from "lucide-react"
import { format } from "date-fns"
import { useToast } from "@/hooks/use-toast"
import { useLanguage } from "@/lib/language-context"

const sampleAdminUsers = [
  {
    id: 1,
    email: "madelyn.navallo@santarosa.sti.edu",
    full_name: "Madelyn B. Navello",
    role: "super_admin",
    is_active: true,
    created_at: "2025-01-01T00:00:00Z",
    last_login: "2025-01-08T08:30:00Z",
    login_count: 45,
    permissions: ["all"],
  },
  {
    id: 2,
    email: "ariel.paglinawan@santarosa.sti.edu",
    full_name: "Ariel Paglinawan",
    role: "admin",
    is_active: true,
    created_at: "2025-01-01T00:00:00Z",
    last_login: "2025-01-08T07:45:00Z",
    login_count: 32,
    permissions: ["employees", "attendance", "reports", "verification"],
  },
  {
    id: 3,
    email: "rostelito.lazaga@santarosa.sti.edu",
    full_name: "Rostelito N. Lazaga",
    role: "admin",
    is_active: true,
    created_at: "2025-01-01T00:00:00Z",
    last_login: "2025-01-07T16:20:00Z",
    login_count: 28,
    permissions: ["employees", "attendance", "reports", "verification"],
  },
]

const userRoles = ["super_admin", "admin", "viewer"]
const permissionsList = [
  "employees",
  "attendance",
  "reports",
  "verification",
  "audit",
  "notifications",
  "settings",
  "users",
]

export default function UserManagementPage() {
  const { t } = useLanguage()
  console.log('Users: Page loaded')
  const [adminUsers, setAdminUsers] = useState([] as any[])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const { toast } = useToast()

  const filteredUsers: any[] = []

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const getRoleBadge = (role: string) => {
    const roleConfig = {
      super_admin: { className: "bg-red-100 text-red-800", label: t('users.super_admin') },
      admin: { className: "bg-blue-100 text-blue-800", label: t('users.admin') },
      viewer: { className: "bg-gray-100 text-gray-800", label: t('users.viewer') },
    }
    const config = roleConfig[role as keyof typeof roleConfig] || roleConfig.viewer
    return <Badge className={config.className}>{config.label}</Badge>
  }

  const getStatusBadge = (isActive: boolean) => {
    return (
      <Badge className={isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
        {isActive ? (
          <>
            <UserCheck className="h-3 w-3 mr-1" />
            {t('users.active')}
          </>
        ) : (
          <>
            <UserX className="h-3 w-3 mr-1" />
            {t('users.inactive')}
          </>
        )}
      </Badge>
    )
  }

  const handleSaveUser = () => {
    if (isEditMode && selectedUser) {
      setAdminUsers((prev) => prev.map((user) => (user.id === selectedUser.id ? selectedUser : user)))
      toast({
        title: "User Updated",
        description: "User account has been updated successfully.",
      })
    } else {
      const newUser = {
        ...selectedUser,
        id: Math.max(...adminUsers.map((u) => u.id)) + 1,
        created_at: new Date().toISOString(),
        login_count: 0,
      }
      setAdminUsers((prev) => [...prev, newUser])
      toast({
        title: "User Created",
        description: "New user account has been created successfully.",
      })
    }
    setSelectedUser(null)
    setIsEditMode(false)
  }

  const handleDeleteUser = (userId: number) => {
    if (userId === 1) {
      toast({
        title: "Cannot Delete",
        description: "Super admin account cannot be deleted.",
        variant: "destructive",
      })
      return
    }

    setAdminUsers((prev) => prev.filter((user) => user.id !== userId))
    toast({
      title: "User Deleted",
      description: "User account has been deleted successfully.",
    })
  }

  const handleToggleStatus = (userId: number) => {
    if (userId === 1) {
      toast({
        title: "Cannot Deactivate",
        description: "Super admin account cannot be deactivated.",
        variant: "destructive",
      })
      return
    }

    setAdminUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, is_active: !user.is_active } : user)))
    toast({
      title: "Status Updated",
      description: "User status has been updated successfully.",
    })
  }

  const activeUsersCount = adminUsers.filter((user) => user.is_active).length
  const totalLogins = adminUsers.reduce((sum, user) => sum + user.login_count, 0)

  return (
    <div className="space-y-6 animate-fadeInUp">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('users.title')}</h1>
      </div>

      <Card>
        <CardContent className="p-6 text-sm text-gray-600 dark:text-gray-300">{t('users.disabled_notice')}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            {t('users.search_users')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder={t('users.search_placeholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>


    </div>
  )
}
