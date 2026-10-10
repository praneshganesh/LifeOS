import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, MessageSquare, Mic } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { completeOnboarding } from '@/lib/onboarding';
import { type ThemeColors, fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

export default function OnboardingHowItWorks() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  async function finish() {
    await completeOnboarding();
    router.replace('/(tabs)' as Href);
  }

  return (
    <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      <View style={styles.body}>
        <Text style={styles.step}>Step 5 of 5</Text>
        <Text style={styles.title}>How you’ll use Saavi</Text>
        <Text style={styles.lead}>
          Three ways in — pick whatever fits the moment. Nothing to try right now.
        </Text>

        <View style={styles.cards}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.lineStrong }]}>
            <MessageSquare size={20} color={colors.forest} strokeWidth={2} />
            <Text style={[styles.cardTitle, { color: colors.ink }]}>Ask</Text>
            <Text style={[styles.cardHint, { color: colors.mute }]}>
              Type what happened or what you need — “I walked today”, “when does
              my passport expire?”
            </Text>
          </View>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.lineStrong }]}>
            <Mic size={20} color={colors.forest} strokeWidth={2} />
            <Text style={[styles.cardTitle, { color: colors.ink }]}>Talk</Text>
            <Text style={[styles.cardHint, { color: colors.mute }]}>
              Speak instead of typing. The floating control opens Talk anytime.
            </Text>
          </View>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.lineStrong }]}>
            <Camera size={20} color={colors.forest} strokeWidth={2} />
            <Text style={[styles.cardTitle, { color: colors.ink }]}>Capture</Text>
            <Text style={[styles.cardHint, { color: colors.mute }]}>
              Snap a receipt, Thing, or ID. We’re still improving auto-read — you
              can always edit what we pick up.
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => void finish()}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.92 }]}
        >
          <Text style={styles.ctaText}>Enter Saavi</Text>
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
      fontSize: 14,
      color: colors.mute,
      marginBottom: spacing.sm,
    },
    title: {
      fontFamily: fonts.sansSemi,
      fontSize: 28,
      color: colors.ink,
      marginBottom: spacing.sm,
    },
    lead: {
      fontFamily: fonts.sans,
      fontSize: 16,
      lineHeight: 24,
      color: colors.mute,
      marginBottom: spacing.xl,
    },
    cards: { gap: spacing.md },
    card: {
      borderRadius: radius.md,
      borderWidth: 1.5,
      padding: spacing.lg,
      gap: 4,
    },
    cardTitle: {
      fontFamily: fonts.sansSemi,
      fontSize: 16,
      marginTop: 6,
    },
    cardHint: {
      fontFamily: fonts.sans,
      fontSize: 15,
      lineHeight: 22,
    },
    footer: {
      paddingTop: spacing.lg,
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
  });
}
