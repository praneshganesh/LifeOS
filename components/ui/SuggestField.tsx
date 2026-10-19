import { useMemo } from 'react';
import { Pressable, StyleSheet, View, type TextInputProps } from 'react-native';
import { DetailField } from '@/components/ui/DetailKit';
import { Text } from '@/components/ui/Text';
import { suggestionsFor } from '@/lib/fieldSuggestions';
import { useTheme } from '@/lib/ThemeContext';
import { type ThemeColors, fonts, radius, spacing } from '@/constants/theme';

export function SuggestionRow({
  value,
  suggestions,
  onPick,
}: {
  value: string;
  suggestions: string[];
  onPick: (label: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const matches = suggestionsFor(value, suggestions);
  if (!matches.length) return null;
  return (
    <View style={styles.row}>
      {matches.map((label) => (
        <Pressable
          key={label}
          onPress={() => onPick(label)}
          style={({ pressed }) => [styles.chip, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={`Use ${label}`}
        >
          <Text style={styles.chipText} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function SuggestField({
  value,
  onChangeText,
  suggestions,
  ...rest
}: TextInputProps & { suggestions: string[]; soft?: boolean }) {
  const typed = typeof value === 'string' ? value : '';

  return (
    <View>
      <DetailField value={value} onChangeText={onChangeText} {...rest} />
      <SuggestionRow
        value={typed}
        suggestions={suggestions}
        onPick={(label) => onChangeText?.(label)}
      />
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: spacing.sm,
    },
    chip: {
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.lineStrong,
      backgroundColor: colors.surface,
      maxWidth: '100%',
    },
    chipText: {
      fontFamily: fonts.sansMedium,
      fontSize: 14,
      color: colors.ink,
    },
  });
}
