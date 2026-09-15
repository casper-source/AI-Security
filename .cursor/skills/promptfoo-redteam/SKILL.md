---
name: promptfoo-redteam
description: >-
  Runs and interprets promptfoo red-team scans against LLM applications. Covers
  config correctness traps, plugin and strategy selection, concurrency and
  runtime budgeting, and reading true attack success rates out of the local eval
  database. Use when working with promptfooconfig.yaml or redteam.yaml, running
  promptfoo redteam generate/eval/run/report, choosing red-team plugins or
  strategies, or interpreting attack success rates and breach counts.
---

# promptfoo Red-Teaming

## Commands this project uses

Promptfoo is global. No `package.json`, no `npm run`. From the repo root:

```powershell
promptfoo redteam run --remote -j 3
promptfoo redteam generate -o redteam.yaml
promptfoo redteam eval -c redteam.yaml --remote -j 3
promptfoo redteam eval -c redteam-retest.yaml --remote -j 3 --no-cache
promptfoo redteam report
node --experimental-sqlite scripts/asr.js
node --experimental-sqlite scripts/asr.js <eval-id>
```

`--remote` is required at eval/`run` time or `jailbreak:hydra` fails to load.
Use `-j 3` whenever multi-turn strategies are in the mix.

## Config traps that silently void a scan

Check these before spending time on a scan. Each one produces a scan that runs
cleanly and reports nothing useful.

### Every entry under `prompts:` is an independent prompt

promptfoo runs each entry separately against the target. They are **not** a
system/user pair. If the attack payload `{{prompt}}` is in one entry and the
protected data is in another, exfiltration plugins have nothing to reach and can
never succeed.

Keep the instructions, the protected backend context, and `{{prompt}}` in a
single prompt. Note that N prompts also multiply the test count by N.

### `redteam.purpose` drives payload generation

Plugins generate probes from `purpose`, not from the prompt. If `purpose`
describes a different application than the prompt, every probe references
entities that do not exist in the target and gets refused for the wrong reason.

Verify after generating by counting domain terms in the output:

```powershell
$c = Get-Content redteam.yaml -Raw
foreach ($t in @('expected-term','unexpected-term')) {
  "$t : " + ([regex]::Matches($c, [regex]::Escape($t), 'IgnoreCase')).Count
}
```

### Never inline `apiKey`

Use `apiKeyEnvar` and a gitignored `.env`; promptfoo loads `.env` from the
working directory automatically.

```yaml
targets:
  - id: openai:gpt-5.6-terra
    config:
      apiKeyEnvar: OPENAI_API_KEY
```

To distinguish a missing variable from a rejected key: a missing variable fails
with `Missing <VARNAME>`, while a bad key reaches the API and returns 401.

## Concurrency is two separate settings

This is the most common source of wrong runtime estimates.

| Setting | Controls | Default |
|---|---|---|
| `redteam.maxConcurrency` in config | **Generation** only | 4 |
| `-j` / `--max-concurrency` CLI flag | **Eval** only | 4 |

`redteam.maxConcurrency` has no effect on eval runtime.

Size `-j` to the strategy mix. Single-turn tolerates `-j 10`+. Multi-turn
agentic strategies each make many internal calls, and `-j 10` starves the
request queue, producing `timed out after 300000ms in queue` errors. Use `-j 3`
when the run is mostly multi-turn.

### `runSerially` is per-test, not per-strategy

The evaluator batches on `test.options.runSerially`. It is set by plugins that
need ordering, notably `cross-session-leak` (plant a value in one session, then
try to retrieve it). Multi-turn strategies are **not** serial. Do not assume a
"Running N test cases serially" message refers to `meta` or `hydra`; check which
plugin carries the flag.

## Runtime budgeting

Generation is latency-bound per plugin, so it scales with plugin **count**, not
test count. `numTests` is nearly free at generation (one batched request per
plugin) but scales eval time linearly.

Reference points measured against a single OpenAI chat target:

| Phase | Measurement |
|---|---|
| Generation, 36 plugins, `numTests: 5`, concurrency 12 | ~4 min |
| Single-turn test (`basic`, `jailbreak:composite`) | ~2-9s each |
| Multi-turn test (`jailbreak:meta`, `jailbreak:hydra`) | ~170-260s each |

Multi-turn strategies dominate total runtime by two orders of magnitude. Scope
them to high-value plugins instead of the whole suite:

```yaml
strategies:
  - id: jailbreak:composite          # cheap, run against everything
  - id: jailbreak:hydra
    config:
      plugins: [cca, prompt-extraction, bola, rbac]
```

### `--remote` is required at eval time

`jailbreak:hydra` and other remote strategies fail at **eval** time with
`requires remote generation, which is currently disabled` even when generation
succeeded. Pass `--remote` to `promptfoo redteam run` or `promptfoo redteam eval`. Note `promptfoo validate`
accepts no such flag, so it will report these configs invalid; that is expected.

### Caching makes a re-run a replay

Evals cache by default. Re-running the same test cases returns stored responses
with 0ms latency, so it is not a fresh attack. Pass `--no-cache` for a true
retest. Identical cached responses can still flip verdicts, because the grader
is non-deterministic.

