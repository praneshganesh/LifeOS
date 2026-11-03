/**
 * Ask/Talk reminder parsing — on-device (lib/dates + applyActions).
 * Clock fixed at 2026-11-03 10:00 Asia/Dubai. Run with:
 *   TZ=Asia/Dubai node --import tsx --test lib/__tests__/askReminderParse.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyChatActions } from '../chat/applyActions';
import type { ChatAction } from '../chat/types';
import {
  finalizeReminderLabel,
  localDayKey,
  parseReminderFromUtterance,
  parseTimeOfDayFromUtterance,
  remindAtFromUtterance,
  utteranceNamesRemindDate,
} from '../dates';
import type { InventoryItem } from '../InventoryContext';

const LOCAL_DAY = '2026-11-03';
/** Tuesday 3 Nov 2026 10:00 local (Asia/Dubai when TZ=Asia/Dubai). */
const FROM = new Date(2026, 10, 3, 10, 0, 0);

const unusedInv = {
  addItem: async () => {
    throw new Error('unused');
  },
  updateItem: async () => {
    throw new Error('unused');
  },
  removeItem: async () => {
    throw new Error('unused');
  },
} as unknown as {
  addItem: (item: Omit<InventoryItem, 'id' | 'createdAt'> & { id?: string }) => Promise<InventoryItem>;
  updateItem: (id: string, patch: Partial<InventoryItem>) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
};

type Case = {
  utterance: string;
  title: string | RegExp;
  due: string;
  recurringWeekdays?: number[];
  /** When set, also assert spoken clock (title still must not contain "at 3pm"). */
  timeHour?: number;
};

/**
 * next Thursday from Tue 3 Nov = 5 Nov (not 12 Nov).
 * every Monday from Tue 3 Nov → first fire Mon 9 Nov.
 */
const CASES: Case[] = [
  {
    utterance: 'Create a reminder for 12th Nov for Meraas Payment',
    title: 'Meraas Payment',
    due: '2026-11-12',
  },
  {
    utterance: 'Create a reminder for Meraas Payment on 12th November',
    title: 'Meraas Payment',
    due: '2026-11-12',
  },
  {
    utterance: 'Remind me to pay Meraas on Nov 12',
    title: 'Pay Meraas',
    due: '2026-11-12',
  },
  {
    utterance: 'Remind me about Meraas payment on the 12th of Nov',
    title: 'Meraas payment',
    due: '2026-11-12',
  },
  {
    utterance: 'Set a reminder Meraas payment 12 Nov 2026',
    title: 'Meraas payment',
    due: '2026-11-12',
  },
  {
    utterance: 'Remind me to pay Meraas on 12 Nov at 3pm',
    title: 'Pay Meraas',
    due: '2026-11-12',
    timeHour: 15,
  },
  {
    utterance: 'Remind me to call DEWA on 5th Sept',
    title: 'Call DEWA',
    due: '2027-09-05',
  },
  {
    utterance: 'Remind me to renew visa on 1st Nov',
    title: 'Renew visa',
    due: '2027-11-01',
  },
  {
    utterance: 'Remind me to pay rent on 3 Mar',
    title: 'Pay rent',
    due: '2027-03-03',
  },
  {
    utterance: 'Remind me to submit report tomorrow',
    title: 'Submit report',
    due: '2026-11-04',
  },
  {
    utterance: 'Remind me to pay Meraas next Thursday',
    title: 'Pay Meraas',
    due: '2026-11-05',
  },
  {
    utterance: 'Remind me to pay Meraas in 5 days',
    title: 'Pay Meraas',
    due: '2026-11-08',
  },
  {
    utterance: 'Remind me to pay Meraas',
    title: 'Pay Meraas',
    due: LOCAL_DAY,
  },
  {
    utterance: 'Remind me I may need to pay rent',
    title: /may need to pay rent/i,
    due: LOCAL_DAY,
  },
  {
    utterance: 'Create a reminder for Meraas payment on 12/11',
    title: 'Meraas payment',
    due: '2026-11-12',
  },
  {
    utterance: 'Remind me to pay Meraas every Monday',
    title: 'Pay Meraas',
    due: '2026-11-09',
    recurringWeekdays: [1],
  },
];

