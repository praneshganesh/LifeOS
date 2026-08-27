/**
 * LifeOS palettes — Earth, Ocean, Clay × light/dark.
 * Prefer `useTheme().colors` in UI. StyleSheet.create snapshots values at
 * import time, so color tokens used there stay Linen unless applied at render.
 * The default `colors` export stays Earth light for legacy StyleSheet modules.
 */

export type ThemeFamily = 'earth' | 'ocean' | 'clay' | 'ink';
export type ThemeMode = 'light' | 'dark' | 'system';
/** @deprecated Prefer ThemeFamily + ThemeMode. Kept for stored prefs + tests. */
export type ThemeId = ThemeFamily | 'linen' | 'hearth' | 'system';
export type ThemeResolved = 'light' | 'dark';

/**
 * Token roles — the elevation & emphasis contract every screen relies on:
 * - `bg`            screen background (mid stop of the Screen gradient)
 * - `bgDeep`        bottom gradient stop / recessed areas
 * - `bgElevated`    top gradient stop / raised page zones
 * - `surface`       cards — one clear step lighter (dark) / whiter (light) than bg
 * - `surfaceSoft`   insets ON a card: chips, input fills, secondary tiles
 * - `surfaceHover`  pressed/hover state of surfaceSoft
 * - `accent`        PRIMARY CTA fill (with `accentOn` text)
 * - `accentSoft`    SECONDARY CTA fill (with `accent` text)
 * - `accentWash`    tertiary tint — highlighted rows, selected states
 * - `ink`           primary text; `onInk` = text on ink-filled buttons
 */
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
  accentWash: string;
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
  /** Text/icon on `ink` (avatars). */
  onInk: string;
  listenGradient: [string, string, string, string, string];
};

function paint(p: {
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
  accent: string;
  accentStrong: string;
  accentSoft: string;
  accentWash: string;
  accentOn: string;
  amber: string;
  amberSoft: string;
  coral: string;
  coralSoft: string;
  sky: string;
  skySoft: string;
  violet: string;
  violetSoft: string;
  overlay: string;
  gradient: [string, string, string];
  bloomAmber: string;
  bloomForest: string;
  statusBar: 'light' | 'dark';
  onInk: string;
  listenGradient: [string, string, string, string, string];
}): ThemeColors {
  return {
    bg: p.bg,
    bgDeep: p.bgDeep,
    bgElevated: p.bgElevated,
    surface: p.surface,
    surfaceSoft: p.surfaceSoft,
    surfaceHover: p.surfaceHover,
    surfaceTint: p.surfaceTint,
    ink: p.ink,
    slate: p.slate,
    mute: p.mute,
    faint: p.faint,
    line: p.line,
    lineStrong: p.lineStrong,
    forest: p.accent,
    forestBright: p.accentStrong,
    forestSoft: p.accentSoft,
    forestWash: p.accentWash,
    forestOn: p.accentOn,
    amber: p.amber,
    amberSoft: p.amberSoft,
    coral: p.coral,
    coralSoft: p.coralSoft,
    sky: p.sky,
    skySoft: p.skySoft,
    violet: p.violet,
    violetSoft: p.violetSoft,
    text: p.ink,
    textSecondary: p.slate,
    textMuted: p.mute,
    accent: p.accent,
    accentSoft: p.accentSoft,
    accentStrong: p.accentStrong,
    accentOn: p.accentOn,
    accentWash: p.accentWash,
    border: p.line,
    borderStrong: p.lineStrong,
    surfaceRaised: p.surface,
    urgent: p.coral,
    urgentSoft: p.coralSoft,
    warning: p.amber,
    warningSoft: p.amberSoft,
    success: p.accent,
    successSoft: p.accentSoft,
    white: p.surface,
    pure: '#FFFFFF',
    black: '#000000',
    overlay: p.overlay,
    gradient: p.gradient,
    bloomAmber: p.bloomAmber,
    bloomForest: p.bloomForest,
    statusBar: p.statusBar,
    onInk: p.onInk,
    listenGradient: p.listenGradient,
  };
}

