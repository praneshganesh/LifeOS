import { addCalendarMonths, localDayKey } from '@/lib/dates';
import { daysUntil } from '@/lib/lastDone';

export type ClassLog = {
  id: string;
  /** YYYY-MM-DD */
  doneAt: string;
};

export type ClassPack = {
  id: string;
  title: string;
  personId?: string;
  assignedTo?: string;
  /** Purchased / enrolled session count */
  total: number;
  startsOn: string;
  endsOn: string;
  logs: ClassLog[];
  notes?: string;
  createdAt: string;
};

export type NewClassPackInput = {
  title: string;
  /** 0 / omit = count not set yet */
  total?: number;
  startsOn?: string;
  endsOn?: string;
  /** Used when endsOn is omitted — default 3 */
  months?: number;
  personId?: string;
  assignedTo?: string;
  notes?: string;
  id?: string;
};

export type ClassPackStatus = 'active' | 'ending-soon' | 'expired' | 'complete';

export function normalizeClassKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\b(class|classes|lesson|lessons|session|sessions|pack)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Patch an existing pack when Talk adds the same class again (count, window, person). */
export function mergeClassPackUpdate(
  existing: ClassPack,
  input: NewClassPackInput
): ClassPack | null {
  const patch: Partial<ClassPack> = {};
  const nextTotal = Math.round(Number(input.total));
  if (Number.isFinite(nextTotal) && nextTotal > 0 && nextTotal !== existing.total) {
    patch.total = nextTotal;
  }
  if (input.assignedTo && !existing.assignedTo) patch.assignedTo = input.assignedTo;
  if (input.personId && !existing.personId) patch.personId = input.personId;
  if (input.endsOn && input.endsOn !== existing.endsOn) {
    patch.endsOn = input.endsOn.slice(0, 10);
  } else if (input.months && input.months > 0) {
    patch.endsOn = addCalendarMonths(existing.startsOn, input.months);
  }
  if (!Object.keys(patch).length) return null;
  return { ...existing, ...patch };
}

export function createClassPack(input: NewClassPackInput): ClassPack {
  const title = input.title.trim();
  const startsOn = (input.startsOn || localDayKey()).slice(0, 10);
  const months =
    input.months && Number.isFinite(input.months) && input.months > 0
      ? Math.round(input.months)
      : 3;
  const endsOn = (input.endsOn || addCalendarMonths(startsOn, months)).slice(0, 10);
  const n = Math.round(Number(input.total));
  const total = Number.isFinite(n) && n > 0 ? n : 0;
  return {
    id: input.id ?? `cls-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    personId: input.personId,
    assignedTo: input.assignedTo?.trim() || undefined,
    total,
    startsOn,
    endsOn,
    logs: [],
    notes: input.notes?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
}

export function normalizeClassPack(raw: unknown): ClassPack | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<ClassPack>;
  if (!o.id || !o.title) return null;
  const logs = Array.isArray(o.logs)
    ? o.logs
        .filter((l): l is ClassLog => Boolean(l?.id && l?.doneAt))
        .map((l) => ({
          id: String(l.id),
          doneAt: String(l.doneAt).slice(0, 10),
        }))
    : [];
  const startsOn = String(o.startsOn || localDayKey()).slice(0, 10);
  return {
    id: o.id,
    title: String(o.title).trim() || 'Class',
    personId: typeof o.personId === 'string' ? o.personId : undefined,
    assignedTo: typeof o.assignedTo === 'string' ? o.assignedTo : undefined,
    total: Math.max(0, Math.round(Number(o.total) || 0)),
    startsOn,
    endsOn: String(o.endsOn || addCalendarMonths(startsOn, 3)).slice(0, 10),
    logs,
    notes: typeof o.notes === 'string' ? o.notes : undefined,
    createdAt:
      typeof o.createdAt === 'string' && o.createdAt
        ? o.createdAt
        : new Date().toISOString(),
  };
}

export function usedCount(pack: ClassPack): number {
  const days = new Set(pack.logs.map((l) => l.doneAt));
  return days.size;
}

export function remainingCount(pack: ClassPack): number | null {
  if (!(pack.total > 0)) return null;
  return Math.max(0, pack.total - usedCount(pack));
}

export function loggedOn(pack: ClassPack, date = localDayKey()): boolean {
  return pack.logs.some((l) => l.doneAt === date);
}

export function daysLeftInWindow(pack: ClassPack, now = new Date()): number {
  return daysUntil(`${pack.endsOn}T12:00:00`, now);
}

export function packStatus(pack: ClassPack, now = new Date()): ClassPackStatus {
  const remaining = remainingCount(pack);
  if (remaining === 0) return 'complete';
  const left = daysLeftInWindow(pack, now);
  if (left < 0) return 'expired';
  if (left <= 14) return 'ending-soon';
  return 'active';
}

export function toggleLogForDay(pack: ClassPack, date = localDayKey()): ClassPack {
  const day = date.slice(0, 10);
  const existing = pack.logs.find((l) => l.doneAt === day);
  if (existing) {
    return { ...pack, logs: pack.logs.filter((l) => l.id !== existing.id) };
  }
  if (remainingCount(pack) === 0) return pack;
  return {
    ...pack,
    logs: [
      ...pack.logs,
      {
        id: `clog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        doneAt: day,
      },
    ],
  };
}

