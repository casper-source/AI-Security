// app.js — RedCell dashboard client. SSE step stream, turn log table, stage rail, findings, reports.
const $ = (s) => document.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
const clip = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const ts = (t) => new Date(t || Date.now()).toISOString().slice(11, 19);

const CAMPAIGN_STAGES = ['WAKE', 'ORIENT', 'PLAN', 'ATTACK', 'JUDGE', 'REINFORCE', 'SUMMARY'];
const VERIFY_STAGES = ['VERIFY', 'SCORE', 'PROMOTE'];
const UCB_C_DEFAULT = Math.SQRT2;

/** Live-only structural events; replay would mix old/new schemas and show undefined UCB fields. */
const LIVE_ONLY = new Set(['episode', 'planLegend', 'plan', 'turn', 'repro', 'stage', 'verifyBrief']);

const FONT_SCALE_KEY = 'rcFontScalePct';
const FONT_SCALE_PRESETS = [85, 100, 120];

function normalizeFontScalePct(raw) {
  const n = Number(raw);
  if (!FONT_SCALE_PRESETS.includes(n)) {
    if (Number.isFinite(n)) {
      return FONT_SCALE_PRESETS.reduce((best, p) => (Math.abs(p - n) < Math.abs(best - n) ? p : best));
    }
    return 100;
  }
  return n;
}

function getFontScalePct() {
  return normalizeFontScalePct(localStorage.getItem(FONT_SCALE_KEY) ?? 100);
}

function setFontScalePct(pct) {
  const p = normalizeFontScalePct(pct);
  localStorage.setItem(FONT_SCALE_KEY, String(p));
  applyDisplayScale();
}

function applyDisplayScale() {
  const root = document.documentElement;
  const pct = getFontScalePct();
  root.style.setProperty('--font-scale-user', String(pct / 100));
  document.querySelectorAll('.font-scale-btn').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.pct) === pct);
  });
  const wrap = $('#fontScaleWrap');
  if (wrap) {
    const px = parseFloat(getComputedStyle(root).fontSize);
    wrap.title = `Text ${pct}% · base ${Math.round(px)}px`;
  }
}

function initDisplayScale() {
  const btns = document.querySelectorAll('.font-scale-btn');
  if (!btns.length) return;
  applyDisplayScale();
  btns.forEach((btn) => {
    btn.addEventListener('click', () => setFontScalePct(btn.dataset.pct));
  });
}

function enrichPlan(e) {
  const pulls = Number(e.pulls) || 0;
  const wins = Number(e.wins) || 0;
  const c = Number(e.ucbC) || UCB_C_DEFAULT;
  const bar = e.bar ?? e.score ?? 0;
  if (e.unexplored === true || pulls === 0) {
    return { ...e, bar, ucbC: c, unexplored: true };
  }
  const totalPulls = Number(e.totalPulls) || pulls;
  const winRate = e.winRate != null ? e.winRate : wins / pulls;
  const exploreTerm = e.exploreTerm != null ? e.exploreTerm : c * Math.sqrt(Math.log(Math.max(totalPulls, 1)) / pulls);
  const orientBoost = e.orientBoost != null ? e.orientBoost : 0;
  const ucbBase = e.ucbBase != null ? e.ucbBase : winRate + exploreTerm;
  const score = e.score != null ? e.score : ucbBase + orientBoost;
  return {
    ...e, bar, ucbC: c, unexplored: false, totalPulls, winRate, exploreTerm, orientBoost, ucbBase, score,
    exploreNote: e.exploreTerm == null ? ' (explore recomputed on client)' : '',
  };
}

// ---------- live run UI ----------
let runMode = 'campaign';
let activeStage = '';
/** @type {Map<number, { ep: number, meta: object|null, planLegend: object|null, plans: object[], turns: object[], verdict: object|null, rubric: object|null }>} */
const episodeArchive = new Map();
/** @type {Set<string>} `${ep}:${strategyId}` */
const strategyRunExpanded = new Set();
let currentLiveEp = 0;
let viewEp = 0;
let followLiveEpisode = true;
let summaryCaptureActive = false;
/** @type {string[]} */
let campaignSummaryLines = [];
let showCampaignSummary = false;

function resetLiveUI(mode) {
  runMode = mode || 'campaign';
  activeStage = '';
  episodeArchive.clear();
  strategyRunExpanded.clear();
  summaryCaptureActive = false;
  campaignSummaryLines = [];
  showCampaignSummary = false;
  currentLiveEp = 0;
  viewEp = 0;
  followLiveEpisode = true;
  setStageRailMessage(null);
  $('#stageRail').innerHTML = '';
  $('#episodeHead').innerHTML = '';
  $('#episodeNav')?.classList.add('hidden');
  $('#turnBody').innerHTML = '';
  $('#strategyLog').innerHTML = '';
  // force full rebuild on next render
  $('#turnEmpty').style.display = '';
  setCampaignLogVisible(runMode === 'campaign');
  setVerifyPaneVisible(runMode === 'verify');
  const stages = runMode === 'verify' ? VERIFY_STAGES : CAMPAIGN_STAGES;
  stages.forEach((s) => {
    $('#stageRail').appendChild(buildStageChip(s, runMode));
  });
  setTurnHeaders(runMode);
}

function buildStageChip(name, mode) {
  const node = el('span', `st pending${mode === 'verify' ? ' verify' : ''}`, '');
  node.dataset.stage = name;
  const label = el('span', 'st-label', name);
  const icon = el('span', 'st-icon st-icon-pending', '');
  node.appendChild(label);
  node.appendChild(icon);
  return node;
}

function campaignRunRailMessage(campaignId, label) {
  if (!campaignId || campaignId === 'new') return null;
  if (campaignId === 'active') return 'Continuing Current (live)';
  const name = label && label !== 'New campaign' ? label : campaignId;
  return `Continuing «${name}»`;
}

function setStageRailMessage(kind, text) {
  const box = $('#stageRailMsg');
  if (!box) return;
  if (!text) {
    box.classList.add('hidden');
    box.textContent = '';
    box.classList.remove('info', 'warn', 'error');
    return;
  }
  box.classList.remove('hidden', 'info', 'warn', 'error');
  box.classList.add(kind === 'warn' ? 'warn' : kind === 'error' ? 'error' : 'info');
  box.textContent = text;
}

function normalizePipelineStage(stage) {
  if (stage === 'TRANSPORT') return 'ATTACK';
  return stage;
}

function setStageIcon(node, state) {
  const icon = node.querySelector('.st-icon');
  if (!icon) return;
  icon.className = 'st-icon';
  icon.textContent = '';
  if (state === 'active') icon.classList.add('st-icon-spin');
  else if (state === 'done') {
    icon.classList.add('st-icon-done');
    icon.textContent = '✓';
  } else icon.classList.add('st-icon-pending');
}

function finishStageRail() {
  $('#stageRail')?.querySelectorAll('.st').forEach((node) => {
    node.classList.remove('active', 'pending');
    node.classList.add('done');
    setStageIcon(node, 'done');
  });
}

