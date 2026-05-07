"use client"

import React, { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChevronRight, Users } from 'lucide-react'

interface Employee {
  employee_id: number
  full_name: string
  unique_employee_id: string
  department: string
  staff_type: string
  hire_date?: string
  start_date?: string
}

interface DTREmployeeListProps {
  employees: Employee[]
  selectedIds: number[]
  onToggleSelect: (id: number) => void
  onSelectAll: () => void
  onEmployeeClick: (employee: Employee) => void
}

export function DTREmployeeList({
  employees,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onEmployeeClick
}: DTREmployeeListProps) {
  // Filter only teaching staff
  const teachingStaff = employees.filter(emp => emp.staff_type === 'Teaching')
  
  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden lg:block">
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-linear-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
                <TableHead className="w-12 text-center">
                  <Checkbox
                    checked={selectedIds.length === teachingStaff.length && teachingStaff.length > 0}
                    onCheckedChange={onSelectAll}
                  />
                </TableHead>
                <TableHead className="font-bold">Employee ID</TableHead>
                <TableHead className="font-bold">Full Name</TableHead>
                <TableHead className="font-bold">Department</TableHead>
                <TableHead className="font-bold text-center">Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teachingStaff.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <Users className="h-12 w-12 text-gray-400 dark:text-gray-600" />
                      <p className="text-gray-500 dark:text-gray-400">No teaching staff found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                teachingStaff.map((employee, index) => (
                  <TableRow
                    key={employee.employee_id}
                    className={`cursor-pointer transition-colors ${
                      index % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/50'
                    } hover:bg-blue-50 dark:hover:bg-blue-900/20`}
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
                    <TableCell className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">
                      {employee.unique_employee_id}
                    </TableCell>
                    <TableCell className="font-semibold text-gray-900 dark:text-gray-100">
                      {employee.full_name}
                    </TableCell>
                    <TableCell className="text-gray-700 dark:text-gray-300">
                      {employee.department}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className="bg-linear-to-r from-green-500 to-emerald-500 text-white">
                        Active
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="lg:hidden space-y-3">
        {teachingStaff.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">No teaching staff found</p>
          </div>
        ) : (
          teachingStaff.map((employee) => (
            <Card
              key={employee.employee_id}
              className="border-2 cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
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
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-bold text-base dark:text-gray-100">
                          {employee.full_name}
                        </p>
                        <p className="text-xs font-mono text-blue-600 dark:text-blue-400">
                          {employee.unique_employee_id}
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400 shrink-0" />
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {employee.department}
                    </p>
                    <Badge className="mt-2 bg-linear-to-r from-green-500 to-emerald-500 text-white text-xs">
                      Active
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </>
  )
}
