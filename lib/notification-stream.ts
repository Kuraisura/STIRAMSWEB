type NotificationStreamFilter = {
  recipientType?: string
  recipientId?: number | null
}

type NotificationStreamPayload = {
  type: string
  recipient_type?: string
  recipient_id?: number | null
  [key: string]: any
}

type StreamClient = {
  id: number
  filter: NotificationStreamFilter
  controller: ReadableStreamDefaultController<Uint8Array>
  heartbeat?: ReturnType<typeof setInterval>
}

type NotificationStreamState = {
  clients: Map<number, StreamClient>
  nextId: number
}

const encoder = new TextEncoder()

function getState(): NotificationStreamState {
  const g = globalThis as any
  if (!g.__ramsNotificationStreamState) {
    g.__ramsNotificationStreamState = {
      clients: new Map<number, StreamClient>(),
      nextId: 1,
    } as NotificationStreamState
  }
  return g.__ramsNotificationStreamState as NotificationStreamState
}

function formatSse(data: NotificationStreamPayload) {
  return `data: ${JSON.stringify(data)}\n\n`
}

function matchesFilter(filter: NotificationStreamFilter, payload: NotificationStreamPayload): boolean {
  if (filter.recipientType && payload.recipient_type && filter.recipientType !== payload.recipient_type) {
    return false
  }

  if (filter.recipientId !== undefined && filter.recipientId !== null) {
    if (payload.recipient_id === null || payload.recipient_id === undefined) {
      return true
    }
    return Number(payload.recipient_id) === Number(filter.recipientId)
  }

  return true
}

function removeClient(id: number) {
  const state = getState()
  const existing = state.clients.get(id)
  if (existing?.heartbeat) {
    clearInterval(existing.heartbeat)
  }
  state.clients.delete(id)
}

export function createNotificationStream(filter: NotificationStreamFilter = {}) {
  const state = getState()
  let clientId: number | null = null

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const id = state.nextId++
      clientId = id

      const client: StreamClient = {
        id,
        filter,
        controller,
      }

      client.heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(formatSse({ type: 'ping', ts: Date.now() })))
        } catch {
          removeClient(id)
        }
      }, 25000)

      state.clients.set(id, client)

      controller.enqueue(encoder.encode(formatSse({ type: 'connected', ts: Date.now() })))
    },
    cancel() {
      if (clientId !== null) {
        removeClient(clientId)
      }
    },
  })
}

export function publishNotificationEvent(payload: NotificationStreamPayload) {
  const state = getState()
  const framed = encoder.encode(formatSse(payload))

  for (const [id, client] of state.clients.entries()) {
    if (!matchesFilter(client.filter, payload)) continue

    try {
      client.controller.enqueue(framed)
    } catch {
      removeClient(id)
    }
  }
}
