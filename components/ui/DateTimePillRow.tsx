import { useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { DateField } from '@/components/ui/DateField';
import { FormPill, FormRow } from '@/components/ui/FormKit';
import { formatQuietHoursLabel } from '@/components/ui/TimeField';
import { parseDateInput, toDateInputValue } from '@/lib/lastDone';
import { normalizeQuietHoursTime } from '@/lib/notificationPrefs';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

const IS_NATIVE = Platform.OS === 'ios' || Platform.OS === 'android';

function toDate(value: string): Date {
  return parseDateInput(value) ?? new Date();
}

function formatDatePill(value: string): string {
  const d = toDate(value || toDateInputValue(new Date()));
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function hhmmToDate(hhmm: string): Date {
  const normalized = normalizeQuietHoursTime(hhmm, '09:00');
  const [h, m] = normalized.split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

function dateToHhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Calendar-style Starts/Ends row: label + date pill + time pill side by side.
 * Only one picker expands at a time.
 */
export function DateTimePillRow({
  label,
  date,
  onDateChange,
  time,
  onTimeChange,
  last,
  maximumDate,
  minimumDate,
}: {
  label: string;
  date: string;
  onDateChange: (yyyyMmDd: string) => void;
  time: string;
  onTimeChange: (hhmm: string) => void;
  last?: boolean;
  maximumDate?: Date;
  minimumDate?: Date;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const selectedTime = hhmmToDate(time);
  const expanded = dateOpen || (Platform.OS === 'ios' && timeOpen);

  function onTimeNative(event: DateTimePickerEvent, next?: Date) {
    if (Platform.OS === 'android') {
      setTimeOpen(false);
      if (event.type === 'dismissed' || !next) return;
      onTimeChange(dateToHhmm(next));
      return;
    }
    if (next) onTimeChange(dateToHhmm(next));
  }

  function toggleDate() {
    setTimeOpen(false);
    setDateOpen((v) => !v);
  }

  function toggleTime() {
    setDateOpen(false);
    if (!IS_NATIVE) {
      const d = hhmmToDate(time);
      d.setMinutes(d.getMinutes() + 15);
      onTimeChange(dateToHhmm(d));
      return;
    }
    if (Platform.OS === 'ios') setTimeOpen((v) => !v);
    else setTimeOpen(true);
  }

  return (
    <View>
      <FormRow label={label} last={last && !expanded}>
        <FormPill
          label={formatDatePill(date)}
          active={dateOpen}
          onPress={toggleDate}
        />
        <FormPill
          label={formatQuietHoursLabel(time)}
          active={Platform.OS === 'ios' && timeOpen}
          onPress={toggleTime}
        />
      </FormRow>
      {dateOpen ? (
        <DateField
          value={date}
          onChange={(v) => {
            onDateChange(v);
            if (Platform.OS === 'android') setDateOpen(false);
          }}
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          embedded
        />
      ) : null}
      {Platform.OS === 'ios' && timeOpen ? (
        <View style={styles.iosWrap}>
          <DateTimePicker
            value={selectedTime}
            mode="time"
            display="spinner"
            minuteInterval={5}
            onChange={onTimeNative}
            style={styles.iosSpinner}
          />
        </View>
      ) : null}
      {Platform.OS === 'android' && timeOpen ? (
        <DateTimePicker
          value={selectedTime}
          mode="time"
          display="default"
          minuteInterval={5}
          onChange={onTimeNative}
        />
      ) : null}
    </View>
  );
}

function makeStyles(colors: { surface: string }) {
  return StyleSheet.create({
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
