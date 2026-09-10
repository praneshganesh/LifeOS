import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  Keyboard,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  Bell,
  Calendar,
  Check,
  Package,
  Plus,
  X,
} from 'lucide-react-native';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import { Text } from '@/components/ui/Text';
import { DateField } from '@/components/ui/DateField';
import { useLastDone } from '@/lib/LastDoneContext';
import { useInventory } from '@/lib/InventoryContext';
import { useToast } from '@/lib/ToastContext';
import {
  findMatches,
  forInventoryItem,
  getLastDoneAt,
  itemSubtitle,
  labelsMatch,
  normalizeLabel,
  parseDateInput,
  toDateInputValue,
  type LastDoneItem,
  type LogDoneInput,
  type RemindInterval,
} from '@/lib/lastDone';
import { timelineAfterMaintenance } from '@/lib/maintenanceLink';
import { groupByCategory } from '@/lib/lastDoneCategories';
import {
  LastDoneActivityCard,
  LastDoneCategoryHeader,
} from '@/components/LastDoneActivityCard';
import { type ThemeColors, colors, fonts, radius, shadows, spacing } from '@/constants/theme';
import { blurActiveElement } from '@/lib/a11y';
import { parseModuleOrigin } from '@/lib/moduleNav';

const REMIND_CHOICES: { key: string; label: string; interval: RemindInterval | null }[] = [
  { key: 'none', label: 'Don’t remind', interval: null },
  { key: '7d', label: 'In 1 week', interval: { value: 7, unit: 'days' } },
  { key: '30d', label: 'In 1 month', interval: { value: 30, unit: 'days' } },
  { key: '3m', label: 'In 3 months', interval: { value: 3, unit: 'months' } },
  { key: '6m', label: 'In 6 months', interval: { value: 6, unit: 'months' } },
  { key: '12m', label: 'In 1 year', interval: { value: 12, unit: 'months' } },
];

function shiftDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateInputValue(d);
}

function formatFriendlyDate(value: string): string {
  const today = toDateInputValue(new Date());
  const yesterday = shiftDays(-1);
  const tomorrow = shiftDays(1);
  if (!value || value === today) return 'Today';
  if (value === yesterday) return 'Yesterday';
  if (value === tomorrow) return 'Tomorrow';
  const parsed = parseDateInput(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function ActivityRow({
  item,
  onPress,
  action = 'Use',
  highlighted,
  last,
}: {
  item: LastDoneItem;
  onPress: () => void;
  action?: string;
  highlighted?: boolean;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.activityRow,
        highlighted && styles.activityRowOn,
        !last && styles.activityRowBorder,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.activityIcon, highlighted && styles.activityIconOn]}>
        <Check
          size={14}
          color={highlighted ? colors.forestOn : colors.forest}
          strokeWidth={2.4}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="headline" numberOfLines={1} style={styles.activityTitle}>
          {item.label}
        </Text>
        <Text variant="caption" numberOfLines={1} style={{ marginTop: 2 }}>
          {itemSubtitle(item)}
        </Text>
      </View>
      <Text style={[styles.useText, highlighted && styles.useTextOn]}>{action}</Text>
    </Pressable>
  );
}

