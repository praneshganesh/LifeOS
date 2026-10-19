import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'lifeos:attention-dismissed:v1';

/**
 * Attention items are recomputed from live data, so dismissing is a snooze:
 * the row hides for a week, then resurfaces if it's still due. Renewals and
 * repeat reminders therefore come back on their next cycle.
 */
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

type DismissMap = Record<string, number>;

/** Local midnight at the start of tomorrow. */
export function startOfTomorrow(now = new Date()): number {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

async function loadMap(): Promise<DismissMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const now = Date.now();
    const map: DismissMap = {};
    for (const [id, until] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof until === 'number' && until > now) map[id] = until;
    }
    return map;
  } catch {
    return {};
  }
}

export function useAttentionDismissals() {
  const [dismissed, setDismissed] = useState<DismissMap>({});
  const mapRef = useRef<DismissMap>({});

  const reload = useCallback(async () => {
    const map = await loadMap();
    mapRef.current = map;
    setDismissed(map);
  }, []);

  useEffect(() => {
    let alive = true;
    void loadMap().then((map) => {
      if (!alive) return;
      mapRef.current = map;
      setDismissed(map);
    });
    return () => {
      alive = false;
    };
  }, []);

  /** Hide `id` until `until` (epoch ms), a week from now by default. */
  const dismiss = useCallback(async (id: string, until?: number) => {
    const next = { ...mapRef.current, [id]: until ?? Date.now() + SNOOZE_MS };
    mapRef.current = next;
    setDismissed(next);
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Snooze is cosmetic, worst case the row returns next launch.
    }
  }, []);

  const isDismissed = useCallback(
    (id: string) => (dismissed[id] ?? 0) > Date.now(),
    [dismissed]
  );

  return { dismiss, isDismissed, reload };
}