/** Earth light — warm linen, sage accent (legacy Linen). */
export const earthLight: ThemeColors = paint({
  bg: '#F4EFE7',
  bgDeep: '#ECE5D9',
  bgElevated: '#FAF7F1',
  surface: '#FFFFFF',
  surfaceSoft: '#F1EBE1',
  surfaceHover: '#E9E1D4',
  surfaceTint: '#EDF0E4',
  ink: '#2B241E',
  slate: '#54493E',
  mute: '#6F6458',
  faint: '#8F8274',
  line: 'rgba(43, 36, 30, 0.10)',
  lineStrong: 'rgba(43, 36, 30, 0.18)',
  accent: '#4F6840',
  accentStrong: '#3F5433',
  accentSoft: 'rgba(79, 104, 64, 0.16)',
  accentWash: 'rgba(79, 104, 64, 0.08)',
  accentOn: '#F8FAF3',
  amber: '#B4782E',
  amberSoft: 'rgba(180, 120, 46, 0.16)',
  coral: '#C45A3A',
  coralSoft: 'rgba(196, 90, 58, 0.16)',
  sky: '#4A6F8F',
  skySoft: 'rgba(74, 111, 143, 0.16)',
  violet: '#6E6088',
  violetSoft: 'rgba(110, 96, 136, 0.16)',
  overlay: 'rgba(43, 36, 30, 0.45)',
  gradient: ['#FAF6EF', '#F4EFE7', '#EFE8DD'],
  bloomAmber: 'rgba(180, 120, 46, 0.10)',
  bloomForest: 'rgba(79, 104, 64, 0.08)',
  statusBar: 'dark',
  onInk: '#FFFFFF',
  listenGradient: ['#7A9066', '#C08A3E', '#4F6840', '#E5A95C', '#7A9066'],
});

/** Earth dark — firelit hearth: warm brown depths, sage accent. */
export const earthDark: ThemeColors = paint({
  bg: '#1C1712',
  bgDeep: '#110E0A',
  bgElevated: '#282017',
  surface: '#332A20',
  surfaceSoft: '#423728',
  surfaceHover: '#4E4231',
  surfaceTint: '#343B27',
  ink: '#F7F1E8',
  slate: '#D6C9B9',
  mute: '#B3A492',
  faint: '#87796A',
  line: 'rgba(247, 241, 232, 0.16)',
  lineStrong: 'rgba(247, 241, 232, 0.26)',
  accent: '#A9C78D',
  accentStrong: '#C0DBA6',
  accentSoft: 'rgba(169, 199, 141, 0.28)',
  accentWash: 'rgba(169, 199, 141, 0.14)',
  accentOn: '#141A10',
  amber: '#E3B76D',
  amberSoft: 'rgba(227, 183, 109, 0.26)',
  coral: '#E89B7B',
  coralSoft: 'rgba(232, 155, 123, 0.24)',
  sky: '#8FB4D0',
  skySoft: 'rgba(143, 180, 208, 0.24)',
  violet: '#B4A4C8',
  violetSoft: 'rgba(180, 164, 200, 0.24)',
  overlay: 'rgba(0, 0, 0, 0.55)',
  gradient: ['#282017', '#1C1712', '#110E0A'],
  bloomAmber: 'rgba(227, 183, 109, 0.12)',
  bloomForest: 'rgba(169, 199, 141, 0.10)',
  statusBar: 'light',
  onInk: '#1C1712',
  listenGradient: ['#A9C78D', '#E3B76D', '#8FA87A', '#E5A95C', '#A9C78D'],
});

