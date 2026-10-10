import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cadenceFromProductId,
  pendingProductAfterPurchase,
  pendingSwitchLine,
  productMatchesPlanCadence,
  subscriptionDetailLine,
  subscriptionFromEntitlements,
} from '../billing/subscriptionSnapshot';

describe('subscription snapshot', () => {
  it('matches tier and period on the product id only', () => {
    assert.equal(productMatchesPlanCadence('saavi_pro_monthly', 'pro_monthly'), true);
    assert.equal(productMatchesPlanCadence('saavi_family_monthly', 'pro_monthly'), false);
    assert.equal(productMatchesPlanCadence('monthly', 'pro_monthly'), false);
    assert.equal(productMatchesPlanCadence('saavi_family_yearly', 'family_yearly'), true);
    assert.equal(productMatchesPlanCadence('family', 'family_yearly'), false);
  });

  it('reads yearly vs monthly from the store product id', () => {
    assert.equal(cadenceFromProductId('saavi_pro_yearly'), 'yearly');
    assert.equal(cadenceFromProductId('saavi_family_annual'), 'yearly');
    assert.equal(cadenceFromProductId('saavi_pro_monthly'), 'monthly');
    assert.equal(cadenceFromProductId('saavi_lifetime'), null);
  });

  it('maps a paid entitlement to Pro and prefers the Pro product', () => {
    const snap = subscriptionFromEntitlements({
        pro: {
          productIdentifier: 'saavi_pro_monthly',
          expirationDate: '2026-10-30T08:00:00.000Z',
          willRenew: true,
        },
        family: {
          productIdentifier: 'saavi_family_yearly',
          expirationDate: '2027-09-30T08:00:00.000Z',
          willRenew: true,
        },
      });
    assert.equal(snap?.planId, 'pro');
    assert.equal(snap?.productId, 'saavi_pro_monthly');
    assert.equal(snap?.cadence, 'monthly');
    assert.match(subscriptionDetailLine(snap!), /Monthly · renews Oct 30, 2026/);
  });

  it('keeps a different purchased product pending', () => {
    assert.equal(
      pendingProductAfterPurchase('saavi_family_monthly', 'saavi_family_yearly'),
      'saavi_family_monthly'
    );
    assert.equal(
      pendingProductAfterPurchase('saavi_family_monthly', 'saavi_family_monthly'),
      null
    );
    assert.equal(
      pendingSwitchLine(
        {
          cadence: 'yearly',
          productId: 'saavi_family_yearly',
          renewsAt: '2026-10-01T16:00:00.000Z',
        },
        'saavi_family_monthly'
      ),
      'Monthly starts Oct 1, 2026. This period stays Yearly.'
    );
  });

  it('says ends when auto-renew is off', () => {
    const snap = subscriptionFromEntitlements({
        pro: {
          productIdentifier: 'saavi_pro_monthly',
          expirationDate: '2026-10-02T08:00:00.000Z',
          willRenew: false,
        },
      });
    assert.equal(subscriptionDetailLine(snap!), 'Monthly · ends Oct 2, 2026');
  });
});