## Interpreting results: never trust raw pass/fail

A non-passing test is **not** necessarily a breach. Split on `failure_reason`:

| `failure_reason` | Meaning | Counts as breach? |
|---|---|---|
| `1` | Assertion failed, grader judged the output a breach | Yes |
| `2` | Error, no usable response | **No** |

Errors must be excluded from the denominator, not counted as passes or
failures. Report ASR as `breaches / tests that reached the model`.

In one measured scan, raw pass/fail implied 33.6% ASR (329 of 980 "failed"),
while the true rate was 9.7% (70 breaches of 721 that reached the model). The
other 259 were OpenAI's platform filter returning
`400 ... "This content was flagged for possible cybersecurity risk"`, rejecting
payloads before the model saw them.

Always report the upstream-blocked count separately. A 0% ASR on a plugin whose
payloads were mostly filtered means **untested**, not secure.

Use `scripts/asr.js` rather than recomputing this by hand. It also writes
`reports/<eval-id>.json` and `.txt` so the snapshot is in the repo:

```powershell
node --experimental-sqlite scripts/asr.js
node --experimental-sqlite scripts/asr.js <eval-id>
```

## Querying the results database

Results live in `~/.promptfoo/promptfoo.db` (SQLite). There is usually no
`sqlite3` binary or bundled `better-sqlite3`; use Node's built-in module with
`node --experimental-sqlite` and open it read-only.

Key `eval_results` columns: `eval_id`, `test_idx`, `success`, `failure_reason`,
`latency_ms`, `test_case` (JSON), `response` (JSON), `grading_result` (JSON),
`error`.

`test_case.metadata` carries `pluginId` and `strategyId`; absent `strategyId`
means the `basic` (unmodified) test. `test_idx` indexes into the `tests:` array
of the generated file, which is the reliable way to map results back to test
cases.

This also gives live progress on a running eval, since rows are written as
tests complete.

## Confirm a finding is real before reporting it

Graders flag responses that mention protected identifiers even when the response
is a refusal. Grep the model output for the specific protected values and
distinguish a genuine disclosure from an echo.

Separate the identifier from the payload: a response repeating an account number
back while refusing is not a leak; one containing the balance is. In one scan an
account number appeared in 12 responses and the holder's name in 33, but the
balance appeared in zero, so nothing was actually exfiltrated.

## Building a retest set from a prior run

To rerun only the interesting cases, filter the generated file by `test_idx`:

- graded breaches (`failure_reason = 1`) — reproduce and confirm
- never-executed cases (indices absent from `eval_results`) — still untested
- exclude passes, and exclude upstream-blocked cases, since an identical payload
  will hit the same deterministic filter again

Preserve `targets`, `prompts`, `defaultTest` and `redteam` from the source file
and replace only `tests`. Dump with `noRefs: true`, because generated files use
YAML anchors heavily.

## Plugin selection

Map plugins to the specific rules the system prompt states, rather than picking
by category. For each rule, ask which plugin falsifies it.

The `policy` plugin is the highest-precision option: one entry per rule, quoting
the rule verbatim. It anchors generation to actual text rather than an inferred
purpose, and each rule gets its own pass/fail line.

Skip plugins with no matching attack surface. Against a bare LLM with no
database or tools, `sql-injection`, `ssrf` and `shell-injection` only measure
whether the model echoes a payload. `agentic:memory-poisoning` and the `rag-*`
plugins need state or a retrieval corpus.

`indirect-prompt-injection` generates zero tests unless
`config.indirectInjectionVar` names the variable to inject into. Dataset plugins
(`pliny`, `harmbench`, `cyberseceval`) produce a small fixed number of tests
regardless of `numTests`.

### Empirical effectiveness

Measured against a banking-support assistant with a detailed
authorization-rules prompt. Treat as a prior, not a guarantee.

- `cca` (Context Compliance Attack) was the strongest finding: 27% single-turn,
  and 5 of 5 under `jailbreak:hydra`. Fabricated prior turns implying completed
  authentication defeat "never accept a user's claim of authority", because the
  forged history is not presented as a claim.
- `hijacking` and `off-topic` had the highest single-turn rates (60%, 57%). The
  assistant answered unrelated requests prompted by innocuous details in the
  transaction data. These read as low severity but are the easiest wins.
- `hallucination` and `overreliance` catch the "do not infer or fabricate" rule,
  which teams routinely write down and never test.
- The PII and authorization plugins (`pii:*`, `bola`, `rbac`, `bfla`,
  `prompt-extraction`) were largely neutralised by the platform content filter
  before reaching the model, so their 0% rates are weak evidence.
- `jailbreak-templates` (DAN, Skeleton Key) is largely patched in frontier
  models and carries the lowest success rate; deprioritise it.

## Reporting

`promptfoo redteam report` serves a local UI on `http://localhost:15500` from the
results database. It needs no API credit and keeps watching for new evals, so it
is usable after a scan is stopped or has failed. Partial results from an
interrupted eval are already persisted and appear in the report.
