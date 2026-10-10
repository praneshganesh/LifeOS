import type { ThemeColors } from '@/constants/theme';
import { hubCardBg, isNearGray, type DotTone } from '@/components/ui/DotField';

/** Modules that appear on Today, Life, or both. Same key → same hue. */
export type ModuleToneKey =
  | 'things'
  | 'expenses'
  | 'subscriptions'
  | 'classes'
  | 'habits'
  | 'tasks';

/** Used when the theme swatch is near-gray (ink / mono). */
export const MODULE_TONE_FALLBACK: Record<ModuleToneKey, string> = {
  things: '#6A7D5C',
  expenses: '#A8884A',
  subscriptions: '#7A6E8E',
  classes: '#5E7A8C',
  habits: '#A66A5C',
  /** Today “Reminders” and Life “Tasks” are the same module. */
  tasks: '#5A7D76',
};

function themeHex(key: ModuleToneKey, colors: ThemeColors): string {
  switch (key) {
    case 'things':
      return colors.accent;
    case 'expenses':
      return colors.amber;
    case 'subscriptions':
      return colors.violet;
    case 'classes':
      return colors.sky;
    case 'habits':
      return colors.coral;
    case 'tasks':
      return MODULE_TONE_FALLBACK.tasks;
  }
}

/**
 * Shared tile + detail-hero color for a module (Today and Life).
 * Primary CTAs stay `colors.accent` — this is only for module identity.
 */
export function moduleTone(
  key: ModuleToneKey,
  colors: ThemeColors,
  light: boolean
): { accent: string; dots: DotTone } {
  const fallback = MODULE_TONE_FALLBACK[key];
  let hex = themeHex(key, colors);

  // Ink maps accent and amber to the same gold — Things vs Expenses would collide.
  const accentIsAmber =
    colors.accent.replace(/#/g, '').toLowerCase() ===
    colors.amber.replace(/#/g, '').toLowerCase();
  if (
    key === 'tasks' ||
    isNearGray(hex) ||
    (accentIsAmber && (key === 'things' || key === 'expenses'))
  ) {
    hex = fallback;
  }

  return {
    accent: hex,
    dots: {
      bg: hubCardBg(hex, light, fallback),
      dot: hex,
    },
  };
}
