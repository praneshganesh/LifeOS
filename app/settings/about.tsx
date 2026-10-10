import Constants from 'expo-constants';
import { DETAIL_DOCK_PAD } from '@/components/ui/DetailKit';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import { Text } from '@/components/ui/Text';
import { fonts, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

/**
 * Kept for deep links / App Store compliance. Not listed in Settings;
 * version also shows at the bottom of the Settings home screen.
 */
export default function AboutSettingsScreen() {
  const { colors } = useTheme();
  const version =
    Constants.expoConfig?.version ||
    Constants.nativeAppVersion ||
    '1.0.0';

  return (
    <ModuleScreen
      title="Saavi"
      backLabel="Settings"
      backFallbackHref="/settings"
      bottomExtra={DETAIL_DOCK_PAD}
    >
      <Text
        style={{
          fontFamily: fonts.sansSemi,
          fontSize: 28,
          color: colors.ink,
          letterSpacing: -0.4,
          marginBottom: spacing.sm,
        }}
      >
        Saavi
      </Text>
      <Text
        style={{
          fontFamily: fonts.sans,
          fontSize: 16,
          lineHeight: 23,
          color: colors.mute,
          marginBottom: spacing.xl,
        }}
      >
        Your home life in one place: Things, people, spend, and the paperwork
        that goes with them.
      </Text>
      <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.faint }}>
        Version {version}
      </Text>
    </ModuleScreen>
  );
}
