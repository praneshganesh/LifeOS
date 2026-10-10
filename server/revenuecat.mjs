/**
 * RevenueCat webhook → Supabase `profiles.plan_id` mirror.
 *
 * RevenueCat is the subscription source of truth. The app also calls
 * `set_my_plan_id` after a purchase, but that path trusts the client. This
 * webhook writes the plan with the service role so server-side enforcement
 * (Talk caps, invites) cannot be bumped by a tampered client.
 *
 * Env (server only, never EXPO_PUBLIC_*):
 *   REVENUECAT_WEBHOOK_SECRET   value RevenueCat sends in the Authorization header
 *   SUPABASE_SERVICE_ROLE_KEY   used to call public.admin_set_plan_id
 *   REVENUECAT_SECRET_KEY       optional; when set we re-read the subscriber
 *                               from the RC REST API instead of trusting the
 *                               event body alone
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAN_RANK = { trial: 0, pro: 1, family: 2 };

export function revenueCatConfigured() {
  const secret = (process.env.REVENUECAT_WEBHOOK_SECRET || '').trim();
  const serviceRole = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return secret && serviceRole
    ? {
        secret,
        serviceRole,
        restKey: (process.env.REVENUECAT_SECRET_KEY || '').trim() || null,
      }
    : null;
}

/** Constant-time compare for the webhook Authorization header. */
export function webhookAuthorized(headerValue, secret) {
  const given = String(headerValue || '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  if (!given || !secret || given.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i += 1) {
    diff |= given.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Supabase user ids that this event applies to. RC `app_user_id` is the
 * Supabase uid (see configureRevenueCat), but aliases / transfers may carry
 * anonymous RC ids that we skip.
 */
export function targetUserIds(event) {
  const out = new Set();
  const push = (v) => {
    if (typeof v === 'string' && UUID_RE.test(v)) out.add(v.toLowerCase());
  };
  push(event?.app_user_id);
  push(event?.original_app_user_id);
  for (const a of Array.isArray(event?.aliases) ? event.aliases : []) push(a);
  return [...out];
}

/** Users who *lost* entitlements in a TRANSFER event. */
export function transferredFromUserIds(event) {
  if (event?.type !== 'TRANSFER') return [];
  const out = new Set();
  for (const v of Array.isArray(event?.transferred_from) ? event.transferred_from : []) {
    if (typeof v === 'string' && UUID_RE.test(v)) out.add(v.toLowerCase());
  }
  return [...out];
}

export function cadenceFromProductId(productId) {
  const id = String(productId || '').toLowerCase();
  if (!id) return null;
  if (id.includes('year') || id.includes('annual')) return 'yearly';
  if (id.includes('month')) return 'monthly';
  return null;
}

/**
 * Active store product on this event, plus a deferred switch (App Store
 * PRODUCT_CHANGE keeps the old product until expiration; new_product_id is next).
 */
export function billingFromEvent(event) {
  const type = String(event?.type || '');
  const productId =
    typeof event?.product_id === 'string' && event.product_id.trim()
      ? event.product_id.trim()
      : null;
  const switchedTo =
    typeof event?.new_product_id === 'string' && event.new_product_id.trim()
      ? event.new_product_id.trim()
      : null;
  const exp = Number(event?.expiration_at_ms || 0);
  const updatePending =
    type === 'PRODUCT_CHANGE' ||
    type === 'INITIAL_PURCHASE' ||
    type === 'RENEWAL' ||
    type === 'EXPIRATION' ||
    type === 'UNCANCELLATION';
  return {
    productId,
    cadence: cadenceFromProductId(productId),
    renewsAt: exp > 0 ? new Date(exp).toISOString() : null,
    pendingProductId:
      type === 'PRODUCT_CHANGE' && switchedTo && switchedTo !== productId ? switchedTo : null,
    updatePending,
  };
}

export function planFromEntitlementIds(ids) {
  let plan = 'trial';
  for (const id of Array.isArray(ids) ? ids : []) {
    const key = String(id || '').toLowerCase();
    // Launch sells Pro only. Family entitlement ids map to Pro until that SKU returns.
    if ((key === 'family' || key === 'pro') && PLAN_RANK[plan] < PLAN_RANK.pro) plan = 'pro';
  }
  return plan;
}

/**
 * Best-effort plan from the event body alone (used when REVENUECAT_SECRET_KEY
 * is not set or the REST call fails).
 * Returns null when the event carries no plan signal (SUBSCRIBER_ALIAS, TEST).
 */
export function planFromEvent(event, now = Date.now()) {
  const type = String(event?.type || '');
  if (!type || type === 'TEST' || type === 'SUBSCRIBER_ALIAS') return null;
  if (type === 'EXPIRATION' || type === 'SUBSCRIPTION_PAUSED') return 'lapsed';
  if (type === 'BILLING_ISSUE') return null; // still entitled during grace period
  if (type === 'CANCELLATION') {
    // Auto-renew turned off; access continues until expiration_at_ms.
    const exp = Number(event?.expiration_at_ms || 0);
    if (exp && exp <= now) return 'lapsed';
    return null;
  }
  const ids =
    Array.isArray(event?.entitlement_ids) && event.entitlement_ids.length
      ? event.entitlement_ids
      : event?.entitlement_id
        ? [event.entitlement_id]
        : [];
  if (!ids.length) return null;
  const exp = Number(event?.expiration_at_ms || 0);
  if (exp && exp <= now) return 'lapsed';
  return planFromEntitlementIds(ids);
}

/** Plan from a RC REST `GET /v1/subscribers/{id}` payload. */
export function planFromSubscriber(payload, now = Date.now()) {
  const ents = payload?.subscriber?.entitlements;
  if (!ents || typeof ents !== 'object') return null;
  const active = [];
  let sawAny = false;
  for (const [id, ent] of Object.entries(ents)) {
    sawAny = true;
    const exp = ent?.expires_date ? Date.parse(ent.expires_date) : NaN;
    if (!ent?.expires_date || (Number.isFinite(exp) && exp > now)) active.push(id);
  }
  if (active.length) return planFromEntitlementIds(active);
  return sawAny ? 'lapsed' : null;
}

async function fetchSubscriberPlan(cfg, appUserId) {
  if (!cfg.restKey) return null;
  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
      { headers: { Authorization: `Bearer ${cfg.restKey}`, Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data ? planFromSubscriber(data) : null;
  } catch {
    return null;
  }
}

export async function adminSetPlan(sb, cfg, userId, plan, billing = null) {
  const res = await fetch(`${sb.url}/rest/v1/rpc/admin_set_plan_id`, {
    method: 'POST',
    headers: {
      apikey: cfg.serviceRole,
      Authorization: `Bearer ${cfg.serviceRole}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_user: userId,
      p_plan: plan,
      p_cadence: billing?.cadence ?? null,
      p_product_id: billing?.productId ?? null,
      p_renews_at: billing?.renewsAt ?? null,
      p_pending_product_id: billing?.pendingProductId ?? null,
      p_update_pending: Boolean(billing?.updatePending),
    }),
  });
  if (res.ok) return { ok: true };
  const data = await res.json().catch(() => null);
  return {
    ok: false,
    error: (data && (data.message || data.error || data.hint)) || `rpc ${res.status}`,
  };
}

/**
 * Process one webhook body. Returns a summary suitable for the HTTP reply.
 * Never throws on bad payloads; RC retries on non-2xx so we only signal
 * failure when the Supabase write itself failed.
 */
export async function handleRevenueCatEvent(body, { sb, cfg, log = () => {} }) {
  const event = body?.event && typeof body.event === 'object' ? body.event : null;
  if (!event) return { status: 400, body: { error: 'event missing' } };

  const updates = [];
  const users = targetUserIds(event);
  if (users.length) {
    let plan = await fetchSubscriberPlan(cfg, users[0]);
    let via = 'rest';
    if (!plan) {
      plan = planFromEvent(event);
      via = 'event';
    }
    if (plan) {
      const billing = plan === 'trial' || plan === 'lapsed' ? null : billingFromEvent(event);
      for (const uid of users) updates.push({ uid, plan, via, billing });
    }
  }
  for (const uid of transferredFromUserIds(event)) {
    const plan = (await fetchSubscriberPlan(cfg, uid)) || 'trial';
    updates.push({ uid, plan, via: 'transfer', billing: null });
  }

  if (!updates.length) {
    log(`[rc] ${event.type || 'event'} ignored (no Supabase user / no plan signal)`);
    return { status: 200, body: { ok: true, ignored: true } };
  }

  const failures = [];
  for (const u of updates) {
    const r = await adminSetPlan(sb, cfg, u.uid, u.plan, u.billing);
    if (r.ok) log(`[rc] ${event.type} → ${u.uid} plan=${u.plan} (${u.via})`);
    else failures.push({ uid: u.uid, error: r.error });
  }
  if (failures.length) {
    log(`[rc] ${event.type} failed: ${JSON.stringify(failures)}`);
    return { status: 502, body: { ok: false, failures } };
  }
  return { status: 200, body: { ok: true, updated: updates.length } };
}
