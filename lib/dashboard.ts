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

export type ChecklistRow = {
  id: string;
  title: string;
  done: boolean;
  habitId?: string;
  href?: string;
  /** Right-side hint: streak for done habits, owner name otherwise. */
  meta?: string;
};

export type DashboardModel = {
  overdue: number;
  dueToday: number;
  habitsOpen: number;
  /** Habits already checked in today — so a productive day shows, not vanishes. */
  habitsDone: number;
  today: DashRow[];
  next: DashRow[];
  /** One compact list: open habits first, then everything checked off today. */
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

  const openHabitRows: ChecklistRow[] = input.habits
    .filter((h) => !loggedOn(h, todayKey))
    .map((h) => ({
      id: `habit-${h.id}`,
      title: h.title,
      done: false,
      habitId: h.id,
      href: `/habits/${h.id}`,
      meta: ownerMeta(h.assignedTo),
    }));

  const doneHabitRows: ChecklistRow[] = input.habits
    .filter((h) => loggedOn(h, todayKey))
    .map((h) => {
      const streak = currentStreak(h);
      return {
        id: `habit-${h.id}`,
        title: h.title,
        done: true,
        href: `/habits/${h.id}`,
        meta: streak >= 2 ? `${streak}d` : ownerMeta(h.assignedTo),
      };
    });

  const activityDoneRows: ChecklistRow[] = input.lastDone
    .filter((i) => i.logs?.[0]?.doneAt?.slice(0, 10) === todayKey)
    .map((i) => ({
      id: `ld-${i.id}`,
      title: i.label,
      done: true,
      href: `/last-done/${i.id}`,
      meta: ownerMeta(i.assignedTo),
    }));

  const checklist = [...openHabitRows, ...doneHabitRows, ...activityDoneRows];

  const today = dedupeRows(todayAtt).slice(0, 8);
  const next = dedupeRows(nextAtt)
    .filter((row) => !today.some((t) => t.id === row.id))
    .slice(0, 8);
  const featured = today[0] ?? next[0] ?? null;

  return {
    overdue,
    dueToday,
    habitsOpen: openHabitRows.length,
    habitsDone: doneHabitRows.length,
    today,
    next,
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
