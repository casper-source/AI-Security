# Rules of Engagement — RedCell (advanced attacker agent)

The rule that separates a security engineer from an attacker: **no written authorization, no test.** This
document is your authorization for this lab, and it is narrow on purpose. RedCell is a real audit tool — treat
it like one.

## Authorization
EnGenious University authorizes you to run RedCell against **the MerciBank lab target you run on your own
machine**, for the duration of this cohort, to learn agentic red-teaming and the AI-audit loop.

## In scope
- **Only** your own local MerciBank at `http://localhost:8080` (the Week-2 `week2-mercibank` target), or the
  built-in in-process **mock** target (`--adapter mock`, no network at all).
- RedCell itself (`attack.mjs`, `verify.mjs`, `report.mjs`, `redteam.mjs`, `server.mjs`) and its `campaign/`
  workspace on your machine.

## Out of scope (never)
- Any other host, port, or network. Every network adapter calls `assertRoe()` and **refuses** a non-localhost
  target unless `ROE_AUTHORIZED=1` **and** the host is in `RC_TARGET_ALLOWLIST`. That gate exists for a REAL,
  separately-authorized engagement — not for this cohort. Do not set it during class.
- Classmates' machines, EnGenious infra (Zoom / Discord / Slack / GitHub org), or any real bank or service.
- Pointing a **brain model** (`ATTACKER_LLM_*` etc.) or the target at any real system.

## Beyond the lab (for a real audit later)
RedCell can serve an actual authorized engagement. If you ever run it off localhost you must have, in writing:
the target scope, the time window, the data-handling rules, and a named contact — the same ROE the EnGenious
AI Audit Service uses. Set `ROE_AUTHORIZED=1` + `RC_TARGET_ALLOWLIST=<hosts>` only then, and only for the hosts
named in that authorization.

## Limits
- All MerciBank data is fictional + canaried. You are proving *capability*, not stealing anything.
- Keep under MerciBank's ~40 requests/minute (raise `ATTACK_DELAY_MS` if you see HTTP 429).
- Attack traffic against a **commercial** model key can get it flagged — this is why a brain can be a **local**
  open model (vMLX / Ollama / LM Studio). Keep it local when in doubt.

## Kill switch
- Stop a run: `Ctrl-C` (CLI) or the **Stop** button (dashboard). Stop the target: `Ctrl-C` in its terminal.

## Evidence handling
- Findings, transcripts, canary values and reports live in `campaign/` on your machine. Do **not** paste canary
  values or transcripts outside the cohort. Screenshots for your write-up are fine.

## Contacts
- Your cohort instructors, in the cohort channel.
