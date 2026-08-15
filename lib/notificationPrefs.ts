import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'lifeos:notif-prefs:v1';

export type NotificationPrefs = {
  /** Master switch — request OS permission when enabled */
  push: boolean;
  maintenance: boolean;
  warranties: boolean;
  insurance: boolean;
  returns: boolean;
  documents: boolean;
  family: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  push: true,
  maintenance: true,
  warranties: true,
  insurance: true,
  returns: true,
  documents: true,
  family: true,
};

export async function loadNotificationPrefs(): Promise<NotificationPrefs> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_PREFS };
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return { ...DEFAULT_NOTIFICATION_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

export async function saveNotificationPrefs(
  prefs: NotificationPrefs
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}
