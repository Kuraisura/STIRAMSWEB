import { NextRequest, NextResponse } from 'next/server'
import { performFullSync } from '@/lib/cloud-sync'
import backgroundSyncService from '@/lib/background-sync'

let isInitialized = false

async function ensureInitialized() {
  isInitialized = true
}

export async function GET(request: NextRequest) {
  try {
    console.log("[Local Status] Getting local-only status")
    await ensureInitialized()
    
    const status = await backgroundSyncService.getStatus()
    
    return NextResponse.json({
      success: true,
      data: status
    })
  } catch (error) {
    console.error('[Local Status] Error getting local-only status:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get local-only status' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized()
    const body = await request.json()
    const { action } = body
    console.log("[Local Status] Action requested:", action)

    switch (action) {
      case 'sync':
        console.log('[Local Status] Manual transfer requested in local-only mode')
        const result = { success: true, skipped: true, message: 'Local-only mode: no transfer needed.' }
        
        if (result.success) {
          console.log('[Local Status] Manual transfer request handled')
          return NextResponse.json({
            success: true,
            message: result.message,
            data: result
          })
        } else {
          console.error('[Local Status] Manual transfer failed:', (result as any).error)
          return NextResponse.json(
            { success: false, error: (result as any).error || 'Operation failed' },
            { status: 500 }
          )
        }

      case 'force-sync':
        console.log('[Local Status] Forced transfer requested in local-only mode')
        const forceResult = await performFullSync()
        
        if (forceResult.success) {
          console.log('[Local Status] Forced transfer request handled')
          return NextResponse.json({
            success: true,
            message: 'Local-only mode: transfer skipped.',
            data: forceResult
          })
        } else {
          console.error('[Local Status] Forced transfer operation failed')
          return NextResponse.json(
            { success: false, error: 'Operation failed' },
            { status: 500 }
          )
        }

      case 'status':
        const status = await backgroundSyncService.getStatus()
        return NextResponse.json({
          success: true,
          data: status
        })

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action. Use "sync", "force-sync", or "status".' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Local Status] Error in local-only API:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process local-only request' },
      { status: 500 }
    )
  }
} 
