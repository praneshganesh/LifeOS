/**
 * Reminder utterance repair for the chat API.
 * Keep in sync with lib/dates.ts — re-exports the bundled copy in dates-lib.mjs
 * (regenerate: npx esbuild lib/dates.ts --bundle --platform=node --format=esm --outfile=server/dates-lib.mjs).
 */
export {
  looksLikeReminderQuery,
  looksLikeReminderEditCommand,
  looksLikeReminder,
  isBareRemindMe,
  reminderClarifyFromUtterance,
  splitDualRemindersFromUtterance,
  nextWeekdayKey,
  remindAtFromUtterance,
  parseRelativeDateTimeFromUtterance,
  parseTimeOfDayFromUtterance,
  remindTimeFromUtterance,
  parseRecurringWeekdayReminder,
  parseReminderEndsAtFromUtterance,
  parseDailyReminder,
  parseIntervalReminder,
  parseReminderFromUtterance,
  finalizeReminderLabel,
  reminderLabelFromUtterance,
  remindDateIsInvalid,
  remindDateIsPast,
  remindDateIsAmbiguous,
} from './dates-lib.mjs';

import {
  looksLikeReminderQuery,
  looksLikeReminderEditCommand,
  looksLikeReminder,
  isBareRemindMe,
  reminderClarifyFromUtterance,
  splitDualRemindersFromUtterance,
  remindAtFromUtterance,
  parseRelativeDateTimeFromUtterance,
  remindTimeFromUtterance,
  parseRecurringWeekdayReminder,
  parseDailyReminder,
  parseIntervalReminder,
  parseReminderFromUtterance,
  finalizeReminderLabel,
} from './dates-lib.mjs';

function passportId(inventorySummary, text) {
  const list = Array.isArray(inventorySummary) ? inventorySummary : [];
  const t = String(text || '').toLowerCase();
  const hit = list.find((i) => {
    const name = String(i?.name || '').toLowerCase();
    if (!name) return false;
    return t.includes(name) || (name.includes('passport') && t.includes('passport'));
  });
  return hit?.id;
}

/**
 * Repair / inject set_reminder from the last user utterance.
 * Mirrors on-device ensureTalkActions reminder rules: times, edit vs create,
 * clarify, dual reminders, spoken label over weak model label.
 */
export function ensureReminderActions(
  actions,
  lastUserText,
  inventorySummary,
  from = new Date()
) {
  let list = (Array.isArray(actions) ? actions : []).filter(
    (a) => a && a.type && a.type !== 'none'
  );

  if (looksLikeReminderQuery(lastUserText)) {
    return list.filter((a) => a.type !== 'set_reminder');
  }

  // Model returned update/delete → never also invent set_reminder.
  const hasMutate = list.some(
    (a) => a.type === 'update_last_done' || a.type === 'remove_last_done'
  );
  if (hasMutate && looksLikeReminderEditCommand(lastUserText)) {
    list = list.filter((a) => a.type !== 'set_reminder');
    return list;
  }

  if (looksLikeReminderEditCommand(lastUserText)) {
    list = list.filter((a) => a.type !== 'set_reminder');
    return list;
  }

  if (reminderClarifyFromUtterance(lastUserText, from) || isBareRemindMe(lastUserText)) {
    return list.filter((a) => a.type !== 'set_reminder');
  }

  // Fresh create must not also edit a focused reminder.
  if (looksLikeReminder(lastUserText)) {
    list = list.filter((a) => a.type !== 'update_last_done');
  }

  const dual = splitDualRemindersFromUtterance(lastUserText, from);
  if (dual?.length === 2) {
    list = list.filter((a) => a.type !== 'set_reminder');
    for (const d of dual) {
      list.push({
        type: 'set_reminder',
        label: d.label,
        remindAt: d.remindAt,
        ...(d.remindTime ? { remindTime: d.remindTime } : {}),
      });
    }
    return list;
  }

  const types = new Set(list.map((a) => a.type));
  const recurring =
    parseDailyReminder(lastUserText, from) ||
    parseIntervalReminder(lastUserText, from) ||
    parseRecurringWeekdayReminder(lastUserText, from);
  const relativeDt = parseRelativeDateTimeFromUtterance(lastUserText, from);
  const remindAt =
    recurring?.remindAt ||
    relativeDt?.day ||
    remindAtFromUtterance(lastUserText, from);
  const parsed = parseReminderFromUtterance(lastUserText);
  const label =
    parsed?.label && parsed.label !== 'Reminder'
      ? parsed.label
      : finalizeReminderLabel(parsed?.label || 'Reminder');
  const inventoryItemId = passportId(inventorySummary, lastUserText);
  const spokenClock =
    remindTimeFromUtterance(lastUserText) ||
    (relativeDt
      ? `${String(relativeDt.hour).padStart(2, '0')}:${String(relativeDt.minute).padStart(2, '0')}`
      : undefined);

  if (
    looksLikeReminder(lastUserText) &&
    !types.has('set_reminder') &&
    (remindAt || recurring) &&
    label !== 'Reminder'
  ) {
    list.push({
      type: 'set_reminder',
      label,
      remindAt: recurring?.remindAt || remindAt,
      remindInterval: recurring?.remindInterval,
      ...(spokenClock && !recurring ? { remindTime: spokenClock } : {}),
      note: parsed?.notes,
      inventoryItemId,
    });
  }

  return list.map((a) => {
    if (a.type !== 'set_reminder') return a;
    const next = { ...a };
    if (!next.remindAt && (recurring?.remindAt || remindAt)) {
      next.remindAt = recurring?.remindAt || remindAt;
    }
    if (!next.remindInterval && recurring?.remindInterval) {
      next.remindInterval = recurring.remindInterval;
    }
    // Persist spoken (or model) clock on one-offs.
    if (!next.remindInterval) {
      const modelClock =
        typeof next.remindTime === 'string' && /^\d{1,2}:\d{2}$/.test(next.remindTime.trim())
          ? next.remindTime.trim()
          : undefined;
      const clock = spokenClock || modelClock;
      if (clock) next.remindTime = clock;
    }
    // Prefer spoken label; don't let a weaker model label override.
    const parsedLabel =
      parsed?.label && parsed.label !== 'Reminder' ? parsed.label : null;
    if (parsedLabel) {
      next.label = finalizeReminderLabel(parsedLabel);
    } else {
      next.label = finalizeReminderLabel(next.label || label);
    }
    if (!next.note && parsed?.notes) next.note = parsed.notes;
    if (!next.inventoryItemId && inventoryItemId) next.inventoryItemId = inventoryItemId;
    return next;
  });
}
