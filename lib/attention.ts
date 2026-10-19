import type { Icon3DName } from '@/components/ui/Icon3D';
import type { InventoryItem } from '@/lib/InventoryContext';
import { hasValue } from '@/lib/inventoryNormalize';
import {
  daysUntil,
  formatRelativeDone,
  getLastDoneAt,
  type LastDoneItem,
} from '@/lib/lastDone';
import {
  daysUntilRenewal,
  formatAmount,
  iconForSubscriptionCategory,
  type Subscription,
} from '@/lib/subscriptions';
import { categorizeLastDone, type LastDoneCategoryId } from '@/lib/lastDoneCategories';
import type { ClassPack } from '@/lib/classes';
import {
  daysLeftInWindow,
  loggedOn,
  nextScheduledClassOccurrence,
  packStatus,
  remainingCount,
  classLabel,
} from '@/lib/classes';
import { localDayKey } from '@/lib/dates';

export type AttentionUrgency = 'urgent' | 'soon' | 'info' | 'ok';

export type AttentionItem = {
  id: string;
  title: string;
  subtitle: string;
  urgency: AttentionUrgency;
  category: string;
  icon: Icon3DName;
  daysLeft?: number;
  href?: string;
};

/**
 * Reminder rows reuse the Last Done keyword grouping. Anything that doesn't
 * match a real group is just labelled "Reminder", never a wrong guess.
 */
const REMINDER_BADGE: Record<LastDoneCategoryId, { label: string; icon: Icon3DName }> = {
  home: { label: 'Home', icon: 'house' },
  health: { label: 'Health', icon: 'medical' },
  vehicle: { label: 'Vehicles', icon: 'car' },
  documents: { label: 'Documents', icon: 'document' },
  family: { label: 'Family', icon: 'family' },
  other: { label: 'Reminder', icon: 'bell' },
};

/** "today", "tomorrow", or "in 5 days". */
function inDays(n: number): string {
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  return `in ${n} days`;
}

