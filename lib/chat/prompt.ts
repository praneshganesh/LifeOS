import { localDayKey } from '@/lib/dates';

/** Shared LifeOS chat system rules (mirrored on the server). */
export const CHAT_SYSTEM_BRIEF = `LifeOS assistant. Conversational, concise. Never invent purchase dates, prices, stores, warranty, serials, service history, or spend totals — if a field is missing, say it isn’t recorded.`;

function meaningful(value?: string | null) {
  if (!value?.trim()) return false;
  const v = value.trim();
  return v !== '—' && v !== '-' && v.toLowerCase() !== 'unknown';
}

function dayOnly(isoOrDate?: string | null) {
  if (!meaningful(isoOrDate)) return undefined;
  const s = isoOrDate!.trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return localDayKey(d);
  return s;
}

export type InventorySummaryInput = {
  id: string;
  name: string;
  brand: string;
  room: string;
  category: string;
  price?: string;
  purchasedFrom?: string;
  purchaseDate?: string;
  warrantyExpiry?: string;
  warrantyActive?: boolean;
  serial?: string;
  assignedTo?: string;
  createdAt?: string;
  timeline?: { date: string; event: string }[];
};

export type LastDoneSummaryInput = {
  label: string;
  lastDoneAt?: string;
  remindAt?: string;
  inventoryItemId?: string;
  itemName?: string;
};

export type ExpenseSummaryInput = {
  id: string;
  title: string;
  amount: number;
  currency: string;
  category: string;
  date: string;
  merchant?: string;
};

/**
 * Compact on-device → API inventory card.
 * Omit empty placeholders so the model can’t treat "—" as real data.
 */
export function buildInventorySummary(
  items: InventorySummaryInput[],
  limit = 40
) {
  return items.slice(0, limit).map((i) => {
    const row: Record<string, unknown> = {
      id: i.id,
      name: i.name,
      brand: i.brand,
      room: i.room,
      category: i.category,
    };
    if (meaningful(i.price)) row.price = i.price!.trim();
    if (meaningful(i.purchasedFrom)) row.purchasedFrom = i.purchasedFrom!.trim();
    const bought = dayOnly(i.purchaseDate);
    if (bought) row.purchaseDate = bought;
    const added = dayOnly(i.createdAt);
    if (added) row.addedAt = added;
    const warranty = dayOnly(i.warrantyExpiry);
    if (warranty) {
      row.warrantyExpiry = warranty;
      if (typeof i.warrantyActive === 'boolean') row.warrantyActive = i.warrantyActive;
    }
    if (meaningful(i.serial)) row.serial = i.serial!.trim();
    if (meaningful(i.assignedTo)) row.assignedTo = i.assignedTo!.trim();

    const events = (i.timeline || [])
      .filter((t) => meaningful(t.date) && meaningful(t.event))
      .slice(0, 3)
      .map((t) => ({ date: dayOnly(t.date) || t.date.trim(), event: t.event.trim() }));
    if (events.length) row.recentEvents = events;

    return row;
  });
}

/** Compact Last Done activities for “when did I last …?” questions. */
export function buildLastDoneSummary(
  items: LastDoneSummaryInput[],
  limit = 20
) {
  return items
    .map((i) => {
      const lastDone = dayOnly(i.lastDoneAt);
      if (!meaningful(i.label) || !lastDone) return null;
      const row: Record<string, string> = {
        activity: i.label.trim(),
        lastDone,
      };
      const remind = dayOnly(i.remindAt);
      if (remind) row.remindAt = remind;
      if (meaningful(i.inventoryItemId)) row.itemId = i.inventoryItemId!.trim();
      if (meaningful(i.itemName)) row.itemName = i.itemName!.trim();
      return row;
    })
    .filter(Boolean)
    .slice(0, limit);
}

/** Compact expenses for spend Q&A — never invent beyond this list. */
export function buildExpenseSummary(items: ExpenseSummaryInput[], limit = 40) {
  return items.slice(0, limit).map((e) => {
    const row: Record<string, unknown> = {
      id: e.id,
      title: e.title,
      amount: e.amount,
      currency: e.currency,
      category: e.category,
      date: dayOnly(e.date) || e.date,
    };
    if (meaningful(e.merchant)) row.merchant = e.merchant!.trim();
    return row;
  });
}

export type HabitSummaryInput = {
  id: string;
  title: string;
  category: string;
  streak: number;
  doneToday: boolean;
  rate30: number;
};

export function buildHabitSummary(items: HabitSummaryInput[], limit = 30) {
  return items.slice(0, limit).map((h) => ({
    id: h.id,
    title: h.title,
    category: h.category,
    streak: h.streak,
    doneToday: h.doneToday,
    rate30: h.rate30,
  }));
}

export type SubscriptionSummaryInput = {
  id: string;
  title: string;
  amount: number;
  currency: string;
  cycle: string;
  renewsOn: string;
  category: string;
  provider?: string;
};

/** Compact subscriptions for renewals / recurring spend Q&A. */
export function buildSubscriptionSummary(
  items: SubscriptionSummaryInput[],
  limit = 30
) {
  return items.slice(0, limit).map((s) => {
    const row: Record<string, unknown> = {
      id: s.id,
      title: s.title,
      amount: s.amount,
      currency: s.currency,
      cycle: s.cycle,
      renewsOn: dayOnly(s.renewsOn) || s.renewsOn,
      category: s.category,
    };
    if (meaningful(s.provider)) row.provider = s.provider!.trim();
    return row;
  });
}

/** Normalize spoken/typed prices into a short display string. */
export function formatMoney(raw?: string | null): string | undefined {
  if (!raw?.trim()) return undefined;
  const s = raw.trim();
  if (s === '—' || s === '-') return undefined;

  const lower = s.toLowerCase();
  const numMatch = lower.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!numMatch) return titleRetailer(s);

  const amount = numMatch[1];
  const n = Number(amount);
  const pretty = Number.isFinite(n)
    ? n.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : amount;

  if (/\b(aed|dirham|dirhams|dhs|dh)\b/i.test(s) || /د\.?إ/.test(s)) {
    return `AED ${pretty}`;
  }
  if (/\b(usd|dollars?|\$)\b/i.test(s)) {
    return `USD ${pretty}`;
  }
  if (/\b(eur|euros?|€)\b/i.test(s)) {
    return `EUR ${pretty}`;
  }
  if (/\b(gbp|pounds?|£)\b/i.test(s)) {
    return `GBP ${pretty}`;
  }
  // Bare number in UAE context — default AED
  if (/^\s*[\d,.]+\s*$/.test(s)) {
    return `AED ${pretty}`;
  }
  if (/^aed\s*/i.test(s)) return `AED ${pretty}`;
  return s;
}

/** Light cleanup for store names (model should send good values; this is display polish). */
export function formatPurchasedFrom(raw?: string | null): string | undefined {
  if (!raw?.trim()) return undefined;
  const s = raw.trim();
  const key = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const known: Record<string, string> = {
    amazon: 'Amazon',
    sharafdg: 'Sharaf DG',
    sharaf: 'Sharaf DG',
    noon: 'Noon',
    carrefour: 'Carrefour',
    ikea: 'IKEA',
    apple: 'Apple',
    applestore: 'Apple Store',
  };
  if (known[key]) return known[key];
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function titleRetailer(s: string) {
  return s;
}
