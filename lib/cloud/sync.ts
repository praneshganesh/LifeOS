import AsyncStorage from '@react-native-async-storage/async-storage';
import { fillRandomBytes } from '@/lib/cryptoRandom';
import { isOnboardingDone } from '@/lib/onboarding';
import { readSecureStore, writeSecureStore } from '@/lib/secureStore';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  CLOUD_PREF_KEYS,
  CLOUD_STORE_KEYS,
  LEGACY_DOMAIN_KEYS,
  buildCloudBody,
  formatRecoveryCode,
  generateRecoveryCode,
  isValidRecoveryCode,
  normalizeRecoveryCode,
  type CloudSnapshot,
} from '@/lib/cloud/payload';

const LEGACY_IMPORT_KEY = 'lifeos:cloud:legacyImported:v1';

async function syncEngine() {
  return import('@/lib/sync/engine');
}

/** AsyncStorage only — colons are fine here, not in SecureStore. */
const META_KEY = 'lifeos:cloud:meta:v1';

export type CloudMeta = {
  userId: string | null;
  lastPushAt: string | null;
  lastPullAt: string | null;
  lastError: string | null;
};

const EMPTY_META: CloudMeta = {
  userId: null,
  lastPushAt: null,
  lastPullAt: null,
  lastError: null,
};

export async function loadCloudMeta(): Promise<CloudMeta> {
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    if (!raw) return { ...EMPTY_META };
    const parsed = JSON.parse(raw) as Partial<CloudMeta>;
    return { ...EMPTY_META, ...parsed };
  } catch {
    return { ...EMPTY_META };
  }
}

async function saveCloudMeta(meta: CloudMeta): Promise<void> {
  await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
}

export async function loadRecoveryCode(): Promise<string | null> {
  const raw = await readSecureStore('recovery');
  if (!raw) return null;
  const normalized = normalizeRecoveryCode(raw);
  return normalized.length === 16 ? formatRecoveryCode(normalized) : null;
}

async function ensureRecoveryCode(): Promise<string> {
  const existing = await loadRecoveryCode();
  if (existing) return existing;
  const bytes = new Uint8Array(16);
  fillRandomBytes(bytes);
  const code = generateRecoveryCode(bytes);
  await writeSecureStore('recovery', normalizeRecoveryCode(code));
  return code;
}

async function readLocalStores(
  keys: readonly string[] = CLOUD_PREF_KEYS
): Promise<Record<string, unknown>> {
  const pairs = await AsyncStorage.multiGet([...keys]);
  const stores: Record<string, unknown> = {};
  for (const [key, raw] of pairs) {
    if (raw == null) continue;
    try {
      stores[key] = JSON.parse(raw);
    } catch {
      stores[key] = raw;
    }
  }
  return stores;
}

/**
 * Prefs: overwrite local (blob is their source of truth across devices).
 * Legacy domain keys: only fill an EMPTY local store, once per device.
 * row sync then imports them with ON CONFLICT DO NOTHING.
 */
async function writeLocalStores(stores: Record<string, unknown>): Promise<void> {
  const entries: [string, string][] = [];
  for (const key of CLOUD_PREF_KEYS) {
    if (!(key in stores) || stores[key] == null) continue;
    entries.push([key, JSON.stringify(stores[key])]);
  }

  const imported = (await AsyncStorage.getItem(LEGACY_IMPORT_KEY)) === '1';
  if (!imported) {
    const existing = await AsyncStorage.multiGet([...LEGACY_DOMAIN_KEYS]);
    for (const [key, raw] of existing) {
      if (raw != null) continue;
      if (!(key in stores) || stores[key] == null) continue;
      entries.push([key, JSON.stringify(stores[key])]);
    }
    entries.push([LEGACY_IMPORT_KEY, '1']);
  }

  if (entries.length) await AsyncStorage.multiSet(entries);
}

/**
 * Reuse an existing auth session, or open an anonymous one.
 * By default, do not create a session until onboarding is done — Welcome /
 * first-launch hydration must not leave orphan auth users or recovery rows.
 * Pass `{ create: true }` from "Let's get started", restore, or Apple link.
 */
