import { dbHealthCheck } from './db'

// Offline mode: cloud sync is permanently disabled.
export const syncAttendanceLogs = async () => {
  console.log('Attendance transfer is disabled in local-only mode.')
  return { success: true, syncedCount: 0 }
}

// Offline mode: cloud sync is permanently disabled.
export const syncEmployees = async () => {
  console.log('Employee transfer is disabled in local-only mode.')
  return { success: true, syncedCount: 0 }
}

// Offline mode: no network transfer operation exists.
export const performFullSync = async () => {
  console.log('Transfer operation skipped in local-only mode.')
  return { success: true, employeeCount: 0, attendanceCount: 0 }
}

// Retry loops are disabled in offline-only mode.
export const retryFailedSync = async (syncType: 'attendance_logs' | 'employees' | 'full') => {
  return {
    success: true,
    skipped: true,
    mode: 'local-only',
    message: `Retry disabled in local-only mode for ${syncType}.`,
  }
}

// Local-only health status
export const getSyncStatus = async () => {
  try {
    const connected = await dbHealthCheck()

    return {
      localDatabase: {
        connected,
        checkedAt: new Date().toISOString(),
      },
      cloudDatabase: {
        connected: false,
        disabled: true,
      },
      overallStatus: connected ? 'ok' : 'error',
      mode: 'local-only',
    }
  } catch (error) {
    console.error('Error getting local status:', error)
    return {
      localDatabase: {
        connected: false,
        checkedAt: new Date().toISOString(),
      },
      cloudDatabase: {
        connected: false,
        disabled: true,
      },
      overallStatus: 'error',
      mode: 'local-only',
    }
  }
}

// Manual transfer trigger in local-only mode is a no-op.
export const triggerManualSync = async () => {
  console.log('Manual transfer request ignored in local-only mode.')
  return await performFullSync()
}

// Initialize local-only status service
export const initializeSyncService = async () => {
  try {
    console.log('Initializing local-only status service...')

    const status = await getSyncStatus()

    console.log('Local-only status service initialized successfully')
    return { success: true, status }
  } catch (error) {
    console.error('Error initializing local-only status service:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
} 
