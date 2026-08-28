import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classCompletedCountFromUtterance,
  classDeadlineFromUtterance,
  classPackFromUtterance,
  classScheduleDaysFromUtterance,
  classScheduleTimeFromUtterance,
  classTitleFromUtterance,
  createClassPack,
  findClassPack,
  loggedOn,
  looksLikeClassAttendance,
  looksLikeClassEnrollment,
  mergeClassPackUpdate,
  nextScheduledClassOccurrence,
  normalizeScheduleDays,
  pickAttendancePack,
  remainingCount,
  toggleLogForDay,
  usedCount,
} from '../classes';
import { addCalendarMonths } from '../dates';

describe('classDeadlineFromUtterance', () => {
  it('maps "before November" to the upcoming 1 November', () => {
    const d = classDeadlineFromUtterance(
      'I have 12 classes to take before November',
      new Date(2026, 7, 27) // Aug 2026
    );
    assert.equal(d, '2026-11-01');
  });

  it('rolls to next year when the month already passed', () => {
    const d = classDeadlineFromUtterance(
      'finish these by March',
      new Date(2026, 7, 27)
    );
    assert.equal(d, '2027-03-01');
  });

  it('uses the last day for "end of" phrasing', () => {
    const d = classDeadlineFromUtterance(
      'wrap up before the end of November',
      new Date(2026, 7, 27)
    );
    assert.equal(d, '2026-11-30');
  });

  it('returns undefined without a deadline phrase', () => {
    assert.equal(classDeadlineFromUtterance('I enrolled for skating'), undefined);
  });
});

