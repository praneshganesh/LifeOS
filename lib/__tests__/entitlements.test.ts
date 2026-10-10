import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeEntitlement, needsFamilyUpgrade } from '../entitlements.ts';

describe('computeEntitlement', () => {
  it('locks a lapsed paid plan instead of starting another trial', () => {
    const ent = computeEntitlement({
      planId: 'lapsed',
      trialStartedAt: new Date().toISOString(),
    });
    assert.equal(ent.status, 'lapsed');
    assert.equal(ent.hasAccess, false);
    assert.equal(ent.paywallReason, 'subscription_ended');
    assert.equal(ent.trialDaysLeft, null);
  });

  it('keeps trial active inside trial window', () => {
    const now = new Date('2026-09-10T12:00:00Z');
    const ent = computeEntitlement(
      { planId: 'trial', trialStartedAt: '2026-09-05T12:00:00Z' },
      { now }
    );
    assert.equal(ent.status, 'trial_active');
    assert.equal(ent.hasAccess, true);
    assert.equal(ent.canInvite, false);
    assert.equal(ent.trialDaysLeft, 2);
  });

  it('expires trial after trial window', () => {
    const now = new Date('2026-09-13T12:00:00Z');
    const ent = computeEntitlement(
      { planId: 'trial', trialStartedAt: '2026-09-05T12:00:00Z' },
      { now }
    );
    assert.equal(ent.status, 'trial_expired');
    assert.equal(ent.hasAccess, false);
    assert.equal(ent.paywallReason, 'trial_ended');
  });

  it('pro has access and does not invite', () => {
    const ent = computeEntitlement({ planId: 'pro' });
    assert.equal(ent.status, 'pro');
    assert.equal(ent.hasAccess, true);
    assert.equal(ent.canInvite, false);
    assert.equal(needsFamilyUpgrade(ent), false);
  });

  it('a stored family tier is treated as Pro', () => {
    const ent = computeEntitlement({ planId: 'family' }, { invitedLogins: 0 });
    assert.equal(ent.status, 'pro');
    assert.equal(ent.planId, 'pro');
    assert.equal(ent.canInvite, false);
  });

  it('a joined login still follows their own plan', () => {
    const ent = computeEntitlement(
      { planId: 'trial', trialStartedAt: '2026-09-05T12:00:00Z' },
      { isHouseholdMember: true, now: new Date('2026-09-20T12:00:00Z') }
    );
    assert.equal(ent.status, 'trial_expired');
    assert.equal(ent.hasAccess, false);
  });
});
