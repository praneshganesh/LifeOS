import { useTheme } from '@/lib/ThemeContext';
import { useToast } from '@/lib/ToastContext';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useMemo, useRef } from 'react';
import {
  BookOpen,
  Camera,
  ChevronLeft,
  FileText,
  Pencil,
  Share2,
  Trash2,
  Wrench,
} from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { AppIcon } from '@/components/ui/Icon3D';
import { useInventory } from '@/lib/InventoryContext';
import { useLastDone } from '@/lib/LastDoneContext';
import { forInventoryItem, formatRelativeDone, getLastDoneAt } from '@/lib/lastDone';
import { inventoryToAsset } from '@/lib/mergeAssets';
import { captureHref } from '@/lib/captureContext';
import { resolveManualLink } from '@/lib/manualLink';
import { confirmDelete } from '@/lib/confirmDelete';
import { shareDocument } from '@/lib/shareDocument';
import { blurActiveElement } from '@/lib/a11y';
import { type ThemeColors,  colors, fonts, radius, spacing, shadows  } from '@/constants/theme';

const DOCK_CLEARANCE = 96;
const CHROME_TOP = 18;

export default function AssetDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getById, removeItem } = useInventory();
  const { showError } = useToast();
  const { items: lastDoneItems } = useLastDone();
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);

  const captured = id ? getById(id) : undefined;
  const asset = captured ? inventoryToAsset(captured) : undefined;
  const isUserItem = Boolean(captured);
  const hasPhoto = Boolean(captured?.imageUri);
  const linkedService = asset
    ? forInventoryItem(lastDoneItems, asset.id)[0]
    : undefined;

  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/spaces');
  }

  /** Mid-page: scroll to top. At top: leave. */
  function goBack() {
    blurActiveElement();
    if (scrollYRef.current > 8) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    leave();
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    scrollYRef.current = e.nativeEvent.contentOffset.y;
  }

  function openAttach(attach: 'photo' | 'receipt') {
    if (!captured) return;
    router.push(
      captureHref({
        linkItemId: captured.id,
        attach,
        spaceId: captured.spaceId,
        room: captured.room,
        kind: captured.isDocument || /passport|emirates|document/i.test(captured.category + captured.name)
          ? 'documents'
          : 'purchase',
      })
    );
  }

  async function onDelete() {
    if (!captured) return;
    blurActiveElement();
    const ok = await confirmDelete(captured.name);
    if (!ok) return;
    try {
      await removeItem(captured.id);
    } catch {
      showError('Couldn’t delete — try again.');
      return;
    }
    leave();
  }

  async function onShare() {
    if (!captured) return;
    blurActiveElement();
    const result = await shareDocument({
      name: captured.name,
      imageUri: captured.imageUri,
      documentKind: captured.documentKind,
      documentNumber: captured.documentNumber,
      fullName: captured.fullName,
      nationality: captured.nationality,
      dateOfBirth: captured.dateOfBirth,
      expiryDate: captured.expiryDate,
      warrantyExpiry: captured.warrantyExpiry,
    });
    if (result === 'unavailable') {
      Alert.alert('Sharing unavailable', 'Couldn’t open the share sheet on this device.');
    }
  }

  if (!asset) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.missing, { paddingTop: insets.top + spacing.lg }]}>
          <Text variant="bodyMedium" style={{ color: colors.mute }}>
            This item couldn’t be found.
          </Text>
          <Pressable onPress={goBack} style={{ marginTop: spacing.md }}>
            <Text style={styles.link}>Go back</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const manual = resolveManualLink({
    manualUrl: captured?.manualUrl || asset.manualUrl,
    brand: asset.brand,
    name: asset.name,
  });

  const isDoc =
    Boolean(captured?.isDocument) ||
    Boolean(captured?.documentKind) ||
    asset.category === 'Documents' ||
    asset.category === 'Document' ||
    asset.spaceId === 's5' ||
    asset.icon === 'passport' ||
    asset.icon === 'document' ||
    asset.icon === 'id' ||
    /passport|emirates\s*id|\beid\b|visa|identity/i.test(
      `${asset.name} ${asset.brand} ${asset.category} ${asset.room}`
    );

  const showManual = Boolean(manual) && !isDoc;

  const chips = [
    ...new Set(
      [
        asset.brand &&
        asset.brand !== 'Unknown' &&
        asset.brand !== 'Document' &&
        !/^identity$/i.test(asset.brand)
          ? asset.brand
          : null,
        captured?.assignedTo || asset.assignedTo
          ? `For ${captured?.assignedTo || asset.assignedTo}`
          : null,
        asset.room &&
        asset.room !== '—' &&
        !/^identity$/i.test(asset.room) &&
        asset.room !== asset.brand
          ? asset.room
          : null,
        isDoc
          ? labelDocKind(captured?.documentKind) || 'Document'
          : asset.category && asset.category !== '—'
            ? asset.category
            : null,
      ].filter(Boolean) as string[]
    ),
  ];

  const glance: { label: string; value: string }[] = isDoc
    ? [
        { label: 'Type', value: labelDocKind(captured?.documentKind) },
        {
          label: 'Expires',
          value: captured?.expiryDate || asset.warrantyExpiry || '—',
        },
      ]
    : [
        { label: 'Price', value: asset.price && asset.price !== '—' ? asset.price : '—' },
        {
          label: 'Warranty',
          value:
            asset.warrantyExpiry && asset.warrantyExpiry !== '—'
              ? asset.warrantyExpiry
              : '—',
        },
        {
          label: 'Purchased',
          value:
            asset.purchaseDate && asset.purchaseDate !== '—'
              ? asset.purchaseDate
              : '—',
        },
      ];

  const detailRows: { label: string; value: string }[] = isDoc
    ? [
        {
          label: 'Document #',
          value: captured?.documentNumber || (asset.serial !== '—' ? asset.serial : '—'),
        },
        { label: 'Full name', value: captured?.fullName || '—' },
        { label: 'Nationality', value: captured?.nationality || '—' },
        { label: 'Date of birth', value: captured?.dateOfBirth || '—' },
      ]
    : [
        { label: 'Serial', value: asset.serial || '—' },
        {
          label: 'Bought from',
          value: captured?.purchasedFrom || asset.purchasedFrom || '—',
        },
        { label: 'Condition', value: asset.condition || '—' },
      ];

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />

      <View
        style={[styles.chrome, { top: insets.top + CHROME_TOP }]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [styles.chromeBtn, pressed && { opacity: 0.75 }]}
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <ChevronLeft size={22} color={colors.ink} strokeWidth={2.2} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + DOCK_CLEARANCE }}
        showsVerticalScrollIndicator={false}
      >
        {hasPhoto && captured?.imageUri ? (
          <Pressable
            onPress={() => {
              if (isUserItem) openAttach('photo');
            }}
            disabled={!isUserItem}
            accessibilityLabel="Change photo"
          >
            <Image
              source={{ uri: captured.imageUri }}
              style={[styles.heroPhoto, { height: insets.top + 280 }]}
              resizeMode="cover"
            />
            <LinearGradient
              colors={['rgba(11,18,32,0.25)', 'rgba(11,18,32,0)']}
              style={styles.heroScrim}
            />
          </Pressable>
        ) : null}

        <View
          style={[
            styles.body,
            !hasPhoto && { paddingTop: insets.top + CHROME_TOP + 40 + spacing.lg },
          ]}
        >
          <Animated.View entering={FadeInDown.springify().damping(18)}>
            {!hasPhoto ? (
              <View style={styles.titleRow}>
                <AppIcon name={asset.icon} size={56} tone="soft" />
                <Text style={[styles.title, { flex: 1 }]}>{asset.name}</Text>
              </View>
            ) : (
              <Text style={styles.title}>{asset.name}</Text>
            )}

            {linkedService ? (
              <Text style={styles.lastMaintained}>
                Last: {linkedService.label} ·{' '}
                {formatRelativeDone(getLastDoneAt(linkedService))}
              </Text>
            ) : null}

            {chips.length ? (
              <View style={styles.chipRow}>
                {chips.map((chip, i) => (
                  <View key={`${chip}-${i}`} style={styles.chip}>
                    <Text style={styles.chipText}>{chip}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(60).springify().damping(18)}
            style={styles.quickRow}
          >
            {isUserItem && isDoc ? (
              <QuickAction
                icon={<Share2 size={20} color={colors.forest} strokeWidth={2} />}
                label="Share"
                onPress={() => void onShare()}
              />
            ) : null}
            {isUserItem ? (
              <>
                <QuickAction
                  icon={<Camera size={20} color={colors.forest} strokeWidth={2} />}
                  label={hasPhoto ? 'Photo' : 'Add photo'}
                  onPress={() => openAttach('photo')}
                />
                {!isDoc ? (
                  <QuickAction
                    icon={<FileText size={20} color={colors.forest} strokeWidth={2} />}
                    label="Receipt"
                    onPress={() => openAttach('receipt')}
                  />
                ) : null}
              </>
            ) : null}
            {showManual && manual ? (
              <QuickAction
                icon={<BookOpen size={20} color={colors.forest} strokeWidth={2} />}
                label="Manual"
                onPress={() => {
                  void Linking.openURL(manual.url);
                }}
              />
            ) : null}
            {!isDoc ? (
              <QuickAction
                icon={<Wrench size={20} color={colors.forest} strokeWidth={2} />}
                label="Maintain"
                onPress={() =>
                  router.push(`/last-done?linkItemId=${encodeURIComponent(asset.id)}` as Href)
                }
              />
            ) : null}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).springify().damping(18)}>
            <View style={styles.glanceStrip}>
              {glance.map((g, i) => (
                <View
                  key={g.label}
                  style={[styles.glanceTile, i < glance.length - 1 && styles.glanceDivider]}
                >
                  <Text style={styles.glanceValue} numberOfLines={1}>
                    {g.value}
                  </Text>
                  <Text style={styles.glanceLabel}>{g.label}</Text>
                </View>
              ))}
            </View>

            {isDoc ? (
              <View style={styles.privacyBanner}>
                <Text style={styles.privacyText}>
                  Document text was read on your device. Nothing was sent to AI.
                </Text>
              </View>
            ) : null}

            <View style={styles.detailCard}>
              {detailRows.map((row, i) => (
                <View
                  key={row.label}
                  style={[styles.detailRow, i < detailRows.length - 1 && styles.detailBorder]}
                >
                  <Text variant="body" style={{ color: colors.mute }}>
                    {row.label}
                  </Text>
                  <Text
                    variant="bodyMedium"
                    style={{ maxWidth: '58%', textAlign: 'right' }}
                  >
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>

            {asset.insight ? <Text style={styles.insight}>{asset.insight}</Text> : null}

            {asset.timeline?.length ? (
              <View style={styles.timeline}>
                <Text variant="label" style={styles.timelineLabel}>
                  Timeline
                </Text>
                {asset.timeline.map((event, i) => (
                  <View key={event.date + event.event + i} style={styles.timelineItem}>
                    <View style={styles.timelineRail}>
                      <View style={styles.timelineDot} />
                      {i < asset.timeline.length - 1 ? (
                        <View style={styles.timelineLine} />
                      ) : null}
                    </View>
                    <View style={{ flex: 1, paddingBottom: spacing.md }}>
                      <Text variant="caption">{event.date}</Text>
                      <Text variant="bodyMedium" style={{ marginTop: 2 }}>
                        {event.event}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {isUserItem ? (
              <View style={styles.bottomActions}>
                <Pressable
                  onPress={() => {
                    blurActiveElement();
                    router.push(`/asset/edit/${asset.id}` as Href);
                  }}
                  style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.9 }]}
                  accessibilityLabel="Edit"
                >
                  <Pencil size={18} color={colors.forest} strokeWidth={2.1} />
                  <Text style={styles.editBtnText}>Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() => void onDelete()}
                  style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.9 }]}
                  accessibilityLabel="Delete"
                >
                  <Trash2 size={18} color={colors.coral} strokeWidth={2.1} />
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </Pressable>
              </View>
            ) : null}
          </Animated.View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={() => {
        blurActiveElement();
        onPress();
      }}
      style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.8 }]}
      accessibilityLabel={label}
    >
      <View style={styles.quickCircle}>{icon}</View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

