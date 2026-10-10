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
import type { Icon3DName } from '@/components/ui/Icon3D';
import {
  defaultSpacesPayload,
  type Room,
  type Space,
} from '@/lib/spacesDefaults';
import { setCaptureSpacesLookup } from '@/lib/captureContext';
import {
  PlanLimitError,
  loadPlanPrefs,
  planById,
  wouldExceedHomeLimit,
} from '@/lib/planLimits';
import {
  loadVersioned,
  saveVersioned,
} from '@/lib/storage/versioned';
import { queueDelete, queueUpsert } from '@/lib/sync/outbox';
import { subscribeSyncApplied } from '@/lib/sync/engine';

const STORAGE_KEY = 'lifeos:spaces:v2';
const LEGACY_STORAGE_KEY = 'lifeos:spaces:v1';
const SCHEMA_VERSION = 1;

export type SpaceKind = Space['kind'];

export type ManagedSpace = Space & {
  /** User-created (not from system defaults) */
  custom?: boolean;
  /** Last local mutation — LWW clock for row sync. */
  updatedAt?: string;
};

export type ManagedRoom = Room & {
  custom?: boolean;
  updatedAt?: string;
};

type StoredPayload = {
  spaces: ManagedSpace[];
  rooms: ManagedRoom[];
};

type SpacesContextValue = {
  spaces: ManagedSpace[];
  rooms: ManagedRoom[];
  ready: boolean;
  getSpace: (id: string) => ManagedSpace | undefined;
  getRoom: (id: string) => ManagedRoom | undefined;
  roomsForSpace: (spaceId: string) => ManagedRoom[];
  addSpace: (input: {
    name: string;
    meta?: string;
    kind: SpaceKind;
    icon?: Icon3DName;
    withDefaultRooms?: boolean;
  }) => Promise<ManagedSpace>;
  updateSpace: (
    id: string,
    patch: Partial<Pick<ManagedSpace, 'name' | 'meta' | 'kind' | 'icon' | 'items'>>
  ) => Promise<void>;
  removeSpace: (id: string) => Promise<void>;
  addRoom: (input: {
    spaceId: string;
    name: string;
    icon?: Icon3DName;
  }) => Promise<ManagedRoom>;
  updateRoom: (
    id: string,
    patch: Partial<Pick<ManagedRoom, 'name' | 'icon'>>
  ) => Promise<void>;
  removeRoom: (id: string) => Promise<void>;
};

const SpacesContext = createContext<SpacesContextValue | null>(null);

const DEFAULT_HOME_ROOMS: { name: string; icon: Icon3DName }[] = [
  { name: 'Living Room', icon: 'sofa' },
  { name: 'Kitchen', icon: 'kitchen' },
  { name: 'Bedroom', icon: 'bed' },
];

function iconForKind(kind: SpaceKind): Icon3DName {
  if (kind === 'vehicle') return 'car';
  if (kind === 'documents') return 'folder';
  if (kind === 'family') return 'family';
  return 'house';
}

function seedPayload(): StoredPayload {
  return defaultSpacesPayload();
}

/** Drop demo holiday homes / mock asset links; keep user-created spaces. */
function migrateFromLegacy(parsed: StoredPayload): StoredPayload {
  const seed = seedPayload();
  const customSpaces = (parsed.spaces || []).filter((s) => s.custom);
  const systemIds = new Set(seed.spaces.map((s) => s.id));
  const keptSystem = seed.spaces.map((def) => {
    const prev = parsed.spaces?.find((s) => s.id === def.id);
    if (!prev) return def;
    return {
      ...def,
      name: prev.name || def.name,
      meta: prev.custom ? prev.meta : def.meta,
      icon: prev.icon || def.icon,
      items: 0,
      custom: false,
    };
  });
  const roomsForSystem = seed.rooms.map((r) => ({ ...r, assetIds: [], custom: false }));
  const customRooms = (parsed.rooms || [])
    .filter((r) => r.custom && customSpaces.some((s) => s.id === r.spaceId))
    .map((r) => ({ ...r, assetIds: [] as string[] }));
  // Also keep rooms on system spaces that user added (custom) even if space isn't custom
  const extraOnSystem = (parsed.rooms || [])
    .filter(
      (r) =>
        r.custom &&
        systemIds.has(r.spaceId) &&
        !roomsForSystem.some((d) => d.name === r.name && d.spaceId === r.spaceId)
    )
    .map((r) => ({ ...r, assetIds: [] as string[] }));

  return {
    spaces: [...keptSystem, ...customSpaces.filter((s) => !systemIds.has(s.id))],
    rooms: [...roomsForSystem, ...extraOnSystem, ...customRooms],
  };
}

