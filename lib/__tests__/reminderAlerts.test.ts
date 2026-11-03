import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeAlertSchedule,
  timeBandForDue,
  type AlertFire,
} from '../reminderAlerts';

function stamps(fires: AlertFire[]) {
  return fires.map((f) => {
    const d = f.at;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${f.kind}`;
  });
}

describe('reminder alert bands', () => {
  it('classifies due-time bands', () => {
    assert.equal(timeBandForDue({ hour: 6, minute: 0 }), 'early_morning');
    assert.equal(timeBandForDue({ hour: 8, minute: 0 }), 'early_morning');
    assert.equal(timeBandForDue({ hour: 8, minute: 1 }), 'morning');
    assert.equal(timeBandForDue({ hour: 10, minute: 0 }), 'morning');
    assert.equal(timeBandForDue({ hour: 12, minute: 0 }), 'afternoon');
    assert.equal(timeBandForDue({ hour: 17, minute: 30 }), 'afternoon');
    assert.equal(timeBandForDue({ hour: 18, minute: 0 }), 'afternoon');
    assert.equal(timeBandForDue({ hour: 18, minute: 1 }), 'evening');
    assert.equal(timeBandForDue({ hour: 21, minute: 0 }), 'evening');
    assert.equal(timeBandForDue(null), 'all_day');
  });

  it('timed: night before 7pm + 1 hour before due', () => {
    const fires = computeAlertSchedule({
      dueDate: '2026-09-10',
      dueTime: { hour: 10, minute: 0 },
      createdAt: new Date(2026, 8, 9, 12, 0, 0),
      now: new Date(2026, 8, 9, 12, 0, 0),
    });
    assert.deepEqual(stamps(fires), [
      '2026-09-09 19:00:prev_day',
      '2026-09-10 09:00:hours_before',
    ]);
  });

  it('timed early morning still uses night-before + 1h before', () => {
    const fires = computeAlertSchedule({
      dueDate: '2026-09-10',
      dueTime: { hour: 6, minute: 0 },
      createdAt: new Date(2026, 8, 9, 12, 0, 0),
      now: new Date(2026, 8, 9, 12, 0, 0),
    });
    assert.deepEqual(stamps(fires), [
      '2026-09-09 19:00:prev_day',
      '2026-09-10 05:00:hours_before',
    ]);
  });

  it('all-day: night before 7pm + 9am on due date', () => {
    const fires = computeAlertSchedule({
      dueDate: '2026-09-10',
      dueTime: null,
      createdAt: new Date(2026, 8, 9, 10, 0, 0),
      now: new Date(2026, 8, 9, 10, 0, 0),
    });
    assert.deepEqual(stamps(fires), [
      '2026-09-09 19:00:prev_day',
      '2026-09-10 09:00:all_day',
    ]);
  });

  it('skips day-before when it is already past at create time', () => {
    const fires = computeAlertSchedule({
      dueDate: '2026-09-10',
      dueTime: { hour: 17, minute: 0 },
      createdAt: new Date(2026, 8, 10, 10, 0, 0),
      now: new Date(2026, 8, 10, 10, 0, 0),
    });
    assert.deepEqual(stamps(fires), ['2026-09-10 16:00:hours_before']);
  });

  it('auto never fires at or after the due time', () => {
    const fires = computeAlertSchedule({
      dueDate: '2026-09-10',
      dueTime: { hour: 9, minute: 0 },
      createdAt: new Date(2026, 8, 9, 10, 0, 0),
      now: new Date(2026, 8, 9, 10, 0, 0),
    });
    assert.deepEqual(stamps(fires), [
      '2026-09-09 19:00:prev_day',
      '2026-09-10 08:00:hours_before',
    ]);
    assert.ok(fires.every((f) => f.at.getTime() < new Date(2026, 8, 10, 9, 0, 0).getTime()));
  });

  it('near-due create drops early autos but keeps at-due fallback', () => {
    const fires = computeAlertSchedule({
      dueDate: '2026-09-10',
      dueTime: { hour: 17, minute: 0 },
      createdAt: new Date(2026, 8, 10, 16, 45, 0),
      now: new Date(2026, 8, 10, 16, 45, 0),
    });
    // 1h before = 16:00 already past → single at-due fallback
    assert.deepEqual(stamps(fires), ['2026-09-10 17:00:at_time']);
  });

  it('allows 1h-before final alert inside quiet hours', () => {
    const fires = computeAlertSchedule({
      dueDate: '2026-09-10',
      dueTime: { hour: 6, minute: 0 },
      createdAt: new Date(2026, 8, 9, 12, 0, 0),
      now: new Date(2026, 8, 9, 20, 0, 0),
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
    });
    assert.deepEqual(stamps(fires), ['2026-09-10 05:00:hours_before']);
  });

  it('custom mode replaces auto and may still fire at due time', () => {
    const fires = computeAlertSchedule({
      dueDate: '2026-09-10',
      dueTime: { hour: 17, minute: 30 },
      createdAt: new Date(2026, 8, 9, 10, 0, 0),
      now: new Date(2026, 8, 9, 10, 0, 0),
      alertMode: 'custom',
      userAlerts: [{ kind: 'at_time' }],
    });
    assert.deepEqual(stamps(fires), ['2026-09-10 17:30:at_time']);
  });

  it('completed yields no alerts', () => {
    assert.deepEqual(
      computeAlertSchedule({
        dueDate: '2026-09-10',
        dueTime: { hour: 10, minute: 0 },
        createdAt: new Date(2026, 8, 9, 10, 0, 0),
        completed: true,
      }),
      []
    );
  });

  it('all-day due uses end of day so 9am auto alert is kept', () => {
    const fires = computeAlertSchedule({
      dueDate: '2026-09-10',
      dueTime: null,
      createdAt: new Date(2026, 8, 9, 10, 0, 0),
      now: new Date(2026, 8, 9, 10, 0, 0),
    });
    assert.ok(fires.some((f) => f.kind === 'all_day' && f.at.getHours() === 9));
  });

  it('falls back to at-due when every auto alert is dropped (timed <1h)', () => {
    const due = new Date(2026, 8, 10, 17, 0, 0);
    const now = new Date(2026, 8, 10, 16, 45, 0);
    const fires = computeAlertSchedule({
      dueDate: '2026-09-10',
      dueTime: { hour: 17, minute: 0 },
      createdAt: now,
      now,
    });
    assert.deepEqual(stamps(fires), ['2026-09-10 17:00:at_time']);
    assert.equal(fires[0]!.at.getTime(), due.getTime());
  });

  it('all-day fallback uses 7pm on due day when morning autos are past', () => {
    const fires = computeAlertSchedule({
      dueDate: '2026-09-10',
      dueTime: null,
      createdAt: new Date(2026, 8, 10, 10, 0, 0),
      now: new Date(2026, 8, 10, 10, 0, 0),
    });
    assert.deepEqual(stamps(fires), ['2026-09-10 19:00:at_time']);
  });

  it('all-day fallback schedules nothing after 7pm on due day', () => {
    const fires = computeAlertSchedule({
      dueDate: '2026-09-10',
      dueTime: null,
      createdAt: new Date(2026, 8, 10, 20, 0, 0),
      now: new Date(2026, 8, 10, 20, 0, 0),
    });
    assert.deepEqual(fires, []);
  });
});
