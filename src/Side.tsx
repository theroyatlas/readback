import { useState } from 'react'
import { PEOPLE, modelLabel } from '../shared/catalog.ts'
import type { Handoff, PendingItem, PersonId, Session } from '../shared/types.ts'
import { Avatar } from './Avatar.tsx'
import { PIN_LABEL } from './format.ts'

/** The pinned board: exact words that must outlive compaction and handoffs. */
export function Board({ session: s }: { session: Session }) {
  const active = s.pins.filter((p) => p.status === 'active').length
  return (
    <section className="card board">
      <header className="card-head">
        <h2>
          Pinned board <span className="count">{active}</span>
        </h2>
        <p>Exact words, never summarized. Sent at the top of every prompt.</p>
      </header>
      {s.pins.length === 0 ? (
        <p className="empty">Constraints, decisions and approvals your team states are pinned here automatically.</p>
      ) : (
        <ul className="pins">
          {s.pins.map((pin) => (
            <li key={pin.id} className={`pin pin-${pin.kind} ${pin.status === 'superseded' ? 'is-off' : ''}`}>
              <div className="pin-top">
                <span className={`tag tag-pin-${pin.kind}`}>{PIN_LABEL[pin.kind]}</span>
                {pin.status === 'superseded' && <span className="tag tag-cancelled">superseded</span>}
                <span className="pin-by">
                  <Avatar who={pin.by} size={16} /> {PEOPLE[pin.by].name}
                </span>
              </div>
              {pin.context && <p className="pin-context">{pin.context}</p>}
              <p className="pin-text">{`“${pin.text}”`}</p>
              <p className="pin-check">Handoff check: {pin.check.question}</p>
            </li>
          ))}
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
  const open = s.pending.filter((p) => p.status === 'open')
  const answered = s.pending.filter((p) => p.status === 'answered')
  return (
    <section className="card waiting">
      <header className="card-head">
        <h2>
          Waiting on people <span className="count">{open.length}</span>
        </h2>
        <p>The agent asks instead of guessing, and stops only when it has to.</p>
      </header>
      {s.pending.length === 0 && <p className="empty">Nothing is waiting on anyone.</p>}
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
  const [text, setText] = useState('')
  const needed = item.neededByStep === 'final' ? 'before the work is finished' : `before step ${item.neededByStep + 1}`
  const blocking =
    s.status === 'waiting' && (item.neededByStep === 'final' ? s.activeStep >= s.steps.length : item.neededByStep <= s.activeStep)
  return (
    <li className={`pending-row ${mine ? 'is-mine' : ''} ${blocking ? 'is-blocking' : ''}`}>
      <div className="pending-top">
        <Avatar who={item.assignee} size={20} />
        <strong>{mine ? 'You' : PEOPLE[item.assignee].name}</strong>
        <span className="pending-need">
          {blocking ? 'The agent is stopped on this' : `Needed ${needed}`}
        </span>
      </div>
      <p className="pending-q">{item.question}</p>
      {mine ? (
        item.kind === 'gate' ? (
          <button type="button" className="btn btn-primary" onClick={() => onAnswer(item.id, 'Approved')}>
            Approve
          </button>
        ) : (
          <form
            className="pending-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (text.trim()) onAnswer(item.id, text.trim())
            }}
          >
            <input value={text} placeholder="Your answer" onChange={(event) => setText(event.target.value)} />
            <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
              Answer
            </button>
          </form>
        )
      ) : (
        <p className="pending-other">Only {PEOPLE[item.assignee].name} can clear this.</p>
      )}
    </li>
  )
}

/** A handoff to another model, and the check the new model had to pass before it could continue. */
export function HandoffCard({ handoff: h }: { handoff: Handoff }) {
  const caught = h.checks.filter((check) => check.pass).length
  const grading = h.status === 'writing' || h.status === 'quizzing'
  return (
    <section className={`card handoff handoff-${h.status}`}>
      <header className="card-head">
        <h2>
          Handoff
          {h.status === 'done' && h.checks.length > 0 && (
            <span className={`score ${caught === h.checks.length ? 'is-full' : ''}`}>
              caught {caught}/{h.checks.length}
            </span>
          )}
        </h2>
        <p>
          {modelLabel(h.fromModel)} {'→'} {modelLabel(h.toModel)}
          {h.status === 'requested' && ' · happens at the next checkpoint'}
          {h.status === 'writing' && ' · writing the handoff note'}
          {h.status === 'quizzing' && ' · the new model is answering one question per pin'}
          {h.status === 'done' && h.checks.length === 0 && ' · nothing was pinned, so there was nothing to check'}
          {h.status === 'failed' && ` · failed, the session stays on ${modelLabel(h.fromModel)}`}
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
                      {check.rebriefed && <span className="tag tag-queued">briefed again</span>} {check.note}
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
          <summary>Handoff note (built from the board, word for word)</summary>
          <pre>{h.note}</pre>
        </details>
      )}
    </section>
  )
}
