import { useEffect, useRef, useState } from 'react'
import { PEOPLE } from '../shared/catalog.ts'
import type { Message, PersonId, Session } from '../shared/types.ts'
import { Avatar } from './Avatar.tsx'
import { KIND_KEY, PIN_KEY, clock, whenText } from './format.ts'
import { useT } from './i18n.tsx'

interface Props {
  session: Session
  me: PersonId
  onSay: (text: string) => Promise<void>
  onTyping: () => void
  onSteerNow: (id: string) => void
  onCancel: (id: string) => void
}

/** Every message a teammate sent, with the agent's readback of it. */
export function Feed({ session: s, me, onSay, onTyping, onSteerNow, onCancel }: Props) {
  const t = useT()
  const list = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const lastTyping = useRef(0)

  // Tell the session we are typing, at most once a second, so the agent can hold its next checkpoint.
  const noteTyping = () => {
    const now = Date.now()
    if (now - lastTyping.current < 1000) return
    lastTyping.current = now
    onTyping()
  }

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
        <h2>{t('feed.title')}</h2>
        <p>{t('feed.sub')}</p>
      </header>
      <div className="feed-list" ref={list}>
        <article className="msg msg-goal">
          <div className="msg-top">
            {s.startedBy && <Avatar who={s.startedBy} size={22} />}
            <strong>{s.startedBy ? PEOPLE[s.startedBy].name : ''}</strong>
            <span className="msg-meta">{t('feed.setGoal')}</span>
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
          placeholder={t('feed.placeholder')}
          onChange={(event) => {
            setDraft(event.target.value)
            if (event.target.value.trim()) noteTyping()
          }}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter is a new line. Ignore Enter while an input method is composing.
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void submit()
            }
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={!draft.trim() || sending}>
          {t('send')}
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
  const t = useT()
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
          {tone === 'reading' && t('tag.delivered')}
          {tone === 'queued' && t('tag.queued')}
          {tone === 'steer' && (m.status === 'steering' ? t('tag.steering') : t('tag.steered'))}
          {tone === 'landed' && t('tag.landed')}
          {tone === 'cancelled' && t('tag.withdrawn')}
        </span>
      </div>
      <p className="msg-text">{m.text}</p>

      {!receipt ? (
        <div className="receipt receipt-loading">
          <span className="shimmer" /> {t('receipt.reading')}
        </div>
      ) : (
        <dl className="receipt">
          <dt>{t('receipt.heard')}</dt>
          <dd>{receipt.heard}</dd>
          <dt>{t('receipt.type')}</dt>
          <dd>
            {t(KIND_KEY[receipt.kind])}
            {pin && (
              <span className={`pin-note ${pin.status === 'superseded' ? 'is-off' : ''}`}>
                {t('receipt.pinnedAs', { kind: t(PIN_KEY[pin.kind]).toLowerCase() })}
              </span>
            )}
          </dd>
          <dt>{t('receipt.when')}</dt>
          <dd>
            <span className="when">{whenText(m, s, t)}</span>
            {receipt.why && <span className="why">{receipt.why}</span>}
          </dd>
          {receipt.expected && (
            <>
              <dt>{t('receipt.expect')}</dt>
              <dd>{receipt.expected}</dd>
            </>
          )}
        </dl>
      )}

      {m.error && <p className="msg-error">{t('receipt.failed')}</p>}

      {m.status === 'queued' && (
        <div className="msg-actions">
          <button type="button" className="btn btn-steer" onClick={() => onSteerNow(m.id)}>
            {t('steerNow')}
          </button>
          {mine && (
            <button type="button" className="btn btn-quiet" onClick={() => onCancel(m.id)}>
              {t('withdraw')}
            </button>
          )}
        </div>
      )}
    </article>
  )
}
