import { MODELS, PEOPLE } from '../shared/catalog.ts'
import type { IntentKind, Message, PendingItem, PinKind, Session } from '../shared/types.ts'

const MODEL_COLORS = ['#6247d6', '#2a7de1', '#0f9d8a', '#30384a']

export function modelColor(id: string | null): string {
  const index = MODELS.findIndex((m) => m.id === id)
  return index < 0 ? '#b3bac7' : MODEL_COLORS[index % MODEL_COLORS.length]
}

export const KIND_LABEL: Record<IntentKind, string> = {
  add: 'Addition',
  revise: 'Revision',
  retract: 'Retraction',
  answer: 'Answer',
  question: 'Question',
}

export const PIN_LABEL: Record<PinKind, string> = {
  constraint: 'Constraint',
  decision: 'Decision',
  gate: 'Approval gate',
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

export function checkpointName(s: Session, k: number): string {
  return k >= s.steps.length ? 'at the final checkpoint' : `at the checkpoint before step ${k + 1}`
}

export function whenText(m: Message, s: Session): string {
  switch (m.status) {
    case 'delivered':
      return 'Delivered. The agent is reading it back.'
    case 'queued':
      return `Queued. It lands ${checkpointName(s, nextCheckpoint(s))}.`
    case 'steering':
      return `Interrupting step ${s.activeStep + 1} now.`
    case 'applied':
      if (m.receipt?.kind === 'answer') return 'Recorded. Nothing was interrupted.'
      if (m.receipt?.route === 'steer') return `Steered. Step ${(m.appliedAtStep ?? 0) + 1} restarted with it.`
      return `Landed ${checkpointName(s, m.appliedAtStep ?? 0)}.`
    case 'cancelled':
      return 'Withdrawn before it reached the agent.'
  }
}

export function statusText(s: Session): string {
  const total = s.steps.length
  switch (s.status) {
    case 'empty':
      return 'No goal yet'
    case 'planning':
      return 'Planning the work'
    case 'running':
      return `Step ${s.activeStep + 1} of ${total} is running`
    case 'checkpoint':
      return s.activeStep >= total ? 'At the final checkpoint' : `Checkpoint before step ${s.activeStep + 1}`
    case 'waiting': {
      const names = [...new Set(blockers(s).map((p) => PEOPLE[p.assignee].name))]
      return `Waiting on ${names.join(' and ') || 'the team'}`
    }
    case 'handoff':
      return 'Handing off to another model'
    case 'done':
      return 'Done'
    case 'error':
      return 'Stopped on an error'
  }
}
