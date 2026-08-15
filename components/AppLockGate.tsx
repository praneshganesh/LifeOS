import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AppState,
  type AppStateStatus,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Text } from '@/components/ui/Text';
import {
  autoLockMs,
  loadSecurityPrefs,
  type SecurityPrefs,
} from '@/lib/securityPrefs';
import { colors, fonts, radius, spacing } from '@/constants/theme';

/**
 * Full-screen lock when biometrics are enabled.
 * Unlocks via Face ID / Touch ID / device passcode.
 */
export function AppLockGate({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<SecurityPrefs | null>(null);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const backgroundedAt = useRef<number | null>(null);
  const unlockedOnce = useRef(false);

  const refreshPrefs = useCallback(async () => {
    const next = await loadSecurityPrefs();
    setPrefs(next);
    return next;
  }, []);

  const unlock = useCallback(async () => {
    if (Platform.OS === 'web') {
      setLocked(false);
      unlockedOnce.current = true;
      return;
    }
    setBusy(true);
    setHint('');
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !enrolled) {
        setHint('Set up Face ID / biometrics in system Settings to lock LifeOS.');
        setBusy(false);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock LifeOS',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (result.success) {
        setLocked(false);
        unlockedOnce.current = true;
        backgroundedAt.current = null;
      } else {
        setHint('Authentication cancelled.');
      }
    } catch {
      setHint('Couldn’t authenticate. Try again.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const next = await refreshPrefs();
      if (next.biometrics && Platform.OS !== 'web') {
        setLocked(true);
      }
    })();
  }, [refreshPrefs]);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        backgroundedAt.current = Date.now();
        return;
      }
      if (state !== 'active') return;
      void (async () => {
        const next = await refreshPrefs();
        if (!next.biometrics || !next.autoLock || Platform.OS === 'web') return;
        const left = backgroundedAt.current;
        if (left != null && Date.now() - left >= autoLockMs()) {
          setLocked(true);
        }
      })();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [refreshPrefs]);

  // Re-read prefs when returning to foreground so Settings toggles apply
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshPrefs();
    });
    return () => sub.remove();
  }, [refreshPrefs]);

  // Avoid flashing unlocked content before SecureStore prefs load.
  if (!prefs) {
    return <View style={[styles.overlay, { zIndex: 0 }]} />;
  }

  return (
    <View style={{ flex: 1 }}>
      {children}
      {locked && prefs.biometrics ? (
        <View style={styles.overlay} accessibilityViewIsModal>
          <Text style={styles.brand}>LifeOS</Text>
          <Text style={styles.lead}>Unlock to continue. Data stays on this device.</Text>
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
          <Pressable
            onPress={() => void unlock()}
            disabled={busy}
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.btnText}>{busy ? 'Checking…' : 'Unlock'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/** Prompt biometrics when vault lock is enabled. Returns true if allowed. */
export async function authenticateForVault(): Promise<boolean> {
  const prefs = await loadSecurityPrefs();
  if (!prefs.vaultLock || Platform.OS === 'web') return true;
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !enrolled) {
      // Vault lock is on but OS has nothing to authenticate with — deny open.
      return false;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock emergency vault',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    zIndex: 200,
  },
  brand: {
    fontFamily: fonts.sansSemi,
    fontSize: 36,
    letterSpacing: -1.2,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  lead: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.mute,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  hint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.coral,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  btn: {
    marginTop: spacing.md,
    minWidth: 180,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  btnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.forestOn,
  },
});

