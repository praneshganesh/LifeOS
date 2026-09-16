import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { TimeField } from '@/components/ui/TimeField';
import {
  DEFAULT_NOTIFICATION_PREFS,
  loadNotificationPrefs,
  normalizeQuietHoursTime,
  saveNotificationPrefs,
} from '@/lib/notificationPrefs';
import { type ThemeColors, fonts, radius, spacing } from '@/constants/theme';

export default function OnboardingQuietHours() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [start, setStart] = useState(DEFAULT_NOTIFICATION_PREFS.quietHoursStart);
  const [end, setEnd] = useState(DEFAULT_NOTIFICATION_PREFS.quietHoursEnd);
  const [saving, setSaving] = useState(false);

  async function continueNext(useDefaults: boolean) {
    if (saving) return;
    setSaving(true);
    try {
      const prefs = await loadNotificationPrefs();
      await saveNotificationPrefs({
        ...prefs,
        quietHoursStart: useDefaults
          ? DEFAULT_NOTIFICATION_PREFS.quietHoursStart
          : normalizeQuietHoursTime(
              start,
              DEFAULT_NOTIFICATION_PREFS.quietHoursStart
            ),
        quietHoursEnd: useDefaults
          ? DEFAULT_NOTIFICATION_PREFS.quietHoursEnd
          : normalizeQuietHoursTime(end, DEFAULT_NOTIFICATION_PREFS.quietHoursEnd),
      });
      router.push('/onboarding/capture');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.step}>Step 4 of 6</Text>
        <Text style={styles.title}>Quiet hours</Text>
        <Text style={styles.lead}>No alerts between these times.</Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <TimeField label="From" value={start} onChange={setStart} />
          <TimeField label="Until" value={end} onChange={setEnd} last />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={() => void continueNext(false)}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.92 }]}
        >
          <Text style={styles.ctaText}>{saving ? 'Saving…' : 'Continue'}</Text>
        </Pressable>
        <Pressable onPress={() => void continueNext(true)} hitSlop={8}>
          <Text style={styles.skip}>Use 10 PM – 7 AM</Text>
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
      fontSize: 17,
      lineHeight: 24,
      color: colors.mute,
      marginBottom: spacing.lg,
    },
    card: {
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
    },
    footer: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.sm,
      alignItems: 'center',
      gap: spacing.md,
    },
    cta: {
      alignSelf: 'stretch',
      backgroundColor: colors.ink,
      borderRadius: radius.md,
      height: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaText: {
      fontFamily: fonts.sansSemi,
      fontSize: 16,
      color: colors.onInk,
    },
    skip: {
      fontFamily: fonts.sansMedium,
      fontSize: 15,
      color: colors.mute,
    },
  });
}
