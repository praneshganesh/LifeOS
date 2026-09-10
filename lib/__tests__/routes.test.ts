import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  displayWarrantyExpiry,
  localDayKey,
  normalizeWarrantyExpiry,
  parseRecurringWeekdayReminder,
  parseReminderFromUtterance,
  remindAtFromUtterance,
  reminderLabelFromUtterance,
  warrantyExpiryFromUtterance,
} from '../dates';
import { defaultActivityYear, formatInterval, yearsWithLogs } from '../lastDone';

const APP_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../app'
);

/** Modules that must use /create next to [id] — never /new (Expo swallows "new" as an id). */
const CREATE_MODULES = [
  'habits',
  'classes',
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
      /['"`]\/(habits|classes|expenses|family|subscriptions|space)\/new(?:['"`?/]|$)/;
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

describe('last done year helpers', () => {
  it('lists years with logs newest first and picks default', () => {
    const item = {
      id: 'ld-1',
      label: 'Filter',
      createdAt: '2026-01-01',
      logs: [
        { id: 'l1', doneAt: '2024-06-01' },
        { id: 'l2', doneAt: '2026-03-15' },
        { id: 'l3', doneAt: '2025-12-01' },
      ],
    };
    assert.deepEqual(yearsWithLogs(item), [2026, 2025, 2024]);
    assert.equal(defaultActivityYear(item), 2026);
  });
});

describe('reminder speech', () => {
  it('maps next Tuesday from Saturday 15 Aug 2026 to 18 Aug', () => {
    const sat = new Date(2026, 7, 15);
    assert.equal(
      remindAtFromUtterance(
        'Log a reminder to apply for renewed passport next Tuesday',
        sat
      ),
      '2026-08-18'
    );
    assert.equal(
      reminderLabelFromUtterance(
        'Log a reminder to apply for renewed passport next Tuesday'
      ),
      'Apply for renewed passport'
    );
  });

  it('parses 10th November and splits label from notes', () => {
    const sep = new Date(2026, 8, 1);
    const utterance =
      "Remind me about Mira's payment on 10th November it's for a off plan property purchase";
    assert.equal(remindAtFromUtterance(utterance, sep), '2026-11-10');
    const parsed = parseReminderFromUtterance(utterance);
    assert.equal(parsed?.label, "Mira's payment");
    assert.match(parsed?.notes ?? '', /off plan property/i);
  });

  it('parses every Tuesday and Friday at 6:30 AM', () => {
    const wed = new Date(2026, 8, 9, 12, 0, 0);
    const utterance =
      'Remind me every Tuesday and Friday at 6:30 AM to stretch';
    const recurring = parseRecurringWeekdayReminder(utterance, wed);
    assert.deepEqual(recurring?.remindInterval.weekdays, [2, 5]);
    assert.equal(recurring?.remindInterval.hour, 6);
    assert.equal(recurring?.remindInterval.minute, 30);
    assert.equal(recurring?.remindAt, '2026-09-11');
    assert.equal(recurring?.remindInterval.endsAt, undefined);
    assert.equal(
      formatInterval(recurring!.remindInterval),
      'Every Tue & Fri at 6:30 AM'
    );
    assert.equal(parseReminderFromUtterance(utterance)?.label, 'Stretch');
  });

  it('parses end after N weeks, months, or until a month', () => {
    const wed = new Date(2026, 8, 9, 12, 0, 0);
    const weeks = parseRecurringWeekdayReminder(
      'Remind me every Tuesday and Friday at 6:30 AM for 8 weeks to stretch',
      wed
    );
    assert.equal(weeks?.remindInterval.endsAt, '2026-11-04');
    assert.match(
      formatInterval(weeks!.remindInterval),
      /until/i
    );

    const months = parseRecurringWeekdayReminder(
      'Remind me every Monday at 7am for 3 months to meditate',
      wed
    );
    assert.equal(months?.remindInterval.endsAt, '2026-12-09');

    const untilMonth = parseRecurringWeekdayReminder(
      'Remind me every weekday at 8am until December to walk',
      wed
    );
    assert.equal(untilMonth?.remindInterval.endsAt, '2026-12-31');
  });
});
