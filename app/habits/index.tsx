import { useTheme } from '@/lib/ThemeContext';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { StatStrip } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { HabitCard, HabitCategoryHeader } from '@/components/HabitCard';
import { useHabits } from '@/lib/HabitsContext';
import { useLastDone } from '@/lib/LastDoneContext';
import {
  currentStreak,
  dayKey,
  groupHabitsByCategory,
  loggedOn,
  shouldSyncLastDone,
} from '@/lib/habits';
import { type ThemeColors,  colors, fonts, radius, spacing  } from '@/constants/theme';

export default function HabitsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { habits, checkIn, getById } = useHabits();
  const { logDone } = useLastDone();
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
      subtitle="Auto-categorized rhythms — optionally linked to Things."
      right={
        <Pressable
          onPress={() => router.push('/habits/create' as Href)}
          style={styles.addBtn}
          accessibilityLabel="Add habit"
        >
          <Plus size={18} color={colors.forest} strokeWidth={2.2} />
          <Text style={styles.addLabel}>Add</Text>
        </Pressable>
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
                : '—',
          },
        ]}
      />

      {habits.length === 0 ? (
        <ModuleSection label="Your rhythms">
          <Text variant="body" style={{ color: colors.mute }}>
            Add something like “Walk” or “Service the AC” — link a Thing if you want check-ins to log Last Done.
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
                onOpen={() => router.push(`/habits/${h.id}` as Href)}
                onCheckIn={() => void onCheckIn(h.id)}
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.forestSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  addLabel: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    color: colors.forest,
  },
});
}
