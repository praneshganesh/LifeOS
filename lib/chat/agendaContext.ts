import { agendaComingItems, agendaHorizonItems, agendaOverdueItems } from '@/lib/attention';
import { agendaClassesFromPacks } from '@/lib/classes';
import type { LocalIntentContext } from '@/lib/chat/localIntents';
import type { InventoryItem } from '@/lib/InventoryContext';
import type { LastDoneItem } from '@/lib/lastDone';
import { getLastDoneAt } from '@/lib/lastDone';
import type { Habit } from '@/lib/habits';
import { currentStreak, dayKey, loggedOn } from '@/lib/habits';
import type { ClassPack } from '@/lib/classes';
import type { Subscription } from '@/lib/subscriptions';
import { daysUntilRenewal } from '@/lib/subscriptions';
import type { HouseholdMember } from '@/lib/household';
import { localDayKey } from '@/lib/dates';
import { selfMember } from '@/lib/people';
import type { TalkFocus } from '@/lib/chat/focus';

/** Shared on-device pack for Talk / Ask agenda + status intents. */
export function buildAgendaLocalContext(input: {
  inventory: InventoryItem[];
  lastDone: LastDoneItem[];
  subscriptions: Subscription[];
  classPacks: ClassPack[];
  habits: Habit[];
  members?: HouseholdMember[];
  focusItemId?: string | null;
  focusExpenseId?: string | null;
  talkFocus?: TalkFocus | null;
  fallbackItemId?: string | null;
  now?: Date;
}): LocalIntentContext {
  const now = input.now ?? new Date();
  const today = dayKey(now);
  const self = selfMember(input.members || []);

  const renewals = input.subscriptions
    .map((s) => {
      const days = daysUntilRenewal(s.renewsOn, now);
      if (days == null || days < 0 || days > 60) return null;
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
      return {
        title: s.title,
        dayKey: localDayKey(d),
      };
    })
    .filter(Boolean) as { title: string; dayKey: string; who?: string }[];

  const doneToday = [
    ...input.habits
      .filter((h) => loggedOn(h, today))
      .map((h) => ({
        title: h.title,
        subtitle: 'Habit',
        who: h.assignedTo || undefined,
      })),
    ...input.lastDone
      .filter((i) => getLastDoneAt(i)?.slice(0, 10) === today)
      .map((i) => ({
        title: i.label,
        subtitle: 'Done today',
        who: i.assignedTo || undefined,
      })),
  ];

  return {
    focusItemId: input.focusItemId,
    focusExpenseId: input.focusExpenseId,
    talkFocus: input.talkFocus,
    fallbackItemId: input.fallbackItemId,
    reminders: input.lastDone.map((d) => ({
      id: d.id,
      label: d.label,
      remindAt: d.remindAt,
      who: d.assignedTo || undefined,
    })),
    overdue: agendaOverdueItems(
      input.inventory,
      input.lastDone,
      input.subscriptions,
      input.classPacks,
      now
    ),
    horizon: agendaHorizonItems(
      input.inventory,
      input.lastDone,
      input.subscriptions,
      input.classPacks,
      now
    ),
    coming: agendaComingItems(
      input.inventory,
      input.lastDone,
      input.subscriptions,
      input.classPacks,
      now
    ),
    doneToday,
    renewals,
    habits: input.habits.map((h) => ({
      title: h.title,
      doneToday: loggedOn(h, today),
      streak: currentStreak(h),
      who: h.assignedTo || undefined,
    })),
    people: (input.members || []).map((m) => ({
      name: m.name,
      isSelf: self?.id === m.id,
    })),
    openHabits: input.habits
      .filter((h) => !loggedOn(h, today))
      .map((h) => ({ title: h.title, who: h.assignedTo || undefined })),
    ...agendaClassesFromPacks(input.classPacks, now),
  };
}
