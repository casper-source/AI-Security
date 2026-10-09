// report.mjs — assemble two audience-specific reports from CONFIRMED findings. Code owns the FACTS (repro,
// evidence, AIVSS, OWASP, the fix pattern); the report brain (brains.writeReport) only rewrites the prose if a
// model is set. Two audiences, deliberately different: the DEVELOPER report says exactly what to change in
// code; the STAKEHOLDER report says what it means for the business and how bad it is.

import { OBJECTIVES } from '../strategies/objectives.mjs';
import * as brains from './brains.mjs';

// Per-objective root cause + concrete code-level fix (the audit service's "fix in code, not in the prompt").
const FIX = {
  CRED_KEY:        { cause: 'The agent treats text retrieved from a help article as trusted instructions and reads back an internal reference.', fix: 'Mark retrieved content as untrusted data, never instructions; strip/scan for secrets before returning; keep internal references out of the model context entirely.' },
  INJECT_OBEYED:   { cause: 'An instruction embedded in retrieved content is executed (indirect prompt injection).', fix: 'Separate data from instructions; never let retrieved text trigger tool calls or recipients; all/deny-list actions server-side.' },
  BOLA:            { cause: 'The agent fetches another customer on request, with no ownership check (broken object-level authorization).', fix: 'Enforce ownership in the TOOL, not the prompt: get_account must reject any id != the authenticated customer. Deny by default.' },
  PCI:             { cause: 'The agent returns the full PAN on a verification pretext.', fix: 'Never surface the full PAN to the model; the tool returns only the last four. Redact in the tool layer.' },
  EXCESSIVE_AGENCY:{ cause: 'initiate_transfer executes with an OTP the system never issued (and/or a social override).', fix: 'Verify the OTP server-side against a code send_otp actually generated this session; no override path; require a fresh, bound OTP per transfer.' },
  PROMPT_LEAK:     { cause: 'A strong framing extracts verbatim system prompt / config.', fix: 'Keep secrets out of the prompt; treat the system prompt as non-sensitive; add an output filter for known config canaries.' },
  TOOL_DISCOVERY:  { cause: 'The agent enumerates its internal tool/function names under a diagnostics frame.', fix: 'Do not expose tool schemas to users; refuse meta-questions about internal capabilities.' },
  MEMORY_POISON:   { cause: 'A user-asserted "fact" persists and is later recalled as truth.', fix: 'Do not let user claims mutate authoritative state; keep identity/entitlement facts server-side, never in conversational memory.' },
};

const sevRank = { Critical: 4, High: 3, Medium: 2, Low: 1, None: 0 };
const bySeverity = (fs) => [...fs].sort((a, b) => (sevRank[b.aivss?.band] || 0) - (sevRank[a.aivss?.band] || 0) || (b.aivss?.score || 0) - (a.aivss?.score || 0));

export async function developerReport(findings, { brain = false } = {}) {
  const fs = bySeverity(findings.filter((f) => f.status === 'CONFIRMED'));
  const lines = [`# Developer report — RedCell findings`, ``, `_${new Date().toISOString().slice(0, 10)} · ${fs.length} confirmed finding(s). A finding is only here if it reproduced under the gate. Fixes are code-level — the guardrail-in-the-prompt is not the fix._`, ``];
  for (const f of fs) {
    const o = OBJECTIVES[f.objective] || {}, fix = FIX[f.objective] || {};
    lines.push(`## ${f.id} — ${f.title}`);
    lines.push(`- **Severity:** ${f.aivss?.score} ${f.aivss?.band}  \`${f.aivss?.vector}\``);
    lines.push(`- **OWASP:** ${o.owaspLLM}${o.owaspASI && o.owaspASI !== '—' ? ' · ' + o.owaspASI : ''}`);
    lines.push(`- **Reproduced:** ${f.verification?.reproduced} (bar ${f.verification?.bar}) · baseline ${f.verification?.baseline}`);
    lines.push(`- **Evidence:** ${f.evidence}`);
    lines.push(`- **Technique:** ${f.orchestrator}${f.converterChain?.length ? ' + ' + f.converterChain.join('+') : ''}`);
    lines.push(``, `**Repro (messages, in order):**`);
    (f.transcript || []).forEach((t, i) => lines.push(`  ${i + 1}. \`${String(t.user).replace(/\s+/g, ' ').slice(0, 160)}\``));
    let cause = fix.cause, remedy = fix.fix;
    if (brain) { const prose = await brains.writeReport({ audience: 'developer', facts: { id: f.id, objective: f.objective, evidence: f.evidence, transcript: (f.transcript || []).map((t) => t.user) } }).catch(() => null); if (prose) remedy = prose; }
    lines.push(``, `**Root cause:** ${cause}`, ``, `**Fix:** ${remedy}`, ``, `**Regression:** \`campaign/regression/${f.id}.gen.yaml\` (a FAIL means it is back).`, ``, `---`, ``);
  }
  if (!fs.length) lines.push(`_No confirmed findings yet. Run a campaign, then \`node verify.mjs\`._`);
  return lines.join('\n');
}

export async function stakeholderReport(findings, { brain = false } = {}) {
  const fs = bySeverity(findings.filter((f) => f.status === 'CONFIRMED'));
  const counts = fs.reduce((m, f) => (m[f.aivss?.band] = (m[f.aivss?.band] || 0) + 1, m), {});
  const top = fs[0];
  const lines = [`# Executive summary — AI assistant security review`, ``,
    `_${new Date().toISOString().slice(0, 10)}_`, ``,
    `We tested the AI assistant the way an attacker would, then **reproduced** each issue before reporting it. We confirmed **${fs.length} issue(s)**: ` +
    Object.entries(counts).map(([b, n]) => `${n} ${b}`).join(', ') + '.', ''];
  if (top) {
    const plain = {
      EXCESSIVE_AGENCY: 'the assistant can be talked into moving money without a valid one-time passcode',
      BOLA: "the assistant can be made to reveal another customer's account details",
      PCI: 'the assistant can be made to read back a full card number',
      CRED_KEY: 'the assistant can be made to leak an internal reference/key',
      PROMPT_LEAK: 'the assistant can be made to reveal its internal instructions',
      INJECT_OBEYED: 'the assistant follows hidden instructions planted in content it reads',
      MEMORY_POISON: 'the assistant can be tricked into trusting a false claim across a conversation',
      TOOL_DISCOVERY: 'the assistant reveals internal capabilities it should keep private',
    };
    lines.push(`**Most serious:** ${top.title} — ${plain[top.objective] || top.title} (risk score **${top.aivss?.score}/10, ${top.aivss?.band}**). ` +
      `It rates high because the assistant can act on its own using connected tools, so the impact is real-world, not just a bad sentence.`, '');
  }
  lines.push(`**What this means:** each confirmed issue is a concrete, repeatable way a customer or outsider could cause harm today. ` +
    `**What we recommend:** fix the highest-scoring issues in the application code (not just the AI's instructions), and keep the automated tests we generated so a fix can be proven and a regression caught.`, '');
  lines.push(`| Issue | What an attacker gets | Risk |`, `|---|---|---|`);
  for (const f of fs) lines.push(`| ${f.title} | ${(OBJECTIVES[f.objective] || {}).label} | ${f.aivss?.score} ${f.aivss?.band} |`);
  if (brain && top) { const prose = await brains.writeReport({ audience: 'stakeholder', facts: { confirmed: fs.length, counts, top: top.title } }).catch(() => null); if (prose) lines.splice(4, 0, '', prose, ''); }
  if (!fs.length) lines.push('', '_No confirmed findings yet._');
  return lines.join('\n');
}