function parseDay(raw?: string): Date | null {
  if (!raw?.trim() || raw === '—') return null;
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  const d = m ? new Date(m[1] + 'T12:00:00') : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function warrantyStatus(expiry: string): {
  urgency: AttentionUrgency;
  daysLeft: number;
} | null {
  const d = parseDay(expiry);
  if (!d) return null;
  const daysLeft = daysUntil(d.toISOString());
  if (daysLeft < 0) return { urgency: 'urgent', daysLeft };
  if (daysLeft <= 30) return { urgency: 'urgent', daysLeft };
  if (daysLeft <= 90) return { urgency: 'soon', daysLeft };
  if (daysLeft <= 365) return { urgency: 'ok', daysLeft };
  return null;
}

function docExpiryStatus(item: InventoryItem): {
  urgency: AttentionUrgency;
  daysLeft: number;
  label: string;
} | null {
  const raw = item.expiryDate || item.warrantyExpiry;
  const d = parseDay(raw);
  if (!d) return null;
  const daysLeft = daysUntil(d.toISOString());
  const label = item.name;
  if (daysLeft < 0)
    return { urgency: 'urgent', daysLeft, label: `${label} expired` };
  if (daysLeft <= 60)
    return {
      urgency: 'urgent',
      daysLeft,
      label: `${label} expires ${inDays(daysLeft)}`,
    };
  if (daysLeft <= 180)
    return {
      urgency: 'soon',
      daysLeft,
      label: `${label} expires ${inDays(daysLeft)}`,
    };
  if (daysLeft <= 365)
    return {
      urgency: 'ok',
      daysLeft,
      label: `${label} expires in ${Math.round(daysLeft / 30)} months`,
    };
  return null;
}

/**
 * Build home “Due soon” from on-device inventory, Last Done, and subscriptions.
 * No mock rows.
 */
export function buildAttentionItems(
  inventory: InventoryItem[],
  lastDone: LastDoneItem[] = [],
  subscriptions: Subscription[] = [],
  classPacks: ClassPack[] = [],
  now = new Date()
): AttentionItem[] {
  const out: AttentionItem[] = [];

  for (const item of inventory) {
    if (
      item.isDocument ||
      item.category === 'Documents' ||
      item.category === 'Document'
    ) {
      const doc = docExpiryStatus(item);
      if (doc) {
        out.push({
          id: `doc-${item.id}`,
          title: doc.label,
          subtitle:
            [item.brand, item.room].filter(hasValue).join(' · ') || 'Documents',
          urgency: doc.urgency,
          category: 'Document',
          icon: item.icon,
          daysLeft: doc.daysLeft,
          href: `/asset/${item.id}`,
        });
      }
      continue;
    }

    const w = warrantyStatus(item.warrantyExpiry);
    if (w) {
      const title =
        w.daysLeft < 0
          ? `${item.name} warranty expired`
          : `${item.name} warranty ends ${inDays(w.daysLeft)}`;
      out.push({
        id: `war-${item.id}`,
        title,
        subtitle: [item.brand, item.room].filter(hasValue).join(' · '),
        urgency: w.urgency,
        category: 'Warranty',
        icon: item.icon,
        daysLeft: w.daysLeft,
        href: `/asset/${item.id}`,
      });
    }
  }

  for (const activity of lastDone) {
    if (!activity.remindAt || (activity.onceDone && !activity.remindInterval)) continue;
    const daysLeft = daysUntil(activity.remindAt, now);
    if (daysLeft > 14) continue;
    const urgency: AttentionUrgency =
      daysLeft < 0 ? 'urgent' : daysLeft <= 3 ? 'urgent' : 'soon';
    const when =
      daysLeft < 0
        ? activity.logs?.length
          ? `Overdue · last ${formatRelativeDone(getLastDoneAt(activity)).toLowerCase()}`
          : 'Overdue'
        : daysLeft === 0
          ? 'Due today'
          : `Due ${inDays(daysLeft)}`;
    const badge = REMINDER_BADGE[categorizeLastDone(activity.label).id];
    out.push({
      id: `ld-${activity.id}`,
      title: activity.label,
      subtitle: when,
      urgency,
      category: badge.label,
      icon: badge.icon,
      daysLeft,
      href: `/last-done/${activity.id}`,
    });
  }

  for (const sub of subscriptions) {
    const daysLeft = daysUntilRenewal(sub.renewsOn, now);
    if (daysLeft == null || daysLeft > 14) continue;
    const urgency: AttentionUrgency =
      daysLeft < 0 ? 'urgent' : daysLeft <= 3 ? 'urgent' : 'soon';
    const when =
      daysLeft < 0
        ? 'Renewal overdue'
        : daysLeft === 0
          ? 'Renews today'
          : `Renews ${inDays(daysLeft)}`;
    out.push({
      id: `sub-${sub.id}`,
      title: sub.title,
      subtitle: `${when} · ${formatAmount(sub.amount, sub.currency)}`,
      urgency,
      category: 'Subscription',
      icon: iconForSubscriptionCategory(sub.category),
      daysLeft,
      href: `/subscriptions/${sub.id}`,
    });
  }

  for (const pack of classPacks) {
    const remaining = remainingCount(pack);
    if (remaining === 0) continue;
    const status = packStatus(pack);
    const daysLeft = daysLeftInWindow(pack);
    const who = pack.assignedTo ? `${pack.assignedTo} · ` : '';

    // 1. Upcoming scheduled class sessions (e.g. today or tomorrow)
    if (status !== 'expired' && pack.scheduleDays?.length) {
      const occ = nextScheduledClassOccurrence(pack, now);
      if (occ) {
        const todayStr = localDayKey(now);
        const isToday = occ.daysAhead === 0;
        const alreadyDoneToday = isToday && loggedOn(pack, todayStr);
        if (!alreadyDoneToday && occ.daysAhead <= 1) {
          const title = `${who}${classLabel(pack.title)} ${isToday ? 'today' : 'tomorrow'}`;
          const subtitle = `${remaining != null ? `${remaining} session${remaining === 1 ? '' : 's'} left · ` : ''}Every ${occ.dayName}${pack.scheduleTime ? ` · ${pack.scheduleTime}` : ''}`;
          out.push({
            id: `cls-sched-${pack.id}-${occ.date}`,
            title,
            subtitle,
            urgency: isToday ? 'urgent' : 'soon',
            category: 'Classes',
            icon: 'today',
            daysLeft: occ.daysAhead,
            href: `/classes/${pack.id}`,
          });
        }
      }
    }

    // 2. Class window expiration or ending-soon notices
    if (status === 'active') continue;
    if (status === 'expired') {
      out.push({
        id: `cls-${pack.id}`,
        title: remaining == null
          ? `${pack.title} ended`
          : `${pack.title} ended with ${remaining} session${remaining === 1 ? '' : 's'} left`,
        subtitle: who + (remaining == null ? 'window ended' : `${remaining} of ${pack.total} unused`),
        urgency: 'urgent',
        category: 'Classes',
        icon: 'today',
        daysLeft,
        href: `/classes/${pack.id}`,
      });
      continue;
    }
    if (status === 'ending-soon') {
      out.push({
        id: `cls-${pack.id}`,
        title: `${pack.title}: ${remaining == null ? 'ending soon' : `${remaining} session${remaining === 1 ? '' : 's'} left`}`,
        subtitle: who + `window ends ${inDays(daysLeft)}`,
        urgency: daysLeft <= 7 ? 'urgent' : 'soon',
        category: 'Classes',
        icon: 'today',
        daysLeft,
        href: `/classes/${pack.id}`,
      });
    }
  }

  const rank = { urgent: 0, soon: 1, info: 2, ok: 3 } as const;
  return out.sort(
    (a, b) =>
      (rank[a.urgency] ?? 9) - (rank[b.urgency] ?? 9) ||
      (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999)
  );
}

/** Home strip, skip quiet “ok” rows so true due-soon wins. */
export function dueSoonForHome(
  inventory: InventoryItem[],
  lastDone: LastDoneItem[] = [],
  subscriptions: Subscription[] = [],
  classPacks: ClassPack[] = [],
  limit = 3,
  now = new Date()
): AttentionItem[] {
  return openAttentionQueue(inventory, lastDone, subscriptions, classPacks, now).slice(
    0,
    limit
  );
}

/** Open queue, same set as Tasks & reminders (urgent + soon). */
export function openAttentionQueue(
  inventory: InventoryItem[],
  lastDone: LastDoneItem[] = [],
  subscriptions: Subscription[] = [],
  classPacks: ClassPack[] = [],
  now = new Date()
): AttentionItem[] {
  return buildAttentionItems(inventory, lastDone, subscriptions, classPacks, now).filter(
    (a) => a.urgency === 'urgent' || a.urgency === 'soon'
  );
}

/** Compact overdue rows for Talk / Ask (same sources as Today → Overdue). */
export function agendaOverdueItems(
  inventory: InventoryItem[],
  lastDone: LastDoneItem[] = [],
  subscriptions: Subscription[] = [],
  classPacks: ClassPack[] = [],
  now = new Date()
): { title: string; subtitle?: string; who?: string }[] {
  return buildAttentionItems(inventory, lastDone, subscriptions, classPacks, now)
    .filter((a) => a.daysLeft != null && a.daysLeft < 0)
    .map((a) => ({
      title: a.title,
      subtitle: a.subtitle,
      who: a.subtitle && !/^(Documents|Reminder|Overdue)/i.test(a.subtitle)
        ? a.subtitle.split('·')[0]?.trim()
        : undefined,
    }));
}

/**
 * Future due rows (attention + reminder dates) for Talk week/month agenda.
 * `dayKey` is local YYYY-MM-DD.
 */
export function agendaHorizonItems(
  inventory: InventoryItem[],
  lastDone: LastDoneItem[] = [],
  subscriptions: Subscription[] = [],
  classPacks: ClassPack[] = [],
  now = new Date()
): { title: string; dayKey: string; who?: string }[] {
  const today = localDayKey(now);
  const seen = new Set<string>();
  const out: { title: string; dayKey: string; who?: string }[] = [];

  const push = (title: string, dayKey: string, who?: string) => {
    const key = `${dayKey}::${title.trim().toLowerCase()}`;
    if (!title.trim() || !dayKey || seen.has(key)) return;
    seen.add(key);
    out.push({ title: title.trim(), dayKey, who });
  };

  for (const a of buildAttentionItems(
    inventory,
    lastDone,
    subscriptions,
    classPacks,
    now
  )) {
    if (a.daysLeft == null || a.daysLeft < 0) continue;
    const d = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + a.daysLeft
    );
    const who =
      a.subtitle && !/^(Documents|Reminder|Subscription|Class)/i.test(a.subtitle)
        ? a.subtitle.split('·')[0]?.trim()
        : undefined;
    push(a.title, localDayKey(d), who);
  }

  for (const item of lastDone) {
    const raw = item.remindAt?.trim();
    if (!raw) continue;
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!m) continue;
    if (m[1] < today) continue;
    push(item.label, m[1], item.assignedTo || undefined);
  }

  return out.sort((a, b) =>
    a.dayKey === b.dayKey
      ? a.title.localeCompare(b.title)
      : a.dayKey.localeCompare(b.dayKey)
  );
}

