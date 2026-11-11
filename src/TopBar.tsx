import { useState } from 'react'
import { MODELS, PERSON_IDS, PEOPLE, modelLabel } from '../shared/catalog.ts'
import type { Lang, PersonId, Session } from '../shared/types.ts'
import { Avatar } from './Avatar.tsx'
import { guideText, modelColor, statusText } from './format.ts'
import { useT } from './i18n.tsx'

export function LangSwitch({ lang, onLang }: { lang: Lang; onLang: (lang: Lang) => void }) {
  return (
    <div className="segmented" aria-label="Language">
      <button type="button" aria-pressed={lang === 'en'} onClick={() => onLang('en')}>
        EN
      </button>
      <button type="button" aria-pressed={lang === 'zh'} onClick={() => onLang('zh')}>
        中文
      </button>
    </div>
  )
}

interface Props {
  session: Session
  me: PersonId
  online: boolean
  onMe: (who: PersonId) => void
  onHandoff: (model: string) => void
  onLang: (lang: Lang) => void
  onRetry: () => void
  onReset: () => void
}

export function TopBar({ session: s, me, online, onMe, onHandoff, onLang, onRetry, onReset }: Props) {
  const t = useT()
  const others = MODELS.filter((m) => m.id !== s.model)
  const [target, setTarget] = useState(others[0]?.id ?? '')
  const choice = others.some((m) => m.id === target) ? target : (others[0]?.id ?? '')
  const busy = s.handoffs.some((h) => h.status !== 'done' && h.status !== 'failed')

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Readback</span>
        </div>

        <div className={`status status-${s.status}`}>
          <span className="status-dot" />
          {statusText(s, t)}
          {s.status === 'error' && (
            <button type="button" className="btn btn-quiet" onClick={onRetry}>
              {t('retry')}
            </button>
          )}
        </div>

        <div className="topbar-spacer" />

        <div className="control">
          <span className="control-label">{t('youAre')}</span>
          <div className="segmented">
            {PERSON_IDS.map((who) => (
              <button key={who} type="button" aria-pressed={me === who} onClick={() => onMe(who)}>
                <Avatar who={who} size={18} /> {PEOPLE[who].name}
              </button>
            ))}
          </div>
        </div>

        <div className="control">
          <span className="model-chip" title={t('model')}>
            <i className="model-dot" style={{ background: modelColor(s.model) }} />
            {modelLabel(s.model)}
          </span>
          <span className="arrow">{'→'}</span>
          <select value={choice} onChange={(event) => setTarget(event.target.value)} aria-label={t('handoff.target')}>
            {others.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" disabled={busy || !choice} onClick={() => onHandoff(choice)}>
            {t('handoff.button')}
          </button>
        </div>

        <LangSwitch lang={s.lang} onLang={onLang} />

        <button type="button" className="btn btn-quiet" onClick={onReset} title={t('reset.title')}>
          {t('reset')}
        </button>
        <span className={`online ${online ? 'is-on' : ''}`} title={online ? t('live') : t('reconnecting')} />
      </header>

      <div className="guide" role="status">
        <span className="guide-label">{t('guide.label')}</span>
        {guideText(s, me, t)}
      </div>
    </>
  )
}
