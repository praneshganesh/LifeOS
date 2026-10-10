import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { DETAIL_DOCK_PAD } from '@/components/ui/DetailKit';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import { Text } from '@/components/ui/Text';
import { useInventory } from '@/lib/InventoryContext';
import { useSpaces } from '@/lib/SpacesContext';
import { useHousehold } from '@/lib/HouseholdContext';
import {
  PLANS,
  PRO_TALK_DAILY,
  TRIAL_DAYS,
  buildLimitMeters,
} from '@/lib/planLimits';
import { aiDailyLimit, peekAiAllowance, type AiAllowance } from '@/lib/aiUsage';
import { usePlan } from '@/lib/PlanContext';
import {
  fetchSubscriptionSnapshot,
  pendingSwitchLine,
  pickOffer,
  subscriptionDetailLine,
  type SubscriptionSnapshot,
} from '@/lib/billing/revenueCat';
import { promptSaveWithApple } from '@/lib/auth/appleNudge';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

type Cadence = 'monthly' | 'yearly';

export default function PlanSettingsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { items } = useInventory();
  const { spaces } = useSpaces();
  const { members } = useHousehold();
  const {
    prefs,
    entitlement,
    subscribe,
    restore,
    restartTrial,
    refresh,
    billingReady,
    offers,
    refreshOffers,
  } = usePlan();
  const [cadence, setCadence] = useState<Cadence>('monthly');
  const cadencePicked = useRef(false);
  const [busy, setBusy] = useState<'pro' | 'restore' | null>(null);
  const [talkAllowance, setTalkAllowance] = useState<AiAllowance | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionSnapshot | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void peekAiAllowance(entitlement.planId).then((a) => {
        if (live) setTalkAllowance(a);
      });
      void fetchSubscriptionSnapshot().then((snap) => {
        if (!live) return;
        setSubscription(snap);
        if (snap?.cadence && !cadencePicked.current) setCadence(snap.cadence);
      });
      return () => {
        live = false;
      };
    }, [entitlement.planId])
  );

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
  const talkLimit = talkAllowance?.limit ?? aiDailyLimit(entitlement.planId);
  const talkUsed = talkAllowance?.used ?? 0;

  const billingLine =
    subscription && entitlement.status === 'pro'
      ? subscriptionDetailLine(subscription)
      : '';
  const cadenceLabel =
    subscription?.cadence === 'yearly'
      ? 'yearly'
      : subscription?.cadence === 'monthly'
        ? 'monthly'
        : null;

  const headline =
    entitlement.status === 'trial_active'
      ? `${entitlement.trialDaysLeft} day${entitlement.trialDaysLeft === 1 ? '' : 's'} left on Trial`
      : entitlement.status === 'trial_expired'
        ? 'Trial ended'
        : entitlement.status === 'lapsed'
          ? 'Subscription ended'
          : cadenceLabel
            ? `Pro plan, ${cadenceLabel}`
            : 'Pro plan';

  const renewalSentence = billingLine
    ? billingLine.charAt(0).toUpperCase() + billingLine.slice(1) + '.'
    : '';
  const switchLine = pendingSwitchLine(subscription, prefs.pendingProductId);

  const subline =
    entitlement.status === 'trial_active'
      ? 'Full access while you try Saavi. Subscribe anytime with Apple.'
      : entitlement.status === 'trial_expired'
        ? 'Pick a plan to keep Things, Talk, and sync going.'
        : entitlement.status === 'lapsed'
          ? 'Resubscribe to continue. A new trial does not start.'
          : [renewalSentence, switchLine, 'One login on your devices.', 'Cancel anytime in Apple Settings.']
              .filter(Boolean)
              .join(' ');

  async function selectPlan() {
    if (busy) return;
    if (!billingReady) {
      Alert.alert(
        'Apple billing',
        __DEV__
          ? 'RevenueCat isn’t available here. Unlocks locally in development only.'
          : 'Subscriptions need a TestFlight or App Store build with billing connected.'
      );
      if (__DEV__) {
        await subscribe('pro', cadence);
        await refresh();
      }
      return;
    }
    if (!offers.length) {
      Alert.alert(
        'Plans unavailable',
        'Store products aren’t loaded yet. Try again in a moment.'
      );
      await refreshOffers();
      return;
    }

    setBusy('pro');
    try {
      const result = await subscribe('pro', cadence);
      await refresh();
      setSubscription(await fetchSubscriptionSnapshot());
      if (result.ok) {
        const queued = pendingSwitchLine(
          await fetchSubscriptionSnapshot(),
          result.pendingProductId
        );
        if (queued) {
          await new Promise<void>((resolve) => {
            Alert.alert('Starts at renewal', queued, [{ text: 'OK', onPress: () => resolve() }]);
          });
        }
        await promptSaveWithApple({
          title: 'Save with Apple',
          message:
            'Your plan is active. Link Apple so the next phone can restore your subscription and data. You can skip and do this later in Settings → Account.',
        });
        return;
      }
      if (!result.cancelled) {
        Alert.alert('Purchase failed', result.error);
      }
    } catch (e) {
      Alert.alert(
        'Purchase',
        e instanceof Error ? e.message : 'Could not complete purchase.'
      );
    } finally {
      setBusy(null);
    }
  }

  async function onRestore() {
    if (busy) return;
    if (!billingReady) {
      Alert.alert(
        'Restore',
        'Restore works on TestFlight or App Store builds once billing is connected.'
      );
      return;
    }
    setBusy('restore');
    try {
      const result = await restore();
      if (result.ok) {
        await refresh();
        setSubscription(await fetchSubscriptionSnapshot());
        await promptSaveWithApple({
          title: 'Save with Apple',
          message:
            'Your subscription is restored. Link Apple so household data stays with you on a new phone.',
        });
        return;
      }
      Alert.alert('Restore', result.error || 'Nothing to restore.');
    } finally {
      setBusy(null);
    }
  }

  const proOffer = pickOffer(
    offers,
    cadence === 'yearly' ? 'pro_yearly' : 'pro_monthly'
  );
  const cadenceMatches =
    subscription?.cadence == null || subscription.cadence === cadence;
  const proCurrent = planId === 'pro' && cadenceMatches;
  const proAccent = planId === 'pro' ? proCurrent : true;

  return (
    <ModuleScreen
      title="Plan"
      backLabel="Settings"
      backFallbackHref="/settings"
      bottomExtra={DETAIL_DOCK_PAD}
    >
      <View style={[styles.hero, { backgroundColor: colors.surface }]}>
        <Text style={[styles.heroTitle, { color: colors.ink }]}>{headline}</Text>
        <Text style={[styles.heroSub, { color: colors.mute }]}>{subline}</Text>
        <Text style={[styles.usageLine, { color: colors.slate }]}>
          {usage.assets} things · {usage.homes} home
          {usage.homes === 1 ? '' : 's'} · {usage.members} people · Talk{' '}
          {talkUsed}/{talkLimit} today
        </Text>
        {meters.assets.over || meters.homes.over || meters.members.over ? (
          <Text style={[styles.overNote, { color: colors.coral }]}>
            You’re over a plan limit. Upgrade or trim a few items.
          </Text>
        ) : null}
      </View>

      <>
          <View style={styles.cadenceRow}>
            {(['monthly', 'yearly'] as const).map((c) => {
              const on = cadence === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => {
                    cadencePicked.current = true;
                    setCadence(c);
                  }}
                  style={[
                    styles.cadenceChip,
                    {
                      backgroundColor: on ? colors.ink : colors.surfaceSoft,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.cadenceText,
                      { color: on ? colors.onInk : colors.ink },
                    ]}
                  >
                    {c === 'yearly' ? 'Yearly' : 'Monthly'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <SubscribeBtn
            name="Pro"
            hint={`One login · ${PRO_TALK_DAILY} Talk turns / day`}
            price={proOffer?.priceString?.trim() || '…'}
            current={proCurrent}
            busy={busy === 'pro'}
            accent={proAccent}
            colors={colors}
            onPress={() => void selectPlan()}
          />

          <Text style={[styles.fine, { color: colors.mute }]}>
            Charged to your Apple ID. Renews automatically. Cancel anytime.
          </Text>
      </>

      <Pressable onPress={() => void onRestore()} hitSlop={8} style={styles.restore}>
        <Text style={[styles.restoreText, { color: colors.mute }]}>
          {busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
        </Text>
      </Pressable>

      {__DEV__ ? (
        <View style={styles.devBlock}>
          <Text style={[styles.devLabel, { color: colors.faint }]}>Dev</Text>
          <Pressable
            onPress={() => {
              void (async () => {
                await restartTrial();
                await refresh();
              })();
            }}
            hitSlop={8}
          >
            <Text style={[styles.devLink, { color: colors.faint }]}>
              Reset to trial
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void (async () => {
                const { savePlanPrefs } = await import('@/lib/planLimits');
                await savePlanPrefs({
                  planId: 'trial',
                  trialStartedAt: new Date(
                    Date.now() - (TRIAL_DAYS + 2) * 86400000
                  ).toISOString(),
                });
                await refresh();
                router.replace('/paywall' as Href);
              })();
            }}
            hitSlop={8}
          >
            <Text style={[styles.devLink, { color: colors.faint }]}>
              Simulate trial ended
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void (async () => {
                const list = await refreshOffers();
                Alert.alert(
                  'Billing',
                  [
                    `RC: ${billingReady ? 'on' : 'off'}`,
                    `Packages: ${list.length}`,
                    list
                      .map((o) => `${o.identifier} ${o.priceString}`)
                      .join('\n') || 'none',
                  ].join('\n')
                );
              })();
            }}
            hitSlop={8}
          >
            <Text style={[styles.devLink, { color: colors.faint }]}>
              Billing diagnostics
            </Text>
          </Pressable>
        </View>
      ) : null}
    </ModuleScreen>
  );
}

