/** Reminder utterance repair — keep in sync with lib/dates.ts */

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const MONTHS =
  'january|february|march|april|may|june|july|august|september|october|november|december';

function localDayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function monthIndex(name) {
  const i = MONTHS.split('|').indexOf(String(name || '').trim().toLowerCase());
  return i >= 0 ? i : undefined;
}

function calendarDayFromUtterance(text, from = new Date()) {
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

export function looksLikeReminder(text) {
  if (!text?.trim()) return false;
  return /\bremind(?:er|ers|ing)?\b|\bremind me\b/i.test(text);
}

export function nextWeekdayKey(weekday, from = new Date()) {
  const want = WEEKDAYS.indexOf(String(weekday || '').trim().toLowerCase());
  if (want < 0) return undefined;
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let add = (want - d.getDay() + 7) % 7;
  if (add === 0) add = 7;
  d.setDate(d.getDate() + add);
  return localDayKey(d);
}

export function remindAtFromUtterance(text, from = new Date()) {
  if (!text?.trim()) return undefined;
  const recurring = parseRecurringWeekdayReminder(text, from);
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

const WEEKDAY_PATTERNS = [
  { day: 0, re: /\bsun(?:day)?s?\b/i },
  { day: 1, re: /\bmon(?:day)?s?\b/i },
  { day: 2, re: /\btue(?:s(?:day)?)?s?\b/i },
  { day: 3, re: /\bwed(?:nesday)?s?\b/i },
  { day: 4, re: /\bthu(?:rs(?:day)?)?s?\b/i },
  { day: 5, re: /\bfri(?:day)?s?\b/i },
  { day: 6, re: /\bsat(?:urday)?s?\b/i },
];

export function parseTimeOfDayFromUtterance(text) {
  if (!text?.trim()) return undefined;
  const withMeridiem = text.match(
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
  const twentyFour = text.match(/\b(?:at\s+)(\d{1,2}):(\d{2})\b/);
  if (twentyFour) {
    const hour = Number(twentyFour[1]);
    const minute = Number(twentyFour[2]);
    if (hour > 23 || minute > 59) return undefined;
    return { hour, minute };
  }
  return undefined;
}

export function parseRecurringWeekdayReminder(text, from = new Date()) {
  if (!text?.trim()) return undefined;
  if (!/\b(?:every|each)\b/i.test(text)) return undefined;

  let weekdays = [];
  if (/\bweekdays?\b/i.test(text)) {
    weekdays = [1, 2, 3, 4, 5];
  } else if (/\bweekends?\b/i.test(text)) {
    weekdays = [0, 6];
  } else {
    for (const { day, re } of WEEKDAY_PATTERNS) {
      if (re.test(text)) weekdays.push(day);
    }
  }
  weekdays = [...new Set(weekdays)].sort((a, b) => a - b);
  if (!weekdays.length) return undefined;

  const clock = parseTimeOfDayFromUtterance(text);
  const hour = clock?.hour ?? 9;
  const minute = clock?.minute ?? 0;
  const endsAt = parseReminderEndsAtFromUtterance(text, from);

  const set = new Set(weekdays);
  let remindAt;
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

export function parseReminderEndsAtFromUtterance(text, from = new Date()) {
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

  const untilMonth = text.match(
    new RegExp(`\\b(?:until|till|through)\\s+(${MONTHS})(?:\\s+(\\d{4}))?\\b`, 'i')
  );
  if (untilMonth) {
    const month = monthIndex(untilMonth[1]);
    if (month != null) {
      let year = untilMonth[2] ? Number(untilMonth[2]) : from.getFullYear();
      const endOfMonth = new Date(year, month + 1, 0);
      if (!untilMonth[2] && endOfMonth < startOfLocalDay(from)) {
        year += 1;
      }
      return localDayKey(new Date(year, month + 1, 0));
    }
  }

  return undefined;
}

function stripReminderDatePhrases(s) {
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
    .replace(
      /\b(?:every|each)\s+(?:other\s+)?(?:weekdays?|weekends?|(?:sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?)s?(?:\s*(?:,|and|&|\/)\s*(?:sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?)s?)*)\b/gi,
      ''
    )
    .replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/gi, '')
    .replace(/\bat\s+\d{1,2}:\d{2}\b/gi, '')
    .replace(/\bfor\s+\d{1,3}\s+(?:weeks?|months?)\b/gi, '')
    .replace(
      new RegExp(
        `\\b(?:until|till|through)\\s+(?:the\\s+)?(?:\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?)?(?:${MONTHS})(?:\\s+\\d{1,2}(?:st|nd|rd|th)?)?(?:\\s+\\d{4})?\\b`,
        'gi'
      ),
      ''
    )
    .replace(/\b(?:until|till|through|to)\s+\d{4}-\d{2}-\d{2}\b/gi, '')
    .replace(/\b(tomorrow|today)\b/gi, '')
    .replace(/\bin\s+\d+\s+days?\b/gi, '')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/g, '')
    .trim();
}

export function parseReminderFromUtterance(text) {
  if (!text?.trim()) return undefined;
  let s = text.trim();
  s = s.replace(
    /^(please\s+)?(log|set|add|create)\s+(a\s+)?reminder\s+(to\s+|for\s+)?/i,
    ''
  );
  s = s.replace(/^remind\s+me\s+(to\s+|about\s+|that\s+)?/i, '');
  s = stripReminderDatePhrases(s);
  s = s.replace(/^to\s+/i, '').trim();
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

export function reminderLabelFromUtterance(text) {
  return parseReminderFromUtterance(text)?.label;
}

function passportId(inventorySummary, text) {
  const list = Array.isArray(inventorySummary) ? inventorySummary : [];
  const t = String(text || '').toLowerCase();
  const hit = list.find((i) => {
    const name = String(i?.name || '').toLowerCase();
    if (!name) return false;
    return t.includes(name) || (name.includes('passport') && t.includes('passport'));
  });
  return hit?.id;
}

export function ensureReminderActions(actions, lastUserText, inventorySummary) {
  const list = (Array.isArray(actions) ? actions : []).filter(
    (a) => a && a.type && a.type !== 'none'
  );
  const types = new Set(list.map((a) => a.type));
  const recurring = parseRecurringWeekdayReminder(lastUserText);
  const remindAt = remindAtFromUtterance(lastUserText);
  const parsed = parseReminderFromUtterance(lastUserText);
  const label = parsed?.label || 'Reminder';
  const inventoryItemId = passportId(inventorySummary, lastUserText);

  if (
    looksLikeReminder(lastUserText) &&
    !types.has('set_reminder') &&
    (remindAt || recurring)
  ) {
    list.push({
      type: 'set_reminder',
      label,
      remindAt: recurring?.remindAt || remindAt,
      remindInterval: recurring?.remindInterval,
      note: parsed?.notes,
      inventoryItemId,
    });
  }

  return list.map((a) => {
    if (a.type !== 'set_reminder') return a;
    const next = { ...a };
    if (!next.remindAt && (recurring?.remindAt || remindAt)) {
      next.remindAt = recurring?.remindAt || remindAt;
    }
    if (!next.remindInterval && recurring?.remindInterval) {
      next.remindInterval = recurring.remindInterval;
    }
    if (!next.label) next.label = label;
    if (!next.note && parsed?.notes) next.note = parsed.notes;
    if (!next.inventoryItemId && inventoryItemId) next.inventoryItemId = inventoryItemId;
    return next;
  });
}
