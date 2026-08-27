import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import {
  CURRENCY_OPTIONS,
  guessCurrencyFromDevice,
  resolveDefaultCurrency,
} from '@/lib/currency';
import { useCurrency } from '@/lib/CurrencyContext';
import { type ThemeColors, fonts, radius, spacing } from '@/constants/theme';

export default function OnboardingCurrency() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currency: saved, setCurrency } = useCurrency();
  const suggested = guessCurrencyFromDevice();
  const [picked, setPicked] = useState(
    () => resolveDefaultCurrency(saved) || suggested
  );
  const [saving, setSaving] = useState(false);

  async function continueNext() {
    if (saving) return;
    setSaving(true);
    try {
      await setCurrency(picked || suggested);
      router.push('/onboarding/family');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.step}>Step 2 of 5</Text>
        <Text style={styles.title}>What’s your currency?</Text>
        <Text style={styles.lead}>
          Used for expenses, subscriptions, and Talk. You can change it anytime in
          Settings → Homes & defaults.
        </Text>

        <View style={styles.chips}>
          {CURRENCY_OPTIONS.map((c) => {
            const on = picked === c.code;
            return (
              <Pressable
                key={c.code}
                onPress={() => setPicked(c.code)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipCode, on && styles.chipCodeOn]}>{c.code}</Text>
                <Text style={[styles.chipHint, on && styles.chipHintOn]}>{c.hint}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={() => void continueNext()}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.92 }]}
        >
          <Text style={styles.ctaText}>{saving ? 'Saving…' : 'Continue'}</Text>
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
    },
    body: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.md,
      paddingBottom: spacing.xxl,
    },
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
      marginBottom: spacing.lg,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      width: '47%',
      flexGrow: 1,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    chipOn: {
      backgroundColor: colors.ink,
      borderColor: colors.ink,
    },
    chipCode: {
      fontFamily: fonts.sansSemi,
      fontSize: 16,
      color: colors.ink,
    },
    chipCodeOn: {
      color: colors.onInk,
    },
    chipHint: {
      fontFamily: fonts.sans,
      fontSize: 13,
      color: colors.mute,
      marginTop: 2,
    },
    chipHintOn: {
      color: colors.onInk,
      opacity: 0.75,
    },
    footer: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.sm,
    },
    cta: {
      backgroundColor: colors.ink,
      borderRadius: radius.full,
      paddingVertical: 16,
      alignItems: 'center',
    },
    ctaText: {
      fontFamily: fonts.sansSemi,
      fontSize: 16,
      color: colors.onInk,
    },
  });
}
