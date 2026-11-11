// Every prompt the agent sends, in one place, so the team (and a reviewer) can read exactly what the model is told.

import { PEOPLE, modelLabel } from '../shared/catalog.ts'
import type { Handoff, Lang, Message, Pin, Session, Step } from '../shared/types.ts'
import type { ChatMessage } from './gmi.ts'

/** The agent writes about the work in the team's language. Ids, enum values and quoted words never change. */
export function languageRule(lang: Lang): string {
  return lang === 'zh'
    ? 'Language: write every free-text field in Traditional Chinese as used in Taiwan. Keep enum values, ids and quoted teammate words exactly as given.'
    : 'Language: write every free-text field in English.'
}

export function activePins(s: Session): Pin[] {
  return s.pins.filter((p) => p.status === 'active')
}

/** The pinned board as text. Always verbatim, always at the top of the prompt, never summarized. */
export function boardText(s: Session): string {
  const pins = activePins(s)
  if (pins.length === 0) return '(nothing pinned yet)'
  return pins
    .map((p, i) => {
      const context = p.context ? ` (answer to: ${p.context})` : ''
      return `${i + 1}. [${p.kind}] "${p.text}" - ${PEOPLE[p.by].name}${context}`
    })
    .join('\n')
}

function planText(s: Session): string {
  if (s.steps.length === 0) return '(the plan is still being written)'
  return s.steps.map((step) => `${step.index + 1}. [${step.status}] ${step.title}`).join('\n')
}

const tail = (text: string, max: number) => (text.length > max ? `...${text.slice(-max)}` : text)

/** Earlier work, compacted. This is the part of the context that is allowed to lose detail. */
function digest(s: Session, upTo: number): string {
  const done = s.steps.slice(0, upTo).filter((step) => step.output)
  if (done.length === 0) return '(nothing yet)'
  return done
    .map((step, i) => `Step ${step.index + 1} - ${step.title}:\n${tail(step.output.trim(), i === done.length - 1 ? 1400 : 500)}`)
    .join('\n\n')
}

// ---------- plan ----------

export const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, deliverable: { type: 'string' } },
        required: ['title', 'deliverable'],
        additionalProperties: false,
      },
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          needed_by_step: { type: 'integer' },
          assignee: { type: 'string', enum: ['roy', 'mia'] },
        },
        required: ['question', 'needed_by_step', 'assignee'],
        additionalProperties: false,
      },
    },
  },
  required: ['steps', 'questions'],
  additionalProperties: false,
}

export interface PlanOut {
  steps: { title: string; deliverable: string }[]
  questions: { question: string; needed_by_step: number; assignee: string }[]
}

export function planMessages(s: Session): ChatMessage[] {
  const starter = s.startedBy ? PEOPLE[s.startedBy].name : 'a teammate'
  return [
    {
      role: 'system',
      content: [
        'You plan the work of one AI agent that a small team shares. Teammates: Roy and Mia.',
        'Break the goal into exactly 4 short steps. Every step produces text. The last step produces the final deliverable.',
        'Each step has a title of at most 6 words and a one-line deliverable.',
        'Questions: if a concrete fact is missing and would otherwise have to be invented (a date, a price, a name, a link, a number), ask for it instead of guessing. Ask at most 2 questions, each one short.',
        'For each question give the first step that needs the answer (1-based) and who should answer.',
        'Step 1 must be doable without the missing facts, so work can start while the team answers: needed_by_step is 2 or later.',
        `${starter} started the session and answers unless someone else clearly owns the fact.`,
        languageRule(s.lang),
      ].join('\n'),
    },
    { role: 'user', content: `Goal: ${s.goal}\n\nPinned board:\n${boardText(s)}\n\nReturn the plan as JSON.` },
  ]
}

// ---------- readback (the receipt for one message) ----------

