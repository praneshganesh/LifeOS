import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppIcon, type Icon3DName } from '@/components/ui/Icon3D';
import { fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

export function ListCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function ListRow({
  icon,
  title,
  subtitle,
  meta,
  onPress,
  onDismiss,
  last,
  tone,
}: {
  icon?: Icon3DName;
  title: string;
  subtitle?: string;
  meta?: string;
  onPress?: () => void;
  /** Show an X that snoozes/hides the row without opening it. */
  onDismiss?: () => void;
  last?: boolean;
  tone?: string;
}) {
  const { colors } = useTheme();
  const Comp = onPress ? Pressable : View;
  return (
    <Comp
      onPress={onPress}
      style={[
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
      ]}
    >
      {tone ? <View style={[styles.dot, { backgroundColor: tone }]} /> : null}
      {icon ? <AppIcon name={icon} size={36} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="headline" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" numberOfLines={2} style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {meta ? (
        <Text style={[styles.meta, { color: colors.mute }]} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
      {onPress && !onDismiss ? (
        <ChevronRight size={16} color={colors.faint} strokeWidth={1.8} />
      ) : null}
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          hitSlop={10}
          accessibilityLabel={`Dismiss ${title}`}
          style={({ pressed }) => [
            styles.dismissBtn,
            { backgroundColor: colors.surfaceSoft },
            pressed && { opacity: 0.7 },
          ]}
        >
          <X size={14} color={colors.mute} strokeWidth={2.2} />
        </Pressable>
      ) : null}
    </Comp>
  );
}

export function StatStrip({
  items,
}: {
  items: { label: string; value: string }[];
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.stats,
        { backgroundColor: colors.surface, borderColor: colors.line },
      ]}
    >
      {items.map((item, i) => (
        <View
          key={item.label}
          style={[
            styles.stat,
            i < items.length - 1 && {
              borderRightWidth: StyleSheet.hairlineWidth,
              borderRightColor: colors.line,
            },
          ]}
        >
          <Text style={[styles.statValue, { color: colors.ink }]}>{item.value}</Text>
          <Text variant="caption" style={{ marginTop: 2 }}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function FilterChips({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.chips}>
      {options.map((opt) => {
        const on = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[
              styles.chip,
              {
                backgroundColor: on ? colors.accent : colors.surface,
                borderColor: on ? colors.accent : colors.line,
              },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                { color: on ? colors.accentOn : colors.slate },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  dot: {
    width: 4,
    height: 28,
    borderRadius: 2,
  },
  title: {
    fontSize: 16,
    lineHeight: 20,
  },
  meta: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    maxWidth: 150,
    textAlign: 'right',
    flexShrink: 0,
  },
  dismissBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.lg,
  },
  stat: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: fonts.sansSemi,
    fontSize: 18,
    letterSpacing: -0.3,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
});
