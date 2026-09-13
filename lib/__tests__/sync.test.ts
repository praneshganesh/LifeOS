import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isUuid, newUuid } from '../ids';
import {
  coalesceOutbox,
  mergeRemote,
  reminderToRow,
  rowToReminder,
  rowToThing,
  thingToRow,
  identityIds,
  type IdResolver,
  type OutboxOp,
} from '../sync/core';
import type { InventoryItem } from '../InventoryContext';
import type { LastDoneItem } from '../lastDone';

const HH = '11111111-2222-4333-8444-555555555555';

function makeResolver(seed: Record<string, string> = {}): IdResolver {
  const map = { ...seed };
  const reverse = new Map(Object.entries(map).map(([l, s]) => [s, l] as const));
  return {
    toSync: (localId) => {
      if (isUuid(localId)) return localId;
      if (!map[localId]) {
        map[localId] = newUuid();
        reverse.set(map[localId], localId);
      }
      return map[localId];
    },
    toLocal: (syncId) => reverse.get(syncId) ?? syncId,
  };
}

function sampleThing(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: newUuid(),
    name: 'Espresso machine',
    brand: 'Breville',
    category: 'Appliance',
    room: 'Kitchen',
    spaceId: 's1',
    icon: 'package' as InventoryItem['icon'],
    purchaseDate: '2026-01-05',
    price: 'AED 1,200',
    warrantyExpiry: '2028-01-05',
    warrantyActive: true,
    condition: 'New',
    serial: 'BRV-991',
    estimatedValue: 'AED 900',
    timeline: [{ date: '2026-01-05', event: 'Purchased' }],
    createdAt: '2026-01-05T10:00:00.000Z',
    updatedAt: '2026-02-01T08:00:00.000Z',
    ...overrides,
  };
}

function sampleReminder(overrides: Partial<LastDoneItem> = {}): LastDoneItem {
  return {
    id: newUuid(),
    label: 'Descale coffee machine',
    createdAt: '2026-03-01T09:00:00.000Z',
    logs: [{ id: 'log-1', doneAt: '2026-03-01T00:00:00.000Z' }],
    remindAt: '2026-06-01T00:00:00.000Z',
    remindInterval: { value: 3, unit: 'months', hour: 9 },
    updatedAt: '2026-03-01T09:00:00.000Z',
    ...overrides,
  };
}

describe('ids', () => {
  it('generates valid v4 uuids', () => {
    const id = newUuid();
    assert.ok(isUuid(id), id);
    assert.notEqual(newUuid(), id);
  });

  it('rejects legacy prefix ids', () => {
    assert.equal(isUuid('inv-1736-ab3'), false);
    assert.equal(isUuid('ld-1736-xyz'), false);
  });
});

describe('outbox coalescing', () => {
  const op = (rowId: string, kind: 'upsert' | 'delete', queuedAt: string): OutboxOp => ({
    rowId,
    table: 'things',
    op: kind,
    queuedAt,
    attempts: 0,
  });

  it('keeps one pending op per row, newest wins', () => {
    let q: OutboxOp[] = [];
    q = coalesceOutbox(q, op('a', 'upsert', 't1'));
    q = coalesceOutbox(q, op('b', 'upsert', 't2'));
    q = coalesceOutbox(q, op('a', 'upsert', 't3'));
    assert.equal(q.length, 2);
    assert.equal(q.find((o) => o.rowId === 'a')?.queuedAt, 't3');
  });

  it('delete replaces a pending upsert', () => {
    let q: OutboxOp[] = [coalesceOutbox([], op('a', 'upsert', 't1'))[0]];
    q = coalesceOutbox(q, op('a', 'delete', 't2'));
    assert.equal(q.length, 1);
    assert.equal(q[0].op, 'delete');
  });
});