export const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    heard: { type: 'string' },
    kind: { type: 'string', enum: ['add', 'revise', 'retract', 'answer', 'question'] },
    route: { type: 'string', enum: ['steer', 'queue'] },
    why: { type: 'string' },
    expected: { type: 'string' },
    pin_kind: { type: 'string', enum: ['none', 'constraint', 'decision', 'gate'] },
    check_question: { type: 'string' },
    check_expected: { type: 'string' },
    gate_assignee: { type: 'string', enum: ['none', 'roy', 'mia'] },
    gate_question: { type: 'string' },
    supersedes_pin_ids: { type: 'array', items: { type: 'string' } },
    answers_pending_id: { type: 'string' },
  },
  required: [
    'heard',
    'kind',
    'route',
    'why',
    'expected',
    'pin_kind',
    'check_question',
    'check_expected',
    'gate_assignee',
    'gate_question',
    'supersedes_pin_ids',
    'answers_pending_id',
  ],
  additionalProperties: false,
}

export interface ReceiptOut {
  heard: string
  kind: string
  route: string
  why: string
  expected: string
  pin_kind: string
  check_question: string
  check_expected: string
  gate_assignee: string
  gate_question: string
  supersedes_pin_ids: string[]
  answers_pending_id: string
}

export function receiptMessages(s: Session, m: Message): ChatMessage[] {
  const pins = activePins(s)
  const board = pins.length
    ? pins.map((p) => `${p.id} [${p.kind}] "${p.text}" - ${PEOPLE[p.by].name}`).join('\n')
    : '(nothing pinned yet)'
  const open = s.pending.filter((p) => p.status === 'open')
  const waiting = open.length
    ? open.map((p) => `${p.id} "${p.question}" - waiting on ${PEOPLE[p.assignee].name}`).join('\n')
    : '(none)'
  const running = s.status === 'running' ? s.steps[s.activeStep] : null
  return [
    {
      role: 'system',
      content: [
        'You are the readback layer of a shared AI agent session. Several teammates talk to one agent while it works through a plan, step by step.',
        'For every teammate message you write a receipt: what you understood, what kind of change it is, and when it should reach the agent.',
        '',
        'heard: restate the message in one sentence of at most 22 words, addressed to the sender ("You want ...").',
        'kind: add (extends the work), revise (changes something already decided or written), retract (withdraws an earlier instruction), answer (answers an open question), question (asks the agent something).',
        '',
        'route:',
        '- steer = interrupt the step that is running right now and restart it. Use it only when carrying on would waste the running step: the message corrects a fact, a name or a direction that the running step is using right now, retracts what is being written right now, or tells the agent to stop.',
        '- queue = deliver at the next checkpoint, the boundary before the next step. Use it for additions, new constraints, style preferences, approvals, and anything that does not make the running step wrong. When unsure, queue.',
        'why: the reason for the route, at most 14 words.',
        'expected: the visible outcome once it is applied, at most 16 words.',
        '',
        'pin_kind: pin the message when later steps, a compacted context, or a different model taking over must still respect it.',
        '- constraint: a limit or a rule for the output (length, tone, must, must not).',
        '- decision: a settled fact or choice (a date, a name, a price, an answer).',
        '- gate: a named person must approve before the work is finished or published.',
        '- none: questions, one-off remarks, and instructions that only matter for one step.',
        'For a pin, write check_question: one concrete scenario question that reveals whether a model taking over knows this pin and would follow it. Ask what the model must do or must not do in a situation ("A teammate asks you to add two more paragraphs. What limit applies?"). Never ask about the current state of the draft. Write check_expected: the correct answer in one sentence. Otherwise leave both empty.',
        'For a gate, set gate_assignee to the person who must approve and gate_question to the approval being asked for. Otherwise use "none" and an empty string.',
        'supersedes_pin_ids: ids of pins on the board that this message replaces or withdraws. Usually empty.',
        'answers_pending_id: the id of the open question this message answers, or an empty string.',
        languageRule(s.lang),
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `Goal: ${s.goal}`,
        '',
        `Plan:\n${planText(s)}`,
        running ? `Running right now: step ${running.index + 1} - ${running.title}` : 'No step is running right now.',
        '',
        `Pinned board:\n${board}`,
        '',
        `Open questions:\n${waiting}`,
        '',
        `New message from ${PEOPLE[m.by].name}: "${m.text}"`,
        '',
        s.lang === 'zh'
          ? 'Return the receipt as JSON. Write heard, why, expected, check_question, check_expected and gate_question in Traditional Chinese (Taiwan).'
          : 'Return the receipt as JSON.',
      ].join('\n'),
    },
  ]
}

