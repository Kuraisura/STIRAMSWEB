/**
 * STI RAMS - Database Type Definitions
 * 
 * Comprehensive TypeScript interfaces for all database tables
 * Ensures type safety across the application
 */

// ============================================================================
// ACADEMIC MANAGEMENT TYPES
// ============================================================================

export interface AcademicTerm {
  id: number
  academic_year: string // e.g., "2025-2026"
  term_name: string // e.g., "1st Term", "2nd Term", "Summer"
  start_date: string // DATE format: YYYY-MM-DD
  end_date: string // DATE format: YYYY-MM-DD
  is_active: boolean
  created_at: string
  updated_at: string
}

// ============================================================================
// EMPLOYEE & USER TYPES
// ============================================================================

export type UserRole = 'teaching' | 'non_teaching' | 'admin'
export type EmploymentType = 
  | 'part_time_full_load' 
  | 'part_time' 
  | 'regular' 
  | 'probationary'
export type VerificationStatus = 'pending' | 'verified' | 'rejected'

export interface Employee {
  employee_id: number
  rfid_code: string
  full_name: string
  school_id: string
  unique_employee_id?: string // TCH-##### or NTC-#####
  department: string
  email: string
  phone: string
  password: string
  schedule_time_in: string
  schedule_time_out: string
  employment_status: string
  employment_type?: EmploymentType
  role?: UserRole
  verification_status?: VerificationStatus
  verified_by?: number // References admin_users.id
  verified_at?: string
  hire_date: string
  start_date?: string
  photo_path?: string
  photo_url?: string
  staff_type?: 'Teaching' | 'Non-Teaching'
  is_active?: boolean
  // Whether this employee is required to report physically on reporting-only holidays
  // Admins can toggle this per-employee. If undefined, system falls back to heuristics.
  is_reporting_staff?: boolean
  days_off?: string // JSON array of weekday numbers: [5, 6] for Friday & Saturday
  created_at: string
  updated_at: string
}

export interface AdminUser {
  id: number
  email: string
  full_name: string
  password: string
  role: string
  is_active: boolean
  created_at: string
  last_login?: string
  photo_path?: string | null
  photo_url?: string
  current_session_id?: string | null
}

// ============================================================================
// ATTENDANCE TYPES
// ============================================================================

export type LogType = 'IN' | 'OUT' | 'LEAVE'
export type AttendanceStatus = 
  | 'present'
  | 'late'
  | 'absent'
  | 'excused'
  | 'on_time'
  | 'undertime'
  | 'admin_time'
  | 'missed_log'

export interface AttendanceLog {
  log_id: number
  employee_id: number
  rfid_code: string
  log_time: string
  log_type: LogType
  attendance_status: AttendanceStatus
  is_late: boolean
  is_early_out: boolean
  date: string
  notes?: string
  
  // New fields for enhanced tracking
  is_holiday?: boolean
  is_suspended?: boolean
  is_online_class?: boolean
  is_admin_time?: boolean
  late_minutes?: number
  undertime_minutes?: number
  schedule_id?: number
  term_id?: number
  
  verified_by?: number
  verified_at?: string
  created_at: string
  
  // Relations
  employees?: Partial<Employee>
}

// ============================================================================
// SCHEDULE TYPES
// ============================================================================

export type ScheduleStatus = 'available' | 'substituted' | 'cancelled'
export type ScheduleTerm = '1st_term' | '2nd_term' | 'summer'

export interface TeachingSchedule {
  schedule_id: number
  employee_id: number
  course_id: number
  room_id: number
  day_of_week: number // 0=Sunday, 1=Monday, ..., 6=Saturday
  time_start: string // HH:MM:SS
  time_end: string // HH:MM:SS
  subject_id?: number
  subject_name?: string
  class_type?: string
  section?: string
  term?: ScheduleTerm
  term_id?: number // Foreign key to academic_terms table
  
  // Substitution tracking
  status?: ScheduleStatus
  substitute_employee_id?: number
  unavailable_reason?: string
  substituted_at?: string
  substituted_by?: number
  
  // One-time schedule support
  specific_date?: string // DATE format: YYYY-MM-DD
  is_recurring?: boolean
  
