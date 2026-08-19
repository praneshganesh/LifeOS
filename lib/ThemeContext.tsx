import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  APPEARANCE_REV,
  DEFAULT_APPEARANCE,
  applyLivePalette,
  inkDark,
  migrateAppearancePrefs,
  resolvePalette,
  type AppearancePrefs,
  type ThemeColors,
  type ThemeFamily,
  type ThemeMode,
  type ThemeResolved,
} from '@/constants/theme';

const STORAGE_KEY = 'lifeos:appearance:v1';

type ThemeContextValue = {
  family: ThemeFamily;
  mode: ThemeMode;
  resolved: ThemeResolved;
  colors: ThemeColors;
  setFamily: (family: ThemeFamily) => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function syncNativeScheme(mode: ThemeMode, resolved: ThemeResolved, bg: string) {
  try {
    Appearance.setColorScheme(mode === 'system' ? 'unspecified' : resolved);
  } catch {
    /* web / older runtimes */
  }
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.documentElement.style.colorScheme = resolved;
  document.body.style.backgroundColor = bg;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [prefs, setPrefs] = useState<AppearancePrefs>(DEFAULT_APPEARANCE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          const next = migrateAppearancePrefs(parsed);
          setPrefs(next);
          if (parsed.rev !== APPEARANCE_REV) {
            await AsyncStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({ ...next, rev: APPEARANCE_REV })
            );
          }
        }
      } catch {
        /* ignore */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const persist = useCallback(async (next: AppearancePrefs) => {
    setPrefs(next);
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...next, rev: APPEARANCE_REV })
    );
    void import('@/lib/cloud/sync').then((m) => m.scheduleCloudPush()).catch(() => undefined);
  }, []);

  const setFamily = useCallback(
    async (family: ThemeFamily) => {
      await persist({ ...prefs, family });
    },
    [persist, prefs]
  );

  const setMode = useCallback(
    async (mode: ThemeMode) => {
      await persist({ ...prefs, mode });
    },
    [persist, prefs]
  );

  const systemDark = system === 'dark';
  const resolved: ThemeResolved =
    prefs.mode === 'dark' || (prefs.mode === 'system' && systemDark)
      ? 'dark'
      : 'light';
  const colors = useMemo(
    () => resolvePalette(prefs.family, prefs.mode, systemDark),
    [prefs.family, prefs.mode, systemDark]
  );
  applyLivePalette(colors);

  useEffect(() => {
    syncNativeScheme(prefs.mode, resolved, colors.bg);
  }, [prefs.mode, resolved, colors.bg]);

  const value = useMemo(
    () => ({
      family: prefs.family,
      mode: prefs.mode,
      resolved,
      colors,
      setFamily,
      setMode,
      ready,
    }),
    [prefs.family, prefs.mode, resolved, colors, setFamily, setMode, ready]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      family: 'ink' as ThemeFamily,
      mode: 'dark' as ThemeMode,
      resolved: 'dark' as const,
      colors: inkDark,
      setFamily: async () => undefined,
      setMode: async () => undefined,
      ready: true,
    };
  }
  return ctx;
}