export async function ensureCloudSession(opts?: {
  create?: boolean;
}): Promise<string | null> {
  if (!supabase) return null;
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session?.user.id) return existing.session.user.id;
  if (opts?.create !== true) {
    const done = await isOnboardingDone().catch(() => false);
    if (!done) return null;
  }
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user?.id ?? null;
}

/**
 * After Sign in with Apple (link or reclaim), pull cloud prefs for this user,
 * re-point row sync at the user's household, and refresh cloud meta.
 */
export async function pullCloudAfterSignIn(userId: string): Promise<CloudMeta> {
  const meta = await loadCloudMeta();
  if (!isSupabaseConfigured() || !supabase) {
    return { ...meta, userId, lastError: null };
  }
  try {
    if (meta.userId && meta.userId !== userId) {
      // Different auth user than before: forget the cached household so the
      // engine resolves the reclaimed account's household and pulls its rows.
      const engine = await syncEngine();
      await engine.resetSyncStateForUser(null);
    }
    const pulled = await pullStores(userId);
    const now = new Date().toISOString();
    if (pulled === 0) {
      await pushStores(userId);
    }
    const next: CloudMeta = {
      userId,
      lastPullAt: now,
      lastPushAt: pulled === 0 ? now : meta.lastPushAt,
      lastError: null,
    };
    await saveCloudMeta(next);
    void syncEngine().then((m) => m.syncRowsNow()).catch(() => undefined);
    return next;
  } catch (e) {
    const next = {
      ...meta,
      userId,
      lastError: e instanceof Error ? e.message : 'Cloud pull failed.',
    };
    await saveCloudMeta(next);
    return next;
  }
}

async function pullStores(userId: string): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from('life_stores')
    .select('store_key, body, updated_at')
    .eq('user_id', userId);
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.length) return 0;
  const stores: Record<string, unknown> = {};
  for (const row of rows) {
    if ((CLOUD_STORE_KEYS as readonly string[]).includes(row.store_key)) {
      stores[row.store_key] = row.body;
    }
  }
  await writeLocalStores(stores);
  return rows.length;
}

/** Prefs-only blob push. Domain rows are owned by `lib/sync/engine.ts`. */
async function pushStores(userId: string): Promise<void> {
  if (!supabase) return;
  const snapshot = buildCloudBody(await readLocalStores(CLOUD_PREF_KEYS), undefined, CLOUD_PREF_KEYS);
  const rows = Object.entries(snapshot.stores).map(([store_key, body]) => ({
    user_id: userId,
    store_key,
    body,
    updated_at: snapshot.exportedAt,
  }));
  if (rows.length) {
    const { error } = await supabase.from('life_stores').upsert(rows, {
      onConflict: 'user_id,store_key',
    });
    if (error) throw error;
  }
  // Recovery only when bound to a household — never create orphan codes.
  const householdId = await (await syncEngine()).getCachedHouseholdId().catch(() => null);
  if (!householdId) return;
  const code = await ensureRecoveryCode();
  const { error: recErr } = await supabase.rpc('upsert_life_recovery', {
    p_code: normalizeRecoveryCode(code),
    p_body: snapshot,
    p_household: householdId,
  });
  if (recErr) throw recErr;
}

