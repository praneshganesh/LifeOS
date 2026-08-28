import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createClassPack } from '../classes';
import {
  calculateUpcomingClassTriggers,
  parseScheduleTime,
} from '../classSchedule';

describe('class notification scheduling', () => {
  it('parses various time string formats', () => {
    assert.deepEqual(parseScheduleTime('10:00 AM'), { hours: 10, minutes: 0 });
    assert.deepEqual(parseScheduleTime('10:30 am'), { hours: 10, minutes: 30 });
    assert.deepEqual(parseScheduleTime('4:30 PM'), { hours: 16, minutes: 30 });
    assert.deepEqual(parseScheduleTime('12:00 PM'), { hours: 12, minutes: 0 });
    assert.deepEqual(parseScheduleTime('12:00 AM'), { hours: 0, minutes: 0 });
    assert.deepEqual(parseScheduleTime(''), { hours: 9, minutes: 0 });
  });

  it('generates day-before and day-of triggers for upcoming classes', () => {
    // Friday Aug 28, 2026 at 10:00 AM
    const now = new Date(2026, 7, 28, 10, 0, 0);

    const pack = createClassPack({
      id: 'cls-test-1',
      title: 'Skating',
      assignedTo: 'Ishaan',
      total: 12,
      scheduleDays: ['saturday'],
      scheduleTime: '10:00 AM',
      startsOn: '2026-08-01',
      endsOn: '2026-11-01',
    });

    const triggers = calculateUpcomingClassTriggers(pack, now, 2);
    assert.ok(triggers.length > 0);

    // First trigger should be Friday Aug 28 at 18:00 (day before Saturday class)
    const eveTrigger = triggers.find((t) => t.identifier.includes('eve-2026-08-29'));
    assert.ok(eveTrigger);
    assert.equal(eveTrigger.title, 'Ishaan · Skating class tomorrow');
    assert.equal(eveTrigger.body, 'Ishaan has Skating class is tomorrow at 10:00 AM.');
    assert.equal(eveTrigger.date.getFullYear(), 2026);
    assert.equal(eveTrigger.date.getMonth(), 7); // Aug
    assert.equal(eveTrigger.date.getDate(), 28);
    assert.equal(eveTrigger.date.getHours(), 18);

    // Second trigger should be Saturday Aug 29 morning (day of Saturday class)
    const dayTrigger = triggers.find((t) => t.identifier.includes('day-2026-08-29'));
    assert.ok(dayTrigger);
    assert.equal(dayTrigger.title, 'Ishaan · Skating class today');
    assert.equal(dayTrigger.body, 'Ishaan has Skating class is today at 10:00 AM.');
    assert.equal(dayTrigger.date.getFullYear(), 2026);
    assert.equal(dayTrigger.date.getMonth(), 7); // Aug
    assert.equal(dayTrigger.date.getDate(), 29);
  });

  it('generates day-before and day-of triggers for upcoming classes', () => {
    // Friday Aug 28, 2026 at 10:00 AM
    const now = new Date(2026, 7, 28, 10, 0, 0);

    const pack = createClassPack({
      id: 'cls-test-1',
      title: 'Skating',
      assignedTo: 'Ishaan',
      total: 12,
      scheduleDays: ['saturday'],
      scheduleTime: '10:00 AM',
      startsOn: '2026-08-01',
      endsOn: '2026-11-01',
    });

    const triggers = calculateUpcomingClassTriggers(pack, now, 2);
    assert.ok(triggers.length > 0);

    // First trigger should be Friday Aug 28 at 18:00 (day before Saturday class)
    const eveTrigger = triggers.find((t) => t.identifier.includes('eve-2026-08-29'));
    assert.ok(eveTrigger);
    assert.equal(eveTrigger.title, 'Ishaan · Skating class tomorrow');
    assert.equal(eveTrigger.body, 'Ishaan has Skating class is tomorrow at 10:00 AM.');
    assert.equal(eveTrigger.date.getFullYear(), 2026);
    assert.equal(eveTrigger.date.getMonth(), 7); // Aug
    assert.equal(eveTrigger.date.getDate(), 28);
    assert.equal(eveTrigger.date.getHours(), 18);

    // Second trigger should be Saturday Aug 29 morning (day of Saturday class at 8:00 AM)
    const dayTrigger = triggers.find((t) => t.identifier.includes('day-2026-08-29'));
    assert.ok(dayTrigger);
    assert.equal(dayTrigger.title, 'Ishaan · Skating class today');
    assert.equal(dayTrigger.body, 'Ishaan has Skating class is today at 10:00 AM.');
    assert.equal(dayTrigger.date.getFullYear(), 2026);
    assert.equal(dayTrigger.date.getMonth(), 7); // Aug
    assert.equal(dayTrigger.date.getDate(), 29);
    assert.equal(dayTrigger.date.getHours(), 8);
    assert.equal(dayTrigger.date.getMinutes(), 0);
  });

  it('generates 8 AM morning reminder for 9 AM and 11 AM classes, but only 6 PM eve reminder for 7 AM class', () => {
    // Friday Aug 28, 2026 at 10:00 AM
    const now = new Date(2026, 7, 28, 10, 0, 0);

    // 11 AM class -> Friday 6 PM + Saturday 8 AM
    const pack11 = createClassPack({
      id: 'cls-11',
      title: 'Skating',
      scheduleDays: ['saturday'],
      scheduleTime: '11:00 AM',
      startsOn: '2026-08-01',
      endsOn: '2026-11-01',
    });
    const triggers11 = calculateUpcomingClassTriggers(pack11, now, 1);
    assert.equal(triggers11.length, 2);
    assert.ok(triggers11.some((t) => t.identifier.includes('eve-2026-08-29')));
    assert.ok(triggers11.some((t) => t.identifier.includes('day-2026-08-29')));

    // Defaulted 9 AM class (scheduleTime omitted) -> Friday 6 PM + Saturday 8 AM
    const packInferred9 = createClassPack({
      id: 'cls-inf9',
      title: 'Skating',
      scheduleDays: ['saturday'],
      startsOn: '2026-08-01',
      endsOn: '2026-11-01',
    });
    assert.equal(packInferred9.scheduleTime, '9:00 AM');
    assert.equal(packInferred9.scheduleTimeInferred, true);
    const triggers9 = calculateUpcomingClassTriggers(packInferred9, now, 1);
    assert.equal(triggers9.length, 2);
    assert.ok(triggers9.some((t) => t.identifier.includes('eve-2026-08-29')));
    assert.ok(triggers9.some((t) => t.identifier.includes('day-2026-08-29')));

    // 7 AM class -> Friday 6 PM only (no 8 AM day reminder since class is before 8 AM)
    const pack7 = createClassPack({
      id: 'cls-7',
      title: 'Swimming',
      scheduleDays: ['saturday'],
      scheduleTime: '7:00 AM',
      startsOn: '2026-08-01',
      endsOn: '2026-11-01',
    });
    const triggers7 = calculateUpcomingClassTriggers(pack7, now, 1);
    assert.equal(triggers7.length, 1);
    assert.ok(triggers7[0].identifier.includes('eve-2026-08-29'));
  });

  it('respects startsOn and endsOn boundaries', () => {
    // Friday Aug 28, 2026
    const now = new Date(2026, 7, 28, 10, 0, 0);

    // startsOn in future: Sept 15 -> no August triggers
    const futurePack = createClassPack({
      id: 'cls-future',
      title: 'Skating',
      scheduleDays: ['saturday'],
      scheduleTime: '11:00 AM',
      startsOn: '2026-09-15',
      endsOn: '2026-12-15',
    });
    const triggersFuture = calculateUpcomingClassTriggers(futurePack, now, 4);
    for (const t of triggersFuture) {
      assert.ok(t.date >= new Date(2026, 8, 14)); // Mid-Sept onwards
    }

    // endsOn: Sept 01 -> only triggers before/on Sept 01
    const endingPack = createClassPack({
      id: 'cls-ending',
      title: 'Skating',
      scheduleDays: ['saturday'],
      scheduleTime: '11:00 AM',
      startsOn: '2026-08-01',
      endsOn: '2026-09-01',
    });
    const triggersEnding = calculateUpcomingClassTriggers(endingPack, now, 4);
    // Saturday Aug 29 is within window; Saturday Sept 5 is after Sept 1
    assert.equal(triggersEnding.length, 2);
    assert.ok(triggersEnding.every((t) => t.identifier.includes('2026-08-29')));
  });

  it('limits occurrences by remaining class count', () => {
    // Friday Aug 28, 2026
    const now = new Date(2026, 7, 28, 10, 0, 0);

    // 12 total, 11 completed -> remaining = 1
    const singleLeftPack = createClassPack({
      id: 'cls-single',
      title: 'Skating',
      total: 12,
      completed: 11,
      scheduleDays: ['saturday'],
      scheduleTime: '11:00 AM',
      startsOn: '2026-08-01',
      endsOn: '2026-11-01',
    });
    const triggers = calculateUpcomingClassTriggers(singleLeftPack, now, 4);
    // Exactly 1 class occurrence (Aug 29) -> 2 triggers (eve + day)
    assert.equal(triggers.length, 2);
    assert.ok(triggers.every((t) => t.identifier.includes('2026-08-29')));
  });

  it('processes multiple schedule days chronologically', () => {
    // Friday Aug 28, 2026
    const now = new Date(2026, 7, 28, 10, 0, 0);

    // Tuesday + Thursday, remaining = 2
    // Next Tuesday is Sept 1, Next Thursday is Sept 3
    const multiDayPack = createClassPack({
      id: 'cls-multi',
      title: 'Swimming',
      total: 10,
      completed: 8, // 2 remaining
      scheduleDays: ['tuesday', 'thursday'],
      scheduleTime: '10:00 AM',
      startsOn: '2026-08-01',
      endsOn: '2026-11-01',
    });
    const triggers = calculateUpcomingClassTriggers(multiDayPack, now, 4);
    // 2 occurrences (Tuesday Sept 1 & Thursday Sept 3) -> each gets eve + day = 4 triggers
    assert.equal(triggers.length, 4);
    assert.ok(triggers[0].identifier.includes('eve-2026-09-01'));
    assert.ok(triggers[1].identifier.includes('day-2026-09-01'));
    assert.ok(triggers[2].identifier.includes('eve-2026-09-03'));
    assert.ok(triggers[3].identifier.includes('day-2026-09-03'));
  });

  it('does not schedule notifications for times already passed', () => {
    // Current time: Saturday Aug 29 at 9:00 AM
    // Class: Saturday Aug 29 at 11:00 AM
    // Friday 6 PM has passed, Saturday 8 AM has passed -> 0 triggers for today's class
    const now = new Date(2026, 7, 29, 9, 0, 0);

    const pack = createClassPack({
      id: 'cls-past',
      title: 'Skating',
      scheduleDays: ['saturday'],
      scheduleTime: '11:00 AM',
      startsOn: '2026-08-01',
      endsOn: '2026-11-01',
    });
    const triggers = calculateUpcomingClassTriggers(pack, now, 2);
    // First upcoming occurrence with valid future trigger is next Saturday Sept 5
    for (const t of triggers) {
      assert.ok(t.date > now);
      assert.ok(!t.identifier.includes('2026-08-29'));
    }
  });

  it('does not generate triggers if all classes are used or pack is expired', () => {
    const now = new Date(2026, 7, 28, 10, 0, 0);

    const fullPack = createClassPack({
      id: 'cls-test-2',
      title: 'Skating',
      total: 6,
      completed: 6, // 0 left
      scheduleDays: ['saturday'],
      startsOn: '2026-08-01',
      endsOn: '2026-11-01',
    });

    const triggers = calculateUpcomingClassTriggers(fullPack, now);
    assert.equal(triggers.length, 0);
  });
});
