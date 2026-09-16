import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { KeyboardFormScroll } from '@/components/ui/KeyboardFormScroll';
import {
  DetailChip,
  DetailChipRow,
  DetailPrimaryButton,
  DetailStickyActions,
  DETAIL_STICKY_PAD,
} from '@/components/ui/DetailKit';
import {
  FormCaption,
  FormGroup,
  FormInputRow,
} from '@/components/ui/FormKit';
import { DatePillRow } from '@/components/ui/DateField';
import { TimePillRow } from '@/components/ui/TimeField';
import { PersonChips } from '@/components/PersonChips';
import { useClasses } from '@/lib/ClassesContext';
import { useToast } from '@/lib/ToastContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { selfMember } from '@/lib/people';
import { sanitizeIntegerInput } from '@/lib/currency';
import { addCalendarMonths, localDayKey } from '@/lib/dates';
import { formatScheduleTimeDisplay } from '@/lib/classSchedule';
import { SCHEDULE_DAYS, type ScheduleDay } from '@/lib/classes';
import { type ThemeColors, fonts, spacing } from '@/constants/theme';
import { Text } from '@/components/ui/Text';

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
  const [completed, setCompleted] = useState('');
  const [scheduleDays, setScheduleDays] = useState<ScheduleDay[]>([]);
  const [scheduleHhmm, setScheduleHhmm] = useState('09:00');
  const [timeTouched, setTimeTouched] = useState(false);
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
  const totalN = Math.round(Number(total.replace(/[^\d]/g, '')) || 0);
  const completedN = Math.round(Number(completed.replace(/[^\d]/g, '')) || 0);
  const canSave = Boolean(title.trim()) && totalN > 0;

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await addPack({
        title: title.trim(),
        total: totalN,
        completed: completedN > 0 ? completedN : undefined,
        scheduleDays: scheduleDays.length ? scheduleDays : undefined,
        scheduleTime: timeTouched
          ? formatScheduleTimeDisplay(scheduleHhmm)
          : undefined,
        months,
        startsOn,
        endsOn,
        personId: person?.id,
        assignedTo: person?.name,
      });
      showToast('Class added');
      if (router.canGoBack()) router.back();
      else router.replace('/classes' as Href);
    } catch {
      showError('Couldn’t save the class — try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'New class' }} />
      <KeyboardFormScroll
        contentContainerStyle={styles.content}
        bottomExtra={DETAIL_STICKY_PAD}
      >
        <FormGroup>
          <FormInputRow
            value={title}
            onChangeText={setTitle}
            placeholder="Class name"
            autoFocus
          />
          <FormInputRow
            label="Sessions"
            value={total}
            onChangeText={(t) => setTotal(sanitizeIntegerInput(t))}
            keyboardType="number-pad"
            placeholder="24"
          />
          <FormInputRow
            label="Completed"
            value={completed}
            onChangeText={(t) => setCompleted(sanitizeIntegerInput(t))}
            keyboardType="number-pad"
            placeholder="0"
            accessibilityLabel="Already completed"
            last
          />
        </FormGroup>

        <Text style={[styles.sectionLabel, { color: colors.ink }]}>Schedule</Text>
        <FormGroup>
          <View style={styles.chipPad}>
            <DetailChipRow equal>
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
          </View>
          <TimePillRow
            label="Time"
            value={scheduleHhmm}
            onChange={(v) => {
              setScheduleHhmm(v);
              setTimeTouched(true);
            }}
          />
          <DatePillRow label="Starts" value={startsOn} onChange={setStartsOn} />
          <View style={styles.chipPad}>
            <Text style={[styles.subLabel, { color: colors.mute }]}>Use within</Text>
            <DetailChipRow equal>
              {MONTH_CHIPS.map((n) => (
                <DetailChip
                  key={n}
                  label={`${n} mo`}
                  selected={months === n}
                  onPress={() => setMonths(n)}
                  accent={accent}
                />
              ))}
            </DetailChipRow>
          </View>
          <FormCaption>
            {totalN > 0
              ? `${totalN} session${totalN === 1 ? '' : 's'} until ${new Date(
                  `${endsOn}T12:00:00`
                ).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}`
              : 'Set how many sessions to see the end date'}
          </FormCaption>
        </FormGroup>

        <PersonChips
          members={members}
          personId={personId}
          onChange={setPersonId}
          noneLabel="Unassigned"
        />
      </KeyboardFormScroll>

      <DetailStickyActions>
        <DetailPrimaryButton
          label={saving ? 'Saving…' : 'Save class'}
          accent={colors.accent}
          disabled={!canSave || saving}
          onPress={() => void save()}
        />
      </DetailStickyActions>
    </Screen>
  );
}

function makeStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      gap: 0,
    },
    sectionLabel: {
      fontFamily: fonts.sansSemi,
      fontSize: 13,
      letterSpacing: 0.2,
      textTransform: 'uppercase',
      marginBottom: 8,
      marginTop: spacing.sm,
      marginLeft: 4,
    },
    subLabel: {
      fontFamily: fonts.sansMedium,
      fontSize: 13,
      letterSpacing: -0.1,
      marginBottom: 8,
    },
    chipPad: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
  });
}
