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
  const expensesRef = useRef<Expense[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const loaded = await loadVersionedArray<Expense>(
          STORAGE_KEY,
          SCHEMA_VERSION,
          normalizeExpense
        );
        expensesRef.current = sortExpenses(loaded);
        setExpenses(expensesRef.current);
      } catch {
        /* ignore */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // Awaited persist: callers only resolve once the write is on disk, so a
  // failed write rejects instead of the UI reporting a save that never stuck.
  const persist = async (next: Expense[]) => {
    expensesRef.current = next;
    setExpenses(next);
    await saveVersionedArray(STORAGE_KEY, SCHEMA_VERSION, next);
  };

  const addExpense = useCallback(async (input: NewExpenseInput) => {
    const created = createExpense(input);
    const dup = findDuplicateExpense(expensesRef.current, created);
    if (dup) return dup;
    await persist(sortExpenses([created, ...expensesRef.current]));
    return created;
  }, []);

  const updateExpense = useCallback(async (id: string, patch: Partial<Expense>) => {
    await persist(
      sortExpenses(
        expensesRef.current.map((e) => (e.id === id ? { ...e, ...patch, id: e.id } : e))
      )
    );
  }, []);

  const removeExpense = useCallback(async (id: string) => {
    await persist(expensesRef.current.filter((e) => e.id !== id));
  }, []);

  const getById = useCallback(
    (id: string) =>
      expensesRef.current.find((e) => e.id === id) ??
      expenses.find((e) => e.id === id),
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
