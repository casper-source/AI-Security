import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { create as mock } from '../adapters/mock.mjs';
import { create as mercibank } from '../adapters/mercibank.mjs';
import { create as http } from '../adapters/http.mjs';
import { create as nlt } from '../adapters/nlt.mjs';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('adapter contract (no live targets)', () => {
  it('mock: newSession() no-arg and turn shape', async () => {
    const s = mock().newSession();
    const turn = await s.say('hello');
    assert.equal(typeof turn.user, 'string');
    assert.equal(typeof turn.reply, 'string');
    assert.ok(Array.isArray(turn.toolCalls));
    assert.ok(turn.findingsHint && typeof turn.findingsHint === 'object');
  });

  describe('mercibank + http throw on HTTP error (unchanged)', () => {
    /** @type {typeof fetch} */
    let originalFetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        status: 503,
        headers: { get: () => null },
        text: async () => JSON.stringify({ error: { message: 'down' } }),
      });
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('mercibank say throws on !ok', async () => {
      const a = mercibank({ url: 'http://localhost:8080/v1/chat/completions', key: 'k' });
      await assert.rejects(() => a.newSession().say('x'), /503/);
    });

    it('http say throws on !ok', async () => {
      const specPath = join(tmpdir(), `rc-http-spec-${Date.now()}.json`);
      writeFileSync(specPath, JSON.stringify({
        url: 'http://localhost:9000/chat',
        bodyTemplate: { message: '{{prompt}}' },
        replyPath: 'reply',
      }));
      try {
        const a = http({ spec: specPath });
        await assert.rejects(() => a.newSession().say('x'), /503/);
      } finally {
        try { unlinkSync(specPath); } catch { /* ignore */ }
      }
    });
  });

  it('nlt: newSession() no-arg with mocked happy path', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.endsWith('/api/login')) {
        return {
          status: 200,
          ok: true,
          headers: { get: () => null, getSetCookie: () => ['nlt_session=t; Path=/'] },
          text: async () => JSON.stringify({ success: true }),
        };
      }
      if (u.endsWith('/api/chat')) {
        return {
          status: 200,
          ok: true,
          headers: { get: () => null, getSetCookie: () => [] },
          text: async () => JSON.stringify({ success: true, response: 'pong', conversation_id: 'c' }),
        };
      }
      throw new Error(`unexpected ${u}`);
    };
    try {
      const a = nlt({
        baseUrl: 'http://localhost:5000',
        email: 'u@example.com',
        password: 'p',
      });
      const turn = await a.newSession().say('ping');
      assert.equal(turn.reply, 'pong');
      assert.equal(turn.meta?.outcome, 'chat');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
