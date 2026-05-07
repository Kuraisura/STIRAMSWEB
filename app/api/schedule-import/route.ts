import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST() {
  return NextResponse.json({ success: false, error: 'Schedule import is disabled. Please enter schedules manually.' }, { status: 410 })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('template')) {
    return new NextResponse('', { status: 204 })
  }
  return NextResponse.json({ ok: true, message: 'Schedule import is disabled.' })
}

