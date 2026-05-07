import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

type PhotoRow = {
  mime_type: string
  image_data: Buffer | string
}

const VALID_ENTITIES = new Set(['employee', 'admin'])

const PLACEHOLDER_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-label="No photo">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#334155"/>
      <stop offset="100%" stop-color="#475569"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="128" fill="url(#g)"/>
  <circle cx="128" cy="96" r="44" fill="#cbd5e1"/>
  <path d="M48 218c10-40 42-66 80-66s70 26 80 66" fill="#cbd5e1"/>
</svg>`

function placeholderResponse() {
  const bytes = Buffer.from(PLACEHOLDER_SVG, 'utf8')
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'public, max-age=300',
      'X-Photo-Placeholder': 'true',
    },
  })
}

async function ensurePhotoTable() {
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS profile_photos (
      photo_id BIGSERIAL PRIMARY KEY,
      entity_type VARCHAR(20) NOT NULL,
      entity_id INTEGER NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      image_data BYTEA NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_profile_photos_entity UNIQUE (entity_type, entity_id)
    )
  `)
}

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { entity: string; id: string } }
) {
  try {
    const entity = String(params.entity || '').toLowerCase()
    const id = Number(params.id)

    if (!VALID_ENTITIES.has(entity)) {
      return NextResponse.json({ error: 'Unsupported photo entity' }, { status: 400 })
    }
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid photo id' }, { status: 400 })
    }

    await ensurePhotoTable()

    const rows = await dbQuery<PhotoRow>(
      `SELECT mime_type, image_data FROM profile_photos WHERE entity_type = $1 AND entity_id = $2 LIMIT 1`,
      [entity, id]
    )

    if (!rows.length) return placeholderResponse()

    const row = rows[0]
    const bytes = (() => {
      if (Buffer.isBuffer(row.image_data)) return row.image_data

      const raw = String(row.image_data || '')
      if (!raw) return Buffer.alloc(0)

      // Postgres bytea is commonly returned as "\\xDEADBEEF..." (hex).
      if (raw.startsWith('\\x') || raw.startsWith('\\\\x')) {
        const hex = raw.replace(/^\\\\?x/i, '')
        return Buffer.from(hex, 'hex')
      }

      // Fallback: some drivers/serializers may return base64.
      return Buffer.from(raw, 'base64')
    })()

    if (!bytes.length) return placeholderResponse()

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': row.mime_type || 'image/jpeg',
        'Content-Length': String(bytes.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error: any) {
    console.error('[api/photos] Failed to load photo:', error)
    return placeholderResponse()
  }
}