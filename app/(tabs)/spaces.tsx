import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Plus, User } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { ListCard, ListRow } from '@/components/ui/ListKit';
import { AppIcon, Icon3DBadge, type Icon3DName } from '@/components/ui/Icon3D';
import { useSpaces } from '@/lib/SpacesContext';
import { useInventory } from '@/lib/InventoryContext';
import { useExpenses } from '@/lib/ExpensesContext';
import { useHabits } from '@/lib/HabitsContext';
import { useClasses } from '@/lib/ClassesContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { useLastDone } from '@/lib/LastDoneContext';
import { useSubscriptions } from '@/lib/SubscriptionsContext';
import {
  captureHref,
  type CaptureContextKind,
} from '@/lib/captureContext';
import {
  isDocumentItem,
  isInsuranceItem,
  isPurchaseItem,
  isVehicleItem,
  spaceIdByKind,
} from '@/lib/moduleFilters';
import { loadLocalProfile } from '@/lib/profile';
import { selfAvatarInitial } from '@/lib/people';
import { blurActiveElement } from '@/lib/a11y';
import { fonts, radius, shadows, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

type AddItem = {
  title: string;
  subtitle: string;
  icon: Icon3DName;
  href: Href;
};

type AddGroup = {
  title: string;
  hint: string;
  items: AddItem[];
};

type ModuleRow = {
  title: string;
  subtitle: string;
  icon: Icon3DName;
  href: string;
  count?: number;
};

export default function SpacesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { spaces } = useSpaces();
  const { items } = useInventory();
  const { expenses } = useExpenses();
  const { habits } = useHabits();
  const { packs: classPacks } = useClasses();
  const { members } = useHousehold();
  const { items: lastDoneItems } = useLastDone();
  const { subscriptions } = useSubscriptions();
  const scrollRef = useRef<ScrollView>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const profileLetter = selfAvatarInitial(profileName, members);

  const addGroups = useMemo((): AddGroup[] => {
    const spaceIdFor = (kind: 'home' | 'vehicle' | 'documents' | 'family') =>
      spaces.find((s) => s.kind === kind)?.id;

    const capture = (
      title: string,
      subtitle: string,
      icon: Icon3DName,
      kind: CaptureContextKind,
      spaceKind?: 'home' | 'vehicle' | 'documents' | 'family'
    ): AddItem => ({
      title,
      subtitle,
      icon,
      href: captureHref({
        kind,
        spaceId: spaceKind ? spaceIdFor(spaceKind) : undefined,
      }),
    });

    return [
      {
        title: 'Capture',
        hint: 'Photograph into inventory — vehicles, docs, and most Things.',
        items: [
          capture('Thing', 'Anything you own', 'camera', 'general'),
          capture('Vehicle', 'Car, bike, registration', 'car', 'vehicle', 'vehicle'),
          capture('Document', 'Passport, ID, legal', 'folder', 'documents', 'documents'),
          capture('Purchase', 'Receipt or new buy', 'package', 'purchase'),
          capture('Warranty', 'Card or coverage paper', 'receipt', 'warranty'),
          capture('Insurance', 'Policy or card', 'shield', 'insurance'),
        ],
      },
      {
        title: 'Create',
        hint: 'Forms — not a photo.',
        items: [
          {
            title: 'Space',
            subtitle: 'Home, place, or group',
            icon: 'house',
            href: '/space/create' as Href,
          },
          {
            title: 'Expense',
            subtitle: 'Log spend',
            icon: 'wallet',
            href: '/expenses/create' as Href,
          },
          {
            title: 'Subscription',
            subtitle: 'Recurring bill',
            icon: 'credit',
            href: '/subscriptions/create' as Href,
          },
          {
            title: 'Habit',
            subtitle: 'Track a streak',
            icon: 'check',
            href: '/habits/create' as Href,
          },
          {
            title: 'Class pack',
            subtitle: '24 sessions in a window',
            icon: 'today',
            href: '/classes/create' as Href,
          },
          {
            title: 'Person',
            subtitle: 'Family or household',
            icon: 'family',
            href: '/family/create' as Href,
          },
        ],
      },
    ];
  }, [spaces]);

  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      setAddOpen(false);
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
    // Let the sheet unmount before stack push (same pattern as Talk overlay).
    setTimeout(() => router.push(href), 40);
  }

  const docCount = useMemo(() => {
    const documentsSpaceId = spaceIdByKind(spaces, 'documents');
    return items.filter((i) => isDocumentItem(i, documentsSpaceId)).length;
  }, [items, spaces]);
  const vehicleCount = useMemo(() => {
    const vehicleSpaceId = spaceIdByKind(spaces, 'vehicle');
    return items.filter((i) => isVehicleItem(i, vehicleSpaceId)).length;
  }, [items, spaces]);
  const purchaseCount = useMemo(
    () => items.filter(isPurchaseItem).length,
    [items]
  );
  const insuranceCount = useMemo(
    () => items.filter(isInsuranceItem).length,
    [items]
  );

  const groups: { title: string; rows: ModuleRow[] }[] = [
    {
      title: 'Money',
      rows: [
        { title: 'Expenses', subtitle: 'Spend & categories', icon: 'wallet', href: '/expenses', count: expenses.length },
        { title: 'Subscriptions', subtitle: 'Recurring spend', icon: 'credit', href: '/subscriptions', count: subscriptions.length },
        { title: 'Purchases', subtitle: 'Receipts & returns', icon: 'package', href: '/purchases', count: purchaseCount },
        { title: 'Insurance', subtitle: 'Policies & claims', icon: 'shield', href: '/insurance', count: insuranceCount },
        { title: 'Warranties', subtitle: 'Coverage & expiry', icon: 'receipt', href: '/warranties' },
      ],
    },
    {
      title: 'Routines',
      rows: [
        { title: 'Habits', subtitle: 'Streaks & check-ins', icon: 'check', href: '/habits', count: habits.length },
        { title: 'Classes', subtitle: 'Packs & remaining sessions', icon: 'today', href: '/classes', count: classPacks.length },
      ],
    },
    {
      title: 'Records',
      rows: [
        { title: 'Documents', subtitle: 'Identity & legal', icon: 'folder', href: '/documents', count: docCount },
        { title: 'Vehicles', subtitle: 'Service & renewals', icon: 'car', href: '/vehicles', count: vehicleCount },
        {
          title: 'Maintenance',
          subtitle: 'Service due on Things',
          icon: 'tools',
          href: '/maintenance',
          count: lastDoneItems.length,
        },
        { title: 'Family', subtitle: 'People & pets', icon: 'family', href: '/family', count: members.length },
      ],
    },
    {
      title: 'More',
      rows: [
        { title: 'Tasks', subtitle: 'Due soon queue', icon: 'tasks', href: '/tasks' },
        { title: 'Reports', subtitle: 'Inventory exports', icon: 'chart', href: '/reports' },
        { title: 'Notifications', subtitle: 'Inbox', icon: 'bell', href: '/notifications' },
      ],
    },
  ];

  return (
    <Screen>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <View style={{ flex: 1 }}>
            <Text variant="title">Things</Text>
            <Text variant="body" style={styles.lead}>
              Homes and life modules — everything you track.
            </Text>
          </View>
          <Pressable
            onPress={openAdd}
            style={[styles.addBtn, { backgroundColor: colors.accent }]}
            accessibilityLabel="Add"
          >
            <Plus size={20} color={colors.accentOn} strokeWidth={2.2} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/profile' as Href)}
            style={[styles.profileBtn, { backgroundColor: colors.ink }]}
            accessibilityLabel="Profile"
          >
            {profileLetter ? (
              <Text style={[styles.profileLetter, { color: colors.onInk }]}>{profileLetter}</Text>
            ) : (
              <User size={16} color={colors.onInk} strokeWidth={1.8} />
            )}
          </Pressable>
        </View>

        <Text style={[styles.sectionTitle, { marginTop: spacing.lg, color: colors.ink }]}>Spaces</Text>
        <View style={styles.grid}>
          {spaces.map((space, index) => {
            const count = items.filter((i) => i.spaceId === space.id).length;
            return (
              <Animated.View
                key={space.id}
                entering={FadeInDown.delay(40 + index * 30).springify().damping(18)}
                style={styles.gridItem}
              >
                <Card
                  style={styles.card}
                  onPress={() => router.push(`/space/${space.id}` as Href)}
                >
                  <View style={styles.cardTop}>
                    <Icon3DBadge name={space.icon} size={48} />
                    {count > 0 ? (
                      <View style={[styles.countPill, { backgroundColor: colors.accentSoft }]}>
                        <Text style={[styles.countPillText, { color: colors.accent }]}>{count}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text variant="headline" style={{ marginTop: spacing.sm }}>
                    {space.name}
                  </Text>
                  <Text variant="caption" style={{ marginTop: 2 }} numberOfLines={1}>
                    {space.meta}
                  </Text>
                </Card>
              </Animated.View>
            );
          })}
        </View>

        {groups.map((group, groupIndex) => (
          <Animated.View
            key={group.title}
            entering={FadeInDown.delay(120 + groupIndex * 50).springify().damping(18)}
          >
            <Text style={[styles.sectionTitle, { marginTop: spacing.xxl, color: colors.ink }]}>
              {group.title}
            </Text>
            <ListCard>
              {group.rows.map((row, rowIndex) => (
                <ListRow
                  key={row.href}
                  icon={row.icon}
                  title={row.title}
                  subtitle={row.subtitle}
                  meta={row.count ? String(row.count) : undefined}
                  last={rowIndex === group.rows.length - 1}
                  onPress={() => router.push(row.href as Href)}
                />
              ))}
            </ListCard>
          </Animated.View>
        ))}
      </ScrollView>

      <Modal
        visible={addOpen}
        transparent
        animationType="fade"
        onRequestClose={closeAdd}
      >
        <Pressable style={[styles.sheetScrim, { backgroundColor: colors.overlay }]} onPress={closeAdd}>
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
                  <Text style={[styles.sheetGroupTitle, { color: colors.ink }]}>{group.title}</Text>
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
  content: {
    paddingHorizontal: spacing.lg,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  lead: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  profileLetter: {
    fontWeight: '600',
    fontSize: 16,
  },
  sectionTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: -0.3,
    marginBottom: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  gridItem: {
    width: '47.8%',
  },
  card: {
    minHeight: 132,
    padding: spacing.md,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  countPill: {
    minWidth: 26,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPillText: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
  },
  sheetScrim: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
    ...shadows.float,
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
    lineHeight: 24,
    letterSpacing: -0.3,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  sheetGroup: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sheetGroupTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  sheetGroupHint: {
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  sheetCard: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...shadows.soft,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  sheetRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
