import type { ChatAction } from '@/lib/chat/types';
import { displayWarrantyExpiry } from '@/lib/dates';
import { parseDateInput } from '@/lib/lastDone';

function formatRemindDay(iso?: string | null): string | undefined {
  if (!iso?.trim()) return undefined;
  const d = parseDateInput(iso);
  if (!d) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function habitAppliedReply(
  title: string,
  days: number,
  streak: number | null | undefined
): string {
  const name = title.trim();
  if (days > 1) {
    if (streak && streak >= days) {
      return `Nice — ${name} for the last ${days} days. You’re on a ${streak}-day streak.`;
    }
    return `Nice — ${name} for the last ${days} days.`;
  }
  if (streak && streak > 1) {
    return `Nice — ${name} today. You’re on a ${streak}-day streak.`;
  }
  return `Nice — ${name} today.`;
}

/** Build a toast reply from what was actually applied — never trust ASR wording in the model reply. */
export function composeAppliedReply(params: {
  actions: ChatAction[] | undefined;
  modelReply: string;
  addedName?: string | null;
  assignedTo?: string | null;
  removedNames?: string[];
  loggedDoneLabel?: string | null;
  loggedExpenseTitle?: string | null;
  loggedExpenseAmount?: string | null;
  loggedSubscriptionTitle?: string | null;
  loggedSubscriptionAmount?: string | null;
  habitCheckInTitle?: string | null;
  habitStreak?: number | null;
  habitCheckInDays?: number | null;
  classPackTitle?: string | null;
  classPackRemaining?: number | null;
  classPackTotal?: number | null;
  classLoggedTitle?: string | null;
  reminderLabel?: string | null;
  reminderAt?: string | null;
}): string {
  const actions = params.actions ?? [];
  const removed = params.removedNames ?? [];

  if (removed.length === 1) {
    return `Deleted ${removed[0]}.`;
  }
  if (removed.length > 1) {
    const preview = removed.slice(0, 3).join(', ');
    const more = removed.length > 3 ? ` (+${removed.length - 3} more)` : '';
    return `Deleted ${removed.length} items: ${preview}${more}.`;
  }

  const add = actions.find((a) => a?.type === 'add_item');
  if (add && add.type === 'add_item') {
    const name = params.addedName || add.name;
    const who = params.assignedTo || add.assignedTo;
    const bits = [`Added ${name}`];
    if (who) bits.push(`for ${who}`);
    if (add.price) bits.push(add.price);
    if (add.purchasedFrom) bits.push(`from ${add.purchasedFrom}`);
    const warranty = displayWarrantyExpiry(add.warrantyExpiry);
    if (warranty) bits.push(`warranty until ${warranty}`);
    return `${bits.join(' — ')}.`;
  }

  const expense =
    params.loggedExpenseTitle ||
    (() => {
      const a = actions.find((x) => x?.type === 'add_expense');
      return a && a.type === 'add_expense' ? a.title : null;
    })();
  if (expense) {
    const amt = params.loggedExpenseAmount;
    return amt ? `Saved ${expense} — ${amt}.` : `Saved that expense (${expense}).`;
  }

  const subscription =
    params.loggedSubscriptionTitle ||
    (() => {
      const a = actions.find((x) => x?.type === 'add_subscription');
      return a && a.type === 'add_subscription' ? a.title : null;
    })();
  if (subscription) {
    const amt = params.loggedSubscriptionAmount;
    return amt
      ? `Added ${subscription} — ${amt}.`
      : `Added ${subscription} to subscriptions.`;
  }

  const habitTitle =
    params.habitCheckInTitle ||
    (() => {
      const a = actions.find((x) => x?.type === 'habit_check_in');
      return a && a.type === 'habit_check_in' ? a.title : null;
    })();
  if (habitTitle) {
    const fromActions = actions.filter((a) => a?.type === 'habit_check_in').length;
    const days = Math.max(1, params.habitCheckInDays || fromActions || 1);
    return habitAppliedReply(habitTitle, days, params.habitStreak);
  }

  if (params.reminderLabel) {
    const when = formatRemindDay(params.reminderAt);
    return when
      ? `Reminder set: ${params.reminderLabel} — ${when}.`
      : `Reminder set: ${params.reminderLabel}.`;
  }

  if (actions.some((a) => a?.type === 'set_reminder')) {
    return 'When should I remind you?';
  }

  if (params.classLoggedTitle) {
    const left = params.classPackRemaining;
    const total = params.classPackTotal;
    const who = params.assignedTo ? ` for ${params.assignedTo}` : '';
    if (left != null && total != null && total > 0) {
      return `Logged ${params.classLoggedTitle}${who} — ${total - left} of ${total} used, ${left} left.`;
    }
    return `Logged ${params.classLoggedTitle}${who}.`;
  }

  const triedLog = actions.some((a) => a?.type === 'log_class');
  if (triedLog) {
    const fromAction = actions.find((a) => a?.type === 'log_class');
    const title =
      fromAction && fromAction.type === 'log_class' ? fromAction.title : undefined;
    return title
      ? `There's no ${title} pack yet. Enroll first, then I can log attendance.`
      : `There's no class pack to log against yet.`;
  }

  if (
    /^logged\b/i.test(params.modelReply || '') &&
    /\b(class|swimming|skating|lesson|session)\b/i.test(params.modelReply || '')
  ) {
    return `There's no class pack to log against yet.`;
  }

  if (params.classPackTitle) {
    const who = params.assignedTo ? ` for ${params.assignedTo}` : '';
    const total = params.classPackTotal;
    return total && total > 0
      ? `Added ${params.classPackTitle}${who} — ${total} classes.`
      : `Added ${params.classPackTitle}${who}.`;
  }

  const doneLabel =
    params.loggedDoneLabel ||
    (() => {
      const a = actions.find((x) => x?.type === 'log_done');
      return a && a.type === 'log_done' ? a.label : null;
    })();
  if (doneLabel) {
    return `Marked “${doneLabel}” as done.`;
  }

  const update = actions.find((a) => a?.type === 'update_item');
  if (update && update.type === 'update_item') {
    const parts: string[] = [];
    if (update.patch?.purchasedFrom) parts.push(`store → ${update.patch.purchasedFrom}`);
    if (update.patch?.price) parts.push(`price → ${update.patch.price}`);
    if (update.patch?.brand) parts.push(`brand → ${update.patch.brand}`);
    if (update.patch?.name) parts.push(`name → ${update.patch.name}`);
    if (update.patch?.room) parts.push(`room → ${update.patch.room}`);
    if (update.patch?.warrantyExpiry) parts.push(`warranty → ${update.patch.warrantyExpiry}`);
    if (parts.length) return `Updated (${parts.join(', ')}).`;
  }

  if (actions.some((a) => a?.type === 'open_item')) {
    return 'Opening that item.';
  }

  const trimmed = params.modelReply?.trim();
  if (trimmed && !/^(none|null|undefined|n\/a)$/i.test(trimmed)) {
    return trimmed;
  }
  return 'Anything else?';
}
