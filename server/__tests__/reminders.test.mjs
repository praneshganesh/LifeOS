import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ensureReminderActions,
  parseReminderFromUtterance,
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
});
