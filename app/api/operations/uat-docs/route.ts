import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic'

const DOC_MAP: Record<string, { fileName: string; contentType: string }> = {
  csv: {
    fileName: 'PRODUCTION_UAT_MATRIX.csv',
    contentType: 'text/csv; charset=utf-8',
  },
  md: {
    fileName: 'PRODUCTION_UAT_MATRIX.md',
    contentType: 'text/markdown; charset=utf-8',
  },
  runbook: {
    fileName: 'PRODUCTION_OPERATIONS_RUNBOOK.md',
    contentType: 'text/markdown; charset=utf-8',
  },
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const format = String(searchParams.get('format') || 'csv').toLowerCase()
    const doc = DOC_MAP[format]

    if (!doc) {
      return NextResponse.json(
        { error: "Invalid format. Use 'csv', 'md', or 'runbook'." },
        { status: 400 }
      )
    }

    const absolutePath = path.join(process.cwd(), doc.fileName)
    const content = await readFile(absolutePath)

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': doc.contentType,
        'Content-Disposition': `inline; filename="${doc.fileName}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: any) {
    console.error('[GET /api/operations/uat-docs] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to load UAT document' },
      { status: 500 }
    )
  }
}
