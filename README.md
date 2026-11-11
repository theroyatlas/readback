# Readback

Delivery receipts for multiplayer AI agents.

When a whole team talks to one agent, three things go wrong: you cannot tell whether the agent understood you, you cannot tell whether it still remembers after its context is compacted, and you cannot tell what survives when another model takes over. Readback makes all three visible.

Built at c0mpiled-18 (YC Startup School Hackathon, Taipei) for the YC Fall 2026 Request for Startups "Multiplayer AI".

## Run it

```bash
cp .env.example .env.local   # add your GMI Cloud API key
npm install
npm run dev                  # web on http://localhost:5173, API on http://localhost:8787
```

Open the page twice, once as Roy and once as Mia (`?as=mia`). Both windows share the same session.

Requires Node 24 or newer: the server is TypeScript run directly by Node, with no build step.
