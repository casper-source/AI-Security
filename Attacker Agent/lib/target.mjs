// target.mjs — the adapter that talks to the MerciBank agent (the thing under test).
// This is the ONLY place that knows MerciBank's HTTP envelope. Everything else calls send().
//
// It mirrors what you built in Week 2: POST /v1/chat/completions, a bearer token, a JSON body,
// and a non-OpenAI reply at reply.text. Multi-turn works by passing the SAME session_id back.
//
// Rules of engagement: MERCI_TARGET_URL must point at YOUR OWN local MerciBank (localhost:8080).
// Nothing else. See rules-of-engagement.md.

const TARGET_URL = (process.env.MERCI_TARGET_URL || 'http://localhost:8080/v1/chat/completions');
const TARGET_KEY = (process.env.MERCI_TARGET_KEY || 'merci-lab-key');

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(TARGET_URL)) {
  console.error(`\n  REFUSING: MERCI_TARGET_URL is "${TARGET_URL}".`);
  console.error('  This lab attacks your OWN local MerciBank only (localhost). See rules-of-engagement.md.\n');
  process.exit(1);
}

// One HTTP call to the target. Retries a 429 (Retry-After) and a transient 502 from MerciBank's
// upstream model ("fetch failed" — the socket dropped before any completion). A model refusal is
// HTTP 200 and is not retried.
const UPSTREAM_BLIP = /fetch failed|Upstream model error|ECONNRESET|ETIMEDOUT|EAI_AGAIN|UND_ERR|socket hang up/i;

async function post(messages, sessionId) {
  let lastError = 'target stayed unavailable after several retries';
  for (let attempt = 0; attempt < 6; attempt++) {
    let r;
    try {
      r = await fetch(TARGET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TARGET_KEY}` },
        body: JSON.stringify({ model: 'merci-assistant', messages, session_id: sessionId }),
      });
    } catch (e) {
      lastError = `target unreachable: ${e.message}`;
      await sleep((0.4 * (attempt + 1) + 0.2) * 1000);
      continue;
    }
    if (r.status === 429) {
      const wait = Number(r.headers.get('retry-after') || 2);
      lastError = 'target stayed rate-limited after several retries — slow down (raise ATTACK_DELAY_MS)';
      await sleep((wait + 0.2) * 1000);
      continue;
    }
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { throw new Error(`target returned non-JSON (${r.status}): ${text.slice(0, 200)}`); }
    if (!r.ok) {
      const message = json?.error?.message || text.slice(0, 200);
      if ((r.status === 502 || r.status === 504) && UPSTREAM_BLIP.test(message) && attempt < 5) {
        lastError = `target ${r.status}: ${message}`;
        process.stderr.write(`    ↻ model connection dropped, retrying (${attempt + 1}/5)\n`);
        await sleep((0.5 * (attempt + 1)) * 1000);
        continue;
      }
      throw new Error(`target ${r.status}: ${message}`);
    }
    return json;
  }
  throw new Error(lastError);
}

// A conversation you can carry across turns. Each Conversation keeps one session_id, so the target
// remembers earlier turns — that is what makes multi-turn (crescendo-style) attacks possible.
export class Conversation {
  constructor() { this.sessionId = undefined; this.turns = []; }
  async say(userText) {
    // MerciBank derives context from its own server-side session history, so we only send the new turn.
    const json = await post([{ role: 'user', content: userText }], this.sessionId);
    this.sessionId = json.session_id || this.sessionId;
    const reply = json?.reply?.text ?? '';
    const turn = {
      user: userText,
      reply,
      toolCalls: json.tool_calls || [],
      retrieved: json.retrieved || [],
      findingsHint: json.findings_hint || {},
      traceId: json.trace_id,
      sessionId: this.sessionId,
    };
    this.turns.push(turn);
    return turn;
  }
}

// A one-shot health check so a run fails fast with a clear message instead of a wall of errors.
export async function health() {
  const base = TARGET_URL.replace(/\/v1\/.*$/, '');
  const r = await fetch(`${base}/health`);
  if (!r.ok) throw new Error(`health ${r.status}`);
  return r.json(); // { ok, model, hasKey }
}

export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
export const targetInfo = { url: TARGET_URL };
