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
  getLastDoneAt,
  labelsMatch,
  normalizeItem,
  normalizeLabel,
  parseDateInput,
  resolveRemindAt,
  sortByMostRecent,
  type LastDoneItem,
  type LogDoneInput,
  type RemindInterval,
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
  /** One-off future reminder — does not mark the activity done. */
  setReminder: (input: {
    label: string;
    remindAt: string;
    inventoryItemId?: string | null;
    personId?: string | null;
    assignedTo?: string | null;
  }) => Promise<LastDoneItem>;
  /**
   * Rename an activity and/or change its repeat reminder.
   * `remindInterval: null` clears the reminder; an interval re-anchors it
   * from the most recent done date.
   */
  updateActivity: (
    id: string,
    patch: { label?: string; remindInterval?: RemindInterval | null }
  ) => Promise<LastDoneItem>;
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
  const personOpts =
    input.personId === null
      ? { personId: null as string | null, assignedTo: null as string | null }
      : input.personId
        ? {
            personId: input.personId,
            assignedTo: input.assignedTo || undefined,
          }
        : input.assignedTo
          ? { assignedTo: input.assignedTo }
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
        ...personOpts,
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
        ...personOpts,
        replaceRemind: true,
      });
    }

    // Append log; drop stale one-off remind from a previous cycle
    return appendLog(existing, {
      doneAt: doneDate,
      ...linkOpts,
      ...personOpts,
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
    ...(typeof input.personId === 'string' && input.personId
      ? { personId: input.personId, assignedTo: input.assignedTo || undefined }
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

      const personId =
        typeof input.personId === 'string' && input.personId
          ? input.personId
          : undefined;

      const samePerson = (i: LastDoneItem) =>
        personId ? i.personId === personId || !i.personId : true;

      // Prefer same label on the same linked thing; else same label unlinked (then attach)
      const match =
        (linkId
          ? list.find(
              (i) =>
                labelsMatch(i.label, label) &&
                i.inventoryItemId === linkId &&
                samePerson(i)
            )
          : undefined) ||
        list.find(
          (i) =>
            labelsMatch(i.label, label) &&
            samePerson(i) &&
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

  const setReminder = useCallback(
    async (input: {
      label: string;
      remindAt: string;
      inventoryItemId?: string | null;
      personId?: string | null;
      assignedTo?: string | null;
    }) => {
      const list = itemsRef.current;
      const label = normalizeLabel(input.label ?? '');
      if (!label) throw new Error('Label required');
      const remindFields = resolveRemindAt(new Date(), { remindAt: input.remindAt });
      if (!remindFields.remindAt) throw new Error('Invalid reminder date');
      const linkId =
        typeof input.inventoryItemId === 'string' && input.inventoryItemId
          ? input.inventoryItemId
          : undefined;
      const personId =
        typeof input.personId === 'string' && input.personId
          ? input.personId
          : undefined;
      const assignedTo = input.assignedTo?.trim() || undefined;

      const samePerson = (i: LastDoneItem) =>
        personId ? i.personId === personId || !i.personId : true;

      const match =
        (linkId
          ? list.find(
              (i) =>
                labelsMatch(i.label, label) &&
                i.inventoryItemId === linkId &&
                samePerson(i)
            )
          : undefined) ||
        list.find((i) => labelsMatch(i.label, label) && samePerson(i));

      if (match) {
        const updated: LastDoneItem = {
          ...match,
          ...remindFields,
          ...(linkId ? { inventoryItemId: linkId } : {}),
          ...(personId ? { personId, assignedTo: assignedTo || match.assignedTo } : {}),
        };
        await persist(list.map((i) => (i.id === updated.id ? updated : i)));
        void scheduleLastDoneReminder(updated);
        return updated;
      }

      const created = createLastDoneItem(label, {
        doneAt: null,
        remindAt: remindFields.remindAt,
        inventoryItemId: linkId,
        personId,
        assignedTo,
      });
      await persist([created, ...list]);
      void scheduleLastDoneReminder(created);
      return created;
    },
    [persist]
  );

  const updateActivity = useCallback(
    async (
      id: string,
      patch: { label?: string; remindInterval?: RemindInterval | null }
    ) => {
      const list = itemsRef.current;
      const existing = list.find((i) => i.id === id);
      if (!existing) throw new Error('Item not found');
      let updated: LastDoneItem = { ...existing };
      if (patch.label !== undefined) {
        const label = normalizeLabel(patch.label);
        if (!label) throw new Error('Label required');
        updated = { ...updated, label };
      }
      if (patch.remindInterval !== undefined) {
        if (patch.remindInterval === null) {
          updated = { ...updated, remindAt: undefined, remindInterval: undefined };
        } else {
          const anchor = parseDateInput(getLastDoneAt(updated)) ?? new Date();
          updated = {
            ...updated,
            ...resolveRemindAt(anchor, { remindInterval: patch.remindInterval }),
          };
        }
      }
      await persist(list.map((i) => (i.id === id ? updated : i)));
      if (updated.remindAt) void scheduleLastDoneReminder(updated);
      else void cancelLastDoneReminder(id);
      return updated;
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
    () => ({ items, ready, logDone, setReminder, updateActivity, remove, removeLog }),
    [items, ready, logDone, setReminder, updateActivity, remove, removeLog]
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