/** Ocean light — cool mist, deep teal. */
export const oceanLight: ThemeColors = paint({
  bg: '#E8F0F4',
  bgDeep: '#D9E6ED',
  bgElevated: '#F3F7FA',
  surface: '#FFFFFF',
  surfaceSoft: '#E4EEF3',
  surfaceHover: '#D4E3EB',
  surfaceTint: '#DCEEF4',
  ink: '#163042',
  slate: '#3A5566',
  mute: '#4E6A7A',
  faint: '#7A94A3',
  line: 'rgba(22, 48, 66, 0.10)',
  lineStrong: 'rgba(22, 48, 66, 0.18)',
  accent: '#1B6B86',
  accentStrong: '#155A72',
  accentSoft: 'rgba(27, 107, 134, 0.16)',
  accentWash: 'rgba(27, 107, 134, 0.08)',
  accentOn: '#F4FBFE',
  amber: '#C0843A',
  amberSoft: 'rgba(192, 132, 58, 0.16)',
  coral: '#C45A4A',
  coralSoft: 'rgba(196, 90, 74, 0.16)',
  sky: '#3D7EA8',
  skySoft: 'rgba(61, 126, 168, 0.16)',
  violet: '#5E6F9A',
  violetSoft: 'rgba(94, 111, 154, 0.16)',
  overlay: 'rgba(16, 36, 48, 0.45)',
  gradient: ['#F3F8FB', '#E8F0F4', '#DCE8EE'],
  bloomAmber: 'rgba(192, 132, 58, 0.10)',
  bloomForest: 'rgba(27, 107, 134, 0.10)',
  statusBar: 'dark',
  onInk: '#FFFFFF',
  listenGradient: ['#3D8AAD', '#5BA3C4', '#1B6B86', '#7EB8D4', '#3D8AAD'],
});

/** Ocean dark — deep water: saturated navy depths, seafoam accent. */
export const oceanDark: ThemeColors = paint({
  bg: '#0D1C25',
  bgDeep: '#06121A',
  bgElevated: '#142935',
  surface: '#1B3443',
  surfaceSoft: '#264455',
  surfaceHover: '#2F5164',
  surfaceTint: '#1B3C4E',
  ink: '#EAF4F8',
  slate: '#C5D8E2',
  mute: '#A3B9C6',
  faint: '#7E96A4',
  line: 'rgba(234, 244, 248, 0.16)',
  lineStrong: 'rgba(234, 244, 248, 0.26)',
  accent: '#66C6E4',
  accentStrong: '#8AD6EE',
  accentSoft: 'rgba(102, 198, 228, 0.28)',
  accentWash: 'rgba(102, 198, 228, 0.14)',
  accentOn: '#06141B',
  amber: '#E7BC72',
  amberSoft: 'rgba(231, 188, 114, 0.26)',
  coral: '#EC9C8C',
  coralSoft: 'rgba(236, 156, 140, 0.24)',
  sky: '#8BB8D4',
  skySoft: 'rgba(139, 184, 212, 0.24)',
  violet: '#A8B4D4',
  violetSoft: 'rgba(168, 180, 212, 0.24)',
  overlay: 'rgba(0, 0, 0, 0.55)',
  gradient: ['#142935', '#0D1C25', '#06121A'],
  bloomAmber: 'rgba(231, 188, 114, 0.12)',
  bloomForest: 'rgba(102, 198, 228, 0.12)',
  statusBar: 'light',
  onInk: '#0D1C25',
  listenGradient: ['#66C6E4', '#5BA3C4', '#3D8AAD', '#E7BC72', '#66C6E4'],
});

/** Clay light — sand, terracotta (not green). */
export const clayLight: ThemeColors = paint({
  bg: '#F6EDE4',
  bgDeep: '#EDDFD2',
  bgElevated: '#FBF6F1',
  surface: '#FFFCFA',
  surfaceSoft: '#F3E6DA',
  surfaceHover: '#E8D5C6',
  surfaceTint: '#F6E4D6',
  ink: '#3A241C',
  slate: '#5C3F34',
  mute: '#7A5648',
  faint: '#9A7A6A',
  line: 'rgba(58, 36, 28, 0.10)',
  lineStrong: 'rgba(58, 36, 28, 0.18)',
  accent: '#B44A28',
  accentStrong: '#933C20',
  accentSoft: 'rgba(180, 74, 40, 0.16)',
  accentWash: 'rgba(180, 74, 40, 0.08)',
  accentOn: '#FFF8F3',
  amber: '#C08A3E',
  amberSoft: 'rgba(192, 138, 62, 0.16)',
  coral: '#C45A3A',
  coralSoft: 'rgba(196, 90, 58, 0.16)',
  sky: '#5D7E9C',
  skySoft: 'rgba(93, 126, 156, 0.16)',
  violet: '#7C6E96',
  violetSoft: 'rgba(124, 110, 150, 0.16)',
  overlay: 'rgba(58, 36, 28, 0.45)',
  gradient: ['#FBF6F1', '#F6EDE4', '#EDDFD2'],
  bloomAmber: 'rgba(192, 138, 62, 0.10)',
  bloomForest: 'rgba(180, 74, 40, 0.08)',
  statusBar: 'dark',
  onInk: '#FFFFFF',
  listenGradient: ['#C46A3A', '#E08A5C', '#B44A28', '#D4A45C', '#C46A3A'],
});

