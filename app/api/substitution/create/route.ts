import { NextRequest, NextResponse } from 'next/server'
import { createSubstitution, markVerificationAsProcessed } from '@/lib/substitution-handler'
import { parseISO } from 'date-fns'

export const dynamic = 'force-dynamic'

/**
 * POST /api/substitution/create
 * Body: {
 *   originalEmployeeId: number
 *   substituteEmployeeId: number
 *   substitutionDate: string (YYYY-MM-DD)
 *   startTime: string (HH:mm)
 *   endTime: string (HH:mm)
 *   verificationRequestId?: number
 *   gracePeriodMinutes?: number (default: 15)
 * }
 * 
 * Creates a substitution record and transfers schedules from original to substitute employee
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate required fields
    const {
      originalEmployeeId,
      substituteEmployeeId,
      substitutionDate,
      startTime,
      endTime,
      verificationRequestId,
      gracePeriodMinutes = 15
    } = body

    if (!originalEmployeeId || !substituteEmployeeId || !substitutionDate || !startTime || !endTime) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: originalEmployeeId, substituteEmployeeId, substitutionDate, startTime, endTime'
        },
        { status: 400 }
      )
    }

    // Validate that original and substitute are different
    if (originalEmployeeId === substituteEmployeeId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Original employee and substitute employee cannot be the same'
        },
        { status: 400 }
      )
    }

    console.log('[Substitution API] Creating substitution:', {
      originalEmployeeId,
      substituteEmployeeId,
      substitutionDate,
      startTime,
      endTime,
      verificationRequestId
    })

    // Create substitution and transfer schedules
    const substitutionId = await createSubstitution({
      originalEmployeeId,
      substituteEmployeeId,
      substitutionDate: parseISO(substitutionDate),
      startTime,
      endTime,
      verificationRequestId,
      gracePeriodMinutes
    })

    if (!substitutionId) {
      throw new Error('Failed to create substitution')
    }

    // If linked to a verification request, mark it as processed
    if (verificationRequestId) {
      await markVerificationAsProcessed(verificationRequestId, substitutionId)
    }

    console.log('[Substitution API] ✅ Substitution created successfully:', substitutionId)

    return NextResponse.json({
      success: true,
      substitutionId,
      message: 'Substitution created and schedules transferred successfully'
    })
  } catch (error: any) {
    console.error('[Substitution API] Error creating substitution:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to create substitution'
      },
      { status: 500 }
    )
  }
}

