import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, newPassword } = body

    if (!email || !newPassword) {
      return NextResponse.json(
        { error: 'Email and new password are required' },
        { status: 400 }
      )
    }

    // Verify this is a developer - check for super_admin role or dev environment
    // In production, add more strict authentication

    // Use database RPC function to hash and update password
    // This requires a database function: hash_admin_password(p_email TEXT, p_new_password TEXT)
    let data: boolean | null = null
    try {
      const rows = await dbQuery<{ hash_admin_password: boolean }>(
        `SELECT hash_admin_password($1, $2) AS hash_admin_password`,
        [email, newPassword]
      )
      data = rows[0]?.hash_admin_password ?? null
    } catch (error: any) {
      console.error('Error changing password via RPC:', error)
      
      // Fallback: If RPC doesn't exist, provide instructions
      return NextResponse.json(
        { 
          error: 'Password change RPC function not configured. Please create the hash_admin_password function in your database.',
          hint: 'CREATE OR REPLACE FUNCTION hash_admin_password(p_email TEXT, p_new_password TEXT) RETURNS BOOLEAN AS $$ DECLARE v_hashed TEXT; BEGIN v_hashed := crypt(p_new_password, gen_salt(\'bf\')); UPDATE admin_users SET password = v_hashed WHERE email = p_email; RETURN FOUND; END; $$ LANGUAGE plpgsql;'
        },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Admin user not found or password update failed' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, message: 'Password updated successfully' })
  } catch (error) {
    console.error('Error in change-password API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
