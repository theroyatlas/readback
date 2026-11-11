import { useEffect, useRef, useState } from 'react'
import { PEOPLE } from '../shared/catalog.ts'
import type { Message, PersonId, Session } from '../shared/types.ts'
import { Avatar } from './Avatar.tsx'
import { KIND_LABEL, PIN_LABEL, clock, whenText } from './format.ts'

interface Props {
  session: Session
  me: PersonId
  onSay: (text: string) => Promise<void>
  onSteerNow: (id: string) => void
  onCancel: (id: string) => void
}

/** Every message a teammate sent, with the agent's readback of it. */
export function Feed({ session: s, me, onSay, onSteerNow, onCancel }: Props) {
  const list = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const count = s.messages.length
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [count])

  const submit = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setDraft('')
    try {
      await onSay(text)
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="card feed">
      <header className="card-head">
        <h2>Messages and readbacks</h2>
        <p>The agent reads every message back before it acts on it.</p>
      </header>
      <div className="feed-list" ref={list}>
        <article className="msg msg-goal">
          <div className="msg-top">
            {s.startedBy && <Avatar who={s.startedBy} size={22} />}
            <strong>{s.startedBy ? PEOPLE[s.startedBy].name : 'Team'}</strong>
            <span className="msg-meta">set the goal</span>
          </div>
          <p className="msg-text">{s.goal}</p>
        </article>
        {s.messages.map((m) => (
          <MessageCard key={m.id} message={m} session={s} mine={m.by === me} onSteerNow={onSteerNow} onCancel={onCancel} />
        ))}
      </div>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Avatar who={me} size={26} />
        <textarea
          value={draft}
          rows={2}
          placeholder="Tell the agent something. It decides whether to interrupt or wait, and you can overrule it."
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit()
            }
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={!draft.trim() || sending}>
          Send
        </button>
      </form>
    </section>
  )
}

function MessageCard({
  message: m,
  session: s,
  mine,
  onSteerNow,
  onCancel,
}: {
  message: Message
  session: Session
  mine: boolean
  onSteerNow: (id: string) => void
  onCancel: (id: string) => void
}) {
  const pin = s.pins.find((p) => p.id === m.pinId)
  const receipt = m.receipt
  const tone = m.status === 'cancelled' ? 'cancelled' : !receipt ? 'reading' : receipt.route === 'steer' ? 'steer' : m.status === 'queued' ? 'queued' : 'landed'
  return (
    <article className={`msg msg-${tone}`} id={`msg-${m.id}`}>
      <div className="msg-top">
        <Avatar who={m.by} size={22} />
        <strong>{PEOPLE[m.by].name}</strong>
        <span className="msg-meta">{clock(m.at)}</span>
        <span className={`tag tag-${tone}`}>
          {tone === 'reading' && 'Delivered'}
          {tone === 'queued' && 'Queued'}
          {tone === 'steer' && (m.status === 'steering' ? 'Steering' : 'Steered')}
          {tone === 'landed' && 'Landed'}
          {tone === 'cancelled' && 'Withdrawn'}
        </span>
      </div>
      <p className="msg-text">{m.text}</p>

      {!receipt ? (
        <div className="receipt receipt-loading">
          <span className="shimmer" /> Reading it back...
        </div>
      ) : (
        <dl className="receipt">
          <dt>Heard</dt>
          <dd>{receipt.heard}</dd>
          <dt>Type</dt>
          <dd>
            {KIND_LABEL[receipt.kind]}
            {pin && (
              <span className={`pin-note ${pin.status === 'superseded' ? 'is-off' : ''}`}>
                pinned as {PIN_LABEL[pin.kind].toLowerCase()}
              </span>
            )}
          </dd>
          <dt>When</dt>
          <dd>
            <span className="when">{whenText(m, s)}</span>
            {receipt.why && <span className="why">{receipt.why}</span>}
          </dd>
          {receipt.expected && (
            <>
              <dt>Expect</dt>
              <dd>{receipt.expected}</dd>
            </>
          )}
        </dl>
      )}

      {m.error && <p className="msg-error">The readback call failed, so your exact words were queued as written.</p>}

      {m.status === 'queued' && (
        <div className="msg-actions">
          <button type="button" className="btn btn-steer" onClick={() => onSteerNow(m.id)}>
            Steer now
          </button>
          {mine && (
            <button type="button" className="btn btn-quiet" onClick={() => onCancel(m.id)}>
              Withdraw
            </button>
          )}
        </div>
      )}
    </article>
  )
}
