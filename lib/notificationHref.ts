/** Pure helpers for notification → route mapping (safe for Node tests). */

export function hrefFromNotificationData(
  data: Record<string, unknown> | undefined
): string | null {
  if (!data) return null;
  const href = data.href;
  if (typeof href === 'string' && href.startsWith('/')) return href;
  if (data.type === 'last_done' && typeof data.itemId === 'string') {
    return `/last-done/${data.itemId}`;
  }
  return null;
}
