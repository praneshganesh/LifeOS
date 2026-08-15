import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { attachNotificationDeepLinks } from '@/lib/notificationRouting';

/** Wires OS notification taps to in-app routes (P3). */
export function NotificationDeepLinkHost() {
  const router = useRouter();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void attachNotificationDeepLinks(router).then((fn) => {
      cleanup = fn;
    });
    return () => {
      cleanup?.();
    };
  }, [router]);

  return null;
}
