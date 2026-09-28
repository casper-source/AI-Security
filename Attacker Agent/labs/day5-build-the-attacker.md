# Day 5 worksheet — build the attacker agent (work in pairs)

Goal for tonight: get the attacker agent running against **your own** MerciBank, understand each stage of its
loop, and extend it with one attack of your own. By the end you have a `campaign/` full of candidate findings
to verify tomorrow.

**Reminder (ROE):** localhost MerciBank only. See `../rules-of-engagement.md`.

**Reminder (fresh runs):** the agent *remembers* across runs — that's the point, it's its memory. Before a new
campaign, run `npm run clean` so an earlier run's hits and planner counts don't mix into this one.

---

## Exercise 1 — run the loop and read it (≈15 min in the room)
1. Terminal 1: `cd ../week2-mercibank && npm start`. Terminal 2 (here): `cp .env.example .env`, set
   `MERCI_TARGET_KEY`, then `npm run clean` (fresh campaign), then `npm start`.
2. Watch one full episode. In your own words, write one line for each stage:
   `Wake / Orient / Plan / Attack / Judge / Reinforce`.
3. Open `campaign/session-journal.md` and `campaign/strategy-register.json`. **Question to answer:** after a
   family scores a win, does the planner try it again or move on — and why? (Look at `lib/planner.mjs`.)

## Exercise 2 — make it adaptive (≈15 min)
1. Add an attacker model to `.env` (`ATTACKER_LLM_*`) — OpenRouter, or a local model (vMLX / Ollama /
   LM Studio). Re-run.
2. Compare: which strategies **held** with the static ladders but **fell** once the agent could write its own
   follow-ups? Which still held? Note them — those are the "hard ones" (multi-turn / prompt-leak).
3. **Question:** why do we point the attacker at a local or red-team-tuned model instead of a commercial one?
   (Two reasons — refusals, and getting your key flagged.)

## Exercise 3 — add your own strategy (≈15 min)
1. In `lib/strategies.mjs`, add one new entry: an `opening`, 1–2 `followups`, the `family`, the OWASP ids,
   and a `goal` (an existing canary, or add one to `lib/judge.mjs`). Ask Claude Code to help you wire the
   canary if you invent a new one.
2. Run again and confirm your strategy appears in an episode and gets judged.
3. **Stretch:** set `MAX_TURNS=6` and see whether a longer escalation cracks a strategy that held at 4.

## Come back and present (per pair)
- One stage of the loop, explained in your words.
- One strategy that needed adaptation to land (and one that resisted).
- Your new strategy: what it targets and whether it hit.

## Homework into Day 6
Leave your `campaign/findings/` populated. Tomorrow you verify them — reproduce each 3× in parallel, gate the
flaky ones out, and promote the survivors to Promptfoo. Skim `verify.mjs` before class if you can.