function formatWhen(iso) {
  if (!iso) return '— (run a campaign first)';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

function renderVerifyBrief(data) {
  const box = $('#verifyBrief');
  if (!box || !data) return;
  box.classList.remove('hidden');
  const items = data.findings || [];
  const list = items.length
    ? `<ul class="verify-findings-list">${items.map((f) =>
      `<li><b>${esc(f.id)}</b>${f.title ? ` — ${esc(f.title)}` : ''} · ${esc(f.objective)}` +
      `${f.impact ? ` · <span class="impact">${esc(f.impact)}</span>` : ''}` +
      `${f.foundAt ? ` · found ${esc(formatWhen(f.foundAt))}` : ''}</li>`,
    ).join('')}</ul>`
    : `<div class="verify-queue-note">${esc(data.queueNote || 'Nothing in the verify queue.')}</div>`;
  const banked = data.lastRunBanked?.length
    ? `<div class="verify-list-label" style="margin-top:10px">Last campaign banked (${data.lastRunBanked.length}):</div>` +
      `<ul class="verify-findings-list verify-banked">${data.lastRunBanked.map((f) =>
        `<li><b>${esc(f.id)}</b> · <span class="status-${esc((f.status || '').toLowerCase())}">${esc(f.status)}</span></li>`,
      ).join('')}</ul>`
    : (data.confirmedAlready?.length
      ? `<div class="verify-list-label" style="margin-top:10px">On disk (already verified):</div>` +
        `<ul class="verify-findings-list verify-banked">${data.confirmedAlready.map((id) =>
          `<li><b>${esc(id)}</b> · <span class="status-confirmed">CONFIRMED</span></li>`,
        ).join('')}</ul>`
      : '');
  box.innerHTML =
    `<h3>Verify</h3>` +
    (data.campaignLabel ? `<div class="verify-meta">Workspace: <b>${esc(data.campaignLabel)}</b></div>` : '') +
    `<div class="verify-meta">Campaign run: <b>${esc(formatWhen(data.lastCampaignAt))}</b>` +
    ` · repro bar <b>${esc(data.reproBar || '3/3')}</b> (need ≥ min hits in ${esc(String(data.reproRuns || 3))} runs)</div>` +
    `<div class="verify-list-label">Findings to test (${items.length}) <span style="color:var(--mut);font-weight:400">— CANDIDATE only</span>:</div>${list}${banked}`;
}

function setCampaignLogVisible(show) {
  $('#strategyLog')?.classList.toggle('hidden', !show);
  $('#turnTable')?.classList.toggle('hidden', show);
}

function setVerifyPaneVisible(verifyMode) {
  $('#verifyBrief')?.classList.toggle('hidden', !verifyMode);
  $('#episodeHead')?.classList.toggle('hidden', verifyMode);
  $('#episodeNav')?.classList.toggle('hidden', verifyMode || !episodeArchive.size);
  setCampaignLogVisible(!verifyMode && runMode === 'campaign');
}

function selectedVerifyCampaignId() {
  const sel = $('#verifyCampaign');
  return sel?.value || 'new';
}

/** Query string `campaign=` for workspace-scoped APIs (findings, reports, artifacts). */
function apiCampaignQuery(extra = {}) {
  const qs = new URLSearchParams(extra);
  qs.set('campaign', selectedVerifyCampaignId());
  return `?${qs}`;
}

function refreshWorkspaceScopedPanes() {
  if ($('#pane-findings')?.classList.contains('active')) loadFindings();
  if ($('#pane-reports')?.classList.contains('active')) loadReport(currentAud);
  if ($('#pane-artifacts')?.classList.contains('active')) loadArtifacts();
  if ($('#pane-promptfoo')?.classList.contains('active')) loadPromptfoo();
}

/** Sorted strategy ids that match the selected workspace's last campaign run (null = full catalog). */
let campaignStrategyBaseline = null;
let campaignsCache = [];

function sortedStrategyIds(ids) {
  return [...ids].sort();
}

function allStrategyCheckboxIds() {
  return [...document.querySelectorAll('#strategyList input[type=checkbox]')].map((c) => c.value);
}

function checkedStrategyIds() {
  return [...document.querySelectorAll('#strategyList input:checked')].map((c) => c.value);
}

function strategyIdSetsEqual(a, b) {
  const sa = sortedStrategyIds(a);
  const sb = sortedStrategyIds(b);
  if (sa.length !== sb.length) return false;
  return sa.every((v, i) => v === sb[i]);
}

function expectedStrategyIdsForCampaign(campaignId, campaigns) {
  if (!campaignId || campaignId === 'new') return null;
  const row = (campaigns || campaignsCache).find((c) => c.id === campaignId);
  const ids = row?.lastCampaignStrategyIds;
  if (Array.isArray(ids) && ids.length) return sortedStrategyIds(ids);
  return null;
}

function applyStrategyCheckboxes(idsOrAll) {
  const all = allStrategyCheckboxIds();
  const want = idsOrAll === null ? new Set(all) : new Set(idsOrAll);
  document.querySelectorAll('#strategyList input[type=checkbox]').forEach((cb) => {
    cb.checked = want.has(cb.value);
  });
}

async function syncStrategyCheckboxesToCampaign(campaignId, campaigns) {
  if (campaigns?.length) campaignsCache = campaigns;
  if (!campaignId || campaignId === 'new') {
    campaignStrategyBaseline = null;
    applyStrategyCheckboxes(null);
    return;
  }
  let ids = null;
  try {
    const res = await fetch(`/api/campaign/strategies?campaign=${encodeURIComponent(campaignId)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.strategyIds) && data.strategyIds.length) {
        ids = sortedStrategyIds(data.strategyIds);
      }
    }
  } catch { /* fall back to cached campaign list */ }
  if (!ids) ids = expectedStrategyIdsForCampaign(campaignId, campaignsCache);
  if (!ids) {
    campaignStrategyBaseline = null;
    applyStrategyCheckboxes(null);
    return;
  }
  campaignStrategyBaseline = ids;
  const all = allStrategyCheckboxIds();
  applyStrategyCheckboxes(ids.filter((id) => all.includes(id)));
}

function strategySelectionMatchesCampaign() {
  const all = allStrategyCheckboxIds();
  const checked = checkedStrategyIds();
  const expected = campaignStrategyBaseline === null ? all : campaignStrategyBaseline.filter((id) => all.includes(id));
  return strategyIdSetsEqual(checked, expected);
}

function onStrategyCheckboxChanged() {
  const campaignId = selectedVerifyCampaignId();
  if (campaignId === 'new') return;
  if (strategySelectionMatchesCampaign()) return;
  const sel = $('#verifyCampaign');
  const hint = $('#verifyCampaignHint');
  if (sel) sel.value = 'new';
  campaignStrategyBaseline = null;
  if (hint) {
    hint.textContent = 'Strategy selection changed — using New campaign (Run campaign will archive Current live, then run your checked strategies).';
  }
}

async function onCampaignWorkspaceChanged() {
  const campaignId = selectedVerifyCampaignId();
  await refreshVerifyCampaignSelect(undefined, campaignId);
  await syncStrategyCheckboxesToCampaign(campaignId);
  const plan = await loadVerifyPlanPreview();
  if (plan && !plan.error) renderVerifyBrief(plan);
  else $('#verifyBrief')?.classList.add('hidden');
  refreshWorkspaceScopedPanes();
}

function renderVerifyCampaignOptions(campaigns, prevId, preferId) {
  const sel = $('#verifyCampaign');
  const hint = $('#verifyCampaignHint');
  if (!sel) return;
  let list = [...(campaigns || [])];
  const prev = preferId || prevId || sel.value;
  if (prev && prev !== 'new' && !list.some((c) => c.id === prev)) {
    const cached = campaignsCache.find((c) => c.id === prev);
    if (cached) list = [cached, ...list];
  }
  const rows = [{ id: 'new', optionLabel: 'New campaign' }, ...list];
  sel.innerHTML = rows.map((c) =>
    `<option value="${esc(c.id)}">${esc(c.optionLabel || c.label)}</option>`,
  ).join('');
  const pick = rows.find((c) => c.id === prev)
    || rows.find((c) => c.id === 'new')
    || rows[0];
  if (pick) sel.value = pick.id;
  if (hint) {
    const selId = pick?.id || 'new';
    if (selId === 'new') {
      hint.textContent = 'New campaign archives Current (live), then runs clean. After a run, Current (live) appears here for verify or another episode pass.';
    } else if (selId === 'active') {
      hint.textContent = 'Current (live) — verify pending hits or run again to continue (resumes register). Pick New campaign for a clean live workspace.';
    } else {
      hint.textContent = 'Archived workspace — continue with Run campaign or verify CANDIDATE findings here.';
    }
  }
}

async function refreshVerifyCampaignSelect(fallbackCampaigns, preferId) {
  const sel = $('#verifyCampaign');
  if (!sel) return [];
  const prev = preferId || sel.value;
  try {
    const res = await fetch('/api/campaigns');
    if (res.ok) {
      const data = await res.json();
      const campaigns = data.campaigns || [];
      if (campaigns.length) campaignsCache = campaigns;
      const list = campaigns.length ? campaigns : campaignsCache;
      renderVerifyCampaignOptions(list, prev, preferId);
      return list;
    }
  } catch { /* fall through */ }
  if (fallbackCampaigns?.length) {
    renderVerifyCampaignOptions(fallbackCampaigns, prev, preferId);
    return fallbackCampaigns;
  }
  if (campaignsCache.length) {
    renderVerifyCampaignOptions(campaignsCache, prev, preferId);
    return campaignsCache;
  }
  renderVerifyCampaignOptions([], prev, preferId);
  return [];
}

async function loadVerifyPlanPreview() {
  const min = Number($('#reproMin')?.value) || 3;
  const qs = new URLSearchParams({ min: String(min), runs: '3', campaign: selectedVerifyCampaignId() });
  try {
    return await fetch(`/api/verify/plan?${qs}`).then((r) => r.json());
  } catch {
    return null;
  }
}

async function previewVerifyForSelection() {
  await refreshVerifyCampaignSelect();
  const plan = await loadVerifyPlanPreview();
  if (plan && !plan.error) renderVerifyBrief(plan);
}

function setTurnHeaders(mode) {
  const tr = $('#turnThead').querySelector('tr');
  if (mode === 'verify') {
    tr.innerHTML = '<th>time</th><th>finding</th><th>rep</th><th>result</th><th>hits</th><th>ms</th><th></th>';
  } else {
    tr.innerHTML = '<th>strategy</th><th>turns</th><th>outcome</th><th>ms</th><th>tokens</th>';
  }
}

function renderStrategyTranscript(turns) {
  return turns.map((e, i) => {
    const src = e.source ?? '—';
    const meta = `Turn ${e.turn} · ${e.outcome || '—'} · ${e.ms ?? '—'}ms${e.tokens != null ? ` · ${e.tokens} tok` : ''}`;
    return (
      (i ? '<div class="turn-divider" role="separator"></div>' : '') +
      `<div class="turn-chunk">` +
      `<div class="turn-chunk-meta">${esc(meta)}</div>` +
      `<b>You (source: ${esc(src)}):</b><pre>${esc(e.user || '')}</pre>` +
      `<b>Target:</b><pre>${esc(e.reply || '')}</pre>` +
      (e.error ? `<div class="turn-error">✖ ${esc(e.error)}</div>` : '') +
      (e.evidence ? `<div class="turn-judge"><b>Judge</b> ${esc(e.evidence)}</div>` : '') +
      `</div>`
    );
  }).join('');
}

function summarizeStrategyOutcomes(turns) {
  const hit = turns.find((t) => t.outcome === 'hit');
  if (hit) return { text: `hit (turn ${hit.turn})`, rowClass: 'hit' };
  const transport = turns.find((t) => t.outcome === 'transport');
  if (transport) return { text: 'transport', rowClass: 'transport' };
  const last = turns[turns.length - 1];
  return { text: last?.outcome || '—', rowClass: last?.outcome === 'miss' ? 'miss' : 'held' };
}

function strategyRunKey(rec) {
  const id = rec.meta?.strategyId || '?';
  return `${rec.ep}:${id}`;
}

function buildStrategyRunSection(rec, { isLive = false, isSelected = false } = {}) {
  const m = rec.meta;
  if (!m) return '';
  const key = strategyRunKey(rec);
  const open = strategyRunExpanded.has(key);
  const { text: outcomeText, rowClass } = summarizeStrategyOutcomes(rec.turns);
  const totalMs = rec.turns.reduce((s, t) => s + (Number(t.ms) || 0), 0);
  const tokKnown = rec.turns.some((t) => t.tokens != null);
  const totalTok = tokKnown ? rec.turns.reduce((s, t) => s + (Number(t.tokens) || 0), 0) : null;
  let verdictLine = '';
  if (rec.verdict?.hit) {
    const v = rec.verdict;
    verdictLine = `<div class="strategy-run-verdict hit">✓ ${esc(v.label || '')} · ${esc(clip(v.evidence, 100))}</div>`;
  } else if (rec.verdict) {
    verdictLine = `<div class="strategy-run-verdict miss">✗ ${esc(rec.verdict.detail || 'held')}</div>`;
  }
  const body = rec.turns.length
    ? `<div class="turn-detail strategy-run-transcript">${renderStrategyTranscript(rec.turns)}</div>`
    : '<div class="turn-detail strategy-run-transcript empty-run">No turns yet…</div>';
  return (
    `<section class="strategy-run ${rowClass}${isLive ? ' live' : ''}${isSelected ? ' selected' : ''}" data-ep="${rec.ep}" data-run-key="${String(key).replace(/"/g, '')}">` +
    `<div class="strategy-run-head" role="button" tabindex="0" aria-expanded="${open ? 'true' : 'false'}">` +
    `<span class="strategy-run-ep">Ep ${m.ep}</span>` +
    `<span class="strategy-run-id">${esc(m.strategyId)}</span>` +
    `<span class="strategy-run-outcome outcome">${esc(outcomeText)}</span>` +
    `<span class="strategy-run-meta">${rec.turns.length} turn${rec.turns.length === 1 ? '' : 's'} · ${totalMs}ms` +
    `${totalTok != null ? ` · ${totalTok} tok` : ''}</span>` +
    `<span class="strategy-run-chev" aria-hidden="true">${open ? '▾' : '▸'}</span>` +
    `</div>` +
    `<div class="strategy-run-body${open ? ' open' : ''}">` +
    `<div class="strategy-run-sub">${esc(m.family)} · ${esc(m.objective)} · ${esc(m.orchestrator)}</div>` +
    verdictLine +
    body +
    `</div></section>`
  );
}