export async function bootstrapCloud(): Promise<CloudMeta> {
  const meta = await loadCloudMeta();
  if (!isSupabaseConfigured() || !supabase) {
    return { ...meta, lastError: null };
  }
  try {
    // Intentional start (onboarding CTA or post-onboarding gate).
    const userId = await ensureCloudSession({ create: true });
    if (!userId) {
      const next = { ...meta, lastError: 'Could not open a cloud session.' };
      await saveCloudMeta(next);
      return next;
    }
    await ensureRecoveryCode();
    // Household before recovery upsert so we never write a null-household row.
    const engine = await syncEngine();
    await engine.ensureHouseholdId().catch(() => null);
    const pulled = await pullStores(userId);
    const now = new Date().toISOString();
    if (pulled === 0) {
      await pushStores(userId);
      const next: CloudMeta = {
        userId,
        lastPullAt: now,
        lastPushAt: now,
        lastError: null,
      };
      await saveCloudMeta(next);
      return next;
    }
    const next: CloudMeta = {
      userId,
      lastPullAt: now,
      lastPushAt: meta.lastPushAt,
      lastError: null,
    };
    await saveCloudMeta(next);
    void pushStores(userId)
      .then(async () => {
        await saveCloudMeta({
          ...next,
          lastPushAt: new Date().toISOString(),
          lastError: null,
        });
      })
      .catch(async (err: unknown) => {
        await saveCloudMeta({
          ...next,
          lastError: err instanceof Error ? err.message : 'Cloud push failed',
        });
      });
    return next;
  } catch (err) {
    const next = {
      ...meta,
      lastError:
        err instanceof Error ? err.message : 'Cloud backup is unavailable.',
    };
    await saveCloudMeta(next);
    return next;
  }
}

export async function syncCloudNow(): Promise<CloudMeta> {
  if (!isSupabaseConfigured() || !supabase) {
    return loadCloudMeta();
  }
  try {
    // Never open a new session from background / first-load preference writes.
    const userId = await ensureCloudSession({ create: false });
    if (!userId) return loadCloudMeta();
    await pushStores(userId);
    const next: CloudMeta = {
      userId,
      lastPushAt: new Date().toISOString(),
      lastPullAt: (await loadCloudMeta()).lastPullAt,
      lastError: null,
    };
    await saveCloudMeta(next);
    return next;
  } catch (err) {
    const next = {
      ...(await loadCloudMeta()),
      lastError: err instanceof Error ? err.message : 'Cloud push failed',
    };
    await saveCloudMeta(next);
    return next;
  }
}

/**
 * Recovery on a new phone: restore prefs from the snapshot, join the code's
 * household (row data + media follow via sync), then pull everything.
 */
export async function restoreFromRecoveryCode(code: string): Promise<CloudSnapshot> {
  if (!supabase) throw new Error('Cloud is not configured.');
  if (!isValidRecoveryCode(code)) throw new Error('That recovery code is not valid.');
  const normalized = normalizeRecoveryCode(code);

  // Validate the code before opening an anonymous session so failed restores
  // do not leave orphan auth users. Server still rate-limits by IP.
  const { data, error } = await supabase.rpc('fetch_life_recovery', {
    p_code: normalized,
  });
  if (error) throw error;
  const snapshot = data as CloudSnapshot | null;
  if (!snapshot?.stores || typeof snapshot.stores !== 'object') {
    throw new Error('No backup found for that code.');
  }

  // Reuse a Welcome session if one somehow exists; otherwise open one now.
  const userId = await ensureCloudSession({ create: true });
  if (!userId) throw new Error('Could not open a cloud session.');

  // Household first so the legacy domain import below is skipped when rows exist.
  const { data: claimed, error: claimErr } = await supabase.rpc(
    'claim_household_by_recovery',
    { p_code: normalized }
  );
  if (claimErr) throw claimErr;
  const householdId = typeof claimed === 'string' ? claimed : null;

  const engine = await syncEngine();
  await engine.resetSyncStateForUser(householdId);

  // Prefs always; legacy domain blob only when this phone has nothing local
  // and the code was never bound to a household (pre-row-sync backups).
  const stores = householdId
    ? Object.fromEntries(
        Object.entries(snapshot.stores).filter(([k]) =>
          (CLOUD_PREF_KEYS as readonly string[]).includes(k)
        )
      )
    : snapshot.stores;
  await writeLocalStores(stores);
  await writeSecureStore('recovery', normalized);

  await pushStores(userId);
  await saveCloudMeta({
    userId,
    lastPullAt: new Date().toISOString(),
    lastPushAt: new Date().toISOString(),
    lastError: null,
  });
  // Pull rows + media now (best-effort; the engine retries on its own).
  await engine.syncRowsNow().catch(() => undefined);
  return snapshot;
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleCloudPush(): void {
  if (!isSupabaseConfigured()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void syncCloudNow();
  }, 2500);
}
