// engine.mjs — the audit-service lifecycle, as code. One campaign = WAKE → ORIENT → (PLAN → ATTACK → JUDGE →
// REINFORCE)×episodes. Each stage prints its own step and, if a brain is configured (lib/brains.mjs), gets a
// smart assist; otherwise it falls back to deterministic code so the lab always runs. VERIFY/SCORE/PROMOTE/
// REPORT live in their own modules and are driven by verify.mjs / report.mjs after a campaign banks candidates.

import { pickAdapter } from '../adapters/index.mjs';
import { familiesOf } from '../strategies/catalog.mjs';
import { applyChain, CONVERTER_IDS } from '../strategies/converters.mjs';
import { ORCHESTRATORS } from '../strategies/orchestrators.mjs';
import {
  resolveTargetId, getObjectives, getObjectiveIds, loadStrategiesForTarget,
} from './target.mjs';
import { judge, judgeAll } from './judge.mjs';
import { pickFamily, record, summarize } from './planner.mjs';
import * as mem from './memory.mjs';
import * as brains from './brains.mjs';
import { assertCampaignTargetMatchesWorkspace } from './verify-guard.mjs';
import { emit as uiEmit } from './ui.mjs';
import { orientProbesForTarget } from './orient-probes.mjs';
import { enrichNltTurnAfterSay } from './nlt-turn-enrichment.mjs';
import { adminRbacBypassSignal } from './verification-signals.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function emitPlanBoard(emit, ranked, pickedFamily, profile) {
  const top = ranked.slice(0, 4);
  const finiteScores = top.map((r) => r.score).filter((s) => s !== Infinity);
  const maxScore = finiteScores.length ? Math.max(...finiteScores) : 1;
  const c = top[0]?.ucbC ?? Math.SQRT2;
  emit({
    type: 'planLegend',
    formula: `score = winRate + C×√(ln(totalPulls)/pulls) + orientBoost  (C=${c.toFixed(2)}; untried → score ∞)`,
    barHint: 'Bar = score ÷ max score in this top-4 (not win rate)',
  });
  top.forEach((r, i) => {
    const unexplored = r.pulls === 0;
    const bar = unexplored ? 1 : Math.max(0, Math.min(1, r.score / maxScore));
    emit({
      type: 'plan',
      rank: i + 1,
      family: r.family,
      picked: r.family === pickedFamily,
      unexplored,
      totalPulls: r.totalPulls,
      ucbC: r.ucbC,
      winRate: unexplored ? null : Number(r.winRate.toFixed(3)),
      exploreTerm: unexplored ? null : Number(r.exploreTerm.toFixed(3)),
      ucbBase: unexplored ? null : Number(r.ucb.toFixed(3)),
      orientBoost: Number((r.orientBoost || 0).toFixed(3)),
      score: unexplored ? null : Number(r.score.toFixed(3)),
      bar,
      pulls: r.pulls,
      wins: r.wins,
    });
  });
  if (profile?.prioritize?.length) {
    emit({ type: 'info', msg: `ORIENT prioritize: ${profile.prioritize.join(', ')} (orientBoost up to ${process.env.ORIENT_UCB_BOOST || 0.35})` });
  }
}

