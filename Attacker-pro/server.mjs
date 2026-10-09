// server.mjs — the RedCell DASHBOARD: a local control room. Zero npm deps (node:http + SSE + vanilla JS).
// It runs the SAME engine/verify/report code in-process and streams every pipeline step to the browser, so
// the web view and the rich terminal show the exact same WAKE→ORIENT→PLAN→ATTACK→JUDGE→VERIFY→SCORE→PROMOTE
// →REPORT. Setup models + target, start/stop a campaign, watch it live, read findings with AIVSS, export the
// developer + stakeholder reports.
//
//   npm run dashboard         →  http://localhost:8787
// Keys you enter here are held in memory for this process only — never written to disk, never echoed back.

import './lib/env.mjs';
process.env.RC_QUIET = process.env.RC_QUIET || '1';          // quiet the server's own stdout; events still stream
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync, mkdirSync, appendFileSync, openSync, closeSync } from 'node:fs';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { dirname, join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { subscribe } from './lib/ui.mjs';
import { runCampaign } from './lib/engine.mjs';
import { runVerify, buildVerifyPlan } from './lib/verify.mjs';
import { developerReport, stakeholderReport } from './lib/report.mjs';
import { toRedteamYaml } from './lib/promote.mjs';
import { pickAdapter, ADAPTERS } from './adapters/index.mjs';
import * as brains from './lib/brains.mjs';
import * as mem from './lib/memory.mjs';
import { DEFAULT_STRATEGIES } from './strategies/catalog.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, 'web');
const PORT = Number(process.env.RC_DASHBOARD_PORT || 8787);

// ---- event fan-out: ring buffer (for late joiners) + live SSE clients ----
const RING = []; const RING_MAX = 800; const clients = new Set();
subscribe((evt) => { RING.push(evt); if (RING.length > RING_MAX) RING.shift(); for (const res of clients) try { res.write(`data: ${JSON.stringify(evt)}\n\n`); } catch {} });

let run = { running: false, stage: 'idle', stopRef: { stopped: false } };
const push = (evt) => { for (const res of clients) try { res.write(`data: ${JSON.stringify(evt)}\n\n`); } catch {} RING.push(evt); if (RING.length > RING_MAX) RING.shift(); };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const sendJson = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise((resolve) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } }); });

function campaignWorkspaceLabel(campaignId) {
  const row = mem.listCampaignWorkspaces().find((c) => c.id === campaignId);
  return row?.label || campaignId;
}

/** Dashboard workspace id: `new` | `active` | archive folder name */
function parseDashboardCampaign(raw) {
  const id = raw || 'new';
  if (id === 'new') return { pick: 'new', runRoot: 'active', isNew: true, isArchive: false };
  if (id === 'active') return { pick: 'active', runRoot: 'active', isNew: false, isArchive: false };
  return { pick: id, runRoot: id, isNew: false, isArchive: true };
}

function assertCampaignWorkspace(campaign, { forReport = false } = {}) {
  if (!campaign || campaign === 'new') {
    throw new Error(forReport
      ? 'Pick Current (live) or an archive to build reports — New campaign has no workspace yet.'
      : 'New campaign has nothing to verify — run a campaign first, or pick Current (live) / an archive.');
  }
}

function assertVerifyCampaign(campaign) {
  assertCampaignWorkspace(campaign);
}

function parseCampaignQuery(raw, { defaultActive = true } = {}) {
  const id = raw || (defaultActive ? 'active' : 'new');
  if (id === 'new') return id;
  mem.resolveCampaignRoot(id);
  return id;
}

async function buildReportsInCampaign(campaignId) {
  return mem.withCampaignRootAsync(campaignId, async () => {
    const fs = mem.loadAllFindings();
    const brain = brains.available('report');
    const dev = await developerReport(fs, { brain });
    const exec = await stakeholderReport(fs, { brain });
    const p1 = mem.saveReport('developer.md', dev);
    const p2 = mem.saveReport('stakeholder.md', exec);
    return { developer: p1, stakeholder: p2, confirmed: fs.filter((f) => f.status === 'CONFIRMED').length };
  });
}

function strategyIdsForDashboardRun(only) {
  if (only?.length) return [...only].sort();
  return DEFAULT_STRATEGIES.map((s) => s.id);
}

