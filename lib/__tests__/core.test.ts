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
  extractReceiptRef,
  receiptTitleFromOcr,
} from '../ocr/receiptHints';
import { isTalkStub, isIncompleteStub, findTalkMatches } from '../matchTalkStubs';
import { crossSearch } from '../crossSearch';
import { paletteFor, contrastRatio, PALETTES, migrateAppearancePrefs } from '../../constants/theme';
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
import { dayOnly } from '../chat/prompt';
import { classifyDocumentFromText, parseMrzFromOcr } from '../ocr/mrz';
import { moduleHref, moduleHrefPreserveFrom, parseModuleOrigin } from '../moduleNav';

describe('module navigation', () => {
  it('builds hrefs with from param and parses origins', () => {
    assert.equal(moduleHref('/expenses', 'things'), '/expenses?from=things');
    assert.equal(
      moduleHrefPreserveFrom('/expenses/exp-1', 'things'),
      '/expenses/exp-1?from=things'
    );
    assert.equal(parseModuleOrigin('today'), 'today');
    assert.equal(parseModuleOrigin('things'), 'things');
    assert.equal(parseModuleOrigin('nope'), undefined);
  });
});

describe('document classification', () => {
  it('does not classify UAE grocery receipts as passport (PB No false positive)', () => {
    const lulu = [
      'LuLu Hypermarket (L.L.C.) (Branch)',
      'Motor City, Dubai, UAE, PB No 60188',
      'TAX INVOICE',
      'Total 14.00',
      'VAT 5%',
      'Credit Card - Neo AED 14.00',
      'Your Payment Failed',
    ].join('\n');
    assert.equal(classifyDocumentFromText(lulu), 'unknown');
  });

  it('rejects dense text lines starting with P as passport MRZ (no valid dates)', () => {
    // cleanLine strips spaces, so address/phone lines can become 40+ char
    // alnum lines starting with P — a real MRZ always has valid YYMMDD dates.
    const noisy = [
      'Ph 97147076055 PB No 60188 Motor City Dubai UAE Branch Office',
      'Phone 97147076055 TRN 100228723100003 Dubai United Arab Emirates',
    ].join('\n');
    assert.equal(parseMrzFromOcr(noisy), null);
  });
});

