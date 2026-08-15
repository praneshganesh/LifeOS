import { dayKey, type HabitLog } from '@/lib/habits';

export const CALENDAR_DAYS = 31;
export const CALENDAR_MONTHS = 12;

export type CalendarCellState = 'done' | 'empty' | 'invalid';

export type CalendarCell = {
  /** YYYY-MM-DD when valid; null when invalid */
  key: string | null;
  day: number;
  state: CalendarCellState;
};

export type CalendarMonthRow = {
  monthIndex: number; // 0–11
  label: string;
  cells: CalendarCell[]; // length 31
};

export type HabitYearCalendarModel = {
  year: number;
  months: CalendarMonthRow[];
  dayHeaders: number[]; // 1–31
};

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Days in month for a civil calendar year (handles leap February). */
export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Fixed 12×31 year grid: months as rows, day-of-month as columns.
 * Invalid calendar days (e.g. Feb 30) are placeholders — never done/empty.
 */
export function buildHabitYearCalendar(
  logs: HabitLog[],
  year: number,
  opts?: { monthLabels?: readonly string[] }
): HabitYearCalendarModel {
  const done = new Set(
    logs.filter((l) => l.doneAt.startsWith(`${year}-`)).map((l) => l.doneAt)
  );
  const labels = opts?.monthLabels ?? MONTH_LABELS;
  const dayHeaders = Array.from({ length: CALENDAR_DAYS }, (_, i) => i + 1);

  const months: CalendarMonthRow[] = [];
  for (let m = 0; m < CALENDAR_MONTHS; m++) {
    const dim = daysInMonth(year, m);
    const cells: CalendarCell[] = [];
    for (let day = 1; day <= CALENDAR_DAYS; day++) {
      if (day > dim) {
        cells.push({ key: null, day, state: 'invalid' });
        continue;
      }
      const key = dayKey(new Date(year, m, day));
      cells.push({
        key,
        day,
        state: done.has(key) ? 'done' : 'empty',
      });
    }
    months.push({
      monthIndex: m,
      label: labels[m] ?? String(m + 1),
      cells,
    });
  }

  return { year, months, dayHeaders };
}

/** Cell size that fits 31 columns (+ gaps) into a width. */
export function cellSizeForWidth(
  width: number,
  gap: number,
  opts?: { min?: number; max?: number }
): number {
  const min = opts?.min ?? 6;
  const max = opts?.max ?? 14;
  if (width <= 0) return min;
  const raw = Math.floor((width - (CALENDAR_DAYS - 1) * gap) / CALENDAR_DAYS);
  return Math.max(min, Math.min(max, raw));
}
