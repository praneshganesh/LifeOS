import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { verifyJwtLocally, verifySupabaseUser } from '../aiAuth.mjs';

const subtle = globalThis.crypto.subtle;
const cfg = { url: 'https://proj.supabase.co', key: 'anon' };
const UID = '11111111-2222-4333-8444-555555555555';

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signJwt(privateKey, header, payload) {
  const signed = `${b64url(Buffer.from(JSON.stringify(header)))}.${b64url(Buffer.from(JSON.stringify(payload)))}`;
  const sig = await subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(signed)
  );
  return `${signed}.${b64url(new Uint8Array(sig))}`;
}

describe('local JWT verification (JWKS)', () => {
  let keyPair;
  let otherPair;
  let jwks;
  let origFetch;
  let fetchLog;

  before(async () => {
    keyPair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    otherPair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pub = await subtle.exportKey('jwk', keyPair.publicKey);
    jwks = { keys: [{ ...pub, kid: 'k1', alg: 'ES256', use: 'sig' }] };
    origFetch = globalThis.fetch;
    fetchLog = [];
    globalThis.fetch = async (url) => {
      fetchLog.push(String(url));
      if (String(url).endsWith('/.well-known/jwks.json')) {
        return { ok: true, json: async () => jwks };
      }
      if (String(url).endsWith('/auth/v1/user')) {
        return { ok: true, json: async () => ({ id: UID }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
  });

  after(() => {
    globalThis.fetch = origFetch;
  });

  const now = Date.now();
  const claims = (over = {}) => ({
    iss: `${cfg.url}/auth/v1`,
    sub: UID,
    aud: 'authenticated',
    role: 'authenticated',
    exp: Math.floor(now / 1000) + 3600,
    iat: Math.floor(now / 1000),
    ...over,
  });

  it('accepts a valid ES256 token without calling /auth/v1/user', async () => {
    const token = await signJwt(keyPair.privateKey, { alg: 'ES256', typ: 'JWT', kid: 'k1' }, claims());
    fetchLog.length = 0;
    const res = await verifySupabaseUser(cfg, token);
    assert.equal(res.ok, true);
    assert.equal(res.userId, UID);
    assert.equal(res.via, 'jwks');
    assert.ok(!fetchLog.some((u) => u.endsWith('/auth/v1/user')));
  });

  it('rejects expired tokens and bad signatures without falling back', async () => {
    const expired = await signJwt(
      keyPair.privateKey,
      { alg: 'ES256', kid: 'k1' },
      claims({ exp: Math.floor(now / 1000) - 10 })
    );
    const r1 = await verifyJwtLocally(cfg, expired);
    assert.equal(r1.ok, false);
    assert.equal(r1.reason, 'expired');
    assert.equal(r1.fallback, false);

    const forged = await signJwt(otherPair.privateKey, { alg: 'ES256', kid: 'k1' }, claims());
    const r2 = await verifyJwtLocally(cfg, forged);
    assert.equal(r2.ok, false);
    assert.equal(r2.reason, 'bad signature');
    assert.equal(r2.fallback, false);
    const full = await verifySupabaseUser(cfg, forged);
    assert.equal(full.ok, false);
  });

  it('rejects wrong issuer / audience', async () => {
    const wrongIss = await signJwt(keyPair.privateKey, { alg: 'ES256', kid: 'k1' }, claims({ iss: 'https://evil/auth/v1' }));
    assert.equal((await verifyJwtLocally(cfg, wrongIss)).reason, 'issuer mismatch');
    const wrongAud = await signJwt(keyPair.privateKey, { alg: 'ES256', kid: 'k1' }, claims({ aud: 'anon' }));
    assert.equal((await verifyJwtLocally(cfg, wrongAud)).reason, 'audience mismatch');
  });

  it('falls back to /auth/v1/user for HS256 tokens', async () => {
    const hs = [
      b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))),
      b64url(Buffer.from(JSON.stringify(claims()))),
      b64url(Buffer.from('sig')),
    ].join('.');
    const local = await verifyJwtLocally(cfg, hs);
    assert.equal(local.fallback, true);
    fetchLog.length = 0;
    const res = await verifySupabaseUser(cfg, hs);
    assert.equal(res.ok, true);
    assert.equal(res.via, 'auth');
    assert.ok(fetchLog.some((u) => u.endsWith('/auth/v1/user')));
  });

  it('falls back on unknown kid after a forced JWKS refresh', async () => {
    const token = await signJwt(keyPair.privateKey, { alg: 'ES256', kid: 'rotated' }, claims());
    const r = await verifyJwtLocally(cfg, token);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'unknown kid');
    assert.equal(r.fallback, true);
  });
});
