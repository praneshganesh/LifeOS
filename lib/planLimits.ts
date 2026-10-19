import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'lifeos:plan:v1';

export type PlanId = 'trial' | 'pro' | 'family' | 'lapsed';

export type PlanDef = {
  id: PlanId;
  name: string;
  price: string;
  perks: string[];
  limits: {
    assets: number;
    homes: number;
    members: number;
  };
};

const UNLIMITED = {
  assets: Infinity,
  homes: Infinity,
  members: Infinity,
} as const;

/**
 * In-app trial length (days). Override with EXPO_PUBLIC_TRIAL_DAYS.
 * Keep StoreKit / Play intro offers aligned with this number.
 */
function resolveTrialDays(): number {
  const raw = (process.env.EXPO_PUBLIC_TRIAL_DAYS ?? '').trim();
  const n = raw ? Number(raw) : 7;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 7;
}

export const TRIAL_DAYS = resolveTrialDays();

/** Family plan includes this many app logins (owner + invitees). Not sold at launch. */
export const FAMILY_LOGIN_SEATS = 4;

/** Paid Talk turns per calendar day. */
export const PRO_TALK_DAILY = 100;

/** Trial Talk turns per calendar day. */
export const TRIAL_TALK_DAILY = 25;

export const PLANS: PlanDef[] = [
  {
    id: 'trial',
    name: 'Trial',
    price: `${TRIAL_DAYS} days`,
    perks: [
      `Full Pro for ${TRIAL_DAYS} days`,
      'Unlimited Things, homes, people',
      `${TRIAL_TALK_DAILY} Talk turns / day`,
      'One login, on your devices',
    ],
    limits: { ...UNLIMITED },
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'Pro',
    perks: [
      'Everything in Trial, after you pay',
      'Your devices, one login',
      `${PRO_TALK_DAILY} Talk turns / day`,
      'Person tags, like a child’s class on your account',
    ],
    limits: { ...UNLIMITED },
  },
  {
    id: 'family',
    name: 'Family',
    price: 'Family',
    perks: [
      'Not offered at launch',
      'A stored Family tier is treated as Pro',
    ],
    limits: { ...UNLIMITED },
  },
  {
    id: 'lapsed',
    name: 'Ended',
    price: 'Ended',
    perks: ['Resubscribe to continue'],
    limits: { assets: 0, homes: 0, members: 0 },
  },
];

export type PlanPrefs = {
  planId: PlanId;
  trialStartedAt?: string;
  /** Store product queued for the next renewal, when it differs from the active one. */
  pendingProductId?: string;
};

export const DEFAULT_PLAN: PlanPrefs = { planId: 'trial' };

function normalizePlanId(id: unknown): PlanId {
  if (id === 'pro' || id === 'family' || id === 'trial' || id === 'lapsed') return id;
  if (id === 'free') return 'trial';
  return 'trial';
}

export async function loadPlanPrefs(): Promise<PlanPrefs> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const fresh: PlanPrefs = {
        planId: 'trial',
        trialStartedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    const parsed = JSON.parse(raw) as Partial<PlanPrefs> & { planId?: unknown };
    const storedId = normalizePlanId(parsed.planId);
    const planId = storedId === 'family' ? 'pro' : storedId;
    const trialStartedAt =
      typeof parsed.trialStartedAt === 'string' && parsed.trialStartedAt
        ? parsed.trialStartedAt
        : planId === 'trial'
          ? new Date().toISOString()
          : undefined;
    const pendingProductId =
      typeof parsed.pendingProductId === 'string' && parsed.pendingProductId.trim()
        ? parsed.pendingProductId.trim()
        : undefined;
    const prefs: PlanPrefs = {
      planId,
      trialStartedAt,
      ...(pendingProductId ? { pendingProductId } : {}),
    };
    if (String(parsed.planId) === 'free' || storedId === 'family') {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      if (storedId === 'family') {
        void import('@/lib/aiUsage')
          .then((m) => m.syncPlanIdToSupabase('pro'))
          .catch(() => undefined);
      }
    }
    return prefs;
  } catch {
    return {
      planId: 'trial',
      trialStartedAt: new Date().toISOString(),
    };
  }
}

async function storedPendingProductId(): Promise<string | undefined> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { pendingProductId?: unknown };
    return typeof parsed.pendingProductId === 'string' && parsed.pendingProductId.trim()
      ? parsed.pendingProductId.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

