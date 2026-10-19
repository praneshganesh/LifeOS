import type { ChatAgentResponse } from '@/lib/chat/types';
import { openingLineForFocus, type TalkFocus } from '@/lib/chat/focus';
import {
  formatDisplayDate,
  looksLikeReminder,
  looksLikeReminderQuery,
  localDayKey,
} from '@/lib/dates';
import {
  nextMonthDayRange,
  nextNDaysRange,
  nextWeekDayRange,
  shortDayLabel,
  thisMonthDayRange,
  thisWeekDayRange,
  throughWeekdayRange,
  weekendDayRange,
  type DayRange,
} from '@/lib/chat/agendaRanges';

export type AgendaScope =
  | 'today'
  | 'tomorrow'
  | 'upcoming'
  | 'reminders'
  | 'overdue'
  | 'week'
  | 'month'
  | 'this_week'
  | 'this_month'
  | 'weekend'
  | 'coming'
  | 'done'
  | 'renewals'
  | 'window';

export type HorizonItem = { title: string; dayKey: string; who?: string };
export type TitledItem = { title: string; subtitle?: string; who?: string };

export type LocalIntentContext = {
  focusItemId?: string | null;
  fallbackItemId?: string | null;
  focusExpenseId?: string | null;
  talkFocus?: TalkFocus | null;
  reminders?: { id?: string; label: string; remindAt?: string | null; who?: string }[];
  overdue?: TitledItem[];
  horizon?: HorizonItem[];
  coming?: TitledItem[];
  doneToday?: TitledItem[];
  renewals?: HorizonItem[];
  /** Habit status for “did I… / streak” */
  habits?: {
    title: string;
    doneToday: boolean;
    streak: number;
    who?: string;
  }[];
  /** Household names for “for Ishaan” filtering (first name ok). */
  people?: { name: string; isSelf?: boolean }[];
  openHabits?: { title: string; who?: string }[];
  classesToday?: { title: string; when?: string; who?: string }[];
  nextClass?: { title: string; when: string; who?: string } | null;
};

type AgendaPlan = {
  scope: AgendaScope;
  label?: string;
  range?: DayRange;
  who?: string | 'self' | null;
};

