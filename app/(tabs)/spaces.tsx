import { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DotField, hubCardBg, isNearGray, type DotTone } from '@/components/ui/DotField';
import { Screen } from '@/components/ui/Screen';
import { HomeHeader } from '@/components/HomeHeader';
import { saveHomeSurface } from '@/lib/homeSurface';
import { Text } from '@/components/ui/Text';
import { AppIcon, type Icon3DName } from '@/components/ui/Icon3D';
import { useInventory } from '@/lib/InventoryContext';
import { useExpenses } from '@/lib/ExpensesContext';
import { useHabits } from '@/lib/HabitsContext';
import { useClasses } from '@/lib/ClassesContext';
import { useSubscriptions } from '@/lib/SubscriptionsContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { openAttentionQueue } from '@/lib/attention';
import { useAttentionDismissals } from '@/lib/attentionDismiss';
import { useLastDone } from '@/lib/LastDoneContext';
import {
  captureHref,
  type CaptureContextKind,
} from '@/lib/captureContext';
import { loadLocalProfile } from '@/lib/profile';
import { selfAvatarInitial } from '@/lib/people';
import { moduleHref } from '@/lib/moduleNav';
import { blurActiveElement } from '@/lib/a11y';
import { fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

type AddItem = {
  title: string;
  subtitle: string;
  icon: Icon3DName;
  href: Href;
};

type HubCard = {
  title: string;
  icon: Icon3DName;
  href: string;
  count: number;
  dots: DotTone;
};

/**
 * Life tab = module hub. Soft tinted cards with a tight dotted fade.
 */
export default function SpacesScreen() {
  const { colors, resolved } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { items } = useInventory();
  const { expenses } = useExpenses();
  const { habits } = useHabits();
  const { packs: classPacks } = useClasses();
  const { subscriptions } = useSubscriptions();
  const { members } = useHousehold();
  const { items: lastDone } = useLastDone();
  const { isDismissed } = useAttentionDismissals();
  const [addOpen, setAddOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [gridH, setGridH] = useState(0);
  const profileLetter = selfAvatarInitial(profileName, members);
  const dockClearance = Math.max(insets.bottom, 10) + 96;
  const rowGap = spacing.md;
  const rowH =
    gridH > 0 ? Math.max(120, (gridH - rowGap * 2) / 3) : undefined;

  function onGridLayout(e: LayoutChangeEvent) {
    const next = e.nativeEvent.layout.height;
    if (Math.abs(next - gridH) > 1) setGridH(next);
  }

  const taskCount = useMemo(
    () =>
      openAttentionQueue(items, lastDone, subscriptions, classPacks).filter(
        (a) => !isDismissed(a.id)
      ).length,
    [items, lastDone, subscriptions, classPacks, isDismissed]
  );

  const light = resolved === 'light';
  // Muted fallbacks for ink/mono — distinct hues, low candy.
  const hub: HubCard[] = [
    {
      title: 'Things',
      icon: 'package',
      href: '/things',
      count: items.length,
      dots: {
        bg: hubCardBg(colors.accent, light, '#6A7D5C'),
        dot: isNearGray(colors.accent) ? '#6A7D5C' : colors.accent,
      },
    },
    {
      title: 'Expenses',
      icon: 'wallet',
      href: '/expenses',
      count: expenses.length,
      dots: {
        bg: hubCardBg(colors.amber, light, '#A8884A'),
        dot: colors.amber,
      },
    },
    {
      title: 'Subscriptions',
      icon: 'credit',
      href: '/subscriptions',
      count: subscriptions.length,
      dots: {
        bg: hubCardBg(colors.violet, light, '#7A6E8E'),
        dot: isNearGray(colors.violet) ? '#7A6E8E' : colors.violet,
      },
    },
    {
      title: 'Classes',
      icon: 'today',
      href: '/classes',
      count: classPacks.length,
      dots: {
        bg: hubCardBg(colors.sky, light, '#5E7A8C'),
        dot: isNearGray(colors.sky) ? '#5E7A8C' : colors.sky,
      },
    },
    {
      title: 'Habits',
      icon: 'check',
      href: '/habits',
      count: habits.length,
      dots: {
        bg: hubCardBg(colors.coral, light, '#A66A5C'),
        dot: colors.coral,
      },
    },
    {
      title: 'Tasks',
      icon: 'tasks',
      href: '/tasks',
      count: taskCount,
      dots: {
        bg: hubCardBg('#5A7D76', light, '#5A7D76'),
        dot: '#5A7D76',
      },
    },
  ];

  const rows: HubCard[][] = [
    hub.slice(0, 2),
    hub.slice(2, 4),
    hub.slice(4, 6),
  ];

  const addGroups = useMemo(() => {
    const capture = (
      title: string,
      subtitle: string,
      icon: Icon3DName,
      kind: CaptureContextKind
    ): AddItem => ({
      title,
      subtitle,
      icon,
      href: captureHref({ kind }),
    });

    return [
      {
        title: 'Capture',
        hint: 'Photo into inventory',
        items: [
          capture('Thing', 'Anything you own', 'camera', 'general'),
          capture('Vehicle', 'Car, bike, registration', 'car', 'vehicle'),
          capture('Document', 'Passport, ID, legal', 'folder', 'documents'),
          capture('Purchase', 'Receipt or new buy', 'package', 'purchase'),
        ],
      },
      {
        title: 'Create',
        hint: 'Without a photo',
        items: [
          {
            title: 'Expense',
            subtitle: 'Log spend',
            icon: 'wallet' as Icon3DName,
            href: '/expenses/create' as Href,
          },
          {
            title: 'Subscription',
            subtitle: 'Recurring bill',
            icon: 'credit' as Icon3DName,
            href: '/subscriptions/create' as Href,
          },
          {
            title: 'Habit',
            subtitle: 'Track a streak',
            icon: 'check' as Icon3DName,
            href: '/habits/create' as Href,
          },
          {
            title: 'Class pack',
            subtitle: 'Sessions in a window',
            icon: 'today' as Icon3DName,
            href: '/classes/create' as Href,
          },
          {
            title: 'Person',
            subtitle: 'Add in Household',
            icon: 'family' as Icon3DName,
            href: '/family/create' as Href,
          },
        ],
      },
    ];
  }, []);

  useFocusEffect(
    useCallback(() => {
      setAddOpen(false);
      void saveHomeSurface('things');
      void loadLocalProfile().then((p) => setProfileName(p.displayName));
    }, [])
  );

  function openAdd() {
    blurActiveElement();
    setAddOpen(true);
  }

  function closeAdd() {
    setAddOpen(false);
  }

  function pickAdd(href: Href) {
    blurActiveElement();
    setAddOpen(false);
    setTimeout(() => router.push(href), 40);
  }

  return (
    <Screen>
      <HomeHeader
        surface="things"
        avatarLetter={profileLetter}
        onAdd={openAdd}
      />
      <View style={[styles.body, { paddingBottom: dockClearance }]}>
        <View style={styles.grid} onLayout={onGridLayout}>
          {rows.map((row, rowIndex) => (
            <View
              key={`row-${rowIndex}`}
              style={[styles.gridRow, rowH != null && { height: rowH }]}
            >
              {row.map((card) => (
                <View key={card.href} style={styles.gridItem}>
                  <Pressable
                    onPress={() => router.push(moduleHref(card.href, 'things'))}
                    style={({ pressed }) => [
                      styles.cardShell,
                      { borderColor: colors.line },
                      pressed && { opacity: 0.92, transform: [{ scale: 0.985 }] },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={card.title}
                  >
                    <DotField tone={card.dots} />
                    <View style={styles.cardFill}>
                      <View style={styles.cardTop}>
                        <AppIcon name={card.icon} size={48} tone="soft" />
                        {card.count > 0 ? (
                          <View
                            style={[
                              styles.countPill,
                              { backgroundColor: colors.surface },
                            ]}
                          >
                            <Text
                              style={[styles.countPillText, { color: colors.ink }]}
                            >
                              {card.count}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={[styles.cardTitle, { color: colors.ink }]}>
                        {card.title}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              ))}
            </View>
          ))}
        </View>
      </View>

      <Modal
        visible={addOpen}
        transparent
        animationType="fade"
        onRequestClose={closeAdd}
      >
        <Pressable
          style={[styles.sheetScrim, { backgroundColor: colors.overlay }]}
          onPress={closeAdd}
        >
          <Pressable
            style={[
              styles.sheet,
              {
                maxHeight: '88%',
                backgroundColor: colors.bgElevated,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.lineStrong }]} />
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>Add</Text>
            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={{
                paddingBottom: Math.max(insets.bottom, 16) + 8,
              }}
            >
              {addGroups.map((group) => (
                <View key={group.title} style={styles.sheetGroup}>
                  <Text style={[styles.sheetGroupTitle, { color: colors.ink }]}>
                    {group.title}
                  </Text>
                  <Text variant="caption" style={styles.sheetGroupHint}>
                    {group.hint}
                  </Text>
                  <View
                    style={[
                      styles.sheetCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.line,
                      },
                    ]}
                  >
                    {group.items.map((item, index) => (
                      <Pressable
                        key={item.title}
                        onPress={() => pickAdd(item.href)}
                        style={({ pressed }) => [
                          styles.sheetRow,
                          index < group.items.length - 1 && [
                            styles.sheetRowBorder,
                            { borderBottomColor: colors.line },
                          ],
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        <AppIcon name={item.icon} size={40} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text variant="headline">{item.title}</Text>
                          <Text variant="caption" style={{ marginTop: 2 }}>
                            {item.subtitle}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  grid: {
    flex: 1,
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  gridRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  gridItem: {
    flex: 1,
    height: '100%',
  },
  cardShell: {
    flex: 1,
    height: '100%',
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardFill: {
    flex: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    justifyContent: 'space-between',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  countPill: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  countPillText: {
    fontFamily: fonts.sansSemi,
    fontSize: 13,
  },
  cardTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  sheetScrim: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.md,
  },
  sheetTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 20,
    marginBottom: spacing.md,
  },
  sheetGroup: {
    marginBottom: spacing.lg,
  },
  sheetGroupTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 15,
  },
  sheetGroupHint: {
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  sheetCard: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  sheetRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