function killProcessTree(pid) {
  if (!pid || pid === process.pid) return;
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      process.kill(-pid, 'SIGTERM');
    }
  } catch { /* already exited */ }
}

function listenersOnPort(port) {
  const pids = new Set();
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true });
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes('LISTENING') || !line.includes(`:${port}`)) continue;
        const pid = Number(line.trim().split(/\s+/).at(-1));
        if (pid > 0) pids.add(pid);
      }
    } catch { /* netstat unavailable */ }
  } else {
    try {
      const out = execFileSync('lsof', ['-ti', `:${port}`], { encoding: 'utf8' });
      for (const pid of out.trim().split(/\s+/)) {
        const n = Number(pid);
        if (n > 0) pids.add(n);
      }
    } catch { /* nothing listening */ }
  }
  return [...pids];
}

function killListenersOnPort(port) {
  for (const pid of listenersOnPort(port)) killProcessTree(pid);
}

async function promptfooViewerUp() {
  return fetch('http://localhost:15500/').then((r) => r.ok).catch(() => false);
}

async function waitForPortFree(port, maxMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (listenersOnPort(port).length === 0 && !(await promptfooViewerUp())) return true;
    await new Promise((r) => setTimeout(r, 350));
  }
  return listenersOnPort(port).length === 0;
}

/** Stop promptfoo viewer so campaign/archive can move regression/ on Windows (EBUSY). */
async function stopPromptfooViewer() {
  if (viewer?.pid) killProcessTree(viewer.pid);
  viewer = null;
  killListenersOnPort(15500);
  await new Promise((r) => setTimeout(r, 600));
  viewerSpawnError = null;
}