export default function LastDoneModal() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { linkItemId: linkItemIdParam, mode: modeParam, from: fromParam } =
    useLocalSearchParams<{
      linkItemId?: string;
      mode?: string;
      from?: string;
    }>();
  const linkItemId =
    typeof linkItemIdParam === 'string' && linkItemIdParam.trim()
      ? linkItemIdParam.trim()
      : undefined;
  const remindMode =
    typeof modeParam === 'string' && modeParam.trim().toLowerCase() === 'remind';
  const defaultOrigin = parseModuleOrigin(fromParam) ?? (remindMode ? 'today' : 'activities');

  const { items, logDone, setReminder } = useLastDone();
  const { getById, updateItem } = useInventory();
  const { showError, showToast } = useToast();
  const linkedThing = linkItemId ? getById(linkItemId) : undefined;

  const [query, setQuery] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [doneOn, setDoneOn] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const [remindKey, setRemindKey] = useState<string | null>(null);
  const [remindOn, setRemindOn] = useState(() => shiftDays(1));
  const [remindPickerOpen, setRemindPickerOpen] = useState(false);

  const trimmed = normalizeLabel(query);

  const upcomingReminders = useMemo(
    () =>
      items
        .filter((i) => Boolean(i.remindAt))
        .sort((a, b) => String(a.remindAt).localeCompare(String(b.remindAt))),
    [items]
  );

  const linkedActivities = useMemo(
    () => (linkItemId ? forInventoryItem(items, linkItemId) : []),
    [items, linkItemId]
  );

  const matches = useMemo(() => findMatches(items, trimmed), [items, trimmed]);

  const selected = useMemo(
    () => (selectedId ? items.find((i) => i.id === selectedId) : undefined),
    [items, selectedId]
  );

  const exactMatch = useMemo(
    () => (trimmed ? items.find((item) => labelsMatch(item.label, trimmed)) : undefined),
    [items, trimmed]
  );

  const bestMatch = trimmed ? matches[0] : undefined;
  const otherMatches = bestMatch
    ? matches.filter((m) => m.id !== bestMatch.id)
    : matches;

  const canCreateNew = trimmed.length > 0 && matches.length === 0;
  const canConfirm = Boolean(selectedId) || canCreateNew;

  const remindChoice = REMIND_CHOICES.find((c) => c.key === remindKey);
  const remindSummary =
    remindKey === 'on' && remindOn
      ? formatFriendlyDate(remindOn)
      : remindChoice
        ? remindChoice.label
        : 'Off';

  const optionsActive = Boolean(doneOn) || remindKey != null;

  function buildOptions(): Pick<
    LogDoneInput,
    'doneAt' | 'remindAt' | 'remindInterval' | 'inventoryItemId'
  > {
    const opts: Pick<
      LogDoneInput,
      'doneAt' | 'remindAt' | 'remindInterval' | 'inventoryItemId'
    > = {};

    if (doneOn && parseDateInput(doneOn)) {
      opts.doneAt = doneOn;
    }

    if (linkItemId) opts.inventoryItemId = linkItemId;

    if (remindKey == null) return opts;

    if (remindKey === 'none') {
      opts.remindAt = null;
      opts.remindInterval = null;
    } else if (remindKey === 'on' && remindOn && parseDateInput(remindOn)) {
      opts.remindAt = remindOn;
      opts.remindInterval = null;
    } else if (remindChoice?.interval) {
      opts.remindInterval = remindChoice.interval;
    }

    return opts;
  }

  async function mark(payload: { id: string } | { label: string }) {
    if (saving) return;
    setSaving(true);
    try {
      blurActiveElement();
      const saved = await logDone({ ...payload, ...buildOptions() });
      const targetId = saved.inventoryItemId || linkItemId;
      if (targetId) {
        const inv = getById(targetId);
        if (inv) {
          await updateItem(targetId, {
            timeline: timelineAfterMaintenance(
              inv,
              saved.label,
              getLastDoneAt(saved)
            ),
          });
        }
      }
      if (router.canDismiss()) {
        router.dismiss();
      } else {
        router.back();
      }
    } catch (err) {
      console.error('Failed to log last-done', err);
      showError('Couldn’t save — try again.');
    } finally {
      setSaving(false);
    }
  }

  async function saveReminder() {
    if (saving || !trimmed) return;
    const when = remindOn && parseDateInput(remindOn) ? remindOn : shiftDays(1);
    setSaving(true);
    try {
      blurActiveElement();
      const saved = await setReminder({
        label: trimmed,
        remindAt: when,
        notes: notesDraft.trim() || undefined,
        inventoryItemId: linkItemId ?? null,
      });
      showToast(`Reminder set for ${formatFriendlyDate(saved.remindAt || when)}`);
      if (router.canDismiss()) router.dismiss();
      else router.back();
    } catch (err) {
      console.error('Failed to set reminder', err);
      showError('Couldn’t set reminder — try again.');
    } finally {
      setSaving(false);
    }
  }

  function onChangeQuery(text: string) {
    setQuery(text);
    const t = normalizeLabel(text);
    if (!t) {
      setSelectedId(null);
      return;
    }
    const exact = items.find((item) => labelsMatch(item.label, t));
    setSelectedId(exact?.id ?? null);
  }

  function selectExisting(id: string, label: string) {
    setQuery(label);
    setSelectedId(id);
  }

  function confirm() {
    if (selectedId) {
      void mark({ id: selectedId });
      return;
    }
    if (canCreateNew) {
      void mark({ label: trimmed });
    }
  }

  function pickDoneQuick(offsetDays: number) {
    setDoneOn(offsetDays === 0 ? '' : shiftDays(offsetDays));
  }

  function clearOptions() {
    setDoneOn('');
    setRemindKey(null);
    setRemindOn('');
    setDatePickerOpen(false);
    setRemindPickerOpen(false);
  }

  const listItems = trimmed
    ? otherMatches
    : matches.filter((m) => m.id !== selectedId);

  const browseGroups = useMemo(
    () => (!trimmed ? groupByCategory(items) : []),
    [items, trimmed]
  );

  const placeholder = linkedThing
    ? `e.g. Serviced ${linkedThing.name}`
    : 'e.g. Changed AC filter';

  const remindPlaceholder = linkedThing
    ? `e.g. Renew ${linkedThing.name}`
    : 'e.g. Mira’s payment';

  if (remindMode) {
    const canSaveReminder = trimmed.length >= 2 && Boolean(parseDateInput(remindOn));
    return (
      <ModuleScreen
        title="Set a reminder"
        subtitle="Name it, pick a future date — we’ll nudge you then."
        defaultOrigin={defaultOrigin}
      >
        <View style={[styles.composer, { marginBottom: spacing.md }]}>
          <Text
            variant="label"
            style={[styles.sectionLabel, { paddingHorizontal: spacing.lg }]}
          >
            Name
          </Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={remindPlaceholder}
            placeholderTextColor={colors.faint}
            style={styles.input}
            autoCorrect={false}
            returnKeyType="done"
            blurOnSubmit
            onSubmitEditing={() => Keyboard.dismiss()}
          />

          <View style={styles.divider} />

          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
            <Text variant="label" style={styles.sectionLabel}>
              Remind on
            </Text>
            <View style={[styles.quickRow, { marginTop: 6, marginBottom: 10 }]}>
              {[
                { label: 'Tomorrow', days: 1 },
                { label: 'In 1 week', days: 7 },
                { label: 'In 1 month', days: 30 },
              ].map((q) => {
                const value = shiftDays(q.days);
                const active = remindOn === value;
                return (
                  <Pressable
                    key={q.label}
                    onPress={() => {
                      Keyboard.dismiss();
                      setRemindOn(value);
                    }}
                    style={[styles.quickChip, active && styles.quickChipOn]}
                  >
                    <Text style={[styles.quickText, active && styles.quickTextOn]}>
                      {q.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <DateField
              value={remindOn || shiftDays(1)}
              onChange={(v) => {
                Keyboard.dismiss();
                setRemindOn(v);
              }}
              minimumDate={new Date()}
            />
          </View>

          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
            <Text variant="label" style={styles.sectionLabel}>
              Notes
            </Text>
            <TextInput
              value={notesDraft}
              onChangeText={setNotesDraft}
              placeholder="Optional — e.g. off-plan property purchase"
              placeholderTextColor={colors.faint}
              style={[styles.input, styles.notesField]}
              multiline
              blurOnSubmit
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
          </View>

          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              void saveReminder();
            }}
            disabled={saving || !canSaveReminder}
            style={({ pressed }) => [
              styles.confirmBtn,
              pressed && { opacity: 0.92 },
              (saving || !canSaveReminder) && { opacity: 0.5 },
            ]}
          >
            <Text style={styles.confirmBtnText}>
              {saving ? 'Saving…' : 'Set reminder'}
            </Text>
          </Pressable>
        </View>

        {upcomingReminders.length > 0 ? (
          <>
            <View style={styles.sectionHead}>
              <Text variant="label" style={styles.sectionLabel}>
                Upcoming
              </Text>
              <Text variant="caption">{upcomingReminders.length}</Text>
            </View>
            {upcomingReminders.map((item) => (
              <LastDoneActivityCard
                key={item.id}
                item={item}
                compact
                onOpen={() => {
                  blurActiveElement();
                  router.push(`/last-done/${item.id}` as Href);
                }}
              />
            ))}
          </>
        ) : null}
      </ModuleScreen>
    );
  }

  return (
    <ModuleScreen
      title="Just did something?"
      subtitle={
        linkedThing
          ? `Logging for ${linkedThing.name}. Type once — next time it’s here to tap.`
          : 'Type once — next time it’s here to tap.'
      }
      defaultOrigin={defaultOrigin}
    >
      {linkedThing ? (
        <View style={styles.linkChip}>
          <Package size={14} color={colors.forest} strokeWidth={2.2} />
          <Text style={styles.linkChipText} numberOfLines={1}>
            {linkedThing.name}
            {linkedThing.brand && linkedThing.brand !== '—'
              ? ` · ${linkedThing.brand}`
              : ''}
          </Text>
        </View>
      ) : null}

      <View style={styles.composer}>
        <TextInput
          value={query}
          onChangeText={onChangeQuery}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          style={styles.input}
          autoFocus
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (canConfirm) confirm();
            else if (bestMatch) selectExisting(bestMatch.id, bestMatch.label);
          }}
        />
        {bestMatch && selectedId !== bestMatch.id ? (
          <Animated.View entering={FadeInDown.duration(160)}>
            <View style={styles.divider} />
            <Pressable
              onPress={() => selectExisting(bestMatch.id, bestMatch.label)}
              style={({ pressed }) => [styles.inlineRow, pressed && styles.pressed]}
            >
              <View style={styles.inlineIconMuted}>
                <Check size={14} color={colors.forest} strokeWidth={2.4} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="caption" style={{ color: colors.forest }}>
                  Did you mean
                </Text>
                <Text
                  variant="headline"
                  numberOfLines={1}
                  style={[styles.compactHeadline, { marginTop: 1 }]}
                >
                  {bestMatch.label}
                </Text>
              </View>
              <Text style={styles.chooseText}>Use</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {selected ? (
          <Animated.View entering={FadeInDown.duration(160)}>
            <View style={styles.divider} />
            <View style={styles.inlineRow}>
              <View style={styles.inlineIcon}>
                <Check size={14} color={colors.forestOn} strokeWidth={2.4} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="caption">{itemSubtitle(selected)}</Text>
                <Text
                  variant="headline"
                  numberOfLines={1}
                  style={[styles.compactHeadline, { marginTop: 1 }]}
                >
                  {selected.label}
                </Text>
              </View>
            </View>
          </Animated.View>
        ) : null}

        {canCreateNew ? (
          <Animated.View entering={FadeInDown.duration(160)}>
            <View style={styles.divider} />
            <View style={styles.inlineRow}>
              <View style={styles.inlineIcon}>
                <Plus size={14} color={colors.forestOn} strokeWidth={2.4} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="caption" style={{ color: colors.forest }}>
                  New
                </Text>
                <Text
                  variant="headline"
                  numberOfLines={1}
                  style={[styles.compactHeadline, { marginTop: 1 }]}
                >
                  {trimmed}
                </Text>
              </View>
            </View>
          </Animated.View>
        ) : null}

        <View style={styles.divider} />

        <View style={styles.metaRow}>
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              setRemindPickerOpen(false);
              setDatePickerOpen((o) => !o);
            }}
            style={({ pressed }) => [
              styles.metaBtn,
              datePickerOpen && styles.metaBtnOn,
              pressed && styles.pressed,
            ]}
          >
            <Calendar size={13} color={colors.forest} strokeWidth={2.2} />
            <Text style={styles.metaBtnText} numberOfLines={1}>
              Done · {formatFriendlyDate(doneOn)}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              setDatePickerOpen(false);
              setRemindPickerOpen((o) => !o);
            }}
            style={({ pressed }) => [
              styles.metaBtn,
              remindPickerOpen && styles.metaBtnOn,
              pressed && styles.pressed,
            ]}
          >
            <Bell size={13} color={colors.forest} strokeWidth={2.2} />
            <Text
              style={[
                styles.metaBtnText,
                { color: remindKey ? colors.ink : colors.mute },
              ]}
              numberOfLines={1}
            >
              Remind · {remindSummary}
            </Text>
          </Pressable>
        </View>

        {datePickerOpen ? (
          <View style={styles.pickerSheet}>
            <Text variant="caption" style={styles.pickerLabel}>
              When did you do it? (past only)
            </Text>
            <View style={styles.quickRow}>
              {[
                { label: 'Today', days: 0 },
                { label: 'Yesterday', days: -1 },
                { label: '2 days ago', days: -2 },
              ].map((q) => {
                const active =
                  q.days === 0 ? !doneOn : doneOn === shiftDays(q.days);
                return (
                  <Pressable
                    key={q.label}
                    onPress={() => pickDoneQuick(q.days)}
                    style={[styles.quickChip, active && styles.quickChipOn]}
                  >
                    <Text
                      style={[styles.quickText, active && styles.quickTextOn]}
                    >
                      {q.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text variant="caption" style={styles.pickerLabel}>
              Or pick a past date
            </Text>
            <DateField
              value={doneOn || toDateInputValue(new Date())}
              onChange={(v) => {
                const today = toDateInputValue(new Date());
                setDoneOn(v === today ? '' : v);
              }}
              maximumDate={new Date()}
              embedded
            />
          </View>
        ) : null}

        {remindPickerOpen ? (
          <View style={styles.pickerSheet}>
            <Text variant="caption" style={styles.pickerLabel}>
              When should we remind you? (today or future)
            </Text>
            {REMIND_CHOICES.map((choice) => {
              const active = remindKey === choice.key;
              return (
                <Pressable
                  key={choice.key}
                  onPress={() => {
                    setRemindKey(choice.key);
                    if (choice.key !== 'on') setRemindOn('');
                  }}
                  style={[styles.choiceRow, active && styles.choiceRowOn]}
                >
                  <Text
                    style={[
                      styles.choiceText,
                      active && { color: colors.forest },
                    ]}
                  >
                    {choice.label}
                  </Text>
                  {active ? (
                    <Check size={14} color={colors.forest} strokeWidth={2.4} />
                  ) : null}
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => {
                setRemindKey('on');
                if (!remindOn) setRemindOn(shiftDays(1));
              }}
              style={[styles.choiceRow, remindKey === 'on' && styles.choiceRowOn]}
            >
              <Text
                style={[
                  styles.choiceText,
                  remindKey === 'on' && { color: colors.forest },
                ]}
              >
                On a specific date
              </Text>
              {remindKey === 'on' ? (
                <Check size={14} color={colors.forest} strokeWidth={2.4} />
              ) : null}
            </Pressable>
            {remindKey === 'on' ? (
              <>
                <View style={[styles.quickRow, { marginTop: 4 }]}>
                  {[
                    { label: 'Tomorrow', days: 1 },
                    { label: 'In 1 week', days: 7 },
                    { label: 'In 1 month', days: 30 },
                  ].map((q) => {
                    const value = shiftDays(q.days);
                    const active = remindOn === value;
                    return (
                      <Pressable
                        key={q.label}
                        onPress={() => {
                          setRemindKey('on');
                          setRemindOn(value);
                        }}
                        style={[styles.quickChip, active && styles.quickChipOn]}
                      >
                        <Text
                          style={[styles.quickText, active && styles.quickTextOn]}
                        >
                          {q.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text variant="caption" style={styles.pickerLabel}>
                  Or pick any future date
                </Text>
                <DateField
                  value={remindOn || shiftDays(1)}
                  onChange={(v) => {
                    setRemindKey('on');
                    setRemindOn(v);
                  }}
                  minimumDate={new Date()}
                  style={{ marginTop: 4 }}
                  embedded
                />
              </>
            ) : null}
          </View>
        ) : null}

        {optionsActive ? (
          <Pressable onPress={clearOptions} style={styles.clearAll}>
            <X size={11} color={colors.mute} strokeWidth={2} />
            <Text variant="caption" style={{ color: colors.mute }}>
              Clear extras
            </Text>
          </Pressable>
        ) : null}

        {canConfirm ? (
          <Pressable
            onPress={confirm}
            disabled={saving}
            style={({ pressed }) => [
              styles.confirmBtn,
              pressed && { opacity: 0.92 },
              saving && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.confirmBtnText}>
              {saving ? 'Saving…' : 'Mark done'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {trimmed && listItems.length > 0 ? (
        <>
          <View style={styles.sectionHead}>
            <Text variant="label" style={styles.sectionLabel}>
              Also close
            </Text>
            <Text variant="caption">{listItems.length}</Text>
          </View>
          <View style={styles.listCard}>
            {listItems.map((item, index) => (
              <ActivityRow
                key={item.id}
                item={item}
                last={index === listItems.length - 1}
                highlighted={selectedId === item.id}
                onPress={() => selectExisting(item.id, item.label)}
              />
            ))}
          </View>
        </>
      ) : null}

      {!trimmed && linkedActivities.length > 0 ? (
        <>
          <View style={styles.sectionHead}>
            <Text variant="label" style={styles.sectionLabel}>
              For this thing
            </Text>
            <Text variant="caption">{linkedActivities.length}</Text>
          </View>
          {linkedActivities.map((item) => (
            <LastDoneActivityCard
              key={item.id}
              item={item}
              compact
              onOpen={() => {
                selectExisting(item.id, item.label);
              }}
            />
          ))}
        </>
      ) : null}

      {!trimmed && browseGroups.length > 0 ? (
        <>
          {browseGroups.map(({ category, items: groupItems }) => (
            <View key={category.id}>
              <LastDoneCategoryHeader category={category} />
              {groupItems.map((item) => (
                <LastDoneActivityCard
                  key={item.id}
                  item={item}
                  compact
                  onOpen={() => {
                    blurActiveElement();
                    router.push(`/last-done/${item.id}` as Href);
                  }}
                />
              ))}
            </View>
          ))}
        </>
      ) : null}

      {trimmed && bestMatch && !selectedId && !exactMatch ? (
        <Pressable
          onPress={() => void mark({ label: trimmed })}
          style={({ pressed }) => [styles.addAsNew, pressed && styles.pressed]}
        >
          <Text variant="caption" style={{ color: colors.mute, textAlign: 'center' }}>
            Or add “{trimmed}” as something new
          </Text>
        </Pressable>
      ) : null}

      {!trimmed && items.length === 0 ? (
        <View style={styles.emptyList}>
          <Text variant="bodyMedium" style={{ textAlign: 'center', color: colors.mute }}>
            Nothing here yet
          </Text>
          <Text variant="caption" style={styles.emptyHint}>
            AC filter, car service, Emirates ID — type above to start.
          </Text>
        </View>
      ) : null}
    </ModuleScreen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  header: {
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.sansSemi,
    fontSize: 22,
    lineHeight: 28,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  lead: {
    marginTop: 4,
  },
  linkChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.forestWash,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.forestSoft,
  },
  linkChipText: {
    flexShrink: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.forest,
  },
  composer: {
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.forestSoft,
    paddingTop: spacing.sm,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  input: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.ink,
    paddingHorizontal: spacing.lg,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  notesField: {
    minHeight: 72,
    marginTop: 6,
    marginBottom: spacing.sm,
    paddingTop: 10,
    textAlignVertical: 'top' as const,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.forestSoft,
    marginHorizontal: spacing.lg,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  inlineIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineIconMuted: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactHeadline: {
    fontSize: 16,
    lineHeight: 20,
  },
  chooseText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.forest,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  metaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  metaBtnOn: {
    borderColor: colors.forestSoft,
    backgroundColor: colors.forestWash,
  },
  metaBtnText: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.ink,
  },
  pickerSheet: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: 6,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.white,
  },
  quickChipOn: {
    backgroundColor: colors.forest,
  },
  quickText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.slate,
  },
  quickTextOn: {
    color: colors.forestOn,
  },
  pickerLabel: {
    marginTop: 4,
    marginBottom: 2,
    color: colors.mute,
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.white,
  },
  choiceRowOn: {
    backgroundColor: colors.forestWash,
  },
  choiceText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.ink,
  },
  clearAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingBottom: 8,
  },
  confirmBtn: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.forestOn,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    color: colors.mute,
    fontSize: 16,
  },
  listCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: 'hidden',
    ...shadows.soft,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
  },
  activityRowOn: {
    backgroundColor: colors.forestWash,
  },
  activityRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  activityIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.forestSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityIconOn: {
    backgroundColor: colors.forest,
  },
  activityTitle: {
    fontSize: 16,
    lineHeight: 20,
  },
  useText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.forest,
  },
  useTextOn: {
    color: colors.forest,
  },
  addAsNew: {
    paddingVertical: spacing.md,
  },
  emptyList: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  emptyHint: {
    marginTop: spacing.sm,
    textAlign: 'center',
    maxWidth: 260,
  },
  pressed: {
    opacity: 0.9,
  },
});
}
