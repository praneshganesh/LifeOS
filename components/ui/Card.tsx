import { View, StyleSheet, ViewStyle, Pressable } from 'react-native';
import { colors, radius, shadows, spacing } from '@/constants/theme';

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
  const base = [styles.card, elevated && styles.elevated, style];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          ...base,
          pressed && { transform: [{ scale: 0.985 }], opacity: 0.97 },
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
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.card,
  },
  elevated: {
    ...shadows.float,
  },
});
