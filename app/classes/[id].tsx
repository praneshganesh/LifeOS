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
  DetailTrashButton,
  DetailSection,
  DetailStickyActions,
  DETAIL_STICKY_PAD,
} from '@/components/ui/DetailKit';
import { Text } from '@/components/ui/Text';
import { moduleTone } from '@/lib/moduleTone';
import { DatePillRow } from '@/components/ui/DateField';
import { TimePillRow } from '@/components/ui/TimeField';
import { FormGroup } from '@/components/ui/FormKit';
import { useClasses } from '@/lib/ClassesContext';
import { useHousehold } from '@/lib/HouseholdContext';
import {
  daysLeftInWindow,
  formatPackWindow,
  loggedOn,
  nextScheduledClassOccurrence,
  packStatus,
  remainingCount,
  SCHEDULE_DAYS,
  type ScheduleDay,
  usedCount,
} from '@/lib/classes';
import {
  formatScheduleTimeDisplay,
  scheduleTimeToHhmm,
} from '@/lib/classSchedule';
import { confirmDelete } from '@/lib/confirmDelete';
import { useToast } from '@/lib/ToastContext';
import { displayNameFor } from '@/lib/people';
import { localDayKey } from '@/lib/dates';
import { sanitizeIntegerInput } from '@/lib/currency';
import { type ThemeColors, fonts, radius, spacing } from '@/constants/theme';
import CreateClassPackScreen from './create';

