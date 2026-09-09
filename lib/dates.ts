/** Local calendar day YYYY-MM-DD (not UTC — avoids off-by-one near midnight). */
export function localDayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Check if a value is a valid calendar date in YYYY-MM-DD format (prevents rollover like 2026-02-30). */
export function isIsoDate(value: unknown): boolean {
  const s = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return false;
  }
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
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

const MONTHS =
  'january|february|march|april|may|june|july|august|september|october|november|december';

function monthIndex(name: string): number | undefined {
  const i = MONTHS.split('|').indexOf(name.trim().toLowerCase());
  return i >= 0 ? i : undefined;
}

/** Parse "10th November", "November 10", "on the 10th of November" relative to `from`. */
function calendarDayFromUtterance(text: string, from = new Date()): string | undefined {
  const dayMonth = text.match(
    new RegExp(
      `\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS})(?:\\s+(\\d{4}))?\\b`,
      'i'
    )
  );
  if (dayMonth) {
    const day = Number(dayMonth[1]);
    const month = monthIndex(dayMonth[2]);
    if (month == null || day < 1 || day > 31) return undefined;
    let year = dayMonth[3] ? Number(dayMonth[3]) : from.getFullYear();
    const candidate = new Date(year, month, day);
    if (candidate.getMonth() !== month || candidate.getDate() !== day) return undefined;
    if (!dayMonth[3] && candidate < startOfLocalDay(from)) {
      year += 1;
    }
    return localDayKey(new Date(year, month, day));
  }

  const monthDay = text.match(
    new RegExp(`\\b(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\b`, 'i')
  );
  if (monthDay) {
    const month = monthIndex(monthDay[1]);
    const day = Number(monthDay[2]);
    if (month == null || day < 1 || day > 31) return undefined;
    let year = monthDay[3] ? Number(monthDay[3]) : from.getFullYear();
    const candidate = new Date(year, month, day);
    if (candidate.getMonth() !== month || candidate.getDate() !== day) return undefined;
    if (!monthDay[3] && candidate < startOfLocalDay(from)) {
      year += 1;
    }
    return localDayKey(new Date(year, month, day));
  }

  return undefined;
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Absolute YYYY-MM-DD from speech: next Tuesday, tomorrow, in 3 days, ISO. */
export function remindAtFromUtterance(text?: string, from = new Date()): string | undefined {
  if (!text?.trim()) return undefined;
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const cal = calendarDayFromUtterance(text, from);
  if (cal) return cal;
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

function stripReminderDatePhrases(s: string): string {
  return s
    .replace(
      new RegExp(
        `\\b(?:on|by)\\s+(?:the\\s+)?\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS})(?:\\s+\\d{4})?\\b`,
        'gi'
      ),
      ''
    )
    .replace(
      new RegExp(`\\b(?:on|by)\\s+(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:\\s+\\d{4})?\\b`, 'gi'),
      ''
    )
    .replace(
      /\b(next|this|on)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi,
      ''
    )
    .replace(/\b(tomorrow|today)\b/gi, '')
    .replace(/\bin\s+\d+\s+days?\b/gi, '')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/g, '')
    .trim();
}

/** Split a reminder utterance into a short title and optional notes. */
export function parseReminderFromUtterance(
  text?: string
): { label: string; notes?: string } | undefined {
  if (!text?.trim()) return undefined;
  let s = text.trim();
  s = s.replace(
    /^(please\s+)?(log|set|add|create)\s+(a\s+)?reminder\s+(to\s+|for\s+)?/i,
    ''
  );
  s = s.replace(/^remind\s+me\s+(to\s+|about\s+|that\s+)?/i, '');
  s = stripReminderDatePhrases(s);
  if (s.length < 3) return { label: 'Reminder' };

  const splitOn = [
    /\s+(it's|its|it is)\s+/i,
    /\s+for\s+(?:a|an|the|my|our|their)\s+/i,
    /\s+about\s+/i,
    /,\s+/,
  ];
  for (const pat of splitOn) {
    const m = s.match(pat);
    if (m?.index != null && m.index >= 3) {
      const label = s.slice(0, m.index).trim();
      const notes = s.slice(m.index).trim();
      if (label.length >= 3) {
        return {
          label: label.charAt(0).toUpperCase() + label.slice(1),
          notes: notes ? notes.charAt(0).toUpperCase() + notes.slice(1) : undefined,
        };
      }
    }
  }

  const label = s.charAt(0).toUpperCase() + s.slice(1);
  if (label.length > 56) {
    const cut = label.slice(0, 56).replace(/\s+\S*$/, '').trim();
    const rest = label.slice(cut.length).trim();
    if (cut.length >= 3) {
      return { label: cut, notes: rest || undefined };
    }
  }
  return { label };
}

export function reminderLabelFromUtterance(text?: string): string | undefined {
  return parseReminderFromUtterance(text)?.label;
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
