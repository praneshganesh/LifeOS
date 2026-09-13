import { useEffect, useState } from 'react';
import { Alert, ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { usePlan } from '@/lib/PlanContext';
import { isOnboardingDone } from '@/lib/onboarding';
import { fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import { pickOffer } from '@/lib/billing/revenueCat';

/**
 * Hard gate when trial ends — pick Pro or Family via RevenueCat.
 * After subscribe: onboarding if needed, else home.
 */
export default function PaywallScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    entitlement,
    subscribe,
    restore,
    restartTrial,
    offers,
    billingReady,
    refreshOffers,
  } = usePlan();
  const [busy, setBusy] = useState<'pro' | 'family' | 'restore' | null>(null);

  useEffect(() => {
    void refreshOffers();
  }, [refreshOffers]);

  const proOffer =
    pickOffer(offers, 'pro_yearly') || pickOffer(offers, 'pro_monthly');
  const familyOffer =
    pickOffer(offers, 'family_yearly') || pickOffer(offers, 'family_monthly');

  async function afterUnlock() {
    const done = await isOnboardingDone();
    router.replace((done ? '/(tabs)' : '/onboarding') as Href);
  }

  async function pick(planId: 'pro' | 'family') {
    if (busy) return;
    setBusy(planId);
    try {
      await subscribe(planId, 'yearly');
      await afterUnlock();
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
    setBusy('restore');
    try {
      const result = await restore();
      if (result.ok) {
        await afterUnlock();
        return;
      }
      Alert.alert('Restore', result.error || 'Nothing to restore.');
    } finally {
      setBusy(null);
    }
  }

  const title =
    entitlement.paywallReason === 'trial_ended'
      ? 'Your trial has ended'
      : 'Choose a plan';
  const subtitle =
    entitlement.paywallReason === 'trial_ended'
      ? 'Subscribe to keep your Things, Talk, and household in sync.'
      : 'Unlock Saavi on this device.';

  return (
    <Screen>
      <View
        style={[
          styles.wrap,
          {
            paddingTop: insets.top + spacing.xl,
            paddingBottom: insets.bottom + spacing.lg,
          },
        ]}
      >
        <Text style={[styles.kicker, { color: colors.mute }]}>Saavi</Text>
        <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
        <Text style={[styles.sub, { color: colors.mute }]}>{subtitle}</Text>

        <Pressable
          onPress={() => void pick('pro')}
          disabled={!!busy}
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.accent,
              opacity: pressed || busy === 'pro' ? 0.9 : 1,
            },
          ]}
        >
          <View style={styles.cardTop}>
            <Text style={[styles.cardName, { color: colors.ink }]}>Pro</Text>
            <Text style={[styles.cardPrice, { color: colors.accent }]}>
              {proOffer?.priceString ?? '—'}
            </Text>
          </View>
          <Text style={[styles.cardHint, { color: colors.mute }]}>
            One login · your devices · person tags for family
          </Text>
          {busy === 'pro' ? (
            <ActivityIndicator style={{ marginTop: 12 }} color={colors.accent} />
          ) : null}
        </Pressable>

        <Pressable
          onPress={() => void pick('family')}
          disabled={!!busy}
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
              opacity: pressed || busy === 'family' ? 0.9 : 1,
            },
          ]}
        >
          <View style={styles.cardTop}>
            <Text style={[styles.cardName, { color: colors.ink }]}>Family</Text>
            <Text style={[styles.cardPrice, { color: colors.accent }]}>
              {familyOffer?.priceString ?? '—'}
            </Text>
          </View>
          <Text style={[styles.cardHint, { color: colors.mute }]}>
            Up to 4 logins · invite spouse / family on iOS & Android
          </Text>
          {busy === 'family' ? (
            <ActivityIndicator style={{ marginTop: 12 }} color={colors.accent} />
          ) : null}
        </Pressable>

        <Pressable onPress={() => void onRestore()} hitSlop={8} style={styles.restore}>
          <Text style={{ color: colors.mute, fontFamily: fonts.sansMedium }}>
            {busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
          </Text>
        </Pressable>

        <Text style={[styles.legal, { color: colors.faint }]}>
          {billingReady
            ? 'Subscriptions renew automatically unless cancelled at least 24 hours before the end of the period. Manage in Apple ID settings.'
            : 'Store billing needs a native iOS build (TestFlight / dev client). Web uses a local unlock in development only.'}
        </Text>

        {__DEV__ ? (
          <Pressable
            onPress={() =>
              void restartTrial().then(() => router.replace('/(tabs)' as Href))
            }
            hitSlop={8}
            style={styles.dev}
          >
            <Text style={{ color: colors.faint, fontSize: 13 }}>
              Dev: restart 14-day trial
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  kicker: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.sansSemi,
    fontSize: 28,
    letterSpacing: -0.5,
  },
  sub: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: spacing.xl,
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1.5,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardName: {
    fontFamily: fonts.sansSemi,
    fontSize: 20,
  },
  cardPrice: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
  },
  cardHint: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  restore: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    padding: 8,
  },
  legal: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.md,
  },
  dev: {
    marginTop: spacing.lg,
    alignSelf: 'center',
  },
});
