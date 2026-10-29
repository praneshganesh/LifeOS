import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isVersionBelow,
  parseSemver,
  softDismissIsActive,
} from '../appUpdateVersion';

describe('appUpdate semver', () => {
  it('parses dotted versions', () => {
    assert.deepEqual(parseSemver('1.2.3'), [1, 2, 3]);
    assert.deepEqual(parseSemver('v2.0'), [2, 0, 0]);
    assert.deepEqual(parseSemver(''), [0, 0, 0]);
  });

  it('detects when current is below minimum', () => {
    assert.equal(isVersionBelow('1.0.0', '1.0.1'), true);
    assert.equal(isVersionBelow('1.0.1', '1.0.1'), false);
    assert.equal(isVersionBelow('1.1.0', '1.0.9'), false);
    assert.equal(isVersionBelow('0.9.9', '1.0.0'), true);
  });
});

describe('soft dismiss', () => {
  it('is active for the same update within 24h', () => {
    const now = Date.parse('2026-10-29T12:00:00.000Z');
    assert.equal(
      softDismissIsActive(
        { updateId: 'u1', at: '2026-10-29T10:00:00.000Z' },
        'u1',
        now
      ),
      true
    );
    assert.equal(
      softDismissIsActive(
        { updateId: 'u1', at: '2026-10-28T10:00:00.000Z' },
        'u1',
        now
      ),
      false
    );
    assert.equal(
      softDismissIsActive(
        { updateId: 'old', at: '2026-10-29T10:00:00.000Z' },
        'u1',
        now
      ),
      false
    );
  });
});
