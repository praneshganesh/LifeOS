/**
 * Row-sync engine (docs/SYNC_ARCHITECTURE.md): household bootstrap,
 * outbox push, cursor pull with last-write-wins merge into local stores,
 * plus durable media reconciliation. Covers every module.
 *
 * Offline-first invariants:
 * - Local writes never wait on this module (outbox is drained best-effort).
 * - Failures are recorded and retried on the next schedule/boot — never thrown
 *   into UI code paths.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { ensureCloudSession } from '@/lib/cloud/sync';
import { isUuid, legacyIdToUuid } from '@/lib/ids';
import type { InventoryItem } from '@/lib/InventoryContext';
import { normalizeInventoryItem } from '@/lib/inventoryNormalize';
import { normalizeItem, type LastDoneItem } from '@/lib/lastDone';
import { normalizeExpense, type Expense } from '@/lib/expenses';
import { normalizeSubscription, type Subscription } from '@/lib/subscriptions';
import { normalizeHabit, type Habit } from '@/lib/habits';
import { normalizeClassPack, type ClassPack } from '@/lib/classes';
import { normalizeHouseholdMember, type HouseholdMember } from '@/lib/household';
import type { Room, Space } from '@/lib/spacesDefaults';
import {
  loadVersioned,
  loadVersionedArray,
  saveVersioned,
  saveVersionedArray,
} from '@/lib/storage/versioned';
import {
  SYNC_TABLE_ORDER,
  genericToRow,
  mergeRemote,
  personToRow,
  reminderToRow,
  rowToGeneric,
  rowToPerson,
  rowToReminder,
  rowToThing,
  thingToRow,
  tombstoneRow,
  type GenericRow,
  type IdResolver,
  type OutboxOp,
  type PersonRow,
  type ReminderRow,
  type RemoteChange,
  type SyncTable,
  type ThingRow,
} from '@/lib/sync/core';
import {
  markOutboxFailure,
  peekOutbox,
  queueUpsert,
  removeOutboxOps,
} from '@/lib/sync/outbox';
import { reconcileMediaList } from '@/lib/media/mediaSync';

const HOUSEHOLD_KEY = 'lifeos:sync:household:v1';
const IDMAP_KEY = 'lifeos:sync:idmap:v1';
const CURSOR_KEY = 'lifeos:sync:cursor:v1';
const BACKFILL_KEY = 'lifeos:sync:backfilled:v2';

// ---------------------------------------------------------------------------
// Store registry (one spec per synced table)
// ---------------------------------------------------------------------------

type ManagedSpace = Space & { custom?: boolean; updatedAt?: string };
type ManagedRoom = Room & { custom?: boolean; updatedAt?: string };
type SpacesPayload = { spaces: ManagedSpace[]; rooms: ManagedRoom[] };

const SPACES_STORE = { key: 'lifeos:spaces:v2', version: 1 } as const;

async function loadSpacesPayload(): Promise<SpacesPayload> {
  const data = await loadVersioned<SpacesPayload | null>(
    SPACES_STORE.key,
    SPACES_STORE.version,
    null
  );
  return {
    spaces: Array.isArray(data?.spaces) ? data!.spaces : [],
    rooms: Array.isArray(data?.rooms) ? data!.rooms : [],
  };
}

type Synced = { id: string; updatedAt?: string };

type TableSpec<T extends Synced> = {
  table: SyncTable;
  load: () => Promise<T[]>;
  save: (list: T[]) => Promise<void>;
  normalize: (raw: unknown) => T | null;
  toRow: (item: T, householdId: string, ids: IdResolver) => Record<string, unknown>;
  fromRow: (row: Record<string, unknown>, ids: IdResolver) => T;
};

function arrayStore<T extends Synced>(
  table: SyncTable,
  key: string,
  version: number,
  normalize: (raw: unknown) => T | null,
  toRow: TableSpec<T>['toRow'],
  fromRow: TableSpec<T>['fromRow']
): TableSpec<T> {
  return {
    table,
    load: () => loadVersionedArray<T>(key, version, normalize),
    save: (list) => saveVersionedArray(key, version, list),
    normalize,
    toRow,
    fromRow,
  };
}

const genericSpec = <T extends Synced & { title?: string; name?: string }>(
  table: SyncTable,
  key: string,
  normalize: (raw: unknown) => T | null
): TableSpec<T> =>
  arrayStore<T>(
    table,
    key,
    1,
    normalize,
    (item, hid, ids) => genericToRow(item, hid, ids),
    (row, ids) => rowToGeneric<T>(row as unknown as GenericRow, ids)
  );

const passthrough = <T,>(raw: unknown): T | null =>
  raw && typeof raw === 'object' && typeof (raw as { id?: unknown }).id === 'string'
    ? (raw as T)
    : null;

/** Erase the row type once so heterogeneous specs can share one registry. */
const erase = <T extends Synced>(spec: TableSpec<T>): TableSpec<Synced> =>
  spec as unknown as TableSpec<Synced>;