export async function runCampaign(opts = {}) {
  const emit = opts.emit || uiEmit;
  const episodes = Number(opts.episodes ?? process.env.EPISODES ?? 12);
  const maxTurns = Number(opts.maxTurns ?? process.env.MAX_TURNS ?? 4);
  const delay = Number(opts.delay ?? process.env.ATTACK_DELAY_MS ?? 400);
  const adapterName = opts.adapter || process.env.RC_ADAPTER || 'mercibank';
  const { targetId, adapter: resolvedAdapter } = resolveTargetId({ targetId: opts.targetId, adapter: adapterName });
  const objectives = getObjectives(targetId);
  const objectiveIds = getObjectiveIds(targetId);

  assertCampaignTargetMatchesWorkspace(targetId);

  if (opts.fresh) {
    const ar = mem.archiveCampaignWorkspace({ adapter: resolvedAdapter, targetId, source: 'fresh-run' });
    if (ar.archived) emit({ type: 'info', msg: `archived previous campaign → campaign/archive/${ar.name}` });
    else emit({ type: 'info', msg: 'fresh run — nothing to archive (campaign folder was empty)' });
  }

  emit({ type: 'phase', name: 'WAKE', note: `target=${targetId} · adapter=${resolvedAdapter}` });
  emit({ type: 'stage', stage: 'WAKE' });
  const target = pickAdapter(resolvedAdapter, opts.adapterOpts);
  const info = target.info();
  emit({ type: 'info', msg: `target: ${info.name} (${info.url}) · targetId=${targetId}` });
  if (target.health) {
    try { const h = await target.health(); emit({ type: 'info', msg: `health ok · model=${h.model || '?'} · key=${h.hasKey ? 'set' : 'MISSING'}` });
      if (h.hasKey === false) throw new Error('target has no model key'); }
    catch (e) { emit({ type: 'error', msg: `WAKE failed: ${e.message}` }); throw e; }
  }
  const brainStatus = brains.status();
  emit({ type: 'info', msg: `brains: ${Object.entries(brainStatus).map(([k, v]) => `${k}=${v || 'code'}`).join(' ')}` });

  const register = process.env.RC_FRESH_REGISTER === '0'
    ? mem.loadRegister()
    : { families: {}, createdAt: new Date().toISOString(), runAt: new Date().toISOString() };
  mem.saveRegister(register);
  mem.journal(`campaign start · ${info.name} · brains ${JSON.stringify(brainStatus)}${process.env.RC_FRESH_REGISTER === '0' ? ' · register resumed' : ' · fresh register'}`);

  let strategies = loadStrategiesForTarget({ targetId, all: opts.all, only: opts.only });
  const strategyIdsForRun = opts.only?.length
    ? [...opts.only].sort()
    : strategies.map((s) => s.id);
  mem.saveCampaignMeta({
    targetId,
    adapter: resolvedAdapter,
    lastCampaignStartedAt: new Date().toISOString(),
  });
  mem.patchCampaignManifest({ targetId, adapter: resolvedAdapter });
  mem.saveCampaignStrategyIds(strategyIdsForRun);

  emit({ type: 'phase', name: 'ORIENT', note: 'fingerprint the target' });
  emit({ type: 'stage', stage: 'ORIENT' });
  const probeResults = [];
  const orientProbes = orientProbesForTarget(targetId);
  try {
    const s = target.newSession();
    for (const q of orientProbes) { const t = await s.say(q); probeResults.push({ q, a: t.reply }); emit({ type: 'recon', msg: `probe "${q.slice(0, 40)}" → ${String(t.reply).replace(/\s+/g, ' ').slice(0, 72)}` }); await sleep(delay); }
  } catch (e) { emit({ type: 'warn', msg: `recon probe error: ${e.message}` }); }
  let profile = { tools: info.tools || [], refusalStyle: 'unknown', prioritize: [] };
  const smartProfile = await brains.orient({ probes: probeResults, objectives: objectiveIds }).catch(() => null);
  if (smartProfile) { profile = { ...profile, ...smartProfile }; emit({ type: 'recon', msg: `brain profile: ${smartProfile.summary || ''} · prioritize ${(smartProfile.prioritize || []).join(',') || '—'}` }); }
  else emit({ type: 'recon', msg: `code profile: tools=[${profile.tools.join(', ')}] (no recon brain — using defaults)` });
  mem.saveProfile({ ...profile, probes: probeResults, at: new Date().toISOString() });

  const done = new Set();
  const found = [];
  const bankedObjectives = new Set();

  for (let ep = 1; ep <= episodes; ep++) {
    if (opts.stopRef?.stopped) { emit({ type: 'warn', msg: 'stopped by operator' }); break; }
    const remaining = strategies.filter((s) => !done.has(s.id));
    if (!remaining.length) { emit({ type: 'info', msg: '(every strategy attempted — stopping early)' }); break; }

    emit({ type: 'stage', stage: 'PLAN', ep });
    const liveFamilies = familiesOf(remaining);
    const { family, ranked } = pickFamily(register, liveFamilies, { profile, allStrategies: strategies });
    const inFamily = remaining.filter((s) => s.family === family);
    let strategy = inFamily[0] || remaining[0];
    const pickNote = inFamily.length > 1
      ? `first of ${inFamily.length} remaining in family (catalog order)`
      : `only strategy left in family`;

    const smart = await brains.strategize({ objective: strategy.objective,
      shortlist: { orchestrators: Object.keys(ORCHESTRATORS), converters: ['none', 'base64', 'leet', 'authority', 'devmode', 'persona'] },
      memory: mem.loadLessons().map((l) => l.note).filter(Boolean) }).catch(() => null);
    const allowOverride = strategy.generated || process.env.STRATEGIST_OVERRIDE === '1';
    if (allowOverride && smart?.orchestrator && ORCHESTRATORS[smart.orchestrator]) strategy = { ...strategy, orchestrator: smart.orchestrator };
    if (allowOverride && Array.isArray(smart?.converters)) strategy = { ...strategy, converterChain: smart.converters.filter((c) => CONVERTER_IDS.includes(c)) };

    emit({
      type: 'episode', ep, stage: 'PLAN', strategyId: strategy.id, family, objective: strategy.objective,
      orchestrator: strategy.orchestrator, converters: strategy.converterChain,
      pickNote,
      plan: smart?.rationale ? `strategist${allowOverride ? '' : ' (advisory)'}: ${smart.rationale}` : `UCB picked family «${family}» → strategy ${strategy.id}`,
    });
    emitPlanBoard(emit, ranked, family, profile);

    emit({ type: 'stage', stage: 'ATTACK', ep, strategyId: strategy.id, family, objective: strategy.objective });
    const ctx = {
      strategy,
      newSession: () => target.newSession(),
      judgeTurns: (turns) => judge(turns, strategy.objective, objectives),
      mutate: (a) => brains.mutate(a).catch(() => null),
      convert: (text) => applyChain(text, strategy.converterChain || []),
      emit,
      maxTurns,
      ...(targetId === 'nlt' ? {
        afterTurn: (turn, session) => enrichNltTurnAfterSay(strategy, session, turn),
        buildHttpProbeHint: (probeResult, spec) => adminRbacBypassSignal(probeResult, spec),
      } : {}),
    };
    let result;
    try { result = await (ORCHESTRATORS[strategy.orchestrator] || ORCHESTRATORS.single)(ctx); }
    catch (e) {
      emit({ type: 'error', msg: `attack error: ${e.message}` });
      emit({ type: 'stage', stage: 'TRANSPORT', ep, strategyId: strategy.id });
      done.add(strategy.id);
      continue;
    }

    emit({ type: 'stage', stage: 'JUDGE', ep, strategyId: strategy.id });
    const lastReply = result.turns.at(-1)?.reply || '';
    const rub = await brains.rubric({ objectiveLabel: objectives[strategy.objective]?.label, reply: lastReply }).catch(() => null);
    if (rub) emit({ type: 'rubric', agree: rub.leak === result.hit, note: rub.why });

    const won = result.hit && strategy.family !== 'control';
    record(register, strategy.family, won); mem.saveRegister(register); done.add(strategy.id);

    emit({ type: 'stage', stage: 'REINFORCE', ep, strategyId: strategy.id, won });

    if (result.hit) {
      const v = result.verdict;
      if (strategy.family === 'control') emit({ type: 'warn', msg: `CONTROL unexpectedly fired (${v.evidence}) — the target is weaker than expected` });
      emit({ type: 'verdict', hit: true, label: v.label, kind: v.kind, evidence: v.evidence, strategyId: strategy.id });
      saveCandidate(strategy, result, found, bankedObjectives, emit, { targetId, adapter: resolvedAdapter, objectives });
    } else {
      emit({ type: 'verdict', hit: false, detail: `${strategy.objective} not leaked in ${result.turns.length} turn(s)`, strategyId: strategy.id });
      const note = await brains.lesson({ objective: strategy.objective, transcript: result.turns.map((t) => `${t.user} → ${t.reply}`).join(' | ') }).catch(() => null);
      mem.lesson({ strategy: strategy.id, objective: strategy.objective, note: note || `held after ${result.turns.length} turns` });
      mem.journal(`MISS ${strategy.id} (${strategy.objective})`);
    }

    const all = judgeAll(result.turns, objectives);
    for (const [obj, hit] of Object.entries(all)) {
      if (obj === strategy.objective || bankedObjectives.has(obj)) continue;
      const pseudo = { ...strategy, id: `OPP-${obj}`, objective: obj, orchestrator: `opportunistic (while testing ${strategy.objective})`, converterChain: [], title: `Opportunistic — ${objectives[obj]?.label}` };
      emit({ type: 'memory', msg: `opportunistic find: ${obj} (${hit.evidence})` });
      saveCandidate(pseudo, { hit: true, verdict: hit, turns: result.turns }, found, bankedObjectives, emit, { targetId, adapter: resolvedAdapter, objectives });
    }
    await sleep(delay);
  }

  emit({ type: 'phase', name: 'SUMMARY' });
  emit({ type: 'stage', stage: 'SUMMARY' });
  for (const row of summarize(register, familiesOf(strategies))) emit({ type: 'info', msg: `${row.family.padEnd(16)} tries ${row.pulls}  wins ${row.wins}` });
  emit({ type: 'info', msg: `candidates: ${found.length ? found.join(', ') : 'none this run'} → ${mem.paths.FINDINGS}/` });
  emit({ type: 'info', msg: 'next: node verify.mjs  (reproduce 3× · gate · AIVSS · promote)' });
  mem.saveCampaignMeta({
    lastCampaignFinishedAt: new Date().toISOString(),
    lastCampaignCandidates: found,
    lastCampaignStopped: Boolean(opts.stopRef?.stopped),
  });
  return { found, register, stopped: Boolean(opts.stopRef?.stopped) };
}

