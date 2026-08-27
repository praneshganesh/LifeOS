import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Versioned AsyncStorage envelopes for F2.
 * Legacy bare JSON (array/object) is accepted and rewritten on first load.
 */

/**
 * Versioned AsyncStorage envelopes for F2.
 * Legacy bare JSON (array/object) is accepted and rewritten on first load.
 */

export type VersionedEnvelope<T> = {
  v: number;
  data: T;
};

export type StorageLoadFailure = { key: string; message: string; backedUp: boolean };

const loadFailures: StorageLoadFailure[] = [];

/**
 * Stores that failed to load this session (corrupt JSON / read error).
 * Surfaced in Settings → Export & backup so a wiped-looking module is
 * distinguishable from genuinely empty data.
 */
export function getStorageLoadFailures(): StorageLoadFailure[] {
  return [...loadFailures];
}

export function isEnvelope(raw: unknown): raw is VersionedEnvelope<unknown> {
  return (
    Boolean(raw) &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    typeof (raw as VersionedEnvelope<unknown>).v === 'number' &&
    'data' in (raw as object)
  );
}

/**
 * Load a versioned store. `migrate(data, fromVersion)` runs when fromVersion < currentVersion.
 * Legacy bare payloads are treated as version 0.
 */
export async function loadVersioned<T>(
  key: string,
  currentVersion: number,
  empty: T,
  migrate?: (data: unknown, fromVersion: number) => T
): Promise<T> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(key);
    if (!raw) return empty;

    const parsed: unknown = JSON.parse(raw);
    let fromVersion = 0;
    let data: unknown = parsed;

    if (isEnvelope(parsed)) {
      fromVersion = parsed.v;
      data = parsed.data;
    }

    let next = (data ?? empty) as T;
    if (migrate && fromVersion < currentVersion) {
      let v = fromVersion;
      while (v < currentVersion) {
        next = migrate(next, v);
        v += 1;
      }
      // A failed rewrite must not discard successfully loaded data.
      await saveVersioned(key, currentVersion, next).catch(() => undefined);
    } else if (!isEnvelope(parsed)) {
      // Rewrite legacy bare payload into an envelope
      await saveVersioned(key, currentVersion, next).catch(() => undefined);
    }

    return next;
  } catch (err) {
    // Don't silently present corrupt data as "empty": preserve the raw bytes
    // so the user's data is recoverable, and record the failure so the UI
    // can say the store failed to load instead of looking factory-reset.
    let backedUp = false;
    if (raw != null) {
      try {
        await AsyncStorage.setItem(`${key}.corrupt`, raw);
        backedUp = true;
      } catch {
        // best effort — original key is left untouched either way
      }
    }
    loadFailures.push({
      key,
      message: err instanceof Error ? err.message : String(err),
      backedUp,
    });
    console.error(`[storage] failed to load ${key}`, err);
    return empty;
  }
}

export async function saveVersioned<T>(
  key: string,
  version: number,
  data: T
): Promise<void> {
  const envelope: VersionedEnvelope<T> = { v: version, data };
  await AsyncStorage.setItem(key, JSON.stringify(envelope));
  void import('@/lib/cloud/sync').then((m) => m.scheduleCloudPush()).catch(() => undefined);
}

/** Convenience for array stores (inventory, expenses, …). */
export async function loadVersionedArray<T>(
  key: string,
  currentVersion: number,
  migrateItem?: (item: unknown) => T | null
): Promise<T[]> {
  return loadVersioned<T[]>(key, currentVersion, [], (data) => {
    const list = Array.isArray(data) ? data : [];
    if (!migrateItem) return list as T[];
    return list.map(migrateItem).filter((x): x is T => x != null);
  });
}

export async function saveVersionedArray<T>(
  key: string,
  version: number,
  data: T[]
): Promise<void> {
  await saveVersioned(key, version, data);
}
