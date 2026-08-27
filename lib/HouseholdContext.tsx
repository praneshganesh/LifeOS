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
  avatarLetterFromName,
  createHouseholdMember,
  normalizeHouseholdMember,
  type HouseholdMember,
  type NewHouseholdMemberInput,
} from '@/lib/household';
import {
  PlanLimitError,
  loadPlanPrefs,
  planById,
  wouldExceedMemberLimit,
} from '@/lib/planLimits';
import {
  loadVersionedArray,
  saveVersionedArray,
} from '@/lib/storage/versioned';

const STORAGE_KEY = 'lifeos:household:v1';
const SCHEMA_VERSION = 1;

type HouseholdContextValue = {
  members: HouseholdMember[];
  ready: boolean;
  addMember: (input: NewHouseholdMemberInput) => Promise<HouseholdMember>;
  updateMember: (id: string, patch: Partial<HouseholdMember>) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  getById: (id: string) => HouseholdMember | undefined;
};

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [ready, setReady] = useState(false);
  const membersRef = useRef<HouseholdMember[]>([]);

  useEffect(() => {
    (async () => {
      try {
        let loaded = await loadVersionedArray<HouseholdMember>(
          STORAGE_KEY,
          SCHEMA_VERSION,
          normalizeHouseholdMember
        );
        // Ensure at least one owner among adults when possible
        if (
          loaded.length > 0 &&
          !loaded.some((m) => m.permission === 'owner')
        ) {
          const idx = loaded.findIndex(
            (m) => m.role === 'adult' || m.role === 'parent'
          );
          if (idx >= 0) {
            loaded = loaded.map((m, i) =>
              i === idx ? { ...m, permission: 'owner' } : m
            );
            void saveVersionedArray(STORAGE_KEY, SCHEMA_VERSION, loaded).catch(
              () => undefined
            );
          }
        }
        membersRef.current = loaded;
        setMembers(loaded);
      } catch {
        /* ignore */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // Awaited persist: callers only resolve once the write is on disk, so a
  // failed write rejects instead of the UI reporting a save that never stuck.
  const persist = async (next: HouseholdMember[]) => {
    membersRef.current = next;
    setMembers(next);
    await saveVersionedArray(STORAGE_KEY, SCHEMA_VERSION, next);
  };

  const addMember = useCallback(async (input: NewHouseholdMemberInput) => {
    const prefs = await loadPlanPrefs();
    const plan = planById(prefs.planId);
    if (wouldExceedMemberLimit(plan, membersRef.current.length)) {
      throw new PlanLimitError('members');
    }
    let created = createHouseholdMember(input);
    if (
      membersRef.current.length === 0 &&
      (created.role === 'adult' || created.role === 'parent')
    ) {
      created = { ...created, permission: 'owner' as const };
    }
    await persist([created, ...membersRef.current]);
    return created;
  }, []);

  const updateMember = useCallback(async (id: string, patch: Partial<HouseholdMember>) => {
    await persist(
      membersRef.current.map((m) => {
        if (m.id !== id) return m;
        const merged = { ...m, ...patch };
        if (patch.name) merged.avatarLetter = avatarLetterFromName(patch.name);
        return merged;
      })
    );
  }, []);

  const removeMember = useCallback(async (id: string) => {
    await persist(membersRef.current.filter((m) => m.id !== id));
  }, []);

  const getById = useCallback(
    (id: string) =>
      membersRef.current.find((m) => m.id === id) ??
      members.find((m) => m.id === id),
    [members]
  );

  const value = useMemo(
    () => ({
      members,
      ready,
      addMember,
      updateMember,
      removeMember,
      getById,
    }),
    [members, ready, addMember, updateMember, removeMember, getById]
  );

  return (
    <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>
  );
}

export function useHousehold() {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error('useHousehold must be used within HouseholdProvider');
  return ctx;
}
