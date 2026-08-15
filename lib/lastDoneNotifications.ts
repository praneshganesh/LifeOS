import { Platform } from 'react-native';
import type { LastDoneItem } from '@/lib/lastDone';
import { daysUntil, formatInterval } from '@/lib/lastDone';

const ID_PREFIX = 'lifeos-ld-';

function reminderId(itemId: string) {
  return `${ID_PREFIX}${itemId}`;
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

/** Fire at 9:00 local on remind day; if past, nudge in ~60s. */
function triggerDate(remindAt: string, now = new Date()): Date | null {
  const m = remindAt.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const target = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    9,
    0,
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
    await Notifications.cancelScheduledNotificationAsync(reminderId(itemId));
  } catch {
    /* ignore */
  }
}

export async function scheduleLastDoneReminder(
  item: LastDoneItem
): Promise<void> {
  if (!isNative()) return;
  if (!item.remindAt) {
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

  const when = triggerDate(item.remindAt);
  if (!when) {
    await cancelLastDoneReminder(item.id);
    return;
  }

  const granted = await ensureNotificationPermissions();
  if (!granted) return;

  const days = daysUntil(item.remindAt);
  const body =
    days < 0
      ? 'This is overdue — mark it done when you can.'
      : days === 0
        ? 'Due today.'
        : item.remindInterval
          ? `Due in ${days} days · every ${formatInterval(item.remindInterval)}`
          : `Due in ${days} days.`;

  try {
    const Notifications = await notifications();
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('lifeos-reminders', {
        name: 'LifeOS reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#5F7350',
      });
    }
    await Notifications.cancelScheduledNotificationAsync(reminderId(item.id));
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
        ...(Platform.OS === 'android'
          ? { channelId: 'lifeos-reminders' }
          : null),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
        ...(Platform.OS === 'android'
          ? { channelId: 'lifeos-reminders' }
          : null),
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
    if (!prefs.push || !prefs.maintenance) {
      const Notifications = await notifications();
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const n of scheduled) {
        if (n.identifier.startsWith(ID_PREFIX)) {
          await Notifications.cancelScheduledNotificationAsync(n.identifier);
        }
      }
      return;
    }
    const Notifications = await notifications();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.identifier.startsWith(ID_PREFIX)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
    for (const item of items) {
      if (item.remindAt) {
        await scheduleLastDoneReminder(item);
      }
    }
  } catch {
    /* ignore */
  }
}