/** Attention rows due after today but soon (Today → Coming up). */
export function agendaComingItems(
  inventory: InventoryItem[],
  lastDone: LastDoneItem[] = [],
  subscriptions: Subscription[] = [],
  classPacks: ClassPack[] = [],
  now = new Date()
): { title: string; subtitle?: string; who?: string }[] {
  return buildAttentionItems(inventory, lastDone, subscriptions, classPacks, now)
    .filter(
      (a) =>
        (a.urgency === 'urgent' || a.urgency === 'soon') &&
        (a.daysLeft == null || a.daysLeft > 0)
    )
    .map((a) => ({
      title: a.title,
      subtitle: a.subtitle,
      who: a.subtitle?.split('·')[0]?.trim(),
    }));
}

export function warrantyRecordsFromInventory(inventory: InventoryItem[]) {
  return inventory
    .filter((i) => !i.isDocument && i.category !== 'Documents')
    .map((i) => {
      const has = i.warrantyExpiry && i.warrantyExpiry !== '—';
      const d = has ? parseDay(i.warrantyExpiry) : null;
      const days = d ? daysUntil(d.toISOString()) : null;
      let status: 'active' | 'expiring' | 'expired' | 'missing' = 'missing';
      if (has && days != null) {
        if (days < 0) status = 'expired';
        else if (days <= 90) status = 'expiring';
        else status = 'active';
      } else if (i.warrantyActive && has) {
        status = 'active';
      }
      return {
        id: `w-${i.id}`,
        assetId: i.id,
        assetName: i.name,
        brand: i.brand,
        room: i.room,
        icon: i.icon,
        expiresOn: has ? i.warrantyExpiry : '—',
        daysLeft: days,
        status,
      };
    });
}
