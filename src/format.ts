import { MODELS, PEOPLE } from '../shared/catalog.ts'
import type { IntentKind, Message, PendingItem, PersonId, PinKind, Session } from '../shared/types.ts'
import type { Key, Translate } from './i18n.tsx'

const MODEL_COLORS = ['#6247d6', '#2a7de1', '#0f9d8a', '#30384a']

export function modelColor(id: string | null): string {
  const index = MODELS.findIndex((m) => m.id === id)
  return index < 0 ? '#b3bac7' : MODEL_COLORS[index % MODEL_COLORS.length]
}

export const KIND_KEY: Record<IntentKind, Key> = {
  add: 'kind.add',
  revise: 'kind.revise',
  retract: 'kind.retract',
  answer: 'kind.answer',
  question: 'kind.question',
}

export const PIN_KEY: Record<PinKind, Key> = {
  constraint: 'pin.constraint',
  decision: 'pin.decision',
  gate: 'pin.gate',
}

export function clock(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

/** Open questions and approvals that stop the agent at the checkpoint it is at. */
export function blockers(s: Session): PendingItem[] {
  const finishing = s.activeStep >= s.steps.length
  return s.pending.filter(
    (p) => p.status === 'open' && (p.neededByStep === 'final' ? finishing : p.neededByStep <= s.activeStep),
  )
}

/** The checkpoint a queued message will land at. */
export function nextCheckpoint(s: Session): number {
  return s.status === 'running' ? s.activeStep + 1 : s.activeStep
}

function where(s: Session, k: number, t: Translate): string {
  return k >= s.steps.length ? t('where.final') : t('where.step', { n: k + 1 })
}

export function whenText(m: Message, s: Session, t: Translate): string {
  switch (m.status) {
    case 'delivered':
      return t('when.delivered')
    case 'queued':
      return t('when.queued', { where: where(s, nextCheckpoint(s), t) })
    case 'steering':
      return t('when.steering', { n: s.activeStep + 1 })
    case 'applied':
      if (m.receipt?.kind === 'answer') return t('when.answer')
      if (m.receipt?.route === 'steer') return t('when.steered', { n: (m.appliedAtStep ?? 0) + 1 })
      return t('when.landed', { where: where(s, m.appliedAtStep ?? 0, t) })
    case 'cancelled':
      return t('when.cancelled')
  }
}

export function statusText(s: Session, t: Translate): string {
  const total = s.steps.length
  switch (s.status) {
    case 'empty':
      return t('status.empty')
    case 'planning':
      return t('status.planning')
    case 'running':
      return t('status.running', { n: s.activeStep + 1, total })
    case 'checkpoint':
      if (s.typing.length) return t('status.holding', { names: s.typing.map((who) => PEOPLE[who].name).join(t('and')) })
      if (s.outcome?.status === 'checking') return t('status.checking')
      return s.activeStep >= total ? t('status.checkpointFinal') : t('status.checkpoint', { n: s.activeStep + 1 })
    case 'waiting': {
      const names = [...new Set(blockers(s).map((p) => PEOPLE[p.assignee].name))]
      return t('status.waiting', { names: names.join(t('and')) || t('theTeam') })
    }
    case 'handoff':
      return t('status.handoff')
    case 'done':
      return t('status.done')
    case 'error':
      return t('status.error')
  }
}

/** One plain sentence telling this viewer what to do next. */
export function guideText(s: Session, me: PersonId, t: Translate): string {
  if (s.status === 'error') return t('guide.error')
  if (s.status === 'planning') return t('guide.planning')
  if (s.status === 'checkpoint' && s.typing.length) {
    return t('guide.holding', { names: s.typing.map((who) => PEOPLE[who].name).join(t('and')) })
  }
  const blocking = s.status === 'waiting' ? blockers(s) : []
  if (blocking.some((p) => p.assignee === me)) return t('guide.answer')
  if (blocking.length) return t('guide.other', { name: PEOPLE[blocking[0].assignee].name })
  if (s.messages.some((m) => m.status === 'queued')) return t('guide.queued')
  if (s.status === 'done') return t('guide.done')
  if (s.messages.length === 0) return t('guide.say')
  if (s.handoffs.length === 0 && s.pins.some((p) => p.status === 'active')) return t('guide.handoff')
  return t('guide.more')
}