function normalizeUtterance(utterance: string) {
  return utterance.trim().toLowerCase().replace(/[’']/g, "'");
}

function dayOffsetKey(days: number, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return localDayKey(d);
}

/** Re-export ranges used by tests. */
export {
  nextWeekDayRange,
  nextMonthDayRange,
  thisWeekDayRange,
  thisMonthDayRange,
  weekendDayRange,
} from '@/lib/chat/agendaRanges';

export function isCloseTalkIntent(utterance: string) {
  const t = normalizeUtterance(utterance);
  return (
    /^(exit|close|stop|quit|done|goodbye|bye|cancel)(\s+(talk|please|now))?\s*[.!]?$/.test(
      t
    ) || /^(exit|close|stop)\s+talk\s*[.!]?$/.test(t)
  );
}

function extractWhoFilter(
  utterance: string,
  people: { name: string; isSelf?: boolean }[] | undefined
): string | 'self' | null {
  const t = normalizeUtterance(utterance);
  if (/\bfor\s+(me|myself)\b/.test(t) || /\bmy\s+(own\s+)?(stuff|things|tasks?|dues?)\b/.test(t)) {
    return 'self';
  }
  const forName = t.match(/\bfor\s+([a-z][a-z'-]{1,24})\b/);
  if (forName) {
    const token = forName[1];
    const blocked = new Set([
      'me',
      'myself',
      'us',
      'today',
      'tomorrow',
      'next',
      'this',
      'the',
      'a',
      'an',
      'my',
      'our',
      'week',
      'month',
      'weekend',
      'coming',
      'following',
    ]);
    if (blocked.has(token)) return null;
    if (people?.length) {
      const hit = people.find((p) =>
        p.name.toLowerCase().split(/\s+/)[0]?.startsWith(token)
      );
      if (hit) return hit.name.split(/\s+/)[0] || hit.name;
    }
    return token.charAt(0).toUpperCase() + token.slice(1);
  }
  return null;
}

function matchesWho(
  who: string | undefined,
  filter: string | 'self' | null,
  people: { name: string; isSelf?: boolean }[] | undefined
): boolean {
  if (!filter) return true;
  if (filter === 'self') {
    if (!who?.trim()) return true;
    const self = people?.find((p) => p.isSelf);
    if (!self) return true;
    const first = self.name.split(/\s+/)[0]?.toLowerCase();
    return (
      who.toLowerCase().includes(self.name.toLowerCase()) ||
      (first ? who.toLowerCase().includes(first) : false)
    );
  }
  const f = filter.toLowerCase();
  return (who || '').toLowerCase().includes(f);
}

function filterWho<T extends { who?: string }>(
  items: T[],
  filter: string | 'self' | null,
  people: LocalIntentContext['people']
): T[] {
  if (!filter) return items;
  return items.filter((i) => matchesWho(i.who, filter, people));
}

/**
 * Parse agenda list questions. Returns null when utterance should create / go to model.
 */
export function parseAgendaQuery(utterance: string): AgendaPlan | null {
  const text = utterance.trim();
  if (!text) return null;
  if (looksLikeReminder(text) && !looksLikeReminderQuery(text)) return null;

  const t = normalizeUtterance(text);
  const who = extractWhoFilter(text, undefined);

  if (
    /\boverdue\b/i.test(t) ||
    /\bpast[\s-]?due\b/i.test(t) ||
    /\b(late|missed)\b.{0,20}\b(tasks?|reminders?|items?|docs?|documents?)\b/i.test(
      t
    )
  ) {
    return { scope: 'overdue', who };
  }

  if (
    /\b(finished|completed|done)\b.{0,24}\b(today)\b/i.test(t) ||
    /\bwhat\s+(did|have)\s+i\s+(finish|complete|do)\b/i.test(t) ||
    /\b(anything|what)\s+done\s+today\b/i.test(t)
  ) {
    return { scope: 'done', who };
  }

  if (
    /\b(renewals?|subscriptions?)\b.{0,24}\b(soon|coming|due|next)\b/i.test(t) ||
    /\bwhat\s+(renews|subscriptions?)\b/i.test(t) ||
    /\bsubscriptions?\s+(due|renewing)\b/i.test(t)
  ) {
    return { scope: 'renewals', who };
  }

  if (
    /\bcoming\s+up\b/i.test(t) ||
    /\bwhat'?s\s+(next|ahead)\b/i.test(t) ||
    /\bdue\s+soon\b/i.test(t)
  ) {
    // Prefer week/month if also present
    if (!/\b(this|next)\s+(week|month)\b/i.test(t) && !/\bweekend\b/i.test(t)) {
      return { scope: 'coming', who };
    }
  }

  if (/\bthis\s+week\b|\bcurrent\s+week\b/i.test(t)) {
    return { scope: 'this_week', who };
  }
  if (/\bnext\s+week\b|\bcoming\s+week\b|\bfollowing\s+week\b/i.test(t)) {
    return { scope: 'week', who };
  }
  if (/\bthis\s+month\b|\bcurrent\s+month\b/i.test(t)) {
    return { scope: 'this_month', who };
  }
  if (/\bnext\s+month\b|\bcoming\s+month\b|\bfollowing\s+month\b/i.test(t)) {
    return { scope: 'month', who };
  }
  if (/\b(this\s+|coming\s+|next\s+)?weekend\b/i.test(t)) {
    return { scope: 'weekend', who };
  }

  const inDays = t.match(/\bin\s+(\d{1,2})\s+days?\b/);
  if (inDays && /\b(due|left|to\s+do|reminders?|anything|what)\b/i.test(t)) {
    const n = Number(inDays[1]);
    return {
      scope: 'window',
      label: `Next ${n} day${n === 1 ? '' : 's'}`,
      range: nextNDaysRange(n),
      who,
    };
  }

  const byWd = t.match(
    /\b(?:by|before|until|through)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/
  );
  if (byWd && /\b(due|left|to\s+do|anything|what|need)\b/i.test(t)) {
    const range = throughWeekdayRange(byWd[1]);
    if (range) {
      return {
        scope: 'window',
        label: `Through ${byWd[1].charAt(0).toUpperCase()}${byWd[1].slice(1)}`,
        range,
        who,
      };
    }
  }

  if (looksLikeReminderQuery(text)) {
    if (/\btomorrow\b/i.test(t)) return { scope: 'tomorrow', who };
    if (/\btoday\b/i.test(t)) return { scope: 'today', who };
    return { scope: 'reminders', who };
  }

  const agendaCue =
    /\b(priorit(?:y|ies)|to-?dos?|todos?|agenda|schedule|deadlines?)\b/i.test(t) ||
    /\bwhat'?s\s+(in[\s-]?store|on|coming\s+up|due|up)\b/i.test(t) ||
    /\bwhat\s+(is|are)\s+(in[\s-]?store|on|due)\b/i.test(t) ||
    /\bwhat\s+(are|is)\s+my\s+(priorit|to-?do|todo|agenda|plan|day|deadline)/i.test(
      t
    ) ||
    /\b(show|list|see|open|view|check)\b.{0,28}\b(my\s+|our\s+)?(to-?dos?|todos?|priorit(?:y|ies)|agenda|habits?|classes?|reminders?)\b/i.test(
      t
    ) ||
    /\bwhat\s+do\s+i\s+(have|need)\s+(to\s+do\s+)?(for\s+)?/i.test(t) ||
    /\b(do\s+i|do\s+we)\s+have\s+(anything|something|any(thing)?)\b/i.test(t) ||
    /\banything\s+(to\s+do|due|left|on\s+(my\s+)?plate)\b/i.test(t) ||
    /\bwhat\s+(do|should)\s+i\s+(need\s+to\s+)?do\b/i.test(t) ||
    /\bwhat'?s\s+(due|left|remaining)\b/i.test(t) ||
    /\b(anything|what)\s+(due|left)\b/i.test(t) ||
    /\bwhat'?s\s+(my\s+)?(day|plan)\b/i.test(t) ||
    /\b(any|what|which)\b.{0,24}\b(habits?|classes?|reminders?)\b/i.test(t) ||
    /\b(habits?|classes?)\b.{0,32}\b(today|left|due|still|need|open)\b/i.test(t) ||
    /\bwhen'?s\s+(my\s+|our\s+)?next\s+class\b/i.test(t) ||
    /\bfor\s+[a-z][a-z'-]{1,24}\b/.test(t);

  if (!agendaCue) return null;
  if (/\btomorrow\b/i.test(t)) return { scope: 'tomorrow', who };
  if (
    /\btoday\b/i.test(t) ||
    /\bwhat'?s\s+up\b/i.test(t) ||
    /\bwhat'?s\s+(my\s+)?day\b/i.test(t) ||
    /\b(priorit(?:y|ies)|deadline|deadlines)\b/i.test(t) ||
    /\bto-?dos?\b/i.test(t) ||
    /\btodos?\b/i.test(t) ||
    /\bhabits?\b/i.test(t)
  ) {
    return { scope: 'today', who };
  }
  if (/\b(next\s+class|classes?)\b/i.test(t)) return { scope: 'upcoming', who };
  return { scope: 'upcoming', who };
}

/** @deprecated Prefer parseAgendaQuery */
export function agendaQueryScope(utterance: string): AgendaScope | null {
  return parseAgendaQuery(utterance)?.scope ?? null;
}

export function isAgendaQueryIntent(utterance: string) {
  return parseAgendaQuery(utterance) != null;
}

export function isReminderQueryIntent(utterance: string) {
  return looksLikeReminderQuery(utterance);
}

export function hrefForAgendaScope(scope: AgendaScope): string {
  if (
    scope === 'reminders' ||
    scope === 'tomorrow' ||
    scope === 'upcoming' ||
    scope === 'renewals'
  ) {
    return '/tasks';
  }
  return '/(tabs)/';
}

function remindDayKey(remindAt?: string | null) {
  if (!remindAt) return null;
  const m = String(remindAt).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** Today / Tomorrow, or "Oct 6". A later year keeps the year. */
function reminderWhenLabel(remindAt?: string | null): string {
  const day = remindDayKey(remindAt);
  if (!day) return '';
  const today = localDayKey();
  if (day === today) return 'Today';
  if (day === dayOffsetKey(1)) return 'Tomorrow';
  const formatted = formatDisplayDate(day);
  if (!formatted) return '';
  if (day.slice(0, 4) === today.slice(0, 4)) return formatted.replace(/, \d{4}$/, '');
  return formatted;
}

function reminderLine(r: { label: string; remindAt?: string | null }) {
  const when = reminderWhenLabel(r.remindAt);
  return when ? `${r.label} · ${when}` : r.label;
}

function agendaListReply(heading: string, lines: string[], more = ''): string {
  const body = more ? [...lines, more] : lines;
  return [heading, ...body].join('\n');
}

function extraNote(total: number, shown: number) {
  return total > shown ? `+${total - shown} more` : '';
}

function replyForHorizon(
  label: string,
  range: DayRange,
  horizon: HorizonItem[],
  who: AgendaPlan['who'],
  people: LocalIntentContext['people']
) {
  const whoFilter: string | 'self' | null = who ?? null;
  const inRange = filterWho(
    horizon.filter((h) => h.dayKey >= range.start && h.dayKey <= range.end),
    whoFilter,
    people
  );
  if (!inRange.length) {
    const forWho =
      whoFilter && whoFilter !== 'self'
        ? ` for ${whoFilter}`
        : whoFilter === 'self'
          ? ' for you'
          : '';
    return `Nothing due ${label.toLowerCase()}${forWho} yet.`;
  }
  const shown = 6;
  const lines = inRange
    .slice(0, shown)
    .map((h) => `${h.title} · ${shortDayLabel(h.dayKey)}`);
  const prefix =
    whoFilter && whoFilter !== 'self' ? `${label} for ${whoFilter}` : label;
  return agendaListReply(prefix, lines, extraNote(inRange.length, shown));
}

function replyForAgendaQuery(plan: AgendaPlan, ctx: LocalIntentContext) {
  const today = localDayKey();
  const tomorrow = dayOffsetKey(1);
  const who: string | 'self' | null = plan.who ?? null;
  const people = ctx.people;
  const reminders = filterWho(
    (ctx.reminders || []).map((r) => ({
      label: r.label,
      remindAt: r.remindAt,
      who: r.who,
    })),
    who,
    people
  );
  const overdue = filterWho(ctx.overdue || [], who, people);
  const horizon = filterWho(ctx.horizon || [], who, people);
  const coming = filterWho(ctx.coming || [], who, people);
  const doneToday = filterWho(ctx.doneToday || [], who, people);
  const renewals = filterWho(ctx.renewals || [], who, people);
  const openHabits = filterWho(ctx.openHabits || [], who, people);
  const classesToday = filterWho(ctx.classesToday || [], who, people);
  const nextClass = ctx.nextClass;

  const forDay = (day: string) =>
    reminders
      .filter((r) => remindDayKey(r.remindAt) === day)
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));

  const upcoming = reminders
    .filter((r) => {
      const day = remindDayKey(r.remindAt);
      return day != null && day >= today;
    })
    .sort((a, b) =>
      String(remindDayKey(a.remindAt)).localeCompare(String(remindDayKey(b.remindAt)))
    );

  const scope = plan.scope;

  if (scope === 'overdue') {
    if (!overdue.length) return 'Nothing overdue right now.';
    const shown = 6;
    const lines = overdue.slice(0, shown).map((r) => r.title);
    return agendaListReply('Overdue', lines, extraNote(overdue.length, shown));
  }

  if (scope === 'done') {
    if (!doneToday.length) return 'Nothing marked done today yet.';
    const shown = 6;
    const lines = doneToday.slice(0, shown).map((r) => r.title);
    return agendaListReply('Done today', lines, extraNote(doneToday.length, shown));
  }

  if (scope === 'renewals') {
    if (!renewals.length) return 'No subscription renewals coming up soon.';
    const shown = 6;
    const lines = renewals
      .slice(0, shown)
      .map((r) => `${r.title} · ${shortDayLabel(r.dayKey)}`);
    return agendaListReply('Renewals', lines, extraNote(renewals.length, shown));
  }

  if (scope === 'coming') {
    if (!coming.length && !nextClass) {
      return 'Nothing coming up soon. Overdue and today are clear of “due soon” items.';
    }
    const lines = coming.slice(0, 5).map((c) => c.title);
    if (nextClass) lines.unshift(`${nextClass.title} · ${nextClass.when}`);
    return agendaListReply(
      'Coming up',
      lines.slice(0, 6),
      extraNote(coming.length, 5)
    );
  }

  if (scope === 'this_week') {
    return replyForHorizon('This week', thisWeekDayRange(), horizon, who, people);
  }
  if (scope === 'week') {
    return replyForHorizon('Next week', nextWeekDayRange(), horizon, who, people);
  }
  if (scope === 'this_month') {
    return replyForHorizon('This month', thisMonthDayRange(), horizon, who, people);
  }
  if (scope === 'month') {
    return replyForHorizon('Next month', nextMonthDayRange(), horizon, who, people);
  }
  if (scope === 'weekend') {
    return replyForHorizon('This weekend', weekendDayRange(), horizon, who, people);
  }
  if (scope === 'window' && plan.range) {
    return replyForHorizon(
      plan.label || 'Upcoming',
      plan.range,
      horizon,
      who,
      people
    );
  }

  if (scope === 'today') {
    const due = forDay(today);
    const habitCap = 4;
    const classCap = 4;
    const dueCap = 5;
    const overdueCap = 4;
    const lines = [
      ...overdue.slice(0, overdueCap).map((r) => `${r.title} · Overdue`),
      ...classesToday.slice(0, classCap).map((c) => {
        const when = c.when?.trim();
        return when ? `${c.title} · ${when}` : `${c.title} · Class`;
      }),
      ...due.slice(0, dueCap).map((r) => `${r.label} · Reminder`),
      ...openHabits.slice(0, habitCap).map((h) => `${h.title} · Habit`),
    ];
    const hidden =
      Math.max(0, overdue.length - overdueCap) +
      Math.max(0, classesToday.length - classCap) +
      Math.max(0, due.length - dueCap) +
      Math.max(0, openHabits.length - habitCap);
    if (!lines.length) {
      return 'Nothing lined up for today. Say “remind me…” or check in a habit.';
    }
    return agendaListReply('Today', lines, hidden ? `+${hidden} more` : '');
  }

  if (scope === 'tomorrow') {
    const due = forDay(tomorrow);
    const also = horizon.filter((h) => h.dayKey === tomorrow);
    const labels = [
      ...due.map((r) => r.label),
      ...also.map((h) => h.title),
    ];
    const uniq = [...new Set(labels)];
    if (!uniq.length) {
      return 'Nothing set for tomorrow yet. Say “remind me tomorrow…” to add one.';
    }
    const shown = 5;
    return agendaListReply(
      'Tomorrow',
      uniq.slice(0, shown),
      extraNote(uniq.length, shown)
    );
  }

  if (scope === 'reminders' || scope === 'upcoming') {
    const classLine =
      scope === 'upcoming' && nextClass
        ? `${nextClass.title} · ${nextClass.when}`
        : null;
    if (classLine && !upcoming.length && !openHabits.length) {
      return `Next class: ${classLine}.`;
    }
    if (!upcoming.length && !classLine) {
      return scope === 'reminders'
        ? 'No upcoming reminders. Say “remind me…” to add one.'
        : 'Nothing coming up. Say “remind me…” or open Today.';
    }
    const lines = upcoming.slice(0, 6).map((r) => reminderLine(r));
    if (classLine) lines.unshift(classLine);
    const shown = lines.slice(0, 6);
    const more = upcoming.length > 6 ? `+${upcoming.length - 6} more` : '';
    return agendaListReply(scope === 'reminders' ? 'Reminders' : 'Coming up', shown, more);
  }

  return 'Here’s Today.';
}

function fuzzyIncludes(hay: string, needle: string) {
  const h = hay.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const n = needle.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!n || n.length < 2) return false;
  return h.includes(n) || n.split(/\s+/).every((w) => w.length < 2 || h.includes(w));
}

/** "the Mauritius reminder", not "my reminders" or "today's reminders". */
export function namedReminderSubject(utterance: string): string | null {
  const t = normalizeUtterance(utterance);
  if (!/\breminders?\b/.test(t)) return null;
  const about = t.match(
    /\breminders?\s+(?:for|about|on|called|named)\s+(?:the\s+|my\s+|our\s+)?(.+?)[.?!]?$/
  );
  const show = t.match(
    /\b(?:show|open|see|view|find|pull up)\b(?:\s+me)?\s+(?:the\s+|my\s+|our\s+)?(.+?)\s+reminders?\b/
  );
  const raw = (about?.[1] || show?.[1] || '')
    .replace(/^(?:the|my|our|a|an)\s+/, '')
    .trim();
  if (!raw || raw.length < 2) return null;
  if (/^(all|upcoming|next|every|any|the|my|our|today'?s?|tomorrow'?s?)$/.test(raw)) return null;
  return raw;
}

export function resolveNamedReminderIntent(
  utterance: string,
  ctx: LocalIntentContext
): ChatAgentResponse | null {
  const subject = namedReminderSubject(utterance);
  if (!subject) return null;
  const hits = (ctx.reminders || []).filter((r) => fuzzyIncludes(r.label, subject));
  if (!hits.length) {
    return {
      reply: `No reminder matches “${subject}”.`,
      actions: [{ type: 'none' }],
    };
  }
  if (hits.length === 1) {
    const hit = hits[0]!;
    const when = reminderWhenLabel(hit.remindAt);
    return {
      reply: when ? `${hit.label}: ${when}.` : `${hit.label}.`,
      actions: hit.id ? [{ type: 'open_last_done', id: hit.id }] : [{ type: 'none' }],
    };
  }
  return {
    reply: agendaListReply(
      'Reminders',
      hits.slice(0, 6).map((r) => reminderLine(r))
    ),
    actions: [{ type: 'none' }],
  };
}

/** Named item due / expiry, “when does Emirates ID expire?” */
export function resolveNamedDueIntent(
  utterance: string,
  ctx: LocalIntentContext
): ChatAgentResponse | null {
  const t = normalizeUtterance(utterance);
  if (!t) return null;

  let subject = '';
  const whenExp = t.match(
    /\bwhen(?:'s|s| is| does| do)?\s+(?:my\s+|the\s+)?(.+?)\s+(?:expire|renew|due)\b/
  );
  const isOver = t.match(
    /\bis\s+(?:my\s+|the\s+)?(.+?)\s+(?:overdue|expired|due)\b/
  );
  const whenDue = t.match(
    /\bwhen(?:'s|s| is)?\s+(?:my\s+|the\s+)?(.+?)\s+due\b/
  );
  if (whenExp) subject = whenExp[1].replace(/\b(my|the|our)\b/g, '').trim();
  else if (isOver) subject = isOver[1].replace(/\b(my|the|our)\b/g, '').trim();
  else if (whenDue) subject = whenDue[1].replace(/\b(my|the|our)\b/g, '').trim();
  if (!subject || subject.length < 2) return null;
  if (/^(it|this|that|something|anything)$/i.test(subject)) return null;

  const overdueHit = (ctx.overdue || []).find((o) =>
    fuzzyIncludes(o.title, subject)
  );
  if (overdueHit) {
    return {
      reply: `${overdueHit.title} is overdue.`,
      actions: [{ type: 'none' }],
    };
  }

  const horizonHit = (ctx.horizon || []).find((h) =>
    fuzzyIncludes(h.title, subject)
  );
  if (horizonHit) {
    return {
      reply: `${horizonHit.title} is due ${shortDayLabel(horizonHit.dayKey)}.`,
      actions: [{ type: 'none' }],
    };
  }

  const renewHit = (ctx.renewals || []).find((h) =>
    fuzzyIncludes(h.title, subject)
  );
  if (renewHit) {
    return {
      reply: `${renewHit.title} renews ${shortDayLabel(renewHit.dayKey)}.`,
      actions: [{ type: 'none' }],
    };
  }

  return {
    reply: `I don’t see a due date on file for “${subject}”.`,
    actions: [{ type: 'none' }],
  };
}

/** Habit check-in / streak questions. */
export function resolveHabitStatusIntent(
  utterance: string,
  ctx: LocalIntentContext
): ChatAgentResponse | null {
  const t = normalizeUtterance(utterance);
  const habits = ctx.habits || [];
  if (!habits.length) return null;

  const streakQ = /\b(streak|how(?:'s| is) my)\b.{0,24}\bhabit/.test(t);
  const didQ =
    /\b(did\s+i|have\s+i)\b.{0,40}\btoday\b/.test(t) ||
    /\b(did\s+i|have\s+i)\s+(do|check\s*in|finish)\b/.test(t);

  let subject = '';
  const m =
    t.match(/\b(?:did\s+i|have\s+i)\s+(?:already\s+)?(.+?)(?:\s+today)?\s*[?]?\s*$/) ||
    t.match(/\b(?:my\s+)?(.+?)\s+streak\b/) ||
    t.match(/\bhow(?:'s| is)\s+(?:my\s+)?(.+?)(?:\s+habit)?(?:\s+going)?\b/);
  if (m) subject = m[1].replace(/\b(my|the|a|an|do|done|finish|check in)\b/g, '').trim();

  const hit =
    (subject &&
      habits.find(
        (h) =>
          fuzzyIncludes(h.title, subject) || fuzzyIncludes(subject, h.title)
      )) ||
    (habits.length === 1 && (didQ || streakQ) ? habits[0] : null);

  if (!hit) {
    if (streakQ && habits.length) {
      const lines = habits
        .slice(0, 5)
        .map((h) => `${h.title}: ${h.streak}-day streak`);
      return {
        reply: `Habits: ${lines.join('; ')}.`,
        actions: [{ type: 'none' }],
      };
    }
    return null;
  }

  if (streakQ || /\bstreak\b/.test(t)) {
    return {
      reply: `${hit.title}: ${hit.streak}-day streak${hit.doneToday ? ', done today' : ', not checked in today'}.`,
      actions: [{ type: 'none' }],
    };
  }

  if (didQ || /\btoday\b/.test(t)) {
    return {
      reply: hit.doneToday
        ? `Yes, ${hit.title} is done today (${hit.streak}-day streak).`
        : `Not yet. ${hit.title} is still open today.`,
      actions: [{ type: 'none' }],
    };
  }

  return {
    reply: `${hit.title}: ${hit.doneToday ? 'done today' : 'still open'} · ${hit.streak}-day streak.`,
    actions: [{ type: 'none' }],
  };
}

export function isOpenItemIntent(utterance: string) {
  const t = normalizeUtterance(utterance);
  if (!t || isCloseTalkIntent(t)) return false;
  if (parseAgendaQuery(utterance)) return false;
  if (/^(show|open|see|view)(\s+me)?(\s+please)?\s*[.!?]?$/.test(t)) return true;
  if (/^(can you\s+)?(show|open|see|view)(\s+me)?(\s+please)?\s*[.!?]?$/.test(t)) {
    return true;
  }
  return (
    /\b(show|open|see|view)\b.{0,40}\b(item|it|expense|spend|purchase|habit|subscription|class|activity|reminder)\b/.test(
      t
    ) ||
    /\b(item|it)\s+(page|screen)\b/.test(t) ||
    /\bgo\s+to\s+(the\s+)?(item|it|expense|habit|subscription|class|activity)\b/.test(t) ||
    /\btake\s+me\s+to\s+(the\s+)?(item|it|expense|habit|subscription|class|activity)\b/.test(
      t
    ) ||
    /^(i\s+want\s+to\s+)?(see|open|show)\s+(me\s+)?(my\s+)?(last\s+|latest\s+|recent\s+)?(the\s+)?(item|it|expense|spend|purchase|habit|subscription|class|activity)\b/.test(
      t
    )
  );
}

/**
 * Clear UI commands that should not round-trip through the model.
 */
export function resolveLocalIntent(
  utterance: string,
  ctx: LocalIntentContext
): ChatAgentResponse | null {
  const text = utterance.trim();
  if (!text) return null;

  if (isCloseTalkIntent(text)) {
    return {
      reply: 'Closing Talk.',
      actions: [{ type: 'none' }],
    };
  }

  const habitStatus = resolveHabitStatusIntent(text, ctx);
  if (habitStatus) return habitStatus;

  const named = resolveNamedDueIntent(text, ctx);
  if (named) return named;

  const namedReminder = resolveNamedReminderIntent(text, ctx);
  if (namedReminder) return namedReminder;

  const agenda = parseAgendaQuery(text);
  if (agenda) {
    const who = extractWhoFilter(text, ctx.people) ?? agenda.who;
    return {
      reply: replyForAgendaQuery({ ...agenda, who }, ctx),
      actions: [{ type: 'none' }],
    };
  }

  if (isOpenItemIntent(text)) {
    const focus = ctx.talkFocus;
    if (focus) {
      return {
        reply: openingLineForFocus(focus),
        actions: [{ type: 'open_item', id: focus.kind === 'item' ? focus.id : '' }],
      };
    }
    if (ctx.focusExpenseId) {
      return {
        reply: 'Opening that expense.',
        actions: [{ type: 'open_item', id: '' }],
      };
    }
    const id = ctx.focusItemId || null;
    if (id) {
      return {
        reply: 'Opening that item.',
        actions: [{ type: 'open_item', id }],
      };
    }
    return {
      reply: 'Which one? Name it first.',
      actions: [{ type: 'none' }],
    };
  }

  return null;
}