async function loadPayload(): Promise<StoredPayload> {
  const empty = seedPayload();

  // Prefer versioned envelope; rewrite bare v2 JSON on first load.
  const fromVersioned = await loadVersioned<StoredPayload | null>(
    STORAGE_KEY,
    SCHEMA_VERSION,
    null,
    (data) => {
      if (data && typeof data === 'object' && Array.isArray((data as StoredPayload).spaces)) {
        const parsed = data as StoredPayload;
        return {
          spaces: parsed.spaces,
          rooms: (parsed.rooms || []).map((r) => ({
            ...r,
            assetIds: r.assetIds || [],
          })),
        };
      }
      return empty;
    }
  );
  if (fromVersioned && fromVersioned.spaces?.length) {
    return fromVersioned;
  }

  // Bare payload still under STORAGE_KEY (pre-envelope)
  const rawV2 = await AsyncStorage.getItem(STORAGE_KEY);
  if (rawV2) {
    try {
      const parsed = JSON.parse(rawV2) as StoredPayload;
      if (Array.isArray(parsed?.spaces) && parsed.spaces.length) {
        const payload = {
          spaces: parsed.spaces,
          rooms: (parsed.rooms || []).map((r) => ({
            ...r,
            assetIds: r.assetIds || [],
          })),
        };
        await saveVersioned(STORAGE_KEY, SCHEMA_VERSION, payload);
        return payload;
      }
    } catch {
      /* fall through */
    }
  }

  const rawV1 = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
  if (rawV1) {
    try {
      const parsed = JSON.parse(rawV1) as StoredPayload;
      if (Array.isArray(parsed?.spaces) && parsed.spaces.length) {
        const migrated = migrateFromLegacy(parsed);
        await saveVersioned(STORAGE_KEY, SCHEMA_VERSION, migrated);
        return migrated;
      }
    } catch {
      /* fall through */
    }
  }

  await saveVersioned(STORAGE_KEY, SCHEMA_VERSION, empty);
  return empty;
}

