import { DEFAULT_MODEL } from '../shared/catalog.ts'
import type { Session } from '../shared/types.ts'

type Listener = (session: Session) => void

/** A session plus the control state that never leaves the server. */
export interface Runtime {
  session: Session
  listeners: Set<Listener>
  flushTimer: ReturnType<typeof setTimeout> | null
  /** Cancels the model stream of the step that is running. */
  abort: AbortController | null
  /** Ids of messages that interrupted the running step and will be applied on its rerun. */
  steering: string[]
  /** Resolvers of whoever is waiting for a teammate (an answer, an approval, a new message). */
  waiters: Set<() => void>
  /** Readbacks being written. A checkpoint waits for them so no delivered message slips past it. */
  inflight: Set<Promise<void>>
  /** The agent loop, while one is running. */
  loop: Promise<void> | null
}

const runtimes = new Map<string, Runtime>()

function emptySession(id: string): Session {
  return {
    id,
    goal: '',
    startedBy: null,
    model: DEFAULT_MODEL,
    pace: 'readable',
    status: 'empty',
    activeStep: 0,
    steps: [],
    messages: [],
    pins: [],
    pending: [],
    handoffs: [],
    error: null,
    version: 0,
  }
}

export function getRuntime(id: string): Runtime {
  let rt = runtimes.get(id)
  if (!rt) {
    rt = {
      session: emptySession(id),
      listeners: new Set(),
      flushTimer: null,
      abort: null,
      steering: [],
      waiters: new Set(),
      inflight: new Set(),
      loop: null,
    }
    runtimes.set(id, rt)
  }
  return rt
}

/** Throws the session away and starts clean. Listeners stay connected. */
export function resetRuntime(rt: Runtime): void {
  const pace = rt.session.pace
  rt.abort?.abort()
  rt.abort = null
  rt.steering = []
  rt.inflight = new Set()
  rt.loop = null
  rt.session = { ...emptySession(rt.session.id), pace }
  wake(rt)
  touch(rt)
}

/** Call after every change. Listeners get the whole session, at most once every 60 ms. */
export function touch(rt: Runtime): void {
  rt.session.version += 1
  if (rt.flushTimer) return
  rt.flushTimer = setTimeout(() => {
    rt.flushTimer = null
    for (const listener of rt.listeners) listener(rt.session)
  }, 60)
}

export function subscribe(rt: Runtime, listener: Listener): () => void {
  rt.listeners.add(listener)
  return () => rt.listeners.delete(listener)
}

export function wake(rt: Runtime): void {
  const waiters = [...rt.waiters]
  rt.waiters.clear()
  for (const resolve of waiters) resolve()
}

export function waitForWake(rt: Runtime): Promise<void> {
  return new Promise((resolve) => rt.waiters.add(resolve))
}

export function track(rt: Runtime, work: Promise<void>): void {
  rt.inflight.add(work)
  void work.finally(() => rt.inflight.delete(work))
}

/** Waits for the readbacks in flight, but never longer than `ms`. */
export async function settle(rt: Runtime, ms: number): Promise<void> {
  if (rt.inflight.size === 0) return
  await Promise.race([Promise.allSettled([...rt.inflight]), new Promise((resolve) => setTimeout(resolve, ms))])
}
