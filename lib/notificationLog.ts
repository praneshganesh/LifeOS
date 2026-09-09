import { Platform } from 'react-native';
import { loadVersioned, saveVersioned } from '@/lib/storage/versioned';
import { hrefFromNotificationData } from '@/lib/notificationHref';

/**
 * Local history of OS notifications that were actually delivered, so the
 * Notifications screen can answer "what was that push about?".
 * Populated from foreground deliveries, taps, and a sync of whatever is
 * still sitting in the OS notification center.
 */

export type DeliveredNotification = {
  /** OS request identifier + delivery day (recurring reminders repeat ids). */
  id: string;
  title: string;
  body?: string;
  href?: string | null;
  /** ISO timestamp of delivery (best known). */
  receivedAt: string;
};

const KEY = 'lifeos:notification-log:v1';
const VERSION = 1;
const MAX_ENTRIES = 100;

export async function loadNotificationLog(): Promise<DeliveredNotification[]> {
  return loadVersioned<DeliveredNotification[]>(KEY, VERSION, []);
}

export async function recordDeliveredNotifications(
  entries: DeliveredNotification[]
): Promise<void> {
  if (!entries.length) return;
  const existing = await loadNotificationLog();
  const seen = new Set(existing.map((e) => e.id));
  const fresh = entries.filter((e) => e.title && !seen.has(e.id));
  if (!fresh.length) return;
  const merged = [...fresh, ...existing]
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    .slice(0, MAX_ENTRIES);
  await saveVersioned(KEY, VERSION, merged);
}

export async function clearNotificationLog(): Promise<void> {
  await saveVersioned(KEY, VERSION, []);
}

type OsNotification = {
  date?: number;
  request: {
    identifier: string;
    content: {
      title?: string | null;
      body?: string | null;
      data?: Record<string, unknown>;
    };
  };
};

/** Normalize an expo-notifications Notification into a log entry. */
export function entryFromOsNotification(
  notification: OsNotification,
  fallbackDate = Date.now()
): DeliveredNotification {
  const deliveredMs =
    typeof notification.date === 'number' && notification.date > 0
      ? // expo reports seconds on iOS, ms on Android — normalize.
        notification.date < 1e12
        ? notification.date * 1000
        : notification.date
      : fallbackDate;
  const receivedAt = new Date(deliveredMs).toISOString();
  return {
    id: `${notification.request.identifier}:${receivedAt.slice(0, 10)}`,
    title: notification.request.content.title?.trim() || 'Notification',
    body: notification.request.content.body?.trim() || undefined,
    href: hrefFromNotificationData(notification.request.content.data),
    receivedAt,
  };
}

/**
 * Pull notifications still visible in the OS notification center into the
 * log — catches deliveries that happened while the app was closed.
 */
export async function syncDeliveredFromOS(): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  try {
    const Notifications = await import('expo-notifications');
    const presented = await Notifications.getPresentedNotificationsAsync();
    await recordDeliveredNotifications(
      presented.map((n) => entryFromOsNotification(n as OsNotification))
    );
  } catch {
    /* permissions missing / web — history just stays as-is */
  }
}
