import { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text as RNText,
  type LayoutChangeEvent,
} from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { SwipeActions } from '@/components/ui/SwipeActions';
import {
  paintHabitCategory,
  currentStreak,
  loggedOn,
  type Habit,
  type HabitCategory,
} from '@/lib/habits';
import {
  CALENDAR_DAYS,
  buildHabitMonthCalendar,
  buildHabitYearCalendar,
  cellSizeForWidth,
  type CalendarCell,
} from '@/lib/habitHeatmap';
import { fonts, radius, shadows, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { displayNameFor, selfMember } from '@/lib/people';

const MONTH_LABEL_W = 36;
const GAP = 2;
/** Sparse ticks, never clip two-digit numbers into a 1-cell box. */
const DAY_TICKS = [1, 5, 10, 15, 20, 25, 31] as const;
const DAY_TICK_BOX = 18;

function daysTrackWidth(cell: number, gap: number) {
  return CALENDAR_DAYS * cell + (CALENDAR_DAYS - 1) * gap;
}

function dayTickLeft(day: number, cell: number, gap: number, trackW: number) {
  const colLeft = (day - 1) * (cell + gap);
  const centered = colLeft + (cell - DAY_TICK_BOX) / 2;
  // Keep full two-digit labels inside the track (no “2…” ellipsis).
  return Math.max(0, Math.min(trackW - DAY_TICK_BOX, centered));
}

function DayCell({
  cell,
  size,
  interactive,
  onToggle,
}: {
  cell: CalendarCell;
  size: number;
  interactive: boolean;
  onToggle?: (dateKey: string) => void;
}) {
  const { colors } = useTheme();
  if (cell.state === 'invalid') {
    return (
      <View
        style={{ width: size, height: size }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    );
  }

  const done = cell.state === 'done';
  const body = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 1.5,
        backgroundColor: done ? colors.accentStrong : colors.lineStrong,
      }}
    />
  );

  if (!interactive || !cell.key || !onToggle) return body;

  return (
    <Pressable
      onPress={() => onToggle(cell.key!)}
      hitSlop={1}
      accessibilityRole="button"
      accessibilityLabel={
        done ? `Mark ${cell.key} not done` : `Mark ${cell.key} done`
      }
      style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
    >
      {body}
    </Pressable>
  );
}

export type HabitHeatmapRange = 'month' | 'year';

