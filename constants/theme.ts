/**
 * LifeOS color tokens — Linen (light) and Hearth (dark).
 * Prefer `useTheme().colors` in UI so themes can switch at runtime.
 * The default `colors` export stays Linen for legacy StyleSheet modules.
 */

export type ThemeId = 'linen' | 'hearth' | 'system';

export type ThemeColors = {
  bg: string;
  bgDeep: string;
  bgElevated: string;
  surface: string;
  surfaceSoft: string;
  surfaceHover: string;
  surfaceTint: string;
  ink: string;
  slate: string;
  mute: string;
  faint: string;
  line: string;
  lineStrong: string;
  forest: string;
  forestBright: string;
  forestSoft: string;
  forestWash: string;
  forestOn: string;
  amber: string;
  amberSoft: string;
  coral: string;
  coralSoft: string;
  sky: string;
  skySoft: string;
  violet: string;
  violetSoft: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  accentStrong: string;
  accentOn: string;
  border: string;
  borderStrong: string;
  surfaceRaised: string;
  urgent: string;
  urgentSoft: string;
  warning: string;
  warningSoft: string;
  success: string;
  successSoft: string;
  white: string;
  pure: string;
  black: string;
  overlay: string;
  /** Screen gradient stops */
  gradient: [string, string, string];
  bloomAmber: string;
  bloomForest: string;
  statusBar: 'light' | 'dark';
};

export const linenColors: ThemeColors = {
  bg: '#F4EFE7',
  bgDeep: '#ECE5D9',
  bgElevated: '#FAF7F1',
  surface: '#FFFFFF',
  surfaceSoft: '#F1EBE1',
  surfaceHover: '#E9E1D4',
  surfaceTint: '#EDF0E4',
  ink: '#2B241E',
  slate: '#54493E',
  mute: '#82766A',
  faint: '#A99D8F',
  line: 'rgba(43, 36, 30, 0.08)',
  lineStrong: 'rgba(43, 36, 30, 0.14)',
  forest: '#5F7350',
  forestBright: '#7A9066',
  forestSoft: 'rgba(95, 115, 80, 0.13)',
  forestWash: 'rgba(95, 115, 80, 0.07)',
  forestOn: '#F8FAF3',
  amber: '#C08A3E',
  amberSoft: 'rgba(192, 138, 62, 0.15)',
  coral: '#C96A4A',
  coralSoft: 'rgba(201, 106, 74, 0.14)',
  sky: '#5D7E9C',
  skySoft: 'rgba(93, 126, 156, 0.14)',
  violet: '#7C6E96',
  violetSoft: 'rgba(124, 110, 150, 0.14)',
  text: '#2B241E',
  textSecondary: '#54493E',
  textMuted: '#82766A',
  accent: '#5F7350',
  accentSoft: 'rgba(95, 115, 80, 0.13)',
  accentStrong: '#4A5B3E',
  accentOn: '#F8FAF3',
  border: 'rgba(43, 36, 30, 0.08)',
  borderStrong: 'rgba(43, 36, 30, 0.14)',
  surfaceRaised: '#FFFFFF',
  urgent: '#C96A4A',
  urgentSoft: 'rgba(201, 106, 74, 0.14)',
  warning: '#C08A3E',
  warningSoft: 'rgba(192, 138, 62, 0.15)',
  success: '#5F7350',
  successSoft: 'rgba(95, 115, 80, 0.13)',
  white: '#FFFFFF',
  pure: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(43, 36, 30, 0.45)',
  gradient: ['#FAF6EF', '#F4EFE7', '#EFE8DD'],
  bloomAmber: 'rgba(192, 138, 62, 0.10)',
  bloomForest: 'rgba(95, 115, 80, 0.08)',
  statusBar: 'dark',
};

/** Warm charcoal hearth — olive accent preserved */
export const hearthColors: ThemeColors = {
  bg: '#1A1714',
  bgDeep: '#141210',
  bgElevated: '#221E1A',
  surface: '#2A2520',
  surfaceSoft: '#322C26',
  surfaceHover: '#3A332C',
  surfaceTint: '#2E3328',
  ink: '#F3EDE4',
  slate: '#C9BDB0',
  mute: '#9A8E82',
  faint: '#6F655B',
  line: 'rgba(243, 237, 228, 0.10)',
  lineStrong: 'rgba(243, 237, 228, 0.16)',
  forest: '#8FA87A',
  forestBright: '#A3BC8E',
  forestSoft: 'rgba(143, 168, 122, 0.22)',
  forestWash: 'rgba(143, 168, 122, 0.12)',
  forestOn: '#141A10',
  amber: '#D4A45C',
  amberSoft: 'rgba(212, 164, 92, 0.20)',
  coral: '#E08A6E',
  coralSoft: 'rgba(224, 138, 110, 0.18)',
  sky: '#7A9BB8',
  skySoft: 'rgba(122, 155, 184, 0.18)',
  violet: '#9A8CB0',
  violetSoft: 'rgba(154, 140, 176, 0.18)',
  text: '#F3EDE4',
  textSecondary: '#C9BDB0',
  textMuted: '#9A8E82',
  accent: '#8FA87A',
  accentSoft: 'rgba(143, 168, 122, 0.22)',
  accentStrong: '#A3BC8E',
  accentOn: '#141A10',
  border: 'rgba(243, 237, 228, 0.10)',
  borderStrong: 'rgba(243, 237, 228, 0.16)',
  surfaceRaised: '#2A2520',
  urgent: '#E08A6E',
  urgentSoft: 'rgba(224, 138, 110, 0.18)',
  warning: '#D4A45C',
  warningSoft: 'rgba(212, 164, 92, 0.20)',
  success: '#8FA87A',
  successSoft: 'rgba(143, 168, 122, 0.22)',
  white: '#2A2520',
  pure: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.55)',
  gradient: ['#221E1A', '#1A1714', '#141210'],
  bloomAmber: 'rgba(212, 164, 92, 0.12)',
  bloomForest: 'rgba(143, 168, 122, 0.10)',
  statusBar: 'light',
};

/** Default static export — Linen. Themed screens should use `useTheme()`. */
export const colors: ThemeColors = linenColors;

export function paletteFor(
  theme: ThemeId,
  systemDark?: boolean
): ThemeColors {
  if (theme === 'hearth') return hearthColors;
  if (theme === 'system') return systemDark ? hearthColors : linenColors;
  return linenColors;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export type Density = 'comfortable' | 'compact';

export function spacingFor(density: Density) {
  if (density === 'compact') {
    return {
      xs: 3,
      sm: 6,
      md: 10,
      lg: 12,
      xl: 16,
      xxl: 22,
      xxxl: 32,
    } as const;
  }
  return spacing;
}

export const radius = {
  sm: 14,
  md: 18,
  lg: 24,
  xl: 32,
  full: 999,
} as const;

export const fonts = {
  sans: 'Figtree',
  sansMedium: 'FigtreeMedium',
  sansSemi: 'FigtreeSemi',
  sansBold: 'FigtreeBold',
  display: 'FigtreeMedium',
  serif: 'FigtreeMedium',
} as const;

export const shadows = {
  card: {
    boxShadow: '0 12px 40px rgba(63, 51, 39, 0.10)',
  },
  soft: {
    boxShadow: '0 8px 24px rgba(63, 51, 39, 0.07)',
  },
  float: {
    boxShadow: '0 18px 50px rgba(63, 51, 39, 0.14)',
  },
  glow: {
    boxShadow: '0 0 28px rgba(192, 138, 62, 0.25)',
  },
} as const;
