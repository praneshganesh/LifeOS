import { Pressable, StyleSheet, View } from 'react-native';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
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
      backLabel="Settings"
      backFallbackHref="/settings"
    >
      <ModuleSection label="Palette">
        <View style={styles.grid}>
          {THEME_FAMILIES.map((t) => {
            const on = family === t.id;
            const p = PALETTES[t.id][resolved];
            return (
              <Pressable
                key={t.id}
                onPress={() => void setFamily(t.id)}
                style={[
                  styles.previewWrap,
                  {
                    backgroundColor: colors.surface,
                    borderColor: on ? colors.accent : colors.line,
                    borderWidth: on ? 2 : StyleSheet.hairlineWidth,
                  },
                ]}
              >
                {/* Mini mockup: background → card → primary / secondary CTA */}
                <View style={[styles.preview, { backgroundColor: p.bg }]}>
                  <View
                    style={[
                      styles.previewCard,
                      { backgroundColor: p.surface, borderColor: p.line },
                    ]}
                  >
                    <View
                      style={[styles.previewBar, { backgroundColor: p.ink, width: '64%' }]}
                    />
                    <View
                      style={[styles.previewBar, { backgroundColor: p.faint, width: '42%' }]}
                    />
                  </View>
                  <View style={styles.previewPills}>
                    <View
                      style={[styles.previewPill, { backgroundColor: p.accent, width: 36 }]}
                    />
                    <View
                      style={[styles.previewPill, { backgroundColor: p.accentSoft, width: 24 }]}
                    />
                  </View>
                </View>
                <View style={styles.previewMeta}>
                  <View style={styles.previewTitleRow}>
                    <Text variant="headline" style={{ fontSize: 16 }}>
                      {t.title}
                    </Text>
                    {on ? (
                      <View style={[styles.activeDot, { backgroundColor: colors.accent }]} />
                    ) : null}
                  </View>
                  <Text variant="caption" numberOfLines={1}>
                    {t.hint}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  previewWrap: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  preview: {
    padding: 10,
    paddingBottom: 12,
  },
  previewCard: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 8,
    gap: 5,
  },
  previewBar: {
    height: 5,
    borderRadius: 3,
  },
  previewPills: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 8,
  },
  previewPill: {
    height: 14,
    borderRadius: radius.full,
  },
  previewMeta: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  previewTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
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
