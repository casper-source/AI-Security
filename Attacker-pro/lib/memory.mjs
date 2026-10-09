// memory.mjs — the engagement's memory as plain files (auditable, diffable, cheap) — the same idea as the AI
// Audit Service's per-engagement workspace. The dashboard reads these files; verify/promote/report write them.
//
//   campaign/
//     strategy-register.json     win/loss per family (the planner's brain)
//     session-journal.md         human-readable timeline
//     lessons.jsonl              one line per dead end
//     profile.json               the ORIENT fingerprint of the target
//     findings/<ID>.json         candidate → CONFIRMED/REJECTED
//     findings/rejected/<ID>.json
//     regression/<ID>.gen.yaml   promptfoo regression (PROMOTE)
//     redteam/redteam.yaml       a promptfoo generative red-team config scoped to the target
//     report/developer.md, report/stakeholder.md

import {
  readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, readdirSync, unlinkSync, renameSync,
  statSync, cpSync, rmSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LAB = dirname(dirname(fileURLToPath(import.meta.url)));

export function defaultCampaignRoot() { return join(LAB, 'campaign'); }

function campaignDir() { return process.env.CAMPAIGN_DIR || defaultCampaignRoot(); }

/** @param {string} [campaignId] `active` or an archive folder name under campaign/archive/ */
export function resolveCampaignRoot(campaignId) {
  const root = defaultCampaignRoot();
  if (!campaignId || campaignId === 'active') {
    const env = process.env.CAMPAIGN_DIR;
    if (env) return env;
    return root;
  }
  if (!/^[A-Za-z0-9._-]+$/.test(campaignId)) throw new Error(`Invalid campaign id: ${campaignId}`);
  const dir = join(root, 'archive', campaignId);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`Unknown campaign workspace: ${campaignId}`);
  return dir;
}

export function withCampaignRoot(campaignId, fn) {
  const dir = resolveCampaignRoot(campaignId);
  const prev = process.env.CAMPAIGN_DIR;
  process.env.CAMPAIGN_DIR = dir;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.CAMPAIGN_DIR;
    else process.env.CAMPAIGN_DIR = prev;
  }
}

/** @param {string} campaignId */
export async function withCampaignRootAsync(campaignId, fn) {
  const dir = resolveCampaignRoot(campaignId);
  const prev = process.env.CAMPAIGN_DIR;
  process.env.CAMPAIGN_DIR = dir;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.CAMPAIGN_DIR;
    else process.env.CAMPAIGN_DIR = prev;
  }
}
function findingsDir() { return join(campaignDir(), 'findings'); }
function rejectedDir() { return join(findingsDir(), 'rejected'); }
function regressionDir() { return join(campaignDir(), 'regression'); }
function redteamDir() { return join(campaignDir(), 'redteam'); }
function reportDir() { return join(campaignDir(), 'report'); }

const STATUS_RANK = { CONFIRMED: 3, CANDIDATE: 2, REJECTED: 1 };

