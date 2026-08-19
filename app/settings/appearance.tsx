import { Pressable, StyleSheet, View } from 'react-native';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/lib/ThemeContext';
import {
  PALETTES,
  THEME_FAMILIES,
  fonts,
  radius,
  spacing,
  type ThemeFamily,
  type ThemeMode,
} from '@/constants/theme';

const MODES: { id: ThemeMode; title: string }[] = [
  { id: 'light', title: 'Light' },
  { id: 'dark', title: 'Dark' },
  { id: 'system', title: 'System' },
];

const FAMILY_LABEL: Record<ThemeFamily, string> = {
  ink: 'Ink',
  earth: 'Earth',
  ocean: 'Ocean',
  clay: 'Clay',
};

export default function AppearanceSettingsScreen() {
  const { family, mode, colors, setFamily, setMode, resolved } = useTheme();

  return (
    <ModuleScreen
      title="Appearance"
      subtitle={`${FAMILY_LABEL[family]} · ${resolved} · Figtree.`}
    >
      <ModuleSection label="Palette">
        <ListCard>
          {THEME_FAMILIES.map((t, i) => {
            const on = family === t.id;
            const light = PALETTES[t.id].light;
            const dark = PALETTES[t.id].dark;
            return (
              <Pressable
                key={t.id}
                onPress={() => void setFamily(t.id)}
                style={[
                  styles.row,
                  i < THEME_FAMILIES.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.line,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="headline" style={{ fontSize: 16 }}>
                    {t.title}
                    {on ? ' · Active' : ''}
                  </Text>
                  <Text variant="caption" style={{ marginTop: 2 }}>
                    {t.hint}
                  </Text>
                </View>
                <View style={styles.swatches}>
                  {[light.bg, light.accent, dark.bg].map((c) => (
                    <View
                      key={`${t.id}-${c}`}
                      style={[
                        styles.swatch,
                        {
                          backgroundColor: c,
                          borderColor: colors.lineStrong,
                        },
                      ]}
                    />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Brightness">
        <View style={styles.chips}>
          {MODES.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => void setMode(m.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: mode === m.id ? colors.accent : colors.surface,
                  borderColor: mode === m.id ? colors.accent : colors.line,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: mode === m.id ? colors.accentOn : colors.slate },
                ]}
              >
                {m.title}
              </Text>
            </Pressable>
          ))}
        </View>
      </ModuleSection>
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  swatches: { flexDirection: 'row', gap: 6 },
  swatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
});
