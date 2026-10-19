import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { Camera, MessageCircle, Mic, type LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import {
  OnboardingPrimaryButton,
  OnboardingScreen,
  enter,
  useOnboardingName,
} from '@/components/OnboardingKit';
import { completeOnboarding } from '@/lib/onboarding';
import { type ThemeColors, fonts, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

const WAYS: Array<{
  key: string;
  Icon: LucideIcon;
  title: string;
  body?: string;
  example?: string;
  primary?: boolean;
}> = [
  {
    key: 'capture',
    Icon: Camera,
    title: 'Capture',
    body: 'Snap a receipt, a warranty card, or an ID. You check it before it’s saved.',
    primary: true,
  },
  { key: 'ask', Icon: MessageCircle, title: 'Ask', example: 'When does my passport expire?' },
  { key: 'talk', Icon: Mic, title: 'Talk', example: 'I just watered the plants.' },
];

export default function OnboardingDone() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const name = useOnboardingName();

  async function finish() {
    await completeOnboarding();
    router.replace('/(tabs)' as Href);
  }

  return (
    <OnboardingScreen
      title={name ? `You’re all set, ${name}.` : 'You’re all set.'}
      lead="Whenever you want to add or find something, it’s one tap away in the bar at the bottom."
      footer={<OnboardingPrimaryButton label="Let’s go" onPress={() => void finish()} />}
    >
      <Animated.View
        entering={ZoomIn.springify().damping(15).delay(220)}
        style={styles.dockWrap}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={[styles.dock, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          {WAYS.map(({ key, Icon, primary }) => (
            <View
              key={key}
              style={[styles.dockBtn, primary && { backgroundColor: colors.accent }]}
            >
              <Icon size={22} color={primary ? colors.accentOn : colors.slate} strokeWidth={2.1} />
            </View>
          ))}
        </View>
      </Animated.View>

      <View style={styles.list}>
        {WAYS.map(({ key, Icon, title, body, example, primary }, i) => (
          <Animated.View key={key} entering={enter(3 + i)} style={styles.row}>
            <View
              style={[
                styles.rowIcon,
                { backgroundColor: primary ? colors.accent : colors.surfaceSoft },
              ]}
            >
              <Icon size={18} color={primary ? colors.accentOn : colors.slate} strokeWidth={2.1} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{title}</Text>
              {body ? <Text style={styles.rowBody}>{body}</Text> : null}
              {example ? (
                <View style={[styles.bubble, { backgroundColor: colors.surfaceSoft }]}>
                  <Text style={styles.bubbleText}>“{example}”</Text>
                </View>
              ) : null}
            </View>
          </Animated.View>
        ))}
      </View>
    </OnboardingScreen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    dockWrap: {
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    dock: {
      flexDirection: 'row',
      gap: 8,
      padding: 6,
      borderRadius: 34,
      borderWidth: StyleSheet.hairlineWidth,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    dockBtn: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
    },
    list: {
      gap: spacing.lg,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
    },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowText: {
      flex: 1,
      gap: 6,
      paddingTop: 7,
    },
    rowTitle: {
      fontFamily: fonts.sansSemi,
      fontSize: 16,
      color: colors.ink,
    },
    rowBody: {
      fontFamily: fonts.sans,
      fontSize: 15,
      lineHeight: 21,
      color: colors.mute,
    },
    bubble: {
      alignSelf: 'flex-start',
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 18,
      borderTopLeftRadius: 6,
    },
    bubbleText: {
      fontFamily: fonts.sansMedium,
      fontSize: 15,
      color: colors.ink,
    },
  });
}
