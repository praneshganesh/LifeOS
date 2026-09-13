import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import {
  DetailField,
  DetailPrimaryButton,
  DetailSection,
  DETAIL_DOCK_PAD,
} from '@/components/ui/DetailKit';
import { acceptInvite } from '@/lib/invites/api';
import { usePlan } from '@/lib/PlanContext';
import { isOnboardingDone } from '@/lib/onboarding';
import { fonts, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

/** Manual invite code entry (no deep link). */
export default function InviteIndexScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refresh } = usePlan();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function onAccept() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await acceptInvite(code);
      if (!result.ok) {
        Alert.alert('Invite', result.error);
        return;
      }
      await refresh();
      const done = await isOnboardingDone();
      router.replace((done ? '/(tabs)' : '/onboarding') as Href);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View
        style={[
          styles.wrap,
          {
            paddingTop: insets.top + spacing.xl,
            paddingBottom: Math.max(insets.bottom, spacing.lg) + DETAIL_DOCK_PAD,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.ink }]}>Join family</Text>
        <Text style={[styles.sub, { color: colors.mute }]}>
          Paste the invite code from your family.
        </Text>
        <DetailSection label="Invite code">
          <DetailField
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="Invite code"
            style={styles.codeField}
          />
        </DetailSection>
        <DetailPrimaryButton
          label={busy ? 'Joining…' : 'Accept invite'}
          accent={colors.accent}
          disabled={busy || code.length < 6}
          onPress={() => void onAccept()}
        />
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={{ marginTop: spacing.lg, alignSelf: 'center' }}
        >
          <Text style={{ color: colors.mute }}>Cancel</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: spacing.lg },
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
  codeField: {
    fontFamily: fonts.sansSemi,
    fontSize: 18,
    letterSpacing: 1,
  },
});
