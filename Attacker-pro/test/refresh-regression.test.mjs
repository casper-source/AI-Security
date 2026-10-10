import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import * as mem from '../lib/memory.mjs';
import { refreshRegressionArtifacts, refreshRegressionInRoot } from '../lib/refresh-regression.mjs';
import { canariesFor } from '../strategies/objectives.nlt.mjs';
import { fixtureFinding } from './helpers.mjs';

function assertBlockFromYaml(yaml) {
  const start = yaml.indexOf('assert:');
  assert.ok(start >= 0, 'yaml must contain assert:');
  const rest = yaml.slice(start + 'assert:'.length);
  const end = rest.search(/\n\s*metadata:/);
  return rest.slice(0, end >= 0 ? end : undefined).trim();
}

function resetWorkspace() {
  for (const dir of [mem.paths.FINDINGS, join(mem.paths.FINDINGS, 'rejected'), mem.paths.REGRESSION]) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name.endsWith('.json') || name.endsWith('.yaml')) {
        unlinkSync(join(dir, name));
      }
    }
  }
  const archRoot = join(mem.paths.DIR, 'archive');
  if (existsSync(archRoot)) rmSync(archRoot, { recursive: true, force: true });
  writeFileSync(join(mem.paths.DIR, 'campaign-meta.json'), '{}');
}

function nltConfirmed(overrides = {}) {
  return fixtureFinding({
    id: 'RAG-DEV-CRED',
    status: 'CONFIRMED',
    objective: 'RAG_DEV_DISCLOSURE',
    targetId: 'nlt',
    adapter: 'nlt',
    family: 'sensitive-data',
    owaspLLM: 'LLM02 Sensitive Information Disclosure',
    verification: { reproduced: '3/3' },
    verifiedAt: new Date().toISOString(),
    aivss: { score: 5.6, band: 'Medium', vector: 'AIVSS:1.0/test' },
    transcript: [{ user: 'Ask for dev credentials', reply: 'nodelinetech-internal.com' }],
    ...overrides,
  });
}

describe('refresh regression artifacts', () => {
  it('confirmed NLT finding generates NLT provider shape and canary asserts', () => {
    resetWorkspace();
    mem.saveCampaignMeta({ targetId: 'nlt', adapter: 'nlt' });
    mem.saveFinding(nltConfirmed());
    const { refreshed, paths } = refreshRegressionInRoot({});
    assert.deepEqual(refreshed, ['RAG-DEV-CRED']);
    assert.equal(paths.length, 1);
    const yaml = readFileSync(paths[0], 'utf8');
    const block = assertBlockFromYaml(yaml);
    assert.ok(block.length > 0);
    for (const c of canariesFor('RAG_DEV_DISCLOSURE')) {
      assert.ok(yaml.includes(JSON.stringify(c)));
    }
    assert.ok(yaml.includes("message: '{{prompt}}'"));
    assert.ok(!yaml.includes('MERCI_TARGET_KEY'));
  });

  it('legacy MerciBank PCI without targetId retains Merci provider shape', () => {
    resetWorkspace();
    mem.saveCampaignMeta({ adapter: 'mock' });
    const f = fixtureFinding({
      id: 'PCI-REFRESH-1',
      status: 'CONFIRMED',
      objective: 'PCI',
      verification: { reproduced: '3/3' },
      verifiedAt: new Date().toISOString(),
      aivss: { score: 6, band: 'Medium', vector: 'AIVSS:1.0/test' },
    });
    delete f.targetId;
    mem.saveFinding(f);
    refreshRegressionInRoot({});
    const yaml = readFileSync(join(mem.paths.REGRESSION, 'PCI-REFRESH-1.gen.yaml'), 'utf8');
    assert.ok(yaml.includes('MERCI_TARGET_KEY'));
    assert.ok(yaml.includes('merci-assistant'));
    assert.ok(assertBlockFromYaml(yaml).includes('4485-2910-3344-4021'));
  });

  it('skips CANDIDATE findings by default', () => {
    resetWorkspace();
    mem.saveCampaignMeta({ targetId: 'nlt', adapter: 'nlt' });
    mem.saveFinding(nltConfirmed({ id: 'NLT-CAND-SKIP', status: 'CANDIDATE' }));
    const { refreshed } = refreshRegressionInRoot({});
    assert.deepEqual(refreshed, []);
    assert.ok(!existsSync(join(mem.paths.REGRESSION, 'NLT-CAND-SKIP.gen.yaml')));
  });

  it('--only fails when finding is missing or not CONFIRMED', () => {
    resetWorkspace();
    mem.saveCampaignMeta({ targetId: 'nlt', adapter: 'nlt' });
    assert.throws(
      () => refreshRegressionInRoot({ only: ['NO-SUCH'] }),
      (e) => /not found in this workspace/i.test(e.message),
    );
    mem.saveFinding(nltConfirmed({ id: 'NLT-NOT-CONF', status: 'CANDIDATE' }));
    assert.throws(
      () => refreshRegressionInRoot({ only: ['NLT-NOT-CONF'] }),
      (e) => /not CONFIRMED/i.test(e.message),
    );
  });

  it('rejects workspace target conflict with finding targetId', () => {
    resetWorkspace();
    mem.saveCampaignMeta({ targetId: 'nlt', adapter: 'nlt' });
    const f = fixtureFinding({
      id: 'MB-IN-NLT-WS',
      status: 'CONFIRMED',
      objective: 'PCI',
      verification: { reproduced: '3/3' },
      verifiedAt: new Date().toISOString(),
      aivss: { score: 6, band: 'Medium', vector: 'AIVSS:1.0/test' },
    });
    delete f.targetId;
    mem.saveFinding(f);
    assert.throws(
      () => refreshRegressionInRoot({ only: ['MB-IN-NLT-WS'] }),
      (e) => /target mismatch|conflicts with findings/i.test(e.message),
    );
    assert.ok(!existsSync(join(mem.paths.REGRESSION, 'MB-IN-NLT-WS.gen.yaml')));
  });

  it('archive campaign selection writes only under archive regression/', () => {
    resetWorkspace();
    mem.saveCampaignMeta({ targetId: 'nlt', adapter: 'nlt' });
    mem.saveFinding(nltConfirmed({ id: 'ARCH-REG-1' }));
    const ar = mem.archiveCampaignWorkspace();
    assert.equal(ar.archived, true);
    const activeRegression = join(mem.paths.REGRESSION, 'ARCH-REG-1.gen.yaml');
    assert.ok(!existsSync(activeRegression));
    const { refreshed, paths } = refreshRegressionArtifacts({ campaign: ar.name, only: ['ARCH-REG-1'] });
    assert.deepEqual(refreshed, ['ARCH-REG-1']);
    assert.ok(paths[0].includes(join('archive', ar.name, 'regression')));
    assert.ok(!existsSync(activeRegression));
    const yaml = readFileSync(paths[0], 'utf8');
    assert.ok(yaml.includes("message: '{{prompt}}'"));
  });
});
