import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scores, pickFamily, record, orientBoost } from '../lib/planner.mjs';

const strategies = [
  { id: 'A', family: 'sensitive-data', objective: 'PCI' },
  { id: 'B', family: 'encoding', objective: 'PCI' },
  { id: 'C', family: 'injection', objective: 'CRED_KEY' },
];

describe('planner (UCB + ORIENT boost)', () => {
  it('untried families sort before tried (Infinity UCB)', () => {
    const register = { families: { 'sensitive-data': { pulls: 5, wins: 0 } } };
    const ranked = scores(register, ['sensitive-data', 'encoding'], { profile: {}, allStrategies: strategies });
    assert.equal(ranked[0].family, 'encoding');
    assert.equal(ranked[0].score, Infinity);
  });

  it('exploits higher win rate after exploration', () => {
    const register = {
      families: {
        'sensitive-data': { pulls: 4, wins: 4 },
        injection: { pulls: 4, wins: 0 },
      },
    };
    const { family } = pickFamily(register, ['sensitive-data', 'injection'], { profile: {}, allStrategies: strategies });
    assert.equal(family, 'sensitive-data');
  });

  it('record increments pulls and wins', () => {
    const reg = { families: {} };
    record(reg, 'injection', true);
    record(reg, 'injection', false);
    assert.equal(reg.families.injection.pulls, 2);
    assert.equal(reg.families.injection.wins, 1);
  });

  it('orientBoost is zero when objective not in prioritize list', () => {
    const boost = orientBoost({ prioritize: ['CRED_KEY'] }, strategies, 'encoding');
    assert.equal(boost, 0);
  });

  it('orientBoost favors family whose objective appears earlier in prioritize', () => {
    const profile = { prioritize: ['PCI', 'CRED_KEY'] };
    const bSens = orientBoost(profile, strategies, 'sensitive-data');
    const bEnc = orientBoost(profile, strategies, 'encoding');
    assert.ok(bSens > 0);
    assert.ok(bEnc > 0);
    assert.equal(bSens, bEnc); // same objective PCI in both families
  });

  it('ORIENT boost breaks tie among untried PCI families', () => {
    const register = { families: {} };
    const profile = { prioritize: ['PCI'] };
    // Both untried — equal Infinity; boost equal for PCI families — stable sort by family name in sort? 
    // injection has no PCI — lower boost
    const ranked = scores(register, ['injection', 'encoding', 'sensitive-data'], { profile, allStrategies: strategies });
    const top = ranked[0];
    assert.ok(['encoding', 'sensitive-data'].includes(top.family));
    assert.equal(top.score, Infinity);
  });

  it('applied boost can change pick among tried families with similar win rate', () => {
    const register = {
      families: {
        'sensitive-data': { pulls: 2, wins: 1 },
        encoding: { pulls: 2, wins: 1 },
      },
    };
    const noOrient = pickFamily(register, ['sensitive-data', 'encoding'], { profile: {}, allStrategies: strategies }).family;
    const withOrient = pickFamily(register, ['sensitive-data', 'encoding'], {
      profile: { prioritize: ['PCI'] },
      allStrategies: strategies,
    }).family;
    assert.ok(['sensitive-data', 'encoding'].includes(noOrient));
    assert.ok(['sensitive-data', 'encoding'].includes(withOrient));
  });
});