function SubscribeBtn({
  name,
  hint,
  price,
  current,
  busy,
  accent,
  colors,
  onPress,
}: {
  name: string;
  hint: string;
  price: string;
  current: boolean;
  busy: boolean;
  accent: boolean;
  colors: {
    ink: string;
    mute: string;
    forest: string;
    forestOn: string;
    surface: string;
    surfaceSoft: string;
  };
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || current}
      style={({ pressed }) => [
        styles.subscribe,
        {
          backgroundColor: accent ? colors.forest : colors.surface,
          opacity: pressed || busy ? 0.92 : 1,
        },
      ]}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text
          style={[
            styles.subscribeName,
            { color: accent ? colors.forestOn : colors.ink },
          ]}
        >
          {current ? `${name} · current` : `Subscribe · ${name}`}
        </Text>
        <Text
          style={[
            styles.subscribeHint,
            {
              color: accent ? colors.forestOn : colors.mute,
              opacity: accent ? 0.85 : 1,
            },
          ]}
        >
          {hint}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator color={accent ? colors.forestOn : colors.ink} />
      ) : (
        <View
          style={[
            styles.pricePill,
            {
              backgroundColor: accent
                ? 'rgba(255,255,255,0.22)'
                : colors.surfaceSoft,
            },
          ]}
        >
          <Text
            style={[
              styles.priceText,
              { color: accent ? colors.forestOn : colors.ink },
            ]}
          >
            {price}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  heroTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 24,
    letterSpacing: -0.3,
  },
  heroSub: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 8,
  },
  usageLine: {
    fontFamily: fonts.sans,
    fontSize: 13,
    marginTop: 14,
  },
  overNote: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    marginTop: 8,
  },
  cadenceRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.md,
  },
  cadenceChip: {
    flex: 1,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cadenceText: {
    fontFamily: fonts.sansSemi,
    fontSize: 14,
  },
  subscribe: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    minHeight: 72,
  },
  subscribeName: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
  },
  subscribeHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    marginTop: 3,
  },
  pricePill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  priceText: {
    fontFamily: fonts.sansSemi,
    fontSize: 15,
  },
  fine: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: 12,
  },
  linkTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
  },
  linkHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    marginTop: 3,
  },
  restore: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  restoreText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
  },
  devBlock: {
    marginTop: spacing.xl,
    gap: 10,
    alignItems: 'center',
  },
  devLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  devLink: {
    fontFamily: fonts.sans,
    fontSize: 13,
  },
});
