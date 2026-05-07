const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf8')

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const idx = line.indexOf('=')
    if (idx <= 0) continue

    const key = line.slice(0, idx).trim()
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue

    let value = line.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

function preloadEnv() {
  const root = path.resolve(__dirname, '..')
  loadEnvFile(path.join(root, '.env'))
  loadEnvFile(path.join(root, '.env.local'))
}

preloadEnv()

function getPool() {
  const connectionString = process.env.DATABASE_URL || ''

  if (connectionString) {
    return new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  }

  return new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'stirams',
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  })
}

function toPositiveInt(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.floor(n)
}

async function queryRecentActivity(pool, limit) {
  const rows = await pool.query(
    `SELECT
      created_at,
      user_name,
      user_email,
      action_type,
      table_name,
      ip_address,
      device_platform,
      device_browser,
      description
     FROM log_trail
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  )

  console.log(`\n[Monitoring] Recent activity (last ${limit})`)
  console.table(
    rows.rows.map((r) => ({
      time: new Date(r.created_at).toLocaleString(),
      user: r.user_name || 'Unknown',
      email: r.user_email || 'Unknown',
      action: r.action_type || '-',
      table: r.table_name || '-',
      ip: r.ip_address || '-',
      device: `${r.device_platform || 'Unknown'} / ${r.device_browser || 'Unknown'}`,
      note: r.description || '-',
    }))
  )
}

async function queryPastDevices(pool, days) {
  const rows = await pool.query(
    `SELECT
      COALESCE(user_email, 'unknown') AS user_email,
      COALESCE(ip_address, 'unknown') AS ip_address,
      COALESCE(device_platform, 'Unknown') AS device_platform,
      COALESCE(device_browser, 'Unknown') AS device_browser,
      MIN(created_at) AS first_seen,
      MAX(created_at) AS last_seen,
      COUNT(*)::int AS events
     FROM log_trail
     WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
     GROUP BY user_email, ip_address, device_platform, device_browser
     ORDER BY last_seen DESC
     LIMIT 200`,
    [days]
  )

  console.log(`\n[Monitoring] Devices seen in past ${days} day(s)`)
  console.table(
    rows.rows.map((r) => ({
      user: r.user_email,
      ip: r.ip_address,
      platform: r.device_platform,
      browser: r.device_browser,
      first_seen: r.first_seen ? new Date(r.first_seen).toLocaleString() : '-',
      last_seen: r.last_seen ? new Date(r.last_seen).toLocaleString() : '-',
      events: r.events,
    }))
  )
}

async function queryActiveSessions(pool, limit) {
  const rows = await pool.query(
    `SELECT
      session_id,
      user_name,
      user_email,
      user_role,
      ip_address,
      user_agent,
      last_active_at,
      expires_at
     FROM sessions
     WHERE is_revoked = FALSE
       AND expires_at > NOW()
     ORDER BY last_active_at DESC
     LIMIT $1`,
    [limit]
  )

  console.log(`\n[Monitoring] Active sessions (top ${limit})`)
  console.table(
    rows.rows.map((r) => ({
      session: String(r.session_id || '').slice(0, 10) + '...',
      user: r.user_name || 'Unknown',
      email: r.user_email || 'Unknown',
      role: r.user_role || '-',
      ip: r.ip_address || '-',
      device: (r.user_agent || '').slice(0, 70),
      last_active: r.last_active_at ? new Date(r.last_active_at).toLocaleString() : '-',
      expires_at: r.expires_at ? new Date(r.expires_at).toLocaleString() : '-',
    }))
  )
}

async function queryFailedLogins(pool, days, limit) {
  const rows = await pool.query(
    `SELECT
      created_at,
      user_email,
      ip_address,
      device_platform,
      device_browser,
      description
     FROM log_trail
     WHERE action_type = 'login_failed'
       AND created_at >= NOW() - ($1::int * INTERVAL '1 day')
     ORDER BY created_at DESC
     LIMIT $2`,
    [days, limit]
  )

  console.log(`\n[Monitoring] Failed logins in past ${days} day(s) (max ${limit})`)
  console.table(
    rows.rows.map((r) => ({
      time: r.created_at ? new Date(r.created_at).toLocaleString() : '-',
      email: r.user_email || '-',
      ip: r.ip_address || '-',
      device: `${r.device_platform || 'Unknown'} / ${r.device_browser || 'Unknown'}`,
      details: r.description || '-',
    }))
  )
}

async function queryEmployeeActions(pool, limit) {
  const rows = await pool.query(
    `SELECT
      created_at,
      user_name,
      user_email,
      action_type,
      table_name,
      record_id,
      ip_address,
      device_platform,
      device_browser,
      COALESCE(metadata->>'session_id', '-') AS session_id,
      description
     FROM log_trail
     WHERE table_name = 'employees'
        OR action_type LIKE 'employee:%'
        OR action_type IN ('create:employees', 'update:employees', 'delete:employees')
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  )

  console.log(`\n[Monitoring] Employee actions (last ${limit})`)
  console.table(
    rows.rows.map((r) => ({
      time: r.created_at ? new Date(r.created_at).toLocaleString() : '-',
      user: r.user_name || 'Unknown',
      email: r.user_email || 'Unknown',
      action: r.action_type || '-',
      table: r.table_name || '-',
      record: r.record_id || '-',
      session: r.session_id || '-',
      ip: r.ip_address || '-',
      device: `${r.device_platform || 'Unknown'} / ${r.device_browser || 'Unknown'}`,
      details: r.description || '-',
    }))
  )
}

