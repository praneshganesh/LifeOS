/**
 * Inventory item shape normalization (F2 / Talk fact integrity).
 * Fills missing fields so Talk + Capture never read undefined purchase/warranty dates.
 */
import type { InventoryItem } from '@/lib/InventoryContext';

/** Stored marker for "no value" on inventory fields. Never render it. */
export const EMPTY_FIELD = '—';

/** True when a stored field holds a real value worth showing. */
export function hasValue(v: string | null | undefined): v is string {
  if (!v) return false;
  const t = v.trim();
  return Boolean(t) && t !== EMPTY_FIELD && t !== '-' && !/^unknown$/i.test(t);
}

function dash(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) return '—';
  return v.trim();
}

/** Optional text fields: store empty, never the literal em dash. */
function optionalText(v: unknown): string {
  if (typeof v !== 'string') return '';
  const t = v.trim();
  if (!t || t === '—' || t === '-') return '';
  return t;
}

export function normalizeInventoryItem(raw: unknown): InventoryItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return null;

  const timeline = Array.isArray(r.timeline)
    ? (r.timeline as InventoryItem['timeline']).filter(
        (t) => t && typeof t.date === 'string' && typeof t.event === 'string'
      )
    : [];

  return {
    id: r.id,
    name: r.name.trim() || 'Untitled',
    brand: (() => {
      const b = optionalText(r.brand);
      return !b || /^unknown$/i.test(b) ? '' : b;
    })(),
    category: typeof r.category === 'string' ? r.category : 'General',
    room: typeof r.room === 'string' ? r.room : 'Inbox',
    spaceId: typeof r.spaceId === 'string' ? r.spaceId : 's1',
    icon: (typeof r.icon === 'string' ? r.icon : 'package') as InventoryItem['icon'],
    imageUri: typeof r.imageUri === 'string' ? r.imageUri : undefined,
    imagePath: typeof r.imagePath === 'string' && r.imagePath ? r.imagePath : undefined,
    purchaseDate: dash(r.purchaseDate),
    price: dash(r.price),
    purchasedFrom:
      typeof r.purchasedFrom === 'string' && r.purchasedFrom.trim()
        ? r.purchasedFrom.trim()
        : undefined,
    manualUrl: typeof r.manualUrl === 'string' ? r.manualUrl : undefined,
    assignedTo: typeof r.assignedTo === 'string' ? r.assignedTo : undefined,
    personId: typeof r.personId === 'string' ? r.personId : undefined,
    warrantyExpiry: optionalText(r.warrantyExpiry),
    warrantyActive: Boolean(r.warrantyActive) && Boolean(optionalText(r.warrantyExpiry)),
    condition: optionalText(r.condition),
    serial: optionalText(r.serial),
    estimatedValue: optionalText(r.estimatedValue) || (hasValue(String(r.price || '')) ? dash(r.price) : ''),
    insight: typeof r.insight === 'string' ? r.insight : undefined,
    timeline,
    isDocument: Boolean(r.isDocument),
    documentKind: r.documentKind as InventoryItem['documentKind'],
    documentNumber: typeof r.documentNumber === 'string' ? r.documentNumber : undefined,
    fullName: typeof r.fullName === 'string' ? r.fullName : undefined,
    nationality: typeof r.nationality === 'string' ? r.nationality : undefined,
    dateOfBirth: typeof r.dateOfBirth === 'string' ? r.dateOfBirth : undefined,
    expiryDate: typeof r.expiryDate === 'string' ? r.expiryDate : undefined,
    ocrText: typeof r.ocrText === 'string' ? r.ocrText : undefined,
    ocrOnDevice: Boolean(r.ocrOnDevice),
    source: r.source as InventoryItem['source'],
    createdAt:
      typeof r.createdAt === 'string' && r.createdAt
        ? r.createdAt
        : new Date().toISOString(),
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : undefined,
  };
}
