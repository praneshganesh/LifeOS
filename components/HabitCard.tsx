import { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text as RNText,
  type LayoutChangeEvent,
} from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import {
  paintHabitCategory,
  completionRate,
  currentStreak,
  loggedOn,
  type Habit,
  type HabitCategory,
} from '@/lib/habits';
import {
  CALENDAR_DAYS,
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
/** Sparse ticks — never clip two-digit numbers into a 1-cell box. */
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

function HabitYearCalendar({
  habit,
  year,
  interactive,
  onToggleDay,
  compact,
}: {
  habit: Habit;
  year: number;
  interactive: boolean;
  onToggleDay?: (dateKey: string) => void;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const [innerW, setInnerW] = useState(0);
  const model = useMemo(
    () => buildHabitYearCalendar(habit.logs, year),
    [habit.logs, year]
  );

  // Measure the days track only (month labels sit outside). Cells are heatmap
  // squares, not text — they must shrink so all 31 columns fit the card.
  const trackBudget = Math.max(0, innerW - MONTH_LABEL_W);
  const cell = cellSizeForWidth(trackBudget, GAP, {
    min: 4,
    max: 14,
  });
  const trackW = daysTrackWidth(cell, GAP);
  const ready = trackBudget > 0;
  // Chart axis micro-labels — must fit inside cell-height rows, so they scale
  // with the grid instead of following the app-wide 16px text floor.
  const labelFs = Math.max(10, Math.min(13, cell + 3));
  // Row pitch follows the label, not the cell: an 11px label in an 8px-tall
  // row bleeds into its neighbors and clips descenders (Aug → "Aua").
  const rowH = Math.max(cell, labelFs + 4);

  function onLayout(e: LayoutChangeEvent) {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w !== innerW) setInnerW(w);
  }

  return (
    <View style={styles.cal} onLayout={onLayout}>
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

          <RNText
            allowFontScaling={false}
            style={[
              styles.yearCaption,
              { fontSize: labelFs, lineHeight: labelFs + 4, color: colors.faint },
            ]}
          >
            {habit.logs.length
              ? `${year} · filled = done`
              : `${year} · tap a day to mark done`}
          </RNText>
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
  /** List: compact year glance. Detail: interactive year. */
  interactive = false,
  year,
}: {
  habit: Habit;
  onCheckIn?: () => void;
  onOpen?: () => void;
  /** Toggle a specific YYYY-MM-DD (detail). */
  onToggleDay?: (dateKey: string) => void;
  interactive?: boolean;
  year?: number;
}) {
  const { colors } = useTheme();
  const { members } = useHousehold();
  const category = paintHabitCategory(habit.categoryId, colors);
  const viewYear = year ?? new Date().getFullYear();
  const doneToday = loggedOn(habit);
  const streak = currentStreak(habit);
  const rate = completionRate(habit, 30);
  // Habits can belong to any household member (a kid's reading habit, etc.).
  // Only show the owner when it's someone other than the user — your own
  // name on your own habit is noise.
  const self = selfMember(members);
  const owner = displayNameFor(members, habit.personId, habit.assignedTo);
  const isOwn =
    (habit.personId && habit.personId === self?.id) ||
    (!habit.personId &&
      !!self &&
      owner.trim().toLowerCase() === self.name.trim().toLowerCase());
  const ownerName = isOwn ? '' : owner;

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
          {streak > 0 ? `${streak}d` : `${rate}%`}
        </Text>
        {onCheckIn ? (
          <Pressable
            onPress={onCheckIn}
            hitSlop={8}
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
              size={12}
              color={doneToday ? colors.forestOn : category.color}
              strokeWidth={2.4}
            />
          </Pressable>
        ) : null}
      </View>

      <HabitYearCalendar
        habit={habit}
        year={viewYear}
        interactive={interactive}
        onToggleDay={onToggleDay}
        compact={!interactive}
      />
    </>
  );

  if (onOpen && !interactive) {
    return (
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.line },
          pressed && { opacity: 0.96 },
        ]}
      >
        {body}
      </Pressable>
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
    fontSize: 16,
    lineHeight: 18,
    fontFamily: fonts.sansMedium,
  },
  why: {
    marginTop: 1,
  },
  meta: {
    fontSize: 16,
  },
  logBtn: {
    width: 24,
    height: 24,
    borderRadius: 8,
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
    marginTop: 6,
    fontFamily: fonts.sans,
    includeFontPadding: false,
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
