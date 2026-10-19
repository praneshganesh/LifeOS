import { useTheme } from '@/lib/ThemeContext';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Pressable, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Check } from 'lucide-react-native';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import {
  DetailChip,
  DetailField,
  DetailHero,
  DetailPrimaryButton,
  DetailTrashButton,
  DetailSection,
  DetailStickyActions,
  DETAIL_STICKY_PAD,
} from '@/components/ui/DetailKit';
import { Text } from '@/components/ui/Text';
import { HabitCard } from '@/components/HabitCard';
import { useHabits } from '@/lib/HabitsContext';
import { useInventory } from '@/lib/InventoryContext';
import { useLastDone } from '@/lib/LastDoneContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { PersonChips } from '@/components/PersonChips';
import { ThingLinkPicker } from '@/components/ThingLinkPicker';
import {
  categorizeHabit,
  currentStreak,
  dayKey,
  loggedOn,
  paintHabitCategory,
  shouldSyncLastDone,
} from '@/lib/habits';
import { confirmDelete } from '@/lib/confirmDelete';
import { useToast } from '@/lib/ToastContext';
import { fonts, radius, spacing } from '@/constants/theme';
import CreateHabitScreen from './create';

export default function HabitDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(), []);
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const router = useRouter();
  const { getById, checkIn, removeHabit, updateHabit } = useHabits();
  const { getById: getItem, items } = useInventory();
  const { logDone } = useLastDone();
  const { members } = useHousehold();
  const { showToast, showError } = useToast();
  const saveFailed = () => showError('Couldn’t save. Try again.');

  const linkables = useMemo(
    () =>
      items
        .filter((i) => !i.isDocument)
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
      showError('Couldn’t delete. Try again.');
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

  return (
    <ModuleScreen
      title={habit.title}
      backLabel="Habits"
      backFallbackHref="/habits"
      bottomExtra={DETAIL_STICKY_PAD}
      right={<DetailTrashButton onPress={() => void onRemove()} />}
      footer={
        <DetailStickyActions>
          <DetailPrimaryButton
            label={savingDetails ? 'Saving…' : 'Save habit'}
            onPress={onSave}
            accent={accent}
            disabled={!title.trim() || savingDetails}
          />
        </DetailStickyActions>
      }
      hero={
        <DetailHero
          eyebrow={`${cat.emoji}  ${cat.name}`}
          accent={accent}
          vividFallback={accent}
          editableTitle
          titleValue={title}
          onTitleChange={setTitle}
          titlePlaceholder="Habit name"
          trailing={
            <View style={styles.stat} accessibilityLabel={`${streak}-day streak`}>
              <Text style={[styles.statValue, { color: colors.ink }]}>{streak}</Text>
              <Text style={[styles.statLabel, { color: colors.ink }]}>day streak</Text>
            </View>
          }
        />
      }
    >
      <Stack.Screen options={{ headerShown: false }} />

      <HabitCard
        habit={habit}
        interactive
        showRangeToggle
        onCheckIn={() => void onCheckIn()}
        onToggleDay={(date) => void onToggleDay(date)}
      />

      <Pressable
        onPress={() => void onCheckIn()}
        style={({ pressed }) => [
          styles.todayRow,
          {
            backgroundColor: loggedOn(habit) ? colors.accentSoft : colors.surfaceSoft,
            borderColor: loggedOn(habit) ? colors.accent : colors.lineStrong,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: loggedOn(habit) }}
        accessibilityLabel={loggedOn(habit) ? 'Done today. Tap to undo.' : 'Not done today. Tap to mark done.'}
      >
        <View
          style={[
            styles.todayBox,
            {
              borderColor: loggedOn(habit) ? colors.accent : colors.lineStrong,
              backgroundColor: loggedOn(habit) ? colors.accent : colors.surface,
            },
          ]}
        >
          {loggedOn(habit) ? (
            <Check size={11} color={colors.accentOn} strokeWidth={3} />
          ) : null}
        </View>
        <Text style={[styles.todayTitle, { color: colors.ink }]}>
          {loggedOn(habit) ? 'Done today' : 'Mark done today'}
        </Text>
      </Pressable>

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
          label=""
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

      {linked ? (
        <DetailChip
          label={`Open ${linked.name}`}
          accent={accent}
          onPress={() => router.push(`/asset/${linked.id}` as Href)}
        />
      ) : null}

      {linkables.length || habit.inventoryItemId ? (
        <DetailSection label="About a Thing?">
          <ThingLinkPicker
            items={linkables}
            selectedId={habit.inventoryItemId}
            selectedName={linked?.name}
            onSelect={(next) =>
              void updateHabit(habit.id, {
                inventoryItemId: next ?? undefined,
                syncLastDone: next ? (habit.syncLastDone ?? true) : undefined,
              }).catch(saveFailed)
            }
          />

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
    </ModuleScreen>
  );
}

function makeStyles() {
  return StyleSheet.create({
    stat: {
      alignItems: 'flex-end',
      flexShrink: 0,
      minWidth: 72,
    },
    statValue: {
      fontFamily: fonts.sansSemi,
      fontSize: 34,
      lineHeight: 36,
      letterSpacing: -1,
    },
    statLabel: {
      fontFamily: fonts.sansMedium,
      fontSize: 11,
      letterSpacing: -0.1,
      opacity: 0.72,
      marginTop: 1,
    },
    todayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderWidth: 1.5,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      marginTop: spacing.xs,
      marginBottom: spacing.xl,
    },
    todayBox: {
      width: 18,
      height: 18,
      borderRadius: 5,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    todayTitle: {
      fontFamily: fonts.sansMedium,
      fontSize: 15,
      letterSpacing: -0.2,
    },
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
