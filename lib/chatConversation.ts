import { answerFor } from '@/lib/ask';
import type { InventoryItem } from '@/lib/InventoryContext';
import {
  draftToInventoryInput,
  parseAddIntent,
  type TalkAddDraft,
} from '@/lib/parseTalkIntent';

export type ChatPending =
  | { kind: 'idle' }
  | {
      kind: 'enrich';
      itemId: string;
      name: string;
      room: string;
      category: string;
      step: 'brand' | 'room';
    };

export type ChatAction =
  | { type: 'add'; draft: TalkAddDraft }
  | { type: 'patch'; id: string; patch: Partial<InventoryItem> }
  | { type: 'none' };

export type ChatResult = {
  reply: string;
  pending: ChatPending;
  action: ChatAction;
};

const SKIP = /^(skip|no|nope|nah|later|not\s+now|done|that'?s\s*(it|all)|n\/a|none|unknown|-)$/i;
const YES = /^(yes|yep|yeah|yup|sure|ok|okay|please|do\s+it|sounds?\s+good|correct|right)$/i;

function titleCase(s: string) {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function looksLikeBrand(text: string) {
  const t = text.trim();
  if (t.length < 2 || t.length > 40) return false;
  if (/\?$/.test(t)) return false;
  if (/^(where|what|when|how|why|who|which|do|does|is|are|can|will|i)\b/i.test(t)) {
    return false;
  }
  // Single/few words, not a full add sentence
  if (parseAddIntent(t)) return false;
  return /^[\w][\w\s&.'-]{0,38}$/.test(t);
}

function roomFromText(text: string): string | null {
  const lower = text.toLowerCase();
  const map: [RegExp, string][] = [
    [/\bkitchen\b/, 'Kitchen'],
    [/\bliving\b/, 'Living Room'],
    [/\bbedroom\b/, 'Bedroom'],
    [/\butility|laundry|garage|garden\b/, 'Utility'],
    [/\boffice|study\b/, 'Office'],
    [/\bbath(room)?\b/, 'Bathroom'],
    [/\bvehicle|car|garage\b/, 'Vehicles'],
  ];
  for (const [re, room] of map) {
    if (re.test(lower)) return room;
  }
  // "in the X" / bare room-ish phrase
  const m = text.match(/^(?:in\s+(?:the\s+|my\s+)?)?([a-z][a-z\s]{1,24})$/i);
  if (m && !SKIP.test(m[1]) && m[1].split(/\s+/).length <= 3) {
    return titleCase(m[1].trim());
  }
  return null;
}

function addAck(draft: TalkAddDraft) {
  const article = /^[aeiou]/i.test(draft.name) ? 'an' : 'a';
  const lines = [
    `Nice — I’ll keep track of ${article} ${draft.name}.`,
    `I’ve put it in ${draft.room} under ${draft.category}.`,
  ];
  if (draft.brand === 'Unknown') {
    lines.push('Do you know the brand, or should we leave that blank for now?');
  } else {
    lines.push('Want to move it to a different room, or are we good?');
  }
  return lines.join(' ');
}

function idlePending(): ChatPending {
  return { kind: 'idle' };
}

/**
 * Rule-based conversational turn for Chat — no cloud AI.
 * Keeps a light multi-turn thread after adds (brand / room).
 */
export function converse(params: {
  utterance: string;
  pending: ChatPending;
  inventoryNames: string[];
  /** Temporary id for a just-added item before caller persists */
  nextItemId?: string;
}): ChatResult {
  const text = params.utterance.trim();
  if (!text) {
    return {
      reply: 'I’m here — tell me what you got, or ask about something you own.',
      pending: params.pending,
      action: { type: 'none' },
    };
  }

  // --- Continue enriching a recent add ---
  if (params.pending.kind === 'enrich') {
    const p = params.pending;

    if (SKIP.test(text)) {
      return {
        reply:
          p.step === 'brand'
            ? `No problem — ${p.name} stays as-is in ${p.room}. Ask me anytime, or Capture a receipt when you have one.`
            : `All set. ${p.name} is in ${p.room}. What else is on your mind?`,
        pending: idlePending(),
        action: { type: 'none' },
      };
    }

    if (p.step === 'brand') {
      if (YES.test(text)) {
        return {
          reply: `What brand is the ${p.name}? (or say “skip”)`,
          pending: p,
          action: { type: 'none' },
        };
      }
      const room = roomFromText(text);
      if (room && !looksLikeBrand(text)) {
        return {
          reply: `Moved ${p.name} to ${room}. Brand still unknown — got one, or skip?`,
          pending: { ...p, room, step: 'brand' },
          action: { type: 'patch', id: p.itemId, patch: { room } },
        };
      }
      if (looksLikeBrand(text)) {
        const brand = titleCase(text);
        const name =
          p.name.toLowerCase().includes(brand.toLowerCase())
            ? p.name
            : `${brand} ${p.name.replace(new RegExp(`^${brand}\\s+`, 'i'), '')}`.trim();
        return {
          reply: `Got it — ${brand}. I’ve updated ${name} in ${p.room}. Want a different room, or shall we leave it?`,
          pending: { ...p, name, step: 'room' },
          action: {
            type: 'patch',
            id: p.itemId,
            patch: { brand, name, insight: `Added via Chat · ${brand}` },
          },
        };
      }
      // New add mid-thread
      const draft = parseAddIntent(text);
      if (draft) {
        return startAdd(draft, params.inventoryNames);
      }
      return {
        reply: `Still on ${p.name} — send a brand name, or say “skip” and we can move on.`,
        pending: p,
        action: { type: 'none' },
      };
    }

    if (p.step === 'room') {
      if (YES.test(text) || SKIP.test(text)) {
        return {
          reply: `Perfect. ${p.name} lives in ${p.room}. If you have a receipt, Capture will attach it later. Anything else?`,
          pending: idlePending(),
          action: { type: 'none' },
        };
      }
      const room = roomFromText(text);
      if (room) {
        return {
          reply: `Updated — ${p.name} is now in ${room}. You’re all set. What else can I help with?`,
          pending: idlePending(),
          action: { type: 'patch', id: p.itemId, patch: { room } },
        };
      }
      const draft = parseAddIntent(text);
      if (draft) {
        return startAdd(draft, params.inventoryNames);
      }
      return {
        reply: answerFor(text, params.inventoryNames),
        pending: idlePending(),
        action: { type: 'none' },
      };
    }
  }

  // --- Fresh turn ---
  const draft = parseAddIntent(text);
  if (draft) {
    return startAdd(draft, params.inventoryNames);
  }

  return {
    reply: answerFor(text, params.inventoryNames),
    pending: idlePending(),
    action: { type: 'none' },
  };
}

function startAdd(draft: TalkAddDraft, _inventoryNames: string[]): ChatResult {
  // Caller assigns real id after addItem; we use a placeholder the Chat screen replaces.
  return {
    reply: addAck(draft),
    pending: {
      kind: 'enrich',
      itemId: '__pending__',
      name: draft.name,
      room: draft.room,
      category: draft.category,
      step: draft.brand === 'Unknown' ? 'brand' : 'room',
    },
    action: { type: 'add', draft },
  };
}

export function bindPendingItemId(pending: ChatPending, itemId: string): ChatPending {
  if (pending.kind !== 'enrich' || pending.itemId !== '__pending__') return pending;
  return { ...pending, itemId };
}