function buildEpisodeHeadHtml(rec) {
  const m = rec.meta;
  if (!m) return '<div class="empty" style="padding:8px 0">No episode data.</div>';
  let main =
    `<div><b>Episode ${m.ep}</b> · <span class="pick">PICK ${esc(m.strategyId)}</span> · family <b>${esc(m.family)}</b> · objective ${esc(m.objective)} · ${esc(m.orchestrator)}${m.converters?.length ? ' · ' + esc(m.converters.join('+')) : ''}</div>` +
    (m.pickNote ? `<div style="color:var(--mut);margin-top:4px">${esc(m.pickNote)}</div>` : '') +
    (m.plan ? `<div style="color:var(--dim);margin-top:4px">${esc(m.plan)}</div>` : '');
  if (rec.verdict) {
    const v = rec.verdict;
    main += v.hit
      ? `<div class="episode-verdict hit">✓ HIT · ${esc(v.label || '')} (${esc(v.kind || '')}: ${esc(clip(v.evidence, 120))})</div>`
      : `<div class="episode-verdict miss">✗ ${esc(v.detail || 'no leak')}</div>`;
  }
  if (rec.rubric) {
    main += `<div style="color:var(--mut);margin-top:4px">Rubric ${rec.rubric.agree ? 'agrees' : 'differs'} — ${esc(clip(rec.rubric.note, 100))}</div>`;
  }
  let plan =
    `<div class="plan-legend" style="color:var(--mut);margin-bottom:6px">Family rank (UCB, top 4) — <span class="pick">PICK</span> this episode:</div>`;
  if (rec.planLegend) {
    plan += `<div class="plan-formula"><div>${esc(rec.planLegend.formula)}</div><div style="margin-top:3px;color:var(--dim)">${esc(rec.planLegend.barHint)}</div></div>`;
  }
  for (const raw of rec.plans) plan += planRowHtml(enrichPlan(raw));
  return (
    `<div class="episode-head-grid">` +
    `<div class="episode-main">${main}</div>` +
    `<div class="plan-block episode-plan">${plan}</div>` +
    `</div>`
  );
}

function episodeSelectLabel(rec) {
  const m = rec.meta;
  if (!m) return `Ep ${rec.ep}`;
  const mark = rec.verdict?.hit ? ' ✓' : rec.verdict ? ' · held' : rec.turns.length ? ' · …' : '';
  return `Ep ${rec.ep} · ${m.strategyId}${mark}`;
}

function hasCampaignSummary() {
  return campaignSummaryLines.length > 0;
}

function userPinnedInStrategyLog() {
  if (strategyRunExpanded.size > 0) return true;
  const wrap = getTurnLogWrap();
  return wrap ? !isStreamAtBottom(wrap) : false;
}

function updateEpisodeNav() {
  const nav = $('#episodeNav');
  const sel = $('#epSelect');
  const prev = $('#epPrev');
  const next = $('#epNext');
  const live = $('#epLive');
  if (!nav || !sel) return;
  const eps = [...episodeArchive.keys()].sort((a, b) => a - b);
  if (runMode !== 'campaign' || !eps.length) {
    nav.classList.add('hidden');
    return;
  }
  nav.classList.remove('hidden');
  if (!showCampaignSummary && !episodeArchive.has(viewEp)) {
    viewEp = eps[eps.length - 1];
  }
  let html = '';
  if (hasCampaignSummary()) {
    html += `<option value="${EPISODE_VIEW_SUMMARY}"${showCampaignSummary ? ' selected' : ''}>Summary</option>`;
  }
  html += eps.map((ep) => {
    const rec = episodeArchive.get(ep);
    const selected = !showCampaignSummary && ep === viewEp;
    return `<option value="${ep}"${selected ? ' selected' : ''}>${esc(episodeSelectLabel(rec))}</option>`;
  }).join('');
  sel.innerHTML = html;
  const idx = eps.indexOf(viewEp);
  if (prev) prev.disabled = showCampaignSummary || idx <= 0;
  if (next) next.disabled = showCampaignSummary || idx < 0 || idx >= eps.length - 1;
  if (live) {
    live.classList.toggle('on', followLiveEpisode && !showCampaignSummary);
    live.disabled = followLiveEpisode && !showCampaignSummary && viewEp === currentLiveEp;
  }
}

function getTurnLogWrap() {
  return document.querySelector('#liveMain .table-wrap');
}