describe('planLimits', () => {
  it('meters unlimited plans as not over', () => {
    const m = meterFor(500, Infinity, 'Things');
    assert.equal(m.over, false);
    assert.match(m.label, /Unlimited/);
  });

  it('does not cap Things on trial, Pro, or Family', () => {
    const trial = planById('trial');
    const meters = buildLimitMeters(trial, { assets: 101, homes: 1, members: 2 });
    assert.equal(meters.assets.over, false);
    assert.equal(wouldExceedAssetLimit(trial, 100), false);
    assert.equal(wouldExceedAssetLimit(planById('free'), 1000), false);
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

  it('reads bilingual POS receipts: split total line, 2-digit year, expense default', () => {
    // Shape of a real IKEA Dubai receipt: amount on the line after "Total",
    // Arabic text interleaved, dd/mm/yy date, no currency symbol anywhere.
    const hints = extractReceiptHints(
      [
        'IKEA',
        'Al Futtaim Trading Co. LLC (IKEA)',
        'TAX INVOICE',
        'Date: 08/08/26 12:34',
        '40102978 SAMLA BOX 39X28 9.00 A',
        '60604120 GLIS NN box wit 19.95 A',
        'Total مجموع',
        '32.90',
        'Cards -32.90',
        'MASTERCARD',
      ].join('\n')
    );
    assert.equal(hints.looksLikeReceipt, true);
    assert.equal(hints.price, '32.90');
    assert.equal(hints.purchaseDate, '2026-08-08');
    assert.equal(hints.merchant, 'Ikea');
    assert.equal(suggestReceiptDestination(hints), 'expense');
  });

  it('extracts receipt ref from IKEA slip text', () => {
    assert.equal(
      extractReceiptRef('Trans: 330095405 VAT Trans. No.: 2012554330095405'),
      '2012554330095405'
    );
  });

  it('titles receipts from OCR text, not module presets', () => {
    const lulu = [
      'LuLu Hypermarket (L.L.C.) (Branch)',
      'Motor City, Dubai, UAE, PB No 60188',
      'TAX INVOICE',
      'Lemon Big South Africa 2.40',
      'Total 14.00',
    ].join('\n');
    const hints = extractReceiptHints(lulu);
    assert.equal(receiptTitleFromOcr(lulu, hints), 'Lulu purchase');
    assert.notEqual(receiptTitleFromOcr(lulu, hints), 'Insurance document');
  });

  it('never grabs EFT/receipt numbers as the price on column-split OCR', () => {
    // ML Kit often emits the label column and value column as separate lines,
    // so "AED" can land right before the EFT transaction number.
    const lulu = [
      'Lulu Hypermarket L.L.C Branch',
      'TAX INVOICE',
      'Oasis Water Zero SodmFree 1.5L 1.50',
      'Total',
      'Items :',
      'Mastercard',
      'AED',
      '60141',
      '1.50',
      'EFT-trans No = 60141',
      'Card No = 5214 15** **** 5980',
      'AUTH = 553261',
      '08-08-2026 12:49:22 2382 17 60141',
    ].join('\n');
    const hints = extractReceiptHints(lulu);
    assert.equal(hints.price, 'AED 1.50');
    assert.equal(hints.receiptRef, '60141');
    assert.equal(hints.purchaseDate, '2026-08-08');
  });

  it('ignores cash tender lines when falling back to largest amount', () => {
    const hints = extractReceiptHints(
      ['Corner Cafe', 'VAT included', 'Flat White 14.80', 'CASH 500.00', 'CHANGE 485.20'].join(
        '\n'
      )
    );
    assert.equal(hints.price, '14.80');
  });

  it('does not mistake tax registration numbers for serials on receipts', () => {
    const hints = extractReceiptHints(
      'TAX INVOICE\nTRN100228723100003\nTotal 14.00\nVAT 5%'
    );
    assert.equal(hints.serial, undefined);
  });

  it('rejects garbled OCR headers as merchant/title', () => {
    // Real Tesseract output: "LULU HYPERMARKET (L.L.C.) (BRANCH)" mangled
    // into junk that still contains "MARKET" as a substring.
    const garbled = [
      'Clon ot 5M Lo AVERMARKET»',
      'Motor City, Dubai, UAE, PB No 60188',
      'TAX INVOICE',
      'Lemon Big South Africa',
      '2.40',
      'Total',
      '14.00',
    ].join('\n');
    const hints = extractReceiptHints(garbled);
    assert.equal(hints.merchant, undefined);
    assert.equal(hints.price, '14.00');
    assert.equal(receiptTitleFromOcr(garbled, hints), 'Receipt 14.00');
  });

  it('keeps clean header-derived merchants', () => {
    const hints = extractReceiptHints(
      'Al Madina Supermarket LLC\nTAX INVOICE\nTotal 22.50'
    );
    assert.equal(hints.merchant, 'Al Madina Supermarket LLC');
  });

  it('still extracts explicitly marked serials on receipts', () => {
    const hints = extractReceiptHints(
      'TAX INVOICE\nMacBook Pro\nS/N: C02XG2JHJG5H\nTotal AED 4999.00'
    );
    assert.equal(hints.serial, 'C02XG2JHJG5H');
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
  it('resolves system dark to earth dark (legacy hearth)', () => {
    assert.equal(paletteFor('system', true).bg, paletteFor('hearth').bg);
    assert.equal(paletteFor('system', false).bg, paletteFor('linen').bg);
  });

  it('keeps ocean and clay distinct from earth sage', () => {
    assert.notEqual(paletteFor('ocean').accent, paletteFor('earth').accent);
    assert.notEqual(paletteFor('clay').accent, paletteFor('earth').accent);
    assert.notEqual(paletteFor('ink').accent, paletteFor('earth').accent);
    assert.equal(paletteFor('ink', false, 'dark').ink, '#FAFAFA');
  });

  it('gives readable ink on surface and accentOn on accent', () => {
    for (const family of ['earth', 'ocean', 'clay', 'ink'] as const) {
      for (const mode of ['light', 'dark'] as const) {
        const p = PALETTES[family][mode];
        assert.ok(
          contrastRatio(p.ink, p.surface) >= 4.5,
          `${family} ${mode} ink/surface ${contrastRatio(p.ink, p.surface).toFixed(2)}`
        );
        assert.ok(
          contrastRatio(p.accentOn, p.accent) >= 4.5,
          `${family} ${mode} accentOn/accent ${contrastRatio(p.accentOn, p.accent).toFixed(2)}`
        );
      }
    }
  });

  it('promotes the old Earth default to Ink once', () => {
    const fromDefault = migrateAppearancePrefs({ family: 'earth', mode: 'light' });
    assert.equal(fromDefault.family, 'ink');
    assert.equal(fromDefault.mode, 'dark');
    const fromDark = migrateAppearancePrefs({ family: 'earth', mode: 'dark' });
    assert.equal(fromDark.family, 'ink');
    assert.equal(fromDark.mode, 'dark');
    const kept = migrateAppearancePrefs({ family: 'earth', mode: 'light', rev: 2 });
    assert.equal(kept.family, 'earth');
    assert.equal(kept.mode, 'light');
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

  it('does not merge Walk habits that belong to different people', () => {
    const a: Habit = {
      id: '1',
      title: 'Walk',
      categoryId: 'health',
      personId: 'you',
      logs: [],
      createdAt: '2026-01-01T00:00:00Z',
    };
    const b: Habit = {
      id: '2',
      title: 'Walk',
      categoryId: 'health',
      personId: 'wife',
      logs: [],
      createdAt: '2026-01-02T00:00:00Z',
    };
    const { habits, removedIds } = mergeDuplicateHabits([a, b]);
    assert.equal(habits.length, 2);
    assert.equal(removedIds.length, 0);
    assert.equal(findHabitByTitle([a, b], 'walk', 'wife')?.id, '2');
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

describe('dayOnly prompt context date helper', () => {
  it('normalizes valid ISO and ISO-like timestamps', () => {
    assert.equal(dayOnly('2026-08-28'), '2026-08-28');
    assert.equal(dayOnly('2026-08-28T10:30:00Z'), '2026-08-28');
    assert.equal(dayOnly('2026-01-05T00:00:00.000Z'), '2026-01-05');
  });

  it('rejects impossible calendar dates', () => {
    assert.equal(dayOnly('2026-99-99'), undefined);
    assert.equal(dayOnly('2026-02-30'), undefined);
    assert.equal(dayOnly('2026-04-31'), undefined);
  });

  it('rejects placeholders and non-date garbage strings', () => {
    assert.equal(dayOnly('—'), undefined);
    assert.equal(dayOnly('-'), undefined);
    assert.equal(dayOnly('unknown'), undefined);
    assert.equal(dayOnly('blah'), undefined);
    assert.equal(dayOnly(''), undefined);
    assert.equal(dayOnly(null), undefined);
    assert.equal(dayOnly(undefined), undefined);
  });

  it('normalizes valid legacy parseable date strings', () => {
    const res = dayOnly('March 5, 2026');
    assert.equal(res, '2026-03-05');
  });
});
