/** Local calendar day YYYY-MM-DD (not UTC, avoids off-by-one near midnight). */
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

/**
 * Pull "warranty until 2028" / "until next December" from the user's sentence.
 * Deterministic on-device parse, trusted over the model for relative phrases.
 */
export function warrantyExpiryFromUtterance(
  text?: string,
  from = new Date()
): string | undefined {
  if (!text?.trim()) return undefined;
  const m =
    text.match(
      /\b(?:warranty|guarantee)\b[\s\S]{0,48}?\b(?:until|till|through|to)\s+(\d{4}(?:-\d{2}-\d{2})?)\b/i
    ) ||
    text.match(/\b(?:until|till|through)\s+(\d{4}(?:-\d{2}-\d{2})?)\b/i);
  if (m) return normalizeWarrantyExpiry(m[1]);

  // "until (next) december (2027 | next year)" → end of that month
  const monthPhrase = text.match(
    new RegExp(
      `\\b(?:until|till|through|to)\\s+(?:(next)\\s+)?(${MONTHS})(?:\\s+(\\d{4})|\\s+(next\\s+year))?\\b`,
      'i'
    )
  );
  if (monthPhrase) {
    const month = monthIndex(monthPhrase[2]);
    if (month != null) {
      let year = monthPhrase[3] ? Number(monthPhrase[3]) : from.getFullYear();
      if (!monthPhrase[3]) {
        if (monthPhrase[1] || monthPhrase[4]) {
          // "next december" / "december next year" → next calendar year
          year = from.getFullYear() + 1;
        } else if (new Date(year, month + 1, 0) < startOfLocalDay(from)) {
          year += 1; // bare month already over this year
        }
      }
      return localDayKey(new Date(year, month + 1, 0));
    }
  }
  return undefined;
}

/** Year-only warranties are stored as YYYY-12-31, show the year in speech. */
export function displayWarrantyExpiry(iso?: string | null): string | undefined {
  const s = iso?.trim();
  if (!s || s === '—' || s === '-') return undefined;
  if (/^\d{4}-12-31$/.test(s)) return s.slice(0, 4);
  return s;
}

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * Human display date: "2026-12-31" → "Dec 31, 2026" (timezone-safe, no Date
 * round-trip). Year-end dates (how "until 2027" warranties are stored) can
 * render as "Dec 2027". Empty / "—" → undefined so callers can hide the row.
 * Non-ISO strings pass through untouched.
 */
export function formatDisplayDate(
  iso?: string | null,
  opts: { yearEndAsMonthYear?: boolean } = {}
): string | undefined {
  const s = iso?.trim();
  if (!s || s === '—' || s === '-') return undefined;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return s;
  if (opts.yearEndAsMonthYear && month === 12 && day === 31) {
    return `Dec ${year}`;
  }
  return `${MONTH_SHORT[month - 1]} ${day}, ${year}`;
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

/** Next occurrence of a weekday (never today, "next Tuesday" on Tuesday → +7). */
export function nextWeekdayKey(weekday: string, from = new Date()): string | undefined {
  const want = WEEKDAYS.indexOf(weekday.trim().toLowerCase() as (typeof WEEKDAYS)[number]);
  if (want < 0) return undefined;
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let add = (want - d.getDay() + 7) % 7;
  if (add === 0) add = 7;
  d.setDate(d.getDate() + add);
  return localDayKey(d);
}

/** Full names + common abbreviations; longer aliases first for regex alternation. */
const MONTHS =
  'january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec';

function monthIndex(name: string): number | undefined {
  const key = name.trim().toLowerCase();
  const aliases: Record<string, number> = {
    january: 0,
    jan: 0,
    february: 1,
    feb: 1,
    march: 2,
    mar: 2,
    april: 3,
    apr: 3,
    may: 4,
    june: 5,
    jun: 5,
    july: 6,
    jul: 6,
    august: 7,
    aug: 7,
    september: 8,
    sept: 8,
    sep: 8,
    october: 9,
    oct: 9,
    november: 10,
    nov: 10,
    december: 11,
    dec: 11,
  };
  return aliases[key];
}

/**
 * Local Date for a YYYY-MM-DD key (noon by default). Used so relative reminder
 * math follows the user's calendar day, not the server's UTC clock.
 */
export function dateFromLocalDayKey(
  day: string,
  hour = 12,
  minute = 0
): Date {
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date();
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    hour,
    minute,
    0,
    0
  );
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

  // DD/MM or DD/MM/YYYY (day-first — UAE / Ask locale). "12/11" → 12 Nov.
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    return dmyParts(Number(slash[1]), Number(slash[2]) - 1, slash[3], from);
  }

  // DD-MM-YYYY / DD-MM
  const dashed = text.match(/\b(\d{1,2})-(\d{1,2})(?:-(\d{2,4}))?\b/);
  if (dashed) {
    return dmyParts(Number(dashed[1]), Number(dashed[2]) - 1, dashed[3], from);
  }

  // "on the 12th" / "the twelfth" → next occurrence of that day-of-month
  const dayOnly = text.match(
    /\b(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b(?!\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i
  );
  if (dayOnly) {
    return nextDayOfMonth(Number(dayOnly[1]), from);
  }
  const wordDay = text.match(
    /\b(?:on\s+)?(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty[- ]?first|twenty[- ]?second|twenty[- ]?third|twenty[- ]?fourth|twenty[- ]?fifth|twenty[- ]?sixth|twenty[- ]?seventh|twenty[- ]?eighth|twenty[- ]?ninth|thirtieth|thirty[- ]?first)\b/i
  );
  if (wordDay) {
    const n = ordinalWordToDay(wordDay[1]);
    if (n) return nextDayOfMonth(n, from);
  }

  return undefined;
}

function dmyParts(
  day: number,
  month: number,
  yearRaw: string | undefined,
  from: Date
): string | undefined {
  if (day < 1 || day > 31 || month < 0 || month > 11) return undefined;
  let year = from.getFullYear();
  if (yearRaw) {
    year = Number(yearRaw);
    if (year < 100) year += 2000;
  }
  const candidate = new Date(year, month, day);
  if (candidate.getMonth() !== month || candidate.getDate() !== day) return undefined;
  if (!yearRaw && candidate < startOfLocalDay(from)) year += 1;
  const next = new Date(year, month, day);
  if (next.getMonth() !== month || next.getDate() !== day) return undefined;
  return localDayKey(next);
}

function nextDayOfMonth(day: number, from: Date): string | undefined {
  if (day < 1 || day > 31) return undefined;
  let y = from.getFullYear();
  let m = from.getMonth();
  for (let i = 0; i < 14; i++) {
    const cand = new Date(y, m, day);
    if (cand.getMonth() === m && cand.getDate() === day && cand >= startOfLocalDay(from)) {
      return localDayKey(cand);
    }
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return undefined;
}

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  'twenty-first': 21,
  'twenty first': 21,
  'twenty-second': 22,
  'twenty second': 22,
  'twenty-third': 23,
  'twenty third': 23,
  'twenty-fourth': 24,
  'twenty fourth': 24,
  'twenty-fifth': 25,
  'twenty fifth': 25,
  'twenty-sixth': 26,
  'twenty sixth': 26,
  'twenty-seventh': 27,
  'twenty seventh': 27,
  'twenty-eighth': 28,
  'twenty eighth': 28,
  'twenty-ninth': 29,
  'twenty ninth': 29,
  thirtieth: 30,
  'thirty-first': 31,
  'thirty first': 31,
};

function ordinalWordToDay(raw: string): number | undefined {
  return ORDINAL_WORDS[raw.trim().toLowerCase().replace(/\s+/g, ' ')];
}

/**
 * True when the utterance names an impossible calendar date (31 Nov, 30 Feb)
 * or a clearly misspelled month next to a day number.
 */
export function remindDateIsInvalid(text?: string, from = new Date()): boolean {
  if (!text?.trim()) return false;
  // Known-bad: day+month token that fails Date validation
  const dayMonth = text.match(
    /\b(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]+)\b/i
  );
  if (dayMonth) {
    const day = Number(dayMonth[1]);
    const monRaw = dayMonth[2];
    const month = monthIndex(monRaw);
    if (month == null) {
      // Looks like a month word but unknown → misspelling (Novmber)
      if (/^[A-Za-z]{3,}$/.test(monRaw) && !/^(to|for|the|a|an|my|our|and|or|at|in|on|by)$/i.test(monRaw)) {
        // Only treat as month typo if it resembles a month prefix
        if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(monRaw)) return true;
      }
    } else {
      const y = from.getFullYear();
      const cand = new Date(y, month, day);
      if (cand.getMonth() !== month || cand.getDate() !== day) return true;
    }
  }
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]) - 1;
    let year = from.getFullYear();
    if (slash[3]) {
      year = Number(slash[3]);
      if (year < 100) year += 2000;
    }
    const cand = new Date(year, month, day);
    if (cand.getMonth() !== month || cand.getDate() !== day) return true;
  }
  return false;
}

