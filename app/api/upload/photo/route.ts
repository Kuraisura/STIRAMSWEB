import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

const DATA_URL_REGEX = /^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,(.+)$/i

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

export async function POST(request: Request) {
  try {
    const { imageBase64, employeeId } = await request.json()

    if (!imageBase64 || !employeeId) {
      return NextResponse.json(
        { error: 'Missing required fields: imageBase64 or employeeId' },
        { status: 400 }
      )
    }

    const employeeIdNum = Number(employeeId)
    if (!Number.isInteger(employeeIdNum) || employeeIdNum <= 0) {
      return NextResponse.json(
        { error: 'employeeId must be a valid positive integer' },
        { status: 400 }
      )
    }

    const match = String(imageBase64).match(DATA_URL_REGEX)
    if (!match) {
      return NextResponse.json(
        { error: 'Invalid image format. Expected a base64 image data URL.' },
        { status: 400 }
      )
    }

    const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase()
    const buffer = Buffer.from(match[2], 'base64')

    if (!buffer.length) {
      return NextResponse.json(
        { error: 'Empty image data.' },
        { status: 400 }
      )
    }

    await ensurePhotoTable()

    await dbQuery(
      `
      INSERT INTO profile_photos (entity_type, entity_id, mime_type, image_data, updated_at)
      VALUES ('employee', $1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (entity_type, entity_id)
      DO UPDATE SET
        mime_type = EXCLUDED.mime_type,
        image_data = EXCLUDED.image_data,
        updated_at = CURRENT_TIMESTAMP
      `,
      [employeeIdNum, mimeType, buffer]
    )

    const photoUrl = `/api/photos/employee/${employeeIdNum}?v=${Date.now()}`

    // Keep photo_path in the employees table aligned with the DB-backed URL.
    await dbQuery(
      `UPDATE employees SET photo_path = $2, updated_at = CURRENT_TIMESTAMP WHERE employee_id = $1`,
      [employeeIdNum, photoUrl]
    )

    return NextResponse.json({ url: photoUrl })
  } catch (error: any) {
    console.error('API Error in DB photo upload:', error)
    return NextResponse.json(
      { error: error.message || 'Database upload failed' },
      { status: 500 }
    )
  }
}
