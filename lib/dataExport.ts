import { Platform, Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import { defaultSpacesPayload } from '@/lib/spacesDefaults';

/** All LifeOS on-device store keys (export + wipe). */
export const LIFEOS_STORAGE_KEYS = [
  'lifeos:inventory:v1',
  'lifeos:expenses:v1',
  'lifeos:habits:v1',
  'lifeos:classes:v1',
  'lifeos:subscriptions:v1',
  'lifeos:last-done:v2',
  'lifeos:last-done:v1',
  'lifeos:household:v1',
  'lifeos:spaces:v2',
  'lifeos:spaces:v1',
  'lifeos:notif-prefs:v1',
  'lifeos:profile:v1',
  'lifeos:onboarding:v1',
  'lifeos:appearance:v1',
  'lifeos:security:v1',
  'lifeos:plan:v1',
  'lifeos:talk-voice:v1',
] as const;

export type LifeOsBackup = {
  exportedAt: string;
  app: string;
  version: string;
  stores: Record<string, unknown>;
};

export async function buildLifeOsBackup(version = '1.0.0'): Promise<LifeOsBackup> {
  const pairs = await AsyncStorage.multiGet([...LIFEOS_STORAGE_KEYS]);
  const stores: Record<string, unknown> = {};
  for (const [key, raw] of pairs) {
    if (raw == null) continue;
    try {
      stores[key] = JSON.parse(raw);
    } catch {
      stores[key] = raw;
    }
  }
  return {
    exportedAt: new Date().toISOString(),
    app: 'LifeOS',
    version,
    stores,
  };
}

export async function shareLifeOsBackup(
  version = '1.0.0'
): Promise<'shared' | 'cancelled' | 'unavailable'> {
  const backup = await buildLifeOsBackup(version);
  const json = JSON.stringify(backup, null, 2);
  const filename = `lifeos-backup-${backup.exportedAt.slice(0, 10)}.json`;

  if (Platform.OS === 'web') {
    try {
      await Share.share({ title: filename, message: json });
      return 'shared';
    } catch {
      return 'unavailable';
    }
  }

  try {
    const FileSystem = await import('expo-file-system/legacy');
    const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!dir) {
      await Share.share({ title: filename, message: json });
      return 'shared';
    }
    const uri = `${dir}${filename}`;
    await FileSystem.writeAsStringAsync(uri, json, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const available = await Sharing.isAvailableAsync();
    if (available) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/json',
        dialogTitle: 'Export LifeOS backup',
        UTI: 'public.json',
      });
      return 'shared';
    }
    await Share.share({ title: filename, message: json, url: uri });
    return 'shared';
  } catch {
    try {
      await Share.share({ title: filename, message: json });
      return 'shared';
    } catch {
      return 'unavailable';
    }
  }
}

/**
 * Wipe all LifeOS AsyncStorage keys and re-seed default spaces.
 * Callers should reload the app so React contexts rehydrate.
 */
export async function wipeLifeOsData(): Promise<void> {
  await AsyncStorage.multiRemove([...LIFEOS_STORAGE_KEYS]);
  await AsyncStorage.setItem(
    'lifeos:spaces:v2',
    JSON.stringify(defaultSpacesPayload())
  );
  try {
    const { clearOnboarding } = await import('@/lib/onboarding');
    await clearOnboarding();
  } catch {
    /* ignore */
  }
  try {
    const { DEFAULT_SECURITY_PREFS, saveSecurityPrefs } = await import(
      '@/lib/securityPrefs'
    );
    await saveSecurityPrefs({ ...DEFAULT_SECURITY_PREFS });
  } catch {
    /* ignore */
  }
}

export async function reloadAppAfterWipe(): Promise<void> {
  try {
    const Updates = await import('expo-updates');
    await Updates.reloadAsync();
  } catch {
    /* Expo Go / web — caller shows restart message */
  }
}
