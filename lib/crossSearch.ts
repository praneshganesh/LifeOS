import type { Icon3DName } from '@/components/ui/Icon3D';
import type { InventoryItem } from '@/lib/InventoryContext';
import type { Expense } from '@/lib/expenses';
import { formatAmount, labelForCategory } from '@/lib/expenses';
import type { Habit } from '@/lib/habits';
import { HABIT_CATEGORIES } from '@/lib/habits';
import type { ClassPack } from '@/lib/classes';
import { remainingCount, usedCount } from '@/lib/classes';
import type { HouseholdMember } from '@/lib/household';
import type { ManagedSpace } from '@/lib/SpacesContext';
import type { Subscription } from '@/lib/subscriptions';
import {
  formatAmount as formatSubAmount,
  iconForSubscriptionCategory,
  labelForCycle,
} from '@/lib/subscriptions';
import type { LastDoneItem } from '@/lib/lastDone';

export type SearchHitKind =
  | 'thing'
  | 'space'
  | 'document'
  | 'expense'
  | 'habit'
  | 'class'
  | 'person'
  | 'subscription'
  | 'maintenance';

export type SearchHit = {
  kind: SearchHitKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  icon: Icon3DName;
};

function anyMatch(q: string, fields: (string | undefined | null)[]): boolean {
  return fields.some((f) => Boolean(f && f.toLowerCase().includes(q)));
}

function isDoc(item: InventoryItem): boolean {
  return (
    Boolean(item.isDocument) ||
    item.category === 'Documents' ||
    item.category === 'Document'
  );
}

export type CrossSearchInput = {
  query: string;
  inventory: InventoryItem[];
  spaces: ManagedSpace[];
  spaceNameById: Record<string, string>;
  expenses: Expense[];
  habits: Habit[];
  classPacks?: ClassPack[];
  people: HouseholdMember[];
  subscriptions?: Subscription[];
  lastDone?: LastDoneItem[];
};

export type CrossSearchResult = {
  things: SearchHit[];
  spaces: SearchHit[];
  documents: SearchHit[];
  expenses: SearchHit[];
  habits: SearchHit[];
  classes: SearchHit[];
  people: SearchHit[];
  subscriptions: SearchHit[];
  maintenance: SearchHit[];
  total: number;
  chips: string[];
};