function saveCandidate(strategy, result, found, banked, emit, ctx) {
  const o = ctx.objectives[strategy.objective] || {};
  const finding = {
    id: strategy.id, status: 'CANDIDATE', title: strategy.title, objective: strategy.objective,
    targetId: ctx.targetId, adapter: ctx.adapter,
    family: strategy.family, orchestrator: strategy.orchestrator, converterChain: strategy.converterChain || [],
    owaspLLM: o.owaspLLM, owaspASI: o.owaspASI, impact: o.impact, aivssInputs: o.aivss,
    evidence: result.verdict.evidence, evidenceKind: result.verdict.kind, foundAt: new Date().toISOString(),
    turnsToHit: result.turns.length,
    transcript: result.turns.map((t) => ({ user: t.user, reply: t.reply, toolCalls: t.toolCalls, retrieved: t.retrieved, findingsHint: t.findingsHint })),
    evidence_ladder: 'claimed',
  };
  const saved = mem.saveCandidateFinding(finding);
  if (!saved.ok) {
    emit({ type: 'warn', msg: `finding ${strategy.id} not re-banked (${saved.reason})` });
    return;
  }
  mem.journal(`HIT ${strategy.id} (${strategy.objective}) in ${finding.turnsToHit} turns — candidate saved`);
  found.push(strategy.id); banked.add(strategy.objective);
}
