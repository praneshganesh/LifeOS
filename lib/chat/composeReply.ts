import type { ChatAction } from '@/lib/chat/types';
import { displayWarrantyExpiry } from '@/lib/dates';

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
