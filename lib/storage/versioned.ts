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
  try {
    const raw = await AsyncStorage.getItem(key);
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
      await saveVersioned(key, currentVersion, next);
    } else if (!isEnvelope(parsed)) {
      // Rewrite legacy bare payload into an envelope
      await saveVersioned(key, currentVersion, next);
    }

    return next;
  } catch {
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
