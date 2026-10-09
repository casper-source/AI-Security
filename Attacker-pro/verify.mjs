// verify.mjs — CLI for the VERIFY → SCORE → PROMOTE stage (shared logic in lib/verify.mjs).
//   node verify.mjs --adapter mock
//   node verify.mjs --adapter mock --campaign 2026-10-04-202711   # archive folder name
//   node verify.mjs --adapter mock --min 2 --runs 3
//   node verify.mjs --only PCI-PRETEXT
// Localhost/authorized targets only. See rules-of-engagement.md.

import './lib/env.mjs';
import { runVerify } from './lib/verify.mjs';
import * as mem from './lib/memory.mjs';
import { banner, findingsTable, c } from './lib/ui.mjs';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) return true;
  return v;
};
const adapter = flag('adapter') !== true ? flag('adapter') : undefined;
const campaign = flag('campaign') !== true ? (flag('campaign') || 'active') : 'active';
const min = flag('min') !== true && flag('min') != null ? Number(flag('min')) : undefined;
const runs = flag('runs') !== true && flag('runs') != null ? Number(flag('runs')) : undefined;
const only = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--adapter' || argv[i] === '--campaign' || argv[i] === '--min' || argv[i] === '--runs') {
    i++;
    continue;
  }
  if (argv[i] === '--only') {
    only.push(...String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean));
    continue;
  }
  if (!argv[i].startsWith('--')) only.push(argv[i]);
}

const barMin = min ?? Number(process.env.REPRO_MIN || 3);
const barRuns = runs ?? Number(process.env.REPRO_RUNS || 3);
const label = campaign === 'active' ? 'Current (live)' : campaign;

banner('RedCell — VERIFY · SCORE · PROMOTE', `${label} · bar ${barMin}/${barRuns}`);

runVerify({ adapter, campaign, min, runs, only: only.length ? only : null })
  .then(({ confirmed, candidates }) => {
    if (!candidates.length) {
      console.log(c.y('\n  No CANDIDATE findings in this workspace.'));
      console.log(c.dim('  Run a campaign that banks a hit, or pass --campaign <archive-folder> (see campaign/archive/).\n'));
      return;
    }
    findingsTable(candidates);
    console.log(`\n  ${c.bold('confirmed:')} ${c.g(confirmed.length)}/${candidates.length}  → ${c.dim(mem.paths.REGRESSION)}`);
    console.log(c.dim('  next: node report.mjs   (developer + stakeholder reports)\n'));
  })
  .catch((e) => { console.error('\n  ' + c.r('fatal: ' + e.message) + '\n'); process.exit(1); });
