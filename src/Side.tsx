import { useState } from 'react'
import { PEOPLE, modelLabel } from '../shared/catalog.ts'
import type { Handoff, PendingItem, PersonId, Session } from '../shared/types.ts'
import { Avatar } from './Avatar.tsx'
import { PIN_KEY } from './format.ts'
import { useT } from './i18n.tsx'

/** The pinned board: exact words that must outlive compaction and handoffs. */
export function Board({ session: s }: { session: Session }) {
  const t = useT()
  const active = s.pins.filter((p) => p.status === 'active').length
  const outcome = s.outcome
  const followed = outcome ? outcome.checks.filter((c) => c.met).length : 0
  const waitingIds = new Set(s.messages.filter((m) => m.status === 'queued' || m.status === 'delivered').map((m) => m.id))
  return (
    <section className="card board">
      <header className="card-head">
        <h2>
          {t('board.title')} <span className="count">{active}</span>
          {outcome?.status === 'checking' && <span className="score">{t('board.checking')}</span>}
          {outcome?.status === 'done' && outcome.checks.length > 0 && (
            <span className={`score ${followed === outcome.checks.length ? 'is-full' : ''}`}>
              {t('board.outcome', { a: followed, b: outcome.checks.length })}
            </span>
          )}
        </h2>
        <p>{t('board.sub')}</p>
      </header>
      {s.pins.length === 0 ? (
        <p className="empty">{t('board.empty')}</p>
      ) : (
        <ul className="pins">
          {s.pins.map((pin) => {
            const result = outcome?.status === 'done' ? outcome.checks.find((c) => c.pinId === pin.id) : undefined
            const notYet = pin.status === 'active' && pin.sourceMessageId !== null && waitingIds.has(pin.sourceMessageId)
            return (
            <li key={pin.id} className={`pin pin-${pin.kind} ${pin.status === 'superseded' ? 'is-off' : ''}`}>
              <div className="pin-top">
                <span className={`tag tag-pin-${pin.kind}`}>{t(PIN_KEY[pin.kind])}</span>
                {pin.status === 'superseded' && <span className="tag tag-cancelled">{t('board.superseded')}</span>}
                {notYet && <span className="tag tag-queued">{t('board.pending')}</span>}
                <span className="pin-by">
                  <Avatar who={pin.by} size={16} /> {PEOPLE[pin.by].name}
                </span>
              </div>
              {pin.context && <p className="pin-context">{pin.context}</p>}
              <p className="pin-text">{`“${pin.text}”`}</p>
              {result && (
                <p className={`pin-result ${result.met ? 'is-met' : 'is-missed'}`}>
                  {result.met ? '\u2713' : '\u2717'} {t(result.met ? 'board.met' : 'board.missed', { evidence: result.evidence })}
                </p>
              )}
              {outcome?.status === 'done' && pin.kind === 'gate' && pin.status === 'active' && <p className="pin-result is-met">{t('board.gate')}</p>}
              <p className="pin-check">{t('board.check', { q: pin.check.question })}</p>
            </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** Questions and approvals the agent is waiting on, each assigned to one person. */
export function Waiting({
  session: s,
  me,
  onAnswer,
}: {
  session: Session
  me: PersonId
  onAnswer: (id: string, text: string) => void
}) {
  const t = useT()
  const open = s.pending.filter((p) => p.status === 'open')
  const answered = s.pending.filter((p) => p.status === 'answered')
  return (
    <section className="card waiting">
      <header className="card-head">
        <h2>
          {t('waiting.title')} <span className="count">{open.length}</span>
        </h2>
        <p>{t('waiting.sub')}</p>
      </header>
      {s.pending.length === 0 && <p className="empty">{t('waiting.none')}</p>}
      <ul className="pending">
        {open.map((item) => (
          <PendingRow key={item.id} item={item} session={s} mine={item.assignee === me} onAnswer={onAnswer} />
        ))}
        {answered.map((item) => (
          <li key={item.id} className="pending-row is-answered">
            <span className="pending-q">
              {'✓'} {item.question}
            </span>
            <span className="pending-a">
              {item.answeredBy ? PEOPLE[item.answeredBy].name : ''}: {item.answer}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PendingRow({
  item,
  session: s,
  mine,
  onAnswer,
}: {
  item: PendingItem
  session: Session
  mine: boolean
  onAnswer: (id: string, text: string) => void
}) {
  const t = useT()
  const [text, setText] = useState('')
  const needed = item.neededByStep === 'final' ? t('waiting.neededFinal') : t('waiting.neededStep', { n: item.neededByStep + 1 })
  const blocking =
    s.status === 'waiting' && (item.neededByStep === 'final' ? s.activeStep >= s.steps.length : item.neededByStep <= s.activeStep)
  return (
    <li className={`pending-row ${mine ? 'is-mine' : ''} ${blocking ? 'is-blocking' : ''}`}>
      <div className="pending-top">
        <Avatar who={item.assignee} size={20} />
        <strong>{mine ? t('You') : PEOPLE[item.assignee].name}</strong>
        <span className="pending-need">{blocking ? t('waiting.blocking') : needed}</span>
      </div>
      <p className="pending-q">{item.question}</p>
      {mine ? (
        item.kind === 'gate' ? (
          <button type="button" className="btn btn-primary" onClick={() => onAnswer(item.id, t('approved'))}>
            {t('approve')}
          </button>
        ) : (
          <form
            className="pending-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (text.trim()) onAnswer(item.id, text.trim())
            }}
          >
            <input value={text} placeholder={t('answer.placeholder')} onChange={(event) => setText(event.target.value)} />
            <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
              {t('answer')}
            </button>
          </form>
        )
      ) : (
        <p className="pending-other">{t('waiting.onlyOther', { name: PEOPLE[item.assignee].name })}</p>
      )}
    </li>
  )
}

/** A handoff to another model, and the check the new model had to pass before it could continue. */
export function HandoffCard({ handoff: h }: { handoff: Handoff }) {
  const t = useT()
  const caught = h.checks.filter((check) => check.pass).length
  const grading = h.status === 'writing' || h.status === 'quizzing'
  const detail =
    h.status === 'requested'
      ? t('handoff.requested')
      : h.status === 'writing'
        ? t('handoff.writing')
        : h.status === 'quizzing'
          ? t('handoff.quizzing')
          : h.status === 'failed'
            ? t('handoff.failed', { model: modelLabel(h.fromModel) })
            : h.checks.length === 0
              ? t('handoff.nothing')
              : ''
  return (
    <section className={`card handoff handoff-${h.status}`}>
      <header className="card-head">
        <h2>
          {t('handoff.title')}
          {h.status === 'done' && h.checks.length > 0 && (
            <span className={`score ${caught === h.checks.length ? 'is-full' : ''}`}>
              {t('handoff.caught', { a: caught, b: h.checks.length })}
            </span>
          )}
        </h2>
        <p>
          {modelLabel(h.fromModel)} {'→'} {modelLabel(h.toModel)}
          {detail && ` · ${detail}`}
        </p>
      </header>
      {h.error && <p className="msg-error">{h.error}</p>}
      {h.checks.length > 0 && (
        <ul className="checks">
          {h.checks.map((check) => {
            const state = check.pass ? 'pass' : grading ? 'wait' : 'fail'
            return (
              <li key={check.pinId} className={`check check-${state}`}>
                <span className="light" />
                <div>
                  <p className="check-q">{check.question}</p>
                  {check.answer && <p className="check-a">{check.answer}</p>}
                  {(check.note || check.rebriefed) && (
                    <p className="check-note">
                      {check.rebriefed && <span className="tag tag-queued">{t('handoff.briefedAgain')}</span>} {check.note}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {h.note && (
        <details className="note">
          <summary>{t('handoff.note')}</summary>
          <pre>{h.note}</pre>
        </details>
      )}
    </section>
  )
}
