import type { LastDoneItem } from '@/lib/lastDone';
import { colors } from '@/constants/theme';

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
  home: {
    id: 'home',
    name: 'Home',
    emoji: '🏠',
    color: colors.forestBright,
    soft: colors.forestSoft,
  },
  health: {
    id: 'health',
    name: 'Health',
    emoji: '💪',
    color: '#D1433B',
    soft: 'rgba(209, 67, 59, 0.12)',
  },
  vehicle: {
    id: 'vehicle',
    name: 'Vehicles',
    emoji: '🚗',
    color: colors.sky,
    soft: colors.skySoft,
  },
  documents: {
    id: 'documents',
    name: 'Documents',
    emoji: '📄',
    color: colors.violet,
    soft: colors.violetSoft,
  },
  family: {
    id: 'family',
    name: 'Family',
    emoji: '👨‍👩‍👧',
    color: colors.amber,
    soft: colors.amberSoft,
  },
  other: {
    id: 'other',
    name: 'Other',
    emoji: '✨',
    color: colors.slate,
    soft: colors.surfaceSoft,
  },
};

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
    /passport|emirates id|visa|license|licence|document|eid|id card|renew.*id/.test(l)
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
