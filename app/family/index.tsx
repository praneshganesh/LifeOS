import { useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, StatStrip } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { CaptureContextButton } from '@/components/CaptureContextButton';
import { AddButton, HeaderActions } from '@/components/ui/AddButton';
import { useHousehold } from '@/lib/HouseholdContext';
import { useInventory } from '@/lib/InventoryContext';
import { useSpaces } from '@/lib/SpacesContext';
import { spaceIdByKind } from '@/lib/moduleFilters';
import { selfMember } from '@/lib/people';
import { useDeleteWithConfirm } from '@/lib/useDeleteWithConfirm';
import { SwipeActions } from '@/components/ui/SwipeActions';
import { fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

export default function FamilyScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { members, removeMember } = useHousehold();
  const { items } = useInventory();
  const deleteWithConfirm = useDeleteWithConfirm();
  const self = selfMember(members);
  const { spaces } = useSpaces();
  const familySpaceId = spaceIdByKind(spaces, 'family');

  const adults = members.filter((m) => m.role === 'adult' || m.role === 'parent');
  const kids = members.filter((m) => m.role === 'child');
  const pets = members.filter((m) => m.role === 'pet');

  const docsByPerson = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of items) {
      if (!i.isDocument) continue;
      const key = i.personId || i.assignedTo?.toLowerCase();
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [items]);

  const devicesByPerson = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of items) {
      if (i.isDocument) continue;
      const key = i.personId || i.assignedTo?.toLowerCase();
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [items]);

  function countsFor(m: { id: string; name: string }) {
    const docs =
      (docsByPerson.get(m.id) || 0) +
      (docsByPerson.get(m.name.toLowerCase()) || 0);
    const devices =
      (devicesByPerson.get(m.id) || 0) +
      (devicesByPerson.get(m.name.toLowerCase()) || 0);
    return { docs, devices };
  }

  const totalDocs = members.reduce((n, m) => n + countsFor(m).docs, 0);

  return (
    <ModuleScreen
      title="Household"
      defaultOrigin="things"
      right={
        <HeaderActions>
          <CaptureContextButton
            kind="family"
            spaceId={familySpaceId}
            label="Capture for family"
          />
          <AddButton
            onPress={() => router.push('/family/create' as Href)}
            label="Add person or pet"
          />
        </HeaderActions>
      }
    >
      <StatStrip
        items={[
          { label: 'People', value: String(adults.length + kids.length) },
          { label: 'Pets', value: String(pets.length) },
          { label: 'Docs', value: String(totalDocs) },
        ]}
      />

      <ModuleSection label="Members" count={members.length}>
        {members.length ? (
          <ListCard>
            {members.map((m, i) => {
              const { docs, devices } = countsFor(m);
              return (
                <SwipeActions
                  key={m.id}
                  onDelete={
                    m.id === self?.id
                      ? undefined
                      : () => void deleteWithConfirm(m.name, () => removeMember(m.id))
                  }
                >
                <Pressable
                  onPress={() => router.push(`/family/${m.id}` as Href)}
                  style={[
                    styles.member,
                    { backgroundColor: colors.surface },
                    i < members.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.line,
                    },
                  ]}
                >
                  <View style={[styles.avatar, { backgroundColor: colors.surfaceSoft }]}>
                    <Text style={[styles.avatarLetter, { color: colors.ink }]}>
                      {m.avatarLetter}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="headline">{m.name}</Text>
                    <Text variant="caption" style={{ marginTop: 2 }}>
                      {m.relation} · {docs} docs · {devices} things
                    </Text>
                  </View>
                  <Text style={[styles.role, { color: colors.mute }]}>{m.role}</Text>
                  <ChevronRight size={16} color={colors.faint} strokeWidth={1.8} />
                </Pressable>
                </SwipeActions>
              );
            })}
          </ListCard>
        ) : (
          <Text variant="body" style={{ color: colors.mute }}>
            No one yet. Tap + to add.
          </Text>
        )}
      </ModuleSection>

    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
  },
  role: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    textTransform: 'capitalize',
  },
});
