import { useState } from 'react'
import { MODELS, PACES, PERSON_IDS, PEOPLE, modelLabel } from '../shared/catalog.ts'
import type { Pace, PersonId, Session } from '../shared/types.ts'
import { Avatar } from './Avatar.tsx'
import { modelColor, statusText } from './format.ts'

const PACE_LABEL: Record<Pace, string> = { readable: 'Readable', fast: 'Fast', realtime: 'Real time' }

interface Props {
  session: Session
  me: PersonId
  online: boolean
  onMe: (who: PersonId) => void
  onHandoff: (model: string) => void
  onPace: (pace: Pace) => void
  onRetry: () => void
  onReset: () => void
}

export function TopBar({ session: s, me, online, onMe, onHandoff, onPace, onRetry, onReset }: Props) {
  const others = MODELS.filter((m) => m.id !== s.model)
  const [target, setTarget] = useState(others[0]?.id ?? '')
  const choice = others.some((m) => m.id === target) ? target : (others[0]?.id ?? '')
  const busy = s.handoffs.some((h) => h.status !== 'done' && h.status !== 'failed')

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">Readback</span>
      </div>

      <div className={`status status-${s.status}`}>
        <span className="status-dot" />
        {statusText(s)}
        {s.status === 'error' && (
          <button type="button" className="btn btn-quiet" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>

      <div className="topbar-spacer" />

      <div className="control" title="Slows how fast a step's text is released, so teammates can react mid-step. Real time releases it as the model sends it.">
        <span className="control-label">Pace</span>
        <div className="segmented">
          {PACES.map((pace) => (
            <button key={pace} type="button" aria-pressed={s.pace === pace} onClick={() => onPace(pace)}>
              {PACE_LABEL[pace]}
            </button>
          ))}
        </div>
      </div>

      <div className="control">
        <span className="control-label">Model</span>
        <span className="model-chip">
          <i className="model-dot" style={{ background: modelColor(s.model) }} />
          {modelLabel(s.model)}
        </span>
        <span className="arrow">{'→'}</span>
        <select value={choice} onChange={(event) => setTarget(event.target.value)} aria-label="Model to hand off to">
          {others.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} ({m.vendor})
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-primary" disabled={busy || !choice} onClick={() => onHandoff(choice)}>
          Hand off
        </button>
      </div>

      <div className="control">
        <span className="control-label">You are</span>
        <div className="segmented">
          {PERSON_IDS.map((who) => (
            <button key={who} type="button" aria-pressed={me === who} onClick={() => onMe(who)}>
              <Avatar who={who} size={18} /> {PEOPLE[who].name}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="btn btn-quiet" onClick={onReset} title="Throw this session away and start over">
        Reset
      </button>
      <span className={`online ${online ? 'is-on' : ''}`} title={online ? 'Live' : 'Reconnecting'} />
    </header>
  )
}
