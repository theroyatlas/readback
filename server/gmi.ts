// Minimal GMI Cloud client: streaming text, JSON output, and mid-stream cancel. No packages.

const URL_CHAT = 'https://api.gmi-serving.com/v1/chat/completions'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// Every model switches reasoning off (or to its lowest level) with a different field.
// Without it, a small max_tokens can come back with empty content because the budget went to reasoning.
// A wrong field is either ignored or rejected with 400/422, so this table is per model.
const REASONING_OFF: Record<string, Record<string, unknown>> = {
  'Qwen/Qwen3.8-Flash': { enable_thinking: false },
  'deepseek-ai/DeepSeek-V4.1-Flash': { reasoning_effort: 'none' },
  'google/gemini-3.8-flash': { reasoning_effort: 'low' },
  'x-ai/grok-4.5': { reasoning_effort: 'low' },
}

function headers(): Record<string, string> {
  const key = process.env.GMI_API_KEY
  if (!key) throw new Error('GMI_API_KEY is not set. Copy .env.example to .env.local and add your key.')
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

async function post(body: Record<string, unknown>, signal: AbortSignal): Promise<Response> {
  const res = await fetch(URL_CHAT, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal })
  if (!res.ok) throw new Error(`GMI ${res.status}: ${(await res.text()).slice(0, 240)}`)
  return res
}

export interface StreamResult {
  text: string
  aborted: boolean
}

/**
 * Streams a reply and calls onDelta for every piece of text.
 * Aborting `signal` resolves (does not throw) with the partial text and aborted: true.
 */
export async function streamChat(opts: {
  model: string
  messages: ChatMessage[]
  maxTokens?: number
  signal?: AbortSignal
  onDelta: (piece: string) => void
}): Promise<StreamResult> {
  let text = ''
  try {
    const res = await post(
      {
        model: opts.model,
        messages: opts.messages,
        max_tokens: opts.maxTokens ?? 900,
        stream: true,
        ...(REASONING_OFF[opts.model] ?? {}),
      },
      withTimeout(opts.signal, 90_000),
    )
    if (!res.body) throw new Error('GMI returned no body')
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      // End of body is the only reliable end marker: not every model sends [DONE].
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') continue
        let chunk: { choices?: { delta?: { content?: string } }[] }
        try {
          chunk = JSON.parse(data)
        } catch {
          continue
        }
        const piece = chunk.choices?.[0]?.delta?.content
        if (piece) {
          text += piece
          opts.onDelta(piece)
        }
      }
    }
    return { text, aborted: false }
  } catch (err) {
    if (opts.signal?.aborted) return { text, aborted: true }
    throw err
  }
}

function parseJson<T>(content: string): T {
  try {
    return JSON.parse(content) as T
  } catch {
    const first = content.indexOf('{')
    const last = content.lastIndexOf('}')
    if (first >= 0 && last > first) return JSON.parse(content.slice(first, last + 1)) as T
    throw new Error('The model did not return JSON.')
  }
}

/**
 * One-shot call that returns an object matching `schema` (JSON Schema, additionalProperties: false).
 * Tries strict json_schema first; if the model rejects it, falls back to json_object with the schema in the prompt.
 */
export async function jsonChat<T>(opts: {
  model: string
  messages: ChatMessage[]
  schema: Record<string, unknown>
  name: string
  maxTokens?: number
  signal?: AbortSignal
}): Promise<T> {
  const base = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 700,
    ...(REASONING_OFF[opts.model] ?? {}),
  }
  const read = async (res: Response): Promise<T> => {
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    return parseJson<T>(body.choices?.[0]?.message?.content ?? '')
  }
  try {
    const res = await post(
      {
        ...base,
        messages: opts.messages,
        response_format: { type: 'json_schema', json_schema: { name: opts.name, strict: true, schema: opts.schema } },
      },
      withTimeout(opts.signal, 45_000),
    )
    return await read(res)
  } catch (err) {
    if (opts.signal?.aborted) throw err
    const hint: ChatMessage = {
      role: 'user',
      content: `Reply with one JSON object that matches this JSON Schema exactly:\n${JSON.stringify(opts.schema)}`,
    }
    const res = await post(
      { ...base, messages: [...opts.messages, hint], response_format: { type: 'json_object' } },
      withTimeout(opts.signal, 45_000),
    )
    return await read(res)
  }
}
