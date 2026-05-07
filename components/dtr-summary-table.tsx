"use client"

import React, { useState, useEffect, useRef } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Printer } from 'lucide-react'

// Scrolling Text Component for Long Department Names
const ScrollingText = ({ text, className = "" }: { text: string, className?: string }) => {
  const [isHovered, setIsHovered] = useState(false)
  const textRef = useRef<HTMLSpanElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  const [needsScroll, setNeedsScroll] = useState(false)
  const [scrollDistance, setScrollDistance] = useState(0)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const checkScroll = () => {
      if (measureRef.current && containerRef.current) {
        const textWidth = measureRef.current.scrollWidth
        const containerWidth = containerRef.current.offsetWidth
        const needs = textWidth > containerWidth
        setNeedsScroll(needs)
        if (needs) {
          setScrollDistance(textWidth - containerWidth + 30)
        }
      }
    }
    
    const timeout = setTimeout(checkScroll, 100)
    window.addEventListener('resize', checkScroll)
    return () => {
      clearTimeout(timeout)
      window.removeEventListener('resize', checkScroll)
    }
  }, [text])

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    if (needsScroll) {
      setIsHovered(true)
    }
  }

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false)
    }, 300)
  }

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
    }
  }, [])

  if (!text) {
    return <span className={className}>N/A</span>
  }

  const animationDuration = Math.max(4, (scrollDistance / 40) * 0.8)

  return (
    <>
      <span
        ref={measureRef}
        className={`absolute opacity-0 pointer-events-none whitespace-nowrap ${className}`}
        style={{ visibility: 'hidden', position: 'absolute', top: '-9999px', left: '-9999px' }}
      >
        {text}
      </span>
      
      <div 
        ref={containerRef}
        className="relative overflow-hidden w-full inline-block"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div 
          className={`${isHovered ? 'hidden' : 'block'} truncate ${className}`}
        >
          {text}
        </div>
        
        <span 
          ref={textRef}
          className={`${isHovered && needsScroll ? 'block' : 'hidden'} whitespace-nowrap ${className}`}
          style={{
            transform: isHovered && needsScroll ? `translateX(-${scrollDistance}px)` : 'translateX(0)',
            transition: `transform ${animationDuration}s cubic-bezier(0.4, 0, 0.2, 1)`,
            display: isHovered && needsScroll ? 'inline-block' : 'none',
            willChange: isHovered && needsScroll ? 'transform' : 'auto',
            backfaceVisibility: 'hidden',
            perspective: '1000px',
          }}
        >
          {text}
        </span>
        
        {!isHovered && needsScroll && (
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-linear-to-r from-transparent via-white/70 to-white dark:from-transparent dark:via-gray-900/70 dark:to-gray-900 pointer-events-none" />
        )}
      </div>
    </>
  )
}

interface DTREmployee {
  employee: {
    employee_id: number
    full_name: string
    unique_employee_id: string
    department: string
    staff_type: string
  }
  logs: any[]
  totalDaysPresent: number
  totalDaysLate: number
  totalDaysAbsent: number
  totalAdminTimeDays: number
  totalLateMinutes: number
  totalUndertimeMinutes: number
}

interface DTRSummaryTableProps {
  dtrData: DTREmployee[]
  selectedIds: number[]
  onToggleSelect: (id: number) => void
  onSelectAll: () => void
  onPrintEmployee: (employeeId: number, employeeName: string) => void
  formatMinutesToHours: (minutes: number) => string
}

