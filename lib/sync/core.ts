/**
 * Pure row-sync logic (docs/SYNC_ARCHITECTURE.md): outbox coalescing,
 * local item ↔ Supabase row mapping, and last-write-wins merging.
 * No AsyncStorage / network imports, unit-testable in plain Node.
 */
import type { InventoryItem } from '@/lib/InventoryContext';
import type { LastDoneItem } from '@/lib/lastDone';
import type { Expense } from '@/lib/expenses';
import type { Subscription } from '@/lib/subscriptions';
import type { Habit } from '@/lib/habits';
import type { ClassPack } from '@/lib/classes';
import type { HouseholdMember } from '@/lib/household';
import { isUuid } from '@/lib/ids';

export type SyncTable =
  | 'household_people'
  | 'spaces'
  | 'rooms'
  | 'things'
  | 'reminders'
  | 'expenses'
  | 'subscriptions'
  | 'habits'
  | 'class_packs';

/** Push order: referenced rows before rows that point at them. */
export const SYNC_TABLE_ORDER: readonly SyncTable[] = [
  'household_people',
  'spaces',
  'rooms',
  'things',
  'reminders',
  'expenses',
  'subscriptions',
  'habits',
  'class_packs',
] as const;

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
  /**
   * First-sync import of pre-existing local rows. Pushed with
   * ON CONFLICT DO NOTHING so a fresh device never clobbers newer cloud rows.
   */
  backfill?: boolean;
};

/**
 * One pending op per (table, rowId), a newer mutation replaces the older
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
 * themselves; legacy prefix ids (`inv-…`, `ld-…`, `s1`) get a deterministic
 * uuid (engine supplies the persistence).
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

/** expenses / subscriptions / habits / class_packs / spaces / rooms */
export type GenericRow = RowCommon & {
  person_id: string | null;
  title: string;
};

export type PersonRow = RowCommon & {
  name: string;
  role: string;
  relation: string | null;
};

function isoDateOrNull(value: string | undefined): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Device-only URIs never belong in a cloud row body. */
export const LOCAL_MEDIA_FIELDS = ['imageUri', 'receiptUri', 'photoUri', 'localUri', 'fileUri'] as const;

export function isLocalMediaUri(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const v = value.trim().toLowerCase();
  return (
    v.startsWith('file:') ||
    v.startsWith('content:') ||
    v.startsWith('ph://') ||
    v.startsWith('assets-library:') ||
    v.startsWith('blob:') ||
    v.startsWith('data:image/')
  );
}

/** Ids inside items that point at other synced rows. */
const REF_FIELDS = ['personId', 'inventoryItemId', 'spaceId'] as const;

/**
 * body = full local item with reference ids rewritten to sync uuids and
 * local media URIs removed (the durable `imagePath` / `receiptPath` stay).
 */
export function itemToBody<T extends { id: string }>(
  item: T,
  ids: IdResolver
): Record<string, unknown> {
  const body: Record<string, unknown> = { ...item, id: ids.toSync(item.id) };
  for (const key of REF_FIELDS) {
    const v = body[key];
    if (typeof v === 'string' && v) body[key] = ids.toSync(v);
  }
  for (const key of LOCAL_MEDIA_FIELDS) {
    if (isLocalMediaUri(body[key])) delete body[key];
  }
  return body;
}

export function bodyToItem<T extends { id: string }>(
  row: { id: string; body: Record<string, unknown> },
  ids: IdResolver
): T {
  const body = { ...(row.body ?? {}) } as Record<string, unknown>;
  body.id = ids.toLocal(row.id);
  for (const key of REF_FIELDS) {
    const v = body[key];
    if (typeof v === 'string' && v) body[key] = ids.toLocal(v);
  }
  return body as T;
}

/** Top-level person_id FK when body.personId maps to a real uuid. */
function personIdColumn(
  item: { personId?: string | null },
  ids: IdResolver
): string | null {
  const personLocal =
    typeof item.personId === 'string' && item.personId.trim() ? item.personId.trim() : '';
  if (!personLocal) return null;
  const personSync = ids.toSync(personLocal);
  return personSync && isUuid(personSync) ? personSync : null;
}

