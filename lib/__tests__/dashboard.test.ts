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

  it('puts unchecked habits in the checklist', () => {
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
    assert.equal(dash.checklist[0]?.habitId, habit.id);
    assert.equal(dash.checklist[0]?.done, false);
  });

  it('shows owner names for others but never for yourself', () => {
    const own = createHabit({ title: 'Walk', assignedTo: 'Pranesh' });
    const kids = createHabit({ title: 'Reading', assignedTo: 'Saara' });
    const dash = buildDashboard({
      inventory: [],
      lastDone: [],
      subscriptions: [],
      classPacks: [],
      habits: [own, kids],
      selfName: 'Pranesh',
      now: new Date(`${dayKey()}T12:00:00`),
    });
    const ownRow = dash.checklist.find((r) => r.habitId === own.id);
    const kidsRow = dash.checklist.find((r) => r.habitId === kids.id);
    assert.equal(ownRow?.meta, undefined);
    assert.equal(kidsRow?.meta, 'Saara');
  });
});
