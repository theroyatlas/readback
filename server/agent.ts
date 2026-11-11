// The agent loop: plan, then run step by step with a checkpoint before every step.
// Teammate messages never touch the model directly. Each one gets a readback (receipt) first,
// then either waits for the next checkpoint (queue) or interrupts the running step (steer).

import { randomUUID } from 'node:crypto'
import { MODELS, PEOPLE, PERSON_IDS, isPersonId, modelLabel } from '../shared/catalog.ts'
import type { Handoff, HandoffCheck, IntentKind, Message, PendingItem, PersonId, Pin, PinKind, Session, Step } from '../shared/types.ts'
import { jsonChat, streamChat } from './gmi.ts'
import * as prompts from './prompts.ts'
import { settle, touch, track, waitForWake, wake } from './store.ts'
import type { Runtime } from './store.ts'

const uid = (prefix: string) => `${prefix}_${randomUUID().slice(0, 6)}`
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const clip = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max)
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

function newStep(index: number, title: string, deliverable: string): Step {
  return {
    id: uid('s'),
    index,
    title,
    deliverable,
    status: 'pending',
    output: '',
    model: null,
    prompt: null,
    appliedMessageIds: [],
    steeredBy: [],
    discarded: [],
  }
}

// ---------- commands (called by the HTTP layer) ----------

export function start(rt: Runtime, goal: string, by: PersonId): void {
  const s = rt.session
  if (s.status !== 'empty') throw new Error('This session already has a goal. Reset it first.')
  s.goal = goal
  s.startedBy = by
  s.status = 'planning'
  touch(rt)
  rt.loop = runFrom(rt, 0, true)
}

export function postMessage(rt: Runtime, text: string, by: PersonId): Message {
  const s = rt.session
  if (s.status === 'empty') throw new Error('Start the session with a goal first.')
  const message: Message = {
    id: uid('m'),
    by,
    text,
    at: Date.now(),
    sentDuringStep: Math.min(s.activeStep, Math.max(0, s.steps.length - 1)),
    status: 'delivered',
    receipt: null,
    appliedAtStep: null,
    pinId: null,
    supersededPinIds: [],
    gateId: null,
    error: null,
  }
  s.messages.push(message)
  rt.typing.delete(by)
  syncTyping(rt)
  touch(rt)
  track(rt, writeReceipt(rt, message))
  return message
}

/** A teammate is typing. The agent will hold at its next checkpoint until the message is sent. */
export function typing(rt: Runtime, by: PersonId): void {
  rt.typing.set(by, Date.now() + 2500)
  syncTyping(rt)
  setTimeout(() => syncTyping(rt), 2600)
}

function syncTyping(rt: Runtime): void {
  const now = Date.now()
  const active = PERSON_IDS.filter((who) => (rt.typing.get(who) ?? 0) > now)
  if (active.join() === rt.session.typing.join()) return
  rt.session.typing = active
  touch(rt)
}

/** A teammate overrides the route the agent proposed: send it now, or withdraw it. */
export function overrideMessage(rt: Runtime, messageId: string, action: 'steer' | 'cancel'): void {
  const s = rt.session
  const message = s.messages.find((m) => m.id === messageId)
  if (!message) throw new Error('No such message.')
  if (message.status !== 'queued' && message.status !== 'delivered') {
    throw new Error('This message already reached the agent.')
  }
  if (action === 'cancel') {
    message.status = 'cancelled'
    const pin = s.pins.find((p) => p.id === message.pinId)
    if (pin) pin.status = 'superseded'
    // Withdrawing a message also undoes what it changed: the pins it replaced come back, its gate closes.
    for (const id of message.supersededPinIds) {
      const old = s.pins.find((p) => p.id === id)
      if (old) old.status = 'active'
    }
    s.pending = s.pending.filter((p) => !(p.id === message.gateId && p.status === 'open'))
  } else {
    if (message.receipt) {
      message.receipt.route = 'steer'
      message.receipt.why = `${PEOPLE[message.by].name} chose to interrupt instead of waiting.`
    }
    steer(rt, message)
  }
  touch(rt)
  wake(rt)
}

