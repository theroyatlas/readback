import { useState } from 'react'
import { PEOPLE, modelLabel } from '../shared/catalog.ts'
import type { Session } from '../shared/types.ts'
import { modelColor } from './format.ts'

type Tab = 'output' | 'prompt' | 'discarded'

/** What the agent produced in one step, the exact prompt it was given, and anything a steer threw away. */
export function StepPanel({ session: s, index }: { session: Session; index: number }) {
  const [tab, setTab] = useState<Tab>('output')
  const step = s.steps[index]

  if (!step) {
    return (
      <section className="card step-panel">
        <header className="card-head">
          <h2>Agent output</h2>
          <p>{s.status === 'planning' ? 'The agent is breaking the goal into steps.' : 'No step yet.'}</p>
        </header>
        <div className="output output-empty">The plan will appear in the lanes above.</div>
      </section>
    )
  }

  const byId = new Map(s.messages.map((m) => [m.id, m]))
  const reached = step.appliedMessageIds.map((id) => byId.get(id)).filter((m) => m !== undefined)
  const shown: Tab = tab === 'discarded' && step.discarded.length === 0 ? 'output' : tab

  return (
    <section className="card step-panel">
      <header className="card-head">
        <h2>
          Step {index + 1}: {step.title}
        </h2>
        <p>
          <i className="model-dot" style={{ background: modelColor(step.model) }} />
          {step.model ? modelLabel(step.model) : 'Not started'} {'·'} {step.deliverable}
        </p>
      </header>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={shown === 'output'} onClick={() => setTab('output')}>
          Output
        </button>
        <button type="button" role="tab" aria-selected={shown === 'prompt'} onClick={() => setTab('prompt')}>
          Exact prompt
        </button>
        {step.discarded.length > 0 && (
          <button type="button" role="tab" aria-selected={shown === 'discarded'} onClick={() => setTab('discarded')}>
            Discarded by a steer ({step.discarded.length})
          </button>
        )}
      </div>

      {shown === 'output' && (
        <>
          {reached.length > 0 && (
            <ul className="reached">
              {reached.map((m) => (
                <li key={m.id}>
                  <span className={`tag ${step.steeredBy.includes(m.id) ? 'tag-steer' : 'tag-landed'}`}>
                    {step.steeredBy.includes(m.id) ? 'steered' : 'at checkpoint'}
                  </span>
                  <strong>{PEOPLE[m.by].name}:</strong> {m.text}
                </li>
              ))}
            </ul>
          )}
          <div className={`output ${step.status === 'running' ? 'is-live' : ''}`}>
            {step.output || (step.status === 'pending' ? 'Not started yet.' : '')}
            {step.status === 'running' && <span className="caret" />}
          </div>
        </>
      )}

      {shown === 'prompt' && (
        <pre className="prompt">{step.prompt ?? 'The prompt is written when the step starts, so it includes everything on the board at that moment.'}</pre>
      )}

      {shown === 'discarded' &&
        step.discarded.map((attempt, i) => (
          <div key={i} className="discarded">
            <p className="discarded-why">
              Thrown away when{' '}
              {attempt.steeredBy
                .map((id) => byId.get(id))
                .filter((m) => m !== undefined)
                .map((m) => `${PEOPLE[m.by].name} said "${m.text}"`)
                .join(' and ') || 'a teammate steered'}
            </p>
            <div className="output output-struck">{attempt.text || '(nothing had been written yet)'}</div>
          </div>
        ))}
    </section>
  )
}
