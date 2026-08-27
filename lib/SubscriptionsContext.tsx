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

  // Awaited persist: callers only resolve once the write is on disk, so a
  // failed write rejects instead of the UI reporting a save that never stuck.
  const persist = async (next: Subscription[]) => {
    subsRef.current = next;
    setSubscriptions(next);
    await saveVersionedArray(STORAGE_KEY, SCHEMA_VERSION, next);
  };

  const addSubscription = useCallback(async (input: NewSubscriptionInput) => {
    const created = createSubscription(input);
    const dup = findDuplicateSubscription(subsRef.current, created);
    if (dup) return dup;
    await persist(sortByRenewal([created, ...subsRef.current]));
    return created;
  }, []);

  const updateSubscription = useCallback(
    async (id: string, patch: Partial<Subscription>) => {
      await persist(
        sortByRenewal(
          subsRef.current.map((s) => (s.id === id ? { ...s, ...patch, id: s.id } : s))
        )
      );
    },
    []
  );

  const removeSubscription = useCallback(async (id: string) => {
    await persist(subsRef.current.filter((s) => s.id !== id));
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
