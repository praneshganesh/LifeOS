import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { AddButton } from '@/components/ui/AddButton';
import { FilterChips, StatStrip } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import {
  HabitCard,
  HabitCategoryHeader,
  type HabitHeatmapRange,
} from '@/components/HabitCard';
import { useHabits } from '@/lib/HabitsContext';
import { useDeleteWithConfirm } from '@/lib/useDeleteWithConfirm';
import { useLastDone } from '@/lib/LastDoneContext';
import {
  currentStreak,
  dayKey,
  groupHabitsByCategory,
  loggedOn,
  shouldSyncLastDone,
} from '@/lib/habits';
import { type ThemeColors, fonts, radius, spacing } from '@/constants/theme';

const RANGE_FILTERS = [
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'Year' },
] as const;

export default function HabitsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { habits, checkIn, getById, removeHabit } = useHabits();
  const deleteWithConfirm = useDeleteWithConfirm();
  const { logDone } = useLastDone();
  const [heatmapRange, setHeatmapRange] = useState<HabitHeatmapRange>('month');
  const groups = useMemo(() => groupHabitsByCategory(habits), [habits]);
  const today = dayKey();
  const doneToday = habits.filter((h) => loggedOn(h, today)).length;
  const bestStreak = habits.reduce((n, h) => Math.max(n, currentStreak(h)), 0);
  const linkedCount = habits.filter((h) => h.inventoryItemId).length;

  async function onCheckIn(id: string) {
    const habit = getById(id);
    if (!habit) return;
    const wasDone = loggedOn(habit, today);
    const updated = await checkIn(id);
    if (!wasDone && updated && shouldSyncLastDone(updated) && updated.inventoryItemId) {
      await logDone({
        label: updated.title,
        inventoryItemId: updated.inventoryItemId,
        doneAt: today,
      });
    }
  }

  return (
    <ModuleScreen
      title="Habits"
      defaultOrigin="things"
      right={
        <AddButton onPress={() => router.push('/habits/create' as Href)} label="Add habit" />
      }
    >
      <StatStrip
        items={[
          { label: 'Habits', value: String(habits.length) },
          { label: 'Today', value: `${doneToday}/${habits.length || 0}` },
          {
            label: linkedCount ? 'Linked' : 'Best streak',
            value: linkedCount
              ? String(linkedCount)
              : bestStreak
                ? `${bestStreak}d`
                : '0d',
          },
        ]}
      />

      {habits.length > 0 ? (
        <FilterChips
          options={[...RANGE_FILTERS]}
          value={heatmapRange}
          onChange={(key) => setHeatmapRange(key as HabitHeatmapRange)}
        />
      ) : null}

      {habits.length === 0 ? (
        <ModuleSection label="Your rhythms">
          <Text variant="body" style={{ color: colors.mute }}>
            No habits yet.
          </Text>
        </ModuleSection>
      ) : (
        groups.map((g) => (
          <View key={g.category.id}>
            <HabitCategoryHeader category={g.category} />
            {g.habits.map((h) => (
              <HabitCard
                key={h.id}
                habit={h}
                range={heatmapRange}
                onOpen={() => router.push(`/habits/${h.id}` as Href)}
                onCheckIn={() => void onCheckIn(h.id)}
                onDelete={() => void deleteWithConfirm(h.title, () => removeHabit(h.id))}
              />
            ))}
          </View>
        ))
      )}
    </ModuleScreen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  });
}
