import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dropCompletionLog, type LastDoneItem } from '../lastDone';

function reminder(logs: LastDoneItem['logs'], onceDone?: boolean): LastDoneItem {
  return {
    id: 'rem-1',
    label: 'Pay DEWA',
    createdAt: '2026-11-01T00:00:00.000Z',
    remindAt: '2026-11-20',
    remindTime: '15:00',
    notes: 'Online',
    logs,
    ...(onceDone ? { onceDone: true } : {}),
  };
}

describe('dropCompletionLog', () => {
  it('keeps a reminder and reopens it when the last completion is removed', () => {
    const next = dropCompletionLog(
      reminder([{ id: 'log-1', doneAt: '2026-11-20T00:00:00.000Z' }], true),
      'log-1'
    );
    assert.ok(next);
    assert.equal(next.id, 'rem-1');
    assert.equal(next.label, 'Pay DEWA');
    assert.equal(next.remindAt, '2026-11-20');
    assert.equal(next.remindTime, '15:00');
    assert.equal(next.notes, 'Online');
    assert.deepEqual(next.logs, []);
    assert.equal(next.onceDone, undefined);
  });

  it('removes one completion and leaves the rest of a reminder', () => {
    const next = dropCompletionLog(
      reminder(
        [
          { id: 'log-2', doneAt: '2026-11-20T00:00:00.000Z' },
          { id: 'log-1', doneAt: '2026-11-13T00:00:00.000Z' },
        ],
        true
      ),
      'log-2'
    );
    assert.ok(next);
    assert.equal(next.logs.length, 1);
    assert.equal(next.logs[0]?.id, 'log-1');
    assert.equal(next.onceDone, true);
    assert.equal(next.remindAt, '2026-11-20');
  });

  it('removes a plain activity when its last completion is deleted', () => {
    const activity: LastDoneItem = {
      id: 'act-1',
      label: 'Oil change',
      createdAt: '2026-11-01T00:00:00.000Z',
      logs: [{ id: 'log-1', doneAt: '2026-11-18T00:00:00.000Z' }],
    };
    assert.equal(dropCompletionLog(activity, 'log-1'), null);
  });
});
