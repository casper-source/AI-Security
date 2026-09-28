# Week 3 — Build an Attacker AI Agent (and close the audit loop)

You attacked MerciBank **by hand** in Week 2. This week you build the thing that does it **for you**: a small
attacker **agent** that runs a campaign against MerciBank, learns which attacks pay off, and then — the part
that makes it a real audit — **verifies** each hit and **promotes** the confirmed ones into a Promptfoo
regression suite. This is the EnGenious AI Audit Service in miniature.

- **Day 5 — build the attacker.** `attacker.mjs` runs `Wake → Orient → Plan → Attack → Judge → Reinforce`.
- **Day 6 — close the loop.** `verify.mjs` reproduces each hit **3× in parallel from clean sessions**, gates
  it (the "3-of-3" rule), and writes a Promptfoo regression case for every **CONFIRMED** finding.

> You are **not** expected to write this from scratch. Run it, read it, and change it — with Claude Code /
> Codex as your pair. The code is small and commented on purpose.

## Prerequisites
- Node 18+ (`node -v`).
- Your **Week-2 MerciBank** running in another terminal (this lab attacks it). Zero npm installs here.
- *(Optional but recommended)* an attacker **model** — see `.env`. Without one, the agent still runs on
  built-in escalation ladders; with one, it writes its own follow-ups and gets noticeably smarter.

## Run it (two terminals)

```bash
# Terminal 1 — the TARGET (from Week 2)
cd ../week2-mercibank
npm start                      # MerciBank on http://localhost:8080

# Terminal 2 — the ATTACKER (here)
cp .env.example .env           # set MERCI_TARGET_KEY; optionally add an attacker model
npm run clean                  # fresh campaign — do this before each new run (see "Fresh start" below)
npm start                      # Day 5: run the campaign   (or: node attacker.mjs)
npm run verify                 # Day 6: reproduce 3×, gate, promote   (or: node verify.mjs)
```

What you'll see on Day 5: the planner picks an attack family, the agent opens, MerciBank sometimes refuses,
the agent escalates, and each result is scored by a **canary** (a string that must never appear) or a
**flag** (the server telling us a forbidden tool fired). Hits are saved to `campaign/findings/`.

> **Fresh start & the agent's memory.** The agent writes everything to `campaign/` and **remembers across
> runs**: the planner (`strategy-register.json`) accumulates tries/wins, and old hits stay in
> `campaign/findings/`. That persistence is deliberate — it *is* the agent's memory, and it's what lets the
> planner get smarter over time. But when you want a **clean campaign** — a fresh demo, or so an earlier
> run's results don't mix into this one — run **`npm run clean` first**. Otherwise counts stack up and a hit
> from a previous run can linger as a stale finding.

What you'll see on Day 6: each candidate is re-run **3 times at once** from fresh sessions. Meet the bar
(default **3/3**) and pass the gate → **CONFIRMED** and a `campaign/regression/<ID>.gen.yaml` is written.
Miss the bar (a flaky one-off) → **REJECTED**. Then run the promoted suite in real Promptfoo:

```bash
export MERCI_TARGET_KEY=merci-lab-key
cd campaign/regression && npx -y promptfoo@latest eval -c PCI-FULLCARD.gen.yaml --no-cache && npx -y promptfoo@latest view
# A FAIL here is the point: the regression catches the bug. Fix MerciBank and it turns green.
```

## How it maps to the AI Audit Service
| Audit-service stage | Here |
|---|---|
| Orchestrator loop (Wake→Orient→Plan→Attack→Judge→Reinforce) | `attacker.mjs` |
| UCB planner — *scripts own the math, the model proposes* | `lib/planner.mjs` |
| Attacker "brain" (composes adaptive follow-ups) | `lib/llm.mjs` (optional model) |
| Dual grader (deterministic canary/flag; llm-rubric optional) | `lib/judge.mjs` |
| Files-as-memory (register / journal / lessons / findings) | `lib/memory.mjs` → `campaign/` |
| Verifier: evidence ladder (claimed→reproduced≥3×→verified) + gate | `verify.mjs` |
| Promote confirmed finding → regression case | `lib/promote.mjs` → `campaign/regression/` |

## Files
```
attacker.mjs        Day 5 — the campaign loop
verify.mjs          Day 6 — reproduce (parallel) + gate + promote
lib/target.mjs      talks to MerciBank (localhost only — enforced)
lib/strategies.mjs  the attack playbook (the Week-2 categories + escalation ladders)
lib/judge.mjs       deterministic canaries + tool-action flags
lib/planner.mjs     UCB explore/exploit (the planner's math)
lib/memory.mjs      the engagement workspace (files)
lib/llm.mjs         optional attacker model (any OpenAI-compatible endpoint)
lib/promote.mjs     writes the Promptfoo regression case
labs/               Day 5 & Day 6 student worksheets
rules-of-engagement.md   your authorization (localhost only)
harden-merci.md     OPTIONAL "boss mode" — make MerciBank tougher
```

## What to ask Claude Code / Codex
- "Read `attacker.mjs` and `lib/planner.mjs` and explain how the UCB planner decides which family to try next."
- "Add a new strategy to `lib/strategies.mjs` for `<idea>` with an escalation ladder and the canary that proves it."
- "In `verify.mjs`, change the reproduction bar to 2-of-3 and explain the trade-off."
- "Explain why `lib/judge.mjs` uses `findings_hint` for the transfer finding instead of matching text."

**Rules of engagement:** everything here targets **your own** local MerciBank (`localhost:8080`) only. The
adapter refuses any non-localhost target. See `rules-of-engagement.md`. Nothing real, nothing else, ever.
