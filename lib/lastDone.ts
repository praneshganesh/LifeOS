import { localDayKey } from '@/lib/dates';

export type RemindUnit = 'days' | 'months';

export type RemindInterval = {
  value: number;
  unit: RemindUnit;
};

/** One time you marked this activity done. */
export type LastDoneLog = {
  id: string;
  doneAt: string;
};

export type LastDoneItem = {
  id: string;
  /** Free-form activity, e.g. "Changed AC filter" — reused across logs */
  label: string;
  createdAt: string;
  /** History of times done, newest first */
  logs: LastDoneLog[];
  /** Optional link to an inventory item this activity is about */
  inventoryItemId?: string;
  /** Absolute next-reminder date, if set */
  remindAt?: string;
  /**
   * Optional recurring interval. When set, each mark-done
   * rolls remindAt forward from the new done date.
   */
  remindInterval?: RemindInterval;
};

export type LogDoneInput = {
  id?: string;
  label?: string;
  /** When it was done — defaults to now (YYYY-MM-DD or ISO) */
  doneAt?: string;
  /** Link (or re-link) this activity to an inventory item */
  inventoryItemId?: string | null;
  /**
   * Absolute reminder date. Pass `null` to clear.
   * Ignored when `remindInterval` is provided (computed instead).
   */
  remindAt?: string | null;
  /**
   * Recurring interval. Pass `null` to clear.
   * When set, remindAt is computed from doneAt + interval.
   */
  remindInterval?: RemindInterval | null;
};

function dayDiff(fromISO: string, toDate: Date): number {
  const from = new Date(fromISO);
  const startTo = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
  const startFrom = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round(
    (startTo.getTime() - startFrom.getTime()) / (1000 * 60 * 60 * 24)
  );
}

/** How many calendar days ago (positive = past). */
export function daysSince(iso: string, now = new Date()): number {
  return dayDiff(iso, now);
}

/** How many calendar days until (positive = future). */
export function daysUntil(iso: string, now = new Date()): number {
  return -dayDiff(iso, now);
}

export function formatRelativeDone(iso: string, now = new Date()): string {
  const days = daysSince(iso, now);

  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return months === 1 ? '1 month ago' : `${months} months ago`;
  }
  const years = Math.floor(days / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

/** Human label for a reminder due date. */
export function formatRemindStatus(iso: string, now = new Date()): string {
  const days = daysUntil(iso, now);
  if (days < 0) {
    const overdue = Math.abs(days);
    if (overdue === 1) return 'Overdue 1d';
    return `Overdue ${overdue}d`;
  }
  if (days === 0) return 'Remind today';
  if (days === 1) return 'Remind tomorrow';
  if (days < 30) return `Remind in ${days}d`;
  const months = Math.round(days / 30);
  return months === 1 ? 'Remind in 1 mo' : `Remind in ${months} mo`;
}

export function formatInterval(interval: RemindInterval): string {
  const unit =
    interval.value === 1
      ? interval.unit === 'days'
        ? 'day'
        : 'month'
      : interval.unit;
  return `Every ${interval.value} ${unit}`;
}

export function normalizeLabel(raw: string) {
  return raw.trim().replace(/\s+/g, ' ');
}

export function labelsMatch(a: string, b: string) {
  return normalizeLabel(a).toLowerCase() === normalizeLabel(b).toLowerCase();
}

export function sortLogsNewestFirst(logs: LastDoneLog[]): LastDoneLog[] {
  return [...logs].sort(
    (a, b) => new Date(b.doneAt).getTime() - new Date(a.doneAt).getTime()
  );
}

export function getLastDoneAt(item: LastDoneItem): string {
  if (item.logs?.length) return item.logs[0].doneAt;
  return item.createdAt;
}

export function createLogEntry(doneAt: Date | string = new Date()): LastDoneLog {
  const d = typeof doneAt === 'string' ? parseDateInput(doneAt) ?? new Date() : doneAt;
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    doneAt: startOfDayISO(d),
  };
}

