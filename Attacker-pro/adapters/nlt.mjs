// adapters/nlt.mjs — NodeLine Tech (NLT) Flask chat target: session cookie auth, POST /api/chat,
// conversation_id continuity. Localhost-only by default (ROE). Outcome metadata is for logging/tests;
// lib/judge.mjs scores reply + findingsHint; session.getTicketState() is read-only REST verification.
//
// POST /api/chat 429 policy (lab): up to CHAT_429_MAX_ATTEMPTS POSTs when the server returns 429 only.
// NLT has no idempotency key — a 429 may still mean the message was stored. Retries trade duplicate
// delivery risk against transient throttling during local campaigns; other HTTP statuses are not retried.

import { assertRoe } from './index.mjs';
import { normalizeTicketGetResult } from '../lib/verification-signals.mjs';

/** Substrings from NLT validate_and_sanitize_input / AI security (app.py) — not all HTTP 400s. */
const SECURITY_REFUSAL_MARKERS = [
  'violates our usage guidelines',
  'Input contains potentially dangerous content',
  'Restricted Output Detected',
];

const APP_ERROR_REPLY = '';

/** Total POST /api/chat attempts when every response is 429 (initial try + retries). */
export const CHAT_429_MAX_ATTEMPTS = 3;

const RETRY_AFTER_DEFAULT_MS = 2200;
const RETRY_AFTER_MIN_MS = 200;
const RETRY_AFTER_MAX_MS = 60_000;
const RETRY_AFTER_JITTER_MS = 200;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Map Retry-After (seconds or HTTP-date) to a bounded delay in ms (includes small jitter).
 * @param {string|null|undefined} header
 * @param {number} [nowMs]
 */
export function retryAfterDelayMs(header, nowMs = Date.now()) {
  if (header == null || String(header).trim() === '') {
    return RETRY_AFTER_DEFAULT_MS;
  }
  const raw = String(header).trim();
  const asNum = Number(raw);
  if (Number.isFinite(asNum)) {
    if (asNum < 0) return RETRY_AFTER_DEFAULT_MS;
    const ms = asNum * 1000 + RETRY_AFTER_JITTER_MS;
    if (ms > RETRY_AFTER_MAX_MS) return RETRY_AFTER_MAX_MS;
    return Math.max(RETRY_AFTER_MIN_MS, ms);
  }
  const dateMs = Date.parse(raw);
  if (Number.isFinite(dateMs)) {
    let ms = dateMs - nowMs + RETRY_AFTER_JITTER_MS;
    if (ms < RETRY_AFTER_MIN_MS) ms = RETRY_AFTER_MIN_MS;
    if (ms > RETRY_AFTER_MAX_MS) return RETRY_AFTER_MAX_MS;
    return ms;
  }
  return RETRY_AFTER_DEFAULT_MS;
}

/** Thrown for auth_failure / app_error so orchestrators record transport, not judge "held". */
export class NltChatOutcomeError extends Error {
  /**
   * @param {'auth_failure'|'app_error'} outcome
   * @param {number} httpStatus
   * @param {string} [detail]
   */
  constructor(outcome, httpStatus, detail = '') {
    const suffix = detail ? `: ${detail}` : '';
    super(`NLT chat ${outcome} (HTTP ${httpStatus})${suffix}`);
    this.name = 'NltChatOutcomeError';
    this.outcome = outcome;
    this.httpStatus = httpStatus;
  }
}

function responseOk(r) {
  if (typeof r.ok === 'boolean') return r.ok;
  return r.status >= 200 && r.status < 300;
}

function mergeCookies(jar, response) {
  const raw = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
  for (const line of raw) {
    if (!line) continue;
    const pair = line.split(';')[0].trim();
    if (!pair) continue;
    const name = pair.split('=')[0];
    jar.cookies = jar.cookies.filter((c) => !c.startsWith(`${name}=`));
    jar.cookies.push(pair);
  }
}

function cookieHeader(jar) {
  return jar.cookies.length ? jar.cookies.join('; ') : undefined;
}

function isSecurityRefusalMessage(msg) {
  if (!msg || typeof msg !== 'string') return false;
  const lower = msg.toLowerCase();
  return SECURITY_REFUSAL_MARKERS.some((m) => lower.includes(m.toLowerCase()));
}