/** Clay dark — glowing ember: red-brown depths, terracotta accent. */
export const clayDark: ThemeColors = paint({
  bg: '#201310',
  bgDeep: '#140C08',
  bgElevated: '#2C1B14',
  surface: '#39251B',
  surfaceSoft: '#483023',
  surfaceHover: '#553B2B',
  surfaceTint: '#412B1D',
  ink: '#F7ECE4',
  slate: '#D6C2B5',
  mute: '#BA9C8D',
  faint: '#8F7468',
  line: 'rgba(247, 236, 228, 0.16)',
  lineStrong: 'rgba(247, 236, 228, 0.26)',
  accent: '#EE9F6F',
  accentStrong: '#F6B98F',
  accentSoft: 'rgba(238, 159, 111, 0.28)',
  accentWash: 'rgba(238, 159, 111, 0.14)',
  accentOn: '#1D110A',
  amber: '#E3B76D',
  amberSoft: 'rgba(227, 183, 109, 0.26)',
  coral: '#E89B7B',
  coralSoft: 'rgba(232, 155, 123, 0.24)',
  sky: '#8FB4D0',
  skySoft: 'rgba(143, 180, 208, 0.24)',
  violet: '#B4A4C8',
  violetSoft: 'rgba(180, 164, 200, 0.24)',
  overlay: 'rgba(0, 0, 0, 0.55)',
  gradient: ['#2C1B14', '#201310', '#140C08'],
  bloomAmber: 'rgba(227, 183, 109, 0.12)',
  bloomForest: 'rgba(238, 159, 111, 0.10)',
  statusBar: 'light',
  onInk: '#201310',
  listenGradient: ['#EE9F6F', '#E3B76D', '#C46A3A', '#F6B98F', '#EE9F6F'],
});

/** Ink light — paper and graphite. */
export const inkLight: ThemeColors = paint({
  bg: '#F3F3F4',
  bgDeep: '#E8E8EA',
  bgElevated: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceSoft: '#ECECEE',
  surfaceHover: '#E2E2E5',
  surfaceTint: '#EFEFF1',
  ink: '#111113',
  slate: '#3F3F46',
  mute: '#52525B',
  faint: '#71717A',
  line: 'rgba(17, 17, 19, 0.10)',
  lineStrong: 'rgba(17, 17, 19, 0.18)',
  accent: '#111113',
  accentStrong: '#000000',
  accentSoft: 'rgba(17, 17, 19, 0.10)',
  accentWash: 'rgba(17, 17, 19, 0.05)',
  accentOn: '#FAFAFA',
  amber: '#A16207',
  amberSoft: 'rgba(161, 98, 7, 0.14)',
  coral: '#B42318',
  coralSoft: 'rgba(180, 35, 24, 0.14)',
  sky: '#3F3F46',
  skySoft: 'rgba(63, 63, 70, 0.12)',
  violet: '#3F3F46',
  violetSoft: 'rgba(63, 63, 70, 0.12)',
  overlay: 'rgba(17, 17, 19, 0.48)',
  gradient: ['#FAFAFA', '#F3F3F4', '#E8E8EA'],
  bloomAmber: 'rgba(17, 17, 19, 0.06)',
  bloomForest: 'rgba(17, 17, 19, 0.04)',
  statusBar: 'dark',
  onInk: '#FFFFFF',
  listenGradient: ['#3F3F46', '#111113', '#71717A', '#18181B', '#3F3F46'],
});

