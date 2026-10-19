import { type ReactNode, useMemo, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

/** Inset grouped card, Calendar-style, no outer stroke. */
export function FormGroup({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.group,
        { backgroundColor: colors.surface },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Label left, trailing control(s) right. */
export function FormRow({
  label,
  children,
  last,
  onPress,
}: {
  label: string;
  children?: ReactNode;
  last?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const Comp = onPress ? Pressable : View;
  return (
    <Comp
      onPress={onPress}
      style={[
        styles.row,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.line,
        },
      ]}
    >
      <Text style={[styles.rowLabel, { color: colors.ink }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.rowTrailing}>{children}</View>
    </Comp>
  );
}

/** Borderless text/number field inside a FormGroup. */
export function FormInputRow({
  label,
  last,
  ...inputProps
}: {
  label?: string;
  last?: boolean;
} & TextInputProps) {
  const { colors } = useTheme();
  const { style, ...rest } = inputProps;
  const inputRef = useRef<TextInput>(null);

  return (
    <View
      style={[
        styles.inputRow,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.line,
        },
      ]}
    >
      {label ? (
        <Pressable
          onPress={() => inputRef.current?.focus()}
          style={styles.inputLabelHit}
          hitSlop={6}
        >
          <Text
            style={[styles.rowLabel, styles.inputLabel, { color: colors.ink }]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </Pressable>
      ) : null}
      <TextInput
        ref={inputRef}
        placeholderTextColor={colors.faint}
        selectTextOnFocus
        {...rest}
        style={[
          styles.input,
          label ? styles.inputTrailing : styles.inputSolo,
          { color: colors.ink },
          style,
        ]}
      />
    </View>
  );
}

/** Soft tappable pill, date/time values (Calendar-style). */
export function FormPill({
  label,
  onPress,
  active,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  const { colors } = useTheme();
  const stylesMemo = useMemo(
    () =>
      StyleSheet.create({
        pill: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: radius.md,
          minHeight: 32,
          justifyContent: 'center',
          alignItems: 'center',
          flexShrink: 0,
        },
        text: {
          fontFamily: fonts.sansSemi,
          fontSize: 15,
          letterSpacing: -0.2,
        },
      }),
    []
  );
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        stylesMemo.pill,
        {
          backgroundColor: active ? colors.accentWash : colors.surfaceSoft,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active) }}
    >
      <Text
        style={[
          stylesMemo.text,
          { color: active ? colors.accent : colors.ink },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function FormCaption({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.caption, { color: colors.mute }]}>{children}</Text>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: 48,
  },
  rowLabel: {
    fontFamily: fonts.sans,
    fontSize: 16,
    letterSpacing: -0.2,
    flexShrink: 1,
    marginRight: 8,
  },
  inputLabel: {
    flexShrink: 1,
    maxWidth: '100%',
  },
  inputLabelHit: {
    flexShrink: 1,
    flexGrow: 0,
    maxWidth: '55%',
    marginRight: 8,
    justifyContent: 'center',
  },
  rowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'nowrap',
    gap: 6,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  input: {
    fontFamily: fonts.sans,
    fontSize: 16,
    letterSpacing: -0.2,
    paddingVertical: 14,
    // Avoid iOS zoom + keep a real tap target beside long labels.
    minWidth: 88,
    minHeight: 44,
  },
  inputSolo: {
    flex: 1,
  },
  inputTrailing: {
    flex: 1,
    textAlign: 'right',
    fontFamily: fonts.sansMedium,
  },
  caption: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
});
