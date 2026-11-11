import { useCallback, useEffect, useState } from 'react'
import { PERSON_IDS, PEOPLE } from '../shared/catalog.ts'
import type { PersonId, Session } from '../shared/types.ts'
import { Avatar } from './Avatar.tsx'
import { Feed } from './Feed.tsx'
import { Lanes } from './Lanes.tsx'
import { Board, HandoffCard, Waiting } from './Side.tsx'
import { StepPanel } from './StepPanel.tsx'
import { TopBar } from './TopBar.tsx'
import { api, initialPerson, useSession } from './api.ts'

const EXAMPLE_GOAL =
  'Write a launch post for Nori, our desktop AI pet that keeps you company while you work. It is for X. Mention the launch date.'

/** The step to show when the viewer has not picked one: the one running, else the latest with output. */
function followedStep(s: Session): number {
  if (s.status === 'running') return s.activeStep
  for (let i = s.steps.length - 1; i >= 0; i -= 1) if (s.steps[i].output) return i
  return Math.min(s.activeStep, Math.max(0, s.steps.length - 1))
}

export default function App() {
  const { session, online } = useSession()
  const [me, setMe] = useState<PersonId>(initialPerson)
  const [picked, setPicked] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const run = useCallback((work: Promise<void>) => {
    work.catch((err: unknown) => setToast(err instanceof Error ? err.message : String(err)))
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  const chooseMe = (who: PersonId) => {
    setMe(who)
    const url = new URL(location.href)
    url.searchParams.set('as', who)
    history.replaceState(null, '', url)
  }

  // Follow the agent again whenever it moves on to another step.
  const active = session?.activeStep ?? 0
  useEffect(() => setPicked(null), [active])

  const pickMessage = (id: string) => {
    const el = document.getElementById(`msg-${id}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.remove('is-flash')
    requestAnimationFrame(() => el.classList.add('is-flash'))
  }

  if (!session) return <div className="boot">Connecting to the session...</div>

  if (session.status === 'empty') {
    return <StartScreen me={me} onMe={chooseMe} onStart={(goal) => run(api.start(goal, me))} toast={toast} />
  }

  const shown = picked ?? followedStep(session)
  const handoffs = [...session.handoffs].reverse()

  return (
    <div className="app">
      <TopBar
        session={session}
        me={me}
        online={online}
        onMe={chooseMe}
        onHandoff={(model) => run(api.handoff(model, me))}
        onPace={(pace) => run(api.pace(pace))}
        onRetry={() => run(api.retry())}
        onReset={() => run(api.reset())}
      />
      {session.error && <div className="banner">{session.error}</div>}
      <Lanes session={session} me={me} selected={shown} onSelect={setPicked} onPickMessage={pickMessage} />
      <main className="grid">
        <Feed
          session={session}
          me={me}
          onSay={(text) => api.say(text, me).catch((err: unknown) => setToast(err instanceof Error ? err.message : String(err)))}
          onSteerNow={(id) => run(api.steerNow(id))}
          onCancel={(id) => run(api.cancel(id))}
        />
        <StepPanel key={shown} session={session} index={shown} />
        <aside className="side">
          <Waiting session={session} me={me} onAnswer={(id, text) => run(api.answer(id, text, me))} />
          <Board session={session} />
          {handoffs.map((handoff) => (
            <HandoffCard key={handoff.id} handoff={handoff} />
          ))}
        </aside>
      </main>
      {toast && (
        <button type="button" className="toast" onClick={() => setToast(null)}>
          {toast}
        </button>
      )}
    </div>
  )
}

function StartScreen({
  me,
  onMe,
  onStart,
  toast,
}: {
  me: PersonId
  onMe: (who: PersonId) => void
  onStart: (goal: string) => void
  toast: string | null
}) {
  const [goal, setGoal] = useState(EXAMPLE_GOAL)
  return (
    <div className="start">
      <div className="start-card card">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Readback</span>
        </div>
        <h1>One agent, a whole team talking to it. Nothing gets lost.</h1>
        <ul className="start-points">
          <li>Every message gets a readback: what the agent understood, and when it will act on it.</li>
          <li>Constraints and decisions are pinned word for word, so compaction cannot lose them.</li>
          <li>Hand the work to another model, and it has to prove it caught every pin before it continues.</li>
        </ul>
        <label className="start-label" htmlFor="goal">
          What should the agent work on?
        </label>
        <textarea id="goal" rows={3} value={goal} onChange={(event) => setGoal(event.target.value)} />
        <div className="start-row">
          <div className="segmented">
            {PERSON_IDS.map((who) => (
              <button key={who} type="button" aria-pressed={me === who} onClick={() => onMe(who)}>
                <Avatar who={who} size={18} /> {PEOPLE[who].name}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary btn-big" disabled={!goal.trim()} onClick={() => onStart(goal.trim())}>
            Start the session as {PEOPLE[me].name}
          </button>
        </div>
        <p className="start-hint">Open this page in a second window as the other teammate. Both windows share the same session.</p>
        {toast && <p className="msg-error">{toast}</p>}
      </div>
    </div>
  )
}
