import AsyncStorage from '@react-native-async-storage/async-storage';

const MEMBERSHIP_KEY = 'lifeos:membership:v1';
const SEATS_KEY = 'lifeos:familySeats:v1';

export type MembershipRole = 'owner' | 'member';

export type MembershipState = {
  role: MembershipRole;
  /** Accepted invite logins on this household (not counting owner). */
  invitedLogins: number;
  householdId?: string;
};

type StoredMembership = {
  role: MembershipRole;
  householdId?: string;
};

type StoredSeats = {
  invitedLogins: number;
};

export async function loadMembership(): Promise<StoredMembership> {
  try {
    const raw = await AsyncStorage.getItem(MEMBERSHIP_KEY);
    if (!raw) return { role: 'owner' };
    const parsed = JSON.parse(raw) as Partial<StoredMembership>;
    return {
      role: parsed.role === 'member' ? 'member' : 'owner',
      householdId:
        typeof parsed.householdId === 'string' ? parsed.householdId : undefined,
    };
  } catch {
    return { role: 'owner' };
  }
}

export async function saveMembership(m: StoredMembership): Promise<void> {
  await AsyncStorage.setItem(MEMBERSHIP_KEY, JSON.stringify(m));
}

export async function loadSeatUsage(): Promise<StoredSeats> {
  try {
    const raw = await AsyncStorage.getItem(SEATS_KEY);
    if (!raw) return { invitedLogins: 0 };
    const parsed = JSON.parse(raw) as Partial<StoredSeats>;
    const n = Number(parsed.invitedLogins);
    return { invitedLogins: Number.isFinite(n) && n > 0 ? Math.floor(n) : 0 };
  } catch {
    return { invitedLogins: 0 };
  }
}

export async function saveSeatUsage(seats: StoredSeats): Promise<void> {
  await AsyncStorage.setItem(
    SEATS_KEY,
    JSON.stringify({ invitedLogins: Math.max(0, seats.invitedLogins) })
  );
}

/** After a successful accept on this device — join Family as a member. */
export async function joinAsMember(householdId: string): Promise<void> {
  await saveMembership({ role: 'member', householdId });
}

/** Owner tracks that an invite was accepted (local seat counter until cloud sync). */
export async function recordInviteAcceptedLocally(): Promise<number> {
  const cur = await loadSeatUsage();
  const next = cur.invitedLogins + 1;
  await saveSeatUsage({ invitedLogins: next });
  return next;
}
