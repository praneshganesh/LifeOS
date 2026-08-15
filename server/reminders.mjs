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

function localDayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

export function reminderLabelFromUtterance(text) {
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
  const label = reminderLabelFromUtterance(lastUserText) || 'Reminder';
  const inventoryItemId = passportId(inventorySummary, lastUserText);

  if (looksLikeReminder(lastUserText) && !types.has('set_reminder') && remindAt) {
    list.push({
      type: 'set_reminder',
      label,
      remindAt,
      inventoryItemId,
    });
  }

  return list.map((a) => {
    if (a.type !== 'set_reminder') return a;
    const next = { ...a };
    if (!next.remindAt && remindAt) next.remindAt = remindAt;
    if (!next.label) next.label = label;
    if (!next.inventoryItemId && inventoryItemId) next.inventoryItemId = inventoryItemId;
    return next;
  });
}
