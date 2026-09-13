import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
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
  fetchCustomerPlanId,
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
  refreshOffers: () => Promise<void>;
  /**
   * Buy Pro or Family via RevenueCat when available.
   * Falls back to local unlock in __DEV__ if RC isn't available (web / missing key).
   */
  subscribe: (planId: 'pro' | 'family', cadence?: 'monthly' | 'yearly') => Promise<void>;
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
      return;
    }
    const list = await fetchPaywallOffers();
    setOffers(list);
  }, []);

  const refresh = useCallback(async () => {
    const [p, m, seats] = await Promise.all([
      loadPlanPrefs(),
      loadMembership(),
      loadSeatUsage(),
    ]);

    let prefsNext = p;
    if (m.role !== 'member' && isRevenueCatConfigured()) {
      const remote = await fetchCustomerPlanId();
      if (remote && remote !== p.planId) {
        prefsNext = { planId: remote, trialStartedAt: p.trialStartedAt };
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

  const entitlement = useMemo(
    () =>
      computeEntitlement(prefs, {
        invitedLogins: membership.invitedLogins,
        isHouseholdMember: membership.role === 'member',
      }),
    [prefs, membership]
  );

  const subscribe = useCallback(
    async (planId: 'pro' | 'family', cadence: 'monthly' | 'yearly' = 'yearly') => {
      const want =
        planId === 'pro'
          ? cadence === 'monthly'
            ? ('pro_monthly' as const)
            : ('pro_yearly' as const)
          : cadence === 'monthly'
            ? ('family_monthly' as const)
            : ('family_yearly' as const);

      if (billingReady && offers.length) {
        const offer = pickOffer(offers, want) || pickOffer(
          offers,
          planId === 'pro' ? 'pro_yearly' : 'family_yearly'
        );
        if (offer) {
          const result = await purchaseOffer(offer);
          if (result.ok) {
            await applyPlanId(result.planId, prefs.trialStartedAt);
            return;
          }
          if (!result.cancelled) {
            throw new Error(result.error);
          }
          return;
        }
      }

      // Dev / web fallback — unlock locally when StoreKit isn't available.
      if (__DEV__ || !isRevenueCatConfigured()) {
        await applyPlanId(planId, prefs.trialStartedAt);
        return;
      }
      throw new Error(
        'Store products unavailable. Use a TestFlight / dev build with StoreKit, or Restore.'
      );
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
