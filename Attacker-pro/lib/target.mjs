// target.mjs — explicit target identity (mercibank | nlt), separate from adapter wire format.
//
// Precedence for resolveTargetId({ targetId, adapter }):
//   1. Explicit targetId (callers that pass opts.targetId) when valid.
//   2. Default target for the adapter (mock → mercibank, mercibank → mercibank, nlt → nlt).
//   3. mercibank when adapter is openai/http/generic (legacy lab compatibility).
//
// Adapter names are never treated as target IDs. Unsupported adapter+target pairs throw.

import { OBJECTIVES as MERCI_OBJECTIVES, OBJECTIVE_IDS as MERCI_OBJECTIVE_IDS } from '../strategies/objectives.mercibank.mjs';
import { OBJECTIVES as NLT_OBJECTIVES, OBJECTIVE_IDS as NLT_OBJECTIVE_IDS } from '../strategies/objectives.nlt.mjs';
import {
  DEFAULT_STRATEGIES as MERCI_DEFAULT_STRATEGIES,
  generate as mercibankGenerate,
  familiesOf,
  byId,
} from '../strategies/catalog.mercibank.mjs';
import {
  DEFAULT_STRATEGIES as NLT_DEFAULT_STRATEGIES,
  generate as nltGenerate,
} from '../strategies/catalog.nlt.mjs';

export const TARGET_IDS = ['mercibank', 'nlt'];

/** Legacy records without targetId are interpreted as mercibank. */
export const LEGACY_DEFAULT_TARGET_ID = 'mercibank';

const ADAPTER_DEFAULT_TARGET = {
  mercibank: 'mercibank',
  mock: 'mercibank',
  nlt: 'nlt',
  openai: 'mercibank',
  http: 'mercibank',
};

const ADAPTER_ALLOWED_TARGETS = {
  mercibank: ['mercibank'],
  mock: ['mercibank'],
  nlt: ['nlt'],
  openai: ['mercibank', 'nlt'],
  http: ['mercibank', 'nlt'],
};

function normalizeTargetId(raw) {
  if (raw == null || raw === '') return null;
  const id = String(raw).trim().toLowerCase();
  if (!TARGET_IDS.includes(id)) {
    throw new Error(`unknown targetId "${raw}" (supported: ${TARGET_IDS.join(', ')})`);
  }
  return id;
}

export function defaultTargetForAdapter(adapterName) {
  const a = String(adapterName || 'mercibank').trim().toLowerCase();
  if (!(a in ADAPTER_DEFAULT_TARGET)) {
    throw new Error(`unknown adapter "${adapterName}" — cannot infer target`);
  }
  return ADAPTER_DEFAULT_TARGET[a];
}

export function assertAdapterTargetCompatible(adapterName, targetId) {
  const a = String(adapterName || 'mercibank').trim().toLowerCase();
  const t = normalizeTargetId(targetId);
  const allowed = ADAPTER_ALLOWED_TARGETS[a];
  if (!allowed) throw new Error(`unknown adapter "${adapterName}"`);
  if (!allowed.includes(t)) {
    throw new Error(`adapter "${a}" is not compatible with target "${t}" (allowed: ${allowed.join(', ')})`);
  }
}

/**
 * @param {{ targetId?: string, adapter?: string }} opts
 * @returns {{ targetId: string, adapter: string }}
 */
export function resolveTargetId(opts = {}) {
  const adapter = String(opts.adapter ?? process.env.RC_ADAPTER ?? 'mercibank').trim().toLowerCase();
  const explicit = normalizeTargetId(opts.targetId);
  const targetId = explicit ?? defaultTargetForAdapter(adapter);
  assertAdapterTargetCompatible(adapter, targetId);
  return { targetId, adapter };
}

/** @param {string} [targetId] */
export function effectiveTargetId(targetId) {
  return targetId ? normalizeTargetId(targetId) : LEGACY_DEFAULT_TARGET_ID;
}

const BUNDLES = {
  mercibank: {
    objectives: MERCI_OBJECTIVES,
    objectiveIds: MERCI_OBJECTIVE_IDS,
    defaultStrategies: MERCI_DEFAULT_STRATEGIES,
    generate: mercibankGenerate,
  },
  nlt: {
    objectives: NLT_OBJECTIVES,
    objectiveIds: NLT_OBJECTIVE_IDS,
    defaultStrategies: NLT_DEFAULT_STRATEGIES,
    generate: nltGenerate,
  },
};

/** @param {string} [targetId] */
export function getObjectives(targetId) {
  const id = effectiveTargetId(targetId);
  const b = BUNDLES[id];
  if (!b) throw new Error(`unknown target "${id}"`);
  return b.objectives;
}

/** @param {string} [targetId] */
export function getObjectiveIds(targetId) {
  const id = effectiveTargetId(targetId);
  return BUNDLES[id].objectiveIds;
}

/** @param {{ targetId?: string, all?: boolean, only?: string[]|null }} opts */
export function loadStrategiesForTarget(opts = {}) {
  const id = effectiveTargetId(opts.targetId);
  const b = BUNDLES[id];
  let list = opts.all ? b.generate() : b.defaultStrategies;
  const only = opts.only;
  if (only?.length) {
    list = list.filter((s) => only.includes(s.id) || only.includes(s.family) || only.includes(s.objective));
  }
  return list;
}

export { familiesOf, byId, MERCI_DEFAULT_STRATEGIES as DEFAULT_STRATEGIES };
