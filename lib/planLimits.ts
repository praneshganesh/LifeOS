import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'lifeos:plan:v1';

export type PlanId = 'trial' | 'pro' | 'family';

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

export const TRIAL_DAYS = 14;

/** Family plan includes this many app logins (owner + invitees). */
export const FAMILY_LOGIN_SEATS = 4;

export const PLANS: PlanDef[] = [
  {
    id: 'trial',
    name: 'Trial',
    price: `${TRIAL_DAYS} days`,
    perks: [
      'Full Pro for 14 days',
      'Unlimited Things, homes, people',
      'Talk, Capture, classes, habits',
      'One login — Family adds household sharing later',
    ],
    limits: { ...UNLIMITED },
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'AED 29 / mo',
    perks: [
      'Everything in Trial, after you pay',
      'One login · your devices (sync later)',
      'Talk capped per day (cost guard)',
      'Person tags — son’s class on your account',
    ],
    limits: { ...UNLIMITED },
  },
  {
    id: 'family',
    name: 'Family',
    price: 'AED 49 / mo',
    perks: [
      'Everything in Pro',
      '4 logins in one household',
      'Extra seats as add-ons',
      'Shared Things · personal habits',
    ],
    limits: { ...UNLIMITED },
  },
];

export type PlanPrefs = {
  planId: PlanId;
  trialStartedAt?: string;
};

export const DEFAULT_PLAN: PlanPrefs = { planId: 'trial' };

function normalizePlanId(id: unknown): PlanId {
  if (id === 'pro' || id === 'family' || id === 'trial') return id;
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
    const planId = normalizePlanId(parsed.planId);
    const trialStartedAt =
      typeof parsed.trialStartedAt === 'string' && parsed.trialStartedAt
        ? parsed.trialStartedAt
        : planId === 'trial'
          ? new Date().toISOString()
          : undefined;
    const prefs: PlanPrefs = { planId, trialStartedAt };
    if (String(parsed.planId) === 'free') {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    }
    return prefs;
  } catch {
    return {
      planId: 'trial',
      trialStartedAt: new Date().toISOString(),
    };
  }
}

export async function savePlanPrefs(prefs: PlanPrefs): Promise<void> {
  const planId = normalizePlanId(prefs.planId);
  const next: PlanPrefs = {
    planId,
    trialStartedAt:
      prefs.trialStartedAt ||
      (planId === 'trial' ? new Date().toISOString() : undefined),
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  void import('@/lib/cloud/sync').then((m) => m.scheduleCloudPush()).catch(() => undefined);
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