/** Migrate legacy `{ lastDoneAt }` items and normalize log order. */
export function normalizeItem(raw: unknown): LastDoneItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.label !== 'string') return null;

  const createdAt =
    typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString();

  let logs: LastDoneLog[] = [];
  if (Array.isArray(r.logs)) {
    logs = r.logs
      .filter(
        (l): l is LastDoneLog =>
          !!l &&
          typeof l === 'object' &&
          typeof (l as LastDoneLog).id === 'string' &&
          typeof (l as LastDoneLog).doneAt === 'string'
      )
      .map((l) => ({ id: l.id, doneAt: l.doneAt }));
  }

  if (!logs.length && typeof r.lastDoneAt === 'string') {
    logs = [{ id: `log-migrated-${r.id}`, doneAt: r.lastDoneAt }];
  }

  if (!logs.length && !(typeof r.remindAt === 'string' && r.remindAt.trim())) {
    logs = [createLogEntry(createdAt)];
  }

  const item: LastDoneItem = {
    id: r.id,
    label: r.label,
    createdAt,
    logs: sortLogsNewestFirst(logs),
  };

  if (typeof r.inventoryItemId === 'string' && r.inventoryItemId.trim()) {
    item.inventoryItemId = r.inventoryItemId.trim();
  }
  if (typeof r.remindAt === 'string') item.remindAt = r.remindAt;
  if (
    r.remindInterval &&
    typeof r.remindInterval === 'object' &&
    typeof (r.remindInterval as RemindInterval).value === 'number' &&
    ((r.remindInterval as RemindInterval).unit === 'days' ||
      (r.remindInterval as RemindInterval).unit === 'months')
  ) {
    item.remindInterval = r.remindInterval as RemindInterval;
  }

  return item;
}

/** Score how well a stored label matches what the user typed. Higher = better. */
export function scoreLabelMatch(label: string, query: string): number {
  const l = normalizeLabel(label).toLowerCase();
  const q = normalizeLabel(query).toLowerCase();
  if (!q || !l) return 0;
  if (l === q) return 100;

  const words = l.split(/\s+/);
  if (l.startsWith(q)) return 90;
  if (words.some((w) => w.startsWith(q))) return 85;

  const qTokens = q.split(/\s+/).filter(Boolean);
  if (
    qTokens.length > 1 &&
    qTokens.every(
      (t) => l.includes(t) || words.some((w) => w.startsWith(t) || t.startsWith(w))
    )
  ) {
    return 75;
  }

  if (l.includes(q)) return 55;
  if (qTokens.some((t) => t.length >= 3 && words.some((w) => w.startsWith(t)))) {
    return 45;
  }
  return 0;
}

