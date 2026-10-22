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
import { webConfirm } from '@/lib/webConfirm';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Trash2, Bell } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import {
  DETAIL_DOCK_PAD,
  DetailPrimaryButton,
  DetailStickyActions,
  DetailTrashButton,
} from '@/components/ui/DetailKit';
import { DotField, hubCardBg } from '@/components/ui/DotField';
import { LastDoneActivityCard } from '@/components/LastDoneActivityCard';
import { useLastDone } from '@/lib/LastDoneContext';
import { useToast } from '@/lib/ToastContext';
import { DatePillRow, OptionalDateField } from '@/components/ui/DateField';
import { TimeField } from '@/components/ui/TimeField';
import { ListCard } from '@/components/ui/ListKit';
import { FormGroup } from '@/components/ui/FormKit';
import {
  defaultActivityYear,
  dueClockForItem,
  formatInterval,
  formatRelativeDone,
  formatRemindDate,
  hasActivityHistory,
  normalizeRemindTime,
  shouldShowActivityHeatmap,
  sortLogsNewestFirst,
  toDateInputValue,
  yearsWithLogs,
  type LastDoneItem,
  type RemindInterval,
} from '@/lib/lastDone';
import { finalizeReminderLabel } from '@/lib/dates';
import {
  computeAlertSchedule,
  CUSTOM_ALERT_PRESETS,
  defaultCustomAlertSeed,
  dueDateTime,
  formatAlertFireWhen,
  userAlertsFromAutoFires,
  type AlertFire,
  type UserAlertSpec,
} from '@/lib/reminderAlerts';
import { DEFAULT_NOTIFICATION_PREFS, loadNotificationPrefs } from '@/lib/notificationPrefs';
import { categorizeLastDone, paintLastDoneCategory } from '@/lib/lastDoneCategories';
import { blurActiveElement } from '@/lib/a11y';
import { type ThemeColors, fonts, radius, shadows, spacing } from '@/constants/theme';

function specsEqual(a: UserAlertSpec | undefined, b: UserAlertSpec | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && (a.minutesBefore ?? null) === (b.minutesBefore ?? null);
}

function clockToHhmm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function hhmmToClock(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(':').map(Number);
  return {
    hour: Number.isFinite(h) ? Math.max(0, Math.min(23, h!)) : 9,
    minute: Number.isFinite(m) ? Math.max(0, Math.min(59, m!)) : 0,
  };
}

function alertFireTitle(fire: AlertFire): string {
  switch (fire.kind) {
    case 'prev_day':
      return 'Night before';
    case 'morning_of':
      return 'Morning of';
    case 'hours_before':
      return fire.minutesBefore && fire.minutesBefore >= 60
        ? `${Math.round(fire.minutesBefore / 60)}h before`
        : 'Hours before';
    case 'mins_before':
      return fire.minutesBefore != null
        ? `${fire.minutesBefore} min before`
        : 'Before';
    case 'all_day':
      return 'Morning';
    case 'all_day_followup':
      return 'Afternoon';
    case 'at_time':
      return 'At the time';
    default:
      return 'Reminder';
  }
}

