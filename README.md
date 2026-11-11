# Readback

**Delivery receipts for a team that shares one AI agent.**

When two people steer the same agent, the same three questions keep coming up:

- Did it understand what I just said?
- Is it still using what my teammate told it ten minutes ago?
- Does the finished work actually follow what we asked for?

Readback answers all three on screen, with the evidence.

Built at c0mpiled-18 (YC Startup School Hackathon, Taipei, 11 November 2026) for the YC Request for Startups "Multiplayer AI".

## What it does

Two teammates share one agent session. The agent breaks a goal into steps and works through them. Before every step there is a checkpoint.

| | |
|---|---|
| **Readback** | Every message gets a receipt before the agent acts on it: what it heard, what kind of change it is, when it takes effect, and what to expect. |
| **Queue or steer** | A message normally lands at the next checkpoint. If carrying on would waste the step that is running, it interrupts that step instead. The agent proposes the route; a teammate can overrule it. |
| **Typing hold** | While a teammate is typing, the agent waits at its next checkpoint (up to 15 seconds), so the message does not arrive late. |
| **Pinned board** | Constraints, decisions and approval gates are pinned in the teammate's exact words and sent at the top of every prompt. They are never summarized. A pin that gets replaced stays on the board, marked as superseded. |
| **Waiting on people** | When a fact is missing, the agent asks the teammate who owns it instead of guessing, and stops only at the step that needs the answer. |
| **Outcome check** | Before sign-off, the final deliverable is checked against every pin, and the board shows the evidence. A miss gets an extra step to fix it. |
| **Verified handoff** | Hand the session to another model. The handoff note is built from the board, word for word, and the new model has to answer one scenario question per pin. If it still misses one after a second briefing, the handoff fails and the session stays where it was. |
| **Exact prompt** | Every step shows the exact prompt that was sent to the model. |

The lane view at the top draws the whole thing: every message is a chip in its author's lane, with a line to the checkpoint (or the step) where it reached the agent.

## Run it

```bash
git clone https://github.com/theroyatlas/readback
cd readback
cp .env.example .env.local   # add a GMI Cloud API key
npm install
npm run dev                  # web on http://localhost:5173, API on http://localhost:8787
```

- `http://localhost:5173/?view=split` shows both teammates' windows side by side.
- `?as=mia` opens the page as the other teammate. `?s=anything` starts a separate session.
- The interface, and everything the agent writes about the work, can be switched between English and Traditional Chinese.

Requires Node 24 or newer. The server is TypeScript that Node runs directly, so there is no server build step.

For a single process that serves both the built app and the API on port 8787:

```bash
npm run build
npm start
```

## How it works

```
server/agent.ts    the loop: plan, checkpoint, step, outcome check, handoff
server/prompts.ts  every prompt, in one place
server/gmi.ts      model calls through GMI Cloud: streaming, JSON output, cancel
server/store.ts    sessions in memory; the whole session is pushed to every browser over Server-Sent Events
server/index.ts    the HTTP API
shared/            types used by the server and the browser
src/               the React interface (Lanes.tsx is the lane view)
```

The life of one message:

1. The server accepts it and every window shows it as delivered.
2. The model writes the readback as JSON: what it heard, the kind of change, queue or steer, and whether the message should be pinned.
3. Queued messages wait. At the next checkpoint they are handed to the agent with that step's prompt. A steer aborts the running model stream and restarts the step with the correction.
4. Pinned words go to the board. From then on they sit at the top of every prompt, and they are what the outcome check and a handoff check test against.

If the readback call fails, the message is not dropped: it is queued with the teammate's exact words.

## What is real and what is simplified

Real:

- Every plan, step, readback, question, outcome check and handoff answer is a live model call. Nothing is scripted.
- Text appears exactly as the model streams it. Steering aborts the stream.
- All windows on the same session stay in sync.

Simplified:

- Two fixed teammates, Roy and Mia. No accounts, no permissions.
- There is no authentication. Do not put the server on the public internet as it is: anyone who can reach it can spend your API key.
- Sessions live in memory. Restarting the server clears them.
- The outcome check is a model's judgment. Word and character counts are measured in code and given to it, because models count badly.
- With a fast model and a small task, a step lasts a few seconds, so there is rarely time to steer one. Steering is for long steps. For small tasks, a late message lands at a checkpoint or adds one more step.

Not built yet:

- Persistence, accounts, and roles.
- Deciding between teammates who give conflicting instructions.
- Running on your own coding-agent subscription instead of an API key. Model calls are isolated in `server/gmi.ts`, so a local provider can be added there.
- Adapters that bring the same receipts and pinned board into existing coding agents.

## How it was built

Everything in this repository was written during the hackathon's build session. Claude Code was the coding agent. The models the product runs on are served by GMI Cloud. The products and prices in the example goal are made up.