function parseCampaignSummary(lines) {
  const families = [];
  let candidates = null;
  let nextStep = null;
  for (const raw of lines) {
    const line = String(raw);
    const fam = line.match(/^(.+?)\s+tries\s+(\d+)\s+wins\s+(\d+)\s*$/);
    if (fam) {
      families.push({ family: fam[1].trim(), tries: Number(fam[2]), wins: Number(fam[3]) });
      continue;
    }
    if (line.startsWith('candidates:')) candidates = line.slice('candidates:'.length).trim();
    else if (line.startsWith('next:')) nextStep = line.slice('next:'.length).trim();
  }
  return { families, candidates, nextStep };
}

function buildCampaignSummaryHtml() {
  const { families, candidates, nextStep } = parseCampaignSummary(campaignSummaryLines);
  const totalWins = families.reduce((s, r) => s + r.wins, 0);
  const table = families.length
    ? `<table class="summary-ucb-table"><thead><tr><th>Family</th><th>Tries</th><th>Wins</th><th>Win rate</th></tr></thead><tbody>` +
      families.map((r) => {
        const rate = r.tries ? Math.round((100 * r.wins) / r.tries) : 0;
        return `<tr><td>${esc(r.family)}</td><td>${r.tries}</td><td>${r.wins}</td><td>${rate}%</td></tr>`;
      }).join('') +
      `</tbody></table>`
    : `<div class="campaign-summary-fallback">${campaignSummaryLines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>`;
  const candHtml = candidates
    ? `<div class="summary-candidates${candidates.includes('none') ? ' empty' : ' hit'}"><span class="summary-label">Candidates</span> ${esc(candidates)}</div>`
    : '';
  const nextHtml = nextStep
    ? `<div class="summary-next"><span class="summary-label">Next</span> ${esc(nextStep)}</div>`
    : '';
  return (
    `<div class="campaign-summary">` +
    `<div class="campaign-summary-head"><b>Campaign summary</b>` +
    `<span class="campaign-summary-stats">${families.length} families · ${totalWins} win${totalWins === 1 ? '' : 's'}</span></div>` +
    `<div class="campaign-summary-body">${table}${candHtml}${nextHtml}</div>` +
    `</div>`
  );
}

function strategyRunSignature(rec) {
  const v = rec.verdict?.hit ? 'h' : rec.verdict ? 'm' : '-';
  return `${rec.turns.length}:${v}`;
}

function patchStrategyRunEl(el, rec, { isLive, isSelected }) {
  const m = rec.meta;
  if (!m) return;
  const { text: outcomeText, rowClass } = summarizeStrategyOutcomes(rec.turns);
  const totalMs = rec.turns.reduce((s, t) => s + (Number(t.ms) || 0), 0);
  const tokKnown = rec.turns.some((t) => t.tokens != null);
  const totalTok = tokKnown ? rec.turns.reduce((s, t) => s + (Number(t.tokens) || 0), 0) : null;
  const open = strategyRunExpanded.has(strategyRunKey(rec));
  el.className = `strategy-run ${rowClass}${isLive ? ' live' : ''}${isSelected ? ' selected' : ''}`;
  el.dataset.sig = strategyRunSignature(rec);
  const head = el.querySelector('.strategy-run-head');
  if (head) {
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    const o = head.querySelector('.strategy-run-outcome');
    if (o) o.textContent = outcomeText;
    const meta = head.querySelector('.strategy-run-meta');
    if (meta) {
      meta.textContent = `${rec.turns.length} turn${rec.turns.length === 1 ? '' : 's'} · ${totalMs}ms` +
        `${totalTok != null ? ` · ${totalTok} tok` : ''}`;
    }
    const chev = head.querySelector('.strategy-run-chev');
    if (chev) chev.textContent = open ? '▾' : '▸';
  }
  const body = el.querySelector('.strategy-run-body');
  if (body) {
    body.classList.toggle('open', open);
    let verdictLine = body.querySelector('.strategy-run-verdict');
    if (rec.verdict?.hit) {
      const v = rec.verdict;
      const html = `<div class="strategy-run-verdict hit">✓ ${esc(v.label || '')} · ${esc(clip(v.evidence, 100))}</div>`;
      if (verdictLine) verdictLine.outerHTML = html;
      else body.insertAdjacentHTML('afterbegin', html);
    } else if (rec.verdict) {
      const html = `<div class="strategy-run-verdict miss">✗ ${esc(rec.verdict.detail || 'held')}</div>`;
      if (verdictLine) verdictLine.outerHTML = html;
      else body.insertAdjacentHTML('afterbegin', html);
    } else if (verdictLine) verdictLine.remove();
    let tr = body.querySelector('.strategy-run-transcript');
    const trHtml = rec.turns.length
      ? renderStrategyTranscript(rec.turns)
      : 'No turns yet…';
    if (tr) {
      tr.innerHTML = trHtml;
      tr.classList.toggle('empty-run', !rec.turns.length);
    }
  }
}

function applyStrategyLogScroll(opts, wrap, wasAtBottom, prevScrollTop) {
  if (!wrap) return;
  if (opts.scrollToViewEp && !showCampaignSummary) {
    const node = $('#strategyLog')?.querySelector(`.strategy-run[data-ep="${viewEp}"]`);
    if (node) node.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    return;
  }
  if (opts.scrollLive && followLiveEpisode && wasAtBottom && !userPinnedInStrategyLog()) {
    wrap.scrollTop = wrap.scrollHeight;
    return;
  }
  wrap.scrollTop = prevScrollTop;
}

function syncStrategyRunsDom(opts = {}) {
  if (runMode !== 'campaign') return;
  const log = $('#strategyLog');
  const empty = $('#turnEmpty');
  if (!log) return;
  const wrap = getTurnLogWrap();
  const wasAtBottom = wrap ? isStreamAtBottom(wrap) : false;
  const prevScrollTop = opts.preserveScroll ? (opts.scrollTop ?? wrap?.scrollTop ?? 0) : (wrap?.scrollTop ?? 0);
  const runs = [...episodeArchive.keys()].sort((a, b) => a - b).map((ep) => episodeArchive.get(ep)).filter((r) => r?.meta);
  if (!runs.length) {
    log.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  const hits = runs.filter((r) => r.verdict?.hit || r.turns.some((t) => t.outcome === 'hit')).length;
  const statsText = `${runs.length} run${runs.length === 1 ? '' : 's'} · ${hits} hit${hits === 1 ? '' : 's'}`;
  let runsEl = log.querySelector('.strategy-runs');
  if (!runsEl) {
    log.innerHTML =
      `<header class="strategy-log-bar"><span class="strategy-log-title">Strategies</span>` +
      `<span class="strategy-log-stats">${statsText}</span></header>` +
      `<div class="strategy-runs"></div>`;
    runsEl = log.querySelector('.strategy-runs');
  } else {
    const stats = log.querySelector('.strategy-log-stats');
    if (stats) stats.textContent = statsText;
  }
  for (const rec of runs) {
    const key = strategyRunKey(rec);
    const sig = strategyRunSignature(rec);
    const isLive = rec.ep === currentLiveEp && followLiveEpisode;
    const isSelected = !showCampaignSummary && rec.ep === viewEp;
    let el = runsEl.querySelector(`[data-run-key="${key}"]`);
    if (!el) {
      runsEl.insertAdjacentHTML('beforeend', buildStrategyRunSection(rec, { isLive, isSelected }));
      el = runsEl.querySelector(`[data-run-key="${key}"]`);
      if (el) el.dataset.sig = sig;
    } else if (el.dataset.sig !== sig || el.classList.contains('live') !== isLive || el.classList.contains('selected') !== isSelected) {
      if (rec.ep === currentLiveEp) patchStrategyRunEl(el, rec, { isLive, isSelected });
      else {
        el.outerHTML = buildStrategyRunSection(rec, { isLive, isSelected });
      }
    } else if (rec.ep === currentLiveEp) {
      patchStrategyRunEl(el, rec, { isLive, isSelected });
    } else {
      el.classList.toggle('selected', isSelected);
      el.classList.toggle('live', isLive);
    }
  }
  applyStrategyLogScroll(opts, wrap, wasAtBottom, prevScrollTop);
}

function renderCampaignStrategyLog(opts = {}) {
  if (opts.forceRebuild) {
    const log = $('#strategyLog');
    if (log) log.innerHTML = '';
  }
  syncStrategyRunsDom(opts);
}

function renderCampaignView(opts = {}) {
  if (runMode !== 'campaign') return;
  const rec = episodeArchive.get(viewEp);
  const head = $('#episodeHead');
  if (!opts.skipHead && head) {
    if (showCampaignSummary && campaignSummaryLines.length) {
      head.classList.remove('hidden');
      head.innerHTML = buildCampaignSummaryHtml();
    } else if (rec?.meta) {
      head.classList.remove('hidden');
      head.innerHTML = buildEpisodeHeadHtml(rec);
    } else {
      head.innerHTML = viewEp ? `<div class="empty" style="padding:8px 0">Episode ${viewEp} — waiting for data…</div>` : '';
    }
  }
  updateEpisodeNav();
  setVerifyPaneVisible(false);
  renderCampaignStrategyLog(opts);
}

function showSummaryView() {
  showCampaignSummary = true;
  followLiveEpisode = false;
  const wrap = getTurnLogWrap();
  renderCampaignView({ preserveScroll: true, scrollTop: wrap?.scrollTop ?? 0 });
}

function setViewEpisode(ep, { followLive = false } = {}) {
  followLiveEpisode = followLive;
  viewEp = ep;
  showCampaignSummary = false;
  renderCampaignView({ scrollToViewEp: true });
}

function toggleStrategyRun(key) {
  const wrap = getTurnLogWrap();
  const scrollTop = wrap?.scrollTop ?? 0;
  if (strategyRunExpanded.has(key)) strategyRunExpanded.delete(key);
  else strategyRunExpanded.add(key);
  renderCampaignView({ preserveScroll: true, scrollTop, skipHead: true });
}

function initEpisodeNav() {
  const sel = $('#epSelect');
  const prev = $('#epPrev');
  const next = $('#epNext');
  const live = $('#epLive');
  if (!sel) return;
  sel.addEventListener('change', () => {
    if (sel.value === EPISODE_VIEW_SUMMARY) showSummaryView();
    else setViewEpisode(Number(sel.value), { followLive: false });
  });
  prev?.addEventListener('click', () => {
    const eps = [...episodeArchive.keys()].sort((a, b) => a - b);
    const idx = eps.indexOf(viewEp);
    if (idx > 0) setViewEpisode(eps[idx - 1], { followLive: false });
  });
  next?.addEventListener('click', () => {
    const eps = [...episodeArchive.keys()].sort((a, b) => a - b);
    const idx = eps.indexOf(viewEp);
    if (idx >= 0 && idx < eps.length - 1) setViewEpisode(eps[idx + 1], { followLive: false });
  });
  live?.addEventListener('click', () => {
    if (currentLiveEp) setViewEpisode(currentLiveEp, { followLive: true });
  });
}

function initStrategyLog() {
  const log = $('#strategyLog');
  if (!log || log.dataset.bound) return;
  log.dataset.bound = '1';
  log.addEventListener('click', (ev) => {
    const head = ev.target.closest('.strategy-run-head');
    if (!head) return;
    const sec = head.closest('.strategy-run');
    const key = sec?.dataset?.runKey;
    if (key) toggleStrategyRun(key);
  });
  log.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const head = ev.target.closest('.strategy-run-head');
    if (!head) return;
    ev.preventDefault();
    const key = head.closest('.strategy-run')?.dataset?.runKey;
    if (key) toggleStrategyRun(key);
  });
}

