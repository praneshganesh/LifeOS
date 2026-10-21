import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import Constants from 'expo-constants';
import { DETAIL_DOCK_PAD } from '@/components/ui/DetailKit';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useSpaces } from '@/lib/SpacesContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { useCurrency } from '@/lib/CurrencyContext';
import { loadPlanPrefs, planById } from '@/lib/planLimits';
import {
  fetchSubscriptionSnapshot,
  pendingSwitchLine,
  subscriptionDetailLine,
} from '@/lib/billing/revenueCat';
import { getAuthAccountState } from '@/lib/auth/apple';
import { moduleHref } from '@/lib/moduleNav';
import { useTheme } from '@/lib/ThemeContext';
import { fonts, spacing } from '@/constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, mode, resolved } = useTheme();
  const { spaces } = useSpaces();
  const { members } = useHousehold();
  const { currency } = useCurrency();
  const [planTitle, setPlanTitle] = useState('Trial');
  const [accountLine, setAccountLine] = useState('This device');

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void getAuthAccountState().then((s) => {
        if (!live) return;
        setAccountLine(
          s.hasAppleIdentity
            ? s.displayHint || 'Signed in with Apple'
            : s.userId
              ? 'Temporary account'
              : 'Not signed in'
        );
      });
      void Promise.all([loadPlanPrefs(), fetchSubscriptionSnapshot()]).then(
        ([prefs, snap]) => {
          if (!live) return;
          const name = planById(prefs.planId).name;
          const detail =
            snap && prefs.planId === 'pro'
              ? subscriptionDetailLine(snap)
              : '';
          const queued = pendingSwitchLine(snap, prefs.pendingProductId);
          const base = detail ? `${name} · ${detail}` : name;
          setPlanTitle(queued ? `${base}. ${queued}` : base);
        }
      );
      return () => {
        live = false;
      };
    }, [])
  );

  const homes = spaces.filter((s) => s.kind === 'home');
  const defaultHome = homes[0]?.name || 'No home yet';
  const homesMeta = [defaultHome, currency].filter(Boolean).join(' · ');
  const modeLabel =
    mode === 'system' ? `System · ${resolved}` : mode === 'dark' ? 'Dark' : 'Light';
  const version =
    Constants.expoConfig?.version ||
    Constants.nativeAppVersion ||
    '1.0.0';

  return (
    <ModuleScreen
      title="Settings"
      defaultOrigin="profile"
      bottomExtra={DETAIL_DOCK_PAD}
    >
      <ModuleSection label="You">
        <ListCard>
          <ListRow
            icon="id"
            title="Account"
            subtitle={accountLine}
            onPress={() => router.push('/settings/account' as Href)}
          />
          <ListRow
            icon="credit"
            title="Plan"
            subtitle={planTitle}
            onPress={() => router.push('/settings/plan' as Href)}
          />
          <ListRow
            icon="family"
            title="Household"
            subtitle={`${members.length} ${members.length === 1 ? 'person' : 'people'}`}
            onPress={() => router.push(moduleHref('/family', 'settings'))}
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="App">
        <ListCard>
          <ListRow
            icon="bell"
            title="Notifications"
            onPress={() => router.push('/settings/notifications' as Href)}
          />
          <ListRow
            icon="key"
            title="Face ID & lock"
            onPress={() => router.push('/settings/security' as Href)}
          />
          <ListRow
            icon="sparkles"
            title="Appearance"
            subtitle={modeLabel}
            onPress={() => router.push('/settings/appearance' as Href)}
          />
          <ListRow
            icon="house"
            title="Home & currency"
            subtitle={homesMeta}
            onPress={() => router.push('/settings/homes' as Href)}
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Legal">
        <ListCard>
          <ListRow
            icon="scroll"
            title="Privacy & terms"
            onPress={() => router.push('/settings/privacy' as Href)}
            last
          />
        </ListCard>
      </ModuleSection>

      <Text
        style={{
          fontFamily: fonts.sans,
          fontSize: 13,
          color: colors.faint,
          textAlign: 'center',
          marginTop: spacing.xl,
          marginBottom: spacing.md,
        }}
      >
        Saavi · {version}
      </Text>
    </ModuleScreen>
  );
}
