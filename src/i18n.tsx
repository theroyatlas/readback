import { createContext, useContext } from 'react'
import type { Lang } from '../shared/types.ts'

// Interface text in both languages. {name} style placeholders are filled by translate().
const STRINGS = {
  // top bar
  'model': { en: 'Model', zh: '模型' },
  'handoff.button': { en: 'Hand off', zh: '交棒' },
  'handoff.target': { en: 'Model to hand off to', zh: '要交棒給哪個模型' },
  'youAre': { en: 'You are', zh: '你是' },
  'reset': { en: 'Reset', zh: '重置' },
  'reset.title': { en: 'Throw this session away and start over', zh: '丟掉這次的工作，重新開始' },
  'retry': { en: 'Retry', zh: '重試' },
  'live': { en: 'Live', zh: '已連線' },
  'reconnecting': { en: 'Reconnecting', zh: '重新連線中' },

  // status
  'status.empty': { en: 'No goal yet', zh: '還沒有目標' },
  'status.planning': { en: 'Planning the work', zh: '正在排計畫' },
  'status.running': { en: 'Step {n} of {total} is running', zh: '第 {n} 步進行中（共 {total} 步）' },
  'status.checkpoint': { en: 'Checkpoint before step {n}', zh: '第 {n} 步前的檢查點' },
  'status.checkpointFinal': { en: 'At the final checkpoint', zh: '最後的檢查點' },
  'status.waiting': { en: 'Waiting on {names}', zh: '在等 {names}' },
  'status.holding': { en: 'Holding for {names} to finish typing', zh: '在等 {names} 把話打完' },
  'status.checking': { en: 'Checking the result against the board', zh: '正在對照記憶板檢查成品' },
  'status.handoff': { en: 'Handing off to another model', zh: '正在交棒給另一個模型' },
  'status.done': { en: 'Done', zh: '完成' },
  'status.error': { en: 'Stopped on an error', zh: '出錯停住了' },
  'and': { en: ' and ', zh: '、' },
  'theTeam': { en: 'the team', zh: '隊友' },

  // guide: what to do next
  'guide.label': { en: 'Next', zh: '下一步' },
  'guide.planning': { en: 'The agent is breaking the goal into steps. Watch the lanes.', zh: 'agent 正在把目標拆成幾步，看上面的跑道。' },
  'guide.answer': {
    en: 'The agent is waiting on you. Answer the question under "Waiting on people".',
    zh: 'agent 在等你。到「等人處理」回答它的問題。',
  },
  'guide.other': {
    en: 'The agent is waiting on {name}. Switch "You are" to {name} to answer.',
    zh: 'agent 在等 {name}。把上方的「你是」切成 {name} 來回答。',
  },
  'guide.queued': {
    en: 'A message is queued. It lands at the next checkpoint, or press "Steer now" to interrupt.',
    zh: '有一句話在排隊，到下一個檢查點才生效。想馬上生效，就按那則訊息上的「立刻插話」。',
  },
  'guide.say': {
    en: 'Say something while the agent works, for example: "Keep the final post under 60 words."',
    zh: '趁 agent 在做事，對它說一句話，例如：「最後的貼文控制在 60 字以內。」',
  },
  'guide.handoff': {
    en: 'Try a handoff: pick another model at the top and press "Hand off". It must pass a check on every pin.',
    zh: '試試交棒：在上方選另一個模型，按「交棒」。新模型要先通過記憶板每一條的考題。',
  },
  'guide.more': {
    en: 'Keep talking to the agent, or correct it mid-step to see a steer.',
    zh: '可以繼續對 agent 說話，或在它做到一半時糾正它，看看「插話」。',
  },
  'guide.holding': {
    en: 'The agent sees {names} typing and holds at this checkpoint, so the message is not late.',
    zh: 'agent 看到 {names} 正在打字，所以停在這個檢查點等，這句話不會晚到。',
  },
  'guide.done': { en: 'Done. Send another message to revise it, or press "Reset" to start over.', zh: '完成了。再說一句話可以修改成果，或按「重置」重來。' },
  'guide.error': { en: 'Something failed. Press "Retry".', zh: '出錯了，按「重試」。' },

  // lanes
  'you': { en: 'you', zh: '你' },
  'You': { en: 'You', zh: '你' },
  'agent': { en: 'Agent', zh: 'Agent' },
  'typing': { en: 'typing', zh: '正在輸入' },
  'notStarted': { en: 'not started', zh: '還沒開始' },
  'restarted': { en: 'restarted', zh: '重做' },
  'planningDots': { en: 'Planning the work...', zh: '正在排計畫…' },
  'legend.queued': { en: 'queued for the next checkpoint', zh: '排隊中，下一個檢查點生效' },
  'legend.steer': { en: 'steered the running step', zh: '插話，打斷正在做的那一步' },
  'legend.landed': { en: 'reached the agent', zh: 'agent 已接住' },
  'legend.checkpoint': { en: 'checkpoint', zh: '檢查點' },
  'lanes.handoffHere': { en: 'Handed off to another model here', zh: '在這裡交棒給另一個模型' },

  // feed
  'feed.title': { en: 'Messages and readbacks', zh: '訊息和回條' },
  'feed.sub': { en: 'The agent reads every message back before it acts on it.', zh: 'agent 會先複述每一句話，才照著做。' },
  'feed.setGoal': { en: 'set the goal', zh: '訂了目標' },
  'feed.placeholder': {
    en: 'Tell the agent something. It decides whether to interrupt or wait, and you can overrule it.',
    zh: '對 agent 說一句話。它會判斷要立刻插話還是排隊，你也可以改掉它的判斷。',
  },
  'send': { en: 'Send', zh: '送出' },
  'tag.delivered': { en: 'Delivered', zh: '已送達' },
  'tag.queued': { en: 'Queued', zh: '排隊中' },
  'tag.steering': { en: 'Steering', zh: '插話中' },
  'tag.steered': { en: 'Steered', zh: '已插話' },
  'tag.landed': { en: 'Landed', zh: '已接住' },
  'tag.withdrawn': { en: 'Withdrawn', zh: '已收回' },
  'receipt.heard': { en: 'Heard', zh: '聽到' },
  'receipt.type': { en: 'Type', zh: '類型' },
  'receipt.when': { en: 'When', zh: '何時' },
  'receipt.expect': { en: 'Expect', zh: '預計' },
  'receipt.reading': { en: 'Reading it back...', zh: '正在複述…' },
  'receipt.pinnedAs': { en: 'pinned as {kind}', zh: '已釘成「{kind}」' },
  'receipt.failed': {
    en: 'The readback call failed, so your exact words were queued as written.',
    zh: '複述失敗了，所以你的原話已直接排隊，不會不見。',
  },
  'steerNow': { en: 'Steer now', zh: '立刻插話' },
  'withdraw': { en: 'Withdraw', zh: '收回' },
  'when.delivered': { en: 'Delivered. The agent is reading it back.', zh: '已送達，agent 正在複述。' },
  'when.queued': { en: 'Queued. It lands {where}.', zh: '排隊中，會{where}生效。' },
  'when.steering': { en: 'Interrupting step {n} now.', zh: '正在打斷第 {n} 步。' },
  'when.answer': { en: 'Recorded. Nothing was interrupted.', zh: '已記下，沒有打斷任何事。' },
  'when.steered': { en: 'Steered. Step {n} restarted with it.', zh: '已插話，第 {n} 步帶著這句話重做。' },
  'when.landed': { en: 'Landed {where}.', zh: '已{where}生效。' },
  'when.cancelled': { en: 'Withdrawn before it reached the agent.', zh: '在 agent 接到之前就收回了。' },
  'where.step': { en: 'at the checkpoint before step {n}', zh: '在第 {n} 步前的檢查點' },
  'where.final': { en: 'at the final checkpoint', zh: '在最後的檢查點' },
  'kind.add': { en: 'Addition', zh: '新增' },
  'kind.revise': { en: 'Revision', zh: '修改' },
  'kind.retract': { en: 'Retraction', zh: '撤回' },
  'kind.answer': { en: 'Answer', zh: '回答' },
  'kind.question': { en: 'Question', zh: '提問' },
  'pin.constraint': { en: 'Constraint', zh: '限制' },
  'pin.decision': { en: 'Decision', zh: '決定' },
  'pin.gate': { en: 'Approval gate', zh: '核准關卡' },

  // step panel
  'step.agentOutput': { en: 'Agent output', zh: 'agent 的產出' },
  'step.planningSub': { en: 'The agent is breaking the goal into steps.', zh: 'agent 正在把目標拆成幾步。' },
  'step.none': { en: 'No step yet.', zh: '還沒有步驟。' },
  'step.planAbove': { en: 'The plan will appear in the lanes above.', zh: '計畫會出現在上面的跑道。' },
  'step.title': { en: 'Step {n}: {title}', zh: '第 {n} 步：{title}' },
  'step.notStarted': { en: 'Not started', zh: '還沒開始' },
  'step.notStartedYet': { en: 'Not started yet.', zh: '還沒開始。' },
  'tab.output': { en: 'Output', zh: '產出' },
  'tab.prompt': { en: 'Exact prompt', zh: '實際送出的 prompt' },
  'tab.discarded': { en: 'Discarded by a steer ({n})', zh: '被插話丟掉的（{n}）' },
  'reached.steer': { en: 'steered', zh: '插話' },
  'reached.checkpoint': { en: 'at checkpoint', zh: '檢查點' },
  'prompt.later': {
    en: 'The prompt is written when the step starts, so it includes everything on the board at that moment.',
    zh: 'prompt 在這一步開始時才組出來，所以會包含當下記憶板上的所有內容。',
  },
  'discarded.why': { en: 'Thrown away when {who}', zh: '因為{who}而丟掉' },
  'discarded.said': { en: '{name} said "{text}"', zh: ' {name} 說「{text}」' },
  'discarded.someone': { en: 'a teammate steered', zh: '隊友插話' },
  'discarded.nothing': { en: '(nothing had been written yet)', zh: '（還沒寫出任何內容）' },

  // board, waiting, handoff
  'board.title': { en: 'Pinned board', zh: '記憶板' },
  'board.sub': { en: 'Exact words, never summarized. Sent at the top of every prompt.', zh: '原話，不摘要。每一步的 prompt 最前面都會帶上。' },
  'board.empty': {
    en: 'Constraints, decisions and approvals your team states are pinned here automatically.',
    zh: '隊友說的限制、決定和核准要求，會自動釘在這裡。',
  },
  'board.superseded': { en: 'superseded', zh: '已取代' },
  'board.pending': { en: 'takes effect at the next checkpoint', zh: '待生效，下一個檢查點開始' },
  'board.met': { en: 'In the result: {evidence}', zh: '成品有做到：{evidence}' },
  'board.missed': { en: 'Not in the result: {evidence}', zh: '成品沒做到：{evidence}' },
  'board.gate': { en: 'Enforced by the final checkpoint', zh: '由最後的檢查點把關' },
  'board.outcome': { en: 'result follows {a}/{b}', zh: '成品做到 {a}/{b}' },
  'board.checking': { en: 'checking the result', zh: '檢查成品中' },
  'board.check': { en: 'Handoff check: {q}', zh: '交棒考題：{q}' },
  'waiting.title': { en: 'Waiting on people', zh: '等人處理' },
  'waiting.sub': { en: 'The agent asks instead of guessing, and stops only when it has to.', zh: 'agent 不亂猜，會先問；真的需要答案時才停下來等。' },
  'waiting.none': { en: 'Nothing is waiting on anyone.', zh: '目前沒有在等誰。' },
  'waiting.blocking': { en: 'The agent is stopped on this', zh: 'agent 停在這裡等' },
  'waiting.neededStep': { en: 'Needed before step {n}', zh: '第 {n} 步之前要有' },
  'waiting.neededFinal': { en: 'Needed before the work is finished', zh: '完成之前要有' },
  'approve': { en: 'Approve', zh: '核准' },
  'approved': { en: 'Approved', zh: '核准' },
  'answer.placeholder': { en: 'Your answer', zh: '你的回答' },
  'answer': { en: 'Answer', zh: '回答' },
  'waiting.onlyOther': { en: 'Only {name} can clear this.', zh: '只有 {name} 能處理這一項。' },
  'handoff.title': { en: 'Handoff', zh: '交棒' },
  'handoff.caught': { en: 'caught {a}/{b}', zh: '接住 {a}/{b}' },
  'handoff.requested': { en: 'happens at the next checkpoint', zh: '會在下一個檢查點進行' },
  'handoff.writing': { en: 'writing the handoff note', zh: '正在寫交接單' },
  'handoff.quizzing': { en: 'the new model is answering one question per pin', zh: '新模型正在逐條回答考題' },
  'handoff.nothing': { en: 'nothing was pinned, so there was nothing to check', zh: '記憶板是空的，所以沒有東西要考' },
  'handoff.failed': { en: 'failed, the session stays on {model}', zh: '失敗了，仍由 {model} 繼續' },
  'handoff.briefedAgain': { en: 'briefed again', zh: '重講一次' },
  'handoff.note': { en: 'Handoff note (built from the board, word for word)', zh: '交接單（由記憶板的原話組成）' },

  // start screen
  'start.h1': { en: 'One agent, a whole team talking to it. Nothing gets lost.', zh: '一個 agent，全隊一起對它說話，一句都不漏。' },
  'start.p1': {
    en: 'Every message gets a readback: what the agent understood, and when it will act on it.',
    zh: '每句話都有回條：agent 理解成什麼、什麼時候照著做。',
  },
  'start.p2': {
    en: 'Constraints and decisions are pinned word for word, so compaction cannot lose them.',
    zh: '限制和決定會原話釘住，context 壓縮也不會弄丟。',
  },
  'start.p3': {
    en: 'Hand the work to another model, and it has to prove it caught every pin before it continues.',
    zh: '把工作交給另一個模型時，它要先證明每一條都接住了，才能繼續。',
  },
  'start.label': { en: 'What should the agent work on?', zh: '要 agent 做什麼？' },
  'start.button': { en: 'Start the session as {name}', zh: '以 {name} 的身分開始' },
  'start.hint': {
    en: 'Open this page in a second window as the other teammate. Both windows share the same session.',
    zh: '再開一個視窗當另一位隊友，兩個視窗會共用同一個工作階段。',
  },
  'connecting': { en: 'Connecting to the session...', zh: '正在連線…' },
} as const

export type Key = keyof typeof STRINGS
export type Translate = (key: Key, vars?: Record<string, string | number>) => string

export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  let text: string = STRINGS[key][lang]
  if (vars) for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value))
  return text
}

export const LangContext = createContext<Lang>('en')

/** Translator for the session's language. */
export function useT(): Translate {
  const lang = useContext(LangContext)
  return (key, vars) => translate(lang, key, vars)
}
