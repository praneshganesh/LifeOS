import { useTheme } from '@/lib/ThemeContext';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Check } from 'lucide-react-native';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { AddButton } from '@/components/ui/AddButton';
import { StatStrip } from '@/components/ui/ListKit';
import { SwipeActions } from '@/components/ui/SwipeActions';
import { Text } from '@/components/ui/Text';
import { useClasses } from '@/lib/ClassesContext';
import { useDeleteWithConfirm } from '@/lib/useDeleteWithConfirm';
import { useHousehold } from '@/lib/HouseholdContext';
import { displayNameFor } from '@/lib/people';
import {
  formatPackWindow,
  loggedOn,
  packStatus,
  remainingCount,
  usedCount,
} from '@/lib/classes';
import { localDayKey } from '@/lib/dates';
import { type ThemeColors,  colors, fonts, radius, spacing  } from '@/constants/theme';

export default function ClassesScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { packs, logClass, removePack } = useClasses();
  const deleteWithConfirm = useDeleteWithConfirm();
  const { members } = useHousehold();
  const today = localDayKey();

  const left = packs.reduce((n, p) => n + (remainingCount(p) ?? 0), 0);
  const ending = packs.filter((p) => packStatus(p) === 'ending-soon').length;

  const sorted = useMemo(
    () =>
      [...packs].sort((a, b) => {
        const ra = (remainingCount(a) ?? 1) > 0 ? 0 : 1;
        const rb = (remainingCount(b) ?? 1) > 0 ? 0 : 1;
        return ra - rb || a.title.localeCompare(b.title);
      }),
    [packs]
  );

  return (
    <ModuleScreen
      title="Classes"
      defaultOrigin="things"
      right={
        <AddButton onPress={() => router.push('/classes/create' as Href)} label="Add class" />
      }
    >
      <StatStrip
        items={[
          { label: 'Classes', value: String(packs.length) },
          { label: 'Sessions left', value: String(left) },
          { label: 'Ending soon', value: String(ending) },
        ]}
      />

      {packs.length === 0 ? (
        <ModuleSection label="Your classes">
          <Text variant="body" style={{ color: colors.mute }}>
            Add a class like “Skating, 24 sessions in 3 months.” Log a session when
            they go. Talk: “Aarav went to skating.”
          </Text>
        </ModuleSection>
      ) : (
        sorted.map((pack) => {
          const used = usedCount(pack);
          const remaining = remainingCount(pack);
          const pct = pack.total > 0 ? Math.min(1, used / pack.total) : 0;
          const todayDone = loggedOn(pack, today);
          const ownerName = displayNameFor(members, pack.personId, pack.assignedTo);
          const who = ownerName ? `${ownerName} · ` : '';
          return (
            <SwipeActions
              key={pack.id}
              onComplete={() => void logClass(pack.id, today)}
              onDelete={() => void deleteWithConfirm(pack.title, () => removePack(pack.id))}
              completeLabel={todayDone ? 'Undo' : 'Log'}
              style={styles.swipeShell}
            >
            <Pressable
              onPress={() => router.push(`/classes/${pack.id}` as Href)}
              style={styles.card}
              accessibilityRole="button"
              accessibilityLabel={pack.title}
            >
              <View style={styles.cardTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="headline" numberOfLines={1}>
                    {pack.title}
                  </Text>
                  <Text variant="caption" style={{ marginTop: 4 }}>
                    {who}
                    {pack.total > 0
                      ? `${used} of ${pack.total} sessions · until ${formatPackWindow(pack)}`
                      : `${used} logged · until ${formatPackWindow(pack)}`}
                  </Text>
                </View>
                <Pressable
                  onPress={() => void logClass(pack.id, today)}
                  hitSlop={12}
                  style={({ pressed }) => [
                    styles.logRing,
                    todayDone && styles.logRingOn,
                    pressed && { opacity: 0.6 },
                  ]}
                  accessibilityLabel={
                    todayDone ? 'Undo today’s session' : 'Log session today'
                  }
                >
                  {todayDone ? (
                    <Check size={13} color={colors.forestOn} strokeWidth={3} />
                  ) : null}
                </Pressable>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct * 100}%` }]} />
              </View>
              <Text variant="caption" style={{ marginTop: 8, color: colors.forest }}>
                {remaining == null
                  ? 'Set session count'
                  : `${remaining} session${remaining === 1 ? '' : 's'} left`}
              </Text>
            </Pressable>
            </SwipeActions>
          );
        })
      )}
    </ModuleScreen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  swipeShell: {
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logRingOn: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
  },
  track: {
    height: 6,
    borderRadius: 99,
    backgroundColor: colors.surfaceSoft,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 99,
    backgroundColor: colors.forest,
  },
});
}
