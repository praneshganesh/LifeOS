/**
 * Client-generated UUIDs (docs/SYNC_ARCHITECTURE.md).
 * New rows are born with their permanent server id so offline creates
 * never need an id swap when they sync.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  return typeof value === 'string' && UUID_RE.test(value);
}

function fnv1a32(input: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Deterministic uuid for a legacy (non-uuid) local id such as `s1`, `rm-s1-0`
 * or `inv-…`. Every device derives the same uuid for the same legacy id, so
 * seeded defaults (Home, Vehicles, Documents) and blob-migrated rows never
 * duplicate across phones.
 */
export function legacyIdToUuid(localId: string): string {
  if (isUuid(localId)) return localId;
  const parts = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x7f4a7c15].map((seed) =>
    fnv1a32(`saavi:${localId}`, seed).toString(16).padStart(8, '0')
  );
  const hex = parts.join('');
  const bytes = hex.match(/.{2}/g)!.map((b) => parseInt(b, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const out = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}-${out.slice(16, 20)}-${out.slice(20)}`;
}

export function newUuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();

  // v4 from raw random bytes (Hermes without randomUUID)
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
