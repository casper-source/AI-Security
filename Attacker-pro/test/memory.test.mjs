import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as mem from '../lib/memory.mjs';
import { fixtureFinding, assertNoStaleRejected } from './helpers.mjs';

describe('memory / finding lifecycle', () => {
  it('saveFinding moves REJECTED out of live findings folder', () => {
    const f = fixtureFinding({ id: 'MEM-REJECT-1', status: 'CANDIDATE' });
    mem.saveFinding(f);
    assert.ok(existsSync(join(mem.paths.FINDINGS, 'MEM-REJECT-1.json')));
    f.status = 'REJECTED';
    mem.saveFinding(f);
    const paths = assertNoStaleRejected('MEM-REJECT-1', mem);
    assert.equal(paths.live, false);
    assert.equal(paths.rejected, true);
  });

  it('CONFIRMED stays in findings folder', () => {
    const f = fixtureFinding({ id: 'MEM-CONF-1', status: 'CANDIDATE' });
    mem.saveFinding(f);
    f.status = 'CONFIRMED';
    f.verifiedAt = new Date().toISOString();
    mem.saveFinding(f);
    assert.ok(existsSync(join(mem.paths.FINDINGS, 'MEM-CONF-1.json')));
    assert.equal(JSON.parse(readFileSync(join(mem.paths.FINDINGS, 'MEM-CONF-1.json'), 'utf8')).status, 'CONFIRMED');
  });

  it('loadAllFindings dedupes when ghost rejected copy existed (single winner)', () => {
    const f = fixtureFinding({ id: 'MEM-DEDUPE-1', status: 'CANDIDATE' });
    mem.saveFinding(f);
    f.status = 'REJECTED';
    mem.saveFinding(f);
    f.status = 'CONFIRMED';
    mem.saveFinding(f);
    const all = mem.loadAllFindings().filter((x) => x.id === 'MEM-DEDUPE-1');
    assert.equal(all.length, 1);
    assert.equal(all[0].status, 'CONFIRMED');
  });

  it('loadCandidates returns only CANDIDATE status', () => {
    mem.saveFinding(fixtureFinding({ id: 'MEM-CAND-1', status: 'CANDIDATE' }));
    mem.saveFinding(fixtureFinding({ id: 'MEM-CAND-2', status: 'CONFIRMED' }));
    const ids = mem.loadCandidates().map((f) => f.id);
    assert.ok(ids.includes('MEM-CAND-1'));
    assert.ok(!ids.includes('MEM-CAND-2'));
  });

  it('archiveCampaignWorkspace moves data under campaign/archive/', () => {
    mem.saveFinding(fixtureFinding({ id: 'MEM-ARCH-1', status: 'CANDIDATE' }));
    const ar = mem.archiveCampaignWorkspace({ adapter: 'mock', source: 'test' });
    assert.equal(ar.archived, true);
    assert.ok(ar.name);
    assert.ok(existsSync(join(mem.paths.DIR, 'archive', ar.name, 'findings', 'MEM-ARCH-1.json')));
    assert.ok(existsSync(join(mem.paths.DIR, 'archive', ar.name, 'campaign.json')));
    assert.equal(mem.loadCandidates().length, 0);
  });

  it('loadAllFindingsForCampaign reads findings from a workspace root', () => {
    mem.withCampaignRoot('active', () => {
      mem.saveFinding(fixtureFinding({ id: 'MEM-CWS-1', status: 'CANDIDATE' }));
    });
    const ids = mem.loadAllFindingsForCampaign('active').map((f) => f.id);
    assert.ok(ids.includes('MEM-CWS-1'));
    assert.equal(mem.loadAllFindingsForCampaign('new').length, 0);
  });

  it('saveCampaignStrategyIds persists to meta and campaign.json', () => {
    mem.withCampaignRoot('active', () => {
      mem.saveCampaignStrategyIds(['Z-STRAT', 'A-STRAT']);
      assert.deepEqual(mem.loadCampaignStrategyIds('active'), ['A-STRAT', 'Z-STRAT']);
      assert.ok(existsSync(join(mem.paths.DIR, 'campaign.json')));
      const manifest = JSON.parse(readFileSync(join(mem.paths.DIR, 'campaign.json'), 'utf8'));
      assert.deepEqual(manifest.lastCampaignStrategyIds, ['A-STRAT', 'Z-STRAT']);
    });
  });

  it('saveCandidateFinding refuses to overwrite CONFIRMED', () => {
    mem.saveFinding(fixtureFinding({ id: 'MEM-NOOW-1', status: 'CONFIRMED' }));
    const r = mem.saveCandidateFinding(fixtureFinding({ id: 'MEM-NOOW-1', title: 'new attempt' }));
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'already CONFIRMED');
    const onDisk = mem.loadAllFindings().find((f) => f.id === 'MEM-NOOW-1');
    assert.equal(onDisk.title, 'Test finding');
  });
});
