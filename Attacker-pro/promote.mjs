// promote.mjs — offline regeneration of promptfoo regression YAML from CONFIRMED findings (no verify, no live targets).
//   node promote.mjs
//   node promote.mjs --campaign active
//   node promote.mjs --campaign 2026-10-10-023441 --only RAG-DEV-CRED
// Does not modify finding JSON, reports, redteam config, or campaign metadata.

import './lib/env.mjs';
import { refreshRegressionArtifacts } from './lib/refresh-regression.mjs';
import * as mem from './lib/memory.mjs';
import { banner, c } from './lib/ui.mjs';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) return true;
  return v;
};
const campaign = flag('campaign') !== true ? (flag('campaign') || 'active') : 'active';
const only = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--campaign') {
    i++;
    continue;
  }
  if (argv[i] === '--only') {
    only.push(...String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean));
    continue;
  }
  if (!argv[i].startsWith('--')) only.push(argv[i]);
}

const label = campaign === 'active' ? 'Current (live)' : campaign;

banner('RedCell — PROMOTE (regression refresh)', `${label} · CONFIRMED only · offline`);

try {
  const { refreshed, paths } = refreshRegressionArtifacts({ campaign, only: only.length ? only : null });
  if (!refreshed.length) {
    console.log(c.y('\n  No CONFIRMED findings to refresh in this workspace.'));
    if (only.length) {
      console.log(c.dim('  (--only requires an existing CONFIRMED finding id.)\n'));
    } else {
      console.log(c.dim('  Run verify first, or pass --only <id> for a specific CONFIRMED finding.\n'));
    }
  } else {
    console.log(`\n  ${c.bold('refreshed:')} ${c.g(refreshed.length)} regression file(s) → ${c.dim(mem.paths.REGRESSION)}`);
    for (const p of paths) {
      console.log(c.dim(`    ${p.replace(process.cwd() + '/', '') || p}`));
    }
    console.log('');
  }
} catch (e) {
  console.error('\n  ' + c.r('fatal: ' + e.message) + '\n');
  process.exit(1);
}