describe('class packs', () => {
  it('counts remaining sessions and toggles a day', () => {
    const pack = createClassPack({
      title: 'Skating',
      total: 24,
      months: 3,
      startsOn: '2026-08-15',
    });
    assert.equal(pack.endsOn, '2026-11-15');
    assert.equal(usedCount(pack), 0);
    assert.equal(remainingCount(pack), 24);

    const once = toggleLogForDay(pack, '2026-08-16');
    assert.equal(usedCount(once), 1);
    assert.equal(loggedOn(once, '2026-08-16'), true);

    const undone = toggleLogForDay(once, '2026-08-16');
    assert.equal(usedCount(undone), 0);
  });

  it('does not log past the purchased total', () => {
    let pack = createClassPack({ title: 'Piano', total: 1, startsOn: '2026-08-15' });
    pack = toggleLogForDay(pack, '2026-08-16');
    pack = toggleLogForDay(pack, '2026-08-17');
    assert.equal(usedCount(pack), 1);
  });

  it('parses 24 classes in 3 months from speech', () => {
    assert.deepEqual(
      classPackFromUtterance(
        'I enrolled my son for skating class. He has 24 classes within 3 months.'
      ),
      { total: 24, months: 3 }
    );
  });

  it('parses ASR ordinals and month words', () => {
    assert.deepEqual(
      classPackFromUtterance(
        'for a swimming class I have 12th classes to take in the next two months'
      ),
      { total: 12, months: 2 }
    );
  });

  it('creates a pack without a session count and still allows logging', () => {
    const pack = createClassPack({ title: 'Swimming' });
    assert.equal(pack.total, 0);
    assert.equal(remainingCount(pack), null);
    const once = toggleLogForDay(pack, '2026-08-16');
    assert.equal(usedCount(once), 1);
  });

  it('merges a later count onto an existing untitled pack', () => {
    const pack = createClassPack({ title: 'Swimming', startsOn: '2026-08-15' });
    const merged = mergeClassPackUpdate(pack, { title: 'Swimming Classes', total: 12, months: 2 });
    assert.equal(merged?.total, 12);
    assert.equal(merged?.endsOn, '2026-10-15');
  });

  it('detects enroll vs attend from short talk turns', () => {
    assert.equal(looksLikeClassEnrollment('I enrolled for a swimming class'), true);
    assert.equal(classTitleFromUtterance('I enrolled for a swimming class'), 'Swimming');
    assert.equal(looksLikeClassAttendance('I attended'), true);
    assert.equal(looksLikeClassAttendance('I attended my first swimming class today'), true);
  });

  it('finds skating class by title', () => {
    const pack = createClassPack({ title: 'Skating', total: 24 });
    assert.equal(findClassPack([pack], 'skating class')?.id, pack.id);
  });

  it('does not pick another adult’s swimming pack', () => {
    const mine = createClassPack({
      title: 'Swimming',
      personId: 'you',
      assignedTo: 'Pranesh',
    });
    const hers = createClassPack({
      title: 'Swimming',
      personId: 'wife',
      assignedTo: 'Priya',
    });
    assert.equal(findClassPack([hers, mine], 'swimming', 'you')?.id, mine.id);
    assert.equal(
      pickAttendancePack([hers, mine], { title: 'swimming', personId: 'you' })?.id,
      mine.id
    );
    assert.equal(
      pickAttendancePack([hers], { title: 'swimming', personId: 'you' }),
      undefined
    );
  });

  it('parses schedule days from utterance', () => {
    assert.deepEqual(
      classScheduleDaysFromUtterance('Ishaan has skating class every saturday from today'),
      ['saturday']
    );
    assert.deepEqual(
      classScheduleDaysFromUtterance('swimming on mondays and wednesdays'),
      ['monday', 'wednesday']
    );
    assert.deepEqual(
      classScheduleDaysFromUtterance('tennis class on weekends'),
      ['saturday', 'sunday']
    );
  });

  it('parses schedule time from utterance', () => {
    assert.equal(
      classScheduleTimeFromUtterance('Ishaan has skating class at 10 AM on saturdays'),
      '10:00 AM'
    );
    assert.equal(
      classScheduleTimeFromUtterance('piano class at 4:30 pm'),
      '4:30 PM'
    );
  });

  it('parses completed count from utterance', () => {
    assert.equal(
      classCompletedCountFromUtterance('out of the 12 classes, 6 are already done'),
      6
    );
    assert.equal(
      classCompletedCountFromUtterance('already completed 4 sessions'),
      4
    );
  });

  it('creates a pack with pre-filled completed sessions and schedule', () => {
    const pack = createClassPack({
      title: 'Skating',
      total: 12,
      completed: 6,
      scheduleDays: ['saturday'],
      scheduleTime: '10:00 AM',
      startsOn: '2026-08-01',
      endsOn: '2026-11-01',
    });
    assert.equal(pack.total, 12);
    assert.equal(usedCount(pack), 6);
    assert.equal(remainingCount(pack), 6);
    assert.deepEqual(pack.scheduleDays, ['saturday']);
    assert.equal(pack.scheduleTime, '10:00 AM');
  });

  it('calculates next scheduled occurrence correctly', () => {
    // Friday Aug 28 2026
    const friday = new Date(2026, 7, 28, 9, 0, 0);
    const pack = createClassPack({
      title: 'Skating',
      total: 12,
      scheduleDays: ['saturday'],
      scheduleTime: '10:00 AM',
      startsOn: '2026-08-01',
      endsOn: '2026-11-01',
    });
    const occ = nextScheduledClassOccurrence(pack, friday);
    assert.ok(occ);
    assert.equal(occ.daysAhead, 1); // Saturday is tomorrow (1 day ahead)
    assert.equal(occ.date, '2026-08-29');
    assert.equal(occ.dayName, 'Saturday');
  });

  it('tracks scheduleTimeInferred when time is omitted vs explicitly supplied', () => {
    // Explicit time -> scheduleTimeInferred is false
    const explicitPack = createClassPack({
      title: 'Skating',
      scheduleDays: ['saturday'],
      scheduleTime: '11:00 AM',
    });
    assert.equal(explicitPack.scheduleTime, '11:00 AM');
    assert.equal(explicitPack.scheduleTimeInferred, false);

    // Missing time -> defaults to 9:00 AM with scheduleTimeInferred true
    const inferredPack = createClassPack({
      title: 'Skating',
      scheduleDays: ['saturday'],
    });
    assert.equal(inferredPack.scheduleTime, '9:00 AM');
    assert.equal(inferredPack.scheduleTimeInferred, true);

    // Updating inferred pack with explicit time clears inference
    const updated = mergeClassPackUpdate(inferredPack, {
      title: 'Skating',
      scheduleTime: '11:00 AM',
    });
    assert.ok(updated);
    assert.equal(updated.scheduleTime, '11:00 AM');
    assert.equal(updated.scheduleTimeInferred, false);
  });
});

describe('addCalendarMonths', () => {
  it('adds three months from mid-month', () => {
    assert.equal(addCalendarMonths('2026-08-15', 3), '2026-11-15');
  });
});
