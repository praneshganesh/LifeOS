import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Href } from 'expo-router';
import { hrefFromNotificationData } from '@/lib/notificationHref';

export { hrefFromNotificationData };

const HANDLED_KEY = 'lifeos:notif-last-handled:v1';

type PushRouter = {
  push: (href: Href) => void;
};

function isNative() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function responseKey(response: {
  notification: { request: { identifier: string } };
  actionIdentifier?: string;
}): string {
  return `${response.notification.request.identifier}:${response.actionIdentifier ?? 'default'}`;
}

/**
 * Route OS notification taps into Expo Router using payload `data.href`.
 * Dedupes cold-start `getLastNotificationResponseAsync` so relaunches
 * don’t re-open the last tapped reminder.
 */
export async function attachNotificationDeepLinks(
  router: PushRouter
): Promise<() => void> {
  if (!isNative()) return () => undefined;

  try {
    const Notifications = await import('expo-notifications');

    const go = (data: Record<string, unknown> | undefined) => {
      const href = hrefFromNotificationData(data);
      if (!href) return;
      setTimeout(() => {
        try {
          router.push(href as Href);
        } catch {
          /* ignore */
        }
      }, 80);
    };

    const markHandled = async (key: string) => {
      try {
        await AsyncStorage.setItem(HANDLED_KEY, key);
      } catch {
        /* ignore */
      }
    };

    const last = await Notifications.getLastNotificationResponseAsync();
    if (last?.notification?.request?.content?.data) {
      const key = responseKey(last);
      let prev: string | null = null;
      try {
        prev = await AsyncStorage.getItem(HANDLED_KEY);
      } catch {
        /* ignore */
      }
      if (prev !== key) {
        await markHandled(key);
        go(last.notification.request.content.data as Record<string, unknown>);
      }
    }

    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        void markHandled(responseKey(response));
        go(response.notification.request.content.data as Record<string, unknown>);
      }
    );

    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}
