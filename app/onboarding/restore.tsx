import { useMemo, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import {
  OnboardingPrimaryButton,
  OnboardingSecondaryButton,
  OnboardingScreen,
  enter,
} from '@/components/OnboardingKit';
import Animated from 'react-native-reanimated';
import { restoreFromRecoveryCode } from '@/lib/cloud/sync';
import { completeOnboarding } from '@/lib/onboarding';
import { reloadAppAfterWipe } from '@/lib/dataExport';
import { isSupabaseConfigured } from '@/lib/supabase';
import { type ThemeColors, fonts } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

export default function OnboardingRestore() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRestore() {
    if (busy) return;
    if (!isSupabaseConfigured()) {
      setError('Cloud restore isn’t configured on this build.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await restoreFromRecoveryCode(code);
      await completeOnboarding();
      try {
        await reloadAppAfterWipe();
      } catch {
        router.replace('/(tabs)');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore that backup.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingScreen
      step={0}
      title="Restore Saavi"
      lead="Enter the recovery code from Settings → Export or wipe on your other phone."
      footer={
        <>
          <OnboardingPrimaryButton
            label={busy ? 'Restoring…' : 'Restore'}
            onPress={() => void onRestore()}
            disabled={busy || code.trim().length < 16}
          />
          <OnboardingSecondaryButton label="Back" onPress={() => router.back()} />
        </>
      }
    >
      <Animated.View entering={enter(2)} style={styles.block}>
        <Text style={styles.label}>Recovery code</Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          placeholder="XXXX-XXXX-XXXX-XXXX"
          placeholderTextColor={colors.faint}
          editable={!busy}
          style={[
            styles.input,
            {
              color: colors.ink,
              backgroundColor: colors.surface,
              borderColor: colors.lineStrong,
            },
          ]}
        />
        {error ? (
          <Text style={[styles.error, { color: colors.coral }]}>{error}</Text>
        ) : (
          <Text style={[styles.hint, { color: colors.mute }]}>
            This replaces data on this phone with your cloud backup.
          </Text>
        )}
      </Animated.View>
    </OnboardingScreen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    block: { gap: 10 },
    label: {
      fontFamily: fonts.sansSemi,
      fontSize: 14,
      color: colors.ink,
    },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === 'ios' ? 14 : 10,
      fontFamily: fonts.sansSemi,
      fontSize: 18,
      letterSpacing: 1.2,
    },
    hint: {
      fontFamily: fonts.sans,
      fontSize: 14,
      lineHeight: 20,
    },
    error: {
      fontFamily: fonts.sans,
      fontSize: 14,
      lineHeight: 20,
    },
  });
}
