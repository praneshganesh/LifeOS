import { useTheme } from '@/lib/ThemeContext';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import {
  DetailChip,
  DetailChipRow,
  DetailFact,
  DetailFacts,
  DetailField,
  DetailHero,
  DetailPrimaryButton,
  DetailRemoveButton,
  DetailSection,
  DETAIL_DOCK_PAD,
} from '@/components/ui/DetailKit';
import { Text } from '@/components/ui/Text';
import { HabitCard } from '@/components/HabitCard';
import { useHabits } from '@/lib/HabitsContext';
import { useInventory } from '@/lib/InventoryContext';
import { useLastDone } from '@/lib/LastDoneContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { PersonChips } from '@/components/PersonChips';
import {
  categorizeHabit,
  completionRate,
  currentStreak,
  dayKey,
  loggedOn,
  paintHabitCategory,
  shouldSyncLastDone,
} from '@/lib/habits';
import { confirmDelete } from '@/lib/confirmDelete';
import { useToast } from '@/lib/ToastContext';
import { type ThemeColors, fonts, radius, spacing } from '@/constants/theme';
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
  const { showToast, showError } = useToast();
  const saveFailed = () => showError('Couldn’t save — try again.');

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
    try {
      await removeHabit(habit.id);
    } catch {
      showError('Couldn’t delete — try again.');
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/habits' as Href);
  }

  function onSave() {
    if (!habit || !title.trim() || savingDetails) return;
    setSavingDetails(true);
    const nextTitle = title.trim();
    const nextWhy = why.trim() || undefined;
    const nextCat = categorizeHabit(nextTitle, nextWhy);
    void updateHabit(habit.id, {
      title: nextTitle,
      why: nextWhy,
      categoryId: nextCat.id,
    })
      .then(() => {
        showToast('Habit saved');
        if (router.canGoBack()) router.back();
        else router.replace('/habits' as Href);
      })
      .catch(saveFailed)
      .finally(() => setSavingDetails(false));
  }

  if (!habit) {
    return (
      <ModuleScreen
        title="Not found"
        backLabel="Habits"
        backFallbackHref="/habits"
      >
        <Text variant="body">Habit not found.</Text>
      </ModuleScreen>
    );
  }

  const cat = paintHabitCategory(habit.categoryId, colors);
  const accent = cat.color;
  const streak = currentStreak(habit);
  const rate = completionRate(habit, 30);

  return (
    <ModuleScreen
      title={habit.title}
      backLabel="Habits"
      backFallbackHref="/habits"
      bottomExtra={DETAIL_DOCK_PAD}
      hero={
        <DetailHero
          eyebrow={`${cat.emoji}  ${cat.name}`}
          accent={accent}
          vividFallback={accent}
          editableTitle
          titleValue={title}
          onTitleChange={setTitle}
          titlePlaceholder="Habit name"
          subtitle={
            streak
              ? `${streak}-day streak · ${rate}% last 30 days`
              : `${rate}% last 30 days`
          }
          meta={loggedOn(habit) ? 'Done today' : 'Not today'}
        />
      }
    >
      <Stack.Screen options={{ headerShown: false }} />

      <HabitCard
        habit={habit}
        interactive
        onCheckIn={() => void onCheckIn()}
        onToggleDay={(date) => void onToggleDay(date)}
      />

      <DetailSection label="Why">
        <DetailField
          value={why}
          onChangeText={setWhy}
          placeholder="e.g. Clear my head"
          accessibilityLabel="Why"
        />
      </DetailSection>

      <DetailSection label="Who">
        <PersonChips
          members={members}
          personId={habit.personId ?? null}
          onChange={(personId) => {
            const m = members.find((x) => x.id === personId);
            void updateHabit(habit.id, {
              personId: m?.id,
              assignedTo: m?.name,
            }).catch(saveFailed);
          }}
          noneLabel="No one"
        />
      </DetailSection>

      <DetailFacts>
        <DetailFact label="Category" value={`${cat.emoji} ${cat.name}`} />
        <DetailFact label="Streak" value={streak ? `${streak} days` : '—'} />
        <DetailFact label="Last 30 days" value={`${rate}%`} />
        <DetailFact
          label="Today"
          value={loggedOn(habit) ? 'Done' : 'Not today'}
          last={!linked}
        />
        {linked ? (
          <DetailFact
            label="Linked Thing"
            value={linked.name}
            last
          />
        ) : null}
      </DetailFacts>

      {linked ? (
        <DetailChip
          label={`Open ${linked.name}`}
          accent={accent}
          onPress={() => router.push(`/asset/${linked.id}` as Href)}
        />
      ) : null}

      {linkables.length ? (
        <DetailSection label="About a Thing?" style={{ marginTop: spacing.md }}>
          <Text variant="caption" style={{ color: colors.mute, marginBottom: 2 }}>
            Optional — link to something you own.
          </Text>
          <DetailChipRow>
            <DetailChip
              label="None"
              selected={!habit.inventoryItemId}
              accent={accent}
              onPress={() =>
                void updateHabit(habit.id, {
                  inventoryItemId: undefined,
                  syncLastDone: undefined,
                }).catch(saveFailed)
              }
            />
            {linkables.map((item) => (
              <DetailChip
                key={item.id}
                label={item.name}
                selected={habit.inventoryItemId === item.id}
                accent={accent}
                onPress={() =>
                  void updateHabit(habit.id, {
                    inventoryItemId: item.id,
                    syncLastDone: habit.syncLastDone ?? true,
                  }).catch(saveFailed)
                }
              />
            ))}
          </DetailChipRow>

          {habit.inventoryItemId ? (
            <View style={[styles.syncRow, { backgroundColor: colors.surfaceSoft }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.syncTitle, { color: colors.ink }]}>
                  Also mark it done on that Thing
                </Text>
                <Text style={[styles.syncCaption, { color: colors.mute }]}>
                  Also log Last Done on the linked Thing.
                </Text>
              </View>
              <Switch
                value={shouldSyncLastDone(habit)}
                onValueChange={(v) =>
                  void updateHabit(habit.id, { syncLastDone: v }).catch(saveFailed)
                }
                trackColor={{ false: colors.lineStrong, true: accent }}
                thumbColor={colors.white}
              />
            </View>
          ) : null}
        </DetailSection>
      ) : null}

      <DetailPrimaryButton
        label={savingDetails ? 'Saving…' : 'Save habit'}
        onPress={onSave}
        accent={accent}
        disabled={!title.trim() || savingDetails}
      />

      <DetailRemoveButton onPress={() => void onRemove()} />
    </ModuleScreen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    syncRow: {
      marginTop: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
    },
    syncTitle: {
      fontFamily: fonts.sansMedium,
      fontSize: 15,
      letterSpacing: -0.2,
    },
    syncCaption: {
      fontFamily: fonts.sans,
      fontSize: 13,
      marginTop: 2,
    },
  });
}
