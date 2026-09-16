import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { usePlan } from '@/lib/PlanContext';
import { isOnboardingDone } from '@/lib/onboarding';
import { fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import { pickOffer, type OfferSummary } from '@/lib/billing/revenueCat';

/**
 * Hard gate when trial ends — Pro / Family via Apple (RevenueCat → StoreKit).
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
  const [loadingOffers, setLoadingOffers] = useState(true);

  useEffect(() => {
    let live = true;
    setLoadingOffers(true);
    void refreshOffers().finally(() => {
      if (live) setLoadingOffers(false);
    });
    return () => {
      live = false;
    };
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
    if (!billingReady) {
      Alert.alert(
        'App Store billing',
        'Subscriptions are purchased through Apple on a TestFlight or App Store build with RevenueCat connected. This preview can’t charge your Apple ID.'
      );
      return;
    }
    if (!(planId === 'pro' ? proOffer : familyOffer)) {
      Alert.alert(
        'Plans unavailable',
        'Store products aren’t loaded yet. Check RevenueCat offerings and App Store Connect subscriptions, then try again.'
      );
      return;
    }
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
    if (!billingReady) {
      Alert.alert(
        'Restore',
        'Restore works on TestFlight / App Store builds once RevenueCat is connected.'
      );
      return;
    }
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

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.wrap,
          {
            paddingTop: insets.top + spacing.xl,
            paddingBottom: insets.bottom + spacing.xxl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.brand, { color: colors.ink }]}>Saavi</Text>
        <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
        <Text style={[styles.sub, { color: colors.mute }]}>
          Subscribe with Apple. Cancel anytime in Settings.
        </Text>

        <PlanCard
          name="Pro"
          hint="One login · all your devices"
          offer={proOffer}
          loading={loadingOffers && billingReady}
          billingReady={billingReady}
          selected
          busy={busy === 'pro'}
          onPress={() => void pick('pro')}
          colors={colors}
        />
        <PlanCard
          name="Family"
          hint="Up to 4 logins · invite family"
          offer={familyOffer}
          loading={loadingOffers && billingReady}
          billingReady={billingReady}
          selected={false}
          busy={busy === 'family'}
          onPress={() => void pick('family')}
          colors={colors}
        />

        {!billingReady ? (
          <View
            style={[
              styles.banner,
              { backgroundColor: colors.surfaceSoft, borderColor: colors.line },
            ]}
          >
            <Text style={[styles.bannerTitle, { color: colors.ink }]}>
              Apple billing not connected on this build
            </Text>
            <Text style={[styles.bannerBody, { color: colors.mute }]}>
              Prices and payment use App Store subscriptions via RevenueCat.
              Open a TestFlight build that includes your RevenueCat iOS key.
            </Text>
          </View>
        ) : null}

        <Pressable onPress={() => void onRestore()} hitSlop={8} style={styles.restore}>
          <Text style={{ color: colors.mute, fontFamily: fonts.sansMedium, fontSize: 16 }}>
            {busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
          </Text>
        </Pressable>

        <Text style={[styles.legal, { color: colors.mute }]}>
          Payment is charged to your Apple ID. Subscriptions renew unless cancelled
          at least 24 hours before the period ends.
        </Text>

        {__DEV__ ? (
          <Pressable
            onPress={() =>
              void restartTrial().then(() => router.replace('/(tabs)' as Href))
            }
            hitSlop={8}
            style={styles.dev}
          >
            <Text style={{ color: colors.faint, fontSize: 14 }}>
              Dev: restart trial
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function PlanCard({
  name,
  hint,
  offer,
  loading,
  billingReady,
  selected,
  busy,
  onPress,
  colors,
}: {
  name: string;
  hint: string;
  offer?: OfferSummary;
  loading: boolean;
  billingReady: boolean;
  selected: boolean;
  busy: boolean;
  onPress: () => void;
  colors: { ink: string; mute: string; accent: string; surface: string; line: string; onInk: string };
}) {
  const price = !billingReady
    ? 'App Store'
    : loading
      ? '…'
      : offer?.priceString || 'Unavailable';

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: selected ? colors.ink : colors.surface,
          borderColor: selected ? colors.ink : colors.line,
          opacity: pressed || busy ? 0.92 : 1,
        },
      ]}
    >
      <View style={styles.cardTop}>
        <Text
          style={[
            styles.cardName,
            { color: selected ? colors.onInk : colors.ink },
          ]}
        >
          {name}
        </Text>
        <Text
          style={[
            styles.cardPrice,
            { color: selected ? colors.onInk : colors.ink },
          ]}
        >
          {price}
        </Text>
      </View>
      <Text
        style={[
          styles.cardHint,
          { color: selected ? colors.onInk : colors.mute, opacity: selected ? 0.8 : 1 },
        ]}
      >
        {hint}
      </Text>
      {busy ? (
        <ActivityIndicator
          style={{ marginTop: 14 }}
          color={selected ? colors.onInk : colors.accent}
        />
      ) : (
        <Text
          style={[
            styles.cardCta,
            { color: selected ? colors.onInk : colors.accent },
          ]}
        >
          Continue
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    flexGrow: 1,
  },
  brand: {
    fontFamily: fonts.sansSemi,
    fontSize: 18,
    letterSpacing: -0.3,
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.sansSemi,
    fontSize: 32,
    letterSpacing: -0.6,
    lineHeight: 38,
  },
  sub: {
    fontFamily: fonts.sans,
    fontSize: 17,
    lineHeight: 24,
    marginTop: 10,
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
    alignItems: 'baseline',
    gap: spacing.md,
  },
  cardName: {
    fontFamily: fonts.sansSemi,
    fontSize: 22,
    letterSpacing: -0.3,
  },
  cardPrice: {
    fontFamily: fonts.sansSemi,
    fontSize: 18,
    letterSpacing: -0.2,
  },
  cardHint: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 8,
  },
  cardCta: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    marginTop: 16,
  },
  banner: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  bannerTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    marginBottom: 4,
  },
  bannerBody: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 21,
  },
  restore: {
    alignSelf: 'center',
    marginTop: spacing.lg,
    padding: 8,
  },
  legal: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  dev: {
    marginTop: spacing.xl,
    alignSelf: 'center',
  },
});
