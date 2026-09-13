import { useTheme } from '@/lib/ThemeContext';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Trash2 } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { DetailPrimaryButton, DetailRemoveButton } from '@/components/ui/DetailKit';
import { DotField, hubCardBg } from '@/components/ui/DotField';
import { LastDoneActivityCard } from '@/components/LastDoneActivityCard';
import { useLastDone } from '@/lib/LastDoneContext';
import { useToast } from '@/lib/ToastContext';
import { DateField } from '@/components/ui/DateField';
import {
  defaultActivityYear,
  formatInterval,
  formatRelativeDone,
  formatRemindDate,
  hasActivityHistory,
  sortLogsNewestFirst,
  toDateInputValue,
  yearsWithLogs,
  type RemindInterval,
} from '@/lib/lastDone';
import { finalizeReminderLabel } from '@/lib/dates';
import { categorizeLastDone, paintLastDoneCategory } from '@/lib/lastDoneCategories';
import { blurActiveElement } from '@/lib/a11y';
import { type ThemeColors, fonts, radius, shadows, spacing } from '@/constants/theme';

function confirmDelete(message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert('Delete?', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

const REMIND_CHOICES: { key: string; label: string; interval: RemindInterval | null }[] = [
  { key: '7d', label: '1 week', interval: { value: 7, unit: 'days' } },
  { key: '30d', label: '1 month', interval: { value: 30, unit: 'days' } },
  { key: '3m', label: '3 months', interval: { value: 3, unit: 'months' } },
  { key: '6m', label: '6 months', interval: { value: 6, unit: 'months' } },
  { key: '12m', label: '1 year', interval: { value: 12, unit: 'months' } },
];

/** Mon→Sun order for chips (JS getDay: 0=Sun … 6=Sat). */
const WEEKDAY_CHIPS: { day: number; label: string }[] = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
];

const DEFAULT_WEEKDAYS = [2, 5]; // Tue & Fri

export default function LastDoneDetailScreen() {
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const light = resolved === 'light';
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { items, remove, removeLog, logDone, updateActivity } = useLastDone();
  const { showToast, showError } = useToast();

  const item = useMemo(
    () => items.find((i) => i.id === id),
    [items, id]
  );

  const [labelDraft, setLabelDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [pickingSpecificDate, setPickingSpecificDate] = useState(false);
  /** Remember last custom days so switching away from Weekdays isn’t a one-way trip. */
  const lastWeekdaysRef = useRef<number[]>(DEFAULT_WEEKDAYS);
  const lastClockRef = useRef({ hour: 9, minute: 0 });

  useEffect(() => {
    if (!item) return;
    setLabelDraft(item.label);
    setNotesDraft(item.notes || '');
    setCalendarYear(defaultActivityYear(item));
    setPickingSpecificDate(Boolean(item.remindAt && !item.remindInterval));
    if (item.remindInterval?.unit === 'weekdays' && item.remindInterval.weekdays?.length) {
      lastWeekdaysRef.current = item.remindInterval.weekdays;
      if (item.remindInterval.hour != null) {
        lastClockRef.current.hour = item.remindInterval.hour;
      }
      if (item.remindInterval.minute != null) {
        lastClockRef.current.minute = item.remindInterval.minute;
      }
    }
    // One-shot cleanup for titles that kept command glue ("For PE uniform…")
    const cleaned = finalizeReminderLabel(item.label);
    if (cleaned !== item.label && /^(for|to|about)\s+/i.test(item.label.trim())) {
      void updateActivity(item.id, { label: cleaned }).catch(() => undefined);
    }
  }, [item?.id, item?.label, item?.notes, item?.logs, item?.remindAt, item?.remindInterval]);

  const rhythmMode: 'off' | 'once' | 'weekdays' | 'interval' = item?.remindInterval?.unit === 'weekdays'
    ? 'weekdays'
    : item?.remindInterval
      ? 'interval'
      : item?.remindAt || pickingSpecificDate
        ? 'once'
        : 'off';

  const activeIntervalKey = item?.remindInterval && item.remindInterval.unit !== 'weekdays'
    ? REMIND_CHOICES.find(
        (c) =>
          c.interval &&
          c.interval.value === item.remindInterval?.value &&
          c.interval.unit === item.remindInterval?.unit
      )?.key ?? null
    : null;

  const weekdaySet = useMemo(() => {
    if (item?.remindInterval?.unit === 'weekdays') {
      return new Set(item.remindInterval.weekdays ?? []);
    }
    return new Set(lastWeekdaysRef.current);
  }, [item?.remindInterval]);

  async function commitRename() {
    if (!item) return;
    const next = labelDraft.trim();
    if (!next || next === item.label) {
      setLabelDraft(item.label);
      return;
    }
    try {
      await updateActivity(item.id, { label: next });
      showToast('Renamed');
    } catch {
      setLabelDraft(item.label);
      showError('Couldn’t rename — try again.');
    }
  }

  async function commitNotes() {
    if (!item) return;
    const next = notesDraft.trim();
    if (next === (item.notes || '')) return;
    try {
      await updateActivity(item.id, { notes: next || null });
      showToast('Notes saved');
    } catch {
      setNotesDraft(item.notes || '');
      showError('Couldn’t save notes — try again.');
    }
  }

  async function onRemindDateChange(next: string) {
    if (!item || !next.trim()) return;
    try {
      await updateActivity(item.id, { remindAt: next.trim() });
      showToast('Reminder date updated');
    } catch {
      showError('Couldn’t update the date — try again.');
    }
  }

  async function setWeekdaysRhythm(days: number[], announce?: string) {
    if (!item) return;
    const weekdays = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
    if (!weekdays.length) {
      showError('Keep at least one day selected');
      return;
    }
    lastWeekdaysRef.current = weekdays;
    setPickingSpecificDate(false);
    try {
      await updateActivity(item.id, {
        remindInterval: {
          value: 1,
          unit: 'weekdays',
          weekdays,
          hour: lastClockRef.current.hour,
          minute: lastClockRef.current.minute,
        },
      });
      if (announce) showToast(announce);
    } catch {
      showError('Couldn’t update days — try again.');
    }
  }

  async function onPickOff() {
    if (!item) return;
    setPickingSpecificDate(false);
    try {
      await updateActivity(item.id, { remindInterval: null });
      showToast('Reminder off');
    } catch {
      showError('Couldn’t update the reminder — try again.');
    }
  }

  async function onPickOnce() {
    if (!item) return;
    setPickingSpecificDate(true);
    const fallback = toDateInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const next =
      item.remindAt && !item.remindInterval
        ? toDateInputValue(item.remindAt)
        : fallback;
    try {
      await updateActivity(item.id, { remindAt: next });
      showToast('Pick a date');
    } catch {
      showError('Couldn’t update the reminder — try again.');
    }
  }

  async function onPickWeekdays() {
    await setWeekdaysRhythm(
      lastWeekdaysRef.current.length ? lastWeekdaysRef.current : DEFAULT_WEEKDAYS,
      'Weekly days set'
    );
  }

  async function onPickInterval(choice: (typeof REMIND_CHOICES)[number]) {
    if (!item || !choice.interval) return;
    setPickingSpecificDate(false);
    try {
      await updateActivity(item.id, { remindInterval: choice.interval });
      showToast(`Every ${choice.label}`);
    } catch {
      showError('Couldn’t update the reminder — try again.');
    }
  }

  async function onToggleWeekday(day: number) {
    if (!item) return;
    if (item.remindInterval?.unit !== 'weekdays') {
      await setWeekdaysRhythm([day], 'Weekly days set');
      return;
    }
    const next = new Set(item.remindInterval.weekdays ?? []);
    if (next.has(day)) {
      if (next.size <= 1) {
        showError('Keep at least one day selected');
        return;
      }
      next.delete(day);
    } else {
      next.add(day);
    }
    await setWeekdaysRhythm([...next]);
  }

  const logs = useMemo(
    () => (item ? sortLogsNewestFirst(item.logs ?? []) : []),
    [item]
  );

  const categoryBase = item ? categorizeLastDone(item.label) : null;
  const category = categoryBase
    ? paintLastDoneCategory(categoryBase.id, colors)
    : null;
  const showHistory = item ? hasActivityHistory(item) : false;
  const reminderOnly = item ? !showHistory && Boolean(item.remindAt) : false;

  async function onDeleteLog(logId: string) {
    if (!item) return;
    const ok = await confirmDelete('Remove this log entry?');
    if (!ok) return;
    blurActiveElement();
    const wasLast = logs.length <= 1;
    await removeLog(item.id, logId);
    if (wasLast) {
      if (router.canGoBack()) router.back();
    }
  }

  async function onDeleteAll() {
    if (!item) return;
    const ok = await confirmDelete(
      `Delete “${item.label}” and all ${logs.length} log${logs.length === 1 ? '' : 's'}?`
    );
    if (!ok) return;
    blurActiveElement();
    await remove(item.id);
    if (router.canGoBack()) router.back();
  }

  function handleBack() {
    blurActiveElement();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/done' as Href);
  }

  if (!item || !category) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.missing, { paddingTop: insets.top + spacing.lg }]}>
          <Text variant="bodyMedium" style={{ color: colors.mute }}>
            This activity is gone.
          </Text>
          <Pressable onPress={handleBack} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go back</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const heroTone = {
    bg: hubCardBg(category.color, light, categoryBase!.color),
    dot: light ? 'rgba(40,36,32,0.22)' : 'rgba(255,255,255,0.18)',
  };
  const scheduleLine = item.remindInterval
    ? formatInterval(item.remindInterval)
    : item.remindAt
      ? formatRemindDate(item.remindAt)
      : null;

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 12) + spacing.xs,
            paddingBottom: insets.bottom + 120,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topNav}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [
              styles.backBtn,
              pressed && styles.backBtnPressed,
            ]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back to Activities"
          >
            <ChevronLeft size={20} color={colors.ink} strokeWidth={2.4} />
            <Text style={styles.backLabel}>Activities</Text>
          </Pressable>
        </View>

        <View style={[styles.hero, { borderColor: colors.line }]}>
          <DotField tone={heroTone} />
          <View style={styles.heroFill}>
            <Text style={[styles.heroEyebrow, { color: category.color }]}>
              {category.emoji}  {category.name}
            </Text>
            <TextInput
              value={labelDraft}
              onChangeText={setLabelDraft}
              returnKeyType="done"
              onSubmitEditing={() => void commitRename()}
              onBlur={() => void commitRename()}
              multiline
              style={[styles.heroTitle, { color: colors.ink }]}
              placeholder="What to remember"
              placeholderTextColor={colors.faint}
              accessibilityLabel="Activity name"
            />
            {scheduleLine ? (
              <Text style={[styles.heroSchedule, { color: colors.slate }]}>
                {scheduleLine}
              </Text>
            ) : null}
          </View>
        </View>

        {showHistory ? (
          <LastDoneActivityCard
            item={item}
            year={calendarYear}
            onYearChange={yearsWithLogs(item).length > 1 ? setCalendarYear : undefined}
            hideReminder
          />
        ) : null}

        <TextInput
          value={notesDraft}
          onChangeText={setNotesDraft}
          multiline
          style={[
            styles.notesField,
            { color: colors.ink, backgroundColor: colors.surfaceSoft },
          ]}
          placeholder="Add a note…"
          placeholderTextColor={colors.faint}
          onBlur={() => void commitNotes()}
        />

        <View style={styles.whenBlock}>
          <Text style={[styles.whenLabel, { color: colors.mute }]}>Rhythm</Text>
          <View style={styles.modeRow}>
            {(
              [
                { key: 'off' as const, label: 'Off', onPress: () => void onPickOff() },
                { key: 'once' as const, label: 'Once', onPress: () => void onPickOnce() },
                {
                  key: 'weekdays' as const,
                  label: 'Weekdays',
                  onPress: () => void onPickWeekdays(),
                },
              ] as const
            ).map((mode) => {
              const on = rhythmMode === mode.key;
              return (
                <Pressable
                  key={mode.key}
                  onPress={mode.onPress}
                  style={[
                    styles.modeChip,
                    {
                      backgroundColor: on ? category.color : colors.surface,
                      borderColor: on ? category.color : colors.lineStrong,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text
                    style={[
                      styles.modeChipText,
                      { color: on ? colors.pure : colors.ink },
                    ]}
                  >
                    {mode.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {rhythmMode === 'once' && item.remindAt ? (
            <DateField
              value={toDateInputValue(item.remindAt)}
              onChange={(v) => void onRemindDateChange(v)}
              minimumDate={new Date()}
              defaultOpen
            />
          ) : null}

          {rhythmMode === 'weekdays' ? (
            <View style={styles.dayRow}>
              {WEEKDAY_CHIPS.map(({ day, label }) => {
                const on = weekdaySet.has(day);
                return (
                  <Pressable
                    key={day}
                    onPress={() => void onToggleWeekday(day)}
                    style={[
                      styles.dayChip,
                      {
                        backgroundColor: on ? category.color : colors.surface,
                        borderColor: on ? category.color : colors.lineStrong,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${label}${on ? ', selected' : ''}`}
                  >
                    <Text
                      style={[
                        styles.dayChipText,
                        { color: on ? colors.pure : colors.slate },
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <Text style={[styles.subLabel, { color: colors.mute }]}>
            Or every…
          </Text>
          <View style={styles.cadenceRow}>
            {REMIND_CHOICES.map((choice) => {
              const on = rhythmMode === 'interval' && activeIntervalKey === choice.key;
              return (
                <Pressable
                  key={choice.key}
                  onPress={() => void onPickInterval(choice)}
                  style={[
                    styles.cadenceChip,
                    {
                      backgroundColor: on ? category.soft : colors.surface,
                      borderColor: on ? category.color : colors.lineStrong,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text
                    style={[
                      styles.cadenceText,
                      { color: on ? category.color : colors.slate },
                    ]}
                  >
                    {choice.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {showHistory ? (
          <View style={styles.logsBlock}>
            <Text style={[styles.whenLabel, { color: colors.mute }]}>
              Done {logs.length}×
            </Text>
            <View style={styles.logList}>
              {logs.map((log) => {
                const when = formatRelativeDone(log.doneAt);
                const absolute = new Date(log.doneAt).toLocaleDateString(undefined, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                });
                return (
                  <View key={log.id} style={styles.logRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.logWhen, { color: colors.ink }]}>
                        {when}
                      </Text>
                      <Text style={[styles.logAbs, { color: colors.mute }]}>
                        {absolute}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => void onDeleteLog(log.id)}
                      hitSlop={10}
                      style={({ pressed }) => [
                        styles.logTrash,
                        pressed && { opacity: 0.7 },
                      ]}
                      accessibilityLabel={`Delete log from ${absolute}`}
                    >
                      <Trash2 size={14} color={colors.mute} strokeWidth={2} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        <DetailPrimaryButton
          label={reminderOnly ? 'Mark done' : 'Mark done again'}
          accent={category.color}
          onPress={() => void logDone({ id: item.id })}
        />

        <DetailRemoveButton onPress={() => void onDeleteAll()} />
      </ScrollView>
    </Screen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    topNav: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.sm,
      marginLeft: -6,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingVertical: 6,
      paddingHorizontal: 6,
      borderRadius: radius.sm,
    },
    backBtnPressed: {
      opacity: 0.65,
    },
    backLabel: {
      fontFamily: fonts.sansMedium,
      fontSize: 15,
      color: colors.ink,
      letterSpacing: -0.2,
    },
    missing: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.xl,
    },
    backLink: {
      padding: spacing.sm,
    },
    backLinkText: {
      fontFamily: fonts.sansMedium,
      fontSize: 16,
      color: colors.forest,
    },
    hero: {
      borderRadius: radius.lg,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: spacing.md,
      minHeight: 168,
      ...shadows.soft,
    },
    heroFill: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.lg + 4,
      gap: 6,
    },
    heroEyebrow: {
      fontFamily: fonts.sansMedium,
      fontSize: 13,
      letterSpacing: 0.2,
      marginBottom: 4,
    },
    heroTitle: {
      fontFamily: fonts.sansSemi,
      fontSize: 26,
      lineHeight: 32,
      letterSpacing: -0.6,
      padding: 0,
      margin: 0,
      backgroundColor: 'transparent',
    },
    heroSchedule: {
      fontFamily: fonts.sans,
      fontSize: 15,
      lineHeight: 21,
      marginTop: 6,
    },
    notesField: {
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
      fontFamily: fonts.sans,
      // 16px+ avoids iOS Safari auto-zoom on focus
      fontSize: 16,
      lineHeight: 22,
      minHeight: 72,
      textAlignVertical: 'top',
      marginBottom: spacing.lg,
    },
    whenBlock: {
      marginBottom: spacing.lg,
      gap: 12,
    },
    whenLabel: {
      fontFamily: fonts.sansMedium,
      fontSize: 13,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    subLabel: {
      fontFamily: fonts.sansMedium,
      fontSize: 12,
      letterSpacing: 0.2,
      marginTop: 2,
    },
    modeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    modeChip: {
      borderRadius: radius.full,
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderWidth: 1.5,
    },
    modeChipText: {
      fontFamily: fonts.sansSemi,
      fontSize: 15,
      letterSpacing: -0.2,
    },
    dayRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    dayChip: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
    },
    dayChipText: {
      fontFamily: fonts.sansMedium,
      fontSize: 12,
      letterSpacing: -0.2,
    },
    cadenceRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    cadenceChip: {
      borderRadius: radius.full,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderWidth: 1.5,
    },
    cadenceText: {
      fontFamily: fonts.sansMedium,
      fontSize: 14,
      letterSpacing: -0.2,
    },
    logsBlock: {
      marginBottom: spacing.md,
      gap: 10,
    },
    logList: {
      gap: 2,
    },
    logRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
    },
    logWhen: {
      fontFamily: fonts.sansMedium,
      fontSize: 15,
      letterSpacing: -0.2,
    },
    logAbs: {
      fontFamily: fonts.sans,
      fontSize: 12,
      marginTop: 2,
    },
    logTrash: {
      padding: 8,
    },
  });
}
