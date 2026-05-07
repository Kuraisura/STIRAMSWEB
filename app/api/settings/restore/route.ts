import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { pool } from '@/lib/db'
import { dbQuery } from '@/lib/db'

export const dynamic = 'force-dynamic'

const DEFAULT_BACKUP_DIR = process.env.RAMS_BACKUP_DIR
  ? path.resolve(process.env.RAMS_BACKUP_DIR)
  : path.join(process.cwd(), 'backups', 'db')

async function resolveBackupDir(): Promise<string> {
  try {
    const rows = await dbQuery<{ setting_value: string }>(
      `SELECT setting_value
       FROM system_settings
       WHERE setting_key = 'backup_dir'
       LIMIT 1`
    )
    const raw = String(rows?.[0]?.setting_value || '').trim()
    if (raw) return path.resolve(raw)
  } catch {
    // best-effort
  }
  return DEFAULT_BACKUP_DIR
}

type BackupPayload = {
  version: number
  created_at: string
  source: string
  tables: Array<{ table: string; row_count?: number; rows: Array<Record<string, any>> }>
}

function safeTableName(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe table name in restore: ${name}`)
  }
  return name
}

function safeColumnName(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe column name in restore: ${name}`)
  }
  return name
}

export async function POST(req: NextRequest) {
  const client = await pool.connect()

  try {
    const backupDir = await resolveBackupDir()
    const contentType = req.headers.get('content-type') || ''
    let parsed: BackupPayload | null = null
    let restoredFrom = 'uploaded-file'

    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({})) as { file_name?: string }
      const fileName = String(body?.file_name || '').trim()
      if (!fileName) {
        return NextResponse.json({ error: 'file_name is required' }, { status: 400 })
      }

      const normalized = path.basename(fileName)
      const target = path.join(backupDir, normalized)
      const text = await fs.readFile(target, 'utf8')
      parsed = JSON.parse(text) as BackupPayload
      restoredFrom = normalized
    } else {
      const form = await req.formData()
      const file = form.get('file')

      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'Backup file is required' }, { status: 400 })
      }

      const text = await file.text()
      parsed = JSON.parse(text) as BackupPayload
      restoredFrom = file.name
    }

    if (!parsed || !Array.isArray(parsed.tables)) {
      return NextResponse.json({ error: 'Invalid backup format' }, { status: 400 })
    }

    await client.query('BEGIN')

    let replicaRoleSet = false
    try {
      await client.query("SET LOCAL session_replication_role = replica")
      replicaRoleSet = true
    } catch {
      // If user is not superuser, continue without this optimization.
    }

    const tables = parsed.tables.map((t) => safeTableName(String(t.table || ''))).filter(Boolean)

    if (tables.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Backup has no tables to restore' }, { status: 400 })
    }

    await client.query(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`)

    let insertedRows = 0

    for (const tableEntry of parsed.tables) {
      const table = safeTableName(String(tableEntry.table || ''))
      const rows = Array.isArray(tableEntry.rows) ? tableEntry.rows : []
      if (rows.length === 0) continue

      for (const row of rows) {
        const columns = Object.keys(row).map((c) => safeColumnName(c))
        if (columns.length === 0) continue

        const values = columns.map((c) => row[c])
        const placeholders = columns.map((_, i) => `$${i + 1}`)

        const sql = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders.join(', ')})`
        await client.query(sql, values)
        insertedRows++
      }
    }

    if (replicaRoleSet) {
      await client.query("SET LOCAL session_replication_role = origin")
    }

    await client.query('COMMIT')

    return NextResponse.json({
      success: true,
      restored_tables: tables.length,
      restored_rows: insertedRows,
      restored_from: restoredFrom,
    })
  } catch (e: any) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore rollback errors
    }

    return NextResponse.json({
      error: e?.message || 'Restore failed',
    }, { status: 500 })
  } finally {
    client.release()
  }
}
