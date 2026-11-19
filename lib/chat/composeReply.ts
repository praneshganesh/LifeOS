import type { ChatAction } from '@/lib/chat/types';
import { openingLineForFocus, type TalkFocus } from '@/lib/chat/focus';
import { formatMoney } from '@/lib/chat/prompt';
import { getRuntimeDefaultCurrency } from '@/lib/currency';
import { displayWarrantyExpiry, formatDisplayDate } from '@/lib/dates';
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

function formatRemindClock(hhmm?: string | null): string | undefined {
  const m = hhmm?.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return undefined;
  const pm = hour >= 12;
  const h12 = hour % 12 || 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${pm ? 'PM' : 'AM'}`;
}

function reminderWhen(date?: string | null, time?: string | null): string | undefined {
  const day = formatRemindDay(date);
  const clock = formatRemindClock(time);
  if (day && clock) return `${day} at ${clock}`;
  return day;
}

/** "today" / "tomorrow" when that is the day, otherwise a short calendar date. */
function formatRemindWhen(iso?: string | null, now = new Date()): string | undefined {
  const d = iso ? parseDateInput(iso) : null;
  if (!d) return undefined;
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (same(d, now)) return 'today';
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (same(d, tomorrow)) return 'tomorrow';
  return formatRemindDay(iso);
}

function habitAppliedReply(
  title: string,
  days: number,
  streak: number | null | undefined
): string {
  const name = title.trim().toLowerCase();
  if (days > 1) {
    const base = `Logged ${name} for the last ${days} days.`;
    return streak && streak >= days ? `${base} ${streak} days in a row.` : base;
  }
  const base = `Logged ${name} for today.`;
  return streak && streak > 1 ? `${base} ${streak} days in a row.` : base;
}

function classWhenPhrase(days?: string[] | null, endsOn?: string | null): string {
  const labels = (days ?? [])
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
    .map((d) => d.charAt(0).toUpperCase() + d.slice(1) + 's');
  let when = '';
  if (labels.length === 1) when = labels[0];
  else if (labels.length === 2) when = `${labels[0]} and ${labels[1]}`;
  else if (labels.length > 2) {
    when = `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
  }
  const end = endsOn ? formatDisplayDate(endsOn) : undefined;
  if (when && end) return `${when} until ${end}`;
  if (when) return when;
  if (end) return `until ${end}`;
  return '';
}

