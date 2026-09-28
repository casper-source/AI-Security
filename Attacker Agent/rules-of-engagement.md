# Rules of Engagement — Week 3 attacker-agent lab

Same rule as Week 2, and it still decides what separates a security engineer from an attacker: **no written
authorization, no test.** This document is your authorization for this lab, and it is narrow on purpose.

## Authorization
EnGenious University authorizes you to run the Week-3 attacker agent against **the MerciBank lab target you
run on your own machine**, for the duration of this cohort, for the purpose of learning agentic red-teaming.

## In scope
- **Only** your own local MerciBank at `http://localhost:8080` (the Week-2 `week2-mercibank` target).
- The attacker agent (`attacker.mjs`, `verify.mjs`) and its `campaign/` workspace on your machine.

## Out of scope (never)
- Any other host, port, or network — the target adapter (`lib/target.mjs`) refuses any non-localhost URL.
- Classmates' machines, EnGenious infra (Zoom / Discord / Slack / GitHub org), or any real bank or service.
- Pointing the **attacker model** (`ATTACKER_LLM_*`) at anything other than your own model endpoint, and
  pointing it or the target at any real system.

## Limits
- All data is fictional. There is nothing real to exfiltrate — you are proving *capability*, not stealing.
- Keep under MerciBank's ~40 requests/minute (raise `ATTACK_DELAY_MS` if you see HTTP 429).
- Attack traffic against a **commercial** model key can get it flagged — this is exactly why the attacker
  model can be a **local** open model (vMLX / Ollama / LM Studio) or a red-team-tuned model. Keep it local
  when in doubt.

## Kill switch
- Stop the attacker: `Ctrl-C`.
- Stop the target: `Ctrl-C` in the MerciBank terminal.

## Evidence handling
- Findings, transcripts, and canary values live in `campaign/` on your machine. Do **not** paste canary
  values or transcripts outside the cohort. Screenshots for your write-up are fine.

## Contacts
- Your cohort instructors, in the cohort channel.