function setActiveStage(stage) {
  stage = normalizePipelineStage(stage);
  if (!stage) return;
  activeStage = stage;
  const stages = runMode === 'verify' ? VERIFY_STAGES : CAMPAIGN_STAGES;
  const cur = stages.indexOf(stage);
  if (cur < 0) return;
  $('#stageRail').querySelectorAll('.st').forEach((node) => {
    const name = node.dataset.stage;
    node.classList.remove('active', 'done', 'pending');
    const idx = stages.indexOf(name);
    if (name === stage) {
      node.classList.add('active');
      setStageIcon(node, 'active');
    } else if (idx >= 0 && idx < cur) {
      node.classList.add('done');
      setStageIcon(node, 'done');
    } else {
      node.classList.add('pending');
      setStageIcon(node, 'pending');
    }
  });
}

function planRowHtml(e) {
  const barW = 12;
  const filled = Math.round(Math.max(0, Math.min(1, e.bar)) * barW);
  const fmt = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(3) : '—');
  const math = e.unexplored
    ? `never tried → score = ∞ (explore this family once while it stays eligible)`
    : `winRate ${fmt(e.winRate)} (${e.wins}/${e.pulls}) + explore ${fmt(e.exploreTerm)}${e.exploreNote || ''} + orient ${fmt(e.orientBoost)}` +
      ` = score <b>${fmt(e.score)}</b> · totalPulls ${e.totalPulls} · C=${fmt(e.ucbC)} · bar ${Math.round(e.bar * 100)}% of max in top-4`;
  return (
    `<div class="plan-row${e.picked ? ' picked' : ''}">` +
    `<div>${e.rank}. ${e.picked ? '<span class="pick">PICK</span> ' : ''}<b>${esc(e.family)}</b> ` +
    `<span class="plan-bar" title="score relative to top-4 max">${'█'.repeat(filled)}${'░'.repeat(barW - filled)}</span></div>` +
    `<div class="plan-math">${math}</div></div>`
  );
}

function ingestCampaignEpisode(e) {
  currentLiveEp = e.ep;
  episodeArchive.set(e.ep, {
    ep: e.ep,
    meta: e,
    planLegend: null,
    plans: [],
    turns: [],
    verdict: null,
    rubric: null,
  });
  const pinned = userPinnedInStrategyLog();
  if (followLiveEpisode && !pinned && !showCampaignSummary) viewEp = e.ep;
  const wrap = getTurnLogWrap();
  const scrollOpts = (followLiveEpisode && !pinned)
    ? { scrollLive: true }
    : { preserveScroll: true, scrollTop: wrap?.scrollTop ?? 0 };
  const skipHead = pinned && viewEp !== e.ep && !showCampaignSummary;
  if (showCampaignSummary) {
    updateEpisodeNav();
    syncStrategyRunsDom(scrollOpts);
    return;
  }
  renderCampaignView({ ...scrollOpts, skipHead });
}

function campaignIngestRender() {
  const wrap = getTurnLogWrap();
  const pinned = userPinnedInStrategyLog();
  const scrollOpts = (followLiveEpisode && !pinned && viewEp === currentLiveEp)
    ? { scrollLive: true }
    : { preserveScroll: true, scrollTop: wrap?.scrollTop ?? 0 };
  const skipHead = showCampaignSummary || (viewEp !== currentLiveEp && pinned);
  if (showCampaignSummary) {
    syncStrategyRunsDom(scrollOpts);
    updateEpisodeNav();
    return;
  }
  renderCampaignView({ ...scrollOpts, skipHead: skipHead || viewEp !== currentLiveEp });
}

function ingestCampaignPlanLegend(e) {
  const rec = episodeArchive.get(currentLiveEp);
  if (!rec) return;
  rec.planLegend = e;
  campaignIngestRender();
}

function ingestCampaignPlan(e) {
  const rec = episodeArchive.get(currentLiveEp);
  if (!rec) return;
  rec.plans.push(e);
  campaignIngestRender();
}

function ingestCampaignTurn(e) {
  const rec = episodeArchive.get(currentLiveEp);
  if (!rec) return;
  rec.turns.push({ ...e, ep: currentLiveEp });
  campaignIngestRender();
}

function ingestCampaignVerdict(e) {
  const rec = episodeArchive.get(currentLiveEp);
  if (!rec) return;
  if (e.strategyId && rec.meta?.strategyId && e.strategyId !== rec.meta.strategyId) return;
  rec.verdict = e;
  campaignIngestRender();
}

function ingestCampaignRubric(e) {
  const rec = episodeArchive.get(currentLiveEp);
  if (!rec) return;
  rec.rubric = e;
  campaignIngestRender();
}

function addTurnRow(e) {
  $('#turnEmpty').style.display = 'none';
  const tbody = $('#turnBody');
  if (runMode === 'verify' && e.type === 'repro') {
    const tr = el('tr', (e.hit ? 'hit' : 'miss'));
    tr.innerHTML =
      `<td>${ts(e.t)}</td><td>${esc(e.id)}</td><td>${e.index}/${e.runs}</td>` +
      `<td class="outcome">${esc(e.outcome || (e.hit ? 'hit' : 'miss'))}</td><td>${e.hitsSoFar}</td><td>${e.ms ?? '—'}</td><td></td>`;
    tbody.appendChild(tr);
    scrollTurnLog();
    return;
  }
  if (e.type !== 'turn') return;
  ingestCampaignTurn(e);
  scrollTurnLog();
}

