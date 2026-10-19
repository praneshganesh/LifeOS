import { useMemo } from 'react';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { Sparkles } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppIcon, type Icon3DName } from '@/components/ui/Icon3D';
import { DotField } from '@/components/ui/DotField';
import { OnboardingPrimaryButton, enter } from '@/components/OnboardingKit';
import { moduleTone, type ModuleToneKey } from '@/lib/moduleTone';
import { TRIAL_DAYS } from '@/lib/planLimits';
import { type ThemeColors, fonts, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

/** Loose pile of Life tiles; x and y are fractions of the hero box. */
const TILES: Array<{
  tone: ModuleToneKey;
  icon: Icon3DName;
  x: number;
  y: number;
  size: number;
  rotate: number;
}> = [
  { tone: 'things', icon: 'package', x: 0.02, y: 0.08, size: 0.3, rotate: -8 },
  { tone: 'habits', icon: 'check', x: 0.38, y: 0, size: 0.26, rotate: 6 },
  { tone: 'classes', icon: 'today', x: 0.7, y: 0.14, size: 0.28, rotate: -5 },
  { tone: 'expenses', icon: 'wallet', x: 0.12, y: 0.56, size: 0.27, rotate: 5 },
  { tone: 'tasks', icon: 'tasks', x: 0.44, y: 0.47, size: 0.3, rotate: -4 },
  { tone: 'subscriptions', icon: 'credit', x: 0.75, y: 0.62, size: 0.24, rotate: 9 },
];

export default function OnboardingWelcome() {
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const heroW = Math.min(width, 480) - spacing.xl * 2;
  const heroH = heroW * 0.78;
  const light = resolved === 'light';

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 28, paddingBottom: Math.max(insets.bottom, 20) + 8 },
      ]}
    >
      <View style={styles.heroSpace}>
        <View
          style={{ width: heroW, height: heroH, alignSelf: 'center' }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {TILES.map((t, i) => {
            const size = heroW * t.size;
            return (
              <Animated.View
                key={t.tone}
                entering={ZoomIn.springify().damping(14).delay(60 + i * 70)}
                style={[
                  styles.tile,
                  {
                    left: heroW * t.x,
                    top: heroH * t.y,
                    width: size,
                    height: size,
                    borderRadius: size * 0.26,
                    transform: [{ rotate: `${t.rotate}deg` }],
                  },
                ]}
              >
                <DotField tone={moduleTone(t.tone, colors, light).dots} />
                <View style={styles.tileIcon}>
                  <AppIcon name={t.icon} size={Math.round(size * 0.4)} tone="soft" />
                </View>
              </Animated.View>
            );
          })}
        </View>
      </View>

      <View style={styles.copy}>
        <Animated.View entering={enter(5)} style={styles.brandRow}>
          <Image
            source={require('@/assets/images/splash-icon.png')}
            style={styles.mark}
            resizeMode="contain"
          />
          <Text style={styles.brand}>Saavi</Text>
        </Animated.View>
        <Animated.Text entering={enter(6)} style={styles.headline} accessibilityRole="header">
          Life at home, all in one calm place.
        </Animated.Text>
        <Animated.Text entering={enter(7)} style={styles.lead}>
          The things you own, the routines you keep, and the dates you’d rather not
          forget.
        </Animated.Text>
      </View>

      <Animated.View entering={FadeIn.delay(700)} style={styles.footer}>
        <View style={[styles.trialPill, { backgroundColor: colors.accentWash }]}>
          <Sparkles size={14} color={colors.accent} strokeWidth={2.2} />
          <Text style={[styles.trialText, { color: colors.ink }]}>
            Free for {TRIAL_DAYS} days. No card needed.
          </Text>
        </View>
        <OnboardingPrimaryButton
          label="Let’s get started"
          onPress={() => router.push('/onboarding/name')}
        />
        <Text style={styles.privacy}>Private by default. Never sold.</Text>
      </Animated.View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg,
      paddingHorizontal: spacing.xl,
    },
    heroSpace: {
      flex: 1,
      justifyContent: 'center',
    },
    tile: {
      position: 'absolute',
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
      shadowColor: '#000',
      shadowOpacity: 0.22,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    tileIcon: {
      position: 'absolute',
      left: '14%',
      top: '14%',
    },
    copy: {
      gap: 10,
      marginBottom: spacing.xl,
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    mark: {
      width: 26,
      height: 26,
      borderRadius: 7,
      overflow: 'hidden',
    },
    brand: {
      fontFamily: fonts.sansSemi,
      fontSize: 17,
      letterSpacing: -0.3,
      color: colors.ink,
    },
    headline: {
      fontFamily: fonts.sansSemi,
      fontSize: 36,
      lineHeight: 42,
      letterSpacing: -1.1,
      color: colors.ink,
    },
    lead: {
      fontFamily: fonts.sans,
      fontSize: 17,
      lineHeight: 25,
      color: colors.mute,
    },
    footer: {
      gap: spacing.md,
      alignItems: 'center',
    },
    trialPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
    },
    trialText: {
      fontFamily: fonts.sansMedium,
      fontSize: 14,
    },
    privacy: {
      fontFamily: fonts.sans,
      fontSize: 13,
      color: colors.faint,
      textAlign: 'center',
    },
  });
}
