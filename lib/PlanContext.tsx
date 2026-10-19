import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import {
  computeEntitlement,
  type Entitlement,
} from '@/lib/entitlements';
import {
  loadPlanPrefs,
  savePlanPrefs,
  type PlanId,
  type PlanPrefs,
} from '@/lib/planLimits';
import {
  loadMembership,
  loadSeatUsage,
  type MembershipState,
} from '@/lib/invites/membership';
import {
  configureRevenueCat,
  fetchCustomerBilling,
  fetchPaywallOffers,
  isRevenueCatConfigured,
  pickOffer,
  purchaseOffer,
  restorePurchases,
  type OfferSummary,
} from '@/lib/billing/revenueCat';
import { supabase } from '@/lib/supabase';

type PlanContextValue = {
  ready: boolean;
  prefs: PlanPrefs;
  entitlement: Entitlement;
  membership: MembershipState;
  billingReady: boolean;
  offers: OfferSummary[];
  refresh: () => Promise<void>;
  refreshOffers: () => Promise<OfferSummary[]>;
  /**
   * Buy Pro or Family via RevenueCat when available.
   * Falls back to local unlock in __DEV__ if RC isn't available (web / missing key).
   */
  subscribe: (
    planId: 'pro',
    cadence?: 'monthly' | 'yearly'
  ) => Promise<
    | {
        ok: true;
        planId: PlanId;
        productId: string | null;
        cadence: 'monthly' | 'yearly' | null;
        renewsAt: string | null;
        pendingProductId: string | null;
      }
    | { ok: false; cancelled?: boolean; error: string }
  >;
  restore: () => Promise<{ ok: boolean; error?: string }>;
  /** Dev helper: restart trial clock. */
  restartTrial: () => Promise<void>;
};

const PlanContext = createContext<PlanContextValue | null>(null);

