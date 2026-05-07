import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Users, CheckCircle2, AlertCircle, Clock } from 'lucide-react'

interface DepartmentData {
  department: string
  department_full: string
  total_employees: number
  attendance_rate: number
  late_rate: number
  work_not_started_rate: number
  present_count: number
  late_count: number
  work_not_started_count: number
}

interface DepartmentPerformanceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: DepartmentData[]
}

export function DepartmentPerformanceDialog({
  open,
  onOpenChange,
  data,
}: DepartmentPerformanceDialogProps) {
  const totalDepartments = data.length
  const totalStaff = data.reduce((sum, dept) => sum + (dept.total_employees || 0), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-[1400px] h-[92vh] sm:h-[88vh] overflow-hidden flex flex-col p-0 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800">
        <DialogHeader className="p-4 sm:p-6 pb-3 pr-12 shrink-0 border-b border-gray-200/70 dark:border-gray-700/70 bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl md:text-2xl text-gray-900 dark:text-white leading-tight">
            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 shadow-md shrink-0">
              <Users className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
            </div>
            Department Performance Overview
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-base text-gray-600 dark:text-gray-300 mt-2">
            Detailed view of attendance statistics across all departments for today.
          </DialogDescription>
          <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="inline-flex items-center rounded-md bg-blue-100/80 dark:bg-blue-900/40 px-2.5 py-1 text-xs sm:text-sm font-semibold text-blue-800 dark:text-blue-200">
              {totalDepartments} Departments
            </span>
            <span className="inline-flex items-center rounded-md bg-gray-100/90 dark:bg-gray-800 px-2.5 py-1 text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200">
              {totalStaff} Total Staff
            </span>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-3 sm:p-5 md:p-6">
          {data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-gray-400 dark:text-gray-600 mb-4" />
              <p className="text-gray-900 dark:text-white text-lg font-medium">No Data Available</p>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">There is no department performance data available for today.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:gap-4 lg:gap-5 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
              {data.map((dept, index) => (
                <Card key={index} className="overflow-hidden border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                  <div className="bg-white dark:bg-gray-800 p-4 sm:p-5 border-b border-gray-100 dark:border-gray-700/50 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white text-base sm:text-lg leading-tight">
                        {dept.department_full || dept.department}
                      </h3>
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium">
                        {dept.department !== dept.department_full ? dept.department : 'Dept.'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mr-1 leading-none">{dept.total_employees}</span>
                      <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Staff</span>
                    </div>
                  </div>
                  <CardContent className="p-0">
                    <div className="grid grid-cols-2 divide-x divide-y divide-gray-100 dark:divide-gray-700/50">
                      
                      {/* Present Stat */}
                      <div className="p-3 sm:p-4 bg-emerald-50/30 dark:bg-emerald-950/10 flex items-center gap-3">
                        <div className="p-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="flex items-baseline gap-1.5">
                            <span className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">{dept.present_count}</span>
                            <span className="text-xs sm:text-sm font-semibold text-emerald-600 dark:text-emerald-400">{dept.attendance_rate}%</span>
                          </p>
                          <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Present</p>
                        </div>
                      </div>

                      {/* Late Stat */}
                      <div className="p-3 sm:p-4 bg-amber-50/30 dark:bg-amber-950/10 flex items-center gap-3">
                        <div className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400">
                          <Clock className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="flex items-baseline gap-1.5">
                            <span className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">{dept.late_count}</span>
                            <span className="text-xs sm:text-sm font-semibold text-amber-600 dark:text-amber-400">{dept.late_rate}%</span>
                          </p>
                          <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Late</p>
                        </div>
                      </div>

                      {/* Work Not Started Stat */}
                      <div className="col-span-2 p-3 sm:p-4 bg-gray-50/80 dark:bg-gray-800/50 flex items-center gap-3">
                        <div className="p-1.5 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                          <AlertCircle className="h-4 w-4" />
                        </div>
                        <div className="flex-1 flex items-center justify-between">
                          <div>
                            <p className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">{dept.work_not_started_count}</p>
                            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Work Not Started</p>
                          </div>
                          {dept.work_not_started_rate > 0 && (
                            <span className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">{dept.work_not_started_rate}% of staff</span>
                          )}
                        </div>
                      </div>

                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
