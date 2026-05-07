import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { dbQuery } from '@/lib/db'

export const dynamic = 'force-dynamic'

const DEFAULT_BACKUP_DIR = process.env.RAMS_BACKUP_DIR
  ? path.resolve(process.env.RAMS_BACKUP_DIR)
  : path.join(process.cwd(), 'backups', 'db')

async function ensureSettingsTable(): Promise<void> {
  // Some existing local DBs may have `system_settings` without a UNIQUE constraint on `setting_key`,
  // which breaks `ON CONFLICT (setting_key)`.
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_id SERIAL PRIMARY KEY,
      setting_key TEXT NOT NULL,
      setting_value TEXT NOT NULL DEFAULT '',
      setting_description TEXT,
      setting_type TEXT NOT NULL DEFAULT 'string',
      is_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
      updated_by INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await dbQuery(`
    DO $$
    BEGIN
      -- Ensure a unique constraint exists so ON CONFLICT(setting_key) is valid.
      IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
         WHERE t.relname = 'system_settings'
           AND c.contype = 'u'
           AND pg_get_constraintdef(c.oid) ILIKE '%(setting_key)%'
      ) THEN
        ALTER TABLE system_settings ADD CONSTRAINT system_settings_setting_key_key UNIQUE (setting_key);
      END IF;
    END $$;
  `)
}

function backupFileName(): string {
  const iso = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  return `backup_${iso}.json`
}

async function resolveBackupDir(): Promise<string> {
  try {
    await ensureSettingsTable()
    const rows = await dbQuery<{ setting_value: string }>(
      `SELECT setting_value
       FROM system_settings
       WHERE setting_key = 'backup_dir'
       LIMIT 1`
    )
    const raw = String(rows?.[0]?.setting_value || '').trim()
    if (raw) return path.resolve(raw)
  } catch {
    // best-effort; fall back
  }
  return DEFAULT_BACKUP_DIR
}

function safeTableName(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe table name in backup: ${name}`)
  }
  return name
}

async function ensureBackupDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

async function getPublicTables(): Promise<string[]> {
  const rows = await dbQuery<{ tablename: string }>(
    `SELECT tablename
     FROM pg_tables
     WHERE schemaname = 'public'
     ORDER BY tablename ASC`
  )
  return rows.map((r) => r.tablename).filter(Boolean)
}

export async function GET(req: NextRequest) {
  try {
    const backupDir = await resolveBackupDir()
    await ensureBackupDir(backupDir)

    const file = req.nextUrl.searchParams.get('file')
    if (file) {
      const normalized = path.basename(file)
      const target = path.join(backupDir, normalized)
      const content = await fs.readFile(target)

      return new NextResponse(content, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${normalized}"`,
        },
      })
    }

    const entries = await fs.readdir(backupDir, { withFileTypes: true })
    const files = await Promise.all(
      entries
        .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json'))
        .map(async (e) => {
          const fullPath = path.join(backupDir, e.name)
          const stat = await fs.stat(fullPath)
          return {
            file_name: e.name,
            size_bytes: stat.size,
            created_at: stat.birthtime.toISOString(),
            modified_at: stat.mtime.toISOString(),
          }
        })
    )

    files.sort((a, b) => +new Date(b.modified_at) - +new Date(a.modified_at))
    return NextResponse.json({
      backup_dir: backupDir,
      backups: files,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to read backups' }, { status: 500 })
  }
}

export async function POST() {
  try {
    const backupDir = await resolveBackupDir()
    await ensureBackupDir(backupDir)
    await ensureSettingsTable()

    const tables = await getPublicTables()
    const snapshot: Array<{ table: string; row_count: number; rows: any[] }> = []

    for (const tableName of tables) {
      const safe = safeTableName(tableName)
      const rows = await dbQuery(`SELECT * FROM "${safe}"`)
      snapshot.push({ table: safe, row_count: rows.length, rows })
    }

    const payload = {
      version: 1,
      created_at: new Date().toISOString(),
      source: 'local-postgresql',
      tables: snapshot,
    }

    const fileName = backupFileName()
    const fullPath = path.join(backupDir, fileName)
    await fs.writeFile(fullPath, JSON.stringify(payload, null, 2), 'utf8')

    await dbQuery(
      `INSERT INTO system_settings (setting_key, setting_value, setting_description, setting_type, updated_by, updated_at)
       VALUES ('last_backup_at', $1, 'Last successful backup timestamp', 'string', 0, NOW())
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
      [payload.created_at]
    )

    await dbQuery(
      `INSERT INTO system_settings (setting_key, setting_value, setting_description, setting_type, updated_by, updated_at)
       VALUES ('last_backup_file', $1, 'Last successful backup file', 'string', 0, NOW())
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
      [fileName]
    )

    return NextResponse.json({
      success: true,
      backup_at: payload.created_at,
      file_name: fileName,
      table_count: snapshot.length,
      total_rows: snapshot.reduce((acc, t) => acc + t.row_count, 0),
      backup_dir: backupDir,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Backup failed' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await ensureSettingsTable()
    const body = (await req.json().catch(() => ({}))) as { backup_dir?: string }
    const raw = String(body?.backup_dir || '').trim()
    if (!raw) {
      return NextResponse.json({ error: 'backup_dir is required' }, { status: 400 })
    }

    const resolved = path.resolve(raw)
    await ensureBackupDir(resolved)

    await dbQuery(
      `INSERT INTO system_settings (setting_key, setting_value, setting_description, setting_type, updated_by, updated_at)
       VALUES ('backup_dir', $1, 'Backup directory for server-side database snapshots', 'string', 0, NOW())
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
      [resolved]
    )

    return NextResponse.json({ success: true, backup_dir: resolved })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to update backup directory' }, { status: 500 })
  }
}
