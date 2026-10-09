// export-stakeholder-pdf.mjs — write campaign/report/stakeholder.pdf from confirmed findings.
//   node export-stakeholder-pdf.mjs
//   node export-stakeholder-pdf.mjs --campaign 2026-10-04-232504

import './lib/env.mjs';
import { join } from 'node:path';
import * as mem from './lib/memory.mjs';
import { writeStakeholderPdf } from './lib/stakeholder-pdf.mjs';
import { banner, c } from './lib/ui.mjs';

const argv = process.argv.slice(2);
const campaign = (() => {
  const i = argv.indexOf('--campaign');
  return i === -1 ? 'active' : argv[i + 1];
})();

async function main() {
  const label = campaign === 'active' ? 'Current (live)' : campaign;
  banner('RedCell — Stakeholder PDF', `${label} · executive summary export`);

  await mem.withCampaignRootAsync(campaign, async () => {
    const findings = mem.loadAllFindings();
    const confirmed = findings.filter((f) => f.status === 'CONFIRMED');
    if (!confirmed.length) {
      console.log(c.y('\n  No confirmed findings in this workspace. Run attack + verify first.\n'));
      process.exit(1);
    }
    const out = join(mem.paths.REPORT, 'stakeholder.pdf');
    await writeStakeholderPdf(findings, out, { campaignDir: mem.paths.DIR });
    console.log(`\n  ${c.bold('Wrote')} ${c.dim(out.replace(process.cwd() + '/', ''))} · ${confirmed.length} finding(s)\n`);
  });
}

main().catch((e) => { console.error('\n  ' + c.r('fatal: ' + e.message) + '\n'); process.exit(1); });
