import { useMemo } from 'react';
import { useTheme } from '@/lib/ThemeContext';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { type ThemeColors,  colors, fonts, radius, spacing  } from '@/constants/theme';

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
        <Text style={styles.brand}>LifeOS</Text>
        <Text style={styles.headline}>Your home, Things, and routines — kept local.</Text>
        <Text style={styles.lead}>
          A short setup: name your place, add people, try Capture, then meet Talk.
        </Text>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => router.push('/onboarding/home')}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.92 }]}
        >
          <Text style={styles.ctaText}>Get started</Text>
        </Pressable>
        <Text style={styles.privacy}>On this device · nothing leaves unless you use Talk chat</Text>
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
    fontSize: 40,
    letterSpacing: -1.4,
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
  },
  footer: {
    gap: spacing.md,
  },
  cta: {
    height: 52,
    borderRadius: radius.sm,
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
    fontSize: 16,
    color: colors.faint,
    textAlign: 'center',
  },
});
}
