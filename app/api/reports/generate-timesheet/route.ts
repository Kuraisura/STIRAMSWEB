import { NextRequest } from 'next/server'
import { generateFacultyTimesheetFromTemplate, type FacultyTimesheetData } from '@/lib/faculty-timesheet-template'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as FacultyTimesheetData
    const buf = await generateFacultyTimesheetFromTemplate(payload, true) as Buffer
    const filename = 'faculty-timesheet-filled.xlsx'
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    })
  } catch (e: any) {
    console.error('[generate-timesheet] error:', e?.message, e?.stack)
    return new Response(JSON.stringify({ success: false, error: 'Failed to generate timesheet' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}


