import { NextRequest } from 'next/server'
import { createNotificationStream } from '@/lib/notification-stream'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const recipientType = (request.nextUrl.searchParams.get('recipient_type') || '').trim() || undefined
  const recipientIdRaw = request.nextUrl.searchParams.get('recipient_id')
  const recipientId = recipientIdRaw !== null && recipientIdRaw !== '' ? Number(recipientIdRaw) : undefined

  const stream = createNotificationStream({
    recipientType,
    recipientId: Number.isFinite(recipientId as number) ? (recipientId as number) : undefined,
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
