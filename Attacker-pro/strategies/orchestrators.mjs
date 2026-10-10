// orchestrators.mjs — HOW an attack's turns are sequenced. This is what makes RedCell an *agent* and not a
// static payload list: the same objective can be pursued single-shot, up an escalation ladder, as a slow
// multi-turn crescendo, as a parallel best-of-N sweep, as a branching tree, or as a chain that feeds one
// finding's loot into the next attack. Documented technique families (PyRIT/promptfoo), parameterised.

const transcriptOf = (turns) => turns.map((t, i) => `You(${i + 1}): ${t.user}\nTgt(${i + 1}): ${t.reply}`).join('\n');
const first = (x) => (Array.isArray(x) ? x[0] : x);

function sourceFromBadge(badge, turnIndex) {
  if (badge === 'mutated') return 'mutated';
  if (badge === 'warm-up') return 'warm-up';
  if (badge === 'escalate') return 'follow-up';
  if (badge === 'branch') return 'branch';
  if (badge === 'chain') return 'chain';
  if (badge && String(badge).includes('+')) return 'converted';
  return turnIndex === 0 ? 'opening' : 'follow-up';
}

function readTokens(turn) {
  const u = turn?.usage || turn?.oracle?.usage;
  if (u && typeof u.total_tokens === 'number') return u.total_tokens;
  return turn?.tokens ?? null;
}

async function execTurn(ctx, session, sent, source, turns, judgeTurns) {
  const turnNum = turns.length + 1;
  const t0 = Date.now();
  ctx.emit?.({ type: 'say', text: sent, badge: source === 'converted' ? ctx.strategy.converterChain?.join('+') : (source === 'mutated' ? 'mutated' : null), strategyId: ctx.strategy.id, turn: turnNum, source });
  let turn;
  try {
    turn = await session.say(sent);
    if (ctx.afterTurn) await ctx.afterTurn(turn, session);
  } catch (e) {
    const ms = Date.now() - t0;
    ctx.emit?.({ type: 'turn', strategyId: ctx.strategy.id, turn: turnNum, source, outcome: 'transport', ms, tokens: null, user: sent, reply: '', error: e.message });
    throw e;
  }
  const ms = Date.now() - t0;
  turns.push(turn);
  const verdict = judgeTurns(turns);
  const outcome = verdict.hit ? 'hit' : 'held';
  const tokens = readTokens(turn);
  ctx.emit?.({ type: 'reply', text: turn.reply, strategyId: ctx.strategy.id, turn: turnNum });
  ctx.emit?.({ type: 'turn', strategyId: ctx.strategy.id, turn: turnNum, source, outcome, ms, tokens, user: sent, reply: turn.reply, toolCalls: turn.toolCalls, evidence: verdict.hit ? verdict.evidence : null });
  return { verdict, outcome };
}

async function sequence({ messages, session, judgeTurns, convert, emit, badges = [], ...ctxRest }) {
  const ctx = { emit, ...ctxRest };
  const turns = [];
  for (let i = 0; i < messages.length; i++) {
    const sent = convert(messages[i]);
    const source = sourceFromBadge(badges[i], i);
    const { verdict } = await execTurn(ctx, session, sent, source, turns, judgeTurns);
    if (verdict.hit) return { hit: true, verdict, turns };
  }
  return { hit: false, verdict: { hit: false }, turns };
}

