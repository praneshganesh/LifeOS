import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { getAuthAccountState } from '@/lib/auth/apple';
import { connectWithGoogle, isGoogleAuthConfigured } from '@/lib/auth/google';

const NUDGE_KEY = 'lifeos:auth:googleNudgeDismissed:v1';

/** True when we should offer “Save with Google” after purchase/restore. iOS never nudges. */
export async function shouldNudgeSaveWithGoogle(): Promise<boolean> {
  if (!isGoogleAuthConfigured()) return false;
  try {
    const dismissed = await AsyncStorage.getItem(NUDGE_KEY);
    if (dismissed === '1') return false;
  } catch {
    /* ignore */
  }
  const state = await getAuthAccountState();
  if (!state.configured) return false;
  if (state.hasGoogleIdentity) return false;
  return state.isAnonymous || Boolean(state.userId);
}

export async function dismissSaveWithGoogleNudge(): Promise<void> {
  await AsyncStorage.setItem(NUDGE_KEY, '1');
}

/**
 * Soft one-time prompt after purchase/restore on Android.
 * Resolves immediately on iOS and on builds without a Google client id.
 */
export function promptSaveWithGoogle(opts?: {
  title?: string;
  message?: string;
}): Promise<void> {
  const title = opts?.title ?? 'Save with Google';
  const message =
    opts?.message ??
    'Link Google so a new phone can restore your subscription, household, and synced data. You can skip and do this later in Settings.';

  return new Promise((resolve) => {
    void (async () => {
      if (!(await shouldNudgeSaveWithGoogle())) {
        resolve();
        return;
      }
      Alert.alert(title, message, [
        {
          text: 'Not now',
          style: 'cancel',
          onPress: () => {
            void dismissSaveWithGoogleNudge().finally(() => resolve());
          },
        },
        {
          text: 'Save with Google',
          onPress: () => {
            void (async () => {
              const result = await connectWithGoogle({ preferLink: true });
              await dismissSaveWithGoogleNudge();
              if (!result.ok && !result.cancelled) {
                Alert.alert('Sign in with Google', result.error, [
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
