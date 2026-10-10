# NLT Batch Discovery & RedCell Target-Profile Design

**Date:** 2026-10-10  
**Scope:** Discovery and design only — no implementation, no live probes, no NLT repo changes.  
**Repositories reviewed (read-only):** `Attacker-pro` (RedCell), `NLT` (target lab).

**Companion artifact:** [hypothesis-register.nlt.json](./hypothesis-register.nlt.json)

---

## 1. Executive summary

NodeLine Tech (NLT) is a Flask + Ollama + ChromaDB RAG chatbot with session auth, ticket workflows, multi-level “AI security” filtering, and an autonomous ticket agent (fast-close on chat, fuller decisions on `POST /api/conversation/end`). Client intake, API docs, and RoE describe a login-gated, high-security, customer-isolated system; **static code and one completed RedCell campaign contradict several of those claims**. The highest-confidence gaps are: **development KB content reachable via customer chat RAG** (already **CONFIRMED** in RedCell as `RAG_DEV_DISCLOSURE`), **chat ticket lookup without ownership** (REST ticket GET enforces ownership; chat path does not), **fast-close mutating tickets without ownership checks**, and **several admin/KB routes lacking `@require_role('admin')`**.

RedCell has a **working target split** (`lib/target.mjs` bundles MerciBank vs NLT objectives/catalogs) and **verify/workspace guards**, but the **campaign engine is still MerciBank-shaped**: fixed ORIENT probes, single NLT objective/strategy in catalog, no ticket-side verification in the NLT adapter, and report/promote paths that mix target-specific tables with legacy shims.

**Recommendation:** Adopt a **batch workflow** — one evidence pass (this document + hypothesis register), then implement **3–5 objectives per batch** that share patterns (chat+RAG judge, chat+ticket `findingsHint`, or HTTP RBAC probes). **Smallest architecture change for batch 1:** target-scoped ORIENT probes + NLT objective/catalog expansion + adapter read-only ticket helpers (no directory moves yet).

---

## 2. Evidence-backed application / attack-surface map

### 2.1 Components and entry points

| Layer | Component | Evidence | Notes |
|-------|-----------|----------|-------|
| Web UI | `/`, `/chat`, `/tickets`, `/admin`, `/products` | `NLT/app.py` routes ~1895–1933 | Chat UI does not hard-block unauthenticated chat (`static/chat.js` logs “not authenticated” but continues). |
| Core API | `POST /api/chat` | `app.py` ~2475–2533 | Rate limit 30/min; **no auth gate** — `user_id = session.get('user_id')` optional. |
| Sessions | `POST /api/login`, `/api/logout`, `GET /api/user` | `app.py` ~2547+ | Duplicate `GET /api/user` handlers (last wins). Login JSON omits `role` (recon DVS-14). |
| Conversations | `GET/POST /api/conversation/<id>`, `clear`, `POST /api/conversation/end` | `app.py` ~2535–2545, 3460–3477 | **No `@require_role` / ownership** on conversation routes (recon DVS-10). |
| Tickets (REST) | create, get by number, update, user list, escalate, SLA | `app.py` ~2898+ | `GET /api/tickets/<ticket_number>` checks `ticket['user_id'] == session['user_id']` (~2962+). |
| Admin | `/api/admin/tickets`, assign, status, reply, stats; alt reindex | `app.py` ~3179+ | `GET /api/admin/tickets` has `@require_role('admin')`; **assign/status/reply/stats and `POST /api/admin/reindex-knowledge-base` do not** (~3248+, 3483+). |
| RAG / KB | ChromaDB via `scripts/rag_helper.py`, `vector_rag_manager.py` | RoE §4; `rag_helper.py` category routing | `development` category in router keywords; fallback searches all categories when scores weak. |
| KB HTTP | `GET /api/knowledge-base/stats` (open), search/reindex (admin) | `app.py` ~2843–2866 | Stats endpoint **intentionally open** (comment in code). |
| Health | `GET /api/health`, `/api/health/ollama` | `app.py` ~2794+ | Payload **does not include** `AI_SECURITY_LEVEL` (recon DVS-03 vs `docs/api.md`). |
| Agent | Fast close + AI ticket decision | `app.py` `_fast_close_check_from_message` ~803+; `_ai_agent_ticket_decision` (on conversation end) | Fast close runs **every** `send_message` before LLM (~1196–1198). |

