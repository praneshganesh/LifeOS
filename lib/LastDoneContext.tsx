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
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  appendLog,
  createLastDoneItem,
  labelsMatch,
  normalizeItem,
  normalizeLabel,
  parseDateInput,
  resolveRemindAt,
  sortByMostRecent,
  type LastDoneItem,
  type LogDoneInput,
} from '@/lib/lastDone';
import {
  cancelLastDoneReminder,
  ensureNotificationHandler,
  scheduleLastDoneReminder,
  syncLastDoneReminders,
} from '@/lib/lastDoneNotifications';
import {
  loadVersionedArray,
  saveVersionedArray,
} from '@/lib/storage/versioned';

const STORAGE_KEY = 'lifeos:last-done:v2';
const LEGACY_STORAGE_KEY = 'lifeos:last-done:v1';
const SCHEMA_VERSION = 1;

type LastDoneContextValue = {
  items: LastDoneItem[];
  ready: boolean;
  /**
   * Mark done. Reuses the activity label and **appends** a new log entry.
   * Optional doneAt / remind fields layer on when provided.
   */
  logDone: (input: LogDoneInput) => Promise<LastDoneItem>;
  /** Delete the whole activity (all logs). */
  remove: (id: string) => Promise<void>;
  /** Delete one mistaken log. Removes the activity if no logs remain. */
  removeLog: (itemId: string, logId: string) => Promise<void>;
};

const LastDoneContext = createContext<LastDoneContextValue | null>(null);

async function loadItems(): Promise<LastDoneItem[]> {
  try {
    const fromVersioned = await loadVersionedArray<LastDoneItem>(
      STORAGE_KEY,
      SCHEMA_VERSION,
      normalizeItem
    );
    if (fromVersioned.length) return sortByMostRecent(fromVersioned);

    // Legacy bare array under v2 or v1 key
    for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) continue;
      const items = parsed
        .map(normalizeItem)
        .filter((i): i is LastDoneItem => i != null);
      const sorted = sortByMostRecent(items);
      if (sorted.length) {
        await saveVersionedArray(STORAGE_KEY, SCHEMA_VERSION, sorted);
        return sorted;
      }
    }
    return [];
  } catch {
    return [];
  }
}

async function saveItems(items: LastDoneItem[]) {
  await saveVersionedArray(STORAGE_KEY, SCHEMA_VERSION, items);
}

function applyLog(existing: LastDoneItem | null, input: LogDoneInput): LastDoneItem {
  const doneDate =
    (input.doneAt ? parseDateInput(input.doneAt) : null) ?? new Date();

  const hasExplicitRemind =
    input.remindInterval !== undefined || input.remindAt !== undefined;

  const linkOpts =
    input.inventoryItemId === null
      ? { inventoryItemId: null as string | null }
      : input.inventoryItemId
        ? { inventoryItemId: input.inventoryItemId }
        : {};

  if (existing) {
    if (hasExplicitRemind) {
      const remindFields = resolveRemindAt(doneDate, {
        remindInterval: input.remindInterval,
        remindAt: input.remindAt,
      });
      return appendLog(existing, {
        doneAt: doneDate,
        ...remindFields,
        ...linkOpts,
        replaceRemind: true,
      });
    }

    if (existing.remindInterval) {
      const rolled = resolveRemindAt(doneDate, {
        remindInterval: existing.remindInterval,
      });
      return appendLog(existing, {
        doneAt: doneDate,
        ...rolled,
        ...linkOpts,
        replaceRemind: true,
      });
    }

    // Append log; drop stale one-off remind from a previous cycle
    return appendLog(existing, {
      doneAt: doneDate,
      ...linkOpts,
      replaceRemind: true,
    });
  }

  const label = normalizeLabel(input.label ?? '');
  const remindFields = hasExplicitRemind
    ? resolveRemindAt(doneDate, {
        remindInterval: input.remindInterval,
        remindAt: input.remindAt,
      })
    : {};

  return createLastDoneItem(label, {
    doneAt: doneDate,
    ...remindFields,
    ...(typeof input.inventoryItemId === 'string' && input.inventoryItemId
      ? { inventoryItemId: input.inventoryItemId }
      : {}),
  });
}

export function LastDoneProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<LastDoneItem[]>([]);
  const [ready, setReady] = useState(false);
  /** Always-current list so rapid logDone / Talk turns don’t drop writes. */
  const itemsRef = useRef<LastDoneItem[]>([]);

  useEffect(() => {
    let alive = true;
    void ensureNotificationHandler();
    loadItems().then((loaded) => {
      if (!alive) return;
      itemsRef.current = loaded;
      setItems(loaded);
      setReady(true);
      // Persist migrated shape to v2
      if (loaded.length) void saveItems(loaded);
      void syncLastDoneReminders(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);

  const persist = useCallback(async (next: LastDoneItem[]) => {
    const sorted = sortByMostRecent(next);
    itemsRef.current = sorted;
    setItems(sorted);
    await saveItems(sorted);
  }, []);

  const logDone = useCallback(
    async (input: LogDoneInput) => {
      const list = itemsRef.current;
      if (input.id) {
        const existing = list.find((i) => i.id === input.id);
        if (!existing) throw new Error('Item not found');
        const updated = applyLog(existing, input);
        await persist(list.map((i) => (i.id === updated.id ? updated : i)));
        void scheduleLastDoneReminder(updated);
        return updated;
      }

      const label = normalizeLabel(input.label ?? '');
      if (!label) throw new Error('Label required');

      const linkId =
        typeof input.inventoryItemId === 'string' && input.inventoryItemId
          ? input.inventoryItemId
          : undefined;

      // Prefer same label on the same linked thing; else same label unlinked (then attach)
      const match =
        (linkId
          ? list.find(
              (i) =>
                labelsMatch(i.label, label) && i.inventoryItemId === linkId
            )
          : undefined) ||
        list.find(
          (i) =>
            labelsMatch(i.label, label) &&
            (!linkId || !i.inventoryItemId || i.inventoryItemId === linkId)
        );

      if (match) {
        const updated = applyLog(match, { ...input, id: match.id });
        await persist(list.map((i) => (i.id === updated.id ? updated : i)));
        void scheduleLastDoneReminder(updated);
        return updated;
      }

      const created = applyLog(null, { ...input, label });
      await persist([created, ...list]);
      void scheduleLastDoneReminder(created);
      return created;
    },
    [persist]
  );

  const remove = useCallback(
    async (id: string) => {
      await persist(itemsRef.current.filter((i) => i.id !== id));
      void cancelLastDoneReminder(id);
    },
    [persist]
  );

  const removeLog = useCallback(
    async (itemId: string, logId: string) => {
      let removedActivity = false;
      const next = itemsRef.current
        .map((item) => {
          if (item.id !== itemId) return item;
          const logs = (item.logs ?? []).filter((l) => l.id !== logId);
          if (!logs.length) {
            removedActivity = true;
            return null;
          }
          return { ...item, logs };
        })
        .filter((i): i is LastDoneItem => i != null);
      await persist(sortByMostRecent(next));
      if (removedActivity) void cancelLastDoneReminder(itemId);
    },
    [persist]
  );

  const value = useMemo(
    () => ({ items, ready, logDone, remove, removeLog }),
    [items, ready, logDone, remove, removeLog]
  );

  return (
    <LastDoneContext.Provider value={value}>{children}</LastDoneContext.Provider>
  );
}

export function useLastDone() {
  const ctx = useContext(LastDoneContext);
  if (!ctx) throw new Error('useLastDone must be used within LastDoneProvider');
  return ctx;
}
