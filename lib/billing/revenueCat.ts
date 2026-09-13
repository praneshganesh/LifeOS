import { Platform } from 'react-native';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import type { PlanId } from '@/lib/planLimits';

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
  /** Underlying RC package — native only */
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
  if (active[RC_ENTITLEMENT_FAMILY]) return 'family';
  if (active[RC_ENTITLEMENT_PRO]) return 'pro';
  return null;
}

export async function fetchCustomerPlanId(): Promise<PlanId | null> {
  if (!configured && !(await configureRevenueCat())) return null;
  try {
    const Purchases = (await import('react-native-purchases')).default;
    const info = await Purchases.getCustomerInfo();
    return planIdFromCustomerInfo(info);
  } catch {
    return null;
  }
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
    return current.availablePackages.map(mapPackage);
  } catch (e) {
    if (__DEV__) console.warn('[RevenueCat] getOfferings failed', e);
    return [];
  }
}

export function pickOffer(
  offers: OfferSummary[],
  want: 'pro_monthly' | 'pro_yearly' | 'family_monthly' | 'family_yearly'
): OfferSummary | undefined {
  const byId: Record<typeof want, string[]> = {
    pro_monthly: ['$rc_monthly', 'monthly'],
    pro_yearly: ['$rc_annual', 'annual', 'yearly'],
    family_monthly: ['family_monthly'],
    family_yearly: ['family_annual', 'family', 'family_yearly'],
  };
  const ids = byId[want];
  return (
    offers.find((o) => ids.includes(o.identifier)) ||
    offers.find((o) => {
      if (want === 'pro_monthly') return o.productId.includes('pro_monthly');
      if (want === 'pro_yearly') return o.productId.includes('pro_yearly');
      if (want === 'family_monthly') return o.productId.includes('family_monthly');
      return o.productId.includes('family_yearly');
    })
  );
}

export type PurchaseResult =
  | { ok: true; planId: PlanId }
  | { ok: false; cancelled?: boolean; error: string };

export async function purchaseOffer(offer: OfferSummary): Promise<PurchaseResult> {
  if (!configured && !(await configureRevenueCat())) {
    return { ok: false, error: 'Purchases unavailable on this build.' };
  }
  try {
    const Purchases = (await import('react-native-purchases')).default;
    const { customerInfo } = await Purchases.purchasePackage(offer.raw);
    const planId = planIdFromCustomerInfo(customerInfo);
    if (!planId) {
      return {
        ok: false,
        error: 'Purchase completed but no Pro/Family entitlement yet. Try Restore.',
      };
    }
    return { ok: true, planId };
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
    return { ok: true, planId };
  } catch (e: unknown) {
    const err = e as { message?: string };
    return { ok: false, error: err?.message || 'Restore failed' };
  }
}
