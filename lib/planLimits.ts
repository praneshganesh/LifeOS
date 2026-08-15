import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'lifeos:plan:v1';

export type PlanId = 'free' | 'pro' | 'family';

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

export const PLANS: PlanDef[] = [
  {
    id: 'free',
    name: 'Free',
    price: 'AED 0',
    perks: [
      '100 Things',
      '1 home space',
      '3 household people',
      'On-device Capture & search',
    ],
    limits: { assets: 100, homes: 1, members: 3 },
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'AED 29 / mo',
    perks: [
      'Unlimited Things & homes',
      'On-device document reading',
      'Maintenance & reports',
      'Talk (chat API)',
    ],
    limits: { assets: Infinity, homes: Infinity, members: Infinity },
  },
  {
    id: 'family',
    name: 'Family',
    price: 'AED 49 / mo',
    perks: [
      'Everything in Pro',
      'Unlimited household people',
      'Shared homes (when sync ships)',
      'Shared docs',
    ],
    limits: { assets: Infinity, homes: Infinity, members: Infinity },
  },
];

export type PlanPrefs = {
  planId: PlanId;
};

export const DEFAULT_PLAN: PlanPrefs = { planId: 'free' };

export async function loadPlanPrefs(): Promise<PlanPrefs> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PLAN };
    const parsed = JSON.parse(raw) as Partial<PlanPrefs>;
    const id = parsed.planId;
    if (id === 'free' || id === 'pro' || id === 'family') return { planId: id };
    return { ...DEFAULT_PLAN };
  } catch {
    return { ...DEFAULT_PLAN };
  }
}

export async function savePlanPrefs(prefs: PlanPrefs): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function planById(id: PlanId): PlanDef {
  return PLANS.find((p) => p.id === id) ?? PLANS[0]!;
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

/** True if adding one more asset would exceed the Free (or limited) plan. */
export function wouldExceedAssetLimit(plan: PlanDef, currentAssets: number): boolean {
  if (!Number.isFinite(plan.limits.assets)) return false;
  return currentAssets >= plan.limits.assets;
}

export function wouldExceedHomeLimit(plan: PlanDef, currentHomes: number): boolean {
  if (!Number.isFinite(plan.limits.homes)) return false;
  return currentHomes >= plan.limits.homes;
}

export function wouldExceedMemberLimit(
  plan: PlanDef,
  currentMembers: number
): boolean {
  if (!Number.isFinite(plan.limits.members)) return false;
  return currentMembers >= plan.limits.members;
}

export type PlanLimitKind = 'assets' | 'homes' | 'members';

export class PlanLimitError extends Error {
  kind: PlanLimitKind;
  constructor(kind: PlanLimitKind) {
    const label =
      kind === 'assets' ? 'Things' : kind === 'homes' ? 'homes' : 'people';
    super(
      `Free plan limit reached for ${label}. Upgrade in Settings → Plan, or remove something first.`
    );
    this.name = 'PlanLimitError';
    this.kind = kind;
  }
}

export function messageForPlanLimit(err: unknown): string | null {
  if (err instanceof PlanLimitError) return err.message;
  if (err instanceof Error && err.message.startsWith('Free plan limit')) {
    return err.message;
  }
  return null;
}