export function answerPending(rt: Runtime, pendingId: string, text: string, by: PersonId): void {
  const s = rt.session
  const item = s.pending.find((p) => p.id === pendingId)
  if (!item) throw new Error('No such question.')
  if (item.status !== 'open') throw new Error('This was already answered.')
  const message: Message = {
    id: uid('m'),
    by,
    text,
    at: Date.now(),
    sentDuringStep: Math.min(s.activeStep, Math.max(0, s.steps.length - 1)),
    status: 'applied',
    receipt: {
      heard: `Your answer to "${item.question}"`,
      kind: 'answer',
      route: 'queue',
      why: 'It answers an open question, so nothing is interrupted.',
      expected: item.kind === 'gate' ? 'The work can be finished.' : 'Pinned as a decision and used from the next step on.',
    },
    appliedAtStep: Math.min(s.activeStep, s.steps.length),
    pinId: null,
    supersededPinIds: [],
    gateId: null,
    error: null,
  }
  s.messages.push(message)
  resolvePending(s, item, text, by, message)
  touch(rt)
  wake(rt)
  kick(rt)
}

export function requestHandoff(rt: Runtime, toModel: string, by: PersonId): void {
  const s = rt.session
  if (s.status === 'empty') throw new Error('Start the session first.')
  if (!MODELS.some((m) => m.id === toModel)) throw new Error('Unknown model.')
  if (toModel === s.model) throw new Error('That model is already running this session.')
  if (s.handoffs.some((h) => h.status !== 'done' && h.status !== 'failed')) throw new Error('A handoff is already in progress.')
  s.handoffs.push({
    id: uid('h'),
    fromModel: s.model,
    toModel,
    requestedBy: by,
    atStep: null,
    status: 'requested',
    note: '',
    checks: [],
    error: null,
    at: Date.now(),
  })
  touch(rt)
  wake(rt)
  kick(rt)
}

/** Picks the loop back up after an error, from the step it stopped at. */
export function retry(rt: Runtime): void {
  const s = rt.session
  if (s.status !== 'error' || rt.loop) return
  s.error = null
  const needsPlan = s.steps.length === 0
  s.status = needsPlan ? 'planning' : 'checkpoint'
  touch(rt)
  rt.loop = runFrom(rt, s.activeStep, needsPlan)
}

// ---------- readback ----------

function resolvePending(s: Session, item: PendingItem, text: string, by: PersonId, message: Message): void {
  item.status = 'answered'
  item.answer = text
  item.answeredBy = by
  if (item.kind === 'gate') return // the gate itself is already on the board
  const pin: Pin = {
    id: uid('p'),
    kind: 'decision',
    text,
    context: item.question,
    by,
    at: Date.now(),
    status: 'active',
    check: { question: item.question, expected: text },
    sourceMessageId: message.id,
  }
  s.pins.push(pin)
  message.pinId = pin.id
}

async function writeReceipt(rt: Runtime, message: Message): Promise<void> {
  const s = rt.session
  try {
    const out = await jsonChat<prompts.ReceiptOut>({
      model: s.model,
      messages: prompts.receiptMessages(s, message),
      schema: prompts.RECEIPT_SCHEMA,
      name: 'receipt',
      maxTokens: 700,
    })
    if (rt.session !== s || message.status !== 'delivered') return // reset or withdrawn while we were reading it back

    const kinds: IntentKind[] = ['add', 'revise', 'retract', 'answer', 'question']
    const kind = (kinds as string[]).includes(out.kind) ? (out.kind as IntentKind) : 'add'
    message.receipt = {
      heard: clip(out.heard, 240) || message.text,
      kind,
      route: out.route === 'steer' ? 'steer' : 'queue',
      why: clip(out.why, 160),
      expected: clip(out.expected, 160),
    }

    // Pins this message replaces or withdraws stay visible on the board, marked as superseded.
    for (const id of Array.isArray(out.supersedes_pin_ids) ? out.supersedes_pin_ids : []) {
      const old = s.pins.find((p) => p.id === id && p.status === 'active')
      if (!old) continue
      old.status = 'superseded'
      message.supersededPinIds.push(old.id)
    }

    const answered = s.pending.find((p) => p.id === out.answers_pending_id && p.status === 'open')
    if (answered) {
      message.receipt.kind = 'answer'
      message.receipt.route = 'queue'
      resolvePending(s, answered, message.text, message.by, message)
      message.status = 'applied'
      message.appliedAtStep = Math.min(s.activeStep, s.steps.length)
      return
    }

    const pinKinds: PinKind[] = ['constraint', 'decision', 'gate']
    if ((pinKinds as string[]).includes(out.pin_kind)) {
      const pin: Pin = {
        id: uid('p'),
        kind: out.pin_kind as PinKind,
        text: message.text, // the teammate's exact words, never the paraphrase
        context: null,
        by: message.by,
        at: Date.now(),
        status: 'active',
        check: {
          question: clip(out.check_question, 300) || `What must you respect about: "${message.text}"?`,
          expected: clip(out.check_expected, 300) || message.text,
        },
        sourceMessageId: message.id,
      }
      s.pins.push(pin)
      message.pinId = pin.id
      if (pin.kind === 'gate') {
        message.gateId = uid('q')
        s.pending.push({
          id: message.gateId,
          kind: 'gate',
          question: clip(out.gate_question, 200) || `Approve the result before it is finished? ("${message.text}")`,
          assignee: isPersonId(out.gate_assignee) ? out.gate_assignee : message.by,
          neededByStep: 'final',
          status: 'open',
          answer: null,
          answeredBy: null,
          at: Date.now(),
        })
      }
    }

    if (message.receipt.route === 'steer') steer(rt, message)
    else message.status = 'queued'
  } catch (err) {
    if (rt.session !== s || message.status !== 'delivered') return
    // A failed readback must never drop the message: it waits for the next checkpoint as written.
    message.error = errorText(err)
    message.receipt = {
      heard: message.text,
      kind: 'add',
      route: 'queue',
      why: 'The readback failed, so your exact words wait for the next checkpoint.',
      expected: '',
    }
    message.status = 'queued'
  } finally {
    if (rt.session === s) {
      touch(rt)
      wake(rt)
      kick(rt)
    }
  }
}

