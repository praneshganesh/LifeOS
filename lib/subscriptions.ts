import { localDayKey } from '@/lib/dates';
import type { Icon3DName } from '@/components/ui/Icon3D';
import { formatAmount, parseAmount } from '@/lib/expenses';

export type SubscriptionCycle = 'weekly' | 'monthly' | 'yearly';

export type SubscriptionCategory =
  | 'streaming'
  | 'software'
  | 'fitness'
  | 'cloud'
  | 'news'
  | 'other';

export type Subscription = {
  id: string;
  title: string;
  amount: number;
  currency: string;
  cycle: SubscriptionCycle;
  /** YYYY-MM-DD next renewal */
  renewsOn: string;
  category: SubscriptionCategory;
  provider?: string;
  autoRenew?: boolean;
  note?: string;
  inventoryItemId?: string;
  personId?: string;
  source?: 'manual' | 'talk' | 'capture';
  createdAt: string;
};

export type NewSubscriptionInput = {
  title: string;
  amount: number;
  currency?: string;
  cycle?: SubscriptionCycle;
  renewsOn?: string;
  category?: SubscriptionCategory;
  provider?: string;
  autoRenew?: boolean;
  note?: string;
  inventoryItemId?: string;
  personId?: string;
  source?: Subscription['source'];
  id?: string;
};

export const SUBSCRIPTION_CATEGORIES: {
  id: SubscriptionCategory;
  label: string;
  icon: Icon3DName;
}[] = [
  { id: 'streaming', label: 'Streaming', icon: 'tv' },
  { id: 'software', label: 'Software', icon: 'laptop' },
  { id: 'fitness', label: 'Fitness', icon: 'check' },
  { id: 'cloud', label: 'Cloud', icon: 'key' },
  { id: 'news', label: 'News', icon: 'scroll' },
  { id: 'other', label: 'Other', icon: 'credit' },
];

export const SUBSCRIPTION_CYCLES: {
  id: SubscriptionCycle;
  label: string;
}[] = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
];

export function iconForSubscriptionCategory(
  category: SubscriptionCategory
): Icon3DName {
  return SUBSCRIPTION_CATEGORIES.find((c) => c.id === category)?.icon ?? 'credit';
}

export function labelForSubscriptionCategory(
  category: SubscriptionCategory
): string {
  return SUBSCRIPTION_CATEGORIES.find((c) => c.id === category)?.label ?? 'Other';
}

export function labelForCycle(cycle: SubscriptionCycle): string {
  return SUBSCRIPTION_CYCLES.find((c) => c.id === cycle)?.label ?? cycle;
}

export { formatAmount, parseAmount };

function todayIso(d = new Date()): string {
  return localDayKey(d);
}

/** Default next renewal: one cycle from today. */
export function defaultRenewsOn(cycle: SubscriptionCycle, from = new Date()): string {
  const d = new Date(from);
  if (cycle === 'weekly') d.setDate(d.getDate() + 7);
  else if (cycle === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return todayIso(d);
}

export function createSubscription(input: NewSubscriptionInput): Subscription {
  const cycle = input.cycle || 'monthly';
  const title = input.title.trim() || input.provider?.trim() || 'Subscription';
  return {
    id: input.id ?? `sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    amount: input.amount,
    currency: (input.currency || 'AED').toUpperCase(),
    cycle,
    renewsOn: input.renewsOn || defaultRenewsOn(cycle),
    category: input.category || guessSubscriptionCategory(title),
    provider: input.provider?.trim() || undefined,
    autoRenew: input.autoRenew !== false,
    note: input.note?.trim() || undefined,
    inventoryItemId: input.inventoryItemId,
    personId: input.personId,
    source: input.source || 'manual',
    createdAt: new Date().toISOString(),
  };
}

/** Same title + amount + cycle → reuse (Talk retries). */
export function findDuplicateSubscription(
  list: Subscription[],
  input: Pick<NewSubscriptionInput, 'title' | 'amount' | 'cycle' | 'currency'>
): Subscription | undefined {
  const title = (input.title || '').trim().toLowerCase();
  const cycle = input.cycle || 'monthly';
  const currency = (input.currency || 'AED').toUpperCase();
  const amount = Number(input.amount);
  if (!title || !Number.isFinite(amount)) return undefined;
  return list.find(
    (s) =>
      s.title.trim().toLowerCase() === title &&
      s.cycle === cycle &&
      s.currency.toUpperCase() === currency &&
      Math.abs(s.amount - amount) < 0.005
  );
}

export function monthlyCost(sub: Subscription): number {
  if (!Number.isFinite(sub.amount)) return 0;
  if (sub.cycle === 'weekly') return (sub.amount * 52) / 12;
  if (sub.cycle === 'yearly') return sub.amount / 12;
  return sub.amount;
}

export function yearlyCost(sub: Subscription): number {
  return monthlyCost(sub) * 12;
}

export function sumMonthly(list: Subscription[]): number {
  return list.reduce((n, s) => n + monthlyCost(s), 0);
}

export function sumYearly(list: Subscription[]): number {
  return list.reduce((n, s) => n + yearlyCost(s), 0);
}

export function daysUntilRenewal(renewsOn: string, now = new Date()): number | null {
  const t = Date.parse(renewsOn);
  if (Number.isNaN(t)) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = new Date(t).setHours(0, 0, 0, 0);
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

export function sortByRenewal(list: Subscription[]): Subscription[] {
  return [...list].sort((a, b) => {
    if (a.renewsOn !== b.renewsOn) return a.renewsOn.localeCompare(b.renewsOn);
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function guessSubscriptionCategory(text: string): SubscriptionCategory {
  const t = text.toLowerCase();
  if (/netflix|spotify|disney|hulu|prime video|youtube|apple tv|streaming|osn|shahid/.test(t))
    return 'streaming';
  if (/adobe|office|microsoft 365|notion|figma|github|cursor|chatgpt|openai|software|saas/.test(t))
    return 'software';
  if (/gym|fitness|peloton|classpass|yoga/.test(t)) return 'fitness';
  if (/icloud|dropbox|google one|onedrive|aws|cloud/.test(t)) return 'cloud';
  if (/news|nyt|washington|economist|medium|substack/.test(t)) return 'news';
  return 'other';
}

export function normalizeSubscriptionCycle(raw?: string): SubscriptionCycle {
  const t = (raw || '').toLowerCase();
  if (/week/.test(t)) return 'weekly';
  if (/year|annual/.test(t)) return 'yearly';
  return 'monthly';
}

export function normalizeSubscriptionCategory(
  raw?: string
): SubscriptionCategory {
  const t = (raw || '').toLowerCase();
  if (SUBSCRIPTION_CATEGORIES.some((c) => c.id === t)) {
    return t as SubscriptionCategory;
  }
  return guessSubscriptionCategory(raw || '');
}

export function normalizeSubscription(raw: unknown): Subscription | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<Subscription>;
  if (!o.id || !o.title || typeof o.amount !== 'number') return null;
  const cycle = normalizeSubscriptionCycle(o.cycle);
  return {
    id: o.id,
    title: String(o.title),
    amount: o.amount,
    currency: (o.currency || 'AED').toUpperCase(),
    cycle,
    renewsOn: o.renewsOn || defaultRenewsOn(cycle),
    category: normalizeSubscriptionCategory(o.category),
    provider: o.provider,
    autoRenew: o.autoRenew !== false,
    note: o.note,
    inventoryItemId: o.inventoryItemId,
    personId: o.personId,
    source: o.source || 'manual',
    createdAt: o.createdAt || new Date().toISOString(),
  };
}