export default function ClassPackDetailScreen() {
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const router = useRouter();
  const { getById, logClass, removePack, updatePack } = useClasses();
  const { members } = useHousehold();
  const { showError } = useToast();
  const saveFailed = () => showError('Couldn’t save. Try again.');

  const packEarly = id && id !== 'new' ? getById(id) : undefined;
  const [title, setTitle] = useState('');
  const [total, setTotal] = useState('');
  const [scheduleDays, setScheduleDays] = useState<ScheduleDay[]>([]);
  const [scheduleHhmm, setScheduleHhmm] = useState('09:00');

  useEffect(() => {
    if (!packEarly) return;
    setTitle(packEarly.title);
    setTotal(packEarly.total > 0 ? String(packEarly.total) : '');
    setScheduleDays(packEarly.scheduleDays || []);
    setScheduleHhmm(scheduleTimeToHhmm(packEarly.scheduleTime));
  }, [
    packEarly?.id,
    packEarly?.title,
    packEarly?.total,
    packEarly?.scheduleDays,
    packEarly?.scheduleTime,
  ]);

  const toggleDay = (dayId: ScheduleDay) => {
    setScheduleDays((prev) => {
      const next = prev.includes(dayId)
        ? prev.filter((d) => d !== dayId)
        : [...prev, dayId];
      if (packEarly) {
        void updatePack(packEarly.id, {
          scheduleDays: next.length ? next : undefined,
        }).catch(saveFailed);
      }
      return next;
    });
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
      showError('Couldn’t delete. Try again.');
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/classes' as Href);
  }

  function persistTotal() {
    if (!pack) return;
    const digits = total.replace(/[^\d]/g, '');
    const parsed = Math.round(Number(digits));
    if (total.trim() && (!digits || parsed <= 0)) {
      showError('Total sessions must be a number above 0.');
      setTotal(pack.total > 0 ? String(pack.total) : '');
      return;
    }
    const nextTotal = digits && parsed > 0 ? parsed : pack.total;
    if (nextTotal === pack.total) return;
    void updatePack(pack.id, { total: nextTotal }).catch(saveFailed);
  }

  function persistTitle() {
    if (!pack) return;
    const next = title.trim();
    if (!next) {
      setTitle(pack.title);
      return;
    }
    if (next === pack.title) return;
    void updatePack(pack.id, { title: next }).catch(saveFailed);
  }

  if (!pack) {
    return (
      <ModuleScreen
        title="Not found"
        backLabel="Classes"
        backFallbackHref="/classes"
      >
        <Text variant="body">Class not found.</Text>
      </ModuleScreen>
    );
  }

  const accent = moduleTone('classes', colors, resolved === 'light').accent;
  const used = usedCount(pack);
  const remaining = remainingCount(pack);
  const today = localDayKey();
  const todayDone = loggedOn(pack, today);
  const status = packStatus(pack);
  const daysLeft = daysLeftInWindow(pack);
  const recent = [...pack.logs]
    .sort((a, b) => b.doneAt.localeCompare(a.doneAt))
    .slice(0, 12);

  const statusLabel =
    status === 'complete'
      ? 'All sessions used'
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
      : `${remaining}/${pack.total} left · until ${formatPackWindow(pack)}`;

  return (
    <ModuleScreen
      title={pack.title}
      backLabel="Classes"
      backFallbackHref="/classes"
      bottomExtra={DETAIL_STICKY_PAD}
      right={<DetailTrashButton onPress={() => void onRemove()} />}
      footer={
        <DetailStickyActions>
          <DetailPrimaryButton
            label={todayDone ? 'Undo today’s session' : 'Log session'}
            onPress={() => void logClass(pack.id, today).catch(saveFailed)}
            accent={colors.accent}
          />
        </DetailStickyActions>
      }
      hero={
        <DetailHero
          eyebrow={ownerName ? `For ${ownerName}` : 'Class'}
          accent={accent}
          vividFallback={accent}
          editableTitle
          titleValue={title}
          onTitleChange={setTitle}
          onTitleCommit={persistTitle}
          titlePlaceholder="Class name"
          subtitle={scheduleDesc || countLine}
          meta={scheduleDesc ? countLine : undefined}
        />
      }
    >
      <Stack.Screen options={{ headerShown: false }} />

      <DetailFacts>
        <DetailFact
          label="Used"
          value={
            pack.total > 0
              ? `${used} of ${pack.total} sessions`
              : `${used} session${used === 1 ? '' : 's'}`
          }
        />
        {nextOcc ? (
          <DetailFact
            label="Next session"
            value={`${nextOcc.daysAhead === 0 ? 'Today' : nextOcc.daysAhead === 1 ? 'Tomorrow' : nextOcc.dayName}${pack.scheduleTime ? ` · ${pack.scheduleTime}` : ''}`}
          />
        ) : null}
        <DetailFact label="Window" value={statusLabel} last />
      </DetailFacts>

      <DetailSection label="Total sessions">
        <DetailField
          value={total}
          onChangeText={(t) => setTotal(sanitizeIntegerInput(t))}
          onBlur={persistTotal}
          keyboardType="number-pad"
          placeholder="Not set yet"
          accessibilityLabel="Total sessions"
        />
      </DetailSection>

      <DetailSection label="Schedule">
        <FormGroup>
          <View style={styles.dayPad}>
            <DetailChipRow equal>
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
          </View>
          <TimePillRow
            label="Time"
            value={scheduleHhmm}
            onChange={(hhmm) => {
              setScheduleHhmm(hhmm);
              void updatePack(pack.id, {
                scheduleTime: formatScheduleTimeDisplay(hhmm),
                scheduleTimeInferred: false,
              }).catch(saveFailed);
            }}
          />
          <DatePillRow
            label="Starts"
            value={pack.startsOn}
            onChange={(startsOn) =>
              void updatePack(pack.id, { startsOn }).catch(saveFailed)
            }
          />
          <DatePillRow
            label="Ends"
            value={pack.endsOn}
            onChange={(endsOn) => void updatePack(pack.id, { endsOn }).catch(saveFailed)}
            last
          />
        </FormGroup>
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
                accessibilityLabel={`Undo session on ${log.doneAt}`}
              >
                <Text style={[styles.logWhen, { color: colors.ink }]}>{log.doneAt}</Text>
                <Text style={[styles.logMeta, { color: colors.mute }]}>Logged · tap to undo</Text>
              </Pressable>
            ))}
          </View>
        </DetailSection>
      ) : (
        <Text style={[styles.emptyLogs, { color: colors.mute }]}>
          No sessions logged yet. Use Log session, or Talk: “went to {pack.title}.”
        </Text>
      )}
    </ModuleScreen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    dayPad: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
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
