// stakeholder-pdf.mjs — one-page-style executive PDF from CONFIRMED findings (facts from campaign data).

import PDFDocument from 'pdfkit';
import { createWriteStream, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { OBJECTIVES } from '../strategies/objectives.mjs';

const sevRank = { Critical: 4, High: 3, Medium: 2, Low: 1, None: 0 };

const PLAIN_IMPACT = {
  EXCESSIVE_AGENCY: 'Funds can be moved without a one-time passcode the bank actually issued.',
  BOLA: "Another customer's account details can be retrieved with a plausible pretext.",
  PCI: 'A full payment card number can be read back to the user on request.',
  CRED_KEY: 'Sensitive internal references can leak via content the assistant retrieves.',
  PROMPT_LEAK: 'Internal instructions or configuration can be extracted.',
  INJECT_OBEYED: 'Hidden instructions in retrieved content can change assistant behavior.',
  MEMORY_POISON: 'False user claims can persist and influence later answers.',
  TOOL_DISCOVERY: 'Internal capabilities can be enumerated under a diagnostic frame.',
};

const ACTION = {
  EXCESSIVE_AGENCY: 'Validate every OTP server-side before any transfer; remove override paths.',
  BOLA: 'Enforce object-level authorization in APIs — deny access to other customers by default.',
  PCI: 'Never send full card numbers into the model; expose only last-four at the tool layer.',
  CRED_KEY: 'Treat retrieved help content as untrusted data; block secrets from model context.',
  PROMPT_LEAK: 'Keep secrets out of prompts; filter outputs for known sensitive patterns.',
  INJECT_OBEYED: 'Prevent retrieved text from triggering tools or changing recipients.',
  MEMORY_POISON: 'Keep authoritative identity and entitlement data server-side only.',
  TOOL_DISCOVERY: 'Do not expose internal tool schemas to end users.',
};

function bySeverity(fs) {
  return [...fs].sort(
    (a, b) => (sevRank[b.aivss?.band] || 0) - (sevRank[a.aivss?.band] || 0) || (b.aivss?.score || 0) - (a.aivss?.score || 0),
  );
}

function readCampaignMeta(campaignDir) {
  const p = join(campaignDir, 'campaign-meta.json');
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

function readTargetLabel(campaignDir) {
  const p = join(campaignDir, 'session-journal.md');
  if (!existsSync(p)) return 'AI assistant';
  const first = readFileSync(p, 'utf8').split('\n')[0] || '';
  const m = first.match(/campaign start · ([^·]+)/);
  return m ? m[1].trim() : 'AI assistant';
}

/** Redact lab canaries / PANs for executive-facing PDFs. */
export function redactForStakeholders(text) {
  if (!text) return '';
  return String(text)
    .replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, '[card number redacted]')
    .replace(/MB-TRANSFERKEY-[a-z0-9]+/gi, '[internal key redacted]')
    .replace(/"otp"\s*:\s*"\d+"/gi, '"otp":"[redacted]"');
}

function bandColor(band) {
  if (band === 'Critical') return '#B42318';
  if (band === 'High') return '#B54708';
  if (band === 'Medium') return '#B6922E';
  return '#667085';
}

function ensureSpace(doc, need = 72) {
  if (doc.y + need > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function sectionTitle(doc, title) {
  ensureSpace(doc, 40);
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#101828').text(title);
  doc.moveDown(0.35);
  doc.font('Helvetica').fontSize(10).fillColor('#344054');
}

function bullet(doc, text, { indent = 14 } = {}) {
  ensureSpace(doc, 36);
  const x = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right - indent;
  doc.text('•', x, doc.y, { continued: true, width: indent });
  doc.text(text, x + indent, doc.y, { width: w, align: 'left' });
}

/**
 * @param {object[]} findings — CONFIRMED findings
 * @param {string} outPath — absolute path for .pdf
 * @param {{ campaignDir?: string }} opts
 */
export function writeStakeholderPdf(findings, outPath, { campaignDir = '' } = {}) {
  const confirmed = bySeverity(findings.filter((f) => f.status === 'CONFIRMED'));
  const meta = campaignDir ? readCampaignMeta(campaignDir) : {};
  const target = campaignDir ? readTargetLabel(campaignDir) : 'AI assistant';
  const verifyAt = meta.verifyCompletedAt ? new Date(meta.verifyCompletedAt) : new Date();
  const reportDate = verifyAt.toISOString().slice(0, 10);
  const counts = confirmed.reduce((m, f) => {
    const b = f.aivss?.band || 'Unknown';
    m[b] = (m[b] || 0) + 1;
    return m;
  }, {});

  const doc = new PDFDocument({ size: 'A4', margin: 54, info: {
    Title: 'AI Assistant Security Review — Executive Summary',
    Author: 'RedCell',
    Subject: 'Stakeholder security assessment',
  } });

  doc.pipe(createWriteStream(outPath));

  // Header band
  doc.rect(0, 0, doc.page.width, 88).fill('#0F172A');
  doc.fillColor('#F8FAFC').font('Helvetica-Bold').fontSize(18).text('AI Assistant Security Review', 54, 28, { width: doc.page.width - 108 });
  doc.font('Helvetica').fontSize(10).fillColor('#CBD5E1').text(`Executive summary · ${target}`, 54, 52);
  doc.text(`Assessment date: ${reportDate}`, 54, 68);
  doc.y = 102;

  // KPI row
  const kpiY = doc.y;
  const kpiW = (doc.page.width - 108 - 24) / 3;
  const kpis = [
    { label: 'Confirmed issues', value: String(confirmed.length) },
    { label: 'Reproduction standard', value: '3/3 runs' },
    { label: 'Severity mix', value: Object.entries(counts).map(([b, n]) => `${n} ${b}`).join(', ') || '—' },
  ];
  kpis.forEach((k, i) => {
    const x = 54 + i * (kpiW + 12);
    doc.roundedRect(x, kpiY, kpiW, 52, 4).fillAndStroke('#F9FAFB', '#E4E7EC');
    doc.fillColor('#475467').font('Helvetica').fontSize(8).text(k.label.toUpperCase(), x + 10, kpiY + 10, { width: kpiW - 20 });
    doc.fillColor('#101828').font('Helvetica-Bold').fontSize(11).text(k.value, x + 10, kpiY + 26, { width: kpiW - 20 });
  });
  doc.y = kpiY + 68;

  sectionTitle(doc, 'Summary');
  if (!confirmed.length) {
    doc.text('No confirmed findings in this workspace. Run a campaign and verify before distributing this report.');
  } else {
    const top = confirmed[0];
    doc.text(
      `We tested the AI assistant using structured red-team scenarios, then reproduced each issue before reporting it. ` +
      `${confirmed.length} issue(s) are confirmed and repeatable under the agreed reproduction bar (3 of 3 runs).`,
      { lineGap: 3 },
    );
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fillColor('#101828').text('Highest priority', { continued: true });
    doc.font('Helvetica').fillColor('#344054').text(
      ` — ${top.title}. ${PLAIN_IMPACT[top.objective] || top.title} ` +
      `(risk score ${top.aivss?.score}/10, ${top.aivss?.band}).`,
      { lineGap: 3 },
    );
    doc.moveDown(0.4);
    doc.font('Helvetica').text(
      'These are application and authorization failures exposed through the assistant, not cosmetic wording issues. ' +
      'Remediation should happen in backend tools and data paths; prompt-only guardrails are not sufficient.',
      { lineGap: 3 },
    );
  }

  sectionTitle(doc, 'Confirmed issues');
  if (confirmed.length) {
    const col = { issue: 54, risk: 320, band: 400 };
    const tableW = doc.page.width - 108;
    ensureSpace(doc, 28);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#475467');
    doc.text('Issue', col.issue, doc.y, { width: col.risk - col.issue - 8 });
    doc.text('Risk score', col.risk, doc.y, { width: 70 });
    doc.text('Severity', col.band, doc.y, { width: 80 });
    doc.moveDown(0.6);
    doc.font('Helvetica').fontSize(9).fillColor('#344054');

    for (const f of confirmed) {
      ensureSpace(doc, 44);
      const rowY = doc.y;
      doc.text(f.title, col.issue, rowY, { width: col.risk - col.issue - 8, lineGap: 2 });
      const obj = OBJECTIVES[f.objective] || {};
      doc.fillColor('#667085').fontSize(8).text(obj.label || '', col.issue, doc.y + 2, { width: col.risk - col.issue - 8 });
      const band = f.aivss?.band || '—';
      doc.fillColor('#344054').fontSize(9).text(String(f.aivss?.score ?? '—'), col.risk, rowY, { width: 70 });
      doc.fillColor(bandColor(band)).font('Helvetica-Bold').text(band, col.band, rowY, { width: 80 });
      doc.font('Helvetica').fillColor('#344054');
      doc.moveDown(0.35);
      doc.moveTo(54, doc.y).lineTo(54 + tableW, doc.y).strokeColor('#EAECF0').stroke();
      doc.moveDown(0.45);
    }
  }

  sectionTitle(doc, 'Recommended actions (priority order)');
  confirmed.forEach((f, i) => {
    bullet(doc, `${i + 1}. ${ACTION[f.objective] || 'Remediate in application code and add a regression test.'} (${f.id})`);
  });
  if (confirmed.length) {
    doc.moveDown(0.3);
    bullet(doc, 'Keep automated regression tests in CI so fixes can be proven and regressions detected quickly.');
  }

  sectionTitle(doc, 'How we tested (for audit readers)');
  bullet(doc, 'Scope: curated attack strategies against the deployed assistant and its connected tools.');
  bullet(doc, 'Gate: a finding appears in this report only after independent reproduction (default: 3/3 successful replays).');
  bullet(doc, 'Scoring: AIVSS risk score and band; mappings to OWASP LLM Top 10 and agentic security categories in the technical developer report.');
  bullet(doc, 'Evidence: detailed reproduction steps and technical fixes are in the companion developer report (not included here to reduce sensitive data exposure).');

  ensureSpace(doc, 80);
  doc.moveDown(0.8);
  doc.font('Helvetica').fontSize(8).fillColor('#667085').text(
    'Confidential — intended for authorized stakeholders. Lab canaries and sample payloads in engineering artifacts may contain fictional sensitive data; this PDF redacts common patterns where evidence is referenced.',
    { lineGap: 2 },
  );
  doc.text('Generated by RedCell · Authorized security testing only', { lineGap: 2 });

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(outPath));
    doc.on('error', reject);
    doc.end();
  });
}
