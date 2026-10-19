import { Platform } from 'react-native';
import type { LastDoneItem } from '@/lib/lastDone';
import {
  formatInterval,
  listWeekdayOccurrences,
  reminderSeriesEnded,
  seriesAnchorDate,
} from '@/lib/lastDone';
import {
  DEFAULT_NOTIFICATION_PREFS,
  loadNotificationPrefs,
  type NotificationPrefs,
} from '@/lib/notificationPrefs';
import { planDatedReminderFires } from '@/lib/reminderAlerts';

/** iOS keeps only 64 pending local notifications per app; leave room for others. */
const MAX_SERIES_OCCURRENCES = 14;

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

  let prefs: NotificationPrefs = DEFAULT_NOTIFICATION_PREFS;
  try {
    prefs = await loadNotificationPrefs();
    if (!prefs.push) {
      await cancelLastDoneReminder(item.id);
      return;
    }
  } catch {
    /* continue with defaults if prefs fail */
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
          seriesAnchorDate(item.remindInterval.startsAt),
          item.remindInterval.endsAt,
          MAX_SERIES_OCCURRENCES
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

    const fires = planDatedReminderFires(item, prefs);
    for (const fire of fires) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${reminderId(item.id)}-a-${fire.at.getTime()}`,
        content: {
          title: fire.title,
          body: fire.body,
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
          date: fire.at,
          ...channel,
        },
      });
    }
  } catch {
    /* ignore, simulator / denied */
  }
}

/** Reschedule all Last Done reminders after load or bulk change. */
export async function syncLastDoneReminders(
  items: LastDoneItem[]
): Promise<void> {
  if (!isNative()) return;
  try {
    await ensureNotificationHandler();
    const prefs = await loadNotificationPrefs();
    const Notifications = await notifications();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.identifier.startsWith(ID_PREFIX)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
    if (!prefs.push) return;
    for (const item of items) {
      if (item.remindAt || item.remindInterval?.unit === 'weekdays') {
        await scheduleLastDoneReminder(item);
      }
    }
  } catch {
    /* ignore */
  }
}
