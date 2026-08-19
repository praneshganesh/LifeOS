import { Text as RNText, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { fonts, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text variant="label" style={[styles.title, { color: colors.mute }]}>
        {title}
      </Text>
      {action ? (
        <RNText style={[styles.action, { color: colors.accent }]}>{action}</RNText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {},
  action: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
});
