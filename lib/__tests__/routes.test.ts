import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  displayWarrantyExpiry,
  localDayKey,
  normalizeWarrantyExpiry,
  warrantyExpiryFromUtterance,
} from '../dates';

const APP_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../app'
);

/** Modules that must use /create next to [id] — never /new (Expo swallows "new" as an id). */
const CREATE_MODULES = [
  'habits',
  'expenses',
  'family',
  'subscriptions',
  'space',
] as const;

describe('create vs [id] routes', () => {
  for (const mod of CREATE_MODULES) {
    it(`${mod}: create.tsx exists, new.tsx does not`, () => {
      const dir = path.join(APP_DIR, mod);
      assert.ok(fs.existsSync(path.join(dir, '[id].tsx')), `${mod}/[id].tsx`);
      assert.ok(fs.existsSync(path.join(dir, 'create.tsx')), `${mod}/create.tsx`);
      assert.equal(
        fs.existsSync(path.join(dir, 'new.tsx')),
        false,
        `${mod}/new.tsx must not exist beside [id]`
      );
    });
  }

  it('app source does not link to /module/new create paths', () => {
    const roots = [APP_DIR, path.join(APP_DIR, '..', 'lib')];
    const banned =
      /['"`]\/(habits|expenses|family|subscriptions|space)\/new(?:['"`?/]|$)/;
    const offenders: string[] = [];

    function walk(dir: string) {
      for (const name of fs.readdirSync(dir)) {
        if (name === 'node_modules' || name.startsWith('.')) continue;
        const full = path.join(dir, name);
        const st = fs.statSync(full);
        if (st.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(tsx?|jsx?|mjs)$/.test(name)) continue;
        const text = fs.readFileSync(full, 'utf8');
        if (banned.test(text)) offenders.push(path.relative(APP_DIR, full));
      }
    }

    for (const root of roots) walk(root);
    assert.deepEqual(offenders, [], `banned /new links in: ${offenders.join(', ')}`);
  });
});

describe('warranty expiry', () => {
  it('maps year-only and utterance to end of year', () => {
    assert.equal(normalizeWarrantyExpiry('2028'), '2028-12-31');
    assert.equal(normalizeWarrantyExpiry('until 2028'), '2028-12-31');
    assert.equal(normalizeWarrantyExpiry('2027-06-15'), '2027-06-15');
    assert.equal(
      warrantyExpiryFromUtterance(
        'I got a new Apple MacBook Pro from IMAX for $8000 with extended warranty until 2028'
      ),
      '2028-12-31'
    );
    assert.equal(displayWarrantyExpiry('2028-12-31'), '2028');
  });
});

describe('localDayKey', () => {
  it('uses local Y-M-D, not UTC ISO date', () => {
    // 21:00 UTC on Aug 12 → Aug 13 morning in UTC+4 (and any offset > 0 that crosses midnight)
    const d = new Date(Date.UTC(2026, 7, 12, 21, 0, 0));
    assert.equal(d.toISOString().slice(0, 10), '2026-08-12');
    if (d.getTimezoneOffset() < 0) {
      // Local time is ahead of UTC (e.g. UAE)
      assert.equal(localDayKey(d), '2026-08-13');
    } else {
      assert.equal(localDayKey(new Date(2026, 7, 13, 8, 0, 0)), '2026-08-13');
    }
  });
});
