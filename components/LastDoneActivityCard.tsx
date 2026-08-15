import { useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, type LayoutChangeEvent } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import {
  formatRelativeDone,
  formatRemindStatus,
  getLastDoneAt,
  toDateInputValue,
  type LastDoneItem,
} from '@/lib/lastDone';
import {
  categorizeLastDone,
  type LastDoneCategory,
} from '@/lib/lastDoneCategories';
import { colors, fonts, radius, shadows, spacing } from '@/constants/theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
/** Mid-size cells — weeks fit exactly to measured width (no clip). */
const CELL = 9;
const GAP = 3;
const LABEL_W = 12;
/** Approx width of a short month label like "Aug". */
const MONTH_LABEL_W = 22;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** How many week columns fit — never more than the width can hold. */
function weeksForWidth(width: number) {
  if (width <= 0) return 0;
  return Math.max(1, Math.floor((width + GAP) / (CELL + GAP)));
}

function useContribution(logs: LastDoneItem['logs'], weeks: number) {
  return useMemo(() => {
    if (weeks <= 0) {
      return { columns: [] as { key: string; filled: boolean }[][], monthMarks: [] };
    }

    const done = new Set(
      logs.map((l) => toDateInputValue(l.doneAt)).filter(Boolean)
    );

    const today = startOfDay(new Date());
    const end = addDays(today, 6 - today.getDay());
    const start = addDays(end, -(weeks * 7 - 1));

    const columns: { key: string; filled: boolean }[][] = [];
    const monthMarks: { index: number; label: string }[] = [];
    let cursor = start;
    let lastMonth = -1;

    for (let w = 0; w < weeks; w++) {
      const col: { key: string; filled: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const key = toDateInputValue(cursor);
        col.push({ key, filled: done.has(key) });
        // Label on first day of each month in range (not only date≤7 — that skips Jan if the grid starts mid-month)
        if (cursor.getMonth() !== lastMonth) {
          lastMonth = cursor.getMonth();
          monthMarks.push({
            index: w,
            label: cursor.toLocaleString(undefined, { month: 'short' }),
          });
        }
        cursor = addDays(cursor, 1);
      }
      columns.push(col);
    }

    return { columns, monthMarks };
  }, [logs, weeks]);
}

export function LastDoneActivityCard({
  item,
  onLog,
  onOpen,
}: {
  item: LastDoneItem;
  onLog?: () => void;
  onOpen?: () => void;
  compact?: boolean;
}) {
  const category = categorizeLastDone(item.label);
  const [gridWidth, setGridWidth] = useState(0);
  const weeks = weeksForWidth(gridWidth);
  const { columns, monthMarks } = useContribution(item.logs, weeks);
  const last = item.logs?.length
    ? formatRelativeDone(getLastDoneAt(item))
    : item.remindAt
      ? formatRemindStatus(item.remindAt)
      : 'Not yet';
  const gridH = 7 * CELL + 6 * GAP;
  const gridPixelW = weeks > 0 ? weeks * CELL + (weeks - 1) * GAP : 0;

  function onGridLayout(e: LayoutChangeEvent) {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== gridWidth) setGridWidth(w);
  }

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.96 }]}
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

      <View style={styles.gridWrap}>
        <View style={[styles.weekdayCol, { height: gridH }]}>
          {WEEKDAYS.map((d, i) => (
            <Text key={`${d}-${i}`} style={styles.weekday}>
              {d}
            </Text>
          ))}
        </View>

        <View style={styles.gridBody} onLayout={onGridLayout}>
          {weeks > 0 ? (
            <>
              <View style={[styles.grid, { width: gridPixelW }]}>
                {columns.map((col, wi) => (
                  <View key={wi} style={styles.weekCol}>
                    {col.map((dayCell) => (
                      <View
                        key={dayCell.key}
                        style={[
                          styles.cell,
                          {
                            backgroundColor: dayCell.filled
                              ? category.color
                              : colors.surfaceSoft,
                          },
                        ]}
                      />
                    ))}
                  </View>
                ))}
              </View>
              <View style={[styles.monthRow, { width: gridPixelW }]}>
                {monthMarks.map((m) => {
                  const raw = m.index * (CELL + GAP);
                  const left = Math.min(raw, Math.max(0, gridPixelW - MONTH_LABEL_W));
                  return (
                    <Text
                      key={`${m.label}-${m.index}`}
                      style={[styles.monthLabel, { left }]}
                    >
                      {m.label}
                    </Text>
                  );
                })}
              </View>
            </>
          ) : (
            <View style={{ height: gridH + 16 }} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

export function LastDoneCategoryHeader({ category }: { category: LastDoneCategory }) {
  return (
    <View style={styles.catHead}>
      <Text style={styles.catEmoji}>{category.emoji}</Text>
      <Text style={styles.catName}>{category.name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignSelf: 'stretch',
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
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fonts.sansMedium,
  },
  lastInline: {
    color: colors.mute,
    fontSize: 11,
  },
  logBtn: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    width: '100%',
  },
  weekdayCol: {
    width: LABEL_W,
    justifyContent: 'space-between',
  },
  weekday: {
    fontFamily: fonts.sans,
    fontSize: 9,
    lineHeight: CELL,
    height: CELL,
    color: colors.faint,
    textAlign: 'center',
  },
  gridBody: {
    flex: 1,
    minWidth: 0,
  },
  grid: {
    flexDirection: 'row',
    gap: GAP,
  },
  weekCol: {
    width: CELL,
    gap: GAP,
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 2,
  },
  monthRow: {
    height: 14,
    marginTop: 4,
    position: 'relative',
  },
  monthLabel: {
    position: 'absolute',
    fontFamily: fonts.sans,
    fontSize: 10,
    lineHeight: 14,
    color: colors.faint,
  },
  catHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 0,
    marginBottom: 6,
  },
  catEmoji: {
    fontSize: 13,
  },
  catName: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.ink,
    letterSpacing: -0.2,
  },
});
