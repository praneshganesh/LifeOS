import { useTheme } from '@/lib/ThemeContext';
import { useToast } from '@/lib/ToastContext';
import { useCallback, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Plus } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Icon3DBadge } from '@/components/ui/Icon3D';
import { SwipeableThingRow } from '@/components/SwipeableThingRow';
import { useSpaces } from '@/lib/SpacesContext';
import { useInventory } from '@/lib/InventoryContext';
import { inventoryToAsset } from '@/lib/mergeAssets';
import { confirmDelete } from '@/lib/confirmDelete';
import { captureHref } from '@/lib/captureContext';
import { blurActiveElement } from '@/lib/a11y';
import { type ThemeColors,  colors, fonts, radius, spacing  } from '@/constants/theme';
import { useRememberCaptureContext } from '@/components/CaptureContextButton';

export default function RoomDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getRoom, getSpace } = useSpaces();
  const { items: inventory, removeItem, getById } = useInventory();
  const { showError } = useToast();
  const scrollRef = useRef<ScrollView>(null);
  const room = id ? getRoom(id) : undefined;

  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, [])
  );
  const space = room ? getSpace(room.spaceId) : undefined;
  const roomAssets = useMemo(
    () =>
      inventory
        .filter(
          (i) =>
            i.spaceId === room?.spaceId &&
            i.room.toLowerCase() === room?.name.toLowerCase()
        )
        .map(inventoryToAsset),
    [inventory, room]
  );

  useRememberCaptureContext('room', {
    spaceId: room?.spaceId,
    room: room?.name,
  });

  async function onDeleteThing(assetId: string, name: string) {
    if (!getById(assetId)) return;
    const ok = await confirmDelete(name);
    if (!ok) return;
    await removeItem(assetId).catch(() => showError('Couldn’t delete — try again.'));
  }

  function handleBack() {
    blurActiveElement();
    if (router.canGoBack()) router.back();
    else if (space) router.replace(`/space/${space.id}` as Href);
    else router.replace('/(tabs)/spaces' as Href);
  }

  if (!room) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.missing, { paddingTop: insets.top + spacing.lg }]}>
          <Text variant="bodyMedium" style={{ color: colors.mute }}>
            This room couldn’t be found.
          </Text>
          <Pressable onPress={handleBack} style={styles.backBtn}>
            <ChevronLeft size={20} color={colors.ink} strokeWidth={2.4} />
            <Text style={styles.backLabel}>Go back</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 12) + spacing.xs,
            paddingBottom: insets.bottom + 40,
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
            accessibilityLabel={space ? `Go back to ${space.name}` : 'Go back'}
          >
            <ChevronLeft size={20} color={colors.ink} strokeWidth={2.4} />
            <Text style={styles.backLabel}>{space?.name || 'Space'}</Text>
          </Pressable>
        </View>

        <View style={styles.headerRow}>
          <Icon3DBadge name={room.icon} size={64} />
          <Pressable
            onPress={() => {
              blurActiveElement();
              router.push(
                captureHref({
                  kind: 'room',
                  spaceId: room.spaceId,
                  room: room.name,
                })
              );
            }}
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.9 }]}
            accessibilityLabel={`Capture for ${room.name}`}
          >
            <Plus size={18} color={colors.forestOn} strokeWidth={2.2} />
          </Pressable>
        </View>
        <Text variant="title" style={{ marginTop: spacing.md }}>
          {room.name}
        </Text>
        <Text variant="body" style={{ marginTop: 6, marginBottom: spacing.xl }}>
          {space?.name ?? 'Home'} · {roomAssets.length} items
        </Text>

        <Text variant="label" style={styles.label}>
          Things here
        </Text>
        <View>
          {roomAssets.map((asset) => (
            <SwipeableThingRow
              key={asset.id}
              name={asset.name}
              icon={asset.icon}
              subtitle={asset.brand}
              onPress={() => router.push(`/asset/${asset.id}`)}
              onDelete={
                getById(asset.id)
                  ? () => void onDeleteThing(asset.id, asset.name)
                  : undefined
              }
            />
          ))}
        </View>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginBottom: spacing.sm,
    color: colors.mute,
  },
});
}
