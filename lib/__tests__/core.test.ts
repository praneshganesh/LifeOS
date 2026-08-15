import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildLimitMeters,
  meterFor,
  planById,
  wouldExceedAssetLimit,
} from '../planLimits';
import {
  suggestReceiptDestination,
  extractReceiptHints,
} from '../ocr/receiptHints';
import { isTalkStub, isIncompleteStub, findTalkMatches } from '../matchTalkStubs';
import { crossSearch } from '../crossSearch';
import { paletteFor } from '../../constants/theme';
import {
  findHabitByTitle,
  mergeDuplicateHabits,
  normalizeHabitKey,
  type Habit,
} from '../habits';
import {
  buildHabitYearCalendar,
  daysInMonth,
} from '../habitHeatmap';
import { hrefFromNotificationData } from '../notificationHref';

describe('planLimits', () => {
  it('meters unlimited plans as not over', () => {
    const m = meterFor(500, Infinity, 'Things');
    assert.equal(m.over, false);
    assert.match(m.label, /Unlimited/);
  });

  it('flags free plan overage', () => {
    const free = planById('free');
    const meters = buildLimitMeters(free, { assets: 101, homes: 1, members: 2 });
    assert.equal(meters.assets.over, true);
    assert.equal(wouldExceedAssetLimit(free, 100), true);
    assert.equal(wouldExceedAssetLimit(planById('pro'), 1000), false);
  });
});

describe('receiptHints', () => {
  it('suggests both when product + price', () => {
    const hints = extractReceiptHints('Apple MacBook Pro Total AED 4999');
    assert.equal(hints.looksLikeReceipt, true);
    assert.equal(suggestReceiptDestination(hints), 'both');
  });

  it('suggests expense when price without product', () => {
    const hints = extractReceiptHints('Invoice Total AED 45.00 VAT included');
    assert.equal(suggestReceiptDestination(hints), 'expense');
  });
});

describe('matchTalkStubs', () => {
  const stub = {
    id: '1',
    name: 'MacBook',
    brand: 'Apple',
    category: 'Electronics',
    room: 'Office',
    spaceId: 's1',
    icon: 'laptop' as const,
    purchaseDate: '—',
    price: '—',
    warrantyExpiry: '—',
    warrantyActive: false,
    condition: 'Good',
    serial: '—',
    estimatedValue: '—',
    timeline: [{ date: '1 Jan', event: 'Added via Talk' }],
    source: 'talk' as const,
    createdAt: new Date().toISOString(),
  };

  it('detects incomplete talk stubs', () => {
    assert.equal(isTalkStub(stub), true);
    assert.equal(isIncompleteStub(stub), true);
  });

  it('scores name overlap against OCR', () => {
    const hits = findTalkMatches([stub], {
      name: 'MacBook Pro',
      brand: 'Apple',
      ocrText: 'Apple Store MacBook Pro AED 5000',
    });
    assert.ok(hits.length >= 1);
    assert.ok(hits[0]!.score >= 0.32);
  });
});

describe('crossSearch', () => {
  it('finds expenses and habits by substring', () => {
    const result = crossSearch({
      query: 'coffee',
      inventory: [],
      spaces: [],
      spaceNameById: {},
      expenses: [
        {
          id: 'e1',
          title: 'Coffee beans',
          amount: 40,
          currency: 'AED',
          category: 'food',
          date: '2026-01-01',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      habits: [
        {
          id: 'h1',
          title: 'Morning coffee',
          categoryId: 'health',
          logs: [],
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      people: [],
    });
    assert.equal(result.expenses.length, 1);
    assert.equal(result.habits.length, 1);
    assert.equal(result.total, 2);
  });
});

describe('theme palettes', () => {
  it('resolves system dark to hearth', () => {
    assert.equal(paletteFor('system', true).bg, paletteFor('hearth').bg);
    assert.equal(paletteFor('system', false).bg, paletteFor('linen').bg);
  });
});

describe('habit title matching', () => {
  it('maps walk variants to one key', () => {
    assert.equal(normalizeHabitKey('Walked'), normalizeHabitKey('Walk'));
    assert.equal(normalizeHabitKey('I walked'), normalizeHabitKey('walking'));
  });

  it('merges duplicate Walked habits and logs', () => {
    const mk = (id: string, day: string): Habit => ({
      id,
      title: 'Walked',
      categoryId: 'health',
      logs: [{ id: `l-${id}`, doneAt: day }],
      createdAt: `2026-01-0${id}T00:00:00Z`,
    });
    const { habits, removedIds } = mergeDuplicateHabits([
      mk('1', '2026-08-10'),
      mk('2', '2026-08-11'),
      mk('3', '2026-08-10'),
    ]);
    assert.equal(habits.length, 1);
    assert.equal(removedIds.length, 2);
    assert.equal(habits[0]!.logs.length, 2);
    assert.ok(findHabitByTitle(habits, 'walk'));
  });
});

describe('habit year calendar', () => {
  it('builds 12×31 grid with done/empty/invalid', () => {
    const model = buildHabitYearCalendar(
      [
        { id: '1', doneAt: '2026-08-12' },
        { id: '2', doneAt: '2025-01-01' },
      ],
      2026
    );
    assert.equal(model.year, 2026);
    assert.equal(model.months.length, 12);
    assert.equal(model.dayHeaders.length, 31);
    assert.equal(model.months[0]!.cells.length, 31);

    const aug12 = model.months[7]!.cells[11]!;
    assert.equal(aug12.state, 'done');
    assert.equal(aug12.key, '2026-08-12');

    const aug13 = model.months[7]!.cells[12]!;
    assert.equal(aug13.state, 'empty');

    // April has 30 days → day 31 invalid
    assert.equal(model.months[3]!.cells[30]!.state, 'invalid');
    assert.equal(model.months[3]!.cells[30]!.key, null);
  });

  it('disables Feb 29–31 in common years and Feb 30–31 in leap years', () => {
    assert.equal(daysInMonth(2025, 1), 28);
    assert.equal(daysInMonth(2024, 1), 29);

    const common = buildHabitYearCalendar([], 2025);
    assert.equal(common.months[1]!.cells[27]!.state, 'empty'); // 28
    assert.equal(common.months[1]!.cells[28]!.state, 'invalid'); // 29
    assert.equal(common.months[1]!.cells[29]!.state, 'invalid'); // 30
    assert.equal(common.months[1]!.cells[30]!.state, 'invalid'); // 31

    const leap = buildHabitYearCalendar([], 2024);
    assert.equal(leap.months[1]!.cells[28]!.state, 'empty'); // 29
    assert.equal(leap.months[1]!.cells[29]!.state, 'invalid'); // 30
    assert.equal(leap.months[1]!.cells[30]!.state, 'invalid'); // 31
  });
});

describe('notification deep links', () => {
  it('resolves href and last_done payloads', () => {
    assert.equal(
      hrefFromNotificationData({ href: '/last-done/abc' }),
      '/last-done/abc'
    );
    assert.equal(
      hrefFromNotificationData({ type: 'last_done', itemId: 'xyz' }),
      '/last-done/xyz'
    );
    assert.equal(hrefFromNotificationData({ href: 'https://evil' }), null);
  });
});