const SPECS: TableSpec<Synced>[] = [
  erase(arrayStore<HouseholdMember>(
    'household_people',
    'lifeos:household:v1',
    1,
    normalizeHouseholdMember,
    personToRow,
    (row, ids) => rowToPerson(row as unknown as PersonRow, ids)
  )),
  erase<ManagedSpace>({
    table: 'spaces',
    load: async () => (await loadSpacesPayload()).spaces,
    save: async (list) => {
      const payload = await loadSpacesPayload();
      await saveVersioned(SPACES_STORE.key, SPACES_STORE.version, {
        ...payload,
        spaces: list as ManagedSpace[],
      });
    },
    normalize: passthrough<ManagedSpace>,
    toRow: (item, hid, ids) => genericToRow(item, hid, ids),
    fromRow: (row, ids) => rowToGeneric<ManagedSpace>(row as unknown as GenericRow, ids),
  }),
  erase<ManagedRoom>({
    table: 'rooms',
    load: async () => (await loadSpacesPayload()).rooms,
    save: async (list) => {
      const payload = await loadSpacesPayload();
      await saveVersioned(SPACES_STORE.key, SPACES_STORE.version, {
        ...payload,
        rooms: list as ManagedRoom[],
      });
    },
    normalize: passthrough<ManagedRoom>,
    toRow: (item, hid, ids) => genericToRow(item, hid, ids),
    fromRow: (row, ids) => rowToGeneric<ManagedRoom>(row as unknown as GenericRow, ids),
  }),
  erase(arrayStore<InventoryItem>(
    'things',
    'lifeos:inventory:v1',
    1,
    normalizeInventoryItem,
    thingToRow,
    (row, ids) => rowToThing(row as unknown as ThingRow, ids)
  )),
  erase(arrayStore<LastDoneItem>(
    'reminders',
    'lifeos:last-done:v2',
    1,
    normalizeItem,
    reminderToRow,
    (row, ids) => rowToReminder(row as unknown as ReminderRow, ids)
  )),
  erase(genericSpec<Expense>('expenses', 'lifeos:expenses:v1', normalizeExpense)),
  erase(
    genericSpec<Subscription>('subscriptions', 'lifeos:subscriptions:v1', normalizeSubscription)
  ),
  erase(genericSpec<Habit>('habits', 'lifeos:habits:v1', normalizeHabit)),
  erase(genericSpec<ClassPack>('class_packs', 'lifeos:classes:v1', normalizeClassPack)),
];

const SPEC_BY_TABLE = new Map(SPECS.map((s) => [s.table, s] as const));

// ---------------------------------------------------------------------------
// Sync-applied notifications (contexts reload their store when rows land)
// ---------------------------------------------------------------------------

type SyncListener = (tables: SyncTable[]) => void;
const listeners = new Set<SyncListener>();