async function resolveAppUserId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [prefs, setPrefs] = useState<PlanPrefs>({ planId: 'trial' });
  const [membership, setMembership] = useState<MembershipState>({
    role: 'owner',
    invitedLogins: 0,
  });
  const [billingReady, setBillingReady] = useState(false);
  const [offers, setOffers] = useState<OfferSummary[]>([]);

  const applyPlanId = useCallback(async (planId: PlanId, trialStartedAt?: string) => {
    const next: PlanPrefs = {
      planId,
      trialStartedAt:
        planId === 'trial'
          ? trialStartedAt || new Date().toISOString()
          : trialStartedAt,
    };
    await savePlanPrefs(next);
    setPrefs(next);
  }, []);

  const refreshOffers = useCallback(async () => {
    if (!isRevenueCatConfigured()) {
      setOffers([]);
      return [] as OfferSummary[];
    }
    const list = await fetchPaywallOffers();
    setOffers(list);
    return list;
  }, []);

  const refresh = useCallback(async () => {
    const [local, m, seats] = await Promise.all([
      loadPlanPrefs(),
      loadMembership(),
      loadSeatUsage(),
    ]);

    const { loadProfileBilling } = await import('@/lib/billing/profilePlan');
    const profile = m.role !== 'member' ? await loadProfileBilling() : null;
    let p = local;
    if (profile?.trialStartedAt && profile.trialStartedAt !== local.trialStartedAt) {
      p = { ...local, trialStartedAt: profile.trialStartedAt };
      await savePlanPrefs(p);
    }

    let prefsNext = p;
    if (m.role !== 'member' && isRevenueCatConfigured()) {
      const billing = await fetchCustomerBilling();
      const pendingProductId = p.pendingProductId || profile?.pendingProductId || undefined;
      if (billing.status === 'active') {
        const snap = billing.snap;
        const pendingCleared = Boolean(pendingProductId) && snap.productId === pendingProductId;
        const nextPending = pendingCleared ? undefined : pendingProductId;
        if (snap.planId !== p.planId || nextPending !== p.pendingProductId) {
          prefsNext = {
            planId: snap.planId,
            trialStartedAt: p.trialStartedAt,
            pendingProductId: nextPending,
          };
          await savePlanPrefs(prefsNext);
          if (pendingCleared) {
            const { setPendingStoreProduct } = await import('@/lib/planLimits');
            await setPendingStoreProduct(null);
          }
        } else {
          const { syncPlanIdToSupabase } = await import('@/lib/aiUsage');
          void syncPlanIdToSupabase(snap.planId, snap);
        }
      } else if (
        billing.status === 'none' &&
        (p.planId === 'pro' ||
          p.planId === 'family' ||
          p.planId === 'lapsed' ||
          profile?.planId === 'pro' ||
          profile?.planId === 'family' ||
          profile?.planId === 'lapsed')
      ) {
        prefsNext = { planId: 'lapsed', trialStartedAt: p.trialStartedAt };
        if (p.planId !== 'lapsed') await savePlanPrefs(prefsNext);
      } else if (billing.status === 'unavailable' && profile?.planId === 'lapsed' && p.planId !== 'lapsed') {
        prefsNext = { planId: 'lapsed', trialStartedAt: p.trialStartedAt };
        await savePlanPrefs(prefsNext);
      }
    }

    setPrefs(prefsNext);
    setMembership({
      role: m.role,
      invitedLogins: seats.invitedLogins,
      householdId: m.householdId,
    });
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const uid = await resolveAppUserId();
      const ok = await configureRevenueCat(uid);
      if (!live) return;
      setBillingReady(ok);
      await refresh();
      if (ok) await refreshOffers();
      if (live) setReady(true);
    })();
    return () => {
      live = false;
    };
  }, [refresh, refreshOffers]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const entitlement = useMemo(
    () =>
      computeEntitlement(prefs, {
        invitedLogins: membership.invitedLogins,
        isHouseholdMember: membership.role === 'member',
      }),
    [prefs, membership]
  );

  const subscribe = useCallback(
    async (planId: 'pro', cadence: 'monthly' | 'yearly' = 'monthly') => {
      const want = cadence === 'monthly' ? ('pro_monthly' as const) : ('pro_yearly' as const);

      if (billingReady && offers.length) {
        const uid = await resolveAppUserId();
        if (!uid) {
          return {
            ok: false as const,
            error: 'Sign in before subscribing so the purchase stays on your account.',
          };
        }
        await configureRevenueCat(uid);
        const offer = pickOffer(offers, want);
        if (offer) {
          const result = await purchaseOffer(offer);
          if (result.ok) {
            await applyPlanId(result.planId, prefs.trialStartedAt);
            const { setPendingStoreProduct } = await import('@/lib/planLimits');
            await setPendingStoreProduct(result.pendingProductId);
            setPrefs((prev) => ({
              ...prev,
              planId: result.planId,
              pendingProductId: result.pendingProductId ?? undefined,
            }));
            return {
              ok: true as const,
              planId: result.planId,
              productId: result.productId,
              cadence: result.cadence,
              renewsAt: result.renewsAt,
              pendingProductId: result.pendingProductId,
            };
          }
          if (result.cancelled) {
            return {
              ok: false as const,
              cancelled: true as const,
              error: 'Purchase cancelled or Apple closed the sheet before finishing.',
            };
          }
          return { ok: false as const, error: result.error };
        }
        const period = cadence === 'monthly' ? 'monthly' : 'yearly';
        const name = 'Pro';
        return {
          ok: false as const,
          error: `No ${period} ${name} product is available.`,
        };
      }

      // Dev / web fallback, unlock locally when StoreKit isn't available.
      if (__DEV__ || !isRevenueCatConfigured()) {
        await applyPlanId(planId, prefs.trialStartedAt);
        return {
          ok: true as const,
          planId,
          productId: null,
          cadence: null,
          renewsAt: null,
          pendingProductId: null,
        };
      }
      return {
        ok: false as const,
        error:
          'Store products unavailable. Use a TestFlight / dev build with StoreKit, or Restore.',
      };
    },
    [billingReady, offers, applyPlanId, prefs.trialStartedAt]
  );

  const restore = useCallback(async () => {
    const result = await restorePurchases();
    if (result.ok) {
      await applyPlanId(result.planId, prefs.trialStartedAt);
      return { ok: true };
    }
    return { ok: false, error: result.error };
  }, [applyPlanId, prefs.trialStartedAt]);

  const restartTrial = useCallback(async () => {
    await applyPlanId('trial', new Date().toISOString());
  }, [applyPlanId]);

  const value = useMemo(
    () => ({
      ready,
      prefs,
      entitlement,
      membership,
      billingReady,
      offers,
      refresh,
      refreshOffers,
      subscribe,
      restore,
      restartTrial,
    }),
    [
      ready,
      prefs,
      entitlement,
      membership,
      billingReady,
      offers,
      refresh,
      refreshOffers,
      subscribe,
      restore,
      restartTrial,
    ]
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) {
    throw new Error('usePlan must be used within PlanProvider');
  }
  return ctx;
}

export function usePlanOptional(): PlanContextValue | null {
  return useContext(PlanContext);
}

export async function setPlanIdLocal(planId: PlanId): Promise<PlanPrefs> {
  const prev = await loadPlanPrefs();
  const next: PlanPrefs = {
    planId,
    trialStartedAt: prev.trialStartedAt,
  };
  await savePlanPrefs(next);
  return next;
}