function scrollTurnLog() {
  const wrap = document.querySelector('#liveMain .table-wrap');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

const COMPACT_LOG_H_KEY = 'rcCompactLogH';
const COMPACT_LOG_H_DEFAULT = 200;
const COMPACT_LOG_H_MIN = 72;

function initCompactLogResize() {
  const pane = $('#pane-live');
  const splitter = $('#logSplitter');
  const log = $('#compactWrap');
  if (!pane || !splitter || !log) return;

  const applyHeight = (h) => {
    const px = Math.round(h);
    log.style.setProperty('--compact-log-h', `${px}px`);
    const body = log.querySelector('.compact-log-body');
    if (body) body.style.height = `${Math.max(COMPACT_LOG_H_MIN, px - 46)}px`;
    localStorage.setItem(COMPACT_LOG_H_KEY, String(px));
  };

  const saved = Number(localStorage.getItem(COMPACT_LOG_H_KEY));
  applyHeight(Number.isFinite(saved) && saved >= COMPACT_LOG_H_MIN ? saved : COMPACT_LOG_H_DEFAULT);

  const maxLogHeight = () => Math.max(COMPACT_LOG_H_MIN + 40, pane.clientHeight - 120);

  const syncSplitter = () => {
    splitter.classList.toggle('hidden', !log.open);
    if (log.open) {
      const h = parseFloat(getComputedStyle(log).getPropertyValue('--compact-log-h')) || COMPACT_LOG_H_DEFAULT;
      applyHeight(h);
    }
  };
  log.addEventListener('toggle', syncSplitter);
  syncSplitter();

  const endDrag = (onMove, onUp) => {
    splitter.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
  };

  const startDrag = (clientY) => {
    if (!log.open) return;
    splitter.classList.add('dragging');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    const startY = clientY;
    const startH = log.getBoundingClientRect().height;
    const onMove = (ev) => {
      const y = ev.clientY ?? ev.touches?.[0]?.clientY;
      if (y == null) return;
      if (ev.cancelable) ev.preventDefault();
      const h = Math.min(maxLogHeight(), Math.max(COMPACT_LOG_H_MIN, startH - (y - startY)));
      applyHeight(h);
    };
    const onUp = () => endDrag(onMove, onUp);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  };

  splitter.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startDrag(e.clientY);
  });
  splitter.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startDrag(e.touches[0].clientY);
  }, { passive: false });
  splitter.addEventListener('dblclick', () => applyHeight(COMPACT_LOG_H_DEFAULT));

  splitter.addEventListener('keydown', (e) => {
    if (!log.open) return;
    const step = e.shiftKey ? 24 : 8;
    const cur = log.getBoundingClientRect().height;
    if (e.key === 'ArrowUp') { e.preventDefault(); applyHeight(Math.min(maxLogHeight(), cur + step)); }
    if (e.key === 'ArrowDown') { e.preventDefault(); applyHeight(Math.max(COMPACT_LOG_H_MIN, cur - step)); }
    if (e.key === 'Home') { e.preventDefault(); applyHeight(maxLogHeight()); }
    if (e.key === 'End') { e.preventDefault(); applyHeight(COMPACT_LOG_H_MIN); }
  });
}

// ---------- tabs ----------
document.querySelectorAll('.tabs .tab').forEach((t) => t.onclick = () => {
  document.querySelectorAll('.tabs .tab').forEach((x) => x.classList.remove('active'));
  document.querySelectorAll('.pane').forEach((x) => x.classList.remove('active'));
  t.classList.add('active'); $('#pane-' + t.dataset.pane).classList.add('active');
  if (t.dataset.pane === 'findings') loadFindings();
  if (t.dataset.pane === 'reports') loadReport(currentAud);
  if (t.dataset.pane === 'promptfoo') loadPromptfoo();
  if (t.dataset.pane === 'artifacts') loadArtifacts();
});
let currentAud = 'developer';
document.querySelectorAll('.seg .tab').forEach((t) => t.onclick = () => {
  document.querySelectorAll('.seg .tab').forEach((x) => x.classList.remove('active'));
  t.classList.add('active'); currentAud = t.dataset.aud; loadReport(currentAud);
});

// ---------- SSE stream ----------
function getStreamEl() {
  return document.getElementById('stream');
}

/** If user scrolled up in the compact log, do not yank them back to the latest line. */
const STREAM_STICK_PX = 28;
const EPISODE_VIEW_SUMMARY = 'summary';

function isStreamAtBottom(stream) {
  return stream.scrollHeight - stream.scrollTop - stream.clientHeight <= STREAM_STICK_PX;
}

function appendStreamLine(div) {
  const stream = getStreamEl();
  if (!stream) return;
  const stick = isStreamAtBottom(stream);
  stream.appendChild(div);
  if (stick) stream.scrollTop = stream.scrollHeight;
}

function addEvent(e) {
  if (e.type === 'runStart') {
    const stream = getStreamEl();
    if (stream) stream.innerHTML = '';
    resetLiveUI(e.mode || 'campaign');
    setVerifyPaneVisible((e.mode || 'campaign') === 'verify');
    setRunning(true);
    if (e.mode === 'campaign') {
      if (e.archived) {
        appendStreamLine({ type: 'info', msg: `Archived Current (live) → archive/${e.archived}` });
      }
      const continuing = e.isNewCampaign === false
        || (e.isNewCampaign == null && e.campaignId && e.campaignId !== 'new');
      const railMsg = continuing ? campaignRunRailMessage(e.campaignId, e.campaignLabel) : null;
      if (railMsg) setStageRailMessage('info', railMsg);
      else setStageRailMessage(null);
    } else {
      setStageRailMessage(null);
    }
    if (e.archived) refreshVerifyCampaignSelect();
    return;
  }
  if (e.type === 'runEnd') {
    summaryCaptureActive = false;
    if (!e.stopped && !e.error) finishStageRail();
    else {
      $('#stageRail')?.querySelectorAll('.st.active').forEach((node) => {
        node.classList.remove('active');
        node.classList.add('pending');
        setStageIcon(node, 'pending');
      });
    }
    if (e.stopped) setStageRailMessage('warn', 'Run stopped by operator');
    else if (e.error) setStageRailMessage('error', String(e.error));
    else if (e.mode === 'campaign') setStageRailMessage(null);
    if (e.mode === 'campaign' && campaignSummaryLines.length && !e.stopped) {
      showCampaignSummary = true;
      followLiveEpisode = false;
    }
    setRunning(false);
    loadFindings();
    const prefer = (e.mode === 'campaign' && !e.stopped && !e.error) ? 'active' : undefined;
    refreshVerifyCampaignSelect(undefined, prefer).then(async () => {
      await syncStrategyCheckboxesToCampaign(selectedVerifyCampaignId());
    });
    if (e.mode === 'campaign') renderCampaignView({ preserveScroll: true, scrollTop: getTurnLogWrap()?.scrollTop ?? 0 });
    return;
  }
  if (e._replay && LIVE_ONLY.has(e.type)) return;
  if (e.type === 'stage') {
    if (e.stage === 'SUMMARY' && runMode === 'campaign') {
      summaryCaptureActive = true;
      campaignSummaryLines = [];
    }
    setActiveStage(e.stage);
  }
  if (e.type === 'phase') {
    if (e.name === 'SUMMARY' && runMode === 'campaign') {
      summaryCaptureActive = true;
      campaignSummaryLines = [];
    }
    if (e.name === 'VERIFY DONE') finishStageRail();
    else if (e.name) setActiveStage(e.name.split(' ')[0]);
  }
  if (runMode === 'campaign') {
    if (e.type === 'episode') ingestCampaignEpisode(e);
    else if (e.type === 'planLegend') ingestCampaignPlanLegend(e);
    else if (e.type === 'plan') ingestCampaignPlan(e);
    else if (e.type === 'verdict') ingestCampaignVerdict(e);
    else if (e.type === 'rubric') ingestCampaignRubric(e);
  }
  if (e.type === 'turn' || e.type === 'repro') addTurnRow(e);
  if (e.type === 'verifyBrief') renderVerifyBrief(e);
  if (summaryCaptureActive && e.type === 'info' && runMode === 'campaign') {
    campaignSummaryLines.push(e.msg);
  }

  const line = fmt(e);
  if (!line) return;
  const div = el('div', 'ev ' + line.cls, (e._replay ? '' : `<span class="ts">${ts(e.t)}</span>`) + line.html);
  appendStreamLine(div);
}
function fmt(e) {
  switch (e.type) {
    case 'phase':   return { cls: 'phase', html: esc(e.name) + (e.note ? ' · ' + esc(e.note) : '') };
    case 'recon':   return { cls: 'recon', html: 'recon  ' + esc(clip(e.msg, 160)) };
    case 'episode': return null;
    case 'plan':    return null;
    case 'turn':    return null;
    case 'repro':   return null;
    case 'verifyBrief': return null;
    case 'say':     return { cls: 'say', html: '→ you  ' + (e.badge ? `<span class="b">[${esc(e.badge)}]</span> ` : '') + esc(clip(e.text, 120)) };
    case 'reply':   return { cls: 'reply', html: '← tgt  ' + esc(clip(e.text, 120)) };
    case 'verdict': return e.hit ? { cls: 'verdict hit', html: `✓ HIT  ${esc(e.label)} (${esc(e.kind)}: ${esc(clip(e.evidence, 80))})` } : { cls: 'verdict miss', html: '✗ ' + esc(e.detail || 'held') };
    case 'rubric':  return { cls: 'rubric', html: `rubric ${e.agree ? 'agrees' : 'differs'} — ${esc(clip(e.note, 90))}` };
    case 'verify':  return { cls: 'verdict ' + (e.ok ? 'hit' : 'miss'), html: `${esc(e.id)}  repro ${esc(e.repro)}  ${esc(e.gate || '')}` };
    case 'score':   return { cls: 'score', html: `AIVSS ${esc(e.score)} ${esc(e.band)}  <span style="color:var(--mut)">${esc(e.vector)}</span>` };
    case 'promote': return { cls: 'promote', html: 'promoted ' + esc(e.path) };
    case 'report':  return { cls: 'report', html: 'report ' + esc(e.path) };
    case 'memory':  return { cls: 'memory', html: '· ' + esc(clip(e.msg, 150)) };
    case 'warn':    return { cls: 'warn', html: '⚠ ' + esc(e.msg) };
    case 'error':   return { cls: 'error', html: '✖ ' + esc(e.msg) };
    case 'info':    return { cls: 'info', html: esc(clip(e.msg, 160)) };
    case 'stage':   return null;
    default: return null;
  }
}
function connect() {
  const es = new EventSource('/api/stream');
  es.onopen = () => setBadge();
  es.onmessage = (m) => { try { addEvent(JSON.parse(m.data)); } catch {} };
  es.onerror = () => { $('#statusBadge').textContent = 'reconnecting…'; $('#statusBadge').className = 'badge idle'; };
}

