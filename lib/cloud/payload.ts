/**
 * Cloud snapshot keys.
 *
 * Domain data (things, expenses, …) is row-synced (`lib/sync/engine.ts`).
 * The `life_stores` blob is now **prefs only**; the domain keys below are kept
 * solely so a phone that only ever had the legacy blob can import it once.
 * Device lock / biometrics stay local.
 */
export const CLOUD_PREF_KEYS = [
  'lifeos:notif-prefs:v1',
  'lifeos:profile:v1',
  'lifeos:onboarding:v1',
  'lifeos:appearance:v1',
  'lifeos:plan:v1',
  'lifeos:aiUsage:v1',
  'lifeos:talk-voice:v1',
] as const;

/** Legacy blob keys — pulled once when the local store is empty; never pushed. */
export const LEGACY_DOMAIN_KEYS = [
  'lifeos:inventory:v1',
  'lifeos:expenses:v1',
  'lifeos:habits:v1',
  'lifeos:classes:v1',
  'lifeos:subscriptions:v1',
  'lifeos:last-done:v2',
  'lifeos:household:v1',
  'lifeos:spaces:v2',
] as const;

/** Every key the blob may contain (pull side). */
export const CLOUD_STORE_KEYS = [...LEGACY_DOMAIN_KEYS, ...CLOUD_PREF_KEYS] as const;

export type CloudStoreKey = (typeof CLOUD_STORE_KEYS)[number];

const LOCAL_MEDIA_KEYS = new Set([
  'imageUri',
  'receiptUri',
  'photoUri',
  'localUri',
  'fileUri',
]);

function isLocalMediaUri(value: string): boolean {
  const v = value.trim().toLowerCase();
  return (
    v.startsWith('file:') ||
    v.startsWith('content:') ||
    v.startsWith('ph://') ||
    v.startsWith('assets-library:') ||
    v.startsWith('blob:') ||
    v.startsWith('data:image/')
  );
}

/** Drop on-device photo URIs — they are useless on another phone. */
export function stripLocalMedia(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripLocalMedia);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'string' && LOCAL_MEDIA_KEYS.has(k) && isLocalMediaUri(v)) {
        continue;
      }
      out[k] = stripLocalMedia(v);
    }
    return out;
  }
  return value;
}

export function normalizeRecoveryCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function formatRecoveryCode(normalized: string): string {
  const chars = normalizeRecoveryCode(normalized);
  const parts: string[] = [];
  for (let i = 0; i < chars.length; i += 4) {
    parts.push(chars.slice(i, i + 4));
  }
  return parts.join('-');
}

export function generateRecoveryCode(randomBytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < 16; i++) {
    out += CODE_ALPHABET[randomBytes[i]! % CODE_ALPHABET.length];
  }
  return formatRecoveryCode(out);
}

export function isValidRecoveryCode(raw: string): boolean {
  const n = normalizeRecoveryCode(raw);
  return n.length === 16;
}

export type CloudSnapshot = {
  exportedAt: string;
  stores: Record<string, unknown>;
};

/**
 * Snapshot to push. Defaults to prefs only (row sync owns domain data);
 * pass `keys` to build a wider snapshot (tests / export).
 */
export function buildCloudBody(
  stores: Record<string, unknown>,
  exportedAt = new Date().toISOString(),
  keys: readonly string[] = CLOUD_STORE_KEYS
): CloudSnapshot {
  const next: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in stores && stores[key] != null) {
      next[key] = stripLocalMedia(stores[key]);
    }
  }
  return { exportedAt, stores: next };
}
