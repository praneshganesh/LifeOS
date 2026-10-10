import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  agendaQueryScope,
  hrefForAgendaScope,
  nextMonthDayRange,
  nextWeekDayRange,
  parseAgendaQuery,
  resolveHabitStatusIntent,
  resolveLocalIntent,
  resolveNamedDueIntent,
  thisWeekDayRange,
} from '../chat/localIntents';
import { localDayKey } from '../dates';

describe('agenda / reminder list intents', () => {
  it('maps common list phrases to a scope', () => {
    assert.equal(agendaQueryScope('show me my reminders'), 'reminders');
    assert.equal(agendaQueryScope("show me today's reminders"), 'today');
    assert.equal(agendaQueryScope("What's in store for tomorrow?"), 'tomorrow');
    assert.equal(agendaQueryScope('What are my priorities today?'), 'today');
    assert.equal(agendaQueryScope("What's due for today?"), 'today');
    assert.equal(agendaQueryScope("what's coming up"), 'coming');
    assert.equal(agendaQueryScope("what's overdue?"), 'overdue');
    assert.equal(agendaQueryScope("what's due for next week?"), 'week');
    assert.equal(agendaQueryScope("what's due this week"), 'this_week');
    assert.equal(agendaQueryScope("what's due next month"), 'month');
    assert.equal(agendaQueryScope("what's due this month"), 'this_month');
    assert.equal(agendaQueryScope('anything this weekend'), 'weekend');
    assert.equal(agendaQueryScope('what renews soon'), 'renewals');
    assert.equal(agendaQueryScope('what did I finish today'), 'done');
    assert.equal(agendaQueryScope('Remind me to stretch tomorrow'), null);
    assert.equal(parseAgendaQuery('what is due in 3 days')?.scope, 'window');
    assert.equal(parseAgendaQuery('anything due by Friday')?.scope, 'window');
  });

  it('replies without creating actions', () => {
    const local = resolveLocalIntent('What are my priorities today?', {
      openHabits: [{ title: 'Walk' }],
      reminders: [
        { label: 'PE uniform', remindAt: '2099-01-01' },
        { label: 'Pack lunch', remindAt: new Date().toISOString().slice(0, 10) },
      ],
    });
    assert.ok(local);
    assert.equal(local!.actions[0]?.type, 'none');
    assert.match(local!.reply, /^Today\n/);
    assert.match(local!.reply, /Walk · Habit/);
    assert.match(local!.reply, /Pack lunch · Reminder/);
    assert.doesNotMatch(local!.reply, /Habits:/);
    assert.equal(hrefForAgendaScope('today'), '/(tabs)/');
    assert.equal(hrefForAgendaScope('reminders'), '/tasks');
  });

  it('lists today as rows, one line per habit or class', () => {
    const local = resolveLocalIntent('what is on today', {
      openHabits: [{ title: 'Walking' }],
      classesToday: [
        { title: 'Piano', when: '4:00 PM' },
        { title: 'Skating' },
      ],
    });
    assert.ok(local);
    assert.equal(
      local!.reply,
      'Today\nPiano · 4:00 PM\nSkating · Class\nWalking · Habit'
    );
  });

  it('lists overdue attention items', () => {
    const local = resolveLocalIntent("what's overdue?", {
      overdue: [
        { title: 'Emirates ID' },
        { title: 'FAB clearance letter' },
      ],
    });
    assert.ok(local);
    assert.match(local!.reply, /Overdue/i);
    assert.match(local!.reply, /Emirates ID/);
  });

  it('lists next week / next month from horizon', () => {
    const week = nextWeekDayRange(new Date('2026-09-25T12:00:00'));
    const month = nextMonthDayRange(new Date('2026-09-25T12:00:00'));
    assert.equal(week.start, '2026-09-28');
    assert.equal(week.end, '2026-10-04');
    assert.equal(month.start, '2026-10-01');
    assert.equal(month.end, '2026-10-31');

    const liveWeek = nextWeekDayRange();
    const live = resolveLocalIntent("what's due for next week?", {
      horizon: [
        { title: 'Skate gear', dayKey: liveWeek.start },
        { title: 'Far away', dayKey: '2099-01-01' },
      ],
    });
    assert.ok(live);
    assert.match(live!.reply, /Next week/i);
    assert.match(live!.reply, /Skate gear/);
    assert.doesNotMatch(live!.reply, /Far away/);

    const thisWeek = thisWeekDayRange();
    const tw = resolveLocalIntent("what's due this week?", {
      horizon: [{ title: 'In this week', dayKey: thisWeek.end }],
    });
    assert.ok(tw);
    assert.match(tw!.reply, /This week/i);
    assert.match(tw!.reply, /In this week/);
  });

  it('filters by person', () => {
    const liveWeek = nextWeekDayRange();
    const local = resolveLocalIntent("what's due next week for Ishaan?", {
      people: [
        { name: 'Ishaan', isSelf: false },
        { name: 'Pranesh', isSelf: true },
      ],
      horizon: [
        { title: 'Skating', dayKey: liveWeek.start, who: 'Ishaan' },
        { title: 'Work stuff', dayKey: liveWeek.start, who: 'Pranesh' },
      ],
    });
    assert.ok(local);
    assert.match(local!.reply, /Skating/);
    assert.doesNotMatch(local!.reply, /Work stuff/);
  });

  it('answers named due / habit status', () => {
    const named = resolveNamedDueIntent('when does Emirates ID expire?', {
      overdue: [{ title: 'Emirates ID' }],
    });
    assert.ok(named);
    assert.match(named!.reply, /overdue/i);

    const habit = resolveHabitStatusIntent('did I meditate today?', {
      habits: [{ title: 'Meditate', doneToday: false, streak: 3 }],
    });
    assert.ok(habit);
    assert.match(habit!.reply, /Not yet/i);
    assert.match(habit!.reply, /Meditate/);
  });

  it('lists reminders as rows and leaves classes out', () => {
    const local = resolveLocalIntent('show me my reminders', {
      reminders: [
        { label: 'PE uniform', remindAt: '2099-01-06' },
        { label: "Check for Mauritius's tickets tonight", remindAt: '2099-03-19' },
      ],
      nextClass: { title: 'Skating class', when: 'today 10:00 am' },
    });
    assert.ok(local);
    assert.match(local!.reply, /^Reminders\n/);
    assert.match(local!.reply, /PE uniform · Jan 6, 2099/);
    assert.match(local!.reply, /Mauritius/);
    assert.doesNotMatch(local!.reply, /Skating/);
    assert.doesNotMatch(local!.reply, /;/);
  });

  it('opens one named reminder instead of reading the whole list', () => {
    const local = resolveLocalIntent('show me the mauritius reminder', {
      reminders: [
        { id: 'pe', label: 'PE uniform', remindAt: '2099-01-06' },
        {
          id: 'mu',
          label: "Check for Mauritius's tickets tonight",
          remindAt: localDayKey(),
        },
      ],
    });
    assert.ok(local);
    assert.match(local!.reply, /Mauritius/i);
    assert.match(local!.reply, /Today/);
    assert.doesNotMatch(local!.reply, /PE uniform/);
    assert.equal(local!.actions[0]?.type, 'open_last_done');
    if (local!.actions[0]?.type === 'open_last_done') {
      assert.equal(local!.actions[0].id, 'mu');
    }
  });

  it('lists done today and renewals', () => {
    const done = resolveLocalIntent('what did I finish today?', {
      doneToday: [{ title: 'Meditate' }, { title: 'Packed lunch' }],
    });
    assert.ok(done);
    assert.match(done!.reply, /Done today/i);
    assert.match(done!.reply, /Meditate/);

    const renew = resolveLocalIntent('what renews soon?', {
      renewals: [{ title: 'Netflix', dayKey: '2099-02-01' }],
    });
    assert.ok(renew);
    assert.match(renew!.reply, /Renewals/i);
    assert.match(renew!.reply, /Netflix/);
  });
});
