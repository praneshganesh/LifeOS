import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Icon3DName } from '@/components/ui/Icon3D';
import { newUuid } from '@/lib/ids';
import type { MrzDocumentKind } from '@/lib/ocr/mrz';
import { normalizeInventoryItem } from '@/lib/inventoryNormalize';
import { queueThingDelete, queueThingUpsert } from '@/lib/sync/outbox';
import { subscribeSyncApplied } from '@/lib/sync/engine';
import {
  loadVersionedArray,
  saveVersionedArray,
} from '@/lib/storage/versioned';
import {
  PlanLimitError,
  loadPlanPrefs,
  planById,
  wouldExceedAssetLimit,
} from '@/lib/planLimits';

const STORAGE_KEY = 'lifeos:inventory:v1';
const SCHEMA_VERSION = 1;

export type InventoryItem = {
  id: string;
  name: string;
  brand: string;
  category: string;
  room: string;
  spaceId: string;
  icon: Icon3DName;
  /** Local file URI — never uploaded */
  imageUri?: string;
  purchaseDate: string;
  price: string;
  /** Retailer / marketplace — e.g. Amazon, Sharaf DG (not talk|capture source) */
  purchasedFrom?: string;
  /** Official product manual / support page URL when known */
  manualUrl?: string;
  /** Display name of the person this belongs to */
  assignedTo?: string;
  /** Optional link to family member id */
  personId?: string;
  warrantyExpiry: string;
  warrantyActive: boolean;
  condition: string;
  serial: string;
  estimatedValue: string;
  insight?: string;
  timeline: { date: string; event: string }[];
  /** Document-specific */
  isDocument?: boolean;
  documentKind?: MrzDocumentKind;
  documentNumber?: string;
  fullName?: string;
  nationality?: string;
  dateOfBirth?: string;
  expiryDate?: string;
  ocrText?: string;
  ocrOnDevice?: boolean;
  /** How the item entered LifeOS */
  source?: 'talk' | 'capture' | 'manual';
  createdAt: string;
  /** Last local mutation time — the last-write-wins clock for row sync. */
  updatedAt?: string;
};

type InventoryContextValue = {
  items: InventoryItem[];
  ready: boolean;
  addItem: (item: Omit<InventoryItem, 'id' | 'createdAt'> & { id?: string }) => Promise<InventoryItem>;
  updateItem: (id: string, patch: Partial<InventoryItem>) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  getById: (id: string) => InventoryItem | undefined;
};

const InventoryContext = createContext<InventoryContextValue | null>(null);

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [ready, setReady] = useState(false);
  const itemsRef = useRef<InventoryItem[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const loaded = await loadVersionedArray<InventoryItem>(
          STORAGE_KEY,
          SCHEMA_VERSION,
          normalizeInventoryItem
        );
        itemsRef.current = loaded;
        setItems(loaded);
      } catch {
        /* ignore */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // Reload when the sync engine merges remote rows into the local store.
  useEffect(() => {
    return subscribeSyncApplied((tables) => {
      if (!tables.includes('things')) return;
      void loadVersionedArray<InventoryItem>(
        STORAGE_KEY,
        SCHEMA_VERSION,
        normalizeInventoryItem
      ).then((loaded) => {
        itemsRef.current = loaded;
        setItems(loaded);
      });
    });
  }, []);

  // itemsRef is the authoritative list (updated synchronously), so mutators
  // can compute from it, show the optimistic state, and then AWAIT the disk
  // write — a failed write rejects instead of silently losing data.
  const persist = async (next: InventoryItem[]) => {
    itemsRef.current = next;
    setItems(next);
    await saveVersionedArray(STORAGE_KEY, SCHEMA_VERSION, next);
  };

  const addItem = useCallback(
    async (input: Omit<InventoryItem, 'id' | 'createdAt'> & { id?: string }) => {
      const prefs = await loadPlanPrefs();
      const plan = planById(prefs.planId);
      if (wouldExceedAssetLimit(plan, itemsRef.current.length)) {
        throw new PlanLimitError('assets');
      }
      const now = new Date().toISOString();
      const item: InventoryItem = {
        ...input,
        id: input.id ?? newUuid(),
        createdAt: now,
        updatedAt: now,
      };
      await persist([item, ...itemsRef.current]);
      void queueThingUpsert(item);
      return item;
    },
    []
  );

  const updateItem = useCallback(async (id: string, patch: Partial<InventoryItem>) => {
    let updated: InventoryItem | null = null;
    await persist(
      itemsRef.current.map((i) => {
        if (i.id !== id) return i;
        updated = { ...i, ...patch, updatedAt: new Date().toISOString() };
        return updated;
      })
    );
    if (updated) void queueThingUpsert(updated);
  }, []);

  const removeItem = useCallback(async (id: string) => {
    await persist(itemsRef.current.filter((i) => i.id !== id));
    void queueThingDelete(id);
  }, []);

  const getById = useCallback(
    (id: string) => itemsRef.current.find((i) => i.id === id) ?? items.find((i) => i.id === id),
    [items]
  );

  const value = useMemo(
    () => ({ items, ready, addItem, updateItem, removeItem, getById }),
    [items, ready, addItem, updateItem, removeItem, getById]
  );

  return (
    <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>
  );
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used within InventoryProvider');
  return ctx;
}
