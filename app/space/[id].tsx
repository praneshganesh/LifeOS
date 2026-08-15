import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Redirect, Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pencil, Plus } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Icon3DBadge } from '@/components/ui/Icon3D';
import { SwipeableThingRow } from '@/components/SwipeableThingRow';
import { useInventory } from '@/lib/InventoryContext';
import { useSpaces } from '@/lib/SpacesContext';
import { inventoryToAsset } from '@/lib/mergeAssets';
import { confirmDelete } from '@/lib/confirmDelete';
import { colors, radius, spacing } from '@/constants/theme';
import { blurActiveElement } from '@/lib/a11y';
import { captureHref, kindFromSpace, rememberCaptureContext } from '@/lib/captureContext';

export default function SpaceDetailScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { items: inventory, removeItem, getById } = useInventory();
  const { getSpace, roomsForSpace } = useSpaces();
  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, [])
  );

  const space = id ? getSpace(id) : undefined;
  const spaceRooms = space ? roomsForSpace(space.id) : [];
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
    await removeItem(assetId);
  }

  if (!space) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Not found' }} />
        <View style={styles.missing}>
          <Text variant="bodyMedium" style={{ color: colors.mute }}>
            This place couldn’t be found.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: space.name }} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Icon3DBadge name={space.icon} size={64} />
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => {
                blurActiveElement();
                router.push(`/space/edit/${space.id}` as Href);
              }}
              style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.9 }]}
              accessibilityLabel={`Edit ${space.name}`}
            >
              <Pencil size={16} color={colors.forest} strokeWidth={2.2} />
            </Pressable>
            <Pressable
              onPress={() => {
                blurActiveElement();
                router.push(
                  captureHref({ kind: captureKind, spaceId: space.id })
                );
              }}
              style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.9 }]}
              accessibilityLabel={`Capture for ${space.name}`}
            >
              <Plus size={18} color={colors.forestOn} strokeWidth={2.2} />
            </Pressable>
          </View>
        </View>
        <Text variant="title" style={{ marginTop: spacing.md }}>
          {space.name}
        </Text>
        <Text variant="body" style={{ marginTop: 6, marginBottom: spacing.xl }}>
          {space.meta} · {spaceAssets.length} items
        </Text>

        {spaceRooms.length > 0 ? (
          <>
            <Text variant="label" style={styles.label}>
              Rooms
            </Text>
            <View style={styles.roomGrid}>
              {spaceRooms.map((room) => (
                <Card
                  key={room.id}
                  style={styles.roomCard}
                  onPress={() => router.push(`/room/${room.id}` as Href)}
                >
                  <Icon3DBadge name={room.icon} size={44} />
                  <Text variant="headline" style={{ marginTop: 10 }}>
                    {room.name}
                  </Text>
                  <Text variant="caption" style={{ marginTop: 4 }}>
                    {
                      spaceAssets.filter(
                        (a) =>
                          a.room.toLowerCase() === room.name.toLowerCase()
                      ).length
                    }{' '}
                    items
                  </Text>
                </Card>
              ))}
            </View>
          </>
        ) : null}

        <Text variant="label" style={styles.label}>
          Things here
        </Text>
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
              Capture something for {space.name}
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
                onDelete={
                  getById(asset.id)
                    ? () => void onDeleteThing(asset.id, asset.name)
                    : undefined
                }
              />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginBottom: spacing.sm,
    color: colors.mute,
  },
  roomGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  roomCard: {
    width: '47.8%',
    paddingVertical: spacing.lg,
  },
  empty: {
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.forestSoft,
    padding: spacing.lg,
  },
});
