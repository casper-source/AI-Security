// memory.mjs — the engagement's memory, as plain files (auditable, diffable, cheap). Same idea as the AI
// Audit Service's per-engagement workspace: a strategy register (what pays off), a journal (what happened),
// a findings folder (candidates + confirmed/rejected), and a lessons log (dead ends, so we don't re-walk them).
//
//   campaign/
//     strategy-register.json   win/loss per family (the planner's brain)
//     session-journal.md       human-readable timeline of the campaign
//     lessons.jsonl            one line per dead end: "this framing didn't work"
//     findings/<ID>.json       a candidate finding (Day 5) → CONFIRMED/REJECTED (Day 6)
//     findings/rejected/<ID>.json
//     regression/<ID>.gen.yaml a promptfoo regression case (Day 6 promote)

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LAB = dirname(dirname(fileURLToPath(import.meta.url)));
export const DIR = process.env.CAMPAIGN_DIR || join(LAB, 'campaign');
const FINDINGS = join(DIR, 'findings');
const REJECTED = join(FINDINGS, 'rejected');
const REGRESSION = join(DIR, 'regression');

function ensure() { for (const d of [DIR, FINDINGS, REJECTED, REGRESSION]) if (!existsSync(d)) mkdirSync(d, { recursive: true }); }

const REG = () => join(DIR, 'strategy-register.json');
export function loadRegister() {
  ensure();
  try { return JSON.parse(readFileSync(REG(), 'utf8')); } catch { return { families: {}, createdAt: new Date().toISOString() }; }
}
export function saveRegister(reg) { ensure(); writeFileSync(REG(), JSON.stringify(reg, null, 2)); }

export function journal(line) {
  ensure();
  appendFileSync(join(DIR, 'session-journal.md'), `- ${new Date().toISOString()} — ${line}\n`);
}

export function lesson(obj) {
  ensure();
  appendFileSync(join(DIR, 'lessons.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...obj }) + '\n');
}

export function saveFinding(finding) {
  ensure();
  const dir = finding.status === 'REJECTED' ? REJECTED : FINDINGS;
  writeFileSync(join(dir, `${finding.id}.json`), JSON.stringify(finding, null, 2));
}

export function loadCandidates() {
  ensure();
  return readdirSync(FINDINGS)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(FINDINGS, f), 'utf8')));
}

export function saveRegression(id, yaml) {
  ensure();
  const p = join(REGRESSION, `${id}.gen.yaml`);
  writeFileSync(p, yaml);
  return p;
}

export const paths = { DIR, FINDINGS, REJECTED, REGRESSION };
