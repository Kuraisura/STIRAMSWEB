import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'
import { recordLogTrailChange } from '@/lib/audit'
import { validateSession } from '@/lib/session-manager'

export const dynamic = 'force-dynamic'

async function ensureSettingsTable(): Promise<void> {
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_id SERIAL PRIMARY KEY,
      setting_key TEXT NOT NULL UNIQUE,
      setting_value TEXT NOT NULL DEFAULT '',
      setting_description TEXT,
      setting_type TEXT NOT NULL DEFAULT 'string',
      is_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
      updated_by INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

async function resolveActor(req: NextRequest): Promise<{ user_id?: number; user_email?: string; user_name?: string }> {
  try {
    const session = await validateSession(req)
    if (session.valid && session.user) {
      return {
        user_id: session.user.id,
        user_email: session.user.email,
        user_name: session.user.name,
      }
    }
  } catch {
    // best-effort fallback
  }

  const id = Number(req.headers.get('x-user-id') || '') || 0
  const email = req.headers.get('x-user-email') || 'system@rams'
  const name = req.headers.get('x-user-name') || 'System'
  return { user_id: id, user_email: email, user_name: name }
}

export async function GET() {
  try {
    await ensureSettingsTable()
    const rows = await dbQuery(
      `SELECT setting_id, setting_key, setting_value, setting_description, setting_type,
              is_encrypted, updated_by, updated_at, created_at
       FROM system_settings
       ORDER BY setting_key`
    )
    return NextResponse.json({ items: rows || [] })
  } catch (e: any) {
    console.error('[Settings API] Error:', e)
    return NextResponse.json({ error: e?.message || 'Failed to load settings' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureSettingsTable()

    const body = await req.json()
    const settingKey = String(body?.setting_key || '').trim()
    const settingValue = body?.setting_value == null ? '' : String(body.setting_value)

    if (!settingKey) {
      return NextResponse.json({ error: 'setting_key is required' }, { status: 400 })
    }

    const actor = await resolveActor(req)

    const oldRows = await dbQuery<{ setting_value: string }>(
      'SELECT setting_value FROM system_settings WHERE setting_key = $1 LIMIT 1',
      [settingKey]
    )

    const updatedRows = await dbQuery(
      `INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value,
                     updated_by = EXCLUDED.updated_by,
                     updated_at = NOW()
       RETURNING *`,
      [settingKey, settingValue, actor.user_id || 0]
    )

    try {
      await recordLogTrailChange({
        actor,
        action: 'settings_updated',
        table: 'system_settings',
        recordId: settingKey,
        oldValue: { [settingKey]: oldRows[0]?.setting_value ?? null },
        newValue: { [settingKey]: settingValue },
      })
    } catch {
      // best-effort audit
    }

    return NextResponse.json({ item: updatedRows[0] })
  } catch (e: any) {
    console.error('[Settings API] Update error:', e)
    return NextResponse.json({ error: e?.message || 'Failed to update setting' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSettingsTable()

    const body = await req.json()
    const settingKey = String(body?.setting_key || '').trim()
    const settingValue = body?.setting_value == null ? '' : String(body.setting_value)
    const settingDescription = body?.setting_description == null ? null : String(body.setting_description)
    const settingType = body?.setting_type == null ? 'string' : String(body.setting_type)

    if (!settingKey) {
      return NextResponse.json({ error: 'setting_key is required' }, { status: 400 })
    }

    const actor = await resolveActor(req)

    const rows = await dbQuery(
      `INSERT INTO system_settings (
        setting_key, setting_value, setting_description,
        setting_type, is_encrypted, updated_by, updated_at
      ) VALUES ($1, $2, $3, $4, FALSE, $5, NOW())
      ON CONFLICT (setting_key)
      DO UPDATE SET setting_value = EXCLUDED.setting_value,
                    setting_description = COALESCE(EXCLUDED.setting_description, system_settings.setting_description),
                    setting_type = COALESCE(EXCLUDED.setting_type, system_settings.setting_type),
                    updated_by = EXCLUDED.updated_by,
                    updated_at = NOW()
      RETURNING *`,
      [settingKey, settingValue, settingDescription, settingType, actor.user_id || 0]
    )

    return NextResponse.json({ item: rows[0] })
  } catch (e: any) {
    console.error('[Settings API] Create error:', e)
    return NextResponse.json({ error: e?.message || 'Failed to create setting' }, { status: 500 })
  }
}
