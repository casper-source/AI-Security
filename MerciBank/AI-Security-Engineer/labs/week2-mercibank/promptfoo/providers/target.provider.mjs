// MerciBank target — custom JavaScript provider (Day 3, second connection pattern).
// Same target as target.http.yaml, but in code. Use this when a target needs logic an
// HTTP block can't express (custom auth, carrying session_id + trace_id across turns,
// pulling evidence out of the envelope). Reference it from a config as:
//   providers:
//     - id: file://promptfoo/providers/target.provider.mjs
//       label: merci-js
export default class MerciProvider {
  constructor(options = {}) {
    this.config = options.config || {};
    this.url = this.config.url || process.env.MERCI_URL || 'http://localhost:8080/v1/chat/completions';
    this.key = this.config.key || process.env.MERCI_TARGET_KEY || 'merci-lab-key';
    this.providerId = options.id || 'merci-js';
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context = {}) {
    try {
      const sessionId = context?.vars?.sessionId; // set per-test if you enable stateful sessions
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.key}` },
        body: JSON.stringify({
          model: 'merci-assistant',
          ...(sessionId ? { session_id: sessionId } : {}),
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) {
        return { error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
      }
      const j = await res.json();
      return {
        output: j.reply?.text ?? '',
        // Everything below becomes evidence you can assert on or read in the web viewer:
        metadata: {
          trace_id: j.trace_id,
          session_id: j.session_id,
          retrieved: j.retrieved,
          tool_calls: j.tool_calls,
        },
        tokenUsage: j.usage
          ? { total: j.usage.total_tokens, prompt: j.usage.prompt_tokens, completion: j.usage.completion_tokens }
          : undefined,
      };
    } catch (e) {
      return { error: String(e.message || e) };
    }
  }
}
