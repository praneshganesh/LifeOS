/**
 * Rule-based reminder alert schedule for one-shot activities.
 * Weekday recurring series keep their own OS triggers elsewhere.
 */

import { localDayKey } from '@/lib/dates';
import {
  DEFAULT_NOTIFICATION_PREFS,
  isInQuietHours,
  normalizeQuietHoursTime,
} from '@/lib/notificationPrefs';

export type AlertMode = 'auto' | 'custom';

export type UserAlertKind =
  | 'at_time'
  | 'mins_before'
  | 'hours_before'
  | 'prev_day_1900'
  | 'morning_of_0900'
  | 'all_day_0900'
  | 'all_day_1700';

export type UserAlertSpec = {
  kind: UserAlertKind;
  /** For mins_before / hours_before (hours stored as minutes). */
  minutesBefore?: number;
};

export type AlertKind =
  | 'prev_day'
  | 'morning_of'
  | 'hours_before'
  | 'mins_before'
  | 'all_day'
  | 'all_day_followup'
  | 'at_time'
  | 'custom';

export type TimeBand =
  | 'early_morning'
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'all_day';

export type AlertFire = {
  at: Date;
  kind: AlertKind;
  /** Minutes before due when relevant (for copy). */
  minutesBefore?: number;
  /** Final deadline nudge — may fire inside quiet hours. */
  isFinal?: boolean;
};

export type ComputeAlertInput = {
  dueDate: string; // YYYY-MM-DD
  dueTime?: { hour: number; minute: number } | null;
  createdAt: Date;
  now?: Date;
  completed?: boolean;
  alertMode?: AlertMode;
  userAlerts?: UserAlertSpec[] | null;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  label?: string;
};

const CREATE_GAP_MS = 30 * 60 * 1000;
const CONSOLIDATE_MS = 30 * 60 * 1000;

function parseDueDate(dueDate: string): { y: number; m: number; d: number } | null {
  const m = dueDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

export function dueDateTime(
  dueDate: string,
  dueTime?: { hour: number; minute: number } | null
): Date | null {
  const p = parseDueDate(dueDate);
  if (!p) return null;
  if (!dueTime) {
    return new Date(p.y, p.m, p.d, 23, 59, 59, 0);
  }
  return new Date(p.y, p.m, p.d, dueTime.hour, dueTime.minute, 0, 0);
}

export function timeBandForDue(
  dueTime?: { hour: number; minute: number } | null
): TimeBand {
  if (!dueTime) return 'all_day';
  const mins = dueTime.hour * 60 + dueTime.minute;
  if (mins >= 5 * 60 && mins <= 8 * 60) return 'early_morning';
  if (mins > 8 * 60 && mins < 12 * 60) return 'morning';
  if (mins >= 12 * 60 && mins <= 18 * 60) return 'afternoon';
  if (mins > 18 * 60) return 'evening';
  // Before 5 AM — treat as early morning (prev evening + 15m before)
  return 'early_morning';
}

function atLocal(
  y: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date {
  return new Date(y, month, day, hour, minute, 0, 0);
}

function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60_000);
}

function rawAutoAlerts(
  dueDate: string,
  dueTime: { hour: number; minute: number } | null | undefined
): AlertFire[] {
  const p = parseDueDate(dueDate);
  if (!p) return [];
  const band = timeBandForDue(dueTime);
  const due = dueDateTime(dueDate, dueTime);
  if (!due) return [];

  if (band === 'all_day') {
    return [
      {
        at: atLocal(p.y, p.m, p.d, 9, 0),
        kind: 'all_day',
      },
      {
        at: atLocal(p.y, p.m, p.d, 17, 0),
        kind: 'all_day_followup',
      },
    ];
  }

  const out: AlertFire[] = [];

  if (band === 'early_morning') {
    out.push({
      at: atLocal(p.y, p.m, p.d - 1, 19, 0),
      kind: 'prev_day',
    });
    out.push({
      at: addMinutes(due, -15),
      kind: 'mins_before',
      minutesBefore: 15,
      isFinal: true,
    });
    return out;
  }

  if (band === 'morning') {
    out.push({
      at: atLocal(p.y, p.m, p.d - 1, 19, 0),
      kind: 'prev_day',
    });
    out.push({
      at: addMinutes(due, -120),
      kind: 'hours_before',
      minutesBefore: 120,
    });
    out.push({
      at: addMinutes(due, -15),
      kind: 'mins_before',
      minutesBefore: 15,
      isFinal: true,
    });
    return out;
  }

  if (band === 'afternoon') {
    out.push({
      at: addMinutes(due, -24 * 60),
      kind: 'prev_day',
      minutesBefore: 24 * 60,
    });
    out.push({
      at: atLocal(p.y, p.m, p.d, 9, 0),
      kind: 'morning_of',
    });
    out.push({
      at: addMinutes(due, -30),
      kind: 'mins_before',
      minutesBefore: 30,
      isFinal: true,
    });
    return out;
  }

  // evening
  out.push({
    at: atLocal(p.y, p.m, p.d, 9, 0),
    kind: 'morning_of',
  });
  out.push({
    at: addMinutes(due, -60),
    kind: 'hours_before',
    minutesBefore: 60,
  });
  out.push({
    at: addMinutes(due, -15),
    kind: 'mins_before',
    minutesBefore: 15,
    isFinal: true,
  });
  return out;
}

