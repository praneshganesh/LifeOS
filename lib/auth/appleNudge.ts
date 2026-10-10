import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import {
  connectWithApple,
  getAuthAccountState,
  isAppleAuthAvailable,
} from '@/lib/auth/apple';

const NUDGE_KEY = 'lifeos:auth:appleNudgeDismissed:v1';

/** True when we should offer “Save with Apple” after purchase/restore. */
export async function shouldNudgeSaveWithApple(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const dismissed = await AsyncStorage.getItem(NUDGE_KEY);
    if (dismissed === '1') return false;
  } catch {
    /* ignore */
  }
  if (!(await isAppleAuthAvailable())) return false;
  const state = await getAuthAccountState();
  if (!state.configured) return false;
  if (state.hasAppleIdentity) return false;
  return state.isAnonymous || Boolean(state.userId);
}

export async function dismissSaveWithAppleNudge(): Promise<void> {
  await AsyncStorage.setItem(NUDGE_KEY, '1');
}

/**
 * Soft one-time prompt after purchase/restore or invite join.
 * Resolves when the user dismisses or finishes Apple connect.
 */
export function promptSaveWithApple(opts?: {
  title?: string;
  message?: string;
}): Promise<void> {
  const title = opts?.title ?? 'Save with Apple';
  const message =
    opts?.message ??
    'Link Apple so a new phone can restore your subscription, household, and synced data. You can skip and do this later in Settings.';

  return new Promise((resolve) => {
    void (async () => {
      if (!(await shouldNudgeSaveWithApple())) {
        resolve();
        return;
      }
      Alert.alert(title, message, [
        {
          text: 'Not now',
          style: 'cancel',
          onPress: () => {
            void dismissSaveWithAppleNudge().finally(() => resolve());
          },
        },
        {
          text: 'Save with Apple',
          onPress: () => {
            void (async () => {
              const result = await connectWithApple({ preferLink: true });
              await dismissSaveWithAppleNudge();
              if (!result.ok && !result.cancelled) {
                Alert.alert('Sign in with Apple', result.error, [
                  { text: 'OK', onPress: () => resolve() },
                ]);
                return;
              }
              resolve();
            })();
          },
        },
      ]);
    })();
  });
}