/** Ink dark — charcoal studio, white type. Monochrome, but with real depth. */
export const inkDark: ThemeColors = paint({
  bg: '#0D0D0F',
  bgDeep: '#050506',
  bgElevated: '#18181B',
  surface: '#212125',
  surfaceSoft: '#2C2C31',
  surfaceHover: '#37373D',
  surfaceTint: '#242429',
  ink: '#FAFAFA',
  slate: '#E4E4E7',
  mute: '#A1A1AA',
  faint: '#71717A',
  line: 'rgba(250, 250, 250, 0.14)',
  lineStrong: 'rgba(250, 250, 250, 0.24)',
  accent: '#FAFAFA',
  accentStrong: '#FFFFFF',
  accentSoft: 'rgba(250, 250, 250, 0.16)',
  accentWash: 'rgba(250, 250, 250, 0.08)',
  accentOn: '#0B0B0C',
  amber: '#E8B84A',
  amberSoft: 'rgba(232, 184, 74, 0.20)',
  coral: '#F07070',
  coralSoft: 'rgba(240, 112, 112, 0.18)',
  sky: '#A1A1AA',
  skySoft: 'rgba(161, 161, 170, 0.18)',
  violet: '#A1A1AA',
  violetSoft: 'rgba(161, 161, 170, 0.18)',
  overlay: 'rgba(0, 0, 0, 0.62)',
  gradient: ['#18181B', '#0D0D0F', '#050506'],
  bloomAmber: 'rgba(250, 250, 250, 0.09)',
  bloomForest: 'rgba(250, 250, 250, 0.07)',
  statusBar: 'light',
  onInk: '#0D0D0F',
  listenGradient: ['#FAFAFA', '#A1A1AA', '#27272A', '#FFFFFF', '#FAFAFA'],
});

export const PALETTES: Record<ThemeFamily, { light: ThemeColors; dark: ThemeColors }> = {
  earth: { light: earthLight, dark: earthDark },
  ocean: { light: oceanLight, dark: oceanDark },
  clay: { light: clayLight, dark: clayDark },
  ink: { light: inkLight, dark: inkDark },
};

export const THEME_FAMILIES: {
  id: ThemeFamily;
  title: string;
  hint: string;
}[] = [
  { id: 'ink', title: 'Ink', hint: 'Charcoal & white' },
  { id: 'earth', title: 'Earth', hint: 'Linen & sage' },
  { id: 'ocean', title: 'Ocean', hint: 'Mist & teal' },
  { id: 'clay', title: 'Clay', hint: 'Sand & terracotta' },
];

export type AppearancePrefs = {
  family: ThemeFamily;
  mode: ThemeMode;
};

/** Bump when the house default changes so we can migrate stored prefs once. */
export const APPEARANCE_REV = 2;

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  family: 'ink',
  mode: 'dark',
};

export function migrateAppearancePrefs(parsed: Record<string, unknown>): AppearancePrefs {
  let family: ThemeFamily = DEFAULT_APPEARANCE.family;
  let mode: ThemeMode = DEFAULT_APPEARANCE.mode;

  if (isThemeFamily(parsed.family as string) && isThemeMode(parsed.mode as string)) {
    family = parsed.family as ThemeFamily;
    mode = parsed.mode as ThemeMode;
  } else {
    const legacy = parsed.theme;
    if (legacy === 'hearth') {
      family = 'earth';
      mode = 'dark';
    } else if (legacy === 'system') {
      family = 'earth';
      mode = 'system';
    } else if (legacy === 'ocean' || legacy === 'clay' || legacy === 'earth' || legacy === 'ink') {
      family = legacy;
      mode = 'light';
    }
  }

  const rev = typeof parsed.rev === 'number' ? parsed.rev : 1;
  // Earth was the old default, not a pick. House look is Ink dark.
  if (rev < APPEARANCE_REV && family === 'earth') {
    family = 'ink';
    if (mode === 'light') mode = 'dark';
  }

  return { family, mode };
}

