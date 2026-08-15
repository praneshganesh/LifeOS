import { colors } from '@/constants/theme';
import { localDayKey } from '@/lib/dates';

export type HabitCategoryId =
  | 'health'
  | 'focus'
  | 'home'
  | 'money'
  | 'mind'
  | 'other';

export type HabitCategory = {
  id: HabitCategoryId;
  name: string;
  emoji: string;
  color: string;
  soft: string;
};

export const HABIT_CATEGORIES: Record<HabitCategoryId, HabitCategory> = {
  health: {
    id: 'health',
    name: 'Health',
    emoji: '💪',
    color: '#D1433B',
    soft: 'rgba(209, 67, 59, 0.12)',
  },
  focus: {
    id: 'focus',
    name: 'Focus',
    emoji: '🎯',
    color: colors.sky,
    soft: colors.skySoft,
  },
  home: {
    id: 'home',
    name: 'Home',
    emoji: '🏠',
    color: colors.forestBright,
    soft: colors.forestSoft,
  },
  money: {
    id: 'money',
    name: 'Money',
    emoji: '💰',
    color: colors.amber,
    soft: colors.amberSoft,
  },
  mind: {
    id: 'mind',
    name: 'Mind',
    emoji: '🧘',
    color: colors.violet,
    soft: colors.violetSoft,
  },
  other: {
    id: 'other',
    name: 'Other',
    emoji: '✨',
    color: colors.slate,
    soft: colors.surfaceSoft,
  },
};

export type HabitLog = {
  id: string;
  /** YYYY-MM-DD */
  doneAt: string;
};

export type Habit = {
  id: string;
  title: string;
  why?: string;
  categoryId: HabitCategoryId;
  logs: HabitLog[];
  /** Optional link to a Thing — check-in can also log Last Done on that item. */
  inventoryItemId?: string;
  /** When true (default if linked), check-in appends a Last Done log for the linked Thing. */
  syncLastDone?: boolean;
  createdAt: string;
};

export type NewHabitInput = {
  title: string;
  why?: string;
  categoryId?: HabitCategoryId;
  inventoryItemId?: string;
  syncLastDone?: boolean;
  id?: string;
};

/** Soft keyword grouping — users never pick a category. */
export function categorizeHabit(title: string, why?: string): HabitCategory {
  const l = `${title} ${why || ''}`.toLowerCase();
  if (
    /walk|run|gym|workout|exercise|yoga|swim|bike|steps|vitamin|sleep|water|health|meditat/.test(
      l
    )
  ) {
    return HABIT_CATEGORIES.health;
  }
  if (/read|write|study|learn|code|focus|deep work|journal|language/.test(l)) {
    return HABIT_CATEGORIES.focus;
  }
  if (/clean|tidy|laundry|cook|home|garden|declutter|dish/.test(l)) {
    return HABIT_CATEGORIES.home;
  }
  if (/save|budget|spend|money|invest|no.?spend|finance/.test(l)) {
    return HABIT_CATEGORIES.money;
  }
  if (/meditat|breath|pray|gratitude|mindful|calm|journal/.test(l)) {
    return HABIT_CATEGORIES.mind;
  }
  return HABIT_CATEGORIES.other;
}

export function dayKey(d = new Date()): string {
  return localDayKey(d);
}

export function createHabit(input: NewHabitInput): Habit {
  const title = input.title.trim();
  const why = input.why?.trim() || undefined;
  const cat = input.categoryId
    ? HABIT_CATEGORIES[input.categoryId]
    : categorizeHabit(title, why);
  return {
    id: input.id ?? `hab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    why,
    categoryId: cat.id,
    logs: [],
    inventoryItemId: input.inventoryItemId,
    syncLastDone:
      input.syncLastDone ?? (input.inventoryItemId ? true : undefined),
    createdAt: new Date().toISOString(),
  };
}

export function normalizeHabit(raw: unknown): Habit | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<Habit>;
  if (!o.id || !o.title) return null;
  const logs = Array.isArray(o.logs)
    ? o.logs
        .filter((l): l is HabitLog => Boolean(l?.id && l?.doneAt))
        .map((l) => ({
          id: String(l.id),
          doneAt: String(l.doneAt).slice(0, 10),
        }))
    : [];
  const cat = categorizeHabit(o.title, o.why);
  return {
    id: o.id,
    title: String(o.title),
    why: o.why,
    categoryId:
      o.categoryId && o.categoryId in HABIT_CATEGORIES ? o.categoryId : cat.id,
    logs,
    inventoryItemId: o.inventoryItemId,
    syncLastDone:
      typeof o.syncLastDone === 'boolean'
        ? o.syncLastDone
        : o.inventoryItemId
          ? true
          : undefined,
    createdAt: o.createdAt || new Date().toISOString(),
  };
}

export function loggedOn(habit: Habit, date = dayKey()): boolean {
  return habit.logs.some((l) => l.doneAt === date);
}

export function completionRate(habit: Habit, days = 30): number {
  if (days <= 0) return 0;
  const today = new Date();
  const set = new Set(habit.logs.map((l) => l.doneAt));
  let hit = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (set.has(dayKey(d))) hit += 1;
  }
  return Math.round((hit / days) * 100);
}

/** Consecutive days ending today (or yesterday if not yet today). */
export function currentStreak(habit: Habit): number {
  const set = new Set(habit.logs.map((l) => l.doneAt));
  let streak = 0;
  const cursor = new Date();
  // If today isn't logged, start from yesterday so evening check-ins aren't required
  if (!set.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (set.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function toggleLogForDay(habit: Habit, date = dayKey()): Habit {
  const existing = habit.logs.find((l) => l.doneAt === date);
  if (existing) {
    return { ...habit, logs: habit.logs.filter((l) => l.id !== existing.id) };
  }
  return {
    ...habit,
    logs: [
      {
        id: `hl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        doneAt: date,
      },
      ...habit.logs,
    ],
  };
}