export function thingToRow(
  item: InventoryItem,
  householdId: string,
  ids: IdResolver
): ThingRow {
  return {
    id: ids.toSync(item.id),
    household_id: householdId,
    person_id: personIdColumn(item, ids),
    name: item.name ?? '',
    category: item.category ?? null,
    space_key: item.spaceId ?? null,
    room: item.room ?? null,
    is_document: Boolean(item.isDocument),
    document_kind: item.documentKind && item.documentKind !== 'unknown' ? item.documentKind : null,
    expiry_date: isoDateOrNull(item.expiryDate),
    body: itemToBody(item, ids),
    client_mutated_at: item.updatedAt ?? null,
    deleted_at: null,
  };
}

export function rowToThing(row: ThingRow, ids: IdResolver): InventoryItem {
  const item = bodyToItem<InventoryItem>(row, ids);
  return {
    ...item,
    name: typeof item.name === 'string' && item.name ? item.name : row.name,
  };
}

export function reminderToRow(
  item: LastDoneItem,
  householdId: string,
  ids: IdResolver
): ReminderRow {
  const thingSyncId = item.inventoryItemId ? ids.toSync(item.inventoryItemId) : null;
  return {
    id: ids.toSync(item.id),
    household_id: householdId,
    person_id: personIdColumn(item, ids),
    // Only set the FK when the referenced thing has a valid uuid; the link
    // always survives inside body regardless.
    thing_id: thingSyncId && isUuid(thingSyncId) ? thingSyncId : null,
    label: item.label ?? '',
    remind_at: item.remindAt ?? null,
    remind_interval: (item.remindInterval as Record<string, unknown> | undefined) ?? null,
    body: itemToBody(item, ids),
    client_mutated_at: item.updatedAt ?? null,
    deleted_at: null,
  };
}

export function rowToReminder(row: ReminderRow, ids: IdResolver): LastDoneItem {
  const item = bodyToItem<LastDoneItem>(row, ids);
  return {
    ...item,
    label: typeof item.label === 'string' && item.label ? item.label : row.label,
    logs: Array.isArray(item.logs) ? item.logs : [],
  };
}

type Titled = { id: string; updatedAt?: string; title?: string; name?: string };

export function genericToRow<T extends Titled>(
  item: T,
  householdId: string,
  ids: IdResolver
): GenericRow {
  return {
    id: ids.toSync(item.id),
    household_id: householdId,
    // Keep the FK in sync with body.personId when we have a real uuid.
    person_id: personIdColumn(item as { personId?: string | null }, ids),
    title: String(item.title ?? item.name ?? ''),
    body: itemToBody(item, ids),
    client_mutated_at: item.updatedAt ?? null,
    deleted_at: null,
  };
}

export function rowToGeneric<T extends { id: string }>(row: GenericRow, ids: IdResolver): T {
  return bodyToItem<T>(row, ids);
}

export function personToRow(
  item: HouseholdMember,
  householdId: string,
  ids: IdResolver
): PersonRow {
  return {
    id: ids.toSync(item.id),
    household_id: householdId,
    name: item.name ?? '',
    role: item.role ?? 'adult',
    relation: item.relation ?? null,
    body: itemToBody(item, ids),
    client_mutated_at: item.updatedAt ?? null,
    deleted_at: null,
  };
}

export function rowToPerson(row: PersonRow, ids: IdResolver): HouseholdMember {
  const item = bodyToItem<HouseholdMember>(row, ids);
  return {
    ...item,
    name: typeof item.name === 'string' && item.name ? item.name : row.name,
  };
}

/** Column shape a tombstone needs so NOT NULL constraints hold per table. */
export function tombstoneRow(
  table: SyncTable,
  syncId: string,
  householdId: string,
  queuedAt: string,
  now: string
): Record<string, unknown> {
  const base = {
    id: syncId,
    household_id: householdId,
    body: {},
    client_mutated_at: queuedAt,
    deleted_at: now,
  };
  switch (table) {
    case 'things':
      return {
        ...base,
        person_id: null,
        name: '',
        category: null,
        space_key: null,
        room: null,
        is_document: false,
        document_kind: null,
        expiry_date: null,
      };
    case 'reminders':
      return {
        ...base,
        person_id: null,
        thing_id: null,
        label: '',
        remind_at: null,
        remind_interval: null,
      };
    case 'household_people':
      return { ...base, name: '', role: 'adult', relation: null };
    default:
      return { ...base, person_id: null, title: '' };
  }
}

export type RemoteChange<T> = {
  localId: string;
  /** Server updated_at, the LWW clock. */
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

export type { Expense, Subscription, Habit, ClassPack, HouseholdMember };
