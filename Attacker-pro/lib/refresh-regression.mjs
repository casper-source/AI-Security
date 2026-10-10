// refresh-regression.mjs — regenerate promptfoo regression YAML from CONFIRMED findings only (no verify, no live targets).

import * as mem from './memory.mjs';
import { toRegressionYaml, regressionUrlForTarget } from './promote.mjs';
import { effectiveTargetId } from './target.mjs';
import {
  resolveWorkspaceTarget,
  inferWorkspaceTargetFromFindings,
  assertFindingMatchesVerifyTarget,
} from './verify-guard.mjs';

/**
 * @param {{ campaign?: string, only?: string[] | null }} opts
 * @returns {{ refreshed: string[], paths: string[], campaignId: string }}
 */
export function refreshRegressionArtifacts(opts = {}) {
  const campaignId = opts.campaign || 'active';
  return mem.withCampaignRoot(campaignId, () => refreshRegressionInRoot({ ...opts, campaignId }));
}

/**
 * @param {{ campaignId?: string, only?: string[] | null }} opts
 */
export function refreshRegressionInRoot(opts = {}) {
  const ws = mem.readWorkspaceIdentity();
  const allFindings = mem.loadAllFindings();
  let workspaceTargetId = resolveWorkspaceTarget(ws, allFindings);

  const onlyList = opts.only?.length ? opts.only.map(String) : null;

  if (onlyList) {
    for (const id of onlyList) {
      const f = allFindings.find((x) => x.id === id);
      if (!f) throw new Error(`finding "${id}" not found in this workspace`);
      if (f.status !== 'CONFIRMED') {
        throw new Error(
          `finding "${id}" is ${f.status}, not CONFIRMED — regression refresh only processes CONFIRMED findings`,
        );
      }
    }
  }

  let confirmed = allFindings.filter((f) => f.status === 'CONFIRMED');
  if (onlyList) confirmed = confirmed.filter((f) => onlyList.includes(f.id));

  if (!confirmed.length) {
    return { refreshed: [], paths: [], campaignId: opts.campaignId || 'active' };
  }

  if (!workspaceTargetId) {
    workspaceTargetId = inferWorkspaceTargetFromFindings(confirmed);
  }
  if (!workspaceTargetId) {
    throw new Error(
      'cannot determine workspace target — set campaign-meta targetId or bank CONFIRMED findings with targetId',
    );
  }

  for (const f of confirmed) {
    assertFindingMatchesVerifyTarget(f, workspaceTargetId);
    if (ws.adapter && f.adapter && ws.adapter !== f.adapter) {
      throw new Error(
        `workspace adapter "${ws.adapter}" conflicts with finding "${f.id}" adapter "${f.adapter}" — archive or fix metadata before refresh`,
      );
    }
  }

  const refreshed = [];
  const paths = [];
  for (const f of confirmed) {
    const targetId = effectiveTargetId(f.targetId);
    const yaml = toRegressionYaml(f, regressionUrlForTarget(targetId));
    paths.push(mem.saveRegression(f.id, yaml));
    refreshed.push(f.id);
  }

  return { refreshed, paths, campaignId: opts.campaignId || 'active' };
}
