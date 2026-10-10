export type BillingCadence = 'monthly' | 'yearly';

export type SubscriptionSnapshot = {
  planId: 'pro' | 'family';
  cadence: BillingCadence | null;
  /** App Store / Play product id, e.g. saavi_family_yearly. */
  productId: string | null;
  /** Store expiration. The next charge when `willRenew` is true. */
  renewsAt: string | null;
  willRenew: boolean;
};

type StoreEntitlement = {
  productIdentifier?: string;
  expirationDate?: string | null;
  willRenew?: boolean;
};

export type StoreProductWant = 'pro_monthly' | 'pro_yearly' | 'family_monthly' | 'family_yearly';

/** True only when the store product id is that tier and period. */
export function productMatchesPlanCadence(productId: string, want: StoreProductWant): boolean {
  const id = productId.toLowerCase();
  const yearly = id.includes('year') || id.includes('annual');
  const monthly = id.includes('month');
  if (want === 'pro_monthly') return id.includes('pro') && monthly && !id.includes('family');
  if (want === 'pro_yearly') return id.includes('pro') && yearly && !id.includes('family');
  if (want === 'family_monthly') return id.includes('family') && monthly;
  return id.includes('family') && yearly;
}

export function cadenceFromProductId(productId: string): BillingCadence | null {
  const id = productId.toLowerCase();
  if (id.includes('year') || id.includes('annual')) return 'yearly';
  if (id.includes('month')) return 'monthly';
  return null;
}

const RENEWAL_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export function formatRenewalDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${RENEWAL_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Requested product stays pending when Apple left a different one active. */
export function pendingProductAfterPurchase(
  requestedProductId: string,
  activeProductId: string | null | undefined
): string | null {
  const requested = requestedProductId.trim();
  const active = activeProductId?.trim() || '';
  if (!requested || !active || requested === active) return null;
  return requested;
}

/** "Monthly starts Oct 1, 2026. This period stays Yearly." */
export function pendingSwitchLine(
  active: { cadence: BillingCadence | null; renewsAt: string | null; productId?: string | null } | null,
  pendingProductId: string | null | undefined
): string {
  if (!pendingProductId) return '';
  if (active?.productId && active.productId === pendingProductId) return '';
  const next = cadenceFromProductId(pendingProductId);
  const now =
    active?.cadence === 'yearly' ? 'Yearly' : active?.cadence === 'monthly' ? 'Monthly' : null;
  const nextLabel = next === 'yearly' ? 'Yearly' : next === 'monthly' ? 'Monthly' : null;
  if (!now || !nextLabel || now === nextLabel) return '';
  const when = active?.renewsAt ? formatRenewalDate(active.renewsAt) : null;
  return when
    ? `${nextLabel} starts ${when}. This period stays ${now}.`
    : `${nextLabel} starts at the next renewal. This period stays ${now}.`;
}

/** "Yearly · renews Oct 30, 2026" or "Monthly · ends Oct 30, 2026". */
export function subscriptionDetailLine(snap: SubscriptionSnapshot): string {
  const cadence =
    snap.cadence === 'yearly' ? 'Yearly' : snap.cadence === 'monthly' ? 'Monthly' : null;
  const when = snap.renewsAt ? formatRenewalDate(snap.renewsAt) : null;
  const whenLabel = when ? (snap.willRenew ? `renews ${when}` : `ends ${when}`) : null;
  return [cadence, whenLabel].filter(Boolean).join(' · ');
}

export function subscriptionFromEntitlements(
  active: Record<string, StoreEntitlement> | null | undefined
): SubscriptionSnapshot | null {
  if (!active) return null;
  const pro = active.pro;
  const family = active.family;
  const ent = pro ?? family;
  if (!ent) return null;
  const productId = ent.productIdentifier?.trim() || null;
  return {
    planId: 'pro',
    productId,
    cadence: cadenceFromProductId(productId || ''),
    renewsAt: ent.expirationDate ?? null,
    willRenew: Boolean(ent.willRenew),
  };
}
