import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow } from '@/components/ui/ListKit';
import { useSpaces } from '@/lib/SpacesContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { useCurrency } from '@/lib/CurrencyContext';
import { loadLocalProfile } from '@/lib/profile';
import { loadPlanPrefs, planById } from '@/lib/planLimits';
import { resolveSelfDisplayName } from '@/lib/people';
import { moduleHref } from '@/lib/moduleNav';
import { useTheme } from '@/lib/ThemeContext';
import { THEME_FAMILIES } from '@/constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { family, resolved } = useTheme();
  const { spaces } = useSpaces();
  const { members } = useHousehold();
  const { currency } = useCurrency();
  const [displayName, setDisplayName] = useState('You');
  const [planTitle, setPlanTitle] = useState('Trial');

  // Reload on focus (not just mount) so edits made on child screens
  // show immediately when navigating back.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void loadLocalProfile().then((p) => {
        if (!live) return;
        setDisplayName(
          resolveSelfDisplayName(p.displayName, members) || p.displayName
        );
      });
      void loadPlanPrefs().then((prefs) => {
        if (live) setPlanTitle(planById(prefs.planId).name);
      });
      return () => {
        live = false;
      };
    }, [members])
  );

  const homes = spaces.filter((s) => s.kind === 'home');
  const defaultHome = homes[0]?.name || 'No home yet';
  const homesMeta = [defaultHome, currency].filter(Boolean).join(' · ');

  return (
    <ModuleScreen
      title="Settings"
      subtitle="Privacy, security, notifications, and data."
      defaultOrigin="profile"
    >
      <ModuleSection label="Account">
        <ListCard>
          <ListRow
            icon="family"
            title="Profile"
            subtitle={displayName}
            onPress={() => router.push(moduleHref('/profile', 'settings'))}
          />
          <ListRow
            icon="credit"
            title="Plan & billing"
            subtitle={planTitle}
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
            subtitle={homesMeta}
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
            subtitle="Face ID & app lock"
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
            title="About Saavi"
            onPress={() => router.push('/settings/about' as Href)}
            last
          />
        </ListCard>
      </ModuleSection>
    </ModuleScreen>
  );
}