function HabitYearCalendar({
  habit,
  year,
  range,
  interactive,
  onToggleDay,
  showRangeToggle,
  onRangeChange,
}: {
  habit: Habit;
  year: number;
  range: HabitHeatmapRange;
  interactive: boolean;
  onToggleDay?: (dateKey: string) => void;
  showRangeToggle?: boolean;
  onRangeChange?: (next: HabitHeatmapRange) => void;
}) {
  const { colors } = useTheme();
  const [innerW, setInnerW] = useState(0);
  const now = useMemo(() => new Date(), []);
  const model = useMemo(
    () =>
      range === 'month'
        ? buildHabitMonthCalendar(habit.logs, new Date(year, now.getMonth(), 1))
        : buildHabitYearCalendar(habit.logs, year),
    [habit.logs, year, range, now]
  );

  // Measure the days track only (month labels sit outside).
  const trackBudget = Math.max(0, innerW - MONTH_LABEL_W);
  const cell = cellSizeForWidth(trackBudget, GAP, {
    min: range === 'month' ? 8 : 4,
    max: range === 'month' ? 18 : 14,
  });
  const trackW = daysTrackWidth(cell, GAP);
  const ready = trackBudget > 0;
  const labelFs = Math.max(10, Math.min(13, cell + 3));
  const rowH = Math.max(cell, labelFs + 4);
  // Row header already shows the month, caption is legend only.
  const caption = habit.logs.length
    ? 'Filled = done'
    : 'Tap a day to mark done';

  function onLayout(e: LayoutChangeEvent) {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w !== innerW) setInnerW(w);
  }

  return (
    <View style={styles.cal} onLayout={onLayout}>
      {!ready ? (
        <View style={{ height: range === 'month' ? rowH + 24 : 12 * 6 }} />
      ) : null}
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
                  {
                    height: rowH,
                    lineHeight: rowH,
                    fontSize: labelFs,
                    color: colors.mute,
                  },
                ]}
              >
                {row.label}
              </RNText>
              <View style={[styles.daysTrack, { width: trackW, gap: GAP }]}>
                {row.cells.map((c) => (
                  <DayCell
                    key={`${row.monthIndex}-${c.day}`}
                    cell={c}
                    size={cell}
                    interactive={interactive}
                    onToggle={onToggleDay}
                  />
                ))}
              </View>
            </View>
          ))}

          <View style={styles.calFooter}>
            <Text
              variant="caption"
              style={[styles.yearCaption, { color: colors.mute, flex: 1 }]}
              numberOfLines={1}
            >
              {caption}
            </Text>
            {showRangeToggle && onRangeChange ? (
              <Pressable
                onPress={() =>
                  onRangeChange(range === 'month' ? 'year' : 'month')
                }
                hitSlop={8}
                style={({ pressed }) => [
                  styles.rangeBtn,
                  {
                    borderColor: colors.lineStrong,
                    backgroundColor: colors.surfaceSoft,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  range === 'month' ? 'Show year heatmap' : 'Show this month'
                }
              >
                <Text
                  style={[styles.rangeBtnText, { color: colors.ink }]}
                  numberOfLines={1}
                >
                  {range === 'month' ? 'Year' : 'Month'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

export function HabitCard({
  habit,
  onCheckIn,
  onOpen,
  onToggleDay,
  /** List: compact glance. Detail: interactive. */
  interactive = false,
  year,
  /** Default month. List filter or detail toggle. */
  range = 'month',
  /** Detail: small Month/Year control under the heatmap. */
  showRangeToggle = false,
  onRangeChange,
  onDelete,
}: {
  habit: Habit;
  onCheckIn?: () => void;
  onOpen?: () => void;
  /** List: swipe left reveals Delete. */
  onDelete?: () => void;
  /** Toggle a specific YYYY-MM-DD (detail). */
  onToggleDay?: (dateKey: string) => void;
  interactive?: boolean;
  year?: number;
  range?: HabitHeatmapRange;
  showRangeToggle?: boolean;
  onRangeChange?: (next: HabitHeatmapRange) => void;
}) {
  const { colors } = useTheme();
  const { members } = useHousehold();
  const category = paintHabitCategory(habit.categoryId, colors);
  const viewYear = year ?? new Date().getFullYear();
  const [localRange, setLocalRange] = useState<HabitHeatmapRange>(range);
  useEffect(() => {
    if (!showRangeToggle) setLocalRange(range);
  }, [range, showRangeToggle]);
  const doneToday = loggedOn(habit);
  const streak = currentStreak(habit);
  // Habits can belong to any household member (a kid's reading habit, etc.).
  // Only show the owner when it's someone other than the user, your own
  // name on your own habit is noise.
  const self = selfMember(members);
  const owner = displayNameFor(members, habit.personId, habit.assignedTo);
  const isOwn =
    (habit.personId && habit.personId === self?.id) ||
    (!habit.personId &&
      !!self &&
      owner.trim().toLowerCase() === self.name.trim().toLowerCase());
  const ownerName = isOwn ? '' : owner;

  const setRange = (next: HabitHeatmapRange) => {
    setLocalRange(next);
    onRangeChange?.(next);
  };

  const body = (
    <>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: category.color }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="headline" numberOfLines={1} style={styles.title}>
            {habit.title}
          </Text>
          {habit.why ? (
            <Text variant="caption" numberOfLines={1} style={styles.why}>
              {habit.why}
            </Text>
          ) : ownerName ? (
            <Text variant="caption" numberOfLines={1} style={styles.why}>
              {ownerName}
            </Text>
          ) : null}
        </View>
        <Text variant="caption" style={styles.meta}>
          {streak === 1 ? '1 day streak' : `${streak} day streak`}
        </Text>
        {onCheckIn ? (
          <Pressable
            onPress={onCheckIn}
            hitSlop={10}
            style={({ pressed }) => [
              styles.logBtn,
              {
                backgroundColor: doneToday ? category.color : category.soft,
              },
              pressed && { opacity: 0.85 },
            ]}
            accessibilityLabel={doneToday ? 'Undo today' : 'Mark done today'}
          >
            <Check
              size={11}
              color={doneToday ? colors.accentOn : category.color}
              strokeWidth={2.6}
            />
          </Pressable>
        ) : null}
      </View>

      <HabitYearCalendar
        habit={habit}
        year={viewYear}
        range={showRangeToggle ? localRange : range}
        interactive={interactive}
        onToggleDay={onToggleDay}
        showRangeToggle={showRangeToggle}
        onRangeChange={showRangeToggle ? setRange : undefined}
      />
    </>
  );

  if (onOpen && !interactive) {
    return (
      <SwipeActions
        onComplete={onCheckIn}
        onDelete={onDelete}
        completeLabel={doneToday ? 'Undo' : 'Done'}
        style={styles.swipeShell}
      >
        <Pressable
          onPress={onOpen}
          style={({ pressed }) => [
            styles.card,
            styles.cardInSwipe,
            { backgroundColor: colors.surface, borderColor: colors.line },
            pressed && { opacity: 0.96 },
          ]}
        >
          {body}
        </Pressable>
      </SwipeActions>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      {body}
    </View>
  );
}

export function HabitCategoryHeader({ category }: { category: HabitCategory }) {
  const { colors } = useTheme();
  return (
    <View style={styles.catHead}>
      <Text style={styles.catEmoji}>{category.emoji}</Text>
      <Text style={[styles.catName, { color: colors.ink }]}>{category.name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  swipeShell: {
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  cardInSwipe: {
    marginBottom: 0,
  },
  card: {
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
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
    fontSize: 16,
    lineHeight: 18,
    fontFamily: fonts.sansMedium,
  },
  why: {
    marginTop: 1,
  },
  meta: {
    fontSize: 13,
    marginRight: 4,
    flexShrink: 0,
  },
  logBtn: {
    width: 18,
    height: 18,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cal: {
    width: '100%',
    overflow: 'hidden',
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
    marginTop: 0,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.1,
  },
  calFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  rangeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rangeBtnText: {
    fontFamily: fonts.sansSemi,
    fontSize: 12,
    letterSpacing: -0.1,
  },
  catHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
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
