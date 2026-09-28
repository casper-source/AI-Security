// planner.mjs — the explore/exploit brain, as DETERMINISTIC CODE. The attacker LLM proposes wording;
// the PLANNER decides which family to spend the next attempt on. This is the "scripts own the math, the
// model proposes" rule from the AI Audit Service — so the agent's choices are auditable, not vibes.
//
// Algorithm: UCB1 (Upper Confidence Bound). For each attack family we track pulls (tries) and wins.
//   score(family) = winRate + C * sqrt( ln(totalPulls) / pulls )
// Untried families score Infinity, so we EXPLORE everything once, then EXPLOIT what pays off while still
// occasionally revisiting the rest. C (default √2) is the explore/exploit knob.

const C = Number(process.env.UCB_C || Math.SQRT2);

export function pickFamily(register, families) {
  const stats = register.families || {};
  const total = families.reduce((n, f) => n + (stats[f]?.pulls || 0), 0);
  let best = null, bestScore = -Infinity;
  for (const f of families) {
    const pulls = stats[f]?.pulls || 0;
    const wins = stats[f]?.wins || 0;
    const score = pulls === 0 ? Infinity : (wins / pulls) + C * Math.sqrt(Math.log(total || 1) / pulls);
    if (score > bestScore) { bestScore = score; best = f; }
  }
  return { family: best, score: bestScore };
}

// After an attempt, fold the result back in. Returns the updated register (caller persists it).
export function record(register, family, won) {
  register.families = register.families || {};
  const s = (register.families[family] ||= { pulls: 0, wins: 0 });
  s.pulls += 1;
  if (won) s.wins += 1;
  register.updatedAt = new Date().toISOString();
  return register;
}

// A small human-readable table of what the planner has learned so far.
export function summarize(register, families) {
  const stats = register.families || {};
  return families
    .map((f) => ({ family: f, pulls: stats[f]?.pulls || 0, wins: stats[f]?.wins || 0 }))
    .sort((a, b) => b.wins - a.wins || b.pulls - a.pulls);
}
