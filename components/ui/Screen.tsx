import { type ReactNode } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/ThemeContext';

export function Screen({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }, style]}>
      <LinearGradient
        colors={colors.gradient}
        locations={[0, 0.55, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[styles.bloomTop, { backgroundColor: colors.bloomAmber }]}
        pointerEvents="none"
      />
      <View
        style={[styles.bloomSide, { backgroundColor: colors.bloomForest }]}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bloomTop: {
    position: 'absolute',
    top: -120,
    right: -60,
    width: 280,
    height: 280,
    borderRadius: 280,
  },
  bloomSide: {
    position: 'absolute',
    top: 220,
    left: -100,
    width: 240,
    height: 240,
    borderRadius: 240,
  },
});
