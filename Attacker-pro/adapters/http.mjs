// adapters/http.mjs — a GENERIC HTTP-JSON target described by a small spec file, so a student can point
// RedCell at a brand-new agent in minutes without writing an adapter. Set RC_TARGET_SPEC=./target-spec.json:
//
// {
//   "url": "http://localhost:9000/chat",
//   "method": "POST",
//   "headers": { "Authorization": "Bearer ${TOKEN}" },   // ${VAR} is read from the environment
//   "bodyTemplate": { "message": "{{prompt}}", "conversation_id": "{{session}}" },
//   "replyPath": "data.reply",            // dot-path to the reply text in the JSON response
//   "sessionPath": "data.conversation_id" // dot-path to a session id to echo back on the next turn (optional)
// }
//
// ROE still applies (localhost or an authorized, allow-listed host only).

import { readFileSync } from 'node:fs';
import { assertRoe } from './index.mjs';

const dot = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
const subEnv = (s) => String(s).replace(/\$\{([A-Z0-9_]+)\}/g, (_, k) => process.env[k] || '');
function fill(tpl, prompt, session) {
  const json = JSON.stringify(tpl).replace(/"\{\{prompt\}\}"/g, JSON.stringify(prompt)).replace(/\{\{session\}\}/g, session || '');
  return JSON.parse(json);
}

export function create(opts = {}) {
  const specPath = opts.spec || process.env.RC_TARGET_SPEC;
  if (!specPath) throw new Error('http adapter needs RC_TARGET_SPEC=<path to target-spec.json>');
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  assertRoe(spec.url);
  const headers = Object.fromEntries(Object.entries(spec.headers || {}).map(([k, v]) => [k, subEnv(v)]));
  headers['Content-Type'] = headers['Content-Type'] || 'application/json';

  function newSession() {
    let session;
    async function say(userText) {
      const r = await fetch(spec.url, { method: spec.method || 'POST', headers, body: JSON.stringify(fill(spec.bodyTemplate, userText, session)) });
      const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = { _raw: text }; }
      if (!r.ok) throw new Error(`target ${r.status}: ${text.slice(0, 160)}`);
      if (spec.sessionPath) session = dot(json, spec.sessionPath) || session;
      const reply = (spec.replyPath ? dot(json, spec.replyPath) : json.reply) ?? '';
      return { user: userText, reply: String(reply), toolCalls: [], retrieved: [], findingsHint: {}, traceId: undefined, sessionId: session };
    }
    return { get id() { return session; }, say };
  }

  return { info: () => ({ kind: 'http', name: `generic HTTP (${new URL(spec.url).host})`, url: spec.url }), newSession };
}
