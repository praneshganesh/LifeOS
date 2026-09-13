import * as Linking from 'expo-linking';
import { Share, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { recordInviteAcceptedLocally, joinAsMember } from '@/lib/invites/membership';

const LOCAL_INVITES_KEY = 'lifeos:pendingInvites:v1';

export type InvitePermission = 'editor' | 'viewer';

export type LocalInvite = {
  code: string;
  permission: InvitePermission;
  createdAt: string;
  expiresAt: string;
};

function randomCode(): string {
  const bytes = Array.from({ length: 10 }, () =>
    Math.floor(Math.random() * 256)
  );
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Deep link the invitee taps on iOS / Android. */
export function inviteUrl(code: string): string {
  // Universal Link host later; path works with Expo Linking scheme today.
  return Linking.createURL(`invite/${code}`);
}

export async function createInvite(opts?: {
  permission?: InvitePermission;
  householdId?: string;
}): Promise<{ code: string; url: string; source: 'cloud' | 'local' }> {
  const permission = opts?.permission ?? 'editor';
  const sb = supabase;

  if (sb && opts?.householdId) {
    const { data, error } = await sb.rpc('create_household_invite', {
      p_household: opts.householdId,
      p_permission: permission,
      p_ttl_hours: 168,
    });
    if (!error && typeof data === 'string' && data.length > 0) {
      return { code: data, url: inviteUrl(data), source: 'cloud' };
    }
  }

  // Local fallback (dev / offline) — acceptable until cloud household is live.
  const code = randomCode();
  const invite: LocalInvite = {
    code,
    permission,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  };
  try {
    const AsyncStorage = (
      await import('@react-native-async-storage/async-storage')
    ).default;
    const raw = await AsyncStorage.getItem(LOCAL_INVITES_KEY);
    const list: LocalInvite[] = raw ? (JSON.parse(raw) as LocalInvite[]) : [];
    list.push(invite);
    await AsyncStorage.setItem(LOCAL_INVITES_KEY, JSON.stringify(list));
  } catch {
    // ignore persistence failure — code still shareable this session
  }
  return { code, url: inviteUrl(code), source: 'local' };
}

export async function shareInvite(code: string, url: string): Promise<void> {
  const message =
    Platform.OS === 'ios'
      ? `Join my Saavi household.\n${url}\n\nOr enter code: ${code}`
      : `Join my Saavi household: ${url}\nCode: ${code}`;
  await Share.share(
    Platform.OS === 'ios'
      ? { url, message }
      : { message, title: 'Saavi family invite' }
  );
}

export type AcceptResult =
  | { ok: true; householdId: string; source: 'cloud' | 'local' }
  | { ok: false; error: string };

export async function acceptInvite(code: string): Promise<AcceptResult> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { ok: false, error: 'Enter an invite code.' };

  const sb = supabase;
  if (sb) {
    const { data, error } = await sb.rpc('accept_household_invite', {
      p_code: normalized,
    });
    if (!error && data) {
      const householdId = String(data);
      await joinAsMember(householdId);
      return { ok: true, householdId, source: 'cloud' };
    }
    if (error && !/not authenticated|invalid or expired/i.test(error.message)) {
      // fall through to local for offline codes
    } else if (error) {
      return { ok: false, error: error.message || 'Invite failed.' };
    }
  }

  try {
    const AsyncStorage = (
      await import('@react-native-async-storage/async-storage')
    ).default;
    const raw = await AsyncStorage.getItem(LOCAL_INVITES_KEY);
    const list: LocalInvite[] = raw ? (JSON.parse(raw) as LocalInvite[]) : [];
    const found = list.find((i) => i.code === normalized);
    if (!found) {
      return { ok: false, error: 'Invalid or expired invite.' };
    }
    if (new Date(found.expiresAt).getTime() < Date.now()) {
      return { ok: false, error: 'This invite has expired.' };
    }
    const householdId = `local-${normalized.slice(0, 8)}`;
    await joinAsMember(householdId);
    // Owner device won't see this; cloud path handles seat count.
    // For same-device smoke tests, bump seats.
    await recordInviteAcceptedLocally();
    return { ok: true, householdId, source: 'local' };
  } catch {
    return { ok: false, error: 'Could not accept invite.' };
  }
}
