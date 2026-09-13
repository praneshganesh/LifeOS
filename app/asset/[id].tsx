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
import { useMemo, useRef, type ReactNode } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  BookOpen,
  Camera,
  ChevronLeft,
  ChevronRight,
  FileText,
  Share2,
  Wrench,
} from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import {
  DETAIL_DOCK_PAD,
  DetailEditButton,
  DetailFact,
  DetailFacts,
  DetailHero,
  DetailRemoveButton,
  DetailSection,
} from '@/components/ui/DetailKit';
import { useInventory } from '@/lib/InventoryContext';
import { useLastDone } from '@/lib/LastDoneContext';
import { forInventoryItem, formatRelativeDone, getLastDoneAt } from '@/lib/lastDone';
import { formatDisplayDate, localDayKey } from '@/lib/dates';
import { inventoryToAsset } from '@/lib/mergeAssets';
import { captureHref } from '@/lib/captureContext';
import { resolveManualLink } from '@/lib/manualLink';
import { confirmDelete } from '@/lib/confirmDelete';
import { shareDocument } from '@/lib/shareDocument';
import { blurActiveElement } from '@/lib/a11y';
import { type ThemeColors, fonts, radius, spacing, shadows } from '@/constants/theme';

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
  const accent = isDoc ? colors.sky : colors.accent;
  const vividFallback = isDoc ? colors.sky : colors.forest;

  // Subtitle is brand · person only — category / document kind lives in the
  // hero eyebrow (or photo chrome), so it isn’t repeated on this line.
  const categoryPart = isDoc
    ? labelDocKind(captured?.documentKind) || 'Document'
    : asset.category && asset.category !== '—'
      ? asset.category
      : null;

  const heroEyebrow = isDoc
    ? categoryPart || undefined
    : asset.category && asset.category !== '—'
      ? asset.category
      : asset.room || undefined;

  const subtitle = [
    ...new Set(
      [
        asset.brand &&
        asset.brand !== 'Unknown' &&
        asset.brand !== 'Document' &&
        !/^identity$/i.test(asset.brand)
          ? asset.brand
          : null,
        // Photo hero has no eyebrow — keep category there so it’s still visible.
        hasPhoto && categoryPart ? categoryPart : null,
        captured?.assignedTo || asset.assignedTo || null,
      ].filter(Boolean) as string[]
    ),
  ].join(' · ');

  const warrantyDisplay = formatDisplayDate(
    asset.warrantyExpiry && asset.warrantyExpiry !== '—' ? asset.warrantyExpiry : undefined,
    { yearEndAsMonthYear: true }
  );
  const warrantyExpired = Boolean(
    asset.warrantyExpiry &&
      /^\d{4}-\d{2}-\d{2}/.test(asset.warrantyExpiry) &&
      asset.warrantyExpiry.slice(0, 10) < localDayKey()
  );
  const expiresDisplay = formatDisplayDate(captured?.expiryDate) ?? warrantyDisplay;
  const docExpired = Boolean(
    captured?.expiryDate &&
      /^\d{4}-\d{2}-\d{2}/.test(captured.expiryDate) &&
      captured.expiryDate.slice(0, 10) < localDayKey()
  );

  const glance: { label: string; value: string; tint?: string }[] = isDoc
    ? [
        { label: 'Type', value: labelDocKind(captured?.documentKind) },
        {
          label:
            captured?.documentKind === 'emirates_id'
              ? 'ID number'
              : captured?.documentKind === 'passport'
                ? 'Passport #'
                : 'Document #',
          value: captured?.documentNumber || (asset.serial !== '—' ? asset.serial : '—'),
        },
        {
          label: 'Expires',
          value: expiresDisplay ?? '—',
          tint: expiresDisplay ? (docExpired ? colors.coral : colors.forest) : undefined,
        },
      ]
    : [
        { label: 'Price', value: asset.price && asset.price !== '—' ? asset.price : '—' },
        {
          label: 'Warranty',
          value: warrantyDisplay ?? '—',
          tint: warrantyDisplay
            ? warrantyExpired
              ? colors.coral
              : colors.forest
            : undefined,
        },
        {
          label: 'Purchased',
          value: formatDisplayDate(asset.purchaseDate) ?? '—',
        },
      ];

  // Empty facts are hidden, never rendered as "—" placeholders.
  const detailRows = (
    isDoc
      ? [
          { label: 'Full name', value: captured?.fullName },
          { label: 'Nationality', value: captured?.nationality },
          { label: 'Date of birth', value: formatDisplayDate(captured?.dateOfBirth) },
        ]
      : [
          { label: 'Serial', value: asset.serial },
          { label: 'Bought from', value: captured?.purchasedFrom || asset.purchasedFrom },
          { label: 'Condition', value: asset.condition },
        ]
  ).filter(
    (row): row is { label: string; value: string } =>
      Boolean(row.value && row.value.trim()) &&
      row.value !== '—' &&
      row.value !== '-' &&
      !/^unknown$/i.test(row.value!)
  );

  const editHref = `/asset/edit/${asset.id}` as Href;

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />

      {hasPhoto ? (
        <View
          style={[styles.chrome, { top: insets.top + CHROME_TOP }]}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={goBack}
            style={({ pressed }) => [
              styles.chromeBtn,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
              },
              pressed && { opacity: 0.75 },
            ]}
            accessibilityLabel="Back"
            hitSlop={8}
          >
            <ChevronLeft size={22} color={colors.ink} strokeWidth={2.2} />
          </Pressable>
          {isUserItem ? (
            <DetailEditButton
              accent={accent}
              onPress={() => {
                blurActiveElement();
                router.push(editHref);
              }}
            />
          ) : null}
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + DETAIL_DOCK_PAD }}
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
            !hasPhoto && {
              paddingTop: Math.max(insets.top, 12) + spacing.xs,
            },
          ]}
        >
          {!hasPhoto ? (
            <View style={styles.topNav}>
              <Pressable
                onPress={goBack}
                style={({ pressed }) => [
                  styles.backBtn,
                  pressed && styles.backBtnPressed,
                ]}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <ChevronLeft size={20} color={colors.ink} strokeWidth={2.4} />
                <Text style={styles.backLabel}>Back</Text>
              </Pressable>
              {isUserItem ? (
                <DetailEditButton
                  accent={accent}
                  onPress={() => {
                    blurActiveElement();
                    router.push(editHref);
                  }}
                />
              ) : null}
            </View>
          ) : null}

          <Animated.View entering={FadeInDown.springify().damping(18)}>
            {!hasPhoto ? (
              <DetailHero
                eyebrow={heroEyebrow}
                title={asset.name}
                subtitle={subtitle || undefined}
                accent={accent}
                vividFallback={vividFallback}
              />
            ) : (
              <>
                <Text style={styles.title}>{asset.name}</Text>
                {subtitle ? (
                  <Text style={styles.subtitle} numberOfLines={2}>
                    {subtitle}
                  </Text>
                ) : null}
              </>
            )}
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(60).springify().damping(18)}
            style={styles.quickRow}
          >
            {isUserItem && isDoc ? (
              <QuickAction
                icon={<Share2 size={19} color={colors.pure} strokeWidth={2.2} />}
                label="Share"
                accent={accent}
                onPress={() => void onShare()}
              />
            ) : null}
            {isUserItem ? (
              <>
                <QuickAction
                  icon={<Camera size={19} color={colors.pure} strokeWidth={2.2} />}
                  label={hasPhoto ? 'Photo' : 'Add photo'}
                  accent={accent}
                  onPress={() => openAttach('photo')}
                />
                {!isDoc ? (
                  <QuickAction
                    icon={<FileText size={19} color={colors.pure} strokeWidth={2.2} />}
                    label="Receipt"
                    accent={accent}
                    onPress={() => openAttach('receipt')}
                  />
                ) : null}
              </>
            ) : null}
            {showManual && manual ? (
              <QuickAction
                icon={<BookOpen size={19} color={colors.pure} strokeWidth={2.2} />}
                label="Manual"
                accent={accent}
                onPress={() => {
                  void Linking.openURL(manual.url);
                }}
              />
            ) : null}
            {!isDoc ? (
              <QuickAction
                icon={<Wrench size={19} color={colors.pure} strokeWidth={2.2} />}
                label="Maintain"
                accent={accent}
                onPress={() =>
                  router.push(`/last-done?linkItemId=${encodeURIComponent(asset.id)}` as Href)
                }
              />
            ) : null}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).springify().damping(18)}>
            <DetailFacts>
              {glance.map((g, i) => (
                <View
                  key={g.label}
                  style={[
                    styles.glanceFact,
                    i < glance.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.line,
                    },
                  ]}
                >
                  <Text style={[styles.glanceLabel, { color: colors.mute }]}>{g.label}</Text>
                  <Text
                    style={[
                      styles.glanceValue,
                      { color: g.tint ?? colors.ink },
                    ]}
                    numberOfLines={1}
                  >
                    {g.value}
                  </Text>
                </View>
              ))}
            </DetailFacts>

            {linkedService ? (
              <Pressable
                onPress={() => {
                  blurActiveElement();
                  router.push(`/last-done/${linkedService.id}` as Href);
                }}
                style={({ pressed }) => [styles.maintCard, pressed && { opacity: 0.85 }]}
                accessibilityLabel={`Open ${linkedService.label}`}
              >
                <View style={[styles.maintIcon, { backgroundColor: colors.accentWash }]}>
                  <Wrench size={17} color={accent} strokeWidth={2} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="headline" numberOfLines={1}>
                    {linkedService.label}
                  </Text>
                  <Text variant="caption" style={{ marginTop: 2 }} numberOfLines={1}>
                    {[
                      linkedService.logs?.length
                        ? `Last ${formatRelativeDone(getLastDoneAt(linkedService)).toLowerCase()}`
                        : null,
                      linkedService.remindAt
                        ? `Next ${formatDisplayDate(linkedService.remindAt)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'No history yet'}
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.faint} strokeWidth={1.8} />
              </Pressable>
            ) : null}

            {isDoc ? (
              <View style={styles.privacyBanner}>
                <Text style={styles.privacyText}>
                  Document text was read on your device. Nothing was sent to AI.
                </Text>
              </View>
            ) : null}

            {detailRows.length ? (
              <DetailSection label="Details">
                <DetailFacts>
                  {detailRows.map((row, i) => (
                    <DetailFact
                      key={row.label}
                      label={row.label}
                      value={row.value}
                      last={i === detailRows.length - 1}
                    />
                  ))}
                </DetailFacts>
              </DetailSection>
            ) : null}

            {asset.timeline?.length ? (
              <DetailSection label="Timeline">
                {asset.timeline.map((event, i) => (
                  <View key={event.date + event.event + i} style={styles.timelineItem}>
                    <View style={styles.timelineRail}>
                      <View style={[styles.timelineDot, { backgroundColor: accent }]} />
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
              </DetailSection>
            ) : null}

            {isUserItem ? (
              <DetailRemoveButton onPress={() => void onDelete()} />
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
  accent,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  accent: string;
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
      style={({ pressed }) => [
        styles.quickAction,
        pressed && { opacity: 0.88, transform: [{ scale: 0.96 }] },
      ]}
      accessibilityLabel={label}
    >
      <View style={[styles.quickCircle, { backgroundColor: accent }]}>{icon}</View>
      <Text style={[styles.quickLabel, { color: colors.ink }]}>{label}</Text>
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
    right: spacing.lg,
    zIndex: 50,
    elevation: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chromeBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    marginLeft: -6,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
  },
  backBtnPressed: {
    opacity: 0.65,
  },
  backLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  softIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
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
  title: {
    fontFamily: fonts.sansSemi,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.5,
    color: colors.ink,
  },
  subtitle: {
    marginTop: 6,
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 20,
    color: colors.mute,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  quickAction: {
    alignItems: 'center',
    gap: 6,
    minWidth: 56,
  },
  quickCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  quickLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: -0.1,
  },
  glanceFact: {
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    gap: 4,
  },
  glanceLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  glanceValue: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    letterSpacing: -0.2,
  },
  maintCard: {
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  maintIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyBanner: {
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.forestWash,
  },
  privacyText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.forest,
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
  },
  timelineLine: {
    flex: 1,
    width: StyleSheet.hairlineWidth * 2,
    backgroundColor: colors.lineStrong,
    marginTop: 2,
  },
});
}
