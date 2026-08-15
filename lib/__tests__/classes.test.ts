import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classPackFromUtterance,
  classTitleFromUtterance,
  createClassPack,
  findClassPack,
  loggedOn,
  looksLikeClassAttendance,
  looksLikeClassEnrollment,
  mergeClassPackUpdate,
  remainingCount,
  toggleLogForDay,
  usedCount,
} from '../classes';
import { addCalendarMonths } from '../dates';

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
});

describe('addCalendarMonths', () => {
  it('adds three months from mid-month', () => {
    assert.equal(addCalendarMonths('2026-08-15', 3), '2026-11-15');
  });
});
