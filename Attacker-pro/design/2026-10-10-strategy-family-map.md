# Strategy family map (batch 1 enablement)

**Phase:** batch-enablement only — no file moves. Maps hypothesis categories to existing RedCell modules.

| Category | Hypothesis examples | Orchestrator | Adapter surface | Verification |
|----------|---------------------|--------------|-----------------|--------------|
| **Chat / RAG** | RAG_DEV_DISCLOSURE, PROMPT_GUIDELINE_LEAK, OFF_TOPIC | `ladder`, `crescendo`, `single` + `converters.mjs` | `session.say()` | Canary substrings in `reply` (`lib/judge.mjs`) |
| **Chat + state read** | CHAT_TICKET_BOLA, TICKET_FAST_CLOSE | Same orchestrators; post-turn hook merges hints | `say()` + `session.getTicketState()` (NLT) | `findingsHint` flags via `lib/verification-signals.mjs` |
| **HTTP / RBAC** | ADMIN_RBAC_BYPASS, KB_STATS_DISCLOSURE | `single` (one-shot) or thin custom runner later | Future `session.adminProbe()` or dedicated helper — **not in this phase** | `proved` + `action`/`responseProof`; never `httpStatus` alone |
| **Prompt injection** | RAG_PROMPT_INJECTION, ENCODING_BYPASS | `bestOfN`, converter matrix (`catalog.*.generate()`) | `say()` + `meta.outcome` | Canaries and/or outcome taxonomy (future) |

**Existing families in repo**

- MerciBank: `sensitive-data`, `encoding`, `bola`, `control`, … (`strategies/catalog.mercibank.mjs`)
- NLT curated: `sensitive-data`, `bola`, `http-rbac`, `prompt-leak` (`strategies/catalog.nlt.mjs`); `TICKET_FAST_CLOSE` objective is verify-only (no live catalog strategy).

**Recommended next migration step (after batch 1 objectives land)**

1. Add NLT objectives with `flag` keys in `strategies/objectives.nlt.mjs` (BOLA, fast-close) — no directory move.
2. Add catalog entries under `sensitive-data` (chat/RAG) and new family `http-rbac` (curated one-shots, still using `ORCHESTRATORS.single`).
3. Optional orchestrator hook: `afterTurn(ctx, turn)` in engine context to call `getTicketState` — avoids duplicating logic in every seed.
4. Only then consider `targets/nlt/` bundle + `lib/target.mjs` loader (per discovery doc §5.2).

**Dependencies observed**

- `lib/engine.mjs` → `orient-probes.mjs` (done), strategies via `lib/target.mjs`
- `lib/judge.mjs` → `verification-signals.mjs` (done)
- `adapters/nlt.mjs` → `verification-signals.normalizeTicketGetResult` (done)
- Reports/promote unchanged until new objective IDs exist
