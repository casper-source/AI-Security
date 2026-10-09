// redteam.mjs — emit a promptfoo generative RED-TEAM config scoped to the target's confirmed surface, and
// optionally run it. This is the "start a red-team run" step: RedCell found + confirmed specific issues; the
// generative red team keeps hunting around them with promptfoo's own attacker.
//   node redteam.mjs           # write campaign/redteam/redteam.yaml
//   node redteam.mjs --run     # also run it: npx -y promptfoo@latest redteam run -c <file>  (needs MERCI_TARGET_KEY)

import './lib/env.mjs';
import { spawnSync } from 'node:child_process';
import { toRedteamYaml } from './lib/promote.mjs';
import * as mem from './lib/memory.mjs';
import { pickAdapter } from './adapters/index.mjs';
import { banner, c } from './lib/ui.mjs';

const info = pickAdapter().info();
const url = /^https?:/.test(info.url) ? info.url : (process.env.MERCI_TARGET_URL || 'http://localhost:8080/v1/chat/completions');
const confirmed = mem.loadAllFindings().filter((f) => f.status === 'CONFIRMED');

banner('RedCell — RED-TEAM', `scoped to ${confirmed.length} confirmed objective(s)`);
if (!confirmed.length) { console.log(c.y('\n  No confirmed findings — run attack.mjs + verify.mjs first (the config scopes to what is proven).\n')); process.exit(0); }

const p = mem.saveRedteam(toRedteamYaml(confirmed, url));
console.log('  ' + c.g('wrote ') + c.dim(p.replace(process.cwd() + '/', '')));

if (process.argv.includes('--run')) {
  console.log(c.dim('\n  running: npx -y promptfoo@latest redteam run (first fetch downloads promptfoo)...\n'));
  const r = spawnSync('npx', ['-y', 'promptfoo@latest', 'redteam', 'run', '-c', p], { stdio: 'inherit', env: process.env });
  process.exit(r.status || 0);
} else {
  console.log(c.dim('\n  run it:  export MERCI_TARGET_KEY=merci-lab-key && node redteam.mjs --run\n'));
}
