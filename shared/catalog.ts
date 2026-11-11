import type { Pace, PersonId } from './types.ts'

export const PEOPLE: Record<PersonId, { id: PersonId; name: string }> = {
  roy: { id: 'roy', name: 'Roy' },
  mia: { id: 'mia', name: 'Mia' },
}

export const PERSON_IDS: PersonId[] = ['roy', 'mia']

export function isPersonId(value: unknown): value is PersonId {
  return value === 'roy' || value === 'mia'
}

export interface ModelInfo {
  id: string
  label: string
  vendor: string
}

/** Models served through GMI Cloud. A session can be handed off between any two of them. */
export const MODELS: ModelInfo[] = [
  { id: 'Qwen/Qwen3.8-Flash', label: 'Qwen 3.8 Flash', vendor: 'Alibaba' },
  { id: 'google/gemini-3.8-flash', label: 'Gemini 3.8 Flash', vendor: 'Google' },
  { id: 'deepseek-ai/DeepSeek-V4.1-Flash', label: 'DeepSeek V4.1 Flash', vendor: 'DeepSeek' },
  { id: 'x-ai/grok-4.5', label: 'Grok 4.5', vendor: 'xAI' },
]

export const DEFAULT_MODEL = MODELS[0].id

export function modelLabel(id: string | null): string {
  if (!id) return ''
  return MODELS.find((m) => m.id === id)?.label ?? id
}

/**
 * Characters per second at which a step's text is released to the session.
 * Fast models finish a step in a few seconds, which leaves teammates no time to react mid-step.
 * 0 means real time: text is released as soon as the model sends it.
 */
export const PACE_CPS: Record<Pace, number> = { readable: 70, fast: 240, realtime: 0 }

export const PACES: Pace[] = ['readable', 'fast', 'realtime']
