import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  Package,
  Sparkles,
} from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { AppIcon } from '@/components/ui/Icon3D';
import { DotField, type DotTone } from '@/components/ui/DotField';
import { moduleTone } from '@/lib/moduleTone';
import { HomeHeader } from '@/components/HomeHeader';
import { greetingForNow } from '@/data/mock';
import { buildDashboard, formatDashDate, givenName, type DashRow } from '@/lib/dashboard';
import { loadHomeSurface } from '@/lib/homeSurface';
import { useInventory } from '@/lib/InventoryContext';
import { useLastDone } from '@/lib/LastDoneContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { useHabits } from '@/lib/HabitsContext';
import { useClasses } from '@/lib/ClassesContext';
import { useSubscriptions } from '@/lib/SubscriptionsContext';
import { resolveSelfDisplayName, selfAvatarInitial } from '@/lib/people';
import { loadLocalProfile } from '@/lib/profile';
import { moduleHref } from '@/lib/moduleNav';
import { blurActiveElement } from '@/lib/a11y';
import { useTalkOverlay } from '@/lib/TalkOverlayContext';
import { fonts, radius, shadowsFor, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import { dayKey } from '@/lib/habits';
import { remainingCount } from '@/lib/classes';
import { reminderTodayProgress } from '@/lib/lastDone';

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
  const { openTalk } = useTalkOverlay();
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
          if (surface === 'things') {
            router.replace('/(tabs)/spaces' as Href);
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
        selfName: displayName,
      }),
    [items, lastDoneItems, subscriptions, classPacks, habits, displayName]
  );

  const reminderToday = useMemo(
    () => reminderTodayProgress(lastDoneItems),
    [lastDoneItems]
  );

  const classesLeft = useMemo(
    () => classPacks.reduce((n, p) => n + (remainingCount(p) ?? 0), 0),
    [classPacks]
  );

  const hello = first ? `${greetingForNow()}, ${first}` : greetingForNow();
  const featured = dash.featured;
  const restOverdue = dash.overdueRows.filter((row) => row.id !== featured?.id);
  const restToday = dash.today.filter((row) => row.id !== featured?.id);
  const restNext = dash.next.filter((row) => row.id !== featured?.id);
  const doneToday = dash.doneToday.filter((row) => row.id !== featured?.id);
  const clear =
    !featured &&
    restOverdue.length === 0 &&
    restToday.length === 0 &&
    restNext.length === 0 &&
    doneToday.length === 0;

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
      <HomeHeader surface="today" avatarLetter={avatarLetter} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: spacing.sm,
          paddingBottom: insets.bottom + DOCK_CLEARANCE,
          paddingHorizontal: spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.kicker, { color: colors.mute }]}>
          {formatDashDate()}
        </Text>
        <Text variant="hero" style={styles.hello}>
          {hello}
        </Text>

        {dash.overdue || dash.dueToday ? (
          <View style={styles.pills}>
            {dash.overdue ? (
              <StatPill n={dash.overdue} label="overdue" bg={colors.coralSoft} fg={colors.coral} />
            ) : null}
            {dash.dueToday ? (
              <StatPill n={dash.dueToday} label="due today" bg={colors.amberSoft} fg={colors.amber} />
            ) : null}
          </View>
        ) : null}

        {featured ? (
          <Pressable
            onPress={() => open(featured.href)}
            style={({ pressed }) => [
              styles.featured,
              { backgroundColor: colors.ink, opacity: pressed ? 0.92 : 1 },
              shade.card,
            ]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.featuredTitle, { color: colors.onInk }]} numberOfLines={1}>
                {featured.title}
              </Text>
              <Text style={[styles.featuredSub, { color: colors.onInk }]} numberOfLines={1}>
                {featured.subtitle}
              </Text>
            </View>
            {checkFor(featured) ? (
              <Pressable
                onPress={checkFor(featured)}
                disabled={busyId === featured.habitId || busyId === featured.lastDoneId}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.featuredCheck,
                  { borderColor: colors.onInk, opacity: pressed ? 0.7 : 1 },
                ]}
                accessibilityLabel={`Mark ${featured.title} done`}
              >
                <Check size={18} color={colors.onInk} strokeWidth={2.4} />
              </Pressable>
            ) : (
              <ArrowUpRight size={20} color={colors.onInk} strokeWidth={2} />
            )}
          </Pressable>
        ) : null}

        {clear ? (
          <View style={[styles.clearCard, { backgroundColor: colors.surface }, shade.card]}>
            <View style={[styles.clearBadge, { backgroundColor: colors.accentWash }]}>
              <Check size={22} color={colors.accent} strokeWidth={2.4} />
            </View>
            <Text variant="headline" style={{ fontSize: 20, lineHeight: 26 }}>
              You’re clear
            </Text>
            <Text variant="body" style={{ marginTop: 4, textAlign: 'center' }}>
              Nothing waiting today.
            </Text>
            <View style={styles.clearActions}>
              <Pressable
                onPress={() => router.push('/capture' as Href)}
                style={({ pressed }) => [
                  styles.clearBtn,
                  { backgroundColor: colors.ink },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Text style={[styles.clearBtnText, { color: colors.onInk }]}>
                  Capture
                </Text>
              </Pressable>
              <Pressable
                onPress={openTalk}
                style={({ pressed }) => [
                  styles.clearBtn,
                  styles.clearBtnGhost,
                  { borderColor: colors.line, backgroundColor: colors.surface },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Text style={[styles.clearBtnText, { color: colors.ink }]}>Talk</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {restOverdue.length ? (
          <Section title="Overdue" meta={`${restOverdue.length}`}>
            {restOverdue.map((row) => (
              <RowCard
                key={row.id}
                row={row}
                busy={busyId === row.habitId || busyId === row.lastDoneId}
                onOpen={() => open(row.href)}
                onCheck={checkFor(row)}
              />
            ))}
          </Section>
        ) : null}

        {restToday.length ? (
          <Section title="Today">
            {restToday.map((row) => (
              <RowCard
                key={row.id}
                row={row}
                busy={busyId === row.habitId || busyId === row.lastDoneId}
                onOpen={() => open(row.href)}
                onCheck={checkFor(row)}
              />
            ))}
          </Section>
        ) : null}

        {doneToday.length ? (
          <Section
            title="Done today"
            meta={`${doneToday.length}`}
          >
            {doneToday.map((row) => (
              <RowCard
                key={row.id}
                row={row}
                busy={false}
                done
                onOpen={() => open(row.href)}
              />
            ))}
          </Section>
        ) : null}

        {restNext.length ? (
          <Section title="Coming up">
            {restNext.map((row) => (
              <RowCard key={row.id} row={row} busy={false} onOpen={() => open(row.href)} />
            ))}
          </Section>
        ) : null}

        <Section title="Jump in">
          <View style={styles.tiles}>
            {(
              [
                {
                  key: 'habits' as const,
                  Icon: Sparkles,
                  label: 'Habits',
                  value: habits.length ? `${dash.habitsDone}/${habits.length}` : '—',
                  hint: habits.length ? 'done today' : 'start one',
                  href: moduleHref('/habits', 'today'),
                },
                {
                  key: 'tasks' as const,
                  Icon: Bell,
                  label: 'Reminders',
                  value: reminderToday.total
                    ? `${reminderToday.done}/${reminderToday.total}`
                    : '—',
                  hint: reminderToday.total ? 'done today' : 'add one',
                  href: moduleHref('/tasks', 'today'),
                },
                {
                  key: 'classes' as const,
                  Icon: CalendarDays,
                  label: 'Classes',
                  value: classPacks.length ? String(classPacks.length) : '—',
                  hint: !classPacks.length
                    ? 'add a class'
                    : classesLeft
                      ? `${classesLeft} sessions left`
                      : 'none left',
                  href: moduleHref('/classes', 'today'),
                },
                {
                  key: 'things' as const,
                  Icon: Package,
                  label: 'Things',
                  value: items.length ? String(items.length) : '—',
                  hint: items.length ? 'saved' : 'browse',
                  href: '/(tabs)/spaces' as Href,
                },
              ] as const
            ).map((tile) => {
              const tone = moduleTone(tile.key, colors, resolved === 'light');
              return (
                <Tile
                  key={tile.key}
                  Icon={tile.Icon}
                  label={tile.label}
                  value={tile.value}
                  hint={tile.hint}
                  accent={tone.accent}
                  dots={tone.dots}
                  onPress={() => {
                    blurActiveElement();
                    router.push(tile.href);
                  }}
                />
              );
            })}
          </View>
        </Section>
      </ScrollView>
    </Screen>
  );
}

function StatPill({ n, label, bg, fg }: { n: number; label: string; bg: string; fg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillN, { color: fg }]}>{n}</Text>
      <Text style={[styles.pillL, { color: fg }]}>{label}</Text>
    </View>
  );
}

function Section({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: spacing.xl }}>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: colors.ink }]}>{title}</Text>
        {meta ? (
          <Text style={[styles.sectionMeta, { color: colors.mute }]}>{meta}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function RowCard({
  row,
  busy,
  done,
  onOpen,
  onCheck,
}: {
  row: DashRow;
  busy: boolean;
  done?: boolean;
  onOpen: () => void;
  onCheck?: () => void;
}) {
  const { colors, resolved } = useTheme();
  const shade = shadowsFor(resolved);

  return (
    <View style={[styles.rowCard, { backgroundColor: colors.surface }, shade.soft]}>
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [styles.rowMain, { opacity: pressed ? 0.9 : 1 }]}
      >
        {done ? (
          <View style={[styles.doneBadge, { backgroundColor: colors.forestSoft }]}>
            <Check size={18} color={colors.forest} strokeWidth={2.6} />
          </View>
        ) : (
          <AppIcon name={row.icon} size={32} />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            variant="bodyMedium"
            numberOfLines={1}
            style={done ? { color: colors.mute } : undefined}
          >
            {row.title}
          </Text>
          <Text variant="caption" style={{ marginTop: 2 }} numberOfLines={1}>
            {row.subtitle}
          </Text>
        </View>
      </Pressable>
      {onCheck ? (
        <Pressable
          onPress={() => {
            if (!busy) onCheck();
          }}
          hitSlop={8}
          style={[
            styles.rowCheck,
            {
              backgroundColor: busy ? colors.surfaceTint : colors.accentWash,
            },
          ]}
          accessibilityLabel={`Mark ${row.title} done`}
        >
          <Check size={16} color={colors.accent} strokeWidth={2.4} />
        </Pressable>
      ) : done ? null : (
        <ArrowUpRight size={18} color={colors.faint} strokeWidth={1.8} />
      )}
    </View>
  );
}

function Tile({
  Icon,
  label,
  value,
  hint,
  accent,
  dots,
  onPress,
}: {
  Icon: typeof Sparkles;
  label: string;
  value: string;
  hint: string;
  accent: string;
  dots: DotTone;
  onPress: () => void;
}) {
  const { colors, resolved } = useTheme();
  const onTintedDark = resolved === 'dark';
  const labelColor = onTintedDark ? '#FFFFFF' : colors.ink;
  const valueColor = onTintedDark ? '#FFFFFF' : colors.ink;
  const hintColor = onTintedDark ? 'rgba(255,255,255,0.62)' : colors.mute;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { borderColor: colors.line },
        pressed && { opacity: 0.92, transform: [{ scale: 0.985 }] },
      ]}
      accessibilityLabel={`${label} — ${value} ${hint}`}
    >
      <DotField tone={dots} />
      <View style={styles.tileFill}>
        <View style={styles.tileHead}>
          <View style={[styles.tileIcon, { backgroundColor: colors.surfaceSoft }]}>
            <Icon size={18} color={accent} strokeWidth={2.1} />
          </View>
          <Text style={[styles.tileLabel, { color: labelColor }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <View>
          <Text style={[styles.tileValue, { color: valueColor }]} numberOfLines={1}>
            {value}
          </Text>
          <Text style={[styles.tileHint, { color: hintColor }]} numberOfLines={1}>
            {hint}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  hello: {
    marginTop: 4,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: spacing.lg,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillN: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
  },
  pillL: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
  featured: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  featuredTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.3,
  },
  featuredSub: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 17,
    opacity: 0.65,
    marginTop: 1,
  },
  featuredCheck: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearCard: {
    marginTop: spacing.lg,
    borderRadius: radius.lg,
    paddingVertical: 22,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  clearBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  clearActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  clearBtn: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: radius.md,
    minHeight: 40,
    justifyContent: 'center',
  },
  clearBtnGhost: {
    borderWidth: 1.5,
  },
  clearBtnText: {
    fontFamily: fonts.sansSemi,
    fontSize: 15,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  sectionMeta: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    lineHeight: 20,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: spacing.sm,
    marginBottom: 6,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  rowCheck: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 136,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileFill: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
    minHeight: 136,
    justifyContent: 'space-between',
  },
  tileHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tileIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    flex: 1,
    fontFamily: fonts.sansSemi,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.3,
  },
  tileValue: {
    fontFamily: fonts.sansSemi,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.6,
  },
  tileHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 17,
    marginTop: 2,
  },
});