/** Past absolute date with year, or "yesterday". */
export function remindDateIsPast(text?: string, from = new Date()): boolean {
  if (!text?.trim()) return false;
  if (/\byesterday\b/i.test(text)) return true;
  const withYear = text.match(
    new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS})\\s+(\\d{4})\\b`,
      'i'
    )
  );
  if (withYear) {
    const day = Number(withYear[1]);
    const month = monthIndex(withYear[2]);
    const year = Number(withYear[3]);
    if (month != null) {
      const cand = new Date(year, month, day);
      if (cand < startOfLocalDay(from)) return true;
    }
  }
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso && iso[1]! < localDayKey(from)) return true;
  return false;
}

export function remindDateIsAmbiguous(text?: string): boolean {
  if (!text?.trim()) return false;
  // "12 Nov or 15 Nov"
  return /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b.+\bor\b.+\b\d{1,2}/i.test(
    text
  );
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Monday-start week (same convention as "next week" = next Monday).
 * The end of that week is Sunday. Today being Sunday is the end of this week.
 */
function endOfWeekKey(which: 'this' | 'next', from: Date): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toSunday = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + toSunday + (which === 'next' ? 7 : 0));
  return localDayKey(d);
}

function endOfNamedMonthKey(
  month: number,
  from: Date,
  opts?: { next?: boolean; year?: number }
): string {
  let year = opts?.year ?? from.getFullYear();
  if (opts?.year == null && opts?.next) year += 1;
  let last = new Date(year, month + 1, 0);
  if (opts?.year == null && !opts?.next && last < startOfLocalDay(from)) {
    year += 1;
    last = new Date(year, month + 1, 0);
  }
  return localDayKey(last);
}

/**
 * Last day the speaker named: "end of next week", "end of December",
 * "end of the year". Bare "next week" stays next Monday and is not handled here.
 */
export function spokenEndDateFromUtterance(
  text?: string,
  from = new Date()
): string | undefined {
  if (!text?.trim()) return undefined;
  if (/\bend\s+of\s+(?:the\s+)?next\s+week\b/i.test(text)) {
    return endOfWeekKey('next', from);
  }
  if (/\bend\s+of\s+(?:the\s+)?(?:this\s+)?week\b/i.test(text)) {
    return endOfWeekKey('this', from);
  }
  if (/\bend\s+of\s+(?:the\s+)?next\s+year\b/i.test(text)) {
    return `${from.getFullYear() + 1}-12-31`;
  }
  if (/\bend\s+of\s+(?:the\s+)?(?:this\s+)?year\b/i.test(text)) {
    const year = from.getFullYear();
    const last = new Date(year, 12, 0);
    if (last < startOfLocalDay(from)) return `${year + 1}-12-31`;
    return `${year}-12-31`;
  }
  if (/\bend\s+of\s+(?:the\s+)?month\b/i.test(text)) {
    return localDayKey(new Date(from.getFullYear(), from.getMonth() + 1, 0));
  }
  const named = text.match(
    new RegExp(
      `\\bend\\s+of\\s+(?:the\\s+)?(?:(next)\\s+)?(${MONTHS})(?:\\s+(\\d{4})|\\s+(next\\s+year))?\\b`,
      'i'
    )
  );
  if (!named) return undefined;
  const month = monthIndex(named[2]);
  if (month == null) return undefined;
  return endOfNamedMonthKey(month, from, {
    next: Boolean(named[1] || named[4]),
    year: named[3] ? Number(named[3]) : undefined,
  });
}

/**
 * True when the utterance appears to name a due day (so model remindAt may be
 * consulted). Requires a day with a month — bare "may" (modal verb) does not count.
 */
export function utteranceNamesRemindDate(text?: string): boolean {
  if (!text?.trim()) return false;
  const t = text;
  if (/\b(today|tomorrow|tonight|yesterday)\b/i.test(t)) return true;
  if (/\bday\s+after\s+tomorrow\b/i.test(t)) return true;
  if (/\bthis\s+weekend\b/i.test(t)) return true;
  if (/\bend\s+of\s+(?:the\s+)?month\b/i.test(t)) return true;
  if (/\bend\s+of\s+(?:the\s+)?(?:next\s+|this\s+)?week\b/i.test(t)) return true;
  if (
    new RegExp(
      `\\bend\\s+of\\s+(?:the\\s+)?(?:next\\s+)?(?:${MONTHS}|year)\\b`,
      'i'
    ).test(t)
  ) {
    return true;
  }
  if (
    /\bnext\s+(week|month|year|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /\b(?:on|this|by)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.test(
      t
    )
  ) {
    return true;
  }
  if (/\bin\s+(?:a|\d{1,3})\s+(?:days?|weeks?|months?|hours?|minutes?)\b/i.test(t)) {
    return true;
  }
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(t)) return true;
  if (/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(t)) return true;
  if (/\b\d{1,2}-\d{1,2}(?:-\d{2,4})?\b/.test(t)) return true;
  if (/\b(?:on\s+)?(?:the\s+)?\d{1,2}(?:st|nd|rd|th)\b/i.test(t)) return true;
  // Day + month (abbrev or full). Avoid matching modal "may" alone.
  if (
    new RegExp(
      `\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS})\\b`,
      'i'
    ).test(t)
  ) {
    return true;
  }
  if (
    new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, 'i').test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * Absolute YYYY-MM-DD from speech.
 * Relative: tomorrow, day after tomorrow, today, in N days/weeks/months,
 * in a week/month, next week (= next Monday), next month (same day next month),
 * this weekend (Saturday), end of the month, by/on <weekday>.
 * Does not invent today for invalid/past/ambiguous — callers should check
 * remindDateIsInvalid / remindDateIsPast / remindDateIsAmbiguous first.
 */
export function remindAtFromUtterance(
  text?: string,
  from = new Date(),
  now?: Date
): string | undefined {
  if (!text?.trim()) return undefined;
  if (remindDateIsInvalid(text, from) || remindDateIsPast(text, from) || remindDateIsAmbiguous(text)) {
    return undefined;
  }

  const relativeDt = parseRelativeDateTimeFromUtterance(text, from, now);
  if (relativeDt?.day) return relativeDt.day;

  const recurring =
    parseDailyReminder(text, from) ||
    parseIntervalReminder(text, from) ||
    parseRecurringWeekdayReminder(text, from);
  if (recurring?.remindAt) return recurring.remindAt;

  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const cal = calendarDayFromUtterance(text, from);
  if (cal) return cal;

  const nextWd = text.match(
    /\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i
  );
  if (nextWd) return nextWeekdayKey(nextWd[1], from);
  // "by Friday" / "on Thursday" / "this Friday" — one-off next that weekday
  const onWd = text.match(
    /\b(?:on|this|by)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i
  );
  if (onWd) return nextWeekdayKey(onWd[1], from);

  if (/\bday\s+after\s+tomorrow\b/i.test(text)) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    d.setDate(d.getDate() + 2);
    return localDayKey(d);
  }
  if (/\btomorrow\b/i.test(text)) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    d.setDate(d.getDate() + 1);
    return localDayKey(d);
  }
  if (/\btoday\b/i.test(text) || /\btonight\b/i.test(text)) {
    return localDayKey(from);
  }

  if (/\bthis\s+weekend\b/i.test(text)) {
    return nextWeekdayKey('saturday', from);
  }
  // "end of next week" / "end of December" before bare "next week" (Monday).
  const endBound = spokenEndDateFromUtterance(text, from);
  if (endBound) return endBound;
  // next week → next Monday (documented). Not "end of next week".
  if (/\bnext\s+week\b/i.test(text)) {
    return nextWeekdayKey('monday', from);
  }
  if (/\bnext\s+month\b/i.test(text)) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    d.setMonth(d.getMonth() + 1);
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
  const inWeeks = text.match(/\bin\s+(\d{1,3})\s+weeks?\b/i);
  if (inWeeks) {
    const n = Number(inWeeks[1]);
    if (n > 0) {
      const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
      d.setDate(d.getDate() + n * 7);
      return localDayKey(d);
    }
  }
  if (/\bin\s+a\s+week\b/i.test(text)) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    d.setDate(d.getDate() + 7);
    return localDayKey(d);
  }
  const inMonths = text.match(/\bin\s+(\d{1,3})\s+months?\b/i);
  if (inMonths) {
    const n = Number(inMonths[1]);
    if (n > 0) {
      const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
      d.setMonth(d.getMonth() + n);
      return localDayKey(d);
    }
  }
  if (/\bin\s+a\s+month\b/i.test(text)) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    d.setMonth(d.getMonth() + 1);
    return localDayKey(d);
  }

  return undefined;
}

/** True for `dateFromLocalDayKey`, which anchors a calendar day at noon. */
export function isLocalNoonAnchor(d: Date): boolean {
  return (
    d.getHours() === 12 &&
    d.getMinutes() === 0 &&
    d.getSeconds() === 0 &&
    d.getMilliseconds() === 0
  );
}

/**
 * Relative "in 2 hours" must use a wall clock. A noon day-anchor would make
 * 7:52 AM + 2 hours land at 2:00 PM.
 */
export function instantOnAnchor(from: Date, now = new Date()): Date {
  if (!isLocalNoonAnchor(from)) return from;
  return new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds()
  );
}

/** "in 30 minutes" / "in 2 hours" / "in half an hour" → day + clock. */
export function parseRelativeDateTimeFromUtterance(
  text?: string,
  from = new Date(),
  now?: Date
): { day: string; hour: number; minute: number } | undefined {
  if (!text?.trim()) return undefined;
  const base = instantOnAnchor(from, now ?? new Date());
  let addMs: number | undefined;
  const mins = text.match(/\bin\s+(\d{1,4})\s+(?:minutes?|mins?)\b/i);
  if (mins) addMs = Number(mins[1]) * 60_000;
  else if (/\bin\s+(?:a\s+)?half(?:\s+an)?\s+hour\b/i.test(text)) addMs = 30 * 60_000;
  else if (/\bin\s+(?:an|a|one)\s+hour\b/i.test(text)) addMs = 3_600_000;
  else {
    const hours = text.match(/\bin\s+(\d{1,3})\s+hours?\b/i);
    if (hours) addMs = Number(hours[1]) * 3_600_000;
    else {
      const fromNowMin = text.match(/\b(\d{1,4})\s+(?:minutes?|mins?)\s+from\s+now\b/i);
      if (fromNowMin) addMs = Number(fromNowMin[1]) * 60_000;
      else {
        const fromNowHr = text.match(/\b(\d{1,3})\s+hours?\s+from\s+now\b/i);
        if (fromNowHr) addMs = Number(fromNowHr[1]) * 3_600_000;
      }
    }
  }
  if (addMs == null || addMs <= 0) return undefined;
  const d = new Date(base.getTime() + addMs);
  return { day: localDayKey(d), hour: d.getHours(), minute: d.getMinutes() };
}

const WEEKDAY_PATTERNS: { day: number; re: RegExp }[] = [
  { day: 0, re: /\bsun(?:day)?s?\b/i },
  { day: 1, re: /\bmon(?:day)?s?\b/i },
  { day: 2, re: /\btue(?:s(?:day)?)?s?\b/i },
  { day: 3, re: /\bwed(?:nesday)?s?\b/i },
  { day: 4, re: /\bthu(?:rs(?:day)?)?s?\b/i },
  { day: 5, re: /\bfri(?:day)?s?\b/i },
  { day: 6, re: /\bsat(?:urday)?s?\b/i },
];

/**
 * Clock from speech → local hour/minute.
 * Supports: "3pm", "3 pm", "2.30pm", "2:45pm", "21:00", "at 9",
 * "noon", "midnight", "tonight" (~20:00), "this evening" (~18:00), "morning" (09:00).
 * Does not parse relative "in N minutes" (see parseRelativeDateTimeFromUtterance).
 */
export function parseTimeOfDayFromUtterance(
  text?: string
): { hour: number; minute: number } | undefined {
  if (!text?.trim()) return undefined;
  const t = text;

  if (/\bmidnight\b/i.test(t)) return { hour: 0, minute: 0 };
  if (/\bnoon\b|\bmidday\b/i.test(t)) return { hour: 12, minute: 0 };
  if (/\btonight\b/i.test(t)) return { hour: 20, minute: 0 };
  if (/\b(?:this\s+)?evening\b/i.test(t)) return { hour: 18, minute: 0 };
  if (/\b(?:this\s+)?morning\b/i.test(t) && !/\btomorrow\s+morning\b/i.test(t)) {
    // "tomorrow morning" handled with date+default; bare morning → 9 AM
  }
  if (/\b(?:in\s+the\s+)?morning\b/i.test(t) || /\btomorrow\s+morning\b/i.test(t)) {
    return { hour: 9, minute: 0 };
  }

  // 2.30pm / 2:45 pm / 3pm
  const dotted = t.match(
    /\b(?:at\s+)?(\d{1,2})[.:](\d{2})\s*(a\.?m\.?|p\.?m\.?)\b/i
  );
  if (dotted) {
    let hour = Number(dotted[1]);
    const minute = Number(dotted[2]);
    if (!Number.isFinite(hour) || hour < 1 || hour > 12 || minute > 59) return undefined;
    const pm = /^p/i.test(dotted[3]);
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
    return { hour, minute };
  }

  const withMeridiem = t.match(
    /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i
  );
  if (withMeridiem) {
    let hour = Number(withMeridiem[1]);
    const minute = withMeridiem[2] ? Number(withMeridiem[2]) : 0;
    if (!Number.isFinite(hour) || hour < 1 || hour > 12 || minute > 59) return undefined;
    const pm = /^p/i.test(withMeridiem[3]);
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
    return { hour, minute };
  }

  // 21:00 / at 21:00 (24h)
  const twentyFour = t.match(/\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFour) {
    return { hour: Number(twentyFour[1]), minute: Number(twentyFour[2]) };
  }

  // "at 9" / "at 14" — assume next sensible: 1–7 → PM if no am/pm, 8–11 → AM, 12 → noon, 13–23 as 24h
  const bareAt = t.match(/\bat\s+(\d{1,2})\b(?!\s*(?:a\.?m\.?|p\.?m\.?|:|\d))/i);
  if (bareAt) {
    const n = Number(bareAt[1]);
    if (n >= 0 && n <= 23) {
      if (n >= 1 && n <= 7) return { hour: n + 12, minute: 0 }; // 3 → 15:00
      if (n >= 8 && n <= 11) return { hour: n, minute: 0 };
      return { hour: n === 12 ? 12 : n, minute: 0 };
    }
  }

  return undefined;
}

/** HH:mm for one-shot remindTime storage. */
export function remindTimeFromUtterance(text?: string): string | undefined {
  const clock = parseTimeOfDayFromUtterance(text);
  if (!clock) return undefined;
  return `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`;
}

/**
 * "every Tuesday and Friday at 6:30 AM for 8 weeks"
 * "until December" / "until 15 December" / "through March"
 * → weekday schedule + optional endsAt + next fire date.
 */
export function parseRecurringWeekdayReminder(
  text?: string,
  from = new Date()
):
  | {
      remindAt: string;
      remindInterval: {
        value: number;
        unit: 'weekdays';
        weekdays: number[];
        hour: number;
        minute: number;
        endsAt?: string;
      };
    }
  | undefined {
  if (!text?.trim()) return undefined;

  // "on weekdays" / "on weekends" are recurring even without "every".
  // "on Sunday" alone is a one-off (handled by remindAtFromUtterance).
  const onWeekdays = /\bon\s+weekdays?\b/i.test(text);
  const onWeekends = /\bon\s+weekends?\b/i.test(text);
  const everyCue = /\b(?:every|each)\b/i.test(text);
  if (!onWeekdays && !onWeekends && !everyCue) return undefined;

  let weekdays: number[] = [];
  if (onWeekdays || /\bweekdays?\b/i.test(text)) {
    weekdays = [1, 2, 3, 4, 5];
  } else if (onWeekends || /\bweekends?\b/i.test(text)) {
    weekdays = [0, 6];
  } else if (everyCue) {
    for (const { day, re } of WEEKDAY_PATTERNS) {
      if (re.test(text)) weekdays.push(day);
    }
  }
  weekdays = [...new Set(weekdays)].sort((a, b) => a - b);
  if (!weekdays.length) return undefined;

  const clock = parseTimeOfDayFromUtterance(text);
  // Never store hour 0 unless the user said midnight.
  const hour =
    clock?.hour != null
      ? clock.hour
      : 9;
  const minute = clock?.minute ?? 0;
  const endsAt = parseReminderEndsAtFromUtterance(text, from);

  const set = new Set(weekdays);
  let remindAt: string | undefined;
  const endBound = endsAt
    ? new Date(
        Number(endsAt.slice(0, 4)),
        Number(endsAt.slice(5, 7)) - 1,
        Number(endsAt.slice(8, 10)),
        23,
        59,
        59
      ).getTime()
    : null;
  for (let add = 0; add < 400; add++) {
    const d = new Date(
      from.getFullYear(),
      from.getMonth(),
      from.getDate() + add,
      hour,
      minute,
      0,
      0
    );
    if (endBound != null && d.getTime() > endBound) break;
    if (!set.has(d.getDay())) continue;
    if (d.getTime() <= from.getTime()) continue;
    remindAt = localDayKey(d);
    break;
  }
  if (!remindAt) return undefined;

  return {
    remindAt,
    remindInterval: {
      value: 1,
      unit: 'weekdays',
      weekdays,
      hour,
      minute,
      ...(endsAt ? { endsAt } : {}),
    },
  };
}

/**
 * Optional series end from speech:
 * - "for 8 weeks" / "for 3 months"
 * - "until December" / "through March 2027" (end of that month)
 * - "until 15 December" / "until December 15"
 * - "until 2026-12-31"
 */
export function parseReminderEndsAtFromUtterance(
  text?: string,
  from = new Date()
): string | undefined {
  if (!text?.trim()) return undefined;

  const forWeeks = text.match(/\bfor\s+(\d{1,3})\s+weeks?\b/i);
  if (forWeeks) {
    const n = Number(forWeeks[1]);
    if (n > 0) {
      const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
      d.setDate(d.getDate() + n * 7);
      return localDayKey(d);
    }
  }

  const forMonths = text.match(/\bfor\s+(\d{1,3})\s+months?\b/i);
  if (forMonths) {
    const n = Number(forMonths[1]);
    if (n > 0) {
      const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
      d.setMonth(d.getMonth() + n);
      return localDayKey(d);
    }
  }

  const untilIso = text.match(/\b(?:until|till|through|to)\s+(\d{4}-\d{2}-\d{2})\b/i);
  if (untilIso) return untilIso[1];

  const untilDayMonth = text.match(
    new RegExp(
      `\\b(?:until|till|through)\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS})(?:\\s+(\\d{4}))?\\b`,
      'i'
    )
  );
  if (untilDayMonth) {
    const day = Number(untilDayMonth[1]);
    const month = monthIndex(untilDayMonth[2]);
    if (month != null && day >= 1 && day <= 31) {
      let year = untilDayMonth[3] ? Number(untilDayMonth[3]) : from.getFullYear();
      let candidate = new Date(year, month, day);
      if (!untilDayMonth[3] && candidate < startOfLocalDay(from)) year += 1;
      candidate = new Date(year, month, day);
      if (candidate.getMonth() === month && candidate.getDate() === day) {
        return localDayKey(candidate);
      }
    }
  }

  const untilMonthDay = text.match(
    new RegExp(
      `\\b(?:until|till|through)\\s+(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\b`,
      'i'
    )
  );
  if (untilMonthDay) {
    const month = monthIndex(untilMonthDay[1]);
    const day = Number(untilMonthDay[2]);
    if (month != null && day >= 1 && day <= 31) {
      let year = untilMonthDay[3] ? Number(untilMonthDay[3]) : from.getFullYear();
      let candidate = new Date(year, month, day);
      if (!untilMonthDay[3] && candidate < startOfLocalDay(from)) year += 1;
      candidate = new Date(year, month, day);
      if (candidate.getMonth() === month && candidate.getDate() === day) {
        return localDayKey(candidate);
      }
    }
  }

  // "until end of December" / "through the end of March 2027"
  const untilEndMonth = text.match(
    new RegExp(
      `\\b(?:until|till|through)\\s+(?:the\\s+)?end\\s+of\\s+(?:(next)\\s+)?(${MONTHS})(?:\\s+(\\d{4})|\\s+(next\\s+year))?\\b`,
      'i'
    )
  );
  if (untilEndMonth) {
    const month = monthIndex(untilEndMonth[2]);
    if (month != null) {
      return endOfNamedMonthKey(month, from, {
        next: Boolean(untilEndMonth[1] || untilEndMonth[4]),
        year: untilEndMonth[3] ? Number(untilEndMonth[3]) : undefined,
      });
    }
  }

  // "until December" / "until next December" / "through March 2027" /
  // "until December next year" → last day of that month
  const untilMonth = text.match(
    new RegExp(
      `\\b(?:until|till|through)\\s+(?:(next)\\s+)?(${MONTHS})(?:\\s+(\\d{4})|\\s+(next\\s+year))?\\b`,
      'i'
    )
  );
  if (untilMonth) {
    const month = monthIndex(untilMonth[2]);
    if (month != null) {
      let year = untilMonth[3] ? Number(untilMonth[3]) : from.getFullYear();
      if (!untilMonth[3]) {
        if (untilMonth[1] || untilMonth[4]) {
          // "next december" / "december next year" → next calendar year
          year = from.getFullYear() + 1;
        } else if (new Date(year, month + 1, 0) < startOfLocalDay(from)) {
          // Bare month already over this year → the coming one
          year += 1;
        }
      }
      return localDayKey(new Date(year, month + 1, 0));
    }
  }

  return undefined;
}

/** Asking about existing reminders, never create. */
export function looksLikeReminderQuery(text?: string): boolean {
  if (!text?.trim()) return false;
  const t = text.trim();
  if (!/\breminders?\b/i.test(t)) return false;
  return (
    /\b(what|which|any|how many|upcoming|next)\b.{0,48}\breminders?\b/i.test(t) ||
    /\b(my|our)\s+reminders?\b/i.test(t) ||
    /\breminders?\b.{0,48}\b(do i have|have i|are there|do we have|have we)\b/i.test(t) ||
    /\b(do i|did i|do we)\s+have\b.{0,48}\breminders?\b/i.test(t) ||
    /\b(show|list|see|open|view|check)\b.{0,40}\b(my\s+|our\s+)?reminders?\b/i.test(t) ||
    /\bwhat\s+reminders?\b/i.test(t)
  );
}

/** True when the utterance edits/moves/deletes an existing reminder (not create). */
export function looksLikeReminderEditCommand(text?: string): boolean {
  if (!text?.trim()) return false;
  const t = text.trim();
  return (
    /\b(move|change|reschedule|update|edit|push|snooze)\b.{0,80}\bremind(?:er)?s?\b/i.test(
      t
    ) ||
    /\b(delete|remove|cancel|clear)\b.{0,80}\bremind(?:er)?s?\b/i.test(t) ||
    /\bremind(?:er)?s?\b.{0,40}\b(to|for|on|at)\b.{0,40}\b(move|change|reschedule|update)\b/i.test(
      t
    )
  );
}

/**
 * "In 30 minutes" / "in an hour" with no other subject.
 * A longer sentence that merely mentions an offset is not a reminder.
 */
export function isRelativeReminderPing(text?: string): boolean {
  if (!parseRelativeDateTimeFromUtterance(text)) return false;
  const rest = String(text || '')
    .replace(/\bin\s+(?:a|\d+|an|one|half(?:\s+an)?)\s+(?:hours?|minutes?|mins?)\b/gi, ' ')
    .replace(/\b\d+\s+(?:minutes?|mins?|hours?)\s+from\s+now\b/gi, ' ')
    .replace(/\b(please|a|an|the|me|now|in)\b/gi, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return rest.length < 3;
}

/** Create / schedule a reminder, not a list/query/edit question. */
export function looksLikeReminder(text?: string): boolean {
  if (!text?.trim()) return false;
  if (looksLikeReminderQuery(text)) return false;
  if (looksLikeReminderEditCommand(text)) return false;
  // Bare "Remind me" / "Remind me please" with no subject → clarify, not create.
  if (isBareRemindMe(text)) return false;
  return (
    /\bremind\s+me\b/i.test(text) ||
    /\b(?:please\s+)?(?:log|set|add|create)\s+(?:a\s+)?reminder\b/i.test(text) ||
    /\breminder\s+to\b/i.test(text) ||
    /\b(?:a\s+)?reminder\s+(?:for|about)\b/i.test(text)
  );
}

/** "Remind me" / "Remind me please" with nothing to remind about. */
export function isBareRemindMe(text?: string): boolean {
  if (!text?.trim()) return false;
  const t = text
    .trim()
    .replace(/[.,!?]+$/g, '')
    .replace(/\b(please|thanks|thank you|um+|uh+)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /^(?:hey\s+|hi\s+|ok\s+|okay\s+)?remind\s+me$/i.test(t);
}

/**
 * Clarifying question when we should not create/update silently.
 * Returns undefined when the utterance is fine to proceed.
 */
export function reminderClarifyFromUtterance(
  text?: string,
  from = new Date()
): string | undefined {
  if (!text?.trim()) return undefined;
  if (isBareRemindMe(text)) {
    return 'What should I remind you about?';
  }
  if (remindDateIsAmbiguous(text)) {
    return 'Which date did you mean?';
  }
  if (remindDateIsInvalid(text, from)) {
    return "That date doesn't look valid — which day should I use?";
  }
  if (remindDateIsPast(text, from)) {
    return 'That date is in the past — which day should I remind you?';
  }
  return undefined;
}

/**
 * "Pay DEWA on 10 Nov and Salik on 15 Nov" → two one-off reminders.
 * Returns undefined when not a clear dual-date split.
 */
export function splitDualRemindersFromUtterance(
  text?: string,
  from = new Date()
): { label: string; remindAt: string; remindTime?: string }[] | undefined {
  if (!text?.trim()) return undefined;
  const cleaned = text
    .replace(/^[\s\S]*?\bremind\s+me\s+(?:to\s+)?/i, '')
    .trim();
  const parts = cleaned.split(/\s+\band\s+/i);
  if (parts.length !== 2) return undefined;
  const out: { label: string; remindAt: string; remindTime?: string }[] = [];
  for (const part of parts) {
    const remindAt = remindAtFromUtterance(part, from);
    if (!remindAt) return undefined;
    const parsed = parseReminderFromUtterance(`Remind me to ${part}`);
    const label = parsed?.label;
    if (!label || /^reminder$/i.test(label)) return undefined;
    const remindTime = remindTimeFromUtterance(part);
    out.push({ label, remindAt, ...(remindTime ? { remindTime } : {}) });
  }
  // Need two distinct due dates to treat as dual create
  if (out[0]!.remindAt === out[1]!.remindAt) return undefined;
  return out;
}

function stripReminderDatePhrases(s: string): string {
  return s
    // "on/by/for 12th Nov", bare "12th November", "the 12th of Nov"
    .replace(
      new RegExp(
        `\\b(?:(?:on|by|for)\\s+)?(?:the\\s+)?\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS})(?:\\s+\\d{4})?\\b`,
        'gi'
      ),
      ''
    )
    // "on/by/for Nov 12", bare "November 12th"
    .replace(
      new RegExp(
        `\\b(?:(?:on|by|for)\\s+)?(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:\\s+\\d{4})?\\b`,
        'gi'
      ),
      ''
    )
    // "by Friday" / "on Sunday" / "next Monday" / "this Thursday"
    .replace(
      /\b(next|this|on|by)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi,
      ''
    )
    .replace(
      /\b(?:every|each)\s+(?:other\s+)?(?:weekdays?|weekends?|(?:sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?)s?(?:\s*(?:,|and|&|\/)\s*(?:sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?)s?)*)\b/gi,
      ''
    )
    .replace(/\bon\s+weekdays?\b/gi, '')
    .replace(/\bon\s+weekends?\b/gi, '')
    .replace(/\b(?:every|each)\s+day\b/gi, '')
    .replace(/\bevery\s+other\s+day\b/gi, '')
    .replace(/\bdaily\b/gi, '')
    .replace(/\b(?:every|each)\s+month\b|\bmonthly\b/gi, '')
    .replace(/\b(?:every|each)\s+year\b|\byearly\b|\bannually\b/gi, '')
    .replace(/\bstarting\s+(?:today|tomorrow)\b/gi, '')
    .replace(/\bevery\s+\d+\s+(?:days?|weeks?|months?|years?)\b/gi, '')
    .replace(/\b(?:at\s+)?\d{1,2}[.:]\d{2}\s*(?:a\.?m\.?|p\.?m\.?)\b/gi, '')
    .replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/gi, '')
    .replace(/\bat\s+\d{1,2}:\d{2}\b/gi, '')
    .replace(/\bat\s+\d{1,2}\s*:\s*(?!\d)/gi, '')
    .replace(/\bat\s+\d{1,2}\b(?!\s*(?:a\.?m\.?|p\.?m\.?|:|\d))/gi, '')
    .replace(
      /\b(?:at\s+)?(?:noon|midnight|midday|(?:this\s+)?evening|tonight|(?:in\s+the\s+)?(?:this\s+)?morning)\b/gi,
      ''
    )
    .replace(/\bfor\s+\d{1,3}\s+(?:weeks?|months?)\b/gi, '')
    .replace(
      new RegExp(
        `\\b(?:until|till|through)\\s+(?:the\\s+)?(?:\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?)?(?:${MONTHS})(?:\\s+\\d{1,2}(?:st|nd|rd|th)?)?(?:\\s+\\d{4})?\\b`,
        'gi'
      ),
      ''
    )
    .replace(/\b(?:until|till|through|to)\s+\d{4}-\d{2}-\d{2}\b/gi, '')
    .replace(
      /\b(?:the\s+)?(?:day\s+after\s+tomorrow|tomorrow|today|yesterday|tonight)\b/gi,
      ''
    )
    .replace(/\bthis\s+weekend\b/gi, '')
    .replace(/\bend\s+of\s+(?:the\s+)?month\b/gi, '')
    .replace(/\bnext\s+(?:week|month|year)\b/gi, '')
    .replace(/\bin\s+(?:a|\d+|an|one|half(?:\s+an)?)\s+(?:days?|weeks?|months?|hours?|minutes?|mins?)\b/gi, '')
    .replace(/\b\d+\s+(?:minutes?|mins?|hours?)\s+from\s+now\b/gi, '')
    .replace(new RegExp(`(?<!\\bend\\s)(?<!\\bstart\\s)\\bof\\s+(?:${MONTHS})\\b`, 'gi'), '')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
    .replace(/\b(?:on|by|for)\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi, '')
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, '')
    .replace(/\b(?:on|by|for)\s+\d{1,2}-\d{1,2}(?:-\d{2,4})?\b/gi, '')
    .replace(/\b\d{1,2}-\d{1,2}(?:-\d{2,4})?\b/g, '')
    // "on the 12th" / "the twelfth"
    .replace(/\b(?:on\s+)?(?:the\s+)?\d{1,2}(?:st|nd|rd|th)\b/gi, '')
    .replace(
      /\b(?:on\s+)?(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty[- ]?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)|thirtieth|thirty[- ]?first)\b/gi,
      ''
    )
    // Drop orphaned prepositions left after a date was stripped ("pay rent at the").
    .replace(/\s+(?:on|by|for|at)\s+the\s*$/gi, '')
    .replace(/\s+(?:on|by|for|at)\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/g, '')
    .trim();
}

type IntervalParse = {
  remindAt: string;
  remindInterval: {
    value: number;
    unit: 'days' | 'months' | 'weekdays';
    weekdays?: number[];
    hour?: number;
    minute?: number;
    startsAt?: string;
    endsAt?: string;
  };
};

function defaultRecurringClock(text: string): { hour: number; minute: number } {
  const clock = parseTimeOfDayFromUtterance(text);
  if (clock) return clock;
  // Never store hour 0 unless the user said midnight.
  return { hour: 9, minute: 0 };
}

/**
 * "every day at 6pm" / "daily starting today" → daily days interval.
 * Prefer this over model "weekdays Mon–Fri" for every-day speech.
 */
export function parseDailyReminder(
  text?: string,
  from = new Date()
): IntervalParse | undefined {
  if (!text?.trim()) return undefined;
  if (!/\b(?:every|each)\s+day\b|\bdaily\b/i.test(text)) return undefined;
  // Named Mon–Sun / weekends → weekday parser instead.
  if (
    /\b(?:weekdays?|weekends?|sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?)s?\b/i.test(
      text
    )
  ) {
    return undefined;
  }

  const clock = defaultRecurringClock(text);
  const today = localDayKey(from);
  const startToday = /\bstarting\s+today\b|\btoday\b/i.test(text);
  return {
    remindAt: today,
    remindInterval: {
      value: 1,
      unit: 'days',
      hour: clock.hour,
      minute: clock.minute,
      ...(startToday ? { startsAt: today } : {}),
    },
  };
}

/**
 * every N days / every other day / every 2 weeks / monthly / every N months / yearly.
 * Uses days or months units (yearly → 12 months). Default clock 9 AM.
 */
export function parseIntervalReminder(
  text?: string,
  from = new Date()
): IntervalParse | undefined {
  if (!text?.trim()) return undefined;
  const clock = defaultRecurringClock(text);
  const today = localDayKey(from);

  if (/\bevery\s+other\s+day\b/i.test(text)) {
    return {
      remindAt: today,
      remindInterval: { value: 2, unit: 'days', hour: clock.hour, minute: clock.minute },
    };
  }

  const everyDays = text.match(/\bevery\s+(\d{1,3})\s+days?\b/i);
  if (everyDays) {
    const n = Number(everyDays[1]);
    if (n >= 1) {
      return {
        remindAt: today,
        remindInterval: { value: n, unit: 'days', hour: clock.hour, minute: clock.minute },
      };
    }
  }

  const everyWeeks = text.match(/\bevery\s+(\d{1,3})\s+weeks?\b/i);
  if (everyWeeks) {
    const n = Number(everyWeeks[1]);
    if (n >= 1) {
      return {
        remindAt: today,
        remindInterval: {
          value: n * 7,
          unit: 'days',
          hour: clock.hour,
          minute: clock.minute,
        },
      };
    }
  }

  if (/\b(?:every|each)\s+month\b|\bmonthly\b/i.test(text)) {
    return {
      remindAt: today,
      remindInterval: { value: 1, unit: 'months', hour: clock.hour, minute: clock.minute },
    };
  }

  const everyMonths = text.match(/\bevery\s+(\d{1,3})\s+months?\b/i);
  if (everyMonths) {
    const n = Number(everyMonths[1]);
    if (n >= 1) {
      return {
        remindAt: today,
        remindInterval: { value: n, unit: 'months', hour: clock.hour, minute: clock.minute },
      };
    }
  }

  if (/\b(?:every|each)\s+year\b|\byearly\b|\bannually\b/i.test(text)) {
    return {
      remindAt: today,
      remindInterval: { value: 12, unit: 'months', hour: clock.hour, minute: clock.minute },
    };
  }

  return undefined;
}

/** Strip polite fillers that aren't part of the reminder title. */
function stripReminderFillers(s: string): string {
  return s
    .replace(
      /\b(?:please\s+)?don'?t\s+let\s+me\s+forget\s+to\b/gi,
      ''
    )
    .replace(/\bi\s+need\s+to\b/gi, '')
    .replace(/\b(?:please|thanks|thank\s+you|um+|uh+)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Keep "Email August about…" / "Prepare for the…" as one title (not notes split). */
function shouldSplitReminderTitle(s: string, m: RegExpMatchArray): boolean {
  const idx = m.index ?? -1;
  if (idx < 3) return false;
  const before = s.slice(0, idx).trim();
  if (/\sabout\s+/i.test(m[0])) {
    if (
      /\b(email|mail|message|text|tell|ask|call|speak|talk|write|notify|update|warn)\b/i.test(
        before
      )
    ) {
      return false;
    }
  }
  if (/\sfor\s+(?:a|an|the|my|our|their)\s+/i.test(m[0])) {
    if (
      /\b(prepare|prep|pack|apply|register|sign\s*up|check\s*in|check\s*out|pay|buy|get|book|schedule|plan|ready)\b/i.test(
        before
      ) ||
      /^(prepare|prep|pack|apply|check\s*in)$/i.test(before) ||
      before.split(/\s+/).length <= 2
    ) {
      return false;
    }
  }
  return true;
}

/** Split a reminder utterance into a short title and optional notes. */
export function parseReminderFromUtterance(
  text?: string
): { label: string; notes?: string } | undefined {
  if (!text?.trim()) return undefined;
  let s = text.trim();
  // Allow lead-in words: "Can you set a reminder for…"
  s = s.replace(
    /^[\s\S]*?\b(?:please\s+)?(?:log|add|create|set(?:\s*up)?)\s+(?:a\s+|an\s+)?reminder\s+(?:to\s+|for\s+)?/i,
    ''
  );
  s = s.replace(
    /^[\s\S]*?\bremind\s+me\s+(?:to\s+|about\s+|that\s+|for\s+)?/i,
    ''
  );
  s = stripReminderFillers(s);
  s = stripReminderDatePhrases(s);
  s = finalizeReminderLabel(s);
  if (s.length < 3 || /^reminder$/i.test(s)) return { label: 'Reminder' };

  const splitOn = [
    /\s+(it's|its|it is)\s+/i,
    /\s+for\s+(?:a|an|the|my|our|their)\s+/i,
    /\s+about\s+/i,
    /,\s+/,
  ];
  for (const pat of splitOn) {
    const m = s.match(pat);
    if (m?.index != null && shouldSplitReminderTitle(s, m)) {
      const label = finalizeReminderLabel(s.slice(0, m.index));
      const notesRaw = s.slice(m.index).trim();
      const notes = notesRaw
        ? notesRaw.charAt(0).toUpperCase() + notesRaw.slice(1)
        : undefined;
      if (label.length >= 3) {
        return { label, notes };
      }
    }
  }

  const label = s;
  if (label.length > 56) {
    const cut = finalizeReminderLabel(label.slice(0, 56).replace(/\s+\S*$/, ''));
    const rest = label.slice(cut.length).trim();
    if (cut.length >= 3) {
      return { label: cut, notes: rest || undefined };
    }
  }
  return { label };
}

/**
 * Drop leftover command glue so titles aren't "For PE uniform…".
 * Safe for mid-phrase "for" ("Apply for renewed passport").
 */
export function finalizeReminderLabel(raw: string): string {
  let s = raw.trim().replace(/\s+/g, ' ');
  s = s.replace(
    /^(?:please\s+)?(?:remind\s+me(?:\s+to)?|(?:log|add|create|set(?:\s*up)?)\s+(?:a\s+|an\s+)?reminder(?:\s+to|\s+for)?|reminder)\s*/i,
    ''
  );
  s = stripReminderFillers(s);
  s = stripReminderDatePhrases(s);
  s = s.replace(/^[:\s,.-]+/, '');
  s = s.replace(/^(?:of|for|to|about|regarding)\s+/i, '');
  s = s.replace(/[.,;:!?]+$/g, '').trim();
  if (!s || /^remind(?:\s+me)?$/i.test(s)) return 'Reminder';
  return s.charAt(0).toUpperCase() + s.slice(1);
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
