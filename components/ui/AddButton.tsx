import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { blurActiveElement } from '@/lib/a11y';

/** The one header "add" control: round accent +. Label is for screen readers. */
export function AddButton({ onPress, label }: { onPress: () => void; label: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        blurActiveElement();
        onPress();
      }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: colors.accent },
        pressed && { opacity: 0.88, transform: [{ scale: 0.96 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
    >
      <Plus size={20} color={colors.accentOn} strokeWidth={2.4} />
    </Pressable>
  );
}

/** Header action row: optional camera button, then +. */
export function HeaderActions({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export const HEADER_BUTTON_SIZE = 40;

const styles = StyleSheet.create({
  btn: {
    width: HEADER_BUTTON_SIZE,
    height: HEADER_BUTTON_SIZE,
    borderRadius: HEADER_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
