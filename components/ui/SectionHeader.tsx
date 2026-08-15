import { Text as RNText, StyleSheet, View } from 'react-native';
import { colors, fonts, spacing } from '@/constants/theme';
import { Text } from '@/components/ui/Text';

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: string;
}) {
  return (
    <View style={styles.row}>
      <Text variant="label" style={styles.title}>
        {title}
      </Text>
      {action ? (
        <RNText style={styles.action}>{action}</RNText>
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
  title: {
    color: colors.mute,
  },
  action: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.forest,
  },
});
