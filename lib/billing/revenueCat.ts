import { Platform } from 'react-native';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import type { PlanId } from '@/lib/planLimits';
import {
  pendingProductAfterPurchase,
  productMatchesPlanCadence,
  subscriptionFromEntitlements,
  type SubscriptionSnapshot,
} from '@/lib/billing/subscriptionSnapshot';

export type { BillingCadence, SubscriptionSnapshot } from '@/lib/billing/subscriptionSnapshot';
export {
  cadenceFromProductId,
  formatRenewalDate,
  pendingProductAfterPurchase,
  pendingSwitchLine,
  productMatchesPlanCadence,
  subscriptionDetailLine,
} from '@/lib/billing/subscriptionSnapshot';

export const RC_ENTITLEMENT_PRO = 'pro';
export const RC_ENTITLEMENT_FAMILY = 'family';

export type PaywallPackageId =
  | 'monthly'
  | 'annual'
  | 'family_monthly'
  | 'family_annual';

export type OfferSummary = {
  identifier: string;
  packageType: string;
  productId: string;
  title: string;
  description: string;
  priceString: string;
  /** Underlying RC package, native only */
  raw: PurchasesPackage;
};

let configured = false;

function iosKey(): string {
  return (process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '').trim();
}

function androidKey(): string {
  return (process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '').trim();
}

export function isRevenueCatNativeSupported(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export function isRevenueCatConfigured(): boolean {
  if (!isRevenueCatNativeSupported()) return false;
  if (Platform.OS === 'ios') return iosKey().length > 0;
  return androidKey().length > 0;
}

/** Configure once at app start. Safe to call repeatedly. No-op on web / missing key. */
export async function configureRevenueCat(appUserId?: string | null): Promise<boolean> {
  if (!isRevenueCatConfigured()) return false;
  if (configured) {
    if (appUserId) {
      try {
        const Purchases = (await import('react-native-purchases')).default;
        await Purchases.logIn(appUserId);
      } catch {
        // ignore
      }
    }
    return true;
  }

  try {
    const Purchases = (await import('react-native-purchases')).default;
    const { LOG_LEVEL } = await import('react-native-purchases');
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }
    const apiKey = Platform.OS === 'ios' ? iosKey() : androidKey();
    Purchases.configure({
      apiKey,
      appUserID: appUserId ?? undefined,
    });
    configured = true;
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[RevenueCat] configure failed', e);
    return false;
  }
}

export function planIdFromCustomerInfo(info: CustomerInfo): PlanId | null {
  const active = info.entitlements.active;
  // Launch sells Pro only. A leftover Family entitlement is Pro access.
  if (active[RC_ENTITLEMENT_PRO] || active[RC_ENTITLEMENT_FAMILY]) return 'pro';
  return null;
}

export function subscriptionFromCustomerInfo(info: CustomerInfo): SubscriptionSnapshot | null {
  return subscriptionFromEntitlements(info.entitlements.active);
}

export async function fetchCustomerPlanId(): Promise<PlanId | null> {
  const snap = await fetchSubscriptionSnapshot();
  return snap?.planId ?? null;
}

export type CustomerBilling =
  | { status: 'unavailable' }
  | { status: 'none' }
  | { status: 'active'; snap: SubscriptionSnapshot };

/**
 * Successful lookup with no Pro/Family entitlement is `none` (paid access ended).
 * A network or SDK failure is `unavailable` and must not lapse the local plan.
 */