export function groupHabitsByCategory(habits: Habit[]): Array<{
  category: HabitCategory;
  habits: Habit[];
}> {
  const order: HabitCategoryId[] = [
    'health',
    'focus',
    'home',
    'money',
    'mind',
    'other',
  ];
  return order
    .map((id) => ({
      category: HABIT_CATEGORIES[id],
      habits: habits.filter((h) => h.categoryId === id),
    }))
    .filter((g) => g.habits.length > 0);
}

/** Whether this check-in should also write a Last Done log. */
export function shouldSyncLastDone(habit: Habit): boolean {
  return Boolean(habit.inventoryItemId) && habit.syncLastDone !== false;
}

export function habitsForInventoryItem(
  habits: Habit[],
  inventoryItemId: string
): Habit[] {
  return habits.filter((h) => h.inventoryItemId === inventoryItemId);
}

/**
 * Canonical key so "Walk", "Walked", "walking" map to one habit.
 * Used by Talk check-in + dedupe.
 */
export function normalizeHabitKey(title: string): string {
  let s = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';

  // Drop leading filler from spoken check-ins
  s = s.replace(/^(i |i've |im |i am |did |done |finished |completed )+/i, '').trim();

  const stems: [RegExp, string][] = [
    [/\b(walked|walking|walks|walk)\b/g, 'walk'],
    [/\b(ran|running|runs|run)\b/g, 'run'],
    [/\b(gym|workout|work out|worked out)\b/g, 'gym'],
    [/\b(meditated|meditating|meditation|meditate)\b/g, 'meditation'],
    [/\b(read|reading|reads)\b/g, 'read'],
    [/\b(stretched|stretching|stretch)\b/g, 'stretch'],
    [/\b(journaled|journaling|journal)\b/g, 'journal'],
  ];
  for (const [re, stem] of stems) {
    s = s.replace(re, stem);
  }

  // Light plural trim for single tokens
  const parts = s.split(' ').map((w) => {
    if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
    if (w.length > 4 && w.endsWith('ing')) return w.slice(0, -3);
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
    return w;
  });
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function findHabitByTitle(
  habits: Habit[],
  title: string
): Habit | undefined {
  const key = normalizeHabitKey(title);
  if (!key) return undefined;
  const exact = habits.find((h) => normalizeHabitKey(h.title) === key);
  if (exact) return exact;
  return habits.find((h) => {
    const hk = normalizeHabitKey(h.title);
    return hk.includes(key) || key.includes(hk);
  });
}

/** Merge same-activity duplicates (e.g. four "Walked" from Talk races). */
export function mergeDuplicateHabits(habits: Habit[]): {
  habits: Habit[];
  removedIds: string[];
} {
  const byKey = new Map<string, Habit>();
  const removedIds: string[] = [];

  // Oldest first so we keep the original card
  const ordered = [...habits].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  for (const h of ordered) {
    const key = normalizeHabitKey(h.title) || h.id;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, h);
      continue;
    }
    removedIds.push(h.id);
    const logMap = new Map<string, HabitLog>();
    for (const l of [...existing.logs, ...h.logs]) {
      if (!logMap.has(l.doneAt)) logMap.set(l.doneAt, l);
    }
    byKey.set(key, {
      ...existing,
      title: existing.title.length <= h.title.length ? existing.title : h.title,
      why: existing.why || h.why,
      inventoryItemId: existing.inventoryItemId || h.inventoryItemId,
      syncLastDone:
        existing.syncLastDone ?? h.syncLastDone ?? undefined,
      logs: [...logMap.values()].sort((a, b) => b.doneAt.localeCompare(a.doneAt)),
    });
  }

  return {
    habits: [...byKey.values()],
    removedIds,
  };
}
