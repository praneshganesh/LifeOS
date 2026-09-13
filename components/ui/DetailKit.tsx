import { type ReactNode, useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { DotField, hubCardBg, type DotTone } from '@/components/ui/DotField';
import { Text } from '@/components/ui/Text';
import { SquarePen } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { fonts, radius, shadows, spacing, type ThemeColors } from '@/constants/theme';

/** Clearance so primary/remove actions sit above the floating Capture/Ask/Talk dock. */
export const DETAIL_DOCK_PAD = 120;

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
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tone = detailTone(accent, resolved === 'light', vividFallback ?? accent);

  return (
    <View style={[styles.hero, { borderColor: colors.line }, style]}>
      <DotField tone={tone} />
      <View style={styles.heroFill}>
        {eyebrow ? (
          <Text style={[styles.eyebrow, { color: accent }]}>{eyebrow}</Text>
        ) : null}
        {editableTitle ? (
          <TextInput
            value={titleValue ?? ''}
            onChangeText={onTitleChange}
            onBlur={onTitleCommit}
            onSubmitEditing={onTitleCommit}
            returnKeyType="done"
            multiline
            style={[styles.heroTitle, { color: colors.ink }]}
            placeholder={titlePlaceholder ?? 'Name'}
            placeholderTextColor={colors.faint}
            accessibilityLabel="Name"
          />
        ) : title ? (
          <Text style={[styles.heroTitle, { color: colors.ink }]}>{title}</Text>
        ) : null}
        {subtitle ? (
          <Text style={[styles.heroSub, { color: colors.slate }]}>{subtitle}</Text>
        ) : null}
        {meta ? (
          <Text style={[styles.heroMeta, { color: accent }]}>{meta}</Text>
        ) : null}
        {children}
      </View>
    </View>
  );
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
        <Text style={[styles.sectionLabel, { color: colors.mute }]}>{label}</Text>
      ) : null}
      {children}
    </View>
  );
}

/** Soft 16px field — avoids iOS Safari zoom on focus. */
export function DetailField(props: TextInputProps & { soft?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { style, soft = true, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={colors.faint}
      {...rest}
      style={[
        styles.field,
        soft && { backgroundColor: colors.surfaceSoft, borderColor: 'transparent' },
        { color: colors.ink },
        style,
      ]}
    />
  );
}

export function DetailChip({
  label,
  selected,
  onPress,
  accent,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accent: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? accent : colors.surface,
          borderColor: selected ? accent : colors.lineStrong,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
    >
      <Text
        style={[
          styles.chipText,
          { color: selected ? colors.pure : colors.ink },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function DetailChipRow({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <View style={styles.chipRow}>{children}</View>;
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
  accent,
  disabled,
}: {
  label: string;
  onPress: () => void;
  accent: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: accent, opacity: disabled ? 0.45 : pressed ? 0.9 : 1 },
        pressed && !disabled && { transform: [{ scale: 0.985 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.primaryText, { color: colors.pure }]}>{label}</Text>
    </Pressable>
  );
}

/** Top-chrome edit — solid accent circle with light icon (reads as a real control). */
export function DetailEditButton({
  onPress,
  accent,
}: {
  onPress: () => void;
  accent: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.editBtn,
        {
          backgroundColor: accent,
          opacity: pressed ? 0.88 : 1,
        },
        pressed && { transform: [{ scale: 0.96 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Edit"
      hitSlop={8}
    >
      <SquarePen size={18} color={colors.pure} strokeWidth={2.25} />
    </Pressable>
  );
}

/** Soft outlined full-width action — rare; prefer DetailEditButton in chrome. */
export function DetailSecondaryButton({
  label,
  onPress,
  accent,
  disabled,
}: {
  label: string;
  onPress: () => void;
  accent: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.secondary,
        {
          backgroundColor: colors.surfaceSoft,
          borderColor: accent,
          opacity: disabled ? 0.45 : pressed ? 0.88 : 1,
        },
        pressed && !disabled && { transform: [{ scale: 0.985 }] },
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
}: {
  label?: string;
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
        styles.removeBtn,
        {
          backgroundColor: colors.coralSoft,
          opacity: disabled ? 0.45 : pressed ? 0.88 : 1,
        },
        pressed && !disabled && { transform: [{ scale: 0.985 }] },
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

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    hero: {
      borderRadius: radius.lg,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: spacing.md,
      minHeight: 140,
      ...shadows.soft,
    },
    heroFill: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.lg + 4,
      gap: 6,
    },
    eyebrow: {
      fontFamily: fonts.sansMedium,
      fontSize: 13,
      letterSpacing: 0.2,
      marginBottom: 2,
    },
    heroTitle: {
      fontFamily: fonts.sansSemi,
      fontSize: 26,
      lineHeight: 32,
      letterSpacing: -0.6,
      padding: 0,
      margin: 0,
      backgroundColor: 'transparent',
    },
    heroSub: {
      fontFamily: fonts.sans,
      fontSize: 15,
      lineHeight: 21,
      marginTop: 4,
    },
    heroMeta: {
      fontFamily: fonts.sansMedium,
      fontSize: 13,
      letterSpacing: -0.1,
    },
    section: {
      marginBottom: spacing.lg,
      gap: 10,
    },
    sectionLabel: {
      fontFamily: fonts.sansMedium,
      fontSize: 13,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    field: {
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
      fontFamily: fonts.sans,
      fontSize: 16,
      lineHeight: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
      backgroundColor: colors.surface,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      borderRadius: radius.full,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1.5,
      maxWidth: '100%',
    },
    chipText: {
      fontFamily: fonts.sansMedium,
      fontSize: 14,
      letterSpacing: -0.2,
    },
    facts: {
      borderRadius: radius.md,
      overflow: 'hidden',
      marginBottom: spacing.md,
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
      marginTop: spacing.sm,
      height: 52,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryText: {
      fontFamily: fonts.sansSemi,
      fontSize: 16,
      letterSpacing: -0.2,
    },
    editBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.soft,
    },
    secondary: {
      marginTop: spacing.sm,
      height: 52,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
    },
    secondaryText: {
      fontFamily: fonts.sansSemi,
      fontSize: 16,
      letterSpacing: -0.2,
    },
    removeBtn: {
      marginTop: spacing.sm,
      height: 52,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeBtnText: {
      fontFamily: fonts.sansSemi,
      fontSize: 16,
      letterSpacing: -0.2,
    },
  });
}
