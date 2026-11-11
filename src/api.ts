import { useEffect, useState } from 'react'
import type { Pace, PersonId, Session } from '../shared/types.ts'

const params = new URLSearchParams(location.search)

/** Everyone who opens the same ?s= value shares one session. */
export const SESSION_ID = params.get('s') ?? 'demo'

export const initialPerson: PersonId = params.get('as') === 'mia' ? 'mia' : 'roy'

const base = `/api/sessions/${encodeURIComponent(SESSION_ID)}`

/** Live session state. The server pushes the whole session on every change. */
export function useSession(): { session: Session | null; online: boolean } {
  const [session, setSession] = useState<Session | null>(null)
  const [online, setOnline] = useState(false)
  useEffect(() => {
    const source = new EventSource(`${base}/events`)
    source.onopen = () => setOnline(true)
    source.onerror = () => setOnline(false) // EventSource reconnects on its own and gets full state again
    source.onmessage = (event) => setSession(JSON.parse(event.data) as Session)
    return () => source.close()
  }, [])
  return { session, online }
}

async function post(path: string, body: Record<string, unknown> = {}): Promise<void> {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.ok) return
  const detail = (await res.json().catch(() => null)) as { error?: string } | null
  throw new Error(detail?.error ?? `Request failed (${res.status})`)
}

export const api = {
  start: (goal: string, by: PersonId) => post('/start', { goal, by }),
  say: (text: string, by: PersonId) => post('/messages', { text, by }),
  steerNow: (messageId: string) => post(`/messages/${messageId}/steer`),
  cancel: (messageId: string) => post(`/messages/${messageId}/cancel`),
  answer: (pendingId: string, text: string, by: PersonId) => post(`/pending/${pendingId}/answer`, { text, by }),
  handoff: (model: string, by: PersonId) => post('/handoff', { model, by }),
  pace: (pace: Pace) => post('/pace', { pace }),
  retry: () => post('/retry'),
  reset: () => post('/reset'),
}
