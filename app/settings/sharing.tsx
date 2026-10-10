import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { DETAIL_DOCK_PAD } from '@/components/ui/DetailKit';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import { Text } from '@/components/ui/Text';
import { fonts, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

/** Login invites are closed for the Pro launch. People tags stay on the People screen. */
export default function SharingSettingsScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <ModuleScreen
      title="Sharing"
      backLabel="Settings"
      backFallbackHref="/settings"
      bottomExtra={DETAIL_DOCK_PAD}
    >
      <View style={styles.block}>
        <Text style={[styles.title, { color: colors.ink }]}>Not in this version</Text>
        <Text style={[styles.body, { color: colors.mute }]}>
          Saavi launches with one login. Kids and pets stay as people on your account.
          Shared logins come back with Family.
        </Text>
        <Pressable onPress={() => router.push('/family' as Href)} hitSlop={8}>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 16 }}>
            People
          </Text>
        </Pressable>
      </View>
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  block: {
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.sansSemi,
    fontSize: 22,
    letterSpacing: -0.3,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 22,
  },
});
