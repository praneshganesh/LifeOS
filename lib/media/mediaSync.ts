/**
 * Durable media (docs/SYNC_ARCHITECTURE.md §4 "Media"): receipts, item photos
 * and document scans live in the private Supabase Storage bucket `media`
 * under `{household_id}/{uuid}.{ext}`; RLS = household membership.
 *
 * Rules:
 * - UI always writes the local file first (`persistLocalMediaUri`); upload is
 *   background and best-effort.
 * - A record keeps BOTH `…Uri` (device path, never synced) and `…Path`
 *   (bucket path, synced in the row body). A new phone downloads on demand.
 * - Local files are never deleted by sync.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { newUuid } from '@/lib/ids';
import { isLocalMediaUri } from '@/lib/sync/core';

export const MEDIA_BUCKET = 'media';
const ATTEMPTS_KEY = 'lifeos:media:attempts:v1';
const MAX_TRANSFERS_PER_RUN = 4;

type AttemptMap = Record<string, { n: number; at: number }>;

async function loadAttempts(): Promise<AttemptMap> {
  try {
    const raw = await AsyncStorage.getItem(ATTEMPTS_KEY);
    return raw ? (JSON.parse(raw) as AttemptMap) : {};
  } catch {
    return {};
  }
}

async function saveAttempts(map: AttemptMap): Promise<void> {
  // Keep the map small, drop entries older than 7 days.
  const cutoff = Date.now() - 7 * 86400000;
  const next: AttemptMap = {};
  for (const [k, v] of Object.entries(map)) if (v.at > cutoff) next[k] = v;
  await AsyncStorage.setItem(ATTEMPTS_KEY, JSON.stringify(next));
}

function shouldRetry(entry: { n: number; at: number } | undefined): boolean {
  if (!entry) return true;
  const backoffMs = Math.min(2 ** entry.n * 60_000, 6 * 3600_000);
  return Date.now() - entry.at > backoffMs;
}

function extFromUri(uri: string, fallback = 'jpg'): string {
  const m = uri.match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/);
  return (m?.[1] || fallback).toLowerCase();
}

function contentTypeFor(ext: string): string {
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'image/jpeg';
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const atobFn = (globalThis as { atob?: (s: string) => string }).atob;
  if (atobFn) {
    const bin = atobFn(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buf = 0;
  let bits = 0;
  let j = 0;
  for (let i = 0; i < clean.length; i += 1) {
    buf = (buf << 6) | chars.indexOf(clean[i]!);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, j);
}

async function fs() {
  return import('expo-file-system/legacy');
}

export async function localFileExists(uri: string | undefined): Promise<boolean> {
  if (!uri || Platform.OS === 'web') return Boolean(uri);
  try {
    const FileSystem = await fs();
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch {
    return false;
  }
}

/** Upload one on-device file. Returns the bucket path. */
export async function uploadLocalMedia(
  householdId: string,
  localUri: string
): Promise<string> {
  if (!supabase) throw new Error('Cloud not configured');
  if (Platform.OS === 'web') throw new Error('Media upload is native-only');
  const FileSystem = await fs();
  const ext = extFromUri(localUri);
  const path = `${householdId}/${newUuid()}.${ext}`;
  const b64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(b64);
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, { contentType: contentTypeFor(ext), upsert: false });
  if (error) throw error;
  return path;
}

/** Download a bucket object into app storage. Returns the local file uri. */
export async function downloadMediaToLocal(remotePath: string): Promise<string> {
  if (!supabase) throw new Error('Cloud not configured');
  if (Platform.OS === 'web') {
    const { data, error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(remotePath, 3600);
    if (error || !data?.signedUrl) throw error ?? new Error('No signed url');
    return data.signedUrl;
  }
  const FileSystem = await fs();
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('No document directory');
  const dir = `${root}lifeos-media/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const ext = extFromUri(remotePath);
  const dest = `${dir}cloud-${remotePath.split('/').pop()?.replace(/\.[^.]+$/, '') || newUuid()}.${ext}`;
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(remotePath, 120);
  if (error || !data?.signedUrl) throw error ?? new Error('No signed url');
  const res = await FileSystem.downloadAsync(data.signedUrl, dest);
  if (res.status && res.status >= 400) throw new Error(`Download failed (${res.status})`);
  return dest;
}

export type MediaFieldSpec = { uriKey: string; pathKey: string };

/**
 * Reconcile one list of records: upload local-only files, download
 * cloud-only ones. Returns the patched list + which ids changed.
 * Caps transfers per run so a sync pass stays short.
 */
export async function reconcileMediaList<T extends { id: string }>(
  householdId: string,
  items: T[],
  fields: MediaFieldSpec[],
  budget = { remaining: MAX_TRANSFERS_PER_RUN }
): Promise<{ items: T[]; uploadedIds: string[]; downloadedIds: string[] }> {
  if (!supabase) return { items, uploadedIds: [], downloadedIds: [] };
  const attempts = await loadAttempts();
  let attemptsDirty = false;
  const uploadedIds: string[] = [];
  const downloadedIds: string[] = [];
  const next = [...items];

  for (let i = 0; i < next.length && budget.remaining > 0; i += 1) {
    let rec = next[i] as T & Record<string, unknown>;
    let patched = false;
    for (const f of fields) {
      if (budget.remaining <= 0) break;
      const uri = rec[f.uriKey];
      const path = rec[f.pathKey];
      const hasLocal = typeof uri === 'string' && isLocalMediaUri(uri);
      const hasRemote = typeof path === 'string' && path.length > 0;

      if (hasLocal && !hasRemote) {
        const key = `up:${uri}`;
        if (!shouldRetry(attempts[key])) continue;
        if (!(await localFileExists(uri as string))) continue;
        budget.remaining -= 1;
        try {
          const remote = await uploadLocalMedia(householdId, uri as string);
          rec = { ...rec, [f.pathKey]: remote };
          patched = true;
          delete attempts[key];
        } catch {
          attempts[key] = { n: (attempts[key]?.n ?? 0) + 1, at: Date.now() };
        }
        attemptsDirty = true;
        if (patched) uploadedIds.push(rec.id);
      } else if (hasRemote && !(hasLocal && (await localFileExists(uri as string)))) {
        const key = `down:${path}`;
        if (!shouldRetry(attempts[key])) continue;
        budget.remaining -= 1;
        try {
          const local = await downloadMediaToLocal(path as string);
          rec = { ...rec, [f.uriKey]: local };
          patched = true;
          delete attempts[key];
          downloadedIds.push(rec.id);
        } catch {
          attempts[key] = { n: (attempts[key]?.n ?? 0) + 1, at: Date.now() };
        }
        attemptsDirty = true;
      }
    }
    if (patched) next[i] = rec;
  }

  if (attemptsDirty) await saveAttempts(attempts).catch(() => undefined);
  return { items: next, uploadedIds, downloadedIds };
}
