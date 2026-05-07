/**
 * Example usage of Faculty DTR Generator
 * This file demonstrates how to use the DTR system
 */

import { generateDTRRecords, hasAttendanceLogs, type DTRData, type AttendanceLog } from '@/lib/faculty-dtr-generator'

// Example 1: Sample DTR Data
export const sampleDTRData: DTRData = {
  facultyName: 'Mark Crysler Baddo',
  department: 'Information Technology',
  schoolYear: '2024-2025',
  semester: '1st Semester',
  cutoffStart: 'Nov 01, 2025',
  cutoffEnd: 'Nov 15, 2025',
  attendanceLogs: [
    {
      employee_id: 101,
      date: '2025-11-01',
      time_in: '08:00:00',
      time_out: '17:00:00',
      scheduled_time_in: '08:00:00',
      scheduled_time_out: '17:00:00'
    },
    {
      employee_id: 101,
      date: '2025-11-02',
      time_in: '08:15:00',
      time_out: '17:00:00',
      scheduled_time_in: '08:00:00',
      scheduled_time_out: '17:00:00'
    },
    {
      employee_id: 101,
      date: '2025-11-03',
      time_in: '08:00:00',
      time_out: '16:45:00',
      scheduled_time_in: '08:00:00',
      scheduled_time_out: '17:00:00'
    },
    {
      employee_id: 101,
      date: '2025-11-04',
      time_in: '08:30:00',
      time_out: '16:30:00',
      scheduled_time_in: '08:00:00',
      scheduled_time_out: '17:00:00'
    },
    {
      employee_id: 101,
      date: '2025-11-05',
      time_in: null,
      time_out: null,
      scheduled_time_in: '08:00:00',
      scheduled_time_out: '17:00:00'
    }
  ]
}

// Example 2: Generate DTR Records
export function exampleGenerateDTR() {
  const { records, summary } = generateDTRRecords(sampleDTRData)
  
  console.log('Generated Records:', records)
  console.log('Summary:', summary)
  
  return { records, summary }
}

// Example 3: Check if employee has logs
export function exampleCheckLogs() {
  const hasLogs = hasAttendanceLogs(sampleDTRData.attendanceLogs)
  console.log('Has attendance logs?', hasLogs)
  return hasLogs
}

// Example 4: Fetch attendance from a database client
export async function exampleFetchAttendance(
  dbClient: any,
  employeeId: number,
  startDate: string,
  endDate: string
): Promise<AttendanceLog[]> {
  const { data, error } = await dbClient
    .from('attendance_logs')
    .select('*')
    .eq('employee_id', employeeId)
    .gte('log_date', startDate)
    .lte('log_date', endDate)
    .order('log_date')

  if (error) {
    console.error('Error fetching attendance:', error)
    return []
  }

  // Transform to AttendanceLog format
  return (data || []).map((log: any) => ({
    employee_id: log.employee_id,
    date: log.log_date,
    time_in: log.time_in,
    time_out: log.time_out,
    scheduled_time_in: log.scheduled_time_in || '08:00:00',
    scheduled_time_out: log.scheduled_time_out || '17:00:00'
  }))
}

// Example 5: Expected output structure
export const expectedOutput = {
  records: [
    {
      day: 'Friday',
      date: 'Nov 01, 2025',
      timeIn: '8:00 AM',
      timeOut: '5:00 PM',
      status: 'On Time',
      remarks: 'On Time',
      lateMinutes: 0,
      undertimeMinutes: 0
    },
    {
      day: 'Saturday',
      date: 'Nov 02, 2025',
      timeIn: '8:15 AM',
      timeOut: '5:00 PM',
      status: 'Late',
      remarks: 'Late (15 min)',
      lateMinutes: 15,
      undertimeMinutes: 0
    },
    {
      day: 'Sunday',
      date: 'Nov 03, 2025',
      timeIn: '8:00 AM',
      timeOut: '4:45 PM',
      status: 'Undertime',
      remarks: 'Undertime (15 min)',
      lateMinutes: 0,
      undertimeMinutes: 15
    },
    {
      day: 'Monday',
      date: 'Nov 04, 2025',
      timeIn: '8:30 AM',
      timeOut: '4:30 PM',
      status: 'Late/Undertime',
      remarks: 'Late (30 min) / Undertime (30 min)',
      lateMinutes: 30,
      undertimeMinutes: 30
    },
    {
      day: 'Tuesday',
      date: 'Nov 05, 2025',
      timeIn: '-',
      timeOut: '-',
      status: 'Absent',
      remarks: 'Absent',
      lateMinutes: 0,
      undertimeMinutes: 0
    }
  ],
  summary: {
    lateCount: 2,
    lateTotalMinutes: 45,
    undertimeCount: 2,
    undertimeTotalMinutes: 45,
    absenceCount: 1
  }
}

// Example 6: Testing different scenarios
export const testScenarios = {
  onTime: {
    time_in: '08:00:00',
    time_out: '17:00:00',
    expected: 'On Time'
  },
  late: {
    time_in: '08:30:00',
    time_out: '17:00:00',
    expected: 'Late (30 min)'
  },
  undertime: {
    time_in: '08:00:00',
    time_out: '16:30:00',
    expected: 'Undertime (30 min)'
  },
  lateAndUndertime: {
    time_in: '08:15:00',
    time_out: '16:45:00',
    expected: 'Late (15 min) / Undertime (15 min)'
  },
  absent: {
    time_in: null,
    time_out: null,
    expected: 'Absent'
  }
}

// Example 7: Integration with React Component
export const exampleReactUsage = `
import { useState } from 'react'
import { FacultyDTRPrint } from '@/components/faculty-dtr-print'
import { type DTRData } from '@/lib/faculty-dtr-generator'

function MyDTRPage() {
  const [dtrData, setDtrData] = useState<DTRData | null>(null)
  const [showPrint, setShowPrint] = useState(false)
  
  const handleGenerate = async () => {
    // Fetch data and create DTRData object
    const data: DTRData = {
      facultyName: 'John Doe',
      department: 'Computer Science',
      schoolYear: '2024-2025',
      semester: '1st Semester',
      cutoffStart: 'Nov 01, 2025',
      cutoffEnd: 'Nov 15, 2025',
      attendanceLogs: [] // fetch from database
    }
    
    setDtrData(data)
    setShowPrint(true)
  }
  
  return (
    <div>
      <button onClick={handleGenerate}>Generate DTR</button>
      
      {showPrint && dtrData && (
        <FacultyDTRPrint
          dtrData={dtrData}
          onClose={() => setShowPrint(false)}
        />
      )}
    </div>
  )
}
`

// Example 8: SQL Query for attendance logs
export const sqlQuery = `
-- Fetch attendance logs for DTR generation
SELECT 
  al.employee_id,
  al.log_date as date,
  al.time_in,
  al.time_out,
  COALESCE(al.scheduled_time_in, '08:00:00') as scheduled_time_in,
  COALESCE(al.scheduled_time_out, '17:00:00') as scheduled_time_out
FROM attendance_logs al
WHERE al.employee_id = $1
  AND al.log_date >= $2
  AND al.log_date <= $3
ORDER BY al.log_date ASC;
`
