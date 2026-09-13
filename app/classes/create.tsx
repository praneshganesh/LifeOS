import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
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
import { type ThemeColors, fonts, spacing } from '@/constants/theme';

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
  const accent = colors.sky;

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
      <KeyboardFormScroll contentContainerStyle={styles.content} bottomExtra={DETAIL_DOCK_PAD}>
        <DetailSection label="Class">
          <DetailField
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Skating, Piano, Swimming"
            autoFocus
          />
        </DetailSection>

        <DetailSection label="How many classes">
          <DetailField
            value={total}
            onChangeText={(t) => setTotal(sanitizeIntegerInput(t))}
            keyboardType="number-pad"
            placeholder="24"
          />
        </DetailSection>

        <DetailSection label="Already completed">
          <DetailField
            value={completed}
            onChangeText={(t) => setCompleted(sanitizeIntegerInput(t))}
            keyboardType="number-pad"
            placeholder="0"
          />
        </DetailSection>

        <DetailSection label="Schedule days">
          <DetailChipRow>
            {SCHEDULE_DAYS.map((day) => (
              <DetailChip
                key={day.id}
                label={day.short}
                selected={scheduleDays.includes(day.id)}
                onPress={() => toggleDay(day.id)}
                accent={accent}
              />
            ))}
          </DetailChipRow>
        </DetailSection>

        <DetailSection label="Schedule time">
          <DetailField
            value={scheduleTime}
            onChangeText={setScheduleTime}
            placeholder="e.g. 10:00 AM"
          />
        </DetailSection>

        <DetailSection label="Use within">
          <DetailChipRow>
            {MONTH_CHIPS.map((n) => (
              <DetailChip
                key={n}
                label={`${n} ${n === 1 ? 'month' : 'months'}`}
                selected={months === n}
                onPress={() => setMonths(n)}
                accent={accent}
              />
            ))}
          </DetailChipRow>
        </DetailSection>

        <DetailSection label="Starts">
          <DateField value={startsOn} onChange={setStartsOn} />
        </DetailSection>

        <DetailSection label="Window">
          <Text style={{ color: accent, fontFamily: fonts.sansMedium, fontSize: 15 }}>
            {totalN} classes until{' '}
            {new Date(`${endsOn}T12:00:00`).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </Text>
        </DetailSection>

        <PersonChips
          members={members}
          personId={personId}
          onChange={setPersonId}
          noneLabel="Unassigned"
        />

        <DetailPrimaryButton
          label={saving ? 'Saving…' : 'Save class pack'}
          accent={accent}
          disabled={!canSave || saving}
          onPress={() => void save()}
        />
      </KeyboardFormScroll>
    </Screen>
  );
}

function makeStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
    },
  });
}
