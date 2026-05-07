"use client"

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FileText } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

interface Employee {
  employee_id: number
  full_name: string
  unique_employee_id: string
  department: string
  staff_type: string
  hire_date?: string
  start_date?: string
}

interface DTREmployeeListRedesignProps {
  employees: Employee[]
  selectedIds: number[]
  onToggleSelect: (id: number) => void
  onSelectAll: () => void
  onEmployeeClick: (employee: Employee) => void
  hideNotStarted?: boolean
  onToggleHideNotStarted?: (value: boolean) => void
  onBulkExport?: () => void
  isBulkExporting?: boolean
}

export function DTREmployeeListRedesign({
  employees,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onEmployeeClick,
  hideNotStarted = false,
  onToggleHideNotStarted,
  onBulkExport,
  isBulkExporting = false
}: DTREmployeeListRedesignProps) {
  // Filter only teaching staff
  let teachingStaff = employees.filter(emp => emp.staff_type === 'Teaching')
  
  // Filter based on hideNotStarted
  if (hideNotStarted) {
    teachingStaff = teachingStaff.filter(emp => {
      const today = new Date().toISOString().split('T')[0]
      const startDate = (emp as any).start_date || emp.hire_date
      if (!startDate) return true
      const startDateObj = new Date(startDate + 'T00:00:00')
      const todayObj = new Date(today + 'T00:00:00')
      return startDateObj <= todayObj
    })
  }
  
  const isAllSelected = selectedIds.length === teachingStaff.length && teachingStaff.length > 0
  
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-linear-to-br from-indigo-500 to-purple-500">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div>
            <CardTitle>Daily Time Record Summary</CardTitle>
            <CardDescription>
              Detailed DTR records for all employees
            </CardDescription>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-4 pt-4 border-t">
          {/* Hide Not Started Toggle */}
          {onToggleHideNotStarted && (
            <div className="flex items-center gap-2">
              <Switch 
                checked={hideNotStarted} 
                onCheckedChange={onToggleHideNotStarted}
                id="hide-not-started"
              />
              <Label htmlFor="hide-not-started" className="text-sm cursor-pointer">
                Hide Work Has Not Started Yet
              </Label>
            </div>
          )}

          {/* Bulk Export Button */}
          {onBulkExport && selectedIds.length > 0 && (
            <Button
              onClick={onBulkExport}
              disabled={isBulkExporting}
              size="sm"
              className="bg-linear-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600"
            >
              {isBulkExporting ? (
                <>
                  <Download className="mr-2 h-4 w-4 animate-bounce" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Bulk Export DTR
                </>
              )}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b-2">
                <TableHead className="text-center w-12">
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={onSelectAll}
                  />
                </TableHead>
                <TableHead className="text-center font-semibold">Employee</TableHead>
                <TableHead className="text-center font-semibold">Department</TableHead>
                <TableHead className="text-center font-semibold">Employee ID</TableHead>
                <TableHead className="text-center font-semibold">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teachingStaff.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="h-12 w-12 text-gray-400 dark:text-gray-600 mb-2" />
                      <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">No employees found</p>
                      <p className="text-gray-400 dark:text-gray-500 text-sm">
                        {hideNotStarted 
                          ? 'Try disabling "Hide Work Has Not Started Yet"'
                          : 'There are no teaching staff members available'
                        }
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                teachingStaff.map((employee) => (
                  <TableRow
                    key={employee.employee_id}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    onClick={() => onEmployeeClick(employee)}
                  >
                    <TableCell 
                      className="text-center" 
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleSelect(employee.employee_id)
                      }}
                    >
                      <Checkbox
                        checked={selectedIds.includes(employee.employee_id)}
                        onCheckedChange={() => onToggleSelect(employee.employee_id)}
                      />
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      {employee.full_name}
                    </TableCell>
                    <TableCell className="text-center text-gray-600 dark:text-gray-400">
                      {employee.department}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-mono text-sm text-blue-600 dark:text-blue-400">
                        {employee.unique_employee_id}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge 
                        variant="secondary"
                        className="bg-green-500 hover:bg-green-600 text-white"
                      >
                        Active
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile View */}
        <div className="lg:hidden space-y-3 mt-4">
          {teachingStaff.map((employee) => (
            <Card
              key={employee.employee_id}
              className="cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors border-2"
              onClick={() => onEmployeeClick(employee)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedIds.includes(employee.employee_id)}
                    onCheckedChange={() => onToggleSelect(employee.employee_id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <p className="font-bold text-base">{employee.full_name}</p>
                    <p className="text-xs font-mono text-blue-600 dark:text-blue-400 mt-1">
                      {employee.unique_employee_id}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                      {employee.department}
                    </p>
                    <Badge className="mt-3 bg-green-500 text-white text-xs">
                      Active
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
