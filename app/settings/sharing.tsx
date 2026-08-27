import { useRouter, type Href } from 'expo-router';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useHousehold } from '@/lib/HouseholdContext';
import { labelForPermission } from '@/lib/household';
import { colors, spacing } from '@/constants/theme';

export default function SharingSettingsScreen() {
  const router = useRouter();
  const { members } = useHousehold();

  return (
    <ModuleScreen
      title="Sharing"
      subtitle="Your household — live invites coming soon."
    >
      <ModuleSection label="Household" count={members.length}>
        {members.length === 0 ? (
          <Text variant="body" style={{ color: colors.mute, marginBottom: spacing.md }}>
            No people yet. Add family members to assign owner / editor / viewer stubs.
          </Text>
        ) : (
          <ListCard>
            {members.map((m, i) => (
              <ListRow
                key={m.id}
                icon={m.icon}
                title={m.name}
                subtitle={`${m.relation || m.role} · ${labelForPermission(m.permission)}`}
                onPress={() => router.push(`/family/${m.id}` as Href)}
                last={i === members.length - 1}
              />
            ))}
          </ListCard>
        )}
      </ModuleSection>

      <ModuleSection label="Roles">
        <ListCard>
          <ListRow
            title="Owner / editor / viewer"
            subtitle="Roles per person — tap a member to change"
            meta="On device"
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Coming later">
        <ListCard>
          <ListRow
            title="Live invites"
            subtitle="Needs accounts & sync"
            meta="Later"
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Shortcuts">
        <ListCard>
          <ListRow
            icon="family"
            title="Open Household"
            onPress={() => router.push('/family' as Href)}
            last
          />
        </ListCard>
      </ModuleSection>
    </ModuleScreen>
  );
}
