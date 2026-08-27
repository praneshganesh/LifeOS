import { localDayKey } from '@/lib/dates';
import type { Icon3DName } from '@/components/ui/Icon3D';
import type { InventoryItem } from '@/lib/InventoryContext';

export type TalkAddDraft = {
  name: string;
  brand: string;
  category: string;
  room: string;
  spaceId: string;
  icon: Icon3DName;
  isDocument: boolean;
  insight: string;
};

type Rule = {
  test: RegExp;
  category: string;
  spaceId: string;
  room: string;
  icon: Icon3DName;
  isDocument?: boolean;
};

/** Keyword → category map. Free, on-device, no API. */
const RULES: Rule[] = [
  { test: /\b(passport|visa|emirates\s*id|eid|licence|license|title\s*deed|will)\b/i, category: 'Documents', spaceId: 's5', room: 'Personal Documents', icon: 'document', isDocument: true },
  { test: /\b(insurance|policy|premium|claim)\b/i, category: 'Insurance', spaceId: 's5', room: 'Insurance', icon: 'shield', isDocument: true },
  { test: /\b(warranty|guarantee)\b/i, category: 'Warranty', spaceId: 's1', room: 'Warranties', icon: 'receipt', isDocument: true },
  { test: /\b(car|vehicle|prado|tyre|tire|toyota|bmw|registration)\b/i, category: 'Vehicle', spaceId: 's4', room: 'Vehicles', icon: 'car' },
  { test: /\b(netflix|spotify|subscription|icloud|adobe|gym\s*membership)\b/i, category: 'Subscription', spaceId: 's1', room: 'Subscriptions', icon: 'credit' },
  { test: /\b(receipt|purchase|bought|amazon|invoice)\b/i, category: 'Purchase', spaceId: 's1', room: 'Inbox', icon: 'receipt' },
  { test: /\b(dog|cat|pet|bruno|vaccination|child|kid|family)\b/i, category: 'Family', spaceId: 's6', room: 'Family', icon: 'family' },
  { test: /\b(coffee|espresso|barista)\b/i, category: 'Appliances', spaceId: 's1', room: 'Kitchen', icon: 'coffee' },
  { test: /\b(fridge|refrigerator|dishwasher|microwave|oven)\b/i, category: 'Appliances', spaceId: 's1', room: 'Kitchen', icon: 'fridge' },
  { test: /\b(tv|television|soundbar|sofa|couch|lamp)\b/i, category: 'Electronics', spaceId: 's1', room: 'Living Room', icon: 'tv' },
  { test: /\b(ac|air\s*conditioner|purifier|bed|mattress)\b/i, category: 'Home', spaceId: 's1', room: 'Bedroom', icon: 'ac' },
  { test: /\b(washer|washing\s*machine|vacuum|drill)\b/i, category: 'Home', spaceId: 's1', room: 'Utility', icon: 'washing' },
  { test: /\b(laptop|macbook|iphone|phone|headphones|watch)\b/i, category: 'Electronics', spaceId: 's1', room: 'Personal', icon: 'laptop' },
];

const ROOM_HINTS: { test: RegExp; room: string }[] = [
  { test: /\bkitchen\b/i, room: 'Kitchen' },
  { test: /\bliving\b/i, room: 'Living Room' },
  { test: /\bbedroom\b/i, room: 'Bedroom' },
  { test: /\bgarden|garage|utility\b/i, room: 'Utility' },
  { test: /\bvehicle|car\b/i, room: 'Vehicles' },
];

const ADD_PATTERNS = [
  /^(?:please\s+)?(?:add|create|log|remember|track|save)\s+(?:a|an|my|the)?\s*(.+)$/i,
  /^(?:i\s+)?(?:just\s+)?(?:bought|got|purchased)\s+(?:a|an|my|the)?\s*(.+)$/i,
  /^(?:new)\s+(.+)$/i,
  /^put\s+(?:a|an|my|the)?\s*(.+?)\s+in\s+(?:my\s+)?(?:lifeos|things|inventory)$/i,
];

function titleCase(s: string) {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function stripLocation(raw: string): { name: string; location?: string } {
  const m = raw.match(
    /^(.+?)\s+(?:to|in|under|for)\s+(?:the\s+|my\s+)?(.+)$/i
  );
  if (m) return { name: m[1].trim(), location: m[2].trim() };
  return { name: raw.trim() };
}

function classify(text: string): Omit<TalkAddDraft, 'name' | 'brand' | 'insight'> {
  for (const rule of RULES) {
    if (rule.test.test(text)) {
      return {
        category: rule.category,
        spaceId: rule.spaceId,
        room: rule.room,
        icon: rule.icon,
        isDocument: Boolean(rule.isDocument),
      };
    }
  }
  return {
    category: 'Home',
    spaceId: 's1',
    room: 'Inbox',
    icon: 'package',
    isDocument: false,
  };
}

/**
 * Parse “add …” / “I bought …” utterances into an inventory draft.
 * Pure rules — $0 operating cost, no cloud AI.
 */
export function parseAddIntent(utterance: string): TalkAddDraft | null {
  const cleaned = utterance.trim().replace(/[?.!]+$/g, '');
  if (!cleaned) return null;

  let rest: string | null = null;
  for (const pattern of ADD_PATTERNS) {
    const m = cleaned.match(pattern);
    if (m?.[1]) {
      rest = m[1].trim();
      break;
    }
  }
  if (!rest) return null;

  const { name: rawName, location } = stripLocation(rest);
  if (!rawName || rawName.length < 2) return null;

  // Ignore pure questions that slipped through
  if (/^(where|what|when|how|why|do|does|is|are)\b/i.test(cleaned)) return null;

  const blob = `${rawName} ${location || ''}`;
  const base = classify(blob);
  let room = base.room;
  if (location) {
    const hint = ROOM_HINTS.find((h) => h.test.test(location));
    room = hint?.room || titleCase(location);
  } else {
    const hint = ROOM_HINTS.find((h) => h.test.test(rawName));
    if (hint) room = hint.room;
  }

  const name = titleCase(rawName.replace(/\s+/g, ' '));

  return {
    name,
    brand: 'Unknown',
    category: base.category,
    room,
    spaceId: base.spaceId,
    icon: base.icon,
    isDocument: base.isDocument,
    insight: `Added by Talk · categorized as ${base.category}.`,
  };
}

export function draftToInventoryInput(draft: TalkAddDraft): Omit<InventoryItem, 'id' | 'createdAt'> {
  const today = localDayKey();
  const label = new Date().toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return {
    name: draft.name,
    brand: draft.brand,
    category: draft.category,
    room: draft.room,
    spaceId: draft.spaceId,
    icon: draft.icon,
    purchaseDate: today,
    price: '—',
    warrantyExpiry: '—',
    warrantyActive: false,
    condition: '—',
    serial: '—',
    estimatedValue: '—',
    insight: draft.insight,
    timeline: [{ date: label, event: 'Added via Talk' }],
    isDocument: draft.isDocument,
    ocrOnDevice: false,
    source: 'talk',
  };
}

export function describeAdd(draft: TalkAddDraft) {
  return `Added “${draft.name}” to ${draft.room} as ${draft.category}.`;
}