function ensure() {
  for (const d of [campaignDir(), findingsDir(), rejectedDir(), regressionDir(), redteamDir(), reportDir()]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
}

const REG = () => join(campaignDir(), 'strategy-register.json');
export function loadRegister() { ensure(); try { return JSON.parse(readFileSync(REG(), 'utf8')); } catch { return { families: {}, createdAt: new Date().toISOString() }; } }
export function saveRegister(reg) { ensure(); writeFileSync(REG(), JSON.stringify(reg, null, 2)); }

export function saveProfile(p) { ensure(); writeFileSync(join(campaignDir(), 'profile.json'), JSON.stringify(p, null, 2)); }
export function loadProfile() { try { return JSON.parse(readFileSync(join(campaignDir(), 'profile.json'), 'utf8')); } catch { return null; } }

const META = () => join(campaignDir(), 'campaign-meta.json');
export function loadCampaignMeta() {
  ensure();
  try { return JSON.parse(readFileSync(META(), 'utf8')); } catch { return {}; }
}
export function saveCampaignMeta(patch) {
  ensure();
  const next = { ...loadCampaignMeta(), ...patch };
  writeFileSync(META(), JSON.stringify(next, null, 2));
  return next;
}

export function patchCampaignManifest(patch) {
  ensure();
  const path = join(campaignDir(), 'campaign.json');
  let manifest = {};
  try { manifest = JSON.parse(readFileSync(path, 'utf8')); } catch { /* new workspace */ }
  writeFileSync(path, JSON.stringify({ ...manifest, ...patch }, null, 2));
}

/** Strategy ids from the last dashboard/CLI campaign run in this workspace root. */
export function readCampaignStrategyIdsInRoot(rootDir) {
  let meta = {};
  try { meta = JSON.parse(readFileSync(join(rootDir, 'campaign-meta.json'), 'utf8')); } catch { /* optional */ }
  if (Array.isArray(meta.lastCampaignStrategyIds) && meta.lastCampaignStrategyIds.length) {
    return meta.lastCampaignStrategyIds;
  }
  const manifest = readManifestAt(rootDir);
  const fromManifest = manifest?.lastCampaignStrategyIds || manifest?.strategyIds;
  if (Array.isArray(fromManifest) && fromManifest.length) return fromManifest;
  return null;
}

export function loadCampaignStrategyIds(campaignId) {
  if (!campaignId || campaignId === 'new') return null;
  return withCampaignRoot(campaignId, () => readCampaignStrategyIdsInRoot(campaignDir()));
}

export function saveCampaignStrategyIds(ids) {
  ensure();
  const sorted = [...ids].sort();
  saveCampaignMeta({ lastCampaignStrategyIds: sorted });
  patchCampaignManifest({ lastCampaignStrategyIds: sorted });
  return sorted;
}

function campaignStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* wait for Windows to release directory handles */ }
}

/** renameSync with retries; copy+delete fallback when regression/promptfoo holds the folder (EBUSY on Windows). */
function moveEntrySync(src, dest) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      renameSync(src, dest);
      return;
    } catch (e) {
      const retryable = e.code === 'EBUSY' || e.code === 'EPERM' || e.code === 'ENOTEMPTY';
      if (retryable && attempt < 5) {
        sleepSync(250 + attempt * 200);
        continue;
      }
      if (retryable || e.code === 'EXDEV') {
        cpSync(src, dest, { recursive: true, force: true });
        rmSync(src, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 });
        return;
      }
      throw e;
    }
  }
}

/**
 * Archive the active campaign workspace to campaign/archive/<local-timestamp>/ (audit-framework --fresh).
 * Leaves a fresh empty campaign/ tree. Skips if there is nothing to archive except archive/.
 * @returns {{ archived: boolean, name: string|null, dir: string|null }}
 */
export function archiveCampaignWorkspace(meta = {}) {
  ensure();
  const root = campaignDir();
  const skip = new Set(['archive']);
  const entries = readdirSync(root).filter((n) => !skip.has(n));
  if (!entries.length) {
    ensure();
    return { archived: false, name: null, dir: null };
  }
  const archiveRoot = join(root, 'archive');
  mkdirSync(archiveRoot, { recursive: true });
  const base = campaignStamp();
  let name = base;
  let suffix = 0;
  while (existsSync(join(archiveRoot, name))) {
    suffix += 1;
    name = `${base}-${String(suffix).padStart(2, '0')}`;
  }
  const dest = join(archiveRoot, name);
  mkdirSync(dest);
  for (const entry of entries) {
    moveEntrySync(join(root, entry), join(dest, entry));
  }
  const manifest = {
    archived: true,
    archivedAt: new Date().toISOString(),
    ...meta,
  };
  try {
    const existing = JSON.parse(readFileSync(join(dest, 'campaign.json'), 'utf8'));
    Object.assign(manifest, existing, manifest);
  } catch { /* no prior manifest */ }
  writeFileSync(join(dest, 'campaign.json'), JSON.stringify(manifest, null, 2));
  ensure();
  return { archived: true, name, dir: dest };
}