function classifyChatResult(httpStatus, json, parseFailed) {
  if (parseFailed) return { outcome: 'transport', reply: APP_ERROR_REPLY, httpStatus };
  if (httpStatus === 429) return { outcome: 'rate_limit', reply: APP_ERROR_REPLY, httpStatus };
  if (httpStatus === 401 || httpStatus === 403) {
    return { outcome: 'auth_failure', reply: APP_ERROR_REPLY, httpStatus };
  }
  if (httpStatus === 400) {
    const err = json?.error || json?.message || '';
    if (isSecurityRefusalMessage(err)) {
      return { outcome: 'security_refusal', reply: String(err), httpStatus };
    }
    return { outcome: 'app_error', reply: APP_ERROR_REPLY, httpStatus };
  }
  if (httpStatus >= 500) {
    return { outcome: 'app_error', reply: APP_ERROR_REPLY, httpStatus };
  }
  if (httpStatus >= 300 && httpStatus < 400) {
    return { outcome: 'transport', reply: APP_ERROR_REPLY, httpStatus };
  }
  if (httpStatus === 200 && json?.success === true) {
    return {
      outcome: 'chat',
      reply: String(json.response ?? ''),
      httpStatus,
      sessionId: json.conversation_id,
    };
  }
  if (httpStatus === 200 && json?.success === false) {
    return { outcome: 'app_error', reply: APP_ERROR_REPLY, httpStatus };
  }
  if (!httpStatus || httpStatus < 200) {
    return { outcome: 'transport', reply: APP_ERROR_REPLY, httpStatus: httpStatus || 0 };
  }
  return { outcome: 'app_error', reply: APP_ERROR_REPLY, httpStatus };
}

function throwIfTerminalChatOutcome(result) {
  if (result.outcome === 'auth_failure') {
    throw new NltChatOutcomeError('auth_failure', result.httpStatus);
  }
  if (result.outcome === 'app_error') {
    throw new NltChatOutcomeError('app_error', result.httpStatus);
  }
}

