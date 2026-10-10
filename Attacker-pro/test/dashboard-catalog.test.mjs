import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildStrategyCatalog, prepareDashboardRun } from '../lib/dashboard-catalog.mjs';
import { DEFAULT_STRATEGIES } from '../lib/target.mjs';

describe('dashboard catalog', () => {
  it('mock/mercibank adapter exposes MerciBank curated strategies', () => {
    const cat = buildStrategyCatalog('mock');
    assert.equal(cat.targetId, 'mercibank');
    assert.equal(cat.adapter, 'mock');
    assert.ok(cat.strategies.length > 0);
    assert.equal(cat.catalogEmpty, false);
    assert.equal(cat.emptyMessage, null);
    assert.ok(cat.strategies.some((s) => s.id === 'PCI-PRETEXT'));
  });

  it('nlt adapter exposes curated NLT strategies', () => {
    const cat = buildStrategyCatalog('nlt');
    assert.equal(cat.targetId, 'nlt');
    assert.equal(cat.adapter, 'nlt');
    assert.equal(cat.strategies.length, 4);
    assert.equal(cat.catalogEmpty, false);
    assert.equal(cat.emptyMessage, null);
    assert.ok(cat.strategies.some((s) => s.id === 'RAG-DEV-CRED'));
    assert.ok(cat.strategies.some((s) => s.id === 'CHAT-TICKET-BOLA'));
  });

  it('request-scoped catalog differs by adapter (not RC_ADAPTER alone)', () => {
    const prev = process.env.RC_ADAPTER;
    process.env.RC_ADAPTER = 'mercibank';
    try {
      const merci = buildStrategyCatalog('mock');
      const nlt = buildStrategyCatalog('nlt');
      assert.ok(merci.strategies.length > 0);
      assert.equal(nlt.strategies.length, 4);
      assert.ok(nlt.strategies.some((s) => s.id === 'RAG-DEV-CRED'));
    } finally {
      if (prev === undefined) delete process.env.RC_ADAPTER;
      else process.env.RC_ADAPTER = prev;
    }
  });
});

describe('prepareDashboardRun', () => {
  it('rejects stale MerciBank-only ids for NLT target', () => {
    const prep = prepareDashboardRun('nlt', ['PCI-PRETEXT']);
    assert.ok(prep.error);
    assert.equal(prep.strategyIds.length, 0);
    assert.deepEqual(prep.dropped, ['PCI-PRETEXT']);
  });

  it('accepts MerciBank strategy id for mock target', () => {
    const id = DEFAULT_STRATEGIES[0].id;
    const prep = prepareDashboardRun('mock', [id]);
    assert.equal(prep.error, undefined);
    assert.equal(prep.targetId, 'mercibank');
    assert.deepEqual(prep.only, [id]);
  });

  it('accepts NLT strategy id for nlt target', () => {
    const prep = prepareDashboardRun('nlt', ['RAG-DEV-CRED']);
    assert.equal(prep.error, undefined);
    assert.equal(prep.targetId, 'nlt');
    assert.deepEqual(prep.only, ['RAG-DEV-CRED']);
    assert.deepEqual(prep.strategyIds, ['RAG-DEV-CRED']);
  });

  it('full catalog when only is empty', () => {
    const prep = prepareDashboardRun('mock', null);
    assert.equal(prep.only, null);
    assert.ok(prep.strategyIds.length > 0);
    assert.ok(prep.strategyIds.includes('PCI-PRETEXT'));
  });
});
