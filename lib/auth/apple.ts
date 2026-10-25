import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import type { Session, User } from '@supabase/supabase-js';
import { fillRandomBytes } from '@/lib/cryptoRandom';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { ensureCloudSession, pullCloudAfterSignIn } from '@/lib/cloud/sync';
import { configureRevenueCat } from '@/lib/billing/revenueCat';

export type AuthAccountState = {
  ready: boolean;
  configured: boolean;
  userId: string | null;
  isAnonymous: boolean;
  hasAppleIdentity: boolean;
  email: string | null;
  displayHint: string | null;
};

export type AppleAuthResult =
  | { ok: true; userId: string; linked: boolean; session: Session }
  | { ok: false; cancelled?: boolean; error: string };

function randomNonce(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  fillRandomBytes(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

export function appleAuthAvailablePlatform(): boolean {
  return Platform.OS === 'ios';
}

export async function isAppleAuthAvailable(): Promise<boolean> {
  if (!appleAuthAvailablePlatform()) return false;
  try {
    const AppleAuthentication = await import('expo-apple-authentication');
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export function userHasAppleIdentity(user: User | null | undefined): boolean {
  if (!user?.identities?.length) return false;
  return user.identities.some((i) => i.provider === 'apple');
}

export async function getAuthAccountState(): Promise<AuthAccountState> {
  const configured = isSupabaseConfigured() && Boolean(supabase);
  if (!configured || !supabase) {
    return {
      ready: true,
      configured: false,
      userId: null,
      isAnonymous: true,
      hasAppleIdentity: false,
      email: null,
      displayHint: null,
    };
  }
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user ?? null;
    const hasApple = userHasAppleIdentity(user);
    return {
      ready: true,
      configured: true,
      userId: user?.id ?? null,
      isAnonymous: Boolean(user?.is_anonymous ?? !hasApple),
      hasAppleIdentity: hasApple,
      email: user?.email ?? null,
      displayHint: hasApple
        ? user?.email || 'Signed in with Apple'
        : user
          ? 'Temporary account on this device'
          : null,
    };
  } catch {
    return {
      ready: true,
      configured: true,
      userId: null,
      isAnonymous: true,
      hasAppleIdentity: false,
      email: null,
      displayHint: null,
    };
  }
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
 * Native Sign in with Apple → Supabase.
 * - Anonymous session: link Apple to keep the same user id (data + RC continuity).
 * - Returning / new device: signInWithIdToken to reclaim the Apple-linked user.
 */
export async function connectWithApple(opts?: {
  /** Prefer link when anonymous; set false to always signInWithIdToken (reclaim). */
  preferLink?: boolean;
}): Promise<AppleAuthResult> {
  if (!supabase || !isSupabaseConfigured()) {
    return {
      ok: false,
      error: 'Cloud is not configured. Set Supabase URL and key first.',
    };
  }
  if (!appleAuthAvailablePlatform()) {
    return {
      ok: false,
      error: 'Sign in with Apple is available on iPhone and iPad.',
    };
  }

  const available = await isAppleAuthAvailable();
  if (!available) {
    return { ok: false, error: 'Sign in with Apple is not available on this device.' };
  }

  await ensureCloudSession({ create: true });
  const { data: before } = await supabase.auth.getSession();
  const current = before.session?.user;
  const preferLink =
    opts?.preferLink !== false &&
    Boolean(current?.is_anonymous) &&
    !userHasAppleIdentity(current);

  const rawNonce = randomNonce();
  const hashedNonce = await sha256Hex(rawNonce);

  try {
    const AppleAuthentication = await import('expo-apple-authentication');
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      return { ok: false, error: 'Apple did not return an identity token.' };
    }

    const creds = {
      provider: 'apple' as const,
      token: credential.identityToken,
      nonce: rawNonce,
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
        return { ok: false, error: error.message || 'Could not sign in with Apple.' };
      }
      session = data.session;
      linked = false;
    }

    if (!session?.user.id) {
      return { ok: false, error: 'No session after Apple sign-in.' };
    }

    if (credential.fullName) {
      const parts = [
        credential.fullName.givenName,
        credential.fullName.middleName,
        credential.fullName.familyName,
      ].filter(Boolean) as string[];
      if (parts.length) {
        await supabase.auth.updateUser({
          data: {
            full_name: parts.join(' '),
            given_name: credential.fullName.givenName,
            family_name: credential.fullName.familyName,
          },
        });
      }
    }

    await afterSession(session.user.id);
    return { ok: true, userId: session.user.id, linked, session };
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === 'ERR_REQUEST_CANCELED') {
      return { ok: false, cancelled: true, error: 'Cancelled.' };
    }
    return {
      ok: false,
      error: err?.message || 'Sign in with Apple failed.',
    };
  }
}

/** Soft sign-out: clears local session; next launch gets a new anonymous user. */
export async function signOutCloud(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Cloud is not configured.' };
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
