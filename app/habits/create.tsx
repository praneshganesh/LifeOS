import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { Check } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { KeyboardFormScroll } from '@/components/ui/KeyboardFormScroll';
import {
  DetailChip,
  DetailChipRow,
  DetailField,
  DetailPrimaryButton,
  DetailSection,
  DETAIL_DOCK_PAD,
} from '@/components/ui/DetailKit';
import { Text } from '@/components/ui/Text';
import { useHabits } from '@/lib/HabitsContext';
import { useToast } from '@/lib/ToastContext';
import { useInventory } from '@/lib/InventoryContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { PersonChips } from '@/components/PersonChips';
import { dayKey } from '@/lib/habits';
import { type ThemeColors, fonts, radius, spacing } from '@/constants/theme';

export default function CreateHabitScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { addHabit, checkIn } = useHabits();
  const { items } = useInventory();
  const { members } = useHousehold();
  const { showToast, showError } = useToast();
  const [title, setTitle] = useState('');
  const [why, setWhy] = useState('');
  const [linkId, setLinkId] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [doneToday, setDoneToday] = useState(true);
  const [saving, setSaving] = useState(false);
  const person = members.find((m) => m.id === personId);
  const accent = colors.forest;

  const linkables = useMemo(
    () =>
      items
        .filter((i) => !i.isDocument)
        .slice(0, 40)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [items]
  );

  async function save() {
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const habit = await addHabit({
        title: trimmed,
        why: why.trim() || undefined,
        personId: person?.id,
        assignedTo: person?.name,
        inventoryItemId: linkId || undefined,
        syncLastDone: linkId ? true : undefined,
      });
      if (doneToday) {
        await checkIn(habit.id, dayKey());
      }
      // Land on the new habit so the form clearly “did something”
      showToast('Habit added');
      router.replace(`/habits/${habit.id}` as Href);
    } catch {
      showError('Couldn’t save the habit — try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'New habit' }} />
      <KeyboardFormScroll contentContainerStyle={styles.content} bottomExtra={DETAIL_DOCK_PAD}>
        <DetailSection label="Habit">
          <DetailField
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Walk, Gym, Read"
            autoFocus
          />
        </DetailSection>

        <DetailSection label="Why">
          <DetailField
            value={why}
            onChangeText={setWhy}
            placeholder="e.g. Clear my head after work"
          />
        </DetailSection>

        <View style={styles.whoBlock}>
          <PersonChips
            members={members}
            personId={personId}
            onChange={setPersonId}
            noneLabel="No one"
          />
        </View>

        <Pressable
          onPress={() => setDoneToday((v) => !v)}
          style={[
            styles.doneRow,
            {
              backgroundColor: doneToday ? colors.forestSoft : colors.surfaceSoft,
              borderColor: doneToday ? accent : colors.lineStrong,
            },
          ]}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: doneToday }}
        >
          <View
            style={[
              styles.doneBox,
              {
                borderColor: doneToday ? accent : colors.lineStrong,
                backgroundColor: doneToday ? accent : colors.surface,
              },
            ]}
          >
            {doneToday ? (
              <Check size={14} color={colors.forestOn} strokeWidth={3} />
            ) : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.doneTitle, { color: colors.ink }]}>
              I already did this today
            </Text>
          </View>
        </Pressable>

        {linkables.length ? (
          <DetailSection label="About a Thing?">
            <DetailChipRow>
              <DetailChip
                label="None"
                selected={!linkId}
                onPress={() => setLinkId(null)}
                accent={accent}
              />
              {linkables.map((item) => (
                <DetailChip
                  key={item.id}
                  label={item.name}
                  selected={linkId === item.id}
                  onPress={() => setLinkId(item.id)}
                  accent={accent}
                />
              ))}
            </DetailChipRow>
          </DetailSection>
        ) : null}

        <DetailPrimaryButton
          label={saving ? 'Saving…' : doneToday ? 'Save & log today' : 'Save habit'}
          accent={accent}
          disabled={!title.trim() || saving}
          onPress={() => void save()}
        />
      </KeyboardFormScroll>
    </Screen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
    },
    whoBlock: {
      marginBottom: spacing.sm,
    },
    doneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.sm,
      marginBottom: spacing.lg,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1.5,
    },
    doneBox: {
      width: 24,
      height: 24,
      borderRadius: 8,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    doneTitle: {
      fontFamily: fonts.sansMedium,
      fontSize: 16,
    },
  });
}
