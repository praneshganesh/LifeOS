import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeEntitlement, needsFamilyUpgrade } from '../entitlements.ts';

describe('computeEntitlement', () => {
  it('keeps trial active inside 14 days', () => {
    const now = new Date('2026-09-12T12:00:00Z');
    const ent = computeEntitlement(
      { planId: 'trial', trialStartedAt: '2026-09-05T12:00:00Z' },
      { now }
    );
    assert.equal(ent.status, 'trial_active');
    assert.equal(ent.hasAccess, true);
    assert.equal(ent.canInvite, false);
    assert.equal(ent.trialDaysLeft, 7);
  });

  it('expires trial after 14 days', () => {
    const now = new Date('2026-09-20T12:00:00Z');
    const ent = computeEntitlement(
      { planId: 'trial', trialStartedAt: '2026-09-01T12:00:00Z' },
      { now }
    );
    assert.equal(ent.status, 'trial_expired');
    assert.equal(ent.hasAccess, false);
    assert.equal(ent.paywallReason, 'trial_ended');
  });

  it('pro cannot invite; needs family upgrade', () => {
    const ent = computeEntitlement({ planId: 'pro' });
    assert.equal(ent.hasAccess, true);
    assert.equal(ent.canInvite, false);
    assert.equal(needsFamilyUpgrade(ent), true);
  });

  it('family has 3 invite seats by default', () => {
    const ent = computeEntitlement({ planId: 'family' }, { invitedLogins: 0 });
    assert.equal(ent.canInvite, true);
    assert.equal(ent.seatsRemaining, 3);
  });

  it('family with 3 invitees is full', () => {
    const ent = computeEntitlement({ planId: 'family' }, { invitedLogins: 3 });
    assert.equal(ent.canInvite, false);
    assert.equal(ent.seatsRemaining, 0);
  });

  it('household member rides family without inviting', () => {
    const ent = computeEntitlement(
      { planId: 'trial' },
      { isHouseholdMember: true }
    );
    assert.equal(ent.status, 'member');
    assert.equal(ent.hasAccess, true);
    assert.equal(ent.canInvite, false);
  });
});