async function startCampaign(o) {
  if (run.running) return { error: 'a run is already in progress' };
  await stopPromptfooViewer();
  const { pick, runRoot, isNew, isArchive } = parseDashboardCampaign(o.campaign);
  let archived = null;
  try {
    mem.withCampaignRoot('active', () => {
      archived = mem.archiveCampaignWorkspace({ adapter: o.adapter, source: 'dashboard-run', continued: pick });
    });
  } catch (e) {
    return { error: e.message };
  }
  if (archived?.archived) {
    push({ type: 'info', msg: `Archived Current (live) → campaign/archive/${archived.name}` });
  }
  const targetLabel = isArchive ? campaignWorkspaceLabel(runRoot) : 'Current (live)';
  run = { running: true, stage: 'campaign', stopRef: { stopped: false } };
  push({
    type: 'runStart', mode: 'campaign', at: Date.now(), archived: archived?.name || null,
    campaignId: pick,
    campaignLabel: isArchive ? targetLabel : (isNew ? 'New campaign' : 'Current (live)'),
    isNewCampaign: isNew,
    continuingArchive: isArchive,
  });
  const episodesPlanned = Number(o.episodes) || 12;
  const runStrategyIds = strategyIdsForDashboardRun(o.only);
  mem.withCampaignRoot(runRoot, () => {
    mem.saveCampaignStrategyIds(runStrategyIds);
  });
  (async () => {
    let runError = null;
    const prevReg = process.env.RC_FRESH_REGISTER;
    try {
      await mem.withCampaignRootAsync(runRoot, async () => {
        if (!isNew) process.env.RC_FRESH_REGISTER = '0';
        await runCampaign({
          adapter: o.adapter, episodes: episodesPlanned, all: o.all, fresh: false,
          only: o.only?.length ? o.only : null, stopRef: run.stopRef,
        });
      });
    }
    catch (e) { runError = e.message; push({ type: 'error', msg: e.message }); }
    finally {
      if (!isNew) {
        if (prevReg === undefined) delete process.env.RC_FRESH_REGISTER;
        else process.env.RC_FRESH_REGISTER = prevReg;
      }
      const stopped = run.stopRef.stopped;
      run.running = false; run.stage = 'idle';
      let endPayload;
      mem.withCampaignRoot(runRoot, () => {
        const meta = mem.loadCampaignMeta();
        const banked = meta.lastCampaignCandidates || [];
        const counts = countFindings();
        endPayload = {
          type: 'runEnd', mode: 'campaign', at: Date.now(), campaignId: pick, runRoot,
          lastCampaignAt: meta.lastCampaignFinishedAt || meta.lastCampaignStartedAt || mem.lastJournalCampaignStart(),
          candidatesBanked: banked,
          bankedCount: banked.length,
          pendingCandidates: counts.candidate,
          olderCandidates: Math.max(0, counts.candidate - banked.length),
          episodesPlanned,
          stopped: Boolean(stopped || meta.lastCampaignStopped),
          error: runError,
        };
      });
      push(endPayload);
    }
  })();
  return { ok: true, archived: archived?.archived ? archived.name : null, campaignId: pick };
}
async function startVerify(o) {
  if (run.running) return { error: 'a run is already in progress' };
  try {
    assertVerifyCampaign(o.campaign || 'new');
  } catch (e) {
    return { error: e.message };
  }
  run = { running: true, stage: 'verify', stopRef: { stopped: false } };
  push({ type: 'runStart', mode: 'verify', at: Date.now() });
  (async () => {
    let runError = null;
    let verifyResult = null;
    try {
      verifyResult = await runVerify({
        adapter: o.adapter, min: o.min, runs: o.runs, campaign: o.campaign || 'active',
        only: o.only?.length ? o.only : null, stopRef: run.stopRef,
      });
    }
    catch (e) { runError = e.message; push({ type: 'error', msg: e.message }); }
    finally {
      const stopped = run.stopRef.stopped;
      run.running = false; run.stage = 'idle';
      const confirmed = verifyResult?.confirmed?.length ?? 0;
      const candidates = verifyResult?.candidates?.length ?? 0;
      push({
        type: 'runEnd', mode: 'verify', at: Date.now(),
        confirmed, rejected: Math.max(0, candidates - confirmed), candidates,
        stopped: Boolean(stopped),
        error: runError,
      });
    }
  })();
  return { ok: true };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  try {
    // ---- SSE stream ----
    if (p === '/api/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(`retry: 2000\n\n`);
      // Replay compact log only — skip plan/episode/turn replay (mixed schema breaks UCB panel).
      for (const evt of RING.slice(-200)) {
        if (['episode', 'planLegend', 'plan', 'turn', 'repro', 'stage', 'verifyBrief'].includes(evt.type)) continue;
        res.write(`data: ${JSON.stringify({ ...evt, _replay: true })}\n\n`);
      }
      clients.add(res); req.on('close', () => clients.delete(res));
      return;
    }
    // ---- state ----
    if (p === '/api/state') {
      return sendJson(res, {
        adapters: ADAPTERS, adapter: process.env.RC_ADAPTER || 'mercibank', brains: brains.status(), running: run.running, stage: run.stage,
        strategies: DEFAULT_STRATEGIES.map((s) => ({ id: s.id, family: s.family, objective: s.objective, orchestrator: s.orchestrator })),
        profile: mem.loadProfile(), counts: countFindings(),
        campaigns: campaignOptionsForUi(),
      });
    }
    if (p === '/api/findings') {
      const campaign = url.searchParams.get('campaign') || 'active';
      if (campaign === 'new') return sendJson(res, { findings: [], campaign });
      try {
        const findings = mem.loadAllFindingsForCampaign(parseCampaignQuery(campaign));
        return sendJson(res, { findings, campaign });
      } catch (e) {
        return sendJson(res, { error: e.message }, 400);
      }
    }
    if (p === '/api/campaigns') {
      return sendJson(res, { campaigns: campaignOptionsForUi() });
    }
    if (p === '/api/campaign/strategies') {
      const campaign = url.searchParams.get('campaign') || 'new';
      if (campaign === 'new') return sendJson(res, { campaign, strategyIds: null });
      try {
        return sendJson(res, { campaign, strategyIds: mem.loadCampaignStrategyIds(campaign) });
      } catch (e) {
        return sendJson(res, { error: e.message }, 400);
      }
    }
    if (p === '/api/verify/plan') {
      const min = Number(url.searchParams.get('min') || process.env.REPRO_MIN || 3);
      const runs = Number(url.searchParams.get('runs') || process.env.REPRO_RUNS || 3);
      const campaign = url.searchParams.get('campaign') || 'new';
      const only = url.searchParams.get('only');
      const onlyList = only ? only.split(',').map((s) => s.trim()).filter(Boolean) : null;
      try {
        assertVerifyCampaign(campaign);
        const plan = buildVerifyPlan({ min, runs, only: onlyList, campaign });
        const { candidates: _c, ...pub } = plan;
        return sendJson(res, pub);
      } catch (e) {
        return sendJson(res, { error: e.message }, 400);
      }
    }
    if (p === '/api/promptfoo/status') {
      const up = await promptfooViewerUp();
      if (up) viewerSpawnError = null;
      return sendJson(res, {
        up,
        url: 'http://localhost:15500',
        regressionDir: mem.paths.REGRESSION,
        spawnError: viewerSpawnError || null,
        log: PROMPTFOO_LOG_REL,
      });
    }
    if (p === '/api/report') {
      const audience = url.searchParams.get('audience') || 'developer';
      const campaign = url.searchParams.get('campaign') || 'active';
      if (campaign === 'new') return sendJson(res, { audience, campaign, md: '' });
      try {
        const fs = mem.loadAllFindingsForCampaign(parseCampaignQuery(campaign));
        const md = audience === 'stakeholder'
          ? await stakeholderReport(fs, { brain: brains.available('report') })
          : await developerReport(fs, { brain: brains.available('report') });
        return sendJson(res, { audience, campaign, md });
      } catch (e) {
        return sendJson(res, { error: e.message }, 400);
      }
    }
    if (p === '/api/artifact') {
      const name = url.searchParams.get('name') || '';
      const campaign = url.searchParams.get('campaign') || 'active';
      if (campaign === 'new') return sendJson(res, { error: 'not found' }, 404);
      try {
        let txt;
        mem.withCampaignRoot(parseCampaignQuery(campaign), () => {
          const full = resolve(mem.paths.DIR, name);
          if (!full.startsWith(resolve(mem.paths.DIR) + sep)) throw new Error('bad path');
          txt = readFileSync(full, 'utf8');
        });
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end(txt);
      } catch (e) {
        if (e.message === 'bad path') return sendJson(res, { error: 'bad path' }, 400);
        return sendJson(res, { error: 'not found' }, 404);
      }
    }

    if (req.method === 'POST') {
      const o = await body(req);
      if (p === '/api/config') {
        const set = (k, v) => { if (v !== undefined && v !== null && v !== '') process.env[k] = String(v); };
        set('ATTACKER_LLM_PROVIDER', o.provider); set('ATTACKER_LLM_BASE_URL', o.base); set('ATTACKER_LLM_API_KEY', o.key); set('ATTACKER_LLM_MODEL', o.model);
        set('RC_ADAPTER', o.adapter); set('MERCI_TARGET_URL', o.targetUrl); set('MERCI_TARGET_KEY', o.targetKey);
        return sendJson(res, { ok: true, brains: brains.status(), adapter: process.env.RC_ADAPTER || 'mercibank' });
      }
      if (p === '/api/run') return sendJson(res, await startCampaign(o));
      if (p === '/api/verify') return sendJson(res, await startVerify(o));
      if (p === '/api/stop') { run.stopRef.stopped = true; return sendJson(res, { ok: true }); }
      if (p === '/api/report/build') {
        const campaign = o.campaign || 'active';
        try {
          assertCampaignWorkspace(campaign, { forReport: true });
          const result = await buildReportsInCampaign(parseCampaignQuery(campaign));
          return sendJson(res, { ok: true, campaign, confirmed: result.confirmed });
        } catch (e) {
          return sendJson(res, { error: e.message }, 400);
        }
      }
      if (p === '/api/promptfoo/view') return sendJson(res, await startViewer());
      if (p === '/api/promptfoo/stop') {
        await stopPromptfooViewer();
        return sendJson(res, { ok: true, up: await promptfooViewerUp() });
      }
      if (p === '/api/promptfoo/eval') return sendJson(res, await runPromptfooEval(o.id));
    }

    // ---- static ----
    const file = p === '/' ? 'index.html' : p.replace(/^\//, '');
    const full = resolve(WEB, file);
    if (!full.startsWith(resolve(WEB) + sep)) return sendJson(res, { error: 'bad path' }, 400);
    const data = await readFile(full);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    return res.end(data);
  } catch (e) {
    sendJson(res, { error: e.message }, p.startsWith('/api') ? 500 : 404);
  }
});

