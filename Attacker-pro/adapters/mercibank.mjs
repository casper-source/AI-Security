// adapters/mercibank.mjs — the Week-2 MerciBank HTTP envelope: POST /v1/chat/completions, a bearer token,
// reply at reply.text, plus tool_calls / retrieved / findings_hint / trace_id, and server-side sessions via
// session_id. This is the ONLY place that knows MerciBank's wire shape. Localhost-only by default (ROE).

import { assertRoe } from './index.mjs';

export function create(opts = {}) {
  const url = opts.url || process.env.MERCI_TARGET_URL || 'http://localhost:8080/v1/chat/completions';
  const key = opts.key || process.env.MERCI_TARGET_KEY || 'merci-lab-key';
  assertRoe(url);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function post(messages, sessionId) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: 'merci-assistant', messages, session_id: sessionId }),
      });
      if (r.status === 429) { await sleep((Number(r.headers.get('retry-after') || 2) + 0.2) * 1000); continue; }
      const text = await r.text();
      let json; try { json = JSON.parse(text); } catch { throw new Error(`target returned non-JSON (${r.status}): ${text.slice(0, 160)}`); }
      if (!r.ok) throw new Error(`target ${r.status}: ${json?.error?.message || text.slice(0, 160)}`);
      return json;
    }
    throw new Error('target stayed rate-limited — slow down (raise ATTACK_DELAY_MS)');
  }

  function newSession() {
    let sessionId;
    async function say(userText) {
      const j = await post([{ role: 'user', content: userText }], sessionId);
      sessionId = j.session_id || sessionId;
      return {
        user: userText, reply: j?.reply?.text ?? '', toolCalls: j.tool_calls || [],
        retrieved: j.retrieved || [], findingsHint: j.findings_hint || {}, traceId: j.trace_id, sessionId,
      };
    }
    return { get id() { return sessionId; }, say };
  }

  return {
    info: () => ({ kind: 'mercibank', name: 'MerciBank (HTTP)', url }),
    async health() { const base = url.replace(/\/v1\/.*$/, ''); const r = await fetch(`${base}/health`); if (!r.ok) throw new Error(`health ${r.status}`); return r.json(); },
    newSession,
  };
}
