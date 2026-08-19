import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const STORAGE_KEY = 'lifeos:security:v1';

export type SecurityPrefs = {
  /** Require Face ID / biometrics (or device passcode) to open the app */
  biometrics: boolean;
  /** Lock again after backgrounding (5 minutes) */
  autoLock: boolean;
};

export const DEFAULT_SECURITY_PREFS: SecurityPrefs = {
  biometrics: false,
  autoLock: true,
};

const AUTO_LOCK_MS = 5 * 60 * 1000;

export function autoLockMs() {
  return AUTO_LOCK_MS;
}

async function readRaw(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(STORAGE_KEY);
  } catch {
    return null;
  }
}

async function writeRaw(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.setItemAsync(STORAGE_KEY, value);
}

export async function loadSecurityPrefs(): Promise<SecurityPrefs> {
  try {
    const raw = await readRaw();
    if (!raw) return { ...DEFAULT_SECURITY_PREFS };
    const parsed = JSON.parse(raw) as Partial<SecurityPrefs>;
    return { ...DEFAULT_SECURITY_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_SECURITY_PREFS };
  }
}

export async function saveSecurityPrefs(prefs: SecurityPrefs): Promise<void> {
  await writeRaw(JSON.stringify(prefs));
}
