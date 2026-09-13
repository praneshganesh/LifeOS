/**
 * Pure row-sync logic (docs/SYNC_ARCHITECTURE.md): outbox coalescing,
 * local item ↔ Supabase row mapping, and last-write-wins merging.
 * No AsyncStorage / network imports — unit-testable in plain Node.
 */
import type { InventoryItem } from '@/lib/InventoryContext';
import type { LastDoneItem } from '@/lib/lastDone';
import { isUuid } from '@/lib/ids';

export type SyncTable = 'things' | 'reminders';

export type OutboxOp = {
  /** Local id of the mutated row (legacy prefix ids allowed; mapped at push). */
  rowId: string;
  table: SyncTable;
  op: 'upsert' | 'delete';
  /** Full local item snapshot for upserts. */
  payload?: unknown;
  queuedAt: string;
  attempts: number;
  lastError?: string;
};

/**
 * One pending op per (table, rowId) — a newer mutation replaces the older
 * one (local LWW). A delete always replaces a pending upsert.
 */
export function coalesceOutbox(queue: OutboxOp[], next: OutboxOp): OutboxOp[] {
  const rest = queue.filter(
    (q) => !(q.table === next.table && q.rowId === next.rowId)
  );
  return [...rest, next];
}

/**
 * Bidirectional local-id ↔ sync-uuid resolver. UUID local ids map to
 * themselves; legacy prefix ids (`inv-…`, `ld-…`) get a persistent
 * generated uuid (engine supplies the persistence).
 */
export type IdResolver = {
  /** Local id → sync uuid (allocates for legacy ids). */
  toSync: (localId: string) => string;
  /** Sync uuid → local id (identity when no legacy mapping exists). */
  toLocal: (syncId: string) => string;
};

/** Identity resolver for fresh installs where every id is already a uuid. */
export const identityIds: IdResolver = {
  toSync: (id) => id,
  toLocal: (id) => id,
};

type RowCommon = {
  id: string;
  household_id: string;
  body: Record<string, unknown>;
  client_mutated_at: string | null;
  deleted_at: string | null;
};

export type ThingRow = RowCommon & {
  person_id: string | null;
  name: string;
  category: string | null;
  space_key: string | null;
  room: string | null;
  is_document: boolean;
  document_kind: string | null;
  expiry_date: string | null;
};

export type ReminderRow = RowCommon & {
  person_id: string | null;
  thing_id: string | null;
  label: string;
  remind_at: string | null;
  remind_interval: Record<string, unknown> | null;
};

function isoDateOrNull(value: string | undefined): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * body = full local item with reference ids rewritten to sync uuids, so a
 * second device reconstructs working links without our legacy-id map.
 */
export function thingToRow(
  item: InventoryItem,
  householdId: string,
  ids: IdResolver
): ThingRow {
  const body: Record<string, unknown> = {
    ...item,
    id: ids.toSync(item.id),
    ...(item.personId ? { personId: ids.toSync(item.personId) } : {}),
  };
  return {
    id: ids.toSync(item.id),
    household_id: householdId,
    // household_people are not row-synced yet; FK stays null until they are.
    person_id: null,
    name: item.name ?? '',
    category: item.category ?? null,
    space_key: item.spaceId ?? null,
    room: item.room ?? null,
    is_document: Boolean(item.isDocument),
    document_kind: item.documentKind && item.documentKind !== 'unknown' ? item.documentKind : null,
    expiry_date: isoDateOrNull(item.expiryDate),
    body,
    client_mutated_at: item.updatedAt ?? null,
    deleted_at: null,
  };
}

export function rowToThing(row: ThingRow, ids: IdResolver): InventoryItem {
  const body = (row.body ?? {}) as Partial<InventoryItem> & Record<string, unknown>;
  const personId =
    typeof body.personId === 'string' && body.personId
      ? ids.toLocal(body.personId)
      : undefined;
  return {
    ...(body as InventoryItem),
    id: ids.toLocal(row.id),
    ...(personId ? { personId } : {}),
    name: typeof body.name === 'string' && body.name ? body.name : row.name,
  };
}

export function reminderToRow(
  item: LastDoneItem,
  householdId: string,
  ids: IdResolver
): ReminderRow {
  const body: Record<string, unknown> = {
    ...item,
    id: ids.toSync(item.id),
    ...(item.inventoryItemId
      ? { inventoryItemId: ids.toSync(item.inventoryItemId) }
      : {}),
    ...(item.personId ? { personId: ids.toSync(item.personId) } : {}),
  };
  const thingSyncId = item.inventoryItemId ? ids.toSync(item.inventoryItemId) : null;
  return {
    id: ids.toSync(item.id),
    household_id: householdId,
    person_id: null,
    // Only set the FK when the referenced thing has a valid uuid; the link
    // always survives inside body regardless.
    thing_id: thingSyncId && isUuid(thingSyncId) ? thingSyncId : null,
    label: item.label ?? '',
    remind_at: item.remindAt ?? null,
    remind_interval: (item.remindInterval as Record<string, unknown> | undefined) ?? null,
    body,
    client_mutated_at: item.updatedAt ?? null,
    deleted_at: null,
  };
}

export function rowToReminder(row: ReminderRow, ids: IdResolver): LastDoneItem {
  const body = (row.body ?? {}) as Partial<LastDoneItem> & Record<string, unknown>;
  const inventoryItemId =
    typeof body.inventoryItemId === 'string' && body.inventoryItemId
      ? ids.toLocal(body.inventoryItemId)
      : undefined;
  const personId =
    typeof body.personId === 'string' && body.personId
      ? ids.toLocal(body.personId)
      : undefined;
  return {
    ...(body as LastDoneItem),
    id: ids.toLocal(row.id),
    ...(inventoryItemId ? { inventoryItemId } : {}),
    ...(personId ? { personId } : {}),
    label: typeof body.label === 'string' && body.label ? body.label : row.label,
    logs: Array.isArray(body.logs) ? body.logs : [],
  };
}

export type RemoteChange<T> = {
  localId: string;
  /** Server updated_at — the LWW clock. */
  updatedAt: string;
  deleted: boolean;
  item: T | null;
};

/**
 * Last-write-wins merge of pulled rows into the local list.
 * Remote wins when the local copy has no `updatedAt` stamp (pre-sync data)
 * or the remote clock is newer. Tombstones remove the local row.
 */
export function mergeRemote<T extends { id: string; updatedAt?: string }>(
  local: T[],
  remote: RemoteChange<T>[]
): { merged: T[]; changed: boolean } {
  if (!remote.length) return { merged: local, changed: false };

  const byId = new Map(local.map((item) => [item.id, item] as const));
  let changed = false;

  for (const change of remote) {
    const existing = byId.get(change.localId);
    const remoteWins =
      !existing || !existing.updatedAt || change.updatedAt > existing.updatedAt;
    if (!remoteWins) continue;

    if (change.deleted) {
      if (existing) {
        byId.delete(change.localId);
        changed = true;
      }
      continue;
    }
    if (change.item) {
      byId.set(change.localId, { ...change.item, updatedAt: change.updatedAt });
      changed = true;
    }
  }

  return { merged: changed ? [...byId.values()] : local, changed };
}
