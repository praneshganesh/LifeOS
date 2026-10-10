import { useTheme } from '@/lib/ThemeContext';
import { useToast } from '@/lib/ToastContext';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Redirect, Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import {
  DETAIL_DOCK_PAD,
  DetailHero,
  DetailSection,
} from '@/components/ui/DetailKit';
import { SpaceEditor } from '@/app/space/edit/[id]';
import { MODULE_TONE_FALLBACK, moduleTone } from '@/lib/moduleTone';
import { SwipeableThingRow } from '@/components/SwipeableThingRow';
import { useInventory } from '@/lib/InventoryContext';
import { useSpaces } from '@/lib/SpacesContext';
import { inventoryToAsset } from '@/lib/mergeAssets';
import { confirmDelete } from '@/lib/confirmDelete';
import { type ThemeColors, fonts, radius, shadows, spacing } from '@/constants/theme';
import { blurActiveElement } from '@/lib/a11y';
import { captureHref, kindFromSpace, rememberCaptureContext } from '@/lib/captureContext';
import { useModuleBack } from '@/lib/useModuleBack';

export default function SpaceDetailScreen() {
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { items: inventory, removeItem, getById } = useInventory();
  const { showError } = useToast();
  const { getSpace } = useSpaces();
  const scrollRef = useRef<ScrollView>(null);
  const { backLabel, onBack: handleBack } = useModuleBack({ defaultOrigin: 'things' });

  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, [])
  );

  const space = id ? getSpace(id) : undefined;
  const userAssets = useMemo(
    () =>
      inventory
        .filter((i) => i.spaceId === id)
        .map(inventoryToAsset),
    [inventory, id]
  );
  const spaceAssets = userAssets;
  const captureKind = kindFromSpace(space?.kind);

  useEffect(() => {
    if (space) {
      rememberCaptureContext(captureKind, { spaceId: space.id });
    }
  }, [space, captureKind]);

  if (id === 'new') {
    return <Redirect href={'/space/create' as Href} />;
  }

  async function onDeleteThing(assetId: string, name: string) {
    if (!getById(assetId)) return;
    const ok = await confirmDelete(name);
    if (!ok) return;
    await removeItem(assetId).catch(() => showError('Couldn’t delete — try again.'));
  }

  if (!space) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.missing, { paddingTop: insets.top + spacing.lg }]}>
          <Text variant="bodyMedium" style={{ color: colors.mute }}>
            This place couldn’t be found.
          </Text>
          <Pressable onPress={handleBack} style={styles.backBtn}>
            <ChevronLeft size={20} color={colors.ink} strokeWidth={2.4} />
            <Text style={styles.backLabel}>{backLabel}</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const accent = colors.accent;

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 12) + spacing.xs,
            paddingBottom: insets.bottom + DETAIL_DOCK_PAD,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topNav}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [
              styles.backBtn,
              pressed && styles.backBtnPressed,
            ]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Go back to ${backLabel}`}
          >
            <ChevronLeft size={20} color={colors.ink} strokeWidth={2.4} />
            <Text style={styles.backLabel}>{backLabel}</Text>
          </Pressable>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => {
                blurActiveElement();
                router.push(
                  captureHref({ kind: captureKind, spaceId: space.id })
                );
              }}
              style={({ pressed }) => [
                styles.addBtn,
                { backgroundColor: colors.accent },
                pressed && { opacity: 0.9 },
              ]}
              accessibilityLabel={`Capture for ${space.name}`}
            >
              <Plus size={18} color={colors.accentOn} strokeWidth={2.2} />
            </Pressable>
          </View>
        </View>

        <DetailHero
          eyebrow="Space"
          title={space.name}
          subtitle={space.meta || undefined}
          accent={moduleTone('things', colors, resolved === 'light').accent}
          vividFallback={MODULE_TONE_FALLBACK.things}
        />

        <SpaceEditor spaceId={space.id} />

        {space.kind === 'family' ? (
          <Pressable
            onPress={() => {
              blurActiveElement();
              router.push('/family' as Href);
            }}
            style={({ pressed }) => [styles.householdLink, pressed && { opacity: 0.8 }]}
            accessibilityLabel="Open Household"
          >
            <Text style={[styles.householdLinkText, { color: accent }]}>Household</Text>
            <ChevronRight size={16} color={accent} strokeWidth={2.2} />
          </Pressable>
        ) : null}

        <DetailSection label="Things here">
          {spaceAssets.length === 0 ? (
            <Pressable
              onPress={() => {
                blurActiveElement();
                router.push(
                  captureHref({ kind: captureKind, spaceId: space.id })
                );
              }}
              style={styles.empty}
            >
              <Text variant="headline">Nothing here yet</Text>
              <Text variant="caption" style={{ marginTop: 4 }}>
                Tap + to capture
              </Text>
            </Pressable>
          ) : (
            <View>
              {spaceAssets.map((asset) => (
                <SwipeableThingRow
                  key={asset.id}
                  name={asset.name}
                  icon={asset.icon}
                  subtitle={[asset.brand, asset.room].filter(Boolean).join(' · ')}
                  onPress={() => router.push(`/asset/${asset.id}`)}
                  onEdit={
                    getById(asset.id)
                      ? () => router.push(`/asset/${asset.id}`)
                      : undefined
                  }
                  onDelete={
                    getById(asset.id)
                      ? () => void onDeleteThing(asset.id, asset.name)
                      : undefined
                  }
                />
              ))}
            </View>
          )}
        </DetailSection>
      </ScrollView>
    </Screen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
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
    borderRadius: radius.md,
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
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  softIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  roomGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  roomCard: {
    width: '47.8%',
    paddingVertical: spacing.lg,
  },
  empty: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  householdLink: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    paddingVertical: 4,
  },
  householdLinkText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
  },
});
}
