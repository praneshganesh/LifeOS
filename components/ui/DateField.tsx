import { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { parseDateInput, toDateInputValue } from '@/lib/lastDone';
import { fonts, radius, shadows, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
const IS_NATIVE = Platform.OS === 'ios' || Platform.OS === 'android';

function toDate(value: string): Date {
  return parseDateInput(value) ?? new Date();
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Bound dates to calendar-day edges so time-of-day doesn't grey out today / tomorrow. */
function boundMinimum(d?: Date) {
  return d ? startOfDay(d) : undefined;
}

function boundMaximum(d?: Date) {
  return d ? endOfDay(d) : undefined;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDisplay(value: string): string {
  const d = toDate(value || toDateInputValue(new Date()));
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function monthTitle(d: Date) {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** Monday-first grid cells for a month (null = empty pad). */
function buildMonthGrid(view: Date): (Date | null)[] {
  const year = view.getFullYear();
  const month = view.getMonth();
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function isDisabled(day: Date, min?: Date, max?: Date) {
  const t = startOfDay(day).getTime();
  if (min && t < startOfDay(min).getTime()) return true;
  if (max && t > startOfDay(max).getTime()) return true;
  return false;
}

type Props = {
  value: string;
  onChange: (yyyyMmDd: string) => void;
  maximumDate?: Date;
  minimumDate?: Date;
  style?: StyleProp<ViewStyle>;
  /** Start with the calendar open (e.g. inside an already-expanded sheet). */
  defaultOpen?: boolean;
  /**
   * Calendar-only mode for sheets that already have a date chip.
   * Hides the summary row and stays open after picking a day.
   */
  embedded?: boolean;
};

function NativeDatePicker({
  value,
  onChange,
  maximumDate,
  minimumDate,
  embedded,
}: {
  value: string;
  onChange: (yyyyMmDd: string) => void;
  maximumDate?: Date;
  minimumDate?: Date;
  embedded: boolean;
}) {
  const { colors } = useTheme();
  const resolved = value || toDateInputValue(new Date());
  const selected = toDate(resolved);
  const [androidOpen, setAndroidOpen] = useState(embedded);
  const [iosExpanded, setIosExpanded] = useState(embedded);

  const minBound = boundMinimum(minimumDate);
  const maxBound = boundMaximum(maximumDate);

  function onNativeChange(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') {
      setAndroidOpen(false);
      if (event.type !== 'set' || !date) return;
    }
    if (!date) return;
    onChange(toDateInputValue(date));
  }

  if (Platform.OS === 'ios') {
    // Embedded sheet: full inline calendar. Form fields: compact chip + expand.
    if (embedded || iosExpanded) {
      return (
        <View
          style={[
            styles.nativeWrap,
            { backgroundColor: colors.surface, borderColor: colors.line },
          ]}
        >
          {!embedded ? (
            <Pressable
              onPress={() => setIosExpanded(false)}
              hitSlop={8}
              style={styles.nativeCloseRow}
            >
              <Text style={[styles.changeHint, { color: colors.accent }]}>Done</Text>
            </Pressable>
          ) : null}
          <DateTimePicker
            value={selected}
            mode="date"
            display="inline"
            onChange={onNativeChange}
            maximumDate={maxBound}
            minimumDate={minBound}
            style={styles.iosInline}
          />
        </View>
      );
    }

    return (
      <Pressable
        onPress={() => setIosExpanded(true)}
        style={({ pressed }) => [
          styles.field,
          {
            backgroundColor: colors.surface,
            borderColor: colors.lineStrong,
          },
          pressed && { opacity: 0.92 },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>
          <Calendar size={16} color={colors.accent} strokeWidth={2.2} />
        </View>
        <Text style={[styles.fieldText, { color: colors.ink }]} numberOfLines={1}>
          {formatDisplay(resolved)}
        </Text>
        <Text style={[styles.changeHint, { color: colors.accent }]}>Change</Text>
      </Pressable>
    );
  }

  // Android: system dialog
  return (
    <View>
      <Pressable
        onPress={() => setAndroidOpen(true)}
        style={({ pressed }) => [
          styles.field,
          {
            backgroundColor: colors.surface,
            borderColor: colors.lineStrong,
          },
          pressed && { opacity: 0.92 },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>
          <Calendar size={16} color={colors.accent} strokeWidth={2.2} />
        </View>
        <Text style={[styles.fieldText, { color: colors.ink }]} numberOfLines={1}>
          {formatDisplay(resolved)}
        </Text>
        <Text style={[styles.changeHint, { color: colors.accent }]}>Change</Text>
      </Pressable>
      {androidOpen ? (
        <DateTimePicker
          value={selected}
          mode="date"
          display="default"
          onChange={onNativeChange}
          maximumDate={maxBound}
          minimumDate={minBound}
        />
      ) : null}
    </View>
  );
}

/** Custom grid — web only. Native uses the system picker above. */
function WebDatePicker({
  value,
  onChange,
  maximumDate,
  minimumDate,
  defaultOpen,
  embedded,
  style,
}: Props) {
  const { colors } = useTheme();
  const resolved = value || toDateInputValue(new Date());
  const selected = toDate(resolved);
  const today = startOfDay(new Date());

  const [open, setOpen] = useState(defaultOpen || embedded);
  const [view, setView] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1)
  );
  const [gridW, setGridW] = useState(0);

  const cells = useMemo(() => buildMonthGrid(view), [view]);
  const cellSize = gridW > 0 ? Math.floor(gridW / 7) : 0;

  function selectDay(day: Date) {
    if (isDisabled(day, minimumDate, maximumDate)) return;
    onChange(toDateInputValue(day));
    if (!embedded) setOpen(false);
  }

  function goMonth(delta: number) {
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));
  }

  function jumpToday() {
    if (isDisabled(today, minimumDate, maximumDate)) return;
    setView(new Date(today.getFullYear(), today.getMonth(), 1));
    onChange(toDateInputValue(today));
    if (!embedded) setOpen(false);
  }

  return (
    <View style={style}>
      {embedded ? null : (
        <Pressable
          onPress={() => {
            setOpen((o) => {
              if (!o) {
                setView(new Date(selected.getFullYear(), selected.getMonth(), 1));
              }
              return !o;
            });
          }}
          style={({ pressed }) => [
            styles.field,
            {
              backgroundColor: colors.surface,
              borderColor: colors.lineStrong,
            },
            open && {
              borderColor: colors.accentStrong,
              backgroundColor: colors.accentWash,
            },
            pressed && { opacity: 0.92 },
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>
            <Calendar size={16} color={colors.accent} strokeWidth={2.2} />
          </View>
          <Text style={[styles.fieldText, { color: colors.ink }]} numberOfLines={1}>
            {formatDisplay(resolved)}
          </Text>
          <Text style={[styles.changeHint, { color: colors.accent }]}>
            {open ? 'Close' : 'Change'}
          </Text>
        </Pressable>
      )}

      {open ? (
        <View
          style={[
            styles.panel,
            embedded && styles.panelEmbedded,
            { backgroundColor: colors.surface, borderColor: colors.line },
          ]}
        >
          <View style={styles.monthBar}>
            <Pressable
              onPress={() => goMonth(-1)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              style={({ pressed }) => [
                styles.navBtn,
                { backgroundColor: colors.surfaceSoft },
                pressed && { backgroundColor: colors.surfaceHover },
              ]}
            >
              <ChevronLeft size={18} color={colors.ink} strokeWidth={2} />
            </Pressable>
            <Text style={[styles.monthTitle, { color: colors.ink }]}>{monthTitle(view)}</Text>
            <Pressable
              onPress={() => goMonth(1)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Next month"
              style={({ pressed }) => [
                styles.navBtn,
                { backgroundColor: colors.surfaceSoft },
                pressed && { backgroundColor: colors.surfaceHover },
              ]}
            >
              <ChevronRight size={18} color={colors.ink} strokeWidth={2} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((d) => (
              <Text key={d} style={[styles.weekday, { color: colors.mute }]}>
                {d}
              </Text>
            ))}
          </View>

          <View
            style={styles.grid}
            onLayout={(e) => {
              const w = Math.floor(e.nativeEvent.layout.width);
              if (w > 0 && w !== gridW) setGridW(w);
            }}
          >
            {cells.map((day, i) => {
              if (!day) {
                return (
                  <View
                    key={`e-${i}`}
                    style={cellSize > 0 ? { width: cellSize, height: cellSize } : styles.dayCellFallback}
                  />
                );
              }
              const disabled = isDisabled(day, minimumDate, maximumDate);
              const isSelected = sameDay(day, selected);
              const isToday = sameDay(day, today);
              return (
                <Pressable
                  key={toDateInputValue(day)}
                  disabled={disabled}
                  onPress={() => selectDay(day)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled, selected: isSelected }}
                  accessibilityLabel={toDateInputValue(day)}
                  style={({ pressed }) => [
                    cellSize > 0
                      ? { width: cellSize, height: cellSize }
                      : styles.dayCellFallback,
                    styles.dayCellInner,
                    isSelected && { backgroundColor: colors.accent },
                    !isSelected && isToday && { borderWidth: 1, borderColor: colors.accentSoft },
                    pressed && !disabled && !isSelected && { backgroundColor: colors.accentWash },
                  ]}
                >
                  <Text
                    pointerEvents="none"
                    style={[
                      styles.dayText,
                      { color: colors.ink },
                      disabled && { color: colors.faint },
                      isSelected && { color: colors.accentOn },
                      !isSelected && isToday && { color: colors.accent },
                    ]}
                  >
                    {day.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.footer, { borderTopColor: colors.line }]}>
            <Pressable onPress={jumpToday} hitSlop={6}>
              <Text style={[styles.footerLink, { color: colors.accent }]}>Today</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** App-styled date field — native system picker on iOS/Android, custom grid on web. */
export function DateField(props: Props) {
  if (IS_NATIVE) {
    return (
      <View style={props.style}>
        <NativeDatePicker
          value={props.value}
          onChange={props.onChange}
          maximumDate={props.maximumDate}
          minimumDate={props.minimumDate}
          embedded={Boolean(props.embedded || props.defaultOpen)}
        />
      </View>
    );
  }
  return <WebDatePicker {...props} />;
}

type OptionalProps = Props & {
  /** Shown on the add-affordance when no date is set. */
  addLabel?: string;
};

/**
 * DateField for optional dates: renders an "Add date" affordance when empty
 * and a "Clear" link when set, so junk free-text dates are impossible and
 * "no date" stays representable.
 */
export function OptionalDateField({
  value,
  onChange,
  addLabel = 'Add date',
  style,
  ...rest
}: OptionalProps) {
  const { colors } = useTheme();
  if (!value) {
    return (
      <Pressable
        onPress={() => onChange(toDateInputValue(new Date()))}
        style={({ pressed }) => [
          styles.field,
          styles.addField,
          { borderColor: colors.lineStrong, backgroundColor: colors.surface },
          pressed && { opacity: 0.9 },
          style,
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>
          <Calendar size={16} color={colors.accent} strokeWidth={2.2} />
        </View>
        <Text style={[styles.fieldText, { color: colors.mute }]}>{addLabel}</Text>
      </Pressable>
    );
  }
  return (
    <View style={style}>
      <DateField value={value} onChange={onChange} {...rest} />
      <Pressable onPress={() => onChange('')} hitSlop={6} style={styles.clearBtn}>
        <Text style={[styles.clearText, { color: colors.mute }]}>Clear date</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: 48,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldText: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  changeHint: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
  nativeWrap: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    alignItems: 'center',
  },
  nativeCloseRow: {
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  iosInline: {
    // Inline calendar needs explicit size on iOS or hit targets collapse.
    alignSelf: 'stretch',
    width: '100%',
    minHeight: 320,
  },
  panel: {
    marginTop: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    ...shadows.soft,
  },
  panelEmbedded: {
    marginTop: 0,
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  monthTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    letterSpacing: -0.2,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  dayCellFallback: {
    width: '14.2857%',
    aspectRatio: 1,
  },
  dayCellInner: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  dayText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
  footer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-end',
  },
  footerLink: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
  addField: {
    borderStyle: 'dashed',
  },
  clearBtn: {
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  clearText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
});
