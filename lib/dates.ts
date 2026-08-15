/** Local calendar day YYYY-MM-DD (not UTC — avoids off-by-one near midnight). */
export function localDayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Warranty expiry from model or speech.
 * "2028" / "until 2028" → end of that year; otherwise YYYY-MM-DD.
 */
export function normalizeWarrantyExpiry(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s || s === '—' || s === '-') return undefined;
  const yearOnly =
    s.match(/^(?:until|till|through|to)\s+(\d{4})$/i) || s.match(/^(\d{4})$/);
  if (yearOnly) return `${yearOnly[1]}-12-31`;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return localDayKey(d);
  return undefined;
}

/** Pull "warranty until 2028" from the user's sentence when the model omits the field. */
export function warrantyExpiryFromUtterance(text?: string): string | undefined {
  if (!text?.trim()) return undefined;
  const m =
    text.match(
      /\b(?:warranty|guarantee)\b[\s\S]{0,48}?\b(?:until|till|through|to)\s+(\d{4}(?:-\d{2}-\d{2})?)\b/i
    ) ||
    text.match(/\b(?:until|till|through)\s+(\d{4}(?:-\d{2}-\d{2})?)\b/i);
  if (!m) return undefined;
  return normalizeWarrantyExpiry(m[1]);
}

/** Year-only warranties are stored as YYYY-12-31 — show the year in speech. */
export function displayWarrantyExpiry(iso?: string | null): string | undefined {
  const s = iso?.trim();
  if (!s || s === '—' || s === '-') return undefined;
  if (/^\d{4}-12-31$/.test(s)) return s.slice(0, 4);
  return s;
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

/** Next occurrence of a weekday (never today — "next Tuesday" on Tuesday → +7). */
export function nextWeekdayKey(weekday: string, from = new Date()): string | undefined {
  const want = WEEKDAYS.indexOf(weekday.trim().toLowerCase() as (typeof WEEKDAYS)[number]);
  if (want < 0) return undefined;
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let add = (want - d.getDay() + 7) % 7;
  if (add === 0) add = 7;
  d.setDate(d.getDate() + add);
  return localDayKey(d);
}

/** Absolute YYYY-MM-DD from speech: next Tuesday, tomorrow, in 3 days, ISO. */
export function remindAtFromUtterance(text?: string, from = new Date()): string | undefined {
  if (!text?.trim()) return undefined;
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const nextWd = text.match(
    /\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i
  );
  if (nextWd) return nextWeekdayKey(nextWd[1], from);
  const onWd = text.match(
    /\b(?:on|this)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i
  );
  if (onWd) return nextWeekdayKey(onWd[1], from);
  if (/\btomorrow\b/i.test(text)) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    d.setDate(d.getDate() + 1);
    return localDayKey(d);
  }
  const inDays = text.match(/\bin\s+(\d{1,3})\s+days?\b/i);
  if (inDays) {
    const n = Number(inDays[1]);
    if (n > 0) {
      const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
      d.setDate(d.getDate() + n);
      return localDayKey(d);
    }
  }
  return undefined;
}

export function looksLikeReminder(text?: string): boolean {
  if (!text?.trim()) return false;
  return /\bremind(?:er|ers|ing)?\b|\bremind me\b/i.test(text);
}

export function reminderLabelFromUtterance(text?: string): string | undefined {
  if (!text?.trim()) return undefined;
  let s = text.trim();
  s = s.replace(
    /^(please\s+)?(log|set|add|create)\s+(a\s+)?reminder\s+(to\s+|for\s+)?/i,
    ''
  );
  s = s.replace(/^remind\s+me\s+(to\s+|about\s+)?/i, '');
  s = s.replace(
    /\b(next|this|on)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi,
    ''
  );
  s = s.replace(/\b(tomorrow|today)\b/gi, '');
  s = s.replace(/\bin\s+\d+\s+days?\b/gi, '');
  s = s.replace(/\s+/g, ' ').replace(/[.,;:!?]+$/g, '').trim();
  if (s.length < 3) return 'Reminder';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Add calendar months to a YYYY-MM-DD, clamping to the last valid day. */
export function addCalendarMonths(yyyyMmDd: string, months: number): string {
  const m = yyyyMmDd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return yyyyMmDd;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  const day = Number(m[3]);
  const dt = new Date(year, monthIndex, day);
  dt.setMonth(dt.getMonth() + months);
  if (dt.getDate() !== day) dt.setDate(0);
  return localDayKey(dt);
}