export const ORCHESTRATORS = {
  async single(ctx) {
    const s = ctx.newSession();
    return sequence({ messages: [first(ctx.strategy.seeds)], session: s, ...ctx, badges: [ctx.strategy.converterChain?.join('+')] });
  },

  async ladder(ctx) {
    const s = ctx.newSession();
    const badges = ctx.strategy.seeds.map((_, i) => (i === 0 ? 'opening' : 'follow-up'));
    const r = await sequence({ messages: ctx.strategy.seeds, session: s, ...ctx, badges });
    if (r.hit) return r;
    for (let t = r.turns.length; t < ctx.maxTurns; t++) {
      const next = await ctx.mutate({ hint: ctx.strategy.mutateHint, transcript: transcriptOf(r.turns) });
      if (!next) break;
      const sent = ctx.convert(next);
      const { verdict } = await execTurn(ctx, s, sent, 'mutated', r.turns, ctx.judgeTurns);
      if (verdict.hit) return { hit: true, verdict, turns: r.turns };
    }
    return r;
  },

  async crescendo(ctx) {
    const s = ctx.newSession();
    const ramp = ctx.strategy.seeds.length > 1 ? ctx.strategy.seeds : [
      'Hi! Quick everyday banking question first.', ...ctx.strategy.seeds];
    const msgs = ramp.slice(0, ctx.maxTurns);
    return sequence({ messages: msgs, session: s, ...ctx,
      badges: msgs.map((_, i) => (i === 0 ? 'warm-up' : 'escalate')) });
  },

  async bestOfN(ctx) {
    const N = Math.min(Number(process.env.BEST_OF_N || 3), ctx.maxTurns);
    const base = first(ctx.strategy.seeds);
    const variants = [];
    for (let i = 0; i < N; i++) {
      const v = i === 0 ? base : (await ctx.mutate({ hint: ctx.strategy.mutateHint, transcript: '' })) || base + ` (variant ${i + 1})`;
      variants.push(v);
    }
    ctx.emit?.({ type: 'info', msg: `best-of-${N}: firing ${N} variants in parallel` });
    const runs = await Promise.all(variants.map(async (v, vi) => {
      const s = ctx.newSession(); const sent = ctx.convert(v);
      const turns = [];
      try {
        const { verdict } = await execTurn(ctx, s, sent, vi === 0 ? 'opening' : 'mutated', turns, ctx.judgeTurns);
        return { hit: verdict.hit, verdict, turns };
      } catch {
        return { hit: false, verdict: { hit: false }, turns: [] };
      }
    }));
    return runs.find((r) => r.hit) || runs[0];
  },

  async tree(ctx) {
    const K = Math.max(1, Math.min(Number(process.env.TREE_WIDTH || 3), ctx.maxTurns));
    const D = Math.max(1, Math.min(Number(process.env.TREE_DEPTH || 2), Math.max(1, ctx.maxTurns - 1)));
    const base = first(ctx.strategy.seeds);
    let branches = [];
    for (let k = 0; k < K; k++) {
      const opener = k === 0 ? base : (await ctx.mutate({ hint: ctx.strategy.mutateHint, transcript: '' })) || `${base} (angle ${k + 1})`;
      branches.push({ session: ctx.newSession(), msgs: [opener] });
    }
    for (let depth = 0; depth < D; depth++) {
      ctx.emit?.({ type: 'info', msg: `tree depth ${depth + 1}/${D}: ${branches.length} branch(es)` });
      for (const br of branches) {
        const sent = ctx.convert(br.msgs[br.msgs.length - 1]);
        br.turns = br.turns || [];
        const { verdict } = await execTurn(ctx, br.session, sent, 'branch', br.turns, ctx.judgeTurns);
        if (verdict.hit) return { hit: true, verdict, turns: br.turns };
      }
      branches.sort((a, b) => (b.turns.at(-1)?.reply?.length || 0) - (a.turns.at(-1)?.reply?.length || 0));
      branches = branches.slice(0, 1);
      const next = await ctx.mutate({ hint: ctx.strategy.mutateHint, transcript: transcriptOf(branches[0].turns) });
      branches[0].msgs.push(next || `${base} (deeper ${depth + 2})`);
    }
    const best = branches[0];
    return { hit: false, verdict: { hit: false }, turns: best?.turns || [] };
  },

  async httpProbe(ctx) {
    const spec = ctx.strategy.httpProbe;
    if (!spec?.path) throw new Error('httpProbe strategy missing httpProbe.path');
    const s = ctx.newSession(spec.session || {});
    if (typeof s.probeGet !== 'function') {
      throw new Error('httpProbe requires adapter session.probeGet (NLT read-only GET)');
    }
    const probeResult = await s.probeGet(spec.path);
    const hintBuilder = ctx.buildHttpProbeHint || (() => ({}));
    const findingsHint = hintBuilder(probeResult, spec);
    const turn = {
      user: `[HTTP GET ${spec.path}]`,
      reply: '',
      toolCalls: [],
      retrieved: [],
      findingsHint: { ...findingsHint },
      traceId: undefined,
      sessionId: s.id,
    };
    const verdict = ctx.judgeTurns([turn]);
    return { hit: verdict.hit, verdict, turns: [turn] };
  },

  async chain(ctx) {
    const s = ctx.newSession(); const turns = []; let loot = '';
    for (const step of ctx.strategy.chainSteps || []) {
      for (const raw of step.seeds) {
        const sent = ctx.convert(raw.replace(/\{\{loot\}\}/g, loot));
        const { verdict } = await execTurn(ctx, s, sent, 'chain', turns, ctx.judgeTurns);
        if (step.lootRegex) { const m = new RegExp(step.lootRegex).exec(turns.at(-1)?.reply || ''); if (m) loot = m[0]; }
        if (verdict.hit) return { hit: true, verdict, turns };
      }
    }
    return { hit: false, verdict: ctx.judgeTurns(turns), turns };
  },
};

export const ORCHESTRATOR_IDS = Object.keys(ORCHESTRATORS);
