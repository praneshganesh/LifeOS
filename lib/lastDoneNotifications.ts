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

/** iOS keeps only 64 pending local notifications per app. */
export const IOS_PENDING_NOTIFICATION_CAP = 64;

/** Per weekday-series date expansion before the global cap trims. */
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

type PlannedLocal = {
  /** Soonest fire — used to pick the global soonest-64. */
  sortAt: number;
  identifier: string;
  title: string;
  body: string;
  itemId: string;
  /** DATE trigger instant, or null for WEEKLY. */
  date: Date | null;
  weekly?: { weekday: number; hour: number; minute: number };
};

/** Next local occurrence of a JS weekday (0=Sun) at hour:minute after `from`. */
function nextWeeklyFire(
  jsDay: number,
  hour: number,
  minute: number,
  from: Date
): Date {
  for (let i = 0; i < 8; i++) {
    const cand = new Date(from);
    cand.setDate(from.getDate() + i);
    cand.setHours(hour, minute, 0, 0);
    if (cand.getDay() === jsDay && cand.getTime() > from.getTime()) return cand;
  }
  const fallback = new Date(from);
  fallback.setDate(from.getDate() + 7);
  fallback.setHours(hour, minute, 0, 0);
  return fallback;
}

/**
 * Build every pending last-done local notification (one-shot dated, finite
 * weekday dates, and indefinite weekly triggers). Includes category "Other"
 * / once-schedule items — same `lifeos-ld-*` namespace.
 */
export function planLastDoneLocals(
  items: LastDoneItem[],
  prefs: NotificationPrefs,
  now = new Date()
): PlannedLocal[] {
  const out: PlannedLocal[] = [];

  for (const item of items) {
    if (item.onceDone && !item.remindInterval) continue;

    if (
      item.remindInterval?.unit === 'weekdays' &&
      item.remindInterval.weekdays?.length
    ) {
      if (reminderSeriesEnded(item.remindInterval)) continue;

      const hour = item.remindInterval.hour ?? 9;
      const minute = item.remindInterval.minute ?? 0;
      const body = formatInterval(item.remindInterval);

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
          if (when.getTime() <= now.getTime()) continue;
          out.push({
            sortAt: when.getTime(),
            identifier: `${reminderId(item.id)}-d-${localStamp(when)}`,
            title: item.label,
            body,
            itemId: item.id,
            date: when,
          });
        }
        continue;
      }

      for (const jsDay of item.remindInterval.weekdays) {
        const next = nextWeeklyFire(jsDay, hour, minute, now);
        out.push({
          sortAt: next.getTime(),
          identifier: `${reminderId(item.id)}-wd-${jsDay}`,
          title: item.label,
          body,
          itemId: item.id,
          date: null,
          weekly: { weekday: jsDay + 1, hour, minute },
        });
      }
      continue;
    }

    if (!item.remindAt) continue;

    const fires = planDatedReminderFires(item, prefs, now);
    for (const fire of fires) {
      out.push({
        sortAt: fire.at.getTime(),
        identifier: `${reminderId(item.id)}-a-${fire.at.getTime()}`,
        title: fire.title,
        body: fire.body,
        itemId: item.id,
        date: fire.at,
      });
    }
  }

  return out;
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return null;
  const Notifications = await notifications();
  await Notifications.setNotificationChannelAsync('lifeos-reminders', {
    name: 'Saavi reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#5F7350',
  });
  return { channelId: 'lifeos-reminders' as const };
}

/**
 * Schedule one item’s locals. Prefer `syncLastDoneReminders` so the global
 * soonest-64 cap is applied; this path still cancels+rebuilds that item only
 * (used when a full list isn’t handy).
 */
export async function scheduleLastDoneReminder(
  item: LastDoneItem
): Promise<void> {
  if (!isNative()) return;
  if (item.onceDone && !item.remindInterval) {
    await cancelLastDoneReminder(item.id);
    return;
  }
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
    const channel = await ensureAndroidChannel();
    await cancelLastDoneReminder(item.id);

    const planned = planLastDoneLocals([item], prefs).sort(
      (a, b) => a.sortAt - b.sortAt
    );
    for (const p of planned.slice(0, IOS_PENDING_NOTIFICATION_CAP)) {
      await scheduleOne(Notifications, p, channel);
    }
  } catch {
    /* ignore, simulator / denied */
  }
}

async function scheduleOne(
  Notifications: typeof import('expo-notifications'),
  p: PlannedLocal,
  channel: { channelId: string } | null
) {
  if (p.weekly) {
    await Notifications.scheduleNotificationAsync({
      identifier: p.identifier,
      content: {
        title: p.title,
        body: p.body,
        data: {
          type: 'last_done',
          itemId: p.itemId,
          href: `/last-done/${p.itemId}`,
        },
        sound: true,
        ...channel,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: p.weekly.weekday,
        hour: p.weekly.hour,
        minute: p.weekly.minute,
        ...channel,
      },
    });
    return;
  }
  if (!p.date) return;
  await Notifications.scheduleNotificationAsync({
    identifier: p.identifier,
    content: {
      title: p.title,
      body: p.body,
      data: {
        type: 'last_done',
        itemId: p.itemId,
        href: `/last-done/${p.itemId}`,
      },
      sound: true,
      ...channel,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: p.date,
      ...channel,
    },
  });
}

/**
 * Cancel every `lifeos-ld-*` notification and rebuild from items, keeping only
 * the soonest {@link IOS_PENDING_NOTIFICATION_CAP}. Call on load, foreground,
 * and after bulk changes so later alerts fill in as earlier ones fire.
 *
 * Covers one-off / "Other" / once-schedule activities (dated `remindAt`) and
 * weekday series — same namespace, same rebuild.
 */
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

    const granted = await ensureNotificationPermissions();
    if (!granted) return;

    const channel = await ensureAndroidChannel();
    const planned = planLastDoneLocals(items, prefs).sort(
      (a, b) => a.sortAt - b.sortAt
    );
    for (const p of planned.slice(0, IOS_PENDING_NOTIFICATION_CAP)) {
      await scheduleOne(Notifications, p, channel);
    }
  } catch {
    /* ignore */
  }
}
