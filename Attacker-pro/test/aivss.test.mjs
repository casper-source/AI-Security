import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { score, band } from '../lib/aivss.mjs';
import { OBJECTIVES } from '../strategies/objectives.mjs';

describe('aivss', () => {
  it('band thresholds', () => {
    assert.equal(band(0), 'None');
    assert.equal(band(3.9), 'Low');
    assert.equal(band(6.9), 'Medium');
    assert.equal(band(8.9), 'High');
    assert.equal(band(9.1), 'Critical');
  });

  it('PCI inputs produce stable medium/high score and vector prefix', () => {
    const s = score(OBJECTIVES.PCI.aivss);
    assert.ok(s.score >= 4 && s.score <= 10);
    assert.ok(s.vector.startsWith('AIVSS:1.0/'));
    assert.ok(['Low', 'Medium', 'High', 'Critical'].includes(s.band));
  });

  it('excessive agency escalates toward critical when autonomy+tool high', () => {
    const s = score(OBJECTIVES.EXCESSIVE_AGENCY.aivss);
    assert.ok(s.score >= 9);
    assert.equal(s.band, 'Critical');
  });
});