export function DTRSummaryTable({
  dtrData,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onPrintEmployee,
  formatMinutesToHours
}: DTRSummaryTableProps) {
  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden lg:block overflow-x-auto border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow className="bg-linear-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
              <TableHead className="w-12 text-center">
                <Checkbox
                  checked={selectedIds.length === dtrData.length && selectedIds.length > 0}
                  onCheckedChange={onSelectAll}
                />
              </TableHead>
              <TableHead className="font-bold">Employee</TableHead>
              <TableHead className="font-bold">Department</TableHead>
              <TableHead className="text-center font-bold">Total Days</TableHead>
              <TableHead className="text-center font-bold">Present</TableHead>
              <TableHead className="text-center font-bold">Late</TableHead>
              <TableHead className="text-center font-bold">Absent</TableHead>
              <TableHead className="text-center font-bold">Admin Time</TableHead>
              <TableHead className="text-center font-bold">Total Late</TableHead>
              <TableHead className="text-center font-bold">Total Undertime</TableHead>
              <TableHead className="text-center font-bold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dtrData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-sm">No DTR data available</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              dtrData.map((dtr, index) => (
                <TableRow
                  key={dtr.employee.employee_id}
                  className={`${
                    index % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/50'
                  } hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors`}
                >
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.includes(dtr.employee.employee_id)}
                      onCheckedChange={() => onToggleSelect(dtr.employee.employee_id)}
                    />
                  </TableCell>
                  <TableCell className="font-semibold text-gray-900 dark:text-gray-100">
                    {dtr.employee.full_name}
                    <div className="text-xs text-muted-foreground">{dtr.employee.unique_employee_id}</div>
                  </TableCell>
                  <TableCell>
                    <ScrollingText text={dtr.employee.department} className="text-sm" />
                  </TableCell>
                  <TableCell className="text-center font-medium">
                    {dtr.logs.filter((l: any) => l.log_type === 'IN').length}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className="bg-linear-to-r from-green-500 to-emerald-500 text-white shadow-sm">
                      {dtr.totalDaysPresent}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className="bg-linear-to-r from-orange-500 to-amber-500 text-white shadow-sm">
                      {dtr.totalDaysLate}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className="bg-linear-to-r from-red-500 to-rose-500 text-white shadow-sm">
                      {dtr.totalDaysAbsent}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className="bg-linear-to-r from-blue-500 to-indigo-500 text-white shadow-sm">
                      {dtr.totalAdminTimeDays}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center font-semibold text-orange-600 dark:text-orange-400">
                    {formatMinutesToHours(dtr.totalLateMinutes)}
                  </TableCell>
                  <TableCell className="text-center font-semibold text-red-600 dark:text-red-400">
                    {formatMinutesToHours(dtr.totalUndertimeMinutes)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onPrintEmployee(dtr.employee.employee_id, dtr.employee.full_name)}
                      className="h-8"
                    >
                      <Printer className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View */}
      <div className="lg:hidden space-y-3">
        {dtrData.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <p className="text-sm">No DTR data available</p>
          </div>
        ) : (
          dtrData.map((dtr) => (
            <Card key={dtr.employee.employee_id} className="border-2">
              <CardContent className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <Checkbox
                    checked={selectedIds.includes(dtr.employee.employee_id)}
                    onCheckedChange={() => onToggleSelect(dtr.employee.employee_id)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <p className="font-bold text-base dark:text-gray-100">{dtr.employee.full_name}</p>
                    <p className="text-xs text-muted-foreground">{dtr.employee.unique_employee_id}</p>
                    <div className="text-xs text-muted-foreground mt-1">
                      <ScrollingText text={dtr.employee.department} className="text-xs" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                    <p className="text-xs text-muted-foreground">Total Days</p>
                    <p className="text-lg font-bold">{dtr.logs.filter((l: any) => l.log_type === 'IN').length}</p>
                  </div>
                  <div className="bg-green-50 dark:bg-green-950/20 p-2 rounded">
                    <p className="text-xs text-green-700 dark:text-green-300">Present</p>
                    <p className="text-lg font-bold text-green-600">{dtr.totalDaysPresent}</p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-950/20 p-2 rounded">
                    <p className="text-xs text-orange-700 dark:text-orange-300">Late</p>
                    <p className="text-lg font-bold text-orange-600">{dtr.totalDaysLate}</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-950/20 p-2 rounded">
                    <p className="text-xs text-red-700 dark:text-red-300">Absent</p>
                    <p className="text-lg font-bold text-red-600">{dtr.totalDaysAbsent}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-orange-50 dark:bg-orange-950/20 p-2 rounded">
                    <p className="text-xs text-orange-700 dark:text-orange-300">Total Late</p>
                    <p className="text-sm font-bold text-orange-600">{formatMinutesToHours(dtr.totalLateMinutes)}</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-950/20 p-2 rounded">
                    <p className="text-xs text-red-700 dark:text-red-300">Total Undertime</p>
                    <p className="text-sm font-bold text-red-600">{formatMinutesToHours(dtr.totalUndertimeMinutes)}</p>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onPrintEmployee(dtr.employee.employee_id, dtr.employee.full_name)}
                  className="w-full"
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Print DTR
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </>
  )
}
