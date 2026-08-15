import { useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow, StatStrip } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { CaptureContextButton } from '@/components/CaptureContextButton';
import { useHousehold } from '@/lib/HouseholdContext';
import { useInventory } from '@/lib/InventoryContext';
import { useSpaces } from '@/lib/SpacesContext';
import { spaceIdByKind } from '@/lib/moduleFilters';
import { colors, fonts, radius, spacing } from '@/constants/theme';

export default function FamilyScreen() {
  const router = useRouter();
  const { members } = useHousehold();
  const { items } = useInventory();
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
      title="Family"
      subtitle="People, pets, and who things belong to."
      right={
        <CaptureContextButton
          kind="family"
          spaceId={familySpaceId}
          label="Capture for family"
        />
      }
    >
      <StatStrip
        items={[
          { label: 'People', value: String(adults.length + kids.length) },
          { label: 'Pets', value: String(pets.length) },
          { label: 'Docs', value: String(totalDocs) },
        ]}
      />

      <Pressable
        onPress={() => router.push('/family/create' as Href)}
        style={styles.addBtn}
      >
        <Plus size={18} color={colors.forest} strokeWidth={2.2} />
        <Text style={styles.addLabel}>Add person or pet</Text>
      </Pressable>

      <ModuleSection label="Members" count={members.length}>
        {members.length ? (
          <ListCard>
            {members.map((m, i) => {
              const { docs, devices } = countsFor(m);
              return (
                <Pressable
                  key={m.id}
                  onPress={() => router.push(`/family/${m.id}` as Href)}
                  style={[styles.member, i < members.length - 1 && styles.border]}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarLetter}>{m.avatarLetter}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="headline">{m.name}</Text>
                    <Text variant="caption" style={{ marginTop: 2 }}>
                      {m.relation} · {docs} docs · {devices} things
                    </Text>
                  </View>
                  <Text style={styles.role}>{m.role}</Text>
                </Pressable>
              );
            })}
          </ListCard>
        ) : (
          <Text variant="body" style={styles.empty}>
            No one yet. Add yourself and family so Talk can tag things “for Priya” only when that person exists here.
          </Text>
        )}
      </ModuleSection>

      <ModuleSection label="Sharing">
        <ListCard>
          <ListRow
            icon="family"
            title="Permissions"
            subtitle="Owner, admin, editor, viewer"
            onPress={() => router.push('/settings/sharing' as Href)}
          />
          <ListRow
            icon="house"
            title="Shared homes"
            subtitle="From Spaces"
            onPress={() => router.push('/(tabs)/spaces' as Href)}
            last
          />
        </ListCard>
      </ModuleSection>
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.forestSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  addLabel: {
    fontFamily: fonts.sansSemi,
    fontSize: 14,
    color: colors.forest,
  },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  border: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.forestSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: fonts.sansSemi,
    fontSize: 15,
    color: colors.forest,
  },
  role: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    color: colors.mute,
    textTransform: 'capitalize',
  },
  empty: {
    color: colors.mute,
  },
});
