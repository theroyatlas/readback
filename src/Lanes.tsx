import { useLayoutEffect, useRef, useState } from 'react'
import { PEOPLE, modelLabel } from '../shared/catalog.ts'
import type { Message, PersonId, Session } from '../shared/types.ts'
import { Avatar } from './Avatar.tsx'
import { blockers, modelColor, nextCheckpoint } from './format.ts'

// Geometry of the lane view, in CSS pixels. Everything is positioned from these numbers,
// so the connector lines always meet the chips, the step cards and the checkpoints.
const LABEL = 88
const GAP = 46
const PAD_RIGHT = 10
const MIN_COL = 124
const ROY_TOP = 6
const AGENT_TOP = 82
const MIA_TOP = 178
const PERSON_H = 76
const AGENT_H = 96
const HEIGHT = 260
const CARD_TOP = AGENT_TOP + 9
const CARD_H = 78
const MID = AGENT_TOP + AGENT_H / 2
const CHIP_H = 26
const CHIP_GAP = 6

type Tone = 'reading' | 'queued' | 'steer' | 'landed' | 'cancelled'

interface Point {
  x: number
  y: number
}

interface PlacedChip {
  message: Message
  left: number
  top: number
  tone: Tone
  from: Point
  to: Point | null
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

function toneOf(m: Message): Tone {
  if (m.status === 'cancelled') return 'cancelled'
  if (m.status === 'delivered' || !m.receipt) return 'reading'
  if (m.receipt.route === 'steer') return 'steer'
  return m.status === 'queued' ? 'queued' : 'landed'
}

const GLYPH: Record<Tone, string> = {
  reading: '…',
  queued: '◷',
  steer: '⚡',
  landed: '✓',
  cancelled: '×',
}

function curve(a: Point, b: Point): string {
  const dy = (b.y - a.y) * 0.55
  return `M ${a.x} ${a.y} C ${a.x} ${a.y + dy}, ${b.x} ${b.y - dy}, ${b.x} ${b.y}`
}

interface Props {
  session: Session
  me: PersonId
  selected: number
  onSelect: (index: number) => void
  onPickMessage: (id: string) => void
}

export function Lanes({ session: s, me, selected, onSelect, onPickMessage }: Props) {
  const frame = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1100)
  useLayoutEffect(() => {
    const el = frame.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const n = Math.max(s.steps.length, 1)
  const colW = Math.max(MIN_COL, (width - LABEL - GAP * (n + 1) - PAD_RIGHT) / n)
  const inner = LABEL + GAP * (n + 1) + colW * n + PAD_RIGHT
  const colX = (c: number) => LABEL + GAP * (c + 1) + colW * c
  const cpX = (k: number) => LABEL + GAP * k + colW * k + GAP / 2

  // Where a message's line ends: on the step it interrupted, or on the checkpoint where it lands.
  const targetOf = (m: Message): Point | null => {
    if (m.status === 'cancelled' || m.status === 'delivered' || !m.receipt) return null
    const above = m.by === 'roy'
    if (m.receipt.route === 'steer') {
      const step = clamp(m.appliedAtStep ?? s.activeStep, 0, n - 1)
      return { x: colX(step) + colW / 2, y: above ? CARD_TOP : CARD_TOP + CARD_H }
    }
    const k = clamp(m.appliedAtStep ?? nextCheckpoint(s), 0, n)
    return { x: cpX(k), y: above ? MID - 10 : MID + 10 }
  }

  const place = (person: PersonId): { chips: PlacedChip[]; more: { left: number; top: number; count: number }[] } => {
    const chips: PlacedChip[] = []
    const more: { left: number; top: number; count: number }[] = []
    const above = person === 'roy'
    for (let c = 0; c < n; c += 1) {
      const mine = s.messages.filter((m) => m.by === person && clamp(m.sentDuringStep, 0, n - 1) === c)
      const visible = mine.slice(-2).reverse() // newest sits closest to the agent lane
      visible.forEach((message, slot) => {
        const top = above
          ? ROY_TOP + PERSON_H - 6 - CHIP_H - slot * (CHIP_H + CHIP_GAP)
          : MIA_TOP + 6 + slot * (CHIP_H + CHIP_GAP)
        const from = { x: colX(c) + 18 + slot * 20, y: above ? top + CHIP_H : top }
        chips.push({ message, left: colX(c), top, tone: toneOf(message), from, to: targetOf(message) })
      })
      if (mine.length > 2) {
        more.push({ left: colX(c) + colW - 30, top: above ? ROY_TOP + 2 : MIA_TOP + PERSON_H - 16, count: mine.length - 2 })
      }
    }
    return { chips, more }
  }

  const roy = place('roy')
  const mia = place('mia')
  const chips = [...roy.chips, ...mia.chips]
  const more = [...roy.more, ...mia.more]

  const progressEnd =
    s.status === 'done' ? cpX(n) : s.status === 'running' ? colX(s.activeStep) + colW / 2 : cpX(clamp(s.activeStep, 0, n))
  const waitingOn = s.status === 'waiting' ? [...new Set(blockers(s).map((p) => p.assignee))] : []

  const checkpointState = (k: number): 'passed' | 'current' | 'future' => {
    if (s.status === 'done' || k < s.activeStep) return 'passed'
    if (k > s.activeStep) return 'future'
    return s.status === 'running' ? 'passed' : 'current'
  }

  return (
    <section className="lanes card" aria-label="Session lanes">
      <div className="lanes-frame" ref={frame}>
        <div className="lanes-inner" style={{ width: inner, height: HEIGHT }}>
          <div className={`lane-band lane-roy ${me === 'roy' ? 'is-me' : ''}`} style={{ top: ROY_TOP - 3, height: PERSON_H }} />
          <div className="lane-band lane-agent" style={{ top: AGENT_TOP, height: AGENT_H }} />
          <div className={`lane-band lane-mia ${me === 'mia' ? 'is-me' : ''}`} style={{ top: MIA_TOP + 3, height: PERSON_H }} />

          {(['roy', 'mia'] as PersonId[]).map((person) => (
            <div
              key={person}
              className="lane-label"
              style={{ top: (person === 'roy' ? ROY_TOP : MIA_TOP) + PERSON_H / 2 - 14, width: LABEL }}
            >
              <Avatar who={person} size={26} />
              <span>
                {PEOPLE[person].name}
                {me === person && <em>you</em>}
              </span>
            </div>
          ))}
          <div className="lane-label lane-label-agent" style={{ top: MID - 18, width: LABEL }}>
            <Avatar who="agent" size={26} />
            <span>
              Agent
              <small>{modelLabel(s.model)}</small>
            </span>
          </div>

          <svg className="lanes-lines" width={inner} height={HEIGHT} aria-hidden="true">
            <defs>
              <linearGradient id="flow" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="var(--flow-a)" />
                <stop offset="1" stopColor="var(--flow-b)" />
              </linearGradient>
            </defs>
            <line className="track" x1={cpX(0)} y1={MID} x2={cpX(n)} y2={MID} />
            <line className="track-done" x1={cpX(0)} y1={MID} x2={Math.max(cpX(0), progressEnd)} y2={MID} />
            {chips.map(({ message, from, to, tone }) =>
              to ? (
                <g key={message.id} className={`link link-${tone}`}>
                  <path d={curve(from, to)} />
                  <circle cx={to.x} cy={to.y} r={3.5} />
                </g>
              ) : null,
            )}
          </svg>

          {s.steps.length === 0 && (
            <div className="step step-running step-placeholder" style={{ left: colX(0), top: CARD_TOP, width: colW, height: CARD_H }}>
              <span className="step-title">Planning the work...</span>
              <span className="step-run" />
            </div>
          )}

          {s.steps.map((step, c) => (
            <button
              key={step.id}
              type="button"
              className={`step step-${step.status} ${selected === c ? 'is-selected' : ''}`}
              style={{ left: colX(c), top: CARD_TOP, width: colW, height: CARD_H }}
              onClick={() => onSelect(c)}
              title={step.deliverable}
            >
              <span className="step-head">
                <span className="step-num">{step.status === 'done' ? '✓' : c + 1}</span>
                <span className="step-title">{step.title}</span>
              </span>
              <span className="step-foot">
                <i className="model-dot" style={{ background: modelColor(step.model) }} />
                <span className="step-model">{step.model ? modelLabel(step.model) : 'not started'}</span>
                {step.discarded.length > 0 && <em className="step-steered">{'⚡'} restarted</em>}
              </span>
              {step.status === 'running' && <span className="step-run" />}
            </button>
          ))}

          {Array.from({ length: n + 1 }, (_, k) => {
            const state = checkpointState(k)
            const handoff = s.handoffs.find((h) => h.atStep === k && h.status !== 'requested')
            const caught = handoff ? handoff.checks.filter((check) => check.pass).length : 0
            const isFinal = k === n
            return (
              <div key={k} className={`checkpoint checkpoint-${state} ${isFinal ? 'is-final' : ''}`} style={{ left: cpX(k), top: MID }}>
                {handoff && (
                  <span className={`cp-handoff cp-handoff-${handoff.status}`} title="Handed off to another model here">
                    {'⇄'}
                  </span>
                )}
                <span className="cp-mark" />
                {handoff && handoff.checks.length > 0 && (
                  <span className="cp-score">
                    {caught}/{handoff.checks.length}
                  </span>
                )}
                {!handoff && state === 'current' && waitingOn.length > 0 && (
                  <span className="cp-wait">
                    {waitingOn.map((who) => (
                      <Avatar key={who} who={who} size={16} />
                    ))}
                  </span>
                )}
              </div>
            )
          })}

          {chips.map(({ message, left, top, tone }) => (
            <button
              key={message.id}
              type="button"
              className={`chip chip-${tone}`}
              style={{ left, top, width: colW, height: CHIP_H }}
              title={message.text}
              onClick={() => onPickMessage(message.id)}
            >
              <span className="chip-glyph">{GLYPH[tone]}</span>
              <span className="chip-text">{message.text}</span>
            </button>
          ))}
          {more.map((m) => (
            <span key={`${m.left}-${m.top}`} className="chip-more" style={{ left: m.left, top: m.top }}>
              +{m.count}
            </span>
          ))}
        </div>
      </div>
      <div className="lanes-legend">
        <span>
          <i className="key key-queued" /> queued for the next checkpoint
        </span>
        <span>
          <i className="key key-steer" /> steered the running step
        </span>
        <span>
          <i className="key key-landed" /> reached the agent
        </span>
        <span>
          <i className="key key-cp" /> checkpoint
        </span>
      </div>
    </section>
  )
}
