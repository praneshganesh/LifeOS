import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDashboard, givenName } from '../dashboard';
import { createHabit, dayKey } from '../habits';
import { createClassPack } from '../classes';
import { reminderTodayProgress } from '../lastDone';

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
    assert.equal(dash.today[0]?.subtitle, 'Habit');
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
    const ownRow = dash.today.find((r) => r.habitId === own.id);
    const kidsRow = dash.today.find((r) => r.habitId === kids.id);
    assert.equal(ownRow?.subtitle, 'Habit');
    assert.equal(kidsRow?.subtitle, 'Saara');
  });

  it('shows scheduled class in due-soon attention items on Friday before Saturday class', () => {
    // Friday Aug 28, 2026
    const friday = new Date(2026, 7, 28, 12, 0, 0);
    const skatingPack = createClassPack({
      title: 'Skating',
      assignedTo: 'Ishaan',
      total: 12,
      scheduleDays: ['saturday'],
      scheduleTime: '10:00 AM',
      startsOn: '2026-08-01',
      endsOn: '2026-11-01',
    });

    const dash = buildDashboard({
      inventory: [],
      lastDone: [],
      subscriptions: [],
      classPacks: [skatingPack],
      habits: [],
      now: friday,
    });

    const classAttention = dash.next.find((a) => a.id.startsWith('cls-sched-'));
    assert.ok(classAttention);
    assert.equal(classAttention.title, 'Ishaan · Skating class tomorrow');
    assert.match(classAttention.subtitle, /10:00 AM/);
  });

  it('does not double the word class when the title already has it', () => {
    const friday = new Date(2026, 7, 28, 12, 0, 0);
    const pack = createClassPack({
      title: 'Skating class',
      total: 12,
      scheduleDays: ['saturday'],
      scheduleTime: '10:00 AM',
      startsOn: '2026-08-01',
      endsOn: '2026-11-01',
    });
    const dash = buildDashboard({
      inventory: [],
      lastDone: [],
      subscriptions: [],
      classPacks: [pack],
      habits: [],
      now: friday,
    });
    const row = dash.next.find((a) => a.id.startsWith('cls-sched-'));
    assert.equal(row?.title, 'Skating class tomorrow');
  });

  it('keeps a reminder done today out of Coming up', () => {
    const today = dayKey();
    const tomorrow = dayKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const dash = buildDashboard({
      inventory: [],
      lastDone: [
        {
          id: 'pe',
          label: 'PE uniform',
          createdAt: '2026-09-01T08:00:00.000Z',
          logs: [{ id: 'log-1', doneAt: today }],
          remindAt: tomorrow,
          remindInterval: { unit: 'weekdays', value: 1, weekdays: [0, 1, 2, 3, 4, 5, 6] },
        },
      ],
      subscriptions: [],
      classPacks: [],
      habits: [],
      now: new Date(`${today}T12:00:00`),
    });
    assert.ok(dash.doneToday.some((r) => r.lastDoneId === 'pe'));
    assert.ok(!dash.next.some((r) => r.lastDoneId === 'pe'));
    assert.ok(!dash.today.some((r) => r.lastDoneId === 'pe'));
  });
});

describe('reminderTodayProgress', () => {
  it('matches Habits-style done/total for today’s reminders', () => {
    const today = dayKey();
    const open: Parameters<typeof reminderTodayProgress>[0][number] = {
      id: 'ld-open',
      label: 'Pay rent',
      createdAt: `${today}T08:00:00.000Z`,
      logs: [],
      remindAt: today,
    };
    const doneOnce: Parameters<typeof reminderTodayProgress>[0][number] = {
      id: 'ld-done',
      label: 'Review Will document',
      createdAt: '2026-09-01T08:00:00.000Z',
      logs: [{ id: 'log-1', doneAt: today }],
      // one-shot cleared on mark-done
    };
    const progress = reminderTodayProgress([open, doneOnce], new Date(`${today}T12:00:00`));
    assert.equal(progress.done, 1);
    assert.equal(progress.total, 2);
  });
});
