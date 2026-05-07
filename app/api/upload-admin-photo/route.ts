import { NextResponse } from "next/server"
import { dbQuery } from "@/lib/db"

const DATA_URL_REGEX = /^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,(.+)$/i

class PhotoUploadService {
  private static instance: PhotoUploadService

  static getInstance(): PhotoUploadService {
    if (!PhotoUploadService.instance) {
      PhotoUploadService.instance = new PhotoUploadService()
    }
    return PhotoUploadService.instance
  }

  private validateImageDataUrl(imageDataUrl: string) {
    const match = imageDataUrl.match(DATA_URL_REGEX)
    if (!match) {
      throw new Error("Invalid image data URL")
    }
    return match
  }

  private normalizeMime(mime: string) {
    return mime.toLowerCase() === 'image/jpg' ? 'image/jpeg' : mime.toLowerCase()
  }

  private async ensurePhotoTable() {
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

  async uploadAdminPhoto(adminId: number, imageDataUrl: string) {
    console.log("[UploadPhoto] Upload request received for admin:", adminId)

    if (!adminId || !imageDataUrl || typeof imageDataUrl !== 'string') {
      throw new Error("Invalid payload")
    }

    const match = this.validateImageDataUrl(imageDataUrl)
    const mime = this.normalizeMime(match[1])
    const base64 = match[2]
    const buffer = Buffer.from(base64, 'base64')

    if (!buffer.length) {
      throw new Error("Empty image payload")
    }

    await this.ensurePhotoTable()

    await dbQuery(
      `
      INSERT INTO profile_photos (entity_type, entity_id, mime_type, image_data, updated_at)
      VALUES ('admin', $1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (entity_type, entity_id)
      DO UPDATE SET
        mime_type = EXCLUDED.mime_type,
        image_data = EXCLUDED.image_data,
        updated_at = CURRENT_TIMESTAMP
      `,
      [adminId, mime, buffer]
    )

    const photoUrl = `/api/photos/admin/${adminId}?v=${Date.now()}`

    await dbQuery(
      `UPDATE admin_users SET photo_path = $2 WHERE id = $1`,
      [adminId, photoUrl]
    )

    console.log("[UploadPhoto] Photo uploaded successfully:", photoUrl)
    return { path: photoUrl }
  }
}

export async function POST(req: Request) {
  try {
    const photoUploadService = PhotoUploadService.getInstance()
    const body = await req.json().catch(() => null) as { adminId?: number; imageDataUrl?: string }
    const { adminId, imageDataUrl } = body

    const result = await photoUploadService.uploadAdminPhoto(adminId!, imageDataUrl!)
    return NextResponse.json(result)
  } catch (e: any) {
    console.error("[UploadPhoto] Upload error:", e)
    return NextResponse.json({ error: e?.message || 'Upload failed' }, { status: 500 })
  }
}


