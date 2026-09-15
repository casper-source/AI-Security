// Report true attack success rate for a promptfoo red-team eval.
//
//   node --experimental-sqlite scripts/asr.js            # most recent eval
//   node --experimental-sqlite scripts/asr.js <eval-id>
//
// Errors (failure_reason = 2) are excluded from the ASR denominator rather than
// counted as passes or breaches. A plugin whose payloads were mostly blocked
// upstream is UNTESTED, not secure, so blocked counts are reported alongside.
//
// Writes reports/<eval-id>.json and reports/<eval-id>.txt so ASR snapshots live
// in the repo instead of only in ~/.promptfoo/promptfoo.db.

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REPORTS = path.join(ROOT, 'reports');
const CONFIG_DIR =
  process.env.PROMPTFOO_CONFIG_DIR ||
  path.join(process.env.USERPROFILE || process.env.HOME, '.promptfoo');
const DB = path.join(CONFIG_DIR, 'promptfoo.db');
const FR_ERROR = 2;

const db = new DatabaseSync(DB, { readOnly: true });

let evalId = process.argv[2];
let evalMeta = null;
if (!evalId) {
  evalMeta = db.prepare('select id, created_at, description from evals order by created_at desc limit 1').get();
  if (!evalMeta) {
    console.error('No evals found in ' + DB);
    process.exit(1);
  }
  evalId = evalMeta.id;
} else {
  evalMeta = db.prepare('select id, created_at, description from evals where id=?').get(evalId) || {
    id: evalId,
    created_at: null,
    description: null,
  };
}

const rows = db.prepare('select success, failure_reason, latency_ms, test_case, error from eval_results where eval_id=?').all(evalId);
if (!rows.length) {
  console.error('No results for eval ' + evalId);
  process.exit(1);
}

const byPlugin = {};
const byStrategy = {};
const errSig = {};
let breach = 0, defended = 0, blocked = 0;

for (const r of rows) {
  let meta = {};
  try { meta = JSON.parse(r.test_case)?.metadata || {}; } catch {}
  const plugin = meta.pluginId || 'unknown';
  const strategy = meta.strategyId || 'basic';

  byPlugin[plugin] ||= { reached: 0, breach: 0, blocked: 0 };
  byStrategy[strategy] ||= { reached: 0, breach: 0, blocked: 0, lat: 0, n: 0 };
  byStrategy[strategy].lat += Number(r.latency_ms) || 0;
  byStrategy[strategy].n++;

  if (Number(r.failure_reason) === FR_ERROR) {
    blocked++;
    byPlugin[plugin].blocked++;
    byStrategy[strategy].blocked++;
    const sig = String(r.error || 'unknown')
      .replace(/\s+/g, ' ')
      .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
      .slice(0, 100);
    errSig[sig] = (errSig[sig] || 0) + 1;
    continue;
  }

  byPlugin[plugin].reached++;
  byStrategy[strategy].reached++;
  if (r.success === 1 || r.success === true) {
    defended++;
  } else {
    breach++;
    byPlugin[plugin].breach++;
    byStrategy[strategy].breach++;
  }
}

const reached = breach + defended;
const pct = (n, d) => (d ? (n / d * 100).toFixed(1) + '%' : 'n/a');
const asr = reached ? breach / reached : null;

const pluginList = Object.entries(byPlugin).sort((a, b) => {
  const ar = a[1].reached ? a[1].breach / a[1].reached : -1;
  const br = b[1].reached ? b[1].breach / b[1].reached : -1;
  return br - ar || b[1].reached - a[1].reached;
});
const strategyList = Object.entries(byStrategy).sort((a, b) => b[1].reached - a[1].reached);
const untested = pluginList.filter(([, v]) => v.reached === 0 && v.blocked > 0);
const errorSignatures = Object.entries(errSig)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8);

const lines = [];
const out = (s = '') => {
  lines.push(s);
  console.log(s);
};

const row = (name, v) =>
  name.padEnd(36) +
  String(v.reached).padStart(8) +
  String(v.breach).padStart(8) +
  pct(v.breach, v.reached).padStart(8) +
  String(v.blocked).padStart(9);

out('eval: ' + evalId + '  (' + (evalMeta.description || 'no description') + ')');
out('');
out('tests recorded      : ' + rows.length);
out('reached the model   : ' + reached);
out('errored / blocked   : ' + blocked + '  (excluded from ASR)');
out('breaches            : ' + breach);
out('TRUE ASR            : ' + pct(breach, reached));

out('');
out('plugin'.padEnd(36) + 'reached'.padStart(8) + 'breach'.padStart(8) + 'ASR'.padStart(8) + 'blocked'.padStart(9));
out('-'.repeat(69));
pluginList.forEach(([k, v]) => out(row(k, v)));

out('');
out('strategy'.padEnd(36) + 'reached'.padStart(8) + 'breach'.padStart(8) + 'ASR'.padStart(8) + 'blocked'.padStart(9) + 'meanLat'.padStart(10));
out('-'.repeat(79));
strategyList.forEach(([k, v]) => out(row(k, v) + ((v.lat / v.n / 1000).toFixed(0) + 's').padStart(10)));

if (untested.length) {
  out('');
  out('UNTESTED (every payload errored/blocked upstream):');
  untested.forEach(([k, v]) => out('  ' + k + ' (' + v.blocked + ')'));
}

if (errorSignatures.length) {
  out('');
  out('error signatures:');
  errorSignatures.forEach(([k, v]) => out('  ' + String(v).padStart(4) + 'x  ' + k));
}

const snapshot = {
  evalId,
  description: evalMeta.description || null,
  createdAt: evalMeta.created_at || null,
  db: DB,
  recorded: rows.length,
  reached,
  blocked,
  defended,
  breaches: breach,
  asr,
  asrPercent: pct(breach, reached),
  plugins: pluginList.map(([id, v]) => ({
    id,
    reached: v.reached,
    breach: v.breach,
    blocked: v.blocked,
    asr: v.reached ? v.breach / v.reached : null,
    untested: v.reached === 0 && v.blocked > 0,
  })),
  strategies: strategyList.map(([id, v]) => ({
    id,
    reached: v.reached,
    breach: v.breach,
    blocked: v.blocked,
    asr: v.reached ? v.breach / v.reached : null,
    meanLatencySeconds: v.n ? v.lat / v.n / 1000 : null,
  })),
  untested: untested.map(([id, v]) => ({ id, blocked: v.blocked })),
  errorSignatures: errorSignatures.map(([signature, count]) => ({ count, signature })),
};

const safeId = String(evalId).replace(/[<>:"/\\|?*]/g, '-');
fs.mkdirSync(REPORTS, { recursive: true });
const jsonPath = path.join(REPORTS, safeId + '.json');
const txtPath = path.join(REPORTS, safeId + '.txt');
fs.writeFileSync(jsonPath, JSON.stringify(snapshot, null, 2) + '\n');
fs.writeFileSync(txtPath, lines.join('\n') + '\n');
console.log('\nwrote ' + path.relative(ROOT, jsonPath));
console.log('wrote ' + path.relative(ROOT, txtPath));
