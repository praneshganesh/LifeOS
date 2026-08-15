import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classPackFromUtterance,
  ensureClassActions,
  looksLikeClassAttendance,
  looksLikeClassEnrollment,
} from '../classes.mjs';

describe('chat-api class pack repair', () => {
  it('injects add_class_pack for enroll without a count', () => {
    const next = ensureClassActions([], 'I enrolled for a swimming class', []);
    assert.equal(next[0]?.type, 'add_class_pack');
    assert.equal(next[0]?.title, 'Swimming');
    assert.equal(next[0]?.total, undefined);
  });

  it('reads 12th classes and two months from ASR', () => {
    assert.deepEqual(
      classPackFromUtterance(
        'for a swimming class I have 12th classes to take in the next two months'
      ),
      { total: 12, months: 2 }
    );
    const next = ensureClassActions(
      [{ type: 'add_class_pack', title: 'Swimming Classes' }],
      'for a swimming class I have 12th classes to take in the next two months',
      []
    );
    assert.equal(next[0].total, 12);
    assert.equal(next[0].months, 2);
  });

  it('injects log_class for I attended using the newest pack', () => {
    assert.equal(looksLikeClassAttendance('I attended'), true);
    assert.equal(looksLikeClassEnrollment('I attended'), false);
    const next = ensureClassActions([], 'I attended', [
      { id: 'cls-1', title: 'Swimming' },
    ]);
    assert.equal(next[0]?.type, 'log_class');
    assert.equal(next[0]?.id, 'cls-1');
    assert.equal(next[0]?.title, 'Swimming');
  });

  it('does not inject log_class when there are no packs', () => {
    const next = ensureClassActions(
      [{ type: 'log_class', title: 'swimming' }],
      'I attended my second swimming class today',
      []
    );
    assert.equal(next.length, 0);
  });
});