async function queryTodayCompact(pool, limit) {
  const rows = await pool.query(
    `SELECT
      created_at,
      COALESCE(user_name, 'Unknown') AS user_name,
      COALESCE(action_type, '-') AS action_type,
      COALESCE(table_name, '-') AS table_name,
      COALESCE(ip_address::text, '-') AS ip_address,
      COALESCE(device_platform, 'Unknown') AS device_platform,
      COALESCE(device_browser, 'Unknown') AS device_browser,
      COALESCE(description, '-') AS description
     FROM log_trail
     WHERE created_at >= date_trunc('day', NOW())
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  )

  console.log(`\n[Monitoring] Today compact feed (latest ${limit})`)
  for (const r of rows.rows) {
    const ts = r.created_at ? new Date(r.created_at).toLocaleTimeString() : '--:--:--'
    const device = `${r.device_platform}/${r.device_browser}`
    console.log(`[${ts}] ${r.user_name} | ${r.action_type} | ${r.table_name} | ${r.ip_address} | ${device} | ${r.description}`)
  }

  if (rows.rows.length === 0) {
    console.log('[Monitoring] No events found for today.')
  }
}

async function main() {
  const command = (process.argv[2] || 'help').toLowerCase()
  const pool = getPool()

  try {
    if (command === 'recent') {
      await queryRecentActivity(pool, toPositiveInt(process.argv[3], 30))
      return
    }

    if (command === 'devices') {
      await queryPastDevices(pool, toPositiveInt(process.argv[3], 30))
      return
    }

    if (command === 'sessions') {
      await queryActiveSessions(pool, toPositiveInt(process.argv[3], 30))
      return
    }

    if (command === 'failed-logins') {
      await queryFailedLogins(pool, toPositiveInt(process.argv[3], 7), toPositiveInt(process.argv[4], 50))
      return
    }

    if (command === 'employee-actions') {
      await queryEmployeeActions(pool, toPositiveInt(process.argv[3], 50))
      return
    }

    if (command === 'today-compact') {
      await queryTodayCompact(pool, toPositiveInt(process.argv[3], 40))
      return
    }

    console.log('\nMonitoring CLI Commands:')
    console.log('  node scripts/monitoring-console.js recent [limit]')
    console.log('  node scripts/monitoring-console.js devices [days]')
    console.log('  node scripts/monitoring-console.js sessions [limit]')
    console.log('  node scripts/monitoring-console.js failed-logins [days] [limit]')
    console.log('  node scripts/monitoring-console.js employee-actions [limit]')
    console.log('  node scripts/monitoring-console.js today-compact [limit]')
  } catch (err) {
    console.error('[Monitoring] Command failed:', err.message || err)
    process.exitCode = 1
  } finally {
    await pool.end().catch(() => {})
  }
}

main()
