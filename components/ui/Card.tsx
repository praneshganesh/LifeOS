import { View, StyleSheet, ViewStyle, Pressable } from 'react-native';
import { radius, shadowsFor, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

export function Card({
  children,
  style,
  onPress,
  elevated,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  elevated?: boolean;
}) {
  const { colors, resolved } = useTheme();
  const shade = shadowsFor(resolved);
  const base = [
    styles.card,
    { backgroundColor: colors.surface, borderColor: colors.line },
    elevated ? shade.float : shade.card,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          ...base,
          // Sink into the page: swap the raised shadow for the inset one.
          pressed && { transform: [{ scale: 0.985 }], ...shade.pressed },
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={base}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
