/**
 * Ask/Talk reminder parsing — on-device (lib/dates + applyActions).
 * Clock fixed at Wed 4 Nov 2026 Asia/Dubai. Run with:
 *   TZ=Asia/Dubai node --import tsx --test lib/__tests__/askReminderParse.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyChatActions } from '../chat/applyActions';
import type { ChatAction } from '../chat/types';
import {
  finalizeReminderLabel,
  isBareRemindMe,
  localDayKey,
  looksLikeReminder,
  looksLikeReminderEditCommand,
  parseIntervalReminder,
  parseReminderFromUtterance,
  parseRecurringWeekdayReminder,
  parseTimeOfDayFromUtterance,
  remindAtFromUtterance,
  reminderClarifyFromUtterance,
  remindTimeFromUtterance,
  splitDualRemindersFromUtterance,
  utteranceNamesRemindDate,
} from '../dates';
import type { InventoryItem } from '../InventoryContext';

const LOCAL_DAY = '2026-11-04';
/** Wednesday 4 Nov 2026 10:00 local (Asia/Dubai when TZ=Asia/Dubai). */
const FROM = new Date(2026, 10, 4, 10, 0, 0);

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

type Saved = {
  label: string;
  remindAt: string;
  remindTime?: string;
  remindInterval?: { unit: string; value?: number; weekdays?: number[]; hour?: number };
};

async function applyWithWrongModel(
  utterance: string,
  modelActions: ChatAction[] = [
    {
      type: 'set_reminder',
      label: 'Meraas Payment for 12th November',
      remindAt: LOCAL_DAY,
    },
  ],
  opts: {
    talkFocus?: { kind: 'lastDone'; id: string } | null;
    lastDoneList?: { id: string; label: string; remindAt?: string | null }[];
  } = {}
) {
  const saved: Saved[] = [];
  const updated: { id: string; patch: Record<string, unknown> }[] = [];
  await applyChatActions(modelActions, unusedInv, 'talk', {
    lastUserText: utterance,
    localDate: LOCAL_DAY,
    lastTalkFocus: opts.talkFocus ?? null,
    lastDoneList: opts.lastDoneList,
    lastDone: {
      logDone: async () => {
        throw new Error('should not mark done');
      },
      setReminder: async (input) => {
        saved.push({
          label: input.label,
          remindAt: input.remindAt,
          remindTime: input.remindTime,
          remindInterval: input.remindInterval
            ? {
                unit: input.remindInterval.unit,
                value: input.remindInterval.value,
                weekdays: input.remindInterval.weekdays,
                hour: input.remindInterval.hour,
              }
            : undefined,
        });
        return {
          id: `ld-${saved.length}`,
          label: input.label,
          remindAt: input.remindAt,
        };
      },
      updateActivity: async (id, patch) => {
        updated.push({ id, patch: { ...patch } });
        return {
          id,
          label: String(patch.label || opts.lastDoneList?.find((r) => r.id === id)?.label || 'Updated'),
          remindAt: typeof patch.remindAt === 'string' ? patch.remindAt : undefined,
        };
      },
    },
  });
  return { saved, updated };
}

