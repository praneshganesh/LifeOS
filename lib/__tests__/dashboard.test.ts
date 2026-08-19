import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDashboard, givenName } from '../dashboard';
import { createHabit, dayKey } from '../habits';

describe('dashboard', () => {
  it('uses the first given name, never You', () => {
    assert.equal(givenName('Pranesh Ganesh'), 'Pranesh');
    assert.equal(givenName('You'), '');
    assert.equal(givenName(''), '');
  });

  it('puts unchecked habits in Today', () => {
    const habit = createHabit({ title: 'Walk' });
    const dash = buildDashboard({
      inventory: [],
      lastDone: [],
      subscriptions: [],
      classPacks: [],
      habits: [habit],
      now: new Date(`${dayKey()}T12:00:00`),
    });
    assert.equal(dash.habitsOpen, 1);
    assert.equal(dash.today[0]?.habitId, habit.id);
    assert.equal(dash.featured?.habitId, habit.id);
    assert.equal(dash.featured?.icon, 'sparkles');
  });
});
