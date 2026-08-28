import { Platform } from 'react-native';
import type { ClassPack } from '@/lib/classes';
import {
  packStatus,
  remainingCount,
} from '@/lib/classes';
import {
  calculateUpcomingClassTriggers,
  classReminderIdPrefix,
  type ClassNotificationTrigger,
} from '@/lib/classSchedule';
import { ensureNotificationHandler, ensureNotificationPermissions } from '@/lib/lastDoneNotifications';

export {
  calculateUpcomingClassTriggers,
  classReminderIdPrefix,
  parseScheduleTime,
  type ClassNotificationTrigger,
} from '@/lib/classSchedule';

const ID_PREFIX = 'lifeos-cls-';

function isNative() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

async function notifications() {
  return import('expo-notifications');
}

export async function cancelClassReminders(packId: string): Promise<void> {
  if (!isNative()) return;
  try {
    const Notifications = await notifications();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const prefix = classReminderIdPrefix(packId);
    for (const n of scheduled) {
      if (n.identifier.startsWith(prefix)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch (err) {
    if (__DEV__) {
      console.warn('[Saavi classes] Failed to cancel class reminders', err);
    }
  }
}

export async function scheduleClassReminders(
  pack: ClassPack,
  options?: { skipCancel?: boolean }
): Promise<void> {
  if (!isNative()) return;

  if (!options?.skipCancel) {
    await cancelClassReminders(pack.id);
  }

  if (!pack.scheduleDays || !pack.scheduleDays.length) return;
  if (packStatus(pack) === 'expired' || remainingCount(pack) === 0) return;

  try {
    const { loadNotificationPrefs } = await import('@/lib/notificationPrefs');
    const prefs = await loadNotificationPrefs();
    if (!prefs.push) return;
  } catch (err) {
    if (__DEV__) {
      console.warn('[Saavi classes] Failed to load notification preferences', err);
    }
    return;
  }

  const granted = await ensureNotificationPermissions();
  if (!granted) return;

  const triggers = calculateUpcomingClassTriggers(pack);
  if (!triggers.length) return;

  try {
    const Notifications = await notifications();
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('lifeos-classes', {
        name: 'Saavi class reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#5F7350',
      });
    }

    for (const t of triggers) {
      await Notifications.scheduleNotificationAsync({
        identifier: t.identifier,
        content: {
          title: t.title,
          body: t.body,
          data: t.data,
          sound: true,
          ...(Platform.OS === 'android'
            ? { channelId: 'lifeos-classes' }
            : null),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: t.date,
          ...(Platform.OS === 'android'
            ? { channelId: 'lifeos-classes' }
            : null),
        },
      });
    }
  } catch (err) {
    if (__DEV__) {
      console.warn('[Saavi classes] Failed to schedule class reminders', err);
    }
  }
}

export async function syncClassReminders(packs: ClassPack[]): Promise<void> {
  if (!isNative()) return;
  try {
    await ensureNotificationHandler();
    const Notifications = await notifications();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.identifier.startsWith(ID_PREFIX)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
    for (const pack of packs) {
      await scheduleClassReminders(pack, { skipCancel: true });
    }
  } catch (err) {
    if (__DEV__) {
      console.warn('[Saavi classes] Failed to sync class reminders', err);
    }
  }
}
