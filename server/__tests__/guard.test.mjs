import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bearerToken,
  createLimiter,
  corsHeaders,
  originAllowed,
  parseOriginList,
  tokenOk,
} from '../guard.mjs';

describe('chat-api CORS', () => {
  it('treats empty / * as allow-all', () => {
    assert.equal(parseOriginList(''), null);
    assert.equal(parseOriginList('*'), null);
    assert.deepEqual(parseOriginList('http://localhost:8081, https://app.example'), [
      'http://localhost:8081',
      'https://app.example',
    ]);
  });

  it('allows missing Origin (native) even with an allowlist', () => {
    const list = ['http://localhost:8081'];
    assert.equal(originAllowed(undefined, list), true);
    assert.equal(originAllowed('http://localhost:8081', list), true);
    assert.equal(originAllowed('https://evil.example', list), false);
  });

  it('echoes allowed origin', () => {
    const h = corsHeaders('http://localhost:8081', ['http://localhost:8081']);
    assert.equal(h['Access-Control-Allow-Origin'], 'http://localhost:8081');
  });
});

describe('chat-api token', () => {
  it('skips check when no expected token', () => {
    assert.equal(tokenOk('', 'anything'), true);
  });

  it('rejects wrong length and wrong value', () => {
    assert.equal(tokenOk('secret', ''), false);
    assert.equal(tokenOk('secret', 'secre'), false);
    assert.equal(tokenOk('secret', 'secret'), true);
  });

  it('parses Bearer header', () => {
    assert.equal(bearerToken('Bearer abc'), 'abc');
    assert.equal(bearerToken('bearer abc'), 'abc');
    assert.equal(bearerToken('Basic abc'), '');
  });
});

describe('chat-api rate limit', () => {
  it('trips rpm then recovers after window', () => {
    let t = 1_000;
    const limiter = createLimiter({ rpm: 2, daily: 10, now: () => t });
    assert.equal(limiter.check('1.1.1.1').ok, true);
    assert.equal(limiter.check('1.1.1.1').ok, true);
    const blocked = limiter.check('1.1.1.1');
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, 'rpm');
    t += 61_000;
    assert.equal(limiter.check('1.1.1.1').ok, true);
  });

  it('trips daily cap independently of rpm', () => {
    let t = Date.parse('2026-08-15T10:00:00Z');
    const limiter = createLimiter({ rpm: 100, daily: 2, now: () => t });
    assert.equal(limiter.check('9.9.9.9').ok, true);
    assert.equal(limiter.check('9.9.9.9').ok, true);
    const blocked = limiter.check('9.9.9.9');
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, 'daily');
  });
});
