/**
 * Script to hash Lara Mae Rayos' password.
 *
 * Run:
 * npx tsx scripts/hash-lara-password.ts
 */

import * as bcrypt from 'bcryptjs'
import { dbQuery } from '../lib/db'

async function hashLaraPassword() {
  try {
    const email = 'lara.rayos@santarosa.sti.edu'
    const plainPassword = 'admin123'

    console.log(`[Hash Password] Looking for admin user: ${email}`)

    const existing = await dbQuery<any>(
      `SELECT id, email, full_name, password_hash
       FROM admin_users
       WHERE email = $1
       LIMIT 1`,
      [email]
    )

    if (!existing[0]) {
      console.error('[Hash Password] Admin user not found')
      console.error('Make sure Lara Mae Rayos exists in the admin_users table with the correct email')
      process.exit(1)
    }

    const adminUser = existing[0]

    console.log(`[Hash Password] Found user: ${adminUser.full_name} (ID: ${adminUser.id})`)
    console.log(`[Hash Password] Current password_hash: ${adminUser.password_hash ? '[SET]' : '[NULL]'}`)

    console.log(`[Hash Password] Hashing password: ${plainPassword}`)
    const hashedPassword = await bcrypt.hash(plainPassword, 10)
    console.log(`[Hash Password] Hashed password: ${hashedPassword.substring(0, 20)}...`)

    console.log('[Hash Password] Updating password_hash in database...')
    const updated = await dbQuery<any>(
      `UPDATE admin_users
       SET password_hash = $1,
           updated_at = $2
       WHERE email = $3
       RETURNING id, email, full_name`,
      [hashedPassword, new Date().toISOString(), email]
    )

    if (!updated[0]) {
      console.error('[Hash Password] Failed to update password hash')
      process.exit(1)
    }

    console.log(`[Hash Password] Successfully updated password for ${updated[0].full_name}`)
    console.log(`[Hash Password] Email: ${updated[0].email}`)
    console.log(`[Hash Password] Password: ${plainPassword}`)
    console.log(`[Hash Password] Hash: ${hashedPassword.substring(0, 30)}...`)
  } catch (error: any) {
    console.error('[Hash Password] Unexpected error:', error)
    process.exit(1)
  }
}

hashLaraPassword()