function steer(rt: Runtime, message: Message): void {
  const s = rt.session
  if (rt.abort && s.status === 'running') {
    message.status = 'steering'
    rt.steering.push(message.id)
    rt.abort.abort()
    return
  }
  // Nothing is running, so there is nothing to interrupt: it lands at the checkpoint we are at.
  message.status = 'queued'
  if (message.receipt) {
    message.receipt.route = 'queue'
    message.receipt.why = 'No step was running, so it lands at this checkpoint without interrupting anything.'
  }
}

// ---------- the loop ----------

function hasWork(s: Session): boolean {
  return s.messages.some((m) => m.status === 'queued') || s.handoffs.some((h) => h.status === 'requested')
}

/** Restarts the loop when something arrives after the plan was finished. */
function kick(rt: Runtime): void {
  const s = rt.session
  if (rt.loop || s.status !== 'done' || !hasWork(s)) return
  s.status = 'checkpoint'
  rt.loop = runFrom(rt, s.steps.length, false)
}

async function runFrom(rt: Runtime, from: number, plan: boolean): Promise<void> {
  const s = rt.session
  const alive = () => rt.session === s
  try {
    if (plan) await makePlan(rt)
    let i = from
    while (alive()) {
      await checkpoint(rt, i, alive)
      if (!alive() || i >= s.steps.length) break
      for (;;) {
        const result = await runStep(rt, i, alive)
        if (!alive() || result === 'done') break
        // Steered: the messages that interrupted are applied on the rerun.
        const step = s.steps[i]
        for (const id of rt.steering.splice(0)) {
          const message = s.messages.find((m) => m.id === id)
          if (!message || message.status !== 'steering') continue
          message.status = 'applied'
          message.appliedAtStep = i
          step.appliedMessageIds.push(id)
          step.steeredBy.push(id)
        }
        touch(rt)
      }
      i += 1
    }
    if (!alive()) return
    s.status = 'done'
    s.activeStep = s.steps.length
  } catch (err) {
    if (!alive()) return
    s.status = 'error'
    s.error = errorText(err)
  } finally {
    if (alive()) {
      rt.loop = null
      rt.abort = null
      touch(rt)
      kick(rt)
    }
  }
}

async function makePlan(rt: Runtime): Promise<void> {
  const s = rt.session
  const out = await jsonChat<prompts.PlanOut>({
    model: s.model,
    messages: prompts.planMessages(s),
    schema: prompts.PLAN_SCHEMA,
    name: 'plan',
    maxTokens: 700,
  })
  if (rt.session !== s) return
  const steps = (Array.isArray(out.steps) ? out.steps : []).slice(0, 5)
  if (steps.length === 0) throw new Error('The model returned an empty plan.')
  s.steps = steps.map((step, index) => newStep(index, clip(step.title, 80) || `Step ${index + 1}`, clip(step.deliverable, 240)))
  for (const q of (Array.isArray(out.questions) ? out.questions : []).slice(0, 2)) {
    const question = clip(q.question, 200)
    if (!question) continue
    const needed = Number.isInteger(q.needed_by_step) ? q.needed_by_step - 1 : 1
    s.pending.push({
      id: uid('q'),
      kind: 'question',
      question,
      assignee: isPersonId(q.assignee) ? q.assignee : (s.startedBy ?? 'roy'),
      // Never block the very first step: work starts while the team answers.
      neededByStep: Math.min(Math.max(needed, 1), s.steps.length - 1),
      status: 'open',
      answer: null,
      answeredBy: null,
      at: Date.now(),
    })
  }
  touch(rt)
}

