# AI Security track — syllabus (draft, built on the go)

Reconstructed from the live weekend sessions (the Day 1 and Day 2 transcripts) and the cohort
Discord. There is no pre-existing AI Security curriculum; this is the first cohort and the
syllabus is written as it is taught. **Draft for the instructors (Vladimir, Hime) to validate
and extend.**

- **Track:** AI Security Engineer — Red Teaming & Agentic AI Defense
- **Format:** 5 weeks / 10 days, Sat + Sun live; alumni-only advanced follow-on
- **Captured so far:** Weekend 1 (Days 1–2). Later sessions are added here after they run.

## Prerequisites & tools (as used in the sessions)
Prior AI Testing / Evaluations cohort or equivalent promptfoo red-team experience · promptfoo ·
Node · Python · Git + terminal · an AI coding assistant (Claude Code / Codex).

## Weekend 1

### Day 1 (Sat Sep 12) — Foundations recap & hands-on red-team
LLM fundamentals through a security lens: tokens (encoding tricks), context window (overload,
hidden injection, truncation), system prompt (expose then modify to extract), temperature, and
model fingerprinting. Recap of the promptfoo essentials. Two paired exercises: "break your own
chatbot", then a higher-stakes audit of a system with sensitive-data access. Full guide:
[`days/01-foundations-recap.md`](days/01-foundations-recap.md).

### Day 2 (Sun Sep 13) — The playbook: agents, the threat landscape & the role
Lecture/roundtable day. AI history → agents → swarms; anatomy of an agent (tools, MCP, Skills,
RAG, memory, A2A, orchestrators, sandbox); skill/tool-description poisoning; the shift from
static testing to system assurance; reading the job market. Full guide:
[`days/02-the-playbook.md`](days/02-the-playbook.md).

## Named but not yet scheduled
Topics the instructors said the course will cover, in no fixed order yet:
- **AIVSS scoring** (the AIVSS site + calculator) — Day 2 deferred this to the next session (Weekend 2).
- LLM + RAG attacks
- MCP / tool-use testing
- Adaptive attacks
- Red-team campaign design

Days 3–10 will be filled in here after each weekend runs. This section stays unordered until the
instructors set the sequence.

## Standing components (every weekend, from the sessions)
- Career track: exercises tied to interview questions; live job-post reads; public posting (LinkedIn).
- Practice cadence: weekday homework + Discord study groups.
- Reading referenced: Jason Arbon "Testing AI", Steve Wilson "The Developer's Playbook for LLM Security", OWASP LLM Top-10, AIVSS.