// --- promptfoo integration: run a promoted regression, and start promptfoo's own viewer (localhost:15500) ---
let viewer = null;
let viewerSpawnError = null;

function promptfooEnv(cwd, extra = {}) {
  return {
    ...process.env,
    ...extra,
    PROMPTFOO_CACHE_PATH: join(cwd, '.promptfoo-cache'),
  };
}

/**
 * Run npx on Windows. Node 24+ cannot spawn npx.cmd with an argv list (EINVAL); use cmd.exe /c.
 * Avoid spawn(..., { shell: true }) — triggers DEP0190.
 */
function spawnCommandForNpx(npxArgs) {
  if (process.platform !== 'win32') {
    return { command: 'npx', args: npxArgs };
  }
  const line = `npx ${npxArgs.join(' ')}`;
  return { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', line] };
}

const PROMPTFOO_CLI = join(HERE, 'node_modules', 'promptfoo', 'dist', 'src', 'entrypoint.js');

/** Prefer project-local promptfoo (npm install); npx cache is often broken on Node 24. */
function spawnPromptfooCli(subargs) {
  if (existsSync(PROMPTFOO_CLI)) {
    return { command: process.execPath, args: [PROMPTFOO_CLI, ...subargs], via: 'local' };
  }
  const { command, args } = spawnCommandForNpx(['-y', 'promptfoo@latest', ...subargs]);
  return { command, args, via: 'npx' };
}

/** `-n`: no browser popup when spawned from the dashboard. */
function promptfooViewArgs() {
  return ['view', '-n', '-p', '15500'];
}

const PROMPTFOO_VIEWER_LOG = 'promptfoo-viewer.log';
const PROMPTFOO_VIEWER_OUT = 'promptfoo-viewer-out.log';
const PROMPTFOO_LOG_REL = `campaign/regression/${PROMPTFOO_VIEWER_LOG}`;
const PROMPTFOO_OUT_REL = `campaign/regression/${PROMPTFOO_VIEWER_OUT}`;

function tailLogFile(path, max = 4000) {
  try { return readFileSync(path, 'utf8').slice(-max); } catch { return ''; }
}

async function startViewer() {
  viewerSpawnError = null;
  const cwd = resolve(mem.paths.REGRESSION);
  if (!existsSync(cwd)) mkdirSync(cwd, { recursive: true });
  const logPath = join(cwd, PROMPTFOO_VIEWER_LOG);
  const portTaken = listenersOnPort(15500).length > 0 || await promptfooViewerUp();
  if (portTaken || (viewer && !viewer.killed)) {
    appendFileSync(logPath, `\n--- ${new Date().toISOString()} restart — stopping existing listener on :15500 ---\n`);
    await stopPromptfooViewer();
    const freed = await waitForPortFree(15500, 15000);
    if (!freed) {
      viewerSpawnError = 'port 15500 still in use after stop';
      return { ok: false, error: viewerSpawnError, log: PROMPTFOO_LOG_REL };
    }
  }
  const outLogPath = join(cwd, PROMPTFOO_VIEWER_OUT);
  const { command, args, via } = spawnPromptfooCli(promptfooViewArgs());
  appendFileSync(logPath, `\n--- ${new Date().toISOString()} start ---\nvia: ${via}\ncommand: ${command}\nargs: ${JSON.stringify(args)}\ncwd: ${cwd}\noutput: ${PROMPTFOO_OUT_REL}\n`);
  let logFd;
  try {
    logFd = openSync(outLogPath, 'a');
  } catch (e) {
    viewerSpawnError = e.message;
    return { ok: false, error: e.message, log: PROMPTFOO_LOG_REL };
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (payload) => { if (!settled) { settled = true; resolve(payload); } };
    const spawnOpts = {
      cwd,
      env: promptfooEnv(cwd),
      stdio: ['ignore', logFd, logFd],
      windowsHide: true,
    };
    if (process.platform !== 'win32') spawnOpts.detached = true;
    try {
      viewer = spawn(command, args, spawnOpts);
      closeSync(logFd);
    } catch (e) {
      try { closeSync(logFd); } catch { /* ignore */ }
      viewerSpawnError = e.message;
      appendFileSync(logPath, `spawn threw: ${e.message}\n`);
      finish({ ok: false, error: e.message, log: PROMPTFOO_LOG_REL });
      return;
    }
    viewer.on('error', (e) => {
      viewerSpawnError = e.message;
      appendFileSync(logPath, `spawn error event: ${e.message}\n`);
      finish({ ok: false, error: e.message, log: PROMPTFOO_LOG_REL });
    });
    viewer.on('spawn', () => {
      if (spawnOpts.detached) viewer.unref();
      finish({
        ok: true,
        url: 'http://localhost:15500',
        starting: true,
        log: PROMPTFOO_LOG_REL,
      });
    });
    viewer.on('exit', (code) => {
      void (async () => {
        if (!code) return;
        const stillUp = await promptfooViewerUp();
        if (stillUp) {
          viewerSpawnError = null;
          appendFileSync(logPath, `child exit code: ${code} (port 15500 still up — OK)\n`);
          return;
        }
        appendFileSync(logPath, `exit code: ${code}\n`);
        const tail = tailLogFile(outLogPath) || tailLogFile(logPath);
        let hint = '';
        if (/15500 is already in use/i.test(tail)) {
          hint = ' Port 15500 is in use — stop the other process and Start again.';
        } else if (/already in use/i.test(tail)) {
          hint = ` ${tail.split('\n').find((l) => /already in use/i.test(l))?.trim() || ''}`;
        } else if (/ERR_MODULE_NOT_FOUND/i.test(tail) && /openai/i.test(tail)) {
          hint = ' Broken npx promptfoo install — run npm install in the project root (uses local promptfoo).';
        } else if (!existsSync(PROMPTFOO_CLI)) {
          hint = ' No local promptfoo — run npm install in the project root.';
        }
        viewerSpawnError = `promptfoo view exited with code ${code}.${hint} See ${PROMPTFOO_OUT_REL} and ${PROMPTFOO_LOG_REL}.`;
      })();
    });
  });
}

