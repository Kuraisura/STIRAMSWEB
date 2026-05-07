import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'
import { recordLogTrailChange, getAuditContext } from '@/lib/audit'
import { normalizeAcademicTermName, validateAcademicTermDatePolicy } from '@/lib/academic-term-policy'

// Helper to get user from request headers
function getUserFromRequest(request: NextRequest) {
  return {
    user_id: parseInt(request.headers.get('x-user-id') || '0'),
    user_email: request.headers.get('x-user-email') || 'unknown',
    user_name: request.headers.get('x-user-name') || 'Unknown User',
    user_type: 'admin' as const
  }
}

// GET - Fetch all academic terms
export async function GET(request: NextRequest) {
  try {
    const data = await dbQuery(
      `SELECT *
       FROM academic_terms
       ORDER BY academic_year DESC, start_date DESC`
    )

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('[API] Academic Terms GET exception:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Create new academic term
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { academic_year, term_name, start_date, end_date, is_active } = body
    const normalizedTermName = normalizeAcademicTermName(term_name)

    // Validate required fields
    if (!academic_year || !term_name || !start_date || !end_date) {
      return NextResponse.json(
        { error: 'Missing required fields: academic_year, term_name, start_date, end_date' },
        { status: 400 }
      )
    }

    if (!normalizedTermName) {
      return NextResponse.json(
        { error: 'term_name must be one of: 1st Term, 2nd Term, Summer' },
        { status: 400 }
      )
    }

    const policyValidation = validateAcademicTermDatePolicy({
      academicYear: academic_year,
      termName: normalizedTermName,
      startDate: start_date,
      endDate: end_date,
    })

    if (!policyValidation.valid) {
      return NextResponse.json({ error: policyValidation.error }, { status: 400 })
    }

    // If setting this term as active, deactivate all other terms
    if (is_active) {
      await dbQuery('UPDATE academic_terms SET is_active = FALSE')
    }

    // Insert new term
    const rows = await dbQuery(
      `INSERT INTO academic_terms (
        academic_year, term_name, start_date, end_date, is_active
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [academic_year, normalizedTermName, start_date, end_date, Boolean(is_active)]
    )
    const data = rows[0]

    // Log to audit trail
    try {
      const actor = getUserFromRequest(request)
      const context = getAuditContext(request)
      await recordLogTrailChange({
        actor,
        action: 'create:academic_term',
        table: 'academic_terms',
        recordId: data.id,
        newValue: data,
        context,
        description: `Created academic term: ${academic_year} - ${term_name}`
      })
    } catch (auditError) {
      console.error('[Audit] Failed to log academic term creation:', auditError)
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('[API] Academic Terms POST exception:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT - Update academic term
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, academic_year, term_name, start_date, end_date, is_active } = body
    const normalizedTermName = normalizeAcademicTermName(term_name)

    if (!id) {
      return NextResponse.json({ error: 'Term ID is required' }, { status: 400 })
    }

    if (!academic_year || !term_name || !start_date || !end_date) {
      return NextResponse.json(
        { error: 'Missing required fields: id, academic_year, term_name, start_date, end_date' },
        { status: 400 }
      )
    }

    if (!normalizedTermName) {
      return NextResponse.json(
        { error: 'term_name must be one of: 1st Term, 2nd Term, Summer' },
        { status: 400 }
      )
    }

    const policyValidation = validateAcademicTermDatePolicy({
      academicYear: academic_year,
      termName: normalizedTermName,
      startDate: start_date,
      endDate: end_date,
    })

    if (!policyValidation.valid) {
      return NextResponse.json({ error: policyValidation.error }, { status: 400 })
    }

    // Get old value for audit trail
    const oldRows = await dbQuery('SELECT * FROM academic_terms WHERE id = $1 LIMIT 1', [id])
    const oldData = oldRows[0]

    // If setting this term as active, deactivate all other terms
    if (is_active) {
      await dbQuery('UPDATE academic_terms SET is_active = FALSE WHERE id <> $1', [id])
    }

    // Update term
    const updatedRows = await dbQuery(
      `UPDATE academic_terms
       SET academic_year = $1,
           term_name = $2,
           start_date = $3,
           end_date = $4,
           is_active = $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [academic_year, normalizedTermName, start_date, end_date, is_active, id]
    )
    const data = updatedRows[0]

    if (!data) {
      return NextResponse.json({ error: 'Academic term not found' }, { status: 404 })
    }

    // Log to audit trail
    try {
      const actor = getUserFromRequest(request)
      const context = getAuditContext(request)
      await recordLogTrailChange({
        actor,
        action: 'update:academic_term',
        table: 'academic_terms',
        recordId: id,
        oldValue: oldData,
        newValue: data,
        context,
        description: `Updated academic term: ${academic_year} - ${term_name}`
      })
    } catch (auditError) {
      console.error('[Audit] Failed to log academic term update:', auditError)
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('[API] Academic Terms PUT exception:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Delete academic term
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Term ID is required' }, { status: 400 })
    }

    // Get old data for audit trail
    const termId = parseInt(id)
    const oldRows = await dbQuery('SELECT * FROM academic_terms WHERE id = $1 LIMIT 1', [termId])
    const oldData = oldRows[0]

    const deletedRows = await dbQuery('DELETE FROM academic_terms WHERE id = $1 RETURNING id', [termId])
    if (!deletedRows[0]) {
      return NextResponse.json({ error: 'Academic term not found' }, { status: 404 })
    }

    // Log to audit trail
    try {
      const actor = getUserFromRequest(request)
      const context = getAuditContext(request)
      await recordLogTrailChange({
        actor,
        action: 'delete:academic_term',
        table: 'academic_terms',
        recordId: termId,
        oldValue: oldData,
        context,
        description: `Deleted academic term: ${oldData?.academic_year || 'Unknown'} - ${oldData?.term_name || 'Unknown'}`
      })
    } catch (auditError) {
      console.error('[Audit] Failed to log academic term deletion:', auditError)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[API] Academic Terms DELETE exception:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
