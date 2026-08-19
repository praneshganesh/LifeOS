import { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { parseDateInput, toDateInputValue } from '@/lib/lastDone';
import { fonts, radius, shadows, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

function toDate(value: string): Date {
  return parseDateInput(value) ?? new Date();
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
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
  // JS: 0=Sun … convert to Mon=0 … Sun=6
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
};

/** App-styled date field + calendar — no browser native picker. */
export function DateField({
  value,
  onChange,
  maximumDate,
  minimumDate,
  style,
  defaultOpen = false,
}: Props) {
  const { colors } = useTheme();
  const resolved = value || toDateInputValue(new Date());
  const selected = toDate(resolved);
  const today = startOfDay(new Date());

  const [open, setOpen] = useState(defaultOpen);
  const [view, setView] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1)
  );

  const cells = useMemo(() => buildMonthGrid(view), [view]);

  function selectDay(day: Date) {
    if (isDisabled(day, minimumDate, maximumDate)) return;
    onChange(toDateInputValue(day));
    setOpen(false);
  }

  function goMonth(delta: number) {
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));
  }

  function jumpToday() {
    if (isDisabled(today, minimumDate, maximumDate)) return;
    setView(new Date(today.getFullYear(), today.getMonth(), 1));
    onChange(toDateInputValue(today));
    setOpen(false);
  }

  return (
    <View style={style}>
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

      {open ? (
        <View
          style={[
            styles.panel,
            { backgroundColor: colors.surface, borderColor: colors.line },
          ]}
        >
          <View style={styles.monthBar}>
            <Pressable
              onPress={() => goMonth(-1)}
              hitSlop={8}
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

          <View style={styles.grid}>
            {cells.map((day, i) => {
              if (!day) {
                return <View key={`e-${i}`} style={styles.dayCell} />;
              }
              const disabled = isDisabled(day, minimumDate, maximumDate);
              const isSelected = sameDay(day, selected);
              const isToday = sameDay(day, today);
              return (
                <Pressable
                  key={toDateInputValue(day)}
                  disabled={disabled}
                  onPress={() => selectDay(day)}
                  style={({ pressed }) => [
                    styles.dayCell,
                    isSelected && { backgroundColor: colors.accent },
                    !isSelected && isToday && { borderWidth: 1, borderColor: colors.accentSoft },
                    pressed && !disabled && !isSelected && { backgroundColor: colors.accentWash },
                  ]}
                >
                  <Text
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
  panel: {
    marginTop: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    ...shadows.soft,
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
  },
  dayCell: {
    width: '14.2857%',
    aspectRatio: 1,
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
});
