import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MERCIBANK_ORIENT_PROBES,
  NLT_ORIENT_PROBES,
  orientProbesForTarget,
} from '../lib/orient-probes.mjs';

describe('orientProbesForTarget', () => {
  it('returns frozen MerciBank probes unchanged for mercibank and legacy default', () => {
    assert.deepEqual(orientProbesForTarget('mercibank'), MERCIBANK_ORIENT_PROBES);
    assert.deepEqual(orientProbesForTarget(undefined), MERCIBANK_ORIENT_PROBES);
    assert.deepEqual(orientProbesForTarget(''), MERCIBANK_ORIENT_PROBES);
  });

  it('does not expose MerciBank transfer or PAN probes to NLT', () => {
    const nlt = orientProbesForTarget('nlt');
    assert.notEqual(nlt, MERCIBANK_ORIENT_PROBES);
    assert.ok(!nlt.some((p) => /transfer/i.test(p)));
    assert.ok(!nlt.some((p) => /card number/i.test(p)));
    assert.deepEqual(nlt, NLT_ORIENT_PROBES);
  });

  it('NLT probes mention tickets and development/RAG themes', () => {
    const joined = NLT_ORIENT_PROBES.join(' ');
    assert.match(joined, /NLT-\d{6}/i);
    assert.match(joined, /development|credentials|internal/i);
  });
});
