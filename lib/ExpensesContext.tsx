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
  createExpense,
  findDuplicateExpense,
  normalizeExpense,
  type Expense,
  type NewExpenseInput,
} from '@/lib/expenses';
import {
  loadVersionedArray,
  saveVersionedArray,
} from '@/lib/storage/versioned';

const STORAGE_KEY = 'lifeos:expenses:v1';
const SCHEMA_VERSION = 1;

type ExpensesContextValue = {
  expenses: Expense[];
  ready: boolean;
  addExpense: (input: NewExpenseInput) => Promise<Expense>;
  updateExpense: (id: string, patch: Partial<Expense>) => Promise<void>;
  removeExpense: (id: string) => Promise<void>;
  getById: (id: string) => Expense | undefined;
};

const ExpensesContext = createContext<ExpensesContextValue | null>(null);

function sortExpenses(list: Expense[]): Expense[] {
  return [...list].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function ExpensesProvider({ children }: { children: ReactNode }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const loaded = await loadVersionedArray<Expense>(
          STORAGE_KEY,
          SCHEMA_VERSION,
          normalizeExpense
        );
        setExpenses(sortExpenses(loaded));
      } catch {
        /* ignore */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const persist = (next: Expense[]) => {
    void saveVersionedArray(STORAGE_KEY, SCHEMA_VERSION, next);
  };

  const addExpense = useCallback(async (input: NewExpenseInput) => {
    let created = createExpense(input);
    setExpenses((prev) => {
      const dup = findDuplicateExpense(prev, created);
      if (dup) {
        created = dup;
        return prev;
      }
      const next = sortExpenses([created, ...prev]);
      persist(next);
      return next;
    });
    return created;
  }, []);

  const updateExpense = useCallback(async (id: string, patch: Partial<Expense>) => {
    setExpenses((prev) => {
      const next = sortExpenses(
        prev.map((e) => (e.id === id ? { ...e, ...patch, id: e.id } : e))
      );
      persist(next);
      return next;
    });
  }, []);

  const removeExpense = useCallback(async (id: string) => {
    setExpenses((prev) => {
      const next = prev.filter((e) => e.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const getById = useCallback(
    (id: string) => expenses.find((e) => e.id === id),
    [expenses]
  );

  const value = useMemo(
    () => ({
      expenses,
      ready,
      addExpense,
      updateExpense,
      removeExpense,
      getById,
    }),
    [expenses, ready, addExpense, updateExpense, removeExpense, getById]
  );

  return (
    <ExpensesContext.Provider value={value}>{children}</ExpensesContext.Provider>
  );
}

export function useExpenses() {
  const ctx = useContext(ExpensesContext);
  if (!ctx) throw new Error('useExpenses must be used within ExpensesProvider');
  return ctx;
}
