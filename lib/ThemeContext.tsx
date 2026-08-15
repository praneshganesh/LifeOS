import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  linenColors,
  paletteFor,
  spacing,
  spacingFor,
  type Density,
  type ThemeColors,
  type ThemeId,
} from '@/constants/theme';

const STORAGE_KEY = 'lifeos:appearance:v1';

export type AppearancePrefs = {
  theme: ThemeId;
  density: Density;
};

const DEFAULTS: AppearancePrefs = {
  theme: 'linen',
  density: 'comfortable',
};

type ThemeContextValue = {
  theme: ThemeId;
  resolved: 'linen' | 'hearth';
  density: Density;
  colors: ThemeColors;
  space: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | 'xxxl', number>;
  setTheme: (theme: ThemeId) => Promise<void>;
  setDensity: (density: Density) => Promise<void>;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [prefs, setPrefs] = useState<AppearancePrefs>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<AppearancePrefs>;
          setPrefs({
            theme:
              parsed.theme === 'hearth' ||
              parsed.theme === 'system' ||
              parsed.theme === 'linen'
                ? parsed.theme
                : DEFAULTS.theme,
            density:
              parsed.density === 'compact' || parsed.density === 'comfortable'
                ? parsed.density
                : DEFAULTS.density,
          });
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
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const setTheme = useCallback(
    async (theme: ThemeId) => {
      await persist({ ...prefs, theme });
    },
    [persist, prefs]
  );

  const setDensity = useCallback(
    async (density: Density) => {
      await persist({ ...prefs, density });
    },
    [persist, prefs]
  );

  const systemDark = system === 'dark';
  const resolved: 'linen' | 'hearth' =
    prefs.theme === 'hearth' || (prefs.theme === 'system' && systemDark)
      ? 'hearth'
      : 'linen';
  const colors = useMemo(
    () => paletteFor(prefs.theme, systemDark),
    [prefs.theme, systemDark]
  );
  const space = useMemo(() => spacingFor(prefs.density), [prefs.density]);

  const value = useMemo(
    () => ({
      theme: prefs.theme,
      resolved,
      density: prefs.density,
      colors,
      space,
      setTheme,
      setDensity,
      ready,
    }),
    [prefs.theme, prefs.density, resolved, colors, space, setTheme, setDensity, ready]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: 'linen' as ThemeId,
      resolved: 'linen' as const,
      density: 'comfortable' as Density,
      colors: linenColors,
      space: spacing,
      setTheme: async () => undefined,
      setDensity: async () => undefined,
      ready: true,
    };
  }
  return ctx;
}