/** Local substring search across LifeOS stores — no LLM. */
export function crossSearch(input: CrossSearchInput): CrossSearchResult {
  const q = input.query.trim().toLowerCase();
  const chips = suggestChips(input);
  const empty: CrossSearchResult = {
    things: [],
    spaces: [],
    documents: [],
    expenses: [],
    habits: [],
    classes: [],
    people: [],
    subscriptions: [],
    maintenance: [],
    total: 0,
    chips,
  };
  if (!q) return empty;

  const things: SearchHit[] = [];
  const documents: SearchHit[] = [];

  for (const a of input.inventory) {
    const hit = anyMatch(q, [
      a.name,
      a.brand,
      a.category,
      a.room,
      input.spaceNameById[a.spaceId],
      a.serial,
      a.purchasedFrom,
      a.price,
      a.fullName,
      a.documentNumber,
      a.nationality,
      a.ocrText,
    ]);
    if (!hit) continue;
    const row: SearchHit = {
      kind: isDoc(a) ? 'document' : 'thing',
      id: a.id,
      title: a.name,
      subtitle: [
        a.brand !== 'Unknown' ? a.brand : null,
        a.room,
        input.spaceNameById[a.spaceId],
      ]
        .filter(Boolean)
        .join(' · '),
      href: `/asset/${a.id}`,
      icon: a.icon,
    };
    if (isDoc(a)) documents.push(row);
    else things.push(row);
  }

  const spaces: SearchHit[] = input.spaces
    .filter((s) => anyMatch(q, [s.name, s.meta]))
    .map((s) => ({
      kind: 'space' as const,
      id: s.id,
      title: s.name,
      subtitle: s.meta,
      href: `/space/${s.id}`,
      icon: s.icon,
    }));

  const expenses: SearchHit[] = input.expenses
    .filter((e) =>
      anyMatch(q, [e.title, e.merchant, e.note, e.category, String(e.amount)])
    )
    .map((e) => ({
      kind: 'expense' as const,
      id: e.id,
      title: e.title,
      subtitle: [formatAmount(e.amount, e.currency), labelForCategory(e.category), e.merchant]
        .filter(Boolean)
        .join(' · '),
      href: `/expenses/${e.id}`,
      icon: 'wallet' as Icon3DName,
    }));

  const habits: SearchHit[] = input.habits
    .filter((h) =>
      anyMatch(q, [h.title, h.why, HABIT_CATEGORIES[h.categoryId]?.name])
    )
    .map((h) => ({
      kind: 'habit' as const,
      id: h.id,
      title: h.title,
      subtitle: HABIT_CATEGORIES[h.categoryId]?.name ?? 'Habit',
      href: `/habits/${h.id}`,
      icon: 'check' as Icon3DName,
    }));

  const classes: SearchHit[] = (input.classPacks || [])
    .filter((p) => anyMatch(q, [p.title, p.assignedTo, p.notes]))
    .map((p) => ({
      kind: 'class' as const,
      id: p.id,
      title: p.title,
      subtitle: [
        p.assignedTo,
        `${remainingCount(p) == null ? `${usedCount(p)} logged` : `${remainingCount(p)} of ${p.total} left`}`,
      ]
        .filter(Boolean)
        .join(' · '),
      href: `/classes/${p.id}`,
      icon: 'today' as Icon3DName,
    }));

  const people: SearchHit[] = input.people
    .filter((p) => anyMatch(q, [p.name, p.relation, p.role, p.medicalNotes]))
    .map((p) => ({
      kind: 'person' as const,
      id: p.id,
      title: p.name,
      subtitle: [p.relation, p.role].filter(Boolean).join(' · '),
      href: `/family/${p.id}`,
      icon: p.icon,
    }));

  const subscriptions: SearchHit[] = (input.subscriptions || [])
    .filter((s) => anyMatch(q, [s.title, s.provider, s.category, s.note]))
    .map((s) => ({
      kind: 'subscription' as const,
      id: s.id,
      title: s.title,
      subtitle: [
        s.provider,
        formatSubAmount(s.amount, s.currency),
        labelForCycle(s.cycle),
      ]
        .filter(Boolean)
        .join(' · '),
      href: `/subscriptions/${s.id}`,
      icon: iconForSubscriptionCategory(s.category),
    }));

  const maintenance: SearchHit[] = (input.lastDone || [])
    .filter((m) => anyMatch(q, [m.label]))
    .map((m) => ({
      kind: 'maintenance' as const,
      id: m.id,
      title: m.label,
      subtitle: m.inventoryItemId
        ? input.inventory.find((i) => i.id === m.inventoryItemId)?.name || 'Last Done'
        : 'Last Done',
      href: m.inventoryItemId
        ? `/asset/${m.inventoryItemId}`
        : `/last-done/${m.id}`,
      icon: 'tools' as Icon3DName,
    }));

  const total =
    things.length +
    spaces.length +
    documents.length +
    expenses.length +
    habits.length +
    classes.length +
    people.length +
    subscriptions.length +
    maintenance.length;

  return {
    things,
    spaces,
    documents,
    expenses,
    habits,
    classes,
    people,
    subscriptions,
    maintenance,
    total,
    chips,
  };
}

function suggestChips(input: CrossSearchInput): string[] {
  const chips: string[] = [];
  for (const s of input.spaces.slice(0, 2)) chips.push(s.name);
  for (const i of input.inventory) {
    if (isDoc(i) && chips.length < 6) {
      const word = i.name.split(/\s+/)[0];
      if (word) chips.push(word);
    }
  }
  if (input.expenses[0]) {
    const word = input.expenses[0].title.split(/\s+/)[0];
    if (word) chips.push(word);
  }
  if (input.habits[0]) chips.push(input.habits[0].title);
  if (input.classPacks?.[0]) chips.push(input.classPacks[0].title);
  if (input.people[0]) {
    const word = input.people[0].name.split(/\s+/)[0];
    if (word) chips.push(word);
  }
  const uniq = [...new Set(chips.filter(Boolean))];
  return uniq.length ? uniq.slice(0, 6) : ['Passport', 'Kitchen', 'Expense', 'Habit'];
}
