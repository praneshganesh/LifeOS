import { Linking } from 'react-native';
import { DETAIL_DOCK_PAD } from '@/components/ui/DetailKit';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import { Text } from '@/components/ui/Text';
import { fonts, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

const SUPPORT_EMAIL = 'hello@ibp-labs.com';

export default function ContactSettingsScreen() {
  const { colors } = useTheme();

  return (
    <ModuleScreen title="Contact" bottomExtra={DETAIL_DOCK_PAD}>
      <Text
        style={{
          fontFamily: fonts.sans,
          fontSize: 16,
          lineHeight: 23,
          color: colors.mute,
          marginBottom: spacing.lg,
        }}
      >
        Questions, bugs, or help with your account. Email us and we’ll get back
        to you.
      </Text>
      <Text
        onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
        accessibilityRole="link"
        style={{
          fontFamily: fonts.sansMedium,
          fontSize: 18,
          lineHeight: 24,
          color: colors.accent,
        }}
      >
        {SUPPORT_EMAIL}
      </Text>
    </ModuleScreen>
  );
}
