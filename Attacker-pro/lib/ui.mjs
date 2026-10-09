// ui.mjs — the "rich terminal". Zero deps, pure ANSI. Every pipeline step prints a line so a student can
// WATCH the agent think: recon, each plan decision (with the bandit's scores), each attack turn with its
// converter badges, the judge verdict (code vs rubric), memory writes, and a final findings + AIVSS table.
//
// It also doubles as the event bus: ui.emit(evt) both prints (unless --quiet / RC_QUIET) and forwards the
// event to any listener (the dashboard's SSE stream subscribes here), so the terminal and the web view show
// the EXACT same steps. Set RC_JSON=1 to print NDJSON instead of pretty lines (for piping).

const QUIET = process.env.RC_QUIET === '1';
const JSON_OUT = process.env.RC_JSON === '1';
const NO_COLOR = process.env.NO_COLOR === '1' || !process.stdout.isTTY && !process.env.RC_FORCE_COLOR;

const wrap = (code) => (s) => (NO_COLOR ? String(s) : `\x1b[${code}m${s}\x1b[0m`);
export const c = {
  g: wrap(32), r: wrap(31), y: wrap(33), b: wrap(36), mag: wrap(35), gray: wrap(90),
  dim: wrap(2), bold: wrap(1), inv: wrap(7),
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

const stamp = () => c.gray(new Date().toISOString().slice(11, 19));
const clip = (s, n = 108) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// Core: record + print one structured event. type drives the pretty renderer below.
export function emit(evt) {
  evt = { t: Date.now(), ...evt };
  for (const fn of listeners) { try { fn(evt); } catch { /* a dead listener must never break a campaign */ } }
  if (QUIET && evt.level !== 'error') return evt;
  if (JSON_OUT) { process.stdout.write(JSON.stringify(evt) + '\n'); return evt; }
  render(evt);
  return evt;
}

export function banner(title, sub) {
  if (QUIET || JSON_OUT) return;
  const w = 78, bar = '─'.repeat(w);
  console.log('\n' + c.b('┌' + bar + '┐'));
  console.log(c.b('│ ') + c.bold(title.padEnd(w - 2)) + c.b(' │'));
  if (sub) console.log(c.b('│ ') + c.dim(clip(sub, w - 2).padEnd(w - 2)) + c.b(' │'));
  console.log(c.b('└' + bar + '┘'));
}
export const rule = () => { if (!QUIET && !JSON_OUT) console.log(c.gray('  ' + '─'.repeat(76))); };

// tiny inline bar for a 0..1 value — used to show the planner's bandit scores
export function bar(v, width = 10) {
  const n = Math.max(0, Math.min(width, Math.round((v || 0) * width)));
  return c.b('█'.repeat(n)) + c.gray('░'.repeat(width - n));
}

function render(e) {
  switch (e.type) {
    case 'phase':   console.log('\n  ' + c.inv(c.bold(` ${e.name} `)) + (e.note ? '  ' + c.dim(e.note) : '')); break;
    case 'recon':   console.log(`  ${stamp()} ${c.mag('recon')}   ${e.msg}`); break;
    case 'episode': rule(); console.log(`  ${c.bold('episode ' + e.ep)}  ${c.dim('PICK')} ${c.bold(e.strategyId || '?')}  ${c.dim('family')} ${e.family}  ${c.dim('objective')} ${c.b(e.objective)}  ${c.dim('via')} ${c.y(e.orchestrator)}`);
                    if (e.pickNote) console.log(`  ${c.dim('       ')} ${e.pickNote}`);
                    if (e.plan) console.log(`  ${c.dim('plan   ')} ${e.plan}`); break;
    case 'planLegend':
      console.log(`  ${c.dim('UCB    ')} ${e.formula}`);
      console.log(`  ${c.dim('       ')} ${e.barHint}`); break;
    case 'plan':
      console.log(`  ${c.dim(e.picked ? 'PICK   ' : 'UCB    ')} ${e.rank}. ${e.family.padEnd(16)} ${bar(e.bar)} ${c.dim(`bar=${Math.round((e.bar || 0) * 100)}% of top-4 max`)}${e.picked ? c.g(' ← runs') : ''}`);
      if (e.unexplored) console.log(`  ${c.dim('       ')} never tried → score ∞`);
      else console.log(`  ${c.dim('       ')} winRate ${e.winRate} (${e.wins}/${e.pulls}) + explore ${e.exploreTerm} + orient ${e.orientBoost} = score ${e.score}  (totalPulls ${e.totalPulls}, C=${e.ucbC})`);
      break;
    case 'turn':    console.log(`    ${stamp()} ${c.dim('turn ' + e.turn)} ${e.source.padEnd(10)} ${e.outcome === 'hit' ? c.g('hit') : e.outcome === 'transport' ? c.r('transport') : c.y('held')} ${c.dim(String(e.ms || '-') + 'ms')} ${clip(e.user, 48)}`); break;
    case 'repro':   console.log(`  ${c.dim('repro  ')} ${String(e.id).padEnd(18)} ${e.index}/${e.runs}  ${e.outcome === 'hit' ? c.g('hit') : e.transport ? c.r('transport') : c.y('miss')}  hits ${e.hitsSoFar}  ${e.ms}ms`); break;
    case 'stage':   break;
    case 'say':     console.log(`    ${c.gray('→ you  ')} ${e.badge ? c.y('[' + e.badge + '] ') : ''}${clip(e.text, 96)}`); break;
    case 'reply':   console.log(`    ${c.gray('← tgt  ')} ${clip(e.text, 96)}`); break;
    case 'verdict': e.hit ? console.log(`  ${c.g('✓ HIT')}  ${c.bold(e.label)} ${c.dim('(' + e.kind + ': ' + clip(e.evidence, 60) + ')')}`)
                          : console.log(`  ${c.y('✗ held')} ${c.dim(e.detail || '')}`); break;
    case 'rubric':  console.log(`  ${c.dim('rubric ')} ${e.agree ? c.g('agrees') : c.y('differs')} ${c.dim('— ' + clip(e.note, 72))}`); break;
    case 'memory':  console.log(`  ${c.gray('· ' + e.msg)}`); break;
    case 'verify':  console.log(`  ${c.dim(e.id.padEnd(18))} repro ${e.ok ? c.g(e.repro) : c.r(e.repro)}  ${c.dim(e.gate || '')}`); break;
    case 'score':   console.log(`  ${c.dim('AIVSS  ')} ${e.band === 'Critical' || e.band === 'High' ? c.r(e.score + ' ' + e.band) : c.y(e.score + ' ' + e.band)} ${c.dim(e.vector)}`); break;
    case 'promote': console.log(`  ${c.g('promoted')} ${c.dim(e.path)}`); break;
    case 'report':  console.log(`  ${c.g('report ')} ${c.dim(e.path)}`); break;
    case 'info':    console.log(`  ${c.dim(e.msg)}`); break;
    case 'warn':    console.log(`  ${c.y('⚠ ' + e.msg)}`); break;
    case 'error':   console.log(`  ${c.r('✖ ' + e.msg)}`); break;
    default:        console.log(`  ${c.dim(JSON.stringify(e))}`);
  }
}

// a findings table for the end of a run / the verify step
export function findingsTable(findings) {
  if (QUIET || JSON_OUT) return;
  console.log('\n  ' + c.bold('findings'));
  console.log('  ' + c.dim('id'.padEnd(20) + 'objective'.padEnd(18) + 'repro'.padEnd(8) + 'verdict'.padEnd(12) + 'AIVSS'));
  for (const f of findings) {
    const badge = f.status === 'CONFIRMED' ? c.g('CONFIRMED  ') : f.status === 'REJECTED' ? c.r('REJECTED   ') : c.y('CANDIDATE  ');
    const sev = f.aivss ? `${f.aivss.score} ${f.aivss.band}` : (f.aivssHint || '');
    console.log('  ' + f.id.padEnd(20) + String(f.objective || f.goal || '').padEnd(18) +
      String(f.verification?.reproduced || '-').padEnd(8) + badge + c.dim(sev));
  }
}
