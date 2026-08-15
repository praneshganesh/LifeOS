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
            void saveVersionedArray(STORAGE_KEY, SCHEMA_VERSION, loaded);
          }
        }
        setMembers(loaded);
      } catch {
        /* ignore */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const persist = (next: HouseholdMember[]) => {
    void saveVersionedArray(STORAGE_KEY, SCHEMA_VERSION, next);
  };

  const addMember = useCallback(async (input: NewHouseholdMemberInput) => {
    const prefs = await loadPlanPrefs();
    const plan = planById(prefs.planId);
    // Read current count via functional pattern
    let blocked = false;
    let created = createHouseholdMember(input);
    setMembers((prev) => {
      if (wouldExceedMemberLimit(plan, prev.length)) {
        blocked = true;
        return prev;
      }
      const withOwner =
        prev.length === 0 &&
        (created.role === 'adult' || created.role === 'parent')
          ? { ...created, permission: 'owner' as const }
          : created;
      created = withOwner;
      const next = [withOwner, ...prev];
      persist(next);
      return next;
    });
    if (blocked) throw new PlanLimitError('members');
    return created;
  }, []);

  const updateMember = useCallback(async (id: string, patch: Partial<HouseholdMember>) => {
    setMembers((prev) => {
      const next = prev.map((m) => {
        if (m.id !== id) return m;
        const merged = { ...m, ...patch };
        if (patch.name) merged.avatarLetter = avatarLetterFromName(patch.name);
        return merged;
      });
      persist(next);
      return next;
    });
  }, []);

  const removeMember = useCallback(async (id: string) => {
    setMembers((prev) => {
      const next = prev.filter((m) => m.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const getById = useCallback(
    (id: string) => members.find((m) => m.id === id),
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
