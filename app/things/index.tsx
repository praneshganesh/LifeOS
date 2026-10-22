import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { AddButton, HeaderActions } from '@/components/ui/AddButton';
import { CaptureContextButton } from '@/components/CaptureContextButton';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import { FilterChips } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { SwipeableThingRow } from '@/components/SwipeableThingRow';
import { useInventory } from '@/lib/InventoryContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { isDocumentItem, isVehicleItem } from '@/lib/moduleFilters';
import { moduleHref } from '@/lib/moduleNav';
import { confirmDelete } from '@/lib/confirmDelete';
import { blurActiveElement } from '@/lib/a11y';
import { fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import { useToast } from '@/lib/ToastContext';
import { hasValue } from '@/lib/inventoryNormalize';

type TypeFilter = 'all' | 'vehicles' | 'documents';
type WhoFilter = 'all' | `person:${string}`;

/** Flat Things library, Type and Who are independent filters. */
export default function ThingsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { items, removeItem, getById } = useInventory();
  const { showError } = useToast();
  const { members } = useHousehold();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [whoFilter, setWhoFilter] = useState<WhoFilter>('all');

  const typeOptions = useMemo(
    () => [
      { key: 'all', label: 'All' },
      { key: 'vehicles', label: 'Vehicles' },
      { key: 'documents', label: 'Documents' },
    ],
    []
  );

  const whoOptions = useMemo(() => {
    const people = members.map((m) => ({
      key: `person:${m.id}`,
      label: m.name,
    }));
    return [{ key: 'all', label: 'Anyone' }, ...people];
  }, [members]);

  const sortedThings = useMemo(
    () => [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [items]
  );

  const visibleThings = useMemo(() => {
    let list = sortedThings;
    if (typeFilter === 'vehicles') list = list.filter((i) => isVehicleItem(i));
    else if (typeFilter === 'documents') list = list.filter((i) => isDocumentItem(i));

    if (whoFilter.startsWith('person:')) {
      const personId = whoFilter.slice('person:'.length);
      const member = members.find((m) => m.id === personId);
      list = list.filter(
        (i) =>
          i.personId === personId ||
          (member &&
            i.assignedTo &&
            i.assignedTo.toLowerCase() === member.name.toLowerCase())
      );
    }
    return list;
  }, [sortedThings, typeFilter, whoFilter, members]);

  async function onDeleteThing(id: string, name: string) {
    if (!getById(id)) return;
    const ok = await confirmDelete(name);
    if (!ok) return;
    await removeItem(id).catch(() => showError('Couldn’t delete. Try again.'));
  }

  function openCreate() {
    blurActiveElement();
    router.push('/things/create' as Href);
  }

  return (
    <ModuleScreen
      title="Things"
      defaultOrigin="things"
      right={
        <HeaderActions>
          <CaptureContextButton kind="general" label="Add with camera" />
          <AddButton onPress={openCreate} label="Add thing" />
        </HeaderActions>
      }
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.filterBlock}>
        <Text style={[styles.filterLabel, { color: colors.mute }]}>Type</Text>
        <FilterChips
          options={typeOptions}
          value={typeFilter}
          onChange={(key) => setTypeFilter(key as TypeFilter)}
        />
      </View>

      {members.length > 0 ? (
        <View style={styles.filterBlock}>
          <Text style={[styles.filterLabel, { color: colors.mute }]}>Who</Text>
          <FilterChips
            options={whoOptions}
            value={whoFilter}
            onChange={(key) => setWhoFilter(key as WhoFilter)}
            tone="people"
          />
        </View>
      ) : null}

      {visibleThings.length === 0 ? (
        <Pressable
          onPress={openCreate}
          style={({ pressed }) => [
            styles.empty,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
            },
            pressed && { opacity: 0.9 },
          ]}
        >
          <Text variant="headline">No things yet</Text>
          <Text variant="caption" style={{ marginTop: 4 }}>
            Tap + to type one in, or the camera to snap it
          </Text>
        </Pressable>
      ) : (
        <Animated.View entering={FadeInDown.springify().damping(18)}>
          {visibleThings.map((item) => {
            const subtitle = [
              hasValue(item.brand) ? item.brand : null,
              hasValue(item.category) ? item.category : null,
              item.assignedTo || null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <SwipeableThingRow
                key={item.id}
                name={item.name}
                icon={item.icon}
                subtitle={subtitle || undefined}
                onPress={() =>
                  router.push(moduleHref(`/asset/${item.id}`, 'things'))
                }
                onDelete={() => void onDeleteThing(item.id, item.name)}
              />
            );
          })}
        </Animated.View>
      )}
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  filterBlock: {
    marginBottom: spacing.sm,
  },
  filterLabel: {
    fontFamily: fonts.sansSemi,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  empty: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
});