function confirmDelete(message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return webConfirm({ title: 'Delete?', message, confirmLabel: 'Delete', destructive: true });
  }
  return new Promise((resolve) => {
    Alert.alert(
      'Delete?',
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

const REMIND_CHOICES: { key: string; label: string; interval: RemindInterval | null }[] = [
  { key: '7d', label: '1 wk', interval: { value: 7, unit: 'days' } },
  { key: '30d', label: '1 mo', interval: { value: 30, unit: 'days' } },
  { key: '3m', label: '3 mo', interval: { value: 3, unit: 'months' } },
  { key: '6m', label: '6 mo', interval: { value: 6, unit: 'months' } },
  { key: '12m', label: '1 yr', interval: { value: 12, unit: 'months' } },
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
  const [notesHeight, setNotesHeight] = useState(72);
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
      showError('Couldn’t rename. Try again.');
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
      showError('Couldn’t save notes. Try again.');
    }
  }

  async function onRemindDateChange(next: string) {
    if (!item || !next.trim()) return;
    try {
      await updateActivity(item.id, { remindAt: next.trim() });
      showToast('Reminder date updated');
    } catch {
      showError('Couldn’t update the date. Try again.');
    }
  }

  async function onRemindTimeChange(hhmm: string) {
    if (!item) return;
    const clock = normalizeRemindTime(hhmm);
    try {
      await updateActivity(item.id, {
        remindAt: item.remindAt || toDateInputValue(new Date()),
        remindTime: clock || null,
      });
      showToast(clock ? 'Time updated' : 'All-day reminder');
    } catch {
      showError('Couldn’t update the time. Try again.');
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
    const prev =
      item.remindInterval?.unit === 'weekdays' ? item.remindInterval : undefined;
    try {
      await updateActivity(item.id, {
        remindInterval: {
          value: 1,
          unit: 'weekdays',
          weekdays,
          hour: lastClockRef.current.hour,
          minute: lastClockRef.current.minute,
          ...(prev?.startsAt ? { startsAt: prev.startsAt } : {}),
          ...(prev?.endsAt ? { endsAt: prev.endsAt } : {}),
        },
      });
      if (announce) showToast(announce);
    } catch {
      showError('Couldn’t update days. Try again.');
    }
  }

  async function patchActiveInterval(partial: Partial<RemindInterval>, toast?: string) {
    if (!item?.remindInterval) return;
    try {
      const next: RemindInterval = { ...item.remindInterval, ...partial };
      if ('startsAt' in partial && !partial.startsAt) delete next.startsAt;
      if ('endsAt' in partial && !partial.endsAt) delete next.endsAt;
      await updateActivity(item.id, { remindInterval: next });
      if (toast) showToast(toast);
    } catch {
      showError('Couldn’t update the schedule. Try again.');
    }
  }

  async function onRhythmTimeChange(hhmm: string) {
    const clock = hhmmToClock(hhmm);
    lastClockRef.current = clock;
    await patchActiveInterval({ hour: clock.hour, minute: clock.minute }, 'Time updated');
  }

  async function onRhythmStartsAt(next: string) {
    if (!item?.remindInterval) return;
    const startsAt = next.trim() || undefined;
    const endsAt = item.remindInterval.endsAt;
    if (startsAt && endsAt && startsAt > endsAt) {
      showError('Start must be on or before the end date');
      return;
    }
    await patchActiveInterval(
      startsAt ? { startsAt } : { startsAt: undefined },
      startsAt ? 'Start date set' : 'Start date cleared'
    );
  }

  async function onRhythmEndsAt(next: string) {
    if (!item?.remindInterval) return;
    const endsAt = next.trim() || undefined;
    const startsAt = item.remindInterval.startsAt;
    if (endsAt && startsAt && endsAt < startsAt) {
      showError('End must be on or after the start date');
      return;
    }
    await patchActiveInterval(
      endsAt ? { endsAt } : { endsAt: undefined },
      endsAt ? 'End date set' : 'Ends cleared'
    );
  }

  async function onPickOff() {
    if (!item) return;
    setPickingSpecificDate(false);
    try {
      await updateActivity(item.id, { remindInterval: null });
      showToast('Reminder off');
    } catch {
      showError('Couldn’t update the reminder. Try again.');
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
      showError('Couldn’t update the reminder. Try again.');
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
    const keepEnd =
      item.remindInterval?.unit !== 'weekdays' ? item.remindInterval?.endsAt : undefined;
    try {
      await updateActivity(item.id, {
        remindInterval: {
          ...choice.interval,
          ...(keepEnd ? { endsAt: keepEnd } : {}),
        },
      });
      showToast(`Every ${choice.label}`);
    } catch {
      showError('Couldn’t update the reminder. Try again.');
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
  const showHeatmap = item ? shouldShowActivityHeatmap(item) : false;
  // One-shot reminder (Once), never "again". Recurring / plain activities keep it.
  const onceReminder = Boolean(item?.remindAt) && !item?.remindInterval;
  const finishedOnce = Boolean(item?.onceDone) && !item?.remindInterval;
  const doneLabel =
    showHistory && !onceReminder ? 'Mark done again' : 'Mark done';

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
            paddingBottom: DETAIL_DOCK_PAD + insets.bottom,
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
          <DetailTrashButton onPress={() => void onDeleteAll()} />
        </View>

        <View style={[styles.hero, { borderColor: colors.line }]}>
          <DotField tone={heroTone} />
          <View style={styles.heroFill}>
            <Text style={[styles.heroEyebrow, { color: colors.mute }]}>
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
              <Text style={[styles.heroSchedule, { color: colors.mute }]}>
                {finishedOnce ? `${scheduleLine} · Done` : scheduleLine}
              </Text>
            ) : null}
          </View>
        </View>

        {showHeatmap ? (
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
          scrollEnabled={notesHeight >= 160}
          onContentSizeChange={(e) => {
            const next = Math.ceil(e.nativeEvent.contentSize.height) + 28;
            setNotesHeight(Math.max(72, Math.min(160, next)));
          }}
          style={[
            styles.notesField,
            {
              height: notesHeight,
              color: colors.ink,
              backgroundColor: colors.surfaceSoft,
              borderColor: colors.lineStrong,
            },
          ]}
          placeholder="Add a note…"
          placeholderTextColor={colors.faint}
          onBlur={() => void commitNotes()}
        />

        <View style={styles.whenBlock}>
          <View style={styles.whenHead}>
            <Text style={[styles.whenLabel, { color: colors.ink }]}>Schedule</Text>
            {rhythmMode !== 'off' ? (
              <Pressable
                onPress={() => void onPickOff()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear schedule"
              >
                <Text style={[styles.clearLink, { color: colors.mute }]}>Clear</Text>
              </Pressable>
            ) : null}
          </View>

          <FormGroup>
            <View style={styles.modePad}>
              <View style={styles.modeRow}>
                {(
                  [
                    { key: 'once' as const, label: 'Once', onPress: () => void onPickOnce() },
                    {
                      key: 'weekdays' as const,
                      label: 'Weekly',
                      onPress: () => void onPickWeekdays(),
                    },
                    {
                      key: 'interval' as const,
                      label: 'Every',
                      onPress: () =>
                        void onPickInterval(
                          REMIND_CHOICES.find((c) => c.key === '30d') ?? REMIND_CHOICES[0]!
                        ),
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
                          backgroundColor: on ? colors.accentSoft : colors.surfaceSoft,
                          borderColor: on ? colors.ink : colors.lineStrong,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text
                        style={[
                          styles.modeChipText,
                          { color: colors.ink },
                        ]}
                      >
                        {mode.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {rhythmMode === 'once' && item.remindAt ? (
              <View>
                <DatePillRow
                  label="Due"
                  value={toDateInputValue(item.remindAt)}
                  onChange={(v) => void onRemindDateChange(v)}
                  minimumDate={new Date()}
                />
                <TimeField
                  label="Time"
                  value={normalizeRemindTime(item.remindTime) || '09:00'}
                  onChange={(v) => void onRemindTimeChange(v)}
                  last
                />
              </View>
            ) : null}

            {rhythmMode === 'weekdays' ? (
              <View style={styles.schedulePanel}>
                <View style={styles.dayPad}>
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
                              backgroundColor: on ? colors.accentSoft : colors.surfaceSoft,
                              borderColor: on ? colors.ink : colors.lineStrong,
                            },
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={`${label}${on ? ', selected' : ''}`}
                        >
                          <Text
                            style={[
                              styles.dayChipText,
                              { color: colors.ink },
                            ]}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <TimeField
                  label="Time"
                  value={clockToHhmm(
                    item.remindInterval?.hour ?? lastClockRef.current.hour,
                    item.remindInterval?.minute ?? lastClockRef.current.minute
                  )}
                  onChange={(v) => void onRhythmTimeChange(v)}
                />

                <View style={styles.rangePad}>
                  <Text style={[styles.rangeLabel, { color: colors.mute }]}>Starts</Text>
                  <OptionalDateField
                    value={item.remindInterval?.startsAt || ''}
                    onChange={(v) => void onRhythmStartsAt(v)}
                    addLabel="Choose start date"
                    minimumDate={new Date()}
                  />
                </View>

                <View style={[styles.rangePad, styles.rangePadLast]}>
                  <Text style={[styles.rangeLabel, { color: colors.mute }]}>Ends</Text>
                  <OptionalDateField
                    value={item.remindInterval?.endsAt || ''}
                    onChange={(v) => void onRhythmEndsAt(v)}
                    addLabel="Choose end date"
                    minimumDate={
                      item.remindInterval?.startsAt
                        ? new Date(item.remindInterval.startsAt + 'T12:00:00')
                        : new Date()
                    }
                  />
                </View>
              </View>
            ) : null}

            {rhythmMode === 'interval' && item.remindInterval ? (
              <View style={styles.schedulePanel}>
                <View style={styles.dayPad}>
                  <View style={styles.cadenceRow}>
                    {REMIND_CHOICES.map((choice) => {
                      const on = activeIntervalKey === choice.key;
                      return (
                        <Pressable
                          key={choice.key}
                          onPress={() => void onPickInterval(choice)}
                          style={[
                            styles.cadenceChip,
                            {
                              backgroundColor: on ? colors.accentSoft : colors.surfaceSoft,
                              borderColor: on ? colors.ink : colors.lineStrong,
                            },
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                        >
                          <Text
                            style={[
                              styles.cadenceText,
                              { color: colors.ink },
                            ]}
                            numberOfLines={1}
                          >
                            {choice.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <View style={styles.rangePad}>
                  <Text style={[styles.rangeLabel, { color: colors.mute }]}>Starts</Text>
                  <OptionalDateField
                    value={item.remindInterval.startsAt || ''}
                    onChange={(v) => void onRhythmStartsAt(v)}
                    addLabel="Choose start date"
                    minimumDate={new Date()}
                  />
                </View>
                <View style={[styles.rangePad, styles.rangePadLast]}>
                  <Text style={[styles.rangeLabel, { color: colors.mute }]}>Ends</Text>
                  <OptionalDateField
                    value={item.remindInterval.endsAt || ''}
                    onChange={(v) => void onRhythmEndsAt(v)}
                    addLabel="Choose end date"
                    minimumDate={
                      item.remindInterval.startsAt
                        ? new Date(item.remindInterval.startsAt + 'T12:00:00')
                        : new Date()
                    }
                  />
                </View>
              </View>
            ) : null}
          </FormGroup>
        </View>

        {item.remindAt && !finishedOnce && item.remindInterval?.unit !== 'weekdays' ? (
          <AlertsSection
            item={item}
            categoryColor={category.color}
            styles={styles}
            colors={colors}
            onSetAuto={async () => {
              try {
                await updateActivity(item.id, { alertMode: 'auto', userAlerts: null });
                showToast('Using automatic alerts');
              } catch {
                showError("Couldn't update alerts");
              }
            }}
            onSetCustom={async (specs: UserAlertSpec[], opts?: { toast?: boolean }) => {
              try {
                await updateActivity(item.id, {
                  alertMode: 'custom',
                  userAlerts: specs,
                });
                if (opts?.toast !== false) showToast('Custom alerts on');
              } catch {
                showError("Couldn't update alerts");
              }
            }}
          />
        ) : null}

        {showHistory ? (
          <View style={styles.logsBlock}>
            <Text style={[styles.whenLabel, { color: colors.ink }]}>
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
      </ScrollView>

      {finishedOnce ? null : (
        <DetailStickyActions>
          <DetailPrimaryButton
            label={doneLabel}
            accent={colors.accent}
            onPress={() => void logDone({ id: item.id })}
          />
        </DetailStickyActions>
      )}
    </Screen>
  );
}

function AlertsSection({
  item,
  categoryColor,
  styles,
  colors,
  onSetAuto,
  onSetCustom,
}: {
  item: LastDoneItem;
  categoryColor: string;
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
  onSetAuto: () => Promise<void>;
  onSetCustom: (
    specs: UserAlertSpec[],
    opts?: { toast?: boolean }
  ) => Promise<void>;
}) {
  const dueTime = dueClockForItem(item);
  // Optimistic mode so Custom doesn’t flash closed while persist/sync catches up.
  const [draftMode, setDraftMode] = useState<'auto' | 'custom' | null>(null);
  const savedMode = item.alertMode === 'custom' ? 'custom' : 'auto';
  const mode = draftMode ?? savedMode;

  useEffect(() => {
    if (draftMode && draftMode === savedMode) setDraftMode(null);
  }, [draftMode, savedMode]);

  const [quiet, setQuiet] = useState({
    start: DEFAULT_NOTIFICATION_PREFS.quietHoursStart,
    end: DEFAULT_NOTIFICATION_PREFS.quietHoursEnd,
  });
  useEffect(() => {
    let live = true;
    void loadNotificationPrefs().then((p) => {
      if (live) setQuiet({ start: p.quietHoursStart, end: p.quietHoursEnd });
    });
    return () => {
      live = false;
    };
  }, []);

  const fires = useMemo(
    () =>
      computeAlertSchedule({
        dueDate: item.remindAt!.slice(0, 10),
        dueTime,
        createdAt: new Date(item.createdAt),
        now: new Date(),
        alertMode: mode,
        userAlerts: item.userAlerts,
        quietHoursStart: quiet.start,
        quietHoursEnd: quiet.end,
        label: item.label,
      }),
    [item, dueTime, mode, quiet]
  );

  const presets = CUSTOM_ALERT_PRESETS.filter((p) => {
    if (p.id === 'none') return true;
    if (dueTime) return !p.allDayOnly;
    return !p.timedOnly;
  });

  function seedForCustom(): UserAlertSpec[] {
    if (item.userAlerts?.length) return item.userAlerts.slice(0, 2);
    const fromAuto = userAlertsFromAutoFires(
      computeAlertSchedule({
        dueDate: item.remindAt!.slice(0, 10),
        dueTime,
        createdAt: new Date(item.createdAt),
        alertMode: 'auto',
      }),
      dueTime
    );
    if (fromAuto.length) return fromAuto.slice(0, 2);
    return defaultCustomAlertSeed(dueTime);
  }

  async function pickSlot(slot: 0 | 1, spec: UserAlertSpec | null) {
    const slots: (UserAlertSpec | null)[] = [
      item.userAlerts?.[0] ?? null,
      item.userAlerts?.[1] ?? null,
    ];
    // First pick while Custom has nothing saved yet, start from sensible defaults,
    // then apply this tap (so Off on an empty custom stays empty).
    if (mode === 'custom' && !item.userAlerts?.length && spec) {
      const seeded = seedForCustom();
      slots[0] = seeded[0] ?? null;
      slots[1] = seeded[1] ?? null;
    }
    slots[slot] = spec;
    const next = slots.filter((s): s is UserAlertSpec => Boolean(s)).slice(0, 2);
    await onSetCustom(next, { toast: false });
  }

  return (
    <View style={styles.whenBlock}>
      <Text style={[styles.whenLabel, { color: colors.ink }]}>Alerts</Text>
      <View style={styles.modeRow}>
        {(
          [
            {
              key: 'auto' as const,
              label: 'Automatic',
              onPress: () => {
                if (mode === 'auto') return;
                setDraftMode('auto');
                void onSetAuto();
              },
            },
            {
              key: 'custom' as const,
              label: 'Custom',
              onPress: () => {
                if (mode === 'custom') return;
                setDraftMode('custom');
                void onSetCustom(seedForCustom(), { toast: true });
              },
            },
          ] as const
        ).map((opt) => {
          const on = mode === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={opt.onPress}
              style={[
                styles.modeChip,
                {
                  backgroundColor: on ? colors.accentSoft : colors.surface,
                  borderColor: on ? colors.ink : colors.lineStrong,
                },
              ]}
            >
              <Text
                style={[
                  styles.modeChipText,
                  { color: colors.ink },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {fires.length ? (
        <View
          style={[
            styles.alertSummaryCard,
            { backgroundColor: colors.surfaceSoft },
          ]}
        >
          {fires.map((f, idx) => (
            <View
              key={`${f.at.toISOString()}-${f.kind}`}
              style={[
                styles.alertFireRow,
                idx < fires.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.line,
                },
              ]}
            >
              <View
                style={[
                  styles.alertFireIcon,
                  { backgroundColor: categoryColor + '22' },
                ]}
              >
                <Bell size={16} color={categoryColor} strokeWidth={2.2} />
              </View>
              <Text
                style={[styles.alertFireTitle, { color: colors.ink }]}
                numberOfLines={1}
              >
                {alertFireTitle(f)}
              </Text>
              <Text
                style={[styles.alertFireWhen, { color: colors.mute }]}
                numberOfLines={1}
              >
                {formatAlertFireWhen(f.at)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View
          style={[styles.alertEmptyCard, { backgroundColor: colors.surfaceSoft }]}
        >
          <Text style={[styles.alertEmpty, { color: colors.mute }]}>
            {(() => {
              const due = dueDateTime(
                item.remindAt!.slice(0, 10),
                dueTime
              );
              if (due && due.getTime() <= Date.now()) {
                return 'This date has passed. Change the schedule date to see upcoming alerts.';
              }
              return 'No upcoming alerts (quiet hours, or too soon after creating).';
            })()}
          </Text>
        </View>
      )}

      {mode === 'custom' ? (
        <View style={styles.customAlerts}>
          {([0, 1] as const).map((slot) => {
            const current = item.userAlerts?.[slot];
            const offSelected = !current;
            return (
              <View key={slot} style={styles.customSlot}>
                <Text style={[styles.customSlotTitle, { color: colors.ink }]}>
                  {slot === 0 ? 'First alert' : 'Second alert'}
                </Text>
                <ListCard>
                  {presets.map((p, idx) => {
                    const selected =
                      p.spec == null
                        ? offSelected
                        : specsEqual(current, p.spec);
                    const last = idx === presets.length - 1;
                    return (
                      <Pressable
                        key={`${slot}-${p.id}`}
                        onPress={() => void pickSlot(slot, p.spec)}
                        style={[
                          styles.alertOption,
                          !last && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: colors.line,
                          },
                        ]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                      >
                        <Text
                          style={[
                            styles.alertOptionText,
                            {
                              color: selected ? colors.ink : colors.mute,
                              fontFamily: selected
                                ? fonts.sansSemi
                                : fonts.sans,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {p.label}
                        </Text>
                        <View
                          style={[
                            styles.radio,
                            {
                              borderColor: selected
                                ? categoryColor
                                : colors.lineStrong,
                              backgroundColor: selected
                                ? categoryColor
                                : 'transparent',
                            },
                          ]}
                        />
                      </Pressable>
                    );
                  })}
                </ListCard>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
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
      justifyContent: 'space-between',
      gap: spacing.md,
      marginBottom: spacing.sm,
      marginLeft: -6,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingVertical: 6,
      paddingHorizontal: 6,
      borderRadius: radius.md,
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
      borderRadius: radius.md,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: spacing.md,
      minHeight: 0,
      ...shadows.soft,
    },
    heroFill: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      gap: 4,
    },
    heroEyebrow: {
      fontFamily: fonts.sansMedium,
      fontSize: 13,
      letterSpacing: 0.2,
      marginBottom: 0,
    },
    heroTitle: {
      fontFamily: fonts.sansSemi,
      fontSize: 24,
      lineHeight: 30,
      letterSpacing: -0.5,
      padding: 0,
      margin: 0,
      backgroundColor: 'transparent',
    },
    heroSchedule: {
      fontFamily: fonts.sans,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 2,
    },
    notesField: {
      borderRadius: radius.md,
      borderWidth: 1.5,
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
      gap: 10,
    },
    whenHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 2,
    },
    whenLabel: {
      fontFamily: fonts.sansSemi,
      fontSize: 15,
      letterSpacing: -0.2,
    },
    clearLink: {
      fontFamily: fonts.sansMedium,
      fontSize: 15,
      letterSpacing: -0.2,
    },
    modePad: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    dayPad: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
    },
    rangePad: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      gap: 6,
    },
    rangePadLast: {
      paddingBottom: spacing.md,
    },
    subLabel: {
      fontFamily: fonts.sansMedium,
      fontSize: 12,
      letterSpacing: 0.2,
      marginTop: 2,
    },
    modeRow: {
      flexDirection: 'row',
      gap: 8,
      width: '100%',
    },
    modeChip: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      paddingHorizontal: 8,
      paddingVertical: 11,
      borderWidth: 1.5,
      minHeight: 44,
    },
    modeChipText: {
      fontFamily: fonts.sansSemi,
      fontSize: 15,
      letterSpacing: -0.2,
    },
    dayRow: {
      flexDirection: 'row',
      gap: 6,
      width: '100%',
    },
    dayChip: {
      flex: 1,
      minWidth: 0,
      height: 40,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
    },
    dayChipText: {
      fontFamily: fonts.sansSemi,
      fontSize: 13,
      letterSpacing: -0.2,
    },
    schedulePanel: {
      gap: 4,
      width: '100%',
    },
    rangeBlock: {
      gap: 6,
      width: '100%',
    },
    rangeLabel: {
      fontFamily: fonts.sansMedium,
      fontSize: 13,
      letterSpacing: 0.2,
    },
    cadenceRow: {
      flexDirection: 'row',
      flexWrap: 'nowrap',
      gap: 6,
      width: '100%',
    },
    cadenceChip: {
      flex: 1,
      minWidth: 0,
      borderRadius: radius.md,
      paddingHorizontal: 2,
      paddingVertical: 10,
      borderWidth: 1.5,
      minHeight: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cadenceText: {
      fontFamily: fonts.sansSemi,
      fontSize: 13,
      letterSpacing: -0.3,
    },
    alertSummaryCard: {
      marginTop: 2,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    alertFireRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
    },
    alertFireIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    alertFireTitle: {
      flexShrink: 0,
      fontFamily: fonts.sansSemi,
      fontSize: 16,
      letterSpacing: -0.2,
    },
    alertFireWhen: {
      flex: 1,
      textAlign: 'right',
      fontFamily: fonts.sans,
      fontSize: 15,
      letterSpacing: -0.1,
    },
    alertEmptyCard: {
      borderRadius: radius.md,
      padding: spacing.md,
    },
    alertEmpty: {
      fontFamily: fonts.sans,
      fontSize: 15,
      lineHeight: 21,
    },
    customAlerts: {
      gap: spacing.md,
      marginTop: 4,
    },
    customSlot: {
      gap: 8,
    },
    customSlotTitle: {
      fontFamily: fonts.sansSemi,
      fontSize: 16,
      letterSpacing: -0.2,
    },
    alertOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
      minHeight: 48,
    },
    alertOptionText: {
      flex: 1,
      fontSize: 16,
      letterSpacing: -0.2,
    },
    radio: {
      width: 20,
      height: 20,
      borderRadius: radius.md,
      borderWidth: 2,
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