function resolveUserAlert(
  spec: UserAlertSpec,
  dueDate: string,
  dueTime: { hour: number; minute: number } | null | undefined
): AlertFire | null {
  const p = parseDueDate(dueDate);
  if (!p) return null;
  const due = dueDateTime(dueDate, dueTime);
  if (!due) return null;

  switch (spec.kind) {
    case 'at_time':
      if (!dueTime) return null;
      return { at: due, kind: 'at_time', isFinal: true };
    case 'mins_before': {
      const m = spec.minutesBefore ?? 15;
      return {
        at: addMinutes(due, -m),
        kind: 'mins_before',
        minutesBefore: m,
        isFinal: m <= 30,
      };
    }
    case 'hours_before': {
      const m = spec.minutesBefore ?? 60;
      return {
        at: addMinutes(due, -m),
        kind: 'hours_before',
        minutesBefore: m,
      };
    }
    case 'prev_day_1900':
      return {
        at: atLocal(p.y, p.m, p.d - 1, 19, 0),
        kind: 'prev_day',
      };
    case 'morning_of_0900':
      return {
        at: atLocal(p.y, p.m, p.d, 9, 0),
        kind: 'morning_of',
      };
    case 'all_day_0900':
      return {
        at: atLocal(p.y, p.m, p.d, 9, 0),
        kind: 'all_day',
      };
    case 'all_day_1700':
      return {
        at: atLocal(p.y, p.m, p.d, 17, 0),
        kind: 'all_day_followup',
      };
    default:
      return null;
  }
}

