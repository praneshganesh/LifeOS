import type { ChatAgentResponse } from '@/lib/chat/types';

export type LocalIntentContext = {
  focusItemId?: string | null;
  /** Newest inventory item — used when focus wasn’t set but user clearly means “the item” */
  fallbackItemId?: string | null;
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
  return (
    /\b(show|open|see|view)\b.{0,40}\b(item|it)\b/.test(t) ||
    /\b(item|it)\s+(page|screen)\b/.test(t) ||
    /\bgo\s+to\s+(the\s+)?(item|it)\b/.test(t) ||
    /\btake\s+me\s+to\s+(the\s+)?(item|it)\b/.test(t) ||
    /^(i\s+want\s+to\s+)?(see|open|show)\s+(the\s+)?(item|it)\b/.test(t)
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
    const id = ctx.focusItemId || ctx.fallbackItemId || null;
    if (id) {
      return {
        reply: 'Opening that item.',
        actions: [{ type: 'open_item', id }],
      };
    }
    return {
      reply: 'Which item? Name it, or add one first.',
      actions: [{ type: 'none' }],
    };
  }

  return null;
}
