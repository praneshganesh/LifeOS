// lib/dates.ts
function localDayKey(d = /* @__PURE__ */ new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isIsoDate(value) {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return false;
  }
  const d = /* @__PURE__ */ new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
function normalizeWarrantyExpiry(raw) {
  if (!raw) return void 0;
  const s = raw.trim();
  if (!s || s === "\u2014" || s === "-") return void 0;
  const yearOnly = s.match(/^(?:until|till|through|to)\s+(\d{4})$/i) || s.match(/^(\d{4})$/);
  if (yearOnly) return `${yearOnly[1]}-12-31`;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return localDayKey(d);
  return void 0;
}
function warrantyExpiryFromUtterance(text, from = /* @__PURE__ */ new Date()) {
  if (!text?.trim()) return void 0;
  const m = text.match(
    /\b(?:warranty|guarantee)\b[\s\S]{0,48}?\b(?:until|till|through|to)\s+(\d{4}(?:-\d{2}-\d{2})?)\b/i
  ) || text.match(/\b(?:until|till|through)\s+(\d{4}(?:-\d{2}-\d{2})?)\b/i);
  if (m) return normalizeWarrantyExpiry(m[1]);
  const monthPhrase = text.match(
    new RegExp(
      `\\b(?:until|till|through|to)\\s+(?:(next)\\s+)?(${MONTHS})(?:\\s+(\\d{4})|\\s+(next\\s+year))?\\b`,
      "i"
    )
  );
  if (monthPhrase) {
    const month = monthIndex(monthPhrase[2]);
    if (month != null) {
      let year = monthPhrase[3] ? Number(monthPhrase[3]) : from.getFullYear();
      if (!monthPhrase[3]) {
        if (monthPhrase[1] || monthPhrase[4]) {
          year = from.getFullYear() + 1;
        } else if (new Date(year, month + 1, 0) < startOfLocalDay(from)) {
          year += 1;
        }
      }
      return localDayKey(new Date(year, month + 1, 0));
    }
  }
  return void 0;
}
function displayWarrantyExpiry(iso) {
  const s = iso?.trim();
  if (!s || s === "\u2014" || s === "-") return void 0;
  if (/^\d{4}-12-31$/.test(s)) return s.slice(0, 4);
  return s;
}
var MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];
function formatDisplayDate(iso, opts = {}) {
  const s = iso?.trim();
  if (!s || s === "\u2014" || s === "-") return void 0;
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
var WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
];
function nextWeekdayKey(weekday, from = /* @__PURE__ */ new Date()) {
  const want = WEEKDAYS.indexOf(weekday.trim().toLowerCase());
  if (want < 0) return void 0;
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let add = (want - d.getDay() + 7) % 7;
  if (add === 0) add = 7;
  d.setDate(d.getDate() + add);
  return localDayKey(d);
}
var MONTHS = "january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec";
function monthIndex(name) {
  const key = name.trim().toLowerCase();
  const aliases = {
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
    dec: 11
  };
  return aliases[key];
}
function dateFromLocalDayKey(day, hour = 12, minute = 0) {
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return /* @__PURE__ */ new Date();
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
function calendarDayFromUtterance(text, from = /* @__PURE__ */ new Date()) {
  const dayMonth = text.match(
    new RegExp(
      `\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS})(?:\\s+(\\d{4}))?\\b`,
      "i"
    )
  );
  if (dayMonth) {
    const day = Number(dayMonth[1]);
    const month = monthIndex(dayMonth[2]);
    if (month == null || day < 1 || day > 31) return void 0;
    let year = dayMonth[3] ? Number(dayMonth[3]) : from.getFullYear();
    const candidate = new Date(year, month, day);
    if (candidate.getMonth() !== month || candidate.getDate() !== day) return void 0;
    if (!dayMonth[3] && candidate < startOfLocalDay(from)) {
      year += 1;
    }
    return localDayKey(new Date(year, month, day));
  }
  const monthDay = text.match(
    new RegExp(`\\b(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\b`, "i")
  );
  if (monthDay) {
    const month = monthIndex(monthDay[1]);
    const day = Number(monthDay[2]);
    if (month == null || day < 1 || day > 31) return void 0;
    let year = monthDay[3] ? Number(monthDay[3]) : from.getFullYear();
    const candidate = new Date(year, month, day);
    if (candidate.getMonth() !== month || candidate.getDate() !== day) return void 0;
    if (!monthDay[3] && candidate < startOfLocalDay(from)) {
      year += 1;
    }
    return localDayKey(new Date(year, month, day));
  }
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    return dmyParts(Number(slash[1]), Number(slash[2]) - 1, slash[3], from);
  }
  const dashed = text.match(/\b(\d{1,2})-(\d{1,2})(?:-(\d{2,4}))?\b/);
  if (dashed) {
    return dmyParts(Number(dashed[1]), Number(dashed[2]) - 1, dashed[3], from);
  }
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
  return void 0;
}
function dmyParts(day, month, yearRaw, from) {
  if (day < 1 || day > 31 || month < 0 || month > 11) return void 0;
  let year = from.getFullYear();
  if (yearRaw) {
    year = Number(yearRaw);
    if (year < 100) year += 2e3;
  }
  const candidate = new Date(year, month, day);
  if (candidate.getMonth() !== month || candidate.getDate() !== day) return void 0;
  if (!yearRaw && candidate < startOfLocalDay(from)) year += 1;
  const next = new Date(year, month, day);
  if (next.getMonth() !== month || next.getDate() !== day) return void 0;
  return localDayKey(next);
}
function nextDayOfMonth(day, from) {
  if (day < 1 || day > 31) return void 0;
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
  return void 0;
}
var ORDINAL_WORDS = {
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
  "twenty-first": 21,
  "twenty first": 21,
  "twenty-second": 22,
  "twenty second": 22,
  "twenty-third": 23,
  "twenty third": 23,
  "twenty-fourth": 24,
  "twenty fourth": 24,
  "twenty-fifth": 25,
  "twenty fifth": 25,
  "twenty-sixth": 26,
  "twenty sixth": 26,
  "twenty-seventh": 27,
  "twenty seventh": 27,
  "twenty-eighth": 28,
  "twenty eighth": 28,
  "twenty-ninth": 29,
  "twenty ninth": 29,
  thirtieth: 30,
  "thirty-first": 31,
  "thirty first": 31
};
function ordinalWordToDay(raw) {
  return ORDINAL_WORDS[raw.trim().toLowerCase().replace(/\s+/g, " ")];
}
function remindDateIsInvalid(text, from = /* @__PURE__ */ new Date()) {
  if (!text?.trim()) return false;
  const dayMonth = text.match(
    /\b(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]+)\b/i
  );
  if (dayMonth) {
    const day = Number(dayMonth[1]);
    const monRaw = dayMonth[2];
    const month = monthIndex(monRaw);
    if (month == null) {
      if (/^[A-Za-z]{3,}$/.test(monRaw) && !/^(to|for|the|a|an|my|our|and|or|at|in|on|by)$/i.test(monRaw)) {
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
      if (year < 100) year += 2e3;
    }
    const cand = new Date(year, month, day);
    if (cand.getMonth() !== month || cand.getDate() !== day) return true;
  }
  return false;
}
function remindDateIsPast(text, from = /* @__PURE__ */ new Date()) {
  if (!text?.trim()) return false;
  if (/\byesterday\b/i.test(text)) return true;
  const withYear = text.match(
    new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS})\\s+(\\d{4})\\b`,
      "i"
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
  if (iso && iso[1] < localDayKey(from)) return true;
  return false;
}
function remindDateIsAmbiguous(text) {
  if (!text?.trim()) return false;
  return /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b.+\bor\b.+\b\d{1,2}/i.test(
    text
  );
}
function startOfLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function utteranceNamesRemindDate(text) {
  if (!text?.trim()) return false;
  const t = text;
  if (/\b(today|tomorrow|tonight|yesterday)\b/i.test(t)) return true;
  if (/\bday\s+after\s+tomorrow\b/i.test(t)) return true;
  if (/\bthis\s+weekend\b/i.test(t)) return true;
  if (/\bend\s+of\s+(?:the\s+)?month\b/i.test(t)) return true;
  if (/\bnext\s+(week|month|year|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.test(
    t
  )) {
    return true;
  }
  if (/\b(?:on|this|by)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.test(
    t
  )) {
    return true;
  }
  if (/\bin\s+(?:a|\d{1,3})\s+(?:days?|weeks?|months?|hours?|minutes?)\b/i.test(t)) {
    return true;
  }
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(t)) return true;
  if (/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(t)) return true;
  if (/\b\d{1,2}-\d{1,2}(?:-\d{2,4})?\b/.test(t)) return true;
  if (/\b(?:on\s+)?(?:the\s+)?\d{1,2}(?:st|nd|rd|th)\b/i.test(t)) return true;
  if (new RegExp(
    `\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS})\\b`,
    "i"
  ).test(t)) {
    return true;
  }
  if (new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "i").test(t)) {
    return true;
  }
  return false;
}
function remindAtFromUtterance(text, from = /* @__PURE__ */ new Date(), now) {
  if (!text?.trim()) return void 0;
  if (remindDateIsInvalid(text, from) || remindDateIsPast(text, from) || remindDateIsAmbiguous(text)) {
    return void 0;
  }
  const relativeDt = parseRelativeDateTimeFromUtterance(text, from, now);
  if (relativeDt?.day) return relativeDt.day;
  const recurring = parseDailyReminder(text, from) || parseIntervalReminder(text, from) || parseRecurringWeekdayReminder(text, from);
  if (recurring?.remindAt) return recurring.remindAt;
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const cal = calendarDayFromUtterance(text, from);
  if (cal) return cal;
  const nextWd = text.match(
    /\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i
  );
  if (nextWd) return nextWeekdayKey(nextWd[1], from);
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
    return nextWeekdayKey("saturday", from);
  }
  if (/\bend\s+of\s+(?:the\s+)?month\b/i.test(text)) {
    return localDayKey(new Date(from.getFullYear(), from.getMonth() + 1, 0));
  }
  if (/\bnext\s+week\b/i.test(text)) {
    return nextWeekdayKey("monday", from);
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
  return void 0;
}
function isLocalNoonAnchor(d) {
  return d.getHours() === 12 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
}
function instantOnAnchor(from, now = /* @__PURE__ */ new Date()) {
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
function parseRelativeDateTimeFromUtterance(text, from = /* @__PURE__ */ new Date(), now) {
  if (!text?.trim()) return void 0;
  const base = instantOnAnchor(from, now ?? /* @__PURE__ */ new Date());
  let addMs;
  const mins = text.match(/\bin\s+(\d{1,4})\s+(?:minutes?|mins?)\b/i);
  if (mins) addMs = Number(mins[1]) * 6e4;
  else if (/\bin\s+(?:a\s+)?half(?:\s+an)?\s+hour\b/i.test(text)) addMs = 30 * 6e4;
  else if (/\bin\s+(?:an|a|one)\s+hour\b/i.test(text)) addMs = 36e5;
  else {
    const hours = text.match(/\bin\s+(\d{1,3})\s+hours?\b/i);
    if (hours) addMs = Number(hours[1]) * 36e5;
    else {
      const fromNowMin = text.match(/\b(\d{1,4})\s+(?:minutes?|mins?)\s+from\s+now\b/i);
      if (fromNowMin) addMs = Number(fromNowMin[1]) * 6e4;
      else {
        const fromNowHr = text.match(/\b(\d{1,3})\s+hours?\s+from\s+now\b/i);
        if (fromNowHr) addMs = Number(fromNowHr[1]) * 36e5;
      }
    }
  }
  if (addMs == null || addMs <= 0) return void 0;
  const d = new Date(base.getTime() + addMs);
  return { day: localDayKey(d), hour: d.getHours(), minute: d.getMinutes() };
}
var WEEKDAY_PATTERNS = [
  { day: 0, re: /\bsun(?:day)?s?\b/i },
  { day: 1, re: /\bmon(?:day)?s?\b/i },
  { day: 2, re: /\btue(?:s(?:day)?)?s?\b/i },
  { day: 3, re: /\bwed(?:nesday)?s?\b/i },
  { day: 4, re: /\bthu(?:rs(?:day)?)?s?\b/i },
  { day: 5, re: /\bfri(?:day)?s?\b/i },
  { day: 6, re: /\bsat(?:urday)?s?\b/i }
];
function parseTimeOfDayFromUtterance(text) {
  if (!text?.trim()) return void 0;
  const t = text;
  if (/\bmidnight\b/i.test(t)) return { hour: 0, minute: 0 };
  if (/\bnoon\b|\bmidday\b/i.test(t)) return { hour: 12, minute: 0 };
  if (/\btonight\b/i.test(t)) return { hour: 20, minute: 0 };
  if (/\b(?:this\s+)?evening\b/i.test(t)) return { hour: 18, minute: 0 };
  if (/\b(?:this\s+)?morning\b/i.test(t) && !/\btomorrow\s+morning\b/i.test(t)) {
  }
  if (/\b(?:in\s+the\s+)?morning\b/i.test(t) || /\btomorrow\s+morning\b/i.test(t)) {
    return { hour: 9, minute: 0 };
  }
  const dotted = t.match(
    /\b(?:at\s+)?(\d{1,2})[.:](\d{2})\s*(a\.?m\.?|p\.?m\.?)\b/i
  );
  if (dotted) {
    let hour = Number(dotted[1]);
    const minute = Number(dotted[2]);
    if (!Number.isFinite(hour) || hour < 1 || hour > 12 || minute > 59) return void 0;
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
    if (!Number.isFinite(hour) || hour < 1 || hour > 12 || minute > 59) return void 0;
    const pm = /^p/i.test(withMeridiem[3]);
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
    return { hour, minute };
  }
  const twentyFour = t.match(/\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFour) {
    return { hour: Number(twentyFour[1]), minute: Number(twentyFour[2]) };
  }
  const bareAt = t.match(/\bat\s+(\d{1,2})\b(?!\s*(?:a\.?m\.?|p\.?m\.?|:|\d))/i);
  if (bareAt) {
    const n = Number(bareAt[1]);
    if (n >= 0 && n <= 23) {
      if (n >= 1 && n <= 7) return { hour: n + 12, minute: 0 };
      if (n >= 8 && n <= 11) return { hour: n, minute: 0 };
      return { hour: n === 12 ? 12 : n, minute: 0 };
    }
  }
  return void 0;
}
function remindTimeFromUtterance(text) {
  const clock = parseTimeOfDayFromUtterance(text);
  if (!clock) return void 0;
  return `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
}
function parseRecurringWeekdayReminder(text, from = /* @__PURE__ */ new Date()) {
  if (!text?.trim()) return void 0;
  const onWeekdays = /\bon\s+weekdays?\b/i.test(text);
  const onWeekends = /\bon\s+weekends?\b/i.test(text);
  const everyCue = /\b(?:every|each)\b/i.test(text);
  if (!onWeekdays && !onWeekends && !everyCue) return void 0;
  let weekdays = [];
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
  if (!weekdays.length) return void 0;
  const clock = parseTimeOfDayFromUtterance(text);
  const hour = clock?.hour != null ? clock.hour : 9;
  const minute = clock?.minute ?? 0;
  const endsAt = parseReminderEndsAtFromUtterance(text, from);
  const set = new Set(weekdays);
  let remindAt;
  const endBound = endsAt ? new Date(
    Number(endsAt.slice(0, 4)),
    Number(endsAt.slice(5, 7)) - 1,
    Number(endsAt.slice(8, 10)),
    23,
    59,
    59
  ).getTime() : null;
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
  if (!remindAt) return void 0;
  return {
    remindAt,
    remindInterval: {
      value: 1,
      unit: "weekdays",
      weekdays,
      hour,
      minute,
      ...endsAt ? { endsAt } : {}
    }
  };
}
function parseReminderEndsAtFromUtterance(text, from = /* @__PURE__ */ new Date()) {
  if (!text?.trim()) return void 0;
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
      "i"
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
      "i"
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
  const untilMonth = text.match(
    new RegExp(
      `\\b(?:until|till|through)\\s+(?:(next)\\s+)?(${MONTHS})(?:\\s+(\\d{4})|\\s+(next\\s+year))?\\b`,
      "i"
    )
  );
  if (untilMonth) {
    const month = monthIndex(untilMonth[2]);
    if (month != null) {
      let year = untilMonth[3] ? Number(untilMonth[3]) : from.getFullYear();
      if (!untilMonth[3]) {
        if (untilMonth[1] || untilMonth[4]) {
          year = from.getFullYear() + 1;
        } else if (new Date(year, month + 1, 0) < startOfLocalDay(from)) {
          year += 1;
        }
      }
      return localDayKey(new Date(year, month + 1, 0));
    }
  }
  return void 0;
}
function looksLikeReminderQuery(text) {
  if (!text?.trim()) return false;
  const t = text.trim();
  if (!/\breminders?\b/i.test(t)) return false;
  return /\b(what|which|any|how many|upcoming|next)\b.{0,48}\breminders?\b/i.test(t) || /\b(my|our)\s+reminders?\b/i.test(t) || /\breminders?\b.{0,48}\b(do i have|have i|are there|do we have|have we)\b/i.test(t) || /\b(do i|did i|do we)\s+have\b.{0,48}\breminders?\b/i.test(t) || /\b(show|list|see|open|view|check)\b.{0,40}\b(my\s+|our\s+)?reminders?\b/i.test(t) || /\bwhat\s+reminders?\b/i.test(t);
}
function looksLikeReminderEditCommand(text) {
  if (!text?.trim()) return false;
  const t = text.trim();
  return /\b(move|change|reschedule|update|edit|push|snooze)\b.{0,80}\bremind(?:er)?s?\b/i.test(
    t
  ) || /\b(delete|remove|cancel|clear)\b.{0,80}\bremind(?:er)?s?\b/i.test(t) || /\bremind(?:er)?s?\b.{0,40}\b(to|for|on|at)\b.{0,40}\b(move|change|reschedule|update)\b/i.test(
    t
  );
}
function isRelativeReminderPing(text) {
  if (!parseRelativeDateTimeFromUtterance(text)) return false;
  const rest = String(text || "").replace(/\bin\s+(?:a|\d+|an|one|half(?:\s+an)?)\s+(?:hours?|minutes?|mins?)\b/gi, " ").replace(/\b\d+\s+(?:minutes?|mins?|hours?)\s+from\s+now\b/gi, " ").replace(/\b(please|a|an|the|me|now|in)\b/gi, " ").replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  return rest.length < 3;
}
function looksLikeReminder(text) {
  if (!text?.trim()) return false;
  if (looksLikeReminderQuery(text)) return false;
  if (looksLikeReminderEditCommand(text)) return false;
  if (isBareRemindMe(text)) return false;
  return /\bremind\s+me\b/i.test(text) || /\b(?:please\s+)?(?:log|set|add|create)\s+(?:a\s+)?reminder\b/i.test(text) || /\breminder\s+to\b/i.test(text) || /\b(?:a\s+)?reminder\s+(?:for|about)\b/i.test(text);
}
function isBareRemindMe(text) {
  if (!text?.trim()) return false;
  const t = text.trim().replace(/[.,!?]+$/g, "").replace(/\b(please|thanks|thank you|um+|uh+)\b/gi, " ").replace(/\s+/g, " ").trim();
  return /^(?:hey\s+|hi\s+|ok\s+|okay\s+)?remind\s+me$/i.test(t);
}
function reminderClarifyFromUtterance(text, from = /* @__PURE__ */ new Date()) {
  if (!text?.trim()) return void 0;
  if (isBareRemindMe(text)) {
    return "What should I remind you about?";
  }
  if (remindDateIsAmbiguous(text)) {
    return "Which date did you mean?";
  }
  if (remindDateIsInvalid(text, from)) {
    return "That date doesn't look valid \u2014 which day should I use?";
  }
  if (remindDateIsPast(text, from)) {
    return "That date is in the past \u2014 which day should I remind you?";
  }
  return void 0;
}
function splitDualRemindersFromUtterance(text, from = /* @__PURE__ */ new Date()) {
  if (!text?.trim()) return void 0;
  const cleaned = text.replace(/^[\s\S]*?\bremind\s+me\s+(?:to\s+)?/i, "").trim();
  const parts = cleaned.split(/\s+\band\s+/i);
  if (parts.length !== 2) return void 0;
  const out = [];
  for (const part of parts) {
    const remindAt = remindAtFromUtterance(part, from);
    if (!remindAt) return void 0;
    const parsed = parseReminderFromUtterance(`Remind me to ${part}`);
    const label = parsed?.label;
    if (!label || /^reminder$/i.test(label)) return void 0;
    const remindTime = remindTimeFromUtterance(part);
    out.push({ label, remindAt, ...remindTime ? { remindTime } : {} });
  }
  if (out[0].remindAt === out[1].remindAt) return void 0;
  return out;
}
function stripReminderDatePhrases(s) {
  return s.replace(
    new RegExp(
      `\\b(?:(?:on|by|for)\\s+)?(?:the\\s+)?\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS})(?:\\s+\\d{4})?\\b`,
      "gi"
    ),
    ""
  ).replace(
    new RegExp(
      `\\b(?:(?:on|by|for)\\s+)?(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:\\s+\\d{4})?\\b`,
      "gi"
    ),
    ""
  ).replace(
    /\b(next|this|on|by)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi,
    ""
  ).replace(
    /\b(?:every|each)\s+(?:other\s+)?(?:weekdays?|weekends?|(?:sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?)s?(?:\s*(?:,|and|&|\/)\s*(?:sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?)s?)*)\b/gi,
    ""
  ).replace(/\bon\s+weekdays?\b/gi, "").replace(/\bon\s+weekends?\b/gi, "").replace(/\b(?:every|each)\s+day\b/gi, "").replace(/\bevery\s+other\s+day\b/gi, "").replace(/\bdaily\b/gi, "").replace(/\b(?:every|each)\s+month\b|\bmonthly\b/gi, "").replace(/\b(?:every|each)\s+year\b|\byearly\b|\bannually\b/gi, "").replace(/\bstarting\s+(?:today|tomorrow)\b/gi, "").replace(/\bevery\s+\d+\s+(?:days?|weeks?|months?|years?)\b/gi, "").replace(/\b(?:at\s+)?\d{1,2}[.:]\d{2}\s*(?:a\.?m\.?|p\.?m\.?)\b/gi, "").replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/gi, "").replace(/\bat\s+\d{1,2}:\d{2}\b/gi, "").replace(/\bat\s+\d{1,2}\s*:\s*(?!\d)/gi, "").replace(/\bat\s+\d{1,2}\b(?!\s*(?:a\.?m\.?|p\.?m\.?|:|\d))/gi, "").replace(
    /\b(?:at\s+)?(?:noon|midnight|midday|(?:this\s+)?evening|tonight|(?:in\s+the\s+)?(?:this\s+)?morning)\b/gi,
    ""
  ).replace(/\bfor\s+\d{1,3}\s+(?:weeks?|months?)\b/gi, "").replace(
    new RegExp(
      `\\b(?:until|till|through)\\s+(?:the\\s+)?(?:\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?)?(?:${MONTHS})(?:\\s+\\d{1,2}(?:st|nd|rd|th)?)?(?:\\s+\\d{4})?\\b`,
      "gi"
    ),
    ""
  ).replace(/\b(?:until|till|through|to)\s+\d{4}-\d{2}-\d{2}\b/gi, "").replace(
    /\b(?:the\s+)?(?:day\s+after\s+tomorrow|tomorrow|today|yesterday|tonight)\b/gi,
    ""
  ).replace(/\bthis\s+weekend\b/gi, "").replace(/\bend\s+of\s+(?:the\s+)?month\b/gi, "").replace(/\bnext\s+(?:week|month|year)\b/gi, "").replace(/\bin\s+(?:a|\d+|an|one|half(?:\s+an)?)\s+(?:days?|weeks?|months?|hours?|minutes?|mins?)\b/gi, "").replace(/\b\d+\s+(?:minutes?|mins?|hours?)\s+from\s+now\b/gi, "").replace(new RegExp(`(?<!\\bend\\s)(?<!\\bstart\\s)\\bof\\s+(?:${MONTHS})\\b`, "gi"), "").replace(/\b\d{4}-\d{2}-\d{2}\b/g, "").replace(/\b(?:on|by|for)\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi, "").replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, "").replace(/\b(?:on|by|for)\s+\d{1,2}-\d{1,2}(?:-\d{2,4})?\b/gi, "").replace(/\b\d{1,2}-\d{1,2}(?:-\d{2,4})?\b/g, "").replace(/\b(?:on\s+)?(?:the\s+)?\d{1,2}(?:st|nd|rd|th)\b/gi, "").replace(
    /\b(?:on\s+)?(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty[- ]?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)|thirtieth|thirty[- ]?first)\b/gi,
    ""
  ).replace(/\s+(?:on|by|for|at)\s+the\s*$/gi, "").replace(/\s+(?:on|by|for|at)\s*$/gi, "").replace(/\s+/g, " ").replace(/[.,;:!?]+$/g, "").trim();
}
function defaultRecurringClock(text) {
  const clock = parseTimeOfDayFromUtterance(text);
  if (clock) return clock;
  return { hour: 9, minute: 0 };
}
function parseDailyReminder(text, from = /* @__PURE__ */ new Date()) {
  if (!text?.trim()) return void 0;
  if (!/\b(?:every|each)\s+day\b|\bdaily\b/i.test(text)) return void 0;
  if (/\b(?:weekdays?|weekends?|sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?)s?\b/i.test(
    text
  )) {
    return void 0;
  }
  const clock = defaultRecurringClock(text);
  const today = localDayKey(from);
  const startToday = /\bstarting\s+today\b|\btoday\b/i.test(text);
  return {
    remindAt: today,
    remindInterval: {
      value: 1,
      unit: "days",
      hour: clock.hour,
      minute: clock.minute,
      ...startToday ? { startsAt: today } : {}
    }
  };
}
function parseIntervalReminder(text, from = /* @__PURE__ */ new Date()) {
  if (!text?.trim()) return void 0;
  const clock = defaultRecurringClock(text);
  const today = localDayKey(from);
  if (/\bevery\s+other\s+day\b/i.test(text)) {
    return {
      remindAt: today,
      remindInterval: { value: 2, unit: "days", hour: clock.hour, minute: clock.minute }
    };
  }
  const everyDays = text.match(/\bevery\s+(\d{1,3})\s+days?\b/i);
  if (everyDays) {
    const n = Number(everyDays[1]);
    if (n >= 1) {
      return {
        remindAt: today,
        remindInterval: { value: n, unit: "days", hour: clock.hour, minute: clock.minute }
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
          unit: "days",
          hour: clock.hour,
          minute: clock.minute
        }
      };
    }
  }
  if (/\b(?:every|each)\s+month\b|\bmonthly\b/i.test(text)) {
    return {
      remindAt: today,
      remindInterval: { value: 1, unit: "months", hour: clock.hour, minute: clock.minute }
    };
  }
  const everyMonths = text.match(/\bevery\s+(\d{1,3})\s+months?\b/i);
  if (everyMonths) {
    const n = Number(everyMonths[1]);
    if (n >= 1) {
      return {
        remindAt: today,
        remindInterval: { value: n, unit: "months", hour: clock.hour, minute: clock.minute }
      };
    }
  }
  if (/\b(?:every|each)\s+year\b|\byearly\b|\bannually\b/i.test(text)) {
    return {
      remindAt: today,
      remindInterval: { value: 12, unit: "months", hour: clock.hour, minute: clock.minute }
    };
  }
  return void 0;
}
function stripReminderFillers(s) {
  return s.replace(
    /\b(?:please\s+)?don'?t\s+let\s+me\s+forget\s+to\b/gi,
    ""
  ).replace(/\bi\s+need\s+to\b/gi, "").replace(/\b(?:please|thanks|thank\s+you|um+|uh+)\b/gi, "").replace(/\s+/g, " ").trim();
}
function shouldSplitReminderTitle(s, m) {
  const idx = m.index ?? -1;
  if (idx < 3) return false;
  const before = s.slice(0, idx).trim();
  if (/\sabout\s+/i.test(m[0])) {
    if (/\b(email|mail|message|text|tell|ask|call|speak|talk|write|notify|update|warn)\b/i.test(
      before
    )) {
      return false;
    }
  }
  if (/\sfor\s+(?:a|an|the|my|our|their)\s+/i.test(m[0])) {
    if (/\b(prepare|prep|pack|apply|register|sign\s*up|check\s*in|check\s*out|pay|buy|get|book|schedule|plan|ready)\b/i.test(
      before
    ) || /^(prepare|prep|pack|apply|check\s*in)$/i.test(before) || before.split(/\s+/).length <= 2) {
      return false;
    }
  }
  return true;
}
function parseReminderFromUtterance(text) {
  if (!text?.trim()) return void 0;
  let s = text.trim();
  s = s.replace(
    /^[\s\S]*?\b(?:please\s+)?(?:log|set|add|create)\s+(?:a\s+)?reminder\s+(?:to\s+|for\s+)?/i,
    ""
  );
  s = s.replace(
    /^[\s\S]*?\bremind\s+me\s+(?:to\s+|about\s+|that\s+|for\s+)?/i,
    ""
  );
  s = stripReminderFillers(s);
  s = stripReminderDatePhrases(s);
  s = finalizeReminderLabel(s);
  if (s.length < 3 || /^reminder$/i.test(s)) return { label: "Reminder" };
  const splitOn = [
    /\s+(it's|its|it is)\s+/i,
    /\s+for\s+(?:a|an|the|my|our|their)\s+/i,
    /\s+about\s+/i,
    /,\s+/
  ];
  for (const pat of splitOn) {
    const m = s.match(pat);
    if (m?.index != null && shouldSplitReminderTitle(s, m)) {
      const label2 = finalizeReminderLabel(s.slice(0, m.index));
      const notesRaw = s.slice(m.index).trim();
      const notes = notesRaw ? notesRaw.charAt(0).toUpperCase() + notesRaw.slice(1) : void 0;
      if (label2.length >= 3) {
        return { label: label2, notes };
      }
    }
  }
  const label = s;
  if (label.length > 56) {
    const cut = finalizeReminderLabel(label.slice(0, 56).replace(/\s+\S*$/, ""));
    const rest = label.slice(cut.length).trim();
    if (cut.length >= 3) {
      return { label: cut, notes: rest || void 0 };
    }
  }
  return { label };
}
function finalizeReminderLabel(raw) {
  let s = raw.trim().replace(/\s+/g, " ");
  s = s.replace(/^(?:please\s+)?(?:remind\s+me(?:\s+to)?|set\s+(?:a\s+)?reminder(?:\s+to)?|reminder)\s*/i, "");
  s = stripReminderFillers(s);
  s = stripReminderDatePhrases(s);
  s = s.replace(/^[:\s,.-]+/, "");
  s = s.replace(/^(?:of|for|to|about|regarding)\s+/i, "");
  s = s.replace(/[.,;:!?]+$/g, "").trim();
  if (!s || /^remind(?:\s+me)?$/i.test(s)) return "Reminder";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function reminderLabelFromUtterance(text) {
  return parseReminderFromUtterance(text)?.label;
}
function addCalendarMonths(yyyyMmDd, months) {
  const m = yyyyMmDd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return yyyyMmDd;
  const year = Number(m[1]);
  const monthIndex2 = Number(m[2]) - 1;
  const day = Number(m[3]);
  const dt = new Date(year, monthIndex2, day);
  dt.setMonth(dt.getMonth() + months);
  if (dt.getDate() !== day) dt.setDate(0);
  return localDayKey(dt);
}
export {
  addCalendarMonths,
  dateFromLocalDayKey,
  displayWarrantyExpiry,
  finalizeReminderLabel,
  formatDisplayDate,
  instantOnAnchor,
  isBareRemindMe,
  isIsoDate,
  isLocalNoonAnchor,
  isRelativeReminderPing,
  localDayKey,
  looksLikeReminder,
  looksLikeReminderEditCommand,
  looksLikeReminderQuery,
  nextWeekdayKey,
  normalizeWarrantyExpiry,
  parseDailyReminder,
  parseIntervalReminder,
  parseRecurringWeekdayReminder,
  parseRelativeDateTimeFromUtterance,
  parseReminderEndsAtFromUtterance,
  parseReminderFromUtterance,
  parseTimeOfDayFromUtterance,
  remindAtFromUtterance,
  remindDateIsAmbiguous,
  remindDateIsInvalid,
  remindDateIsPast,
  remindTimeFromUtterance,
  reminderClarifyFromUtterance,
  reminderLabelFromUtterance,
  splitDualRemindersFromUtterance,
  utteranceNamesRemindDate,
  warrantyExpiryFromUtterance
};
