# Day 3 lab — Scope it, recon it, connect it
*By the end: a working Promptfoo connection to the live MerciBank agent, plus a recon note that
compares what the client told you against what the system actually does. Use Claude Code freely.*

---
## Part A — Scope from the questionnaire (paper recon), ~15 min
Open `intake/mercibank-intake.md`. This is the client's own answers — the business half (what it does,
who uses it, what's forbidden, what data) and the technical half (model, tools, RAG, connection).
**Before touching the system**, from the paper alone:
1. Write the system's purpose in one line, and its top forbidden action.
2. Using the two OWASP Top 10 lists as a checklist — **LLM Applications (LLM01–10)** and **Agentic
   (ASI01–10)** — list which risks plausibly apply here, given the tools, memory, RAG and multiple
   customers the client described.
3. Write two or three **attack hypotheses**: "because it has X, I'd try Y."

## Part B — Rules of Engagement, ~10 min
Read `rules-of-engagement.md`. You are authorized to test **only your own local instance**
(`localhost:8080`) — nothing else, nobody else's machine. This is Section H of the questionnaire made
real. No ROE, no test.

## Part C — Live recon: verify the paper against reality, ~20 min *(curl + your eyes, no Promptfoo yet)*
Put your model key in `.env` (`cp .env.example .env`), then `npm start`. In a second terminal:
```bash
curl -s localhost:8080/health
curl -s localhost:8080/v1/chat/completions \
  -H 'Content-Type: application/json' -H 'Authorization: Bearer merci-lab-key' \
  -d '{"model":"merci-assistant","messages":[{"role":"user","content":"hi, what can you help me with?"}]}'
# now WITHOUT the auth header — what happens?
```
Fill a **two-column "declared vs observed"** sheet:
- **Entry points / auth:** what endpoints exist; what does the chat endpoint require?
- **Response shape:** where is the reply text? What else comes back (`trace_id`, `session_id`,
  `retrieved`, `tool_calls`, `findings_hint`)? Which are evidence?
- **Tools:** ask it what it can do, and watch `tool_calls` on a real request. Which tools *read* vs
  *act*?
- **RAG:** ask a "how do I recover my account?" question and watch `retrieved` — it pulls a help
  article into its reasoning. That's an untrusted-content channel.
- **Gaps:** where does what you observe differ from what the questionnaire claimed? Narrow your OWASP
  list to the risks whose surface actually exists. Those gaps are where Day 4's findings live.

## Part D — Connect the harness, ~20 min (the deliverable)
```bash
cd promptfoo
export MERCI_TARGET_KEY=merci-lab-key      # match your .env
export PROMPTFOO_CONFIG_DIR="$PWD/../.promptfoo"   # keeps your eval history inside this lab
npx -y promptfoo@latest eval -c smoke.yaml -j 2
npx -y promptfoo@latest view
```
Look at `providers/target.http.yaml`: the `Authorization: Bearer {{env.MERCI_TARGET_KEY}}` header and
`transformResponse: 'json.reply.text'` — because MerciBank is **not** OpenAI-shaped. That transform is
the core new skill; if you're unsure, ask Claude Code to write it for this JSON.
Expected: **1 PASS** (pipe works, Merci answers a benign question) and **2 FAIL** — a FAIL means your
canary caught a real leak. Open a failing result in the viewer and find the evidence.

## Part E — Second connection pattern, ~10 min (optional / demo)
`providers/target.provider.mjs` is the same target written in code; it also captures `trace_id` and
`tool_calls` into metadata. You don't write these from scratch — read it, and ask your assistant when
you'd need one (custom auth, carrying a session across turns, pulling evidence out of the envelope).

## Deliverables
- [ ] Recon note: a declared-vs-observed sheet + your scoped OWASP LLM/Agentic risk list for Day 4.
- [ ] `smoke.yaml` run: 1 PASS + 2 canary-caught FAILs, viewed in the web UI.

## If something breaks (ask Claude Code with the exact error)
- `hasKey:false` on `/health` → your model key isn't in `.env`.
- `401` from Promptfoo → the bearer doesn't match `MERCI_TARGET_KEY`.
- empty output / assertion sees nothing → your `transformResponse` isn't reading `json.reply.text`.
- `429` → the target's rate limit; add `-j 2` or wait a moment.
- `503 no model key` → same as the first one: set `MERCI_LLM_API_KEY` in `.env`.