// ---------- one step of work ----------

export function stepMessages(s: Session, step: Step): ChatMessage[] {
  const byId = new Map(s.messages.map((m) => [m.id, m]))
  const describe = (id: string) => {
    const m = byId.get(id)
    if (!m) return null
    const heard = m.receipt?.heard ? ` (read back as: ${m.receipt.heard})` : ''
    return `- ${PEOPLE[m.by].name}: "${m.text}"${heard}`
  }
  const steered = step.steeredBy.map(describe).filter(Boolean)
  const atCheckpoint = step.appliedMessageIds
    .filter((id) => !step.steeredBy.includes(id))
    .map(describe)
    .filter(Boolean)

  const user = [
    `Goal: ${s.goal}`,
    '',
    `Work so far (compacted digest):\n${digest(s, step.index)}`,
  ]
  if (atCheckpoint.length) user.push('', `Teammate messages delivered at this checkpoint:\n${atCheckpoint.join('\n')}`)
  if (steered.length) {
    user.push(
      '',
      `You were interrupted mid-step. Your partial attempt was discarded. Restart this step and follow this correction:\n${steered.join('\n')}`,
    )
  }
  user.push(
    '',
    `Now do step ${step.index + 1} of ${s.steps.length}: ${step.title}`,
    `Deliverable: ${step.deliverable}`,
    'Write only the deliverable, in plain text without markdown headings. Keep it under 150 words.',
  )

  return [
    {
      role: 'system',
      content: [
        'You are the shared agent of a small team. Teammates: Roy and Mia.',
        '',
        'PINNED BOARD - the exact words of your teammates. These always win over the digest, over your own earlier text, and over your defaults:',
        boardText(s),
        '',
        'Never invent concrete facts (dates, prices, names, numbers, links). If one is missing from the board and the goal, write [NEEDS: what is missing] in its place. Wording, angle and structure are yours to choose.',
        'The deliverable is for the audience named in the goal. Do not address your teammates inside it.',
      ].join('\n'),
    },
    { role: 'user', content: user.join('\n') },
  ]
}

export function renderPrompt(messages: ChatMessage[]): string {
  return messages.map((m) => `${m.role.toUpperCase()}\n${m.content}`).join('\n\n----------\n\n')
}

// ---------- outcome check ----------

