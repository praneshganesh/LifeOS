import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import {
  ONBOARDING_INTENT_OPTIONS,
  saveOnboardingIntents,
  type OnboardingIntent,
} from '@/lib/onboarding';
import { type ThemeColors, fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

const MAX_INTENTS = 3;

export default function OnboardingIntent() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [picked, setPicked] = useState<OnboardingIntent[]>([]);
  const [saving, setSaving] = useState(false);

  function toggle(id: OnboardingIntent) {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_INTENTS) return prev;
      return [...prev, id];
    });
  }

  async function continueNext(intents: OnboardingIntent[]) {
    if (saving) return;
    setSaving(true);
    try {
      await saveOnboardingIntents(intents);
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
        <Text style={styles.step}>Step 1 of 5</Text>
        <Text style={styles.title}>What do you want help with?</Text>
        <Text style={styles.lead}>
          Pick up to {MAX_INTENTS}. We’ll tune Today around this — you can use
          everything either way.
        </Text>

        <View style={styles.chips}>
          {ONBOARDING_INTENT_OPTIONS.map((opt) => {
            const on = picked.includes(opt.id);
            const lockedOut = !on && picked.length >= MAX_INTENTS;
            return (
              <Pressable
                key={opt.id}
                onPress={() => toggle(opt.id)}
                disabled={lockedOut}
                style={[
                  styles.chip,
                  on && styles.chipOn,
                  lockedOut && { opacity: 0.4 },
                ]}
              >
                <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>
                  {opt.label}
                </Text>
                <Text style={[styles.chipHint, on && styles.chipHintOn]}>
                  {opt.hint}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={() => void continueNext(picked)}
          disabled={picked.length === 0}
          style={({ pressed }) => [
            styles.cta,
            pressed && { opacity: 0.92 },
            picked.length === 0 && { opacity: 0.45 },
          ]}
        >
          <Text style={styles.ctaText}>{saving ? 'Saving…' : 'Continue'}</Text>
        </Pressable>
        <Pressable onPress={() => void continueNext([])} hitSlop={8}>
          <Text style={styles.skip}>Skip for now</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
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
      borderWidth: 1.5,
      borderColor: colors.lineStrong,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 12,
      minHeight: 64,
      justifyContent: 'center',
    },
    chipOn: {
      backgroundColor: colors.ink,
      borderColor: colors.ink,
    },
    chipLabel: {
      fontFamily: fonts.sansSemi,
      fontSize: 15,
      color: colors.ink,
    },
    chipLabelOn: { color: colors.onInk },
    chipHint: {
      fontFamily: fonts.sans,
      fontSize: 13,
      color: colors.mute,
      marginTop: 2,
    },
    chipHintOn: { color: colors.onInk, opacity: 0.75 },
    footer: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.sm,
      gap: spacing.md,
      alignItems: 'center',
    },
    cta: {
      alignSelf: 'stretch',
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
    skip: {
      fontFamily: fonts.sansMedium,
      fontSize: 15,
      color: colors.mute,
    },
  });
}
