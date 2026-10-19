import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Text } from '@/components/ui/Text';
import { FormPill, FormRow } from '@/components/ui/FormKit';
import { fonts, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import { normalizeQuietHoursTime } from '@/lib/notificationPrefs';

const IS_NATIVE = Platform.OS === 'ios' || Platform.OS === 'android';

function hhmmToDate(hhmm: string): Date {
  const normalized = normalizeQuietHoursTime(hhmm, '22:00');
  const [h, m] = normalized.split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

function dateToHhmm(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function formatQuietHoursLabel(hhmm: string): string {
  const d = hhmmToDate(hhmm);
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Calendar-style row: label left, time pill right.
 * Tap opens the native iOS spinner (inline) or Android time dialog.
 */
export function TimePillRow({
  label = 'Time',
  value,
  onChange,
  last,
}: {
  label?: string;
  value: string;
  onChange: (hhmm: string) => void;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [iosOpen, setIosOpen] = useState(false);
  const [androidOpen, setAndroidOpen] = useState(false);
  const selected = hhmmToDate(value);
  const display = formatQuietHoursLabel(value);

  function onNativeChange(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') {
      setAndroidOpen(false);
      if (event.type === 'dismissed' || !date) return;
      onChange(dateToHhmm(date));
      return;
    }
    if (date) onChange(dateToHhmm(date));
  }

  function onPillPress() {
    if (!IS_NATIVE) {
      const d = hhmmToDate(value);
      d.setMinutes(d.getMinutes() + 15);
      onChange(dateToHhmm(d));
      return;
    }
    if (Platform.OS === 'ios') setIosOpen((v) => !v);
    else setAndroidOpen(true);
  }

  const expanded = Platform.OS === 'ios' && iosOpen;

  return (
    <View>
      <FormRow label={label} last={last && !expanded}>
        <FormPill label={display} active={expanded} onPress={onPillPress} />
      </FormRow>
      {expanded ? (
        <View style={styles.iosWrap}>
          <DateTimePicker
            value={selected}
            mode="time"
            display="spinner"
            minuteInterval={5}
            onChange={onNativeChange}
            style={styles.iosSpinner}
          />
        </View>
      ) : null}
      {androidOpen ? (
        <DateTimePicker
          value={selected}
          mode="time"
          display="default"
          minuteInterval={5}
          onChange={onNativeChange}
        />
      ) : null}
    </View>
  );
}

/** Native-style time control (iOS spinner / Android dialog). */
export function TimeField({
  label,
  value,
  onChange,
  last,
}: {
  label: string;
  value: string;
  onChange: (hhmm: string) => void;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [iosOpen, setIosOpen] = useState(false);
  const [androidOpen, setAndroidOpen] = useState(false);
  const selected = hhmmToDate(value);
  const display = formatQuietHoursLabel(value);

  function onNativeChange(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') {
      setAndroidOpen(false);
      if (event.type === 'dismissed' || !date) return;
      onChange(dateToHhmm(date));
      return;
    }
    if (date) onChange(dateToHhmm(date));
  }

  if (!IS_NATIVE) {
    return (
      <Pressable
        onPress={() => {
          const d = hhmmToDate(value);
          d.setMinutes(d.getMinutes() + 15);
          onChange(dateToHhmm(d));
        }}
        style={[styles.row, !last && styles.border]}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${display}`}
      >
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{display}</Text>
      </Pressable>
    );
  }

  if (Platform.OS === 'ios') {
    return (
      <View style={!last ? styles.border : undefined}>
        <Pressable
          onPress={() => setIosOpen((v) => !v)}
          style={styles.row}
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${display}`}
        >
          <Text style={styles.label}>{label}</Text>
          <Text style={[styles.value, { color: colors.accent }]}>{display}</Text>
        </Pressable>
        {iosOpen ? (
          <View style={styles.iosWrap}>
            <DateTimePicker
              value={selected}
              mode="time"
              display="spinner"
              minuteInterval={5}
              onChange={onNativeChange}
              style={styles.iosSpinner}
            />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={!last ? styles.border : undefined}>
      <Pressable
        onPress={() => setAndroidOpen(true)}
        style={styles.row}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${display}`}
      >
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, { color: colors.accent }]}>{display}</Text>
      </Pressable>
      {androidOpen ? (
        <DateTimePicker
          value={selected}
          mode="time"
          display="default"
          minuteInterval={5}
          onChange={onNativeChange}
        />
      ) : null}
    </View>
  );
}

function makeStyles(colors: {
  ink: string;
  mute: string;
  line: string;
  surface: string;
}) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
      gap: spacing.md,
    },
    border: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
    },
    label: {
      fontFamily: fonts.sansSemi,
      fontSize: 16,
      color: colors.ink,
      flexShrink: 0,
    },
    value: {
      fontFamily: fonts.sansMedium,
      fontSize: 16,
      color: colors.ink,
    },
    iosWrap: {
      paddingBottom: spacing.sm,
      backgroundColor: colors.surface,
    },
    iosSpinner: {
      alignSelf: 'stretch',
      height: 160,
    },
  });
}