export function SpacesProvider({ children }: { children: ReactNode }) {
  const [spaces, setSpaces] = useState<ManagedSpace[]>([]);
  const [rooms, setRooms] = useState<ManagedRoom[]>([]);
  const [ready, setReady] = useState(false);
  const spacesRef = useRef<ManagedSpace[]>([]);
  const roomsRef = useRef<ManagedRoom[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const payload = await loadPayload();
        spacesRef.current = payload.spaces;
        roomsRef.current = payload.rooms;
        setSpaces(payload.spaces);
        setRooms(payload.rooms);
        setCaptureSpacesLookup(payload.spaces);
      } catch {
        const seed = seedPayload();
        spacesRef.current = seed.spaces;
        roomsRef.current = seed.rooms;
        setSpaces(seed.spaces);
        setRooms(seed.rooms);
        setCaptureSpacesLookup(seed.spaces);
      } finally {
        setReady(true);
      }
    })();
    return () => setCaptureSpacesLookup(null);
  }, []);

  // Reload when the sync engine merges remote rows into the local store.
  useEffect(() => {
    return subscribeSyncApplied((tables) => {
      if (!tables.includes('spaces') && !tables.includes('rooms')) return;
      void loadPayload().then((payload) => {
        spacesRef.current = payload.spaces;
        roomsRef.current = payload.rooms;
        setSpaces(payload.spaces);
        setRooms(payload.rooms);
        setCaptureSpacesLookup(payload.spaces);
      });
    });
  }, []);

  /**
   * Persist + enqueue row sync for the changed rows only (spaces and rooms
   * share one local payload but are separate cloud tables).
   */
  const persist = useCallback(
    async (
      nextSpaces: ManagedSpace[],
      nextRooms: ManagedRoom[],
      touched?: {
        spaces?: ManagedSpace[];
        rooms?: ManagedRoom[];
        deletedSpaceIds?: string[];
        deletedRoomIds?: string[];
      }
    ) => {
      const now = new Date().toISOString();
      const touchedSpaceIds = new Set((touched?.spaces ?? []).map((s) => s.id));
      const touchedRoomIds = new Set((touched?.rooms ?? []).map((r) => r.id));
      const stampedSpaces = nextSpaces.map((s) =>
        touchedSpaceIds.has(s.id) ? { ...s, updatedAt: now } : s
      );
      const stampedRooms = nextRooms.map((r) =>
        touchedRoomIds.has(r.id) ? { ...r, updatedAt: now } : r
      );
      setSpaces(stampedSpaces);
      setRooms(stampedRooms);
      spacesRef.current = stampedSpaces;
      roomsRef.current = stampedRooms;
      setCaptureSpacesLookup(stampedSpaces);
      const payload: StoredPayload = { spaces: stampedSpaces, rooms: stampedRooms };
      await saveVersioned(STORAGE_KEY, SCHEMA_VERSION, payload);
      for (const s of stampedSpaces) if (touchedSpaceIds.has(s.id)) void queueUpsert('spaces', s);
      for (const r of stampedRooms) if (touchedRoomIds.has(r.id)) void queueUpsert('rooms', r);
      for (const id of touched?.deletedSpaceIds ?? []) void queueDelete('spaces', id);
      for (const id of touched?.deletedRoomIds ?? []) void queueDelete('rooms', id);
    },
    []
  );

  const addSpace = useCallback(
    async (input: {
      name: string;
      meta?: string;
      kind: SpaceKind;
      icon?: Icon3DName;
      withDefaultRooms?: boolean;
    }) => {
      if (input.kind === 'home') {
        const prefs = await loadPlanPrefs();
        const plan = planById(prefs.planId);
        const homes = spacesRef.current.filter((s) => s.kind === 'home').length;
        if (wouldExceedHomeLimit(plan, homes)) {
          throw new PlanLimitError('homes');
        }
      }
      const id = `spc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const space: ManagedSpace = {
        id,
        name: input.name.trim(),
        meta: input.meta?.trim() || 'New space',
        kind: input.kind,
        icon: input.icon || iconForKind(input.kind),
        items: 0,
        custom: true,
      };
      let nextRooms = roomsRef.current;
      if (input.withDefaultRooms !== false && input.kind === 'home') {
        const extras: ManagedRoom[] = DEFAULT_HOME_ROOMS.map((r, i) => ({
          id: `rm-${id}-${i}`,
          name: r.name,
          icon: r.icon,
          spaceId: id,
          assetIds: [],
          custom: true,
        }));
        nextRooms = [...extras, ...roomsRef.current];
      }
      await persist([space, ...spacesRef.current], nextRooms, {
        spaces: [space],
        rooms: nextRooms.filter((r) => r.spaceId === id),
      });
      return space;
    },
    [persist]
  );

  const updateSpace = useCallback(
    async (
      id: string,
      patch: Partial<Pick<ManagedSpace, 'name' | 'meta' | 'kind' | 'icon' | 'items'>>
    ) => {
      let updated: ManagedSpace | null = null;
      await persist(
        spaces.map((s) => {
          if (s.id !== id) return s;
          updated = { ...s, ...patch };
          return updated;
        }),
        rooms,
        { spaces: updated ? [updated] : [] }
      );
    },
    [spaces, rooms, persist]
  );

  const removeSpace = useCallback(
    async (id: string) => {
      const goneRooms = rooms.filter((r) => r.spaceId === id).map((r) => r.id);
      await persist(
        spaces.filter((s) => s.id !== id),
        rooms.filter((r) => r.spaceId !== id),
        { deletedSpaceIds: [id], deletedRoomIds: goneRooms }
      );
    },
    [spaces, rooms, persist]
  );

  const addRoom = useCallback(
    async (input: { spaceId: string; name: string; icon?: Icon3DName }) => {
      const room: ManagedRoom = {
        id: `rm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: input.name.trim(),
        icon: input.icon || 'package',
        spaceId: input.spaceId,
        assetIds: [],
        custom: true,
      };
      await persist(spaces, [room, ...rooms], { rooms: [room] });
      return room;
    },
    [spaces, rooms, persist]
  );

  const updateRoom = useCallback(
    async (id: string, patch: Partial<Pick<ManagedRoom, 'name' | 'icon'>>) => {
      let updated: ManagedRoom | null = null;
      await persist(
        spaces,
        rooms.map((r) => {
          if (r.id !== id) return r;
          updated = { ...r, ...patch };
          return updated;
        }),
        { rooms: updated ? [updated] : [] }
      );
    },
    [spaces, rooms, persist]
  );

  const removeRoom = useCallback(
    async (id: string) => {
      await persist(
        spaces,
        rooms.filter((r) => r.id !== id),
        { deletedRoomIds: [id] }
      );
    },
    [spaces, rooms, persist]
  );

  const getSpace = useCallback((id: string) => spaces.find((s) => s.id === id), [spaces]);
  const getRoom = useCallback((id: string) => rooms.find((r) => r.id === id), [rooms]);
  const roomsForSpace = useCallback(
    (spaceId: string) => rooms.filter((r) => r.spaceId === spaceId),
    [rooms]
  );

  const value = useMemo(
    () => ({
      spaces,
      rooms,
      ready,
      getSpace,
      getRoom,
      roomsForSpace,
      addSpace,
      updateSpace,
      removeSpace,
      addRoom,
      updateRoom,
      removeRoom,
    }),
    [
      spaces,
      rooms,
      ready,
      getSpace,
      getRoom,
      roomsForSpace,
      addSpace,
      updateSpace,
      removeSpace,
      addRoom,
      updateRoom,
      removeRoom,
    ]
  );

  return <SpacesContext.Provider value={value}>{children}</SpacesContext.Provider>;
}

export function useSpaces() {
  const ctx = useContext(SpacesContext);
  if (!ctx) throw new Error('useSpaces must be used within SpacesProvider');
  return ctx;
}
