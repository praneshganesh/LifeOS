/**
 * Row-sync engine (docs/SYNC_ARCHITECTURE.md): household bootstrap,
 * outbox push, cursor pull with last-write-wins merge into local stores.
 *
 * Offline-first invariants:
 * - Local writes never wait on this module (outbox is drained best-effort).
 * - Failures are recorded and retried on the next schedule/boot — never thrown
 *   into UI code paths.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { ensureCloudSession } from '@/lib/cloud/sync';
import { isUuid, newUuid } from '@/lib/ids';
import type { InventoryItem } from '@/lib/InventoryContext';
import { normalizeInventoryItem } from '@/lib/inventoryNormalize';
import { normalizeItem, type LastDoneItem } from '@/lib/lastDone';
import {
  loadVersionedArray,
  saveVersionedArray,
} from '@/lib/storage/versioned';
import {
  mergeRemote,
  reminderToRow,
  rowToReminder,
  rowToThing,
  thingToRow,
  type IdResolver,
  type OutboxOp,
  type ReminderRow,
  type RemoteChange,
  type SyncTable,
  type ThingRow,
} from '@/lib/sync/core';
import {
  markOutboxFailure,
  peekOutbox,
  queueReminderUpsert,
  queueThingUpsert,
  removeOutboxOps,
} from '@/lib/sync/outbox';

const HOUSEHOLD_KEY = 'lifeos:sync:household:v1';
const IDMAP_KEY = 'lifeos:sync:idmap:v1';
const CURSOR_KEY = 'lifeos:sync:cursor:v1';
const BACKFILL_KEY = 'lifeos:sync:backfilled:v1';

const INVENTORY_STORE = { key: 'lifeos:inventory:v1', version: 1 } as const;
const LASTDONE_STORE = { key: 'lifeos:last-done:v2', version: 1 } as const;

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
        syncId = newUuid();
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
// Household bootstrap
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

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

function opToRow(
  op: OutboxOp,
  householdId: string,
  ids: IdResolver
): ThingRow | ReminderRow {
  const now = new Date().toISOString();
  if (op.op === 'delete') {
    const base = {
      id: ids.toSync(op.rowId),
      household_id: householdId,
      body: {},
      client_mutated_at: op.queuedAt,
      deleted_at: now,
    };
    return op.table === 'things'
      ? {
          ...base,
          person_id: null,
          name: '',
          category: null,
          space_key: null,
          room: null,
          is_document: false,
          document_kind: null,
          expiry_date: null,
        }
      : {
          ...base,
          person_id: null,
          thing_id: null,
          label: '',
          remind_at: null,
          remind_interval: null,
        };
  }
  return op.table === 'things'
    ? thingToRow(op.payload as InventoryItem, householdId, ids)
    : reminderToRow(op.payload as LastDoneItem, householdId, ids);
}

async function pushOutbox(householdId: string, ids: IdResolver): Promise<void> {
  if (!supabase) return;
  const queue = await peekOutbox();
  if (!queue.length) return;

  // Things before reminders (reminders.thing_id FK).
  for (const table of ['things', 'reminders'] as const) {
    const ops = queue.filter((o) => o.table === table);
    if (!ops.length) continue;
    const rows = ops.map((o) => opToRow(o, householdId, ids));
    const { error } = await supabase
      .from(table)
      .upsert(rows as Record<string, unknown>[], { onConflict: 'id' });
    if (error) {
      await markOutboxFailure(ops, error.message);
      throw error;
    }
    await removeOutboxOps(ops);
  }
}

// ---------------------------------------------------------------------------
// Backfill: first sync enqueues every existing local row once
// ---------------------------------------------------------------------------

async function backfillOnce(): Promise<void> {
  const done = await AsyncStorage.getItem(BACKFILL_KEY);
  if (done === '1') return;
  const things = await loadVersionedArray<InventoryItem>(
    INVENTORY_STORE.key,
    INVENTORY_STORE.version,
    normalizeInventoryItem
  );
  const reminders = await loadVersionedArray<LastDoneItem>(
    LASTDONE_STORE.key,
    LASTDONE_STORE.version,
    normalizeItem
  );
  for (const item of things) await queueThingUpsert(item);
  for (const item of reminders) await queueReminderUpsert(item);
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

type RawRow = { id: string; updated_at: string; deleted_at: string | null };

async function fetchSince(
  table: SyncTable,
  householdId: string,
  cursor: string | undefined
): Promise<(RawRow & Record<string, unknown>)[]> {
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
  return (data ?? []) as (RawRow & Record<string, unknown>)[];
}

async function pullTable(
  table: SyncTable,
  householdId: string,
  ids: IdResolver,
  cursors: Cursors
): Promise<boolean> {
  const rows = await fetchSince(table, householdId, cursors[table]);
  if (!rows.length) return false;

  let changedLocal = false;
  if (table === 'things') {
    const changes: RemoteChange<InventoryItem>[] = rows.map((row) => ({
      localId: ids.toLocal(row.id),
      updatedAt: row.updated_at,
      deleted: row.deleted_at != null,
      item:
        row.deleted_at == null
          ? normalizeInventoryItem(rowToThing(row as unknown as ThingRow, ids))
          : null,
    }));
    const local = await loadVersionedArray<InventoryItem>(
      INVENTORY_STORE.key,
      INVENTORY_STORE.version,
      normalizeInventoryItem
    );
    const { merged, changed } = mergeRemote(local, changes);
    if (changed) {
      await saveVersionedArray(INVENTORY_STORE.key, INVENTORY_STORE.version, merged);
      changedLocal = true;
    }
  } else {
    const changes: RemoteChange<LastDoneItem>[] = rows.map((row) => ({
      localId: ids.toLocal(row.id),
      updatedAt: row.updated_at,
      deleted: row.deleted_at != null,
      item:
        row.deleted_at == null
          ? normalizeItem(rowToReminder(row as unknown as ReminderRow, ids))
          : null,
    }));
    const local = await loadVersionedArray<LastDoneItem>(
      LASTDONE_STORE.key,
      LASTDONE_STORE.version,
      normalizeItem
    );
    const { merged, changed } = mergeRemote(local, changes);
    if (changed) {
      await saveVersionedArray(LASTDONE_STORE.key, LASTDONE_STORE.version, merged);
      changedLocal = true;
    }
  }

  cursors[table] = rows[rows.length - 1].updated_at;
  await saveCursors(cursors);
  return changedLocal;
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
    const changedTables: SyncTable[] = [];
    for (const table of ['things', 'reminders'] as const) {
      if (await pullTable(table, householdId, ids, cursors)) {
        changedTables.push(table);
      }
    }
    await saveIdMapIfDirty();
    if (changedTables.length) emitApplied(changedTables);
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
