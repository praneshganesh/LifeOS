import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppIcon, type Icon3DName } from '@/components/ui/Icon3D';
import { DotField } from '@/components/ui/DotField';
import { OnboardingPrimaryButton, OnboardingScreen, enter } from '@/components/OnboardingKit';
import {
  ONBOARDING_INTENT_OPTIONS,
  saveOnboardingIntents,
  type OnboardingIntent,
} from '@/lib/onboarding';
import { moduleTone, type ModuleToneKey } from '@/lib/moduleTone';
import { type ThemeColors, fonts, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

const MAX_INTENTS = 3;

const LOOK: Record<OnboardingIntent, { tone: ModuleToneKey; icon: Icon3DName }> = {
  things: { tone: 'things', icon: 'package' },
  reminders: { tone: 'tasks', icon: 'tasks' },
  habits: { tone: 'habits', icon: 'check' },
  classes: { tone: 'classes', icon: 'today' },
  money: { tone: 'expenses', icon: 'wallet' },
  family: { tone: 'subscriptions', icon: 'family' },
};

export default function OnboardingIntent() {
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const light = resolved === 'light';
  const [picked, setPicked] = useState<OnboardingIntent[]>([]);
  const [saving, setSaving] = useState(false);

  function toggle(id: OnboardingIntent) {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_INTENTS) return prev;
      return [...prev, id];
    });
  }

  async function next() {
    if (saving) return;
    setSaving(true);
    try {
      await saveOnboardingIntents(picked);
      router.push('/onboarding/details');
    } finally {
      setSaving(false);
    }
  }

  return (
    <OnboardingScreen
      step={3}
      title="What would you like a hand with?"
      lead={`Pick up to ${MAX_INTENTS} and we’ll put them first on Today. Everything else is still there.`}
      footer={
        <OnboardingPrimaryButton
          label={picked.length ? 'Continue' : 'Skip for now'}
          onPress={() => void next()}
        />
      }
    >
      <View style={styles.grid}>
        {ONBOARDING_INTENT_OPTIONS.map((opt, i) => {
          const on = picked.includes(opt.id);
          const lockedOut = !on && picked.length >= MAX_INTENTS;
          const look = LOOK[opt.id];
          const tone = moduleTone(look.tone, colors, light);
          return (
            <Animated.View key={opt.id} entering={enter(2 + i * 0.5)} style={styles.cell}>
              <Pressable
                onPress={() => toggle(opt.id)}
                disabled={lockedOut}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: lockedOut }}
                accessibilityLabel={`${opt.label}, ${opt.hint}`}
                style={({ pressed }) => [
                  styles.tile,
                  { borderColor: on ? colors.accent : colors.line },
                  on && styles.tileOn,
                  lockedOut && { opacity: 0.4 },
                  pressed && { transform: [{ scale: 0.97 }] },
                ]}
              >
                <DotField tone={tone.dots} />
                <View style={styles.tileTop}>
                  <AppIcon name={look.icon} size={36} tone="soft" />
                  {on ? (
                    <Animated.View
                      entering={ZoomIn.springify().damping(14)}
                      style={[styles.tick, { backgroundColor: colors.accent }]}
                    >
                      <Check size={13} color={colors.accentOn} strokeWidth={3} />
                    </Animated.View>
                  ) : null}
                </View>
                <View>
                  <Text style={styles.label}>{opt.label}</Text>
                  <Text style={styles.hint} numberOfLines={1}>
                    {opt.hint}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </OnboardingScreen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 10,
    },
    cell: {
      width: '48.5%',
    },
    tile: {
      height: 124,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      padding: spacing.md,
      justifyContent: 'space-between',
    },
    tileOn: {
      borderWidth: 2,
      padding: spacing.md - 1.5,
    },
    tileTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    tick: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      fontFamily: fonts.sansSemi,
      fontSize: 17,
      letterSpacing: -0.3,
      color: colors.ink,
    },
    hint: {
      fontFamily: fonts.sans,
      fontSize: 13,
      color: colors.mute,
      marginTop: 1,
    },
  });
}
