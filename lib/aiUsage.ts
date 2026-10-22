import AsyncStorage from '@react-native-async-storage/async-storage';
import { localDayKey } from '@/lib/dates';
import { PRO_TALK_DAILY, TRIAL_TALK_DAILY, type PlanId } from '@/lib/planLimits';

const STORAGE_KEY = 'lifeos:aiUsage:v1';

/** Max OpenAI Talk/Ask turns per local calendar day. Local intents do not count. */
export const AI_DAILY_LIMIT: Record<PlanId, number> = {
  trial: TRIAL_TALK_DAILY,
  pro: PRO_TALK_DAILY,
  /** Launch does not sell Family. A leftover row uses the Pro guard. */
  family: PRO_TALK_DAILY,
  lapsed: 0,
};

export type AiUsageState = {
  day: string;
  count: number;
};

export type AiAllowance = {
  ok: boolean;
  day: string;
  used: number;
  limit: number;
  remaining: number;
  /** True when the figure came from Supabase (source of truth). */
  fromServer?: boolean;
};

export class AiDailyLimitError extends Error {
  planId: PlanId;
  used: number;
  limit: number;

  constructor(planId: PlanId, used: number, limit: number) {
    super(messageForAiDailyLimit(planId, used, limit));
    this.name = 'AiDailyLimitError';
    this.planId = planId;
    this.used = used;
    this.limit = limit;
  }
}

export function aiDailyLimit(planId: PlanId): number {
  return AI_DAILY_LIMIT[planId] ?? AI_DAILY_LIMIT.trial;
}

export function normalizeAiUsage(
  raw: unknown,
  day: string = localDayKey()
): AiUsageState {
  if (!raw || typeof raw !== 'object') return { day, count: 0 };
  const obj = raw as Partial<AiUsageState>;
  const storedDay = typeof obj.day === 'string' && obj.day ? obj.day : day;
  const count = Number(obj.count);
  if (storedDay !== day) return { day, count: 0 };
  return {
    day,
    count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
  };
}

export function remainingAiTurns(used: number, limit: number): number {
  if (!Number.isFinite(limit)) return Infinity;
  return Math.max(0, limit - Math.max(0, used));
}

export function allowanceFromState(
  planId: PlanId,
  state: AiUsageState
): AiAllowance {
  const limit = aiDailyLimit(planId);
  const used = state.count;
  const remaining = remainingAiTurns(used, limit);
  return {
    ok: remaining > 0,
    day: state.day,
    used,
    limit,
    remaining,
    fromServer: false,
  };
}

export function messageForAiDailyLimit(
  planId: PlanId,
  used: number,
  limit: number
): string {
  if (planId === 'lapsed') {
    return 'Your subscription has ended. Resubscribe to use Talk. You can still add things when a plan is active.';
  }
  if (planId === 'trial') {
    return `You've used today's ${limit} free Talk turns. Upgrade to Pro for more, or keep adding things manually.`;
  }
  if (planId === 'family') {
    return `Household Talk limit reached (${used}/${limit} today). Try again after the daily reset (UTC midnight). Manual capture stays unlimited.`;
  }
  return `Daily Talk limit reached (${used}/${limit}). Try again after the daily reset (UTC midnight). Manual capture stays unlimited.`;
}

export async function loadAiUsage(
  day: string = localDayKey()
): Promise<AiUsageState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { day, count: 0 };
    return normalizeAiUsage(JSON.parse(raw) as unknown, day);
  } catch {
    return { day, count: 0 };
  }
}

async function saveAiUsageMirror(state: AiUsageState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/**
 * A missing usage row used to come back as ok: null and remaining: 0.
 * Honor an explicit boolean. Otherwise the turn is open while used < limit.
 */
export function resolveServerAllowance(
  ok: unknown,
  used: number,
  limit: number,
  remaining: number
): { ok: boolean; remaining: number } {
  if (typeof ok === 'boolean') {
    return {
      ok,
      remaining: Number.isFinite(remaining) ? remaining : remainingAiTurns(used, limit),
    };
  }
  return { ok: used < limit, remaining: remainingAiTurns(used, limit) };
}

function parseServerAllowance(data: unknown, fallbackDay: string): AiAllowance | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  const used = Number(o.used);
  const limit = Number(o.limit);
  const remaining = Number(o.remaining);
  if (!Number.isFinite(used) || !Number.isFinite(limit)) return null;
  const resolved = resolveServerAllowance(o.ok, used, limit, remaining);
  return {
    ok: resolved.ok,
    day: typeof o.day === 'string' ? o.day : fallbackDay,
    used,
    limit,
    remaining: resolved.remaining,
    fromServer: true,
  };
}

