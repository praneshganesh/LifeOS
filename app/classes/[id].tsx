import { useTheme } from '@/lib/ThemeContext';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import {
  DetailChip,
  DetailChipRow,
  DetailFact,
  DetailFacts,
  DetailField,
  DetailHero,
  DetailPrimaryButton,
  DetailRemoveButton,
  DetailSection,
  DETAIL_DOCK_PAD,
} from '@/components/ui/DetailKit';
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
import { type ThemeColors, fonts, radius, spacing } from '@/constants/theme';
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

  function onSave() {
    if (!pack || !title.trim() || saving) return;
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
  }

  if (!pack) {
    return (
      <ModuleScreen
        title="Not found"
        backLabel="Classes"
        backFallbackHref="/classes"
      >
        <Text variant="body">Class pack not found.</Text>
      </ModuleScreen>
    );
  }

  const accent = colors.sky;
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

  const countLine =
    remaining == null
      ? `${used} logged · until ${formatPackWindow(pack)}`
      : `${remaining} / ${pack.total} left · until ${formatPackWindow(pack)}`;

  return (
    <ModuleScreen
      title={pack.title}
      backLabel="Classes"
      backFallbackHref="/classes"
      bottomExtra={DETAIL_DOCK_PAD}
      hero={
        <DetailHero
          eyebrow={ownerName ? `For ${ownerName}` : 'Class pack'}
          accent={accent}
          vividFallback={accent}
          editableTitle
          titleValue={title}
          onTitleChange={setTitle}
          titlePlaceholder="Pack name"
          subtitle={countLine}
          meta={[scheduleDesc, pace].filter(Boolean).join(' · ') || undefined}
        >
          <Pressable
            onPress={() => void logClass(pack.id, today).catch(saveFailed)}
            style={({ pressed }) => [
              styles.logToday,
              {
                backgroundColor: todayDone ? accent : colors.surface,
                borderColor: accent,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
            accessibilityRole="button"
          >
            <Text
              style={[
                styles.logTodayText,
                { color: todayDone ? colors.pure : accent },
              ]}
            >
              {todayDone ? 'Undo today’s class' : 'Log today’s class'}
            </Text>
          </Pressable>
        </DetailHero>
      }
    >
      <Stack.Screen options={{ headerShown: false }} />

      <DetailFacts>
        <DetailFact
          label="Used"
          value={pack.total > 0 ? `${used} of ${pack.total}` : String(used)}
        />
        {nextOcc ? (
          <DetailFact
            label="Next class"
            value={`${nextOcc.daysAhead === 0 ? 'Today' : nextOcc.daysAhead === 1 ? 'Tomorrow' : nextOcc.dayName}${pack.scheduleTime ? ` · ${pack.scheduleTime}` : ''}`}
          />
        ) : null}
        <DetailFact label="Window" value={statusLabel} last />
      </DetailFacts>

      <DetailSection label="Total classes">
        <DetailField
          value={total}
          onChangeText={(t) => setTotal(sanitizeIntegerInput(t))}
          keyboardType="number-pad"
          placeholder="Not set yet"
          accessibilityLabel="Total classes"
        />
      </DetailSection>

      <DetailSection label="Schedule days">
        <DetailChipRow>
          {SCHEDULE_DAYS.map((day) => (
            <DetailChip
              key={day.id}
              label={day.short}
              selected={scheduleDays.includes(day.id)}
              accent={accent}
              onPress={() => toggleDay(day.id)}
            />
          ))}
        </DetailChipRow>
      </DetailSection>

      <DetailSection label="Schedule time">
        <DetailField
          value={scheduleTime}
          onChangeText={setScheduleTime}
          placeholder="e.g. 10:00 AM"
          accessibilityLabel="Schedule time"
        />
      </DetailSection>

      <DetailSection label="Starts">
        <DateField
          value={pack.startsOn}
          onChange={(startsOn) => void updatePack(pack.id, { startsOn }).catch(saveFailed)}
        />
      </DetailSection>

      <DetailSection label="Ends">
        <DateField
          value={pack.endsOn}
          onChange={(endsOn) => void updatePack(pack.id, { endsOn }).catch(saveFailed)}
        />
      </DetailSection>

      {members.length ? (
        <DetailSection label="Who">
          <DetailChipRow>
            <DetailChip
              label="Unassigned"
              selected={!pack.personId}
              accent={accent}
              onPress={() =>
                void updatePack(pack.id, {
                  personId: undefined,
                  assignedTo: undefined,
                }).catch(saveFailed)
              }
            />
            {members.map((m) => (
              <DetailChip
                key={m.id}
                label={m.name}
                selected={pack.personId === m.id}
                accent={accent}
                onPress={() =>
                  void updatePack(pack.id, {
                    personId: m.id,
                    assignedTo: m.name,
                  }).catch(saveFailed)
                }
              />
            ))}
          </DetailChipRow>
        </DetailSection>
      ) : null}

      <DetailPrimaryButton
        label={saving ? 'Saving…' : 'Save details'}
        onPress={onSave}
        accent={accent}
        disabled={!title.trim() || saving}
      />

      {recent.length ? (
        <DetailSection label="Attendance" style={{ marginTop: spacing.md }}>
          <View style={[styles.logList, { backgroundColor: colors.surfaceSoft }]}>
            {recent.map((log, i) => (
              <Pressable
                key={log.id}
                onPress={() => void logClass(pack.id, log.doneAt).catch(saveFailed)}
                style={({ pressed }) => [
                  styles.logRow,
                  i < recent.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.line,
                  },
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Undo class on ${log.doneAt}`}
              >
                <Text style={[styles.logWhen, { color: colors.ink }]}>{log.doneAt}</Text>
                <Text style={[styles.logMeta, { color: colors.mute }]}>Logged · tap to undo</Text>
              </Pressable>
            ))}
          </View>
        </DetailSection>
      ) : (
        <Text style={[styles.emptyLogs, { color: colors.mute }]}>
          No classes logged yet. Use Log today, or Talk: “went to {pack.title}.”
        </Text>
      )}

      <DetailRemoveButton onPress={() => void onRemove()} />
    </ModuleScreen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    logToday: {
      marginTop: spacing.sm,
      alignSelf: 'flex-start',
      borderRadius: radius.full,
      borderWidth: 1.5,
      paddingVertical: 11,
      paddingHorizontal: 16,
    },
    logTodayText: {
      fontFamily: fonts.sansSemi,
      fontSize: 15,
      letterSpacing: -0.2,
    },
    logList: {
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    logRow: {
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
      gap: 4,
    },
    logWhen: {
      fontFamily: fonts.sansMedium,
      fontSize: 16,
      letterSpacing: -0.2,
    },
    logMeta: {
      fontFamily: fonts.sans,
      fontSize: 12,
    },
    emptyLogs: {
      fontFamily: fonts.sans,
      fontSize: 15,
      lineHeight: 22,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
  });
}
