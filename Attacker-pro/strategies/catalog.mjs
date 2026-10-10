// catalog.mjs — target-aware strategy loading (shared orchestrators unchanged).

import { loadStrategiesForTarget, DEFAULT_STRATEGIES, familiesOf, byId } from '../lib/target.mjs';

export { DEFAULT_STRATEGIES, familiesOf, byId };

export function loadStrategies({ targetId, all = false, only = null } = {}) {
  return loadStrategiesForTarget({ targetId, all, only });
}

export function generate(opts = {}) {
  return loadStrategiesForTarget({ targetId: opts.targetId, all: true });
}
