import { dbQuery } from './db'

export type LogTrailActor = {
  user_id?: number
  user_email?: string
  user_name?: string
  user_type?: 'admin' | 'employee' | 'system'
}

export type AuditContext = {
  ip_address?: string
  user_agent?: string
  device_platform?: string
  device_browser?: string
}

/**
 * Get client information from request headers or browser
 * This should be called from API routes with the request object
 */
export function getAuditContext(request?: Request): AuditContext {
  const context: AuditContext = {}
  
  if (request) {
    // Extract IP address
    context.ip_address = 
      request.headers.get('x-forwarded-for')?.split(',')[0] ||
      request.headers.get('x-real-ip') ||
      'unknown'
    
    // Extract user agent
    const userAgent = request.headers.get('user-agent') || 'unknown'
    context.user_agent = userAgent
    
    // Parse device info from user agent
    if (userAgent !== 'unknown') {
      // Detect platform
      if (userAgent.includes('Windows')) context.device_platform = 'Windows'
      else if (userAgent.includes('Mac')) context.device_platform = 'macOS'
      else if (userAgent.includes('Linux')) context.device_platform = 'Linux'
      else if (userAgent.includes('Android')) context.device_platform = 'Android'
      else if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) context.device_platform = 'iOS'
      else context.device_platform = 'Unknown'
      
      // Detect browser
      if (userAgent.includes('Edge')) context.device_browser = 'Edge'
      else if (userAgent.includes('Chrome')) context.device_browser = 'Chrome'
      else if (userAgent.includes('Firefox')) context.device_browser = 'Firefox'
      else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) context.device_browser = 'Safari'
      else context.device_browser = 'Unknown'
    }
  }
  
  return context
}

export async function recordLogTrailChange(params: {
  actor?: LogTrailActor
  action: string
  table: string
  recordId?: number | string | null
  oldValue?: any
  newValue?: any
  changes?: Record<string, { old: any; new: any }>
  extra?: Record<string, any>
  context?: AuditContext
  description?: string
}) {
  const { actor, action, table, recordId, oldValue, newValue, changes, extra, context, description } = params
  try {
    const normalizedRecordId = Number(recordId)
    const logEntry = {
      user_id: actor?.user_id || 0,
      user_email: actor?.user_email || 'system@rams',
      user_name: actor?.user_name || 'System',
      user_type: actor?.user_type || 'system',
      action_type: action,
      table_name: table,
      record_id: Number.isFinite(normalizedRecordId) ? normalizedRecordId : null,
      old_value: oldValue ? JSON.stringify(oldValue) : null,
      new_value: newValue ? JSON.stringify(newValue) : null,
      description: description || generateDescription(action, table, recordId),
      ip_address: context?.ip_address || null,
      user_agent: context?.user_agent || null,
      device_platform: context?.device_platform || null,
      device_browser: context?.device_browser || null,
      metadata: JSON.stringify({
        changes: changes ?? computeDiff(oldValue, newValue),
        ...extra,
      }),
      created_at: new Date().toISOString(),
    }

    await dbQuery(
      `INSERT INTO log_trail (
        user_id,
        user_email,
        user_name,
        user_type,
        action_type,
        table_name,
        record_id,
        old_value,
        new_value,
        description,
        ip_address,
        user_agent,
        device_platform,
        device_browser,
        metadata,
        created_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,$15::jsonb,$16
      )`,
      [
        logEntry.user_id,
        logEntry.user_email,
        logEntry.user_name,
        logEntry.user_type,
        logEntry.action_type,
        logEntry.table_name,
        logEntry.record_id,
        logEntry.old_value,
        logEntry.new_value,
        logEntry.description,
        logEntry.ip_address,
        logEntry.user_agent,
        logEntry.device_platform,
        logEntry.device_browser,
        logEntry.metadata,
        logEntry.created_at,
      ]
    )
    console.log(`[Audit] Logged: ${action} on ${table}${recordId ? ` (${recordId})` : ''} by ${actor?.user_name || 'System'}`)
  } catch (err) {
    console.warn('[LogTrail] Failed to log:', err)
    // best-effort only
  }
}

/**
 * Generate a human-readable description for the log entry
 */
function generateDescription(action: string, table: string, recordId?: number | string | null): string {
  const actionParts = action.split(':')
  const verb = actionParts[0] || action
  const target = actionParts[1] || table
  
  const verbMap: Record<string, string> = {
    create: 'Created',
    update: 'Updated',
    delete: 'Deleted',
    login: 'Logged in',
    logout: 'Logged out',
    view: 'Viewed',
    export: 'Exported',
    import: 'Imported',
    approve: 'Approved',
    reject: 'Rejected',
    assign: 'Assigned',
    remove: 'Removed'
  }
  
  const readableVerb = verbMap[verb] || verb.charAt(0).toUpperCase() + verb.slice(1)
  const readableTable = target.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  
  if (recordId) {
    return `${readableVerb} ${readableTable} (ID: ${recordId})`
  }
  return `${readableVerb} ${readableTable}`
}

function computeDiff(oldVal: any, newVal: any) {
  if (!oldVal || !newVal) return undefined
  const diff: Record<string, { old: any; new: any }> = {}
  const keys = new Set<string>([...Object.keys(oldVal || {}), ...Object.keys(newVal || {})])
  for (const k of keys) {
    const o = (oldVal as any)[k]
    const n = (newVal as any)[k]
    if (JSON.stringify(o) !== JSON.stringify(n)) diff[k] = { old: o, new: n }
  }
  return diff
}


