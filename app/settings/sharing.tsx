import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { DETAIL_DOCK_PAD } from '@/components/ui/DetailKit';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useHousehold } from '@/lib/HouseholdContext';
import { labelForPermission } from '@/lib/household';
import { usePlan } from '@/lib/PlanContext';
import { createInvite, shareInvite } from '@/lib/invites/api';
import { FAMILY_LOGIN_SEATS } from '@/lib/planLimits';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

export default function SharingSettingsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { members } = useHousehold();
  const { entitlement, membership, subscribe, refresh } = usePlan();
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  async function onInvite() {
    if (membership.role === 'member') {
      Alert.alert(
        'Family member',
        'Only the plan owner can invite people to this household.'
      );
      return;
    }

    if (entitlement.planId === 'trial' || entitlement.planId === 'pro') {
      Alert.alert(
        'Family plan required',
        'Inviting someone to log in needs the Family plan (up to 4 logins). Person tags stay free on Pro.',
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Upgrade to Family',
            onPress: () => {
              void (async () => {
                await subscribe('family');
                await refresh();
                Alert.alert('Family unlocked', 'You can invite a login now.');
              })();
            },
          },
          {
            text: 'View plans',
            onPress: () => router.push('/settings/plan' as Href),
          },
        ]
      );
      return;
    }

    if (!entitlement.canInvite) {
      Alert.alert(
        'No seats left',
        `Family includes ${FAMILY_LOGIN_SEATS} logins. Remove someone or add a seat later.`
      );
      return;
    }

    if (busy) return;
    setBusy(true);
    try {
      const { code, url } = await createInvite({ permission: 'editor' });
      await shareInvite(code, url);
    } catch {
      Alert.alert('Invite', 'Could not create invite. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const seatLabel =
    entitlement.planId === 'family'
      ? `${entitlement.seatsRemaining} of ${entitlement.seatsTotal - 1} invite seats left`
      : entitlement.planId === 'pro'
        ? 'Pro · upgrade to invite logins'
        : entitlement.status === 'member'
          ? 'You’re on a family plan'
          : 'Trial · person tags free, login invites need Family';

  return (
    <ModuleScreen
      title="Sharing"
      backLabel="Settings"
      backFallbackHref="/settings"
      bottomExtra={DETAIL_DOCK_PAD}
    >
      <ModuleSection label="Login invites">
        <ListCard>
          <ListRow
            title={busy ? 'Creating invite…' : 'Invite to Family'}
            subtitle={seatLabel}
            onPress={() => void onInvite()}
            last
          />
        </ListCard>
        <Text
          variant="caption"
          style={{ color: colors.mute, marginTop: spacing.sm }}
        >
          Person tags (kids, pets) don’t need a seat. Invites are for iOS/Android
          logins on your Family subscription.
        </Text>
      </ModuleSection>

      <ModuleSection label="Household people" count={members.length}>
        {members.length === 0 ? (
          <Text
            variant="body"
            style={{ color: colors.mute, marginBottom: spacing.md }}
          >
            No people yet. Add family members to assign Things and habits.
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

      <ModuleSection label="Have a code?">
        <ListCard>
          <ListRow
            title="Join a family"
            subtitle="Accept an invite on this login"
            onPress={() => router.push('/invite' as Href)}
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
