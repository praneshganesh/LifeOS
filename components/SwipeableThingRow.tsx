import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Icon3DBadge, type Icon3DName } from '@/components/ui/Icon3D';
import { SwipeActions } from '@/components/ui/SwipeActions';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import { blurActiveElement } from '@/lib/a11y';

type Props = {
  name: string;
  subtitle?: string;
  icon: Icon3DName;
  onPress: () => void;
  /** Swipe left reveals Delete (user-owned items). */
  onDelete?: () => void;
};

/**
 * Phone-native thing row: tap to open, swipe left to reveal Delete.
 */
export function SwipeableThingRow({ name, subtitle, icon, onPress, onDelete }: Props) {
  const { colors } = useTheme();
  return (
    <SwipeActions
      onDelete={onDelete}
      style={[styles.shell, { backgroundColor: colors.surface, borderColor: colors.line }]}
    >
      <Pressable
        onPress={() => {
          blurActiveElement();
          onPress();
        }}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: colors.surface },
          pressed && { opacity: 0.92 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={name}
      >
        <Icon3DBadge name={icon} size={36} />
        <View style={styles.copy}>
          <Text variant="headline" numberOfLines={1} style={styles.title}>
            {name}
          </Text>
          {subtitle ? (
            <Text variant="caption" numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </SwipeActions>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    minHeight: 56,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    lineHeight: 20,
  },
  subtitle: {
    marginTop: 2,
  },
});
