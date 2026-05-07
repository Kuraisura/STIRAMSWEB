"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Database, RefreshCw, Server, CheckCircle, AlertCircle, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useLanguage } from "@/lib/language-context"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type StatusType = 'connected' | 'loading' | 'error'

interface SystemSetting {
  setting_id?: number
  setting_key: string
  setting_value: string
  setting_description?: string
  setting_type: string
  is_encrypted?: boolean
  updated_by?: number
  updated_at?: string
  created_at?: string
}

export default function SystemSettingsPage() {
  const { t } = useLanguage()
  const [settings, setSettings] = useState<SystemSetting[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [lastBackup, setLastBackup] = useState<string>("")
  const [dbStatus, setDbStatus] = useState<StatusType>('loading')
  const [backupStatus, setBackupStatus] = useState<StatusType>('loading')
  const [isCreatingBackupWithPicker, setIsCreatingBackupWithPicker] = useState(false)
  const [backupDir, setBackupDir] = useState<string>("")
  const [backupDirDraft, setBackupDirDraft] = useState<string>("")
  const [availableBackups, setAvailableBackups] = useState<Array<{ file_name: string; modified_at?: string; created_at?: string; size_bytes?: number }>>([])
  const [selectedBackupFile, setSelectedBackupFile] = useState<string>("")
  const { toast } = useToast()

  const getCurrentUser = () => {
    try {
      const raw = localStorage.getItem('rams_user')
      if (!raw) return { user_id: 0, user_email: '', user_name: 'System' }
      const parsed = JSON.parse(raw)
      return {
        user_id: parsed.id || 0,
        user_email: parsed.email || '',
        user_name: parsed.name || '',
      }
    } catch {
      return { user_id: 0, user_email: '', user_name: 'System' }
    }
  }

  const fetchSettings = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/settings')
      if (!res.ok) throw new Error('Failed to fetch settings')
      
      const json = await res.json()
      const fetchedSettings: SystemSetting[] = json.items || []

      const requiredSettings = [
        { key: 'system_timezone', value: 'Asia/Manila', description: 'System Timezone', type: 'string' },
        { key: 'auto_logout_enabled', value: 'true', description: 'Enable automatic logout', type: 'boolean' },
        { key: 'backup_frequency', value: 'daily', description: 'Database backup frequency', type: 'string' },
      ]

      const merged = [...fetchedSettings]
      for (const req of requiredSettings) {
        if (!merged.find(s => s.setting_key === req.key)) {
          merged.push({
            setting_key: req.key,
            setting_value: req.value,
            setting_description: req.description,
            setting_type: req.type,
          })
        }
      }

      setSettings(merged)
      setDbStatus('connected')
    } catch (error) {
      console.error('[Settings] Error fetching:', error)
      setDbStatus('error')
      toast({
        title: "Error",
        description: "Failed to load settings from database",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const checkDatabaseStatus = async () => {
    try {
      setDbStatus('loading')
      const res = await fetch('/api/status/database')
      const json = await res.json()
      
      if (json.connected) {
        setDbStatus('connected')
      } else {
        setDbStatus('error')
      }
    } catch {
      setDbStatus('error')
    }
  }

  // Check backup status
  const checkBackupStatus = async () => {
    try {
      setBackupStatus('loading')
      // Get last backup timestamp from settings or database
      const backupSetting = settings.find(s => s.setting_key === 'last_backup_at')
      if (backupSetting?.setting_value) {
        setLastBackup(backupSetting.setting_value)
        
        // Check if backup is recent (within 24 hours)
        const lastBackupDate = new Date(backupSetting.setting_value)
        const hoursSinceBackup = (Date.now() - lastBackupDate.getTime()) / (1000 * 60 * 60)
        
        if (hoursSinceBackup < 24) {
          setBackupStatus('connected')
        } else if (hoursSinceBackup < 48) {
          setBackupStatus('loading') // Yellow - warning
        } else {
          setBackupStatus('error') // Red - overdue
        }
      } else {
        setBackupStatus('loading') // Yellow - no backup recorded
      }
    } catch {
      setBackupStatus('error')
    }
  }

  const fetchBackups = async () => {
    try {
      const res = await fetch('/api/settings/backup', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Failed to load backups')
      const dir = String(json?.backup_dir || '')
      setBackupDir(dir)
      setBackupDirDraft((prev) => (prev ? prev : dir))
      const list = Array.isArray(json?.backups) ? json.backups : []
      setAvailableBackups(list)
      if (!selectedBackupFile && list[0]?.file_name) {
        setSelectedBackupFile(String(list[0].file_name))
      }
    } catch (e) {
      // best-effort; restore-by-file is optional
    }
  }

  useEffect(() => {
    fetchSettings()
    checkDatabaseStatus()
    fetchBackups()
  }, [])

  useEffect(() => {
    if (settings.length > 0) {
      checkBackupStatus()
    }
  }, [settings])

  const handleSettingChange = (settingKey: string, newValue: string) => {
    setSettings((prev) =>
      prev.map((setting) => (setting.setting_key === settingKey ? { ...setting, setting_value: newValue } : setting)),
    )
  }

  const handleBackupNow = async () => {
    setBackupStatus('loading')
    try {
      const res = await fetch('/api/settings/backup', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || 'Backup request failed')
      }

      if (json?.backup_at) {
        setLastBackup(String(json.backup_at))
      }

      setBackupStatus('connected')
      toast({
        title: "Backup Completed",
        description: `Database backup created successfully (${json?.file_name || 'file saved'})`,
      })
      await fetchSettings()
      await fetchBackups()
    } catch (error) {
      setBackupStatus('error')
      toast({
        title: "Backup Failed",
        description: error instanceof Error ? error.message : "Failed to create database backup",
        variant: "destructive",
      })
    }
  }

  const handleBackupWithChooseLocation = async () => {
    if (typeof window === 'undefined') return

    const anyWin = window as any
    if (typeof anyWin?.showSaveFilePicker !== 'function') {
      toast({
        title: 'Not supported in this browser',
        description: 'Please use the "Download backup file" button after creating a backup, or use Edge/Chrome for Choose Location.',
        variant: 'destructive',
      })
      return
    }

    setIsCreatingBackupWithPicker(true)
    setBackupStatus('loading')
    try {
      // 1) Create backup on server
      const createRes = await fetch('/api/settings/backup', { method: 'POST' })
      const createJson = await createRes.json().catch(() => ({}))
      if (!createRes.ok) throw new Error(createJson?.error || 'Backup request failed')

      const fileName = String(createJson?.file_name || `backup_${Date.now()}.json`)
      if (createJson?.backup_at) setLastBackup(String(createJson.backup_at))

      // 2) Fetch backup bytes
      const downloadRes = await fetch(`/api/settings/backup?file=${encodeURIComponent(fileName)}`, { cache: 'no-store' })
      if (!downloadRes.ok) {
        const j = await downloadRes.json().catch(() => ({}))
        throw new Error((j as any)?.error || 'Download failed')
      }
      const blob = await downloadRes.blob()

      // 3) Ask user where to save
      const handle = await anyWin.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'JSON Backup', accept: { 'application/json': ['.json'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()

      setBackupStatus('connected')
      toast({ title: 'Backup completed', description: `Saved ${fileName} to your selected location.` })
      await fetchSettings()
      await fetchBackups()
    } catch (error: any) {
      setBackupStatus('error')
      // User canceled picker -> show soft message
      if (String(error?.name || '').toLowerCase().includes('abort')) {
        toast({ title: 'Save canceled', description: 'Backup file save was canceled.' })
        return
      }
      toast({
        title: 'Backup failed',
        description: error instanceof Error ? error.message : 'Failed to create and save backup',
        variant: 'destructive',
      })
    } finally {
      setIsCreatingBackupWithPicker(false)
    }
  }

  const handleRestoreNow = async () => {
    if (!selectedBackupFile) {
      toast({
        title: 'Restore Failed',
        description: 'Please select a backup first',
        variant: 'destructive',
      })
      return
    }

    setIsRestoring(true)
    try {
      const res = await fetch('/api/settings/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: selectedBackupFile }),
      })
      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(json?.error || 'Restore failed')
      }

      toast({
        title: 'Restore Completed',
        description: `Restored ${json?.restored_tables || 0} tables and ${json?.restored_rows || 0} rows`,
      })
    } catch (error) {
      toast({
        title: 'Restore Failed',
        description: error instanceof Error ? error.message : 'Failed to restore database backup',
        variant: 'destructive',
      })
    } finally {
      setIsRestoring(false)
    }
  }

  const handleSaveBackupDir = async () => {
    const nextDir = backupDirDraft.trim()
    if (!nextDir) {
      toast({ title: 'Invalid folder', description: 'Please enter a valid backup folder path.', variant: 'destructive' })
      return
    }
    try {
      const res = await fetch('/api/settings/backup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup_dir: nextDir }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Failed to update backup folder')
      setBackupDir(String(json?.backup_dir || nextDir))
      toast({ title: 'Backup folder updated', description: 'New backups will be saved to the updated location.' })
      await fetchBackups()
    } catch (error: any) {
      toast({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Failed to update backup folder',
        variant: 'destructive',
      })
    }
  }

  const handleDownloadBackup = async () => {
    if (!selectedBackupFile || selectedBackupFile === '__none__') return
    try {
      const res = await fetch(`/api/settings/backup?file=${encodeURIComponent(selectedBackupFile)}`, { cache: 'no-store' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as any)?.error || 'Download failed')
      }
      const blob = await res.blob()

      // Prefer a real "Save As" dialog when supported (Chromium).
      const anyWin = window as any
      if (typeof anyWin?.showSaveFilePicker === 'function') {
        const handle = await anyWin.showSaveFilePicker({
          suggestedName: selectedBackupFile,
          types: [{ description: 'JSON Backup', accept: { 'application/json': ['.json'] } }],
        })
        const writable = await handle.createWritable()
        await writable.write(blob)
        await writable.close()
        toast({ title: 'Downloaded', description: `Saved ${selectedBackupFile}` })
        return
      }

      // Fallback: browser download (location controlled by user/browser settings).
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = selectedBackupFile
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (error: any) {
      toast({
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'Unable to download backup file',
        variant: 'destructive',
      })
    }
  }

  const getStatusIndicator = (status: StatusType) => {
    switch (status) {
      case 'connected':
        return {
          color: 'bg-green-500',
          icon: CheckCircle,
          text: 'Connected',
          textColor: 'text-green-600 dark:text-green-400'
        }
      case 'loading':
        return {
          color: 'bg-yellow-500',
          icon: Loader2,
          text: 'Checking...',
          textColor: 'text-yellow-600 dark:text-yellow-400'
        }
      case 'error':
        return {
          color: 'bg-red-500',
          icon: AlertCircle,
          text: 'Disconnected',
          textColor: 'text-red-600 dark:text-red-400'
        }
    }
  }

  const dbIndicator = getStatusIndicator(dbStatus)
  const backupIndicator = getStatusIndicator(backupStatus)

  return (
    <div className="space-y-4 sm:space-y-6 animate-fadeInUp px-4 sm:px-6 py-4 sm:py-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Backup &amp; Restore</h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 mt-1">
            Manage database backups and restore points for recovery when something fails.
          </p>
        </div>
      </div>

      {/* System Status Card */}
      <Card className="group relative overflow-hidden bg-linear-to-br from-white to-green-50/50 dark:from-gray-800 dark:to-green-950/20 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg transition-all duration-300">
        <div className="absolute inset-0 bg-linear-to-br from-green-500/0 to-transparent group-hover:from-green-500/5 group-hover:to-emerald-500/5 transition-all duration-500"></div>
        <CardHeader className="relative p-4 sm:p-6">
          <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-lg sm:text-xl">
            <div className="p-1.5 sm:p-2 rounded-lg bg-green-100 dark:bg-green-900/30 shadow-sm">
              <Server className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
            </div>
            System Status
          </CardTitle>
        </CardHeader>
        <CardContent className="relative p-4 sm:p-6 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {/* Database Status */}
            <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg bg-white/50 dark:bg-gray-700/30">
              <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0", dbIndicator.color, dbStatus === 'loading' && 'animate-pulse')}></div>
              <div className="flex-1 min-w-0">
                <p className="font-medium dark:text-gray-100 text-xs sm:text-sm">Database</p>
                <p className={cn("text-xs sm:text-sm font-medium", dbIndicator.textColor)}>{dbIndicator.text}</p>
              </div>
              <dbIndicator.icon className={cn("h-4 w-4 sm:h-5 sm:w-5 shrink-0", dbIndicator.textColor, dbStatus === 'loading' && 'animate-spin')} />
            </div>

            {/* Last Backup Status */}
            <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg bg-white/50 dark:bg-gray-700/30">
              <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0", backupIndicator.color, backupStatus === 'loading' && 'animate-pulse')}></div>
              <div className="flex-1 min-w-0">
                <p className="font-medium dark:text-gray-100 text-xs sm:text-sm">Last Backup</p>
                <p className={cn("text-xs sm:text-sm font-medium truncate", backupIndicator.textColor)}>
                  {lastBackup ? new Date(lastBackup).toLocaleDateString() : 'No backup'}
                </p>
              </div>
              <Database className={cn("h-4 w-4 sm:h-5 sm:w-5 shrink-0", backupIndicator.textColor)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Backup & Restore Module */}
      <Card className="group relative overflow-hidden bg-linear-to-br from-white to-blue-50/50 dark:from-gray-800 dark:to-blue-950/20 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg transition-all duration-300">
        <div className="absolute inset-0 bg-linear-to-br from-blue-500/0 to-transparent group-hover:from-blue-500/5 group-hover:to-cyan-500/5 transition-all duration-500"></div>
        <CardHeader className="relative p-4 sm:p-6">
          <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-lg sm:text-xl">
            <div className="p-1.5 sm:p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 shadow-sm">
              <Database className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
            </div>
            Backup & Restore
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Manage database backups and restore system data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6 relative p-4 sm:p-6 pt-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Backup Section */}
            <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600">
              <div className="flex items-center gap-2 mb-3">
                <Database className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <h3 className="font-semibold text-sm sm:text-base dark:text-gray-100">Create Backup</h3>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-4">
                Export a complete backup of the database including all tables, employees, attendance records, and system settings.
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Last Backup:</span>
                  <span className="font-medium dark:text-gray-100">
                    {lastBackup ? new Date(lastBackup).toLocaleString() : 'Never'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Frequency:</span>
                  <span className="font-medium dark:text-gray-100">
                    {settings.find(s => s.setting_key === 'backup_frequency')?.setting_value || 'Daily'}
                  </span>
                </div>
              </div>
              <Button 
                onClick={handleBackupNow} 
                disabled={backupStatus === 'loading' || isCreatingBackupWithPicker}
                className="w-full mt-4 btn-sti-primary h-10 text-sm"
              >
                {backupStatus === 'loading' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating Backup...
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4 mr-2" />
                    Create Backup Now
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleBackupWithChooseLocation}
                disabled={backupStatus === 'loading' || isCreatingBackupWithPicker}
                className="w-full mt-2 h-10 text-sm border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20"
              >
                {isCreatingBackupWithPicker ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating + Choosing Location...
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4 mr-2" />
                    Create Backup + Choose Location...
                  </>
                )}
              </Button>
            </div>

            {/* Restore Section */}
            <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600">
              <div className="flex items-center gap-2 mb-3">
                <RefreshCw className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                <h3 className="font-semibold text-sm sm:text-base dark:text-gray-100">Restore Database</h3>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-4">
                Restore the database from a previous backup file. This will replace all current data with the backup data.
              </p>
              <div className="p-3 rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 mb-4">
                <div className="flex gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-800 dark:text-yellow-200">
                    <strong>Warning:</strong> Restoring will overwrite all current data. Make sure to create a backup first.
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-600 dark:text-gray-400">Backup location (server)</Label>
                  <div className="text-[11px] sm:text-xs font-mono text-gray-700 dark:text-gray-200 rounded-md border border-gray-200 dark:border-gray-600 bg-white/60 dark:bg-gray-800/40 px-3 py-2 break-all">
                    {backupDir || 'Loading...'}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-gray-600 dark:text-gray-400">Change backup folder (server)</Label>
                  <div className="flex gap-2">
                    <Input
                      value={backupDirDraft}
                      onChange={(e) => setBackupDirDraft(e.target.value)}
                      placeholder="e.g. D:\\STIRAMS\\backups"
                      className="h-10 text-sm font-mono"
                    />
                    <Button type="button" variant="outline" className="h-10" onClick={handleSaveBackupDir}>
                      Save
                    </Button>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    This changes where the server stores backup files. Your system must have write permission to that folder.
                  </p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-gray-600 dark:text-gray-400">Select backup to restore</Label>
                  <Select value={selectedBackupFile} onValueChange={setSelectedBackupFile}>
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder="Select a backup..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {availableBackups.length === 0 ? (
                        <SelectItem value="__none__" disabled>No backups found</SelectItem>
                      ) : (
                        availableBackups.map((b) => (
                          <SelectItem key={b.file_name} value={b.file_name}>
                            {b.file_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  variant="outline"
                  disabled={!selectedBackupFile || selectedBackupFile === '__none__'}
                  onClick={handleDownloadBackup}
                  className="w-full h-10 text-sm border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                >
                  Download backup file
                </Button>
                <Button 
                  variant="outline"
                  disabled={isLoading || isRestoring || !selectedBackupFile || selectedBackupFile === '__none__'}
                  onClick={handleRestoreNow}
                  className="w-full h-10 text-sm border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                >
                  {isRestoring ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Restoring...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Restore from Backup
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Backup History */}
          <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              <h3 className="font-semibold text-sm sm:text-base dark:text-gray-100">Backup History</h3>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-4">
              Recent backup operations and system restore points
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-xs sm:text-sm dark:text-gray-100">
                    {lastBackup ? `Backup - ${new Date(lastBackup).toLocaleString()}` : 'No backups yet'}
                  </span>
                </div>
                {lastBackup && (
                  <Badge variant="outline" className="text-xs">Success</Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  )
}
