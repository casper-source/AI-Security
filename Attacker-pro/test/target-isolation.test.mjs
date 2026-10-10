import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { judge, judgeAll, scanTurn } from '../lib/judge.mjs';
import {
  resolveTargetId,
  loadStrategiesForTarget,
  getObjectives,
  effectiveTargetId,
  DEFAULT_STRATEGIES,
} from '../lib/target.mjs';
import { loadStrategies } from '../strategies/catalog.mjs';
import { runCampaign } from '../lib/engine.mjs';
import { runVerify, buildVerifyPlan } from '../lib/verify.mjs';
import * as mem from '../lib/memory.mjs';
import { fixtureFinding } from './helpers.mjs';

const MERCI_ONLY_IDS = new Set(DEFAULT_STRATEGIES.map((s) => s.id));

/** Isolated temp CAMPAIGN_DIR is shared across tests — archive between cases that need a clean workspace. */
function archiveWorkspaceForTest() {
  mem.archiveCampaignWorkspace({ source: 'target-isolation-test-reset' });
}
const MB_CANARY = 'MB-TRANSFERKEY-7c1a';
const turnWithMbCanary = { user: 'x', reply: MB_CANARY, findingsHint: {} };

describe('target resolution', () => {
  it('defaults to mercibank when no target is supplied', () => {
    assert.deepEqual(resolveTargetId({ adapter: 'mercibank' }), { targetId: 'mercibank', adapter: 'mercibank' });
    assert.deepEqual(resolveTargetId({}), { targetId: 'mercibank', adapter: 'mercibank' });
  });

  it('maps mock adapter to mercibank target', () => {
    assert.deepEqual(resolveTargetId({ adapter: 'mock' }), { targetId: 'mercibank', adapter: 'mock' });
  });

  it('maps nlt adapter to nlt target', () => {
    assert.deepEqual(resolveTargetId({ adapter: 'nlt' }), { targetId: 'nlt', adapter: 'nlt' });
  });

  it('rejects incompatible adapter and explicit target', () => {
    assert.throws(() => resolveTargetId({ adapter: 'nlt', targetId: 'mercibank' }), /not compatible/);
  });

  it('legacy effectiveTargetId treats missing as mercibank', () => {
    assert.equal(effectiveTargetId(undefined), 'mercibank');
    assert.equal(effectiveTargetId(null), 'mercibank');
  });
});

describe('target-scoped catalog', () => {
  it('default loadStrategies matches MerciBank curated set', () => {
    const list = loadStrategies();
    assert.deepEqual(list.map((s) => s.id).sort(), [...DEFAULT_STRATEGIES.map((s) => s.id)].sort());
  });

  it('NLT catalog excludes MerciBank-only strategy ids', () => {
    const nlt = loadStrategiesForTarget({ targetId: 'nlt' });
    for (const s of nlt) {
      assert.ok(!MERCI_ONLY_IDS.has(s.id), `unexpected MerciBank strategy ${s.id} in NLT catalog`);
    }
  });

  it('generate(all) for NLT does not emit MerciBank objective combinations', () => {
    const gen = loadStrategiesForTarget({ targetId: 'nlt', all: true });
    const merciObjectives = new Set(['PCI', 'BOLA', 'CRED_KEY', 'EXCESSIVE_AGENCY', 'PROMPT_LEAK', 'INJECT_OBEYED', 'TOOL_DISCOVERY', 'MEMORY_POISON']);
    assert.ok(!gen.some((s) => merciObjectives.has(s.objective) || MERCI_ONLY_IDS.has(s.id)));
    assert.ok(gen.some((s) => s.objective === 'CHAT_TICKET_BOLA' || s.objective === 'PROMPT_GUIDELINE_LEAK'));
  });
});

describe('target-scoped judge', () => {
  it('MerciBank judge detects MB-TRANSFERKEY canary', () => {
    const merci = getObjectives('mercibank');
    const v = judge([turnWithMbCanary], 'CRED_KEY', merci);
    assert.equal(v.hit, true);
  });

  it('NLT judge ignores MerciBank-only canary string', () => {
    const nlt = getObjectives('nlt');
    assert.equal(scanTurn(turnWithMbCanary, nlt).length, 0);
    assert.equal(judge([turnWithMbCanary], 'CRED_KEY', nlt).hit, false);
  });

  it('opportunistic judgeAll uses active target objectives', () => {
    const merci = getObjectives('mercibank');
    const nlt = getObjectives('nlt');
    const turn = { reply: 'initiate_transfer and get_account', findingsHint: {} };
    assert.ok(judgeAll([turn], merci).TOOL_DISCOVERY);
    assert.equal(Object.keys(judgeAll([turn], nlt)).length, 0);
  });
});