describe('thing row mapping', () => {
  it('round-trips a uuid-id item losslessly', () => {
    const item = sampleThing();
    const row = thingToRow(item, HH, identityIds);
    assert.equal(row.id, item.id);
    assert.equal(row.household_id, HH);
    assert.equal(row.name, 'Espresso machine');
    assert.equal(row.space_key, 's1');
    assert.equal(row.client_mutated_at, item.updatedAt);
    const back = rowToThing(row, identityIds);
    assert.deepEqual(back, item);
  });

  it('maps legacy ids to stable uuids and back', () => {
    const ids = makeResolver();
    const item = sampleThing({ id: 'inv-1736-ab3' });
    const row = thingToRow(item, HH, ids);
    assert.ok(isUuid(row.id));
    assert.equal(thingToRow(item, HH, ids).id, row.id); // stable
    const back = rowToThing(row, ids);
    assert.equal(back.id, 'inv-1736-ab3');
  });

  it('extracts expiry date and document kind for documents', () => {
    const item = sampleThing({
      isDocument: true,
      documentKind: 'passport',
      expiryDate: '2031-04-20',
    });
    const row = thingToRow(item, HH, identityIds);
    assert.equal(row.is_document, true);
    assert.equal(row.document_kind, 'passport');
    assert.equal(row.expiry_date, '2031-04-20');
  });
});

describe('reminder row mapping', () => {
  it('round-trips and rewrites the thing link through the id map', () => {
    const ids = makeResolver();
    const item = sampleReminder({ inventoryItemId: 'inv-legacy-9' });
    const row = reminderToRow(item, HH, ids);
    assert.ok(isUuid(row.id) || row.id === item.id);
    assert.ok(row.thing_id && isUuid(row.thing_id));
    assert.equal((row.body as { inventoryItemId?: string }).inventoryItemId, row.thing_id);
    const back = rowToReminder(row, ids);
    assert.equal(back.inventoryItemId, 'inv-legacy-9');
    assert.equal(back.label, 'Descale coffee machine');
    assert.deepEqual(back.remindInterval, item.remindInterval);
  });

  it('keeps remind_at and interval in queryable columns', () => {
    const item = sampleReminder();
    const row = reminderToRow(item, HH, identityIds);
    assert.equal(row.remind_at, item.remindAt);
    assert.deepEqual(row.remind_interval, item.remindInterval);
  });
});

describe('last-write-wins merge', () => {
  it('remote wins over unstamped local (pre-sync data)', () => {
    const local = [sampleThing({ id: 'a', name: 'Old name', updatedAt: undefined })];
    const remote = [
      {
        localId: 'a',
        updatedAt: '2026-05-01T00:00:00Z',
        deleted: false,
        item: sampleThing({ id: 'a', name: 'New name' }),
      },
    ];
    const { merged, changed } = mergeRemote(local, remote);
    assert.equal(changed, true);
    assert.equal(merged[0].name, 'New name');
    assert.equal(merged[0].updatedAt, '2026-05-01T00:00:00Z');
  });

  it('newer local copy survives an older remote row', () => {
    const local = [
      sampleThing({ id: 'a', name: 'Fresh local', updatedAt: '2026-06-01T00:00:00Z' }),
    ];
    const remote = [
      {
        localId: 'a',
        updatedAt: '2026-05-01T00:00:00Z',
        deleted: false,
        item: sampleThing({ id: 'a', name: 'Stale remote' }),
      },
    ];
    const { merged, changed } = mergeRemote(local, remote);
    assert.equal(changed, false);
    assert.equal(merged[0].name, 'Fresh local');
  });

  it('tombstones remove the local row', () => {
    const local = [sampleThing({ id: 'a', updatedAt: '2026-01-01T00:00:00Z' })];
    const remote = [
      { localId: 'a', updatedAt: '2026-05-01T00:00:00Z', deleted: true, item: null },
    ];
    const { merged, changed } = mergeRemote(local, remote);
    assert.equal(changed, true);
    assert.equal(merged.length, 0);
  });

  it('adds rows created on another device', () => {
    const incoming = sampleThing({ id: 'b', name: 'From other phone' });
    const { merged } = mergeRemote(
      [sampleThing({ id: 'a' })],
      [{ localId: 'b', updatedAt: '2026-05-01T00:00:00Z', deleted: false, item: incoming }]
    );
    assert.equal(merged.length, 2);
    assert.ok(merged.some((i) => i.name === 'From other phone'));
  });
});
