import { addCalendarMonths, localDayKey } from '@/lib/dates';
import { daysUntil } from '@/lib/lastDone';

export type ScheduleDay =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export const SCHEDULE_DAYS: { id: ScheduleDay; label: string; short: string; dayIndex: number }[] = [
  { id: 'monday', label: 'Monday', short: 'Mon', dayIndex: 1 },
  { id: 'tuesday', label: 'Tuesday', short: 'Tue', dayIndex: 2 },
  { id: 'wednesday', label: 'Wednesday', short: 'Wed', dayIndex: 3 },
  { id: 'thursday', label: 'Thursday', short: 'Thu', dayIndex: 4 },
  { id: 'friday', label: 'Friday', short: 'Fri', dayIndex: 5 },
  { id: 'saturday', label: 'Saturday', short: 'Sat', dayIndex: 6 },
  { id: 'sunday', label: 'Sunday', short: 'Sun', dayIndex: 0 },
];

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
  scheduleDays?: ScheduleDay[];
  scheduleTime?: string;
  /** True when scheduleTime was defaulted to 9:00 AM because user did not specify time */
  scheduleTimeInferred?: boolean;
  notes?: string;
  createdAt: string;
};

export type NewClassPackInput = {
  title: string;
  /** 0 / omit = count not set yet */
  total?: number;
  completed?: number;
  startsOn?: string;
  endsOn?: string;
  /** Used when endsOn is omitted — default 3 */
  months?: number;
  scheduleDays?: (ScheduleDay | string)[];
  scheduleTime?: string;
  scheduleTimeInferred?: boolean;
  personId?: string;
  assignedTo?: string;
  notes?: string;
  id?: string;
};

export type ClassPackStatus = 'active' | 'ending-soon' | 'expired' | 'complete';

