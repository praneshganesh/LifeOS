import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { repairActions } from '../chat.mjs';

describe('create habit vs check-in', () => {
  it('does not check in when the user asked to create a habit', () => {
    const next = repairActions(
      [{ type: 'habit_check_in', title: 'Meditate' }],
      {
        lastUserText: 'Create a new habit to meditate every day for 15 minutes',
      }
    );
    assert.equal(next.length, 1);
    assert.equal(next[0].type, 'add_habit');
    assert.equal(next[0].title, 'Meditate');
    assert.match(next[0].why, /15 minutes/);
    assert.match(next[0].why, /every day/);
  });

  it('still checks in a completed habit', () => {
    const next = repairActions([{ type: 'habit_check_in', title: 'Meditate' }], {
      lastUserText: 'I meditated today',
    });
    assert.equal(next[0].type, 'habit_check_in');
  });
});
