import { NextRequest, NextResponse } from "next/server"
import { dbQuery } from "@/lib/db"

export async function POST(req: NextRequest) {
  try {
    const { email, plainPassword } = await req.json()

    if (!email || !plainPassword) {
      return NextResponse.json(
        { error: "Email and plain password are required" },
        { status: 400 }
      )
    }

    console.log("[Hash Password] Hashing password for:", email)
    
    // Try to use database RPC function first
    let hashedPassword: string | null = null
    
    try {
      const rows = await dbQuery<{ hash_admin_password: string }>(
        `SELECT hash_admin_password($1) AS hash_admin_password`,
        [plainPassword]
      )
      if (rows[0]?.hash_admin_password) {
        hashedPassword = rows[0].hash_admin_password
      }
    } catch (e) {
      console.warn('[Hash Password] RPC function not available')
    }
    
    // If RPC function doesn't work, use bcryptjs (requires package installation)
    if (!hashedPassword) {
      try {
        // Dynamic import to avoid build-time errors if package not installed
        const bcryptjs = require('bcryptjs')
        hashedPassword = await bcryptjs.hash(plainPassword, 10)
      } catch (e: any) {
        console.error('[Hash Password] bcryptjs error:', e)
        return NextResponse.json(
          { 
            error: "Password hashing failed. Please install bcryptjs: npm install bcryptjs @types/bcryptjs",
            details: e?.message || String(e)
          },
          { status: 500 }
        )
      }
    }

    const adminRows = await dbQuery<{ id: number; email: string; full_name: string }>(
      `SELECT id, email, full_name
       FROM admin_users
       WHERE email = $1
       LIMIT 1`,
      [email]
    )
    const adminUser = adminRows[0]

    if (!adminUser) {
      console.error("[Hash Password] Admin user not found")
      return NextResponse.json(
        { error: "Admin user not found with that email" },
        { status: 404 }
      )
    }

    try {
      await dbQuery(
        `UPDATE admin_users
         SET password_hash = $1
         WHERE email = $2`,
        [hashedPassword, email]
      )
    } catch (updateError: any) {
      console.error("[Hash Password] Database error:", updateError)
      return NextResponse.json(
        { error: `Failed to update password: ${updateError.message}` },
        { status: 500 }
      )
    }

    console.log("[Hash Password] Successfully updated password for:", adminUser.full_name)

    return NextResponse.json({
      success: true,
      message: `Password hashed and updated for ${adminUser.full_name}`,
      user: {
        id: adminUser.id,
        email: adminUser.email,
        full_name: adminUser.full_name
      }
    })
  } catch (error: any) {
    console.error("[Hash Password] Unexpected error:", error)
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred" },
      { status: 500 }
    )
  }
}

