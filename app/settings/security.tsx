import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Switch, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import {
  DEFAULT_SECURITY_PREFS,
  loadSecurityPrefs,
  saveSecurityPrefs,
  type SecurityPrefs,
} from '@/lib/securityPrefs';
import { type ThemeColors,  colors, spacing  } from '@/constants/theme';

function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
  last,
  disabled,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.row, !last && styles.border, disabled && { opacity: 0.5 }]}>
      <View style={{ flex: 1 }}>
        <Text variant="headline" style={{ fontSize: 16 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.lineStrong, true: colors.forestBright }}
        thumbColor={colors.white}
      />
    </View>
  );
}

export default function SecuritySettingsScreen() {
  const [prefs, setPrefs] = useState<SecurityPrefs>(DEFAULT_SECURITY_PREFS);
  const [hardwareOk, setHardwareOk] = useState(Platform.OS === 'web');

  useEffect(() => {
    void (async () => {
      setPrefs(await loadSecurityPrefs());
      if (Platform.OS === 'web') {
        setHardwareOk(false);
        return;
      }
      try {
        const has = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setHardwareOk(has && enrolled);
      } catch {
        setHardwareOk(false);
      }
    })();
  }, []);

  async function update(patch: Partial<SecurityPrefs>) {
    if (patch.biometrics === true && Platform.OS !== 'web') {
      try {
        const has = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (!has || !enrolled) {
          Alert.alert(
            'Biometrics unavailable',
            'Set up Face ID or a device passcode in system Settings first.'
          );
          return;
        }
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Confirm to enable Saavi lock',
          disableDeviceFallback: false,
        });
        if (!result.success) return;
      } catch {
        Alert.alert('Couldn’t enable lock', 'Try again in a moment.');
        return;
      }
    }
    const next = { ...prefs, ...patch };
    setPrefs(next);
    await saveSecurityPrefs(next);
  }

  return (
    <ModuleScreen
      title="Security"
      subtitle="Biometrics stay on this device — Saavi never sees your Face ID data."
      backLabel="Settings"
      backFallbackHref="/settings"
    >
      <ModuleSection label="Device">
        <ListCard>
          <ToggleRow
            title="Face ID / biometrics"
            subtitle={
              Platform.OS === 'web'
                ? 'Not available on web'
                : hardwareOk
                  ? 'Unlock Saavi after launch or auto-lock'
                  : 'Set up biometrics in system Settings'
            }
            value={prefs.biometrics}
            onChange={(v) => void update({ biometrics: v })}
            disabled={Platform.OS === 'web'}
          />
          <ToggleRow
            title="Auto-lock"
            subtitle="After 5 minutes in background"
            value={prefs.autoLock}
            onChange={(v) => void update({ autoLock: v })}
            last
          />
        </ListCard>
      </ModuleSection>
    </ModuleScreen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  border: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
});
}
