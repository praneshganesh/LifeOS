/**
 * Production guards for the chat proxy — no OpenAI spend from drive-by traffic.
 */

export function parseOriginList(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed === '*') return null;
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Native apps often omit Origin — allow those. Restrict browsers when a list is set. */
export function originAllowed(origin, allowlist) {
  if (!allowlist || allowlist.length === 0) return true;
  if (!origin) return true;
  return allowlist.includes(origin);
}

export function corsHeaders(origin, allowlist) {
  const allowAll = !allowlist || allowlist.length === 0;
  const value = allowAll
    ? '*'
    : origin && allowlist.includes(origin)
      ? origin
      : allowlist[0];
  return {
    'Access-Control-Allow-Origin': value,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
}

export function clientIp(req) {
  const xf = req.headers?.['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export function bearerToken(header) {
  if (typeof header !== 'string') return '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

export function tokenOk(expected, given) {
  if (!expected) return true;
  if (!given || given.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Per-IP sliding windows: requests/minute and requests/UTC-day.
 */
export function createLimiter({
  rpm = 30,
  daily = 200,
  now = () => Date.now(),
} = {}) {
  const minute = new Map();
  const day = new Map();

  function prune(map, t) {
    if (map.size < 2000) return;
    for (const [k, v] of map) {
      if (v.reset <= t) map.delete(k);
    }
  }

  return {
    check(ip) {
      const t = now();
      const key = ip || 'unknown';

      prune(minute, t);
      prune(day, t);

      let m = minute.get(key);
      if (!m || m.reset <= t) {
        m = { count: 0, reset: t + 60_000 };
        minute.set(key, m);
      }
      m.count += 1;
      if (m.count > rpm) {
        return {
          ok: false,
          reason: 'rpm',
          retryAfterSec: Math.max(1, Math.ceil((m.reset - t) / 1000)),
        };
      }

      const dayKey = new Date(t).toISOString().slice(0, 10);
      const dKey = `${key}:${dayKey}`;
      let d = day.get(dKey);
      if (!d) {
        d = { count: 0 };
        day.set(dKey, d);
      }
      d.count += 1;
      if (d.count > daily) {
        return { ok: false, reason: 'daily', retryAfterSec: 3600 };
      }

      return { ok: true };
    },
  };
}
