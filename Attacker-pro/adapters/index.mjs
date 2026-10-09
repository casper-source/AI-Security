// adapters/index.mjs — pick the target adapter, and enforce the Rules of Engagement on any network target.
//
// Adapter interface (every adapter returns this):
//   { info() → {kind,name,url,tools?}, health?() → {ok,model,hasKey}, newSession() → { id, say(text) → turn } }
//   turn = { user, reply, toolCalls[], retrieved[], findingsHint{}, traceId, sessionId }
//
// ROE: localhost/127.0.0.1 is always allowed (the cohort lab). ANY other host is REFUSED unless the operator
// sets ROE_AUTHORIZED=1 and lists the host in RC_TARGET_ALLOWLIST — so the same product serves a real,
// authorized engagement without ever being point-and-shoot. See rules-of-engagement.md.

import { create as mock } from './mock.mjs';
import { create as mercibank } from './mercibank.mjs';
import { create as openai } from './openai.mjs';
import { create as http } from './http.mjs';

export function assertRoe(url) {
  let host;
  try { host = new URL(url).hostname; } catch { throw new Error(`target URL is not a URL: ${url}`); }
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return;
  const allow = (process.env.RC_TARGET_ALLOWLIST || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (process.env.ROE_AUTHORIZED === '1' && allow.includes(host)) return;
  throw new Error(
    `REFUSING non-localhost target "${host}".\n` +
    `  RedCell attacks localhost by default. For an AUTHORIZED engagement set ROE_AUTHORIZED=1 and add the\n` +
    `  host to RC_TARGET_ALLOWLIST (comma-separated). See rules-of-engagement.md.`);
}

export function pickAdapter(name = process.env.RC_ADAPTER || 'mercibank', opts = {}) {
  switch (name) {
    case 'mock':      return mock(opts);
    case 'mercibank': return mercibank(opts);
    case 'openai':    return openai(opts);
    case 'http':      return http(opts);
    default: throw new Error(`unknown adapter "${name}" (use: mock | mercibank | openai | http)`);
  }
}

export const ADAPTERS = ['mock', 'mercibank', 'openai', 'http'];
