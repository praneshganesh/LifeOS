import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { DETAIL_DOCK_PAD } from '@/components/ui/DetailKit';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useInventory } from '@/lib/InventoryContext';
import { useSpaces } from '@/lib/SpacesContext';
import { useHousehold } from '@/lib/HouseholdContext';
import {
  PLANS,
  buildLimitMeters,
  type PlanId,
} from '@/lib/planLimits';
import { usePlan } from '@/lib/PlanContext';
import { useRouter, type Href } from 'expo-router';
import { fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

export default function PlanSettingsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { items } = useInventory();
  const { spaces } = useSpaces();
  const { members } = useHousehold();
  const { prefs, entitlement, subscribe, restore, restartTrial, refresh, billingReady } =
    usePlan();

  const usage = useMemo(
    () => ({
      assets: items.length,
      homes: spaces.filter((s) => s.kind === 'home').length,
      members: members.length,
    }),
    [items.length, spaces, members.length]
  );

  const planId = prefs.planId;
  const plan = PLANS.find((p) => p.id === planId) ?? PLANS[0]!;
  const meters = buildLimitMeters(plan, usage);

  async function selectPlan(id: PlanId) {
    if (id === 'trial') {
      if (__DEV__) {
        await restartTrial();
        await refresh();
        Alert.alert('Dev', 'Trial restarted for 14 days.');
      }
      return;
    }
    if (id === planId) return;
    Alert.alert(
      `Switch to ${id === 'pro' ? 'Pro' : 'Family'}?`,
      billingReady
        ? 'This opens the App Store purchase sheet for the yearly plan.'
        : __DEV__
          ? 'RevenueCat isn’t available here — unlocks locally in development only.'
          : 'Use a TestFlight / native build to purchase.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => {
            void (async () => {
              try {
                await subscribe(id, 'yearly');
                await refresh();
              } catch (e) {
                Alert.alert(
                  'Purchase',
                  e instanceof Error ? e.message : 'Could not complete purchase.'
                );
              }
            })();
          },
        },
      ]
    );
  }

  const statusLine =
    entitlement.status === 'trial_active'
      ? `Trial · ${entitlement.trialDaysLeft} day${entitlement.trialDaysLeft === 1 ? '' : 's'} left`
      : entitlement.status === 'trial_expired'
        ? 'Trial ended — subscribe to continue'
        : entitlement.status === 'member'
          ? 'Family member · on owner’s plan'
          : entitlement.status === 'family'
            ? `Family · ${entitlement.seatsRemaining} invite seat${entitlement.seatsRemaining === 1 ? '' : 's'} left`
            : 'Pro · one login';

  return (
    <ModuleScreen
      title="Plan & billing"
      backLabel="Settings"
      backFallbackHref="/settings"
      bottomExtra={DETAIL_DOCK_PAD}
    >
      <ModuleSection label="Status">
        <ListCard>
          <ListRow
            title={plan.name}
            subtitle={statusLine}
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Your usage">
        <ListCard>
          <MeterRow title="Things" meter={meters.assets} colors={colors} />
          <MeterRow title="Homes" meter={meters.homes} colors={colors} />
          <MeterRow
            title="People"
            meter={meters.members}
            colors={colors}
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Plans">
        {PLANS.filter((p) => p.id !== 'trial').map((p) => {
          const current = p.id === planId;
          return (
            <Pressable
              key={p.id}
              onPress={() => void selectPlan(p.id)}
              style={[
                styles.plan,
                {
                  backgroundColor: colors.surface,
                  borderColor: current ? colors.accent : colors.line,
                  borderWidth: current ? 1.5 : StyleSheet.hairlineWidth,
                },
              ]}
            >
              <View style={styles.planTop}>
                <Text variant="headline">{p.name}</Text>
                <Text style={[styles.price, { color: colors.accent }]}>
                  {p.price}
                </Text>
              </View>
              {p.perks.map((perk) => (
                <Text key={perk} variant="caption" style={styles.perk}>
                  · {perk}
                </Text>
              ))}
              {current ? (
                <Text style={[styles.current, { color: colors.accent }]}>
                  Current
                </Text>
              ) : (
                <Text style={[styles.cta, { color: colors.mute }]}>
                  {p.id === 'family' && planId === 'pro'
                    ? 'Upgrade'
                    : 'Select'}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ModuleSection>

      <ModuleSection label="Family invites">
        <ListCard>
          <ListRow
            title="Sharing & invites"
            subtitle="Invite logins or join with a code"
            onPress={() => router.push('/settings/sharing' as Href)}
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Billing">
        <ListCard>
          <ListRow
            title="Restore purchases"
            subtitle={
              billingReady
                ? 'Re-link an existing App Store subscription'
                : 'Needs native iOS build + RevenueCat key'
            }
            onPress={() => {
              void (async () => {
                const result = await restore();
                if (result.ok) {
                  await refresh();
                  Alert.alert('Restored', 'Your subscription is active on this device.');
                  return;
                }
                Alert.alert('Restore', result.error || 'Nothing to restore.');
              })();
            }}
          />
          <ListRow
            title="App Store billing"
            subtitle={
              billingReady
                ? 'RevenueCat connected'
                : 'Add EXPO_PUBLIC_REVENUECAT_IOS_KEY and use a native build'
            }
            meta={billingReady ? 'On' : '—'}
            last
          />
        </ListCard>
      </ModuleSection>

      {__DEV__ ? (
        <ModuleSection label="Dev">
          <ListCard>
            <ListRow
              title="Restart trial"
              subtitle="Resets 14-day clock"
              onPress={() => void selectPlan('trial')}
            />
            <ListRow
              title="Expire trial now"
              subtitle="Jump to paywall"
              onPress={() => {
                void (async () => {
                  const { savePlanPrefs } = await import('@/lib/planLimits');
                  await savePlanPrefs({
                    planId: 'trial',
                    trialStartedAt: new Date(
                      Date.now() - 20 * 86400000
                    ).toISOString(),
                  });
                  await refresh();
                  router.replace('/paywall' as Href);
                })();
              }}
              last
            />
          </ListCard>
        </ModuleSection>
      ) : null}
    </ModuleScreen>
  );
}

function MeterRow({
  title,
  meter,
  colors,
  last,
}: {
  title: string;
  meter: { label: string; ratio: number; over: boolean };
  colors: { line: string; accent: string; coral: string; mute: string };
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.meterRow,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.line,
        },
      ]}
    >
      <View style={styles.meterTop}>
        <Text variant="headline" style={{ fontSize: 16 }}>
          {title}
        </Text>
        <Text
          variant="caption"
          style={{ color: meter.over ? colors.coral : colors.mute }}
        >
          {meter.label}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.line }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${Math.round(meter.ratio * 100)}%`,
              backgroundColor: meter.over ? colors.coral : colors.accent,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plan: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  planTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  price: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
  },
  perk: { marginTop: 2 },
  current: {
    marginTop: spacing.md,
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
  cta: {
    marginTop: spacing.md,
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
  meterRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  meterTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
});