export const OUTCOME_SCHEMA = {
  type: 'object',
  properties: {
    checks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { pin_id: { type: 'string' }, met: { type: 'boolean' }, evidence: { type: 'string' } },
        required: ['pin_id', 'met', 'evidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['checks'],
  additionalProperties: false,
}

export interface OutcomeOut {
  checks: { pin_id: string; met: boolean; evidence: string }[]
}

/** A readback says what the agent understood. This checks what it actually delivered. */
export function outcomeMessages(s: Session, pins: Pin[], deliverable: string): ChatMessage[] {
  const words = deliverable.trim().split(/\s+/).filter(Boolean).length
  const rows = pins.map((p) => `${p.id} [${p.kind}] "${p.text}"${p.context ? ` (answer to: ${p.context})` : ''}`).join('\n')
  return [
    {
      role: 'system',
      content: [
        'You check a finished deliverable against the instructions a team pinned while it was being written.',
        'For each pin decide met: true only when the deliverable itself follows it. Judge from the deliverable text, not from intentions.',
        'evidence: quote the part of the deliverable that shows it (at most 12 words), or say what is missing or wrong.',
        'The word and character counts are measured for you. Use them as given and do not recount.',
        languageRule(s.lang),
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Pinned instructions:\n${rows}\n\nDeliverable:\n${deliverable.trim()}\n\nMeasured: ${words} words, ${deliverable.trim().length} characters.\n\nReturn one check per pin id as JSON.`,
    },
  ]
}

// ---------- handoff ----------

/** Built from session state, not written by a model: the pinned words go across verbatim. */
export function handoffNote(s: Session, h: Handoff, nextStep: number): string {
  const done = s.steps.filter((step) => step.status === 'done')
  const latest = done[done.length - 1]
  const next = s.steps[nextStep]
  const open = s.pending.filter((p) => p.status === 'open')
  return [
    `HANDOFF NOTE - ${modelLabel(h.fromModel)} to ${modelLabel(h.toModel)}`,
    '',
    `Goal: ${s.goal}`,
    '',
    'Done so far:',
    done.length ? done.map((step) => `- Step ${step.index + 1}: ${step.title}`).join('\n') : '- (nothing yet)',
    '',
    'Latest output:',
    latest ? tail(latest.output.trim(), 900) : '(none)',
    '',
    `Next: ${next ? `step ${next.index + 1} - ${next.title}` : 'nothing left; the work is ready for sign-off'}`,
    '',
    'Pinned board (exact words of the team; these always win):',
    boardText(s),
    '',
    'Open questions waiting on people:',
    open.length ? open.map((p) => `- ${p.question} (waiting on ${PEOPLE[p.assignee].name})`).join('\n') : '- (none)',
  ].join('\n')
}

export const TAKEOVER_SCHEMA = {
  type: 'object',
  properties: {
    answers: {
      type: 'array',
      items: {
        type: 'object',
        properties: { pin_id: { type: 'string' }, answer: { type: 'string' } },
        required: ['pin_id', 'answer'],
        additionalProperties: false,
      },
    },
  },
  required: ['answers'],
  additionalProperties: false,
}

export interface TakeoverOut {
  answers: { pin_id: string; answer: string }[]
}

export function takeoverMessages(note: string, pins: Pin[], rebrief: boolean, lang: Lang): ChatMessage[] {
  const questions = pins.map((p) => `${p.id}: ${p.check.question}`).join('\n')
  const extra = rebrief
    ? `\n\nYou missed these on the first try. Read them again, word for word:\n${pins.map((p) => `- "${p.text}"`).join('\n')}`
    : ''
  return [
    {
      role: 'system',
      content:
        'You are taking over a task in progress from another AI model. All you know is the handoff note. Before you may continue, answer each check question in one or two sentences, based only on the note. If the note does not tell you, say so. ' + languageRule(lang),
    },
    { role: 'user', content: `${note}${extra}\n\nCheck questions (answer each one, keep its id):\n${questions}\n\nReturn JSON.` },
  ]
}

export const GRADE_SCHEMA = {
  type: 'object',
  properties: {
    grades: {
      type: 'array',
      items: {
        type: 'object',
        properties: { pin_id: { type: 'string' }, pass: { type: 'boolean' }, note: { type: 'string' } },
        required: ['pin_id', 'pass', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['grades'],
  additionalProperties: false,
}

export interface GradeOut {
  grades: { pin_id: string; pass: boolean; note: string }[]
}

export function gradeMessages(pins: Pin[], answers: Map<string, string>, lang: Lang): ChatMessage[] {
  const rows = pins
    .map((p) =>
      [
        `${p.id}`,
        `  pinned words: "${p.text}"`,
        `  question: ${p.check.question}`,
        `  expected: ${p.check.expected}`,
        `  answer from the model taking over: ${answers.get(p.id) ?? '(no answer)'}`,
      ].join('\n'),
    )
    .join('\n\n')
  return [
    {
      role: 'system',
      content:
        'You grade whether a model that is taking over a task has caught each pinned instruction. Pass when the answer shows the model knows the pinned instruction and would follow it. A vague, missing or contradicting answer fails. note: at most 12 words. ' + languageRule(lang),
    },
    { role: 'user', content: `${rows}\n\nReturn one grade per pin id as JSON.` },
  ]
}
