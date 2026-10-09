# RedCell

RedCell is a red-team **campaign engine** for LLM-based agents: it runs structured attack episodes, banks
findings, reproduces them under a strict bar, scores them, promotes regressions, and writes reports. Deterministic
code owns verdicts and scoring; optional LLM “brains” improve probing, wording, and report prose.

> **Authorized lab use only.** See `rules-of-engagement.md` for host restrictions.

**Requirements:** Node 18+. Core CLI/dashboard need no install; **promptfoo** (viewer + regression Run ▶) uses a devDependency — run **`npm install`** once in the repo root.

## Pipeline

```
WAKE → ORIENT → PLAN → ATTACK → JUDGE → REINFORCE     (campaign)
              → VERIFY → SCORE → PROMOTE → REPORT     (after candidates exist)
```

| Stage | What happens |
|--------|----------------|
| WAKE | Load adapter, health check, campaign memory |
| ORIENT | Probe the target; build a capability/refusal profile |
| PLAN | UCB bandit picks strategy family; optional strategist |
| ATTACK | Converter chain + orchestrator (multi-turn ladders) |
| JUDGE | Canary / flag verdict (authoritative) |
| REINFORCE | Update register and lessons |
| VERIFY | Reproduce each CANDIDATE `REPRO_MIN` of `REPRO_RUNS` (default 3/3), baseline gate |
| SCORE | AIVSS vector and band |
| PROMOTE | promptfoo regression YAML (+ red-team config) |
| REPORT | Developer + stakeholder markdown |

With **no API keys**, the mock adapter and code-only paths still run end to end.

## Mock quickstart (CLI)

No `.env` required. Uses the in-process **mock** target (offline).

```bash
# 1) Campaign — banks CANDIDATE findings under campaign/
npm run demo
# same as: node attack.mjs --adapter mock

# 2) Verify — reproduce, confirm or reject, write regressions (live workspace: campaign/)
node verify.mjs --adapter mock
node verify.mjs --adapter mock --campaign 2026-10-04-120000   # archived run (folder under campaign/archive/)
node verify.mjs --adapter mock --min 2 --runs 3              # repro bar 2/3

# 3) Reports — CONFIRMED findings only
node report.mjs
```

Useful flags:

```bash
node attack.mjs --adapter mock --only PCI-PRETEXT,BOLA-LINKED
EPISODES=6 node attack.mjs --adapter mock
node attack.mjs --adapter mock --fresh    # archive campaign/ then run clean
node report.mjs --campaign <archive-id>   # reports for an archived workspace
```

Reset local engagement data:

```bash
npm run clean
```

## Mock quickstart (dashboard)

```bash
npm install          # once — local promptfoo for viewer / regression Run
npm run dashboard
```

Open **http://localhost:8787**.

1. Set **Target adapter** to **mock** (Save config if you changed other fields).
2. Leave **Campaign workspace** on **New campaign** (or pick **Current (live)** / an archive to continue or verify).
3. Check strategies to run (or leave all checked for a full sweep).
4. **Run campaign** — live log, stage rail, strategy transcript.
5. Select the workspace that holds your candidates → **Verify campaign**.
6. **Build reports** — writes `report/` inside that workspace.
7. **Findings**, **Reports**, **Artifacts**, and **promptfoo** tabs follow the same workspace dropdown.

Default verify bar is **3/3** (Repro bar = minimum hits in 3 runs). **Episodes** caps how many attack laps run per campaign.

## Where data lives

All runtime state is under **`campaign/`** (gitignored):

```
campaign/
  findings/              CANDIDATE → CONFIRMED / rejected
  strategy-register.json UCB stats
  session-journal.md     timeline
  profile.json           ORIENT fingerprint
  campaign-meta.json     last run metadata (including strategy selection)
  regression/            promptfoo cases (after verify)
  redteam/               generative red-team config
  report/                developer.md, stakeholder.md
  archive/<timestamp>/     previous live workspaces
```

Tests use a temporary `CAMPAIGN_DIR` and do not touch your `campaign/` folder.

## Strategy model

Attacks are composed, not a flat wordlist:

- **Objectives** — what counts as a win (canaries, tool flags). See `strategies/objectives.mjs`.
- **Converters** — transforms on attacker text. See `strategies/converters.mjs`.
- **Orchestrators** — single-turn, ladder, crescendo, tree, etc. See `strategies/orchestrators.mjs`.

Curated strategies run by default; `--all` expands the generated matrix; `--only` filters by id, family, or objective.

## npm scripts

| Script | Command |
|--------|---------|
| `npm run demo` | Mock campaign |
| `npm start` / `npm run attack` | Campaign (default adapter from env) |
| `npm run verify` | Verify live workspace |
| `npm run report` | Build reports (live workspace) |
| `npm run redteam` | Emit (optional run) red-team config |
| `npm run dashboard` | Web UI on port 8787 |
| `npm test` | Unit + mock E2E tests |
| `npm run clean` | Delete `campaign/` |

## Project layout

```
attack.mjs verify.mjs report.mjs redteam.mjs server.mjs   CLI + dashboard entry
lib/           engine, verify, judge, planner, memory, report, promote, aivss, brains
adapters/      mock, http, openai-compatible, …
strategies/    objectives, converters, orchestrators, catalog
web/           dashboard (HTML, CSS, client JS)
test/          deterministic tests
```

## Other adapters

Set `RC_ADAPTER` in `.env` (see `.env.example`) for HTTP or OpenAI-compatible targets. Non-localhost URLs require
`ROE_AUTHORIZED=1` and an allowlisted host. For mock-only work, ignore this and use `--adapter mock` or the
dashboard **mock** adapter.

## Tests

```bash
npm test
```

Covers judge, planner, memory, ROE, mock adapter, verify, and a mock campaign → verify E2E path.
