// HTTP layer: a JSON API, one Server-Sent Events stream per browser, and the built app in production.
// State lives in memory. Every change pushes the whole session to every connected teammate.

import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { PACES, isPersonId } from '../shared/catalog.ts'
import type { Pace } from '../shared/types.ts'
import * as agent from './agent.ts'
import { getRuntime, resetRuntime, subscribe, touch } from './store.ts'
import type { Runtime } from './store.ts'

const PORT = Number(process.env.PORT ?? 8787)
const DIST = join(import.meta.dirname, '..', 'dist')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 20_000) throw new HttpError(413, 'Request body is too large.')
  }
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON.')
  }
}

function person(body: Record<string, unknown>) {
  if (!isPersonId(body.by)) throw new HttpError(400, 'Say who you are: "by" must be roy or mia.')
  return body.by
}

function text(body: Record<string, unknown>, field: string, max: number): string {
  const value = typeof body[field] === 'string' ? (body[field] as string).trim() : ''
  if (!value) throw new HttpError(400, `"${field}" is empty.`)
  if (value.length > max) throw new HttpError(400, `"${field}" is longer than ${max} characters.`)
  return value
}

function events(rt: Runtime, req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  const push = () => res.write(`data: ${JSON.stringify(rt.session)}\n\n`)
  push() // full state on connect, so a reconnect never misses anything
  const unsubscribe = subscribe(rt, push)
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 20_000)
  req.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
  })
}

async function api(req: IncomingMessage, res: ServerResponse, parts: string[]): Promise<void> {
  // /api/sessions/:id[/action[/targetId[/subAction]]]
  if (parts[1] !== 'sessions' || !parts[2]) throw new HttpError(404, 'Not found.')
  const rt = getRuntime(parts[2].slice(0, 40))
  const [action, targetId, subAction] = parts.slice(3)

  if (req.method === 'GET') {
    if (action === 'events') return events(rt, req, res)
    if (!action) return send(res, 200, rt.session)
    throw new HttpError(404, 'Not found.')
  }
  if (req.method !== 'POST') throw new HttpError(405, 'Use GET or POST.')

  const body = await readBody(req)
  try {
    switch (action) {
      case 'start':
        agent.start(rt, text(body, 'goal', 600), person(body))
        break
      case 'messages':
        if (!targetId) agent.postMessage(rt, text(body, 'text', 1000), person(body))
        else if (subAction === 'steer' || subAction === 'cancel') agent.overrideMessage(rt, targetId, subAction)
        else throw new HttpError(404, 'Not found.')
        break
      case 'pending':
        if (!targetId || subAction !== 'answer') throw new HttpError(404, 'Not found.')
        agent.answerPending(rt, targetId, text(body, 'text', 600), person(body))
        break
      case 'handoff':
        agent.requestHandoff(rt, text(body, 'model', 120), person(body))
        break
      case 'pace':
        if (!PACES.includes(body.pace as Pace)) throw new HttpError(400, 'Unknown pace.')
        rt.session.pace = body.pace as Pace
        touch(rt)
        break
      case 'retry':
        agent.retry(rt)
        break
      case 'reset':
        resetRuntime(rt)
        break
      default:
        throw new HttpError(404, 'Not found.')
    }
  } catch (err) {
    if (err instanceof HttpError) throw err
    throw new HttpError(409, err instanceof Error ? err.message : String(err))
  }
  send(res, 200, { ok: true })
}

function serveApp(res: ServerResponse, pathname: string): void {
  if (!existsSync(DIST)) {
    send(res, 404, { error: 'The app is not built. Run "npm run dev" for development or "npm run build" first.' })
    return
  }
  const safe = normalize(pathname).replace(/^([/\\]|\.\.)+/, '')
  let file = join(DIST, safe)
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html')
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] !== 'api') {
    serveApp(res, url.pathname)
    return
  }
  api(req, res, parts).catch((err: unknown) => {
    const status = err instanceof HttpError ? err.status : 500
    if (!res.headersSent) send(res, status, { error: err instanceof Error ? err.message : String(err) })
    else res.end()
  })
})

server.listen(PORT, () => {
  console.log(`Readback API on http://localhost:${PORT}`)
  if (!process.env.GMI_API_KEY) console.warn('GMI_API_KEY is not set. Copy .env.example to .env.local and add your key.')
})
