import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'lifeos:notif-prefs:v1';

export type NotificationPrefs = {
  /** Master switch — request OS permission when enabled */
  push: boolean;
  maintenance: boolean;
  warranties: boolean;
  insurance: boolean;
  returns: boolean;
  documents: boolean;
  family: boolean;
  /**
   * Quiet hours start HH:MM local (inclusive). Planning alerts are suppressed
   * while the clock is inside [start, end) wrapping midnight.
   */
  quietHoursStart: string;
  /** Quiet hours end HH:MM local (exclusive). */
  quietHoursEnd: string;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  push: true,
  maintenance: true,
  warranties: true,
  insurance: true,
  returns: true,
  documents: true,
  family: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
};

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Normalize "9:00" / "09:00" → "09:00". Invalid → fallback. */
export function normalizeQuietHoursTime(
  raw: string | undefined | null,
  fallback: string
): string {
  const s = String(raw || '').trim();
  const m = s.match(HHMM);
  if (!m) return fallback;
  return `${m[1]!.padStart(2, '0')}:${m[2]}`;
}

export function parseQuietHoursMinutes(hhmm: string): number {
  const m = hhmm.match(HHMM);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** True if local time of `d` falls inside quiet hours (wraps midnight). */
export function isInQuietHours(
  d: Date,
  startHHMM = DEFAULT_NOTIFICATION_PREFS.quietHoursStart,
  endHHMM = DEFAULT_NOTIFICATION_PREFS.quietHoursEnd
): boolean {
  const start = parseQuietHoursMinutes(
    normalizeQuietHoursTime(startHHMM, DEFAULT_NOTIFICATION_PREFS.quietHoursStart)
  );
  const end = parseQuietHoursMinutes(
    normalizeQuietHoursTime(endHHMM, DEFAULT_NOTIFICATION_PREFS.quietHoursEnd)
  );
  const mins = d.getHours() * 60 + d.getMinutes();
  if (start === end) return false;
  if (start < end) return mins >= start && mins < end;
  // Wraps midnight: e.g. 22:00 → 07:00
  return mins >= start || mins < end;
}

export async function loadNotificationPrefs(): Promise<NotificationPrefs> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_PREFS };
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      ...DEFAULT_NOTIFICATION_PREFS,
      ...parsed,
      quietHoursStart: normalizeQuietHoursTime(
        parsed.quietHoursStart,
        DEFAULT_NOTIFICATION_PREFS.quietHoursStart
      ),
      quietHoursEnd: normalizeQuietHoursTime(
        parsed.quietHoursEnd,
        DEFAULT_NOTIFICATION_PREFS.quietHoursEnd
      ),
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

export async function saveNotificationPrefs(
  prefs: NotificationPrefs
): Promise<void> {
  const next: NotificationPrefs = {
    ...prefs,
    quietHoursStart: normalizeQuietHoursTime(
      prefs.quietHoursStart,
      DEFAULT_NOTIFICATION_PREFS.quietHoursStart
    ),
    quietHoursEnd: normalizeQuietHoursTime(
      prefs.quietHoursEnd,
      DEFAULT_NOTIFICATION_PREFS.quietHoursEnd
    ),
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
