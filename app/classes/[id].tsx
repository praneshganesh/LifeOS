import { useTheme } from '@/lib/ThemeContext';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { DateField } from '@/components/ui/DateField';
import { useClasses } from '@/lib/ClassesContext';
import { useHousehold } from '@/lib/HouseholdContext';
import {
  daysLeftInWindow,
  formatPackWindow,
  loggedOn,
  nextScheduledClassOccurrence,
  paceHint,
  packStatus,
  remainingCount,
  SCHEDULE_DAYS,
  type ScheduleDay,
  usedCount,
} from '@/lib/classes';
import { confirmDelete } from '@/lib/confirmDelete';
import { useToast } from '@/lib/ToastContext';
import { displayNameFor } from '@/lib/people';
import { localDayKey } from '@/lib/dates';
import { sanitizeIntegerInput } from '@/lib/currency';
import { type ThemeColors,  colors, fonts, radius, spacing  } from '@/constants/theme';
import CreateClassPackScreen from './create';

export default function ClassPackDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const router = useRouter();
  const { getById, logClass, removePack, updatePack } = useClasses();
  const { members } = useHousehold();
  const { showToast, showError } = useToast();
  const saveFailed = () => showError('Couldn’t save — try again.');

  const packEarly = id && id !== 'new' ? getById(id) : undefined;
  const [title, setTitle] = useState('');
  const [total, setTotal] = useState('');
  const [scheduleDays, setScheduleDays] = useState<ScheduleDay[]>([]);
  const [scheduleTime, setScheduleTime] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!packEarly) return;
    setTitle(packEarly.title);
    setTotal(packEarly.total > 0 ? String(packEarly.total) : '');
    setScheduleDays(packEarly.scheduleDays || []);
    setScheduleTime(packEarly.scheduleTime || '');
  }, [
    packEarly?.id,
    packEarly?.title,
    packEarly?.total,
    packEarly?.scheduleDays,
    packEarly?.scheduleTime,
  ]);

  const toggleDay = (dayId: ScheduleDay) => {
    setScheduleDays((prev) =>
      prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId]
    );
  };

  if (id === 'new') {
    return <CreateClassPackScreen />;
  }

  const pack = packEarly;

  async function onRemove() {
    if (!pack) return;
    const ok = await confirmDelete(pack.title);
    if (!ok) return;
    try {
      await removePack(pack.id);
    } catch {
      showError('Couldn’t delete — try again.');
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/classes' as Href);
  }

  if (!pack) {
    return (
      <ModuleScreen title="Not found">
        <Text variant="body">Class pack not found.</Text>
      </ModuleScreen>
    );
  }

  const used = usedCount(pack);
  const remaining = remainingCount(pack);
  const today = localDayKey();
  const todayDone = loggedOn(pack, today);
  const status = packStatus(pack);
  const daysLeft = daysLeftInWindow(pack);
  const pace = paceHint(pack);
  const recent = [...pack.logs]
    .sort((a, b) => b.doneAt.localeCompare(a.doneAt))
    .slice(0, 12);

  const statusLabel =
    status === 'complete'
      ? 'All used'
      : status === 'expired'
        ? 'Window ended'
        : status === 'ending-soon'
          ? `Ends in ${daysLeft} days`
          : `${daysLeft} days left`;

  const ownerName = displayNameFor(members, pack.personId, pack.assignedTo);

  const nextOcc = nextScheduledClassOccurrence(pack);
  const scheduleDesc = pack.scheduleDays?.length
    ? `Every ${pack.scheduleDays
        .map((d) => SCHEDULE_DAYS.find((s) => s.id === d)?.short || d)
        .join(', ')}${pack.scheduleTime ? ` at ${pack.scheduleTime}` : ''}${pack.scheduleTimeInferred ? ' · Time assumed' : ''}`
    : undefined;

  return (
    <ModuleScreen
      title={pack.title}
      subtitle={ownerName ? `For ${ownerName}` : 'Class pack'}
    >
      <Stack.Screen options={{ title: '' }} />

      <View style={styles.hero}>
        <Text style={styles.big}>
          {remaining == null ? used : remaining}
          <Text style={styles.bigMute}>
            {pack.total > 0 ? ` / ${pack.total}` : ' logged'}
          </Text>
        </Text>
        <Text variant="caption">
          {remaining == null
            ? `classes logged · until ${formatPackWindow(pack)}`
            : `classes left · until ${formatPackWindow(pack)}`}
        </Text>
        {scheduleDesc ? (
          <Text variant="caption" style={{ marginTop: 4, color: colors.mute }}>
            {scheduleDesc}
          </Text>
        ) : null}
        {pace ? (
          <Text variant="caption" style={{ marginTop: 6, color: colors.forest }}>
            {pace}
          </Text>
        ) : null}
        <Pressable
          onPress={() => void logClass(pack.id, today).catch(saveFailed)}
          style={[styles.logToday, todayDone && styles.logTodayOn]}
        >
          <Text style={[styles.logTodayText, todayDone && styles.logTodayTextOn]}>
            {todayDone ? 'Undo today’s class' : 'Log today’s class'}
          </Text>
        </Pressable>
      </View>

      <ListCard>
        <ListRow
          title="Used"
          meta={pack.total > 0 ? `${used} of ${pack.total}` : String(used)}
        />
        {nextOcc ? (
          <ListRow
            title="Next class"
            meta={`${nextOcc.daysAhead === 0 ? 'Today' : nextOcc.daysAhead === 1 ? 'Tomorrow' : nextOcc.dayName}${pack.scheduleTime ? ` · ${pack.scheduleTime}` : ''}`}
          />
        ) : null}
        <ListRow title="Window" meta={statusLabel} last />
      </ListCard>

      <Text variant="headline" style={{ fontSize: 16, marginTop: spacing.lg }}>
        Details
      </Text>
      <Text style={styles.fieldLabel}>Name</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        style={styles.input}
        placeholderTextColor={colors.faint}
      />
      <Text style={styles.fieldLabel}>Total classes</Text>
      <TextInput
        value={total}
        onChangeText={(t) => setTotal(sanitizeIntegerInput(t))}
        keyboardType="number-pad"
        style={styles.input}
        placeholder="Not set yet"
        placeholderTextColor={colors.faint}
      />

      <Text style={styles.fieldLabel}>Schedule days</Text>
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

      <Text style={styles.fieldLabel}>Schedule time</Text>
      <TextInput
        value={scheduleTime}
        onChangeText={setScheduleTime}
        style={styles.input}
        placeholder="e.g. 10:00 AM"
        placeholderTextColor={colors.faint}
      />

      <Text style={styles.fieldLabel}>Starts</Text>
      <DateField
        value={pack.startsOn}
        onChange={(startsOn) => void updatePack(pack.id, { startsOn }).catch(saveFailed)}
      />
      <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Ends</Text>
      <DateField
        value={pack.endsOn}
        onChange={(endsOn) => void updatePack(pack.id, { endsOn }).catch(saveFailed)}
      />

      {members.length ? (
        <>
          <Text style={styles.fieldLabel}>Who</Text>
          <View style={styles.chips}>
            <Pressable
              onPress={() =>
                void updatePack(pack.id, {
                  personId: undefined,
                  assignedTo: undefined,
                }).catch(saveFailed)
              }
              style={[styles.chip, !pack.personId && styles.chipOn]}
            >
              <Text style={[styles.chipText, !pack.personId && styles.chipTextOn]}>
                Unassigned
              </Text>
            </Pressable>
            {members.map((m) => {
              const on = pack.personId === m.id;
              return (
                <Pressable
                  key={m.id}
                  onPress={() =>
                    void updatePack(pack.id, {
                      personId: m.id,
                      assignedTo: m.name,
                    }).catch(saveFailed)
                  }
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{m.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <Pressable
        onPress={() => {
          if (!title.trim() || saving) return;
          const digits = total.replace(/[^\d]/g, '');
          const parsed = Math.round(Number(digits));
          if (total.trim() && (!digits || parsed <= 0)) {
            showError('Total classes must be a number above 0.');
            return;
          }
          const nextTotal = digits && parsed > 0 ? parsed : pack.total;
          setSaving(true);
          void updatePack(pack.id, {
            title: title.trim(),
            total: nextTotal,
            scheduleDays: scheduleDays.length ? scheduleDays : undefined,
            scheduleTime: scheduleTime.trim() || undefined,
            scheduleTimeInferred: false,
          })
            .then(() => {
              showToast('Class pack saved');
              if (router.canGoBack()) router.back();
              else router.replace('/classes' as Href);
            })
            .catch(saveFailed)
            .finally(() => setSaving(false));
        }}
        disabled={!title.trim() || saving}
        style={[styles.saveBtn, (!title.trim() || saving) && { opacity: 0.45 }]}
      >
        <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save details'}</Text>
      </Pressable>

      {recent.length ? (
        <>
          <Text variant="headline" style={{ fontSize: 16, marginTop: spacing.lg }}>
            Attendance
          </Text>
          <ListCard style={{ marginTop: spacing.sm }}>
            {recent.map((log, i) => (
              <ListRow
                key={log.id}
                title={log.doneAt}
                meta="Logged"
                last={i === recent.length - 1}
                onPress={() => void logClass(pack.id, log.doneAt).catch(saveFailed)}
              />
            ))}
          </ListCard>
          <Text variant="caption" style={{ marginTop: 8 }}>
            Tap a day to undo it.
          </Text>
        </>
      ) : (
        <Text variant="body" style={{ marginTop: spacing.lg, color: colors.mute }}>
          No classes logged yet. Use Log today, or Talk: “went to {pack.title}.”
        </Text>
      )}

      <Pressable onPress={() => void onRemove()} style={styles.remove}>
        <Text style={styles.removeText}>Delete pack</Text>
      </Pressable>
    </ModuleScreen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  hero: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'flex-start',
  },
  big: {
    fontFamily: fonts.sansSemi,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.6,
    color: colors.ink,
  },
  bigMute: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.mute,
  },
  logToday: {
    marginTop: spacing.md,
    backgroundColor: colors.forestSoft,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  logTodayOn: {
    backgroundColor: colors.forest,
  },
  logTodayText: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    color: colors.forest,
  },
  logTodayTextOn: {
    color: colors.forestOn,
  },
  fieldLabel: {
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
  saveBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.forest,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    color: colors.forestOn,
  },
  remove: {
    marginTop: spacing.xl,
    paddingVertical: 14,
    alignItems: 'center',
  },
  removeText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.coral,
  },
});
}
