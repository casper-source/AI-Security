// env.mjs — a tiny zero-dependency .env loader (import this FIRST so the other libs see your keys).
// A value already set in your shell wins over .env, so you can override one setting for a single run:
//   EPISODES=3 node attacker.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LAB = dirname(dirname(fileURLToPath(import.meta.url)));
try {
  const raw = readFileSync(join(LAB, '.env'), 'utf8');
  for (const l of raw.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(l);
    if (!m) continue;
    let v = m[2].trim();
    const q = v.length > 1 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")));
    v = q ? v.slice(1, -1) : v.replace(/\s+#.*$/, '').trim();
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
} catch { /* no .env — fine, defaults + shell env apply */ }
