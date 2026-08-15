import type { InventoryItem } from '@/lib/InventoryContext';
import { daysUntil } from '@/lib/lastDone';
import { parseAmount } from '@/lib/expenses';

/** Resolve space ids by kind so modules don’t hardcode s4/s5. */
export function spaceIdByKind(
  spaces: Array<{ id: string; kind: string }>,
  kind: string
): string | undefined {
  return spaces.find((s) => s.kind === kind)?.id;
}

export function isDocumentItem(
  item: Pick<
    InventoryItem,
    'isDocument' | 'category' | 'spaceId' | 'icon' | 'documentKind'
  >,
  documentsSpaceId?: string
): boolean {
  return (
    Boolean(item.isDocument) ||
    Boolean(item.documentKind) ||
    (documentsSpaceId != null && item.spaceId === documentsSpaceId) ||
    item.spaceId === 's5' ||
    item.category === 'Documents' ||
    item.category === 'Document' ||
    item.icon === 'passport' ||
    item.icon === 'document' ||
    item.icon === 'id'
  );
}

export type DocBucket =
  | 'Identity'
  | 'Property'
  | 'Medical'
  | 'Financial'
  | 'Legal';

export function docBucket(
  item: Pick<InventoryItem, 'documentKind' | 'category' | 'name'>
): DocBucket {
  if (item.documentKind === 'passport' || item.documentKind === 'emirates_id') {
    return 'Identity';
  }
  const hay = `${item.category} ${item.name}`.toLowerCase();
  if (/passport|visa|eid|emirates|licence|license|id\b/.test(hay)) return 'Identity';
  if (/title|deed|property|lease/.test(hay)) return 'Property';
  if (/med|health|prescription/.test(hay)) return 'Medical';
  if (/insurance|bank|tax|finance/.test(hay)) return 'Financial';
  if (/will|legal|attorney|contract/.test(hay)) return 'Legal';
  return 'Identity';
}

export function isVehicleItem(
  item: Pick<InventoryItem, 'spaceId' | 'category' | 'room' | 'icon' | 'name'>,
  vehicleSpaceId?: string
): boolean {
  return (
    (vehicleSpaceId != null && item.spaceId === vehicleSpaceId) ||
    item.spaceId === 's4' ||
    item.category === 'Vehicle' ||
    /^vehicles?$/i.test(item.room) ||
    item.icon === 'car' ||
    item.icon === 'bicycle' ||
    /\b(car|suv|truck|bike|motorcycle|prado|toyota|bmw|tesla)\b/i.test(item.name)
  );
}

/** Primary vehicles vs accessories / linked gear. */
export function isPrimaryVehicle(
  item: Pick<InventoryItem, 'icon' | 'name' | 'category'>
): boolean {
  if (item.icon === 'car' || item.icon === 'bicycle') return true;
  if (/accessory|charger|mat|cover|tool|keychain|dashcam/i.test(item.name)) {
    return false;
  }
  return /\b(car|suv|truck|van|bike|motorcycle|scooter|prado|camry|civic|tesla|bmw|audi|mercedes)\b/i.test(
    item.name
  ) || item.category === 'Vehicle';
}

export function isPurchaseItem(
  item: Pick<
    InventoryItem,
    | 'isDocument'
    | 'price'
    | 'purchasedFrom'
    | 'purchaseDate'
    | 'source'
    | 'category'
    | 'imageUri'
  >
): boolean {
  if (item.isDocument) return false;
  if (item.category === 'Documents' || item.category === 'Document') return false;
  const hasPrice = Boolean(item.price && item.price !== '—');
  const hasStore = Boolean(item.purchasedFrom && item.purchasedFrom !== '—');
  const hasDate = Boolean(item.purchaseDate && item.purchaseDate !== '—');
  const captured =
    item.source === 'capture' || item.source === 'talk' || Boolean(item.imageUri);
  return hasPrice || hasStore || (hasDate && captured) || (captured && hasPrice);
}

export function purchaseSortKey(item: InventoryItem): string {
  if (item.purchaseDate && item.purchaseDate !== '—') return item.purchaseDate;
  return item.createdAt.slice(0, 10);
}

/** Sum parseable AED/USD-style prices from inventory purchase fields. */
export function sumPurchasePrices(items: InventoryItem[]): {
  total: number;
  currency: string;
  counted: number;
} {
  let total = 0;
  let counted = 0;
  let currency = 'AED';
  for (const item of items) {
    if (!item.price || item.price === '—') continue;
    const n = parseAmount(item.price);
    if (!Number.isFinite(n) || n <= 0) continue;
    total += n;
    counted += 1;
    if (/\busd|\$\b/i.test(item.price)) currency = 'USD';
    else if (/\beur|€\b/i.test(item.price)) currency = 'EUR';
  }
  return { total, currency, counted };
}

export function expiryDaysLeft(raw?: string): number | null {
  if (!raw?.trim() || raw === '—') return null;
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  const iso = m ? `${m[1]}T12:00:00` : raw;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return daysUntil(new Date(t).toISOString());
}

export function expiryMeta(raw?: string): string | undefined {
  if (!raw?.trim() || raw === '—') return undefined;
  const days = expiryDaysLeft(raw);
  if (days == null) return raw;
  if (days < 0) return `Expired · ${raw}`;
  if (days === 0) return 'Ends today';
  if (days <= 180) return `${days}d · ${raw}`;
  return raw;
}

export function isInsuranceItem(
  item: Pick<
    InventoryItem,
    'category' | 'name' | 'room' | 'isDocument' | 'documentKind' | 'icon'
  >
): boolean {
  if (/^insurance$/i.test(item.category)) return true;
  if (/^insurance$/i.test(item.room || '')) return true;
  const hay = `${item.name} ${item.category}`.toLowerCase();
  return /insurance|policy|cover note|takaful/.test(hay);
}

export type InsuranceBucket =
  | 'home'
  | 'vehicle'
  | 'medical'
  | 'travel'
  | 'life'
  | 'other';

export function insuranceBucket(
  item: Pick<InventoryItem, 'name' | 'category' | 'room' | 'spaceId'>
): InsuranceBucket {
  const hay = `${item.name} ${item.category} ${item.room}`.toLowerCase();
  if (/car|vehicle|motor|auto|bike/.test(hay) || item.spaceId === 's4') {
    return 'vehicle';
  }
  if (/home|house|property|contents|building|rent/.test(hay)) return 'home';
  if (/health|medical|hospital|dental/.test(hay)) return 'medical';
  if (/travel|trip|flight/.test(hay)) return 'travel';
  if (/life|term|whole life/.test(hay)) return 'life';
  return 'other';
}
