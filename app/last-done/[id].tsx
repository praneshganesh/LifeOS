import { useTheme } from '@/lib/ThemeContext';
import { useEffect, useMemo, useState } from 'react';
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
import {
  LastDoneActivityCard,
  LastDoneCategoryHeader,
} from '@/components/LastDoneActivityCard';
import { useLastDone } from '@/lib/LastDoneContext';
import { useToast } from '@/lib/ToastContext';
import { DateField } from '@/components/ui/DateField';
import {
  defaultActivityYear,
  formatRelativeDone,
  formatRemindDate,
  formatRemindStatus,
  hasActivityHistory,
  sortLogsNewestFirst,
  toDateInputValue,
  yearsWithLogs,
  type RemindInterval,
} from '@/lib/lastDone';
import { categorizeLastDone, paintLastDoneCategory } from '@/lib/lastDoneCategories';
import { blurActiveElement } from '@/lib/a11y';
import { type ThemeColors,  colors, fonts, radius, shadows, spacing  } from '@/constants/theme';

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
  { key: 'off', label: 'Off', interval: null },
  { key: '7d', label: '1 week', interval: { value: 7, unit: 'days' } },
  { key: '30d', label: '1 month', interval: { value: 30, unit: 'days' } },
  { key: '3m', label: '3 months', interval: { value: 3, unit: 'months' } },
  { key: '6m', label: '6 months', interval: { value: 6, unit: 'months' } },
  { key: '12m', label: '1 year', interval: { value: 12, unit: 'months' } },
];