/**
 * Toast from what was actually applied, never celebrate a skipped action.
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
  addedHabitTitle?: string | null;
  addedHabitWhy?: string | null;
  addedHabitAlready?: boolean;
  updatedHabit?: boolean;
  updatedHabitTitle?: string | null;
  classPackTitle?: string | null;
  classPackRemaining?: number | null;
  classPackTotal?: number | null;
  classPackScheduleDays?: string[] | null;
  classPackEndsOn?: string | null;
  classPackScheduleTimeInferred?: boolean | null;
  classLoggedTitle?: string | null;
  classLoggedAlready?: boolean;
  classLogFull?: boolean;
  classLogAttemptFor?: string | null;
  reminderLabel?: string | null;
  reminderAt?: string | null;
  reminderTime?: string | null;
  reminderSaves?: { label: string; remindAt?: string | null; remindTime?: string | null }[];
  reminderFailures?: { label: string }[];
  updatedReminder?: boolean;
  reminderUnchanged?: boolean;
  reminderClarify?: string | null;
  removedLastDoneLabel?: string | null;
  updatedClassPack?: boolean;
  renamedPersonFrom?: string | null;
  renamedPersonTo?: string | null;
}): string {
  const actions = params.actions ?? [];
  const removed = params.removedNames ?? [];
  const updatedIds = params.updatedIds ?? [];

  if (params.renamedPersonTo?.trim()) {
    return params.renamedPersonFrom?.trim()
      ? `Got it, ${params.renamedPersonFrom.trim()} is now ${params.renamedPersonTo.trim()}.`
      : `Renamed to ${params.renamedPersonTo.trim()}.`;
  }
  if (actions.some((a) => a?.type === 'rename_person')) {
    return 'Couldn’t find that person to rename. Check Household.';
  }

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
    return 'Couldn’t delete that expense. Name it first.';
  }
  if (params.removedSubscriptionTitle?.trim()) {
    return `Removed ${params.removedSubscriptionTitle.trim()}.`;
  }
  if (actions.some((a) => a?.type === 'remove_subscription')) {
    return 'Couldn’t remove that subscription. Name it first.';
  }
  if (params.removedHabitTitle?.trim()) {
    return `Removed ${params.removedHabitTitle.trim()}.`;
  }
  if (actions.some((a) => a?.type === 'remove_habit')) {
    return 'Couldn’t remove that habit. Name it first.';
  }
  if (params.removedClassTitle?.trim()) {
    return `Removed ${params.removedClassTitle.trim()}.`;
  }
  if (actions.some((a) => a?.type === 'remove_class_pack')) {
    return 'Couldn’t remove that class. Name it first.';
  }
  if (params.removedLastDoneLabel?.trim()) {
    return `Removed ${params.removedLastDoneLabel.trim()}.`;
  }
  if (actions.some((a) => a?.type === 'remove_last_done')) {
    return 'Couldn’t remove that activity. Name it first.';
  }

  // Only confirm add when apply produced a name
  if (params.addedName?.trim()) {
    const add = actions.find((a) => a?.type === 'add_item');
    const who = params.assignedTo || (add && add.type === 'add_item' ? add.assignedTo : undefined);
    const bits = [`Added ${params.addedName.trim()}`];
    if (who) bits.push(`for ${who}`);
    if (add && add.type === 'add_item') {
      if (add.price) {
        bits.push(
          formatMoney(add.price, {
            defaultCurrency: getRuntimeDefaultCurrency(),
          }) || add.price
        );
      }
      if (add.purchasedFrom) bits.push(`from ${add.purchasedFrom}`);
      const warranty = displayWarrantyExpiry(add.warrantyExpiry);
      if (warranty) bits.push(`warranty until ${warranty}`);
    }
    return `${bits.join(' · ')}.`;
  }
  if (actions.some((a) => a?.type === 'add_item')) {
    return 'Couldn’t add that. Try again.';
  }

  if (params.loggedExpenseTitle?.trim()) {
    const expense = params.loggedExpenseTitle.trim();
    const amt = params.loggedExpenseAmount;
    const at = params.loggedExpenseMerchant
      ? ` at ${params.loggedExpenseMerchant}`
      : '';
    const verb = params.updatedExpense ? 'Updated' : 'Logged';
    return amt
      ? `${verb} ${expense}${at} · ${amt}.`
      : `${verb} ${expense}${at}.`;
  }
  if (actions.some((a) => a?.type === 'add_expense')) {
    return 'Couldn’t log that expense. Check the amount and try again.';
  }
  if (actions.some((a) => a?.type === 'update_expense')) {
    return 'Couldn’t update that expense. Name it or open it first.';
  }

  if (params.loggedSubscriptionTitle?.trim()) {
    const subscription = params.loggedSubscriptionTitle.trim();
    const amt = params.loggedSubscriptionAmount;
    const verb = params.updatedSubscription ? 'Updated' : 'Added';
    return amt
      ? `${verb} ${subscription} · ${amt}.`
      : params.updatedSubscription
        ? `Updated ${subscription}.`
        : `Added ${subscription} to subscriptions.`;
  }
  if (actions.some((a) => a?.type === 'add_subscription')) {
    return 'Couldn’t add that subscription. Check the amount and try again.';
  }
  if (actions.some((a) => a?.type === 'update_subscription')) {
    return 'Couldn’t update that subscription. Name it first.';
  }

  if (params.updatedHabitTitle?.trim()) {
    return `Renamed habit to ${params.updatedHabitTitle.trim()}.`;
  }
  if (actions.some((a) => a?.type === 'update_habit')) {
    return 'Couldn’t update that habit. Open it first.';
  }

  if (params.addedHabitTitle?.trim()) {
    const name = params.addedHabitTitle.trim();
    if (params.addedHabitAlready) {
      return `You already have ${name}. I didn’t mark today done.`;
    }
    const why = params.addedHabitWhy?.trim();
    return why ? `Added ${name} (${why}).` : `Added ${name}.`;
  }

  if (params.habitCheckInTitle?.trim()) {
    const fromActions = actions.filter((a) => a?.type === 'habit_check_in').length;
    const days = Math.max(1, params.habitCheckInDays || fromActions || 1);
    return habitAppliedReply(params.habitCheckInTitle.trim(), days, params.habitStreak);
  }
  if (actions.some((a) => a?.type === 'habit_check_in')) {
    return 'Couldn’t check that in. Try naming the habit.';
  }

  if (params.reminderClarify?.trim()) {
    return params.reminderClarify.trim();
  }

  const saves = params.reminderSaves ?? [];
  const failures = params.reminderFailures ?? [];
  if (saves.length + failures.length > 1) {
    const savedLine = saves
      .map((item) => {
        const when = reminderWhen(item.remindAt, item.remindTime);
        return when ? `${item.label} · ${when}` : item.label;
      })
      .join('. ');
    const failedLine = failures.map((item) => item.label).join(' and ');
    if (saves.length && failures.length) {
      return `Saved ${savedLine}. Couldn’t save ${failedLine}.`;
    }
    if (failures.length) return `Couldn’t save ${failedLine}.`;
    return `Reminders set: ${savedLine}.`;
  }

  if (params.reminderLabel) {
    const when = reminderWhen(params.reminderAt, params.reminderTime);
    if (params.reminderUnchanged) {
      const day = formatRemindWhen(params.reminderAt);
      const clock = formatRemindClock(params.reminderTime);
      const already = day && clock ? `${day} at ${clock}` : day;
      return already
        ? `${params.reminderLabel} is already set for ${already}.`
        : `${params.reminderLabel} is already set.`;
    }
    if (params.updatedReminder) {
      return when
        ? `Updated: ${params.reminderLabel} · due ${when}.`
        : `Updated: ${params.reminderLabel}.`;
    }
    return when
      ? `Reminder set: ${params.reminderLabel} · ${when}.`
      : `Reminder set: ${params.reminderLabel}.`;
  }

  if (actions.some((a) => a?.type === 'update_last_done')) {
    return 'Couldn’t update that reminder. Open it first.';
  }

  if (actions.some((a) => a?.type === 'set_reminder')) {
    return 'When should I remind you?';
  }

  if (params.classLoggedAlready && params.classLoggedTitle) {
    return `${params.classLoggedTitle} was already logged for that day.`;
  }
  if (params.classLogFull && params.classLoggedTitle) {
    const total = params.classPackTotal;
    return total && total > 0
      ? `No sessions left on ${params.classLoggedTitle}. All ${total} are used.`
      : `No sessions left on ${params.classLoggedTitle}.`;
  }

  if (params.classLoggedTitle) {
    const left = params.classPackRemaining;
    const total = params.classPackTotal;
    const who = params.assignedTo ? ` for ${params.assignedTo}` : '';
    if (left != null && total != null && total > 0) {
      return `Logged ${params.classLoggedTitle}${who} · ${total - left} of ${total} sessions used, ${left} left.`;
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
      : `There's no class to log a session against yet${who}.`;
  }

  if (
    /^logged\b/i.test(params.modelReply || '') &&
    /\b(class|swimming|skating|lesson|session)\b/i.test(params.modelReply || '')
  ) {
    return `There's no class to log a session against yet.`;
  }

  if (params.classPackTitle) {
    const who = params.assignedTo ? ` for ${params.assignedTo}` : '';
    const total = params.classPackTotal;
    const verb = params.updatedClassPack ? 'Updated' : 'Added';
    const when = classWhenPhrase(params.classPackScheduleDays, params.classPackEndsOn);
    const bits = [
      total && total > 0 ? `${total} classes` : '',
      when,
    ].filter(Boolean);
    const detail = bits.length ? ` · ${bits.join(', ')}` : '';
    const assumed =
      !params.updatedClassPack && params.classPackScheduleTimeInferred
        ? ` I assumed 9:00 AM, since you didn't give a time.`
        : '';
    return `${verb} ${params.classPackTitle}${who}${detail}.${assumed}`;
  }
  if (actions.some((a) => a?.type === 'add_class_pack' || a?.type === 'update_class_pack')) {
    return params.updatedClassPack
      ? 'Couldn’t update that class. Name it first.'
      : 'Couldn’t add that class. Try again.';
  }

  if (params.loggedDoneLabel?.trim()) {
    return `Marked “${params.loggedDoneLabel.trim()}” as done.`;
  }
  if (actions.some((a) => a?.type === 'log_done')) {
    return 'Couldn’t log that. Try again.';
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
    return 'Couldn’t update that. Name the Thing or expense.';
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
      return 'I couldn’t complete that. Try again.';
    }
    return trimmed;
  }
  return 'Anything else?';
}
