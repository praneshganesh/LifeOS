import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AI_DAILY_LIMIT,
  aiDailyLimit,
  allowanceFromState,
  messageForAiDailyLimit,
  normalizeAiUsage,
  remainingAiTurns,
  resolveServerAllowance,
} from '../aiUsage.ts';

describe('aiUsage', () => {
  it('sets Trial 25 / Pro 100, and maps a leftover family row to Pro', () => {
    assert.equal(aiDailyLimit('trial'), 25);
    assert.equal(aiDailyLimit('pro'), 100);
    assert.equal(aiDailyLimit('family'), 100);
    assert.equal(AI_DAILY_LIMIT.pro, 100);
  });

  it('resets count when the calendar day changes', () => {
    const next = normalizeAiUsage({ day: '2026-01-01', count: 12 }, '2026-01-02');
    assert.deepEqual(next, { day: '2026-01-02', count: 0 });
  });

  it('keeps count on the same day', () => {
    const next = normalizeAiUsage({ day: '2026-01-02', count: 12 }, '2026-01-02');
    assert.deepEqual(next, { day: '2026-01-02', count: 12 });
  });

  it('blocks when remaining is zero', () => {
    const a = allowanceFromState('pro', { day: '2026-01-02', count: 100 });
    assert.equal(a.ok, false);
    assert.equal(a.remaining, 0);
    assert.equal(remainingAiTurns(99, 100), 1);
  });

  it('writes trial upgrade copy at the daily cap', () => {
    const msg = messageForAiDailyLimit('trial', 25, 25);
    assert.match(msg, /Upgrade to Pro/i);
  });

  it('treats a missing server ok as open when no turns are used', () => {
    const open = resolveServerAllowance(null, 0, 80, 0);
    assert.equal(open.ok, true);
    assert.equal(open.remaining, 80);
    const blocked = resolveServerAllowance(false, 80, 80, 0);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.remaining, 0);
  });
});