function labelDocKind(kind?: string) {
  if (kind === 'passport') return 'Passport';
  if (kind === 'emirates_id') return 'Emirates ID';
  if (kind === 'driving_licence') return 'Driving licence';
  return 'Document';
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  chrome: {
    position: 'absolute',
    left: spacing.lg,
    zIndex: 50,
    elevation: 50,
  },
  chromeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  link: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.forest,
  },
  heroPhoto: {
    width: '100%',
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  heroScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.sansSemi,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.4,
    color: colors.ink,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: spacing.md,
  },
  lastMaintained: {
    marginTop: spacing.sm,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.mute,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.slate,
  },
  quickRow: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.xl,
  },
  quickAction: {
    alignItems: 'center',
    gap: 6,
  },
  quickCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  quickLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.slate,
  },
  glanceStrip: {
    flexDirection: 'row',
    marginTop: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: spacing.lg,
    ...shadows.soft,
  },
  glanceTile: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  glanceDivider: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.line,
  },
  glanceValue: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    color: colors.ink,
  },
  glanceLabel: {
    marginTop: 4,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.mute,
  },
  privacyBanner: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.forestWash,
  },
  privacyText: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 18,
    color: colors.forest,
  },
  detailCard: {
    marginTop: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  detailBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  insight: {
    marginTop: spacing.lg,
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 20,
    color: colors.mute,
  },
  timeline: {
    marginTop: spacing.xl,
  },
  timelineLabel: {
    marginBottom: spacing.md,
    color: colors.mute,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 12,
  },
  timelineRail: {
    alignItems: 'center',
    width: 8,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    backgroundColor: colors.forestBright,
  },
  timelineLine: {
    flex: 1,
    width: StyleSheet.hairlineWidth * 2,
    backgroundColor: colors.lineStrong,
    marginTop: 2,
  },
  bottomActions: {
    marginTop: spacing.xxl,
    flexDirection: 'row',
    gap: 10,
  },
  editBtn: {
    flex: 1,
    height: 50,
    borderRadius: radius.full,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...shadows.soft,
  },
  editBtnText: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    color: colors.forest,
  },
  deleteBtn: {
    flex: 1,
    height: 50,
    borderRadius: radius.full,
    backgroundColor: colors.coralSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  deleteBtnText: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    color: colors.coral,
  },
});
}
