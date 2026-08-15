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
  createHabit,
  dayKey,
  findHabitByTitle,
  mergeDuplicateHabits,
  normalizeHabit,
  toggleLogForDay,
  type Habit,
  type NewHabitInput,
} from '@/lib/habits';
import {
  loadVersionedArray,
  saveVersionedArray,
} from '@/lib/storage/versioned';

const STORAGE_KEY = 'lifeos:habits:v1';
const SCHEMA_VERSION = 1;

type HabitsContextValue = {
  habits: Habit[];
  ready: boolean;
  addHabit: (input: NewHabitInput) => Promise<Habit>;
  updateHabit: (id: string, patch: Partial<Habit>) => Promise<void>;
  removeHabit: (id: string) => Promise<void>;
  /** Toggle check-in for a day (default today). */
  checkIn: (id: string, date?: string) => Promise<Habit | null>;
  getById: (id: string) => Habit | undefined;
  findByTitle: (title: string) => Habit | undefined;
};

const HabitsContext = createContext<HabitsContextValue | null>(null);

function sortHabits(list: Habit[]): Habit[] {
  return [...list].sort((a, b) => a.title.localeCompare(b.title));
}

export function HabitsProvider({ children }: { children: ReactNode }) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [ready, setReady] = useState(false);
  /** Always-current list so Talk check-ins don't race and spawn duplicates. */
  const habitsRef = useRef<Habit[]>([]);

  const commit = useCallback((next: Habit[]) => {
    const sorted = sortHabits(next);
    habitsRef.current = sorted;
    setHabits(sorted);
    void saveVersionedArray(STORAGE_KEY, SCHEMA_VERSION, sorted);
    return sorted;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const loaded = await loadVersionedArray<Habit>(
          STORAGE_KEY,
          SCHEMA_VERSION,
          normalizeHabit
        );
        const { habits: deduped } = mergeDuplicateHabits(loaded);
        habitsRef.current = sortHabits(deduped);
        setHabits(habitsRef.current);
        if (deduped.length !== loaded.length) {
          void saveVersionedArray(STORAGE_KEY, SCHEMA_VERSION, habitsRef.current);
        }
      } catch {
        /* ignore */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const addHabit = useCallback(
    async (input: NewHabitInput) => {
      const existing = findHabitByTitle(habitsRef.current, input.title);
      if (existing) {
        // Idempotent — Talk check-ins must not spawn a second "Walked"
        if (
          input.inventoryItemId &&
          existing.inventoryItemId !== input.inventoryItemId
        ) {
          const patched: Habit = {
            ...existing,
            inventoryItemId: input.inventoryItemId,
            syncLastDone: existing.syncLastDone ?? true,
          };
          commit(
            habitsRef.current.map((h) => (h.id === existing.id ? patched : h))
          );
          return patched;
        }
        return existing;
      }
      const habit = createHabit(input);
      commit([habit, ...habitsRef.current]);
      return habit;
    },
    [commit]
  );

  const updateHabit = useCallback(
    async (id: string, patch: Partial<Habit>) => {
      commit(
        habitsRef.current.map((h) => (h.id === id ? { ...h, ...patch, id: h.id } : h))
      );
    },
    [commit]
  );

  const removeHabit = useCallback(
    async (id: string) => {
      commit(habitsRef.current.filter((h) => h.id !== id));
    },
    [commit]
  );

  const checkIn = useCallback(
    async (id: string, date = dayKey()) => {
      let updated: Habit | null = null;
      const next = habitsRef.current.map((h) => {
        if (h.id !== id) return h;
        updated = toggleLogForDay(h, date);
        return updated;
      });
      commit(next);
      return updated;
    },
    [commit]
  );

  const getById = useCallback(
    (id: string) => habitsRef.current.find((h) => h.id === id),
    []
  );

  const findByTitle = useCallback(
    (title: string) => findHabitByTitle(habitsRef.current, title),
    []
  );

  const value = useMemo(
    () => ({
      habits,
      ready,
      addHabit,
      updateHabit,
      removeHabit,
      checkIn,
      getById,
      findByTitle,
    }),
    [
      habits,
      ready,
      addHabit,
      updateHabit,
      removeHabit,
      checkIn,
      getById,
      findByTitle,
    ]
  );

  return (
    <HabitsContext.Provider value={value}>{children}</HabitsContext.Provider>
  );
}

export function useHabits() {
  const ctx = useContext(HabitsContext);
  if (!ctx) throw new Error('useHabits must be used within HabitsProvider');
  return ctx;
}