type PlanBillingMirror = {
  cadence: 'monthly' | 'yearly' | null;
  productId: string | null;
  renewsAt: string | null;
  pendingProductId?: string | null;
  updatePending?: boolean;
};

/**
 * Mirror plan_id plus the store billing period onto profiles.
 * Talk limits still read plan_id only. Cadence is so the row shows monthly vs yearly.
 * A paid plan with no product id leaves the existing billing columns alone.
 */
export async function syncPlanIdToSupabase(
  planId: PlanId,
  billing?: PlanBillingMirror | null
): Promise<void> {
  try {
    // Paid plans are written only by the RevenueCat webhook → admin_set_plan_id.
    // set_my_plan_id on the client accepts trial / lapsed only.
    if (planId === 'pro' || planId === 'family') return;

    const { isSupabaseConfigured, supabase } = await import('@/lib/supabase');
    if (!isSupabaseConfigured() || !supabase) return;
    const { ensureCloudSession } = await import('@/lib/cloud/sync');
    await ensureCloudSession();
    void billing;
    const { error } = await supabase.rpc('set_my_plan_id', {
      p_plan: planId,
      p_cadence: null,
      p_product_id: null,
      p_renews_at: null,
      p_pending_product_id: null,
      p_update_pending: planId === 'trial',
    });
    if (error && __DEV__) {
      console.warn('[aiUsage] set_my_plan_id', error.message);
    }
  } catch (err) {
    if (__DEV__) console.warn('[aiUsage] syncPlanIdToSupabase', err);
  }
}

export async function peekAiAllowance(
  planId: PlanId,
  day: string = localDayKey()
): Promise<AiAllowance> {
  try {
    const { isSupabaseConfigured, supabase } = await import('@/lib/supabase');
    if (isSupabaseConfigured() && supabase) {
      const { ensureCloudSession } = await import('@/lib/cloud/sync');
      await ensureCloudSession();
      const { data, error } = await supabase.rpc('get_ai_allowance', { p_day: day });
      if (!error) {
        const parsed = parseServerAllowance(data, day);
        if (parsed) {
          await saveAiUsageMirror({ day: parsed.day, count: parsed.used });
          return parsed;
        }
      } else if (__DEV__) {
        console.warn('[aiUsage] get_ai_allowance', error.message);
      }
    }
  } catch (err) {
    if (__DEV__) console.warn('[aiUsage] peek server', err);
  }
  const state = await loadAiUsage(day);
  return allowanceFromState(planId, state);
}

/** Throws AiDailyLimitError when the plan's daily OpenAI budget is spent. */
export async function assertAiAllowance(planId: PlanId): Promise<AiAllowance> {
  const allowance = await peekAiAllowance(planId);
  if (!allowance.ok) {
    throw new AiDailyLimitError(planId, allowance.used, allowance.limit);
  }
  return allowance;
}

/**
 * Mirror after a successful chat turn.
 * Server consume happens in chat-api; this only updates the local UX counter.
 */
export async function recordAiTurn(
  day: string = localDayKey(),
  serverUsed?: number
): Promise<AiUsageState> {
  if (typeof serverUsed === 'number' && Number.isFinite(serverUsed)) {
    const next = { day, count: Math.max(0, Math.floor(serverUsed)) };
    await saveAiUsageMirror(next);
    return next;
  }
  const cur = await loadAiUsage(day);
  const next: AiUsageState = { day, count: cur.count + 1 };
  await saveAiUsageMirror(next);
  return next;
}

/** Access token for chat-api Authorization header (Supabase session). */
export async function getSupabaseAccessToken(): Promise<string | null> {
  try {
    const { isSupabaseConfigured, supabase } = await import('@/lib/supabase');
    if (!isSupabaseConfigured() || !supabase) return null;
    const { ensureCloudSession } = await import('@/lib/cloud/sync');
    await ensureCloudSession();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
