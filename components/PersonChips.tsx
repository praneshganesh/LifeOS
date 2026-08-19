import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import type { HouseholdMember } from '@/lib/household';
import { fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

export function PersonChips({
  members,
  personId,
  onChange,
  label = 'Who',
  noneLabel = 'Unassigned',
}: {
  members: HouseholdMember[];
  personId: string | null;
  onChange: (id: string | null) => void;
  label?: string;
  noneLabel?: string;
}) {
  const { colors } = useTheme();
  if (!members.length) return null;
  return (
    <>
      <Text style={[styles.label, { color: colors.mute }]}>{label}</Text>
      <View style={styles.chips}>
        <Pressable
          onPress={() => onChange(null)}
          style={[
            styles.chip,
            {
              backgroundColor: !personId ? colors.accentSoft : colors.surface,
              borderColor: !personId ? colors.accent : colors.line,
            },
          ]}
        >
          <Text
            style={[
              styles.chipText,
              { color: !personId ? colors.accent : colors.ink },
            ]}
          >
            {noneLabel}
          </Text>
        </Pressable>
        {members.map((m) => {
          const on = personId === m.id;
          return (
            <Pressable
              key={m.id}
              onPress={() => onChange(m.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: on ? colors.accentSoft : colors.surface,
                  borderColor: on ? colors.accent : colors.line,
                },
              ]}
            >
              <Text
                style={[styles.chipText, { color: on ? colors.accent : colors.ink }]}
              >
                {m.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
});