  // Relations
  // @deprecated - No longer used, keep subject_name only
  course_code?: string
  room_code?: string
  courses?: Partial<Course>
  rooms?: Partial<Room>
  substitute_employee?: Partial<Employee>
}

export interface ExamSchedule {
  exam_schedule_id: number
  employee_id: number
  day_of_week: number
  time_start: string
  time_end: string
  // @deprecated - No longer used, keep subject_name only
  course_code?: string
  subject_name?: string
  section?: string
  room_code?: string
  exam_date?: string // Specific date when exam is scheduled (YYYY-MM-DD)
  exam_type?: 'prelims' | 'midterms' | 'prefinals' | 'finals' | 'quiz' | 'diagnostic' | 'practical' | 'oral' | 'regular' // Type of exam
  term?: ScheduleTerm
  term_id?: number // Foreign key to academic_terms table
  
  // Substitution tracking
  status?: ScheduleStatus
  substitute_employee_id?: number
  unavailable_reason?: string
  substituted_at?: string
  substituted_by?: number
  
  // Relations
  substitute_employee?: Partial<Employee>
  substitute_employee_name?: string
}

export interface Course {
  course_id: number
  code: string
  title?: string
  department?: string
  created_at: string
  updated_at: string
}

export interface Room {
  room_id: number
  code: string
  building?: string
  floor?: number
  name?: string
  created_at: string
  updated_at: string
}

// ============================================================================
// LEAVE MANAGEMENT TYPES
// ============================================================================

export type LeaveStatus = 'pending' | 'approved' | 'denied' | 'rejected' | 'cancelled'

export interface LeaveType {
  id: number
  leave_type_name: string // e.g., "Sick Leave", "Vacation Leave"
  description?: string
  default_credits: number
  requires_documentation: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface LeaveCredit {
  id: number
  employee_id: number
  leave_type_id: number
  academic_year: string
  total_credits: number
  used_credits: number
  remaining_credits: number // Computed field
  created_at: string
  updated_at: string
  
  // Relations
  leave_types?: LeaveType
  employees?: Partial<Employee>
}

export interface LeaveRequest {
  id: number
  employee_id: number
  leave_type_id: number
  date_from: string // DATE format
  date_to: string // DATE format
  days_requested: number
  reason: string
  supporting_documents?: string[]
  status: LeaveStatus
  
  // Review tracking
  reviewed_by?: number
  reviewed_at?: string
  remarks?: string
  
  created_at: string
  updated_at: string
  
  // Relations
  employees?: Partial<Employee>
  leave_types?: LeaveType
  reviewer?: Partial<AdminUser>
}

// ============================================================================
// HOLIDAY & SPECIAL DAYS
// ============================================================================

export type HolidayType = 
  | 'holiday' 
  | 'suspended_asynchronous' 
  | 'suspended_synchronous' 
  | 'online_class'

export interface HolidayCalendar {
  id: number
  date: string // DATE format - kept for backwards compatibility, use start_date instead
  start_date?: string // DATE format - start date of holiday range
  end_date?: string // DATE format - end date of holiday range
  type: HolidayType
  name: string
  description?: string
  affects_attendance: boolean
  reporting_only?: boolean
  created_by?: number
  created_at: string
  updated_at: string
}

// ============================================================================
// SUBSTITUTION TRACKING
// ============================================================================

export type SubstitutionScheduleType = 'teaching' | 'exam'
export type SubstitutionReason = 'on-leave' | 'absent' | 'unavailable'

export interface SubstitutionHistory {
  id: number
  schedule_type: SubstitutionScheduleType
  schedule_id: number
  original_employee_id: number
  substitute_employee_id: number
  date: string // DATE format
  time_start?: string // Time format HH:MM:SS for partial substitution
  time_end?: string // Time format HH:MM:SS for partial substitution
  reason?: SubstitutionReason
  unavailable_reason?: string
  assigned_by?: number
  assigned_at: string
  notes?: string
  
