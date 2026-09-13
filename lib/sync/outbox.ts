/**
 * Durable offline outbox (AsyncStorage). Every local mutation lands here
 * first; the sync engine drains it when connectivity allows. Survives app
 * restarts and airplane mode.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { InventoryItem } from '@/lib/InventoryContext';
import type { LastDoneItem } from '@/lib/lastDone';
import { coalesceOutbox, type OutboxOp, type SyncTable } from '@/lib/sync/core';

const OUTBOX_KEY = 'lifeos:sync:outbox:v1';
const MAX_QUEUE = 2000;

let cache: OutboxOp[] | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<OutboxOp[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    cache = raw ? (JSON.parse(raw) as OutboxOp[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function persist(next: OutboxOp[]): Promise<void> {
  cache = next;
  // Serialize writes so rapid mutations can't interleave half-written queues.
  writeChain = writeChain
    .then(() => AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(next)))
    .catch(() => undefined);
  return writeChain;
}

async function enqueue(op: Omit<OutboxOp, 'queuedAt' | 'attempts'>): Promise<void> {
  const queue = await load();
  const next = coalesceOutbox(queue, {
    ...op,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  }).slice(-MAX_QUEUE);
  await persist(next);
  void import('@/lib/sync/engine')
    .then((m) => m.scheduleRowSync())
    .catch(() => undefined);
}

export async function queueThingUpsert(item: InventoryItem): Promise<void> {
  await enqueue({ table: 'things', rowId: item.id, op: 'upsert', payload: item });
}

export async function queueThingDelete(id: string): Promise<void> {
  await enqueue({ table: 'things', rowId: id, op: 'delete' });
}

export async function queueReminderUpsert(item: LastDoneItem): Promise<void> {
  await enqueue({ table: 'reminders', rowId: item.id, op: 'upsert', payload: item });
}

export async function queueReminderDelete(id: string): Promise<void> {
  await enqueue({ table: 'reminders', rowId: id, op: 'delete' });
}

export async function peekOutbox(): Promise<OutboxOp[]> {
  return [...(await load())];
}

/** Remove ops that were pushed successfully (matched by table+rowId+queuedAt). */
export async function removeOutboxOps(done: OutboxOp[]): Promise<void> {
  if (!done.length) return;
  const keys = new Set(done.map((o) => `${o.table}:${o.rowId}:${o.queuedAt}`));
  const queue = await load();
  await persist(queue.filter((o) => !keys.has(`${o.table}:${o.rowId}:${o.queuedAt}`)));
}

export async function markOutboxFailure(
  failed: OutboxOp[],
  message: string
): Promise<void> {
  if (!failed.length) return;
  const keys = new Set(failed.map((o) => `${o.table}:${o.rowId}:${o.queuedAt}`));
  const queue = await load();
  await persist(
    queue.map((o) =>
      keys.has(`${o.table}:${o.rowId}:${o.queuedAt}`)
        ? { ...o, attempts: o.attempts + 1, lastError: message.slice(0, 200) }
        : o
    )
  );
}

export async function outboxSize(): Promise<number> {
  return (await load()).length;
}

export type { OutboxOp, SyncTable };
