import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureFinding } from './helpers.mjs';
import { canariesFor } from '../strategies/objectives.nlt.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const promoteCli = join(repoRoot, 'promote.mjs');

function makeWorkspace() {
  const dir = mkdtempSync(join(tmpdir(), 'redcell-promote-cli-'));
  mkdirSync(join(dir, 'findings'), { recursive: true });
  mkdirSync(join(dir, 'regression'), { recursive: true });
  return dir;
}

function seedFinding(workspaceDir, finding, meta = { targetId: 'nlt', adapter: 'nlt' }) {
  writeFileSync(join(workspaceDir, 'campaign-meta.json'), JSON.stringify(meta, null, 2));
  writeFileSync(join(workspaceDir, 'findings', `${finding.id}.json`), JSON.stringify(finding, null, 2));
}

function runPromote(workspaceDir, extraArgs = []) {
  return spawnSync(
    process.execPath,
    [promoteCli, '--campaign', 'active', ...extraArgs],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        CAMPAIGN_DIR: workspaceDir,
        RC_QUIET: '1',
      },
      encoding: 'utf8',
    },
  );
}

function nltConfirmedCli(overrides = {}) {
  return fixtureFinding({
    id: 'CLI-NLT-CONFIRMED',
    status: 'CONFIRMED',
    objective: 'RAG_DEV_DISCLOSURE',
    targetId: 'nlt',
    adapter: 'nlt',
    family: 'sensitive-data',
    owaspLLM: 'LLM02 Sensitive Information Disclosure',
    verification: { reproduced: '3/3' },
    verifiedAt: new Date().toISOString(),
    aivss: { score: 5.6, band: 'Medium', vector: 'AIVSS:1.0/test' },
    transcript: [{ user: 'Synthetic repro prompt for CLI test', reply: 'marker only' }],
    ...overrides,
  });
}

describe('promote.mjs CLI (subprocess)', () => {
  it('refreshes one CONFIRMED NLT finding and writes target-aware YAML', () => {
    const ws = makeWorkspace();
    const finding = nltConfirmedCli();
    seedFinding(ws, finding);
    const r = runPromote(ws, ['--only', finding.id]);
    const combined = `${r.stdout || ''}\n${r.stderr || ''}`;
    assert.equal(r.status, 0, combined.slice(0, 500));
    assert.match(combined, /refreshed:/i);
    assert.ok(!/TypeError/i.test(combined));
    const yamlPath = join(ws, 'regression', `${finding.id}.gen.yaml`);
    assert.ok(existsSync(yamlPath));
    const yaml = readFileSync(yamlPath, 'utf8');
    assert.ok(yaml.includes("message: '{{prompt}}'"));
    assert.ok(!yaml.includes('MERCI_TARGET_KEY'));
    for (const c of canariesFor('RAG_DEV_DISCLOSURE')) {
      assert.ok(yaml.includes(JSON.stringify(c)), `expected canary assert in yaml`);
    }
  });

  it('exits nonzero when --only id is missing from workspace', () => {
    const ws = makeWorkspace();
    writeFileSync(join(ws, 'campaign-meta.json'), JSON.stringify({ targetId: 'nlt', adapter: 'nlt' }));
    const r = runPromote(ws, ['--only', 'CLI-MISSING-ID']);
    const combined = `${r.stdout || ''}\n${r.stderr || ''}`;
    assert.notEqual(r.status, 0);
    assert.match(combined, /not found in this workspace/i);
    assert.ok(!/TypeError/i.test(combined));
    assert.ok(!existsSync(join(ws, 'regression', 'CLI-MISSING-ID.gen.yaml')));
  });

  it('exits nonzero when --only finding is not CONFIRMED', () => {
    const ws = makeWorkspace();
    const finding = nltConfirmedCli({ id: 'CLI-NLT-CANDIDATE', status: 'CANDIDATE' });
    seedFinding(ws, finding);
    const r = runPromote(ws, ['--only', finding.id]);
    const combined = `${r.stdout || ''}\n${r.stderr || ''}`;
    assert.notEqual(r.status, 0);
    assert.match(combined, /not CONFIRMED/i);
    assert.ok(!/TypeError/i.test(combined));
    assert.ok(!existsSync(join(ws, 'regression', `${finding.id}.gen.yaml`)));
  });
});
