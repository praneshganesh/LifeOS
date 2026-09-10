import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { fonts } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

type Variant =
  | 'brand'
  | 'hero'
  | 'title'
  | 'headline'
  | 'body'
  | 'bodyMedium'
  | 'caption'
  | 'label'
  | 'score';

/** Prefer Medium over heavy Bold — keeps the UI modern, not shouty. */
export function Text({
  variant = 'body',
  style,
  ...props
}: TextProps & { variant?: Variant }) {
  const { colors } = useTheme();

  const variantStyle: Record<Variant, TextStyle> = {
    brand: {
      fontFamily: fonts.sansMedium,
      fontSize: 20,
      lineHeight: 24,
      color: colors.ink,
      letterSpacing: -0.4,
    },
    hero: {
      fontFamily: fonts.sansSemi,
      fontSize: 28,
      lineHeight: 34,
      color: colors.ink,
      letterSpacing: -0.8,
    },
    title: {
      fontFamily: fonts.sansSemi,
      fontSize: 28,
      lineHeight: 34,
      color: colors.ink,
      letterSpacing: -0.6,
    },
    headline: {
      fontFamily: fonts.sansMedium,
      fontSize: 17,
      lineHeight: 22,
      color: colors.ink,
      letterSpacing: -0.3,
    },
    body: {
      fontFamily: fonts.sans,
      fontSize: 16,
      lineHeight: 22,
      color: colors.slate,
    },
    bodyMedium: {
      fontFamily: fonts.sansMedium,
      fontSize: 16,
      lineHeight: 22,
      color: colors.ink,
    },
    caption: {
      fontFamily: fonts.sans,
      fontSize: 13,
      lineHeight: 18,
      color: colors.mute,
    },
    label: {
      fontFamily: fonts.sans,
      fontSize: 13,
      lineHeight: 18,
      color: colors.mute,
      letterSpacing: -0.08,
    },
    score: {
      fontFamily: fonts.sansSemi,
      fontSize: 28,
      lineHeight: 32,
      color: colors.ink,
      letterSpacing: -0.6,
    },
  };

  return <RNText style={[variantStyle[variant], style]} {...props} />;
}
