/** Pure version helpers (no React Native imports — safe for unit tests). */

export function parseSemver(raw: string | null | undefined): [number, number, number] {
  const parts = String(raw || '0')
    .trim()
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((p) => Number.parseInt(p, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/** True when `current` is strictly below `minimum` (semver). */
export function isVersionBelow(current: string, minimum: string): boolean {
  const a = parseSemver(current);
  const b = parseSemver(minimum);
  for (let i = 0; i < 3; i++) {
    if (a[i] < b[i]) return true;
    if (a[i] > b[i]) return false;
  }
  return false;
}

export type SoftDismissState = {
  updateId: string;
  at: string;
};

/** Soft "Later" sticks for 24h for the same update id. */
export function softDismissIsActive(
  dismissed: SoftDismissState | null,
  updateId: string | null,
  now = Date.now()
): boolean {
  if (!dismissed || !updateId) return false;
  if (dismissed.updateId !== updateId) return false;
  const at = Date.parse(dismissed.at);
  if (!Number.isFinite(at)) return false;
  return now - at < 24 * 60 * 60 * 1000;
}
