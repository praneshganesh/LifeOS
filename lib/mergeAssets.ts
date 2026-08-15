import type { Asset } from '@/data/mock';
import type { InventoryItem } from '@/lib/InventoryContext';

/** Map a stored inventory item into the shared Asset shape used by UI. */
export function inventoryToAsset(item: InventoryItem): Asset {
  return {
    id: item.id,
    name: item.name,
    brand: item.brand,
    category: item.category,
    room: item.room,
    spaceId: item.spaceId,
    icon: item.icon,
    purchaseDate: item.purchaseDate,
    price: item.price,
    purchasedFrom: item.purchasedFrom,
    manualUrl: item.manualUrl,
    assignedTo: item.assignedTo,
    personId: item.personId,
    warrantyExpiry: item.warrantyExpiry,
    warrantyActive: item.warrantyActive,
    condition: item.condition,
    serial: item.serial,
    estimatedValue: item.estimatedValue,
    insight: item.insight,
    timeline: item.timeline,
  };
}

/** Inventory-only asset list (no demo/mock bleed). */
export function mergeAssets(inventory: InventoryItem[]): Asset[] {
  return inventory.map(inventoryToAsset);
}