/**
 * The boundary before step i. Queued messages land here, handoffs happen here,
 * and the agent waits here when a teammate still owes it an answer or an approval.
 */
async function checkpoint(rt: Runtime, i: number, alive: () => boolean): Promise<void> {
  const s = rt.session
  let held = 0
  for (;;) {
    s.status = 'checkpoint'
    s.activeStep = i
    touch(rt)
    await settle(rt, 8000) // let readbacks in flight finish, so a delivered message cannot slip past
    if (!alive()) return

    const queued = s.messages.filter((m) => m.status === 'queued')
    if (queued.length) {
      if (i >= s.steps.length) {
        // The plan was finished, but a teammate still had something to say: add a step for it.
        s.steps.push(
          newStep(s.steps.length, 'Apply late instructions', 'The final deliverable, revised to follow the pinned board and the new messages.'),
        )
      }
      for (const message of queued) {
        message.status = 'applied'
        message.appliedAtStep = i
        s.steps[i].appliedMessageIds.push(message.id)
      }
      touch(rt)
    }

    const handoff = s.handoffs.find((h) => h.status === 'requested')
    if (handoff) {
      await doHandoff(rt, handoff, i)
      if (!alive()) return
      continue
    }

    // Before the work can be signed off, check the deliverable itself against the board.
    if (i >= s.steps.length && s.steps.length > 0 && s.outcome?.stepIndex !== s.steps.length - 1) {
      const addedFix = await checkOutcome(rt, s.steps.length - 1)
      if (!alive() || addedFix) return
    }

    // Someone is still typing: hold here, so the message lands at this checkpoint instead of arriving late.
    if (s.typing.length > 0 && held < 15_000) {
      await sleep(300)
      held += 300
      continue
    }

    const finishing = i >= s.steps.length
    const blockers = s.pending.filter(
      (p) => p.status === 'open' && (p.neededByStep === 'final' ? finishing : p.neededByStep <= i),
    )
    if (blockers.length === 0) return
    s.status = 'waiting'
    touch(rt)
    await waitForWake(rt)
    if (!alive()) return
  }
}

async function runStep(rt: Runtime, i: number, alive: () => boolean): Promise<'done' | 'steered'> {
  const s = rt.session
  const step = s.steps[i]
  const messages = prompts.stepMessages(s, step)
  step.status = 'running'
  step.output = ''
  step.model = s.model
  step.prompt = prompts.renderPrompt(messages)
  s.status = 'running'
  s.activeStep = i
  touch(rt)

  const controller = new AbortController()
  rt.abort = controller
  let failure: unknown = null
  try {
    await streamChat({
      model: s.model,
      messages,
      maxTokens: 900,
      signal: controller.signal,
      onDelta: (piece) => {
        if (!alive()) return
        step.output += piece
        touch(rt)
      },
    })
  } catch (err) {
    failure = err
  }
  if (!alive()) return 'done'
  rt.abort = null

  if (controller.signal.aborted) {
    step.discarded.push({ text: step.output, steeredBy: [...rt.steering] })
    step.output = ''
    return 'steered'
  }
  if (failure) throw failure
  if (!step.output.trim()) throw new Error(`${modelLabel(s.model)} returned no text for step ${i + 1}.`)
  step.status = 'done'
  touch(rt)
  return 'done'
}

// ---------- outcome check ----------

/** How many extra steps the agent may add to fix what the outcome check found. */
const MAX_FIXES = 2

/**
 * Checks the final deliverable against every pinned constraint and decision.
 * If something was not followed, the agent gets an extra step to fix it (at most MAX_FIXES times). Returns true when that step was added.
 */
