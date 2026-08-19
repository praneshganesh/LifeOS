import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  CLOUD_STORE_KEYS,
  buildCloudBody,
  formatRecoveryCode,
  generateRecoveryCode,
  isValidRecoveryCode,
  normalizeRecoveryCode,
  type CloudSnapshot,
} from '@/lib/cloud/payload';

const RECOVERY_KEY = 'lifeos:cloud:recovery';
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

async function readSecure(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeSecure(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

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
  const raw = await readSecure(RECOVERY_KEY);
  if (!raw) return null;
  const normalized = normalizeRecoveryCode(raw);
  return normalized.length === 16 ? formatRecoveryCode(normalized) : null;
}

async function ensureRecoveryCode(): Promise<string> {
  const existing = await loadRecoveryCode();
  if (existing) return existing;
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const code = generateRecoveryCode(bytes);
  await writeSecure(RECOVERY_KEY, normalizeRecoveryCode(code));
  return code;
}

async function readLocalStores(): Promise<Record<string, unknown>> {
  const pairs = await AsyncStorage.multiGet([...CLOUD_STORE_KEYS]);
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

async function writeLocalStores(stores: Record<string, unknown>): Promise<void> {
  const entries: [string, string][] = [];
  for (const key of CLOUD_STORE_KEYS) {
    if (!(key in stores) || stores[key] == null) continue;
    entries.push([key, JSON.stringify(stores[key])]);
  }
  if (entries.length) await AsyncStorage.multiSet(entries);
}

export async function ensureCloudSession(): Promise<string | null> {
  if (!supabase) return null;
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session?.user.id) return existing.session.user.id;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user?.id ?? null;
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

async function pushStores(userId: string): Promise<void> {
  if (!supabase) return;
  const snapshot = buildCloudBody(await readLocalStores());
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
  const code = await ensureRecoveryCode();
  const { error: recErr } = await supabase.rpc('upsert_life_recovery', {
    p_code: normalizeRecoveryCode(code),
    p_body: snapshot,
  });
  if (recErr) throw recErr;
}

export async function bootstrapCloud(): Promise<CloudMeta> {
  const meta = await loadCloudMeta();
  if (!isSupabaseConfigured() || !supabase) {
    return { ...meta, lastError: null };
  }
  try {
    const userId = await ensureCloudSession();
    if (!userId) {
      const next = { ...meta, lastError: 'Could not open a cloud session.' };
      await saveCloudMeta(next);
      return next;
    }
    await ensureRecoveryCode();
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
    const userId = await ensureCloudSession();
    if (!userId) throw new Error('Could not open a cloud session.');
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

export async function restoreFromRecoveryCode(code: string): Promise<CloudSnapshot> {
  if (!supabase) throw new Error('Cloud is not configured.');
  if (!isValidRecoveryCode(code)) throw new Error('That recovery code is not valid.');
  const { data, error } = await supabase.rpc('fetch_life_recovery', {
    p_code: normalizeRecoveryCode(code),
  });
  if (error) throw error;
  const snapshot = data as CloudSnapshot | null;
  if (!snapshot?.stores || typeof snapshot.stores !== 'object') {
    throw new Error('No backup found for that code.');
  }
  await writeLocalStores(snapshot.stores);
  await writeSecure(RECOVERY_KEY, normalizeRecoveryCode(code));
  const userId = await ensureCloudSession();
  if (userId) {
    await pushStores(userId);
    await saveCloudMeta({
      userId,
      lastPullAt: new Date().toISOString(),
      lastPushAt: new Date().toISOString(),
      lastError: null,
    });
  }
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
