import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { userHasGoogleIdentity } from '@/lib/auth/apple';
import { configureRevenueCat } from '@/lib/billing/revenueCat';
import { ensureCloudSession, pullCloudAfterSignIn } from '@/lib/cloud/sync';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type GoogleAuthResult =
  | { ok: true; userId: string; linked: boolean; session: Session }
  | { ok: false; cancelled?: boolean; error: string };

export function googleAuthAvailablePlatform(): boolean {
  return Platform.OS === 'android';
}

function googleWebClientId(): string {
  return (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '').trim();
}

/** True only on Android builds that were given the Google web client id. */
export function isGoogleAuthConfigured(): boolean {
  return googleAuthAvailablePlatform() && googleWebClientId().length > 0;
}

async function afterSession(userId: string): Promise<void> {
  try {
    await configureRevenueCat(userId);
  } catch {
    /* billing optional */
  }
  try {
    await pullCloudAfterSignIn(userId);
  } catch {
    /* pull best-effort */
  }
}

/**
 * Native Sign in with Google → Supabase. Android only.
 * - Anonymous session: link Google to keep the same user id.
 * - Another phone: signInWithIdToken reclaims that Google-linked user.
 * The iOS binary does not link this native module.
 */
export async function connectWithGoogle(opts?: {
  preferLink?: boolean;
}): Promise<GoogleAuthResult> {
  if (!googleAuthAvailablePlatform()) {
    return { ok: false, error: 'Sign in with Google is available on Android.' };
  }
  if (!supabase || !isSupabaseConfigured()) {
    return {
      ok: false,
      error: 'Cloud is not configured. Set Supabase URL and key first.',
    };
  }
  const webClientId = googleWebClientId();
  if (!webClientId) {
    return { ok: false, error: 'Google sign-in is not configured in this build.' };
  }

  await ensureCloudSession({ create: true });
  const { data: before } = await supabase.auth.getSession();
  const current = before.session?.user;
  const preferLink =
    opts?.preferLink !== false &&
    Boolean(current?.is_anonymous) &&
    !userHasGoogleIdentity(current);

  try {
    const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
    GoogleSignin.configure({ webClientId });
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (response.type === 'cancelled') {
      return { ok: false, cancelled: true, error: 'Cancelled.' };
    }
    let idToken = response.data.idToken;
    let accessToken: string | undefined;
    try {
      const tokens = await GoogleSignin.getTokens();
      idToken = idToken || tokens.idToken;
      accessToken = tokens.accessToken;
    } catch {
      /* id token from signIn is enough when Google omits at_hash */
    }
    if (!idToken) {
      return { ok: false, error: 'Google did not return an identity token.' };
    }

    const creds = {
      provider: 'google' as const,
      token: idToken,
      ...(accessToken ? { access_token: accessToken } : {}),
    };

    let linked = false;
    let session: Session | null = null;

    if (preferLink) {
      const linkedRes = await supabase.auth.linkIdentity(creds);
      if (!linkedRes.error) {
        linked = true;
        const fromLink =
          linkedRes.data &&
          typeof linkedRes.data === 'object' &&
          'session' in linkedRes.data
            ? (linkedRes.data as { session: Session | null }).session
            : null;
        session = fromLink ?? (await supabase.auth.getSession()).data.session;
      }
    }

    if (!session) {
      const { data, error } = await supabase.auth.signInWithIdToken(creds);
      if (error) {
        return { ok: false, error: error.message || 'Could not sign in with Google.' };
      }
      session = data.session;
      linked = false;
    }

    if (!session?.user.id) {
      return { ok: false, error: 'No session after Google sign-in.' };
    }

    await afterSession(session.user.id);
    return { ok: true, userId: session.user.id, linked, session };
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    const { statusCodes } = await import('@react-native-google-signin/google-signin');
    if (err?.code === statusCodes.SIGN_IN_CANCELLED) {
      return { ok: false, cancelled: true, error: 'Cancelled.' };
    }
    if (err?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return { ok: false, error: 'Google Play services are not available on this device.' };
    }
    return {
      ok: false,
      error: err?.message || 'Sign in with Google failed.',
    };
  }
}