async function checkOutcome(rt: Runtime, last: number): Promise<boolean> {
  const s = rt.session
  const pins = prompts.activePins(s).filter((p) => p.kind !== 'gate') // gates are enforced by the checkpoint itself
  const outcome = { stepIndex: last, status: 'checking' as 'checking' | 'done' | 'failed', checks: [] as { pinId: string; met: boolean; evidence: string }[] }
  s.outcome = outcome
  touch(rt)
  if (pins.length === 0) {
    outcome.status = 'done'
    touch(rt)
    return false
  }
  try {
    const out = await jsonChat<prompts.OutcomeOut>({
      model: s.model,
      messages: prompts.outcomeMessages(s, pins, s.steps[last].output),
      schema: prompts.OUTCOME_SCHEMA,
      name: 'outcome',
      maxTokens: 900,
    })
    if (rt.session !== s) return false
    const byPin = new Map((Array.isArray(out.checks) ? out.checks : []).map((c) => [String(c.pin_id), c]))
    outcome.checks = pins.map((p) => ({ pinId: p.id, met: byPin.get(p.id)?.met === true, evidence: clip(byPin.get(p.id)?.evidence, 240) }))
    outcome.status = 'done'
  } catch {
    if (rt.session !== s) return false
    outcome.status = 'failed'
    touch(rt)
    return false
  }
  touch(rt)

  const missed = pins.filter((p) => !outcome.checks.find((c) => c.pinId === p.id)?.met)
  if (missed.length === 0 || s.fixes >= MAX_FIXES) return false
  s.fixes += 1
  s.steps.push(
    newStep(
      s.steps.length,
      s.lang === 'zh' ? '修正沒做到的項目' : 'Fix what the check found',
      `The complete final deliverable again, corrected. The check found: ${missed
        .map((p) => `"${p.text}" was not followed (${outcome.checks.find((c) => c.pinId === p.id)?.evidence ?? 'no evidence'})`)
        .join('; ')}`,
    ),
  )
  touch(rt)
  return true
}

// ---------- handoff ----------

/**
 * Hands the session to another model at a checkpoint.
 * The note is built from state, so the pinned words cross verbatim.
 * The model taking over must then answer one scenario question per pin before it may continue.
 */
async function doHandoff(rt: Runtime, h: Handoff, i: number): Promise<void> {
  const s = rt.session
  s.status = 'handoff'
  h.atStep = i
  h.status = 'writing'
  h.note = prompts.handoffNote(s, h, i)
  touch(rt)
  try {
    const pins = prompts.activePins(s)
    if (pins.length) {
      h.status = 'quizzing'
      h.checks = pins.map((p) => ({ pinId: p.id, question: p.check.question, answer: '', pass: false, note: '', rebriefed: false }))
      touch(rt)
      await quiz(rt, h, pins, false)
      if (rt.session !== s) return
      const missed = pins.filter((p) => !h.checks.find((c) => c.pinId === p.id)?.pass)
      if (missed.length) {
        for (const check of h.checks) if (!check.pass) check.rebriefed = true
        touch(rt)
        await quiz(rt, h, missed, true)
        if (rt.session !== s) return
        // Still missing a pin after the second briefing: the new model does not get the session.
        if (h.checks.some((c) => !c.pass)) throw new Error('The new model still missed a pinned instruction after a second briefing.')
      }
    }
    h.status = 'done'
    s.model = h.toModel
  } catch (err) {
    if (rt.session !== s) return
    h.status = 'failed'
    h.error = errorText(err)
  }
  touch(rt)
}

async function quiz(rt: Runtime, h: Handoff, pins: Pin[], rebrief: boolean): Promise<void> {
  const taken = await jsonChat<prompts.TakeoverOut>({
    model: h.toModel,
    messages: prompts.takeoverMessages(h.note, pins, rebrief, rt.session.lang),
    schema: prompts.TAKEOVER_SCHEMA,
    name: 'takeover',
    maxTokens: 900,
  })
  const answers = new Map<string, string>()
  for (const a of Array.isArray(taken.answers) ? taken.answers : []) answers.set(String(a.pin_id), clip(a.answer, 400))
  const byPin = new Map<string, HandoffCheck>(h.checks.map((c) => [c.pinId, c]))
  for (const pin of pins) {
    const check = byPin.get(pin.id)
    if (check) check.answer = answers.get(pin.id) ?? ''
  }
  touch(rt)

  // The outgoing model grades: it is the one that knows what the team meant.
  const graded = await jsonChat<prompts.GradeOut>({
    model: h.fromModel,
    messages: prompts.gradeMessages(pins, answers, rt.session.lang),
    schema: prompts.GRADE_SCHEMA,
    name: 'grades',
    maxTokens: 700,
  })
  for (const g of Array.isArray(graded.grades) ? graded.grades : []) {
    const check = byPin.get(String(g.pin_id))
    if (!check) continue
    check.pass = g.pass === true
    check.note = clip(g.note, 160)
  }
  touch(rt)
}
