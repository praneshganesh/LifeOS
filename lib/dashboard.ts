import { buildAttentionItems, type AttentionItem } from '@/lib/attention';
import type { Icon3DName } from '@/components/ui/Icon3D';
import type { InventoryItem } from '@/lib/InventoryContext';
import { type LastDoneItem } from '@/lib/lastDone';
import type { Subscription } from '@/lib/subscriptions';
import type { ClassPack } from '@/lib/classes';
import { currentStreak, dayKey, loggedOn, type Habit } from '@/lib/habits';

export type DashRow = {
  id: string;
  title: string;
  subtitle: string;
  urgency: AttentionItem['urgency'];
  href?: string;
  habitId?: string;
  lastDoneId?: string;
  icon: Icon3DName;
};

/** @deprecated Prefer DashRow on Today — kept for older test helpers. */
export type ChecklistRow = {
  id: string;
  title: string;
  done: boolean;
  habitId?: string;
  href?: string;
  meta?: string;
};

export type DashboardModel = {
  overdue: number;
  dueToday: number;
  habitsOpen: number;
  /** Habits already checked in today — so a productive day shows, not vanishes. */
  habitsDone: number;
  /** Open habits + attention due today — one list for the Today section. */
  today: DashRow[];
  next: DashRow[];
  /** Habits / activities already completed today. */
  doneToday: DashRow[];
  /**
   * Legacy compact checklist (open habits then done). Prefer `today` + `doneToday`.
   * @deprecated
   */
  checklist: ChecklistRow[];
  featured: DashRow | null;
};

export function givenName(displayName: string | undefined): string {
  const n = (displayName || '').trim();
  if (!n || /^you$/i.test(n)) return '';
  return n.split(/\s+/)[0] || '';
}

export function formatDashDate(date = new Date()): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

export function buildDashboard(input: {
  inventory: InventoryItem[];
  lastDone: LastDoneItem[];
  subscriptions: Subscription[];
  classPacks: ClassPack[];
  habits: Habit[];
  /** The user's own name — suppressed as an owner hint (it's implied). */
  selfName?: string;
  now?: Date;
}): DashboardModel {
  const now = input.now ?? new Date();
  const todayKey = dayKey(now);
  const selfName = (input.selfName || '').trim().toLowerCase();
  const ownerMeta = (assignedTo: string | undefined): string | undefined => {
    const name = (assignedTo || '').trim();
    if (!name || name.toLowerCase() === selfName) return undefined;
    return name;
  };
  const attention = buildAttentionItems(
    input.inventory,
    input.lastDone,
    input.subscriptions,
    input.classPacks,
    now
  );

  const overdue = attention.filter((a) => (a.daysLeft ?? 0) < 0).length;
  const dueToday = attention.filter((a) => a.daysLeft === 0).length;

  const todayAtt: DashRow[] = attention
    .filter((a) => a.daysLeft != null && a.daysLeft <= 0)
    .map(fromAttention);

  const nextAtt: DashRow[] = attention
    .filter(
      (a) =>
        (a.urgency === 'urgent' || a.urgency === 'soon') &&
        (a.daysLeft == null || a.daysLeft > 0)
    )
    .map(fromAttention);

  const openHabits = input.habits.filter((h) => !loggedOn(h, todayKey));
  const doneHabits = input.habits.filter((h) => loggedOn(h, todayKey));

  const openHabitDash: DashRow[] = openHabits.map((h) => ({
    id: `habit-${h.id}`,
    title: h.title,
    subtitle: ownerMeta(h.assignedTo) || 'Habit',
    urgency: 'soon',
    href: `/habits/${h.id}`,
    habitId: h.id,
    icon: 'sparkles',
  }));

  const doneHabitDash: DashRow[] = doneHabits.map((h) => {
    const streak = currentStreak(h);
    return {
      id: `habit-${h.id}`,
      title: h.title,
      subtitle:
        streak >= 2
          ? `${streak}-day streak`
          : ownerMeta(h.assignedTo) || 'Habit',
      urgency: 'ok',
      href: `/habits/${h.id}`,
      habitId: h.id,
      icon: 'sparkles',
    };
  });

  const activityDoneDash: DashRow[] = input.lastDone
    .filter((i) => i.logs?.[0]?.doneAt?.slice(0, 10) === todayKey)
    .map((i) => ({
      id: `ld-done-${i.id}`,
      title: i.label,
      subtitle: ownerMeta(i.assignedTo) || 'Done today',
      urgency: 'ok' as const,
      href: `/last-done/${i.id}`,
      lastDoneId: i.id,
      icon: 'tools' as Icon3DName,
    }));

  // Habits first (daily rhythm), then attention due today.
  const today = dedupeRows([...openHabitDash, ...todayAtt]).slice(0, 12);
  const next = dedupeRows(nextAtt)
    .filter((row) => !today.some((t) => t.id === row.id))
    .slice(0, 8);
  const doneToday = dedupeRows([...doneHabitDash, ...activityDoneDash]).slice(
    0,
    12
  );
  const featured = today[0] ?? next[0] ?? null;

  // Legacy shape for older tests / callers.
  const checklist: ChecklistRow[] = [
    ...openHabitDash.map((r) => ({
      id: r.id,
      title: r.title,
      done: false,
      habitId: r.habitId,
      href: r.href,
      meta: r.subtitle === 'Habit' ? undefined : r.subtitle,
    })),
    ...doneHabitDash.map((r) => ({
      id: r.id,
      title: r.title,
      done: true,
      habitId: r.habitId,
      href: r.href,
      meta: r.subtitle.includes('streak')
        ? r.subtitle.replace('-day streak', 'd')
        : r.subtitle === 'Habit'
          ? undefined
          : r.subtitle,
    })),
    ...activityDoneDash.map((r) => ({
      id: r.id,
      title: r.title,
      done: true,
      href: r.href,
      meta: r.subtitle === 'Done today' ? undefined : r.subtitle,
    })),
  ];

  return {
    overdue,
    dueToday,
    habitsOpen: openHabitDash.length,
    habitsDone: doneHabitDash.length,
    today,
    next,
    doneToday,
    checklist,
    featured,
  };
}

function fromAttention(a: AttentionItem): DashRow {
  const lastDoneId = a.id.startsWith('ld-') ? a.id.slice(3) : undefined;
  return {
    id: a.id,
    title: a.title,
    subtitle: a.subtitle,
    urgency: a.urgency,
    href: a.href,
    lastDoneId,
    icon: a.icon,
  };
}

function dedupeRows(rows: DashRow[]): DashRow[] {
  const seen = new Set<string>();
  const out: DashRow[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}
