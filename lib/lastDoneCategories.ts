import type { LastDoneItem } from '@/lib/lastDone';
import type { ThemeColors } from '@/constants/theme';

export type LastDoneCategoryId =
  | 'home'
  | 'health'
  | 'vehicle'
  | 'documents'
  | 'family'
  | 'other';

export type LastDoneCategory = {
  id: LastDoneCategoryId;
  name: string;
  emoji: string;
  color: string;
  soft: string;
};

export const LAST_DONE_CATEGORIES: Record<LastDoneCategoryId, LastDoneCategory> = {
  home: { id: 'home', name: 'Home', emoji: '🏠', color: '#4F6840', soft: 'rgba(79, 104, 64, 0.16)' },
  health: { id: 'health', name: 'Health', emoji: '💪', color: '#D1433B', soft: 'rgba(209, 67, 59, 0.12)' },
  vehicle: { id: 'vehicle', name: 'Vehicles', emoji: '🚗', color: '#4A6F8F', soft: 'rgba(74, 111, 143, 0.16)' },
  documents: { id: 'documents', name: 'Documents', emoji: '📄', color: '#6E6088', soft: 'rgba(110, 96, 136, 0.16)' },
  family: { id: 'family', name: 'Family', emoji: '👨‍👩‍👧', color: '#B4782E', soft: 'rgba(180, 120, 46, 0.16)' },
  other: { id: 'other', name: 'Other', emoji: '✨', color: '#54493E', soft: '#F1EBE1' },
};

export function paintLastDoneCategory(
  id: LastDoneCategoryId,
  c: ThemeColors
): LastDoneCategory {
  const base = LAST_DONE_CATEGORIES[id];
  if (id === 'home') return { ...base, color: c.accentStrong, soft: c.accentSoft };
  if (id === 'health') return { ...base, color: c.coral, soft: c.coralSoft };
  if (id === 'vehicle') return { ...base, color: c.sky, soft: c.skySoft };
  if (id === 'documents') return { ...base, color: c.violet, soft: c.violetSoft };
  if (id === 'family') return { ...base, color: c.amber, soft: c.amberSoft };
  return { ...base, color: c.slate, soft: c.surfaceSoft };
}

/** Soft keyword grouping — users never pick a category. */
export function categorizeLastDone(label: string): LastDoneCategory {
  const l = label.toLowerCase();

  if (
    /vitamin|vaccine|vaccinat|doctor|dentist|gym|exercise|health|medic|pill|checkup|hospital|dentist/.test(
      l
    )
  ) {
    return LAST_DONE_CATEGORIES.health;
  }
  if (/car|vehicle|tyre|tire|oil change|service.*car|mot |garage|fuel/.test(l)) {
    return LAST_DONE_CATEGORIES.vehicle;
  }
  if (
    /passport|emirates id|visa|license|licence|document|eid|id card|renew.*id/.test(
      l
    )
  ) {
    return LAST_DONE_CATEGORIES.documents;
  }
  if (/school|fee|dog|pet|cat |kid|child|family|bruno|vaccinat.*dog/.test(l)) {
    return LAST_DONE_CATEGORIES.family;
  }
  if (
    /filter|ac |a\/c|drain|tank|smoke|clean|dishwasher|water|battery|home|house|grill|purifier/.test(
      l
    )
  ) {
    return LAST_DONE_CATEGORIES.home;
  }

  return LAST_DONE_CATEGORIES.other;
}

export function groupByCategory(items: LastDoneItem[]) {
  const order: LastDoneCategoryId[] = [
    'home',
    'health',
    'vehicle',
    'documents',
    'family',
    'other',
  ];
  const map = new Map<LastDoneCategoryId, LastDoneItem[]>();

  for (const item of items) {
    const cat = categorizeLastDone(item.label);
    const list = map.get(cat.id) ?? [];
    list.push(item);
    map.set(cat.id, list);
  }

  return order
    .filter((id) => (map.get(id)?.length ?? 0) > 0)
    .map((id) => ({
      category: LAST_DONE_CATEGORIES[id],
      items: map.get(id)!,
    }));
}
