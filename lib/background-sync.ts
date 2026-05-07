import { performFullSync, getSyncStatus } from './cloud-sync'

class BackgroundSyncService {
  private syncInterval: NodeJS.Timeout | null = null
  private isRunning = false
  private lastSyncTime: Date | null = null
  private syncIntervalMinutes = 30

  async initialize() {
    try {
      console.log('Background maintenance loop is disabled in local-only mode.')
      return false
    } catch (error) {
      console.error('Error initializing background sync service:', error)
      return false
    }
  }

  private startSyncInterval() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
    console.log('Background maintenance interval remains disabled in local-only mode.')
  }

  private async performSync() {
    if (this.isRunning) {
      return { success: false, error: 'Operation already in progress' }
    }

    try {
      this.isRunning = true
      console.log('Starting local maintenance operation...')
      
      const result = await performFullSync()
      
      if (result.success) {
        this.lastSyncTime = new Date()
        console.log(`Local maintenance operation completed at ${this.lastSyncTime.toISOString()}`)
        return result
      } else {
        console.error('Local maintenance operation failed')
        return result
      }
    } catch (error) {
      console.error('Error during local maintenance operation:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    } finally {
      this.isRunning = false
    }
  }

  async manualSync() {
    console.log('Manual maintenance request ignored in local-only mode.')
    return { success: true, skipped: true, message: 'Local-only mode: no background transfer tasks to run.' }
  }

  async getStatus() {
    try {
      const syncStatus = await getSyncStatus()
      return {
        disabled: true,
        isRunning: this.isRunning,
        lastSyncTime: this.lastSyncTime,
        syncIntervalMinutes: this.syncIntervalMinutes,
        nextSyncTime: null,
        syncStatus
      }
    } catch (error) {
      console.error('Error getting sync service status:', error)
      return {
        disabled: true,
        isRunning: this.isRunning,
        lastSyncTime: this.lastSyncTime,
        syncIntervalMinutes: this.syncIntervalMinutes,
        nextSyncTime: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
      console.log('Background sync service stopped.')
    }
  }

  setInterval(minutes: number) {
    this.syncIntervalMinutes = minutes
    console.log(`Sync interval updated to ${minutes} minutes.`)
    this.startSyncInterval()
  }
}

// Create a singleton instance
const backgroundSyncService = new BackgroundSyncService()

export default backgroundSyncService
