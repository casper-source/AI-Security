// report.mjs — assemble two audience-specific reports from CONFIRMED findings. Code owns the FACTS (repro,
// evidence, AIVSS, OWASP, the fix pattern); the report brain (brains.writeReport) only rewrites the prose if a
// model is set. Two audiences, deliberately different: the DEVELOPER report says exactly what to change in
// code; the STAKEHOLDER report says what it means for the business and how bad it is.

import * as brains from './brains.mjs';
import {
  formatOwaspLine,
  objectiveLabel,
  fixGuidance,
  plainImpactPhrase,
  stakeholderSeverityNote,
  regressionArtifactPath,
} from './report-content.mjs';

const sevRank = { Critical: 4, High: 3, Medium: 2, Low: 1, None: 0 };
const bySeverity = (fs) => [...fs].sort((a, b) => (sevRank[b.aivss?.band] || 0) - (sevRank[a.aivss?.band] || 0) || (b.aivss?.score || 0) - (a.aivss?.score || 0));

export async function developerReport(findings, { brain = false, campaignId } = {}) {
  const fs = bySeverity(findings.filter((f) => f.status === 'CONFIRMED'));
  const lines = [`# Developer report — RedCell findings`, ``, `_${new Date().toISOString().slice(0, 10)} · ${fs.length} confirmed finding(s). A finding is only here if it reproduced under the gate. Fixes are code-level — the guardrail-in-the-prompt is not the fix._`, ``];
  for (const f of fs) {
    const fix = fixGuidance(f);
    lines.push(`## ${f.id} — ${f.title}`);
    lines.push(`- **Severity:** ${f.aivss?.score} ${f.aivss?.band}  \`${f.aivss?.vector}\``);
    lines.push(`- **OWASP:** ${formatOwaspLine(f)}`);
    lines.push(`- **Reproduced:** ${f.verification?.reproduced} (bar ${f.verification?.bar}) · baseline ${f.verification?.baseline}`);
    lines.push(`- **Evidence:** ${f.evidence}`);
    lines.push(`- **Technique:** ${f.orchestrator}${f.converterChain?.length ? ' + ' + f.converterChain.join('+') : ''}`);
    lines.push(``, `**Repro (messages, in order):**`);
    (f.transcript || []).forEach((t, i) => lines.push(`  ${i + 1}. \`${String(t.user).replace(/\s+/g, ' ').slice(0, 160)}\``));
    let cause = fix.cause;
    let remedy = fix.fix;
    if (brain) {
      const prose = await brains.writeReport({
        audience: 'developer',
        facts: { id: f.id, objective: f.objective, evidence: f.evidence, transcript: (f.transcript || []).map((t) => t.user) },
      }).catch(() => null);
      if (prose) remedy = prose;
    }
    const regPath = regressionArtifactPath(f, campaignId);
    lines.push(``, `**Root cause:** ${cause}`, ``, `**Fix:** ${remedy}`, ``, `**Regression:** \`${regPath}\` (a FAIL means it is back).`, ``, `---`, ``);
  }
  if (!fs.length) lines.push(`_No confirmed findings yet. Run a campaign, then \`node verify.mjs\`._`);
  return lines.join('\n');
}

export async function stakeholderReport(findings, { brain = false, campaignId } = {}) {
  const fs = bySeverity(findings.filter((f) => f.status === 'CONFIRMED'));
  const counts = fs.reduce((m, f) => (m[f.aivss?.band] = (m[f.aivss?.band] || 0) + 1, m), {});
  const top = fs[0];
  const lines = [`# Executive summary — AI assistant security review`, ``,
    `_${new Date().toISOString().slice(0, 10)}_`, ``,
    `We tested the AI assistant the way an attacker would, then **reproduced** each issue before reporting it. We confirmed **${fs.length} issue(s)**: ` +
    Object.entries(counts).map(([b, n]) => `${n} ${b}`).join(', ') + '.', ''];
  if (top) {
    lines.push(`**Most serious:** ${top.title} — ${plainImpactPhrase(top)} (risk score **${top.aivss?.score}/10, ${top.aivss?.band}**). ` +
      `${stakeholderSeverityNote(top)}`, '');
  }
  lines.push(`**What this means:** each confirmed issue is a concrete, repeatable way a customer or outsider could cause harm today. ` +
    `**What we recommend:** fix the highest-scoring issues in the application code (not just the AI's instructions), and keep the automated tests we generated so a fix can be proven and a regression caught.`, '');
  lines.push(`| Issue | What an attacker gets | Risk |`, `|---|---|---|`);
  for (const f of fs) lines.push(`| ${f.title} | ${objectiveLabel(f)} | ${f.aivss?.score} ${f.aivss?.band} |`);
  if (brain && top) {
    const prose = await brains.writeReport({ audience: 'stakeholder', facts: { confirmed: fs.length, counts, top: top.title } }).catch(() => null);
    if (prose) lines.splice(4, 0, '', prose, '');
  }
  if (!fs.length) lines.push('', '_No confirmed findings yet._');
  return lines.join('\n');
}
