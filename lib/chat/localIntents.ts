import type { ChatAgentResponse } from '@/lib/chat/types';
import { openingLineForFocus, type TalkFocus } from '@/lib/chat/focus';
import {
  formatDisplayDate,
  looksLikeReminder,
  looksLikeReminderQuery,
  localDayKey,
} from '@/lib/dates';

export type AgendaScope = 'today' | 'tomorrow' | 'upcoming' | 'reminders';

export type LocalIntentContext = {
  focusItemId?: string | null;
  /** Newest inventory item — used when focus wasn’t set but user clearly means “the item” */
  fallbackItemId?: string | null;
  /** Last expense from Talk — vague “show me” prefers this over inventory */
  focusExpenseId?: string | null;
  /** Last module Talk touched — vague show uses this, never a stale MacBook. */
  talkFocus?: TalkFocus | null;
  /** Upcoming activities with remindAt — for agenda / reminder questions. */
  reminders?: { label: string; remindAt?: string | null }[];
  /** Open habits for today (not yet checked in). */
  openHabits?: { title: string }[];
};

function normalizeUtterance(utterance: string) {
  return utterance.trim().toLowerCase().replace(/[’']/g, "'");
}

function dayOffsetKey(days: number, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return localDayKey(d);
}

/** True when local intent means dismiss the Talk overlay. */
export function isCloseTalkIntent(utterance: string) {
  const t = normalizeUtterance(utterance);
  return (
    /^(exit|close|stop|quit|done|goodbye|bye|cancel)(\s+(talk|please|now))?\s*[.!]?$/.test(
      t
    ) || /^(exit|close|stop)\s+talk\s*[.!]?$/.test(t)
  );
}

/**
 * List / agenda questions — never create a reminder.
 * Returns scope so Talk can open Today vs Activities.
 */
export function agendaQueryScope(utterance: string): AgendaScope | null {
  const text = utterance.trim();
  if (!text) return null;
  // Create phrasing wins only when it's clearly a create (not a query).
  if (looksLikeReminder(text) && !looksLikeReminderQuery(text)) return null;

  const t = normalizeUtterance(text);

  if (looksLikeReminderQuery(text)) {
    if (/\btomorrow\b/i.test(t)) return 'tomorrow';
    if (/\btoday\b/i.test(t)) return 'today';
    return 'reminders';
  }

  const agendaCue =
    /\b(priorit(?:y|ies)|to-?dos?|todos?|agenda|schedule)\b/i.test(t) ||
    /\bwhat'?s\s+(in[\s-]?store|on|coming\s+up)\b/i.test(t) ||
    /\bwhat\s+(is|are)\s+(in[\s-]?store|on)\b/i.test(t) ||
    /\bwhat\s+(are|is)\s+my\s+(priorit|to-?do|todo|agenda|plan|day)/i.test(t) ||
    /\b(show|list|see|open|view|check)\b.{0,28}\b(my\s+|our\s+)?(to-?dos?|todos?|priorit(?:y|ies)|agenda)\b/i.test(
      t
    ) ||
    /\bwhat\s+do\s+i\s+have\s+(for\s+)?(today|tomorrow)\b/i.test(t) ||
    /\bwhat'?s\s+(my\s+)?(day|plan)\b/i.test(t);

  if (!agendaCue) return null;
  if (/\btomorrow\b/i.test(t)) return 'tomorrow';
  if (
    /\btoday\b/i.test(t) ||
    /\bpriorit(?:y|ies)\b/i.test(t) ||
    /\bto-?dos?\b/i.test(t) ||
    /\btodos?\b/i.test(t)
  ) {
    return 'today';
  }
  return 'upcoming';
}

export function isAgendaQueryIntent(utterance: string) {
  return agendaQueryScope(utterance) != null;
}

/** @deprecated Prefer isAgendaQueryIntent / agendaQueryScope */
export function isReminderQueryIntent(utterance: string) {
  return looksLikeReminderQuery(utterance);
}

export function hrefForAgendaScope(scope: AgendaScope): string {
  return scope === 'reminders' ? '/(tabs)/done' : '/(tabs)/';
}

function replyForAgendaQuery(scope: AgendaScope, ctx: LocalIntentContext) {
  const today = localDayKey();
  const tomorrow = dayOffsetKey(1);
  const reminders = ctx.reminders || [];
  const openHabits = ctx.openHabits || [];

  const forDay = (day: string) =>
    reminders
      .filter((r) => r.remindAt === day)
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));

  const upcoming = reminders
    .filter((r) => r.remindAt && r.remindAt >= today)
    .sort((a, b) => String(a.remindAt).localeCompare(String(b.remindAt)));

  if (scope === 'today') {
    const due = forDay(today);
    const parts: string[] = [];
    if (openHabits.length) {
      parts.push(
        `Habits: ${openHabits
          .slice(0, 4)
          .map((h) => h.title)
          .join(', ')}${openHabits.length > 4 ? '…' : ''}`
      );
    }
    if (due.length) {
      parts.push(
        `Reminders: ${due
          .slice(0, 5)
          .map((r) => r.label)
          .join(', ')}${due.length > 5 ? '…' : ''}`
      );
    }
    if (!parts.length) {
      return 'Nothing lined up for today. Say “remind me…” or check in a habit.';
    }
    return `Today — ${parts.join('. ')}.`;
  }

  if (scope === 'tomorrow') {
    const due = forDay(tomorrow);
    if (!due.length) {
      return 'Nothing set for tomorrow yet. Say “remind me tomorrow…” to add one.';
    }
    const lines = due.slice(0, 5).map((r) => r.label);
    const more = due.length > 5 ? ` (+${due.length - 5} more)` : '';
    return `Tomorrow — ${lines.join('; ')}${more}.`;
  }

  if (scope === 'reminders' || scope === 'upcoming') {
    if (!upcoming.length) {
      return scope === 'reminders'
        ? 'No upcoming reminders. Say “remind me…” to add one.'
        : 'Nothing coming up. Say “remind me…” or open Today.';
    }
    const lines = upcoming.slice(0, 5).map((r) => {
      const when = formatDisplayDate(r.remindAt) || r.remindAt;
      return `${r.label} · ${when}`;
    });
    const more =
      upcoming.length > 5 ? ` (+${upcoming.length - 5} more)` : '';
    return `Here’s what you’ve got: ${lines.join('; ')}${more}.`;
  }

  return 'Here’s Today.';
}

export function isOpenItemIntent(utterance: string) {
  const t = normalizeUtterance(utterance);
  if (!t || isCloseTalkIntent(t)) return false;
  // Agenda / reminder list questions are handled separately.
  if (agendaQueryScope(utterance)) return false;
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
 * Inventory Q&A and fuzzy adds still go to the agent.
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

  const agenda = agendaQueryScope(text);
  if (agenda) {
    return {
      reply: replyForAgendaQuery(agenda, ctx),
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
