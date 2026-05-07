/**
 * API Endpoint: Audit Log
 * Comprehensive logging for all system activities
 */

import { NextRequest, NextResponse } from 'next/server'
import { recordLogTrailChange, getAuditContext } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { actor, action, table, recordId, oldValue, newValue, changes, extra, description } = body

    // Get context information (IP, user agent, device info)
    const context = getAuditContext(request)

    // Record the audit log
    await recordLogTrailChange({
      actor,
      action,
      table,
      recordId,
      oldValue,
      newValue,
      changes,
      extra,
      context,
      description
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Audit Log API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to log audit event', details: error.message },
      { status: 500 }
    )
  }
}
