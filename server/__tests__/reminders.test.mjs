import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ensureReminderActions,
  parseReminderFromUtterance,
  parseRecurringWeekdayReminder,
  remindAtFromUtterance,
  reminderLabelFromUtterance,
} from '../reminders.mjs';

describe('chat-api reminder repair', () => {
  it('injects set_reminder for next Tuesday', () => {
    const sat = new Date(2026, 7, 15);
    assert.equal(
      remindAtFromUtterance(
        'Log a reminder to apply for renewed passport next Tuesday',
        sat
      ),
      '2026-08-18'
    );
    const next = ensureReminderActions(
      [],
      'Log a reminder to apply for renewed passport next Tuesday',
      [{ id: 'inv-pp', name: 'Passport' }]
    );
    assert.equal(next[0]?.type, 'set_reminder');
    assert.equal(next[0]?.label, 'Apply for renewed passport');
    assert.equal(next[0]?.inventoryItemId, 'inv-pp');
    assert.match(next[0]?.remindAt ?? '', /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(
      reminderLabelFromUtterance(
        'Log a reminder to apply for renewed passport next Tuesday'
      ),
      'Apply for renewed passport'
    );
  });

  it('parses calendar day and splits label from notes', () => {
    const sep = new Date(2026, 8, 1);
    const utterance =
      "Remind me about Mira's payment on 10th November it's for a off plan property purchase";
    assert.equal(remindAtFromUtterance(utterance, sep), '2026-11-10');
    const parsed = parseReminderFromUtterance(utterance);
    assert.equal(parsed?.label, "Mira's payment");
    assert.match(parsed?.notes ?? '', /off plan property/i);
    const next = ensureReminderActions([], utterance, []);
    assert.equal(next[0]?.type, 'set_reminder');
    assert.equal(next[0]?.label, "Mira's payment");
    assert.equal(next[0]?.remindAt, '2026-11-10');
    assert.match(next[0]?.note ?? '', /off plan property/i);
  });

  it('parses every Tuesday and Friday at 6:30 AM', () => {
    // Wednesday 9 Sep 2026 12:00 — next fire is Friday 11 Sep
    const wed = new Date(2026, 8, 9, 12, 0, 0);
    const utterance =
      'Remind me every Tuesday and Friday at 6:30 AM to stretch';
    const recurring = parseRecurringWeekdayReminder(utterance, wed);
    assert.ok(recurring);
    assert.deepEqual(recurring?.remindInterval.weekdays, [2, 5]);
    assert.equal(recurring?.remindInterval.hour, 6);
    assert.equal(recurring?.remindInterval.minute, 30);
    assert.equal(recurring?.remindAt, '2026-09-11');
    assert.equal(remindAtFromUtterance(utterance, wed), '2026-09-11');
    assert.equal(parseReminderFromUtterance(utterance)?.label, 'Stretch');
    const next = ensureReminderActions([], utterance, [], wed);
    assert.equal(next[0]?.type, 'set_reminder');
    assert.equal(next[0]?.remindAt, '2026-09-11');
    assert.equal(next[0]?.remindInterval?.unit, 'weekdays');
    assert.deepEqual(next[0]?.remindInterval?.weekdays, [2, 5]);
  });

  it('parses for 8 weeks end date', () => {
    const wed = new Date(2026, 8, 9, 12, 0, 0);
    const next = ensureReminderActions(
      [],
      'Remind me every Tuesday and Friday at 6:30 AM for 8 weeks to stretch',
      [],
      wed
    );
    assert.equal(next[0]?.remindInterval?.endsAt, '2026-11-04');
  });

  it('drops leading for from reminder titles', () => {
    assert.equal(
      reminderLabelFromUtterance(
        'Set a reminder for PE uniform every Tuesday and Friday'
      ),
      'PE uniform'
    );
    const next = ensureReminderActions(
      [{ type: 'set_reminder', label: 'For PE uniform in the morning', remindAt: '2026-09-15' }],
      'Remind me for PE uniform in the morning every Tuesday and Friday',
      []
    );
    assert.equal(next[0]?.label, 'PE uniform in the morning');
  });
});