describe('Ask/Talk reminder parse (clock Wed 4 Nov 2026 Asia/Dubai)', () => {
  it('anchors FROM to Wednesday 4 Nov 2026', () => {
    assert.equal(localDayKey(FROM), LOCAL_DAY);
    assert.equal(FROM.getDay(), 3);
  });

  it('Remind me on 12 Nov at 3pm to call the bank', async () => {
    const u = 'Remind me on 12 Nov at 3pm to call the bank';
    assert.equal(remindAtFromUtterance(u, FROM), '2026-11-12');
    assert.equal(remindTimeFromUtterance(u), '15:00');
    assert.equal(parseReminderFromUtterance(u)?.label, 'Call the bank');
    const { saved } = await applyWithWrongModel(u);
    assert.equal(saved.length, 1);
    assert.equal(saved[0]!.label, 'Call the bank');
    assert.equal(saved[0]!.remindAt, '2026-11-12');
    assert.equal(saved[0]!.remindTime, '15:00');
  });

  it('Remind me in 2 weeks to renew the visa', async () => {
    const u = 'Remind me in 2 weeks to renew the visa';
    assert.equal(remindAtFromUtterance(u, FROM), '2026-11-18');
    assert.equal(parseReminderFromUtterance(u)?.label, 'Renew the visa');
    const { saved } = await applyWithWrongModel(u);
    assert.equal(saved[0]!.remindAt, '2026-11-18');
    assert.equal(saved[0]!.label, 'Renew the visa');
  });

  it('Remind me the day after tomorrow to call mum', async () => {
    const u = 'Remind me the day after tomorrow to call mum';
    assert.equal(remindAtFromUtterance(u, FROM), '2026-11-06');
    assert.equal(parseReminderFromUtterance(u)?.label, 'Call mum');
    const { saved } = await applyWithWrongModel(u);
    assert.equal(saved[0]!.remindAt, '2026-11-06');
    assert.equal(saved[0]!.label, 'Call mum');
  });

  it('Pay rent on the 12th', async () => {
    const u = 'Pay rent on the 12th';
    assert.equal(remindAtFromUtterance(u, FROM), '2026-11-12');
    assert.equal(parseReminderFromUtterance(`Remind me to ${u}`)?.label, 'Pay rent');
    const { saved } = await applyWithWrongModel(u, [
      { type: 'set_reminder', label: 'Pay rent on the 12th', remindAt: LOCAL_DAY },
    ]);
    assert.equal(saved[0]!.remindAt, '2026-11-12');
    assert.equal(saved[0]!.label, 'Pay rent');
  });

  it('Remind me every 3 days to water plants', async () => {
    const u = 'Remind me every 3 days to water plants';
    const interval = parseIntervalReminder(u, FROM);
    assert.equal(interval?.remindInterval.unit, 'days');
    assert.equal(interval?.remindInterval.value, 3);
    assert.equal(interval?.remindInterval.hour, 9);
    assert.equal(parseReminderFromUtterance(u)?.label, 'Water plants');
    const { saved } = await applyWithWrongModel(u);
    assert.equal(saved[0]!.label, 'Water plants');
    assert.equal(saved[0]!.remindInterval?.unit, 'days');
    assert.equal(saved[0]!.remindInterval?.value, 3);
    assert.equal(saved[0]!.remindInterval?.hour, 9);
  });

  it('Remind me on weekdays to pack lunch', async () => {
    const u = 'Remind me on weekdays to pack lunch';
    const recurring = parseRecurringWeekdayReminder(u, FROM);
    assert.deepEqual(recurring?.remindInterval.weekdays, [1, 2, 3, 4, 5]);
    assert.equal(recurring?.remindInterval.hour, 9);
    assert.equal(parseReminderFromUtterance(u)?.label, 'Pack lunch');
    const { saved } = await applyWithWrongModel(u);
    assert.equal(saved[0]!.label, 'Pack lunch');
    assert.equal(saved[0]!.remindInterval?.unit, 'weekdays');
    assert.deepEqual(saved[0]!.remindInterval?.weekdays, [1, 2, 3, 4, 5]);
  });

  it('Email August about the proposal tomorrow — keep about in title', async () => {
    const u = 'Email August about the proposal tomorrow';
    assert.equal(remindAtFromUtterance(u, FROM), '2026-11-05');
    assert.equal(
      parseReminderFromUtterance(`Remind me to ${u}`)?.label,
      'Email August about the proposal'
    );
    const { saved } = await applyWithWrongModel(u, [
      { type: 'set_reminder', label: 'Email August', remindAt: LOCAL_DAY },
    ]);
    assert.equal(saved[0]!.label, 'Email August about the proposal');
    assert.equal(saved[0]!.remindAt, '2026-11-05');
  });

  it('Move the Meraas payment reminder to 15th Nov — edit, not create', async () => {
    const u = 'Move the Meraas payment reminder to 15th Nov';
    assert.equal(looksLikeReminder(u), false);
    assert.equal(looksLikeReminderEditCommand(u), true);
    assert.equal(remindAtFromUtterance(u, FROM), '2026-11-15');
    const { saved, updated } = await applyWithWrongModel(
      u,
      [
        { type: 'update_last_done', id: 'meraas-1', patch: { remindAt: '2026-11-15' } },
        { type: 'set_reminder', label: 'Move the Meraas payment reminder to', remindAt: LOCAL_DAY },
      ],
      {
        talkFocus: { kind: 'lastDone', id: 'meraas-1' },
        lastDoneList: [{ id: 'meraas-1', label: 'Meraas payment', remindAt: '2026-11-12' }],
      }
    );
    assert.equal(saved.length, 0);
    assert.equal(updated.length, 1);
    assert.equal(updated[0]!.id, 'meraas-1');
    assert.equal(updated[0]!.patch.remindAt, '2026-11-15');
  });

  it('Change the Meraas reminder to 10am — sets time on existing', async () => {
    const u = 'Change the Meraas reminder to 10am';
    assert.equal(looksLikeReminderEditCommand(u), true);
    assert.equal(remindTimeFromUtterance(u), '10:00');
    const { saved, updated } = await applyWithWrongModel(
      u,
      [{ type: 'update_last_done', id: 'meraas-1', patch: {} }],
      {
        talkFocus: { kind: 'lastDone', id: 'meraas-1' },
        lastDoneList: [{ id: 'meraas-1', label: 'Meraas payment', remindAt: '2026-11-12' }],
      }
    );
    assert.equal(saved.length, 0);
    assert.equal(updated.length, 1);
    assert.equal(updated[0]!.patch.remindTime, '10:00');
  });

  it('Remind me — clarify, do not create Reminder', async () => {
    const u = 'Remind me';
    assert.equal(isBareRemindMe(u), true);
    assert.equal(looksLikeReminder(u), false);
    assert.match(reminderClarifyFromUtterance(u, FROM) ?? '', /what should i remind/i);
    const { saved } = await applyWithWrongModel(u, [
      { type: 'set_reminder', label: 'Reminder', remindAt: LOCAL_DAY },
    ]);
    assert.equal(saved.length, 0);
  });

  it('Remind me to pay DEWA on 10 Nov and Salik on 15 Nov — two reminders', async () => {
    const u = 'Remind me to pay DEWA on 10 Nov and Salik on 15 Nov';
    const dual = splitDualRemindersFromUtterance(u, FROM);
    assert.ok(dual);
    assert.equal(dual!.length, 2);
    assert.equal(dual![0]!.remindAt, '2026-11-10');
    assert.equal(dual![1]!.remindAt, '2026-11-15');
    assert.equal(dual![0]!.label, 'Pay DEWA');
    const { saved } = await applyWithWrongModel(u, []);
    assert.equal(saved.length, 2);
    assert.equal(saved[0]!.remindAt, '2026-11-10');
    assert.equal(saved[1]!.remindAt, '2026-11-15');
  });

  it('Remind me on 31st Nov to pay rent — clarify invalid date', async () => {
    const u = 'Remind me on 31st Nov to pay rent';
    assert.equal(remindAtFromUtterance(u, FROM), undefined);
    assert.match(reminderClarifyFromUtterance(u, FROM) ?? '', /valid/i);
    const { saved } = await applyWithWrongModel(u, [
      { type: 'set_reminder', label: 'Pay rent', remindAt: LOCAL_DAY },
    ]);
    assert.equal(saved.length, 0);
  });

  it('new Remind me never edits a focused different reminder', async () => {
    const u = 'Remind me to call the bank on 12 Nov';
    const { saved, updated } = await applyWithWrongModel(
      u,
      [
        { type: 'set_reminder', label: 'Call the bank', remindAt: '2026-11-12' },
        { type: 'update_last_done', id: 'other-1', patch: { remindAt: '2026-11-12' } },
      ],
      {
        talkFocus: { kind: 'lastDone', id: 'other-1' },
        lastDoneList: [{ id: 'other-1', label: 'Maya dentist', remindAt: '2026-10-29' }],
      }
    );
    assert.equal(saved.length, 1);
    assert.equal(saved[0]!.label, 'Call the bank');
    assert.equal(updated.length, 0);
  });

  it('time phrases: 3pm, 2.30pm, noon, tonight, at 9, morning', () => {
    assert.equal(parseTimeOfDayFromUtterance('at 3pm')?.hour, 15);
    assert.equal(parseTimeOfDayFromUtterance('3 pm')?.hour, 15);
    assert.deepEqual(parseTimeOfDayFromUtterance('2.30pm'), { hour: 14, minute: 30 });
    assert.deepEqual(parseTimeOfDayFromUtterance('2:45pm'), { hour: 14, minute: 45 });
    assert.deepEqual(parseTimeOfDayFromUtterance('21:00'), { hour: 21, minute: 0 });
    assert.equal(parseTimeOfDayFromUtterance('at 9')?.hour, 9);
    assert.equal(parseTimeOfDayFromUtterance('noon')?.hour, 12);
    assert.equal(parseTimeOfDayFromUtterance('midnight')?.hour, 0);
    assert.equal(parseTimeOfDayFromUtterance('tonight')?.hour, 20);
    assert.equal(parseTimeOfDayFromUtterance('this evening')?.hour, 18);
    assert.equal(parseTimeOfDayFromUtterance('morning')?.hour, 9);
  });

  it('date phrases: next week=Monday, this weekend=Saturday, end of month, by Friday', () => {
    // next week → next Monday (documented). Wed 4 Nov → Mon 9 Nov.
    assert.equal(remindAtFromUtterance('next week', FROM), '2026-11-09');
    assert.equal(remindAtFromUtterance('this weekend', FROM), '2026-11-07');
    assert.equal(remindAtFromUtterance('end of the month', FROM), '2026-11-30');
    assert.equal(remindAtFromUtterance('by Friday', FROM), '2026-11-06');
    assert.equal(remindAtFromUtterance('in a week', FROM), '2026-11-11');
    assert.equal(remindAtFromUtterance('next month', FROM), '2026-12-04');
    assert.equal(remindAtFromUtterance('on 12-11-2026', FROM), '2026-11-12');
    assert.equal(remindAtFromUtterance('the twelfth', FROM), '2026-11-12');
  });

  it('on Sunday is one-off, not weekly', () => {
    const u = 'Remind me on Sunday to call mum';
    assert.equal(parseRecurringWeekdayReminder(u, FROM), undefined);
    assert.equal(remindAtFromUtterance(u, FROM), '2026-11-08');
  });

  it('Prepare for the presentation stays intact', () => {
    assert.equal(
      parseReminderFromUtterance('Remind me to Prepare for the presentation tomorrow')
        ?.label,
      'Prepare for the presentation'
    );
  });

  it('invalid / past / ambiguous do not fall back to today', () => {
    assert.equal(remindAtFromUtterance('31st Nov', FROM), undefined);
    assert.equal(remindAtFromUtterance('30 Feb', FROM), undefined);
    assert.equal(remindAtFromUtterance('12 Novmber', FROM), undefined);
    assert.equal(remindAtFromUtterance('yesterday', FROM), undefined);
    assert.equal(remindAtFromUtterance('12 Nov or 15 Nov', FROM), undefined);
    assert.ok(reminderClarifyFromUtterance('12 Nov or 15 Nov', FROM));
  });

  it('utteranceNamesRemindDate for day+month forms', () => {
    assert.equal(utteranceNamesRemindDate('12th Nov'), true);
    assert.equal(utteranceNamesRemindDate('Nov 12'), true);
    assert.equal(utteranceNamesRemindDate('I may need to pay rent'), false);
  });

  it('finalizeReminderLabel strips dates from model labels', () => {
    assert.equal(
      finalizeReminderLabel('Meraas Payment for 12th November'),
      'Meraas Payment'
    );
    assert.equal(finalizeReminderLabel('Pay Meraas on Nov 12'), 'Pay Meraas');
  });
});
