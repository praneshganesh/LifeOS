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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { RefreshCw } from 'lucide-react-native';
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
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(), []);
  const [mode, setMode] = useState<GateMode>({ kind: 'none' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    // Never throw out of here — a gate crash would take down the whole app.
    try {
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
        await clearSoftDismiss().catch(() => undefined);
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

      const dismissed = await loadSoftDismiss().catch(() => null);
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
      // Offline / Expo Go / channel misconfig — don't brick the session.
      setMode({ kind: 'none' });
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
        // Already fetched on a prior attempt — still reload into it.
        try {
          await Updates.reloadAsync();
          return;
        } catch {
          setError('Couldn’t apply the update. Try again.');
          setBusy(false);
          return;
        }
      }
      await Updates.reloadAsync();
    } catch {
      setError('Update failed. Check your connection and try again.');
      setBusy(false);
    }
  }, [busy]);

  const openStore = useCallback(async (url: string) => {
    const fallback =
      Platform.OS === 'ios'
        ? 'https://apps.apple.com/app/id6805518688'
        : 'https://play.google.com/store/apps/details?id=com.praneshganesh.lifeos';
    try {
      await Linking.openURL(url || fallback);
    } catch {
      try {
        await Linking.openURL(fallback);
      } catch {
        setError(
          Platform.OS === 'ios'
            ? 'Couldn’t open the App Store. Update from the App Store manually.'
            : 'Couldn’t open the Play Store. Update from the Play Store manually.'
        );
      }
    }
  }, []);

  const dismissSoft = useCallback(async () => {
    if (mode.kind !== 'soft') return;
    await saveSoftDismiss(mode.updateId);
    setMode({ kind: 'none' });
  }, [mode]);

  const softBottom = Math.max(insets.bottom, spacing.md) + 72;

  return (
    <View style={{ flex: 1 }}>
      {children}

      {mode.kind === 'soft' ? (
        <View
          style={[
            styles.banner,
            {
              bottom: softBottom,
              backgroundColor: colors.bgElevated,
              borderColor: colors.line,
            },
          ]}
          accessibilityRole="summary"
        >
          <View style={[styles.bannerIcon, { backgroundColor: colors.accentWash }]}>
            <RefreshCw size={18} color={colors.glyph} strokeWidth={2.2} />
          </View>
          <View style={styles.bannerCopy}>
            <Text style={[styles.bannerTitle, { color: colors.ink }]}>
              Update available
            </Text>
            <Text style={[styles.bannerText, { color: colors.mute }]}>{mode.message}</Text>
            {error ? (
              <Text style={[styles.errorInline, { color: colors.coral }]}>{error}</Text>
            ) : null}
            <View style={styles.bannerActions}>
              <Pressable
                onPress={() => void dismissSoft()}
                disabled={busy}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.bannerBtnGhost,
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Later"
              >
                <Text style={[styles.bannerBtnGhostText, { color: colors.slate }]}>
                  Later
                </Text>
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
          </View>
        </View>
      ) : null}

      {mode.kind === 'forceOta' || mode.kind === 'forceStore' ? (
        <View
          style={[styles.blockScrim, { backgroundColor: colors.overlay }]}
          accessibilityViewIsModal
        >
          <View
            style={[
              styles.blockCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
                paddingBottom: spacing.xl + Math.max(insets.bottom, spacing.sm),
              },
            ]}
          >
            <Text style={[styles.blockTitle, { color: colors.ink }]}>Update required</Text>
            <Text style={[styles.blockBody, { color: colors.mute }]}>{mode.message}</Text>
            {error ? (
              <Text style={[styles.errorInline, { color: colors.coral }]}>{error}</Text>
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
              accessibilityLabel="Update"
            >
              {busy ? (
                <ActivityIndicator color={colors.accentOn} />
              ) : (
                <Text style={[styles.blockBtnText, { color: colors.accentOn }]}>
                  Update
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function makeStyles() {
  return StyleSheet.create({
    banner: {
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      zIndex: 300,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      shadowColor: '#000',
      shadowOpacity: 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 10,
    },
    bannerIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    bannerCopy: {
      flex: 1,
      gap: 4,
    },
    bannerTitle: {
      fontFamily: fonts.sansSemi,
      fontSize: 16,
      letterSpacing: -0.2,
    },
    bannerText: {
      fontFamily: fonts.sans,
      fontSize: 14,
      lineHeight: 20,
    },
    bannerActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    bannerBtn: {
      minWidth: 88,
      height: 36,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
    },
    bannerBtnText: {
      fontFamily: fonts.sansSemi,
      fontSize: 14,
    },
    bannerBtnGhost: {
      height: 36,
      paddingHorizontal: spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bannerBtnGhostText: {
      fontFamily: fonts.sansMedium,
      fontSize: 14,
    },
    blockScrim: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 400,
      justifyContent: 'flex-end',
    },
    blockCard: {
      borderTopLeftRadius: radius.md,
      borderTopRightRadius: radius.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.xxxl,
      gap: spacing.sm,
      alignItems: 'stretch',
      overflow: 'visible',
    },
    blockTitle: {
      fontFamily: fonts.sansSemi,
      fontSize: 22,
      lineHeight: 28,
      letterSpacing: -0.3,
    },
    blockBody: {
      fontFamily: fonts.sans,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: spacing.md,
    },
    blockBtn: {
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
    errorInline: {
      fontFamily: fonts.sans,
      fontSize: 13,
      marginTop: spacing.xs,
    },
  });
}
