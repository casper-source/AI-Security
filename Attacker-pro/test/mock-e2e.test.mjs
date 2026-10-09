import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runCampaign } from '../lib/engine.mjs';
import { runVerify } from '../lib/verify.mjs';
import * as mem from '../lib/memory.mjs';

describe('mock E2E (campaign → verify → promote)', () => {
  it('PCI-PRETEXT banks candidate then confirms with repro', async () => {
    process.env.RC_SEED = 'e2e-pci';
    const { found } = await runCampaign({
      adapter: 'mock',
      episodes: 1,
      only: ['PCI-PRETEXT'],
    });
    assert.deepEqual(found, ['PCI-PRETEXT']);
    assert.ok(existsSync(join(mem.paths.FINDINGS, 'PCI-PRETEXT.json')));
    const cand = mem.loadCandidates().find((f) => f.id === 'PCI-PRETEXT');
    assert.ok(cand);
    assert.equal(cand.status, 'CANDIDATE');

    const { confirmed } = await runVerify({ adapter: 'mock', min: 1, runs: 2, only: ['PCI-PRETEXT'] });
    assert.equal(confirmed.length, 1);
    assert.equal(confirmed[0].status, 'CONFIRMED');
    assert.ok(confirmed[0].aivss?.score > 0);
    assert.ok(existsSync(join(mem.paths.REGRESSION, 'PCI-PRETEXT.gen.yaml')));
    assert.ok(existsSync(join(mem.paths.REDTEAM, 'redteam.yaml')));
  });

  it('CONTROL strategy does not count as bandit win', async () => {
    process.env.RC_SEED = 'e2e-control';
    const regBefore = mem.loadRegister();
    await runCampaign({ adapter: 'mock', episodes: 1, only: ['CONTROL-NAIVE'] });
    const reg = mem.loadRegister();
    const ctrl = reg.families?.control;
    if (ctrl) assert.equal(ctrl.wins, 0);
  });
});
