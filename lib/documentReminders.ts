import { isIsoDate, localDayKey, normalizeWarrantyExpiry } from '@/lib/dates';
import { parseDateInput } from '@/lib/lastDone';
import type { MrzDocumentKind } from '@/lib/ocr/mrz';
import { labelDocumentKind } from '@/lib/ocr/mrz';

/** Passports: many countries require 6+ months validity for travel. */
export const PASSPORT_REMIND_MONTHS_BEFORE = 6;

/** Default lead time before expiry for auto-reminders. Null = no auto reminder. */
export function defaultRemindMonthsBefore(
  kind?: MrzDocumentKind | string | null
): number | null {
  if (kind === 'passport') return PASSPORT_REMIND_MONTHS_BEFORE;
  return null;
}

/**
 * Calendar day `months` before `expiry` (YYYY-MM-DD).
 * If that day is already past, returns today so the reminder still fires.
 */
export function dayMonthsBefore(
  expiry: string,
  months: number,
  now = new Date()
): string | null {
  if (!Number.isFinite(months) || months < 0) return null;
  const raw = normalizeWarrantyExpiry(expiry) || (isIsoDate(expiry) ? expiry.trim() : '');
  if (!raw) return null;
  const expiryDate = parseDateInput(raw);
  if (!expiryDate) return null;

  const target = new Date(
    expiryDate.getFullYear(),
    expiryDate.getMonth() - months,
    expiryDate.getDate()
  );
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (target.getTime() < today.getTime()) return localDayKey(today);
  return localDayKey(target);
}

export type DocumentReminderDraft = {
  label: string;
  remindAt: string;
  notes: string;
  monthsBefore: number;
};

/** Build the default Last Done reminder for a saved identity document. */
export function defaultDocumentReminder(input: {
  kind?: MrzDocumentKind | string | null;
  name: string;
  expiry?: string | null;
  now?: Date;
}): DocumentReminderDraft | null {
  const months = defaultRemindMonthsBefore(input.kind);
  if (months == null) return null;
  const expiry = (input.expiry || '').trim();
  if (!expiry || expiry === '—') return null;
  const remindAt = dayMonthsBefore(expiry, months, input.now);
  if (!remindAt) return null;

  const kindLabel =
    input.kind && input.kind !== 'unknown'
      ? labelDocumentKind(input.kind as MrzDocumentKind)
      : 'Document';
  const name = input.name.trim() || kindLabel;

  return {
    label: `Renew ${name}`,
    remindAt,
    notes: `Expires ${expiry}. Reminder set ${months} months before by default.`,
    monthsBefore: months,
  };
}
