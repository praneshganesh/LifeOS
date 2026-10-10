import { type ReactNode, type ReactElement, useMemo, Children, cloneElement, isValidElement } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DotField, hubCardBg, type DotTone } from '@/components/ui/DotField';
import { Text } from '@/components/ui/Text';
import { SquarePen, Trash2 } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { fonts, radius, shadows, spacing, type ThemeColors } from '@/constants/theme';

/** Clearance so primary/remove actions sit above the floating Capture/Ask/Talk dock. */
export const DETAIL_DOCK_PAD = 120;

/** Bottom pad when a sticky action bar is present (dock usually hidden on details). */
export const DETAIL_STICKY_PAD = 28;

type FlushActionProps = {
  /** Edge-to-edge sticky bar — no radius, no gap, safe-area fill. */
  flush?: boolean;
  flushSafeBottom?: number;
};

export function detailTone(
  accent: string,
  light: boolean,
  vividFallback: string
): DotTone {
  return {
    bg: hubCardBg(accent, light, vividFallback),
    dot: light ? 'rgba(40,36,32,0.22)' : 'rgba(255,255,255,0.18)',
  };
}

/** Dotted identity card — title, optional meta, optional children (CTAs). */
export function DetailHero({
  eyebrow,
  title,
  subtitle,
  meta,
  accent,
  vividFallback,
  editableTitle,
  titleValue,
  onTitleChange,
  onTitleCommit,
  titlePlaceholder,
  onPress,
  compact,
  /** Sits on the title row (e.g. a highlight stat) — keeps the hero short. */
  trailing,
  children,
  style,
}: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  meta?: string;
  accent: string;
  vividFallback?: string;
  editableTitle?: boolean;
  titleValue?: string;
  onTitleChange?: (v: string) => void;
  onTitleCommit?: () => void;
  titlePlaceholder?: string;
  /** Whole hero tap — e.g. open Plan & billing from Profile. */
  onPress?: () => void;
  /** Less padding — profile identity card. */
  compact?: boolean;
  trailing?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tone = detailTone(accent, resolved === 'light', vividFallback ?? accent);

  const titleNode = editableTitle ? (
    <TextInput
      value={titleValue ?? ''}
      onChangeText={onTitleChange}
      onBlur={onTitleCommit}
      onSubmitEditing={onTitleCommit}
      returnKeyType="done"
      multiline={!trailing}
      numberOfLines={trailing ? 1 : undefined}
      style={[
        styles.heroTitle,
        compact && styles.heroTitleCompact,
        trailing ? styles.heroTitleBeside : null,
        { color: colors.ink, flex: trailing ? 1 : undefined },
      ]}
      placeholder={titlePlaceholder ?? 'Name'}
      placeholderTextColor={colors.faint}
      accessibilityLabel="Name"
    />
  ) : title ? (
    <Text
      style={[
        styles.heroTitle,
        trailing ? styles.heroTitleBeside : null,
        { color: colors.ink, flex: trailing ? 1 : undefined },
      ]}
      numberOfLines={trailing ? 1 : 2}
    >
      {title}
    </Text>
  ) : null;

  const body = (
    <>
      <DotField tone={tone} />
      <View style={[styles.heroFill, compact && styles.heroFillCompact]}>
        {eyebrow ? (
          <Text style={[styles.eyebrow, { color: colors.mute }]} numberOfLines={1}>
            {eyebrow}
          </Text>
        ) : null}
        {trailing ? (
          <View style={styles.heroTitleRow}>
            {titleNode}
            {trailing}
          </View>
        ) : (
          titleNode
        )}
        {subtitle ? (
          <Text style={[styles.heroSub, { color: colors.mute }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text style={[styles.heroMeta, { color: colors.mute }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {children}
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.hero,
          compact && styles.heroCompact,
          style,
          pressed && { opacity: 0.92 },
        ]}
      >
        {body}
      </Pressable>
    );
  }

  return <View style={[styles.hero, compact && styles.heroCompact, style]}>{body}</View>;
}

export function DetailSection({
  label,
  children,
  style,
}: {
  label?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.section, style]}>
      {label ? (
        <Text style={[styles.sectionLabel, { color: colors.ink }]}>{label}</Text>
      ) : null}
      {children}
    </View>
  );
}

/** 16px field — bordered soft fill (avoids iOS Safari zoom on focus). */
export function DetailField(props: TextInputProps & { soft?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { style, soft = true, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={colors.faint}
      selectTextOnFocus
      {...rest}
      style={[
        styles.field,
        {
          backgroundColor: soft ? colors.surfaceSoft : colors.surface,
          borderColor: colors.lineStrong,
          color: colors.ink,
        },
        style,
      ]}
    />
  );
}

export function DetailChip({
  label,
  selected,
  onPress,
  disabled,
  fill,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accent: string;
  disabled?: boolean;
  /** Equal-share cell in a single-line row (e.g. Mon–Sun). */
  fill?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [
        styles.chip,
        fill && styles.chipFill,
        {
          backgroundColor: selected ? colors.accent : colors.surface,
          borderColor: selected ? colors.accent : colors.lineStrong,
          opacity: disabled ? 0.45 : pressed ? 0.9 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected), disabled: Boolean(disabled) }}
    >
      <Text
        style={[
          styles.chipText,
          fill && styles.chipTextFill,
          { color: selected ? colors.accentOn : colors.ink },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function DetailChipRow({
  children,
  equal,
}: {
  children: ReactNode;
  /** Single row, equal-width chips (no wrap). */
  equal?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const items = Children.toArray(children);
  return (
    <View style={[styles.chipRow, equal && styles.chipRowEqual]}>
      {equal
        ? items.map((child, i) =>
            isValidElement(child)
              ? cloneElement(child as ReactElement<{ fill?: boolean }>, {
                  key: child.key ?? i,
                  fill: true,
                })
              : child
          )
        : children}
    </View>
  );
}

export function DetailFact({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View
      style={[
        styles.fact,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
      ]}
    >
      <Text style={[styles.factLabel, { color: colors.mute }]}>{label}</Text>
      <Text style={[styles.factValue, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

export function DetailFacts({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.facts, { backgroundColor: colors.surfaceSoft }]}>
      {children}
    </View>
  );
}

export function DetailPrimaryButton({
  label,
  onPress,
  disabled,
  style,
  flush,
  flushSafeBottom = 0,
}: {
  label: string;
  onPress: () => void;
  /** Ignored. Primary actions always use the theme accent. */
  accent?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
} & FlushActionProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const fill = colors.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primary,
        flush && styles.primaryFlush,
        flush && { paddingBottom: Math.max(flushSafeBottom, 12) },
        { backgroundColor: fill, opacity: disabled ? 0.45 : pressed ? 0.9 : 1 },
        !flush && pressed && !disabled && { transform: [{ scale: 0.985 }] },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.primaryText, { color: colors.accentOn }]}>{label}</Text>
    </Pressable>
  );
}

/** Top-chrome edit — solid accent circle with light icon (reads as a real control). */
export function DetailEditButton({
  onPress,
}: {
  onPress: () => void;
  /** Ignored. Edit chrome uses the theme accent. */
  accent?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.editBtn,
        {
          backgroundColor: colors.accent,
          opacity: pressed ? 0.88 : 1,
        },
        pressed && { transform: [{ scale: 0.96 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Edit"
      hitSlop={8}
    >
      <SquarePen size={18} color={colors.accentOn} strokeWidth={2.25} />
    </Pressable>
  );
}

/** Top-chrome delete — bare icon, no fill (secondary to sticky primary). */
export function DetailTrashButton({
  onPress,
  disabled,
}: {
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.trashBtn,
        {
          opacity: disabled ? 0.4 : pressed ? 0.55 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Remove"
      hitSlop={12}
    >
      <Trash2 size={20} color={colors.mute} strokeWidth={2} />
    </Pressable>
  );
}

/** Soft outlined full-width action — rare; prefer DetailEditButton in chrome. */
export function DetailSecondaryButton({
  label,
  onPress,
  accent,
  disabled,
  flush,
  flushSafeBottom = 0,
}: {
  label: string;
  onPress: () => void;
  accent: string;
  disabled?: boolean;
} & FlushActionProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.secondary,
        flush && styles.secondaryFlush,
        flush && { paddingBottom: Math.max(flushSafeBottom, 12) },
        {
          backgroundColor: colors.surfaceSoft,
          borderColor: accent,
          opacity: disabled ? 0.45 : pressed ? 0.88 : 1,
        },
        !flush && pressed && !disabled && { transform: [{ scale: 0.985 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.secondaryText, { color: accent }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Destructive action — always labeled "Remove" unless overridden.
 * Soft coral pill (not plain text).
 */
export function DetailRemoveButton({
  label = 'Remove',
  onPress,
  disabled,
  style,
  flush,
  flushSafeBottom = 0,
}: {
  label?: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
} & FlushActionProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.removeBtn,
        flush && styles.removeFlush,
        flush && { paddingBottom: Math.max(flushSafeBottom, 12) },
        {
          backgroundColor: colors.coralSoft,
          opacity: disabled ? 0.45 : pressed ? 0.88 : 1,
        },
        !flush && pressed && !disabled && { transform: [{ scale: 0.985 }] },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.removeBtnText, { color: colors.coral }]}>{label}</Text>
    </Pressable>
  );
}

/** @deprecated Use DetailRemoveButton — kept so older imports keep working. */
export function DetailRemoveLink(props: {
  label?: string;
  onPress: () => void;
}) {
  return <DetailRemoveButton {...props} />;
}

/**
 * Sticky bottom action bar — flush edge-to-edge.
 * One button spans full width; two sit 50/50 with no gap.
 * Pair with ModuleScreen `footer` or place as a sibling under ScrollView.
 */
export function DetailStickyActions({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={stickyStyles.row}>
      {items.map((child, i) => (
        <View key={i} style={stickyStyles.cell}>
          {isValidElement(child)
            ? cloneElement(child as ReactElement<FlushActionProps>, {
                flush: true,
                flushSafeBottom: insets.bottom,
              })
            : child}
        </View>
      ))}
    </View>
  );
}

const stickyStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
  },
  cell: {
    flex: 1,
  },
});

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    hero: {
      borderRadius: radius.md,
      overflow: 'hidden',
      marginBottom: spacing.md,
      minHeight: 0,
      ...shadows.soft,
    },
    heroCompact: {
      minHeight: 0,
      marginBottom: spacing.sm,
    },
    heroFill: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      gap: 2,
    },
    heroFillCompact: {
      paddingHorizontal: spacing.md,
      paddingTop: 10,
      paddingBottom: 10,
      gap: 2,
    },
    eyebrow: {
      fontFamily: fonts.sansMedium,
      fontSize: 13,
      letterSpacing: 0.2,
      marginBottom: 0,
    },
    heroTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minWidth: 0,
    },
    heroTitle: {
      fontFamily: fonts.sansSemi,
      fontSize: 24,
      lineHeight: 30,
      letterSpacing: -0.5,
      padding: 0,
      margin: 0,
      backgroundColor: 'transparent',
    },
    heroTitleBeside: {
      fontSize: 22,
      lineHeight: 28,
      height: 32,
      maxHeight: 32,
      paddingTop: 0,
      paddingBottom: 0,
      minWidth: 0,
    },
    heroTitleCompact: {
      fontSize: 22,
      lineHeight: 26,
      height: 28,
    },
    heroSub: {
      fontFamily: fonts.sans,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 2,
    },
    heroMeta: {
      fontFamily: fonts.sansMedium,
      fontSize: 13,
      letterSpacing: -0.1,
      marginTop: 2,
    },
    section: {
      marginBottom: spacing.xl,
      gap: spacing.sm,
    },
    sectionLabel: {
      fontFamily: fonts.sansSemi,
      fontSize: 15,
      letterSpacing: -0.2,
    },
    field: {
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
      fontFamily: fonts.sans,
      fontSize: 16,
      lineHeight: 22,
      borderWidth: 1.5,
      borderColor: colors.lineStrong,
      backgroundColor: colors.surfaceSoft,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chipRowEqual: {
      flexWrap: 'nowrap',
      gap: 6,
      width: '100%',
    },
    chip: {
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1.5,
      maxWidth: '100%',
      minHeight: 40,
      justifyContent: 'center',
    },
    chipFill: {
      flex: 1,
      minWidth: 0,
      paddingHorizontal: 2,
      alignItems: 'center',
    },
    chipText: {
      fontFamily: fonts.sansSemi,
      fontSize: 15,
      letterSpacing: -0.2,
    },
    chipTextFill: {
      fontSize: 13,
      letterSpacing: -0.3,
    },
    facts: {
      borderRadius: radius.md,
      overflow: 'hidden',
      marginBottom: spacing.md,
      borderWidth: 1.5,
      borderColor: colors.lineStrong,
      backgroundColor: colors.surface,
    },
    fact: {
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
      gap: 4,
    },
    factLabel: {
      fontFamily: fonts.sansMedium,
      fontSize: 12,
      letterSpacing: 0.2,
      textTransform: 'uppercase',
    },
    factValue: {
      fontFamily: fonts.sansMedium,
      fontSize: 16,
      letterSpacing: -0.2,
    },
    primary: {
      marginTop: 0,
      height: 52,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryFlush: {
      height: undefined,
      minHeight: 56,
      borderRadius: 0,
      borderTopLeftRadius: radius.md,
      borderTopRightRadius: radius.md,
      paddingTop: 18,
      width: '100%',
    },
    primaryText: {
      fontFamily: fonts.sansSemi,
      fontSize: 16,
      letterSpacing: -0.2,
    },
    editBtn: {
      width: 42,
      height: 42,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.soft,
    },
    trashBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondary: {
      marginTop: 0,
      height: 52,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
    },
    secondaryFlush: {
      height: undefined,
      minHeight: 56,
      borderRadius: 0,
      borderWidth: 0,
      paddingTop: 18,
      width: '100%',
    },
    secondaryText: {
      fontFamily: fonts.sansSemi,
      fontSize: 16,
      letterSpacing: -0.2,
    },
    removeBtn: {
      marginTop: 0,
      height: 52,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeFlush: {
      height: undefined,
      minHeight: 56,
      borderRadius: 0,
      paddingTop: 18,
      width: '100%',
    },
    removeBtnText: {
      fontFamily: fonts.sansSemi,
      fontSize: 16,
      letterSpacing: -0.2,
    },
  });
}
