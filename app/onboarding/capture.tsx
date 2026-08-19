import { useMemo } from 'react';
import { useTheme } from '@/lib/ThemeContext';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, FileText, Receipt } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { type ThemeColors,  colors, fonts, radius, spacing  } from '@/constants/theme';

export default function OnboardingCapture() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      <View style={styles.body}>
        <Text style={styles.step}>Step 3 of 4</Text>
        <Text style={styles.title}>Capture once — filed forever</Text>
        <Text style={styles.lead}>
          Snap a Thing, receipt, or ID. Text is read on this device. Receipts can become a Thing,
          an expense, both, or a document.
        </Text>

        <View style={styles.cards}>
          <View style={styles.card}>
            <Camera size={20} color={colors.forest} strokeWidth={2} />
            <Text style={styles.cardTitle}>Things</Text>
            <Text style={styles.cardHint}>Gear, appliances, anything you own</Text>
          </View>
          <View style={styles.card}>
            <Receipt size={20} color={colors.forest} strokeWidth={2} />
            <Text style={styles.cardTitle}>Receipts</Text>
            <Text style={styles.cardHint}>Route to inventory, spend, or both</Text>
          </View>
          <View style={styles.card}>
            <FileText size={20} color={colors.forest} strokeWidth={2} />
            <Text style={styles.cardTitle}>Documents</Text>
            <Text style={styles.cardHint}>Passports & IDs stay in Personal Documents</Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => router.push('/capture' as Href)}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.92 }]}
        >
          <Text style={styles.ctaText}>Try Capture</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/onboarding/talk')}
          style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.92 }]}
        >
          <Text style={styles.secondaryText}>Continue</Text>
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
    fontSize: 26,
    letterSpacing: -0.5,
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
  cards: { gap: spacing.md },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: 4,
  },
  cardTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    color: colors.ink,
    marginTop: 6,
  },
  cardHint: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.mute,
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