async function applyWithWrongModel(utterance: string) {
  const saved: {
    label: string;
    remindAt: string;
    remindInterval?: { unit: string; weekdays?: number[] };
  }[] = [];
  const wrongAction: ChatAction = {
    type: 'set_reminder',
    label: 'Meraas Payment for 12th November',
    remindAt: LOCAL_DAY,
  };
  await applyChatActions([wrongAction], unusedInv, 'talk', {
    lastUserText: utterance,
    localDate: LOCAL_DAY,
    lastDone: {
      logDone: async () => {
        throw new Error('should not mark done');
      },
      setReminder: async (input) => {
        saved.push({
          label: input.label,
          remindAt: input.remindAt,
          remindInterval: input.remindInterval
            ? {
                unit: input.remindInterval.unit,
                weekdays: input.remindInterval.weekdays,
              }
            : undefined,
        });
        return {
          id: 'ld-test',
          label: input.label,
          remindAt: input.remindAt,
        };
      },
    },
  });
  return saved[0];
}

describe('Ask/Talk reminder parse (clock 2026-11-03 Asia/Dubai)', () => {
  it('anchors FROM to Tuesday 3 Nov 2026', () => {
    assert.equal(localDayKey(FROM), LOCAL_DAY);
    assert.equal(FROM.getDay(), 2);
  });

  for (const c of CASES) {
    it(`utterance: ${c.utterance}`, async () => {
      const spokenDue = remindAtFromUtterance(c.utterance, FROM);
      const parsed = parseReminderFromUtterance(c.utterance);
      const applied = await applyWithWrongModel(c.utterance);

      if (c.recurringWeekdays) {
        // Recurring: remindAtFromUtterance returns next weekday fire via recurring parse
        assert.equal(spokenDue, c.due, `remindAtFromUtterance → ${spokenDue}`);
      } else if (c.due === LOCAL_DAY && !utteranceNamesRemindDate(c.utterance)) {
        // Dateless → undefined from remindAtFromUtterance; apply fills today
        assert.equal(spokenDue, undefined, 'dateless spoken due');
      } else {
        assert.equal(spokenDue, c.due, `remindAtFromUtterance → ${spokenDue}`);
      }

      if (typeof c.title === 'string') {
        assert.equal(parsed?.label, c.title, `parse label → ${parsed?.label}`);
      } else {
        assert.match(parsed?.label ?? '', c.title);
      }

      assert.ok(applied, 'applyActions should call setReminder');
      if (typeof c.title === 'string') {
        assert.equal(applied!.label, c.title, `applied label → ${applied!.label}`);
      } else {
        assert.match(applied!.label, c.title);
      }
      assert.equal(applied!.remindAt.slice(0, 10), c.due, `applied due → ${applied!.remindAt}`);

      if (c.recurringWeekdays) {
        assert.equal(applied!.remindInterval?.unit, 'weekdays');
        assert.deepEqual(applied!.remindInterval?.weekdays, c.recurringWeekdays);
      }

      if (c.timeHour != null) {
        assert.doesNotMatch(applied!.label, /\bat\s+3\s*pm\b/i);
        assert.equal(parseTimeOfDayFromUtterance(c.utterance)?.hour, c.timeHour);
      }
    });
  }

  it('utteranceNamesRemindDate for day+month forms', () => {
    assert.equal(utteranceNamesRemindDate('12th Nov'), true);
    assert.equal(utteranceNamesRemindDate('Nov 12'), true);
    assert.equal(utteranceNamesRemindDate('12 Sept'), true);
    assert.equal(utteranceNamesRemindDate('I may need to pay rent'), false);
  });

  it('finalizeReminderLabel strips dates from model labels', () => {
    assert.equal(
      finalizeReminderLabel('Meraas Payment for 12th November'),
      'Meraas Payment'
    );
    assert.equal(finalizeReminderLabel('Pay Meraas on Nov 12'), 'Pay Meraas');
  });

  it('local day uses local components, not toISOString (Dubai 02:00 = prior UTC day)', async () => {
    // 2026-11-03 02:00 Asia/Dubai == 2026-11-02 22:00 UTC
    const dubaiEarly = new Date(Date.UTC(2026, 10, 2, 22, 0, 0));
    assert.equal(localDayKey(dubaiEarly), '2026-11-03');
    assert.equal(dubaiEarly.toISOString().slice(0, 10), '2026-11-02');
    assert.notEqual(localDayKey(dubaiEarly), dubaiEarly.toISOString().slice(0, 10));

    const applied = await applyWithWrongModel('Remind me to pay Meraas');
    assert.equal(
      remindAtFromUtterance('Remind me to pay Meraas', dubaiEarly),
      undefined
    );
    assert.equal(applied?.remindAt.slice(0, 10), LOCAL_DAY);
  });
});
