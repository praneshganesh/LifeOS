import type { Href } from 'expo-router';

/** Where the user opened a module list from — drives back label + fallback. */
export type ModuleOrigin =
  | 'today'
  | 'things'
  | 'profile'
  | 'settings'
  | 'activities';

export const ORIGIN_META: Record<ModuleOrigin, { label: string; href: Href }> = {
  today: { label: 'Today', href: '/(tabs)' },
  things: { label: 'Life', href: '/(tabs)/spaces' },
  profile: { label: 'Profile', href: '/profile' },
  settings: { label: 'Settings', href: '/settings' },
  activities: { label: 'Activities', href: '/(tabs)/done' },
};

export function parseModuleOrigin(raw?: string | string[]): ModuleOrigin | undefined {
  const v = Array.isArray(raw) ? raw[0]?.trim() : raw?.trim();
  if (!v) return undefined;
  return v in ORIGIN_META ? (v as ModuleOrigin) : undefined;
}

/** Append ?from= so the destination knows which tab/screen to label on back. */
export function moduleHref(path: string, from: ModuleOrigin): Href {
  const base = path.split('?')[0];
  const query = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
  const params = new URLSearchParams(query);
  params.set('from', from);
  const qs = params.toString();
  return (qs ? `${base}?${qs}` : base) as Href;
}

/** Keep the current `from` param when drilling into a child route. */
export function moduleHrefPreserveFrom(
  path: string,
  from?: string | string[]
): Href {
  const origin = parseModuleOrigin(from);
  return origin ? moduleHref(path, origin) : (path as Href);
}

export function moduleBackMeta(from?: ModuleOrigin) {
  const meta = from ? ORIGIN_META[from] : ORIGIN_META.today;
  return { backLabel: meta.label, backFallbackHref: meta.href };
}
