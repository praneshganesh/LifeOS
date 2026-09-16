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

  it('early morning: prev evening + 15m before (no morning-of)', () => {
    // Created well before: Wed Sep 9 noon; due Thu Sep 10 6:00
    const fires = computeAlertSchedule({
      dueDate: '2026-09-10',
      dueTime: { hour: 6, minute: 0 },
      createdAt: new Date(2026, 8, 9, 12, 0, 0),
      now: new Date(2026, 8, 9, 12, 0, 0),
    });
    assert.deepEqual(stamps(fires), [
      '2026-09-09 19:00:prev_day',
      '2026-09-10 05:45:mins_before',
    ]);
  });

  it('morning: prev evening + 2h + 15m', () => {
    const fires = computeAlertSchedule({
      dueDate: '2026-09-10',
      dueTime: { hour: 10, minute: 0 },
      createdAt: new Date(2026, 8, 9, 12, 0, 0),
      now: new Date(2026, 8, 9, 12, 0, 0),
    });
    assert.deepEqual(stamps(fires), [
      '2026-09-09 19:00:prev_day',
      '2026-09-10 08:00:hours_before',
      '2026-09-10 09:45:mins_before',
    ]);
  });

  it('afternoon: 24h before + 9am + 30m before', () => {
    const fires = computeAlertSchedule({
      dueDate: '2026-09-10',
      dueTime: { hour: 17, minute: 30 },
      createdAt: new Date(2026, 8, 9, 10, 0, 0),
      now: new Date(2026, 8, 9, 10, 0, 0),
    });
    assert.deepEqual(stamps(fires), [
      '2026-09-09 17:30:prev_day',
      '2026-09-10 09:00:morning_of',
      '2026-09-10 17:00:mins_before',
    ]);
  });

  it('evening: 9am + 1h + 15m', () => {
    const fires = computeAlertSchedule({
      dueDate: '2026-09-10',
      dueTime: { hour: 21, minute: 0 },
      createdAt: new Date(2026, 8, 9, 10, 0, 0),
      now: new Date(2026, 8, 9, 10, 0, 0),
    });
    assert.deepEqual(stamps(fires), [
      '2026-09-10 09:00:morning_of',
      '2026-09-10 20:00:hours_before',
      '2026-09-10 20:45:mins_before',
    ]);
  });

  it('all-day: 9am + 5pm', () => {
    const fires = computeAlertSchedule({
      dueDate: '2026-09-10',
      dueTime: null,
      createdAt: new Date(2026, 8, 9, 10, 0, 0),
      now: new Date(2026, 8, 9, 10, 0, 0),
    });
    assert.deepEqual(stamps(fires), [
      '2026-09-10 09:00:all_day',
      '2026-09-10 17:00:all_day_followup',
    ]);
  });

  it('skips alerts within 30 minutes of creation', () => {
    const fires = computeAlertSchedule({
      dueDate: '2026-09-10',
      dueTime: { hour: 17, minute: 0 },
      createdAt: new Date(2026, 8, 10, 16, 45, 0),
      now: new Date(2026, 8, 10, 16, 45, 0),
    });
    // 30m before = 16:30 already past; finals/create gap drops near-due noise
    assert.equal(fires.length, 0);
  });

  it('skips past planning alerts without backfill', () => {
    const fires = computeAlertSchedule({
      dueDate: '2026-09-10',
      dueTime: { hour: 17, minute: 30 },
      createdAt: new Date(2026, 8, 10, 14, 0, 0),
      now: new Date(2026, 8, 10, 14, 0, 0),
    });
    assert.deepEqual(stamps(fires), ['2026-09-10 17:00:mins_before']);
  });

  it('allows final early-morning alert inside quiet hours', () => {
    const fires = computeAlertSchedule({
      dueDate: '2026-09-10',
      dueTime: { hour: 6, minute: 0 },
      createdAt: new Date(2026, 8, 9, 12, 0, 0),
      now: new Date(2026, 8, 9, 20, 0, 0),
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
    });
    assert.ok(fires.some((f) => f.kind === 'mins_before'));
    assert.equal(
      stamps(fires).find((s) => s.includes('mins_before')),
      '2026-09-10 05:45:mins_before'
    );
  });

  it('custom mode replaces auto', () => {
    const fires = computeAlertSchedule({
      dueDate: '2026-09-10',
      dueTime: { hour: 17, minute: 30 },
      createdAt: new Date(2026, 8, 9, 10, 0, 0),
      now: new Date(2026, 8, 9, 10, 0, 0),
      alertMode: 'custom',
      userAlerts: [{ kind: 'mins_before', minutesBefore: 60 }],
    });
    assert.deepEqual(stamps(fires), ['2026-09-10 16:30:mins_before']);
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
});
