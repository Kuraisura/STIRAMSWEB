import { NextRequest, NextResponse } from 'next/server'
import { processActiveSubstitutions } from '@/lib/substitution-handler'

export const dynamic = 'force-dynamic'

/**
 * GET /api/substitution/check-active
 * 
 * Checks all active substitutions for today and processes them:
 * - If original employee is still present after grace period, auto-mark them absent
 * - Create automatic OUT log at substitution start time
 * 
 * This should be called periodically via cron job (e.g., every 5-10 minutes)
 * Or can be manually triggered by admins
 */
export async function GET(request: NextRequest) {
  try {
    console.log('[Substitution Check] ==========================================')
    console.log('[Substitution Check] 🔍 Checking active substitutions...')
    console.log('[Substitution Check] Timestamp:', new Date().toISOString())
    console.log('[Substitution Check] ==========================================')

    // Process all active substitutions
    await processActiveSubstitutions()

    console.log('[Substitution Check] ✅ Finished checking active substitutions')

    return NextResponse.json({
      success: true,
      message: 'Active substitutions processed successfully',
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('[Substitution Check] ❌ Error processing substitutions:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to process active substitutions',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/substitution/check-active
 * 
 * Same as GET but allows manual triggering with optional parameters
 * Body: {
 *   substitutionId?: number (optional, to check specific substitution)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { substitutionId } = body

    console.log('[Substitution Check] ==========================================')
    console.log('[Substitution Check] 🔍 Manual substitution check triggered')
    if (substitutionId) {
      console.log('[Substitution Check] Specific substitution ID:', substitutionId)
    }
    console.log('[Substitution Check] Timestamp:', new Date().toISOString())
    console.log('[Substitution Check] ==========================================')

    if (substitutionId) {
      // Check specific substitution
      const { checkAndMarkOriginalEmployeeAbsent } = await import('@/lib/substitution-handler')
      const result = await checkAndMarkOriginalEmployeeAbsent(substitutionId)
      
      return NextResponse.json({
        success: true,
        message: result ? 'Original employee marked absent' : 'No action needed',
        substitutionId,
        markedAbsent: result,
        timestamp: new Date().toISOString()
      })
    } else {
      // Check all active substitutions
      await processActiveSubstitutions()
      
      return NextResponse.json({
        success: true,
        message: 'Active substitutions processed successfully',
        timestamp: new Date().toISOString()
      })
    }
  } catch (error: any) {
    console.error('[Substitution Check] ❌ Error processing substitution:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to process substitution',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