// ---------- state / controls ----------
let running = false;
function setRunning(v) {
  running = v;
  $('#runBtn').disabled = v;
  $('#verifyBtn').disabled = v;
  $('#stopBtn').disabled = !v;
  setBadge();
}
function setBadge() { const b = $('#statusBadge'); b.textContent = running ? '● running' : '○ idle'; b.className = 'badge ' + (running ? 'live' : 'idle'); }

function renderStrategyCatalog(cat) {
  if (!cat) return;
  $('#metaTarget').textContent = `target: ${cat.targetId} · adapter: ${cat.adapter}`;
  const list = $('#strategyList');
  const strategies = cat.strategies || [];
  if (!strategies.length) {
    list.innerHTML = `<p class="strategy-empty" style="color:var(--mut);font-size:0.9rem;margin:0.35rem 0">${esc(cat.emptyMessage || 'No strategies available for this target yet.')}</p>`;
    return;
  }
  list.innerHTML = strategies.map((st) => `<div class="chk"><input type="checkbox" value="${st.id}" id="s_${st.id}"><label for="s_${st.id}" style="margin:0">${st.id} <span style="color:var(--mut)">${st.objective}</span></label></div>`).join('');
}

async function reloadCatalogForAdapter(adapter) {
  const cat = await fetch(`/api/catalog?adapter=${encodeURIComponent(adapter)}`).then((r) => r.json());
  renderStrategyCatalog(cat);
  return cat;
}

async function loadState() {
  const s = await fetch('/api/state').then((r) => r.json());
  const sel = $('#adapter'); sel.innerHTML = s.adapters.map((a) => `<option ${a === s.adapter ? 'selected' : ''}>${a}</option>`).join('');
  $('#metaBrains').textContent = 'brains: ' + Object.entries(s.brains).map(([k, v]) => `${k}=${v || 'code'}`).join(' ');
  renderStrategyCatalog(s);
  running = s.running; setRunning(s.running);
  updateCounts(s.counts);
  resetLiveUI('campaign');
  renderVerifyCampaignOptions(s.campaigns || []);
  campaignsCache = s.campaigns || [];
  await syncStrategyCheckboxesToCampaign(selectedVerifyCampaignId(), campaignsCache);
}
function updateCounts(c) { if (!c) return; $('#fCount').textContent = c.total ? `${c.confirmed}✓ / ${c.total}` : ''; }

$('#adapter').addEventListener('change', () => {
  reloadCatalogForAdapter($('#adapter').value).catch(() => {});
});

$('#saveCfg').onclick = async () => {
  const r = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    provider: $('#llmProvider').value, base: $('#llmBase').value, key: $('#llmKey').value, model: $('#llmModel').value,
    adapter: $('#adapter').value, targetUrl: $('#targetUrl').value, targetKey: $('#targetKey').value,
  }) }).then((r) => r.json());
  $('#llmKey').value = '';
  $('#metaBrains').textContent = 'brains: ' + Object.entries(r.brains).map(([k, v]) => `${k}=${v || 'code'}`).join(' ');
  await reloadCatalogForAdapter($('#adapter').value);
  flash('#saveCfg', 'Saved ✓');
};
$('#runBtn').onclick = async () => {
  const only = checkedStrategyIds();
  let campaign = selectedVerifyCampaignId();
  if (campaign !== 'new' && !strategySelectionMatchesCampaign()) campaign = 'new';
  const r = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    adapter: $('#adapter').value, episodes: Number($('#episodes').value) || 12, only,
    campaign,
  }) }).then((r) => r.json());
  if (r.error) alert(r.error);
  else {
    setRunning(true);
    const railMsg = campaign === 'new' ? null : campaignRunRailMessage(campaign);
    if (railMsg) setStageRailMessage('info', railMsg);
    if (r.archived) refreshVerifyCampaignSelect();
  }
};
$('#verifyCampaign')?.addEventListener('change', () => onCampaignWorkspaceChanged());
$('#strategyList')?.addEventListener('change', (e) => {
  if (e.target.matches('input[type=checkbox]')) onStrategyCheckboxChanged();
});
$('#verifyBtn').onclick = async () => {
  let campaign = selectedVerifyCampaignId();
  if (campaign === 'new') {
    alert('New campaign has nothing to verify — run a campaign first, or pick Current (live) / an archive.');
    return;
  }
  await refreshVerifyCampaignSelect(campaignsCache, campaign);
  if (selectedVerifyCampaignId() === 'new') {
    const sel = $('#verifyCampaign');
    if (sel && campaign !== 'new') sel.value = campaign;
  }
  campaign = selectedVerifyCampaignId();
  if (campaign === 'new') {
    alert('New campaign has nothing to verify — run a campaign first, or pick Current (live) / an archive.');
    return;
  }
  const plan = await loadVerifyPlanPreview();
  if (plan?.error) { alert(plan.error); return; }
  if (!plan?.findings?.length) {
    alert('No CANDIDATE findings in this workspace — run campaign to bank hits, or pick another workspace.');
    return;
  }
  if (plan) {
    resetLiveUI('verify');
    renderVerifyBrief(plan);
    setVerifyPaneVisible(true);
  }
  const r = await fetch('/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    adapter: $('#adapter').value, min: Number($('#reproMin').value) || 3, runs: 3, campaign,
  }) }).then((r) => r.json());
  if (r.error) alert(r.error);
  else setRunning(true);
};
$('#stopBtn').onclick = () => fetch('/api/stop', { method: 'POST' });
$('#reportBtn').onclick = async () => {
  const campaign = selectedVerifyCampaignId();
  if (campaign === 'new') {
    alert('Pick Current (live) or an archive to build reports — New campaign has no workspace yet.');
    return;
  }
  const r = await fetch('/api/report/build', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaign }),
  }).then((res) => res.json());
  if (r.error) { alert(r.error); return; }
  flash('#reportBtn', 'Built ✓');
  loadReport(currentAud);
  loadFindings();
};
function flash(sel, txt) { const b = $(sel); const o = b.textContent; b.textContent = txt; setTimeout(() => (b.textContent = o), 1200); }

async function loadFindings() {
  const { findings } = await fetch('/api/findings' + apiCampaignQuery()).then((r) => r.json());
  const c = $('#cards');
  updateCounts({ total: findings.length, confirmed: findings.filter((f) => f.status === 'CONFIRMED').length });
  if (!findings.length) { c.innerHTML = '<div class="empty">No findings yet — run a campaign, then verify.</div>'; return; }
  const order = { CONFIRMED: 0, CANDIDATE: 1, REJECTED: 2 };
  findings.sort((a, b) => (order[a.status] - order[b.status]) || ((b.aivss?.score || 0) - (a.aivss?.score || 0)));
  c.innerHTML = '';
  for (const f of findings) {
    const band = f.aivss?.band || '—', score = f.aivss?.score ?? '';
    const card = el('div', 'card');
    card.innerHTML =
      `<span class="sev ${band}">${score} ${band}</span>` +
      `<h4>${esc(f.title || f.id)}</h4><div class="id">${esc(f.id)} · ${esc(f.objective)}</div>` +
      `<div><span class="pill ${f.status}">${f.status}</span>` +
      (f.verification ? `<span class="pill">repro ${esc(f.verification.reproduced)}</span>` : '') +
      `<span class="pill">${esc(f.owaspLLM || '')}</span>` +
      (f.orchestrator ? `<span class="pill">${esc(f.orchestrator)}${f.converterChain?.length ? '+' + esc(f.converterChain.join('+')) : ''}</span>` : '') + `</div>` +
      (f.aivss ? `<div class="vec">${esc(f.aivss.vector)}</div>` : '') +
      `<div style="margin-top:6px;color:var(--dim);font-size:0.857rem">${esc(clip(f.evidence, 120))}</div>` +
      `<details><summary>transcript (${(f.transcript || []).length} turns)</summary><pre>${esc((f.transcript || []).map((t, i) => `${i + 1}. you: ${t.user}\n   tgt: ${clip(t.reply, 160)}`).join('\n'))}</pre></details>`;
    c.appendChild(card);
  }
}

