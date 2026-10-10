import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  handleRevenueCatEvent,
  billingFromEvent,
  cadenceFromProductId,
  planFromEntitlementIds,
  planFromEvent,
  planFromSubscriber,
  targetUserIds,
  transferredFromUserIds,
  webhookAuthorized,
} from '../revenuecat.mjs';

const UID = '11111111-2222-4333-8444-555555555555';
const UID2 = '66666666-7777-4888-9999-aaaaaaaaaaaa';
const NOW = Date.parse('2026-09-28T12:00:00Z');

describe('webhook auth', () => {
  it('accepts the exact secret with or without Bearer', () => {
    assert.equal(webhookAuthorized('s3cret', 's3cret'), true);
    assert.equal(webhookAuthorized('Bearer s3cret', 's3cret'), true);
  });
  it('rejects wrong / empty secrets', () => {
    assert.equal(webhookAuthorized('s3cres', 's3cret'), false);
    assert.equal(webhookAuthorized('', 's3cret'), false);
    assert.equal(webhookAuthorized('s3cret', ''), false);
  });
});

describe('target users', () => {
  it('keeps only Supabase uuids from app_user_id / aliases', () => {
    const ids = targetUserIds({
      app_user_id: UID,
      original_app_user_id: '$RCAnonymousID:abc',
      aliases: [UID.toUpperCase(), '$RCAnonymousID:abc', UID2],
    });
    assert.deepEqual(ids, [UID, UID2]);
  });
  it('extracts transferred_from only for TRANSFER events', () => {
    assert.deepEqual(transferredFromUserIds({ type: 'RENEWAL', transferred_from: [UID] }), []);
    assert.deepEqual(
      transferredFromUserIds({ type: 'TRANSFER', transferred_from: [UID, '$RCAnonymousID:x'] }),
      [UID]
    );
  });
});

describe('billing period', () => {
  it('reads monthly vs yearly from the store product id', () => {
    assert.equal(cadenceFromProductId('saavi_family_monthly'), 'monthly');
    assert.equal(cadenceFromProductId('saavi_family_yearly'), 'yearly');
    assert.equal(cadenceFromProductId('saavi_pro_annual'), 'yearly');
  });

  it('keeps the current yearly product and records monthly as pending', () => {
    const billing = billingFromEvent({
      type: 'PRODUCT_CHANGE',
      product_id: 'saavi_family_yearly',
      new_product_id: 'saavi_family_monthly',
      expiration_at_ms: NOW,
    });
    assert.equal(billing.cadence, 'yearly');
    assert.equal(billing.pendingProductId, 'saavi_family_monthly');
    assert.equal(billing.updatePending, true);
  });
});

describe('plan derivation', () => {
  it('maps pro and family entitlements to pro', () => {
    assert.equal(planFromEntitlementIds([]), 'trial');
    assert.equal(planFromEntitlementIds(['pro']), 'pro');
    assert.equal(planFromEntitlementIds(['pro', 'family']), 'pro');
    assert.equal(planFromEntitlementIds(['Family']), 'pro');
  });

  it('reads plan from purchase / renewal events', () => {
    assert.equal(
      planFromEvent({ type: 'INITIAL_PURCHASE', entitlement_ids: ['pro'] }, NOW),
      'pro'
    );
    assert.equal(planFromEvent({ type: 'RENEWAL', entitlement_id: 'family' }, NOW), 'pro');
  });

  it('locks access on expiration without starting a trial', () => {
    assert.equal(planFromEvent({ type: 'EXPIRATION', entitlement_ids: ['pro'] }, NOW), 'lapsed');
    assert.equal(planFromEvent({ type: 'SUBSCRIPTION_PAUSED' }, NOW), 'lapsed');
    assert.equal(planFromEvent({ type: 'INITIAL_PURCHASE' }, NOW), null);
  });

  it('keeps access after a cancellation until expiry', () => {
    const future = NOW + 86_400_000;
    assert.equal(
      planFromEvent({ type: 'CANCELLATION', entitlement_ids: ['pro'], expiration_at_ms: future }, NOW),
      null
    );
    assert.equal(
      planFromEvent({ type: 'CANCELLATION', entitlement_ids: ['pro'], expiration_at_ms: NOW - 1 }, NOW),
      'lapsed'
    );
  });

  it('ignores events with no plan signal', () => {
    assert.equal(planFromEvent({ type: 'TEST' }, NOW), null);
    assert.equal(planFromEvent({ type: 'SUBSCRIBER_ALIAS' }, NOW), null);
    assert.equal(planFromEvent({ type: 'BILLING_ISSUE' }, NOW), null);
  });

  it('derives plan from a REST subscriber payload using expiry dates', () => {
    const payload = {
      subscriber: {
        entitlements: {
          pro: { expires_date: '2026-09-27T00:00:00Z' },
          family: { expires_date: '2026-10-27T00:00:00Z' },
        },
      },
    };
    assert.equal(planFromSubscriber(payload, NOW), 'pro');
    assert.equal(
      planFromSubscriber({ subscriber: { entitlements: { pro: { expires_date: '2026-01-01T00:00:00Z' } } } }, NOW),
      'lapsed'
    );
    assert.equal(planFromSubscriber({ subscriber: { entitlements: { pro: { expires_date: null } } } }, NOW), 'pro');
  });
});