function applyFilters(
  fires: AlertFire[],
  input: ComputeAlertInput,
  due: Date | null
): AlertFire[] {
  const now = input.now ?? new Date();
  const createdAt = input.createdAt;
  const qStart = normalizeQuietHoursTime(
    input.quietHoursStart,
    DEFAULT_NOTIFICATION_PREFS.quietHoursStart
  );
  const qEnd = normalizeQuietHoursTime(
    input.quietHoursEnd,
    DEFAULT_NOTIFICATION_PREFS.quietHoursEnd
  );

  let list = fires
    .filter((f) => !Number.isNaN(f.at.getTime()))
    .filter((f) => f.at.getTime() > now.getTime())
    .filter((f) => f.at.getTime() - createdAt.getTime() >= CREATE_GAP_MS)
    .filter((f) => {
      if (f.isFinal) return true;
      return !isInQuietHours(f.at, qStart, qEnd);
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  // Consolidate within 30 minutes — keep closer to deadline.
  const dueMs = due?.getTime() ?? Number.POSITIVE_INFINITY;
  const consolidated: AlertFire[] = [];
  for (const f of list) {
    const prev = consolidated[consolidated.length - 1];
    if (prev && Math.abs(f.at.getTime() - prev.at.getTime()) < CONSOLIDATE_MS) {
      const prevDist = Math.abs(dueMs - prev.at.getTime());
      const nextDist = Math.abs(dueMs - f.at.getTime());
      if (nextDist < prevDist) {
        consolidated[consolidated.length - 1] = f;
      }
      continue;
    }
    consolidated.push(f);
  }
  return consolidated;
}

/** Seed custom pickers from the current auto schedule. */
export function userAlertsFromAutoFires(
  fires: AlertFire[],
  dueTime?: { hour: number; minute: number } | null
): UserAlertSpec[] {
  return fires.slice(0, 2).map((f) => {
    if (f.kind === 'all_day') return { kind: 'all_day_0900' as const };
    if (f.kind === 'all_day_followup') return { kind: 'all_day_1700' as const };
    if (f.kind === 'prev_day' && (f.minutesBefore == null || f.minutesBefore !== 24 * 60)) {
      return { kind: 'prev_day_1900' as const };
    }
    if (f.kind === 'morning_of') return { kind: 'morning_of_0900' as const };
    if (f.kind === 'at_time') return { kind: 'at_time' as const };
    if (f.minutesBefore != null && f.minutesBefore % 60 === 0 && f.minutesBefore >= 60) {
      return { kind: 'hours_before' as const, minutesBefore: f.minutesBefore };
    }
    if (f.minutesBefore != null) {
      return { kind: 'mins_before' as const, minutesBefore: f.minutesBefore };
    }
    if (!dueTime) return { kind: 'all_day_0900' as const };
    return { kind: 'at_time' as const };
  });
}

export function computeAlertSchedule(input: ComputeAlertInput): AlertFire[] {
  if (input.completed) return [];
  const dueTime = input.dueTime ?? null;
  const due = dueDateTime(input.dueDate, dueTime);
  if (!due && !parseDueDate(input.dueDate)) return [];

  const mode = input.alertMode ?? 'auto';
  let raw: AlertFire[] = [];

  if (mode === 'custom' && input.userAlerts?.length) {
    raw = input.userAlerts
      .map((s) => resolveUserAlert(s, input.dueDate, dueTime))
      .filter((x): x is AlertFire => Boolean(x));
  } else {
    raw = rawAutoAlerts(input.dueDate, dueTime);
  }

  return applyFilters(raw, input, due);
}

export function formatAlertFireCopy(
  fire: AlertFire,
  label: string,
  dueDate: string,
  dueTime?: { hour: number; minute: number } | null
): { title: string; body: string } {
  const title = label.trim() || 'Reminder';
  const timeLabel = dueTime
    ? formatClock(dueTime.hour, dueTime.minute)
    : null;
  const duePart = timeLabel ? `${title} at ${timeLabel}` : title;

  switch (fire.kind) {
    case 'prev_day':
      return {
        title,
        body: timeLabel
          ? `Tomorrow: ${title} at ${timeLabel}`
          : `Tomorrow: ${title}`,
      };
    case 'morning_of':
    case 'all_day':
      return {
        title,
        body: timeLabel
          ? `Due today: ${title} at ${timeLabel}`
          : `Due today: ${title}`,
      };
    case 'all_day_followup':
      return { title, body: `Still due today: ${title}` };
    case 'hours_before': {
      const h = Math.round((fire.minutesBefore ?? 60) / 60);
      return {
        title,
        body: `${duePart} is due in ${h} hour${h === 1 ? '' : 's'}`,
      };
    }
    case 'mins_before': {
      const m = fire.minutesBefore ?? 15;
      return {
        title,
        body: `${duePart} is due in ${m} minute${m === 1 ? '' : 's'}`,
      };
    }
    case 'at_time':
      return {
        title,
        body: timeLabel ? `Due now: ${title} at ${timeLabel}` : `Due now: ${title}`,
      };
    default:
      return { title, body: `Reminder: ${duePart}` };
  }
}

function formatClock(hour: number, minute: number): string {
  const h12 = ((hour + 11) % 12) + 1;
  const ampm = hour < 12 ? 'AM' : 'PM';
  const mm = String(minute).padStart(2, '0');
  return `${h12}:${mm} ${ampm}`;
}

export function formatAlertFireWhen(at: Date): string {
  const today = localDayKey();
  const key = localDayKey(at);
  const clock = formatClock(at.getHours(), at.getMinutes());
  if (key === today) return `Today ${clock}`;
  const tom = new Date();
  tom.setDate(tom.getDate() + 1);
  if (key === localDayKey(tom)) return `Tomorrow ${clock}`;
  return `${at.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })} ${clock}`;
}

export const CUSTOM_ALERT_PRESETS: {
  id: string;
  label: string;
  spec: UserAlertSpec | null;
  timedOnly?: boolean;
  allDayOnly?: boolean;
}[] = [
  { id: 'none', label: 'Off', spec: null },
  { id: 'at_time', label: 'At the time', spec: { kind: 'at_time' }, timedOnly: true },
  {
    id: 'm15',
    label: '15 min before',
    spec: { kind: 'mins_before', minutesBefore: 15 },
    timedOnly: true,
  },
  {
    id: 'm30',
    label: '30 min before',
    spec: { kind: 'mins_before', minutesBefore: 30 },
    timedOnly: true,
  },
  {
    id: 'h1',
    label: '1 hour before',
    spec: { kind: 'hours_before', minutesBefore: 60 },
    timedOnly: true,
  },
  {
    id: 'h2',
    label: '2 hours before',
    spec: { kind: 'hours_before', minutesBefore: 120 },
    timedOnly: true,
  },
  {
    id: 'morning',
    label: 'Morning of · 9:00 AM',
    spec: { kind: 'morning_of_0900' },
  },
  {
    id: 'prev_eve',
    label: 'Night before · 7:00 PM',
    spec: { kind: 'prev_day_1900' },
  },
  {
    id: 'all_am',
    label: 'Morning · 9:00 AM',
    spec: { kind: 'all_day_0900' },
    allDayOnly: true,
  },
  {
    id: 'all_pm',
    label: 'Afternoon · 5:00 PM',
    spec: { kind: 'all_day_1700' },
    allDayOnly: true,
  },
];

/** Defaults when switching to Custom with no auto fires left. */
export function defaultCustomAlertSeed(
  dueTime?: { hour: number; minute: number } | null
): UserAlertSpec[] {
  if (dueTime) {
    return [{ kind: 'morning_of_0900' }, { kind: 'prev_day_1900' }];
  }
  return [{ kind: 'all_day_0900' }, { kind: 'all_day_1700' }];
}
