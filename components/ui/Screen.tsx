import { type ReactNode } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/ThemeContext';

/**
 * Studio wash: soft vertical fade — closer to Apple's grouped background than a loud gradient.
 */
export function Screen({
  children,
  style,
}: {
  children?: ReactNode;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }, style]}>
      <LinearGradient
        colors={[colors.bgElevated, colors.bg, colors.bg]}
        locations={[0, 0.28, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
