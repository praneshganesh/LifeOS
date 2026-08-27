import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'lifeos:profile:v1';

export type LocalProfile = {
  displayName: string;
  locale?: string;
  /** ISO 4217 household default (expenses, subscriptions, Talk). */
  currency?: string;
};

export const DEFAULT_PROFILE: LocalProfile = {
  displayName: 'You',
  locale: '',
  currency: '',
};

export async function loadLocalProfile(): Promise<LocalProfile> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    const parsed = JSON.parse(raw) as Partial<LocalProfile>;
    const locale = parsed.locale?.trim() || '';
    const currency = parsed.currency?.trim().toUpperCase() || '';
    return {
      displayName: parsed.displayName?.trim() || DEFAULT_PROFILE.displayName,
      // 'On this device' was the old default placeholder — treat as unset.
      locale: locale === 'On this device' ? '' : locale,
      currency: /^[A-Z]{3}$/.test(currency) ? currency : '',
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export async function saveLocalProfile(profile: LocalProfile): Promise<void> {
  const currency = profile.currency?.trim().toUpperCase() || '';
  const next: LocalProfile = {
    displayName: profile.displayName.trim() || DEFAULT_PROFILE.displayName,
    locale: profile.locale?.trim() || DEFAULT_PROFILE.locale,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : '',
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  void import('@/lib/cloud/sync').then((m) => m.scheduleCloudPush()).catch(() => undefined);
}
