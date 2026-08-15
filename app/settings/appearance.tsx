import { Pressable, StyleSheet, View } from 'react-native';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/lib/ThemeContext';
import { hearthColors, linenColors, fonts, radius, spacing, type ThemeId } from '@/constants/theme';

const THEMES: {
  id: ThemeId;
  title: string;
  hint: string;
  swatches: string[];
}[] = [
  {
    id: 'linen',
    title: 'Linen morning',
    hint: 'Warm daylight · olive-sage accent',
    swatches: [linenColors.bg, linenColors.forest, linenColors.amber],
  },
  {
    id: 'hearth',
    title: 'Hearth',
    hint: 'Warm charcoal · same olive accent',
    swatches: [hearthColors.bg, hearthColors.forest, hearthColors.amber],
  },
  {
    id: 'system',
    title: 'System',
    hint: 'Follow device light / dark',
    swatches: [linenColors.bg, hearthColors.bg, linenColors.forest],
  },
];

export default function AppearanceSettingsScreen() {
  const { theme, density, colors, setTheme, setDensity, resolved } = useTheme();

  return (
    <ModuleScreen
      title="Appearance"
      subtitle={`${resolved === 'hearth' ? 'Hearth' : 'Linen'} · Figtree.`}
    >
      <ModuleSection label="Theme">
        <ListCard>
          {THEMES.map((t, i) => {
            const on = theme === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => void setTheme(t.id)}
                style={[
                  styles.row,
                  i < THEMES.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.line,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="headline" style={{ fontSize: 15 }}>
                    {t.title}
                    {on ? ' · Active' : ''}
                  </Text>
                  <Text variant="caption" style={{ marginTop: 2 }}>
                    {t.hint}
                  </Text>
                </View>
                <View style={styles.swatches}>
                  {t.swatches.map((c) => (
                    <View
                      key={c}
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

      <ModuleSection label="Density">
        <View style={styles.chips}>
          {(['comfortable', 'compact'] as const).map((d) => (
            <Pressable
              key={d}
              onPress={() => void setDensity(d)}
              style={[
                styles.chip,
                {
                  backgroundColor: density === d ? colors.forest : colors.white,
                  borderColor: density === d ? colors.forest : colors.line,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: density === d ? colors.forestOn : colors.slate },
                ]}
              >
                {d === 'comfortable' ? 'Comfortable' : 'Compact'}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text variant="caption" style={{ marginTop: spacing.md, color: colors.mute }}>
          Compact tightens spacing on screens that use theme spacing tokens.
        </Text>
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
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    textTransform: 'capitalize',
  },
});
