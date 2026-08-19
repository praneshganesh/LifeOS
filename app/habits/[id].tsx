import { useTheme } from '@/lib/ThemeContext';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Pressable, View, TextInput } from 'react-native';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { HabitCard } from '@/components/HabitCard';
import { useHabits } from '@/lib/HabitsContext';
import { useInventory } from '@/lib/InventoryContext';
import { useLastDone } from '@/lib/LastDoneContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { PersonChips } from '@/components/PersonChips';
import {
  HABIT_CATEGORIES,
  categorizeHabit,
  completionRate,
  currentStreak,
  dayKey,
  loggedOn,
  shouldSyncLastDone,
} from '@/lib/habits';
import { confirmDelete } from '@/lib/confirmDelete';
import { type ThemeColors,  colors, fonts, radius, spacing  } from '@/constants/theme';
import CreateHabitScreen from './create';

export default function HabitDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const router = useRouter();
  const { getById, checkIn, removeHabit, updateHabit } = useHabits();
  const { getById: getItem, items } = useInventory();
  const { logDone } = useLastDone();
  const { members } = useHousehold();

  const linkables = useMemo(
    () =>
      items
        .filter((i) => !i.isDocument)
        .slice(0, 30)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [items]
  );

  const habitEarly = id && id !== 'new' ? getById(id) : undefined;
  const [title, setTitle] = useState('');
  const [why, setWhy] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  useEffect(() => {
    if (!habitEarly) return;
    setTitle(habitEarly.title);
    setWhy(habitEarly.why || '');
  }, [habitEarly?.id, habitEarly?.title, habitEarly?.why]);

  // /habits/new was previously swallowed by [id] as a missing habit.
  if (id === 'new') {
    return <CreateHabitScreen />;
  }

  const habit = habitEarly;
  const linked = habit?.inventoryItemId
    ? getItem(habit.inventoryItemId)
    : undefined;

  async function onToggleDay(date: string) {
    if (!habit) return;
    const wasDone = loggedOn(habit, date);
    const updated = await checkIn(habit.id, date);
    // Only sync Last Done when marking done (not when undoing)
    if (!wasDone && updated && shouldSyncLastDone(updated) && updated.inventoryItemId) {
      await logDone({
        label: updated.title,
        inventoryItemId: updated.inventoryItemId,
        doneAt: date,
      });
    }
  }

  async function onCheckIn() {
    await onToggleDay(dayKey());
  }

  async function onRemove() {
    if (!habit) return;
    const ok = await confirmDelete(habit.title);
    if (!ok) return;
    await removeHabit(habit.id);
    if (router.canGoBack()) router.back();
    else router.replace('/habits' as Href);
  }

  if (!habit) {
    return (
      <ModuleScreen title="Not found">
        <Text variant="body">Habit not found.</Text>
      </ModuleScreen>
    );
  }

  const cat = HABIT_CATEGORIES[habit.categoryId];
  const streak = currentStreak(habit);
  const rate = completionRate(habit, 30);

  return (
    <ModuleScreen title={habit.title} subtitle={habit.why || cat.name}>
      <Stack.Screen options={{ title: '' }} />
      <HabitCard
        habit={habit}
        interactive
        onCheckIn={() => void onCheckIn()}
        onToggleDay={(date) => void onToggleDay(date)}
      />

      <Text variant="headline" style={{ fontSize: 16, marginTop: spacing.md }}>
        Details
      </Text>
      <Text style={styles.fieldLabel}>Name</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        style={styles.input}
        placeholderTextColor={colors.faint}
      />
      <Text style={styles.fieldLabel}>Why (optional)</Text>
      <TextInput
        value={why}
        onChangeText={setWhy}
        placeholder="e.g. Clear my head"
        placeholderTextColor={colors.faint}
        style={styles.input}
      />
      <PersonChips
        members={members}
        personId={habit.personId ?? null}
        onChange={(id) => {
          const m = members.find((x) => x.id === id);
          void updateHabit(habit.id, {
            personId: m?.id,
            assignedTo: m?.name,
          });
        }}
        noneLabel="Just me / unassigned"
      />
      <Pressable
        onPress={() => {
          if (!habit || !title.trim() || savingDetails) return;
          setSavingDetails(true);
          const nextTitle = title.trim();
          const nextWhy = why.trim() || undefined;
          const cat = categorizeHabit(nextTitle, nextWhy);
          void updateHabit(habit.id, {
            title: nextTitle,
            why: nextWhy,
            categoryId: cat.id,
          }).finally(() => setSavingDetails(false));
        }}
        disabled={!title.trim() || savingDetails}
        style={[styles.saveBtn, (!title.trim() || savingDetails) && { opacity: 0.45 }]}
      >
        <Text style={styles.saveBtnText}>
          {savingDetails ? 'Saving…' : 'Save habit details'}
        </Text>
      </Pressable>

      <ListCard style={{ marginTop: spacing.md }}>
        <ListRow title="Category" meta={`${cat.emoji} ${cat.name}`} />
        <ListRow title="Streak" meta={streak ? `${streak} days` : '—'} />
        <ListRow title="Last 30 days" meta={`${rate}%`} />
        <ListRow
          title="Today"
          meta={loggedOn(habit) ? 'Done' : 'Not today'}
          last={!linked}
        />
        {linked ? (
          <ListRow
            icon={linked.icon}
            title="Linked Thing"
            subtitle={linked.brand !== '—' ? linked.brand : linked.room}
            meta="Open"
            onPress={() => router.push(`/asset/${linked.id}` as Href)}
            last
          />
        ) : null}
      </ListCard>

      {linkables.length ? (
        <View style={{ marginTop: spacing.lg }}>
          <Text variant="headline" style={{ fontSize: 16 }}>
            About a Thing? (optional)
          </Text>
          <Text variant="caption" style={{ marginTop: 4, marginBottom: spacing.sm }}>
            Only if this habit is for something you own — e.g. “Service the AC” → your
            AC. Personal rhythms like Walk stay as None.
          </Text>
          <View style={styles.chips}>
            <Pressable
              onPress={() =>
                void updateHabit(habit.id, {
                  inventoryItemId: undefined,
                  syncLastDone: undefined,
                })
              }
              style={[styles.chip, !habit.inventoryItemId && styles.chipOn]}
            >
              <Text
                style={[
                  styles.chipText,
                  !habit.inventoryItemId && styles.chipTextOn,
                ]}
              >
                None
              </Text>
            </Pressable>
            {linkables.map((item) => {
              const on = habit.inventoryItemId === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() =>
                    void updateHabit(habit.id, {
                      inventoryItemId: item.id,
                      syncLastDone: habit.syncLastDone ?? true,
                    })
                  }
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text
                    style={[styles.chipText, on && styles.chipTextOn]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {habit.inventoryItemId ? (
            <View style={styles.syncRow}>
              <View style={{ flex: 1 }}>
                <Text variant="headline" style={{ fontSize: 16 }}>
                  Also mark it done on that Thing
                </Text>
                <Text variant="caption" style={{ marginTop: 2 }}>
                  When you check in here, add a Last Done note on the linked Thing.
                </Text>
              </View>
              <Switch
                value={shouldSyncLastDone(habit)}
                onValueChange={(v) =>
                  void updateHabit(habit.id, { syncLastDone: v })
                }
                trackColor={{ false: colors.lineStrong, true: colors.forestBright }}
                thumbColor={colors.white}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      <Pressable onPress={() => void onRemove()} style={styles.remove}>
        <Text style={styles.removeText}>Delete habit</Text>
      </Pressable>
    </ModuleScreen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  fieldLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.mute,
    marginBottom: 6,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
  },
  saveBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.forest,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    color: colors.pure,
  },
  syncRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    maxWidth: '100%',
  },
  chipOn: {
    backgroundColor: colors.forestSoft,
    borderColor: colors.forest,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.ink,
  },
  chipTextOn: {
    color: colors.forest,
  },
  remove: {
    marginTop: spacing.xl,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  removeText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.coral,
  },
});
}