**Inference (not live-tested in this task):** Ollama on `:11434` is internal; RoE excludes direct Ollama attacks. SQLite/Chroma files out of scope; testing via API only.

### 2.2 Identities, assets, trust boundaries

| Identity | Source | Capabilities (declared / observed) |
|----------|--------|-----------------------------------|
| Anonymous | No session | **Observed:** `POST /api/chat` allowed (`app.py` api_chat). Intake A5 says login required — **contradiction**. |
| Customer (`user`) | RoE §7 test accounts; DB role `user` | Own tickets via REST; chat may load **any** `NLT-\d{6}` ticket into prompt (`get_controlled_ticket_context` ~1102–1106, no `user_id` in WHERE). |
| Admin | RoE §7 | Full ticket/KB admin **when RBAC enforced**; several routes lack decorator (static). |

**Assets:** customer PII in tickets/conversations; **development KB** (`knowledge_base/development/`, including `keys.md` — high sensitivity per RoE §15); product/policy FAQs (low); session cookies (`nlt_session`).

**Trust boundaries:** (1) user ↔ model prompt (system + RAG + ticket injection), (2) customer ↔ customer data (BOLA), (3) customer ↔ admin operations (RBAC), (4) chat ↔ ticket state mutations (agent).

### 2.3 Data flows

```
User message → POST /api/chat
  → fast_close_check (may mutate ticket)
  → RAG retrieve (rag_helper → ChromaDB)
  → get_controlled_ticket_context (optional DB read by ticket number)
  → build prompt (base_prompt + COMPANY KNOWLEDGE BASE + ticket block)
  → Ollama → response JSON
```

System prompt includes a **GUIDELINES** block and instruction not to reference the prompt (`app.py` ~1287–1295). RAG text is embedded as untrusted-looking “COMPANY KNOWLEDGE BASE” but still influences model output.

### 2.4 Security controls (declared vs observed)

| Control | Declared | Observed (source) |
|---------|----------|-------------------|
| AI security levels 1–5 | RoE §15, `api.md` | Default **`AI_SECURITY_LEVEL=1`** (`app.py` ~64–81) |
| Login required for chat | Intake A5 | **Not enforced** on API (`app.py` api_chat) |
| Ticket isolation | Intake D4, RoE acceptance | REST **yes**; chat context **no** on specific ticket number |
| Admin RBAC | RoE §6 | **Partial** — decorator on some routes only |
| Rate limits | RoE §8 | Wired in code; **not verified** under load in this task |
| CSRF | RoE §15 | `@csrf.exempt` on `/api/*` mutations |
| RedCell ROE | `adapters/index.mjs` `assertRoe` | Localhost default; allowlist + `ROE_AUTHORIZED` for remote |

### 2.5 Prior RedCell / NLT assessment results

| Item | Status | Evidence |
|------|--------|----------|
| `RAG_DEV_DISCLOSURE` / strategy `RAG-DEV-CRED` | **CONFIRMED** (3/3 verify) | `campaign/findings/RAG-DEV-CRED.json` — canary hit on internal hostname marker (transcript contains synthetic dev credentials; **not reproduced in this report**). |
| Target isolation / verify guards | Exercised in tests | `test/target-isolation.test.mjs`, archive findings `FINDING-TARGET-*`, `LEGACY-BLOCK-NLT` |
| NLT catalog | **1 curated strategy** | `strategies/catalog.nlt.mjs`, `test/nlt-rag-objective.test.mjs` |
| ORIENT probes | Still MerciBank-themed | `lib/engine.mjs` `PROBES` — “transfer”, “card number”; reflected in `campaign/profile.json` |

### 2.6 Known unknowns and contradictions

- Runtime `AI_SECURITY_LEVEL` on operator instance (not in `/api/health`; check env / logs).
- Live BOLA, fast-close, admin bypass, conversation IDOR — **hypotheses from static code**, not confirmed in this discovery task.
- Whether LLM paraphrases dev secrets without exact canary substrings (judge false negatives).
- Product lead intake C8 (“no internal KB”) vs RoE and repo layout — **RoE and code take precedence** for testing scope.

---

## 3. Hypothesis register (summary)

Full machine-readable entries: **[hypothesis-register.nlt.json](./hypothesis-register.nlt.json)** (18 hypotheses).

