import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { KeyboardFormScroll } from '@/components/ui/KeyboardFormScroll';
import { Text } from '@/components/ui/Text';
import { DateField } from '@/components/ui/DateField';
import { PersonChips } from '@/components/PersonChips';
import { useClasses } from '@/lib/ClassesContext';
import { useToast } from '@/lib/ToastContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { selfMember } from '@/lib/people';
import { sanitizeIntegerInput } from '@/lib/currency';
import { addCalendarMonths, localDayKey } from '@/lib/dates';
import {
  SCHEDULE_DAYS,
  type ScheduleDay,
} from '@/lib/classes';
import { type ThemeColors,  colors, fonts, radius, spacing  } from '@/constants/theme';

const MONTH_CHIPS = [1, 2, 3, 6] as const;

export default function CreateClassPackScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { addPack } = useClasses();
  const { members } = useHousehold();
  const { showToast, showError } = useToast();
  const [title, setTitle] = useState('');
  const [total, setTotal] = useState('24');
  const [completed, setCompleted] = useState('0');
  const [scheduleDays, setScheduleDays] = useState<ScheduleDay[]>([]);
  const [scheduleTime, setScheduleTime] = useState('');
  const [months, setMonths] = useState(3);
  const [startsOn, setStartsOn] = useState(localDayKey());
  const [personId, setPersonId] = useState<string | null>(
    () => selfMember(members)?.id ?? null
  );
  const [saving, setSaving] = useState(false);

  const toggleDay = (dayId: ScheduleDay) => {
    setScheduleDays((prev) =>
      prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId]
    );
  };

  const endsOn = useMemo(
    () => addCalendarMonths(startsOn, months),
    [startsOn, months]
  );
  const person = members.find((m) => m.id === personId);
  // Digits only — "24 classes" or "1,500" must not turn into NaN or a
  // silently coerced 1.
  const totalN = Math.round(Number(total.replace(/[^\d]/g, '')) || 0);
  const completedN = Math.round(Number(completed.replace(/[^\d]/g, '')) || 0);
  const canSave = Boolean(title.trim()) && totalN > 0;

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const pack = await addPack({
        title: title.trim(),
        total: totalN,
        completed: completedN > 0 ? completedN : undefined,
        scheduleDays: scheduleDays.length ? scheduleDays : undefined,
        scheduleTime: scheduleTime.trim() || undefined,
        months,
        startsOn,
        endsOn,
        personId: person?.id,
        assignedTo: person?.name,
      });
      showToast('Class pack added');
      router.replace(`/classes/${pack.id}` as Href);
    } catch {
      showError('Couldn’t save the class pack — try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'New class pack' }} />
      <KeyboardFormScroll contentContainerStyle={styles.content} bottomExtra={40}>
          <Text variant="body" style={{ color: colors.mute, marginBottom: spacing.md }}>
            A finite pack — like 24 skating classes in 3 months — not a daily habit.
          </Text>

          <Text style={styles.label}>Class</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Skating, Piano, Swimming"
            placeholderTextColor={colors.faint}
            style={styles.input}
            autoFocus
          />

          <Text style={styles.label}>How many classes</Text>
          <TextInput
            value={total}
            onChangeText={(t) => setTotal(sanitizeIntegerInput(t))}
            keyboardType="number-pad"
            placeholder="24"
            placeholderTextColor={colors.faint}
            style={styles.input}
          />

          <Text style={styles.label}>Already completed (optional)</Text>
          <TextInput
            value={completed}
            onChangeText={(t) => setCompleted(sanitizeIntegerInput(t))}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.faint}
            style={styles.input}
          />

          <Text style={styles.label}>Schedule days (optional)</Text>
          <View style={styles.chips}>
            {SCHEDULE_DAYS.map((day) => {
              const on = scheduleDays.includes(day.id);
              return (
                <Pressable
                  key={day.id}
                  onPress={() => toggleDay(day.id)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {day.short}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Schedule time (optional)</Text>
          <TextInput
            value={scheduleTime}
            onChangeText={setScheduleTime}
            placeholder="e.g. 10:00 AM"
            placeholderTextColor={colors.faint}
            style={styles.input}
          />

          <Text style={styles.label}>Use within</Text>
          <View style={styles.chips}>
            {MONTH_CHIPS.map((n) => {
              const on = months === n;
              return (
                <Pressable
                  key={n}
                  onPress={() => setMonths(n)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {n} {n === 1 ? 'month' : 'months'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Starts</Text>
          <DateField value={startsOn} onChange={setStartsOn} />

          <Text style={styles.preview}>
            {totalN} classes until{' '}
            {new Date(`${endsOn}T12:00:00`).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </Text>

          <PersonChips
            members={members}
            personId={personId}
            onChange={setPersonId}
            noneLabel="Unassigned"
          />

          <Pressable
            onPress={() => void save()}
            disabled={!canSave || saving}
            style={[styles.save, (!canSave || saving) && styles.saveDisabled]}
          >
            <Text style={styles.saveText}>
              {saving ? 'Saving…' : 'Save class pack'}
            </Text>
          </Pressable>
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
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.mute,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
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
