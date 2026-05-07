import { Pool, PoolClient } from 'pg'
import { toZonedTime, format } from 'date-fns-tz'

const rawDatabaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_CONNECTION_STRING || ''
const isSupabaseUrl = /supabase\.co|pooler\.supabase/i.test(rawDatabaseUrl)
const localDatabaseUrl = isSupabaseUrl ? '' : rawDatabaseUrl

if (isSupabaseUrl) {
  console.warn('[local-database] Supabase URL detected and ignored. Using localhost DB_* configuration.')
}

// Local database configuration (env-first, safe fallback for offline setup)
const localDbConfig = localDatabaseUrl
  ? {
      connectionString: localDatabaseUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'stirams',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    }

// Create a connection pool
const pool = new Pool(localDbConfig)

// Philippines timezone
const PHILIPPINES_TIMEZONE = "Asia/Manila"

// Helper function to calculate valid tap windows based on schedule
// Examples:
// - Schedule 7:00AM - 3:00PM: IN window 5:00AM-12:00PM, OUT window 1:00PM-9:00PM
// - Schedule 1:00PM - 9:00PM: IN window 10:00AM-1:00PM, OUT window 2:00PM-9:00PM
const calculateTapWindows = (scheduleStart: string, scheduleEnd: string) => {
  // Convert schedule times to minutes since midnight
  const timeToMinutes = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number)
    return hours * 60 + minutes
  }
  
  const startMinutes = timeToMinutes(scheduleStart)
  const endMinutes = timeToMinutes(scheduleEnd)
  
  // Determine if this is an afternoon schedule (starts at 1:00PM or later)
  const isAfternoonSchedule = startMinutes >= 13 * 60 // 1:00 PM = 780 minutes
  
  let inWindowStart: number
  let inWindowEnd: number
  let outWindowStart: number
  let outWindowEnd: number
  
  if (isAfternoonSchedule) {
    // Afternoon schedule (e.g., 1:00PM - 9:00PM):
    // IN window: 3 hours before start to start time (e.g., 10:00AM - 1:00PM)
    inWindowStart = startMinutes - 3 * 60 // 3 hours before start (10:00AM)
    inWindowEnd = startMinutes // Up to schedule start time (1:00PM)
    
    // OUT window: 1 hour after start to end time (e.g., 2:00PM - 9:00PM)
    // 2:00PM = 1 hour after 1:00PM start, or 7 hours before 9:00PM end
    outWindowStart = startMinutes + 1 * 60 // 1 hour after schedule start (2:00PM)
    outWindowEnd = endMinutes // Up to schedule end time (9:00PM)
  } else {
    // Morning schedule (e.g., 7:00AM - 3:00PM):
    // IN window: 2 hours before start (minimum 5:00AM) to 5 hours after start (e.g., 5:00AM - 12:00PM)
    inWindowStart = Math.max(5 * 60, startMinutes - 2 * 60) // 5:00 AM minimum, or 2 hours before start
    inWindowEnd = Math.min(startMinutes + 5 * 60, 12 * 60) // 5 hours after start, capped at 12:00PM
    
    // OUT window: 2 hours before end to 6 hours after end (e.g., 1:00PM - 9:00PM)
    outWindowStart = Math.max(endMinutes - 2 * 60, 13 * 60) // 2 hours before end, minimum 1:00PM
    outWindowEnd = Math.min(endMinutes + 6 * 60, 21 * 60) // 6 hours after end, maximum 9:00PM
  }
  
  const minutesToTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`
  }
  
  return {
    inWindowStart: minutesToTime(inWindowStart),
    inWindowEnd: minutesToTime(inWindowEnd),
    outWindowStart: minutesToTime(outWindowStart),
    outWindowEnd: minutesToTime(outWindowEnd),
    scheduleStart,
    scheduleEnd
  }
}

// Test the connection
export const testLocalConnection = async () => {
  try {
    const client = await pool.connect()
    const result = await client.query('SELECT NOW()')
    client.release()
    return { success: true, timestamp: result.rows[0].now }
  } catch (error) {
    console.error('Local database connection failed:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Initialize local database tables
export const initializeLocalDatabase = async () => {
  const client = await pool.connect()
  
  try {
    // Create attendance_logs table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance_logs (
        log_id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        rfid_code VARCHAR(50) NOT NULL,
        log_time TIMESTAMP NOT NULL,
        log_type VARCHAR(10) NOT NULL CHECK (log_type IN ('IN', 'OUT')),
        attendance_status VARCHAR(20) DEFAULT 'present',
        is_late BOOLEAN DEFAULT FALSE,
        is_early_out BOOLEAN DEFAULT FALSE,
        date DATE NOT NULL,
        notes TEXT,
        verified_by INTEGER,
        verified_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        synced_to_cloud BOOLEAN DEFAULT FALSE,
        cloud_sync_timestamp TIMESTAMP
      )
    `)

    // Create employees table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS employees (
        employee_id SERIAL PRIMARY KEY,
        rfid_code VARCHAR(50) UNIQUE NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        school_id VARCHAR(50) UNIQUE,
        department VARCHAR(100),
        email VARCHAR(255),
        phone VARCHAR(20),
        password VARCHAR(255),
        schedule_time_in TIME,
        schedule_time_out TIME,
        employment_status VARCHAR(20) DEFAULT 'active',
        hire_date DATE,
        photo_path VARCHAR(500),
        staff_type VARCHAR(20) DEFAULT 'Non-Teaching',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        synced_to_cloud BOOLEAN DEFAULT FALSE,
        cloud_sync_timestamp TIMESTAMP
      )
    `)
    
    // Add is_active column if it doesn't exist (for existing databases)
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'employees' AND column_name = 'is_active'
        ) THEN
          ALTER TABLE employees ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
        END IF;
      END $$;
    `)

    // Create sync_log table to track sync operations
    await client.query(`
      CREATE TABLE IF NOT EXISTS sync_log (
        sync_id SERIAL PRIMARY KEY,
        sync_type VARCHAR(50) NOT NULL,
        records_count INTEGER DEFAULT 0,
        sync_status VARCHAR(20) DEFAULT 'pending',
        error_message TEXT,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_attendance_logs_employee_id ON attendance_logs(employee_id);
      CREATE INDEX IF NOT EXISTS idx_attendance_logs_date ON attendance_logs(date);
      CREATE INDEX IF NOT EXISTS idx_attendance_logs_synced ON attendance_logs(synced_to_cloud);
      CREATE INDEX IF NOT EXISTS idx_employees_rfid ON employees(rfid_code);
      CREATE INDEX IF NOT EXISTS idx_employees_synced ON employees(synced_to_cloud);
    `)

    console.log('Local database initialized successfully')
    return { success: true }
  } catch (error) {
    console.error('Error initializing local database:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  } finally {
    client.release()
  }
}