function runPromptfooEval(id) {
  return new Promise((resolve) => {
    if (!/^[A-Za-z0-9_-]+$/.test(id || '')) return resolve({ error: 'bad id' });
    const file = `${id}.gen.yaml`;
    const cwd = resolve(mem.paths.REGRESSION);
    if (!existsSync(join(cwd, file))) return resolve({ error: 'no such regression' });
    const { command, args } = spawnPromptfooCli(['eval', '-c', file, '--no-cache']);
    execFile(command, args,
      {
        cwd,
        env: promptfooEnv(cwd, { MERCI_TARGET_KEY: process.env.MERCI_TARGET_KEY || 'merci-lab-key' }),
        timeout: 150000,
        maxBuffer: 8e6,
        windowsHide: true,
      },
      (err, stdout, stderr) => {
        const out = (stdout || '') + (stderr || '');
        const passed = Number(/(\d+) passed/.exec(out)?.[1] || 0);
        const failed = Number(/(\d+) failed/.exec(out)?.[1] || 0);
        const errors = Number(/(\d+) errors/.exec(out)?.[1] || 0);
        resolve({ id, passed, failed, errors, bug_live: failed > 0, raw: out.replace(/\x1b\[[0-9;]*m/g, '').slice(-500) });
      });
  });
}

function countFindings() {
  const all = mem.loadAllFindings();
  return { total: all.length, confirmed: all.filter((f) => f.status === 'CONFIRMED').length,
    rejected: all.filter((f) => f.status === 'REJECTED').length, candidate: all.filter((f) => f.status === 'CANDIDATE').length };
}

function campaignOptionsForUi() {
  return mem.listCampaignWorkspaces().map((c) => ({
    ...c,
    optionLabel: c.selectable ? `${c.label} · ${c.statusNote}` : `${c.label} — ${c.statusNote}`,
  }));
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use — another RedCell dashboard is still running.\n  Stop it (Ctrl+C in that terminal) or end the node.exe on :${PORT}, then run npm run dashboard again.\n`);
    process.exit(1);
  }
  throw err;
});
server.listen(PORT, () => {
  console.log(`\n  RedCell dashboard → http://localhost:${PORT}\n  (adapter default: ${process.env.RC_ADAPTER || 'mercibank'} · brains: ${Object.entries(brains.status()).map(([k, v]) => `${k}=${v || 'code'}`).join(' ')})\n  Authorized lab only. Ctrl-C to stop.\n`);
});
