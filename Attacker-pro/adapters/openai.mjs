// adapters/openai.mjs — a generic OpenAI-compatible chat target. Point RedCell at ANY /chat/completions
// endpoint: a plain model, a hosted agent, or a local server (vMLX/Ollama/LM Studio). It keeps the running
// message list so multi-turn (crescendo) works. No tool-action flags — findings here are text canaries only.
// Configure with RC_TARGET_URL / RC_TARGET_KEY / RC_TARGET_MODEL. ROE still applies.

import { assertRoe } from './index.mjs';

export function create(opts = {}) {
  const base = (opts.url || process.env.RC_TARGET_URL || 'http://localhost:11434/v1').replace(/\/$/, '');
  const key = opts.key || process.env.RC_TARGET_KEY || 'local';
  const model = opts.model || process.env.RC_TARGET_MODEL || 'gpt-4o-mini';
  const system = opts.system || process.env.RC_TARGET_SYSTEM || '';
  assertRoe(base + '/');

  async function chat(messages) {
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 400 }),
    });
    if (!r.ok) throw new Error(`target ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const j = await r.json();
    return j.choices?.[0]?.message?.content?.trim() || '';
  }

  function newSession() {
    const messages = system ? [{ role: 'system', content: system }] : [];
    async function say(userText) {
      messages.push({ role: 'user', content: userText });
      const reply = await chat(messages);
      messages.push({ role: 'assistant', content: reply });
      return { user: userText, reply, toolCalls: [], retrieved: [], findingsHint: {}, traceId: undefined, sessionId: undefined };
    }
    return { id: undefined, say };
  }

  return { info: () => ({ kind: 'openai', name: `OpenAI-compatible (${model})`, url: base }), newSession };
}