// RFID Attendance Logging
export const logRFIDAttendance = async (rfidCode: string, logType: 'IN' | 'OUT') => {
  const client = await pool.connect()
  
  try {
    // Start transaction
    await client.query('BEGIN')

    // Get employee by RFID code - CRITICAL: Only allow active employees (exclude archived)
    // Archived employees have is_active = false and should not be able to tap in/out
    const employeeResult = await client.query(
      `SELECT * FROM employees 
       WHERE rfid_code = $1 
       AND (is_active IS NULL OR is_active = true)`,
      [rfidCode]
    )

    if (employeeResult.rows.length === 0) {
      throw new Error(`Employee not found with RFID code: ${rfidCode} or employee is archived`)
    }

    const employee = employeeResult.rows[0]
    
    // Double-check: Ensure employee is not archived
    if (employee.is_active === false) {
      throw new Error(`Employee ${employee.full_name} is archived and cannot tap in/out. Please restore the employee first.`)
    }
    
    // Create date in Philippines timezone with current year (2025)
    const now = new Date()
    const philippinesTime = toZonedTime(now, PHILIPPINES_TIMEZONE)
    
    // Format date and time correctly for Philippines timezone (2025)
    const today = format(philippinesTime, 'yyyy-MM-dd', { timeZone: PHILIPPINES_TIMEZONE })
    const currentTime = format(philippinesTime, 'HH:mm:ss', { timeZone: PHILIPPINES_TIMEZONE })

    // Check if this is a duplicate log (same employee, same type, same day)
    const existingLog = await client.query(
      'SELECT * FROM attendance_logs WHERE employee_id = $1 AND log_type = $2 AND date = $3',
      [employee.employee_id, logType, today]
    )

    if (existingLog.rows.length > 0) {
      throw new Error(`Duplicate ${logType} log for employee ${employee.full_name} on ${today}`)
    }

    // Determine schedule times from teaching schedules for today
    let scheduleStart: string | null = null
    let scheduleEnd: string | null = null
    let isWithinValidWindow = true
    
    // Get day of week (1 = Monday, 7 = Sunday)
    const dateObj = new Date(today + 'T00:00:00+08:00')
    const jsDayOfWeek = dateObj.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const scheduleDayOfWeek = jsDayOfWeek === 0 ? null : jsDayOfWeek // Exclude Sunday
    
    // Try to get schedule from local DB if employee is Teaching staff
    if (scheduleDayOfWeek && (employee.staff_type === 'Teaching' || employee.staff_type === 'Teaching Staff')) {
      try {
        // Check for exam schedule first (specific date)
        const examByDate = await client.query(
          `SELECT time_start, time_end
           FROM exam_schedules
           WHERE employee_id = $1
             AND exam_date = $2
             AND time_start IS NOT NULL
             AND time_end IS NOT NULL`,
          [employee.employee_id, today]
        )

        const toRange = (rows: any[]) => {
          if (!rows || rows.length === 0) return null
          const times = rows
            .map((s: any) => ({ start: s.time_start, end: s.time_end }))
            .filter((s: any) => s.start && s.end)
          if (times.length === 0) return null
          return {
            start: times.reduce((min: any, s: any) => (s.start < min.start ? s : min), times[0]).start,
            end: times.reduce((max: any, s: any) => (s.end > max.end ? s : max), times[0]).end,
          }
        }

        let range = toRange(examByDate.rows)

        // If no exam schedule by date, try recurring exam schedule by day_of_week
        if (!range) {
          const examByDay = await client.query(
            `SELECT time_start, time_end
             FROM exam_schedules
             WHERE employee_id = $1
               AND day_of_week = $2
               AND exam_date IS NULL
               AND time_start IS NOT NULL
               AND time_end IS NOT NULL`,
            [employee.employee_id, scheduleDayOfWeek]
          )
          range = toRange(examByDay.rows)
        }

        // If no exam schedule, check teaching schedule
        if (!range) {
          const teachingByDay = await client.query(
            `SELECT time_start, time_end
             FROM teaching_schedules
             WHERE employee_id = $1
               AND day_of_week = $2
               AND time_start IS NOT NULL
               AND time_end IS NOT NULL`,
            [employee.employee_id, scheduleDayOfWeek]
          )
          range = toRange(teachingByDay.rows)
        }

        if (range) {
          scheduleStart = range.start
          scheduleEnd = range.end
        }
      } catch (error) {
        console.warn('[logRFIDAttendance] Error fetching schedule from local DB:', error)
      }
    }
    
    // Fallback to employee's default schedule if no teaching schedule found
    if (!scheduleStart || !scheduleEnd) {
      scheduleStart = employee.schedule_time_in || null
      scheduleEnd = employee.schedule_time_out || null
    }
    
    // Normalize schedule times (ensure HH:MM:SS format)
    if (scheduleStart && scheduleStart.length === 5) {
      scheduleStart = scheduleStart + ':00'
    }
    if (scheduleEnd && scheduleEnd.length === 5) {
      scheduleEnd = scheduleEnd + ':00'
    }

    // Determine if late or early out - NEW LOGIC based on teaching schedule:
    // IN: Before schedule start = On-Time, At or after schedule start = Late
    // OUT: Before schedule end = Undertime, At or after schedule end = On-Time
    let isLate = false
    let isEarlyOut = false
    let attendanceStatus = 'present'
    
    // Validate tap is within acceptable window
    if (scheduleStart && scheduleEnd) {
      const windows = calculateTapWindows(scheduleStart.substring(0, 5), scheduleEnd.substring(0, 5))
      const currentTimeMinutes = (() => {
        const [h, m] = currentTime.split(':').map(Number)
        return h * 60 + m
      })()
      
      const windowStartMinutes = (() => {
        const [h, m] = (logType === 'IN' ? windows.inWindowStart : windows.outWindowStart).split(':').map(Number)
        return h * 60 + m
      })()
      
      const windowEndMinutes = (() => {
        const [h, m] = (logType === 'IN' ? windows.inWindowEnd : windows.outWindowEnd).split(':').map(Number)
        return h * 60 + m
      })()
      
      // Check if tap is within valid window (log warning but allow tap to proceed)
      isWithinValidWindow = currentTimeMinutes >= windowStartMinutes && currentTimeMinutes <= windowEndMinutes
      
      if (!isWithinValidWindow) {
        console.warn(`[logRFIDAttendance] ${logType} tap at ${currentTime} is outside expected window (${logType === 'IN' ? windows.inWindowStart : windows.outWindowStart} - ${logType === 'IN' ? windows.inWindowEnd : windows.outWindowEnd}) for ${employee.full_name}. Allowing tap but marking appropriately.`)
        // Don't reject the tap, just log a warning - the system will still mark late/undertime appropriately
      }
    }

    if (logType === 'IN' && scheduleStart) {
      const scheduleTime = new Date(`2000-01-01T${scheduleStart}`)
      const actualTime = new Date(`2000-01-01T${currentTime}`)
      // Only late if AT or AFTER schedule start (before = On-Time)
      isLate = actualTime >= scheduleTime
    }

    if (logType === 'OUT' && scheduleEnd) {
      const scheduleTime = new Date(`2000-01-01T${scheduleEnd}`)
      const actualTime = new Date(`2000-01-01T${currentTime}`)
      // Only undertime if BEFORE schedule end (at/after = On-Time)
      isEarlyOut = actualTime < scheduleTime
    }

    // Insert attendance log with correct timezone and current year
    const logResult = await client.query(
      `INSERT INTO attendance_logs (
        employee_id, rfid_code, log_time, log_type, attendance_status, 
        is_late, is_early_out, date, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        employee.employee_id,
        rfidCode,
        philippinesTime,
        logType,
        attendanceStatus,
        isLate,
        isEarlyOut,
        today,
        philippinesTime
      ]
    )

    // Commit transaction
    await client.query('COMMIT')

    console.log(`RFID attendance logged: ${employee.full_name} - ${logType} at ${currentTime} (${today})`)
    return {
      success: true,
      log: logResult.rows[0],
      employee: employee
    }
  } catch (error) {
    // Rollback transaction
    await client.query('ROLLBACK')
    console.error('Error logging RFID attendance:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  } finally {
    client.release()
  }
}

// Get unsynced attendance logs
export const getUnsyncedAttendanceLogs = async (limit = 100) => {
  const client = await pool.connect()
  
  try {
    const result = await client.query(
      `SELECT al.id, al.employee_id, al.rfid_code, al.log_time, al.log_type, 
              al.attendance_status, al.is_late, al.is_early_out, al.date, al.synced_to_cloud,
              e.full_name, e.department
       FROM attendance_logs al 
       JOIN employees e ON al.employee_id = e.employee_id 
       WHERE al.synced_to_cloud = FALSE 
       ORDER BY al.id ASC 
       LIMIT $1`,
      [limit]
    )
    
    return result.rows
  } catch (error) {
    console.error('Error fetching unsynced attendance logs:', error)
    return []
  } finally {
    client.release()
  }
}

// Mark attendance logs as synced
export const markAttendanceLogsSynced = async (logIds: number[]) => {
  const client = await pool.connect()
  
  try {
    const result = await client.query(
      `UPDATE attendance_logs 
       SET synced_to_cloud = TRUE, cloud_sync_timestamp = CURRENT_TIMESTAMP 
       WHERE id = ANY($1)`,
      [logIds]
    )
    
    return { success: true, updatedCount: result.rowCount }
  } catch (error) {
    console.error('Error marking attendance logs as synced:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  } finally {
    client.release()
  }
}

// Get unsynced employees
export const getUnsyncedEmployees = async () => {
  const client = await pool.connect()
  
  try {
    const result = await client.query(
      `SELECT employee_id, rfid_code, full_name, school_id, department, 
              schedule_time, photo_path, synced_to_cloud
       FROM employees 
       WHERE synced_to_cloud = FALSE 
       ORDER BY employee_id ASC`
    )
    
    return result.rows
  } catch (error) {
    console.error('Error fetching unsynced employees:', error)
    return []
  } finally {
    client.release()
  }
}

// Mark employees as synced
export const markEmployeesSynced = async (employeeIds: number[]) => {
  const client = await pool.connect()
  
  try {
    const result = await client.query(
      `UPDATE employees 
       SET synced_to_cloud = TRUE, cloud_sync_timestamp = CURRENT_TIMESTAMP 
       WHERE employee_id = ANY($1)`,
      [employeeIds]
    )
    
    return { success: true, updatedCount: result.rowCount }
  } catch (error) {
    console.error('Error marking employees as synced:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  } finally {
    client.release()
  }
}

// Create sync log entry
export const createSyncLog = async (syncType: string, recordsCount: number = 0) => {
  const client = await pool.connect()
  
  try {
    const result = await client.query(
      `INSERT INTO sync_log (sync_type, records_count, sync_status) 
       VALUES ($1, $2, $3) RETURNING sync_id`,
      [syncType, recordsCount, 'pending']
    )
    
    return result.rows[0].sync_id
  } catch (error) {
    console.error('Error creating sync log:', error)
    return null
  } finally {
    client.release()
  }
}

// Update sync log status
export const updateSyncLog = async (syncId: number, status: string, errorMessage?: string) => {
  const client = await pool.connect()
  
  try {
    await client.query(
      `UPDATE sync_log 
       SET sync_status = $1, error_message = $2, completed_at = CURRENT_TIMESTAMP 
       WHERE sync_id = $3`,
      [status, errorMessage, syncId]
    )
    
    return { success: true }
  } catch (error) {
    console.error('Error updating sync log:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  } finally {
    client.release()
  }
}

// Get sync statistics
export const getSyncStats = async () => {
  const client = await pool.connect()
  
  try {
    const [attendanceCount, employeeCount, lastSync] = await Promise.all([
      client.query('SELECT COUNT(*) as count FROM attendance_logs WHERE synced_to_cloud = FALSE'),
      client.query('SELECT COUNT(*) as count FROM employees WHERE synced_to_cloud = FALSE'),
      client.query('SELECT * FROM sync_log ORDER BY created_at DESC LIMIT 1')
    ])
    
    return {
      unsyncedAttendanceLogs: parseInt(attendanceCount.rows[0].count),
      unsyncedEmployees: parseInt(employeeCount.rows[0].count),
      lastSync: lastSync.rows[0] || null
    }
  } catch (error) {
    console.error('Error getting sync stats:', error)
    return {
      unsyncedAttendanceLogs: 0,
      unsyncedEmployees: 0,
      lastSync: null
    }
  } finally {
    client.release()
  }
}

// Close the pool
export const closePool = async () => {
  await pool.end()
} 