**Status legend:** `hypothesis` = design only; `ready_for_test` = objective/strategy spec clear, dependencies documented; `blocked` = missing approval, fixture, or architecture.

| ID | Title | Status | Impact (if true) | Conf. (evidence) |
|----|-------|--------|------------------|------------------|
| HYP-NLT-001 | RAG development KB disclosure | ready_for_test | HIGH | HIGH (confirmed finding) |
| HYP-NLT-002 | Chat cross-customer ticket disclosure (BOLA) | ready_for_test | HIGH | HIGH (code) |
| HYP-NLT-003 | Fast-close unauthorized ticket closure | ready_for_test | HIGH | HIGH (code) |
| HYP-NLT-004 | Admin ticket/KB API missing RBAC | ready_for_test | HIGH | HIGH (code) |
| HYP-NLT-005 | Conversation IDOR / unauth end → agent | ready_for_test | MEDIUM–HIGH | HIGH (code) |
| HYP-NLT-006 | System guideline / prompt leakage | ready_for_test | MEDIUM | MEDIUM (prompt text in code) |
| HYP-NLT-007 | AI security level ineffective / default wide open | hypothesis | MEDIUM–HIGH | HIGH (default level 1) |
| HYP-NLT-008 | Anonymous chat expands attack surface | ready_for_test | MEDIUM | HIGH (code) |
| HYP-NLT-009 | Open KB stats information disclosure | hypothesis | LOW–MEDIUM | MEDIUM (open route) |
| HYP-NLT-010 | Indirect prompt injection via RAG context | hypothesis | MEDIUM | MEDIUM (architecture) |
| HYP-NLT-011 | Off-topic / harmful output at low security level | hypothesis | MEDIUM | MEDIUM (level 1 mode) |
| HYP-NLT-012 | Full agent path via conversation/end | hypothesis | MEDIUM | MEDIUM (code path) |
| HYP-NLT-013 | Escalation/discount agent abuse | hypothesis | MEDIUM | MEDIUM |
| HYP-NLT-014 | Rate-limit handling / duplicate chat on 429 | hypothesis | LOW | MEDIUM (adapter policy) |
| HYP-NLT-015 | Registration abuse / weak account controls | hypothesis | LOW | LOW (not reviewed deeply) |
| HYP-NLT-016 | Error message verbose leakage | hypothesis | LOW | LOW |
| HYP-NLT-017 | Judge misses paraphrased secrets | hypothesis | N/A (method) | MEDIUM |
| HYP-NLT-018 | Multi-turn encoding bypass of input filters | hypothesis | MEDIUM | LOW until level ≥2 confirmed |

---

## 4. RedCell architecture assessment

### 4.1 Current flow (target-specific vs shared)

| Concern | Shared engine | Target-specific today | Coupling risk |
|---------|---------------|------------------------|---------------|
| Objectives / canaries | `lib/judge.mjs` (table injected) | `strategies/objectives.{mercibank,nlt}.mjs` via `lib/target.mjs` `BUNDLES` | Low — clean split for objectives |
| Strategy catalog | `strategies/orchestrators.mjs`, `converters.mjs` | `catalog.{mercibank,nlt}.mjs` | Low for catalogs; NLT has **1** strategy |
| Adapter wire format | `adapters/index.mjs` contract | `adapters/nlt.mjs`, `mercibank.mjs` | Medium — NLT lacks ticket/KB helpers |
| Campaign loop | `lib/engine.mjs` | `resolveTargetId`, `getObjectives`, `loadStrategiesForTarget` | **High** — hardcoded MerciBank ORIENT `PROBES` |
| Planner / UCB | `lib/planner.mjs` | Uses families from loaded catalog | Low |
| Judge | `lib/judge.mjs` | Canaries/flags from objective table | Medium — **no use of `meta.outcome`**; NLT adapter never sets `findingsHint` |
| Verify | `lib/verify.mjs` | `getObjectives(f.targetId)` | Medium — `regUrl` fallback still MerciBank URL (~96) |
| Workspace isolation | `lib/verify-guard.mjs`, `memory.mjs` | `targetId`/`adapter` on findings + meta | **Strong** — mixed-target verify blocked |
| Reports | `lib/report-content.mjs` | `FIX_NLT` / `FIX_MERCIBANK` maps | Medium — maps live outside target bundles |
| Promote / regression | `lib/promote.mjs`, `refresh-regression.mjs` | NLT provider shape in promote | Low — tests cover NLT regression |
| Dashboard | `lib/dashboard-catalog.mjs`, `server.mjs` | Per-adapter catalog | Low |

