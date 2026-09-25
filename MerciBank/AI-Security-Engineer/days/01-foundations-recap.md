# Day 1 (Sat Sep 12, 2026) — Foundations recap & hands-on red-team

First session of the first AI Security cohort. Alumni-only, framed as an advanced follow-on to
the AI Testing / Evaluations track. Taught by Vladimir Tanev and Jaime Mantilla, hosted by Igor
Dorovskikh, recorded by Tagir Fakhriev.

## What we covered
LLM fundamentals through a security lens:
- **Tokens** — the atomic unit; encoding / Unicode tricks to slip past guardrails.
- **Context window** — attack surface: overload it, hide injections in long inputs, exploit that old system instructions truncate at the limit.
- **System prompt** — the top thing to attack: expose it, then modify it to extract PII or keys.
- **Temperature** — token-candidate ranking and determinism (with a distillation aside).
- **Model fingerprinting / reconnaissance** — identify the model, version, context size and system prompt before attacking.

Recap of the promptfoo essentials from the prior cohort: config / providers / prompts,
deterministic vs non-deterministic assertions, LLM-as-judge, red-team plugins & strategies,
OWASP LLM Top-10.

## Tools shown
Tokenizer Flow · context-window simulator · temperature simulator · P4RS3LT0NGV3 (leetspeak /
obfuscation) · promptfoo red-team (UI + `redteam init` / `redteam run`) · Claude Code / Codex.

## Exercises (paired)
1. **Break your own chatbot** — give an AI a narrow job, then red-team it out of scope (30 min).
2. **Higher-stakes audit** — audit a GenAI system with access to sensitive data; rank findings by severity.

## Homework
Finish the two exercises as a team; read Dario Amodei's frontier-security post; post results in
the Day-1 Discord thread.

*Recording + transcript shared with the cohort (Vimeo + Drive).*
