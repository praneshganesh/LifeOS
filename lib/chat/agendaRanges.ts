import { localDayKey } from '@/lib/dates';

export type DayRange = { start: string; end: string };

function atLocalDay(now: Date, addDays: number) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + addDays);
}

/** Current Mon–Sun containing `now` (Monday-start). */
export function thisWeekDayRange(now = new Date()): DayRange {
  const dow = now.getDay();
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  const start = atLocalDay(now, -daysFromMon);
  const end = atLocalDay(start, 6);
  return { start: localDayKey(start), end: localDayKey(end) };
}

/** Next Mon–Sun after the current week. */
export function nextWeekDayRange(now = new Date()): DayRange {
  const dow = now.getDay();
  const daysUntilNextMon = dow === 0 ? 1 : 8 - dow;
  const start = atLocalDay(now, daysUntilNextMon);
  const end = atLocalDay(start, 6);
  return { start: localDayKey(start), end: localDayKey(end) };
}

/** Remaining days of this calendar month from today. */
export function thisMonthDayRange(now = new Date()): DayRange {
  const start = localDayKey(now);
  const end = localDayKey(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  return { start, end };
}

/** Next calendar month. */
export function nextMonthDayRange(now = new Date()): DayRange {
  const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  return { start: localDayKey(start), end: localDayKey(end) };
}

/** Upcoming Sat–Sun (this weekend if before/on Sat, else next). */
export function weekendDayRange(now = new Date()): DayRange {
  const dow = now.getDay();
  let toSat: number;
  if (dow === 6) toSat = 0;
  else if (dow === 0) toSat = -1; // Sunday → treat as this weekend (Sat already passed: Sat=-1 relative… use Fri+1)
  else toSat = 6 - dow;
  // If Sunday, weekend is yesterday Sat + today
  if (dow === 0) {
    const sat = atLocalDay(now, -1);
    return { start: localDayKey(sat), end: localDayKey(now) };
  }
  const sat = atLocalDay(now, toSat);
  const sun = atLocalDay(sat, 1);
  return { start: localDayKey(sat), end: localDayKey(sun) };
}

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

/** Inclusive range from today through next occurrence of weekday (or today if matches). */
export function throughWeekdayRange(
  weekday: string,
  now = new Date()
): DayRange | null {
  const want = WEEKDAYS.indexOf(
    weekday.trim().toLowerCase() as (typeof WEEKDAYS)[number]
  );
  if (want < 0) return null;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let add = (want - d.getDay() + 7) % 7;
  const end = atLocalDay(now, add);
  return { start: localDayKey(now), end: localDayKey(end) };
}

/** Inclusive today … today+nDays. */
export function nextNDaysRange(nDays: number, now = new Date()): DayRange {
  const n = Math.max(0, Math.min(90, Math.floor(nDays)));
  return {
    start: localDayKey(now),
    end: localDayKey(atLocalDay(now, n)),
  };
}

export function shortDayLabel(dayKey: string) {
  const m = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dayKey;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