**Compatibility shims to preserve:** `strategies/objectives.mjs` (MerciBank re-export), `strategies/catalog.mjs` → `loadStrategiesForTarget`, legacy findings without `targetId` → `mercibank` (`LEGACY_DEFAULT_TARGET_ID` in `target.mjs`).

### 4.2 MerciBank / NLT split (observed behavior)

- Adapter `nlt` **only** allowed with target `nlt`; `mock`/`mercibank` → mercibank (`target.mjs` `ADAPTER_ALLOWED_TARGETS`).
- OpenAI/http adapters may target either — useful for brain models, not for confusing workspace identity.
- Campaign archive `2026-10-10-002033-01` / `LEGACY-BLOCK-NLT` — workspace blocks cross-target runs (by design).

---

## 5. Proposed target-profile / strategy organization

**Principle:** Explicit bundles per target; shared orchestrators/converters/engine; **no generic plugin framework** unless a third target appears.

### 5.1 Logical model

| Layer | Contents |
|-------|----------|
| **Engine** | WAKE/ORIENT/PLAN/ATTACK/JUDGE/VERIFY — unchanged lifecycle |
| **Target profile** | RoE caps, probe strings, persona env vars, optional `roeConstraints` for assertRoe extensions |
| **Objectives** | IDs, canaries, flags, OWASP/AIVSS, evidence rules |
| **Catalog** | Curated strategies + optional `generate()` matrix |
| **Adapter** | Transport + session + **verification hooks** (ticket GET, admin probe helpers) |
| **Reporting** | Per-target fix/plain/action text keyed by objective |

### 5.2 Evaluated directory layout (future — **do not move in this phase**)

```
Attacker-pro/
  targets/
    mercibank/
      profile.json          # probes, default strategies pointer
      objectives.mjs
      catalog.mjs
      report.mjs            # FIX_/PLAIN_/ACTION_ maps
    nlt/
      profile.json
      objectives.mjs
      catalog.mjs
      report.mjs
  strategies/
    objectives.mjs          # shim → mercibank
    catalog.mjs             # shim → loadStrategiesForTarget
    orchestrators.mjs       # shared
    converters.mjs          # shared
  lib/
    target.mjs              # loads targets/* bundles (replace inline imports)
```

**Remain as shims:** `strategies/objectives.mjs`, `strategies/catalog.mjs`, `strategies/objectives.mercibank.mjs` re-export from `targets/mercibank/` during migration.

### 5.3 Migration sequence (small steps)

1. **Document** hypothesis register + batch plan (this deliverable).
2. Add `targets/nlt/profile.json` with ORIENT probes only; teach `engine.mjs` to load probes by `targetId` (MerciBank defaults unchanged).
3. Expand `objectives.nlt.mjs` + `catalog.nlt.mjs` for batch 1 IDs (no engine logic change beyond probes).
4. Extend `adapters/nlt.mjs` with read-only `getTicket(ticketNumber)` and optional `findingsHint` population; wire flags in objectives.
5. Add HTTP-focused strategies (admin RBAC) as separate family using adapter helper — keeps chat orchestrators unchanged.
6. Move `FIX_NLT` / `FIX_MERCIBANK` into target report modules; thin wrappers in `report-content.mjs`.
7. Optional: relocate files under `targets/*` with re-export shims; run full test suite.

Each step independently testable via existing `test/*.mjs` patterns.

---

## 6. Ranked batch implementation plan

### Batch 1 (recommended first — ~3–5 objectives)

| Rank | Objective ID | Hypothesis | Shared pattern | Impl effort | Validation effort |
|------|--------------|------------|----------------|-------------|-------------------|
| 1 | `RAG_DEV_DISCLOSURE` | HYP-NLT-001 | Chat + canary judge | **Done** | **Done** (CONFIRMED) |
| 2 | `CHAT_TICKET_BOLA` | HYP-NLT-002 | Chat + **ticket GET verification** | M (~2–3 d) | M (needs 2nd customer persona) |
| 3 | `TICKET_FAST_CLOSE` | HYP-NLT-003 | Chat + ticket status `findingsHint` | M (~2 d) | M (state mutation — RoE approval) |
| 4 | `ADMIN_RBAC_BYPASS` | HYP-NLT-004 | Direct HTTP / adapter helper | S–M (~1–2 d) | S (status codes; careful on writes) |
| 5 | `PROMPT_GUIDELINE_LEAK` | HYP-NLT-006 | Chat + canary judge (guideline substrings) | S (~1 d) | S |