export default function LastDoneDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
  useEffect(() => {
    if (!item) return;
    setLabelDraft(item.label);
    setNotesDraft(item.notes || '');
    setCalendarYear(defaultActivityYear(item));
    setPickingSpecificDate(Boolean(item.remindAt && !item.remindInterval));
  }, [item?.id, item?.label, item?.notes, item?.logs, item?.remindAt, item?.remindInterval]);

  const activeRemindKey = item?.remindInterval
    ? REMIND_CHOICES.find(
        (c) =>
          c.interval &&
          c.interval.value === item.remindInterval?.value &&
          c.interval.unit === item.remindInterval?.unit
      )?.key
    : item?.remindAt && !item?.remindInterval
      ? 'on'
      : pickingSpecificDate
        ? 'on'
        : 'off';

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

  async function onPickReminder(choice: (typeof REMIND_CHOICES)[number] | { key: 'on' }) {
    if (!item) return;
    if (choice.key === 'on') {
      setPickingSpecificDate(true);
      const fallback = toDateInputValue(
        new Date(Date.now() + 24 * 60 * 60 * 1000)
      );
      const next = item.remindAt && !item.remindInterval
        ? toDateInputValue(item.remindAt)
        : fallback;
      try {
        await updateActivity(item.id, { remindAt: next });
        showToast('Pick a reminder date');
      } catch {
        showError('Couldn’t update the reminder — try again.');
      }
      return;
    }
    setPickingSpecificDate(false);
    try {
      await updateActivity(item.id, { remindInterval: choice.interval });
      showToast(
        choice.interval ? `Reminder set — every ${choice.label}` : 'Reminder off'
      );
    } catch {
      showError('Couldn’t update the reminder — try again.');
    }
  }

  const logs = useMemo(
    () => (item ? sortLogsNewestFirst(item.logs ?? []) : []),
    [item]
  );

  const category = item
    ? paintLastDoneCategory(categorizeLastDone(item.label).id, colors)
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

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 12) + spacing.xs,
            paddingBottom: insets.bottom + 32,
          },
        ]}
        showsVerticalScrollIndicator={false}
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
        <LastDoneCategoryHeader category={category} />
        <LastDoneActivityCard
          item={item}
          year={calendarYear}
          onYearChange={yearsWithLogs(item).length > 1 ? setCalendarYear : undefined}
        />

        {item.remindAt ? (
          <View style={[styles.remindHero, { backgroundColor: colors.surfaceSoft, borderColor: colors.line }]}>
            <Text variant="caption" style={{ color: colors.mute }}>
              Reminds on
            </Text>
            <Text variant="headline" style={styles.remindHeroDate}>
              {formatRemindDate(item.remindAt)}
            </Text>
            <Text variant="caption" style={{ color: colors.forest }}>
              {formatRemindStatus(item.remindAt)}
              {item.remindInterval
                ? ` · every ${item.remindInterval.value} ${item.remindInterval.unit}`
                : ''}
            </Text>
          </View>
        ) : null}

        <Text variant="label" style={[styles.sectionLabel, { marginTop: spacing.sm }]}>
          Name
        </Text>
        <TextInput
          value={labelDraft}
          onChangeText={setLabelDraft}
          returnKeyType="done"
          onSubmitEditing={() => void commitRename()}
          onBlur={() => void commitRename()}
          style={styles.nameInput}
          placeholderTextColor={colors.faint}
        />

        <Text variant="label" style={[styles.sectionLabel, { marginTop: spacing.md }]}>
          Reminder notes
        </Text>
        <TextInput
          value={notesDraft}
          onChangeText={setNotesDraft}
          multiline
          style={[styles.nameInput, styles.notesInput]}
          placeholder="Extra context — e.g. off-plan property purchase"
          placeholderTextColor={colors.faint}
          onBlur={() => void commitNotes()}
        />

        {item.remindAt && !item.remindInterval ? (
          <>
            <Text variant="label" style={[styles.sectionLabel, { marginTop: spacing.md }]}>
              Remind on
            </Text>
            <Text variant="caption" style={{ color: colors.mute, marginBottom: 6 }}>
              Future dates are allowed
            </Text>
            <DateField
              value={toDateInputValue(item.remindAt)}
              onChange={(v) => void onRemindDateChange(v)}
              // No maximumDate — reminders must allow future days.
              // Min = today so overdue items can still be moved forward.
              minimumDate={new Date()}
              defaultOpen
            />
          </>
        ) : null}

        <Text variant="label" style={[styles.sectionLabel, { marginTop: spacing.md }]}>
          Repeat
        </Text>
        <View style={styles.remindChips}>
          <Pressable
            onPress={() => void onPickReminder({ key: 'on' })}
            style={[styles.remindChip, activeRemindKey === 'on' && styles.remindChipOn]}
          >
            <Text
              style={[
                styles.remindChipText,
                activeRemindKey === 'on' && styles.remindChipTextOn,
              ]}
            >
              On a date
            </Text>
          </Pressable>
          {REMIND_CHOICES.map((choice) => {
            const on = activeRemindKey === choice.key;
            return (
              <Pressable
                key={choice.key}
                onPress={() => void onPickReminder(choice)}
                style={[styles.remindChip, on && styles.remindChipOn]}
              >
                <Text style={[styles.remindChipText, on && styles.remindChipTextOn]}>
                  {choice.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {showHistory ? (
          <>
        <View style={styles.sectionHead}>
          <Text variant="label" style={styles.sectionLabel}>
            All logs
          </Text>
          <Text variant="caption">{logs.length}</Text>
        </View>

        <View style={styles.listCard}>
          {logs.map((log, index) => {
            const last = index === logs.length - 1;
            const when = formatRelativeDone(log.doneAt);
            const absolute = new Date(log.doneAt).toLocaleDateString(undefined, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });
            return (
              <View
                key={log.id}
                style={[styles.logRow, !last && styles.logRowBorder]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="headline" style={styles.logWhen}>
                    {when}
                  </Text>
                  <Text variant="caption" style={{ marginTop: 2 }}>
                    {absolute}
                  </Text>
                </View>
                <Pressable
                  onPress={() => void onDeleteLog(log.id)}
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.deleteBtn,
                    pressed && { opacity: 0.75 },
                  ]}
                  accessibilityLabel={`Delete log from ${absolute}`}
                >
                  <Trash2 size={15} color={colors.coral} strokeWidth={2} />
                </Pressable>
              </View>
            );
          })}
        </View>
          </>
        ) : null}

        <Pressable
          onPress={() => void logDone({ id: item.id })}
          style={({ pressed }) => [styles.markBtn, pressed && { opacity: 0.92 }]}
        >
          <Text style={styles.markBtnText}>
            {reminderOnly ? 'Mark as done' : 'Mark done again'}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => void onDeleteAll()}
          style={({ pressed }) => [styles.dangerBtn, pressed && { opacity: 0.85 }]}
        >
          <Trash2 size={14} color={colors.coral} strokeWidth={2} />
          <Text style={styles.dangerBtnText}>Delete activity</Text>
        </Pressable>
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
    marginBottom: spacing.xs,
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
  remindHero: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 2,
  },
  remindHeroDate: {
    fontSize: 18,
    lineHeight: 24,
    marginTop: 2,
  },
  remindLine: {
    marginTop: -4,
    marginBottom: spacing.md,
    marginLeft: 2,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionLabel: {
    color: colors.mute,
    fontSize: 16,
  },
  nameInput: {
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
    marginTop: 6,
  },
  notesInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  remindChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  remindChip: {
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  remindChipOn: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
  },
  remindChipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.slate,
  },
  remindChipTextOn: {
    color: colors.forestOn,
  },
  listCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: 'hidden',
    ...shadows.soft,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  logRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  logWhen: {
    fontSize: 16,
    lineHeight: 20,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markBtn: {
    marginTop: spacing.lg,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.forestOn,
  },
  dangerBtn: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.coralSoft,
  },
  dangerBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.coral,
  },
});
}