describe('handleRevenueCatEvent', () => {
  const sb = { url: 'https://example.supabase.co', key: 'anon' };
  const cfg = { secret: 's', serviceRole: 'service', restKey: null };

  function withFetch(impl, fn) {
    const orig = globalThis.fetch;
    globalThis.fetch = impl;
    return fn().finally(() => {
      globalThis.fetch = orig;
    });
  }

  it('writes the plan through admin_set_plan_id with the service role', async () => {
    const calls = [];
    await withFetch(
      async (url, init) => {
        calls.push({ url, init });
        return { ok: true, json: async () => null };
      },
      async () => {
        const out = await handleRevenueCatEvent(
          { event: { type: 'INITIAL_PURCHASE', app_user_id: UID, entitlement_ids: ['pro'] } },
          { sb, cfg }
        );
        assert.equal(out.status, 200);
        assert.equal(out.body.updated, 1);
      }
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${sb.url}/rest/v1/rpc/admin_set_plan_id`);
    assert.equal(calls[0].init.headers.apikey, 'service');
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      p_user: UID,
      p_plan: 'pro',
      p_cadence: null,
      p_product_id: null,
      p_renews_at: null,
      p_pending_product_id: null,
      p_update_pending: true,
    });
  });

  it('stores the active product and a deferred monthly switch', async () => {
    const calls = [];
    const renewsAt = Date.now() + 13 * 60 * 60 * 1000;
    await withFetch(
      async (url, init) => {
        calls.push({ url, init });
        return { ok: true, json: async () => null };
      },
      async () => {
        const out = await handleRevenueCatEvent(
          {
            event: {
              type: 'PRODUCT_CHANGE',
              app_user_id: UID,
              entitlement_ids: ['family'],
              product_id: 'saavi_family_yearly',
              new_product_id: 'saavi_family_monthly',
              expiration_at_ms: renewsAt,
            },
          },
          { sb, cfg }
        );
        assert.equal(out.status, 200);
      }
    );
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.p_plan, 'pro');
    assert.equal(body.p_cadence, 'yearly');
    assert.equal(body.p_product_id, 'saavi_family_yearly');
    assert.equal(body.p_pending_product_id, 'saavi_family_monthly');
    assert.equal(body.p_update_pending, true);
    assert.equal(body.p_renews_at, new Date(renewsAt).toISOString());
  });

  it('returns 400 for bodies without an event and 200/ignored for anonymous ids', async () => {
    const bad = await handleRevenueCatEvent({}, { sb, cfg });
    assert.equal(bad.status, 400);
    const anon = await handleRevenueCatEvent(
      { event: { type: 'RENEWAL', app_user_id: '$RCAnonymousID:x', entitlement_ids: ['pro'] } },
      { sb, cfg }
    );
    assert.equal(anon.status, 200);
    assert.equal(anon.body.ignored, true);
  });

  it('signals failure so RevenueCat retries when Supabase rejects the write', async () => {
    await withFetch(
      async () => ({ ok: false, status: 500, json: async () => ({ message: 'boom' }) }),
      async () => {
        const out = await handleRevenueCatEvent(
          { event: { type: 'RENEWAL', app_user_id: UID, entitlement_ids: ['family'] } },
          { sb, cfg }
        );
        assert.equal(out.status, 502);
        assert.equal(out.body.failures[0].error, 'boom');
      }
    );
  });
});
