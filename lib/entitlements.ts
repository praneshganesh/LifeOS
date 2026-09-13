import {
  FAMILY_LOGIN_SEATS,
  TRIAL_DAYS,
  type PlanId,
  type PlanPrefs,
} from '@/lib/planLimits';

export type EntitlementStatus =
  | 'trial_active'
  | 'trial_expired'
  | 'pro'
  | 'family'
  | 'member'; // joined someone else's Family — no own billing

export type Entitlement = {
  status: EntitlementStatus;
  planId: PlanId;
  /** App access (CRUD + sync). False only when trial ended with no paid plan. */
  hasAccess: boolean;
  /** Can create login invites (Family plan owner only). */
  canInvite: boolean;
  /** Spare Family login seats (excluding the owner). */
  seatsRemaining: number;
  seatsTotal: number;
  trialDaysLeft: number | null;
  trialEndsAt: string | null;
  /** Why a paywall might show */
  paywallReason: 'trial_ended' | 'upgrade_family' | null;
};

export function trialEndsAt(prefs: PlanPrefs): Date | null {
  if (prefs.planId !== 'trial') return null;
  const start = prefs.trialStartedAt
    ? new Date(prefs.trialStartedAt)
    : new Date();
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + TRIAL_DAYS);
  return end;
}

export function computeEntitlement(
  prefs: PlanPrefs,
  opts?: {
    /** Login members on this household excluding the owner (accepted invites). */
    invitedLogins?: number;
    /** True when this device joined another owner's Family. */
    isHouseholdMember?: boolean;
    now?: Date;
  }
): Entitlement {
  const now = opts?.now ?? new Date();
  const invited = Math.max(0, opts?.invitedLogins ?? 0);
  const seatsTotal = FAMILY_LOGIN_SEATS;
  // Owner takes 1 seat; remaining for invitees.
  const seatsRemaining = Math.max(0, seatsTotal - 1 - invited);

  if (opts?.isHouseholdMember) {
    return {
      status: 'member',
      planId: 'family',
      hasAccess: true,
      canInvite: false,
      seatsRemaining: 0,
      seatsTotal,
      trialDaysLeft: null,
      trialEndsAt: null,
      paywallReason: null,
    };
  }

  if (prefs.planId === 'pro') {
    return {
      status: 'pro',
      planId: 'pro',
      hasAccess: true,
      canInvite: false,
      seatsRemaining: 0,
      seatsTotal,
      trialDaysLeft: null,
      trialEndsAt: null,
      paywallReason: 'upgrade_family',
    };
  }

  if (prefs.planId === 'family') {
    return {
      status: 'family',
      planId: 'family',
      hasAccess: true,
      canInvite: seatsRemaining > 0,
      seatsRemaining,
      seatsTotal,
      trialDaysLeft: null,
      trialEndsAt: null,
      paywallReason: seatsRemaining > 0 ? null : 'upgrade_family',
    };
  }

  // Trial
  const end = trialEndsAt(prefs);
  const msLeft = end ? end.getTime() - now.getTime() : TRIAL_DAYS * 86400000;
  const daysLeft = Math.ceil(msLeft / 86400000);
  const active = msLeft > 0;

  return {
    status: active ? 'trial_active' : 'trial_expired',
    planId: 'trial',
    hasAccess: active,
    canInvite: false,
    seatsRemaining: 0,
    seatsTotal,
    trialDaysLeft: daysLeft,
    trialEndsAt: end?.toISOString() ?? null,
    paywallReason: active ? null : 'trial_ended',
  };
}

/** True when inviting requires Family upgrade first. */
export function needsFamilyUpgrade(ent: Entitlement): boolean {
  return ent.planId === 'pro' || ent.planId === 'trial' || (ent.planId === 'family' && !ent.canInvite && ent.status !== 'member');
}
