import type { PlanId } from '@/lib/planLimits';

export type ProfileBilling = {
  planId: PlanId;
  pendingProductId: string | null;
  /** Server trial clock. Wins over the on-device copy. */
  trialStartedAt: string | null;
};

function asPlanId(value: unknown): PlanId {
  if (value === 'family' || value === 'pro') return 'pro';
  if (value === 'trial' || value === 'lapsed') return value;
  return 'trial';
}

/** Server mirror of the store plan. Null when signed out or offline. */
export async function loadProfileBilling(): Promise<ProfileBilling | null> {
  try {
    const { isSupabaseConfigured, supabase } = await import('@/lib/supabase');
    if (!isSupabaseConfigured() || !supabase) return null;
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('plan_id, pending_store_product_id, trial_started_at')
      .eq('id', uid)
      .maybeSingle();
    if (error || !data) return null;
    const pending = data.pending_store_product_id;
    const trial = data.trial_started_at;
    return {
      planId: asPlanId(data.plan_id),
      pendingProductId: typeof pending === 'string' && pending.trim() ? pending.trim() : null,
      trialStartedAt:
        typeof trial === 'string' && !Number.isNaN(Date.parse(trial))
          ? new Date(trial).toISOString()
          : null,
    };
  } catch {
    return null;
  }
}