/** Filter + rank existing items for a query. Empty query returns all (most recent first). */
export function findMatches(items: LastDoneItem[], query: string): LastDoneItem[] {
  const q = normalizeLabel(query);
  if (!q) return sortByMostRecent(items);

  return items
    .map((item) => ({ item, score: scoreLabelMatch(item.label, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (
        new Date(getLastDoneAt(b.item)).getTime() -
        new Date(getLastDoneAt(a.item)).getTime()
      );
    })
    .map((x) => x.item);
}

export function startOfDayISO(date: Date | string = new Date()): string {
  const d = typeof date === 'string' ? parseDateInput(date) : new Date(date);
  if (!d || Number.isNaN(d.getTime())) return localDayKey();
  // Store calendar days as YYYY-MM-DD (local) — never UTC ISO midnight.
  return localDayKey(d);
}

/** Parse YYYY-MM-DD (or ISO) into a local Date, or null if invalid. */
export function parseDateInput(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const day = Number(m[3]);
    const d = new Date(y, mo, day);
    if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== day) {
      return null;
    }
    return d;
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toDateInputValue(isoOrDate?: string | Date | null): string {
  if (!isoOrDate) return '';
  const d =
    typeof isoOrDate === 'string'
      ? parseDateInput(isoOrDate) ?? new Date(isoOrDate)
      : isoOrDate;
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addInterval(from: Date, interval: RemindInterval): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  if (interval.unit === 'days') {
    d.setDate(d.getDate() + interval.value);
  } else {
    d.setMonth(d.getMonth() + interval.value);
  }
  return d;
}

export function resolveRemindAt(
  doneAt: Date,
  opts: {
    remindInterval?: RemindInterval | null;
    remindAt?: string | null;
  }
): Pick<LastDoneItem, 'remindAt' | 'remindInterval'> {
  if (opts.remindInterval) {
    return {
      remindInterval: opts.remindInterval,
      remindAt: startOfDayISO(addInterval(doneAt, opts.remindInterval)),
    };
  }
  if (opts.remindAt === null || opts.remindInterval === null) {
    return {};
  }
  if (opts.remindAt) {
    const parsed = parseDateInput(opts.remindAt);
    if (parsed) return { remindAt: startOfDayISO(parsed) };
  }
  return {};
}

export function createLastDoneItem(
  label: string,
  opts: {
    doneAt?: Date | null;
    remindAt?: string;
    remindInterval?: RemindInterval;
    inventoryItemId?: string;
  } = {}
): LastDoneItem {
  const createdAt = new Date().toISOString();
  const item: LastDoneItem = {
    id: `ld-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: normalizeLabel(label),
    createdAt,
    logs: opts.doneAt === null ? [] : [createLogEntry(opts.doneAt ?? new Date())],
  };
  if (opts.remindAt) item.remindAt = opts.remindAt;
  if (opts.remindInterval) item.remindInterval = opts.remindInterval;
  if (opts.inventoryItemId) item.inventoryItemId = opts.inventoryItemId;
  return item;
}

/** Append a new log onto an existing activity (does not overwrite history). */
export function appendLog(
  existing: LastDoneItem,
  opts: {
    doneAt?: Date;
    remindAt?: string | null;
    remindInterval?: RemindInterval | null;
    inventoryItemId?: string | null;
    /** When true, replace remind fields from opts (including clear). */
    replaceRemind?: boolean;
  } = {}
): LastDoneItem {
  const doneAt = opts.doneAt ?? new Date();
  const entry = createLogEntry(doneAt);
  const next: LastDoneItem = {
    id: existing.id,
    label: existing.label,
    createdAt: existing.createdAt,
    logs: sortLogsNewestFirst([entry, ...existing.logs]),
  };

  if (opts.inventoryItemId === null) {
    // intentionally unlinked
  } else if (typeof opts.inventoryItemId === 'string' && opts.inventoryItemId) {
    next.inventoryItemId = opts.inventoryItemId;
  } else if (existing.inventoryItemId) {
    next.inventoryItemId = existing.inventoryItemId;
  }

  if (opts.replaceRemind) {
    if (opts.remindAt) next.remindAt = opts.remindAt;
    if (opts.remindInterval) next.remindInterval = opts.remindInterval;
  } else {
    if (existing.remindAt) next.remindAt = existing.remindAt;
    if (existing.remindInterval) next.remindInterval = existing.remindInterval;
    if (opts.remindAt) next.remindAt = opts.remindAt;
    if (opts.remindInterval) next.remindInterval = opts.remindInterval;
  }

  return next;
}

export function sortByMostRecent(items: LastDoneItem[]) {
  return [...items].sort(
    (a, b) =>
      new Date(getLastDoneAt(b)).getTime() - new Date(getLastDoneAt(a)).getTime()
  );
}

/** Home only: last activity today or yesterday. */
export function isRecentForHome(item: LastDoneItem, now = new Date()): boolean {
  const days = daysSince(getLastDoneAt(item), now);
  return days >= 0 && days <= 1;
}

export function recentForHome(items: LastDoneItem[], now = new Date()) {
  return sortByMostRecent(items.filter((item) => isRecentForHome(item, now)));
}

/** Activities linked to a specific inventory item, most recent first. */
export function forInventoryItem(items: LastDoneItem[], inventoryItemId: string) {
  return sortByMostRecent(
    items.filter((i) => i.inventoryItemId === inventoryItemId)
  );
}

export function itemSubtitle(item: LastDoneItem): string {
  const logs = item.logs ?? [];
  const remind = item.remindAt ? formatRemindStatus(item.remindAt) : null;
  if (!logs.length) return remind || '';
  const entries = logs
    .slice(0, 5)
    .map((l) => formatRelativeDone(l.doneAt).toLowerCase());
  const more = logs.length > 5 ? ` · +${logs.length - 5} more` : '';
  const base = entries.join(' · ') + more;
  return remind ? `${base} · ${remind}` : base;
}
