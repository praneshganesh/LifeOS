import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { TRIAL_DAYS } from '@/lib/planLimits';
import { type ThemeColors, fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

export default function OnboardingWelcome() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 48, paddingBottom: Math.max(insets.bottom, 20) + 12 },
      ]}
    >
      <View style={styles.hero}>
        <View style={styles.glow} />
        <Image
          source={require('@/assets/images/splash-icon.png')}
          style={styles.mark}
          resizeMode="contain"
        />
        <Text style={styles.brand}>Saavi</Text>
        <Text style={styles.headline}>
          Your home’s things, routines, and due-dates — in one place.
        </Text>
        <Text style={styles.lead}>
          Private by default. Cloud backup only when you choose.
        </Text>

        <View style={[styles.trialCard, { backgroundColor: colors.surface, borderColor: colors.lineStrong }]}>
          <Text style={[styles.trialTitle, { color: colors.ink }]}>
            {TRIAL_DAYS}-day free trial
          </Text>
          <Text style={[styles.trialBody, { color: colors.mute }]}>
            Full access while you try Saavi. You won’t be charged until the trial
            ends — cancel anytime in Settings or your store account.
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => router.push('/onboarding/intent')}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.92 }]}
        >
          <Text style={styles.ctaText}>Start free trial</Text>
        </Pressable>
        <Text style={styles.privacy}>Synced securely when you enable backup — never sold</Text>
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg,
      paddingHorizontal: spacing.xl,
      justifyContent: 'space-between',
    },
    hero: {
      alignItems: 'flex-start',
      paddingTop: 24,
    },
    glow: {
      position: 'absolute',
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor: colors.forestWash,
      top: -20,
      left: -10,
    },
    mark: {
      width: 96,
      height: 96,
      marginBottom: spacing.lg,
    },
    brand: {
      fontFamily: fonts.sansSemi,
      fontSize: 32,
      lineHeight: 40,
      letterSpacing: -1,
      color: colors.ink,
      marginBottom: spacing.md,
    },
    headline: {
      fontFamily: fonts.sansSemi,
      fontSize: 22,
      lineHeight: 28,
      letterSpacing: -0.4,
      color: colors.ink,
      marginBottom: spacing.sm,
    },
    lead: {
      fontFamily: fonts.sans,
      fontSize: 16,
      lineHeight: 24,
      color: colors.mute,
      maxWidth: 340,
      marginBottom: spacing.xl,
    },
    trialCard: {
      alignSelf: 'stretch',
      borderRadius: radius.md,
      borderWidth: 1.5,
      padding: spacing.lg,
      gap: 6,
    },
    trialTitle: {
      fontFamily: fonts.sansSemi,
      fontSize: 17,
      letterSpacing: -0.2,
    },
    trialBody: {
      fontFamily: fonts.sans,
      fontSize: 15,
      lineHeight: 22,
    },
    footer: {
      gap: spacing.md,
    },
    cta: {
      height: 52,
      borderRadius: radius.md,
      backgroundColor: colors.forest,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaText: {
      fontFamily: fonts.sansMedium,
      fontSize: 16,
      color: colors.forestOn,
    },
    privacy: {
      fontFamily: fonts.sans,
      fontSize: 14,
      color: colors.faint,
      textAlign: 'center',
    },
  });
}
