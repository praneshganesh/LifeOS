import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { fonts, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

/** Family login invites are not part of the Pro launch. */
export default function InviteIndexScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <Screen>
      <View
        style={[
          styles.wrap,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg },
        ]}
      >
        <Text style={[styles.title, { color: colors.ink }]}>Sharing isn’t available</Text>
        <Text style={[styles.sub, { color: colors.mute }]}>
          Saavi is one login for now. Invite codes will come back with Family.
        </Text>
        <Pressable onPress={() => router.replace('/(tabs)' as Href)} hitSlop={8}>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 16 }}>
            Back to Saavi
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  title: {
    fontFamily: fonts.sansSemi,
    fontSize: 28,
    letterSpacing: -0.4,
  },
  sub: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: spacing.xl,
  },
});