export function create(opts = {}) {
  const baseUrl = (opts.baseUrl || process.env.NLT_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
  assertRoe(baseUrl);

  const defaultEmail = opts.email ?? process.env.NLT_EMAIL ?? '';
  const defaultPassword = opts.password ?? process.env.NLT_PASSWORD ?? '';
  const delay = typeof opts.delay === 'function' ? opts.delay : (ms) => sleep(ms);

  async function roeFetch(pathOrUrl, init, jar) {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${baseUrl}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
    assertRoe(url);
    const headers = { ...init.headers };
    const ck = cookieHeader(jar);
    if (ck) headers.Cookie = ck;

    const response = await fetch(url, { ...init, headers, redirect: 'manual' });

    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get('location');
      if (loc) assertRoe(new URL(loc, url).href);
      throw new Error(`NLT redirect (${response.status}) not followed`);
    }

    mergeCookies(jar, response);
    return response;
  }

  async function login(jar, email, password) {
    const r = await roeFetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }, jar);
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch {
      throw new Error(`NLT login returned non-JSON (${r.status}): ${text.slice(0, 160)}`);
    }
    if (r.status === 401 || r.status === 403) {
      throw new Error(`NLT login auth failure (${r.status}): ${json?.error || text.slice(0, 120)}`);
    }
    if (!responseOk(r)) {
      throw new Error(`NLT login failed (${r.status}): ${json?.error || text.slice(0, 160)}`);
    }
    if (json.success === false) {
      throw new Error(`NLT login rejected: ${json?.error || 'unknown'}`);
    }
    return json;
  }

  async function waitAfter429(response) {
    await delay(retryAfterDelayMs(response.headers.get('retry-after')));
  }

  async function postChat(jar, message, conversationId) {
    for (let attempt = 0; attempt < CHAT_429_MAX_ATTEMPTS; attempt++) {
      const r = await roeFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          ...(conversationId ? { conversation_id: conversationId } : {}),
        }),
      }, jar);

      if (r.status === 429) {
        if (attempt + 1 >= CHAT_429_MAX_ATTEMPTS) break;
        await waitAfter429(r);
        continue;
      }

      const text = await r.text();
      let json = null;
      let parseFailed = false;
      try { json = JSON.parse(text); } catch { parseFailed = true; }

      const classified = classifyChatResult(r.status, json, parseFailed);
      if (classified.outcome === 'transport' && parseFailed) {
        throw new Error(`NLT chat returned non-JSON (${r.status}): ${text.slice(0, 160)}`);
      }
      if (classified.outcome === 'rate_limit') {
        if (attempt + 1 >= CHAT_429_MAX_ATTEMPTS) break;
        await waitAfter429(r);
        continue;
      }

      throwIfTerminalChatOutcome(classified);
      return classified;
    }
    throw new Error('NLT chat stayed rate-limited — slow down (raise ATTACK_DELAY_MS)');
  }

  async function probeGetPath(jar, relativePath) {
    const path = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
    const r = await roeFetch(path, { method: 'GET' }, jar);
    if (r.status >= 300 && r.status < 400) {
      throw new Error(`NLT GET redirect (${r.status}) not followed`);
    }
    const text = await r.text();
    let json = null;
    let parseFailed = false;
    try { json = JSON.parse(text); } catch { parseFailed = true; }
    if (parseFailed) {
      throw new Error(`NLT GET returned non-JSON (${r.status}): ${text.slice(0, 160)}`);
    }
    const ok = r.status >= 200 && r.status < 300 && json?.success !== false;
    let access = 'ok';
    if (r.status === 401) access = 'unauthenticated';
    else if (r.status === 403) access = 'denied';
    else if (r.status === 404) access = 'not_found';
    else if (!ok) access = 'error';
    return { ok, httpStatus: r.status, json, access, parseFailed: false };
  }

  async function getTicketByNumber(jar, ticketNumber) {
    const path = `/api/tickets/${encodeURIComponent(String(ticketNumber).trim())}`;
    const r = await roeFetch(path, { method: 'GET' }, jar);
    if (r.status >= 300 && r.status < 400) {
      throw new Error(`NLT ticket GET redirect (${r.status}) not followed`);
    }
    const text = await r.text();
    let json = null;
    let parseFailed = false;
    try { json = JSON.parse(text); } catch { parseFailed = true; }
    if (parseFailed && r.status >= 500) {
      return normalizeTicketGetResult(r.status, null, true);
    }
    if (parseFailed) {
      throw new Error(`NLT ticket GET returned non-JSON (${r.status}): ${text.slice(0, 160)}`);
    }
    return normalizeTicketGetResult(r.status, json, false);
  }

  function newSession(sessionOpts = {}) {
    const jar = { cookies: [] };
    let conversationId;
    let loginPromise;

    const email = sessionOpts.email ?? defaultEmail;
    const password = sessionOpts.password ?? defaultPassword;

    function ensureLogin() {
      if (!loginPromise) {
        loginPromise = login(jar, email, password);
      }
      return loginPromise;
    }

    async function say(userText) {
      await ensureLogin();
      const result = await postChat(jar, userText, conversationId);
      if (result.sessionId) conversationId = result.sessionId;

      if (result.outcome === 'transport') {
        throw new Error(`NLT chat transport error (HTTP ${result.httpStatus})`);
      }

      return {
        user: userText,
        reply: result.reply,
        toolCalls: [],
        retrieved: [],
        findingsHint: {},
        traceId: undefined,
        sessionId: conversationId,
        meta: {
          outcome: result.outcome,
          httpStatus: result.httpStatus,
        },
      };
    }

    async function getTicketState(ticketNumber) {
      await ensureLogin();
      return getTicketByNumber(jar, ticketNumber);
    }

    async function probeGet(relativePath) {
      await ensureLogin();
      return probeGetPath(jar, relativePath);
    }

    return {
      get id() { return conversationId; },
      say,
      getTicketState,
      probeGet,
    };
  }

  return {
    info: () => ({ kind: 'nlt', name: 'NodeLine Tech (HTTP)', url: `${baseUrl}/api/chat` }),
    async health() {
      const r = await roeFetch('/api/health', { method: 'GET' }, { cookies: [] });
      if (!responseOk(r)) throw new Error(`NLT health ${r.status}`);
      return r.json();
    },
    newSession,
  };
}
