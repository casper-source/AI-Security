// Report true attack success rate for a promptfoo red-team eval.
//
//   node --experimental-sqlite asr.js            # most recent eval
//   node --experimental-sqlite asr.js <eval-id>
//
// Errors (failure_reason = 2) are excluded from the ASR denominator rather than
// counted as passes or breaches. A plugin whose payloads were mostly blocked
// upstream is UNTESTED, not secure, so blocked counts are reported alongside.

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB = path.join(process.env.USERPROFILE || process.env.HOME, '.promptfoo', 'promptfoo.db');
const FR_ERROR = 2;

const db = new DatabaseSync(DB, { readOnly: true });

let evalId = process.argv[2];
if (!evalId) {
  const latest = db.prepare('select id, created_at, description from evals order by created_at desc limit 1').get();
  if (!latest) {
    console.error('No evals found in ' + DB);
    process.exit(1);
  }
  evalId = latest.id;
  console.log('eval: ' + evalId + '  (' + (latest.description || 'no description') + ')');
} else {
  console.log('eval: ' + evalId);
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

console.log('');
console.log('tests recorded      : ' + rows.length);
console.log('reached the model   : ' + reached);
console.log('errored / blocked   : ' + blocked + '  (excluded from ASR)');
console.log('breaches            : ' + breach);
console.log('TRUE ASR            : ' + pct(breach, reached));

const row = (name, v) =>
  name.padEnd(36) +
  String(v.reached).padStart(8) +
  String(v.breach).padStart(8) +
  pct(v.breach, v.reached).padStart(8) +
  String(v.blocked).padStart(9);

console.log('\n' + 'plugin'.padEnd(36) + 'reached'.padStart(8) + 'breach'.padStart(8) + 'ASR'.padStart(8) + 'blocked'.padStart(9));
console.log('-'.repeat(69));
Object.entries(byPlugin)
  .sort((a, b) => {
    const ar = a[1].reached ? a[1].breach / a[1].reached : -1;
    const br = b[1].reached ? b[1].breach / b[1].reached : -1;
    return br - ar || b[1].reached - a[1].reached;
  })
  .forEach(([k, v]) => console.log(row(k, v)));

console.log('\n' + 'strategy'.padEnd(36) + 'reached'.padStart(8) + 'breach'.padStart(8) + 'ASR'.padStart(8) + 'blocked'.padStart(9) + 'meanLat'.padStart(10));
console.log('-'.repeat(79));
Object.entries(byStrategy)
  .sort((a, b) => b[1].reached - a[1].reached)
  .forEach(([k, v]) => console.log(row(k, v) + ((v.lat / v.n / 1000).toFixed(0) + 's').padStart(10)));

const untested = Object.entries(byPlugin).filter(([, v]) => v.reached === 0 && v.blocked > 0);
if (untested.length) {
  console.log('\nUNTESTED (every payload errored/blocked upstream):');
  untested.forEach(([k, v]) => console.log('  ' + k + ' (' + v.blocked + ')'));
}

if (Object.keys(errSig).length) {
  console.log('\nerror signatures:');
  Object.entries(errSig)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .forEach(([k, v]) => console.log('  ' + String(v).padStart(4) + 'x  ' + k));
}