const VALID_DAYS = new Set<ScheduleDay>([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

export function normalizeScheduleDays(
  days?: (string | ScheduleDay)[]
): ScheduleDay[] | undefined {
  if (!Array.isArray(days) || !days.length) return undefined;
  const set = new Set<ScheduleDay>();
  for (const d of days) {
    if (typeof d !== 'string') continue;
    const clean = d.trim().toLowerCase() as ScheduleDay;
    if (VALID_DAYS.has(clean)) set.add(clean);
  }
  return set.size ? Array.from(set) : undefined;
}

export function generatePastLogs(count: number, startsOn?: string): ClassLog[] {
  const logs: ClassLog[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - (count - i)
    );
    const dayKey = localDayKey(d);
    logs.push({
      id: `clog-init-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      doneAt: dayKey,
    });
  }
  return logs;
}

export function adjustCompletedCount(pack: ClassPack, targetCompleted: number): ClassPack {
  const target = Math.max(0, Math.min(pack.total > 0 ? pack.total : 999, Math.round(targetCompleted)));
  const currentLogs = [...pack.logs];
  if (currentLogs.length === target) return pack;
  if (currentLogs.length > target) {
    return {
      ...pack,
      logs: currentLogs.slice(0, target),
    };
  }
  const toAdd = target - currentLogs.length;
  const newLogs = [...currentLogs];
  const now = new Date();
  for (let i = 0; i < toAdd; i++) {
    const d = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - (toAdd - i)
    );
    newLogs.push({
      id: `clog-adj-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      doneAt: localDayKey(d),
    });
  }
  return {
    ...pack,
    logs: newLogs,
  };
}

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
  if (input.scheduleDays !== undefined) {
    patch.scheduleDays = normalizeScheduleDays(input.scheduleDays);
  }
  if (input.scheduleTime !== undefined) {
    const trimmed = input.scheduleTime.trim();
    patch.scheduleTime = trimmed || undefined;
    patch.scheduleTimeInferred = input.scheduleTimeInferred ?? false;
  }
  let base: ClassPack = { ...existing, ...patch };
  if (input.completed != null && Number.isFinite(Number(input.completed))) {
    base = adjustCompletedCount(base, Number(input.completed));
  }
  if (!Object.keys(patch).length && input.completed == null) return null;
  return base;
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
  const scheduleDays = normalizeScheduleDays(input.scheduleDays);
  let scheduleTime = input.scheduleTime?.trim() || undefined;
  let scheduleTimeInferred = input.scheduleTimeInferred;

  if (scheduleDays && scheduleDays.length) {
    if (!scheduleTime) {
      scheduleTime = '9:00 AM';
      scheduleTimeInferred = true;
    } else if (scheduleTimeInferred === undefined) {
      scheduleTimeInferred = false;
    }
  }

  const completedN = input.completed != null ? Math.round(Number(input.completed)) : 0;
  const initialLogs = completedN > 0 ? generatePastLogs(completedN, startsOn) : [];

  return {
    id: input.id ?? `cls-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    personId: input.personId,
    assignedTo: input.assignedTo?.trim() || undefined,
    total,
    startsOn,
    endsOn,
    logs: initialLogs,
    scheduleDays,
    scheduleTime,
    scheduleTimeInferred,
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
  const scheduleDays = normalizeScheduleDays(
    Array.isArray(o.scheduleDays) ? (o.scheduleDays as string[]) : undefined
  );
  const scheduleTime =
    typeof o.scheduleTime === 'string' && o.scheduleTime.trim()
      ? o.scheduleTime.trim()
      : undefined;
  const scheduleTimeInferred =
    typeof o.scheduleTimeInferred === 'boolean'
      ? o.scheduleTimeInferred
      : undefined;

  return {
    id: o.id,
    title: String(o.title).trim() || 'Class',
    personId: typeof o.personId === 'string' ? o.personId : undefined,
    assignedTo: typeof o.assignedTo === 'string' ? o.assignedTo : undefined,
    total: Math.max(0, Math.round(Number(o.total) || 0)),
    startsOn,
    endsOn: String(o.endsOn || addCalendarMonths(startsOn, 3)).slice(0, 10),
    logs,
    scheduleDays,
    scheduleTime,
    scheduleTimeInferred,
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

function newestPackOf(packs: ClassPack[]): ClassPack | undefined {
  return [...packs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

function pickPackForPerson(
  hits: ClassPack[],
  personId?: string
): ClassPack | undefined {
  if (!hits.length) return undefined;
  if (personId) {
    const mine = hits.filter((p) => p.personId === personId);
    if (mine.length) return newestPackOf(mine);
    const open = hits.filter((p) => !p.personId);
    if (open.length === 1) return open[0];
    return undefined;
  }
  if (hits.length === 1) return hits[0];
  return undefined;
}

export function findClassPack(
  packs: ClassPack[],
  title: string,
  personId?: string
): ClassPack | undefined {
  const key = normalizeClassKey(title);
  if (!key) return undefined;
  const exact = packs.filter((p) => normalizeClassKey(p.title) === key);
  const hits = exact.length
    ? exact
    : packs.filter((p) => {
        const pk = normalizeClassKey(p.title);
        return pk.includes(key) || key.includes(pk);
      });
  return pickPackForPerson(hits, personId);
}

/** Attendance: never fall back to another adult's pack. */
export function pickAttendancePack(
  packs: ClassPack[],
  opts: { title?: string; personId?: string } = {}
): ClassPack | undefined {
  if (opts.title?.trim()) {
    return findClassPack(packs, opts.title, opts.personId);
  }
  if (opts.personId) {
    const mine = packs.filter((p) => p.personId === opts.personId);
    if (mine.length === 1) return mine[0];
    const open = packs.filter((p) => !p.personId);
    if (open.length === 1) return open[0];
    return undefined;
  }
  if (packs.length === 1) return packs[0];
  return undefined;
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

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/**
 * "before November" / "by end of March" → the next upcoming occurrence of
 * that month as YYYY-MM-DD. Talk deadlines are always in the future — a
 * month that already passed this year means next year.
 */
export function classDeadlineFromUtterance(
  text?: string,
  from = new Date()
): string | undefined {
  if (!text?.trim()) return undefined;
  const m = text.match(
    /\b(?:before|by|until|till|through)\s+(the\s+)?(end\s+of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\b/i
  );
  if (!m) return undefined;
  const endOf = Boolean(m[2]);
  const monthIdx = MONTH_NAMES.indexOf(m[3]!.toLowerCase());
  if (monthIdx < 0) return undefined;
  const year = from.getFullYear() + (monthIdx <= from.getMonth() ? 1 : 0);
  const day = endOf ? new Date(year, monthIdx + 1, 0).getDate() : 1;
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
    (/\b(enrolled|enrol|signed up|sign up|joining|joined|has|takes|started|starting|registered)\b/i.test(
      text
    ) &&
      /\b(class|classes|lesson|lessons|course|pack|skating|swimming|piano|tennis|football|soccer|dance|yoga|karate|guitar|violin|chess|coding|art|boxing|ballet|cricket|golf)\b/i.test(
        text
      )) ||
    /\b(total of\s+\d+|\d+\s+classes|pack of\s+\d+)\b/i.test(text)
  );
}

export function classScheduleDaysFromUtterance(
  text?: string
): ScheduleDay[] | undefined {
  if (!text?.trim()) return undefined;
  const lower = text.toLowerCase();
  const set = new Set<ScheduleDay>();

  if (/\b(every\s+day|daily|all\s+days)\b/.test(lower)) {
    return [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ];
  }
  if (/\b(weekdays)\b/.test(lower)) {
    return ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  }
  if (/\b(weekends)\b/.test(lower)) {
    return ['saturday', 'sunday'];
  }

  const DAY_PATTERNS: { id: ScheduleDay; regex: RegExp }[] = [
    { id: 'monday', regex: /\b(mondays?|mon)\b/ },
    { id: 'tuesday', regex: /\b(tuesdays?|tue|tues)\b/ },
    { id: 'wednesday', regex: /\b(wednesdays?|wed)\b/ },
    { id: 'thursday', regex: /\b(thursdays?|thu|thur|thurs)\b/ },
    { id: 'friday', regex: /\b(fridays?|fri)\b/ },
    { id: 'saturday', regex: /\b(saturdays?|sat)\b/ },
    { id: 'sunday', regex: /\b(sundays?|sun)\b/ },
  ];

  for (const { id, regex } of DAY_PATTERNS) {
    if (regex.test(lower)) {
      set.add(id);
    }
  }

  return set.size ? Array.from(set) : undefined;
}

export function classScheduleTimeFromUtterance(text?: string): string | undefined {
  if (!text?.trim()) return undefined;
  const m =
    text.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ||
    text.match(/\bat\s+(\d{1,2})(?::(\d{2}))\b/i);
  if (!m) return undefined;
  const hours = Number(m[1]);
  if (hours < 0 || hours > 24) return undefined;
  const mins = m[2] ? m[2] : '00';
  const ampm = m[3]
    ? m[3].toUpperCase()
    : hours >= 12
      ? 'PM'
      : 'AM';
  const formattedHours = m[3] ? hours : hours % 12 || 12;
  return `${formattedHours}:${mins} ${ampm}`;
}

export function classCompletedCountFromUtterance(
  text?: string
): number | undefined {
  if (!text?.trim()) return undefined;
  const m =
    text.match(
      /\b(\d{1,3})\s+(?:are\s+)?(?:already\s+)?(?:done|completed|attended|finished)\b/i
    ) ||
    text.match(
      /\b(?:already\s+)?(?:done|completed|attended|finished)\s+(?:with\s+)?(\d{1,3})\b/i
    ) ||
    text.match(
      /\b(?:done|completed|attended)\s+(\d{1,3})\s+of\s+(?:them|the\s+\d+)\b/i
    );
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function nextScheduledClassOccurrence(
  pack: ClassPack,
  now = new Date()
): { date: string; daysAhead: number; dayName: string; dayId: ScheduleDay } | null {
  if (!pack.scheduleDays || !pack.scheduleDays.length) return null;
  const currentDayIndex = now.getDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
  const dayIndexMap: Record<ScheduleDay, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  let best: {
    date: string;
    daysAhead: number;
    dayName: string;
    dayId: ScheduleDay;
  } | null = null;
  let minDaysAhead = 999;

  for (const dayId of pack.scheduleDays) {
    const targetDayIndex = dayIndexMap[dayId];
    if (targetDayIndex == null) continue;
    const daysAhead = (targetDayIndex - currentDayIndex + 7) % 7;
    if (daysAhead < minDaysAhead) {
      minDaysAhead = daysAhead;
      const targetDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + daysAhead
      );
      const dateStr = localDayKey(targetDate);
      const dayItem = SCHEDULE_DAYS.find((d) => d.id === dayId);
      best = {
        date: dateStr,
        daysAhead,
        dayName: dayItem?.label || dayId,
        dayId,
      };
    }
  }
  return best;
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