**Prerequisites (batch 1):**

- Local NLT stack; `NLT_EMAIL` / `NLT_PASSWORD` (and second customer for BOLA).
- Documented `AI_SECURITY_LEVEL` for engagement (blocks meaningful security-level bypass tests).
- Written approval for **ticket-mutating** tests (fast-close) per RoE §7–8 and recon §G.
- RedCell: target-scoped ORIENT probes + NLT ticket helper in adapter.

**Blockers:**

| Item | Blocks |
|------|--------|
| Second customer account not configured | HYP-NLT-002 live test |
| No approval for state-changing tests | HYP-NLT-003, parts of HYP-NLT-004 |
| Unknown security level | HYP-NLT-007, HYP-NLT-018 meaningful runs |

**Smallest architecture change enabling batch 1:** Target-specific ORIENT probes in `engine.mjs` + NLT adapter ticket readback for `findingsHint` flags (objectives define flags; judge already supports `flag`).

### Batch 2 (follow-on)

- `CONVERSATION_IDOR`, `CONVERSATION_END_AGENT`, `ANON_CHAT_SURFACE`, `KB_STATS_DISCLOSURE`, security-level bypass matrix once level documented.

### Shared vs target-specific strategy boundary

| Reuse across targets | Keep target-specific |
|----------------------|----------------------|
| Orchestrators (`ladder`, `crescendo`, …) | Seeds, mutate hints, personas |
| Converters (`base64`, `authority`, …) | Canaries, flags, evidence rules |
| Planner UCB / family selection | ORIENT probes, RoE rate-cap notes |
| Judge algorithm | Objective tables |
| verify-guard / memory layout | Adapter endpoints & outcome taxonomy |

### Ready for implementation vs live test approval

| Gate | Criteria |
|------|----------|
| **Ready for implementation** | Hypothesis row in register; objective ID + canaries/flags; catalog seeds; unit tests for judge/catalog; no RoE conflict for **code** changes in RedCell only. |
| **Ready for live test** | Signed/lab RoE window; localhost `assertRoe`; credentials/fixtures; for mutations: explicit operator approval + rollback plan; rate budget; stop conditions documented. |
| **Ready for verify/promote** | CANDIDATE finding in workspace; adapter/target match guards pass; reproduction budget within ROE. |

---

## 7. Limitations and unresolved questions

- No HTTP traffic or campaigns were executed for this document; static code + existing `campaign/findings` only.
- NLT `.env` on operator machine not read (secrets); `AI_SECURITY_LEVEL` inferred from code default and optional `.env.example` pattern referenced in `scripts/phase2c-preflight-probe.mjs`.
- LLM non-determinism may affect reproduction; judge is substring-based (HYP-NLT-017).
- Admin route behavior for **write** methods needs careful scoping to lab DB only.
- Intake vs RoE vs code conflicts were not adjudicated with the client — recorded as test design inputs.

---

## Appendix A — Key source paths reviewed

**NLT:** `docs/ROE.md`, `docs/nodelinetech-intake.md`, `docs/recon-phase1-declared-vs-observed.md`, `docs/api.md`, `app.py`, `scripts/rag_helper.py`, `static/chat.js`, `knowledge_base/development/` (layout only).

**RedCell:** `lib/target.mjs`, `lib/engine.mjs`, `lib/judge.mjs`, `lib/verify.mjs`, `lib/verify-guard.mjs`, `lib/memory.mjs`, `lib/promote.mjs`, `lib/report-content.mjs`, `lib/dashboard-catalog.mjs`, `adapters/nlt.mjs`, `adapters/index.mjs`, `strategies/objectives.{mjs,nlt.mjs,mercibank.mjs}`, `strategies/catalog.nlt.mjs`, `campaign/findings/RAG-DEV-CRED.json`, `campaign/profile.json`, `test/nlt-rag-objective.test.mjs`, `test/target-isolation.test.mjs`, `rules-of-engagement.md`.
