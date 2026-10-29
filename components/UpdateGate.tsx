import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import * as Updates from 'expo-updates';
import { Text } from '@/components/ui/Text';
import {
  clearSoftDismiss,
  fetchUpdatePolicy,
  loadSoftDismiss,
  needsStoreUpdate,
  saveSoftDismiss,
  softDismissIsActive,
  storeUrlForPlatform,
  type AppUpdatePolicy,
  DEFAULT_UPDATE_POLICY,
} from '@/lib/appUpdate';
import { fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

type GateMode =
  | { kind: 'none' }
  | { kind: 'soft'; updateId: string; message: string }
  | { kind: 'forceOta'; updateId: string; message: string }
  | { kind: 'forceStore'; message: string; url: string };

/**
 * Soft OTA banner for small fixes; blocking modal for critical OTA or
 * outdated native binaries (store). Fail-open when offline / Expo Go.
 */
export function UpdateGate({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(), []);
  const [mode, setMode] = useState<GateMode>({ kind: 'none' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (__DEV__) {
      setMode({ kind: 'none' });
      return;
    }

    let policy: AppUpdatePolicy = DEFAULT_UPDATE_POLICY;
    try {
      policy = await fetchUpdatePolicy();
    } catch {
      policy = DEFAULT_UPDATE_POLICY;
    }

    if (needsStoreUpdate(policy)) {
      setMode({
        kind: 'forceStore',
        message: policy.storeMessage,
        url: storeUrlForPlatform(policy),
      });
      return;
    }

    if (!Updates.isEnabled) {
      setMode({ kind: 'none' });
      return;
    }

    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        setMode({ kind: 'none' });
        return;
      }
      const updateId =
        result.manifest &&
        typeof result.manifest === 'object' &&
        'id' in result.manifest &&
        typeof (result.manifest as { id?: unknown }).id === 'string'
          ? (result.manifest as { id: string }).id
          : `available-${Date.now()}`;

      if (policy.forceOta) {
        await clearSoftDismiss();
        setMode({
          kind: 'forceOta',
          updateId,
          message: policy.forceMessage,
        });
        return;
      }

      if (!policy.softOtaEnabled) {
        setMode({ kind: 'none' });
        return;
      }

      const dismissed = await loadSoftDismiss();
      if (softDismissIsActive(dismissed, updateId)) {
        setMode({ kind: 'none' });
        return;
      }

      setMode({
        kind: 'soft',
        updateId,
        message: policy.softMessage,
      });
    } catch {
      // Offline / channel misconfig — don't brick the session.
      setMode((prev) => (prev.kind === 'forceStore' ? prev : { kind: 'none' }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const applyOta = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await Updates.fetchUpdateAsync();
      if (!result.isNew) {
        setError('Couldn’t download the update. Try again.');
        setBusy(false);
        return;
      }
      await Updates.reloadAsync();
    } catch {
      setError('Update failed. Check your connection and try again.');
      setBusy(false);
    }
  }, [busy]);

  const openStore = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      setError('Couldn’t open the store. Update Saavi from the App Store or Play Store.');
    }
  }, []);

  const dismissSoft = useCallback(async () => {
    if (mode.kind !== 'soft') return;
    await saveSoftDismiss(mode.updateId);
    setMode({ kind: 'none' });
  }, [mode]);

  return (
    <View style={{ flex: 1 }}>
      {children}

      {mode.kind === 'soft' ? (
        <View
          style={[styles.banner, { backgroundColor: colors.ink }]}
          accessibilityRole="summary"
        >
          <Text style={[styles.bannerText, { color: colors.bg }]}>{mode.message}</Text>
          <View style={styles.bannerActions}>
            <Pressable
              onPress={() => void dismissSoft()}
              disabled={busy}
              style={({ pressed }) => [styles.bannerBtnGhost, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel="Later"
            >
              <Text style={[styles.bannerBtnGhostText, { color: colors.bg }]}>Later</Text>
            </Pressable>
            <Pressable
              onPress={() => void applyOta()}
              disabled={busy}
              style={({ pressed }) => [
                styles.bannerBtn,
                { backgroundColor: colors.accent },
                pressed && { opacity: 0.9 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Update now"
            >
              {busy ? (
                <ActivityIndicator color={colors.accentOn} />
              ) : (
                <Text style={[styles.bannerBtnText, { color: colors.accentOn }]}>
                  Update
                </Text>
              )}
            </Pressable>
          </View>
          {error ? (
            <Text style={[styles.error, { color: colors.coral }]}>{error}</Text>
          ) : null}
        </View>
      ) : null}

      {mode.kind === 'forceOta' || mode.kind === 'forceStore' ? (
        <View
          style={[styles.block, { backgroundColor: colors.bg }]}
          accessibilityViewIsModal
        >
          <Text style={[styles.blockBrand, { color: colors.ink }]}>Saavi</Text>
          <Text style={[styles.blockTitle, { color: colors.ink }]}>
            {mode.kind === 'forceStore' ? 'Update required' : 'Critical update'}
          </Text>
          <Text style={[styles.blockBody, { color: colors.mute }]}>{mode.message}</Text>
          {error ? (
            <Text style={[styles.error, { color: colors.coral }]}>{error}</Text>
          ) : null}
          <Pressable
            onPress={() =>
              mode.kind === 'forceStore'
                ? void openStore(mode.url)
                : void applyOta()
            }
            disabled={busy}
            style={({ pressed }) => [
              styles.blockBtn,
              { backgroundColor: colors.accent },
              pressed && { opacity: 0.9 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              mode.kind === 'forceStore' ? 'Open store' : 'Update now'
            }
          >
            {busy ? (
              <ActivityIndicator color={colors.accentOn} />
            ) : (
              <Text style={[styles.blockBtnText, { color: colors.accentOn }]}>
                {mode.kind === 'forceStore'
                  ? Platform.OS === 'ios'
                    ? 'Open App Store'
                    : 'Open Play Store'
                  : 'Update now'}
              </Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function makeStyles() {
  return StyleSheet.create({
    banner: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      bottom: spacing.xl + 64,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.sm,
      zIndex: 300,
    },
    bannerText: {
      fontFamily: fonts.sans,
      fontSize: 15,
      lineHeight: 21,
    },
    bannerActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: spacing.sm,
    },
    bannerBtn: {
      minWidth: 96,
      height: 40,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
    },
    bannerBtnText: {
      fontFamily: fonts.sansSemi,
      fontSize: 15,
    },
    bannerBtnGhost: {
      height: 40,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bannerBtnGhostText: {
      fontFamily: fonts.sansMedium,
      fontSize: 15,
      opacity: 0.85,
    },
    block: {
      ...StyleSheet.absoluteFill,
      zIndex: 400,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xxl,
      gap: spacing.sm,
    },
    blockBrand: {
      fontFamily: fonts.sansSemi,
      fontSize: 32,
      letterSpacing: -1,
      marginBottom: spacing.sm,
    },
    blockTitle: {
      fontFamily: fonts.sansSemi,
      fontSize: 22,
      letterSpacing: -0.4,
      textAlign: 'center',
    },
    blockBody: {
      fontFamily: fonts.sans,
      fontSize: 16,
      lineHeight: 23,
      textAlign: 'center',
      marginBottom: spacing.lg,
    },
    blockBtn: {
      minWidth: 200,
      height: 52,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
    },
    blockBtnText: {
      fontFamily: fonts.sansSemi,
      fontSize: 16,
    },
    error: {
      fontFamily: fonts.sans,
      fontSize: 14,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
  });
}
