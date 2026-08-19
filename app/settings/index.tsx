import { useEffect, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow } from '@/components/ui/ListKit';
import { useSpaces } from '@/lib/SpacesContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { loadLocalProfile } from '@/lib/profile';
import { resolveSelfDisplayName } from '@/lib/people';
import { useTheme } from '@/lib/ThemeContext';
import { THEME_FAMILIES } from '@/constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { family, resolved } = useTheme();
  const { spaces } = useSpaces();
  const { members } = useHousehold();
  const [displayName, setDisplayName] = useState('You');

  useEffect(() => {
    void loadLocalProfile().then((p) =>
      setDisplayName(resolveSelfDisplayName(p.displayName, members) || p.displayName)
    );
  }, [members]);

  const homes = spaces.filter((s) => s.kind === 'home');
  const defaultHome = homes[0]?.name || 'No home yet';

  return (
    <ModuleScreen
      title="Settings"
      subtitle="Privacy, security, notifications, and data."
    >
      <ModuleSection label="Account">
        <ListCard>
          <ListRow
            icon="family"
            title="Profile"
            subtitle={displayName}
            onPress={() => router.push('/profile' as Href)}
          />
          <ListRow
            icon="credit"
            title="Plan & billing"
            subtitle="Trial · on this device"
            onPress={() => router.push('/settings/plan' as Href)}
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Preferences">
        <ListCard>
          <ListRow
            icon="bell"
            title="Notification preferences"
            onPress={() => router.push('/settings/notifications' as Href)}
          />
          <ListRow
            icon="sparkles"
            title="Appearance"
            subtitle={`${THEME_FAMILIES.find((t) => t.id === family)?.title ?? 'Earth'} · ${resolved}`}
            onPress={() => router.push('/settings/appearance' as Href)}
          />
          <ListRow
            icon="house"
            title="Homes & defaults"
            subtitle={defaultHome}
            onPress={() => router.push('/settings/homes' as Href)}
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Privacy & security">
        <ListCard>
          <ListRow
            icon="shield"
            title="Privacy"
            subtitle="On-device first · chat summary only"
            onPress={() => router.push('/settings/privacy' as Href)}
          />
          <ListRow
            icon="key"
            title="Security"
            subtitle="Biometrics coming soon"
            onPress={() => router.push('/settings/security' as Href)}
          />
          <ListRow
            icon="family"
            title="Sharing & permissions"
            subtitle={`${members.length} household`}
            onPress={() => router.push('/settings/sharing' as Href)}
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Data">
        <ListCard>
          <ListRow
            icon="package"
            title="Export & backup"
            subtitle="Phone + cloud snapshot"
            onPress={() => router.push('/settings/data' as Href)}
          />
          <ListRow
            icon="document"
            title="About LifeOS"
            onPress={() => router.push('/settings/about' as Href)}
            last
          />
        </ListCard>
      </ModuleSection>
    </ModuleScreen>
  );
}