/** Last `campaign start` line in session-journal.md (ISO timestamp). */
export function lastJournalCampaignStart() {
  try {
    const j = readFileSync(join(campaignDir(), 'session-journal.md'), 'utf8');
    const lines = j.split(/\r?\n/).filter((l) => l.includes('campaign start'));
    if (!lines.length) return null;
    const m = /^-\s*(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s*[—-]/.exec(lines.at(-1));
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function journal(line) { ensure(); appendFileSync(join(campaignDir(), 'session-journal.md'), `- ${new Date().toISOString()} — ${line}\n`); }
export function lesson(obj) { ensure(); appendFileSync(join(campaignDir(), 'lessons.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...obj }) + '\n'); }
export function loadLessons() { try { return readFileSync(join(campaignDir(), 'lessons.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } }

function findingPath(id, status) {
  return join(status === 'REJECTED' ? rejectedDir() : findingsDir(), `${id}.json`);
}

export function saveFinding(f) {
  ensure();
  const target = findingPath(f.id, f.status);
  for (const p of [join(findingsDir(), `${f.id}.json`), join(rejectedDir(), `${f.id}.json`)]) {
    if (p !== target && existsSync(p)) unlinkSync(p);
  }
  writeFileSync(target, JSON.stringify(f, null, 2));
}

/** Bank a new hit; refuses to overwrite an existing CONFIRMED finding with the same id. */
export function saveCandidateFinding(f) {
  const live = join(findingsDir(), `${f.id}.json`);
  if (existsSync(live)) {
    try {
      const existing = JSON.parse(readFileSync(live, 'utf8'));
      if (existing.status === 'CONFIRMED') return { ok: false, reason: 'already CONFIRMED' };
    } catch { /* rewrite corrupt file */ }
  }
  f.status = 'CANDIDATE';
  saveFinding(f);
  return { ok: true };
}

function readFindingsDir(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

function loadAllFindingsAt(rootDir) {
  const live = join(rootDir, 'findings');
  const rejected = join(live, 'rejected');
  const byId = new Map();
  for (const f of [...readFindingsDir(live), ...readFindingsDir(rejected)]) {
    const prev = byId.get(f.id);
    if (!prev || (STATUS_RANK[f.status] || 0) > (STATUS_RANK[prev.status] || 0)) byId.set(f.id, f);
  }
  return [...byId.values()];
}

function workspaceHasData(rootDir) {
  const live = join(rootDir, 'findings');
  if (existsSync(live)) {
    for (const name of readdirSync(live)) {
      if (name === 'rejected') continue;
      if (name.endsWith('.json')) return true;
    }
    const rej = join(live, 'rejected');
    if (existsSync(rej) && readdirSync(rej).some((n) => n.endsWith('.json'))) return true;
  }
  for (const marker of ['session-journal.md', 'campaign-meta.json', 'strategy-register.json', 'campaign.json']) {
    if (existsSync(join(rootDir, marker))) return true;
  }
  return false;
}

function readManifestAt(rootDir) {
  try { return JSON.parse(readFileSync(join(rootDir, 'campaign.json'), 'utf8')); } catch { return null; }
}

function summarizeCampaignWorkspace(rootDir, { id, label, archived }) {
  const all = loadAllFindingsAt(rootDir);
  const candidates = all.filter((f) => f.status === 'CANDIDATE');
  const confirmed = all.filter((f) => f.status === 'CONFIRMED');
  const rejected = all.filter((f) => f.status === 'REJECTED');
  const manifest = readManifestAt(rootDir);
  let meta = {};
  try { meta = JSON.parse(readFileSync(join(rootDir, 'campaign-meta.json'), 'utf8')); } catch { /* optional */ }
  const lastCampaignStrategyIds = readCampaignStrategyIdsInRoot(rootDir);
  const lastCampaignAt = meta.lastCampaignFinishedAt || meta.lastCampaignStartedAt || manifest?.archivedAt || null;
  const lastRunIds = new Set(meta.lastCampaignCandidates || []);
  const lastRunCandidateCount = candidates.filter((f) => lastRunIds.has(f.id)).length;
  const olderCandidateCount = Math.max(0, candidates.length - lastRunCandidateCount);
  let verifyState = 'empty';
  if (candidates.length) verifyState = 'pending';
  else if (confirmed.length + rejected.length) verifyState = 'verified';
  const selectable = verifyState === 'pending';
  let statusNote = verifyState === 'verified' ? 'verified'
    : verifyState === 'pending'
      ? (olderCandidateCount > 0
        ? `${candidates.length} to verify (${lastRunCandidateCount} this run, ${olderCandidateCount} earlier)`
        : `${candidates.length} to verify`)
      : 'no candidates';
  return {
    id,
    label,
    archived: Boolean(archived),
    verifyState,
    selectable,
    statusNote,
    candidateCount: candidates.length,
    lastRunCandidateCount,
    olderCandidateCount,
    confirmedCount: confirmed.length,
    rejectedCount: rejected.length,
    lastCampaignAt,
    lastCampaignStopped: Boolean(meta.lastCampaignStopped),
    lastCampaignStrategyIds,
    verifyCompletedAt: meta.verifyCompletedAt || null,
  };
}

/** Active + archived campaign workspaces for verify picker (newest first among archives). */
export function listCampaignWorkspaces() {
  const root = defaultCampaignRoot();
  // Always list the live tree from the default root — never from a transient CAMPAIGN_DIR override.
  const activeDir = root;
  const rows = [];
  if (workspaceHasData(activeDir)) {
    rows.push(summarizeCampaignWorkspace(activeDir, { id: 'active', label: 'Current (live)', archived: false }));
  }
  const archiveRoot = join(root, 'archive');
  if (existsSync(archiveRoot)) {
    const names = readdirSync(archiveRoot).filter((n) => {
      try { return statSync(join(archiveRoot, n)).isDirectory(); } catch { return false; }
    }).sort((a, b) => b.localeCompare(a));
    for (const name of names) {
      const dir = join(archiveRoot, name);
      if (!workspaceHasData(dir)) continue;
      rows.push(summarizeCampaignWorkspace(dir, { id: name, label: name, archived: true }));
    }
  }
  return rows;
}

/** Pending verification only (live findings folder, status CANDIDATE). */
export function loadCandidates() {
  ensure();
  return readFindingsDir(findingsDir()).filter((f) => f.status === 'CANDIDATE');
}

export function loadAllFindings() {
  ensure();
  const byId = new Map();
  for (const f of [...readFindingsDir(findingsDir()), ...readFindingsDir(rejectedDir())]) {
    const prev = byId.get(f.id);
    if (!prev || (STATUS_RANK[f.status] || 0) > (STATUS_RANK[prev.status] || 0)) byId.set(f.id, f);
  }
  return [...byId.values()];
}

/** Findings for a dashboard workspace (`active`, archive id). `new` → []. */
export function loadAllFindingsForCampaign(campaignId) {
  if (!campaignId || campaignId === 'new') return [];
  return withCampaignRoot(campaignId, () => loadAllFindings());
}

export function saveRegression(id, yaml) { ensure(); const p = join(regressionDir(), `${id}.gen.yaml`); writeFileSync(p, yaml); return p; }
export function saveRedteam(yaml) { ensure(); const p = join(redteamDir(), 'redteam.yaml'); writeFileSync(p, yaml); return p; }
export function saveReport(name, md) { ensure(); const p = join(reportDir(), name); writeFileSync(p, md); return p; }

export const paths = {
  get DIR() { return campaignDir(); },
  get FINDINGS() { return findingsDir(); },
  get REJECTED() { return rejectedDir(); },
  get REGRESSION() { return regressionDir(); },
  get REDTEAM() { return redteamDir(); },
  get REPORT() { return reportDir(); },
};
