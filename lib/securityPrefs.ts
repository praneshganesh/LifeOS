import { readSecureStore, writeSecureStore } from '@/lib/secureStore';

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

export async function loadSecurityPrefs(): Promise<SecurityPrefs> {
  try {
    const raw = await readSecureStore('security');
    if (!raw) return { ...DEFAULT_SECURITY_PREFS };
    const parsed = JSON.parse(raw) as Partial<SecurityPrefs>;
    return { ...DEFAULT_SECURITY_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_SECURITY_PREFS };
  }
}

export async function saveSecurityPrefs(prefs: SecurityPrefs): Promise<void> {
  await writeSecureStore('security', JSON.stringify(prefs));
}