describe('campaign identity persistence', () => {
  it('runCampaign banks finding with targetId and adapter', async () => {
    process.env.RC_SEED = 'target-meta';
    await runCampaign({ adapter: 'mock', episodes: 1, only: ['PCI-PRETEXT'] });
    const meta = mem.loadCampaignMeta();
    assert.equal(meta.targetId, 'mercibank');
    assert.equal(meta.adapter, 'mock');
    const cand = mem.loadCandidates().find((f) => f.id === 'PCI-PRETEXT');
    assert.ok(cand);
    assert.equal(cand.targetId, 'mercibank');
    assert.equal(cand.adapter, 'mock');
  });

  it('legacy findings without targetId remain readable as mercibank', () => {
    const f = fixtureFinding({ id: 'LEGACY-NO-TARGET' });
    assert.equal(f.targetId, undefined);
    assert.equal(effectiveTargetId(f.targetId), 'mercibank');
    mem.saveCandidateFinding(f);
    const loaded = mem.loadCandidates().find((x) => x.id === 'LEGACY-NO-TARGET');
    assert.ok(loaded);
    assert.equal(loaded.targetId, undefined);
    assert.equal(effectiveTargetId(loaded.targetId), 'mercibank');
  });
});

describe('verify workspace guard', () => {
  beforeEach(() => {
    archiveWorkspaceForTest();
  });

  it('rejects adapter/target mismatch with workspace', async () => {
    mem.saveCampaignMeta({ targetId: 'mercibank', adapter: 'mock' });
    mem.saveCandidateFinding(fixtureFinding({ id: 'MISMATCH-1', targetId: 'mercibank' }));
    await assert.rejects(
      () => runVerify({ adapter: 'nlt', min: 1, runs: 1 }),
      (e) => /mismatch/i.test(e.message),
    );
  });

  it('rejects NLT verify when legacy finding has no targetId (infers mercibank)', async () => {
    mem.saveCandidateFinding(fixtureFinding({ id: 'LEGACY-VERIFY-1' }));
    await assert.rejects(
      () => runVerify({ adapter: 'nlt', min: 1, runs: 1 }),
      (e) => /verify target mismatch/i.test(e.message) && /mercibank/.test(e.message),
    );
  });

  it('rejects NLT verify when meta has adapter but no targetId and legacy findings exist', async () => {
    mem.saveCampaignMeta({ adapter: 'mock' });
    mem.saveCandidateFinding(fixtureFinding({ id: 'LEGACY-ADAPTER-META' }));
    await assert.rejects(
      () => runVerify({ adapter: 'nlt', min: 1, runs: 1 }),
      (e) => /verify target mismatch/i.test(e.message),
    );
  });

  it('rejects verify when a finding targetId disagrees with workspace verify target', async () => {
    mem.saveCampaignMeta({ targetId: 'mercibank', adapter: 'mock' });
    mem.saveCandidateFinding(fixtureFinding({ id: 'FINDING-TARGET-OK', targetId: 'mercibank' }));
    mem.saveCandidateFinding(fixtureFinding({ id: 'FINDING-TARGET-BAD', targetId: 'nlt', objective: 'PCI' }));
    await assert.rejects(
      () => runVerify({ adapter: 'mock', min: 1, runs: 1 }),
      (e) => /mixed-target workspace|finding target mismatch/i.test(e.message),
    );
  });

  it('buildVerifyPlan enforces the same target guard as replay', () => {
    mem.saveCampaignMeta({ targetId: 'mercibank', adapter: 'mock' });
    mem.saveCandidateFinding(fixtureFinding({ id: 'PLAN-GUARD-1', targetId: 'mercibank' }));
    assert.throws(
      () => buildVerifyPlan({ adapter: 'nlt', campaign: 'active' }),
      (e) => /verify target mismatch/i.test(e.message),
    );
  });

  it('buildVerifyPlan rejects incomplete workspace inferred as mercibank for NLT request', () => {
    mem.saveCandidateFinding(fixtureFinding({ id: 'PLAN-LEGACY-1' }));
    assert.throws(
      () => buildVerifyPlan({ adapter: 'nlt', campaign: 'active' }),
      (e) => /verify target mismatch/i.test(e.message) && /mercibank/.test(e.message),
    );
  });

  it('allows mock verify for legacy finding without targetId', async () => {
    mem.saveCandidateFinding(fixtureFinding({ id: 'LEGACY-MOCK-OK' }));
    const { confirmed, candidates } = await runVerify({ adapter: 'mock', min: 1, runs: 1 });
    assert.equal(candidates.length, 1);
    assert.equal(confirmed.length, 1);
  });
});

describe('campaign workspace guard', () => {
  beforeEach(() => {
    archiveWorkspaceForTest();
  });

  it('rejects NLT campaign on legacy workspace with findings and no target metadata', async () => {
    mem.saveCandidateFinding(fixtureFinding({ id: 'LEGACY-BLOCK-NLT' }));
    await assert.rejects(
      () => runCampaign({ adapter: 'nlt', episodes: 1 }),
      (e) => /findings for target "mercibank"|campaign workspace target is "mercibank"/i.test(e.message),
    );
  });

  it('still allows mock campaign on legacy workspace without target metadata', async () => {
    mem.saveCandidateFinding(fixtureFinding({ id: 'LEGACY-MOCK-RUN' }));
    await runCampaign({ adapter: 'mock', episodes: 1, only: ['PCI-PRETEXT'] });
    assert.equal(mem.loadCampaignMeta().targetId, 'mercibank');
  });
});
