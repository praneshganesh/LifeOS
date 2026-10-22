import { useCallback, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ChevronLeft } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { fonts, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import { DEFAULT_PROFILE, loadLocalProfile } from '@/lib/profile';

export const ONBOARDING_STEPS = 4;

/** Staggered entrance for onboarding content; `i` is the element's order on screen. */
export function enter(i: number) {
  return FadeInDown.duration(420).delay(80 + i * 70);
}

/** Pager dots; the current step stretches into a pill. */
export function OnboardingDots({ step }: { step: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={styles.dots}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${ONBOARDING_STEPS}`}
      accessibilityValue={{ min: 1, max: ONBOARDING_STEPS, now: step }}
    >
      {Array.from({ length: ONBOARDING_STEPS }, (_, i) => {
        const current = i + 1 === step;
        const done = i + 1 < step;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              current && styles.dotCurrent,
              {
                backgroundColor:
                  current || done ? colors.accent : colors.surfaceSoft,
                opacity: done ? 0.45 : 1,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

/**
 * Shared frame for a setup step: back chevron + dots, big title, lead,
 * scrollable content, and a footer pinned above the home indicator.
 */
export function OnboardingScreen({
  step,
  title,
  lead,
  children,
  footer,
  showBack = true,
}: {
  step?: number;
  title: string;
  lead?: string;
  children?: ReactNode;
  footer: ReactNode;
  showBack?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <View style={styles.topSide}>
          {showBack && router.canGoBack() ? (
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={({ pressed }) => [
                styles.backBtn,
                { backgroundColor: colors.surfaceSoft },
                pressed && { opacity: 0.6 },
              ]}
            >
              <ChevronLeft size={20} color={colors.ink} strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </View>
        {step ? <OnboardingDots step={step} /> : null}
        <View style={styles.topSide} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Plain Text: Reanimated entering can leave title/lead at opacity 0 on some simulators. */}
        <Text style={[styles.title, { color: colors.ink }]} accessibilityRole="header">
          {title}
        </Text>
        {lead ? (
          <Text style={[styles.lead, { color: colors.mute }]}>{lead}</Text>
        ) : null}
        {children}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, 16) + 8 },
        ]}
      >
        {footer}
      </View>
    </KeyboardAvoidingView>
  );
}

export function OnboardingPrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: colors.accent },
        disabled && { opacity: 0.35 },
        pressed && !disabled && { opacity: 0.85, transform: [{ scale: 0.985 }] },
      ]}
    >
      <Text style={[styles.primaryText, { color: colors.accentOn }]}>{label}</Text>
    </Pressable>
  );
}

export function OnboardingSecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.6 }]}
    >
      <Text style={[styles.secondaryText, { color: colors.mute }]}>{label}</Text>
    </Pressable>
  );
}

/** First name from the profile, or '' while it is still the placeholder. */
export function useOnboardingName(): string {
  const [name, setName] = useState('');
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void loadLocalProfile().then((p) => {
        const n = p.displayName?.trim() ?? '';
        if (alive) setName(n && n !== DEFAULT_PROFILE.displayName ? n.split(/\s+/)[0]! : '');
      });
      return () => {
        alive = false;
      };
    }, [])
  );
  return name;
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: 6,
  },
  topSide: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotCurrent: {
    width: 20,
  },
  body: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    fontFamily: fonts.sansSemi,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.9,
    marginBottom: 10,
  },
  lead: {
    fontFamily: fonts.sans,
    fontSize: 17,
    lineHeight: 25,
    marginBottom: spacing.xl,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    gap: spacing.md,
    alignItems: 'center',
  },
  primary: {
    alignSelf: 'stretch',
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontFamily: fonts.sansSemi,
    fontSize: 17,
    letterSpacing: -0.2,
  },
  secondary: {
    paddingVertical: 4,
  },
  secondaryText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
  },
});
