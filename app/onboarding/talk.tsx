import { useMemo } from 'react';
import { useTheme } from '@/lib/ThemeContext';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mic } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useTalkOverlay } from '@/lib/TalkOverlayContext';
import { completeOnboarding } from '@/lib/onboarding';
import { type ThemeColors,  colors, fonts, radius, spacing  } from '@/constants/theme';

export default function OnboardingTalk() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { openTalk } = useTalkOverlay();

  async function finish(open: boolean) {
    await completeOnboarding();
    router.replace('/(tabs)' as Href);
    if (open) {
      // Let tabs mount, then open Talk
      setTimeout(() => openTalk(), 350);
    }
  }

  return (
    <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      <View style={styles.body}>
        <Text style={styles.step}>Step 5 of 5</Text>
        <Text style={styles.title}>Meet Talk</Text>
        <Text style={styles.lead}>
          Say “I bought AirPods for 900” or ask “what’s due soon?” Talk updates your home data —
          chat replies use your local chat API when it’s running.
        </Text>

        <View style={styles.orbWrap}>
          <View style={styles.orb}>
            <Mic size={28} color={colors.forestOn} strokeWidth={2} />
          </View>
          <Text style={styles.orbHint}>The floating orb opens Talk anytime</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => void finish(true)}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.92 }]}
        >
          <Text style={styles.ctaText}>Open Talk & finish</Text>
        </Pressable>
        <Pressable
          onPress={() => void finish(false)}
          style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.92 }]}
        >
          <Text style={styles.secondaryText}>Enter Saavi</Text>
        </Pressable>
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
    paddingTop: spacing.lg,
  },
  body: { flex: 1 },
  step: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.forest,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  title: {
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
    lineHeight: 22,
    color: colors.mute,
    marginBottom: spacing.xxl,
  },
  orbWrap: {
    alignItems: 'center',
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  orb: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbHint: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.mute,
    textAlign: 'center',
  },
  footer: {
    gap: spacing.sm,
    paddingTop: spacing.lg,
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
  secondary: {
    height: 48,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.mute,
  },
});
}
