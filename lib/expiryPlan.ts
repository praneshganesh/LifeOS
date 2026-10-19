import type { InventoryItem } from '@/lib/InventoryContext';
import type { LastDoneItem } from '@/lib/lastDone';
import { formatAmount, type Subscription } from '@/lib/subscriptions';
import { isInsuranceItem } from '@/lib/moduleFilters';
import {
  isInQuietHours,
  normalizeQuietHoursTime,
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
} from '@/lib/notificationPrefs';

export const EXPIRY_ID_PREFIX = 'lifeos-exp-';
/** iOS keeps only 64 pending local notifications per app; reminders and classes need room too. */
const MAX_EXPIRY_NOTIFICATIONS = 24;
const ALERT_HOUR = 9;

export type ExpiryKind = 'warranty' | 'document' | 'insurance' | 'subscription';

export type PlannedExpiryNotification = {
  id: string;
  kind: ExpiryKind;
  at: Date;
  title: string;
  body: string;
  href: string;
};

export type ExpiryPlanInput = {
  inventory: InventoryItem[];
  subscriptions: Subscription[];
  reminders: Pick<LastDoneItem, 'inventoryItemId' | 'remindAt'>[];
  prefs: NotificationPrefs;
  now?: Date;
};

/** Days-before offsets per kind; each becomes one alert at 9:00 local. */
const LEAD_DAYS: Record<ExpiryKind, number[]> = {
  warranty: [30, 7],
  document: [60, 14],
  insurance: [30, 7],
  subscription: [2],
};

type Day = { y: number; m: number; d: number };

function parseDay(raw?: string): Day | null {
  const m = raw?.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

function inDays(n: number): string {
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  return `in ${n} days`;
}

/** 9:00 local, pushed to the end of quiet hours when 9:00 falls inside them. */
function alertTime(
  day: Day,
  daysBefore: number,
  prefs: Pick<NotificationPrefs, 'quietHoursStart' | 'quietHoursEnd'>
): Date {
  const at = new Date(day.y, day.m, day.d - daysBefore, ALERT_HOUR, 0, 0, 0);
  const qStart = normalizeQuietHoursTime(
    prefs.quietHoursStart,
    DEFAULT_NOTIFICATION_PREFS.quietHoursStart
  );
  const qEnd = normalizeQuietHoursTime(prefs.quietHoursEnd, DEFAULT_NOTIFICATION_PREFS.quietHoursEnd);
  if (isInQuietHours(at, qStart, qEnd)) {
    const [h, min] = qEnd.split(':').map(Number);
    at.setHours(h ?? ALERT_HOUR, min ?? 0, 0, 0);
  }
  return at;
}

function isDocumentLike(item: InventoryItem) {
  return item.isDocument || item.category === 'Documents' || item.category === 'Document';
}

/**
 * Upcoming OS alerts for warranty ends, document and policy expiry, and
 * subscription renewals. Pure, so it can run on every launch or sync without
 * re-firing anything already in the past.
 */
export function planExpiryNotifications(input: ExpiryPlanInput): PlannedExpiryNotification[] {
  const { inventory, subscriptions, reminders, prefs } = input;
  const now = input.now ?? new Date();
  if (!prefs.push) return [];

  // A linked Last Done reminder (e.g. passport 6 months out) already covers that item.
  const coveredItemIds = new Set(
    reminders.filter((r) => r.inventoryItemId && r.remindAt).map((r) => r.inventoryItemId!)
  );

  const out: PlannedExpiryNotification[] = [];
  const add = (
    kind: ExpiryKind,
    key: string,
    day: Day,
    title: string,
    body: (daysLeft: number) => string,
    href: string
  ) => {
    for (const lead of LEAD_DAYS[kind]) {
      const at = alertTime(day, lead, prefs);
      if (at.getTime() <= now.getTime()) continue;
      out.push({
        id: `${EXPIRY_ID_PREFIX}${kind}-${key}-${lead}`,
        kind,
        at,
        title,
        body: body(lead),
        href,
      });
    }
  };

  for (const item of inventory) {
    if (coveredItemIds.has(item.id)) continue;
    const href = `/asset/${item.id}`;
    if (isInsuranceItem(item)) {
      if (!prefs.insurance) continue;
      const day = parseDay(item.expiryDate || item.warrantyExpiry);
      if (day) add('insurance', item.id, day, item.name, (n) => `Policy renews ${inDays(n)}.`, href);
      continue;
    }
    if (isDocumentLike(item)) {
      if (!prefs.documents) continue;
      const day = parseDay(item.expiryDate || item.warrantyExpiry);
      if (day) {
        add('document', item.id, day, item.name, (n) => `Expires ${inDays(n)}. Time to renew.`, href);
      }
      continue;
    }
    if (!prefs.warranties) continue;
    const day = parseDay(item.warrantyExpiry);
    if (day) {
      add(
        'warranty',
        item.id,
        day,
        item.name,
        (n) => `Warranty ends ${inDays(n)}. Anything to claim?`,
        href
      );
    }
  }

  if (prefs.subscriptions) {
    for (const sub of subscriptions) {
      const day = parseDay(sub.renewsOn);
      if (!day) continue;
      const price = formatAmount(sub.amount, sub.currency);
      add(
        'subscription',
        sub.id,
        day,
        sub.title,
        (n) => `Renews ${inDays(n)} · ${price}`,
        `/subscriptions/${sub.id}`
      );
    }
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_EXPIRY_NOTIFICATIONS);
}
