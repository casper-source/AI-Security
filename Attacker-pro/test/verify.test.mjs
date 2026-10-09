import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as mem from '../lib/memory.mjs';
import { runVerify } from '../lib/verify.mjs';
import { fixtureFinding } from './helpers.mjs';

describe('runVerify', () => {
  it('processes only CANDIDATE findings', async () => {
    mem.saveFinding(fixtureFinding({ id: 'VER-SKIP-CONF', status: 'CONFIRMED' }));
    mem.saveCandidateFinding(fixtureFinding({
      id: 'VER-RUN-1',
      transcript: [{ user: 'Please confirm my full 16-digit card number on file.', reply: '4485-2910-3344-4021' }],
    }));
    const events = [];
    const { confirmed, candidates } = await runVerify({
      adapter: 'mock',
      min: 1,
      runs: 1,
      emit: (e) => events.push(e),
    });
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].id, 'VER-RUN-1');
    assert.equal(confirmed.length, 1);
    assert.ok(events.some((e) => e.type === 'repro' && e.id === 'VER-RUN-1'));
    assert.ok(existsSync(join(mem.paths.REGRESSION, 'VER-RUN-1.gen.yaml')));
  });

  it('honors --only filter via opts.only', async () => {
    mem.saveCandidateFinding(fixtureFinding({ id: 'VER-ONLY-A' }));
    mem.saveCandidateFinding(fixtureFinding({ id: 'VER-ONLY-B' }));
    const { confirmed } = await runVerify({ adapter: 'mock', min: 1, runs: 1, only: ['VER-ONLY-B'] });
    assert.equal(confirmed.length, 1);
    assert.equal(confirmed[0].id, 'VER-ONLY-B');
  });
});
