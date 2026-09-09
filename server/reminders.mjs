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
  const remindAt = remindAtFromUtterance(lastUserText);
  const parsed = parseReminderFromUtterance(lastUserText);
  const label = parsed?.label || 'Reminder';
  const inventoryItemId = passportId(inventorySummary, lastUserText);

  if (looksLikeReminder(lastUserText) && !types.has('set_reminder') && remindAt) {
    list.push({
      type: 'set_reminder',
      label,
      remindAt,
      note: parsed?.notes,
      inventoryItemId,
    });
  }

  return list.map((a) => {
    if (a.type !== 'set_reminder') return a;
    const next = { ...a };
    if (!next.remindAt && remindAt) next.remindAt = remindAt;
    if (!next.label) next.label = label;
    if (!next.note && parsed?.notes) next.note = parsed.notes;
    if (!next.inventoryItemId && inventoryItemId) next.inventoryItemId = inventoryItemId;
    return next;
  });
}