  // Relations
  original_employee?: Partial<Employee>
  substitute_employee?: Partial<Employee>
  admin?: Partial<AdminUser>
}

// ============================================================================
// LOG TRAIL (formerly Audit Trail)
// ============================================================================

export type LogTrailUserType = 'admin' | 'employee' | 'system'

export interface LogTrail {
  id: number
  user_id?: number
  user_email?: string
  user_name?: string
  user_type?: LogTrailUserType
  action_type: string // e.g., 'attendance_updated', 'leave_approved', 'substitution_assigned'
  table_name?: string
  record_id?: number
  old_value?: Record<string, any>
  new_value?: Record<string, any>
  description?: string
  ip_address?: string
  user_agent?: string
  device_platform?: string
  device_browser?: string
  metadata?: Record<string, any>
  created_at: string
}

// ============================================================================
// VERIFICATION REQUESTS
// ============================================================================

export type VerificationRequestType = 'time_correction' | 'missed_log' | 'leave' | 'excuse'
export type VerificationRequestStatus = 'pending' | 'approved' | 'rejected'

export interface VerificationRequest {
  request_id: number
  employee_id: number
  attendance_log_id?: number
  request_type: VerificationRequestType
  original_time?: string
  requested_time?: string
  time_start?: string | null
  time_end?: string | null
  reason: string
  supporting_documents?: string[]
  status: VerificationRequestStatus
  requested_by?: number
  reviewed_by?: number
  review_notes?: string
  requested_at: string
  reviewed_at?: string
  schedule_id?: number | null
  schedule_type?: 'exam' | 'teaching' | null
  schedule_date?: string | null
  substitution_applied?: boolean | null
  
  // Relations
  employee?: Partial<Employee>
  reviewer?: Partial<AdminUser>
}

// ============================================================================
// EMAIL & NOTIFICATION TYPES
// ============================================================================

export type EmailStatus = 'pending' | 'sent' | 'delivered' | 'failed'
export type NotificationStatus = 'unread' | 'read'

export interface EmailTemplate {
  template_id: number
  template_name: string
  subject: string
  content: string
  template_type: string
  is_active: boolean
  created_by?: number
  created_at: string
  updated_at: string
}

export interface EmailLog {
  email_id: number
  recipient_email: string
  recipient_name?: string
  subject: string
  content: string
  template_used?: string
  status: EmailStatus
  error_message?: string
  sent_at?: string
  delivered_at?: string
  created_at: string
}

export interface NotificationItem {
  notification_id: number
  recipient_id: number
  recipient_type: 'employee' | 'admin'
  title: string
  message: string
  type: string // e.g., 'info', 'warning', 'success', 'error'
  action_url?: string
  read_at?: string
  created_at: string
  
  // Relations
  recipient?: Partial<Employee | AdminUser>
}

// ============================================================================
// SYSTEM SETTINGS
// ============================================================================

export interface SystemSetting {
  setting_id: number
  setting_key: string
  setting_value: string
  setting_description?: string
  setting_type: string
  is_encrypted: boolean
  updated_by?: number
  updated_at: string
  created_at: string
}

// ============================================================================
// DEPARTMENT TYPES
// ============================================================================

export interface Department {
  department_id: number
  name: string
  description?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Generic API response type
 */
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number
  per_page: number
  total: number
  total_pages: number
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T = any> {
  data: T[]
  meta: PaginationMeta
}

/**
 * Filter options for queries
 */
export interface FilterOptions {
  search?: string
  department?: string
  role?: UserRole
  status?: string
  date_from?: string
  date_to?: string
  term?: ScheduleTerm
  [key: string]: any
}

/**
 * Sort options for queries
 */
export interface SortOptions {
  field: string
  direction: 'asc' | 'desc'
}

// ============================================================================
// DTR (Daily Time Record) TYPES
// ============================================================================

export interface DTRSummary {
  employee_id: number
  employee_name: string
  department: string
  date_from: string
  date_to: string
  total_days_present: number
  total_days_absent: number
  total_days_late: number
  total_late_minutes: number
  total_undertime_minutes: number
  total_admin_time_days: number
  records: DTRRecord[]
}

export interface DTRRecord {
  date: string
  day_of_week: string
  time_in?: string
  time_out?: string
  scheduled_in?: string
  scheduled_out?: string
  status: AttendanceStatus
  late_minutes?: number
  undertime_minutes?: number
  is_holiday?: boolean
  is_suspended?: boolean
  notes?: string
}
