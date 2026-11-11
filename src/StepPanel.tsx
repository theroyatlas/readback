import { useState } from 'react'
import { PEOPLE, modelLabel } from '../shared/catalog.ts'
import type { Session } from '../shared/types.ts'
import { modelColor } from './format.ts'
import { useT } from './i18n.tsx'

type Tab = 'output' | 'prompt' | 'discarded'

/** What the agent produced in one step, the exact prompt it was given, and anything a steer threw away. */
export function StepPanel({ session: s, index }: { session: Session; index: number }) {
  const t = useT()
  const [tab, setTab] = useState<Tab>('output')
  const step = s.steps[index]

  if (!step) {
    return (
      <section className="card step-panel">
        <header className="card-head">
          <h2>{t('step.agentOutput')}</h2>
          <p>{s.status === 'planning' ? t('step.planningSub') : t('step.none')}</p>
        </header>
        <div className="output output-empty">{t('step.planAbove')}</div>
      </section>
    )
  }

  const byId = new Map(s.messages.map((m) => [m.id, m]))
  const reached = step.appliedMessageIds.map((id) => byId.get(id)).filter((m) => m !== undefined)
  const shown: Tab = tab === 'discarded' && step.discarded.length === 0 ? 'output' : tab

  return (
    <section className="card step-panel">
      <header className="card-head">
        <h2>{t('step.title', { n: index + 1, title: step.title })}</h2>
        <p>
          <i className="model-dot" style={{ background: modelColor(step.model) }} />
          {step.model ? modelLabel(step.model) : t('step.notStarted')} {'·'} {step.deliverable}
        </p>
      </header>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={shown === 'output'} onClick={() => setTab('output')}>
          {t('tab.output')}
        </button>
        <button type="button" role="tab" aria-selected={shown === 'prompt'} onClick={() => setTab('prompt')}>
          {t('tab.prompt')}
        </button>
        {step.discarded.length > 0 && (
          <button type="button" role="tab" aria-selected={shown === 'discarded'} onClick={() => setTab('discarded')}>
            {t('tab.discarded', { n: step.discarded.length })}
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
                    {step.steeredBy.includes(m.id) ? t('reached.steer') : t('reached.checkpoint')}
                  </span>
                  <strong>{PEOPLE[m.by].name}:</strong> {m.text}
                </li>
              ))}
            </ul>
          )}
          <div className={`output ${step.status === 'running' ? 'is-live' : ''}`}>
            {step.output || (step.status === 'pending' ? t('step.notStartedYet') : '')}
            {step.status === 'running' && <span className="caret" />}
          </div>
        </>
      )}

      {shown === 'prompt' && <pre className="prompt">{step.prompt ?? t('prompt.later')}</pre>}

      {shown === 'discarded' &&
        step.discarded.map((attempt, i) => (
          <div key={i} className="discarded">
            <p className="discarded-why">
              {t('discarded.why', {
                who:
                  attempt.steeredBy
                    .map((id) => byId.get(id))
                    .filter((m) => m !== undefined)
                    .map((m) => t('discarded.said', { name: PEOPLE[m.by].name, text: m.text }))
                    .join(t('and')) || t('discarded.someone'),
              })}
            </p>
            <div className="output output-struck">{attempt.text || t('discarded.nothing')}</div>
          </div>
        ))}
    </section>
  )
}
