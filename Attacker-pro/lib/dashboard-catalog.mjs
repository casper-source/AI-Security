// dashboard-catalog.mjs — adapter/target-scoped strategy catalog for the control dashboard.

import { resolveTargetId, loadStrategiesForTarget } from './target.mjs';

const EMPTY_CATALOG_MSG = 'No strategies available for this target yet.';

function normalizeAdapter(adapterName) {
  return adapterName || process.env.RC_ADAPTER || 'mercibank';
}

/** @param {string} [adapterName] */
export function buildStrategyCatalog(adapterName) {
  const { targetId, adapter } = resolveTargetId({ adapter: normalizeAdapter(adapterName) });
  const list = loadStrategiesForTarget({ targetId });
  const strategies = list.map((s) => ({
    id: s.id,
    family: s.family,
    objective: s.objective,
    orchestrator: s.orchestrator,
  }));
  return {
    adapter,
    targetId,
    strategies,
    catalogEmpty: strategies.length === 0,
    emptyMessage: strategies.length === 0 ? EMPTY_CATALOG_MSG : null,
  };
}

/**
 * Resolve `only` against the target catalog (server-side; do not trust the UI list).
 * @param {string} [adapterName]
 * @param {string[] | null | undefined} only
 * @returns {{ targetId: string, adapter: string, only: string[] | null, strategyIds: string[], error?: string, dropped?: string[] }}
 */
export function prepareDashboardRun(adapterName, only) {
  const { targetId, adapter } = resolveTargetId({ adapter: normalizeAdapter(adapterName) });
  const catalog = loadStrategiesForTarget({ targetId });

  if (!only?.length) {
    const strategyIds = catalog.map((s) => s.id).sort();
    return { targetId, adapter, only: null, strategyIds };
  }

  const matched = loadStrategiesForTarget({ targetId, only });
  const strategyIds = matched.map((s) => s.id).sort();
  if (!matched.length) {
    return {
      targetId,
      adapter,
      only: null,
      strategyIds: [],
      dropped: [...only],
      error: `No strategies match the selection for target "${targetId}". Refresh the strategy list after changing adapter.`,
    };
  }

  const matchedIdSet = new Set(strategyIds);
  const dropped = only.filter((id) => !matchedIdSet.has(id) && !matched.some(
    (s) => s.id === id || s.family === id || s.objective === id,
  ));

  return {
    targetId,
    adapter,
    only: strategyIds,
    strategyIds,
    ...(dropped.length ? { dropped } : {}),
  };
}
