import type { ChatAgentResponse } from '@/lib/chat/types';
import { openingLineForFocus, type TalkFocus } from '@/lib/chat/focus';

export type LocalIntentContext = {
  focusItemId?: string | null;
  /** Newest inventory item — used when focus wasn’t set but user clearly means “the item” */
  fallbackItemId?: string | null;
  /** Last expense from Talk — vague “show me” prefers this over inventory */
  focusExpenseId?: string | null;
  /** Last module Talk touched — vague show uses this, never a stale MacBook. */
  talkFocus?: TalkFocus | null;
};

function normalizeUtterance(utterance: string) {
  return utterance.trim().toLowerCase().replace(/[’']/g, "'");
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

export function isOpenItemIntent(utterance: string) {
  const t = normalizeUtterance(utterance);
  if (!t || isCloseTalkIntent(t)) return false;
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
