import { useTheme } from '@/lib/ThemeContext';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { StatStrip } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useClasses } from '@/lib/ClassesContext';
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
  const { packs, logClass } = useClasses();
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
        <Pressable
          onPress={() => router.push('/classes/create' as Href)}
          style={styles.addBtn}
          accessibilityLabel="Add class pack"
        >
          <Plus size={18} color={colors.forest} strokeWidth={2.2} />
          <Text style={styles.addLabel}>Add</Text>
        </Pressable>
      }
    >
      <StatStrip
        items={[
          { label: 'Packs', value: String(packs.length) },
          { label: 'Left', value: String(left) },
          { label: 'Ending soon', value: String(ending) },
        ]}
      />

      {packs.length === 0 ? (
        <ModuleSection label="Session packs">
          <Text variant="body" style={{ color: colors.mute }}>
            Add a pack like “Skating — 24 classes in 3 months.” Log a class when they
            go. Talk: “Aarav went to skating.”
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
            <Pressable
              key={pack.id}
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
                      ? `${used} of ${pack.total} used · until ${formatPackWindow(pack)}`
                      : `${used} logged · until ${formatPackWindow(pack)}`}
                  </Text>
                </View>
                <Pressable
                  onPress={() => void logClass(pack.id, today)}
                  style={[styles.logBtn, todayDone && styles.logBtnOn]}
                  accessibilityLabel={todayDone ? 'Undo today’s class' : 'Log class today'}
                >
                  <Text style={[styles.logLabel, todayDone && styles.logLabelOn]}>
                    {todayDone ? 'Today ✓' : 'Log today'}
                  </Text>
                </Pressable>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct * 100}%` }]} />
              </View>
              <Text variant="caption" style={{ marginTop: 8, color: colors.forest }}>
                {remaining == null ? 'Set a class count' : `${remaining} left`}
              </Text>
            </Pressable>
          );
        })
      )}
    </ModuleScreen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.forestSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  addLabel: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    color: colors.forest,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.forestSoft,
  },
  logBtnOn: {
    backgroundColor: colors.forest,
  },
  logLabel: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    color: colors.forest,
  },
  logLabelOn: {
    color: colors.forestOn,
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
