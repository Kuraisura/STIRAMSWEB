"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Legend, Bar, BarChart, ComposedChart, Line } from "recharts"
import { TrendingUp, Calendar, FileText } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface AttendanceData {
  date: string
  present: number
  late: number
  undertime?: number
  absent: number
}

export function AttendanceChart() {
  const [attendanceData, setAttendanceData] = useState<AttendanceData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [chartType, setChartType] = useState<'area' | 'bar'>('area')

  useEffect(() => {
    const fetchAttendanceData = async () => {
      try {
        console.log("[AttendanceChart] Fetching weekly attendance data")
        setIsLoading(true)
        const res = await fetch('/api/dashboard/weekly-attendance', { cache: 'no-store' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error || 'Failed to fetch weekly attendance data')
        }
        const body = await res.json().catch(() => ({ items: [] }))
        const data = Array.isArray(body?.items) ? body.items : []
        console.log("[AttendanceChart] Attendance data loaded:", data.length)
        setAttendanceData(data)
      } catch (error) {
        console.error("[AttendanceChart] Error fetching attendance data:", error)
        setAttendanceData([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchAttendanceData()
  }, [])

  // Calculate totals for the week
  const totals = attendanceData.reduce((acc, day) => ({
    present: acc.present + (day?.present || 0),
    late: acc.late + (day?.late || 0),
    undertime: acc.undertime + (day?.undertime || 0),
    absent: acc.absent + (day?.absent || 0),
  }), { present: 0, late: 0, undertime: 0, absent: 0 })

  // Check if there's any data to display
  const hasData = attendanceData.length > 0 && (totals.present > 0 || totals.late > 0 || totals.undertime > 0 || totals.absent > 0)

  if (isLoading) {
    return (
      <Card className="bg-white">
        <CardHeader className="relative bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-500">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl text-gray-900">Weekly Attendance Trend</CardTitle>
                <CardDescription>Daily attendance patterns for the current week</CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative bg-white">
          <div className="h-[350px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-white">
      <CardHeader className="relative bg-white">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl text-gray-900">
                Weekly Attendance Trend
              </CardTitle>
              <CardDescription>Daily attendance patterns for the current week</CardDescription>
            </div>
          </div>
          
          {/* Week Summary Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-green-100 text-green-700 px-3 py-1">
              <span className="font-semibold">{totals.present}</span> On-Time
            </Badge>
            <Badge className="bg-orange-100 text-orange-700 px-3 py-1">
              <span className="font-semibold">{totals.late}</span> Late
            </Badge>
            <Badge className="bg-purple-100 text-purple-700 px-3 py-1">
              <span className="font-semibold">{totals.undertime}</span> Undertime
            </Badge>
            <Badge className="bg-red-100 text-red-700 px-3 py-1">
              <span className="font-semibold">{totals.absent}</span> Absent
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative pt-0 bg-white">
        {!hasData ? (
          <div className="flex items-center justify-center h-[350px]">
            <div className="text-center">
              <FileText className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">No data shown</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">There is no attendance data available for the current week</p>
            </div>
          </div>
        ) : (
          <ChartContainer
            config={{
              present: {
                label: "On-Time",
                color: "#10b981",
              },
              late: {
                label: "Late",
                color: "#f59e0b",
              },
              undertime: {
                label: "Undertime",
                color: "#8b5cf6",
              },
              absent: {
                label: "Absent",
                color: "#ef4444",
              },
            }}
            className="w-full h-[350px] bg-white"
          >
            <ComposedChart
              data={attendanceData}
              margin={{ top: 20, right: 20, bottom: 20, left: 0 }}
            >
            <defs>
              {/* Modern gradient definitions */}
              <linearGradient id="gradientPresent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="gradientLate" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="gradientUndertime" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="gradientAbsent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            
            {/* Modern grid with subtle styling */}
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="#e5e7eb" 
              strokeOpacity={0.3}
              vertical={false}
            />
            
            {/* Styled axes */}
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickLine={{ stroke: '#e5e7eb' }}
              axisLine={{ stroke: '#e5e7eb' }}
              tickMargin={8}
            />
            <YAxis 
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickLine={{ stroke: '#e5e7eb' }}
              axisLine={{ stroke: '#e5e7eb' }}
              allowDecimals={false}
              domain={[0, 'auto']}
              width={35}
              tickMargin={8}
            />
            
            {/* Modern tooltip */}
            <ChartTooltip 
              content={<ChartTooltipContent />}
              cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
            />
            
            {/* Legend with custom styling */}
            <Legend 
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="circle"
            />
            
            {/* Smooth area charts with modern gradients */}
            <Area 
              type="monotone" 
              dataKey="present" 
              stroke="#10b981"
              strokeWidth={3}
              fill="url(#gradientPresent)"
              animationDuration={1200}
              animationEasing="ease-in-out"
            />
            <Area 
              type="monotone" 
              dataKey="late" 
              stroke="#f59e0b"
              strokeWidth={3}
              fill="url(#gradientLate)"
              animationDuration={1300}
              animationEasing="ease-in-out"
            />
            <Area 
              type="monotone" 
              dataKey="undertime" 
              stroke="#8b5cf6"
              strokeWidth={3}
              fill="url(#gradientUndertime)"
              animationDuration={1400}
              animationEasing="ease-in-out"
            />
            <Area 
              type="monotone" 
              dataKey="absent" 
              stroke="#ef4444"
              strokeWidth={3}
              fill="url(#gradientAbsent)"
              animationDuration={1500}
              animationEasing="ease-in-out"
            />
          </ComposedChart>
        </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
