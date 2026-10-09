// Loaded before tests (--import). Isolates campaign data and keeps CI quiet/fast.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'redcell-test-'));
process.env.CAMPAIGN_DIR = root;
process.env.RC_QUIET = '1';
process.env.RC_FRESH_REGISTER = '1';
process.env.ATTACK_DELAY_MS = '0';
process.env.EPISODES = '12';

process.on('exit', () => {
  try { rmSync(root, { recursive: true, force: true }); } catch { /* windows file lock */ }
});