export async function fetchCustomerBilling(): Promise<CustomerBilling> {
  if (!configured && !(await configureRevenueCat())) return { status: 'unavailable' };
  try {
    const Purchases = (await import('react-native-purchases')).default;
    const info = await Purchases.getCustomerInfo();
    const snap = subscriptionFromCustomerInfo(info);
    if (!snap) return { status: 'none' };
    return { status: 'active', snap };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Active store subscription: plan, monthly/yearly, and the next renewal date. */
export async function fetchSubscriptionSnapshot(): Promise<SubscriptionSnapshot | null> {
  const billing = await fetchCustomerBilling();
  return billing.status === 'active' ? billing.snap : null;
}

function mapPackage(pkg: PurchasesPackage): OfferSummary {
  const p = pkg.product;
  return {
    identifier: pkg.identifier,
    packageType: String(pkg.packageType),
    productId: p.identifier,
    title: p.title,
    description: p.description,
    priceString: p.priceString,
    raw: pkg,
  };
}

/** Current offering packages for the paywall. */
export async function fetchPaywallOffers(): Promise<OfferSummary[]> {
  if (!configured && !(await configureRevenueCat())) return [];
  try {
    const Purchases = (await import('react-native-purchases')).default;
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return [];
    return current.availablePackages
      .map(mapPackage)
      .filter((offer) => !offer.productId.toLowerCase().includes('family'));
  } catch (e) {
    if (__DEV__) console.warn('[RevenueCat] getOfferings failed', e);
    return [];
  }
}

export function pickOffer(
  offers: OfferSummary[],
  want: 'pro_monthly' | 'pro_yearly' | 'family_monthly' | 'family_yearly'
): OfferSummary | undefined {
  return offers.find((o) => productMatchesPlanCadence(o.productId, want));
}

export type PurchaseResult =
  | {
      ok: true;
      planId: PlanId;
      productId: string | null;
      cadence: SubscriptionSnapshot['cadence'];
      renewsAt: string | null;
      /** Set when the tapped product is not the one Apple left active. */
      pendingProductId: string | null;
    }
  | { ok: false; cancelled?: boolean; error: string };

function purchaseSuccess(info: CustomerInfo, requestedProductId: string): PurchaseResult {
  const planId = planIdFromCustomerInfo(info);
  if (!planId) {
    return {
      ok: false,
      error: 'Purchase completed but no Pro/Family entitlement yet. Try Restore.',
    };
  }
  const snap = subscriptionFromCustomerInfo(info);
  return {
    ok: true,
    planId,
    productId: snap?.productId ?? null,
    cadence: snap?.cadence ?? null,
    renewsAt: snap?.renewsAt ?? null,
    pendingProductId: pendingProductAfterPurchase(requestedProductId, snap?.productId),
  };
}

export async function purchaseOffer(offer: OfferSummary): Promise<PurchaseResult> {
  if (!configured && !(await configureRevenueCat())) {
    return { ok: false, error: 'Purchases unavailable on this build.' };
  }
  try {
    const Purchases = (await import('react-native-purchases')).default;
    const { customerInfo } = await Purchases.purchasePackage(offer.raw);
    return purchaseSuccess(customerInfo, offer.productId);
  } catch (e: unknown) {
    const err = e as { userCancelled?: boolean; message?: string };
    if (err?.userCancelled) {
      return { ok: false, cancelled: true, error: 'Cancelled' };
    }
    return {
      ok: false,
      error: err?.message || 'Purchase failed',
    };
  }
}

export async function restorePurchases(): Promise<PurchaseResult> {
  if (!configured && !(await configureRevenueCat())) {
    return { ok: false, error: 'Purchases unavailable on this build.' };
  }
  try {
    const Purchases = (await import('react-native-purchases')).default;
    const info = await Purchases.restorePurchases();
    const planId = planIdFromCustomerInfo(info);
    if (!planId) {
      return { ok: false, error: 'No active subscription found for this Apple ID.' };
    }
    const snap = subscriptionFromCustomerInfo(info);
    return {
      ok: true,
      planId,
      productId: snap?.productId ?? null,
      cadence: snap?.cadence ?? null,
      renewsAt: snap?.renewsAt ?? null,
      pendingProductId: null,
    };
  } catch (e: unknown) {
    const err = e as { message?: string };
    return { ok: false, error: err?.message || 'Restore failed' };
  }
}
