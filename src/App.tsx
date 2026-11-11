import { useCallback, useEffect, useState } from 'react'
import { PERSON_IDS, PEOPLE } from '../shared/catalog.ts'
import type { Lang, PersonId, Session } from '../shared/types.ts'
import { Avatar } from './Avatar.tsx'
import { Feed } from './Feed.tsx'
import { Lanes } from './Lanes.tsx'
import { Board, HandoffCard, Waiting } from './Side.tsx'
import { StepPanel } from './StepPanel.tsx'
import { LangSwitch, TopBar } from './TopBar.tsx'
import { api, initialPerson, useSession } from './api.ts'
import { LangContext, translate, useT } from './i18n.tsx'

const EXAMPLE_GOAL: Record<Lang, string> = {
  en: 'Write a launch post for Nori, our desktop AI pet that keeps you company while you work. It is for X. Mention the launch date.',
  zh: '幫 Nori 寫一則發布貼文，要發在 X 上。Nori 是陪你工作的桌面 AI 寵物。貼文用英文寫，要提到發布日期。',
}

/** The step to show when the viewer has not picked one: the one running, else the latest with output. */
function followedStep(s: Session): number {
  if (s.status === 'running') return s.activeStep
  for (let i = s.steps.length - 1; i >= 0; i -= 1) if (s.steps[i].output) return i
  return Math.min(s.activeStep, Math.max(0, s.steps.length - 1))
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

export default function App() {
  const { session, online } = useSession()
  const [me, setMe] = useState<PersonId>(initialPerson)
  const [picked, setPicked] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const run = useCallback((work: Promise<void>) => {
    work.catch((err: unknown) => setToast(message(err)))
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

  if (!session) return <div className="boot">{translate('en', 'connecting')}</div>

  const setLang = (lang: Lang) => run(api.lang(lang))

  if (session.status === 'empty') {
    return (
      <LangContext.Provider value={session.lang}>
        <StartScreen
          lang={session.lang}
          me={me}
          onMe={chooseMe}
          onLang={setLang}
          onStart={(goal) => run(api.start(goal, me))}
          toast={toast}
        />
      </LangContext.Provider>
    )
  }

  const shown = picked ?? followedStep(session)
  const handoffs = [...session.handoffs].reverse()

  return (
    <LangContext.Provider value={session.lang}>
      <div className="app">
        <TopBar
          session={session}
          me={me}
          online={online}
          onMe={chooseMe}
          onHandoff={(model) => run(api.handoff(model, me))}
          onLang={setLang}
          onRetry={() => run(api.retry())}
          onReset={() => run(api.reset())}
        />
        {session.error && <div className="banner">{session.error}</div>}
        <Lanes session={session} me={me} selected={shown} onSelect={setPicked} onPickMessage={pickMessage} />
        <main className="grid">
          <Feed
            session={session}
            me={me}
            onSay={(text) => api.say(text, me).catch((err: unknown) => setToast(message(err)))}
            onTyping={() => void api.typing(me).catch(() => undefined)}
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
    </LangContext.Provider>
  )
}

function StartScreen({
  lang,
  me,
  onMe,
  onLang,
  onStart,
  toast,
}: {
  lang: Lang
  me: PersonId
  onMe: (who: PersonId) => void
  onLang: (lang: Lang) => void
  onStart: (goal: string) => void
  toast: string | null
}) {
  const t = useT()
  // Until the viewer types, the example follows the language.
  const [typed, setTyped] = useState<string | null>(null)
  const goal = typed ?? EXAMPLE_GOAL[lang]
  return (
    <div className="start">
      <div className="start-card card">
        <div className="start-top">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-name">Readback</span>
          </div>
          <LangSwitch lang={lang} onLang={onLang} />
        </div>
        <h1>{t('start.h1')}</h1>
        <ul className="start-points">
          <li>{t('start.p1')}</li>
          <li>{t('start.p2')}</li>
          <li>{t('start.p3')}</li>
        </ul>
        <label className="start-label" htmlFor="goal">
          {t('start.label')}
        </label>
        <textarea id="goal" rows={3} value={goal} onChange={(event) => setTyped(event.target.value)} />
        <div className="start-row">
          <div className="segmented">
            {PERSON_IDS.map((who) => (
              <button key={who} type="button" aria-pressed={me === who} onClick={() => onMe(who)}>
                <Avatar who={who} size={18} /> {PEOPLE[who].name}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary btn-big" disabled={!goal.trim()} onClick={() => onStart(goal.trim())}>
            {t('start.button', { name: PEOPLE[me].name })}
          </button>
        </div>
        <p className="start-hint">{t('start.hint')}</p>
        {toast && <p className="msg-error">{toast}</p>}
      </div>
    </div>
  )
}