export function subscribeSyncApplied(cb: SyncListener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emitApplied(tables: SyncTable[]): void {
  for (const cb of listeners) {
    try {
      cb(tables);
    } catch {
      /* listener errors must not break sync */
    }
  }
}

// ---------------------------------------------------------------------------
// Legacy-id ↔ uuid map (persisted; identity for uuid ids)
// ---------------------------------------------------------------------------

type IdMapRecord = Record<string, string>; // localId -> syncId

let idMapCache: IdMapRecord | null = null;
let idMapDirty = false;

async function loadIdMap(): Promise<IdMapRecord> {
  if (idMapCache) return idMapCache;
  try {
    const raw = await AsyncStorage.getItem(IDMAP_KEY);
    idMapCache = raw ? (JSON.parse(raw) as IdMapRecord) : {};
  } catch {
    idMapCache = {};
  }
  return idMapCache;
}

async function saveIdMapIfDirty(): Promise<void> {
  if (!idMapDirty || !idMapCache) return;
  idMapDirty = false;
  await AsyncStorage.setItem(IDMAP_KEY, JSON.stringify(idMapCache));
}

function makeResolver(map: IdMapRecord): IdResolver {
  const reverse = new Map(Object.entries(map).map(([l, s]) => [s, l] as const));
  return {
    toSync: (localId) => {
      if (isUuid(localId)) return localId;
      let syncId = map[localId];
      if (!syncId) {
        // Deterministic: same legacy id → same uuid on every device.
        syncId = legacyIdToUuid(localId);
        map[localId] = syncId;
        reverse.set(syncId, localId);
        idMapDirty = true;
      }
      return syncId;
    },
    toLocal: (syncId) => reverse.get(syncId) ?? syncId,
  };
}

// ---------------------------------------------------------------------------
// Household bootstrap / identity changes
// ---------------------------------------------------------------------------

export async function ensureHouseholdId(): Promise<string | null> {
  if (!supabase) return null;
  const cached = await AsyncStorage.getItem(HOUSEHOLD_KEY);
  if (cached && isUuid(cached)) return cached;
  const userId = await ensureCloudSession();
  if (!userId) return null;
  const { data, error } = await supabase.rpc('ensure_household');
  if (error) throw error;
  const householdId = typeof data === 'string' ? data : null;
  if (householdId) await AsyncStorage.setItem(HOUSEHOLD_KEY, householdId);
  return householdId;
}

/** Cached household for this device (null until first successful sync). */
export async function getCachedHouseholdId(): Promise<string | null> {
  const cached = await AsyncStorage.getItem(HOUSEHOLD_KEY);
  return cached && isUuid(cached) ? cached : null;
}

/**
 * After the signed-in user changes (Apple reclaim, recovery-code claim):
 * forget household + cursors so the next sync resolves the new household,
 * pulls everything, and re-imports local rows with ON CONFLICT DO NOTHING.
 */
export async function resetSyncStateForUser(householdId?: string | null): Promise<void> {
  await AsyncStorage.multiRemove([CURSOR_KEY, BACKFILL_KEY]);
  if (householdId && isUuid(householdId)) {
    await AsyncStorage.setItem(HOUSEHOLD_KEY, householdId);
  } else {
    await AsyncStorage.removeItem(HOUSEHOLD_KEY);
  }
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

function opToRow(
  op: OutboxOp,
  householdId: string,
  ids: IdResolver
): Record<string, unknown> {
  const now = new Date().toISOString();
  if (op.op === 'delete') {
    return tombstoneRow(op.table, ids.toSync(op.rowId), householdId, op.queuedAt, now);
  }
  const spec = SPEC_BY_TABLE.get(op.table);
  if (!spec) throw new Error(`No sync spec for ${op.table}`);
  return spec.toRow(op.payload as Synced, householdId, ids);
}

async function pushOutbox(householdId: string, ids: IdResolver): Promise<void> {
  if (!supabase) return;
  const queue = await peekOutbox();
  if (!queue.length) return;

  for (const table of SYNC_TABLE_ORDER) {
    const ops = queue.filter((o) => o.table === table);
    if (!ops.length) continue;

    // Backfill ops must never overwrite newer cloud rows.
    for (const backfill of [false, true]) {
      const batch = ops.filter((o) => Boolean(o.backfill) === backfill);
      if (!batch.length) continue;
      const rows = batch.map((o) => opToRow(o, householdId, ids));
      const { error } = await supabase
        .from(table)
        .upsert(rows, { onConflict: 'id', ignoreDuplicates: backfill });
      if (error) {
        await markOutboxFailure(batch, error.message);
        throw error;
      }
      await removeOutboxOps(batch);
    }
  }
}

// ---------------------------------------------------------------------------
// Backfill: first sync enqueues every existing local row once
// ---------------------------------------------------------------------------

async function backfillOnce(): Promise<void> {
  const done = await AsyncStorage.getItem(BACKFILL_KEY);
  if (done === '1') return;
  for (const spec of SPECS) {
    const list = await spec.load();
    for (const item of list) {
      await queueUpsert(spec.table, item, { backfill: true, silent: true });
    }
  }
  await AsyncStorage.setItem(BACKFILL_KEY, '1');
}

// ---------------------------------------------------------------------------
// Pull (cursor per table, LWW merge into the local versioned store)
// ---------------------------------------------------------------------------

type Cursors = Partial<Record<SyncTable, string>>;

async function loadCursors(): Promise<Cursors> {
  try {
    const raw = await AsyncStorage.getItem(CURSOR_KEY);
    return raw ? (JSON.parse(raw) as Cursors) : {};
  } catch {
    return {};
  }
}

async function saveCursors(cursors: Cursors): Promise<void> {
  await AsyncStorage.setItem(CURSOR_KEY, JSON.stringify(cursors));
}

type RawRow = { id: string; updated_at: string; deleted_at: string | null } & Record<
  string,
  unknown
>;

async function fetchSince(
  table: SyncTable,
  householdId: string,
  cursor: string | undefined
): Promise<RawRow[]> {
  if (!supabase) return [];
  let query = supabase
    .from(table)
    .select('*')
    .eq('household_id', householdId)
    .order('updated_at', { ascending: true })
    .limit(500);
  if (cursor) query = query.gt('updated_at', cursor);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as RawRow[];
}

async function pullTable(
  spec: TableSpec<Synced>,
  householdId: string,
  ids: IdResolver,
  cursors: Cursors
): Promise<boolean> {
  const rows = await fetchSince(spec.table, householdId, cursors[spec.table]);
  if (!rows.length) return false;

  const local = await spec.load();
  // Seed the reverse map so deterministic uuids of local legacy ids (s1, rm-…)
  // resolve back to the local id instead of creating a duplicate.
  for (const item of local) ids.toSync(item.id);

  const changes: RemoteChange<Synced>[] = rows.map((row) => ({
    localId: ids.toLocal(row.id),
    updatedAt: row.updated_at,
    deleted: row.deleted_at != null,
    item: row.deleted_at == null ? spec.normalize(spec.fromRow(row, ids)) : null,
  }));

  const { merged, changed } = mergeRemote(local, changes);
  if (changed) await spec.save(merged);

  cursors[spec.table] = rows[rows.length - 1].updated_at;
  await saveCursors(cursors);
  return changed;
}

// ---------------------------------------------------------------------------
// Media reconciliation (things.imageUri ↔ imagePath, expenses.receiptUri ↔ receiptPath)
// ---------------------------------------------------------------------------

async function syncMedia(householdId: string): Promise<SyncTable[]> {
  const changed: SyncTable[] = [];
  const budget = { remaining: 4 };

  const things = SPEC_BY_TABLE.get('things')!;
  const thingList = await things.load();
  const t = await reconcileMediaList(
    householdId,
    thingList,
    [{ uriKey: 'imageUri', pathKey: 'imagePath' }],
    budget
  );
  if (t.uploadedIds.length || t.downloadedIds.length) {
    await things.save(t.items);
    changed.push('things');
    for (const id of t.uploadedIds) {
      const item = t.items.find((x) => x.id === id);
      if (item) await queueUpsert('things', item, { silent: true });
    }
  }

  const expenses = SPEC_BY_TABLE.get('expenses')!;
  const expenseList = await expenses.load();
  const e = await reconcileMediaList(
    householdId,
    expenseList,
    [{ uriKey: 'receiptUri', pathKey: 'receiptPath' }],
    budget
  );
  if (e.uploadedIds.length || e.downloadedIds.length) {
    await expenses.save(e.items);
    changed.push('expenses');
    for (const id of e.uploadedIds) {
      const item = e.items.find((x) => x.id === id);
      if (item) await queueUpsert('expenses', item, { silent: true });
    }
  }

  return changed;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

let syncing = false;
let queuedWhileSyncing = false;

export async function syncRowsNow(): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  if (syncing) {
    queuedWhileSyncing = true;
    return;
  }
  syncing = true;
  try {
    const householdId = await ensureHouseholdId();
    if (!householdId) return;

    await backfillOnce();

    const ids = makeResolver(await loadIdMap());
    await pushOutbox(householdId, ids);

    const cursors = await loadCursors();
    const changedTables = new Set<SyncTable>();
    for (const spec of SPECS) {
      if (await pullTable(spec, householdId, ids, cursors)) {
        changedTables.add(spec.table);
      }
    }

    // Media after rows so downloads see freshly pulled paths and uploads
    // stamp paths onto rows that already exist remotely.
    for (const table of await syncMedia(householdId)) changedTables.add(table);
    await pushOutbox(householdId, ids);

    await saveIdMapIfDirty();
    if (changedTables.size) emitApplied([...changedTables]);
  } catch {
    // Offline / auth hiccup — the outbox keeps everything; retry later.
    await saveIdMapIfDirty().catch(() => undefined);
  } finally {
    syncing = false;
    if (queuedWhileSyncing) {
      queuedWhileSyncing = false;
      scheduleRowSync();
    }
  }
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced sync — call after any local mutation (fire-and-forget). */
export function scheduleRowSync(): void {
  if (!isSupabaseConfigured()) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void syncRowsNow();
  }, 2500);
}
