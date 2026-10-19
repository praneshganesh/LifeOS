import { Platform } from 'react-native';
import {
  EXPIRY_ID_PREFIX,
  planExpiryNotifications,
  type ExpiryPlanInput,
} from '@/lib/expiryPlan';

let syncChain: Promise<void> = Promise.resolve();

/** Replace all scheduled expiry alerts with a fresh plan. */
export function syncExpiryNotifications(input: ExpiryPlanInput): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return Promise.resolve();
  syncChain = syncChain.then(() => runSync(input)).catch(() => undefined);
  return syncChain;
}

async function runSync(input: ExpiryPlanInput) {
  const Notifications = await import('expo-notifications');
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.identifier.startsWith(EXPIRY_ID_PREFIX)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
  const plan = planExpiryNotifications(input);
  if (!plan.length) return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('lifeos-reminders', {
      name: 'Saavi reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#5F7350',
    });
  }
  const channel = Platform.OS === 'android' ? { channelId: 'lifeos-reminders' } : null;
  for (const n of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: {
        title: n.title,
        body: n.body,
        data: { type: `expiry_${n.kind}`, href: n.href },
        sound: true,
        ...channel,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: n.at,
        ...channel,
      },
    });
  }
}
