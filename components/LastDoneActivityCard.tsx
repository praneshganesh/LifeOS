import { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text as RNText,
  type LayoutChangeEvent,
} from 'react-native';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import {
  defaultActivityYear,
  formatRelativeDone,
  formatRemindDate,
  formatRemindStatus,
  getLastDoneAt,
  hasActivityHistory,
  toDateInputValue,
  yearsWithLogs,
  type LastDoneItem,
} from '@/lib/lastDone';
import {
  categorizeLastDone,
  paintLastDoneCategory,
  type LastDoneCategory,
} from '@/lib/lastDoneCategories';
import {
  buildHabitYearCalendar,
  cellSizeForWidth,
  CALENDAR_DAYS,
  type CalendarCell,
} from '@/lib/habitHeatmap';
import { fonts, radius, shadows, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

const MONTH_LABEL_W = 36;
const GAP = 2;
const DAY_TICKS = [1, 5, 10, 15, 20, 25, 31] as const;
const DAY_TICK_BOX = 18;

function daysTrackWidth(cell: number, gap: number) {
  return CALENDAR_DAYS * cell + (CALENDAR_DAYS - 1) * gap;
}

function dayTickLeft(day: number, cell: number, gap: number, trackW: number) {
  const colLeft = (day - 1) * (cell + gap);
  const centered = colLeft + (cell - DAY_TICK_BOX) / 2;
  return Math.max(0, Math.min(trackW - DAY_TICK_BOX, centered));
}

function DoneCell({
  cell,
  size,
  fillColor,
  emptyColor,
}: {
  cell: CalendarCell;
  size: number;
  fillColor: string;
  emptyColor: string;
}) {
  if (cell.state === 'invalid') {
    return (
      <View
        style={{ width: size, height: size }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 1.5,
        backgroundColor: cell.state === 'done' ? fillColor : emptyColor,
      }}
    />
  );
}

function ActivityYearCalendar({
  logs,
  year,
  fillColor,
  emptyColor,
  yearNav,
}: {
  logs: LastDoneItem['logs'];
  year: number;
  fillColor: string;
  emptyColor: string;
  yearNav?: {
    canPrev: boolean;
    canNext: boolean;
    onPrev: () => void;
    onNext: () => void;
  };
}) {
  const { colors } = useTheme();
  const [innerW, setInnerW] = useState(0);
  const habitLogs = useMemo(
    () => (logs ?? []).map((l) => ({ doneAt: toDateInputValue(l.doneAt) })),
    [logs]
  );
  const model = useMemo(
    () => buildHabitYearCalendar(habitLogs, year),
    [habitLogs, year]
  );

  const trackBudget = Math.max(0, innerW - MONTH_LABEL_W);
  const cell = cellSizeForWidth(trackBudget, GAP, { min: 4, max: 14 });
  const trackW = daysTrackWidth(cell, GAP);
  const ready = trackBudget > 0;
  const labelFs = Math.max(10, Math.min(13, cell + 3));
  const rowH = Math.max(cell, labelFs + 4);
  const doneCount = model.months.reduce(
    (n, row) => n + row.cells.filter((c) => c.state === 'done').length,
    0
  );

  function onLayout(e: LayoutChangeEvent) {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w !== innerW) setInnerW(w);
  }

  return (
    <View style={styles.cal} onLayout={onLayout}>
      {yearNav ? (
        <View style={styles.yearNav}>
          <Pressable
            onPress={yearNav.onPrev}
            disabled={!yearNav.canPrev}
            hitSlop={8}
            style={({ pressed }) => [
              styles.yearNavBtn,
              !yearNav.canPrev && styles.yearNavBtnOff,
              pressed && yearNav.canPrev && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Previous year"
          >
            <ChevronLeft
              size={16}
              color={yearNav.canPrev ? colors.ink : colors.faint}
              strokeWidth={2.2}
            />
          </Pressable>
          <RNText
            allowFontScaling={false}
            style={[styles.yearNavLabel, { color: colors.ink, fontSize: labelFs }]}
          >
            {year}
          </RNText>
          <Pressable
            onPress={yearNav.onNext}
            disabled={!yearNav.canNext}
            hitSlop={8}
            style={({ pressed }) => [
              styles.yearNavBtn,
              !yearNav.canNext && styles.yearNavBtnOff,
              pressed && yearNav.canNext && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Next year"
          >
            <ChevronRight
              size={16}
              color={yearNav.canNext ? colors.ink : colors.faint}
              strokeWidth={2.2}
            />
          </Pressable>
        </View>
      ) : null}

      {!ready ? <View style={{ height: 12 * 6 }} /> : null}
      {ready ? (
        <>
          <View style={styles.calRow}>
            <View style={{ width: MONTH_LABEL_W }} />
            <View
              style={[
                styles.dayHeaderTrack,
                { width: trackW, height: labelFs + 3 },
              ]}
            >
              {DAY_TICKS.map((d) => (
                <RNText
                  key={d}
                  allowFontScaling={false}
                  style={[
                    styles.dayHeaderAbs,
                    {
                      left: dayTickLeft(d, cell, GAP, trackW),
                      width: DAY_TICK_BOX,
                      fontSize: labelFs,
                      lineHeight: labelFs + 2,
                      color: colors.mute,
                    },
                  ]}
                >
                  {d}
                </RNText>
              ))}
            </View>
          </View>

          {model.months.map((row) => (
            <View
              key={row.monthIndex}
              style={[styles.calRow, { marginTop: GAP, height: rowH }]}
            >
              <RNText
                numberOfLines={1}
                allowFontScaling={false}
                style={[
                  styles.monthLabel,
                  { height: rowH, lineHeight: rowH, fontSize: labelFs, color: colors.mute },
                ]}
              >
                {row.label}
              </RNText>
              <View style={[styles.daysTrack, { width: trackW, gap: GAP }]}>
                {row.cells.map((c) => (
                  <DoneCell
                    key={`${row.monthIndex}-${c.day}`}
                    cell={c}
                    size={cell}
                    fillColor={fillColor}
                    emptyColor={emptyColor}
                  />
                ))}
              </View>
            </View>
          ))}

          <RNText
            allowFontScaling={false}
            style={[
              styles.yearCaption,
              { fontSize: labelFs, lineHeight: labelFs + 4, color: colors.faint },
            ]}
          >
            {doneCount > 0
              ? `${year} · ${doneCount} ${doneCount === 1 ? 'time' : 'times'} marked done`
              : `${year} · no logs this year`}
          </RNText>
        </>
      ) : null}
    </View>
  );
}

export function LastDoneActivityCard({
  item,
  onLog,
  onOpen,
  year: yearProp,
  onYearChange,
}: {
  item: LastDoneItem;
  onLog?: () => void;
  onOpen?: () => void;
  compact?: boolean;
  /** Detail screen — browse years that have logs. */
  year?: number;
  onYearChange?: (year: number) => void;
}) {
  const { colors } = useTheme();
  const category = paintLastDoneCategory(categorizeLastDone(item.label).id, colors);
  const showHeatmap = hasActivityHistory(item);
  const last = item.logs?.length
    ? formatRelativeDone(getLastDoneAt(item))
    : item.remindAt
      ? formatRemindStatus(item.remindAt)
      : 'Not yet';

  const logYears = useMemo(() => yearsWithLogs(item), [item]);
  const viewYear = yearProp ?? defaultActivityYear(item);
  const yearNav =
    onYearChange && logYears.length
      ? {
          canPrev: viewYear > logYears[logYears.length - 1]!,
          canNext: viewYear < logYears[0]!,
          onPrev: () => {
            const next = logYears.find((y) => y < viewYear);
            if (next != null) onYearChange(next);
          },
          onNext: () => {
            const next = [...logYears].reverse().find((y) => y > viewYear);
            if (next != null) onYearChange(next);
          },
        }
      : undefined;

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.line },
        pressed && onOpen && { opacity: 0.96 },
      ]}
      disabled={!onOpen}
    >
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: category.color }]} />
        <Text variant="headline" numberOfLines={1} style={styles.title}>
          {item.label}
        </Text>
        <Text variant="caption" style={styles.lastInline}>
          {last}
        </Text>
        {onLog ? (
          <Pressable
            onPress={onLog}
            hitSlop={8}
            style={({ pressed }) => [
              styles.logBtn,
              { backgroundColor: category.soft },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Check size={12} color={category.color} strokeWidth={2.4} />
          </Pressable>
        ) : null}
      </View>

      {showHeatmap ? (
        <ActivityYearCalendar
          logs={item.logs}
          year={viewYear}
          fillColor={category.color}
          emptyColor={colors.lineStrong}
          yearNav={yearNav}
        />
      ) : item.remindAt ? (
        <View style={[styles.reminderPanel, { backgroundColor: colors.surfaceSoft }]}>
          <Text variant="caption" style={{ color: colors.mute }}>
            Reminder
          </Text>
          <Text variant="headline" style={[styles.reminderDate, { color: colors.ink }]}>
            {formatRemindDate(item.remindAt)}
          </Text>
          <Text variant="caption" style={{ color: category.color }}>
            {formatRemindStatus(item.remindAt)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function LastDoneCategoryHeader({ category }: { category: LastDoneCategory }) {
  const { colors } = useTheme();
  return (
    <View style={styles.catHead}>
      <Text style={styles.catEmoji}>{category.emoji}</Text>
      <Text style={[styles.catName, { color: colors.ink }]}>{category.name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    overflow: 'hidden',
    ...shadows.soft,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  title: {
    flex: 1,
    fontSize: 16,
    lineHeight: 18,
    fontFamily: fonts.sansMedium,
  },
  lastInline: {
    fontSize: 16,
  },
  logBtn: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderPanel: {
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: 2,
  },
  reminderDate: {
    fontSize: 16,
    lineHeight: 22,
    marginTop: 2,
  },
  cal: {
    width: '100%',
  },
  yearNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 6,
  },
  yearNavBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  yearNavBtnOff: {
    opacity: 0.35,
  },
  yearNavLabel: {
    fontFamily: fonts.sansMedium,
    minWidth: 44,
    textAlign: 'center',
    includeFontPadding: false,
  },
  calRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  daysTrack: {
    flexDirection: 'row',
    flexShrink: 0,
  },
  dayHeaderTrack: {
    position: 'relative',
    overflow: 'visible',
    marginBottom: 2,
  },
  dayHeaderAbs: {
    position: 'absolute',
    top: 0,
    fontFamily: fonts.sans,
    textAlign: 'center',
    includeFontPadding: false,
  },
  monthLabel: {
    width: MONTH_LABEL_W,
    fontFamily: fonts.sans,
    includeFontPadding: false,
  },
  yearCaption: {
    marginTop: 6,
    fontFamily: fonts.sans,
    includeFontPadding: false,
  },
  catHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 0,
    marginBottom: 6,
  },
  catEmoji: {
    fontSize: 16,
  },
  catName: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    letterSpacing: -0.2,
  },
});
