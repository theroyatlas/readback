// Types shared by the server and the browser. Everything here is plain JSON.

export type PersonId = 'roy' | 'mia'

/** Language of the interface and of everything the agent writes about the work (readbacks, questions, checks). */
export type Lang = 'en' | 'zh'

export type StepStatus = 'pending' | 'running' | 'done'

/** A partial attempt that was thrown away because a teammate steered mid-step. */
export interface DiscardedAttempt {
  text: string
  steeredBy: string[]
}

export interface Step {
  id: string
  index: number
  title: string
  deliverable: string
  status: StepStatus
  output: string
  /** Model that ran (or is running) this step. */
  model: string | null
  /** The exact prompt sent to the model, so nothing is hidden from the team. */
  prompt: string | null
  /** Messages that reached the agent at this step (at its checkpoint, or by steering). */
  appliedMessageIds: string[]
  /** Subset of appliedMessageIds that interrupted this step while it was running. */
  steeredBy: string[]
  discarded: DiscardedAttempt[]
}

/** What kind of change a teammate's message makes to the work. */
export type IntentKind = 'add' | 'revise' | 'retract' | 'answer' | 'question'

/** steer = interrupt the running step now; queue = deliver at the next checkpoint. */
export type Route = 'steer' | 'queue'

export type MessageStatus =
  | 'delivered' // accepted by the server; the agent has not read it back yet
  | 'queued' // read back; waiting for the next checkpoint
  | 'steering' // read back; interrupting the running step right now
  | 'applied' // reached the agent (see appliedAtStep)
  | 'cancelled' // withdrawn by a teammate before it reached the agent

/** The agent's readback of one message. */
export interface Receipt {
  heard: string
  kind: IntentKind
  route: Route
  why: string
  expected: string
}

export interface Message {
  id: string
  by: PersonId
  text: string
  at: number
  /** Index of the step that was running (or about to run) when this was sent. */
  sentDuringStep: number
  status: MessageStatus
  receipt: Receipt | null
  appliedAtStep: number | null
  pinId: string | null
  /** Pins this message replaced. Withdrawing the message restores them. */
  supersededPinIds: string[]
  /** The approval gate this message opened, if any. */
  gateId: string | null
  /** Set when the readback call failed; the message is still queued, never dropped. */
  error: string | null
}

export type PinKind = 'constraint' | 'decision' | 'gate'

/** One line on the pinned board: a teammate's exact words that must outlive compaction and handoffs. */
export interface Pin {
  id: string
  kind: PinKind
  /** Verbatim. Never paraphrased, never summarized. */
  text: string
  /** For answers: the question this text answers. */
  context: string | null
  by: PersonId
  at: number
  status: 'active' | 'superseded'
  /** Scenario question used to test whether a model taking over has caught this pin. */
  check: { question: string; expected: string }
  sourceMessageId: string | null
}

export interface PendingItem {
  id: string
  kind: 'question' | 'gate'
  question: string
  assignee: PersonId
  /** Step index that cannot start without it, or 'final' for an approval before the work is finished. */
  neededByStep: number | 'final'
  status: 'open' | 'answered'
  answer: string | null
  answeredBy: PersonId | null
  at: number
}

export interface HandoffCheck {
  pinId: string
  question: string
  answer: string
  pass: boolean
  note: string
  /** True when the first answer failed and the pin had to be briefed again. */
  rebriefed: boolean
}

export interface Handoff {
  id: string
  fromModel: string
  toModel: string
  requestedBy: PersonId
  /** Checkpoint (index of the next step) where the handoff happened. */
  atStep: number | null
  status: 'requested' | 'writing' | 'quizzing' | 'done' | 'failed'
  note: string
  checks: HandoffCheck[]
  error: string | null
  at: number
}

/** Whether the finished deliverable actually follows one pinned instruction. */
export interface OutcomeCheck {
  pinId: string
  met: boolean
  /** The part of the deliverable that shows it, or what is missing. */
  evidence: string
}

/** The check of the final deliverable against the pinned board. */
export interface Outcome {
  stepIndex: number
  status: 'checking' | 'done' | 'failed'
  checks: OutcomeCheck[]
}

export type SessionStatus =
  | 'empty'
  | 'planning'
  | 'running'
  | 'checkpoint'
  | 'waiting' // blocked on a teammate's answer or approval
  | 'handoff'
  | 'done'
  | 'error'

export interface Session {
  id: string
  goal: string
  startedBy: PersonId | null
  model: string
  lang: Lang
  status: SessionStatus
  /** Index of the running step, or of the next step while at a checkpoint. */
  activeStep: number
  steps: Step[]
  messages: Message[]
  pins: Pin[]
  pending: PendingItem[]
  handoffs: Handoff[]
  outcome: Outcome | null
  /** How many times the agent added a step to fix what the outcome check found. */
  fixes: number
  /** Teammates typing right now. The agent holds at its next checkpoint for them. */
  typing: PersonId[]
  error: string | null
  version: number
}
