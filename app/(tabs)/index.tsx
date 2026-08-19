import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronRight, Search as SearchIcon, User } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { AppIcon } from '@/components/ui/Icon3D';
import { HomeSurfaceSwitch } from '@/components/HomeSurfaceSwitch';
import { greetingForNow } from '@/data/mock';
import {
  buildDashboard,
  formatDashDate,
  givenName,
  type DashRow,
} from '@/lib/dashboard';
import { loadHomeSurface } from '@/lib/homeSurface';
import { useInventory } from '@/lib/InventoryContext';
import { useLastDone } from '@/lib/LastDoneContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { useHabits } from '@/lib/HabitsContext';
import { useClasses } from '@/lib/ClassesContext';
import { useSubscriptions } from '@/lib/SubscriptionsContext';
import { resolveSelfDisplayName, selfAvatarInitial } from '@/lib/people';
import { loadLocalProfile } from '@/lib/profile';
import { blurActiveElement } from '@/lib/a11y';
import { fonts, radius, shadowsFor, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import { dayKey } from '@/lib/habits';

const DOCK_CLEARANCE = 108;

export default function HomeDashboard() {
  const { colors, resolved } = useTheme();
  const shade = shadowsFor(resolved);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { items } = useInventory();
  const { items: lastDoneItems, logDone } = useLastDone();
  const { members } = useHousehold();
  const { habits, checkIn } = useHabits();
  const { packs: classPacks } = useClasses();
  const { subscriptions } = useSubscriptions();
  const [profileName, setProfileName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void Promise.all([loadLocalProfile(), loadHomeSurface()]).then(
        ([profile, surface]) => {
          if (!live) return;
          setProfileName(profile.displayName);
          if (surface === 'ask') {
            router.replace('/(tabs)/ask' as Href);
            return;
          }
          setReady(true);
        }
      );
      return () => {
        live = false;
      };
    }, [router])
  );

  const displayName = resolveSelfDisplayName(profileName, members);
  const first = givenName(displayName);
  const avatarLetter = selfAvatarInitial(profileName, members);
  const dash = useMemo(
    () =>
      buildDashboard({
        inventory: items,
        lastDone: lastDoneItems,
        subscriptions,
        classPacks,
        habits,
      }),
    [items, lastDoneItems, subscriptions, classPacks, habits]
  );

  const hello = first ? `${greetingForNow()}, ${first}` : greetingForNow();
  const restToday = dash.today.filter((row) => row.id !== dash.featured?.id);
  const restNext = dash.next.filter((row) => row.id !== dash.featured?.id);

  async function onHabitCheck(habitId: string) {
    if (busyId) return;
    setBusyId(habitId);
    try {
      await checkIn(habitId, dayKey());
    } finally {
      setBusyId(null);
    }
  }

  async function onMarkLastDone(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      await logDone({ id });
    } finally {
      setBusyId(null);
    }
  }

  function open(href?: string) {
    if (!href) return;
    blurActiveElement();
    router.push(href as Href);
  }

  function checkFor(row: DashRow) {
    if (row.habitId) return () => void onHabitCheck(row.habitId!);
    if (row.lastDoneId) return () => void onMarkLastDone(row.lastDoneId!);
    return undefined;
  }

  if (!ready) {
    return <Screen />;
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingBottom: insets.bottom + DOCK_CLEARANCE,
          paddingHorizontal: spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <View style={styles.metaRow}>
            <Text style={[styles.kicker, { color: colors.mute, flex: 1 }]}>
              {formatDashDate()}
            </Text>
            <Pressable
              onPress={() => {
                blurActiveElement();
                router.push('/(tabs)/search' as Href);
              }}
              hitSlop={8}
              style={styles.iconBtn}
              accessibilityLabel="Search"
            >
              <SearchIcon size={20} color={colors.slate} strokeWidth={1.8} />
            </Pressable>
            <Pressable
              onPress={() => {
                blurActiveElement();
                router.push('/profile' as Href);
              }}
              style={[styles.avatar, { backgroundColor: colors.ink }]}
              accessibilityLabel="Profile"
            >
              {avatarLetter ? (
                <Text style={[styles.avatarLetter, { color: colors.onInk }]}>{avatarLetter}</Text>
              ) : (
                <User size={16} color={colors.onInk} strokeWidth={1.8} />
              )}
            </Pressable>
          </View>
          <Text variant="hero" style={styles.hello}>
            {hello}
          </Text>
        </View>

        <View style={styles.switchRow}>
          <HomeSurfaceSwitch value="today" />
        </View>

        {dash.featured ? (
          <View
            style={[
              styles.hero,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
              },
              shade.float,
            ]}
          >
            <Text variant="label" style={{ color: colors.accent }}>
              {dash.featured.urgency === 'urgent' ? 'Needs you now' : 'Up next'}
            </Text>
            <View style={styles.heroBody}>
              <AppIcon name={dash.featured.icon} size={56} tone="forest" />
              <View style={{ flex: 1 }}>
                <Text variant="title" style={{ fontSize: 24, lineHeight: 30 }} numberOfLines={2}>
                  {dash.featured.title}
                </Text>
                <Text variant="body" style={{ marginTop: 4 }} numberOfLines={2}>
                  {dash.featured.subtitle}
                </Text>
              </View>
            </View>
            <View style={styles.heroMeta}>
              <PulseChip n={dash.overdue} label="overdue" hot={!!dash.overdue} />
              <PulseChip n={dash.dueToday} label="due today" hot={!!dash.dueToday} />
              <PulseChip n={dash.habitsOpen} label="habits" hot={!!dash.habitsOpen} />
            </View>
            <View style={styles.heroActions}>
              <Pressable
                onPress={() => open(dash.featured?.href)}
                style={({ pressed }) => [
                  styles.heroOpen,
                  {
                    backgroundColor: colors.ink,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}
              >
                <Text style={[styles.heroOpenText, { color: colors.onInk }]}>Open</Text>
              </Pressable>
              {checkFor(dash.featured) ? (
                <Pressable
                  onPress={checkFor(dash.featured)}
                  disabled={busyId === dash.featured.habitId || busyId === dash.featured.lastDoneId}
                  style={({ pressed }) => [
                    styles.heroCheck,
                    {
                      borderColor: colors.lineStrong,
                      backgroundColor: colors.surfaceSoft,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                  accessibilityLabel={`Mark ${dash.featured.title} done`}
                >
                  <Check size={18} color={colors.ink} strokeWidth={2.2} />
                  <Text style={[styles.heroCheckText, { color: colors.ink }]}>Done</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.empty,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
              },
              shade.card,
            ]}
          >
            <Text variant="title">You’re clear</Text>
            <Text variant="body" style={{ marginTop: 8, textAlign: 'center' }}>
              Nothing waiting. Capture a Thing, or switch to Ask and talk it in.
            </Text>
          </View>
        )}

        {restToday.length ? (
          <Section title="Still today">
            {restToday.map((row) => (
              <DashTile
                key={row.id}
                row={row}
                busy={busyId === row.habitId || busyId === row.lastDoneId}
                onOpen={() => open(row.href)}
                onCheck={checkFor(row)}
              />
            ))}
          </Section>
        ) : null}

        {restNext.length ? (
          <Section title="Coming up">
            {restNext.map((row) => (
              <DashTile
                key={row.id}
                row={row}
                busy={false}
                onOpen={() => open(row.href)}
              />
            ))}
          </Section>
        ) : null}

        <Section title="Jump in">
          <View style={styles.jumps}>
            <Jump
              icon="sparkles"
              label="Habits"
              onPress={() => {
                blurActiveElement();
                router.push('/habits' as Href);
              }}
            />
            <Jump
              icon="bell"
              label="Reminders"
              onPress={() => {
                blurActiveElement();
                router.push('/last-done' as Href);
              }}
            />
            <Jump
              icon="package"
              label="Things"
              onPress={() => {
                blurActiveElement();
                router.push('/(tabs)/spaces' as Href);
              }}
            />
          </View>
        </Section>
      </ScrollView>
    </Screen>
  );
}

function PulseChip({ n, label, hot }: { n: number; label: string; hot: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: hot ? colors.accentWash : colors.surfaceSoft,
          borderColor: hot ? colors.accentSoft : colors.line,
        },
      ]}
    >
      <Text style={[styles.chipN, { color: hot ? colors.accent : colors.mute }]}>{n}</Text>
      <Text style={[styles.chipL, { color: hot ? colors.accent : colors.mute }]}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: 28 }}>
      <Text variant="label" style={{ color: colors.mute, marginBottom: 12 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function DashTile({
  row,
  busy,
  onOpen,
  onCheck,
}: {
  row: DashRow;
  busy: boolean;
  onOpen: () => void;
  onCheck?: () => void;
}) {
  const { colors, resolved } = useTheme();
  const shade = shadowsFor(resolved);

  return (
    <View
      style={[
        styles.tile,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
        },
        shade.soft,
      ]}
    >
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [
          styles.tileMain,
          { opacity: pressed ? 0.92 : 1 },
        ]}
      >
        <AppIcon name={row.icon} size={44} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyMedium" style={{ color: colors.ink }} numberOfLines={1}>
            {row.title}
          </Text>
          <Text variant="caption" style={{ marginTop: 2 }} numberOfLines={1}>
            {row.subtitle}
          </Text>
        </View>
        {onCheck ? null : <ChevronRight size={16} color={colors.faint} strokeWidth={1.8} />}
      </Pressable>
      {onCheck ? (
        <Pressable
          onPress={() => {
            if (!busy) onCheck();
          }}
          hitSlop={8}
          style={[
            styles.check,
            {
              borderColor: colors.lineStrong,
              backgroundColor: busy ? colors.surfaceTint : colors.surfaceSoft,
            },
          ]}
          accessibilityLabel={`Mark ${row.title} done`}
        >
          <Check size={16} color={colors.ink} strokeWidth={2.2} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Jump({
  icon,
  label,
  onPress,
}: {
  icon: 'sparkles' | 'bell' | 'package';
  label: string;
  onPress: () => void;
}) {
  const { colors, resolved } = useTheme();
  const shade = shadowsFor(resolved);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.jump,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
          opacity: pressed ? 0.9 : 1,
        },
        shade.soft,
      ]}
    >
      <AppIcon name={icon} size={40} />
      <Text variant="bodyMedium" style={{ marginTop: 10 }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    gap: 4,
  },
  kicker: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  hello: {
    marginTop: 8,
    fontSize: 38,
    lineHeight: 44,
    letterSpacing: -1.4,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
  },
  switchRow: {
    marginTop: 16,
    marginBottom: 8,
  },
  hero: {
    marginTop: 18,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 22,
    overflow: 'hidden',
  },
  heroBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginTop: 14,
  },
  heroMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 18,
  },
  heroActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  heroOpen: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.full,
  },
  heroOpenText: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
  },
  heroCheck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroCheckText: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipN: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
  },
  chipL: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
  empty: {
    marginTop: 22,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 36,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 10,
    marginBottom: 10,
  },
  tileMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  check: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jumps: {
    flexDirection: 'row',
    gap: 10,
  },
  jump: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
