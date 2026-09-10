import { Platform } from 'react-native';
import type { LastDoneItem } from '@/lib/lastDone';
import {
  daysUntil,
  formatInterval,
  listWeekdayOccurrences,
  reminderSeriesEnded,
} from '@/lib/lastDone';

const ID_PREFIX = 'lifeos-ld-';

function reminderId(itemId: string) {
  return `${ID_PREFIX}${itemId}`;
}

function localStamp(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function isNative() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

let handlerReady = false;

async function notifications() {
  return import('expo-notifications');
}

/** Show banners while app is foregrounded (iOS/Android). */
export async function ensureNotificationHandler() {
  if (!isNative() || handlerReady) return;
  handlerReady = true;
  const Notifications = await notifications();
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function getNotificationPermission(): Promise<
  'granted' | 'denied' | 'undetermined' | 'unavailable'
> {
  if (!isNative()) return 'unavailable';
  try {
    const Notifications = await notifications();
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'unavailable';
  }
}

/** Request alert permission. No-op on web. */
export async function ensureNotificationPermissions(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await ensureNotificationHandler();
    const Notifications = await notifications();
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return true;
    if (!current.canAskAgain && current.status === 'denied') return false;
    const next = await Notifications.requestPermissionsAsync();
    return next.status === 'granted';
  } catch {
    return false;
  }
}

/** Fire at hour:minute local on remind day; if past, nudge in ~60s. */
function triggerDate(
  remindAt: string,
  hour = 9,
  minute = 0,
  now = new Date()
): Date | null {
  const m = remindAt.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const target = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    hour,
    minute,
    0,
    0
  );
  if (Number.isNaN(target.getTime())) return null;
  if (target.getTime() <= now.getTime()) {
    return new Date(now.getTime() + 60_000);
  }
  return target;
}

export async function cancelLastDoneReminder(itemId: string): Promise<void> {
  if (!isNative()) return;
  try {
    const Notifications = await notifications();
    const prefix = reminderId(itemId);
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.identifier === prefix || n.identifier.startsWith(`${prefix}-`)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch {
    /* ignore */
  }
}

export async function scheduleLastDoneReminder(
  item: LastDoneItem
): Promise<void> {
  if (!isNative()) return;
  if (!item.remindAt && item.remindInterval?.unit !== 'weekdays') {
    await cancelLastDoneReminder(item.id);
    return;
  }

  try {
    const { loadNotificationPrefs } = await import('@/lib/notificationPrefs');
    const prefs = await loadNotificationPrefs();
    if (!prefs.push || !prefs.maintenance) {
      await cancelLastDoneReminder(item.id);
      return;
    }
  } catch {
    /* continue with schedule if prefs fail */
  }

  const granted = await ensureNotificationPermissions();
  if (!granted) return;

  try {
    const Notifications = await notifications();
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('lifeos-reminders', {
        name: 'Saavi reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#5F7350',
      });
    }

    await cancelLastDoneReminder(item.id);

    const channel =
      Platform.OS === 'android' ? { channelId: 'lifeos-reminders' } : null;

    if (
      item.remindInterval?.unit === 'weekdays' &&
      item.remindInterval.weekdays?.length
    ) {
      if (reminderSeriesEnded(item.remindInterval)) {
        return;
      }

      const hour = item.remindInterval.hour ?? 9;
      const minute = item.remindInterval.minute ?? 0;
      const body = formatInterval(item.remindInterval);

      // Finite series: schedule each remaining occurrence as a DATE trigger.
      if (item.remindInterval.endsAt) {
        const dates = listWeekdayOccurrences(
          item.remindInterval.weekdays,
          hour,
          minute,
          new Date(),
          item.remindInterval.endsAt,
          48
        );
        for (const when of dates) {
          await Notifications.scheduleNotificationAsync({
            identifier: `${reminderId(item.id)}-d-${localStamp(when)}`,
            content: {
              title: item.label,
              body,
              data: {
                type: 'last_done',
                itemId: item.id,
                href: `/last-done/${item.id}`,
              },
              sound: true,
              ...channel,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: when,
              ...channel,
            },
          });
        }
        return;
      }

      // Indefinite: one weekly OS trigger per weekday.
      for (const jsDay of item.remindInterval.weekdays) {
        await Notifications.scheduleNotificationAsync({
          identifier: `${reminderId(item.id)}-wd-${jsDay}`,
          content: {
            title: item.label,
            body,
            data: {
              type: 'last_done',
              itemId: item.id,
              href: `/last-done/${item.id}`,
            },
            sound: true,
            ...channel,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: jsDay + 1,
            hour,
            minute,
            ...channel,
          },
        });
      }
      return;
    }

    if (!item.remindAt) return;

    const hour = item.remindInterval?.hour ?? 9;
    const minute = item.remindInterval?.minute ?? 0;
    const when = triggerDate(item.remindAt, hour, minute);
    if (!when) {
      await cancelLastDoneReminder(item.id);
      return;
    }

    const days = daysUntil(item.remindAt);
    const body =
      days < 0
        ? 'This is overdue — mark it done when you can.'
        : days === 0
          ? 'Due today.'
          : item.remindInterval
            ? `Due in ${days} days · every ${formatInterval(item.remindInterval)}`
            : `Due in ${days} days.`;

    await Notifications.scheduleNotificationAsync({
      identifier: reminderId(item.id),
      content: {
        title: item.label,
        body,
        data: {
          type: 'last_done',
          itemId: item.id,
          href: `/last-done/${item.id}`,
        },
        sound: true,
        ...channel,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
        ...channel,
      },
    });
  } catch {
    /* ignore — simulator / denied */
  }
}

/** Reschedule all Last Done reminders after load or bulk change. */
export async function syncLastDoneReminders(
  items: LastDoneItem[]
): Promise<void> {
  if (!isNative()) return;
  try {
    await ensureNotificationHandler();
    const { loadNotificationPrefs } = await import('@/lib/notificationPrefs');
    const prefs = await loadNotificationPrefs();
    const Notifications = await notifications();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.identifier.startsWith(ID_PREFIX)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
    if (!prefs.push || !prefs.maintenance) return;
    for (const item of items) {
      if (item.remindAt || item.remindInterval?.unit === 'weekdays') {
        await scheduleLastDoneReminder(item);
      }
    }
  } catch {
    /* ignore */
  }
}
