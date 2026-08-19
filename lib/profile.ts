import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'lifeos:profile:v1';

export type LocalProfile = {
  displayName: string;
  locale?: string;
};

export const DEFAULT_PROFILE: LocalProfile = {
  displayName: 'You',
  locale: 'On this device',
};

export async function loadLocalProfile(): Promise<LocalProfile> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    const parsed = JSON.parse(raw) as Partial<LocalProfile>;
    return {
      displayName: parsed.displayName?.trim() || DEFAULT_PROFILE.displayName,
      locale: parsed.locale?.trim() || DEFAULT_PROFILE.locale,
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export async function saveLocalProfile(profile: LocalProfile): Promise<void> {
  const next: LocalProfile = {
    displayName: profile.displayName.trim() || DEFAULT_PROFILE.displayName,
    locale: profile.locale?.trim() || DEFAULT_PROFILE.locale,
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  void import('@/lib/cloud/sync').then((m) => m.scheduleCloudPush()).catch(() => undefined);
}
