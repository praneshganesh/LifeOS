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
import {
  createSubscription,
  findDuplicateSubscription,
  normalizeSubscription,
  sortByRenewal,
  type NewSubscriptionInput,
  type Subscription,
} from '@/lib/subscriptions';
import {
  loadVersionedArray,
  saveVersionedArray,
} from '@/lib/storage/versioned';
import { queueDelete, queueUpsert } from '@/lib/sync/outbox';
import { subscribeSyncApplied } from '@/lib/sync/engine';

const STORAGE_KEY = 'lifeos:subscriptions:v1';
const SCHEMA_VERSION = 1;

type SubscriptionsContextValue = {
  subscriptions: Subscription[];
  ready: boolean;
  addSubscription: (input: NewSubscriptionInput) => Promise<Subscription>;
  updateSubscription: (id: string, patch: Partial<Subscription>) => Promise<void>;
  removeSubscription: (id: string) => Promise<void>;
  getById: (id: string) => Subscription | undefined;
};

const SubscriptionsContext = createContext<SubscriptionsContextValue | null>(null);

export function SubscriptionsProvider({ children }: { children: ReactNode }) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [ready, setReady] = useState(false);
  const subsRef = useRef<Subscription[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const loaded = await loadVersionedArray<Subscription>(
          STORAGE_KEY,
          SCHEMA_VERSION,
          normalizeSubscription
        );
        subsRef.current = sortByRenewal(loaded);
        setSubscriptions(subsRef.current);
      } catch {
        /* ignore */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    return subscribeSyncApplied((tables) => {
      if (!tables.includes('subscriptions')) return;
      void loadVersionedArray<Subscription>(
        STORAGE_KEY,
        SCHEMA_VERSION,
        normalizeSubscription
      ).then((loaded) => {
        subsRef.current = sortByRenewal(loaded);
        setSubscriptions(subsRef.current);
      });
    });
  }, []);

  // Awaited persist: callers only resolve once the write is on disk, so a
  // failed write rejects instead of the UI reporting a save that never stuck.
  const persist = async (next: Subscription[]) => {
    subsRef.current = next;
    setSubscriptions(next);
    await saveVersionedArray(STORAGE_KEY, SCHEMA_VERSION, next);
  };

  const addSubscription = useCallback(async (input: NewSubscriptionInput) => {
    const created: Subscription = {
      ...createSubscription(input),
      updatedAt: new Date().toISOString(),
    };
    const dup = findDuplicateSubscription(subsRef.current, created);
    if (dup) return dup;
    await persist(sortByRenewal([created, ...subsRef.current]));
    void queueUpsert('subscriptions', created);
    return created;
  }, []);

  const updateSubscription = useCallback(
    async (id: string, patch: Partial<Subscription>) => {
      let updated: Subscription | null = null;
      await persist(
        sortByRenewal(
          subsRef.current.map((s) => {
            if (s.id !== id) return s;
            updated = { ...s, ...patch, id: s.id, updatedAt: new Date().toISOString() };
            return updated;
          })
        )
      );
      if (updated) void queueUpsert('subscriptions', updated);
    },
    []
  );

  const removeSubscription = useCallback(async (id: string) => {
    await persist(subsRef.current.filter((s) => s.id !== id));
    void queueDelete('subscriptions', id);
  }, []);

  const getById = useCallback(
    (id: string) =>
      subsRef.current.find((s) => s.id === id) ??
      subscriptions.find((s) => s.id === id),
    [subscriptions]
  );

  const value = useMemo(
    () => ({
      subscriptions,
      ready,
      addSubscription,
      updateSubscription,
      removeSubscription,
      getById,
    }),
    [
      subscriptions,
      ready,
      addSubscription,
      updateSubscription,
      removeSubscription,
      getById,
    ]
  );

  return (
    <SubscriptionsContext.Provider value={value}>
      {children}
    </SubscriptionsContext.Provider>
  );
}

export function useSubscriptions() {
  const ctx = useContext(SubscriptionsContext);
  if (!ctx) {
    throw new Error('useSubscriptions must be used within SubscriptionsProvider');
  }
  return ctx;
}
