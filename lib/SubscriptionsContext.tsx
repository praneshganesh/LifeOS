import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

  useEffect(() => {
    (async () => {
      try {
        const loaded = await loadVersionedArray<Subscription>(
          STORAGE_KEY,
          SCHEMA_VERSION,
          normalizeSubscription
        );
        setSubscriptions(sortByRenewal(loaded));
      } catch {
        /* ignore */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const persist = (next: Subscription[]) => {
    void saveVersionedArray(STORAGE_KEY, SCHEMA_VERSION, next);
  };

  const addSubscription = useCallback(async (input: NewSubscriptionInput) => {
    let created = createSubscription(input);
    setSubscriptions((prev) => {
      const dup = findDuplicateSubscription(prev, created);
      if (dup) {
        created = dup;
        return prev;
      }
      const next = sortByRenewal([created, ...prev]);
      persist(next);
      return next;
    });
    return created;
  }, []);

  const updateSubscription = useCallback(
    async (id: string, patch: Partial<Subscription>) => {
      setSubscriptions((prev) => {
        const next = sortByRenewal(
          prev.map((s) => (s.id === id ? { ...s, ...patch, id: s.id } : s))
        );
        persist(next);
        return next;
      });
    },
    []
  );

  const removeSubscription = useCallback(async (id: string) => {
    setSubscriptions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const getById = useCallback(
    (id: string) => subscriptions.find((s) => s.id === id),
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