export async function savePlanPrefs(prefs: PlanPrefs): Promise<void> {
  const planId = normalizePlanId(prefs.planId);
  const pending =
    planId === 'trial' || planId === 'lapsed'
      ? undefined
      : prefs.pendingProductId?.trim() || (await storedPendingProductId());
  const next: PlanPrefs = {
    planId,
    trialStartedAt:
      prefs.trialStartedAt ||
      (planId === 'trial' ? new Date().toISOString() : undefined),
    ...(pending ? { pendingProductId: pending } : {}),
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  void import('@/lib/cloud/sync').then((m) => m.scheduleCloudPush()).catch(() => undefined);
  void import('@/lib/aiUsage')
    .then((m) => m.syncPlanIdToSupabase(planId))
    .catch(() => undefined);
}

/** Remember a deferred store product, or clear it once that product is active. */
export async function setPendingStoreProduct(pendingProductId: string | null): Promise<void> {
  const current = await loadPlanPrefs();
  const pending =
    current.planId === 'trial' ? undefined : pendingProductId?.trim() || undefined;
  const next: PlanPrefs = {
    planId: current.planId,
    trialStartedAt: current.trialStartedAt,
    ...(pending ? { pendingProductId: pending } : {}),
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  const { syncPlanIdToSupabase } = await import('@/lib/aiUsage');
  await syncPlanIdToSupabase(current.planId, {
    cadence: null,
    productId: null,
    renewsAt: null,
    pendingProductId: pending ?? null,
    updatePending: true,
  });
}

export function planById(id: PlanId | 'free'): PlanDef {
  const nid = normalizePlanId(id);
  return PLANS.find((p) => p.id === nid) ?? PLANS[0]!;
}

/** Days remaining on trial (can be negative). Null if not on trial. */
export function trialDaysLeft(prefs: PlanPrefs, now = new Date()): number | null {
  if (prefs.planId !== 'trial') return null;
  const start = prefs.trialStartedAt
    ? new Date(prefs.trialStartedAt)
    : now;
  if (Number.isNaN(start.getTime())) return TRIAL_DAYS;
  const end = new Date(start);
  end.setDate(end.getDate() + TRIAL_DAYS);
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export type UsageSnapshot = {
  assets: number;
  homes: number;
  members: number;
};

export type LimitMeter = {
  used: number;
  limit: number;
  /** 0–1, capped */
  ratio: number;
  over: boolean;
  label: string;
};

export function meterFor(
  used: number,
  limit: number,
  unit: string
): LimitMeter {
  if (!Number.isFinite(limit)) {
    return {
      used,
      limit,
      ratio: 0,
      over: false,
      label: `${used} ${unit} · Unlimited`,
    };
  }
  const ratio = limit <= 0 ? 1 : Math.min(1, used / limit);
  return {
    used,
    limit,
    ratio,
    over: used > limit,
    label: `${used} / ${limit} ${unit}`,
  };
}

export function buildLimitMeters(
  plan: PlanDef,
  usage: UsageSnapshot
): { assets: LimitMeter; homes: LimitMeter; members: LimitMeter } {
  return {
    assets: meterFor(usage.assets, plan.limits.assets, 'Things'),
    homes: meterFor(usage.homes, plan.limits.homes, 'homes'),
    members: meterFor(usage.members, plan.limits.members, 'people'),
  };
}

/** Structured data is unlimited on every SKU. Media/Talk caps come later. */
export function wouldExceedAssetLimit(_plan: PlanDef, _currentAssets: number): boolean {
  return false;
}

export function wouldExceedHomeLimit(_plan: PlanDef, _currentHomes: number): boolean {
  return false;
}

export function wouldExceedMemberLimit(
  _plan: PlanDef,
  _currentMembers: number
): boolean {
  return false;
}

export type PlanLimitKind = 'assets' | 'homes' | 'members';

export class PlanLimitError extends Error {
  kind: PlanLimitKind;
  constructor(kind: PlanLimitKind) {
    const label =
      kind === 'assets' ? 'Things' : kind === 'homes' ? 'homes' : 'people';
    super(`Plan limit reached for ${label}.`);
    this.name = 'PlanLimitError';
    this.kind = kind;
  }
}

export function messageForPlanLimit(err: unknown): string | null {
  if (err instanceof PlanLimitError) return err.message;
  if (err instanceof Error && err.message.startsWith('Plan limit reached')) {
    return err.message;
  }
  if (err instanceof Error && err.message.startsWith('Free plan limit')) {
    return err.message;
  }
  return null;
}
