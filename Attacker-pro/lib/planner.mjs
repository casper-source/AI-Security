// planner.mjs — the explore/exploit brain, as DETERMINISTIC CODE. The strategist LLM (brains.strategize)
// proposes HOW to attack within a family; this PLANNER decides WHICH family earns the next attempt. "Scripts
// own the math, the model proposes" — so the agent's spend is auditable, not vibes.
//
// Algorithm: UCB1 + optional ORIENT boost from profile.prioritize (objectives recon flagged first).
// score(family) = winRate + C * sqrt( ln(totalPulls) / pulls ) + orientBoost. Untried families score
// Infinity (explore each once), tie-broken by orientBoost.

export const UCB_C = Number(process.env.UCB_C || Math.SQRT2);
const ORIENT_BOOST = Number(process.env.ORIENT_UCB_BOOST || 0.35);

export function orientBoost(profile, allStrategies, family) {
  const pr = profile?.prioritize || [];
  if (!pr.length) return 0;
  const objs = allStrategies.filter((s) => s.family === family).map((s) => s.objective);
  const best = objs.reduce((n, o) => Math.min(n, pr.indexOf(o) === -1 ? 99 : pr.indexOf(o)), 99);
  if (best >= 99) return 0;
  return ORIENT_BOOST * (pr.length - best) / Math.max(1, pr.length);
}

export function scores(register, families, { profile, allStrategies } = {}) {
  const stats = register.families || {};
  const total = families.reduce((n, f) => n + (stats[f]?.pulls || 0), 0) || 1;
  const rows = families.map((f) => {
    const pulls = stats[f]?.pulls || 0, wins = stats[f]?.wins || 0;
    const boost = profile && allStrategies ? orientBoost(profile, allStrategies, f) : 0;
    const winRate = pulls ? wins / pulls : 0;
    const exploreTerm = pulls === 0 ? Infinity : UCB_C * Math.sqrt(Math.log(total) / pulls);
    const ucb = pulls === 0 ? Infinity : winRate + exploreTerm;
    const score = ucb === Infinity ? Infinity : ucb + boost;
    return {
      family: f, pulls, wins, totalPulls: total, ucbC: UCB_C,
      winRate, exploreTerm, ucb, orientBoost: boost, score,
    };
  });
  rows.sort((a, b) => {
    if (b.score !== a.score) {
      if (a.score === Infinity && b.score === Infinity) return b.orientBoost - a.orientBoost;
      return b.score - a.score;
    }
    return b.orientBoost - a.orientBoost;
  });
  return rows;
}

export function pickFamily(register, families, opts = {}) {
  const ranked = scores(register, families, opts);
  return { family: ranked[0]?.family, ranked };
}

export function record(register, family, won) {
  register.families = register.families || {};
  const s = (register.families[family] ||= { pulls: 0, wins: 0 });
  s.pulls += 1; if (won) s.wins += 1;
  register.updatedAt = new Date().toISOString();
  return register;
}

export function summarize(register, families) {
  const stats = register.families || {};
  return families.map((f) => ({ family: f, pulls: stats[f]?.pulls || 0, wins: stats[f]?.wins || 0 }))
    .sort((a, b) => b.wins - a.wins || b.pulls - a.pulls);
}
