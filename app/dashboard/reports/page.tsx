"use client"

// Generate a dedicated Faculty Timesheet print layout (letterhead style)
function generateFacultyTimesheetPrintHTML(data: any, startDate: string, endDate: string) {
  if (!data) return '';
  const { employee, logs } = data;
  
  console.log('[Faculty Timesheet] Generating timesheet', {
    employee_name: employee.full_name,
    employee_id: employee.employee_id,
    startDate,
    endDate,
    totalLogs: logs?.length || 0,
    logsData: logs?.slice(0, 2) // Show first 2 logs
  });
  
  // Generate date columns (26-10 format from the image)
  const start = new Date(startDate + 'T00:00:00+08:00');
  const end = new Date(endDate + 'T00:00:00+08:00');
  const datesList: Date[] = [];
  const dates: string[] = [];
  let current = new Date(start);
  
  while (current <= end) {
    datesList.push(new Date(current));
    dates.push(current.getDate().toString());
    current.setDate(current.getDate() + 1);
  }
  
  console.log('[Faculty Timesheet] Date range:', {
    dates: dates.join(', '),
    totalDays: dates.length
  });
  
  // Process attendance logs into a map by date
  const logsByDate: Record<string, { timeIn: string | null; timeOut: string | null; status: string | null }> = {};

  const getExplicitStatusFromLog = (log: any): string | null => {
    if (!log) return null
    const rawStatus = String(log?.attendance_status || '').trim()
    if (!rawStatus) return null
    const normalized = rawStatus.toLowerCase().replace(/_/g, '-')
    if (normalized === 'absent') {
      const notes = String(log?.notes || '').trim()
      if (/^leave approved:/i.test(notes)) return 'leave'
    }
    return rawStatus
  }
  
  if (logs && Array.isArray(logs)) {
    console.log('[Faculty Timesheet] Processing logs - sample:', logs.slice(0, 2));
    
    logs.forEach((log: any) => {
      const logDate = log.date ? log.date.substring(0, 10) : null;
      if (!logDate) return;
      
      if (!logsByDate[logDate]) {
        logsByDate[logDate] = { timeIn: null, timeOut: null, status: null };
      }
      
      const explicitStatus = getExplicitStatusFromLog(log)
      const statusLower = String(explicitStatus || '').toLowerCase()
      const isAbsentLike = statusLower === 'absent' || statusLower === 'leave' || statusLower === 'excused'
      if (log.log_type === 'IN' && !isAbsentLike) {
        logsByDate[logDate].timeIn = log.log_time;
        if (explicitStatus) {
          logsByDate[logDate].status = explicitStatus;
        }
      } else if (log.log_type === 'OUT') {
        logsByDate[logDate].timeOut = log.log_time;
        if (!logsByDate[logDate].status && explicitStatus) {
          logsByDate[logDate].status = explicitStatus;
        }
      } else if (explicitStatus && !logsByDate[logDate].status) {
        logsByDate[logDate].status = explicitStatus
      }
    });
  }
  
  console.log('[Faculty Timesheet] Processed logs by date:', {
    datesWithLogs: Object.keys(logsByDate).length,
    sampleDates: Object.keys(logsByDate).slice(0, 3),
    sampleData: Object.keys(logsByDate).length > 0 ? logsByDate[Object.keys(logsByDate)[0]] : 'none'
  });
  
  // Helper function to format time for display (HH:MM format)
  const formatTime = (timeStr: string | null): string => {
    if (!timeStr) return '';
    try {
      const parts = timeStr.split(':');
      return `${parts[0]}:${parts[1]}`;
    } catch {
      return timeStr;
    }
  };
  
  // Helper function to calculate hours between two times
  const calculateHours = (timeIn: string | null, timeOut: string | null): number => {
    if (!timeIn || !timeOut) return 0;
    try {
      const [inH, inM] = timeIn.split(':').map(Number);
      const [outH, outM] = timeOut.split(':').map(Number);
      const inMinutes = inH * 60 + inM;
      const outMinutes = outH * 60 + outM;
      const diffMinutes = outMinutes - inMinutes;
      return Math.max(0, diffMinutes / 60);
    } catch {
      return 0;
    }
  };
  
  // Generate actual attendance data cells for each date
  const generateAttendanceCells = () => {
    const cells = datesList.map((date, i) => {
      const dateStr = formatInTimeZone(date, 'Asia/Manila', 'yyyy-MM-dd');
      const dayOfWeek = date.getDay();
      const isSunday = dayOfWeek === 0;
      
      const logData = logsByDate[dateStr];
      
      // Debug first 3 cells
      if (i < 3) {
        console.log(`[Faculty Timesheet] Cell ${i} (${dateStr}):`, {
          isSunday,
          hasLogData: !!logData,
          logData: logData || 'none'
        });
      }
      
      if (isSunday) {
        return `<td style="border: 1px solid #000; padding: 2px; font-size: 6px; text-align: center; background-color: #f0f0f0;" title="Sunday - Rest Day">REST</td>`;
      }
      
      if (!logData || (!logData.timeIn && !logData.timeOut)) {
        return `<td style="border: 1px solid #000; padding: 2px; font-size: 6px; text-align: center;"></td>`;
      }
      
      const hours = calculateHours(logData.timeIn, logData.timeOut);
      const timeInFormatted = formatTime(logData.timeIn);
      const timeOutFormatted = formatTime(logData.timeOut);
      
      // Build cell content with time in/out and hours
      let cellContent = '';
      if (timeInFormatted && timeOutFormatted) {
        cellContent = `${timeInFormatted}<br>${timeOutFormatted}<br><b>${hours.toFixed(2)}</b>`;
      } else if (timeInFormatted) {
        cellContent = `${timeInFormatted}<br>--<br><b>0.00</b>`;
      } else if (timeOutFormatted) {
        cellContent = `--<br>${timeOutFormatted}<br><b>0.00</b>`;
      }
      
      return `<td style="border: 1px solid #000; padding: 2px; font-size: 6px; text-align: center; line-height: 1.2;" title="${dateStr}: ${logData.status || 'Present'}">${cellContent}</td>`;
    });
    
    console.log('[Faculty Timesheet] Generated cells:', {
      totalCells: cells.length,
      firstCell: cells[0]?.substring(0, 100),
      cellsWithContent: cells.filter(c => !c.includes('></td>')).length
    });
    
    return cells.join('');
  };
  
  // Calculate summary statistics
  let totalDaysPresent = 0;
  let totalHoursWorked = 0;
  let totalLates = 0;
  let totalUndertimes = 0;
  let totalAbsences = 0;
  
  datesList.forEach((date) => {
    const dateStr = formatInTimeZone(date, 'Asia/Manila', 'yyyy-MM-dd');
    const dayOfWeek = date.getDay();
    const isSunday = dayOfWeek === 0;
    
    if (isSunday) return; // Skip Sundays
    
    const logData = logsByDate[dateStr];
    if (logData) {
      if (logData.timeIn || logData.timeOut) {
        totalDaysPresent++;
        totalHoursWorked += calculateHours(logData.timeIn, logData.timeOut);
      }
      
      // Count lates and undertimes from status
      if (logData.status) {
        const statusLower = logData.status.toLowerCase();
        if (statusLower.includes('late')) totalLates++;
        if (statusLower.includes('undertime')) totalUndertimes++;
        if (statusLower.includes('absent') || statusLower.includes('leave')) totalAbsences++;
      }
    }
  });
  
  console.log('[Faculty Timesheet] Summary statistics:', {
    totalDaysPresent,
    totalHoursWorked: totalHoursWorked.toFixed(2),
    totalLates,
    totalUndertimes,
    totalAbsences
  });
  
  // Generate date header cells
  const dateHeaderCells = dates.map(d => `<th style="border: 1px solid #000; padding: 2px; font-size: 8px; text-align: center; width: 20px;">${d}</th>`).join('');
  
  // Generate attendance row (single row showing all time in/out data)
  const attendanceRow = `
    <tr>
      <td style="border: 1px solid #000; padding: 2px; font-size: 8px;" colspan="5">Daily Attendance</td>
      ${generateAttendanceCells()}
      <td style="border: 1px solid #000; padding: 2px; font-size: 8px; text-align: center; font-weight: bold;">${totalHoursWorked.toFixed(2)}</td>
    </tr>
  `;
  
  // DEBUG ROW - Shows the data we have
  const debugRow = `
    <tr style="background-color: #ffffcc;">
      <td style="border: 1px solid #000; padding: 2px; font-size: 7px;" colspan="5">
        DEBUG: Logs=${logs?.length || 0}, Dates with data=${Object.keys(logsByDate).length}
      </td>
      ${dates.map((d, idx) => {
        const testDate = formatInTimeZone(datesList[idx], 'Asia/Manila', 'yyyy-MM-dd');
        const hasData = logsByDate[testDate];
        return `<td style="border: 1px solid #000; padding: 1px; font-size: 5px; text-align: center;" title="${testDate}">${hasData ? '✓' : '✗'}</td>`;
      }).join('')}
      <td style="border: 1px solid #000; padding: 2px; font-size: 7px;"></td>
    </tr>
  `;
  
  // Placeholder rows for teaching/exam/non-teaching (can be enhanced later with actual schedule data)
  const teachingRows = `
    <tr>
      <td style="border: 1px solid #000; padding: 2px; font-size: 8px;" colspan="${dates.length + 6}">
        <i style="color: #666;">Teaching schedule details not implemented yet - showing attendance data above</i>
      </td>
    </tr>
  `;
  
  const examRows = `
    <tr>
      <td style="border: 1px solid #000; padding: 2px; font-size: 8px;" colspan="${dates.length + 6}">
        <i style="color: #666;">Exam schedule details not implemented yet</i>
      </td>
    </tr>
  `;
  
  const nonTeachingRows = `
    <tr>
      <td style="border: 1px solid #000; padding: 2px; font-size: 8px;" colspan="${dates.length + 2}">
        <i style="color: #666;">Non-teaching activities not implemented yet</i>
      </td>
    </tr>
  `;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Faculty Timesheet</title>
      <style>
        @page {
          size: landscape;
          margin: 0.5cm;
        }
        @media print {
          body { margin: 0; }
          .print-container { box-shadow: none !important; }
        }
        body {
          font-family: Arial, sans-serif;
          background: #fff;
          color: #000;
          margin: 0;
          padding: 0;
          font-size: 9px;
        }
        .print-container {
          width: 100%;
          background: #fff;
          padding: 10px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th, td {
          border: 1px solid #000;
          padding: 2px 4px;
        }
      </style>
    </head>
    <body>
      <div class="print-container">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 10px;">
            <img src="/logo.png" style="width: 50px; height: 50px; margin-right: 15px;" alt="STI Logo" />
            <div style="text-align: left;">
              <div style="font-size: 16px; font-weight: bold; color: #003C71;">STI COLLEGE SANTA ROSA</div>
              <div style="font-size: 10px; color: #666;">Sta. Rosa-Tagaytay Road, Brgy. Pulong Santa Cruz, City of Sta. Rosa, Laguna</div>
            </div>
          </div>
          <div style="font-size: 14px; font-weight: bold; background: #ffeb3b; padding: 8px; border-radius: 4px; letter-spacing: 1px;">FACULTY DAILY TIME RECORD</div>
        </div>
        
        <!-- Faculty Info -->
        <table style="margin-bottom: 20px; font-size: 11px; width: 100%; border-collapse: separate; border-spacing: 0 8px;">
          <tr>
            <td style="border: none; padding: 6px 10px; width: 18%; font-weight: bold;">FACULTY NAME:</td>
            <td style="border-bottom: 2px solid #000; padding: 6px 10px; width: 32%;">${employee.full_name}</td>
            <td style="border: none; padding: 6px 10px; width: 15%; font-weight: bold;">SCHOOL YEAR:</td>
            <td style="border-bottom: 2px solid #000; padding: 6px 10px; width: 15%;">2023-2024</td>
            <td style="border: none; padding: 6px 10px; width: 12%; font-weight: bold;">SEMESTER:</td>
            <td style="border-bottom: 2px solid #000; padding: 6px 10px; width: 8%;">1ST</td>
          </tr>
          <tr>
            <td style="border: none; padding: 6px 10px; font-weight: bold;">DEPARTMENT:</td>
            <td style="border-bottom: 2px solid #000; padding: 6px 10px;" colspan="5">${employee.department || 'N/A'}</td>
          </tr>
          <tr>
            <td style="border: none; padding: 6px 10px; font-weight: bold;">CUT-OFF PERIOD:</td>
            <td style="border-bottom: 2px solid #000; padding: 6px 10px;" colspan="5">${new Date(startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} - ${new Date(endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</td>
          </tr>
        </table>
        
        <!-- Period Covered -->
        <table style="margin-bottom: 5px; font-size: 8px;">
          <tr>
            <th colspan="${dates.length + 1}" style="background: #e0e0e0; text-align: center; padding: 3px; font-size: 9px;">PERIOD COVERED</th>
            <th rowspan="3" style="background: #e0e0e0; writing-mode: vertical-lr; text-align: center; font-size: 8px;">Total Hours</th>
          </tr>
          <tr>
            <th style="background: #f5f5f5; text-align: center; padding: 2px; font-size: 8px;">${new Date(startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</th>
            ${dateHeaderCells}
          </tr>
          <tr>
            <th style="background: #f5f5f5; text-align: center; padding: 2px; font-size: 8px;">${new Date(endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</th>
            ${dates.map(d => `<th style="border: 1px solid #000; padding: 2px; font-size: 8px; text-align: center;">${d}</th>`).join('')}
          </tr>
        </table>
        
        <!-- Attendance Record Table -->
        <table style="margin-bottom: 5px;">
          <thead>
            <tr style="background: #e0e0e0;">
              <th colspan="${dates.length + 6}" style="text-align: left; padding: 3px; font-size: 9px; font-weight: bold;">DAILY ATTENDANCE RECORD</th>
            </tr>
            <tr style="background: #f5f5f5; font-size: 7px;">
              <th style="border: 1px solid #000; padding: 2px;" colspan="5">
                <div style="font-size: 6px; line-height: 1.2;">
                  Format per cell:<br>
                  <b>Time In</b><br>
                  <b>Time Out</b><br>
                  <b>Hours</b>
                </div>
              </th>
              ${dates.map(d => `<th style="border: 1px solid #000; padding: 2px; text-align: center;">${d}</th>`).join('')}
              <th style="border: 1px solid #000; padding: 2px;">Total Hours</th>
            </tr>
          </thead>
          <tbody>
            ${debugRow}
            ${attendanceRow}
          </tbody>
        </table>
        
        <!-- Teaching Schedule (Placeholder) -->
        <table style="margin-bottom: 5px;">
          <thead>
            <tr style="background: #e0e0e0;">
              <th colspan="${dates.length + 7}" style="text-align: left; padding: 3px; font-size: 9px; font-weight: bold;">TEACHING SCHEDULE</th>
            </tr>
          </thead>
          <tbody>
            ${teachingRows}
          </tbody>
        </table>
        
        <!-- Exam Day (Placeholder) -->
        <table style="margin-bottom: 5px;">
          <thead>
            <tr style="background: #e0e0e0;">
              <th colspan="${dates.length + 7}" style="text-align: left; padding: 3px; font-size: 9px; font-weight: bold;">EXAM DAY</th>
            </tr>
          </thead>
          <tbody>
            ${examRows}
          </tbody>
        </table>
        
        <!-- Non-Teaching Activities (Placeholder) -->
        <table style="margin-bottom: 10px;">
          <thead>
            <tr style="background: #e0e0e0;">
              <th colspan="${dates.length + 2}" style="text-align: left; padding: 3px; font-size: 9px; font-weight: bold;">NON-TEACHING ACTIVITIES</th>
            </tr>
          </thead>
          <tbody>
            ${nonTeachingRows}
          </tbody>
        </table>
        
        <!-- Summary Section -->
        <table style="width: 100%; margin-bottom: 25px; font-size: 11px; border: 2px solid #000;">
          <tr style="background: #f0f0f0;">
            <td style="padding: 10px; font-weight: bold; width: 50%;">Total Days Present:</td>
            <td style="padding: 10px; border-left: 2px solid #000;">${totalDaysPresent} day(s)</td>
          </tr>
          <tr>
            <td style="padding: 10px; font-weight: bold; border-top: 1px solid #ccc;">Total Hours Worked:</td>
            <td style="padding: 10px; border-left: 2px solid #000; border-top: 1px solid #ccc;">${totalHoursWorked.toFixed(2)} hour(s)</td>
          </tr>
          <tr style="background: #f0f0f0;">
            <td style="padding: 10px; font-weight: bold; border-top: 1px solid #ccc;">Number of Lates:</td>
            <td style="padding: 10px; border-left: 2px solid #000; border-top: 1px solid #ccc;">${totalLates} day(s)</td>
          </tr>
          <tr>
            <td style="padding: 10px; font-weight: bold; border-top: 1px solid #ccc;">Number of Undertimes:</td>
            <td style="padding: 10px; border-left: 2px solid #000; border-top: 1px solid #ccc;">${totalUndertimes} day(s)</td>
          </tr>
          <tr style="background: #f0f0f0;">
            <td style="padding: 10px; font-weight: bold; border-top: 1px solid #ccc;">Number of Absences:</td>
            <td style="padding: 10px; border-left: 2px solid #000; border-top: 1px solid #ccc;">${totalAbsences} day(s)</td>
          </tr>
        </table>
        
        <!-- Remarks -->
        <div style="margin-bottom: 30px;">
          <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px; color: #003C71;">Remarks:</div>
          <div style="border: 2px solid #000; min-height: 80px; padding: 10px; background: #fafafa;"></div>
        </div>
        
        <!-- Signatures -->
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 40px;">
          <div style="text-align: center; width: 30%;">
            <div style="border-bottom: 2px solid #000; margin-bottom: 8px; height: 50px;"></div>
            <div style="font-weight: bold;">Checked by:</div>
            <div style="font-size: 9px; color: #666; margin-top: 2px;">Program Coordinator</div>
          </div>
          <div style="text-align: center; width: 30%;">
            <div style="border-bottom: 2px solid #000; margin-bottom: 8px; height: 50px;"></div>
            <div style="font-weight: bold;">Approved by:</div>
            <div style="font-size: 9px; color: #666; margin-top: 2px;">Academic Head</div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
  }

import React, { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area, Legend } from "recharts"
import { FileText, TrendingUp, Users, Clock, AlertTriangle, CheckCircle, Download, UserX, Printer, Mail, X } from "lucide-react"
import { format, subDays, startOfMonth, endOfMonth, parseISO } from "date-fns"
import { formatInTimeZone } from "date-fns-tz"
import { MANILA_TZ, toManilaDate, formatManilaDateLong, formatManilaDateShort, toManilaTime, toManilaTime12h, toManilaTime24h, createManilaDate, getManilaToday, parseManilaDate, getDaysInRange, formatManilaDateLong as formatManilaLong } from "@/lib/timezone-utils"
import { useToast } from "@/hooks/use-toast"
import { getEmployees, getAttendanceLogs, getDashboardStats, getWeeklyAttendanceData, getDepartmentAttendanceData, getTeachingSchedulesForEmployee, getExamSchedulesForEmployee, getStaffTypeFilter, getClassSubstitutionsForEmployeeOnDate } from "@/lib/offline-dashboard-client"
import { canMarkAsAbsent, hasWorkStarted, getCorrectAttendanceStatus, isSunday } from "@/lib/attendance-helpers"
import { useLanguage } from "@/lib/language-context"
import { Calendar } from "@/components/ui/calendar"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { MobileDrawer, MobileDrawerContent, MobileDrawerHeader, MobileDrawerTitle } from "@/components/ui/mobile-drawer"
import { Calendar as CalendarIcon, Search, Filter, ChevronDown, RefreshCw } from "lucide-react"
import { cn, getPreferredTimeFormat, setPreferredTimeFormat } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { toast as sonnerToast } from "sonner"
import { DTREmployeeListRedesign } from "@/components/dtr-employee-list-redesign"
import { generateDTRRecords, hasAttendanceLogs, type DTRData, type AttendanceLog } from "@/lib/faculty-dtr-generator"

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"]

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

  const handleTouchStart = () => {
    if (needsScroll) {
      setIsHovered(true)
    }
  }

  const handleTouchEnd = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false)
    }, 4000)
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

  const baseDuration = 4 
  const animationDuration = Math.max(baseDuration, (scrollDistance / 40) * 0.8)

  return (
    <>
      {/* Hidden element to measure text width */}
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
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Truncated view when not hovered - shows ellipsis */}
        <div 
          className={`${isHovered ? 'hidden' : 'block'} truncate ${className}`}
        >
          {text}
        </div>
        
        {/* Scrolling view when hovered/touched - ultra-smooth left-to-right animation */}
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
        
        {/* Gradient fade on right side when not scrolling to indicate more text */}
        {!isHovered && needsScroll && (
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-linear-to-r from-transparent via-white/70 to-white dark:from-transparent dark:via-gray-900/70 dark:to-gray-900 pointer-events-none" />
        )}
      </div>
    </>
  )
}

export default function ReportsPage() {
  const { t } = useLanguage()
  const [employees, setEmployees] = useState<any[]>([])
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState("All Employees")
  const [selectedDate, setSelectedDate] = useState<Date>(new Date()) // For employee attendance summary
  const [analyticsDepartmentFilter, setAnalyticsDepartmentFilter] = useState<string>('all')
  const [analyticsEmployeeFilter, setAnalyticsEmployeeFilter] = useState<string>('all')
  const [dateRange, setDateRange] = useState({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  })
  const [isLoading, setIsLoading] = useState(true)
  const [weeklyTrend, setWeeklyTrend] = useState<Array<{ date: string; present: number; late: number; undertime?: number; absent: number }>>([])
  const [deptPerf, setDeptPerf] = useState<Array<{ department: string; attendance_rate: number; late_rate: number; work_not_started_rate?: number; present: number; late: number; work_not_started_count?: number; total: number }>>([])
  const [stats, setStats] = useState({
    totalEmployees: 0,
    presentToday: 0,
    lateToday: 0,
    absentToday: 0,
  })
  const [hideNotStarted, setHideNotStarted] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [attendanceStatsData, setAttendanceStatsData] = useState<any[]>([])
  const [isCalculatingStats, setIsCalculatingStats] = useState(false)
  const { toast } = useToast()

  // Get staff type filter based on current user
  const getStaffFilter = () => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('rams_user')
      const user = userStr ? JSON.parse(userStr) : null
      return getStaffTypeFilter(user?.email, user?.role)
    }
    return null
  }

  // Bulk DTR export state
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([])
  const [isBulkExporting, setIsBulkExporting] = useState(false)
  const [bulkExportMode, setBulkExportMode] = useState(false)

  // DTR Summary specific state
  const [activeTab, setActiveTab] = useState("dtr-summary")
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [dtrData, setDtrData] = useState<any[]>([])
  const [academicTerms, setAcademicTerms] = useState<any[]>([])
  const [selectedTerm, setSelectedTerm] = useState<string>('all')
  const [dtrDateFrom, setDtrDateFrom] = useState('')
  const [dtrDateTo, setDtrDateTo] = useState('')
  const [dtrDepartment, setDtrDepartment] = useState('all')
  const [dtrEmployee, setDtrEmployee] = useState('all')
  const [loadingDTR, setLoadingDTR] = useState(false)

  // Detail modal state
  const [detailOpen, setDetailOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [detailEmployee, setDetailEmployee] = useState<any | null>(null)
  const [detailDays, setDetailDays] = useState<Array<{
    date: string
    timeIn: string | null
    timeOut: string | null
    status: string | null
    adminMinutes?: number | null
    adminExplanation?: string | null
  }>>([])
  const [detailSummary, setDetailSummary] = useState<{ onTime: number; late: number; undertime: number; absent: number } | null>(null)
  // Separate date range for main report table (preserved when opening detail modal)
  // Initialize with same values as dateRange
  const initialDateRange = { from: startOfMonth(new Date()), to: endOfMonth(new Date()) }
  const [mainReportDateRange, setMainReportDateRange] = useState(initialDateRange)
  
  // Cutoff period selector for DTR Summary tab
  const [selectedCutoffPeriod, setSelectedCutoffPeriod] = useState<'26-10' | '11-25'>('26-10')
  const [dtrPreviewOpen, setDtrPreviewOpen] = useState(false)
  const [previewEmployeeData, setPreviewEmployeeData] = useState<any>(null)
  
  // Faculty Timesheet preview (separate from DTR)
  const [facultyTimesheetPreviewOpen, setFacultyTimesheetPreviewOpen] = useState(false)
  const [previewFacultyData, setPreviewFacultyData] = useState<any>(null)
  
  // Custom date range mode
  const [isCustomDateRange, setIsCustomDateRange] = useState(false)
  const [customDatePopoverOpen, setCustomDatePopoverOpen] = useState(false)
  
  // Faculty DTR Generator State
  const [facultyDTREmployee, setFacultyDTREmployee] = useState<string>('all')
  const [facultyDTRSchoolYear, setFacultyDTRSchoolYear] = useState<string>('')
  const [facultyDTRSemester, setFacultyDTRSemester] = useState<string>('1st Semester')
  const [facultyDTRPreview, setFacultyDTRPreview] = useState<DTRData | null>(null)
  const [showFacultyDTRPreview, setShowFacultyDTRPreview] = useState(false)
  const [generatingDTR, setGeneratingDTR] = useState(false)
  
  // Faculty DTR Date Range (with custom date picker)
  const [facultyDTRCustomDate, setFacultyDTRCustomDate] = useState<Date | undefined>(undefined)
  const [facultyDTRDatePopoverOpen, setFacultyDTRDatePopoverOpen] = useState(false)
  
  // Centered error dialog
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorDialogTitle, setErrorDialogTitle] = useState('')
  const [errorDialogMessage, setErrorDialogMessage] = useState('')
  const PH_TZ = MANILA_TZ

  const toDtrTimeValue = (value?: string | null): string | null => {
    if (!value) return null
    const raw = String(value).trim()
    if (!raw) return null

    const timeOnly = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
    if (timeOnly) {
      const hour = Number(timeOnly[1])
      const minute = Number(timeOnly[2])
      const second = Number(timeOnly[3] || '0')
      if ([hour, minute, second].some((n) => Number.isNaN(n))) return null
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
    }

    const normalized = raw.includes(' ') ? raw.replace(' ', 'T') : raw
    const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
    const hasDateTimeNoOffset = /^\d{4}-\d{2}-\d{2}T\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(normalized)
    const candidate = hasDateTimeNoOffset && !hasOffset ? `${normalized}+08:00` : normalized

    try {
      const parsed = parseISO(candidate as any)
      if (Number.isNaN(parsed.getTime())) return null
      return formatInTimeZone(parsed, PH_TZ, 'HH:mm:ss')
    } catch {
      return null
    }
  }

  const getStatusContextSuffix = (status?: string | null): string => {
    const raw = String(status || '').toLowerCase()
    if (!raw) return ''
    if (raw.includes('online class') || raw.includes('online_class')) return ' (Online Class)'
    if (raw.includes('reporting')) return ' (Reporting)'
    return ''
  }

  const getExplicitStatusFromLog = (log: any): string => {
    if (!log) return ''
    const rawStatus = String(log?.attendance_status || '').trim()
    if (!rawStatus) return ''
    const normalized = rawStatus.toLowerCase().replace(/_/g, '-')
    if (normalized === 'absent') {
      const notes = String(log?.notes || '').trim()
      if (/^leave approved:/i.test(notes)) return 'leave'
    }
    return rawStatus
  }

  const normalizeReportStatusLabel = (status?: string | null): string => {
    const raw = String(status || '').trim()
    if (!raw) return ''

    const suffix = getStatusContextSuffix(raw)
    const withSuffix = (label: string): string => {
      if (!suffix) return label
      const lower = label.toLowerCase()
      if (lower.includes('online class') || lower.includes('reporting')) return label
      return `${label}${suffix}`
    }

    const s = raw.toLowerCase().replace(/_/g, '-')

    if (s === 'rest-day' || s === 'rest day') return 'Rest Day (Sunday)'
    if (s.includes('holiday')) return 'Holiday'
    if (s === 'absent') return 'Absent'
    if (s === 'leave' || s === 'on-leave' || s === 'on leave') return 'Absent (Leave)'
    if (s === 'excused') return 'Absent (Excused)'
    if (s === 'missed-log' || s === 'missed log') return 'Missed Log'
    if (s === 'admin-time' || s === 'admin' || s.includes('admin')) return 'Admin Time'
    if (s.includes('late') && s.includes('undertime')) return withSuffix('Late/Undertime')
    if (s.includes('late') && s.includes('on-time')) return withSuffix('Late/On-Time')
    if (s.includes('on-time') && s.includes('undertime')) return withSuffix('On-Time/Undertime')
    if (s.includes('late')) return withSuffix('Late')
    if (s.includes('undertime')) return withSuffix('Undertime')
    if (s === 'on-time' || s === 'present') return withSuffix('On-Time')

    return ''
  }

  const formatDtrStatusLabel = (rawStatus: string | null, hasInLog: boolean, hasOutLog: boolean): string => {
    const base = normalizeReportStatusLabel(rawStatus)

    const missingOut = hasInLog && !hasOutLog
    const missingIn = !hasInLog && hasOutLog
    const missedSuffix = missingOut
      ? 'Missed Log (Time Out Only)'
      : 'Missed Log (Time In Only)'

    if (!base) {
      return missingOut || missingIn ? missedSuffix : ''
    }

    if (base === 'Rest Day (Sunday)') return base
    if (!missingOut && !missingIn) return base
    if (base === 'Missed Log') return missedSuffix

    let adjustedBase = base
    if (missingOut) {
      if (adjustedBase === 'Late/On-Time') adjustedBase = 'Late'
      if (adjustedBase === 'On-Time/Undertime') adjustedBase = 'Undertime'
    } else if (missingIn) {
      if (adjustedBase === 'Late/On-Time') adjustedBase = 'On-Time'
      if (adjustedBase === 'On-Time/Undertime') adjustedBase = 'Undertime'
    }

    return adjustedBase ? `${adjustedBase} / ${missedSuffix}` : missedSuffix
  }

  const isAbsentStatus = (status?: string | null): boolean => {
    const s = String(status || '').trim().toLowerCase().replace(/_/g, '-')
    return s === 'absent' || s === 'leave' || s === 'excused' || s === 'on-leave' || s === 'on leave'
  }

  const isAbsentAttendanceLog = (log: any): boolean => {
    return isAbsentStatus(log?.attendance_status)
  }

  const isTimedInLog = (log: any): boolean => {
    return String(log?.log_type || '').toUpperCase() === 'IN' && !isAbsentAttendanceLog(log)
  }

  const isTimedOutLog = (log: any): boolean => {
    return String(log?.log_type || '').toUpperCase() === 'OUT'
  }

  const getLocalUser = () => {
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem('rams_user')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  const isVisibleToCurrentUser = (employee: any) => {
    const staffTypeFilter = getStaffFilter()
    if (!staffTypeFilter) return true
    return employee?.staff_type === staffTypeFilter
  }

  const formatEmployeeNameLastFirst = (fullName?: string | null): string => {
    const raw = String(fullName || '').trim()
    if (!raw) return 'Unknown Employee'
    if (raw.includes(',')) return raw

    const parts = raw.split(/\s+/).filter(Boolean)
    if (parts.length <= 1) return raw

    const last = parts[parts.length - 1]
    const firstMiddle = parts.slice(0, -1).join(' ')
    return `${last}, ${firstMiddle}`
  }

  const fetchReportAttendanceLogs = async (params: {
    employeeId?: number
    dateFrom?: string
    dateTo?: string
    department?: string
    staffType?: 'Teaching' | 'Non-Teaching' | null
    limit?: number
  }) => {
    const qs = new URLSearchParams()
    if (params.employeeId) qs.set('employeeId', String(params.employeeId))
    if (params.dateFrom) qs.set('dateFrom', params.dateFrom)
    if (params.dateTo) qs.set('dateTo', params.dateTo)
    if (params.department && params.department !== 'all') qs.set('department', params.department)
    if (params.staffType) qs.set('staffType', params.staffType)
    if (params.limit && params.limit > 0) qs.set('limit', String(params.limit))

    const res = await fetch(`/api/attendance/logs?${qs.toString()}`, { cache: 'no-store' })
    const body = await res.json().catch(() => ([]))
    if (!res.ok) {
      const message = (body as any)?.error || 'Failed to fetch attendance logs'
      throw new Error(message)
    }
    return Array.isArray(body) ? body : []
  }

  const toISO = (d: Date) => {
    try {
      if (!d || isNaN(d.getTime())) {
        console.error('toISO: Invalid date provided', d)
        return getManilaToday() // Fallback to today
      }
      return toManilaDate(d)
    } catch (error) {
      console.error('toISO error:', error, 'date:', d)
      return getManilaToday() // Fallback to today
    }
  }
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"]
  const ordinal = (n: number) => {
    const s = ["th","st","nd","rd"], v = n % 100
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }
  // CRITICAL FIX: Use Manila timezone for date display to prevent timezone shifting
  const humanRange = (from: Date, to: Date) => {
    // Use formatManilaDateLong to get the correct date in Manila timezone
    const fromStr = formatManilaLong(from)
    const toStr = formatManilaLong(to)
    
    // Extract day and month from formatted strings
    const fromMatch = fromStr.match(/(\w+)\s+(\d+),/)
    const toMatch = toStr.match(/(\w+)\s+(\d+),/)
    
    if (fromMatch && toMatch) {
      const fromDay = parseInt(fromMatch[2], 10)
      const toDay = parseInt(toMatch[2], 10)
      const fromMonth = fromMatch[1]
      const toMonth = toMatch[1]
      return `${ordinal(fromDay)} day of ${fromMonth} until ${ordinal(toDay)} of ${toMonth}`
    }
    
    // Fallback: use date-fns-tz formatInTimeZone directly
    const fromDay = parseInt(formatInTimeZone(from, MANILA_TZ, 'd'), 10)
    const toDay = parseInt(formatInTimeZone(to, MANILA_TZ, 'd'), 10)
    const fromMonthIdx = parseInt(formatInTimeZone(from, MANILA_TZ, 'M'), 10) - 1
    const toMonthIdx = parseInt(formatInTimeZone(to, MANILA_TZ, 'M'), 10) - 1
    return `${ordinal(fromDay)} day of ${monthNames[fromMonthIdx]} until ${ordinal(toDay)} of ${monthNames[toMonthIdx]}`
  }

  // Cutoff mode for employee detail modal (simplified to dropdown)
  const [cutoffMode, setCutoffMode] = useState<'26-10' | '11-25'>('26-10')
  const [fromPopoverOpen, setFromPopoverOpen] = useState(false)
  const [toPopoverOpen, setToPopoverOpen] = useState(false)
  
  const computeCutoffRange = (mode: '26-10' | '11-25', ref: Date = new Date()) => {
    // CRITICAL: Use Manila timezone to avoid timezone-related date calculation errors
    const phNow = formatInTimeZone(ref, PH_TZ, 'yyyy-MM-dd')
    const [yearStr, monthStr, dayStr] = phNow.split('-')
    const year = parseInt(yearStr, 10)
    const month = parseInt(monthStr, 10) - 1 // Convert to 0-based
    const day = parseInt(dayStr, 10)
    
    if (mode === '26-10') {
      // Always show: Previous month 26 to Current month 10
      // The range always ends at the 10th of the current month
      const startMonth = month - 1  // Always previous month for the 26th
      const endMonth = month          // Always current month for the 10th
      
      // Handle year/month wrapping
      const startYear = startMonth < 0 ? year - 1 : year
      const normalizedStartMonth = ((startMonth % 12) + 12) % 12
      const endYear = endMonth < 0 || endMonth > 11 ? (endMonth < 0 ? year - 1 : year + 1) : year
      const normalizedEndMonth = ((endMonth % 12) + 12) % 12
      
      // Create date strings in Manila timezone format (month is 1-based for string format)
      const startStr = `${startYear}-${String(normalizedStartMonth + 1).padStart(2, '0')}-26`
      const endStr = `${endYear}-${String(normalizedEndMonth + 1).padStart(2, '0')}-10`
      
      // CRITICAL FIX: Use createManilaDate utility to ensure correct Manila timezone dates
      const [startYearNum, startMonthNum, startDayNum] = startStr.split('-').map(Number)
      const [endYearNum, endMonthNum, endDayNum] = endStr.split('-').map(Number)
      
      // Create dates using Manila timezone utility (ensures correct date regardless of browser timezone)
      const start = createManilaDate(startYearNum, startMonthNum, startDayNum, 0, 0, 0)
      const end = createManilaDate(endYearNum, endMonthNum, endDayNum, 23, 59, 59)
      return { start, end }
    } else {
      // 11–25 window - spans from 11th to 25th of the SAME month
      // - If today >= 11: current month's 11 to 25
      // - Else: previous month's 11 to 25
      const targetMonth = day >= 11 ? month : month - 1
      
      // Create dates in Manila timezone by parsing ISO strings
      const targetYear = targetMonth < 0 ? year - 1 : (targetMonth > 11 ? year + 1 : year)
      const normalizedTargetMonth = ((targetMonth % 12) + 12) % 12
      
      const startStr = `${targetYear}-${String(normalizedTargetMonth + 1).padStart(2, '0')}-11`
      const endStr = `${targetYear}-${String(normalizedTargetMonth + 1).padStart(2, '0')}-25`
      
      // CRITICAL FIX: Use createManilaDate utility to ensure correct Manila timezone dates
      const [startYearNum, startMonthNum, startDayNum] = startStr.split('-').map(Number)
      const [endYearNum, endMonthNum, endDayNum] = endStr.split('-').map(Number)
      
      // Create dates using Manila timezone utility (ensures correct date regardless of browser timezone)
      const start = createManilaDate(startYearNum, startMonthNum, startDayNum, 0, 0, 0)
      const end = createManilaDate(endYearNum, endMonthNum, endDayNum, 23, 59, 59)
      return { start, end }
    }
  }
  
  // Calculate full cutoff range from a selected date
  // When a date is selected, automatically calculate the full range for that cutoff period
  const calculateRangeFromDate = (selectedDate: Date, mode: '26-10' | '11-25') => {
    // CRITICAL: Use Manila timezone to get correct date values
    const phDate = formatInTimeZone(selectedDate, PH_TZ, 'yyyy-MM-dd')
    const [yearStr, monthStr, dayStr] = phDate.split('-')
    const year = parseInt(yearStr, 10)
    const month = parseInt(monthStr, 10) - 1 // Convert to 0-based
    const day = parseInt(dayStr, 10)
    
    if (mode === '11-25') {
      // If date is between 11-25, set range from 11th to 25th of the SAME month
      // Example: Pick October 11 → range is October 11 - October 25
      // Example: Pick October 20 → range is October 11 - October 25
      const startStr = `${year}-${String(month + 1).padStart(2, '0')}-11`
      const endStr = `${year}-${String(month + 1).padStart(2, '0')}-25`
      const [startYearNum, startMonthNum, startDayNum] = startStr.split('-').map(Number)
      const [endYearNum, endMonthNum, endDayNum] = endStr.split('-').map(Number)
      return {
        from: createManilaDate(startYearNum, startMonthNum, startDayNum, 0, 0, 0),
        to: createManilaDate(endYearNum, endMonthNum, endDayNum, 23, 59, 59)
      }
    } else {
      // 26-10 mode
      if (day >= 26 && day <= 31) {
        // Selected date is 26-31, so range is from 26th of current month to 10th of next month
        // Example: Pick September 26 → range is September 26 - October 10
        const startStr = `${year}-${String(month + 1).padStart(2, '0')}-26`
        const nextMonth = month + 1
        const nextYear = nextMonth > 11 ? year + 1 : year
        const normalizedNextMonth = ((nextMonth % 12) + 12) % 12
        const endStr = `${nextYear}-${String(normalizedNextMonth + 1).padStart(2, '0')}-10`
        const [startYearNum, startMonthNum, startDayNum] = startStr.split('-').map(Number)
        const [endYearNum, endMonthNum, endDayNum] = endStr.split('-').map(Number)
        return {
          from: createManilaDate(startYearNum, startMonthNum, startDayNum, 0, 0, 0),
          to: createManilaDate(endYearNum, endMonthNum, endDayNum, 23, 59, 59)
        }
      } else if (day >= 1 && day <= 10) {
        // Selected date is 1-10, so range is from 26th of previous month to 10th of current month
        // Example: Pick October 5 → range is September 26 - October 10
        const prevMonth = month - 1
        const prevYear = prevMonth < 0 ? year - 1 : year
        const normalizedPrevMonth = ((prevMonth % 12) + 12) % 12
        const startStr = `${prevYear}-${String(normalizedPrevMonth + 1).padStart(2, '0')}-26`
        const endStr = `${year}-${String(month + 1).padStart(2, '0')}-10`
        const [startYearNum, startMonthNum, startDayNum] = startStr.split('-').map(Number)
        const [endYearNum, endMonthNum, endDayNum] = endStr.split('-').map(Number)
        return {
          from: createManilaDate(startYearNum, startMonthNum, startDayNum, 0, 0, 0),
          to: createManilaDate(endYearNum, endMonthNum, endDayNum, 23, 59, 59)
        }
      }
      // Fallback: should not happen due to disabled dates, but just in case
      const prevMonth = month - 1
      const prevYear = prevMonth < 0 ? year - 1 : year
      const normalizedPrevMonth = ((prevMonth % 12) + 12) % 12
      const startStr = `${prevYear}-${String(normalizedPrevMonth + 1).padStart(2, '0')}-26`
      const endStr = `${year}-${String(month + 1).padStart(2, '0')}-10`
      const [startYearNum, startMonthNum, startDayNum] = startStr.split('-').map(Number)
      const [endYearNum, endMonthNum, endDayNum] = endStr.split('-').map(Number)
      return {
        from: createManilaDate(startYearNum, startMonthNum, startDayNum, 0, 0, 0),
        to: createManilaDate(endYearNum, endMonthNum, endDayNum, 23, 59, 59)
      }
    }
  }

  const getManilaDayOfMonth = (date: Date): number => Number(formatInTimeZone(date, PH_TZ, 'd'))

  const isDateAllowedForCutoff = (date: Date, mode: '26-10' | '11-25'): boolean => {
    if (date.getDay() === 0) return false
    const day = getManilaDayOfMonth(date)
    if (mode === '11-25') {
      return day >= 11 && day <= 25
    }
    return day >= 26 || day <= 10
  }
  
  const applyCutoff = () => {
    const { start, end } = computeCutoffRange(cutoffMode, new Date())
    if (detailEmployee) {
      // Update dateRange for detail modal display
      setDateRange({ from: start, to: end })
      // reload detail with new cutoff
      void fetchEmployeeDetail(detailEmployee, start, end)
    }
  }

  const fetchEmployeeDetail = async (employee: any, from: Date, to: Date) => {
    try {
      setDetailDays([])
      setDetailSummary(null)

      // Then fetch the employee detail
      const res = await fetch(`/api/attendance/irregularities/detail?employeeId=${employee.employee_id}&start=${toISO(from)}&end=${toISO(to)}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to load details')
      setDetailDays(json.days || [])
      setDetailSummary(json.summary || null)
    } catch (e: any) {
      toast({ title: t('reports.error'), description: e?.message || 'Failed to load employee details', variant: 'destructive' })
    }
  }

  // Check if there are complete logs (at least one day with actual timeIn/timeOut data, excluding rest days)
  const hasCompleteLogs = () => {
    if (!detailDays || detailDays.length === 0) return false
    
    // Check if there's at least one day with actual attendance data
    const hasData = detailDays.some((day) => {
      // Exclude rest days (Sundays)
      const dateObj = new Date(day.date + 'T00:00:00')
      if (dateObj.getDay() === 0) return false // Skip Sundays
      
      // Check if there's actual timeIn or timeOut data (not null, not empty, not just "-")
      const hasTimeIn = day.timeIn && day.timeIn.trim() !== '' && day.timeIn !== '-'
      const hasTimeOut = day.timeOut && day.timeOut.trim() !== '' && day.timeOut !== '-'
      
      return hasTimeIn || hasTimeOut
    })
    
    return hasData
  }

  const formatDetailDayLabel = (dateValue: string): string => {
    const raw = String(dateValue || '').trim().slice(0, 10)
    if (!raw) return '-'
    try {
      const parsed = parseISO(`${raw}T00:00:00+08:00`)
      return formatInTimeZone(parsed, PH_TZ, 'MMM dd, yyyy (EEE)')
    } catch {
      return raw
    }
  }

  const formatDetailTimePH = (value?: string | null): string => {
    if (!value) return ''
    const raw = String(value).trim()
    const pref = getPreferredTimeFormat()

    const timeOnly = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
    if (timeOnly) {
      const hour = Number(timeOnly[1])
      const minute = timeOnly[2]
      if (pref === '24h') return `${String(hour).padStart(2, '0')}:${minute}`
      const ap = hour >= 12 ? ' PM' : ' AM'
      const hh = (hour % 12) || 12
      return `${hh}:${minute}${ap}`
    }

    const normalized = raw.includes(' ') ? raw.replace(' ', 'T') : raw
    const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
    const hasDateTimeNoOffset = /^\d{4}-\d{2}-\d{2}T\d{1,2}:\d{2}(:\d{2})?$/.test(normalized)
    const isoCandidate = hasDateTimeNoOffset && !hasOffset ? `${normalized}+08:00` : normalized

    try {
      const parsed = parseISO(isoCandidate as any)
      if (Number.isNaN(parsed.getTime())) return raw
      if (pref === '24h') return formatInTimeZone(parsed, PH_TZ, 'HH:mm')
      return formatInTimeZone(parsed, PH_TZ, 'h:mm a').replace(/\s?am/i, ' AM').replace(/\s?pm/i, ' PM')
    } catch {
      return raw
    }
  }

  const formatMinutesToHoursLabel = (minutes?: number | null): string => {
    const safe = Math.max(0, Number(minutes || 0))
    const hrs = Math.floor(safe / 60)
    const mins = safe % 60
    if (hrs === 0) return `${mins}m`
    if (mins === 0) return `${hrs}h`
    return `${hrs}h ${mins}m`
  }

  const adminBreakdownDays = (detailDays || []).filter((day) => {
    const status = String(day.status || '').toLowerCase()
    return status.includes('admin')
  })

  const totalAdminBreakdownMinutes = adminBreakdownDays.reduce((sum, day) => {
    return sum + Math.max(0, Number(day.adminMinutes || 0))
  }, 0)

  const calculateAttendanceStats = useCallback(async () => {
    // Use mainReportDateRange for calculations (preserved when opening detail modal)
    const effectiveDateRange = mainReportDateRange
    console.log('Reports: Calculating attendance statistics', {
      dateFrom: effectiveDateRange.from,
      dateTo: effectiveDateRange.to,
      totalLogs: attendanceLogs.length
    })
    
    // Calculate total days in the date range (excluding Sundays)
    const totalDaysInRange = Math.ceil((effectiveDateRange.to.getTime() - effectiveDateRange.from.getTime()) / (1000 * 60 * 60 * 24)) + 1
    let workingDays = 0
    for (let d = new Date(effectiveDateRange.from); d <= effectiveDateRange.to; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 0) workingDays++ // Exclude Sundays
    }
    
    console.log('Reports: Total working days in range:', workingDays)
    
    // Filter logs by date range (using date string comparison for accuracy)
    const filteredLogs = attendanceLogs.filter((log) => {
      if (!log.date) return false
      const logDateStr = log.date.substring(0, 10) // Get YYYY-MM-DD format
      const fromStr = effectiveDateRange.from.toISOString().substring(0, 10)
      const toStr = effectiveDateRange.to.toISOString().substring(0, 10)
      return logDateStr >= fromStr && logDateStr <= toStr
    })

    console.log('Reports: Filtered logs count:', filteredLogs.length)
    console.log('Reports: Date range:', {
      from: effectiveDateRange.from.toISOString().substring(0, 10),
      to: effectiveDateRange.to.toISOString().substring(0, 10),
      sampleLogs: filteredLogs.slice(0, 3).map(l => ({
        date: l.date,
        employee_id: l.employee_id,
        attendance_status: l.attendance_status
      }))
    })

    // Generate all working days in the date range (using Manila timezone)
    const allWorkingDays: string[] = []
    const current = new Date(effectiveDateRange.from)
    current.setHours(0, 0, 0, 0)
    const end = new Date(effectiveDateRange.to)
    end.setHours(23, 59, 59, 999)
    
    while (current <= end) {
      const dateStr = current.toISOString().substring(0, 10)
      const dayOfWeek = current.getDay()
      
      if (dayOfWeek !== 0) { // Exclude Sundays
        allWorkingDays.push(dateStr)
      }
      
      current.setDate(current.getDate() + 1)
    }
    
    console.log('Reports: Generated working days:', allWorkingDays.length, 'days')

    // Get today's date for comparison
    const today = new Date().toISOString().split('T')[0]
    const todayDateObj = new Date()
    todayDateObj.setHours(0, 0, 0, 0)

    const employeeStats = await Promise.all(employees.map(async (employee) => {
      const employeeLogs = filteredLogs.filter((log) => log.employee_id === employee.employee_id)
      
      // Get employee's hire_date and start_date
      const hireDate = employee.hire_date
      const startDate = (employee as any).start_date || hireDate
      const hireDateObj = hireDate ? new Date(hireDate + 'T00:00:00+08:00') : null
      const startDateObj = startDate ? new Date(startDate + 'T00:00:00+08:00') : null
      
      // Fetch employee schedules for schedule-aware analytics (exam-first, interval-based).
      let teachingSchedules: any[] = []
      let examSchedules: any[] = []
      try {
        teachingSchedules = await getTeachingSchedulesForEmployee(employee.employee_id)
        examSchedules = await getExamSchedulesForEmployee(employee.employee_id)
      } catch (error) {
        console.warn(`[Reports] Error fetching schedules for employee ${employee.employee_id}:`, error)
      }

      const toMin = (t?: string | null): number | null => {
        if (!t) return null
        const raw = String(t).trim()
        const timePart = raw.includes('T')
          ? raw.split('T')[1]
          : (raw.includes(' ') ? raw.split(' ')[1] : raw)
        const [h, m] = String(timePart || '').split(':').map((x) => parseInt(x || '0', 10))
        if (Number.isNaN(h) || Number.isNaN(m)) return null
        return h * 60 + m
      }
      const toInterval = (startRaw?: string | null, endRaw?: string | null) => {
        const start = toMin(startRaw)
        const end = toMin(endRaw)
        if (start === null || end === null || end <= start) return null
        return { start, end }
      }
      const mergeIntervals = (intervals: Array<{ start: number; end: number }>) => {
        if (!intervals.length) return [] as Array<{ start: number; end: number }>
        const sorted = [...intervals].sort((a, b) => a.start - b.start)
        const merged: Array<{ start: number; end: number }> = [sorted[0]]
        for (let i = 1; i < sorted.length; i++) {
          const current = sorted[i]
          const last = merged[merged.length - 1]
          if (current.start <= last.end) {
            last.end = Math.max(last.end, current.end)
          } else {
            merged.push({ ...current })
          }
        }
        return merged
      }
      const getDateScheduleSegments = (dateStr: string): Array<{ start: number; end: number }> => {
        const dateObj = new Date(dateStr + 'T00:00:00+08:00')
        const dayOfWeek = dateObj.getDay()
        if (dayOfWeek === 0) return []

        const classSchedules = (teachingSchedules || []).filter((s: any) => Number(s?.day_of_week) === dayOfWeek)
        const examsOnExactDate = (examSchedules || []).filter((s: any) => String(s?.exam_date || '').slice(0, 10) === dateStr)
        const examsOnDay = (examSchedules || []).filter((s: any) => Number(s?.day_of_week) === dayOfWeek)
        const prioritizedExams = examsOnExactDate.length > 0 ? examsOnExactDate : examsOnDay
        const source = prioritizedExams.length > 0 ? prioritizedExams : classSchedules

        return mergeIntervals(
          source
            .map((s: any) => toInterval(s?.time_start, s?.time_end))
            .filter((slot: { start: number; end: number } | null): slot is { start: number; end: number } => slot !== null)
        )
      }
      
      // Initialize counters
      let presentDays = 0
      let lateDays = 0
      let undertimeDays = 0
      let absentDays = 0
      let effectiveWorkingDays = 0
      
      // Process each working day
      for (const dateStr of allWorkingDays) {
        const dateObj = new Date(dateStr + 'T00:00:00+08:00')
        const dateOnlyObj = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate())
        
        // CRITICAL: Skip if before hire_date (employee not hired yet)
        if (hireDateObj && dateOnlyObj < hireDateObj) continue
        
        // CRITICAL: Skip if on or before start_date (work hasn't started yet)
        // This ensures "Work has not started yet" employees are NOT counted as absent
        if (startDateObj && dateOnlyObj <= startDateObj) continue
        
        // Get logs for this date (match by date string, handling both full date and date-only formats)
        const dayLogs = employeeLogs.filter(log => {
          if (!log.date) return false
          const logDateStr = log.date.substring(0, 10) // Get YYYY-MM-DD format
          return logDateStr === dateStr
        })
        
        // CRITICAL: Check if any log has "work-not-started" or similar status
        // If work hasn't started according to logs, skip this day entirely
        const hasWorkNotStarted = dayLogs.some(log => 
          log.attendance_status && 
          ['work-not-started', 'work_not_started', 'not-started', 'not_started'].includes(log.attendance_status.toLowerCase())
        )
        
        if (hasWorkNotStarted) {
          // Employee work has not started yet - DO NOT count as absent, present, or working day
          // Skip this day entirely from all statistics
          continue
        }
        
        const scheduleSegments = getDateScheduleSegments(dateStr)
        const hasSchedule = scheduleSegments.length > 0
        if (!hasSchedule) continue

        // Count only days with actual schedule windows as effective working days.
        effectiveWorkingDays++

        const timedLogs = dayLogs
          .filter((log: any) => {
            const type = String(log?.log_type || '').toUpperCase()
            return type === 'IN' || type === 'OUT'
          })
          .sort((a: any, b: any) => String(a?.log_time || '').localeCompare(String(b?.log_time || '')))

        const attendanceIntervals: Array<{ start: number; end: number }> = []
        let openIn: number | null = null
        for (const log of timedLogs) {
          const type = String(log?.log_type || '').toUpperCase()
          const minutes = toMin(log?.log_time)
          if (minutes === null) continue
          if (type === 'IN') {
            openIn = minutes
            continue
          }
          if (type === 'OUT') {
            if (openIn !== null && minutes > openIn) {
              attendanceIntervals.push({ start: openIn, end: minutes })
            }
            openIn = null
          }
        }

        const mergedAttendanceIntervals = mergeIntervals(attendanceIntervals)
        if (mergedAttendanceIntervals.length === 0) {
          // Do not auto-mark absent when there are no logs.
          // Count absent only when an explicit absent-like status exists in logs.
          const hasExplicitAbsent = dayLogs.some((log: any) => isAbsentStatus(log?.attendance_status))
          if (hasExplicitAbsent) {
            absentDays++
          }
          continue
        }

        presentDays++

        const sortedScheduleSegments = [...scheduleSegments].sort((a, b) => a.start - b.start)
        const expectedStart = sortedScheduleSegments[0]?.start ?? null
        const expectedEnd = sortedScheduleSegments[sortedScheduleSegments.length - 1]?.end ?? null
        const actualStart = Math.min(...mergedAttendanceIntervals.map((iv) => iv.start))
        const actualEnd = Math.max(...mergedAttendanceIntervals.map((iv) => iv.end))

        // Anchor rule for analytics:
        // - Late only against first block start
        // - Undertime only against last block end
        const dayLate = expectedStart !== null ? actualStart > expectedStart : false
        const dayUndertime = expectedEnd !== null ? actualEnd < expectedEnd : false

        if (dayLate) lateDays++
        if (dayUndertime) undertimeDays++
      }
      
      const attendanceRate = effectiveWorkingDays > 0 ? Math.round((presentDays / effectiveWorkingDays) * 100) : 0
      const punctualityRate = presentDays > 0 ? Math.round(((presentDays - lateDays) / presentDays) * 100) : 0

      return {
        employee_id: employee.employee_id,
        full_name: employee.full_name,
        department: employee.department,
        total_days: workingDays,
        effective_working_days: effectiveWorkingDays,
        present_days: presentDays,
        late_days: lateDays,
        undertime_days: undertimeDays,
        absent_days: absentDays,
        attendance_rate: attendanceRate,
        punctuality_rate: punctualityRate,
      }
    }))

    console.log('Reports: Employee stats calculated:', {
      totalEmployees: employeeStats.length,
      sampleStats: employeeStats.slice(0, 5).map(s => ({
        name: s.full_name,
        present: s.present_days,
        late: s.late_days,
        undertime: s.undertime_days,
        absent: s.absent_days,
        effectiveDays: s.effective_working_days
      }))
    })
    return employeeStats
  }, [employees, attendanceLogs, mainReportDateRange])

  useEffect(() => {
    loadData()
    // Initialize with correct cutoff period based on today's date
    initializeCutoffPeriod()
  }, [])
  
  // Initialize cutoff period based on current date
  const initializeCutoffPeriod = () => {
    const today = new Date()
    const day = today.getDate()
    
    // Determine which cutoff period today falls into
    if (day >= 11 && day <= 25) {
      // Today is between 11-25, set to 11-25 period
      setSelectedCutoffPeriod('11-25')
      const cutoffRange = computeCutoffRange('11-25', today)
      setMainReportDateRange({ from: cutoffRange.start, to: cutoffRange.end })
    } else if (day >= 26 || day <= 10) {
      // Today is between 26-10, set to 26-10 period
      setSelectedCutoffPeriod('26-10')
      const cutoffRange = computeCutoffRange('26-10', today)
      setMainReportDateRange({ from: cutoffRange.start, to: cutoffRange.end })
    }
  }

  // Calculate attendance stats when data changes
  useEffect(() => {
    if (employees.length > 0 && attendanceLogs.length >= 0 && calculateAttendanceStats) {
      setIsCalculatingStats(true)
      calculateAttendanceStats().then((stats) => {
        setAttendanceStatsData(stats)
        setIsCalculatingStats(false)
      }).catch((error) => {
        console.error('Error calculating attendance stats:', error)
        setIsCalculatingStats(false)
      })
    }
  }, [calculateAttendanceStats])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const staffTypeFilter = getStaffFilter()
      console.log('[Reports] Loading data with staff filter:', staffTypeFilter)
      
      const [employeeData, logsData, dashboardStats, weekly, dept] = await Promise.all([
        getEmployees(false, true, false, staffTypeFilter), // Exclude archived employees (is_active = false), but include employees whose work hasn't started yet
        getAttendanceLogs(),
        getDashboardStats(staffTypeFilter), // Pass staff filter to dashboard stats
        getWeeklyAttendanceData(staffTypeFilter), // Pass staff filter to weekly data
        getDepartmentAttendanceData(staffTypeFilter), // Pass staff filter to department data
      ])

      // CRITICAL: Double-filter to ensure archived employees are excluded
      // Filter out any employees where is_active = false (archived)
      let activeEmployees = (employeeData || []).filter((emp: any) => 
        emp.is_active === true || emp.is_active === null || emp.is_active === undefined
      )
      
      // CRITICAL: Additional client-side staff type filtering
      // This is a safety net in case database filtering doesn't work properly
      if (staffTypeFilter) {
        activeEmployees = activeEmployees.filter((emp: any) => {
          // If staff_type is set, use it
          if (emp.staff_type) {
            return emp.staff_type === staffTypeFilter
          }
          
          // If staff_type is NULL/undefined, filter by department
          // Define Non-Teaching departments
          const nonTeachingDepts = ['Utility', 'Cashier', 'Accounting', 'Finance', 'HR', 'Admin', 'Maintenance', 'Security', 'Registrar', 'Library']
          const isNonTeaching = nonTeachingDepts.some(dept => 
            emp.department?.toLowerCase().includes(dept.toLowerCase())
          )
          
          // If filtering for Teaching, exclude non-teaching departments
          if (staffTypeFilter === 'Teaching') {
            return !isNonTeaching
          }
          
          // If filtering for Non-Teaching, include only non-teaching departments
          if (staffTypeFilter === 'Non-Teaching') {
            return isNonTeaching
          }
          
          return false // If we can't determine, exclude
        })
      }
      
      // Debug: Log employee data to verify filtering
      console.log('[Reports] Loaded employees:', {
        total: activeEmployees.length,
        staffTypes: activeEmployees.map((e: any) => ({ name: e.full_name, staff_type: e.staff_type, department: e.department })),
        filter: staffTypeFilter
      })

      setEmployees(activeEmployees)
      setAttendanceLogs(logsData || [])
      setStats(dashboardStats)
      setWeeklyTrend(Array.isArray(weekly) ? weekly : [])
      setDeptPerf(Array.isArray(dept) ? dept : [])
      
      // Load current user for DTR generation
      await loadCurrentUser()
    } catch (error) {
      console.error("Error loading reports data:", error)
      toast({
        title: t('reports.error'),
        description: t('reports.loading_error'),
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const normalizeAcademicTermsPayload = (payload: any): any[] => {
    if (Array.isArray(payload)) return payload
    if (Array.isArray(payload?.data)) return payload.data
    if (Array.isArray(payload?.terms)) return payload.terms
    return []
  }

  const getSemesterFromTermName = (termName?: string | null): string => {
    const name = String(termName || '').toLowerCase()
    if (name.includes('1st')) return '1st Semester'
    if (name.includes('2nd')) return '2nd Semester'
    if (name.includes('summer')) return 'Summer'
    return '1st Semester'
  }

  const syncDTRAcademicTermFields = (activeTerm: any) => {
    if (!activeTerm) return
    if (activeTerm.academic_year) {
      setFacultyDTRSchoolYear(activeTerm.academic_year)
    }
    setFacultyDTRSemester(getSemesterFromTermName(activeTerm.term_name))
  }

  // Load current user for "Generated by" field and auto-fill school year
  const loadCurrentUser = async () => {
    try {
      const user = getLocalUser()
      if (user) {
        setCurrentUser({ full_name: user.name || user.full_name || 'System', email: user.email || '' })
      }
      
      // Auto-fill school year and semester from active academic term
      const termsRes = await fetch('/api/academic-terms', { cache: 'no-store' })
      const termsPayload = termsRes.ok ? await termsRes.json().catch(() => []) : []
      const termsList = normalizeAcademicTermsPayload(termsPayload)
      const terms = termsList.find((term: any) => term?.is_active)
      
      if (terms) {
        syncDTRAcademicTermFields(terms)
      }
    } catch (error) {
      console.error('Error loading current user or academic term:', error)
    }
  }

  // Generate Faculty DTR
  const handleGenerateFacultyDTR = async () => {
    if (facultyDTREmployee === 'all') {
      showErrorDialog('No Employee Selected', 'Please select an employee to generate DTR')
      return
    }

    if (!facultyDTRSchoolYear) {
      showErrorDialog('Missing School Year', 'Please enter a school year (e.g., 2025-2026)')
      return
    }

    try {
      setGeneratingDTR(true)

      // Get selected employee
      const employee = employees.find(e => e.employee_id.toString() === facultyDTREmployee)
      if (!employee) {
        showErrorDialog('Employee Not Found', 'Selected employee not found')
        return
      }

      // Get date range from mainReportDateRange (which reflects the selected cutoff period or custom date)
      const startDate = toISO(mainReportDateRange.from)
      const endDate = toISO(mainReportDateRange.to)

      // DEBUG: Log the exact parameters that will be used for the local API query
      const queryParams = {
        endpoint: '/api/attendance/logs',
        filters: {
          employee_id: employee.employee_id,
          date_gte: startDate,
          date_lte: endDate
        }
      }
      console.log('[handleGenerateFacultyDTR] Local API query params:', queryParams)

      const attendanceLogs = await fetchReportAttendanceLogs({
        employeeId: employee.employee_id,
        dateFrom: startDate,
        dateTo: endDate,
        limit: 5000,
      })
      // DEBUG: Log raw SQL fetch result structure to help diagnose missing status rows
      try {
        console.log('[handleGenerateFacultyDTR] Fetched attendance_logs', {
          employee_id: employee.employee_id,
          startDate,
          endDate,
          count: attendanceLogs.length,
          sample: attendanceLogs.slice(0, 20)
        })
      } catch (e) {
        console.debug('[handleGenerateFacultyDTR] Failed to log attendanceLogs debug', e)
      }

      // If nothing was found in the wide query, run a focused query for the suspect date to double-check
      try {
        const focusDate = '2025-12-01'
        if ((attendanceLogs || []).length === 0) {
          console.log('[handleGenerateFacultyDTR] No rows returned for full range — running focused query for', focusDate)
          const singleDayRows = await fetchReportAttendanceLogs({
            employeeId: employee.employee_id,
            dateFrom: focusDate,
            dateTo: focusDate,
            limit: 500,
          })
          console.log('[handleGenerateFacultyDTR] Focused query rows for', focusDate, singleDayRows)
        }
      } catch (e) {
        console.debug('[handleGenerateFacultyDTR] Failed to run focused debug query', e)
      }

      // Group logs by date and properly pair IN/OUT logs
  const logsByDate: { [date: string]: { inLog?: any, outLog?: any, statusLog?: any, allLogs: any[] } } = {}
      
      attendanceLogs.forEach((log: any) => {
        if (!logsByDate[log.date]) {
          logsByDate[log.date] = { allLogs: [] }
        }
        logsByDate[log.date].allLogs.push(log)
        if (isTimedInLog(log)) {
          logsByDate[log.date].inLog = log
        } else if (isTimedOutLog(log)) {
          logsByDate[log.date].outLog = log
        } else {
          // Handle non-IN/OUT entries (e.g., absent records, leave markers)
          // Save as statusLog so pairing logic can pick up attendance_status like 'absent'
          logsByDate[log.date].statusLog = log
        }
      })

      // DEBUG: Inspect grouping results and whether a statusLog exists for specific dates
      try {
        const keys = Object.keys(logsByDate)
        console.log('[handleGenerateFacultyDTR] logsByDate keys count:', keys.length, 'sample keys:', keys.slice(0, 10))
        // Example focused check for Dec 1, 2025 (helpful for your reported case)
        const focusDate = '2025-12-01'
        if (logsByDate[focusDate]) {
          console.log(`[handleGenerateFacultyDTR] logsByDate[${focusDate}] =>`, logsByDate[focusDate])
        } else {
          console.log(`[handleGenerateFacultyDTR] No logs grouped for ${focusDate}`)
        }
      } catch (e) {
        console.debug('[handleGenerateFacultyDTR] Failed to log logsByDate debug', e)
      }

      // Fetch schedules once to compute accurate scheduled in/out per date
      const [teachSched, examSched] = await Promise.all([
        getTeachingSchedulesForEmployee(employee.employee_id),
        getExamSchedulesForEmployee(employee.employee_id),
      ])

      // Generate ALL dates in the cutoff period
      const allDates: string[] = []
      const startDateObj = new Date(startDate + 'T00:00:00+08:00')
      const endDateObj = new Date(endDate + 'T00:00:00+08:00')
      let currentDate = new Date(startDateObj)
      
      while (currentDate <= endDateObj) {
        allDates.push(format(currentDate, 'yyyy-MM-dd'))
        currentDate.setDate(currentDate.getDate() + 1)
      }

      const holidayRows = await fetch('/api/holidays', { cache: 'no-store' })
        .then((res) => res.json())
        .catch(() => [])
      const holidayList = Array.isArray(holidayRows) ? holidayRows : []

      const getHolidayForDate = (dateStr: string): any | null => {
        if (!dateStr || holidayList.length === 0) return null
        for (const holiday of holidayList) {
          const startDate = holiday.start_date || holiday.date
          const endDate = holiday.end_date || holiday.date
          if (!startDate || !endDate) continue
          if (dateStr >= startDate && dateStr <= endDate) return holiday
        }
        return null
      }

      const getHolidayContextForDate = (dateStr: string): { noTracking: boolean; suffix: string } => {
        const holiday = getHolidayForDate(dateStr)
        if (!holiday) return { noTracking: false, suffix: '' }
        const type = String(holiday.type || '').toLowerCase()
        const reportingOnly = Boolean(holiday.reporting_only)
        const affectsAttendance = Boolean(holiday.affects_attendance)

        if (affectsAttendance && type !== 'online_class') {
          return { noTracking: true, suffix: '' }
        }

        if (reportingOnly || type === 'suspended_asynchronous') {
          return { noTracking: false, suffix: ' (Reporting)' }
        }

        if (type === 'online_class') {
          return { noTracking: false, suffix: ' (Online Class)' }
        }

        return { noTracking: false, suffix: '' }
      }

      // Prefetch approved substitutions for all dates in range to refine schedule windows.
      const subsByDate = new Map<string, any[]>()
      await Promise.all(allDates.map(async (d) => {
        const subs = await getClassSubstitutionsForEmployeeOnDate(employee.employee_id, d)
        subsByDate.set(d, subs || [])
      }))

      const toNumericDay = (val: any): number | null => {
        if (typeof val === 'number') return val
        if (typeof val === 'string') {
          const upper = val.trim().toUpperCase()
          const map: Record<string, number> = { MONDAY:1,TUESDAY:2,WEDNESDAY:3,THURSDAY:4,FRIDAY:5,SATURDAY:6,SUNDAY:0, MON:1,TUE:2,WED:3,THU:4,FRI:5,SAT:6,SUN:0 }
          if (upper in map) return map[upper]
          const asNum = Number(val)
          return isNaN(asNum) ? null : asNum
        }
        return null
      }

      const parseToMinutes = (t?: string) => {
        if (!t) return null
        const [h,m] = t.split(':').map((x)=>parseInt(x||'0',10))
        return (h||0)*60 + (m||0)
      }
      const mmToStr = (mm:number)=>`${String(Math.floor(mm/60)).padStart(2,'0')}:${String(mm%60).padStart(2,'0')}:00`

      const getWindow = (dateStr: string): { start?: string, end?: string, segments: Array<{ start: number; end: number }> } => {
        try {
          const d = new Date(dateStr + 'T00:00:00+08:00')
          const dow = d.getDay()
          // Start with base schedules using strict exam-first priority.
          // If there are exams for the date/day, class schedules are ignored for that date.
          const classScheds = (teachSched || []).filter((s:any)=> toNumericDay(s?.day_of_week) === dow)
          const examSchedsForExactDate = (examSched || []).filter((s:any)=> {
            const examDate = String(s?.exam_date || '').slice(0, 10)
            return Boolean(examDate) && examDate === dateStr
          })
          const examSchedsForDay = (examSched || []).filter((s:any)=> toNumericDay(s?.day_of_week) === dow)
          const prioritizedExamScheds = examSchedsForExactDate.length > 0 ? examSchedsForExactDate : examSchedsForDay
          const prioritizedBaseScheds = prioritizedExamScheds.length > 0 ? prioritizedExamScheds : classScheds

          // Adjust using approved substitutions on this date
          const subs = subsByDate.get(dateStr) || []
          const toMin = (t?: string|null) => {
            if (!t) return null
            const [h,m] = String(t).split(':').map((x)=>parseInt(x||'0',10))
            return (h||0)*60 + (m||0)
          }

          const mergeIntervals = (intervals: Array<{ start: number; end: number }>) => {
            if (!intervals.length) return [] as Array<{ start: number; end: number }>
            const sorted = [...intervals].sort((a, b) => a.start - b.start)
            const merged: Array<{ start: number; end: number }> = [sorted[0]]
            for (let i = 1; i < sorted.length; i++) {
              const current = sorted[i]
              const last = merged[merged.length - 1]
              if (current.start <= last.end) {
                last.end = Math.max(last.end, current.end)
              } else {
                merged.push({ ...current })
              }
            }
            return merged
          }

          const subtractIntervals = (
            base: Array<{ start: number; end: number }>,
            removals: Array<{ start: number; end: number }>
          ) => {
            let result = [...base]
            for (const rem of removals) {
              const next: Array<{ start: number; end: number }> = []
              for (const b of result) {
                if (rem.end <= b.start || rem.start >= b.end) {
                  next.push(b)
                  continue
                }
                if (rem.start > b.start) next.push({ start: b.start, end: rem.start })
                if (rem.end < b.end) next.push({ start: rem.end, end: b.end })
              }
              result = next
            }
            return result.filter((r) => r.end > r.start)
          }

          const toInterval = (startRaw?: string, endRaw?: string) => {
            const start = toMin(startRaw)
            const end = toMin(endRaw)
            if (start === null || end === null || end <= start) return null
            return { start, end }
          }

          const baseIntervals = prioritizedBaseScheds
            .map((s:any) => toInterval(String(s.time_start), String(s.time_end)))
            .filter(Boolean) as Array<{ start: number; end: number }>

          const originalWindows = subs
            .filter((s:any)=> s.original_employee_id === employee.employee_id)
            .map((s:any)=> toInterval(String(s.start_time), String(s.end_time)))
            .filter(Boolean) as Array<{ start: number; end: number }>

          const remainingIntervals = subtractIntervals(baseIntervals, mergeIntervals(originalWindows))

          const substituteWindows = subs
            .filter((s:any)=> s.substitute_employee_id === employee.employee_id)
            .map((s:any)=> toInterval(String(s.start_time), String(s.end_time)))
            .filter(Boolean) as Array<{ start: number; end: number }>

          const effectiveIntervals = mergeIntervals([...remainingIntervals, ...substituteWindows])

          if (effectiveIntervals.length === 0) {
            const isTeaching = String(employee?.staff_type || '').toLowerCase() === 'teaching'
            if (!isTeaching && employee?.schedule_time_in && employee?.schedule_time_out) {
              return {
                start: String(employee.schedule_time_in),
                end: String(employee.schedule_time_out),
                segments: [
                  {
                    start: parseToMinutes(String(employee.schedule_time_in)) || 0,
                    end: parseToMinutes(String(employee.schedule_time_out)) || 0,
                  }
                ].filter((s) => s.end > s.start),
              }
            }
            return { segments: [] }
          }

          const starts = effectiveIntervals.map((i) => i.start)
          const ends = effectiveIntervals.map((i) => i.end)
          return {
            start: mmToStr(Math.min(...starts)),
            end: mmToStr(Math.max(...ends)),
            segments: effectiveIntervals,
          }
        } catch { return { segments: [] } }
      }

      // Transform ALL dates to AttendanceLog format (including dates without logs)
      const pairedLogs: AttendanceLog[] = allDates.map(date => {
        const { inLog, outLog, allLogs = [] } = logsByDate[date] || { allLogs: [] }
        const win = getWindow(date)

        const toMinutesFromLog = (log: any): number | null => {
          try {
            const src = String(log?.log_time || '').trim()
            if (!src) return null
            const dt = src.includes('T') || src.includes(' ') ? new Date(src) : new Date(`${date}T${src}`)
            if (!Number.isNaN(dt.getTime())) {
              const hh = Number(formatInTimeZone(dt, PH_TZ, 'HH'))
              const mm = Number(formatInTimeZone(dt, PH_TZ, 'mm'))
              return hh * 60 + mm
            }
            const timePart = src.includes('T') ? src.split('T')[1] : src
            const [h, m] = timePart.split(':').map((x) => parseInt(x || '0', 10))
            if (Number.isNaN(h) || Number.isNaN(m)) return null
            return h * 60 + m
          } catch {
            return null
          }
        }

        const orderedLogs = [...allLogs].sort((a: any, b: any) => {
          const aMin = toMinutesFromLog(a)
          const bMin = toMinutesFromLog(b)
          return Number(aMin || 0) - Number(bMin || 0)
        })

        const attendanceIntervals: Array<{ start: number; end: number }> = []
        let currentIn: number | null = null
        for (const log of orderedLogs) {
          if (String(log?.log_type || '').toUpperCase() === 'IN') {
            const inMin = toMinutesFromLog(log)
            if (inMin !== null) currentIn = inMin
            continue
          }
          if (String(log?.log_type || '').toUpperCase() === 'OUT') {
            const outMin = toMinutesFromLog(log)
            if (currentIn !== null && outMin !== null && outMin > currentIn) {
              attendanceIntervals.push({ start: currentIn, end: outMin })
            }
            currentIn = null
          }
        }

        const effectiveSegments = win.segments || []
        const computeAdminGapMinutes = (segments: Array<{ start: number; end: number }>): number => {
          if (!segments || segments.length < 2) return 0
          const sorted = [...segments].sort((a, b) => a.start - b.start)
          let totalGap = 0
          for (let i = 1; i < sorted.length; i++) {
            const gap = sorted[i].start - sorted[i - 1].end
            if (gap > 0) totalGap += gap
          }
          return totalGap
        }
        const hasAnyTimedLog = Boolean(inLog || outLog)
        const hasActualAttendanceIntervals = attendanceIntervals.length > 0
        const hasAttendanceData = hasAnyTimedLog || hasActualAttendanceIntervals
        const sortedScheduleSegments = [...effectiveSegments].sort((a, b) => a.start - b.start)
        const expectedStart = sortedScheduleSegments.length > 0 ? sortedScheduleSegments[0].start : null
        const expectedEnd = sortedScheduleSegments.length > 0 ? sortedScheduleSegments[sortedScheduleSegments.length - 1].end : null
        const teachingMinutes = sortedScheduleSegments.reduce((sum, segment) => {
          const duration = Number(segment.end) - Number(segment.start)
          return duration > 0 ? sum + duration : sum
        }, 0)
        const teachingHours = Math.round((teachingMinutes / 60) * 100) / 100
        const firstAttendanceIn = hasActualAttendanceIntervals
          ? Math.min(...attendanceIntervals.map((iv) => iv.start))
          : null
        const lastAttendanceOut = hasActualAttendanceIntervals
          ? Math.max(...attendanceIntervals.map((iv) => iv.end))
          : null

        const adminGapMinutes = computeAdminGapMinutes(effectiveSegments)
        const overtimeMinutes =
          expectedEnd !== null && lastAttendanceOut !== null
            ? Math.max(0, lastAttendanceOut - expectedEnd)
            : 0
        const adminTotalMinutes = adminGapMinutes + overtimeMinutes
        const adminGapHours = Math.round((adminTotalMinutes / 60) * 100) / 100

        // Anchor rule:
        // - Late compares only against first scheduled start.
        // - Undertime compares only against last scheduled end.
        const lateMinutes =
          expectedStart !== null && firstAttendanceIn !== null
            ? Math.max(0, firstAttendanceIn - expectedStart)
            : Math.max(0, inLog?.late_minutes || 0)
        const undertimeMinutes =
          expectedEnd !== null && lastAttendanceOut !== null
            ? Math.max(0, expectedEnd - lastAttendanceOut)
            : (outLog ? Math.max(0, outLog?.undertime_minutes || 0) : 0)
        
  const statusLog = logsByDate[date]?.statusLog
  const statusLogStatus = getExplicitStatusFromLog(statusLog)
  const inStatus = getExplicitStatusFromLog(inLog)
  const outStatus = getExplicitStatusFromLog(outLog)
  const otherStatus = statusLogStatus || ''
  const holidayContext = getHolidayContextForDate(date)
        
        let combinedStatus = ''
        const hasLate = lateMinutes > 0 || /late/i.test(inStatus)
        const hasUndertime = undertimeMinutes > 0 || /undertime/i.test(outStatus)
        const hasOnTime = /on.?time|present/i.test(inStatus) || /on.?time|present/i.test(outStatus)
        const hasTimedPresence = Boolean(inLog || outLog)
        const hasOutEvidence = Boolean(outLog) || hasActualAttendanceIntervals
        
        if (hasLate && hasUndertime) {
          combinedStatus = `Late (${lateMinutes}m) / Undertime (${undertimeMinutes}m)`
        } else if (hasLate && hasOutEvidence && (hasOnTime || hasTimedPresence)) {
          combinedStatus = `Late (${lateMinutes}m) / On-Time`
        } else if (hasLate) {
          combinedStatus = `Late (${lateMinutes}m)`
        } else if (hasUndertime && hasOutEvidence && (hasOnTime || hasTimedPresence)) {
          combinedStatus = `On-Time / Undertime (${undertimeMinutes}m)`
        } else if (hasUndertime) {
          combinedStatus = `Undertime (${undertimeMinutes}m)`
        } else if (hasTimedPresence && hasOutEvidence) {
          combinedStatus = 'On-Time'
        } else {
          // Prefer explicit status logs (e.g., 'absent') when present
          combinedStatus = otherStatus || inStatus || outStatus || ''
        }

        const explicitStatusValue = otherStatus || inStatus || outStatus || ''
        const isExplicitOnlyStatus = /absent|leave|excused|missed[\s_-]?log/i.test(explicitStatusValue)
        const hasComputedStatus = hasTimedPresence || hasLate || hasUndertime || hasOnTime || hasOutEvidence || hasActualAttendanceIntervals

        if (holidayContext.noTracking && !isExplicitOnlyStatus) {
          combinedStatus = 'Holiday'
        } else if (holidayContext.suffix && hasComputedStatus && !isExplicitOnlyStatus && combinedStatus) {
          combinedStatus = `${combinedStatus}${holidayContext.suffix}`
        }
        
          // If there is a statusLog indicating 'absent' (or leave), and no in/out times, preserve the status
          if ((!inLog && !outLog) && statusLogStatus && /absent|leave|excused|missed[\s_-]?log/i.test(String(statusLogStatus))) {
            return {
              employee_id: statusLog.employee_id || employee.employee_id,
              date: date,
              time_in: null,
              time_out: null,
              scheduled_time_in: win.start || employee?.schedule_time_in || '08:00:00',
              scheduled_time_out: win.end || employee?.schedule_time_out || '17:00:00',
              attendance_status: String(statusLogStatus),
              is_late: false,
              late_minutes: 0,
              is_early_out: false,
              undertime_minutes: 0
            }
          }

          return {
          employee_id: inLog?.employee_id || outLog?.employee_id || employee.employee_id,
          date: date,
          time_in: inLog?.log_time || null,
          time_out: outLog?.log_time || null,
          scheduled_time_in: win.start || employee?.schedule_time_in || '08:00:00',
          scheduled_time_out: win.end || employee?.schedule_time_out || '17:00:00',
          attendance_status: combinedStatus,
          is_late: lateMinutes > 0,
          late_minutes: lateMinutes,
          is_early_out: undertimeMinutes > 0,
          undertime_minutes: undertimeMinutes,
          admin_gap_minutes: adminTotalMinutes,
          admin_gap_hours: adminGapHours,
          teaching_minutes: teachingMinutes,
          teaching_hours: teachingHours
        }
      })

      // DEBUG: Log pairedLogs and processedDailyRecords, and specifically inspect Dec 1, 2025
      try {
        console.log('[handleGenerateFacultyDTR] pairedLogs length:', pairedLogs.length)
        const focusDate = '2025-12-01'
        const found = pairedLogs.find(p => p.date === focusDate)
        if (found) {
          console.log(`[handleGenerateFacultyDTR] pairedLogs[${focusDate}] =>`, found)
        } else {
          console.log(`[handleGenerateFacultyDTR] No pairedLogs entry for ${focusDate}`)
        }
      } catch (e) {
        console.debug('[handleGenerateFacultyDTR] Failed to log pairedLogs debug', e)
      }

      // Calculate summary statistics
      let totalPresent = 0
      let totalLate = 0
      let totalAbsent = 0
      let totalEarlyOut = 0
      let totalAdminTime = 0
      
      pairedLogs.forEach(log => {
        if (isAbsentStatus(log.attendance_status)) {
          totalAbsent++
        } else if (log.attendance_status?.toLowerCase().includes('admin')) {
          totalAdminTime++
        } else if (log.time_in || log.time_out) {
          totalPresent++
          if (log.is_late) totalLate++
          if (log.is_early_out) totalEarlyOut++
        }
      })

      // Save report to database for history/caching
      const reportData = {
        cutoff_period: selectedCutoffPeriod,
        school_year: facultyDTRSchoolYear,
        semester: facultyDTRSemester,
        attendance_summary: {
          total_present: totalPresent,
          total_late: totalLate,
          total_absent: totalAbsent,
          total_early_out: totalEarlyOut,
          total_admin_time: totalAdminTime,
          total_late_minutes: pairedLogs.reduce((sum, log) => sum + (log.late_minutes || 0), 0),
          total_undertime_minutes: pairedLogs.reduce((sum, log) => sum + (log.undertime_minutes || 0), 0)
        }
      }

      // Report persistence is optional for DTR generation; skip hard dependency on remote clients.
      void reportData

      // Create DTR data object
      // Also build processedDailyRecords (same shape as bulk export path) so the
      // preview/print functions can consume the same structure.
      const processedDailyRecords = pairedLogs.map((p) => {
        const dateObj = new Date(p.date + 'T00:00:00+08:00')
        const isSunday = dateObj.getDay() === 0
        const teachingMinutes = Math.max(0, Number((p as any).teaching_minutes || 0))
        const teachingHours = Math.round((teachingMinutes / 60) * 100) / 100

        return {
          date: p.date,
          timeIn: toDtrTimeValue(p.time_in),
          timeOut: toDtrTimeValue(p.time_out),
          status: p.attendance_status || '',
          lateMinutes: p.late_minutes || 0,
          undertimeMinutes: p.undertime_minutes || 0,
          isSunday,
          // Count admin day only when there is a complete attendance pair.
          admin:
            ((Number((p as any).admin_gap_minutes || 0) > 0) || String(p.attendance_status || '').toLowerCase().includes('admin')) &&
            Boolean(p.time_in) &&
            Boolean(p.time_out),
          adminHours: Number((p as any).admin_gap_hours || 0),
          teachingMinutes,
          teachingHours
        }
      })

      const dtrData: DTRData = {
        facultyName: employee.full_name,
        department: employee.department || 'N/A',
        schoolYear: facultyDTRSchoolYear,
        semester: facultyDTRSemester,
        cutoffStart: startDate,
        cutoffEnd: endDate,
        // Keep raw paired logs for debugging and other consumers
        logs: pairedLogs,
        // Provide processedDailyRecords so generateSingleDTRHTML will use the
        // bulk-format path and correctly render statuses like 'Absent'
        processedDailyRecords,
        // Backwards-compatible alias (some code paths expect attendanceLogs)
        attendanceLogs: pairedLogs,
        employmentStatus: employee.employment_status || ''
      }

      // Build a preview payload expected by the UI components
      const previewPayload = {
        employee: employee,
        startDate: startDate,
        endDate: endDate,
        cutoffPeriod: selectedCutoffPeriod,
        logs: pairedLogs,
        processedDailyRecords,
      }

      // Set preview data and show preview
      // Keep the existing DTR debug object but pass a UI-shaped payload to preview states
      setFacultyDTRPreview(dtrData)
      setPreviewEmployeeData(previewPayload)
      setPreviewFacultyData(previewPayload)
      setShowFacultyDTRPreview(true)
    } catch (error: any) {
      console.error('Error generating DTR:', error)
      showErrorDialog('Generation Failed', error.message || 'Failed to generate DTR')
    } finally {
      setGeneratingDTR(false)
    }
  }

  const openEmployeeDetail = async (
    employee: any,
    preferredCutoff: '26-10' | '11-25' = selectedCutoffPeriod
  ) => {
    try {
      setDetailEmployee(employee)
      const def = computeCutoffRange(preferredCutoff, new Date())
      setCutoffMode(preferredCutoff)
      setDateRange({ from: def.start, to: def.end })
      setFromPopoverOpen(false)
      setToPopoverOpen(false)
      setDetailOpen(true)
      await fetchEmployeeDetail(employee, def.start, def.end)
    } catch (e: any) {
      toast({ title: t('reports.error'), description: e?.message || 'Failed to load employee details', variant: 'destructive' })
    }
  }

  // Show centered error dialog
  const showErrorDialog = (title: string, message: string) => {
    setErrorDialogTitle(title)
    setErrorDialogMessage(message)
    setErrorDialogOpen(true)
  }

  // Determine nearest cutoff period from a selected date
  const getNearestCutoffPeriod = (selectedDate: Date): { start: Date, end: Date, period: '26-10' | '11-25' } => {
    const day = selectedDate.getDate()
    
    // Determine which cutoff period the selected date falls into
    if (day >= 26) {
      // Falls in 26-10 period (26th of current month to 10th of next month)
      const cutoffRange = computeCutoffRange('26-10', selectedDate)
      return { start: cutoffRange.start, end: cutoffRange.end, period: '26-10' }
    } else if (day >= 11 && day <= 25) {
      // Falls in 11-25 period (11th to 25th of same month)
      const cutoffRange = computeCutoffRange('11-25', selectedDate)
      return { start: cutoffRange.start, end: cutoffRange.end, period: '11-25' }
    } else {
      // Falls in 1-10 period, belongs to previous 26-10 cutoff
      const cutoffRange = computeCutoffRange('26-10', selectedDate)
      return { start: cutoffRange.start, end: cutoffRange.end, period: '26-10' }
    }
  }

  // Open Faculty Timesheet Preview Modal
  const openFacultyTimesheetPreview = async (employee: any, cutoffPeriod: '26-10' | '11-25') => {
    try {
      const cutoffRange = computeCutoffRange(cutoffPeriod, new Date())
      const startDate = toISO(cutoffRange.start)
      const endDate = toISO(cutoffRange.end)

      // Fetch timesheet data
      const response = await fetch(
        `/api/attendance/logs?employee_id=${employee.employee_id}&start_date=${startDate}&end_date=${endDate}`
      )
      
      // Even if the response is not OK, still show the preview with empty logs
      let logs = []
      if (response.ok) {
        logs = await response.json() || []
      }

      // Also fetch schedules to compute accurate scheduled in/out per date
      const [teachingSchedules, examSchedules] = await Promise.all([
        getTeachingSchedulesForEmployee(employee.employee_id),
        getExamSchedulesForEmployee(employee.employee_id),
      ])

      // Helper: normalize day_of_week values to numeric (1=Mon..6=Sat, 0=Sun)
      const toNumericDay = (val: any): number | null => {
        if (typeof val === 'number') return val
        if (typeof val === 'string') {
          const upper = val.trim().toUpperCase()
          const map: Record<string, number> = { MONDAY:1,TUESDAY:2,WEDNESDAY:3,THURSDAY:4,FRIDAY:5,SATURDAY:6,SUNDAY:0, MON:1,TUE:2,WED:3,THU:4,FRI:5,SAT:6,SUN:0 }
          if (upper in map) return map[upper]
          const asNum = Number(val)
          return isNaN(asNum) ? null : asNum
        }
        return null
      }

      const getScheduleWindowForDate = async (dateStr: string): Promise<{start?: string, end?: string}> => {
        try {
          const d = new Date(dateStr + 'T00:00:00+08:00')
          const dow = d.getDay()
          // Teaching schedules on same day of week
          let classScheds = (teachingSchedules || []).filter((s: any)=> toNumericDay(s?.day_of_week) === dow)
          // Exams either fixed date or matching DOW
          let examScheds = (examSchedules || []).filter((s: any)=> (s?.exam_date && s.exam_date === dateStr) || toNumericDay(s?.day_of_week) === dow)

          // Fetch approved substitutions for this date and adjust windows
          const subs = await getClassSubstitutionsForEmployeeOnDate(employee.employee_id, dateStr)
          const toMin = (t?: string|null) => {
            if (!t) return null
            const [h,m] = String(t).split(':').map((x)=>parseInt(x||'0',10))
            return (h||0)*60 + (m||0)
          }

          const mergeIntervals = (intervals: Array<{ start: number; end: number }>) => {
            if (!intervals.length) return [] as Array<{ start: number; end: number }>
            const sorted = [...intervals].sort((a, b) => a.start - b.start)
            const merged: Array<{ start: number; end: number }> = [sorted[0]]
            for (let i = 1; i < sorted.length; i++) {
              const current = sorted[i]
              const last = merged[merged.length - 1]
              if (current.start <= last.end) {
                last.end = Math.max(last.end, current.end)
              } else {
                merged.push({ ...current })
              }
            }
            return merged
          }

          const subtractIntervals = (
            base: Array<{ start: number; end: number }>,
            removals: Array<{ start: number; end: number }>
          ) => {
            let result = [...base]
            for (const rem of removals) {
              const next: Array<{ start: number; end: number }> = []
              for (const b of result) {
                if (rem.end <= b.start || rem.start >= b.end) {
                  next.push(b)
                  continue
                }
                if (rem.start > b.start) next.push({ start: b.start, end: rem.start })
                if (rem.end < b.end) next.push({ start: rem.end, end: b.end })
              }
              result = next
            }
            return result.filter((r) => r.end > r.start)
          }

          const toInterval = (startRaw?: string, endRaw?: string) => {
            const start = toMin(startRaw)
            const end = toMin(endRaw)
            if (start === null || end === null || end <= start) return null
            return { start, end }
          }

          const baseIntervals = [
            ...classScheds.map((s:any) => toInterval(String(s.time_start), String(s.time_end))).filter(Boolean),
            ...examScheds.map((s:any) => toInterval(String(s.time_start), String(s.time_end))).filter(Boolean),
          ] as Array<{ start: number; end: number }>

          const originalWindows = (subs || [])
            .filter((s:any)=> s.original_employee_id === employee.employee_id)
            .map((s:any)=> toInterval(String(s.start_time), String(s.end_time)))
            .filter(Boolean) as Array<{ start: number; end: number }>

          const remainingIntervals = subtractIntervals(baseIntervals, mergeIntervals(originalWindows))

          const substituteWindows = (subs || [])
            .filter((s:any)=> s.substitute_employee_id === employee.employee_id)
            .map((s:any)=> toInterval(String(s.start_time), String(s.end_time)))
            .filter(Boolean) as Array<{ start: number; end: number }>

          const effectiveIntervals = mergeIntervals([...remainingIntervals, ...substituteWindows])

          if (effectiveIntervals.length === 0) {
            const isTeaching = String(employee?.staff_type || '').toLowerCase() === 'teaching'
            if (!isTeaching && employee?.schedule_time_in && employee?.schedule_time_out) {
              return { start: String(employee.schedule_time_in), end: String(employee.schedule_time_out) }
            }
            return {}
          }

          if (effectiveIntervals.length === 0) return {}

          // Compute earliest start and latest end from effective windows
          const starts = effectiveIntervals.map((i) => i.start)
          const ends = effectiveIntervals.map((i) => i.end)
          const minStart = Math.min(...starts)
          const maxEnd = Math.max(...ends)
          const mmToStr = (mm:number)=>`${String(Math.floor(mm/60)).padStart(2,'0')}:${String(mm%60).padStart(2,'0')}:00`
          return { start: mmToStr(minStart), end: mmToStr(maxEnd) }
        } catch { return {} }
      }

      // Group logs by date and compute paired representation with scheduled window
      const logsByDate: Record<string, any[]> = {}
      ;(logs as any[]).forEach((l:any)=>{
        const d = (l.date || '').substring(0,10)
        if(!d) return
        if(!logsByDate[d]) logsByDate[d] = []
        logsByDate[d].push(l)
      })
      const dates = Object.keys(logsByDate)
      const pairedLogs = [] as any[]
      for (const d of dates) {
        const inLog = logsByDate[d].find((l: any) => isTimedInLog(l))
        const outLog = logsByDate[d].find((l: any) => isTimedOutLog(l))
        const win = await getScheduleWindowForDate(d)
        pairedLogs.push({
          employee_id: inLog?.employee_id || outLog?.employee_id || employee.employee_id,
          date: d,
          time_in: inLog?.log_time || null,
          time_out: outLog?.log_time || null,
          scheduled_time_in: win.start || employee?.schedule_time_in || '08:00:00',
          scheduled_time_out: win.end || employee?.schedule_time_out || '17:00:00',
          attendance_status: inLog?.attendance_status || outLog?.attendance_status || null,
          is_late: inLog?.is_late || false,
          late_minutes: inLog?.late_minutes || 0,
          is_early_out: outLog?.is_early_out || false,
          undertime_minutes: outLog?.undertime_minutes || 0,
        })
      }
      
      setPreviewFacultyData({
        employee,
        logs: logs,
        startDate,
        endDate,
        cutoffPeriod
      })
      setFacultyTimesheetPreviewOpen(true)
    } catch (error: any) {
      // Show preview anyway with empty logs instead of blocking the user
      const cutoffRange = computeCutoffRange(cutoffPeriod, new Date())
      const startDate = toISO(cutoffRange.start)
      const endDate = toISO(cutoffRange.end)
      
      setPreviewFacultyData({
        employee,
        logs: [],
        startDate,
        endDate,
        cutoffPeriod
      })
      setFacultyTimesheetPreviewOpen(true)
    }
  }

  // Open DTR Preview Modal for single employee
  const openDtrPreview = async (employee: any, cutoffPeriod: '26-10' | '11-25') => {
    try {
      const cutoffRange = computeCutoffRange(cutoffPeriod, new Date())
      const startDate = toISO(cutoffRange.start)
      const endDate = toISO(cutoffRange.end)

      // Fetch DTR data
      const response = await fetch(
        `/api/attendance/logs?employee_id=${employee.employee_id}&start_date=${startDate}&end_date=${endDate}`
      )
      
      // Even if the response is not OK, still show the preview with empty logs
      let logs = []
      if (response.ok) {
        logs = await response.json() || []
      }
      
      setPreviewEmployeeData({
        employee,
        logs: logs,
        startDate,
        endDate,
        cutoffPeriod
      })
      setDtrPreviewOpen(true)
    } catch (error: any) {
      // Show preview anyway with empty logs instead of blocking the user
      const cutoffRange = computeCutoffRange(cutoffPeriod, new Date())
      const startDate = toISO(cutoffRange.start)
      const endDate = toISO(cutoffRange.end)
      
      setPreviewEmployeeData({
        employee,
        logs: [],
        startDate,
        endDate,
        cutoffPeriod
      })
      setDtrPreviewOpen(true)
    }
  }

  // Bulk DTR Export Handler
  const handleBulkExport = async () => {
    if (selectedEmployeeIds.length === 0) {
      showErrorDialog(
        'No Employees Selected',
        'Please select at least one employee to print DTRs.'
      )
      return
    }

    try {
      setIsBulkExporting(true)
      
      // Use current main report date range
      const startDate = toISO(mainReportDateRange.from)
      const endDate = toISO(mainReportDateRange.to)

      console.log('[Bulk DTR Export] Starting export:', {
        totalSelected: selectedEmployeeIds.length,
        dateRange: { startDate, endDate }
      })

      // Generate all dates in range for processing
      const dateRangeDays: string[] = []
      const fromDate = new Date(startDate + 'T00:00:00+08:00')
      const toDate = new Date(endDate + 'T00:00:00+08:00')
      let curDate = new Date(fromDate)
      while (curDate <= toDate) {
        dateRangeDays.push(format(curDate, 'yyyy-MM-dd'))
        curDate.setDate(curDate.getDate() + 1)
      }

      console.log('[Bulk DTR Export] Date range generated:', {
        totalDays: dateRangeDays.length,
        firstDate: dateRangeDays[0],
        lastDate: dateRangeDays[dateRangeDays.length - 1]
      })

      // Fetch attendance logs for each selected employee using local API (same as single DTR)
      const dtrDataPromises = selectedEmployeeIds.map(async (empId) => {
        const emp = employees.find(e => e.employee_id === empId)
        if (!emp) return null

        console.log(`[Bulk DTR Export] Fetching logs for ${emp.full_name} (ID: ${empId})`)
        
        let attendanceLogs: any[] = []
        try {
          attendanceLogs = await fetchReportAttendanceLogs({
            employeeId: empId,
            dateFrom: startDate,
            dateTo: endDate,
            limit: 5000,
          })
        } catch (logsError) {
          console.error(`[Bulk DTR Export] ${emp.full_name} - Local API error:`, logsError)
          return null
        }
        
        console.log(`[Bulk DTR Export] ${emp.full_name} - Local API response:`, {
          totalLogs: attendanceLogs.length,
          sampleLog: attendanceLogs[0] || null
        })

        // Group logs by date and properly pair IN/OUT logs (same as single DTR)
        // Also capture non-IN/OUT status entries (e.g., absent records) as statusLog
        const logsByDate: { [date: string]: { inLog?: any, outLog?: any, statusLog?: any } } = {}
        
        attendanceLogs.forEach((log: any) => {
          if (!logsByDate[log.date]) {
            logsByDate[log.date] = {}
          }
          if (isTimedInLog(log)) {
            logsByDate[log.date].inLog = log
          } else if (isTimedOutLog(log)) {
            logsByDate[log.date].outLog = log
          } else {
            // Non-IN/OUT entries: record as statusLog (e.g., absent, leave markers)
            logsByDate[log.date].statusLog = log
          }
        })

        console.log(`[Bulk DTR Export] ${emp.full_name} - Paired logs:`, {
          totalDates: Object.keys(logsByDate).length,
          datesWithLogs: Object.keys(logsByDate),
          firstPair: Object.keys(logsByDate)[0] ? {
            date: Object.keys(logsByDate)[0],
            inLog: logsByDate[Object.keys(logsByDate)[0]].inLog?.log_time,
            outLog: logsByDate[Object.keys(logsByDate)[0]].outLog?.log_time
          } : null
        })

        // Create processedDailyRecords array for each date (matching single DTR format)
        const processedDailyRecords = dateRangeDays.map(dateStr => {
          const { inLog, outLog, statusLog } = logsByDate[dateStr] || {}
          const dateObj = new Date(dateStr + 'T00:00:00+08:00')
          const isSunday = dateObj.getDay() === 0

          // Extract time from log_time (format: "2025-11-26 08:14:34")
          const extractTime = (logTime: string | null): string | null => {
            return toDtrTimeValue(logTime)
          }

          const timeIn = extractTime(inLog?.log_time)
          const timeOut = extractTime(outLog?.log_time)
          
          // Get status from logs - combine Late and Undertime if both exist
          const lateMinutes = Math.max(0, inLog?.late_minutes || 0)
          const undertimeMinutes = Math.max(0, outLog?.undertime_minutes || 0)
          
          const statusLogStatus = getExplicitStatusFromLog(statusLog)
          const inStatus = getExplicitStatusFromLog(inLog)
          const outStatus = getExplicitStatusFromLog(outLog)
          const otherStatus = statusLogStatus || ''
          
          // If there's a statusLog (e.g., absent/leave) and no in/out times, use it directly
          if ((!inLog && !outLog) && statusLogStatus) {
            const s = String(statusLogStatus)
            return {
              date: dateStr,
              timeIn: null,
              timeOut: null,
              status: s,
              lateMinutes: 0,
              undertimeMinutes: 0,
              isSunday: isSunday,
              admin: /admin/i.test(s)
            }
          }

          // Build combined status from in/out logs
          let status = ''
          const hasLate = lateMinutes > 0 || /late/i.test(inStatus)
          const hasUndertime = undertimeMinutes > 0 || /undertime/i.test(outStatus)
          const hasOnTime = /on.?time|present/i.test(inStatus) || /on.?time|present/i.test(outStatus)
          const hasTimedPresence = Boolean(inLog || outLog)
          const hasOutEvidence = Boolean(outLog)
          
          if (hasLate && hasUndertime) {
            status = `Late (${lateMinutes}m) / Undertime (${undertimeMinutes}m)`
          } else if (hasLate && hasOutEvidence && (hasOnTime || hasTimedPresence)) {
            status = `Late (${lateMinutes}m) / On-Time`
          } else if (hasLate) {
            status = `Late (${lateMinutes}m)`
          } else if (hasUndertime && hasOutEvidence && (hasOnTime || hasTimedPresence)) {
            status = `On-Time / Undertime (${undertimeMinutes}m)`
          } else if (hasUndertime) {
            status = `Undertime (${undertimeMinutes}m)`
          } else if (hasTimedPresence && hasOutEvidence) {
            status = 'On-Time'
          } else {
            // Use original status if available, otherwise default to empty
            status = otherStatus || inStatus || outStatus || ''
          }
          
          const statusLower = status.toLowerCase()
          const admin = statusLower.includes('admin')
          // Schedule segments are not available in this scope; default to empty.
          const scheduleSegments: Array<{ start: number; end: number }> = []
          const teachingMinutes = scheduleSegments.reduce((sum: number, segment: any) => {
            const start = Number(segment?.start)
            const end = Number(segment?.end)
            if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
              return sum
            }
            return sum + (end - start)
          }, 0)
          const teachingHours = Math.round((teachingMinutes / 60) * 100) / 100

          return {
            date: dateStr,
            timeIn: timeIn,  // Now just "10:44:05"
            timeOut: timeOut, // Now just "10:44:05"
            status: status,
            lateMinutes: lateMinutes,
            undertimeMinutes: undertimeMinutes,
            isSunday: isSunday,
            admin: admin,
            teachingMinutes,
            teachingHours
          }
        })

        console.log(`[Bulk DTR Export] ${emp.full_name} - Processed Daily Records:`, {
          totalRecords: processedDailyRecords.length,
          recordsWithData: processedDailyRecords.filter(r => r.timeIn || r.timeOut).length,
          sampleRecords: processedDailyRecords.slice(0, 3).map(r => ({
            date: r.date,
            timeIn: r.timeIn,
            timeOut: r.timeOut,
            status: r.status
          }))
        })

        return { 
          employee: emp, 
                  logs: attendanceLogs,  // Fixed: was rawLogs, now attendanceLogs from local API
          processedDailyRecords: processedDailyRecords
        }
      })

      const dtrDataResults = await Promise.all(dtrDataPromises)
      const dtrData = dtrDataResults.filter(d => d !== null)

      console.log('[Bulk DTR Export] All data processed:', {
        totalProcessed: dtrData.length,
        summary: dtrData.map((d: any) => ({
          name: d.employee.full_name,
          totalLogs: d.logs.length,
          recordsWithData: d.processedDailyRecords.filter((r: any) => r.timeIn || r.timeOut).length
        }))
      })

      toast({
        title: '📋 Printing DTRs',
        description: `Preparing ${dtrData.length} Daily Time Record(s) for printing...`,
        duration: 3000,
      })

      // Use generate2PerPageDTRPrint which calls generateSingleDTRHTML for each employee
      const printContent = generate2PerPageDTRPrint(dtrData, startDate, endDate)
      
      const printWindow = window.open('', '_blank')
      if (!printWindow) {
        showErrorDialog(
          'Pop-up Blocked',
          'Please allow pop-ups to print DTRs. Check your browser settings and try again.'
        )
        return
      }
      
      printWindow.document.write(printContent)
      printWindow.document.close()
      
      // Wait for content to load then print
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print()
          printWindow.onafterprint = () => {
            printWindow.close()
          }
        }, 500)
      }

      toast({
        title: 'Print DTR',
        description: `Printing ${dtrData.length} DTR(s)...`
      })

      // Reset selection after initiating print
      setTimeout(() => {
        setSelectedEmployeeIds([])
        setBulkExportMode(false)
      }, 1000)
    } catch (error: any) {
      console.error('Bulk DTR print error:', error)
      showErrorDialog(
        'Print Failed',
        error.message || 'An unexpected error occurred while preparing the DTRs for printing. Please try again.'
      )
    } finally {
      setIsBulkExporting(false)
    }
  }

  // NEW: Dedicated Bulk DTR Generator - Clean and Simple
  const generateBulkDTRPrintHTML = (dtrData: any[], startDate: string, endDate: string) => {
    console.log('[Bulk DTR Generator] Starting generation:', {
      totalEmployees: dtrData.length,
      dateRange: { startDate, endDate }
    })

    // Get current user for "Generated by" footer
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('rams_user') : null
    const user = userStr ? JSON.parse(userStr) : null
    const generatedBy = user?.name || user?.full_name || currentUser?.full_name || 'System Administrator'
    const schoolYear = facultyDTRSchoolYear || '2023-2024'

    // Generate all dates in range
    const allDates: string[] = []
    const start = new Date(startDate + 'T00:00:00+08:00')
    const end = new Date(endDate + 'T00:00:00+08:00')
    let current = new Date(start)
    
    while (current <= end) {
      allDates.push(format(current, 'yyyy-MM-dd'))
      current.setDate(current.getDate() + 1)
    }

    console.log('[Bulk DTR Generator] Date range:', {
      totalDays: allDates.length,
      firstDate: allDates[0],
      lastDate: allDates[allDates.length - 1]
    })

    // Generate DTR HTML for each employee
    const employeeDTRs = dtrData.map((data, index) => {
      const { employee, logs } = data
      
      console.log(`[Bulk DTR Generator] Processing employee ${index + 1}/${dtrData.length}:`, {
        name: employee.full_name,
        totalLogs: logs.length
      })

      // Group logs by date
      const logsByDate: Record<string, any[]> = {}
      logs.forEach((log: any) => {
        const date = (log.date || '').substring(0, 10)
        if (!date) return
        if (!logsByDate[date]) logsByDate[date] = []
        logsByDate[date].push(log)
      })

      console.log(`[Bulk DTR Generator] ${employee.full_name} - Logs grouped:`, {
        datesWithLogs: Object.keys(logsByDate).length,
        sampleDates: Object.keys(logsByDate).slice(0, 3)
      })

      // Format time for display - FIXED: Extract time from full timestamp
      const formatTime = (timeStr: string | null): string => {
        if (!timeStr) return ''
        try {
          // Handle both formats:
          // 1. Full timestamp: "2025-11-26 10:44:05.1207" or "2025-11-26T10:44:05"
          // 2. Time only: "10:44:05"
          let timePart = timeStr
          
          // If it contains a space or 'T', extract the time part after it
          if (timeStr.includes(' ')) {
            timePart = timeStr.split(' ')[1]
          } else if (timeStr.includes('T')) {
            timePart = timeStr.split('T')[1]
          }
          
          // Now split the time part (HH:MM:SS or HH:MM:SS.mmm)
          const [hours, minutes] = timePart.split(':')
          const h = parseInt(hours, 10)
          const ampm = h >= 12 ? 'PM' : 'AM'
          const displayHour = h === 0 ? 12 : (h > 12 ? h - 12 : h)
          return `${displayHour}:${minutes} ${ampm}`
        } catch (e) {
          console.error('[Bulk DTR Generator] Error formatting time:', timeStr, e)
          return timeStr
        }
      }

      // Calculate summary statistics
      let totalLateCount = 0
      let totalUndertimeCount = 0
      let totalAbsentCount = 0
      let totalLateMinutes = 0
      let totalUndertimeMinutes = 0
      let totalAdminTimeCount = 0
      let totalAdminTimeHours = 0
      let totalRecordedHours = 0

      // Admin time applies to full-time teaching staff only.
      // CRITICAL: Hide the summary line for Non-Teaching + Part Time employees.
      const employmentStatusRaw = String(employee?.employment_status || '')
      const employmentStatus = employmentStatusRaw.toLowerCase().trim().replace(/\s+/g, ' ')
      const isPartTime = employmentStatus.includes('part time') || employmentStatus.includes('part-time') || employmentStatus.includes('parttime')
      const isFullLoad = employmentStatus.includes('full load') || employmentStatus.includes('full-load') || employmentStatus.includes('fullload')
      const isPartTimeFullLoad = isPartTime && isFullLoad

      const staffTypeRaw = String(employee?.staff_type || '')
      const staffTypeLower = staffTypeRaw.toLowerCase().trim()
      const isNonTeachingStaff = /non\s*-?\s*teaching/i.test(staffTypeLower)
      // Treat unknown/empty staff_type as Teaching by default (reports UI already filters by staff type).
      const isTeachingStaff = !isNonTeachingStaff

      // Admin Time / Non-Teaching Load should show ONLY for Part Time Full Load employees (teaching context).
      const showAdminTime = isTeachingStaff && isPartTimeFullLoad

      // Generate rows for all dates
      const rows = allDates.map(date => {
        const dayLogs = logsByDate[date] || []
        const inLog = dayLogs.find((l: any) => isTimedInLog(l))
        const outLog = dayLogs.find((l: any) => isTimedOutLog(l))
        const explicitStatusLog = dayLogs.find((l: any) => isAbsentAttendanceLog(l))
        
        const dateObj = new Date(date + 'T00:00:00+08:00')
        const dayName = format(dateObj, 'EEE').toUpperCase()
        const dateNum = format(dateObj, 'dd')
        const dayOfWeek = dateObj.getDay()
        
        // Sunday (rest day)
        if (dayOfWeek === 0) {
          return `<tr><td style="text-align:center;font-weight:bold;border:1px solid #000;padding:2px;font-size:8px;background:#f9f9f9;">${dayName}</td><td style="text-align:center;border:1px solid #000;padding:2px;font-size:8px;background:#f9f9f9;">${dateNum}</td><td colspan="4" style="text-align:center;border:1px solid #000;padding:2px;font-size:7px;font-style:italic;background:#f9f9f9;color:#666;">REST DAY</td></tr>`
        }

        // Get time in/out with debug logging
        const timeIn = inLog ? formatTime(inLog.log_time) : ''
        const timeOut = outLog ? formatTime(outLog.log_time) : ''
        
        // Debug first few dates to see what's happening
        if (date === allDates[0] || date === allDates[1]) {
          console.log(`[Bulk DTR Generator] ${employee.full_name} - ${date}:`, {
            hasInLog: !!inLog,
            hasOutLog: !!outLog,
            inLogTime: inLog?.log_time,
            outLogTime: outLog?.log_time,
            formattedTimeIn: timeIn,
            formattedTimeOut: timeOut
          })
        }
        
        const explicitStatus = getExplicitStatusFromLog(explicitStatusLog)
        const status = explicitStatus || getExplicitStatusFromLog(inLog) || getExplicitStatusFromLog(outLog) || ''
        
        // Track statistics - FIXED: Only count explicit "Absent" status, NOT blank cells
        if (status) {
          const statusLower = status.toLowerCase()
          
          // Count absences ONLY if status explicitly says "Absent"
          if (isAbsentStatus(status)) {
            totalAbsentCount++
          }
          
          if (statusLower.includes('late')) {
            totalLateCount++
            totalLateMinutes += (inLog?.late_minutes || 0)
          }
          if (statusLower.includes('undertime')) {
            totalUndertimeCount++
            totalUndertimeMinutes += (outLog?.undertime_minutes || 0)
          }
          if (showAdminTime && statusLower.includes('admin')) {
            totalAdminTimeCount++
            // Calculate hours or use default 3
            if (inLog && outLog) {
              try {
                const inTime = new Date(`2000-01-01T${inLog.log_time}`)
                const outTime = new Date(`2000-01-01T${outLog.log_time}`)
                const hours = (outTime.getTime() - inTime.getTime()) / (1000 * 60 * 60)
                totalAdminTimeHours += Math.max(0, hours)
              } catch {
                totalAdminTimeHours += 0
              }
            } else {
              totalAdminTimeHours += 0
            }
          }
        }
        // REMOVED: else if (!inLog && !outLog) { totalAbsentCount++ }
        // Blank cells are NO LONGER counted as absent

  const displayStatus = formatDtrStatusLabel(status, Boolean(inLog), Boolean(outLog))

  return `<tr><td style="text-align:center;font-weight:bold;border:1px solid #000;padding:2px;font-size:8px;">${dayName}</td><td style="text-align:center;border:1px solid #000;padding:2px;font-size:8px;">${dateNum}</td><td style="text-align:center;border:1px solid #000;padding:2px;font-size:8px;">${timeIn}</td><td style="text-align:center;border:1px solid #000;padding:2px;font-size:8px;">${timeOut}</td><td style="text-align:center;border:1px solid #000;padding:2px;font-size:8px;"></td><td style="text-align:center;border:1px solid #000;padding:2px;font-size:7px;">${displayStatus}</td></tr>`
      }).join('')

      console.log(`[Bulk DTR Generator] ${employee.full_name} - Summary:`, {
        totalLateCount,
        totalUndertimeCount,
        totalAbsentCount,
        totalAdminTimeCount,
        showAdminTime
      })

      // Return complete DTR HTML for this employee
      return `
        <div class="dtr-header">
          <div style="display:flex;align-items:flex-start;margin-bottom:8px;">
            <img src="/Landing Page_/TqEOF7H.png" style="width:50px;height:50px;margin-right:10px;object-fit:contain;" alt="STI Logo" />
            <div style="flex:1;text-align:center;">
              <div style="font-size:14px;font-weight:bold;color:#1e40af;letter-spacing:0.3px;">STI COLLEGE SANTA ROSA</div>
              <div style="font-size:8px;color:#666;margin-top:1px;">Ruby Street, Santa Rosa Commercial Complex, Barangay Balibago, City of Santa Rosa</div>
              <div style="text-align:center;font-size:11px;font-weight:bold;margin-top:6px;text-decoration:underline;letter-spacing:0.3px;">FACULTY DAILY TIME RECORD</div>
            </div>
          </div>
        </div>
        <div class="employee-info" style="margin-bottom:8px;padding:0 5px;">
          <table style="width:100%;font-size:9px;border-collapse:collapse;">
            <tr>
              <td style="width:13%;padding:2px 0;font-weight:600;vertical-align:bottom;">FACULTY NAME:</td>
              <td style="width:37%;padding:2px 4px;border-bottom:1px solid #333;vertical-align:bottom;font-size:8px;">${employee.full_name}</td>
              <td style="width:13%;padding:2px 0 2px 10px;font-weight:600;text-align:right;vertical-align:bottom;">SCHOOL YEAR:</td>
              <td style="width:37%;padding:2px 4px;border-bottom:1px solid #333;text-align:right;vertical-align:bottom;font-size:8px;">${schoolYear}</td>
            </tr>
            <tr>
              <td style="padding:2px 0;font-weight:600;vertical-align:bottom;">DEPARTMENT:</td>
              <td style="padding:2px 4px;border-bottom:1px solid #333;vertical-align:bottom;font-size:8px;">${employee.department || 'N/A'}</td>
              <td style="padding:2px 0 2px 10px;font-weight:600;text-align:right;vertical-align:bottom;">SEMESTER:</td>
              <td style="padding:2px 4px;border-bottom:1px solid #333;text-align:right;vertical-align:bottom;font-size:8px;">1ST</td>
            </tr>
            <tr>
              <td style="padding:2px 0;font-weight:600;vertical-align:bottom;">CUT-OFF PERIOD:</td>
              <td colspan="3" style="padding:2px 4px;border-bottom:1px solid #333;vertical-align:bottom;font-size:8px;">${format(new Date(startDate),'MMMM dd, yyyy')} - ${format(new Date(endDate),'MMMM dd, yyyy')}</td>
            </tr>
          </table>
        </div>
        <table class="attendance-table" style="width:100%;border-collapse:collapse;font-size:8px;margin-bottom:8px;">
          <thead>
            <tr style="background:#f5f5f5;">
              <th style="border:1px solid #333;padding:3px;width:8%;font-weight:600;font-size:8px;">DAY</th>
              <th style="border:1px solid #333;padding:3px;width:8%;font-weight:600;font-size:8px;">DATE</th>
              <th style="border:1px solid #333;padding:3px;width:14%;font-weight:600;font-size:8px;">TIME IN</th>
              <th style="border:1px solid #333;padding:3px;width:14%;font-weight:600;font-size:8px;">TIME OUT</th>
              <th style="border:1px solid #333;padding:3px;width:8%;font-weight:600;font-size:8px;">HOURS</th>
              <th style="border:1px solid #333;padding:3px;width:48%;font-weight:600;font-size:8px;">STATUS</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        
        <div style="margin-bottom: 8px; padding: 0 5px;">
          <table style="width: 100%; font-size: 8px; border-collapse: collapse;">
            <tr>
              <td style="width: 40%; padding: 2px 0; font-weight: 600;">Number of Lates:</td>
              <td style="width: 60%; padding: 2px 4px; border-bottom: 1px solid #333; font-size: 8px;">${totalLateCount} day(s) - ${(totalLateMinutes / 60).toFixed(2)} hour(s)</td>
            </tr>
            <tr>
              <td style="padding: 2px 0; font-weight: 600;">Number of Undertimes:</td>
              <td style="padding: 2px 4px; border-bottom: 1px solid #333; font-size: 8px;">${totalUndertimeCount} day(s) - ${(totalUndertimeMinutes / 60).toFixed(2)} hour(s)</td>
            </tr>
            ${showAdminTime ? `
            <tr>
              <td style="padding: 2px 0; font-weight: 600;">Number of Admin Time / Non-Teaching Load:</td>
              <td style="padding: 2px 4px; border-bottom: 1px solid #333; font-size: 8px;">${totalAdminTimeCount} day(s) - ${totalAdminTimeHours.toFixed(2)} hour(s)</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 2px 0; font-weight: 600;">Number of Absences:</td>
              <td style="padding: 2px 4px; border-bottom: 1px solid #333; font-size: 8px;">${totalAbsentCount} day(s)</td>
            </tr>
          </table>
        </div>
        
        <div style="margin-bottom: 8px;">
          <div style="font-size: 8px; font-weight: bold; margin-bottom: 2px;">Remarks:</div>
          <div style="border: 1px solid #000; min-height: 30px; padding: 3px; font-size: 7px;"></div>
        </div>
        
        <div class="signature-section" style="display: flex; justify-content: space-between; font-size: 8px; margin-top: 10px;">
          <div style="text-align: center; width: 22%;">
            <div style="border-bottom: 1px solid #000; margin-bottom: 2px; height: 25px;"></div>
            <div style="font-weight: bold; font-size: 8px;">Checked by:</div>
            <div style="font-size: 7px; margin-top: 1px;">Program Coordinator</div>
          </div>
          <div style="text-align: center; width: 22%;">
            <div style="border-bottom: 1px solid #000; margin-bottom: 2px; height: 25px;"></div>
            <div style="font-weight: bold; font-size: 8px;">Approved by:</div>
            <div style="font-size: 7px; margin-top: 1px;">Academic Head</div>
          </div>
        </div>
        
        <div style="margin-top: 8px; padding-top: 5px; border-top: 1px solid #ddd; text-align: left; font-size: 7px; color: #666;">
          <span style="font-weight: 600;">Generated by:</span> ${generatedBy}
        </div>
      `
    })

    // Create 2-per-page layout
    const pages: string[] = []
    for (let i = 0; i < employeeDTRs.length; i += 2) {
      const leftDTR = employeeDTRs[i]
      const rightDTR = employeeDTRs[i + 1] || ''
      
      pages.push(`
        <div class="page">
          <div class="dtr-container">
            ${leftDTR}
          </div>
          ${rightDTR ? `
            <div class="dtr-container">
              ${rightDTR}
            </div>
          ` : '<div class="dtr-container blank-page"></div>'}
        </div>
      `)
    }

    console.log('[Bulk DTR Generator] Generation complete:', {
      totalPages: pages.length,
      totalDTRs: employeeDTRs.length
    })

    // Return complete HTML document
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Daily Time Records</title>
        <style>
          @page {
            size: landscape;
            margin: 0.5cm;
          }
          
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: Arial, sans-serif;
            font-size: 9px;
            line-height: 1.2;
          }
          
          .page {
            display: flex;
            justify-content: space-between;
            gap: 0.5cm;
            page-break-after: always;
            width: 100%;
            height: 100vh;
            padding: 0.2cm;
          }
          
          .page:last-child {
            page-break-after: auto;
          }
          
          .dtr-container {
            flex: 1;
            border: 2px solid #000;
            padding: 8px;
            background: white;
          }
          
          .dtr-container.blank-page {
            border: 2px solid #000;
            background: white;
          }
          
          @media print {
            .page {
              page-break-after: always;
            }
            
            .page:last-child {
              page-break-after: auto;
            }
          }
        </style>
      </head>
      <body>
        ${pages.join('')}
      </body>
      </html>
    `
  }

  // Generate 2-per-page DTR print layout (landscape)
  const generate2PerPageDTRPrint = (dtrData: any[], startDate: string, endDate: string) => {
    const pages: string[] = []
    // Get current user from localStorage with debugging
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('rams_user') : null
    console.log('[Bulk DTR] localStorage rams_user:', userStr)
    const user = userStr ? JSON.parse(userStr) : null
    console.log('[Bulk DTR] Parsed user:', user)
    console.log('[Bulk DTR] currentUser state:', currentUser)
    // FIXED: localStorage uses "name" property, not "full_name"
    const generatedBy = user?.name || user?.full_name || currentUser?.full_name || currentUser?.name || 'System Administrator'
    console.log('[Bulk DTR] Final generatedBy:', generatedBy)
    
    // Get school year from state
    const schoolYear = facultyDTRSchoolYear || '2023-2024'
    
    // Check if this is a single DTR print (only 1 employee)
    const isSingleDTR = dtrData.length === 1
    
    // Process DTRs in pairs (2 per page)
    for (let i = 0; i < dtrData.length; i += 2) {
      const leftDTR = dtrData[i]
      // For single DTR, always leave right side blank. For bulk, show second DTR if exists
      const rightDTR = isSingleDTR ? null : (dtrData[i + 1] || null)
      
      const pageHTML = `
        <div class="page">
          <div class="dtr-container">
            ${generateSingleDTRHTML(leftDTR, startDate, endDate, generatedBy, schoolYear)}
          </div>
          ${rightDTR ? `
            <div class="dtr-container">
              ${generateSingleDTRHTML(rightDTR, startDate, endDate, generatedBy, schoolYear)}
            </div>
          ` : '<div class="dtr-container blank-page"></div>'}
        </div>
      `
      pages.push(pageHTML)
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Daily Time Records</title>
        <style>
          @page {
            size: landscape;
            margin: 0.5cm;
          }
          
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: Arial, sans-serif;
            font-size: 9px;
            line-height: 1.2;
          }
          
          .page {
            display: flex;
            justify-content: space-between;
            gap: 0.5cm;
            page-break-after: always;
            width: 100%;
            height: 100vh;
            padding: 0.2cm;
          }
          
          .page:last-child {
            page-break-after: auto;
          }
          
          .dtr-container {
            flex: 1;
            border: 2px solid #000;
            padding: 8px;
            background: white;
          }
          
          .dtr-container.blank-page {
            border: 2px solid #000;
            background: white;
          }
          
          .dtr-header {
            text-align: center;
            margin-bottom: 8px;
            border-bottom: 2px solid #000;
            padding-bottom: 6px;
          }
          
          .dtr-title {
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
          }
          
          .dtr-subtitle {
            font-size: 8px;
            margin-top: 2px;
          }
          
          .employee-info {
            margin-bottom: 8px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px;
            font-size: 8px;
          }
          
          .info-row {
            display: flex;
            gap: 4px;
          }
          
          .info-label {
            font-weight: bold;
            min-width: 60px;
          }
          
          .info-value {
            flex: 1;
            border-bottom: 1px solid #333;
            padding-left: 4px;
          }
          
          .attendance-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 7px;
          }
          
          .attendance-table th {
            background: #f0f0f0;
            border: 1px solid #000;
            padding: 3px 2px;
            font-weight: bold;
            text-align: center;
          }
          
          .attendance-table td {
            border: 1px solid #000;
            padding: 3px 2px;
            text-align: center;
          }
          
          .date-col { width: 50px; }
          .time-col { width: 45px; }
          .status-col { width: 40px; }
          .minutes-col { width: 35px; }
          
          .status-present { background: #d4edda; }
          .status-late { background: #fff3cd; }
          .status-absent { background: #f8d7da; }
          
          .dtr-footer {
            margin-top: 8px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
            font-size: 7px;
          }
          
          .signature-box {
            border: 1px solid #000;
            padding: 4px;
            text-align: center;
          }
          
          .signature-line {
            border-top: 1px solid #000;
            margin-top: 20px;
            padding-top: 2px;
          }
          
          @media print {
            .page {
              page-break-after: always;
            }
            
            .page:last-child {
              page-break-after: auto;
            }
          }
        </style>
      </head>
      <body>
        ${pages.join('')}
      </body>
      </html>
    `
  }

  // Generate full-page single DTR print (not 2-column layout)
  const generateFullPageSingleDTRPrint = (dtrData: any, startDate: string, endDate: string) => {
    // Get current user from localStorage
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('rams_user') : null
    const user = userStr ? JSON.parse(userStr) : null
    const generatedBy = user?.name || user?.full_name || currentUser?.full_name || currentUser?.name || 'System Administrator'
    
    // Get school year from state
    const schoolYear = facultyDTRSchoolYear || '2023-2024'
    
    const singleDTRHTML = generateSingleDTRHTML(dtrData, startDate, endDate, generatedBy, schoolYear)
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Daily Time Record</title>
        <style>
          @page {
            size: portrait;
            margin: 1cm;
          }
          
          @media print {
            body { margin: 0; }
            .print-container { box-shadow: none !important; }
          }
          
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: Arial, sans-serif;
            font-size: 9px;
            line-height: 1.2;
            background: #fff;
          }
          
          .print-container {
            max-width: 100%;
            margin: 0 auto;
            background: white;
            padding: 10px;
          }
          
          .single-dtr-wrapper {
            border: 2px solid #000;
            padding: 8px;
            background: white;
          }
          
          .dtr-header {
            text-align: center;
            margin-bottom: 8px;
            border-bottom: 2px solid #000;
            padding-bottom: 6px;
          }
          
          .dtr-title {
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
          }
          
          .dtr-subtitle {
            font-size: 8px;
            margin-top: 2px;
          }
          
          .employee-info {
            margin-bottom: 8px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px;
            font-size: 8px;
          }
          
          .info-row {
            display: flex;
            gap: 4px;
          }
          
          .info-label {
            font-weight: bold;
            min-width: 90px;
          }
          
          .info-value {
            flex: 1;
            border-bottom: 1px solid #000;
            padding-bottom: 1px;
          }
          
          .attendance-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 8px;
            font-size: 7px;
          }
          
          .attendance-table th,
          .attendance-table td {
            border: 1px solid #000;
            padding: 3px 4px;
            text-align: left;
          }
          
          .attendance-table th {
            background-color: #f0f0f0;
            font-weight: bold;
            text-align: center;
            font-size: 7px;
          }
          
          .attendance-table td {
            vertical-align: bottom;
          }
          
          .attendance-table .center {
            text-align: center;
          }
          
          .summary-section {
            margin: 8px 0;
            font-size: 8px;
          }
          
          .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 2px 0;
            border-bottom: 1px solid #ddd;
          }
          
          .remarks-section {
            margin: 8px 0;
            font-size: 8px;
          }
          
          .remarks-box {
            border: 1px solid #000;
            min-height: 60px;
            padding: 4px;
            margin-top: 4px;
          }
          
          .signature-section {
            display: flex;
            justify-content: space-around;
            margin-top: 20px;
            font-size: 8px;
          }
          
          .signature-box {
            text-align: center;
            width: 45%;
          }
          
          .signature-line {
            border-top: 1px solid #000;
            margin-top: 30px;
            padding-top: 4px;
          }
          
          .school-info-right {
            text-align: right;
            font-size: 7px;
            margin-bottom: 4px;
          }
        </style>
      </head>
      <body>
        <div class="print-container">
          <div class="single-dtr-wrapper">
            ${singleDTRHTML}
          </div>
        </div>
      </body>
      </html>
    `
  }

  // Generate single DTR HTML
  const generateSingleDTRHTML = (dtrData: any, startDate: string, endDate: string, generatedBy: string = 'System Administrator', schoolYear: string = '2023-2024') => {
    if (!dtrData) return ''
    
    const { employee, logs, processedDailyRecords } = dtrData
    const resolveSemesterLabel = (): string => {
      // Force 2nd semester when cutoff end date falls Jan-Jun.
      const ref = new Date(`${endDate}T00:00:00+08:00`)
      const month = Number(formatInTimeZone(ref, PH_TZ, 'M'))
      if (month >= 1 && month <= 6) return '2nd Semester'
      const explicitSemester = String(dtrData?.semester || '').trim()
      if (/2/.test(explicitSemester)) return '2nd Semester'
      return '1st Semester'
    }
    const semesterLabel = resolveSemesterLabel()
    
    // CRITICAL DEBUG: Log what data we received
    console.log('[generateSingleDTRHTML] Received data for:', employee?.full_name, {
      hasProcessedDailyRecords: Array.isArray(processedDailyRecords),
      processedDailyRecordsLength: processedDailyRecords?.length || 0,
      firstThreeRecords: processedDailyRecords?.slice(0, 3) || [],
      hasLogs: Array.isArray(logs),
      logsLength: logs?.length || 0
    })
    
    const employmentStatusRaw = String(dtrData?.employmentStatus ?? employee?.employment_status ?? '')
    const employmentStatus = employmentStatusRaw.toLowerCase().trim().replace(/\s+/g, ' ')
    const isPartTime = employmentStatus.includes('part time') || employmentStatus.includes('part-time') || employmentStatus.includes('parttime')
    const isFullLoad = employmentStatus.includes('full load') || employmentStatus.includes('full-load') || employmentStatus.includes('fullload')
    const isPartTimeFullLoad = isPartTime && isFullLoad

    const staffTypeRaw = String(employee?.staff_type || '')
    const staffTypeLower = staffTypeRaw.toLowerCase().trim()
    const isNonTeachingStaff = /non\s*-?\s*teaching/i.test(staffTypeLower)
    const isTeachingStaff = !isNonTeachingStaff

    // Admin Time / Non-Teaching Load should show ONLY for Part Time Full Load employees (teaching context).
    const showAdminTime = isTeachingStaff && isPartTimeFullLoad
    
    // Debug logging for employment status check
    console.log('DTR Generation - Employment Status Check:', {
      employee_name: employee.full_name,
      employment_status: employee.employment_status,
      normalized: employmentStatus,
      showAdminTime: showAdminTime
    })
    
    // If processedDailyRecords provided (bulk export path), use them directly
    if (Array.isArray(processedDailyRecords) && processedDailyRecords.length > 0) {
      // Totals
      let totalLateCount = 0
      let totalUndertimeCount = 0
      let totalAbsentCount = 0
      let totalLateMinutes = 0
      let totalUndertimeMinutes = 0
      let totalAdminTimeCount = 0
      let totalAdminTimeHours = 0
      let totalRecordedHours = 0

      const rows = processedDailyRecords.map((rec: any, index: number) => {
        const dateObj = new Date(rec.date + 'T00:00:00')
        const dayName = format(dateObj, 'EEE').toUpperCase()
        const dateNum = format(dateObj, 'dd')
        
        // Debug first 3 records
        if (index < 3) {
          console.log(`[Bulk DTR] Row ${index} for ${employee.full_name}:`, {
            date: rec.date,
            timeIn: rec.timeIn,
            timeOut: rec.timeOut,
            status: rec.status,
            isSunday: rec.isSunday
          })
        }
        
        if (rec.isSunday) {
          return `<tr><td style="text-align:center;font-weight:bold;border:1px solid #000;padding:2px;font-size:8px;background:#f9f9f9;">${dayName}</td><td style="text-align:center;border:1px solid #000;padding:2px;font-size:8px;background:#f9f9f9;">${dateNum}</td><td colspan="4" style="text-align:center;border:1px solid #000;padding:2px;font-size:7px;font-style:italic;background:#f9f9f9;color:#666;">REST DAY</td></tr>`
        }
        
        // CRITICAL FIX: rec.timeIn and rec.timeOut are time strings (HH:MM:SS), NOT full timestamps
        // Format them properly for display
        const formatTimeDisplay = (timeStr: string | null): string => {
          if (!timeStr) return ''
          try {
            // timeStr is like "08:30:00" or "08:30:45"
            const [hours, minutes] = timeStr.split(':')
            const h = parseInt(hours, 10)
            const m = minutes
            const ampm = h >= 12 ? 'PM' : 'AM'
            const displayHour = h === 0 ? 12 : (h > 12 ? h - 12 : h)
            return `${displayHour}:${m} ${ampm}`
          } catch {
            return timeStr
          }
        }
        
        // Helper to calculate hours between two time strings (HH:MM:SS format)
        const calculateHoursFromTimeStrings = (timeInStr: string | null, timeOutStr: string | null): number => {
          if (!timeInStr || !timeOutStr) return 0
          try {
            // Parse time strings (e.g., "10:44:05" and "19:00:00")
            const [inH, inM, inS] = timeInStr.split(':').map(Number)
            const [outH, outM, outS] = timeOutStr.split(':').map(Number)
            
            // Convert to total minutes
            const inTotalMinutes = inH * 60 + inM
            const outTotalMinutes = outH * 60 + outM
            
            // Calculate difference in hours
            const diffMinutes = outTotalMinutes - inTotalMinutes
            return Math.max(0, diffMinutes / 60)
          } catch (error) {
            console.error('Error calculating hours:', error)
            return 0
          }
        }
        
        const timeIn = formatTimeDisplay(rec.timeIn)
        const timeOut = formatTimeDisplay(rec.timeOut)
        const hasInLog = Boolean(rec.timeIn && String(rec.timeIn).trim() !== '')
        const hasOutLog = Boolean(rec.timeOut && String(rec.timeOut).trim() !== '')
        const hasAnyLog = hasInLog || hasOutLog
        const teachingMinutes = Math.max(0, Number(rec.teachingMinutes || 0))
        const teachingHours = Math.max(0, Number(rec.teachingHours || 0))
        const isPartTimeFullLoad = /part\s*time\s*full\s*load/i.test(employmentStatus)
        const noScheduleForDay = teachingMinutes === 0
        const adminOverride = showAdminTime && isPartTimeFullLoad && noScheduleForDay && hasAnyLog
        const statusForDisplay = adminOverride ? 'admin time' : (rec.status || '')
        const displayStatus = formatDtrStatusLabel(statusForDisplay, hasInLog, hasOutLog)
        
        // Keep the DTR Hours column schedule-based so substitutions and vacant periods
        // don't inflate the day to the full tap span.
        const hasCompleteTimePair = Boolean(rec.timeIn) && Boolean(rec.timeOut)
        const hoursWorked = calculateHoursFromTimeStrings(rec.timeIn, rec.timeOut)
        const hoursDisplay = hasCompleteTimePair && teachingHours > 0 ? teachingHours.toFixed(2) : ''

        if (hasCompleteTimePair && !adminOverride) {
          const dayHours = teachingHours > 0 ? teachingHours : hoursWorked
          totalRecordedHours += Math.max(0, dayHours)
        }
        
        // Track admin time for all Teaching staff
        if (showAdminTime && (rec.admin || adminOverride)) {
          totalAdminTimeCount++
          const computedAdminHours = Number(rec.adminHours || 0)
          if (computedAdminHours > 0) {
            totalAdminTimeHours += computedAdminHours
          } else if (rec.timeIn && rec.timeOut) {
            totalAdminTimeHours += hoursWorked
          } else {
            totalAdminTimeHours += 0
          }
        }
        
        // Use numeric minutes (minutes-first precision), not status text parsing.
        const recordLateMinutes = Math.max(0, Number(rec.lateMinutes || 0))
        const recordUndertimeMinutes = Math.max(0, Number(rec.undertimeMinutes || 0))
        if (!adminOverride && recordLateMinutes > 0) {
          totalLateCount++
          totalLateMinutes += recordLateMinutes
        }
        if (!adminOverride && recordUndertimeMinutes > 0) {
          totalUndertimeCount++
          totalUndertimeMinutes += recordUndertimeMinutes
        }
        
        return `<tr><td style="text-align:center;font-weight:bold;border:1px solid #000;padding:2px;font-size:8px;">${dayName}</td><td style="text-align:center;border:1px solid #000;padding:2px;font-size:8px;">${dateNum}</td><td style="text-align:center;border:1px solid #000;padding:2px;font-size:8px;">${timeIn}</td><td style="text-align:center;border:1px solid #000;padding:2px;font-size:8px;">${timeOut}</td><td style="text-align:center;border:1px solid #000;padding:2px;font-size:8px;">${hoursDisplay}</td><td style="text-align:center;border:1px solid #000;padding:2px;font-size:7px;">${displayStatus}</td></tr>`
      }).join('')

      return `
        <div class="dtr-header">
          <div style="display:flex;align-items:flex-start;margin-bottom:8px;">
            <img src="/Landing Page_/TqEOF7H.png" style="width:50px;height:50px;margin-right:10px;object-fit:contain;" alt="STI Logo" />
            <div style="flex:1;text-align:center;">
              <div style="font-size:14px;font-weight:bold;color:#1e40af;letter-spacing:0.3px;">STI COLLEGE SANTA ROSA</div>
              <div style="font-size:8px;color:#666;margin-top:1px;">Ruby Street, Santa Rosa Commercial Complex, Barangay Balibago, City of Santa Rosa</div>
              <div style="text-align:center;font-size:11px;font-weight:bold;margin-top:6px;text-decoration:underline;letter-spacing:0.3px;">FACULTY DAILY TIME RECORD</div>
            </div>
          </div>
        </div>
        <div class="employee-info" style="margin-bottom:8px;padding:0 5px;">
          <table style="width:100%;font-size:9px;border-collapse:collapse;">
            <tr>
              <td style="width:13%;padding:2px 0;font-weight:600;vertical-align:bottom;">FACULTY NAME:</td>
              <td style="width:37%;padding:2px 4px;border-bottom:1px solid #333;vertical-align:bottom;font-size:8px;">${employee.full_name}</td>
              <td style="width:13%;padding:2px 0 2px 10px;font-weight:600;text-align:right;vertical-align:bottom;">SCHOOL YEAR:</td>
              <td style="width:37%;padding:2px 4px;border-bottom:1px solid #333;text-align:right;vertical-align:bottom;font-size:8px;">${schoolYear}</td>
            </tr>
            <tr>
              <td style="padding:2px 0;font-weight:600;vertical-align:bottom;">DEPARTMENT:</td>
              <td style="padding:2px 4px;border-bottom:1px solid #333;vertical-align:bottom;font-size:8px;">${employee.department || 'N/A'}</td>
              <td style="padding:2px 0 2px 10px;font-weight:600;text-align:right;vertical-align:bottom;">SEMESTER:</td>
              <td style="padding:2px 4px;border-bottom:1px solid #333;text-align:right;vertical-align:bottom;font-size:8px;">${semesterLabel}</td>
            </tr>
            <tr>
              <td style="padding:2px 0;font-weight:600;vertical-align:bottom;">CUT-OFF PERIOD:</td>
              <td colspan="3" style="padding:2px 4px;border-bottom:1px solid #333;vertical-align:bottom;font-size:8px;">${format(new Date(startDate),'MMMM dd, yyyy')} - ${format(new Date(endDate),'MMMM dd, yyyy')}</td>
            </tr>
          </table>
        </div>
        <table class="attendance-table" style="width:100%;border-collapse:collapse;font-size:8px;margin-bottom:8px;">
          <thead>
            <tr style="background:#f5f5f5;">
              <th style="border:1px solid #333;padding:3px;width:8%;font-weight:600;font-size:8px;">DAY</th>
              <th style="border:1px solid #333;padding:3px;width:8%;font-weight:600;font-size:8px;">DATE</th>
              <th style="border:1px solid #333;padding:3px;width:14%;font-weight:600;font-size:8px;">TIME IN</th>
              <th style="border:1px solid #333;padding:3px;width:14%;font-weight:600;font-size:8px;">TIME OUT</th>
              <th style="border:1px solid #333;padding:3px;width:8%;font-weight:600;font-size:8px;">HOURS</th>
              <th style="border:1px solid #333;padding:3px;width:48%;font-weight:600;font-size:8px;">STATUS</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        
        <div style="margin-bottom: 8px; padding: 0 5px;">
          <table style="width: 100%; font-size: 8px; border-collapse: collapse;">
            <tr>
              <td style="width: 40%; padding: 2px 0; font-weight: 600;">Number of Lates:</td>
              <td style="width: 60%; padding: 2px 4px; border-bottom: 1px solid #333; font-size: 8px;">${totalLateCount} day(s) - ${(totalLateMinutes / 60).toFixed(2)} hour(s)</td>
            </tr>
            <tr>
              <td style="padding: 2px 0; font-weight: 600;">Number of Undertimes:</td>
              <td style="padding: 2px 4px; border-bottom: 1px solid #333; font-size: 8px;">${totalUndertimeCount} day(s) - ${(totalUndertimeMinutes / 60).toFixed(2)} hour(s)</td>
            </tr>
            ${showAdminTime ? `
            <tr>
              <td style="padding: 2px 0; font-weight: 600;">Number of Admin Time / Non-Teaching Load:</td>
              <td style="padding: 2px 4px; border-bottom: 1px solid #333; font-size: 8px;">${totalAdminTimeCount} day(s) - ${totalAdminTimeHours.toFixed(2)} hour(s)</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 2px 0; font-weight: 600;">Number of Absences:</td>
              <td style="padding: 2px 4px; border-bottom: 1px solid #333; font-size: 8px;">${totalAbsentCount} day(s)</td>
            </tr>
            <tr>
              <td style="padding: 2px 0; font-weight: 600;">Total Hours:</td>
              <td style="padding: 2px 4px; border-bottom: 1px solid #333; font-size: 8px;">${(Math.round(totalRecordedHours * 100) / 100).toFixed(2)} hour(s)</td>
            </tr>
          </table>
        </div>
        
        <div style="margin-bottom: 8px;">
          <div style="font-size: 8px; font-weight: bold; margin-bottom: 2px;">Remarks:</div>
          <div style="border: 1px solid #000; min-height: 30px; padding: 3px; font-size: 7px;"></div>
        </div>
        
        <div class="signature-section" style="display: flex; justify-content: space-between; font-size: 8px; margin-top: 10px;">
          <div style="text-align: center; width: 22%;">
            <div style="border-bottom: 1px solid #000; margin-bottom: 2px; height: 25px;"></div>
            <div style="font-weight: bold; font-size: 8px;">Checked by:</div>
            <div style="font-size: 7px; margin-top: 1px;">Program Coordinator</div>
          </div>
          <div style="text-align: center; width: 22%;">
            <div style="border-bottom: 1px solid #000; margin-bottom: 2px; height: 25px;"></div>
            <div style="font-weight: bold; font-size: 8px;">Approved by:</div>
            <div style="font-size: 7px; margin-top: 1px;">Academic Head</div>
          </div>
        </div>
        
        <div style="margin-top: 8px; padding-top: 5px; border-top: 1px solid #ddd; text-align: left; font-size: 7px; color: #666;">
          <span style="font-weight: 600;">Generated by:</span> ${generatedBy}
        </div>
      `
    }
    
    // Counters for totals
    let totalLateCount = 0
    let totalUndertimeCount = 0
    let totalAbsentCount = 0
    let totalLateMinutes = 0
    let totalUndertimeMinutes = 0
    let totalAdminTimeCount = 0
    let totalAdminTimeHours = 0

    // Group logs by date for fallback (non-processed path)
    const logsByDate: Record<string, any[]> = {}
    ;(logs||[]).forEach((log:any) => {
      const date = (log.date || '').substring(0,10)
      if (!date) return
      if (!logsByDate[date]) logsByDate[date] = []
      logsByDate[date].push(log)
    })
    
    // Generate ALL dates in the cutoff period (not just dates with logs)
    const allDates: string[] = []
    const start = new Date(startDate)
    const end = new Date(endDate)
    let current = new Date(start)
    
    while (current <= end) {
      allDates.push(format(current, 'yyyy-MM-dd'))
      current.setDate(current.getDate() + 1)
    }
    
    // Generate rows for ALL dates in the cutoff period
    const rows = allDates.map(date => {
      const dayLogs = logsByDate[date] || []
      const inLog = dayLogs.find((l: any) => isTimedInLog(l))
      const outLog = dayLogs.find((l: any) => isTimedOutLog(l))
      const explicitStatusLog = dayLogs.find((l: any) => isAbsentAttendanceLog(l))
      
      const dateObj = new Date(date + 'T00:00:00')
      const dayName = format(dateObj, 'EEE').toUpperCase() // MON, TUE, etc.
      const dateNum = format(dateObj, 'dd') // 11, 12, etc.
      const dayOfWeek = dateObj.getDay() // 0=Sunday, 1=Monday, etc.
      
      // Skip Sundays (rest days)
      if (dayOfWeek === 0) {
        return `
          <tr>
            <td style="text-align: center; font-weight: bold; border: 1px solid #000; padding: 2px; font-size: 8px; background: #f9f9f9;">${dayName}</td>
            <td style="text-align: center; border: 1px solid #000; padding: 2px; font-size: 8px; background: #f9f9f9;">${dateNum}</td>
            <td colspan="4" style="text-align: center; border: 1px solid #000; padding: 2px; font-size: 7px; font-style: italic; background: #f9f9f9; color: #666;">REST DAY</td>
          </tr>
        `
      }
      
      const timeIn = inLog?.log_time ? format(new Date(inLog.log_time), 'h:mm a') : ''
      const timeOut = outLog?.log_time ? format(new Date(outLog.log_time), 'h:mm a') : ''
      
      // IMPROVED: Calculate late and undertime from logs
      // Check both IN and OUT logs for late_minutes and undertime_minutes
      const inLogLate = inLog?.is_late === true || (inLog?.late_minutes && inLog.late_minutes > 0)
      const outLogUndertime = outLog?.is_early_out === true || (outLog?.undertime_minutes && outLog.undertime_minutes > 0)
      
      const lateMinutes = Math.max(0, (inLog?.late_minutes || 0))
      const undertimeMinutes = Math.max(0, (outLog?.undertime_minutes || 0))
      
      // Check for admin time status (show for all Teaching employees)
      const hasAdminTime = showAdminTime && dayLogs.some((l: any) => 
        l.attendance_status && 
        (l.attendance_status.toLowerCase().includes('admin') || 
         l.attendance_status.toLowerCase() === 'admin-time' ||
         l.attendance_status.toLowerCase() === 'admin_time')
      )
      
      // Determine status with improved logic (no absent automation)
      let status = ''
      if (dayLogs.length === 0 || (!timeIn && !timeOut)) {
        // Keep explicit absent/leave status even when there are no IN/OUT times.
        status = getExplicitStatusFromLog(explicitStatusLog) || ''
      } else {
        // Has attendance logs
        if (hasAdminTime) {
          status = 'Admin Time / Non-Teaching Load'
          totalAdminTimeCount++
          // Calculate hours for admin time from actual in/out only.
          // Never inject fixed defaults to keep minutes-based totals accurate.
          if (timeIn && timeOut) {
            const inTime = new Date(inLog.log_time)
            const outTime = new Date(outLog.log_time)
            const hours = (outTime.getTime() - inTime.getTime()) / (1000 * 60 * 60)
            totalAdminTimeHours += Math.max(0, hours)
          } else {
            totalAdminTimeHours += 0
          }
        } else {
          // Use actual attendance_status from database, not computed status
          const dbStatus = getExplicitStatusFromLog(explicitStatusLog) || getExplicitStatusFromLog(inLog) || getExplicitStatusFromLog(outLog) || ''
          
          if (dbStatus) {
            // Use the actual status saved in the database
            status = dbStatus
          } else {
            // Fallback to computed status only if no database status exists
            const statusParts = []
            if (lateMinutes > 0 || inLogLate) {
              statusParts.push(`Late (${lateMinutes}m)`)
            } else if (timeIn) {
              statusParts.push('On-time')
            }
            
            if (undertimeMinutes > 0 || outLogUndertime) {
              statusParts.push(`Undertime (${undertimeMinutes}m)`)
            } else if (timeOut) {
              statusParts.push('On-time')
            }
            
            status = statusParts.length > 0 ? statusParts.join(' / ') : 'Present'
          }
          
          // Still track late and undertime counts for summary
          if (lateMinutes > 0 || inLogLate) {
            totalLateCount++
            totalLateMinutes += lateMinutes
          }
          
          if (undertimeMinutes > 0 || outLogUndertime) {
            totalUndertimeCount++
            totalUndertimeMinutes += undertimeMinutes
          }
        }
      }
      
      const hasInLog = Boolean(timeIn)
      const hasOutLog = Boolean(timeOut)
      const displayStatus = formatDtrStatusLabel(status, hasInLog, hasOutLog)

      return `
        <tr>
          <td style="text-align: center; font-weight: bold; border: 1px solid #000; padding: 2px; font-size: 8px;">${dayName}</td>
          <td style="text-align: center; border: 1px solid #000; padding: 2px; font-size: 8px;">${dateNum}</td>
          <td style="text-align: center; border: 1px solid #000; padding: 2px; font-size: 8px;">${timeIn}</td>
          <td style="text-align: center; border: 1px solid #000; padding: 2px; font-size: 8px;">${timeOut}</td>
          <td style="text-align: center; border: 1px solid #000; padding: 2px;"></td>
          <td style="text-align: center; border: 1px solid #000; padding: 2px; font-size: 7px;">${displayStatus}</td>
        </tr>
      `
    }).join('')
    
    return `
      <div class="dtr-header">
        <div style="display: flex; align-items: flex-start; margin-bottom: 8px;">
          <img src="/Landing Page_/TqEOF7H.png" style="width: 50px; height: 50px; margin-right: 10px; object-fit: contain;" alt="STI Logo" />
          <div style="flex: 1; text-align: center;">
            <div style="font-size: 14px; font-weight: bold; color: #1e40af; letter-spacing: 0.3px;">STI COLLEGE SANTA ROSA</div>
            <div style="font-size: 8px; color: #666; margin-top: 1px;">Ruby Street, Santa Rosa Commercial Complex, Barangay Balibago, City of Santa Rosa</div>
            <div style="text-align: center; font-size: 11px; font-weight: bold; margin-top: 6px; text-decoration: underline; letter-spacing: 0.3px;">
              FACULTY DAILY TIME RECORD
            </div>
          </div>
        </div>
      </div>
      
      <div class="employee-info" style="margin-bottom: 8px; padding: 0 5px;">
        <table style="width: 100%; font-size: 9px; border-collapse: collapse;">
          <tr>
            <td style="width: 13%; padding: 2px 0; font-weight: 600; vertical-align: bottom;">FACULTY NAME:</td>
            <td style="width: 37%; padding: 2px 4px; border-bottom: 1px solid #333; vertical-align: bottom; font-size: 8px;">${employee.full_name}</td>
            <td style="width: 13%; padding: 2px 0 2px 10px; font-weight: 600; text-align: right; vertical-align: bottom;">SCHOOL YEAR:</td>
            <td style="width: 37%; padding: 2px 4px; border-bottom: 1px solid #333; text-align: right; vertical-align: bottom; font-size: 8px;">${schoolYear}</td>
          </tr>
          <tr>
            <td style="padding: 2px 0; font-weight: 600; vertical-align: bottom;">DEPARTMENT:</td>
            <td style="padding: 2px 4px; border-bottom: 1px solid #333; vertical-align: bottom; font-size: 8px;">${employee.department || 'N/A'}</td>
            <td style="padding: 2px 0 2px 10px; font-weight: 600; text-align: right; vertical-align: bottom;">SEMESTER:</td>
            <td style="padding: 2px 4px; border-bottom: 1px solid #333; text-align: right; vertical-align: bottom; font-size: 8px;">${semesterLabel}</td>
          </tr>
          <tr>
            <td style="padding: 2px 0; font-weight: 600; vertical-align: bottom;">CUT-OFF PERIOD:</td>
            <td colspan="3" style="padding: 2px 4px; border-bottom: 1px solid #333; vertical-align: bottom; font-size: 8px;">${format(new Date(startDate), 'MMMM dd, yyyy')} - ${format(new Date(endDate), 'MMMM dd, yyyy')}</td>
          </tr>
        </table>
      </div>
      
      <table class="attendance-table" style="width: 100%; border-collapse: collapse; font-size: 8px; margin-bottom: 8px;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="border: 1px solid #333; padding: 3px; width: 8%; font-weight: 600; font-size: 8px;">DAY</th>
            <th style="border: 1px solid #333; padding: 3px; width: 8%; font-weight: 600; font-size: 8px;">DATE</th>
            <th style="border: 1px solid #333; padding: 3px; width: 14%; font-weight: 600; font-size: 8px;">TIME IN</th>
            <th style="border: 1px solid #333; padding: 3px; width: 14%; font-weight: 600; font-size: 8px;">TIME OUT</th>
            <th style="border: 1px solid #333; padding: 3px; width: 18%; font-weight: 600; font-size: 8px;">SIGNATURE</th>
            <th style="border: 1px solid #333; padding: 3px; width: 38%; font-weight: 600; font-size: 8px;">REMARKS</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      
      ${(() => {
        // Debug logging for summary section
        console.log('DTR Summary Section:', {
          employee: employee.full_name,
          showAdminTime,
          totalAdminTimeCount,
          totalAdminTimeHours: totalAdminTimeHours.toFixed(2),
          totalLateCount,
          totalUndertimeCount,
          totalAbsentCount
        });
        return '';
      })()}
      
      <div style="margin-bottom: 8px; padding: 0 5px;">
        <table style="width: 100%; font-size: 8px; border-collapse: collapse;">
          <tr>
            <td style="width: 40%; padding: 2px 0; font-weight: 600;">Number of Lates:</td>
            <td style="width: 60%; padding: 2px 4px; border-bottom: 1px solid #333; font-size: 8px;">${totalLateCount} day(s) - ${(totalLateMinutes / 60).toFixed(2)} hour(s)</td>
          </tr>
          <tr>
            <td style="padding: 2px 0; font-weight: 600;">Number of Undertimes:</td>
            <td style="padding: 2px 4px; border-bottom: 1px solid #333; font-size: 8px;">${totalUndertimeCount} day(s) - ${(totalUndertimeMinutes / 60).toFixed(2)} hour(s)</td>
          </tr>
          ${showAdminTime ? `
          <tr>
            <td style="padding: 2px 0; font-weight: 600;">Number of Admin Time / Non-Teaching Load:</td>
            <td style="padding: 2px 4px; border-bottom: 1px solid #333; font-size: 8px;">${totalAdminTimeCount} day(s) - ${totalAdminTimeHours.toFixed(2)} hour(s)</td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 2px 0; font-weight: 600;">Number of Absences:</td>
            <td style="padding: 2px 4px; border-bottom: 1px solid #333; font-size: 8px;">${totalAbsentCount} day(s)</td>
          </tr>
        </table>
      </div>
      
      <div style="margin-bottom: 8px;">
        <div style="font-size: 8px; font-weight: bold; margin-bottom: 2px;">Remarks:</div>
        <div style="border: 1px solid #000; min-height: 30px; padding: 3px; font-size: 7px;"></div>
      </div>
      
      <div class="signature-section" style="display: flex; justify-content: space-between; font-size: 8px; margin-top: 10px;">
        <div style="text-align: center; width: 22%;">
          <div style="border-bottom: 1px solid #000; margin-bottom: 2px; height: 25px;"></div>
          <div style="font-weight: bold; font-size: 8px;">Checked by:</div>
          <div style="font-size: 7px; margin-top: 1px;">Program Coordinator</div>
        </div>
        <div style="text-align: center; width: 22%;">
          <div style="border-bottom: 1px solid #000; margin-bottom: 2px; height: 25px;"></div>
          <div style="font-weight: bold; font-size: 8px;">Approved by:</div>
          <div style="font-size: 7px; margin-top: 1px;">Academic Head</div>
        </div>
      </div>
      
      <div style="margin-top: 8px; padding-top: 5px; border-top: 1px solid #ddd; text-align: left; font-size: 7px; color: #666;">
        <span style="font-weight: 600;">Generated by:</span> ${generatedBy}
      </div>
    `
  }

  // Toggle employee selection for bulk export
  const toggleEmployeeSelection = (employeeId: number) => {
    setSelectedEmployeeIds(prev => 
      prev.includes(employeeId) 
        ? prev.filter(id => id !== employeeId)
        : [...prev, employeeId]
    )
  }

  // Select all visible employees (filtered by user's staff type access)
  const selectAllEmployees = () => {
    const staffTypeFilter = getStaffFilter()
    
    // Filter employees by appropriate staff type
    const filteredEmployees = employees.filter(emp => !staffTypeFilter || emp.staff_type === staffTypeFilter)
    const visibleEmployees = attendanceStats.filter(stat => {
      const hasCorrectStaffType = filteredEmployees.some(emp => emp.employee_id === stat.employee_id)
      const matchesFilter = selectedEmployee === "All Employees" || stat.full_name === selectedEmployee
      return hasCorrectStaffType && matchesFilter
    })
    setSelectedEmployeeIds(visibleEmployees.map(stat => stat.employee_id))
  }

  // Clear all selections
  const clearAllSelections = () => {
    setSelectedEmployeeIds([])
  }

  // DTR Summary Functions
  const fetchDTRInitialData = async () => {
    try {
      // Get current user from localStorage
      const user = getLocalUser()
      setCurrentUser(user)

      // Fetch academic terms
      const termRes = await fetch('/api/academic-terms', { cache: 'no-store' })
      const rawTermData = termRes.ok ? await termRes.json().catch(() => []) : []
      const termData = normalizeAcademicTermsPayload(rawTermData)

      if (termData.length > 0) {
        setAcademicTerms(termData)
        // Set default date range to active term if exists
        const activeTerm = termData.find((t: any) => t.is_active)
        if (activeTerm) {
          setDtrDateFrom(activeTerm.start_date)
          setDtrDateTo(activeTerm.end_date)
          setSelectedTerm(activeTerm.id.toString())
          syncDTRAcademicTermFields(activeTerm)
        } else {
          // Default to current month
          const now = new Date()
          setDtrDateFrom(format(startOfMonth(now), 'yyyy-MM-dd'))
          setDtrDateTo(format(endOfMonth(now), 'yyyy-MM-dd'))
        }
      } else {
        setAcademicTerms([])
        const now = new Date()
        setDtrDateFrom(format(startOfMonth(now), 'yyyy-MM-dd'))
        setDtrDateTo(format(endOfMonth(now), 'yyyy-MM-dd'))
      }
    } catch (error) {
      console.error('Error fetching DTR initial data:', error)
      sonnerToast.error('Failed to load initial data')
    }
  }

  const fetchDTRData = async () => {
    if (!dtrDateFrom || !dtrDateTo) {
      sonnerToast.error('Please select a date range')
      return
    }

    try {
      setLoadingDTR(true)

      const staffType = getStaffFilter()
      const logs = await fetchReportAttendanceLogs({
        employeeId: dtrEmployee !== 'all' ? Number(dtrEmployee) : undefined,
        dateFrom: dtrDateFrom,
        dateTo: dtrDateTo,
        department: dtrDepartment !== 'all' ? dtrDepartment : undefined,
        staffType,
        limit: 20000,
      })

      // Aggregate by employee and by date to avoid double counting and get precise daily categories
      const employeeMap = new Map<number, any>()

      // Group logs by employee then by date
      const byEmp = new Map<number, Map<string, any[]>>()
      ;(logs || []).forEach((log: any) => {
        const empId = log.employee_id
        if (!byEmp.has(empId)) byEmp.set(empId, new Map<string, any[]>())
        const empMap = byEmp.get(empId)!
        const d = (log.date || '').substring(0,10)
        if (!d) return
        if (!empMap.has(d)) empMap.set(d, [])
        empMap.get(d)!.push(log)
      })

      for (const [empId, datesMap] of byEmp) {
        const employee = (logs || []).find((l:any)=>l.employee_id===empId)?.employees
        const isTeachingStaff = String(employee?.staff_type || '').toLowerCase() === 'teaching'
        const aggregate = {
          employee,
          logs: ([] as any[]).concat(...Array.from(datesMap.values())),
          totalLateMinutes: 0,
          totalUndertimeMinutes: 0,
          totalDaysPresent: 0,
          totalDaysLate: 0,
          totalDaysAbsent: 0,
          totalAdminTimeDays: 0
        }

        for (const [dateStr, dayLogs] of datesMap) {
          const inLog = dayLogs.find((l:any)=>l.log_type==='IN')
          const outLog = dayLogs.find((l:any)=>l.log_type==='OUT')
          const statuses = new Set((dayLogs.map((l:any)=> (l.attendance_status||'').toLowerCase())))
          const isAbsent = statuses.has('absent')
          const isAdmin = Array.from(statuses).some(s=> s.includes('admin')) || dayLogs.some((l:any)=> l.is_admin_time === true)
          const countAdmin = isTeachingStaff && isAdmin
          const isLate = (inLog?.is_late === true) || ((inLog?.late_minutes||0) > 0) || statuses.has('late')
          const isUndertime = (outLog?.is_early_out === true) || ((outLog?.undertime_minutes||0) > 0) || statuses.has('undertime')

          if (isAbsent) {
            aggregate.totalDaysAbsent++
          } else if (countAdmin) {
            aggregate.totalAdminTimeDays++
          } else if (inLog || outLog) {
            aggregate.totalDaysPresent++
            if (isLate) aggregate.totalDaysLate++
          }

          aggregate.totalLateMinutes += Math.max(0, inLog?.late_minutes || 0)
          aggregate.totalUndertimeMinutes += Math.max(0, outLog?.undertime_minutes || 0)
        }

        employeeMap.set(empId, aggregate)
      }

      setDtrData(Array.from(employeeMap.values()))
    } catch (error: any) {
      console.error('Error fetching DTR data:', error)
      sonnerToast.error(error.message || 'Failed to load DTR data')
    } finally {
      setLoadingDTR(false)
    }
  }

  const handleDTRBulkExport = async () => {
    if (selectedEmployeeIds.length === 0) {
      sonnerToast.error('Please select at least one employee')
      return
    }

    if (!dtrDateFrom || !dtrDateTo) {
      sonnerToast.error('Please select a date range')
      return
    }

    try {
      setIsBulkExporting(true)

      const response = await fetch('/api/reports/export-bulk-dtr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeIds: selectedEmployeeIds,
          dateFrom: dtrDateFrom,
          dateTo: dtrDateTo
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate bulk DTR')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      
      let filename = `Bulk_DTR_${selectedEmployeeIds.length}_employees.zip`
      const contentDisposition = response.headers.get('Content-Disposition')
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+)"?/)
        if (match) filename = match[1]
      }
      
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      sonnerToast.success(`Bulk DTR exported successfully (${selectedEmployeeIds.length} employees)`)
      setBulkExportMode(false)
      setSelectedEmployeeIds([])
    } catch (error: any) {
      console.error('Bulk DTR export error:', error)
      sonnerToast.error(error.message || 'Failed to generate bulk DTR')
    } finally {
      setIsBulkExporting(false)
    }
  }

  const toggleDTREmployeeSelection = (employeeId: number) => {
    setSelectedEmployeeIds(prev => {
      if (prev.includes(employeeId)) {
        return prev.filter(id => id !== employeeId)
      } else {
        return [...prev, employeeId]
      }
    })
  }

  const selectAllDTREmployees = () => {
    if (selectedEmployeeIds.length === dtrData.length) {
      setSelectedEmployeeIds([])
    } else {
      setSelectedEmployeeIds(dtrData.map((d: any) => d.employee.employee_id))
    }
  }

  const formatMinutesToHours = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours === 0) return `${mins}m`
    return `${hours}h ${mins}m`
  }

  const getRoleText = () => {
    const staffTypeFilter = getStaffFilter()
    if (staffTypeFilter === 'Non-Teaching') return 'Non-Teaching Staff'
    if (staffTypeFilter === 'Teaching') return 'Teaching Staff'
    return 'All Staff'
  }

  // Load DTR data when tab changes to DTR Summary
  useEffect(() => {
    if (activeTab === 'dtr-summary') {
      fetchDTRInitialData()
    }
  }, [activeTab])

  // Get filtered employees for DTR
  const filteredEmployeesForDTR = employees.filter((emp: any) => {
    return isVisibleToCurrentUser(emp)
  })

  // Get departments from filtered employees
  const dtrDepartments = [...new Set(filteredEmployeesForDTR.map((e: any) => e.department).filter(Boolean))]

  const getDepartmentSummary = () => {
    console.log('Reports: Generating department summary')
    const today = new Date().toISOString().split('T')[0]
    const departments = [...new Set(employees.map((emp) => emp.department))]
    return departments.map((dept) => {
      const deptEmployees = employees.filter((emp) => emp.department === dept)
      const deptLogs = attendanceLogs.filter((log) => deptEmployees.some((emp) => emp.employee_id === log.employee_id))

      // Count present logs: any log that's not absent (includes on-time, late, undertime)
      const presentCount = deptLogs.filter((log) => !isAbsentStatus(log.attendance_status)).length
      const lateCount = deptLogs.filter((log) => log.is_late).length
      
      // Count employees whose work hasn't started yet
      const workNotStartedCount = deptEmployees.filter((emp: any) => {
        const startDate = (emp as any).start_date || emp.hire_date
        if (!startDate) return false // If no start_date, assume work has started (backward compatibility)
        const startDateObj = new Date(startDate + 'T00:00:00')
        const todayObj = new Date(today + 'T00:00:00')
        return startDateObj > todayObj // Work hasn't started if start_date is in the future
      }).length
      
      const totalEmployees = deptEmployees.length
      const totalLogs = deptLogs.length || 1

      return {
        department: dept,
        total_employees: totalEmployees,
        attendance_rate: Math.round((presentCount / totalLogs) * 100),
        late_rate: Math.round((lateCount / totalLogs) * 100),
        work_not_started_rate: totalEmployees > 0 ? Math.round((workNotStartedCount / totalEmployees) * 100) : 0,
        present_count: presentCount,
        late_count: lateCount,
        work_not_started_count: workNotStartedCount,
      }
    })
  }

  const getDailyAttendanceData = () => {
    console.log('Reports: Generating daily attendance chart data')
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), i)
      const dateStr = format(date, "yyyy-MM-dd")
      const dateObj = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      const dayLogs = attendanceLogs.filter((log) => (log.date || '').substring(0, 10) === dateStr)

      const presentEmployeeIds = new Set(
        dayLogs
          .filter((log) => !isAbsentStatus(log.attendance_status))
          .map((log) => Number(log.employee_id))
          .filter((id) => Number.isFinite(id))
      )

      const absentEmployeeIds = new Set(
        dayLogs
          .filter((log) => isAbsentStatus(log.attendance_status))
          .map((log) => Number(log.employee_id))
          .filter((id) => Number.isFinite(id))
      )
      
      // Count present, late, undertime for employees whose work has started
      // Present/absent are based on explicit attendance_logs statuses only.
      const presentCount = presentEmployeeIds.size
      const lateCount = dayLogs.filter((log) => log.is_late).length
      const undertimeCount = dayLogs.filter((log) => log.is_early_out).length
      
      // Filter employees whose work has started (exclude those whose start_date is in the future)
      const employeesWhoseWorkStarted = employees.filter((emp: any) => {
        const startDate = (emp as any).start_date || emp.hire_date
        if (!startDate) return true // If no start_date, include them
        const startDateObj = new Date(startDate + 'T00:00:00')
        return dateObj >= startDateObj // Only include if date >= start_date
      })
      
      // Count employees whose work hasn't started yet
      const workNotStartedCount = employees.length - employeesWhoseWorkStarted.length
      
      const absentCount = absentEmployeeIds.size

      return {
        date: format(date, "MMM dd"),
        present: presentCount,
        late: dayLogs.filter((log) => log.is_late).length,
        undertime: dayLogs.filter((log) => (log as any).is_early_out).length,
        absent: absentCount,
        work_not_started: workNotStartedCount,
      }
    }).reverse()

    return last7Days
  }

  const attendanceStatsRaw = attendanceStatsData
  
  // Get current staff type filter
  const currentStaffFilter = getStaffFilter()
  
  // Define Non-Teaching departments for fallback filtering
  const nonTeachingDepts = ['Utility', 'Cashier', 'Accounting', 'Finance', 'HR', 'Admin', 'Maintenance', 'Security', 'Registrar', 'Library']
  
  // CRITICAL: Filter to only include employees that are in the current filtered employees array
  // This ensures staff type filtering is respected (Teaching vs Non-Teaching)
  const attendanceStatsFiltered = attendanceStatsRaw.filter((stat) => {
    const emp = employees.find((e) => e.employee_id === stat.employee_id)
    
    if (!emp) {
      console.log('[Reports] Filtering out employee from stats (not in employees array):', stat.full_name, 'ID:', stat.employee_id)
      return false
    }
    
    // Additional safety: Check staff type and department
    if (currentStaffFilter) {
      // If staff_type is set, use it
      if (emp.staff_type) {
        const matches = emp.staff_type === currentStaffFilter
        if (!matches) {
          console.log('[Reports] Filtering out employee (staff_type mismatch):', stat.full_name, 'staff_type:', emp.staff_type, 'filter:', currentStaffFilter)
        }
        return matches
      }
      
      // Fallback: Filter by department if staff_type is NULL
      const isNonTeaching = nonTeachingDepts.some(dept => 
        emp.department?.toLowerCase().includes(dept.toLowerCase())
      )
      
      if (currentStaffFilter === 'Teaching' && isNonTeaching) {
        console.log('[Reports] Filtering out employee (non-teaching dept):', stat.full_name, 'dept:', emp.department)
        return false
      }
      
      if (currentStaffFilter === 'Non-Teaching' && !isNonTeaching) {
        console.log('[Reports] Filtering out employee (teaching dept):', stat.full_name, 'dept:', emp.department)
        return false
      }
    }
    
    return true
  })
  
  console.log('[Reports] Attendance stats filtering:', {
    raw: attendanceStatsRaw.length,
    afterFilter: attendanceStatsFiltered.length,
    employeesCount: employees.length
  })
  
  // Filter out employees whose work hasn't started if hideNotStarted is true
  // CRITICAL: Use hasWorkStarted helper with TODAY's date (Manila timezone) to properly check if work has started
  const attendanceStats = hideNotStarted 
    ? attendanceStatsFiltered.filter((stat) => {
        // Find the employee to check their start_date
        const employee = employees.find((e) => e.employee_id === stat.employee_id)
        if (!employee) return true // If employee not found, include them (shouldn't happen)
        
        // Get today's date in Manila timezone (YYYY-MM-DD format)
        const today = getManilaToday()
        
        // Get employee's start_date and hire_date
        const startDate = (employee as any).start_date || employee.hire_date
        const hireDate = employee.hire_date
        
        // Use hasWorkStarted helper to properly check if work has started by TODAY
        // This handles all edge cases (hire_date, start_date, timezone, etc.)
        const workStarted = hasWorkStarted(today, startDate, hireDate)
        
        // Only show employees whose work has started (exclude "Not Started" employees)
        return workStarted
      })
    : attendanceStatsFiltered

  const analyticsDepartmentOptions = [...new Set(
    attendanceStats
      .map((stat) => employees.find((e) => e.employee_id === stat.employee_id)?.department)
      .filter(Boolean)
  )] as string[]

  const analyticsRows = attendanceStats
    .filter((stat) => {
      const emp = employees.find((e) => e.employee_id === stat.employee_id)
      if (!emp) return false

      if (analyticsDepartmentFilter !== 'all' && emp.department !== analyticsDepartmentFilter) {
        return false
      }

      if (analyticsEmployeeFilter !== 'all' && String(stat.employee_id) !== analyticsEmployeeFilter) {
        return false
      }

      return true
    })
    .map((stat) => {
      const employee = employees.find((e) => e.employee_id === stat.employee_id)
      const displayName = formatEmployeeNameLastFirst(stat.full_name)
      return {
        ...stat,
        employee,
        displayName,
      }
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName))

  useEffect(() => {
    if (analyticsEmployeeFilter === 'all') return
    const stillVisible = analyticsRows.some((r) => String(r.employee_id) === analyticsEmployeeFilter)
    if (!stillVisible) {
      setAnalyticsEmployeeFilter('all')
    }
  }, [analyticsEmployeeFilter, analyticsRows])

  const departmentSummary = (deptPerf && deptPerf.length > 0) ? deptPerf : getDepartmentSummary()
  const dailyAttendanceData = (weeklyTrend && weeklyTrend.length > 0)
    ? weeklyTrend
    : getDailyAttendanceData()
  
  // Check if employees have minimum 4 logs in the cutoff period to enable Apply Cutoff button (for detail modal)
  const cutoffRange = computeCutoffRange(cutoffMode, new Date())
  const startStr = toISO(cutoffRange.start)
  const endStr = toISO(cutoffRange.end)
  const filteredLogsInCutoff = attendanceLogs.filter((log) => {
    const logDate = log.date
    return logDate >= startStr && logDate <= endStr
  })
  // Count unique employees with logs in cutoff period
  const employeesWithLogsInCutoff = new Set(filteredLogsInCutoff.map((log) => log.employee_id))
  // Count total logs per employee and check if any employee has at least 4 logs
  const employeeLogCounts = new Map<number, number>()
  filteredLogsInCutoff.forEach((log) => {
    const count = employeeLogCounts.get(log.employee_id) || 0
    employeeLogCounts.set(log.employee_id, count + 1)
  })
  const hasMinimumLogs = Array.from(employeeLogCounts.values()).some((count) => count >= 4)
  const canApplyCutoff = employeesWithLogsInCutoff.size > 0 && hasMinimumLogs
  
  // Debug logging
  console.log('Department Summary Data:', departmentSummary)
  console.log('Daily Attendance Data:', dailyAttendanceData)

  

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6 px-4 sm:px-6 py-4 sm:py-6 animate-fadeInUp">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6 px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-6 animate-fadeInUp">
      <style jsx global>{`
        .dtr-preview-container .dtr-preview-page {
          background: white !important;
        }
        
        .dtr-preview-container .dtr-preview-page,
        .dtr-preview-container .dtr-preview-page * {
          color: black !important;
        }
        
        .dtr-preview-container .dtr-preview-page td,
        .dtr-preview-container .dtr-preview-page th,
        .dtr-preview-container .dtr-preview-page div,
        .dtr-preview-container .dtr-preview-page span {
          color: inherit !important;
        }
        
        @media (prefers-color-scheme: dark) {
          .dark .dtr-preview-container .dtr-preview-page {
            background: white !important;
          }
          
          .dark .dtr-preview-container .dtr-preview-page,
          .dark .dtr-preview-container .dtr-preview-page * {
            color: black !important;
          }
        }
      `}</style>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center justify-between mb-4">
          <TabsList className="grid w-full max-w-md grid-cols-1">
            <TabsTrigger value="dtr-summary">Daily Time Record</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="analytics" className="space-y-3 sm:space-y-4 md:space-y-6">
      {/* MOBILE HEADER - Compact Design */}
      <div className="block lg:hidden space-y-2 sm:space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{t('reports.title')}</h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mt-0.5">{t('reports.subtitle')}</p>
          </div>
          <Button 
            onClick={() => loadData()} 
            variant="outline"
            size="icon"
            className="h-10 w-10 sm:h-11 sm:w-11 touch-manipulation shrink-0"
          >
            <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
        </div>
      </div>

      {/* DESKTOP HEADER - Full Design */}
      <div className="hidden lg:flex flex-col gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">{t('reports.title')}</h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 mt-1 sm:mt-2">{t('reports.subtitle')}</p>
        </div>
      </div>

      {/* MOBILE STATS - Horizontal Swipeable */}
      <div className="block lg:hidden overflow-x-auto pb-2 -mx-3 sm:-mx-4 px-3 sm:px-4 scrollbar-hide pointer-events-auto" 
        style={{
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}>
        <div className="flex gap-3 min-w-max pointer-events-auto select-auto">
          <Card className="min-w-[140px] sm:min-w-40 group relative overflow-hidden bg-linear-to-br from-white to-blue-50/50 dark:from-gray-800 dark:to-blue-950/20 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow touch-manipulation">
            <CardContent className="p-3 sm:p-4 relative">
              <div className="flex flex-col items-center text-center">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-2">
                  <Users className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-400">{stats.totalEmployees}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t('reports.total_employees')}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="min-w-[140px] sm:min-w-40 group relative overflow-hidden bg-linear-to-br from-white to-green-50/50 dark:from-gray-800 dark:to-green-950/20 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow touch-manipulation">
            <CardContent className="p-3 sm:p-4 relative">
              <div className="flex flex-col items-center text-center">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-2">
                  <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-lg sm:text-xl font-bold text-green-600 dark:text-green-400">{stats.presentToday}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t('reports.present_today')}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="min-w-[140px] sm:min-w-40 group relative overflow-hidden bg-linear-to-br from-white to-orange-50/50 dark:from-gray-800 dark:to-orange-950/20 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow touch-manipulation">
            <CardContent className="p-3 sm:p-4 relative">
              <div className="flex flex-col items-center text-center">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mb-2">
                  <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <p className="text-lg sm:text-xl font-bold text-orange-600 dark:text-orange-400">{stats.lateToday}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t('reports.late_today')}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="min-w-[140px] sm:min-w-40 group relative overflow-hidden bg-linear-to-br from-white to-red-50/50 dark:from-gray-800 dark:to-red-950/20 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow touch-manipulation">
            <CardContent className="p-3 sm:p-4 relative">
              <div className="flex flex-col items-center text-center">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-2">
                  <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-red-600 dark:text-red-400" />
                </div>
                <p className="text-lg sm:text-xl font-bold text-red-600 dark:text-red-400">{stats.absentToday}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t('reports.absent_today')}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* DESKTOP STATS - Grid Layout */}
      <div className="hidden lg:grid lg:grid-cols-4 gap-4 sm:gap-6">
        <Card className="group relative overflow-hidden bg-linear-to-br from-white to-blue-50/50 dark:from-gray-800 dark:to-blue-950/20 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <div className="absolute inset-0 bg-linear-to-br from-blue-500/0 to-transparent group-hover:from-blue-500/5 group-hover:to-purple-500/5 transition-all duration-500"></div>
          <CardContent className="p-4 sm:p-6 relative">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{t('reports.total_employees')}</p>
                <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform duration-200">{stats.totalEmployees}</p>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('reports.active_workforce')}</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shadow-md group-hover:scale-110 group-hover:shadow-lg transition-all duration-300 shrink-0">
                <Users className="h-5 w-5 sm:h-7 sm:w-7 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden bg-linear-to-br from-white to-green-50/50 dark:from-gray-800 dark:to-green-950/20 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <div className="absolute inset-0 bg-linear-to-br from-green-500/0 to-transparent group-hover:from-green-500/5 group-hover:to-emerald-500/5 transition-all duration-500"></div>
          <CardContent className="p-4 sm:p-6 relative">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{t('reports.present_today')}</p>
                <p className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400 group-hover:scale-105 transition-transform duration-200">{stats.presentToday}</p>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {stats.totalEmployees > 0 ? Math.round((stats.presentToday / stats.totalEmployees) * 100) : 0}%
                  {t('reports.attendance')}
                </p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center shadow-md group-hover:scale-110 group-hover:shadow-lg transition-all duration-300 shrink-0">
                <CheckCircle className="h-5 w-5 sm:h-7 sm:w-7 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden bg-linear-to-br from-white to-orange-50/50 dark:from-gray-800 dark:to-orange-950/20 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <div className="absolute inset-0 bg-linear-to-br from-orange-500/0 to-transparent group-hover:from-orange-500/5 group-hover:to-amber-500/5 transition-all duration-500"></div>
          <CardContent className="p-4 sm:p-6 relative">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{t('reports.late_today')}</p>
                <p className="text-2xl sm:text-3xl font-bold text-orange-600 dark:text-orange-400 group-hover:scale-105 transition-transform duration-200">{stats.lateToday}</p>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('reports.need_attention')}</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shadow-md group-hover:scale-110 group-hover:shadow-lg transition-all duration-300 shrink-0">
                <Clock className="h-5 w-5 sm:h-7 sm:w-7 text-orange-600 dark:text-orange-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden bg-linear-to-br from-white to-red-50/50 dark:from-gray-800 dark:to-red-950/20 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <div className="absolute inset-0 bg-linear-to-br from-red-500/0 to-transparent group-hover:from-red-500/5 group-hover:to-rose-500/5 transition-all duration-500"></div>
          <CardContent className="p-4 sm:p-6 relative">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{t('reports.absent_today')}</p>
                <p className="text-2xl sm:text-3xl font-bold text-red-600 dark:text-red-400 group-hover:scale-105 transition-transform duration-200">{stats.absentToday}</p>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('reports.follow_up_required')}</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shadow-md group-hover:scale-110 group-hover:shadow-lg transition-all duration-300 shrink-0">
                <AlertTriangle className="h-5 w-5 sm:h-7 sm:w-7 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Explorer */}
      <Card className="border-gray-200 dark:border-gray-700 shadow-sm">
        <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                  Analytics Explorer (Preview)
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm mt-1">
                  Filter by department and employee, then click a row to preview full analytics in the selected cutoff period.
                </CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Cutoff {selectedCutoffPeriod}: {format(mainReportDateRange.from, 'MMM dd')} - {format(mainReportDateRange.to, 'MMM dd, yyyy')}
                </Badge>
                <div className="grid grid-cols-2 gap-1 w-full sm:w-auto sm:min-w-[280px]">
                  <Button
                    type="button"
                    variant={selectedCutoffPeriod === '26-10' ? 'default' : 'outline'}
                    className={cn(
                      "h-[56px] flex flex-col items-start justify-center p-2 rounded-lg border transition-all",
                      selectedCutoffPeriod === '26-10'
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-400/60 shadow-md'
                        : 'bg-white text-gray-800 border-slate-300 hover:bg-slate-100 dark:bg-slate-950/60 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-900'
                    )}
                    onClick={() => setSelectedCutoffPeriod('26-10')}
                  >
                    <span className="font-semibold text-xs">26th to 10th</span>
                    <span className={cn(
                      "text-[10px] mt-0.5",
                      selectedCutoffPeriod === '26-10' ? 'text-indigo-100' : 'text-gray-500 dark:text-slate-400'
                    )}>
                      Previous 26 - Current 10
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant={selectedCutoffPeriod === '11-25' ? 'default' : 'outline'}
                    className={cn(
                      "h-[56px] flex flex-col items-start justify-center p-2 rounded-lg border transition-all",
                      selectedCutoffPeriod === '11-25'
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-400/60 shadow-md'
                        : 'bg-white text-gray-800 border-slate-300 hover:bg-slate-100 dark:bg-slate-950/60 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-900'
                    )}
                    onClick={() => setSelectedCutoffPeriod('11-25')}
                  >
                    <span className="font-semibold text-xs">11th to 25th</span>
                    <span className={cn(
                      "text-[10px] mt-0.5",
                      selectedCutoffPeriod === '11-25' ? 'text-indigo-100' : 'text-gray-500 dark:text-slate-400'
                    )}>
                      Current month 11 - 25
                    </span>
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Department</Label>
                <Select value={analyticsDepartmentFilter} onValueChange={setAnalyticsDepartmentFilter}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="All Departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {analyticsDepartmentOptions.map((dept) => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Employee</Label>
                <Select value={analyticsEmployeeFilter} onValueChange={setAnalyticsEmployeeFilter}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="All Employees" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees</SelectItem>
                    {analyticsRows.map((row) => (
                      <SelectItem key={row.employee_id} value={String(row.employee_id)}>
                        {row.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end gap-2">
                <Button onClick={() => loadData()} variant="outline" className="h-10 w-full">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Analytics
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 dark:bg-gray-800">
                    <TableHead className="font-semibold">Employee (Lastname, Firstname)</TableHead>
                    <TableHead className="font-semibold">Department</TableHead>
                    <TableHead className="text-center font-semibold">Total Days</TableHead>
                    <TableHead className="text-center font-semibold">Present</TableHead>
                    <TableHead className="text-center font-semibold">Late</TableHead>
                    <TableHead className="text-center font-semibold">Undertime</TableHead>
                    <TableHead className="text-center font-semibold">Absent</TableHead>
                    <TableHead className="text-center font-semibold">Preview</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analyticsRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                        No analytics records for current filters and cutoff period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    analyticsRows.map((row) => (
                      <TableRow
                        key={row.employee_id}
                        className="hover:bg-indigo-50 dark:hover:bg-indigo-900/20 cursor-pointer"
                        onClick={() => row.employee && openEmployeeDetail(row.employee, selectedCutoffPeriod)}
                      >
                        <TableCell className="font-medium">{row.displayName}</TableCell>
                        <TableCell className="text-sm text-gray-600 dark:text-gray-400">{row.department || row.employee?.department || 'N/A'}</TableCell>
                        <TableCell className="text-center">{row.total_days}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                            {row.present_days}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800">
                            {row.late_days}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800">
                            {row.undertime_days || 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                            {row.absent_days}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (row.employee) openEmployeeDetail(row.employee, selectedCutoffPeriod)
                            }}
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            Preview
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Department Summary - Mobile Responsive */}
        <Card>
          <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Users className="h-4 w-4 sm:h-5 sm:w-5" />
              {t('reports.department_summary')}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">{t('reports.performance_overview')}</CardDescription>
          </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
          {departmentSummary.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Users className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-lg font-medium">No data shown</p>
                <p className="text-gray-400 dark:text-gray-500 text-xs sm:text-sm mt-1">There is no department summary data available</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {departmentSummary.map((dept) => (
              <div key={dept.department} className="p-3 sm:p-4 border rounded-lg">
                <h3 className="font-semibold text-sm sm:text-lg mb-2 dark:text-gray-100">
                  <ScrollingText text={dept.department} className="text-sm sm:text-lg" />
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">Total Employees:</span>
                    <span className="font-medium text-sm sm:text-base dark:text-gray-100">{'total_employees' in dept ? dept.total_employees : (dept as any).total || 0}</span>
                  </div>
                </div>
              </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Employee Detail Modal - Mobile Swipeable Drawer */}
      <MobileDrawer open={detailOpen} onOpenChange={setDetailOpen}>
        <MobileDrawerContent onClose={() => setDetailOpen(false)} className="w-[95vw] sm:w-full max-w-[1800px] h-[95vh] sm:h-[90vh] flex flex-col overflow-hidden">
          {/* Fixed Header Section - Mobile Responsive */}
          <div className="shrink-0 border-b bg-linear-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 p-4 sm:p-6">
            <MobileDrawerHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
                <div className="flex-1">
                  <MobileDrawerTitle className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">
                    {detailEmployee?.full_name || 'Employee'}
                  </MobileDrawerTitle>
                  <p className="text-sm sm:text-base mt-1 text-gray-600 dark:text-gray-300">
                    <ScrollingText text={detailEmployee?.department || '—'} className="text-sm sm:text-base" />
                  </p>
                </div>
                <Badge variant="outline" className="text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 bg-white dark:bg-gray-800 whitespace-nowrap">
                  {humanRange(dateRange.from, dateRange.to)}
                </Badge>
              </div>
          
              {/* Simplified Controls Section - Mobile Responsive */}
              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 sm:gap-3 mt-3 sm:mt-4">
                {/* Date Picker with Cutoff Period Restriction - Mobile Responsive */}
                <Button 
                  type="button"
                  variant="outline" 
                  className="w-full sm:w-auto sm:min-w-[180px] h-11 sm:h-12 justify-start text-left font-normal hover:bg-gray-50 dark:hover:bg-gray-800 text-sm sm:text-base touch-manipulation"
                  onClick={() => setFromPopoverOpen(true)}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(dateRange.from, "MMM dd, yyyy")}
                </Button>
                
                <Dialog open={fromPopoverOpen} onOpenChange={setFromPopoverOpen}>
                  <DialogContent className="w-[95vw] sm:w-full sm:max-w-[425px] max-h-[90vh] overflow-y-auto p-0 z-[1300]">
                    <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2">
                      <DialogTitle className="text-base sm:text-lg font-semibold">Select Start Date</DialogTitle>
                      <DialogDescription className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Select a date within the {cutoffMode === '26-10' ? '26-10 (26th to next 10th)' : '11-25 (11th to 25th)'} cutoff period. The full range will be automatically calculated.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="px-4 sm:px-6 pb-2">
                      <Calendar 
                        mode="single" 
                        selected={dateRange.from} 
                        onSelect={(d) => {
                          if (d && detailEmployee) {
                            const isValid = isDateAllowedForCutoff(d, cutoffMode)
                            
                            if (isValid) {
                              // Automatically calculate the full range
                              const newRange = calculateRangeFromDate(d, cutoffMode)
                              setDateRange(newRange)
                              setFromPopoverOpen(false)
                              void fetchEmployeeDetail(detailEmployee, newRange.from, newRange.to)
                            } else {
                              toast({
                                title: "Invalid Date",
                                description: cutoffMode === '26-10' 
                                  ? "For 26-10 period, you can only select dates from the 26th to the 10th of the following month."
                                  : "For 11-25 period, you can only select dates from the 11th to the 25th of the same month.",
                                variant: "destructive"
                              })
                            }
                          }
                        }} 
                        initialFocus 
                        disabled={(date) => !isDateAllowedForCutoff(date, cutoffMode)}
                        captionLayout="dropdown"
                      />
                    </div>
                  </DialogContent>
                </Dialog>
                
                <span className="text-gray-500 dark:text-gray-400 font-medium text-sm sm:text-base hidden sm:inline">to</span>
                
                <Button 
                  type="button"
                  variant="outline" 
                  className="w-full sm:w-auto sm:min-w-[180px] h-11 sm:h-12 justify-start text-left font-normal hover:bg-gray-50 dark:hover:bg-gray-800 text-sm sm:text-base touch-manipulation"
                  onClick={() => setToPopoverOpen(true)}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(dateRange.to, "MMM dd, yyyy")}
                </Button>
                
                <Dialog open={toPopoverOpen} onOpenChange={setToPopoverOpen}>
                  <DialogContent className="w-[95vw] sm:w-full sm:max-w-[425px] max-h-[90vh] overflow-y-auto p-0 z-[1300]">
                    <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2">
                      <DialogTitle className="text-base sm:text-lg font-semibold">Select End Date</DialogTitle>
                      <DialogDescription className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Select a date within the {cutoffMode === '26-10' ? '26-10 (26th to next 10th)' : '11-25 (11th to 25th)'} cutoff period. The full range will be automatically calculated.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="px-4 sm:px-6 pb-2">
                      <Calendar 
                        mode="single" 
                        selected={dateRange.to} 
                        onSelect={(d) => {
                          if (d && detailEmployee) {
                            const isValid = isDateAllowedForCutoff(d, cutoffMode)
                            
                            if (isValid) {
                              // Automatically calculate the full range
                              const newRange = calculateRangeFromDate(d, cutoffMode)
                              setDateRange(newRange)
                              setToPopoverOpen(false)
                              void fetchEmployeeDetail(detailEmployee, newRange.from, newRange.to)
                            } else {
                              toast({
                                title: "Invalid Date",
                                description: cutoffMode === '26-10' 
                                  ? "For 26-10 period, you can only select dates from the 26th to the 10th of the following month."
                                  : "For 11-25 period, you can only select dates from the 11th to the 25th of the same month.",
                                variant: "destructive"
                              })
                            }
                          }
                        }} 
                        initialFocus 
                        disabled={(date) => !isDateAllowedForCutoff(date, cutoffMode)}
                        captionLayout="dropdown"
                      />
                    </div>
                  </DialogContent>
                </Dialog>
                
                {/* Cutoff Period Selector - Changes available date ranges - Mobile Responsive */}
                <Select value={cutoffMode} onValueChange={(v) => {
                  const mode = v as '26-10' | '11-25'
                  setCutoffMode(mode)
                  const { start, end } = computeCutoffRange(mode, new Date())
                  setDateRange({ from: start, to: end })
                  setFromPopoverOpen(false)
                  setToPopoverOpen(false)
                  if (detailEmployee) {
                    void fetchEmployeeDetail(detailEmployee, start, end)
                  }
                }}>
                  <SelectTrigger className="w-full sm:w-auto sm:min-w-[140px] h-11 sm:h-12 text-sm sm:text-base touch-manipulation">
                    <SelectValue placeholder="Select Cutoff" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="26-10">26–10</SelectItem>
                    <SelectItem value="11-25">11–25</SelectItem>
                  </SelectContent>
                </Select>
                
                {/* Time Format Selector - Mobile Responsive */}
                <Select value={getPreferredTimeFormat()} onValueChange={(v)=>{ setPreferredTimeFormat(v as any); if(detailEmployee) void fetchEmployeeDetail(detailEmployee, dateRange.from, dateRange.to) }}>
                  <SelectTrigger className="w-full sm:w-auto sm:min-w-[100px] h-11 sm:h-12 text-sm sm:text-base touch-manipulation">
                    <SelectValue placeholder="Time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12h">12h</SelectItem>
                    <SelectItem value="24h">24h</SelectItem>
                  </SelectContent>
                </Select>
                
                {/* Action Buttons - Mobile Responsive */}
                <Button 
                  className="btn-sti-primary h-11 sm:h-12 w-full sm:w-auto text-sm sm:text-base touch-manipulation" 
                  onClick={() => { if (detailEmployee) void fetchEmployeeDetail(detailEmployee, dateRange.from, dateRange.to) }}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={() => setPreviewOpen(true)} 
                  disabled={!hasCompleteLogs()}
                  className="h-11 sm:h-12 w-full sm:w-auto text-sm sm:text-base touch-manipulation"
                  title={!hasCompleteLogs() ? "Preview DTR is only available when there are complete attendance logs for the selected cutoff period" : "Preview Daily Time Record"}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Preview DTR
                </Button>
              </div>
            </MobileDrawerHeader>
          </div>

          {/* Scrollable Content Area - Mobile Responsive */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {/* Summary Cards - Mobile Responsive */}
            {detailSummary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
                <Card className="border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">On-Time</p>
                        <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{detailSummary.onTime}</p>
                      </div>
                      <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-lg shrink-0">
                        <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6 text-green-600 dark:text-green-400" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Late</p>
                        <p className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{detailSummary.late}</p>
                      </div>
                      <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-lg shrink-0">
                        <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600 dark:text-amber-400" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="border-l-4 border-l-orange-500 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Undertime</p>
                        <p className="text-xl sm:text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">{detailSummary.undertime}</p>
                      </div>
                      <div className="bg-orange-100 dark:bg-orange-900/30 p-2 rounded-lg shrink-0">
                        <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6 text-orange-600 dark:text-orange-400" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="border-l-4 border-l-red-500 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Absent</p>
                        <p className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{detailSummary.absent}</p>
                      </div>
                      <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-lg shrink-0">
                        <UserX className="h-5 w-5 sm:h-6 sm:w-6 text-red-600 dark:text-red-400" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {detailEmployee && (
              <Card className="mb-4 sm:mb-6 border border-blue-200/70 dark:border-blue-900/60 bg-linear-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-wide text-blue-700 dark:text-blue-300 font-semibold">Employee Analytics Preview</p>
                      <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">{detailEmployee.full_name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">{detailEmployee.department || 'No Department'} • {detailEmployee.unique_employee_id || detailEmployee.employee_id}</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs sm:text-sm">
                      <div className="rounded-md border bg-white/80 dark:bg-gray-900/60 px-3 py-2">
                        <p className="text-gray-500 dark:text-gray-400">Cutoff</p>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{cutoffMode === '26-10' ? '26-10' : '11-25'}</p>
                      </div>
                      <div className="rounded-md border bg-white/80 dark:bg-gray-900/60 px-3 py-2">
                        <p className="text-gray-500 dark:text-gray-400">From</p>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{formatInTimeZone(dateRange.from, PH_TZ, 'MMM dd, yyyy')}</p>
                      </div>
                      <div className="rounded-md border bg-white/80 dark:bg-gray-900/60 px-3 py-2">
                        <p className="text-gray-500 dark:text-gray-400">To</p>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{formatInTimeZone(dateRange.to, PH_TZ, 'MMM dd, yyyy')}</p>
                      </div>
                      <div className="rounded-md border bg-white/80 dark:bg-gray-900/60 px-3 py-2">
                        <p className="text-gray-500 dark:text-gray-400">Timezone</p>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">Asia/Manila</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {adminBreakdownDays.length > 0 && (
              <Card className="mb-4 sm:mb-6 border border-indigo-200/80 dark:border-indigo-900/70">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg">Admin Time Breakdown</CardTitle>
                  <CardDescription>
                    Detailed interval-by-interval explanation for each admin/non-teaching day in this cutoff.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="rounded-md border bg-indigo-50/60 dark:bg-indigo-950/20 px-3 py-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Admin Days</p>
                      <p className="text-lg font-semibold text-indigo-700 dark:text-indigo-300">{adminBreakdownDays.length}</p>
                    </div>
                    <div className="rounded-md border bg-indigo-50/60 dark:bg-indigo-950/20 px-3 py-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Total Admin Minutes</p>
                      <p className="text-lg font-semibold text-indigo-700 dark:text-indigo-300">{totalAdminBreakdownMinutes}</p>
                    </div>
                    <div className="rounded-md border bg-indigo-50/60 dark:bg-indigo-950/20 px-3 py-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Total Admin Duration</p>
                      <p className="text-lg font-semibold text-indigo-700 dark:text-indigo-300">{formatMinutesToHoursLabel(totalAdminBreakdownMinutes)}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {adminBreakdownDays.map((day) => (
                      <div key={`admin-breakdown-${day.date}`} className="rounded-md border px-3 py-2 bg-white dark:bg-gray-900/40">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-1">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatDetailDayLabel(day.date)}</p>
                          <p className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">
                            {formatMinutesToHoursLabel(day.adminMinutes || 0)}
                          </p>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                          {day.adminExplanation || 'No interval explanation available.'}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Attendance Records Table - Mobile Responsive */}
            <div>
              <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-900 dark:text-white">Daily Attendance Records</h3>
              
              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 dark:bg-gray-800">
                      <TableHead className="text-center font-semibold text-xs sm:text-sm">Date</TableHead>
                      <TableHead className="text-center font-semibold text-xs sm:text-sm">Time In</TableHead>
                      <TableHead className="text-center font-semibold text-xs sm:text-sm">Time Out</TableHead>
                      <TableHead className="text-center font-semibold text-xs sm:text-sm">Status</TableHead>
                      <TableHead className="font-semibold text-xs sm:text-sm">Admin Time Explanation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(!detailDays || detailDays.length === 0) ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-gray-500 dark:text-gray-400">
                          <div className="flex flex-col items-center gap-2">
                            <FileText className="h-12 w-12 opacity-20" />
                            <p className="text-sm">No attendance records found</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : detailDays.map((d, idx) => {
                    const toHHMM = (t?: string|null, logType?: 'IN'|'OUT') => {
                      if (!t) return ''
                      void logType
                      return formatDetailTimePH(t)
                    }
                    
                    const getStatusBadge = (day: { status: string | null; timeIn: string | null; timeOut: string | null; adminExplanation?: string | null }) => {
                      const status = day.status
                      // If status is null, return blank (for dates before start_date or future dates)
                      if (!status || status === null) {
                        return <span className="text-gray-400 dark:text-gray-500">-</span>
                      }
                      
                      const statusLower = status.toLowerCase().trim()

                      // Handle Work Not Started status explicitly as blank
                      if (statusLower === 'not-started' || statusLower === 'work-not-started') {
                        return <span className="text-gray-400 dark:text-gray-500">-</span>
                      }

                      const hasInLog = Boolean(day.timeIn && String(day.timeIn).trim() !== '' && String(day.timeIn) !== '-')
                      const hasOutLog = Boolean(day.timeOut && String(day.timeOut).trim() !== '' && String(day.timeOut) !== '-')
                      const displayLabel = formatDtrStatusLabel(status, hasInLog, hasOutLog)
                      if (!displayLabel) {
                        return <span className="text-gray-400 dark:text-gray-500">-</span>
                      }

                      if (displayLabel === 'Rest Day (Sunday)') {
                        return <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">{displayLabel}</Badge>
                      }

                      if (displayLabel.startsWith('Absent')) {
                        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">{displayLabel}</Badge>
                      }

                      if (displayLabel.includes('Missed Log')) {
                        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">{displayLabel}</Badge>
                      }

                      if (displayLabel.includes('Admin Time')) {
                        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">{displayLabel}</Badge>
                      }

                      if (displayLabel === 'On-Time') {
                        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">{displayLabel}</Badge>
                      }

                      if (displayLabel.includes('Late') && displayLabel.includes('Undertime')) {
                        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">{displayLabel}</Badge>
                      }

                      if (displayLabel.includes('Late') && displayLabel.includes('On-Time')) {
                        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">{displayLabel}</Badge>
                      }

                      if (displayLabel === 'Late') {
                        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">{displayLabel}</Badge>
                      }

                      if (displayLabel.includes('On-Time') && displayLabel.includes('Undertime')) {
                        return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">{displayLabel}</Badge>
                      }

                      if (displayLabel === 'Undertime') {
                        return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">{displayLabel}</Badge>
                      }

                      return <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">{displayLabel}</Badge>
                    }
                    
                    return (
                      <TableRow key={d.date} className={idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/50'}>
                        <TableCell className="text-center font-medium text-xs sm:text-sm">{formatDetailDayLabel(d.date)}</TableCell>
                        <TableCell className="text-center">
                          {d.timeIn ? (
                            <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-mono bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                              <Clock className="h-3 w-3" />
                              {toHHMM(d.timeIn, 'IN')}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs sm:text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {d.timeOut ? (
                            <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-mono bg-purple-50 dark:bg-purple-900/20 px-2 py-1 rounded">
                              <Clock className="h-3 w-3" />
                              {toHHMM(d.timeOut, 'OUT')}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs sm:text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">{getStatusBadge(d)}</TableCell>
                        <TableCell className="text-xs text-gray-700 dark:text-gray-300">
                          {String(d.status || '').toLowerCase().includes('admin') ? (
                            d.adminExplanation ? (
                              <span>{d.adminExplanation}</span>
                            ) : (
                              <span className="text-gray-400">No interval explanation available.</span>
                            )
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              </div>

              {/* Mobile Card View for Attendance Records */}
              <div className="lg:hidden space-y-3 mt-4">
                {(!detailDays || detailDays.length === 0) ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="h-12 w-12 opacity-20" />
                      <p className="text-sm">No attendance records found</p>
                    </div>
                  </div>
                ) : detailDays.map((d, idx) => {
                  const toHHMM = (t?: string|null, logType?: 'IN'|'OUT') => {
                    if (!t) return ''
                    void logType
                    return formatDetailTimePH(t)
                  }
                  
                  const getStatusBadge = (day: { status: string | null; timeIn: string | null; timeOut: string | null; adminExplanation?: string | null }) => {
                    const status = day.status
                    if (!status || status === null) {
                      return <span className="text-gray-400 dark:text-gray-500">-</span>
                    }
                    
                    const statusLower = status.toLowerCase().trim()

                    // Handle Work Not Started status explicitly as blank
                    if (statusLower === 'not-started' || statusLower === 'work-not-started') {
                      return <span className="text-gray-400 dark:text-gray-500">-</span>
                    }

                    const hasInLog = Boolean(day.timeIn && String(day.timeIn).trim() !== '' && String(day.timeIn) !== '-')
                    const hasOutLog = Boolean(day.timeOut && String(day.timeOut).trim() !== '' && String(day.timeOut) !== '-')
                    const displayLabel = formatDtrStatusLabel(status, hasInLog, hasOutLog)
                    if (!displayLabel) {
                      return <span className="text-gray-400 dark:text-gray-500">-</span>
                    }

                    if (displayLabel === 'Rest Day (Sunday)') {
                      return <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-xs">{displayLabel}</Badge>
                    }

                    if (displayLabel.startsWith('Absent')) {
                      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-xs">{displayLabel}</Badge>
                    }

                    if (displayLabel.includes('Missed Log')) {
                      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs">{displayLabel}</Badge>
                    }

                    if (displayLabel.includes('Admin Time')) {
                      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-xs">{displayLabel}</Badge>
                    }

                    if (displayLabel === 'On-Time') {
                      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs">{displayLabel}</Badge>
                    }

                    if (displayLabel.includes('Late') && displayLabel.includes('Undertime')) {
                      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs">{displayLabel}</Badge>
                    }

                    if (displayLabel.includes('Late') && displayLabel.includes('On-Time')) {
                      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs">{displayLabel}</Badge>
                    }

                    if (displayLabel === 'Late') {
                      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs">{displayLabel}</Badge>
                    }

                    if (displayLabel.includes('On-Time') && displayLabel.includes('Undertime')) {
                      return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 text-xs">{displayLabel}</Badge>
                    }

                    if (displayLabel === 'Undertime') {
                      return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 text-xs">{displayLabel}</Badge>
                    }

                    return <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-xs">{displayLabel}</Badge>
                  }

                  return (
                    <Card key={d.date} className={`border-2 ${idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/50'}`}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-semibold text-sm dark:text-gray-100">{formatDetailDayLabel(d.date)}</p>
                          </div>
                          <div>{getStatusBadge(d)}</div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Time In</p>
                            {d.timeIn ? (
                              <span className="inline-flex items-center gap-1 text-xs font-mono bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                                <Clock className="h-3 w-3" />
                                {toHHMM(d.timeIn, 'IN')}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Time Out</p>
                            {d.timeOut ? (
                              <span className="inline-flex items-center gap-1 text-xs font-mono bg-purple-50 dark:bg-purple-900/20 px-2 py-1 rounded">
                                <Clock className="h-3 w-3" />
                                {toHHMM(d.timeOut, 'OUT')}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </div>
                        </div>
                        {String(d.status || '').toLowerCase().includes('admin') && (
                          <div className="pt-2 border-t">
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Admin Time Explanation</p>
                            <p className="text-xs text-gray-700 dark:text-gray-300">
                              {d.adminExplanation || 'No interval explanation available.'}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          </div>
        </MobileDrawerContent>
      </MobileDrawer>

      {/* DTR Preview Modal - Mobile Responsive */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-7xl max-w-[98vw] h-[95vh] sm:h-[90vh] p-0 flex flex-col overflow-hidden">
          {/* Fixed Header - Mobile Responsive */}
          <div className="shrink-0 border-b bg-white dark:bg-gray-900 p-4 sm:p-6">
            <DialogHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                <div className="flex-1">
                  <DialogTitle className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">
                    Faculty Daily Time Record
                  </DialogTitle>
                  <DialogDescription className="text-xs sm:text-sm lg:text-base mt-1">
                    {detailEmployee?.full_name || 'Employee'} • <ScrollingText text={detailEmployee?.department || '—'} className="inline" /> • {humanRange(dateRange.from, dateRange.to)}
                  </DialogDescription>
                </div>
                <Button
                  className="btn-sti-primary w-full sm:w-auto h-11 sm:h-12 text-sm sm:text-base touch-manipulation"
                  disabled={!hasCompleteLogs()}
                  title={!hasCompleteLogs() ? "No attendance data available for download" : "Export to Excel"}
                  onClick={async () => {
                  try {
                    if (!detailEmployee?.employee_id) {
                      toast({
                        title: 'Error',
                        description: 'Employee information not available',
                        variant: 'destructive'
                      })
                      return
                    }

                    // Check if there's attendance data before downloading
                    if (!hasCompleteLogs()) {
                      toast({
                        title: 'No Data Available',
                        description: 'Cannot download DTR. There is no attendance data for the selected date range.',
                        variant: 'destructive'
                      })
                      return
                    }

                    toast({ title: 'Generating Excel file...', description: 'Please wait' })
                    
                    const response = await fetch(
                      `/api/reports/export-dtr?employee_id=${detailEmployee.employee_id}&start=${toISO(dateRange.from)}&end=${toISO(dateRange.to)}`
                    )

                    if (!response.ok) {
                      let errorMessage = 'Failed to generate DTR'
                      try {
                        const errorData = await response.json()
                        errorMessage = errorData.error || errorMessage
                      } catch {
                        errorMessage = `HTTP ${response.status}: ${response.statusText}`
                      }
                      throw new Error(errorMessage)
                    }

                    const blob = await response.blob()
                    const url = window.URL.createObjectURL(blob)
                    const link = document.createElement('a')
                    link.href = url
                    link.download = `DTR_${detailEmployee.full_name}_${toISO(dateRange.from)}_to_${toISO(dateRange.to)}.xlsx`
                    document.body.appendChild(link)
                    link.click()
                    document.body.removeChild(link)
                    window.URL.revokeObjectURL(url)

                      toast({ 
                        title: 'DTR exported successfully', 
                        description: 'Excel file has been downloaded with STI branding.',
                        duration: 3000
                      })
                    } catch (error) {
                      console.error('Error exporting DTR:', error)
                      toast({
                        title: 'Export failed',
                        description: 'Could not generate DTR file',
                        variant: 'destructive'
                      })
                    }
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export to Excel
                </Button>
              </div>
            </DialogHeader>
            
            {/* Employee Info - Mobile Responsive */}
            <div className="mt-3 sm:mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 p-3 sm:p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Name</p>
                <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white mt-1">{detailEmployee?.full_name || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Department</p>
                <div className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white mt-1">
                  <ScrollingText text={detailEmployee?.department || '-'} className="text-xs sm:text-sm" />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Cut-off Period</p>
                <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white mt-1 wrap-break-word">{toISO(dateRange.from)} to {toISO(dateRange.to)}</p>
              </div>
            </div>
          </div>

          {/* Scrollable Table Area - Mobile Responsive */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-[10px] sm:text-xs border-collapse min-w-[600px]">
                <thead>
                  <tr>
                    <th className="border p-1.5 sm:p-2 text-left w-24 sm:w-28 text-xs">Date</th>
                    <th className="border p-1.5 sm:p-2 text-left w-24 sm:w-32 text-xs">Time In</th>
                    <th className="border p-1.5 sm:p-2 text-left w-24 sm:w-32 text-xs">Time Out</th>
                    <th className="border p-1.5 sm:p-2 text-left text-xs">Signature</th>
                    <th className="border p-1.5 sm:p-2 text-left w-32 sm:w-40 text-xs">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rows: Array<{d: Date, s?: { timeIn: string|null; timeOut: string|null; status: string|null } | undefined, isSunday?: boolean}> = []
                    const cur = new Date(dateRange.from)
                    const end = new Date(dateRange.to)
                    cur.setHours(0,0,0,0); end.setHours(0,0,0,0)
                    const map = new Map<string, { timeIn: string|null; timeOut: string|null; status: string|null }>()
                    detailDays.forEach(x => map.set(x.date, { timeIn: x.timeIn, timeOut: x.timeOut, status: x.status }))
                    while (cur <= end) {
                      const dayOfWeek = cur.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
                      const key = toISO(cur)
                      // Include all days, but mark Sundays
                      rows.push({ d: new Date(cur), s: map.get(key), isSunday: dayOfWeek === 0 })
                      cur.setDate(cur.getDate() + 1)
                    }
                    return rows.map((r) => {
                      const s = r.s
                      const isSunday = r.isSunday
                      const dateStr = formatInTimeZone(r.d, PH_TZ, 'yyyy-MM-dd')
                      const toHHMM = (t?: string|null, logType?: 'IN'|'OUT') => {
                        if (!t) return ''
                        void logType
                        return formatDetailTimePH(t)
                      }
                      // For Sundays, leave everything blank
                      if (isSunday) {
                        return (
                          <tr key={dateStr}>
                            <td className="border p-1.5 sm:p-2 text-xs">{dateStr}</td>
                            <td className="border p-1.5 sm:p-2"></td>
                            <td className="border p-1.5 sm:p-2"></td>
                            <td className="border p-1.5 sm:p-2"></td>
                            <td className="border p-1.5 sm:p-2"></td>
                          </tr>
                        )
                      }
                      
                      // For Monday-Saturday, show normal data
                      const remarks = normalizeReportStatusLabel(s?.status)
                      return (
                        <tr key={dateStr}>
                          <td className="border p-1.5 sm:p-2 text-xs">{dateStr}</td>
                          <td className="border p-1.5 sm:p-2 text-xs">{toHHMM(s?.timeIn, 'IN')}</td>
                          <td className="border p-1.5 sm:p-2 text-xs">{toHHMM(s?.timeOut, 'OUT')}</td>
                          <td className="border p-1.5 sm:p-2"></td>
                          <td className="border p-1.5 sm:p-2 text-xs">{remarks}</td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </TabsContent>

      {/* DTR SUMMARY TAB CONTENT - Faculty DTR Generator */}
      <TabsContent value="dtr-summary" className="space-y-4">
        <Card className="relative overflow-hidden border-blue-200/70 dark:border-slate-800/60 bg-linear-to-br from-white via-blue-50/70 to-indigo-100/50 dark:from-slate-950 dark:via-slate-950 dark:to-blue-950/70 shadow-xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.14),transparent_45%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_45%)]"></div>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.10),transparent_40%)] dark:bg-[radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.16),transparent_40%)]"></div>

          <CardHeader className="relative px-4 sm:px-6 pt-5 sm:pt-6 pb-3 sm:pb-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base sm:text-xl text-gray-900 dark:text-white">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-blue-500 shadow-lg">
                    <FileText className="h-5 w-5 text-white" />
                  </span>
                  Daily Time Record Command Center
                </CardTitle>
                <CardDescription className="mt-2 text-gray-600 dark:text-slate-300 text-xs sm:text-sm">
                  Build faculty DTR outputs with cutoff-aware ranges, auto-synced term data, and bulk print controls.
                </CardDescription>
              </div>
              <Badge className="w-fit bg-indigo-100 text-indigo-700 border border-indigo-300 dark:bg-indigo-500/20 dark:text-indigo-200 dark:border-indigo-400/30">
                Production Ready
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="relative px-3 sm:px-4 md:px-6 pb-4 sm:pb-5 md:pb-6">
            <div className="grid gap-4 lg:gap-5">
              <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                <div className="xl:col-span-3 rounded-xl border border-slate-300/80 dark:border-slate-700/70 bg-white/85 dark:bg-slate-900/50 p-4 sm:p-5">
                  <Label className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                    <CalendarIcon className="h-4 w-4 inline mr-2" />
                    Step 1: Pick Cutoff Period
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <Button
                      variant={selectedCutoffPeriod === '26-10' && !facultyDTRCustomDate ? 'default' : 'outline'}
                      className={cn(
                        "h-[88px] flex flex-col items-start justify-center p-4 rounded-xl border transition-all",
                        selectedCutoffPeriod === '26-10' && !facultyDTRCustomDate
                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-400/60 shadow-md'
                            : 'bg-white text-gray-800 border-slate-300 hover:bg-slate-100 dark:bg-slate-950/60 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-900'
                      )}
                      onClick={() => {
                        setSelectedCutoffPeriod('26-10')
                        setFacultyDTRCustomDate(undefined)
                        const cutoffRange = computeCutoffRange('26-10', new Date())
                        setMainReportDateRange({ from: cutoffRange.start, to: cutoffRange.end })
                      }}
                    >
                      <span className="font-bold text-base">26th to 10th</span>
                      <span className={cn(
                        "text-xs mt-1",
                        selectedCutoffPeriod === '26-10' && !facultyDTRCustomDate ? 'text-indigo-100' : 'text-gray-500 dark:text-slate-400'
                      )}>
                        Previous month 26 - Current month 10
                      </span>
                    </Button>

                    <Button
                      variant={selectedCutoffPeriod === '11-25' && !facultyDTRCustomDate ? 'default' : 'outline'}
                      className={cn(
                        "h-[88px] flex flex-col items-start justify-center p-4 rounded-xl border transition-all",
                        selectedCutoffPeriod === '11-25' && !facultyDTRCustomDate
                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-400/60 shadow-md'
                            : 'bg-white text-gray-800 border-slate-300 hover:bg-slate-100 dark:bg-slate-950/60 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-900'
                      )}
                      onClick={() => {
                        setSelectedCutoffPeriod('11-25')
                        setFacultyDTRCustomDate(undefined)
                        const cutoffRange = computeCutoffRange('11-25', new Date())
                        setMainReportDateRange({ from: cutoffRange.start, to: cutoffRange.end })
                      }}
                    >
                      <span className="font-bold text-base">11th to 25th</span>
                      <span className={cn(
                        "text-xs mt-1",
                        selectedCutoffPeriod === '11-25' && !facultyDTRCustomDate ? 'text-indigo-100' : 'text-gray-500 dark:text-slate-400'
                      )}>
                        Same month 11 - 25
                      </span>
                    </Button>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-300 dark:border-slate-700/70">
                    <Label className="text-xs font-medium text-gray-600 dark:text-slate-400 mb-2 block">
                      Choose a date within the selected cutoff window for precise period mapping
                    </Label>
                    <p className="mb-2 text-[11px] text-gray-500 dark:text-slate-500">
                      Allowed dates: {selectedCutoffPeriod === '26-10' ? '26-31 and 1-10' : '11-25'}
                    </p>
                    <Popover open={facultyDTRDatePopoverOpen} onOpenChange={setFacultyDTRDatePopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal h-11 bg-white border-slate-300 text-gray-800 hover:bg-slate-100 dark:bg-slate-950/60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900",
                            !facultyDTRCustomDate && "text-gray-500 dark:text-slate-400"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {facultyDTRCustomDate ? format(facultyDTRCustomDate, "PPP") : <span>Pick a date...</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-[1300]" align="start">
                        <Calendar
                          mode="single"
                          selected={facultyDTRCustomDate}
                          onSelect={(date) => {
                            if (date) {
                              if (!isDateAllowedForCutoff(date, selectedCutoffPeriod)) {
                                toast({
                                  title: 'Invalid date for selected cutoff',
                                  description: selectedCutoffPeriod === '26-10'
                                    ? 'Please select a date from the 26th to 31st, or from 1st to 10th.'
                                    : 'Please select a date from the 11th to 25th.',
                                  variant: 'destructive'
                                })
                                return
                              }

                              setFacultyDTRCustomDate(date)
                              const cutoffRange = calculateRangeFromDate(date, selectedCutoffPeriod)
                              setMainReportDateRange(cutoffRange)
                              setFacultyDTRDatePopoverOpen(false)
                            }
                          }}
                          disabled={(date) => {
                            return !isDateAllowedForCutoff(date, selectedCutoffPeriod)
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="xl:col-span-2 rounded-xl border border-blue-300/70 dark:border-blue-500/30 bg-blue-100/70 dark:bg-blue-950/30 p-4 sm:p-5 flex flex-col justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-blue-700 dark:text-blue-300">Current Computed Range</p>
                    <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                      {format(mainReportDateRange.from, 'MMMM dd')} to {format(mainReportDateRange.to, 'MMMM dd, yyyy')}
                    </p>
                    <p className="mt-2 text-xs text-blue-700/90 dark:text-blue-200/80">
                      {facultyDTRCustomDate ? 'Custom-date snapped cutoff' : 'Default cutoff period'}
                    </p>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-white/80 dark:bg-slate-900/70 border border-slate-300 dark:border-slate-700 p-2">
                      <p className="text-[11px] text-gray-600 dark:text-slate-400">Cutoff</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{selectedCutoffPeriod === '26-10' ? '26-10' : '11-25'}</p>
                    </div>
                    <div className="rounded-lg bg-white/80 dark:bg-slate-900/70 border border-slate-300 dark:border-slate-700 p-2">
                      <p className="text-[11px] text-gray-600 dark:text-slate-400">Mode</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{facultyDTRCustomDate ? 'Custom' : 'Standard'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-300/80 dark:border-slate-700/70 bg-white/85 dark:bg-slate-900/45 p-4 sm:p-5 space-y-4">
                <Label htmlFor="dtr-employee" className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                  Step 2: Select Faculty Member
                </Label>
                <Select value={facultyDTREmployee} onValueChange={setFacultyDTREmployee}>
                  <SelectTrigger id="dtr-employee" className="w-full h-12 bg-white border-slate-300 text-gray-900 dark:bg-slate-950/60 dark:border-slate-700 dark:text-slate-100">
                    <SelectValue placeholder="Choose a faculty member" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Select a faculty member</SelectItem>
                    {employees
                      .filter(isVisibleToCurrentUser)
                      .map((employee) => (
                        <SelectItem key={employee.employee_id} value={employee.employee_id.toString()}>
                          {employee.full_name} - {employee.department || 'No Department'}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="school-year" className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                      School Year <span className="text-xs text-gray-500 dark:text-slate-400">(from current term)</span>
                    </Label>
                    <Input
                      id="school-year"
                      type="text"
                      placeholder="Auto-filled from active academic term"
                      value={facultyDTRSchoolYear}
                      readOnly
                      className="h-12 mt-2 bg-slate-100 border-slate-300 text-gray-700 cursor-not-allowed dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
                    />
                  </div>

                  <div>
                    <Label htmlFor="semester" className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                      Semester <span className="text-xs text-gray-500 dark:text-slate-400">(from current term)</span>
                    </Label>
                    <Input
                      id="semester"
                      type="text"
                      value={facultyDTRSemester}
                      readOnly
                      className="h-12 mt-2 bg-slate-100 border-slate-300 text-gray-700 cursor-not-allowed dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-300/80 dark:border-slate-700/70 bg-white/85 dark:bg-slate-900/45 p-4 sm:p-5">
                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">Step 3: Generate Output</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Button
                    onClick={handleGenerateFacultyDTR}
                    disabled={generatingDTR || facultyDTREmployee === 'all' || !facultyDTRSchoolYear || bulkExportMode}
                    className={cn(
                      "h-14 text-base font-semibold rounded-xl",
                      bulkExportMode ? "opacity-50 cursor-not-allowed" : "btn-sti-primary"
                    )}
                  >
                    {generatingDTR ? (
                      <>
                        <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                        Generating DTR...
                      </>
                    ) : (
                      <>
                        <FileText className="h-5 w-5 mr-2" />
                        Generate Single DTR
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={() => setBulkExportMode(!bulkExportMode)}
                    variant={bulkExportMode ? 'default' : 'outline'}
                    className={cn(
                      "h-14 text-base font-semibold rounded-xl",
                      bulkExportMode ? "bg-indigo-600 hover:bg-indigo-700" : "border-slate-300 bg-white text-gray-900 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100 dark:hover:bg-slate-900"
                    )}
                  >
                    <Printer className="h-5 w-5 mr-2" />
                    {bulkExportMode ? 'Cancel Bulk Print' : 'Bulk Print DTRs'}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Bulk Print Employee List */}
        {bulkExportMode && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedEmployeeIds.length === employees.filter(isVisibleToCurrentUser).length}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        selectAllEmployees()
                      } else {
                        clearAllSelections()
                      }
                    }}
                  />
                  Select Employees for Bulk Print
                </span>
                <Badge variant="secondary" className="text-sm">
                  {selectedEmployeeIds.length} selected
                </Badge>
              </CardTitle>
              <CardDescription>
                Select multiple faculty members to print their DTRs in a single batch (2 per page, landscape format)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {employees
                  .filter(isVisibleToCurrentUser)
                  .map((employee) => (
                    <div
                      key={employee.employee_id}
                      className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <Checkbox
                        checked={selectedEmployeeIds.includes(employee.employee_id)}
                        onCheckedChange={() => toggleEmployeeSelection(employee.employee_id)}
                      />
                      <div className="flex-1">
                        <p className="font-medium">{employee.full_name}</p>
                        <p className="text-sm text-gray-500">{employee.department || 'No Department'}</p>
                      </div>
                    </div>
                  ))}
              </div>
              
              <div className="mt-6 flex gap-3">
                <Button
                  onClick={handleBulkExport}
                  disabled={selectedEmployeeIds.length === 0 || isBulkExporting}
                  className="btn-sti-primary flex-1 h-12"
                >
                  {isBulkExporting ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Preparing Print...
                    </>
                  ) : (
                    <>
                      <Printer className="h-4 w-4 mr-2" />
                      Print {selectedEmployeeIds.length} DTR{selectedEmployeeIds.length !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
                
                <Button
                  onClick={() => {
                    setBulkExportMode(false)
                    setSelectedEmployeeIds([])
                  }}
                  variant="outline"
                  className="h-12"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Faculty DTR Preview Dialog - Matches Schedule Overview Modal Size */}
        {showFacultyDTRPreview && facultyDTRPreview && (
          <Dialog open={showFacultyDTRPreview} onOpenChange={setShowFacultyDTRPreview}>
            <DialogContent className="sm:max-w-[900px] max-h-[90vh] p-0 overflow-hidden [&>button]:hidden">
              {/* Header - matches Schedule Overview styling */}
              <div className="bg-linear-to-r from-blue-100 via-indigo-100 to-purple-100 text-gray-900 dark:from-blue-600 dark:via-indigo-600 dark:to-purple-600 dark:text-white px-6 py-4 flex items-center justify-between shrink-0 border-b border-blue-200/70 dark:border-transparent">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-white/80 border border-blue-200 dark:bg-white/20 dark:border-transparent backdrop-blur-sm">
                    <FileText className="h-6 w-6 text-indigo-700 dark:text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Faculty Daily Time Record</h2>
                    <p className="text-blue-700 dark:text-blue-100 text-xs">
                      {facultyDTRPreview.facultyName} • {facultyDTRPreview.department} • {facultyDTRPreview.semester}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowFacultyDTRPreview(false)}
                  className="text-gray-700 hover:bg-white/80 dark:text-white dark:hover:bg-white/20 rounded-full h-9 w-9"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              
              {/* Content - Scrollable Area with HTML Preview */}
              <ScrollArea className="max-h-[calc(90vh-140px)]">
                <div className="p-6">
                  <div 
                    className="dtr-preview-container"
                    dangerouslySetInnerHTML={{
                      __html: (() => {
                        // Get current user from localStorage with debugging
                        const userStr = typeof window !== 'undefined' ? localStorage.getItem('rams_user') : null
                        console.log('[DTR Preview] localStorage rams_user:', userStr)
                        const user = userStr ? JSON.parse(userStr) : null
                        console.log('[DTR Preview] Parsed user:', user)
                        console.log('[DTR Preview] currentUser state:', currentUser)
                        // FIXED: localStorage uses "name" property, not "full_name"
                        const generatedBy = user?.name || user?.full_name || currentUser?.full_name || currentUser?.name || 'System Administrator'
                        console.log('[DTR Preview] Final generatedBy:', generatedBy)
                        
                        const dtrData = {
                          employee: {
                            full_name: facultyDTRPreview.facultyName,
                            department: facultyDTRPreview.department,
                            employment_status: facultyDTRPreview.employmentStatus || ''
                          },
                          // Include processedDailyRecords (bulk-format) so the renderer
                          // can show Absent-only days (these have no IN/OUT entries).
                          processedDailyRecords: facultyDTRPreview.processedDailyRecords || [],
                          logs: facultyDTRPreview.attendanceLogs.flatMap(log => {
                            const entries = []
                            // Create separate IN and OUT entries if they exist
                            if (log.time_in) {
                              entries.push({
                                date: log.date,
                                log_type: 'IN',
                                log_time: log.time_in,
                                late_minutes: log.late_minutes || 0,
                                undertime_minutes: 0,
                                is_late: log.is_late || false,
                                attendance_status: log.attendance_status
                              })
                            }
                            if (log.time_out) {
                              entries.push({
                                date: log.date,
                                log_type: 'OUT',
                                log_time: log.time_out,
                                late_minutes: 0,
                                undertime_minutes: log.undertime_minutes || 0,
                                is_early_out: log.is_early_out || false,
                                attendance_status: log.attendance_status
                              })
                            }
                            return entries
                          })
                        }
                        
                        const schoolYear = facultyDTRPreview.schoolYear || facultyDTRSchoolYear || '2023-2024'
                        
                        const leftDTR = generateSingleDTRHTML(
                          dtrData,
                          facultyDTRPreview.cutoffStart,
                          facultyDTRPreview.cutoffEnd,
                          generatedBy,
                          schoolYear
                        )
                        
                        // Right side is intentionally blank
                        return `
                          <div style="display: flex; gap: 0.5cm; width: 100%;">
                            <div class="dtr-preview-page" style="flex: 1; border: 2px solid currentColor; padding: 8px; background: white;">
                              ${leftDTR}
                            </div>
                            <div class="dtr-preview-page" style="flex: 1; border: 2px solid currentColor; padding: 8px; background: white;">
                              <!-- Intentionally blank for manual use -->
                            </div>
                          </div>
                        `
                      })()
                    }}
                  />
                </div>
              </ScrollArea>

              {/* Footer Actions */}
              <div className="p-4 border-t bg-gray-50 dark:bg-neutral-900 flex justify-end gap-3 shrink-0">
                <Button
                  variant="outline"
                  onClick={() => setShowFacultyDTRPreview(false)}
                >
                  Close
                </Button>
                <Button
                  className="btn-sti-primary"
                  onClick={() => {
                    const printWindow = window.open('', '_blank')
                    if (printWindow) {
                      // Get current user from localStorage with debugging
                      const userStr = typeof window !== 'undefined' ? localStorage.getItem('rams_user') : null
                      console.log('[DTR Print] localStorage rams_user:', userStr)
                      const user = userStr ? JSON.parse(userStr) : null
                      console.log('[DTR Print] Parsed user:', user)
                      console.log('[DTR Print] currentUser state:', currentUser)
                      // FIXED: localStorage uses "name" property, not "full_name"
                      const generatedBy = user?.name || user?.full_name || currentUser?.full_name || currentUser?.name || 'System Administrator'
                      console.log('[DTR Print] Final generatedBy:', generatedBy)
                      
                      const dtrData = {
                        employee: {
                          full_name: facultyDTRPreview.facultyName,
                          department: facultyDTRPreview.department,
                          employment_status: facultyDTRPreview.employmentStatus || ''
                        },
                        // Make print use processedDailyRecords so absent-only days are preserved
                        processedDailyRecords: facultyDTRPreview.processedDailyRecords || [],
                        logs: facultyDTRPreview.attendanceLogs.flatMap(log => {
                          const entries = []
                          // Create separate IN and OUT entries if they exist
                          if (log.time_in) {
                            entries.push({
                              date: log.date,
                              log_type: 'IN',
                              log_time: log.time_in,
                              late_minutes: log.late_minutes || 0,
                              undertime_minutes: 0,
                              is_late: log.is_late || false,
                              attendance_status: log.attendance_status
                            })
                          }
                          if (log.time_out) {
                            entries.push({
                              date: log.date,
                              log_type: 'OUT',
                              log_time: log.time_out,
                              late_minutes: 0,
                              undertime_minutes: log.undertime_minutes || 0,
                              is_early_out: log.is_early_out || false,
                              attendance_status: log.attendance_status
                            })
                          }
                          return entries
                        })
                      }
                      
                      const schoolYear = facultyDTRPreview.schoolYear || facultyDTRSchoolYear || '2023-2024'
                      
                      const leftDTR = generateSingleDTRHTML(
                        dtrData,
                        facultyDTRPreview.cutoffStart,
                        facultyDTRPreview.cutoffEnd,
                        generatedBy,
                        schoolYear
                      )
                      
                      printWindow.document.write(`
                        <!DOCTYPE html>
                        <html>
                        <head>
                          <meta charset="UTF-8">
                          <title>Faculty Daily Time Record</title>
                          <style>
                            @page {
                              size: landscape;
                              margin: 0.5cm;
                            }
                            
                            * {
                              margin: 0;
                              padding: 0;
                              box-sizing: border-box;
                            }
                            
                            body {
                              font-family: Arial, sans-serif;
                              font-size: 9px;
                              line-height: 1.2;
                            }
                            
                            @media print {
                              body { margin: 0; }
                            }
                            
                            .page {
                              display: flex;
                              justify-content: space-between;
                              gap: 0.5cm;
                              width: 100%;
                              height: 100vh;
                              padding: 0.2cm;
                            }
                            
                            .dtr-container {
                              flex: 1;
                              border: 2px solid #000;
                              padding: 8px;
                              background: white;
                            }
                          </style>
                        </head>
                        <body>
                          <div class="page">
                            <div class="dtr-container">
                              ${leftDTR}
                            </div>
                            <div class="dtr-container">
                              <!-- Intentionally blank for manual use -->
                            </div>
                          </div>
                        </body>
                        </html>
                      `)
                      printWindow.document.close()
                      printWindow.focus()
                      setTimeout(() => {
                        printWindow.print()
                        printWindow.close()
                      }, 250)
                    }
                  }}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print DTR
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </TabsContent>

      {/* Faculty Timesheet Tab - Faculty Performance Report */}
      <TabsContent value="faculty-timesheet" className="space-y-4">
        <Card className="group relative overflow-hidden border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all duration-300">
          <div className="absolute inset-0 bg-linear-to-br from-purple-500/0 via-transparent to-pink-500/0 group-hover:from-purple-500/5 group-hover:to-pink-500/5 transition-all duration-500 pointer-events-none"></div>
          
          <CardHeader className="relative px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg text-gray-900 dark:text-white">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-linear-to-br from-purple-500 to-pink-500 shadow-lg">
                    <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                  </div>
                  Faculty Timesheet Report
                </CardTitle>
                <CardDescription className="mt-1 text-xs sm:text-sm">Teaching staff timesheet and attendance records</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="px-3 sm:px-4 md:px-6 pb-3 sm:pb-4 md:pb-6">
            {/* Cutoff Period Date Picker and Print Button */}
            <div className="mb-6 p-6 bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-lg">
              <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-end">
                {/* Cutoff Period Selector */}
                <div className="flex-1 w-full">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    Select Cutoff Period
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant={selectedCutoffPeriod === '26-10' ? 'default' : 'outline'}
                      className={cn(
                        "h-20 flex flex-col items-start justify-center p-4 transition-all",
                        selectedCutoffPeriod === '26-10' 
                          ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md' 
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      )}
                      onClick={() => {
                        setSelectedCutoffPeriod('26-10')
                        setIsCustomDateRange(false)
                        const cutoffRange = computeCutoffRange('26-10', new Date())
                        setMainReportDateRange({ from: cutoffRange.start, to: cutoffRange.end })
                      }}
                    >
                      <span className="font-bold text-base">26th to 10th</span>
                      <span className={cn(
                        "text-xs mt-1",
                        selectedCutoffPeriod === '26-10' ? 'text-purple-100' : 'text-gray-500 dark:text-gray-400'
                      )}>
                        Previous month 26 - Current month 10
                      </span>
                    </Button>
                    
                    <Button
                      variant={selectedCutoffPeriod === '11-25' ? 'default' : 'outline'}
                      className={cn(
                        "h-20 flex flex-col items-start justify-center p-4 transition-all",
                        selectedCutoffPeriod === '11-25' 
                          ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md' 
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      )}
                      onClick={() => {
                        setSelectedCutoffPeriod('11-25')
                        setIsCustomDateRange(false)
                        const cutoffRange = computeCutoffRange('11-25', new Date())
                        setMainReportDateRange({ from: cutoffRange.start, to: cutoffRange.end })
                      }}
                    >
                      <span className="font-bold text-base">11th to 25th</span>
                      <span className={cn(
                        "text-xs mt-1",
                        selectedCutoffPeriod === '11-25' ? 'text-purple-100' : 'text-gray-500 dark:text-gray-400'
                      )}>
                        Same month 11-25
                      </span>
                    </Button>
                  </div>
                  
                  {/* Custom Date Range Picker */}
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Or pick a custom date range:
                      </label>
                      <Switch 
                        checked={isCustomDateRange} 
                        onCheckedChange={(checked) => {
                          setIsCustomDateRange(checked)
                          if (!checked) {
                            const cutoffRange = computeCutoffRange(selectedCutoffPeriod, new Date())
                            setMainReportDateRange({ from: cutoffRange.start, to: cutoffRange.end })
                          }
                        }}
                      />
                    </div>
                    
                    {isCustomDateRange && (
                      <Popover open={customDatePopoverOpen} onOpenChange={setCustomDatePopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal h-12",
                              !mainReportDateRange && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {mainReportDateRange?.from ? (
                              mainReportDateRange.to ? (
                                <>
                                  {format(mainReportDateRange.from, "MMM dd, yyyy")} -{" "}
                                  {format(mainReportDateRange.to, "MMM dd, yyyy")}
                                </>
                              ) : (
                                format(mainReportDateRange.from, "MMM dd, yyyy")
                              )
                            ) : (
                              <span>Pick a date range</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 z-[1300]" align="start">
                          <div className="p-4 space-y-4">
                            <div className="space-y-2">
                              <h4 className="font-medium text-sm">Select Date Range</h4>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                Click any date - it will automatically select the nearest cutoff period (26-10 or 11-25)
                              </p>
                            </div>
                            <Calendar
                              initialFocus
                              mode="single"
                              selected={mainReportDateRange?.from}
                              onSelect={(date: Date | undefined) => {
                                if (date) {
                                  const cutoff = getNearestCutoffPeriod(date)
                                  setMainReportDateRange({ from: cutoff.start, to: cutoff.end })
                                  setSelectedCutoffPeriod(cutoff.period)
                                  setCustomDatePopoverOpen(false)
                                }
                              }}
                              numberOfMonths={2}
                            />
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                  
                  <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
                    <p className="text-sm text-purple-900 dark:text-purple-100 font-medium">
                      📅 {isCustomDateRange ? 'Custom Range' : 'Current Period'}: {format(mainReportDateRange.from, 'MMM dd, yyyy')} - {format(mainReportDateRange.to, 'MMM dd, yyyy')}
                    </p>
                  </div>
                </div>
                
                {/* Print Button */}
                <div className="w-full lg:w-auto">
                  <Button
                    size="lg"
                    className="bg-purple-600 hover:bg-purple-700 text-white h-14 px-8 w-full lg:w-auto text-base font-semibold shadow-lg hover:shadow-xl transition-all"
                    onClick={() => {
                      if (selectedEmployeeIds.length > 0) {
                        handleBulkExport()
                      } else {
                        showErrorDialog(
                          'No Selection',
                          'Please select faculty members using "Bulk Print Timesheet" or click individual faculty to preview'
                        )
                      }
                    }}
                  >
                    <Printer className="h-5 w-5 mr-2" />
                    Print Selected Timesheets
                  </Button>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-3 sm:gap-4 mb-4 sm:mb-6">
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                    <SelectTrigger className="w-full h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All Employees">
                        {getRoleText() === 'Non-Teaching Staff' ? 'All Non-Teaching Staff' : getRoleText() === 'Teaching Staff' ? 'All Teaching Staff' : 'All Employees'}
                      </SelectItem>
                      {employees.filter(isVisibleToCurrentUser).map((employee) => (
                        <SelectItem key={employee.employee_id} value={employee.full_name}>
                          {employee.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant={bulkExportMode ? "default" : "outline"}
                  onClick={() => {
                    setBulkExportMode(!bulkExportMode)
                    if (bulkExportMode) {
                      setSelectedEmployeeIds([])
                    }
                  }}
                  className="h-11 bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {bulkExportMode ? 'Cancel Bulk Print' : 'Bulk Print Timesheet'}
                </Button>
              </div>

              {bulkExportMode && (
                <div className="bg-purple-50 dark:bg-purple-950/20 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                      {selectedEmployeeIds.length} faculty member(s) selected
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={selectAllEmployees}
                        disabled={selectedEmployeeIds.length === attendanceStats.filter(stat => 
                          (selectedEmployee === "All Employees" || selectedEmployee === "All Teaching Staff" || stat.full_name === selectedEmployee) &&
                          employees.find(emp => emp.employee_id === stat.employee_id)?.staff_type === 'Teaching'
                        ).length}
                      >
                        Select All
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={clearAllSelections}
                        disabled={selectedEmployeeIds.length === 0}
                      >
                        Clear All
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleBulkExport}
                        disabled={selectedEmployeeIds.length === 0 || isBulkExporting}
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                      >
                        {isBulkExporting ? 'Printing...' : `Print ${selectedEmployeeIds.length} Timesheet(s)`}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-purple-700 dark:text-purple-300">
                    Check the boxes next to faculty below to select them for bulk timesheet printing. Period: {humanRange(mainReportDateRange.from, mainReportDateRange.to)}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Switch checked={hideNotStarted} onCheckedChange={setHideNotStarted} />
                <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">Hide faculty with no work started</span>
              </div>
            </div>
            
            {/* Desktop Table - Teaching Staff Only */}
            <div className="hidden lg:block overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <Table>
                <TableHeader>
                  <TableRow className="bg-linear-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-b-2">
                    {bulkExportMode && (
                      <TableHead className="text-center font-bold w-12">
                        <Checkbox
                          checked={selectedEmployeeIds.length === attendanceStats.filter(stat => 
                            (selectedEmployee === "All Employees" || selectedEmployee === "All Teaching Staff" || stat.full_name === selectedEmployee) &&
                            employees.find(emp => emp.employee_id === stat.employee_id)?.staff_type === 'Teaching'
                          ).length && selectedEmployeeIds.length > 0}
                          onCheckedChange={(checked) => {
                            if (checked) selectAllEmployees()
                            else clearAllSelections()
                          }}
                        />
                      </TableHead>
                    )}
                    <TableHead className="text-center font-bold">Faculty Member</TableHead>
                    <TableHead className="text-center font-bold">Department</TableHead>
                    <TableHead className="text-center font-bold">Total Days</TableHead>
                    <TableHead className="text-center font-bold">Present</TableHead>
                    <TableHead className="text-center font-bold">Late</TableHead>
                    <TableHead className="text-center font-bold">Undertime</TableHead>
                    <TableHead className="text-center font-bold">Absent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendanceStats.filter(stat => {
                    const emp = employees.find(e => e.employee_id === stat.employee_id)
                    return emp?.staff_type === 'Teaching' && 
                           (selectedEmployee === "All Employees" || selectedEmployee === "All Teaching Staff" || stat.full_name === selectedEmployee)
                  }).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={bulkExportMode ? 8 : 7} className="text-center py-12">
                        <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-500">No teaching staff data available</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    attendanceStats
                      .filter((stat) => {
                        const emp = employees.find(e => e.employee_id === stat.employee_id)
                        return emp?.staff_type === 'Teaching' && 
                               (selectedEmployee === "All Employees" || selectedEmployee === "All Teaching Staff" || stat.full_name === selectedEmployee)
                      })
                      .map((stat, index) => (
                      <TableRow 
                        key={stat.employee_id}
                        className={`cursor-pointer hover:bg-purple-50/70 dark:hover:bg-purple-900/20 transition-all h-16 ${
                          index % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/50'
                        }`}
                        onClick={() => {
                          if (!bulkExportMode) {
                            const emp = employees.find((e) => e.employee_id === stat.employee_id)
                            if (emp) openFacultyTimesheetPreview(emp, selectedCutoffPeriod)
                          }
                        }}
                      >
                        {bulkExportMode && (
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedEmployeeIds.includes(stat.employee_id)}
                              onCheckedChange={() => toggleEmployeeSelection(stat.employee_id)}
                            />
                          </TableCell>
                        )}
                        <TableCell className="text-center font-semibold text-base py-4">{stat.full_name}</TableCell>
                        <TableCell className="text-center text-sm">{stat.department}</TableCell>
                        <TableCell className="text-center font-medium text-base">{stat.total_days}</TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-linear-to-r from-green-500 to-emerald-500 text-white">
                            {stat.present_days}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-linear-to-r from-orange-500 to-amber-500 text-white">
                            {stat.late_days}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-linear-to-r from-amber-500 to-yellow-500 text-white">
                            {stat.undertime_days || 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-linear-to-r from-red-500 to-rose-500 text-white">
                            {stat.absent_days}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards - Teaching Staff Only */}
            <div className="lg:hidden space-y-3">
              {attendanceStats.filter(stat => {
                const emp = employees.find(e => e.employee_id === stat.employee_id)
                return emp?.staff_type === 'Teaching' && 
                       (selectedEmployee === "All Employees" || selectedEmployee === "All Teaching Staff" || stat.full_name === selectedEmployee)
              }).length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-500">No teaching staff data available</p>
                </div>
              ) : (
                attendanceStats
                  .filter((stat) => {
                    const emp = employees.find(e => e.employee_id === stat.employee_id)
                    return emp?.staff_type === 'Teaching' && 
                           (selectedEmployee === "All Employees" || selectedEmployee === "All Teaching Staff" || stat.full_name === selectedEmployee)
                  })
                  .map((stat) => (
                  <Card 
                    key={stat.employee_id} 
                    className="cursor-pointer hover:border-purple-400 hover:shadow-lg transition-all dark:bg-gray-900 dark:border-gray-700" 
                    onClick={() => {
                      const emp = employees.find((e) => e.employee_id === stat.employee_id)
                      if (emp) openFacultyTimesheetPreview(emp, selectedCutoffPeriod)
                    }}
                  >
                    <CardContent className="p-5">
                      <p className="font-bold text-lg mb-2 dark:text-gray-100">{stat.full_name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{stat.department}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded border border-blue-100 dark:border-blue-900/40">
                          <p className="text-xs text-blue-700 dark:text-blue-300 mb-1">Total</p>
                          <p className="font-bold text-lg dark:text-blue-100">{stat.total_days}</p>
                        </div>
                        <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded border border-green-100 dark:border-green-900/40">
                          <p className="text-xs text-green-700 dark:text-green-300 mb-1">Present</p>
                          <Badge className="bg-green-500 text-white text-sm">{stat.present_days}</Badge>
                        </div>
                        <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded border border-orange-100 dark:border-orange-900/40">
                          <p className="text-xs text-orange-700 dark:text-orange-300 mb-1">Late</p>
                          <Badge className="bg-orange-500 text-white text-sm">{stat.late_days}</Badge>
                        </div>
                        <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded border border-amber-100 dark:border-amber-900/40">
                          <p className="text-xs text-amber-700 dark:text-amber-300 mb-1">UT</p>
                          <Badge className="bg-amber-500 text-white text-sm">{stat.undertime_days || 0}</Badge>
                        </div>
                        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded col-span-2 border border-red-100 dark:border-red-900/40">
                          <p className="text-xs text-red-700 dark:text-red-300 mb-1">Absent</p>
                          <Badge className="bg-red-500 text-white text-sm">{stat.absent_days}</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      </Tabs>

      {/* DTR Preview Modal */}
      <Dialog open={dtrPreviewOpen} onOpenChange={setDtrPreviewOpen}>
        <DialogContent className="max-w-[95vw] md:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-gray-900 dark:text-gray-100">Daily Time Record Preview</DialogTitle>
            <DialogDescription className="text-gray-600 dark:text-gray-300">
              Preview before printing • {previewEmployeeData?.employee?.full_name}
            </DialogDescription>
          </DialogHeader>

          {previewEmployeeData && (
            <div className="space-y-6">
              {/* Employee Info Card */}
              <Card className="border-2 border-indigo-200 dark:border-indigo-800">
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Employee Name</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{previewEmployeeData.employee.full_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Employee ID</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{previewEmployeeData.employee.unique_employee_id}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Department</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{previewEmployeeData.employee.department}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Cutoff Period</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                        {previewEmployeeData.cutoffPeriod === '26-10' ? '26th-10th' : '11th-25th'}
                      </p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Date Range</p>
                      <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                        {format(new Date(previewEmployeeData.startDate), 'MMM dd, yyyy')} - {format(new Date(previewEmployeeData.endDate), 'MMM dd, yyyy')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Attendance Table Preview */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-x-auto bg-white dark:bg-gray-900">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800">
                      <th className="border p-3 text-left font-bold">Date</th>
                      <th className="border p-3 text-left font-bold">Time In</th>
                      <th className="border p-3 text-left font-bold">Time Out</th>
                      <th className="border p-3 text-left font-bold">Status</th>
                      <th className="border p-3 text-left font-bold">Late (min)</th>
                      <th className="border p-3 text-left font-bold">Undertime (min)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Group logs by date
                      const logsByDate: { [key: string]: any[] } = {}
                      previewEmployeeData.logs.forEach((log: any) => {
                        const date = log.date
                        if (!logsByDate[date]) logsByDate[date] = []
                        logsByDate[date].push(log)
                      })

                      const dates = Object.keys(logsByDate).sort()
                      
                      if (dates.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} className="border p-8 text-center text-gray-500">
                              No attendance logs for this period
                            </td>
                          </tr>
                        )
                      }

                      return dates.map(date => {
                        const dayLogs = logsByDate[date]
                        const inLog = dayLogs.find((l: any) => isTimedInLog(l))
                        const outLog = dayLogs.find((l: any) => isTimedOutLog(l))
                        
                        const timeIn = inLog?.log_time ? formatDetailTimePH(inLog.log_time) : '-'
                        const timeOut = outLog?.log_time ? formatDetailTimePH(outLog.log_time) : '-'
                        const explicitStatusLog = dayLogs.find((l: any) => isAbsentAttendanceLog(l))
                        const status = explicitStatusLog?.attendance_status || inLog?.attendance_status || outLog?.attendance_status || ''
                        const normalizedStatus = normalizeReportStatusLabel(status)
                        const isStatusOnlyAbsent = isAbsentStatus(status) && !inLog && !outLog
                        const lateMin = inLog?.late_minutes || 0
                        const utMin = outLog?.undertime_minutes || 0
                        
                        return (
                          <tr key={date} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="border p-3">{formatDetailDayLabel(date)}</td>
                            <td className="border p-3 font-mono">{timeIn}</td>
                            <td className="border p-3 font-mono">{timeOut}</td>
                            <td className="border p-3">
                              {normalizedStatus ? (
                                <div className="space-y-1">
                                  <Badge className={
                                    normalizedStatus === 'On-Time'
                                      ? 'bg-green-500'
                                      : normalizedStatus === 'Late/Undertime'
                                      ? 'bg-linear-to-r from-amber-500 to-orange-500 text-white'
                                      : normalizedStatus === 'Late'
                                      ? 'bg-orange-500'
                                      : normalizedStatus === 'Undertime'
                                      ? 'bg-amber-500'
                                      : isAbsentStatus(status)
                                      ? 'bg-red-500'
                                      : normalizedStatus === 'Admin Time'
                                      ? 'bg-blue-500'
                                      : 'bg-slate-500'
                                  }>
                                    {normalizedStatus}
                                  </Badge>
                                  {isStatusOnlyAbsent ? (
                                    <p className="text-[11px] text-red-600 dark:text-red-300">Status-only record</p>
                                  ) : null}
                                </div>
                              ) : '-'}
                            </td>
                            <td className="border p-3 text-center">{lateMin > 0 ? lateMin : '-'}</td>
                            <td className="border p-3 text-center">{utMin > 0 ? utMin : '-'}</td>
                          </tr>
                        )
                      })
                    })()}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100 dark:bg-gray-800 font-bold">
                      <td colSpan={3} className="border p-3">TOTALS</td>
                      <td className="border p-3">
                        {(() => {
                          const present = previewEmployeeData.logs.filter((l: any) => l.log_type === 'IN' && !isAbsentStatus(l.attendance_status)).length
                          const late = previewEmployeeData.logs.filter((l: any) => l.log_type === 'IN' && l.is_late).length
                          const absent = new Set(
                            previewEmployeeData.logs
                              .filter((l: any) => isAbsentStatus(l.attendance_status))
                              .map((l: any) => (l.date || '').substring(0, 10))
                              .filter(Boolean)
                          ).size
                          return `P:${present} L:${late} A:${absent}`
                        })()}
                      </td>
                      <td className="border p-3 text-center">
                        {previewEmployeeData.logs.reduce((sum: number, l: any) => sum + (l.late_minutes || 0), 0)}m
                      </td>
                      <td className="border p-3 text-center">
                        {previewEmployeeData.logs.reduce((sum: number, l: any) => sum + (l.undertime_minutes || 0), 0)}m
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setDtrPreviewOpen(false)}
                >
                  Close
                </Button>
                <Button
                  className="btn-sti-primary"
                  onClick={() => {
                    try {
                      // Print this single DTR in full-page format
                      const printContent = generateFullPageSingleDTRPrint(
                        previewEmployeeData, 
                        previewEmployeeData.startDate, 
                        previewEmployeeData.endDate
                      )
                      
                      const printWindow = window.open('', '_blank')
                      if (!printWindow) {
                        showErrorDialog(
                          'Pop-up Blocked',
                          'Please allow pop-ups to print DTRs. Check your browser settings and try again.'
                        )
                        return
                      }
                      
                      printWindow.document.write(printContent)
                      printWindow.document.close()
                      printWindow.onload = () => {
                        setTimeout(() => {
                          printWindow.print()
                          printWindow.onafterprint = () => {
                            printWindow.close()
                          }
                        }, 500)
                      }
                      
                      toast({
                        title: 'Printing DTR',
                        description: `Printing DTR for ${previewEmployeeData.employee.full_name}`
                      })
                    } catch (error: any) {
                      showErrorDialog(
                        'Print Failed',
                        error.message || 'An unexpected error occurred while preparing the DTR for printing.'
                      )
                    }
                  }}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print This DTR
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Faculty Timesheet Preview Modal */}
      <Dialog open={facultyTimesheetPreviewOpen} onOpenChange={setFacultyTimesheetPreviewOpen}>
        <DialogContent className="max-w-[95vw] md:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-purple-700 dark:text-purple-400">Faculty Timesheet Preview</DialogTitle>
            <DialogDescription>
              Preview before printing • {previewFacultyData?.employee?.full_name}
            </DialogDescription>
          </DialogHeader>

          {previewFacultyData && (
            <div className="space-y-6">
              {/* Faculty Info Card */}
              <Card className="border-2 border-purple-200 dark:border-purple-800">
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Faculty Name</p>
                      <p className="text-lg font-bold">{previewFacultyData.employee.full_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Employee ID</p>
                      <p className="text-lg font-bold">{previewFacultyData.employee.unique_employee_id}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Department</p>
                      <p className="text-lg font-bold">{previewFacultyData.employee.department}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Cutoff Period</p>
                      <p className="text-lg font-bold">
                        {previewFacultyData.cutoffPeriod === '26-10' ? '26th-10th' : '11th-25th'}
                      </p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Date Range</p>
                      <p className="text-base font-semibold">
                        {format(new Date(previewFacultyData.startDate), 'MMM dd, yyyy')} - {format(new Date(previewFacultyData.endDate), 'MMM dd, yyyy')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Timesheet Table Preview */}
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-purple-100 dark:bg-purple-900/30">
                      <th className="border p-3 text-left font-bold">Date</th>
                      <th className="border p-3 text-left font-bold">Time In</th>
                      <th className="border p-3 text-left font-bold">Time Out</th>
                      <th className="border p-3 text-left font-bold">Status</th>
                      <th className="border p-3 text-left font-bold">Late (min)</th>
                      <th className="border p-3 text-left font-bold">Undertime (min)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Group logs by date
                      const logsByDate: { [key: string]: any[] } = {}
                      previewFacultyData.logs.forEach((log: any) => {
                        const date = log.date
                        if (!logsByDate[date]) logsByDate[date] = []
                        logsByDate[date].push(log)
                      })

                      const dates = Object.keys(logsByDate).sort()
                      
                      if (dates.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} className="border p-8 text-center text-gray-500">
                              No attendance logs for this period
                            </td>
                          </tr>
                        )
                      }

                      return dates.map(date => {
                        const dayLogs = logsByDate[date]
                        const inLog = dayLogs.find((l: any) => isTimedInLog(l))
                        const outLog = dayLogs.find((l: any) => isTimedOutLog(l))
                        
                        const timeIn = inLog?.log_time ? format(new Date(inLog.log_time), 'h:mm a') : '-'
                        const timeOut = outLog?.log_time ? format(new Date(outLog.log_time), 'h:mm a') : '-'
                        const explicitStatusLog = dayLogs.find((l: any) => isAbsentAttendanceLog(l))
                        const status = explicitStatusLog?.attendance_status || inLog?.attendance_status || outLog?.attendance_status || ''
                        const normalizedStatus = normalizeReportStatusLabel(status)
                        const isStatusOnlyAbsent = isAbsentStatus(status) && !inLog && !outLog
                        const lateMin = inLog?.late_minutes || 0
                        const utMin = outLog?.undertime_minutes || 0
                        
                        return (
                          <tr key={date} className="hover:bg-purple-50 dark:hover:bg-purple-900/10">
                            <td className="border p-3">{format(new Date(date + 'T00:00:00'), 'MMM dd, yyyy (EEE)')}</td>
                            <td className="border p-3 font-mono">{timeIn}</td>
                            <td className="border p-3 font-mono">{timeOut}</td>
                            <td className="border p-3">
                              {normalizedStatus ? (
                                <div className="space-y-1">
                                  <Badge className={
                                    normalizedStatus === 'On-Time'
                                      ? 'bg-green-500'
                                      : normalizedStatus === 'Late/Undertime'
                                      ? 'bg-linear-to-r from-amber-500 to-orange-500 text-white'
                                      : normalizedStatus === 'Late'
                                      ? 'bg-orange-500'
                                      : normalizedStatus === 'Undertime'
                                      ? 'bg-amber-500'
                                      : isAbsentStatus(status)
                                      ? 'bg-red-500'
                                      : normalizedStatus === 'Admin Time'
                                      ? 'bg-blue-500'
                                      : 'bg-slate-500'
                                  }>
                                    {normalizedStatus}
                                  </Badge>
                                  {isStatusOnlyAbsent ? (
                                    <p className="text-[11px] text-red-600 dark:text-red-300">Status-only record</p>
                                  ) : null}
                                </div>
                              ) : '-'}
                            </td>
                            <td className="border p-3 text-center">{lateMin > 0 ? lateMin : '-'}</td>
                            <td className="border p-3 text-center">{utMin > 0 ? utMin : '-'}</td>
                          </tr>
                        )
                      })
                    })()}
                  </tbody>
                  <tfoot>
                    <tr className="bg-purple-100 dark:bg-purple-900/30 font-bold">
                      <td colSpan={3} className="border p-3">TOTALS</td>
                      <td className="border p-3">
                        {(() => {
                          const present = previewFacultyData.logs.filter((l: any) => l.log_type === 'IN' && !isAbsentStatus(l.attendance_status)).length
                          const late = previewFacultyData.logs.filter((l: any) => l.log_type === 'IN' && l.is_late).length
                          const absent = new Set(
                            previewFacultyData.logs
                              .filter((l: any) => isAbsentStatus(l.attendance_status))
                              .map((l: any) => (l.date || '').substring(0, 10))
                              .filter(Boolean)
                          ).size
                          return `P:${present} L:${late} A:${absent}`
                        })()}
                      </td>
                      <td className="border p-3 text-center">
                        {previewFacultyData.logs.reduce((sum: number, l: any) => sum + (l.late_minutes || 0), 0)}m
                      </td>
                      <td className="border p-3 text-center">
                        {previewFacultyData.logs.reduce((sum: number, l: any) => sum + (l.undertime_minutes || 0), 0)}m
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setFacultyTimesheetPreviewOpen(false)}
                >
                  Close
                </Button>
                <Button
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={() => {
                    try {
                      // Print this single timesheet (dedicated layout)
                      const printContent = generateFacultyTimesheetPrintHTML(
                        previewFacultyData,
                        previewFacultyData.startDate,
                        previewFacultyData.endDate
                      )
                      // (template code removed, only call the function here)
                      
                      const printWindow = window.open('', '_blank')
                      if (!printWindow) {
                        showErrorDialog(
                          'Pop-up Blocked',
                          'Please allow pop-ups to print timesheets. Check your browser settings and try again.'
                        )
                        return
                      }
                      
                      printWindow.document.write(printContent)
                      printWindow.document.close()
                      printWindow.onload = () => {
                        setTimeout(() => {
                          printWindow.print()
                          printWindow.onafterprint = () => {
                            printWindow.close()
                          }
                        }, 500)
                      }
                      
                      toast({
                        title: 'Printing Timesheet',
                        description: `Printing timesheet for ${previewFacultyData.employee.full_name}`
                      })
                    } catch (error: any) {
                      showErrorDialog(
                        'Print Failed',
                        error.message || 'An unexpected error occurred while preparing the timesheet for printing.'
                      )
                    }
                  }}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print This Timesheet
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Centered Error Dialog */}
      <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              {errorDialogTitle}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {errorDialogMessage}
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setErrorDialogOpen(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

