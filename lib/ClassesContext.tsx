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
  createClassPack,
  findClassPack,
  pickAttendancePack,
  mergeClassPackUpdate,
  normalizeClassPack,
  toggleLogForDay,
  type ClassPack,
  type NewClassPackInput,
} from '@/lib/classes';
import { localDayKey } from '@/lib/dates';
import {
  loadVersionedArray,
  saveVersionedArray,
} from '@/lib/storage/versioned';

const STORAGE_KEY = 'lifeos:classes:v1';
const SCHEMA_VERSION = 1;

type ClassesContextValue = {
  packs: ClassPack[];
  ready: boolean;
  addPack: (input: NewClassPackInput) => Promise<ClassPack>;
  updatePack: (id: string, patch: Partial<ClassPack>) => Promise<void>;
  removePack: (id: string) => Promise<void>;
  logClass: (id: string, date?: string) => Promise<ClassPack | null>;
  getById: (id: string) => ClassPack | undefined;
  findPack: (title: string, personId?: string) => ClassPack | undefined;
  pickAttendance: (opts: {
    title?: string;
    personId?: string;
  }) => ClassPack | undefined;
  newestPack: () => ClassPack | undefined;
};

const ClassesContext = createContext<ClassesContextValue | null>(null);

function sortPacks(list: ClassPack[]): ClassPack[] {
  return [...list].sort((a, b) => a.title.localeCompare(b.title));
}

export function ClassesProvider({ children }: { children: ReactNode }) {
  const [packs, setPacks] = useState<ClassPack[]>([]);
  const [ready, setReady] = useState(false);
  const packsRef = useRef<ClassPack[]>([]);

  // Awaited commit: callers only resolve once the write is on disk, so a
  // failed write rejects instead of the UI reporting a save that never stuck.
  const commit = useCallback(async (next: ClassPack[]) => {
    const sorted = sortPacks(next);
    packsRef.current = sorted;
    setPacks(sorted);
    await saveVersionedArray(STORAGE_KEY, SCHEMA_VERSION, sorted);
    return sorted;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const loaded = await loadVersionedArray<ClassPack>(
          STORAGE_KEY,
          SCHEMA_VERSION,
          normalizeClassPack
        );
        packsRef.current = sortPacks(loaded);
        setPacks(packsRef.current);
      } catch {
        /* ignore */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const addPack = useCallback(
    async (input: NewClassPackInput) => {
      const existing = findClassPack(
        packsRef.current,
        input.title,
        input.personId
      );
      if (existing && (!input.personId || existing.personId === input.personId)) {
        const merged = mergeClassPackUpdate(existing, input);
        if (!merged) return existing;
        await commit(
          packsRef.current.map((p) => (p.id === existing.id ? merged : p))
        );
        return merged;
      }
      const pack = createClassPack(input);
      await commit([pack, ...packsRef.current]);
      return pack;
    },
    [commit]
  );

  const updatePack = useCallback(
    async (id: string, patch: Partial<ClassPack>) => {
      await commit(
        packsRef.current.map((p) => (p.id === id ? { ...p, ...patch, id: p.id } : p))
      );
    },
    [commit]
  );

  const removePack = useCallback(
    async (id: string) => {
      await commit(packsRef.current.filter((p) => p.id !== id));
    },
    [commit]
  );

  const logClass = useCallback(
    async (id: string, date = localDayKey()) => {
      let updated: ClassPack | null = null;
      const next = packsRef.current.map((p) => {
        if (p.id !== id) return p;
        updated = toggleLogForDay(p, date);
        return updated;
      });
      await commit(next);
      return updated;
    },
    [commit]
  );

  const getById = useCallback(
    (id: string) => packsRef.current.find((p) => p.id === id),
    []
  );

  const findPack = useCallback(
    (title: string, personId?: string) =>
      findClassPack(packsRef.current, title, personId),
    []
  );

  const pickAttendance = useCallback(
    (opts: { title?: string; personId?: string }) =>
      pickAttendancePack(packsRef.current, opts),
    []
  );

  const newestPack = useCallback(() => {
    return [...packsRef.current].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    )[0];
  }, []);

  const value = useMemo(
    () => ({
      packs,
      ready,
      addPack,
      updatePack,
      removePack,
      logClass,
      getById,
      findPack,
      pickAttendance,
      newestPack,
    }),
    [packs, ready, addPack, updatePack, removePack, logClass, getById, findPack, pickAttendance, newestPack]
  );

  return (
    <ClassesContext.Provider value={value}>{children}</ClassesContext.Provider>
  );
}

export function useClasses() {
  const ctx = useContext(ClassesContext);
  if (!ctx) throw new Error('useClasses must be used within ClassesProvider');
  return ctx;
}