/** Legacy names — Earth light / dark. */
export const linenColors = earthLight;
export const hearthColors = earthDark;

/** Live palette — ThemeProvider assigns into this so JSX `colors.*` follows the active theme.
 *  StyleSheet.create still snapshots; those modules must call makeStyles(colors). */
export const colors: ThemeColors = { ...inkDark };

export function applyLivePalette(next: ThemeColors) {
  Object.assign(colors, next);
}

export function isThemeFamily(value: string | undefined): value is ThemeFamily {
  return value === 'earth' || value === 'ocean' || value === 'clay' || value === 'ink';
}

export function isThemeMode(value: string | undefined): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function resolvePalette(
  family: ThemeFamily,
  mode: ThemeMode,
  systemDark = false
): ThemeColors {
  const dark = mode === 'dark' || (mode === 'system' && systemDark);
  return PALETTES[family][dark ? 'dark' : 'light'];
}

export function paletteFor(
  theme: ThemeId,
  systemDark?: boolean,
  mode: ThemeMode = 'light'
): ThemeColors {
  if (theme === 'linen') return earthLight;
  if (theme === 'hearth') return earthDark;
  if (theme === 'system') return systemDark ? earthDark : earthLight;
  return resolvePalette(theme, mode, systemDark);
}

/** WCAG contrast ratio for #RRGGBB. Returns 0 for non-hex. */
export function contrastRatio(a: string, b: string): number {
  const l1 = hexLuminance(a);
  const l2 = hexLuminance(b);
  if (l1 == null || l2 == null) return 0;
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function hexLuminance(hex: string): number | null {
  const raw = hex.replace('#', '');
  if (raw.length !== 6 || /[^0-9a-f]/i.test(raw)) return null;
  const toLin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = toLin(parseInt(raw.slice(0, 2), 16));
  const g = toLin(parseInt(raw.slice(2, 4), 16));
  const b = toLin(parseInt(raw.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
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

/**
 * Soft-UI finish: each surface shadow pairs an outer drop with a faint inset
 * highlight along the top edge (and a whisper of a dark inner edge at the
 * bottom in light mode), so cards read as gently pillowed — tactile like
 * neumorphism, without giving up surface/background contrast.
 * `pressed` is the inset state for pressable cards and buttons.
 */
export const shadows = {
  card: {
    boxShadow:
      '0 12px 40px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9), inset 0 -1px 0 rgba(0, 0, 0, 0.04)',
  },
  soft: {
    boxShadow:
      '0 8px 24px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.8), inset 0 -1px 0 rgba(0, 0, 0, 0.03)',
  },
  float: {
    boxShadow:
      '0 18px 50px rgba(0, 0, 0, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.9), inset 0 -1px 0 rgba(0, 0, 0, 0.05)',
  },
  glow: {
    boxShadow: '0 0 28px rgba(0, 0, 0, 0.12)',
  },
  pressed: {
    boxShadow:
      '0 2px 8px rgba(0, 0, 0, 0.05), inset 0 2px 6px rgba(0, 0, 0, 0.10)',
  },
} as const;

export function shadowsFor(resolved: ThemeResolved) {
  if (resolved === 'dark') {
    // Darker, tighter drops — surfaces are lighter than bg, so the shadow
    // does the separating instead of relying on hairlines alone. The inset
    // white edge is the "lit from above" highlight that sells the depth.
    return {
      card: {
        boxShadow:
          '0 14px 36px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.07)',
      },
      soft: {
        boxShadow:
          '0 6px 20px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
      },
      float: {
        boxShadow:
          '0 22px 56px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.09)',
      },
      glow: { boxShadow: '0 0 28px rgba(255, 255, 255, 0.07)' },
      pressed: {
        boxShadow:
          '0 2px 8px rgba(0, 0, 0, 0.35), inset 0 2px 8px rgba(0, 0, 0, 0.5)',
      },
    } as const;
  }
  return shadows;
}
