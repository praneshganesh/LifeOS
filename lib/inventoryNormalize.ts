/**
 * Inventory item shape normalization (F2 / Talk fact integrity).
 * Fills missing fields so Talk + Capture never read undefined purchase/warranty dates.
 */
import type { InventoryItem } from '@/lib/InventoryContext';

function dash(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) return '—';
  return v.trim();
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
    brand: typeof r.brand === 'string' && r.brand.trim() ? r.brand : 'Unknown',
    category: typeof r.category === 'string' ? r.category : 'General',
    room: typeof r.room === 'string' ? r.room : 'Inbox',
    spaceId: typeof r.spaceId === 'string' ? r.spaceId : 's1',
    icon: (typeof r.icon === 'string' ? r.icon : 'package') as InventoryItem['icon'],
    imageUri: typeof r.imageUri === 'string' ? r.imageUri : undefined,
    purchaseDate: dash(r.purchaseDate),
    price: dash(r.price),
    purchasedFrom:
      typeof r.purchasedFrom === 'string' && r.purchasedFrom.trim()
        ? r.purchasedFrom.trim()
        : undefined,
    manualUrl: typeof r.manualUrl === 'string' ? r.manualUrl : undefined,
    assignedTo: typeof r.assignedTo === 'string' ? r.assignedTo : undefined,
    personId: typeof r.personId === 'string' ? r.personId : undefined,
    warrantyExpiry: dash(r.warrantyExpiry),
    warrantyActive: Boolean(r.warrantyActive),
    condition: dash(r.condition),
    serial: dash(r.serial),
    estimatedValue: dash(r.estimatedValue),
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
