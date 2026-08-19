import type { ChatAction } from '@/lib/chat/types';
import { openingLineForFocus, type TalkFocus } from '@/lib/chat/focus';
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

/**
 * Toast from what was actually applied — never celebrate a skipped action.
 * Model reply is only used when nothing actionable applied (or as last resort).
 */
export function composeAppliedReply(params: {
  actions: ChatAction[] | undefined;
  modelReply: string;
  addedName?: string | null;
  assignedTo?: string | null;
  removedNames?: string[];
  /** Inventory ids successfully patched this turn */
  updatedIds?: string[];
  openExpenseId?: string | null;
  openItemId?: string | null;
  openTarget?: TalkFocus | null;
  loggedDoneLabel?: string | null;
  loggedExpenseTitle?: string | null;
  loggedExpenseAmount?: string | null;
  loggedExpenseMerchant?: string | null;
  updatedExpense?: boolean;
  removedExpenseTitle?: string | null;
  loggedSubscriptionTitle?: string | null;
  loggedSubscriptionAmount?: string | null;
  updatedSubscription?: boolean;
  removedSubscriptionTitle?: string | null;
  removedHabitTitle?: string | null;
  removedClassTitle?: string | null;
  habitCheckInTitle?: string | null;
  habitStreak?: number | null;
  habitCheckInDays?: number | null;
  classPackTitle?: string | null;
  classPackRemaining?: number | null;
  classPackTotal?: number | null;
  classLoggedTitle?: string | null;
  classLogAttemptFor?: string | null;
  reminderLabel?: string | null;
  reminderAt?: string | null;
  removedLastDoneLabel?: string | null;
  updatedClassPack?: boolean;
}): string {
  const actions = params.actions ?? [];
  const removed = params.removedNames ?? [];
  const updatedIds = params.updatedIds ?? [];

  if (removed.length === 1) {
    return `Deleted ${removed[0]}.`;
  }
  if (removed.length > 1) {
    const preview = removed.slice(0, 3).join(', ');
    const more = removed.length > 3 ? ` (+${removed.length - 3} more)` : '';
    return `Deleted ${removed.length} items: ${preview}${more}.`;
  }
  if (params.removedExpenseTitle?.trim()) {
    return `Deleted ${params.removedExpenseTitle.trim()}.`;
  }
  if (actions.some((a) => a?.type === 'remove_expense')) {
    return 'Couldn’t delete that expense — name it first.';
  }
  if (params.removedSubscriptionTitle?.trim()) {
    return `Removed ${params.removedSubscriptionTitle.trim()}.`;
  }
  if (actions.some((a) => a?.type === 'remove_subscription')) {
    return 'Couldn’t remove that subscription — name it first.';
  }
  if (params.removedHabitTitle?.trim()) {
    return `Removed ${params.removedHabitTitle.trim()}.`;
  }
  if (actions.some((a) => a?.type === 'remove_habit')) {
    return 'Couldn’t remove that habit — name it first.';
  }
  if (params.removedClassTitle?.trim()) {
    return `Removed ${params.removedClassTitle.trim()}.`;
  }
  if (actions.some((a) => a?.type === 'remove_class_pack')) {
    return 'Couldn’t remove that class pack — name it first.';
  }
  if (params.removedLastDoneLabel?.trim()) {
    return `Removed ${params.removedLastDoneLabel.trim()}.`;
  }
  if (actions.some((a) => a?.type === 'remove_last_done')) {
    return 'Couldn’t remove that activity — name it first.';
  }

  // Only confirm add when apply produced a name
  if (params.addedName?.trim()) {
    const add = actions.find((a) => a?.type === 'add_item');
    const who = params.assignedTo || (add && add.type === 'add_item' ? add.assignedTo : undefined);
    const bits = [`Added ${params.addedName.trim()}`];
    if (who) bits.push(`for ${who}`);
    if (add && add.type === 'add_item') {
      if (add.price) bits.push(add.price);
      if (add.purchasedFrom) bits.push(`from ${add.purchasedFrom}`);
      const warranty = displayWarrantyExpiry(add.warrantyExpiry);
      if (warranty) bits.push(`warranty until ${warranty}`);
    }
    return `${bits.join(' — ')}.`;
  }
  if (actions.some((a) => a?.type === 'add_item')) {
    return 'Couldn’t add that — try again.';
  }

  if (params.loggedExpenseTitle?.trim()) {
    const expense = params.loggedExpenseTitle.trim();
    const amt = params.loggedExpenseAmount;
    const at = params.loggedExpenseMerchant
      ? ` at ${params.loggedExpenseMerchant}`
      : '';
    const verb = params.updatedExpense ? 'Updated' : 'Logged';
    return amt
      ? `${verb} ${expense}${at} — ${amt}.`
      : `${verb} that expense (${expense}${at}).`;
  }
  if (actions.some((a) => a?.type === 'add_expense')) {
    return 'Couldn’t log that expense — check the amount and try again.';
  }
  if (actions.some((a) => a?.type === 'update_expense')) {
    return 'Couldn’t update that expense — name it or open it first.';
  }

  if (params.loggedSubscriptionTitle?.trim()) {
    const subscription = params.loggedSubscriptionTitle.trim();
    const amt = params.loggedSubscriptionAmount;
    const verb = params.updatedSubscription ? 'Updated' : 'Added';
    return amt
      ? `${verb} ${subscription} — ${amt}.`
      : params.updatedSubscription
        ? `Updated ${subscription}.`
        : `Added ${subscription} to subscriptions.`;
  }
  if (actions.some((a) => a?.type === 'add_subscription')) {
    return 'Couldn’t add that subscription — check the amount and try again.';
  }
  if (actions.some((a) => a?.type === 'update_subscription')) {
    return 'Couldn’t update that subscription — name it first.';
  }

  if (params.habitCheckInTitle?.trim()) {
    const fromActions = actions.filter((a) => a?.type === 'habit_check_in').length;
    const days = Math.max(1, params.habitCheckInDays || fromActions || 1);
    return habitAppliedReply(params.habitCheckInTitle.trim(), days, params.habitStreak);
  }
  if (actions.some((a) => a?.type === 'habit_check_in')) {
    return 'Couldn’t check that in — try naming the habit.';
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
    const who = params.classLogAttemptFor
      ? ` for ${params.classLogAttemptFor}`
      : '';
    return title
      ? `There's no ${title} pack${who} yet. Enroll first, then I can log attendance.`
      : `There's no class pack to log against yet${who}.`;
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
    const verb = params.updatedClassPack ? 'Updated' : 'Added';
    return total && total > 0
      ? `${verb} ${params.classPackTitle}${who} — ${total} classes.`
      : `${verb} ${params.classPackTitle}${who}.`;
  }
  if (actions.some((a) => a?.type === 'add_class_pack' || a?.type === 'update_class_pack')) {
    return params.updatedClassPack
      ? 'Couldn’t update that class pack — name it first.'
      : 'Couldn’t add that class pack — try again.';
  }

  if (params.loggedDoneLabel?.trim()) {
    return `Marked “${params.loggedDoneLabel.trim()}” as done.`;
  }
  if (actions.some((a) => a?.type === 'log_done')) {
    return 'Couldn’t log that — try again.';
  }

  if (updatedIds.length > 0) {
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
    return 'Updated.';
  }
  if (actions.some((a) => a?.type === 'update_item')) {
    return 'Couldn’t update that — name the Thing or expense.';
  }

  if (params.openTarget) {
    return openingLineForFocus(params.openTarget);
  }
  if (params.openExpenseId) {
    return 'Opening that expense.';
  }
  if (actions.some((a) => a?.type === 'open_expense') && !params.openExpenseId) {
    return 'Which expense? Name it, or log one first.';
  }
  if (params.openItemId || actions.some((a) => a?.type === 'open_item')) {
    if (actions.some((a) => a?.type === 'open_item') && !params.openItemId && !params.openTarget) {
      return 'Which one? Name it first.';
    }
    return 'Opening that item.';
  }

  const trimmed = params.modelReply?.trim();
  if (trimmed && !/^(none|null|undefined|n\/a)$/i.test(trimmed)) {
    // Strip false success claims when apply clearly did nothing for mutate verbs
    if (
      /^(updated|logged|added|deleted|removed|checked in)\b/i.test(trimmed) &&
      actions.some((a) =>
        [
          'update_item',
          'update_expense',
          'add_expense',
          'add_item',
          'remove_item',
          'habit_check_in',
          'add_subscription',
        ].includes(a?.type)
      )
    ) {
      return 'I couldn’t complete that — try again.';
    }
    return trimmed;
  }
  return 'Anything else?';
}
