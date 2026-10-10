// verify-guard.mjs — fail closed when verify adapter/target disagrees with the campaign workspace.

import { effectiveTargetId, resolveTargetId } from './target.mjs';
import * as mem from './memory.mjs';

/**
 * Single target implied by findings (legacy missing targetId → mercibank).
 * @param {Array<{ targetId?: string }>} findings
 * @returns {string | null} null when there are no findings
 * @throws when findings imply more than one target
 */
export function inferWorkspaceTargetFromFindings(findings) {
  if (!findings?.length) return null;
  const targets = new Set(findings.map((f) => effectiveTargetId(f.targetId)));
  if (targets.size > 1) {
    throw new Error(
      `mixed-target workspace: findings imply ${[...targets].map((t) => `"${t}"`).join(' and ')} — archive or split workspaces before verify`,
    );
  }
  return [...targets][0];
}

/**
 * @param {{ targetId?: string | null, adapter?: string | null }} ws
 * @param {Array<{ targetId?: string }>} findings
 * @returns {string | null}
 */
export function resolveWorkspaceTarget(ws, findings) {
  const inferred = inferWorkspaceTargetFromFindings(findings);
  if (ws.targetId) {
    const metaTarget = effectiveTargetId(ws.targetId);
    if (inferred && inferred !== metaTarget) {
      throw new Error(
        `workspace targetId "${metaTarget}" conflicts with findings (infer "${inferred}") — fix metadata or archive`,
      );
    }
    return metaTarget;
  }
  return inferred;
}

/**
 * @param {{ targetId?: string, adapter?: string }} opts
 * @returns {{ targetId: string, adapter: string, workspaceTargetId: string }}
 * @throws {Error} when workspace identity conflicts with the verify request
 */
export function assertVerifyMatchesWorkspace(opts = {}) {
  const ws = mem.readWorkspaceIdentity();
  const adapterName = opts.adapter ?? process.env.RC_ADAPTER ?? 'mercibank';
  const { targetId: reqTarget, adapter: reqAdapter } = resolveTargetId({
    targetId: opts.targetId,
    adapter: adapterName,
  });

  const findings = mem.loadAllFindings();
  const wsTarget = resolveWorkspaceTarget(ws, findings);

  if (wsTarget && wsTarget !== reqTarget) {
    throw new Error(
      `verify target mismatch: workspace is target "${wsTarget}" but request resolves to "${reqTarget}"`,
    );
  }
  if (ws.adapter && ws.adapter !== reqAdapter) {
    throw new Error(
      `verify adapter mismatch: workspace recorded adapter "${ws.adapter}" but request uses "${reqAdapter}"`,
    );
  }

  const verifyTargetId = wsTarget ?? reqTarget;
  return { targetId: verifyTargetId, adapter: reqAdapter, workspaceTargetId: verifyTargetId };
}

/**
 * @param {{ targetId?: string }} finding
 * @param {string} verifyTargetId
 */
export function assertFindingMatchesVerifyTarget(finding, verifyTargetId) {
  const findingTarget = effectiveTargetId(finding.targetId);
  if (findingTarget !== verifyTargetId) {
    throw new Error(
      `verify finding target mismatch: "${finding.id}" is target "${findingTarget}" but verify is for "${verifyTargetId}"`,
    );
  }
}

/**
 * @param {Array<{ id?: string, targetId?: string }>} candidates
 * @param {string} verifyTargetId
 */
export function assertCandidatesMatchVerifyTarget(candidates, verifyTargetId) {
  for (const f of candidates) {
    assertFindingMatchesVerifyTarget(f, verifyTargetId);
  }
}

/**
 * Campaign guard: legacy findings without stored workspace targetId still bind the workspace.
 * @param {string} targetId resolved campaign target
 */
export function assertCampaignTargetMatchesWorkspace(targetId) {
  const ws = mem.readWorkspaceIdentity();
  if (ws.targetId && effectiveTargetId(ws.targetId) !== targetId) {
    throw new Error(
      `campaign workspace target is "${ws.targetId}" — cannot run as "${targetId}" (archive or use a fresh workspace)`,
    );
  }
  const findings = mem.loadAllFindings();
  if (!ws.targetId && findings.length) {
    const inferred = inferWorkspaceTargetFromFindings(findings);
    if (inferred && inferred !== targetId) {
      throw new Error(
        `campaign workspace has findings for target "${inferred}" — cannot run as "${targetId}" (archive with --fresh or use a fresh workspace)`,
      );
    }
  }
}
