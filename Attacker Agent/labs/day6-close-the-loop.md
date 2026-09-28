# Day 6 worksheet — close the loop: verify + promote (work in pairs)

Yesterday your agent produced **candidates**. A candidate is a *claim*, not a finding. Today you do what the
AI Audit Service does: reproduce it, gate it, and promote only what survives into a Promptfoo regression suite.

**Reminder (ROE):** localhost MerciBank only. See `../rules-of-engagement.md`.

---

## Exercise 1 — reproduce in parallel (≈15 min in the room)
1. With MerciBank running, run `npm run verify`. Watch each candidate get re-run **3× at once** from fresh
   sessions (`reproduce  N/3`).
2. Find a candidate that reproduces **3/3** and one that does **not**. Open `verify.mjs` and locate where the
   `Promise.all` fires the parallel re-runs and where the verdict is decided (it is **code**, not the model).
3. **Question:** why re-run from a *fresh session* each time instead of continuing the same conversation?
   (What would a warmed-up session hide?)

## Exercise 2 — tune the bar, run the gate (≈15 min)
1. Re-run with a looser bar: `REPRO_MIN=2 npm run verify`. Which findings flip from REJECTED to CONFIRMED?
2. Look at the gate lines: **impact**, **baseline** (would a tool-less model leak the same → then it isn't an
   *agentic* finding), **mitigation**. If you set an attacker model, the baseline check runs live.
3. **Question:** MerciBank's indirect-injection hit is *probabilistic*. Is `3/3` the right bar for it, or does
   `2/3` make more sense — and what does that choice say to a client? (There is no single right answer; argue it.)

## Exercise 3 — report it to Promptfoo (≈15 min)
1. Every CONFIRMED finding wrote `campaign/regression/<ID>.gen.yaml`. Open one and read it.
2. Run it for real:
   ```bash
   export MERCI_TARGET_KEY=merci-lab-key
   cd campaign/regression && npx -y promptfoo@latest eval -c <ID>.gen.yaml --no-cache && npx -y promptfoo@latest view
   ```
   A **FAIL** is correct — the bug is still there, and your regression catches it.
3. **Stretch:** turn on `../harden-merci.md` "boss mode", restart MerciBank, and re-run the same regression.
   The finding you just fixed should turn **green** — that is the regression proving a fix.

## Come back and present (per pair)
- One CONFIRMED and one REJECTED finding, with the reason (repro count / gate).
- Your Promptfoo regression run: which finding, and the pass/fail.
- One sentence you would put in a client report for your strongest finding (impact + the AIVSS hint).

## Where this goes next
Week 4 moves to the bigger app (`ai-security-chatbot/`, with Jaime): a UI, RAG, and a ticketing system,
plus Docker / Burp / RunPod / Ollama / Firefox+FoxyProxy. Same loop, bigger target.