async function loadReport(aud) {
  if (selectedVerifyCampaignId() === 'new') {
    $('#reportBody').innerHTML = '<div class="empty">Pick Current (live) or an archive in Campaign workspace to view reports.</div>';
    return;
  }
  const { md, error } = await fetch('/api/report' + apiCampaignQuery({ audience: aud })).then((r) => r.json());
  if (error) {
    $('#reportBody').innerHTML = `<div class="empty">${esc(error)}</div>`;
    return;
  }
  $('#reportBody').innerHTML = mdToHtml(md || '');
}
function mdToHtml(md) {
  const lines = md.split('\n'); let out = '', inTable = false, inList = false;
  const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    if (/^\|(.+)\|$/.test(l)) {
      const cells = l.slice(1, -1).split('|').map((c) => c.trim());
      if (/^[-: ]+$/.test(cells.join(''))) continue;
      if (!inTable) { out += '<table>'; inTable = true; out += '<tr>' + cells.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr>'; }
      else out += '<tr>' + cells.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>';
      continue;
    } else if (inTable) { out += '</table>'; inTable = false; }
    if (/^- /.test(l)) { if (!inList) { out += '<ul>'; inList = true; } out += `<li>${inline(l.slice(2))}</li>`; continue; }
    else if (inList) { out += '</ul>'; inList = false; }
    if (/^### /.test(l)) out += `<h3>${inline(l.slice(4))}</h3>`;
    else if (/^## /.test(l)) out += `<h2>${inline(l.slice(3))}</h2>`;
    else if (/^# /.test(l)) out += `<h1>${inline(l.slice(2))}</h1>`;
    else if (/^---$/.test(l)) out += '<hr>';
    else if (/^_.*_$/.test(l)) out += `<p style="color:var(--mut)">${inline(l.replace(/^_|_$/g, ''))}</p>`;
    else if (l.trim()) out += `<p>${inline(l)}</p>`;
  }
  if (inTable) out += '</table>'; if (inList) out += '</ul>';
  return out || '<div class="empty">No report yet.</div>';
}

async function loadArtifacts() {
  if (selectedVerifyCampaignId() === 'new') {
    $('#artifactList').innerHTML = '<div class="empty">Pick Current (live) or an archive to view promoted artifacts.</div>';
    return;
  }
  const campQ = apiCampaignQuery().slice(1);
  const { findings } = await fetch('/api/findings' + apiCampaignQuery()).then((r) => r.json());
  const confirmed = findings.filter((f) => f.status === 'CONFIRMED');
  const list = $('#artifactList');
  if (!confirmed.length) { list.innerHTML = '<div class="empty">Nothing promoted yet in this workspace — verify some findings first.</div>'; return; }
  list.innerHTML = '<h2>promptfoo regression cases</h2>' +
    confirmed.map((f) => `<p><code>regression/${esc(f.id)}.gen.yaml</code> — <a href="/api/artifact?${campQ}&amp;name=regression/${encodeURIComponent(f.id)}.gen.yaml" target="_blank">view</a> <span style="color:var(--mut)">(${f.aivss?.score} ${f.aivss?.band})</span></p>`).join('') +
    `<h2>generative red-team config</h2><p><code>redteam/redteam.yaml</code> — <a href="/api/artifact?${campQ}&amp;name=redteam/redteam.yaml" target="_blank">view</a></p>`;
}

const PF_URL = 'http://localhost:15500';

async function pfStatus() {
  const s = await fetch('/api/promptfoo/status').then((r) => r.json()).catch(() => ({ up: false }));
  const b = $('#pfStatus');
  if (s.spawnError) {
    b.textContent = '✖ spawn failed';
    b.className = 'badge idle';
    b.title = s.spawnError;
  } else if (s.up) {
    b.textContent = '● viewer up :15500';
    b.className = 'badge live';
    b.title = '';
  } else {
    b.textContent = '○ viewer not running';
    b.className = 'badge idle';
    b.title = 'Click Start — first launch may take 1–2 min while npx downloads promptfoo';
  }
  if (s.up) {
    const f = $('#pfFrame');
    if (f && f.src !== PF_URL + '/') f.src = PF_URL + '/';
  }
  return s.up;
}

async function waitForPromptfooViewer(maxMs = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (await pfStatus()) return true;
    await new Promise((r) => setTimeout(r, 2500));
  }
  return false;
}

$('#pfOpen').onclick = async () => {
  if (!(await pfStatus())) {
    await fetch('/api/promptfoo/view', { method: 'POST' });
    await waitForPromptfooViewer(120000);
  }
  window.open(PF_URL, '_blank', 'noopener');
};
$('#pfStart').onclick = async () => {
  flash('#pfStart', 'starting…');
  const r = await fetch('/api/promptfoo/view', { method: 'POST' }).then((res) => res.json()).catch(() => ({}));
  if (r.error) {
    alert(`Could not start promptfoo viewer: ${r.error}\n\nLog: ${r.log || 'campaign/regression/promptfoo-viewer.log'}\n\nOr in a terminal:\n  cd campaign/regression\n  npx -y promptfoo@latest view`);
    return;
  }
  const up = await waitForPromptfooViewer(120000);
  if (!up) {
    const st = await fetch('/api/promptfoo/status').then((res) => res.json()).catch(() => ({}));
    alert(
      'Viewer still not responding on http://localhost:15500.\n\n'
      + (st.spawnError ? `Error: ${st.spawnError}\n\n` : '')
      + `See ${st.log || 'campaign/regression/promptfoo-viewer.log'} for promptfoo stderr.\n`
      + 'If you saw cache errors, delete campaign/regression/.promptfoo-cache and try again.',
    );
  }
};
async function loadPromptfoo() {
  pfStatus();
  if (selectedVerifyCampaignId() === 'new') {
    $('#pfRegressions').innerHTML = '<div class="empty">Pick Current (live) or an archive for regressions in this workspace.</div>';
    return;
  }
  const { findings } = await fetch('/api/findings' + apiCampaignQuery()).then((r) => r.json());
  const confirmed = findings.filter((f) => f.status === 'CONFIRMED');
  const box = $('#pfRegressions');
  if (!confirmed.length) { box.innerHTML = '<div class="empty">No promoted regressions yet — verify some findings first.</div>'; return; }
  box.innerHTML = '<h4 style="margin:6px 0">Promoted regression tests</h4>' + confirmed.map((f) =>
    `<div class="card" style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
       <div style="flex:1"><code>${esc(f.id)}.gen.yaml</code> <span class="pill">${esc(f.objective)}</span> <span class="sev ${f.aivss?.band}" style="float:none">${f.aivss?.score || ''} ${f.aivss?.band || ''}</span></div>
       <span id="pf-res-${esc(f.id)}" style="font-family:var(--mono);font-size:0.857rem;color:var(--mut)">—</span>
       <button class="btn" style="width:auto;margin:0" onclick="runRegression('${esc(f.id)}')">Run ▶</button>
     </div>`).join('');
}
window.runRegression = async function (id) {
  const cell = document.getElementById('pf-res-' + id);
  if (cell) { cell.textContent = 'running…'; cell.style.color = 'var(--y)'; }
  const r = await fetch('/api/promptfoo/eval', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).then((r) => r.json());
  if (!cell) return;
  if (r.error) { cell.textContent = '✖ ' + r.error; cell.style.color = 'var(--r)'; return; }
  if (r.bug_live) { cell.textContent = `✗ ${r.failed} FAIL — bug live (caught)`; cell.style.color = 'var(--g)'; }
  else if (r.errors) { cell.textContent = `! ${r.errors} error — check target`; cell.style.color = 'var(--y)'; }
  else { cell.textContent = `✓ ${r.passed} pass — not reproducing`; cell.style.color = 'var(--dim)'; }
  pfStatus();
};

initDisplayScale();
initCompactLogResize();
initStrategyLog();
initEpisodeNav();
connect(); loadState();
