import { buildAttentionItems, type AttentionItem } from '@/lib/attention';
import type { Icon3DName } from '@/components/ui/Icon3D';
import type { InventoryItem } from '@/lib/InventoryContext';
import type { LastDoneItem } from '@/lib/lastDone';
import type { Subscription } from '@/lib/subscriptions';
import type { ClassPack } from '@/lib/classes';
import { dayKey, loggedOn, type Habit } from '@/lib/habits';

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

export type DashboardModel = {
  overdue: number;
  dueToday: number;
  habitsOpen: number;
  today: DashRow[];
  next: DashRow[];
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
  now?: Date;
}): DashboardModel {
  const now = input.now ?? new Date();
  const todayKey = dayKey(now);
  const attention = buildAttentionItems(
    input.inventory,
    input.lastDone,
    input.subscriptions,
    input.classPacks
  );

  const overdue = attention.filter((a) => (a.daysLeft ?? 0) < 0).length;
  const dueToday = attention.filter((a) => a.daysLeft === 0).length;

  const habitRows: DashRow[] = input.habits
    .filter((h) => !loggedOn(h, todayKey))
    .map((h) => ({
      id: `habit-${h.id}`,
      title: h.title,
      subtitle: h.assignedTo ? `${h.assignedTo} · still open` : 'Still open today',
      urgency: 'soon' as const,
      href: `/habits/${h.id}`,
      habitId: h.id,
      icon: 'sparkles',
    }));

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

  const today = dedupeRows([...todayAtt, ...habitRows]).slice(0, 8);
  const next = dedupeRows(nextAtt)
    .filter((row) => !today.some((t) => t.id === row.id))
    .slice(0, 8);
  const featured = today[0] ?? next[0] ?? null;

  return {
    overdue,
    dueToday,
    habitsOpen: habitRows.length,
    today,
    next,
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
