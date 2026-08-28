import type { ClassPack, ScheduleDay } from '@/lib/classes';
import {
  packStatus,
  remainingCount,
} from '@/lib/classes';
import { localDayKey } from '@/lib/dates';

const ID_PREFIX = 'lifeos-cls-';

export function classReminderIdPrefix(packId: string): string {
  return `${ID_PREFIX}${packId}`;
}

export type ClassNotificationTrigger = {
  identifier: string;
  title: string;
  body: string;
  date: Date;
  data: {
    type: 'class';
    packId: string;
    href: string;
  };
};

/**
 * Parses time string like "10:00 AM", "4:30 PM", "10:00" into { hours, minutes }.
 * Defaults to 9:00 AM if invalid.
 */
export function parseScheduleTime(timeStr?: string): { hours: number; minutes: number } {
  if (!timeStr?.trim()) return { hours: 9, minutes: 0 };
  const m = timeStr.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return { hours: 9, minutes: 0 };
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ampm = m[3]?.toLowerCase();
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return { hours: Math.min(23, Math.max(0, h)), minutes: Math.min(59, Math.max(0, min)) };
}

/**
 * Pure helper: Computes next notification triggers for a class pack (evening-before at 18:00 and morning-of at 08:00).
 * Scheduled for upcoming occurrences (up to 4 weeks in advance) within the pack validity window (startsOn to endsOn)
 * limited to the remaining class count and sorted chronologically across all schedule days.
 */
export function calculateUpcomingClassTriggers(
  pack: ClassPack,
  now = new Date(),
  maxWeeks = 4
): ClassNotificationTrigger[] {
  const remaining = remainingCount(pack);
  if (remaining === 0) return [];
  if (packStatus(pack, now) === 'expired') return [];
  if (!pack.scheduleDays || !pack.scheduleDays.length) return [];

  const dayIndexMap: Record<ScheduleDay, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  const startsLimit = pack.startsOn ? new Date(`${pack.startsOn}T00:00:00`) : undefined;
  const endLimit = pack.endsOn ? new Date(`${pack.endsOn}T23:59:59`) : undefined;
  const { hours, minutes } = parseScheduleTime(pack.scheduleTime);
  const who = pack.assignedTo ? `${pack.assignedTo} has ` : '';
  const whoPrefix = pack.assignedTo ? `${pack.assignedTo} · ` : '';

  const candidateDates: Date[] = [];
  const currentDayIndex = now.getDay();

  for (const dayId of pack.scheduleDays) {
    const targetDayIndex = dayIndexMap[dayId];
    if (targetDayIndex == null) continue;

    let baseOffset = (targetDayIndex - currentDayIndex + 7) % 7;

    for (let w = 0; w < maxWeeks; w++) {
      const daysAhead = baseOffset + w * 7;
      const classDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + daysAhead,
        hours,
        minutes,
        0,
        0
      );

      if (startsLimit && classDate < startsLimit) continue;
      if (endLimit && classDate > endLimit) continue;
      if (classDate.getTime() <= now.getTime()) continue;

      candidateDates.push(classDate);
    }
  }

  // Sort candidate occurrences chronologically across multiple schedule days
  candidateDates.sort((a, b) => a.getTime() - b.getTime());

  // Deduplicate timestamps if any
  const uniqueOccurrences = candidateDates.filter(
    (d, idx, arr) => idx === 0 || d.getTime() !== arr[idx - 1].getTime()
  );

  // Limit candidates to remaining class count
  const selectedOccurrences =
    remaining != null ? uniqueOccurrences.slice(0, remaining) : uniqueOccurrences;

  const triggers: ClassNotificationTrigger[] = [];

  for (const classDate of selectedOccurrences) {
    const dateStr = localDayKey(classDate);

    // 1. Day before reminder (at 18:00 local time the evening prior)
    const dayBeforeDate = new Date(
      classDate.getFullYear(),
      classDate.getMonth(),
      classDate.getDate() - 1,
      18,
      0,
      0,
      0
    );
    if (dayBeforeDate.getTime() > now.getTime()) {
      triggers.push({
        identifier: `${classReminderIdPrefix(pack.id)}-eve-${dateStr}`,
        title: `${whoPrefix}${pack.title} class tomorrow`,
        body: `${who}${pack.title} class is tomorrow${pack.scheduleTime ? ` at ${pack.scheduleTime}` : ''}.`,
        date: dayBeforeDate,
        data: {
          type: 'class',
          packId: pack.id,
          href: `/classes/${pack.id}`,
        },
      });
    }

    // 2. Morning-of reminder (at 8:00 AM local time, only if class is strictly after 8:00 AM)
    const isMorningBeforeClass = hours > 8 || (hours === 8 && minutes > 0);
    const dayOfDate = new Date(
      classDate.getFullYear(),
      classDate.getMonth(),
      classDate.getDate(),
      8,
      0,
      0,
      0
    );
    if (isMorningBeforeClass && dayOfDate.getTime() > now.getTime()) {
      triggers.push({
        identifier: `${classReminderIdPrefix(pack.id)}-day-${dateStr}`,
        title: `${whoPrefix}${pack.title} class today`,
        body: `${who}${pack.title} class is today${pack.scheduleTime ? ` at ${pack.scheduleTime}` : ''}.`,
        date: dayOfDate,
        data: {
          type: 'class',
          packId: pack.id,
          href: `/classes/${pack.id}`,
        },
      });
    }
  }

  return triggers.sort((a, b) => a.date.getTime() - b.date.getTime());
}
