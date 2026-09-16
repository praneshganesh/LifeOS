import { Pressable, StyleSheet, View } from 'react-native';
import { DETAIL_DOCK_PAD } from '@/components/ui/DetailKit';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/lib/ThemeContext';
import { fonts, radius, type ThemeMode } from '@/constants/theme';

const MODES: { id: ThemeMode; title: string; hint: string }[] = [
  { id: 'light', title: 'Light', hint: 'White cards on light gray' },
  { id: 'dark', title: 'Dark', hint: 'Charcoal studio' },
  { id: 'system', title: 'System', hint: 'Match device setting' },
];

export default function AppearanceSettingsScreen() {
  const { mode, colors, setMode } = useTheme();

  return (
    <ModuleScreen
      title="Appearance"
      backLabel="Settings"
      backFallbackHref="/settings"
      bottomExtra={DETAIL_DOCK_PAD}
    >
      <ModuleSection label="Brightness">
        <View style={styles.list}>
          {MODES.map((m) => {
            const on = mode === m.id;
            return (
              <Pressable
                key={m.id}
                onPress={() => void setMode(m.id)}
                style={[
                  styles.row,
                  {
                    backgroundColor: on ? colors.accentSoft : colors.surface,
                    borderColor: on ? colors.ink : colors.lineStrong,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.rowTitle, { color: colors.ink }]}>{m.title}</Text>
                  <Text style={[styles.rowHint, { color: colors.mute }]}>{m.hint}</Text>
                </View>
                {on ? (
                  <View style={[styles.activeDot, { backgroundColor: colors.ink }]} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ModuleSection>
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 56,
  },
  rowTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    letterSpacing: -0.2,
  },
  rowHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    letterSpacing: -0.1,
    marginTop: 2,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
