/**
 * Supabase Auth + AI daily allowance for the chat proxy.
 * When SUPABASE_URL + publishable/anon key are set, Talk requires a user JWT
 * and consumes a server-side daily turn before OpenAI runs.
 */

export function supabaseConfigured() {
  const url = (process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const key = (
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim();
  return url && key ? { url: url.replace(/\/$/, ''), key } : null;
}

function looksLikeJwt(token) {
  return typeof token === 'string' && token.split('.').length === 3;
}

/**
 * Resolve caller identity.
 * Prefers Authorization Bearer <supabase_jwt>.
 * Optional X-Saavi-Proxy-Token (or legacy Authorization = CHAT_API_TOKEN when not a JWT).
 */
export function resolveChatAuth(req, { proxyToken = '' } = {}) {
  const auth = req.headers?.authorization;
  const bearer =
    typeof auth === 'string' && /^Bearer\s+/i.test(auth)
      ? auth.replace(/^Bearer\s+/i, '').trim()
      : '';
  const proxyHeader = String(
    req.headers?.['x-saavi-proxy-token'] || req.headers?.['x-chat-token'] || ''
  ).trim();

  let accessToken = '';
  let givenProxy = proxyHeader;

  if (looksLikeJwt(bearer)) {
    accessToken = bearer;
  } else if (bearer) {
    givenProxy = givenProxy || bearer;
  }

  return { accessToken, givenProxy, proxyToken };
}

// ── Local JWT verification (JWKS) ─────────────────────────────────────────
// Supabase projects on asymmetric signing keys (ES256 / RS256) publish a JWKS
// at /auth/v1/.well-known/jwks.json. Verifying locally saves one Auth round
// trip per Talk turn. Legacy HS256 tokens (shared secret) cannot be verified
// here, so we fall back to the Auth /user endpoint for those.

const JWKS_TTL_MS = 10 * 60 * 1000;
/** url -> { fetchedAt, keys: Map<kid, CryptoKey>, raw } */
const jwksCache = new Map();

function b64urlToBytes(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return new Uint8Array(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64'));
}

function decodeJwtParts(token) {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  try {
    const header = JSON.parse(Buffer.from(b64urlToBytes(h)).toString('utf8'));
    const payload = JSON.parse(Buffer.from(b64urlToBytes(p)).toString('utf8'));
    return { header, payload, signed: `${h}.${p}`, signature: b64urlToBytes(s) };
  } catch {
    return null;
  }
}

function algoFor(jwk, alg) {
  if (alg === 'ES256' || jwk.kty === 'EC') {
    return {
      importAlgo: { name: 'ECDSA', namedCurve: jwk.crv || 'P-256' },
      verifyAlgo: { name: 'ECDSA', hash: 'SHA-256' },
    };
  }
  if (alg === 'RS256' || jwk.kty === 'RSA') {
    return {
      importAlgo: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      verifyAlgo: { name: 'RSASSA-PKCS1-v1_5' },
    };
  }
  return null;
}

async function loadJwks(cfg, { force = false } = {}) {
  const cached = jwksCache.get(cfg.url);
  if (!force && cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached;
  const res = await fetch(`${cfg.url}/auth/v1/.well-known/jwks.json`, {
    headers: { apikey: cfg.key },
  });
  if (!res.ok) throw new Error(`JWKS fetch failed (${res.status})`);
  const data = await res.json().catch(() => ({}));
  const keys = new Map();
  for (const jwk of Array.isArray(data?.keys) ? data.keys : []) {
    const algo = algoFor(jwk, jwk.alg);
    if (!algo || !jwk.kid) continue;
    try {
      const key = await globalThis.crypto.subtle.importKey(
        'jwk',
        jwk,
        algo.importAlgo,
        false,
        ['verify']
      );
      keys.set(jwk.kid, { key, verifyAlgo: algo.verifyAlgo, alg: jwk.alg || null });
    } catch {
      /* skip unusable key */
    }
  }
  const entry = { fetchedAt: Date.now(), keys };
  jwksCache.set(cfg.url, entry);
  return entry;
}

/**
 * Verify a Supabase access token locally against the project JWKS.
 * Returns { ok, userId, claims } or { ok: false, reason, fallback }
 * where fallback=true means "not decidable locally, try /auth/v1/user".
 */
export async function verifyJwtLocally(cfg, accessToken, { now = Date.now() } = {}) {
  const parts = decodeJwtParts(accessToken);
  if (!parts) return { ok: false, reason: 'malformed', fallback: false };
  const { header, payload } = parts;
  const alg = String(header.alg || '');
  if (alg === 'HS256' || !header.kid) {
    return { ok: false, reason: 'symmetric', fallback: true };
  }
  if (alg !== 'ES256' && alg !== 'RS256') {
    return { ok: false, reason: `unsupported alg ${alg}`, fallback: true };
  }

  let jwks;
  try {
    jwks = await loadJwks(cfg);
    if (!jwks.keys.has(header.kid)) jwks = await loadJwks(cfg, { force: true });
  } catch (err) {
    return { ok: false, reason: err?.message || 'jwks unavailable', fallback: true };
  }
  const entry = jwks.keys.get(header.kid);
  if (!entry) return { ok: false, reason: 'unknown kid', fallback: true };

  let valid = false;
  try {
    valid = await globalThis.crypto.subtle.verify(
      entry.verifyAlgo,
      entry.key,
      parts.signature,
      new TextEncoder().encode(parts.signed)
    );
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: 'bad signature', fallback: false };

  const nowSec = Math.floor(now / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    return { ok: false, reason: 'expired', fallback: false };
  }
  if (typeof payload.nbf === 'number' && payload.nbf > nowSec + 60) {
    return { ok: false, reason: 'not yet valid', fallback: false };
  }
  const expectedIss = `${cfg.url}/auth/v1`;
  if (payload.iss && payload.iss !== expectedIss) {
    return { ok: false, reason: 'issuer mismatch', fallback: false };
  }
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes('authenticated')) {
    return { ok: false, reason: 'audience mismatch', fallback: false };
  }
  if (typeof payload.sub !== 'string' || !payload.sub) {
    return { ok: false, reason: 'missing sub', fallback: false };
  }
  return { ok: true, userId: payload.sub, claims: payload };
}

/**
 * Resolve the caller: JWKS first, Auth /user as fallback (HS256 projects,
 * JWKS outage, key rotation race). Signature/expiry failures never fall back.
 */
export async function verifySupabaseUser(cfg, accessToken) {
  const local = await verifyJwtLocally(cfg, accessToken);
  if (local.ok) return { ok: true, userId: local.userId, via: 'jwks' };
  if (!local.fallback) return { ok: false, error: `Invalid session (${local.reason})` };
  const remote = await verifySupabaseUserRemote(cfg, accessToken);
  return remote.ok ? { ...remote, via: 'auth' } : remote;
}

export async function verifySupabaseUserRemote(cfg, accessToken) {
  const res = await fetch(`${cfg.url}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: cfg.key,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.id) {
    const msg = data?.msg || data?.error_description || data?.error || 'Invalid session';
    return { ok: false, error: String(msg) };
  }
  return { ok: true, userId: data.id };
}

export async function rpcConsumeAiTurn(cfg, accessToken, day) {
  const res = await fetch(`${cfg.url}/rest/v1/rpc/consume_ai_turn`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: cfg.key,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ p_day: day }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (data && (data.message || data.error || data.hint)) ||
      `AI allowance RPC failed (${res.status})`;
    return { ok: false, error: String(msg) };
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'AI allowance RPC returned empty payload' };
  }
  return { ok: true, allowance: data };
}
