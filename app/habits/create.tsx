import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useHabits } from '@/lib/HabitsContext';
import { useToast } from '@/lib/ToastContext';
import { useInventory } from '@/lib/InventoryContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { PersonChips } from '@/components/PersonChips';
import { categorizeHabit, dayKey } from '@/lib/habits';
import { type ThemeColors,  colors, fonts, radius, spacing  } from '@/constants/theme';

export default function CreateHabitScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
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

  const preview = title.trim() ? categorizeHabit(title, why) : null;
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>Habit</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Walk, Gym, Read"
            placeholderTextColor={colors.faint}
            style={styles.input}
            autoFocus
          />

          <Text style={styles.label}>Why (optional)</Text>
          <TextInput
            value={why}
            onChangeText={setWhy}
            placeholder="e.g. Clear my head after work"
            placeholderTextColor={colors.faint}
            style={styles.input}
          />

          {preview ? (
            <Text style={styles.preview}>
              Category → {preview.emoji} {preview.name}
            </Text>
          ) : null}

          <PersonChips
            members={members}
            personId={personId}
            onChange={setPersonId}
            noneLabel="No one"
          />

          <Pressable
            onPress={() => setDoneToday((v) => !v)}
            style={[styles.doneRow, doneToday && styles.doneRowOn]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: doneToday }}
          >
            <View style={[styles.doneBox, doneToday && styles.doneBoxOn]}>
              {doneToday ? (
                <Check size={14} color={colors.forestOn} strokeWidth={3} />
              ) : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.doneTitle}>I already did this today</Text>
              <Text variant="caption">Logs today as the first check-in.</Text>
            </View>
          </Pressable>

          {linkables.length ? (
            <>
              <Text style={styles.label}>About a Thing? (optional)</Text>
              <Text variant="caption" style={styles.hint}>
                Only for habits tied to something you own — e.g. Service the AC. Skip for Walk.
              </Text>
              <View style={styles.chips}>
                <Pressable
                  onPress={() => setLinkId(null)}
                  style={[styles.chip, !linkId && styles.chipOn]}
                >
                  <Text style={[styles.chipText, !linkId && styles.chipTextOn]}>
                    None
                  </Text>
                </Pressable>
                {linkables.map((item) => {
                  const on = linkId === item.id;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => setLinkId(item.id)}
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
            </>
          ) : null}

          <Pressable
            onPress={() => void save()}
            disabled={!title.trim() || saving}
            style={[styles.save, (!title.trim() || saving) && styles.saveDisabled]}
          >
            <Text style={styles.saveText}>
              {saving ? 'Saving…' : doneToday ? 'Save & log today' : 'Save habit'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.mute,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  hint: {
    marginTop: -4,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
  },
  preview: {
    marginTop: spacing.md,
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.forest,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
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
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  doneRowOn: {
    borderColor: colors.forest,
    backgroundColor: colors.forestSoft,
  },
  doneBox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  doneBoxOn: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
  },
  doneTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.ink,
  },
  save: {
    marginTop: spacing.xl,
    backgroundColor: colors.forest,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveDisabled: {
    opacity: 0.45,
  },
  saveText: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    color: colors.forestOn,
  },
});
}
