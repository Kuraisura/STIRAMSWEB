"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { Building2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface DepartmentData {
  department: string
  present: number
  late: number
  total: number
  attendance_rate: number
  late_rate: number
}

const COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#f97316',
  '#6366f1',
]

export function DepartmentChart() {
  const [departmentData, setDepartmentData] = useState<DepartmentData[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchDepartmentData = async () => {
      try {
        console.log('[DepartmentChart] Fetching department attendance data...')
        setIsLoading(true)
        const res = await fetch('/api/dashboard/department-attendance', { cache: 'no-store' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error || 'Failed to fetch department attendance data')
        }
        const body = await res.json().catch(() => ({ items: [] }))
        const data = Array.isArray(body?.items) ? body.items : []
        console.log('[DepartmentChart] Department data received:', data)
        setDepartmentData(data)
      } catch (error) {
        console.error('[DepartmentChart] Error fetching department data:', error)
        setDepartmentData([])
      } finally {
        setIsLoading(false)
      }
    }
    fetchDepartmentData()
  }, [])

  if (isLoading) {
    return (
      <Card className="bg-white">
        <CardHeader className="relative bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl text-gray-900">Department Attendance</CardTitle>
              <CardDescription>Attendance rates by department for today</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative bg-white">
          <div className="h-[350px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!departmentData.length) {
    return (
      <Card className="bg-white">
        <CardHeader className="relative bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl text-gray-900">Department Attendance</CardTitle>
              <CardDescription>Attendance rates by department for today</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative pt-0 bg-white">
          <div className="flex items-center justify-center h-[350px]">
            <div className="text-center">
              <Users className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">No data shown</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">There is no attendance data available for departments today</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-white">
      <CardHeader className="relative bg-white">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-500">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <CardTitle className="text-xl text-gray-900">Department Attendance</CardTitle>
            <CardDescription>Attendance rates by department for today</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative pt-0 bg-white">
        <ResponsiveContainer width="100%" height={360}>
          <PieChart>
            <Pie
              data={departmentData}
              dataKey="present"
              nameKey="department"
              cx="50%"
              cy="50%"
              outerRadius={120}
              innerRadius={70}
              label={({ department, percent }) => `${department} (${(percent*100).toFixed(0)}%)`}
              isAnimationActive
            >
              {departmentData.map((entry, idx) => (
                <Cell key={entry.department} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null
                const data = payload[0].payload
                return (
                  <div className="rounded-xl shadow-xl border bg-white p-4 min-w-[160px]">
                    <div className="font-semibold text-base mb-1 text-purple-900">{data.department}</div>
                    <div className="flex justify-between text-sm pt-2">
                      <span className="text-gray-700 font-medium">Attendance Rate:</span>
                      <span className="font-bold text-purple-700">{data.attendance_rate?.toFixed(1) || 0}%</span>
                    </div>
                    <div className="flex justify-between text-xs pt-1">
                      <span className="text-gray-500">Present:</span>
                      <span className="font-semibold">{data.present} / {data.total}</span>
                    </div>
                  </div>
                )
              }}
            />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              iconType="circle"
              wrapperStyle={{ right: 0, top: 40, fontSize: '14px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
