// attack.mjs — run a RedCell campaign (the rich-terminal entry point).
//
//   node attack.mjs                      # default: adapter=mercibank, curated strategies
//   node attack.mjs --adapter mock       # offline, no key, in-process vulnerable target (great for a demo)
//   node attack.mjs --all                # run the full generated matrix (deep sweep)
//   node attack.mjs --only PCI-PRETEXT,excessive-agency   # a strategy id, family, or objective
//   EPISODES=6 node attack.mjs --adapter mock
//   node attack.mjs --fresh              # archive campaign/ → campaign/archive/<timestamp>/ then run
//
// Targets localhost by default; non-localhost needs ROE_AUTHORIZED=1 + allowlist. See rules-of-engagement.md.

import './lib/env.mjs';
import { runCampaign } from './lib/engine.mjs';
import { banner, c } from './lib/ui.mjs';

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(`--${name}`); return i === -1 ? undefined : (argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[i + 1]); };
const adapter = flag('adapter') && flag('adapter') !== true ? flag('adapter') : undefined;
const only = flag('only') && flag('only') !== true ? String(flag('only')).split(',').map((s) => s.trim()) : null;

banner('RedCell — advanced AI attacker agent', 'WAKE · ORIENT · PLAN · ATTACK · JUDGE · REINFORCE   (authorized lab only — see rules-of-engagement.md)');

runCampaign({ adapter, all: Boolean(flag('all')), only, episodes: flag('episodes'), fresh: Boolean(flag('fresh')) })
  .then(({ found }) => { console.log('\n  ' + (found.length ? c.g(`${found.length} candidate(s) banked.`) : c.y('no candidates this run.')) + c.dim('  Run: node verify.mjs\n')); })
  .catch((e) => { console.error('\n  ' + c.r('fatal: ' + e.message) + '\n'); process.exit(1); });