export function findClassPack(
  packs: ClassPack[],
  title: string,
  personId?: string
): ClassPack | undefined {
  const key = normalizeClassKey(title);
  if (!key) return undefined;
  const hits = packs.filter((p) => normalizeClassKey(p.title) === key);
  if (!hits.length) {
    return packs.find((p) => normalizeClassKey(p.title).includes(key) || key.includes(normalizeClassKey(p.title)));
  }
  if (personId) {
    const forPerson = hits.filter((p) => p.personId === personId);
    if (forPerson.length) return forPerson[0];
  }
  return hits[0];
}

export function classPackFromUtterance(text?: string): {
  total?: number;
  months?: number;
} {
  if (!text?.trim()) return {};
  const totalM = text.match(
    /\b(\d{1,3})(?:st|nd|rd|th)?\s+(?:class(?:es)?|lesson(?:s)?|session(?:s)?)\b/i
  );
  const monthsM =
    text.match(/\b(\d{1,2})\s+months?\b/i) ||
    text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+months?\b/i);
  const MONTH_WORDS: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  };
  const total = totalM ? Number(totalM[1]) : undefined;
  let months: number | undefined;
  if (monthsM) {
    months = MONTH_WORDS[monthsM[1].toLowerCase()] ?? Number(monthsM[1]);
  }
  return {
    total: total && total > 0 ? total : undefined,
    months: months && months > 0 ? months : undefined,
  };
}

const CLASS_ACTIVITY =
  'swimming|skating|piano|tennis|football|soccer|dance|yoga|karate|guitar|violin|chess|coding|art|boxing|ballet|cricket|golf';

export function classTitleFromUtterance(text?: string): string | undefined {
  if (!text?.trim()) return undefined;
  const named = text.match(new RegExp(`\\b(${CLASS_ACTIVITY})\\b`, 'i'));
  if (named) {
    const w = named[1].toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  const generic = text.match(
    /\b(?:for|to|my|a|the)\s+(?:a\s+|the\s+)?([a-z]{3,20})\s+class(?:es)?\b/i
  );
  if (generic && !/^(first|next|last|new|the|this|that)$/i.test(generic[1])) {
    const w = generic[1].toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  return undefined;
}

export function looksLikeClassEnrollment(text?: string): boolean {
  if (!text?.trim()) return false;
  return (
    /\b(enrolled|enrol|signed up|sign up|joining|joined)\b/i.test(text) &&
    /\b(class|classes|lesson|lessons|course|pack)\b/i.test(text)
  );
}

export function looksLikeClassAttendance(text?: string): boolean {
  if (!text?.trim()) return false;
  if (/^i attended\b/i.test(text.trim())) return true;
  return /\b(attended|went to|had)\b.{0,48}\b(class|classes|lesson|session)\b/i.test(
    text
  );
}

export function formatPackWindow(pack: ClassPack): string {
  const d = new Date(`${pack.endsOn}T12:00:00`);
  if (Number.isNaN(d.getTime())) return pack.endsOn;
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function paceHint(pack: ClassPack, now = new Date()): string | undefined {
  const remaining = remainingCount(pack);
  if (remaining == null || remaining <= 0) return undefined;
  const days = daysLeftInWindow(pack, now);
  if (days <= 0) return `${remaining} left — pack window has ended`;
  const weeks = days / 7;
  const perWeek = remaining / weeks;
  if (perWeek <= 1.05) return `${remaining} left · about ${Math.ceil(perWeek)} a week`;
  return `${remaining} left · about ${perWeek.toFixed(1)} a week to finish`;
}
