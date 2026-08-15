import type { Icon3DName } from '@/components/ui/Icon3D';

export type HouseholdRole = 'adult' | 'child' | 'parent' | 'pet';

/** Local ACL stub until sync/backend (FP2). */
export type SharingPermission = 'owner' | 'editor' | 'viewer';

/** On-device household person / pet — no demo seed. */
export type HouseholdMember = {
  id: string;
  name: string;
  role: HouseholdRole;
  relation: string;
  avatarLetter: string;
  medicalNotes?: string;
  icon: Icon3DName;
  /** Sharing role stub — not enforced until multi-device sync */
  permission: SharingPermission;
  createdAt: string;
};

export function avatarLetterFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function iconForRole(role: HouseholdRole): Icon3DName {
  if (role === 'pet') return 'dog';
  if (role === 'child') return 'school';
  return 'family';
}

export function labelForPermission(p: SharingPermission): string {
  if (p === 'owner') return 'Owner';
  if (p === 'viewer') return 'Viewer';
  return 'Editor';
}

export type NewHouseholdMemberInput = {
  name: string;
  role: HouseholdRole;
  relation: string;
  medicalNotes?: string;
  permission?: SharingPermission;
  id?: string;
};

export function createHouseholdMember(
  input: NewHouseholdMemberInput
): HouseholdMember {
  const name = input.name.trim();
  return {
    id: input.id ?? `fm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    role: input.role,
    relation: input.relation.trim() || roleLabel(input.role),
    avatarLetter: avatarLetterFromName(name),
    medicalNotes: input.medicalNotes?.trim() || undefined,
    icon: iconForRole(input.role),
    permission: input.permission ?? defaultPermission(input.role),
    createdAt: new Date().toISOString(),
  };
}

export function normalizeHouseholdMember(raw: unknown): HouseholdMember | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return null;
  const role = (['adult', 'child', 'parent', 'pet'].includes(String(r.role))
    ? r.role
    : 'adult') as HouseholdRole;
  const permission = (
    ['owner', 'editor', 'viewer'].includes(String(r.permission))
      ? r.permission
      : defaultPermission(role)
  ) as SharingPermission;
  return {
    id: r.id,
    name: r.name.trim(),
    role,
    relation: typeof r.relation === 'string' ? r.relation : roleLabel(role),
    avatarLetter:
      typeof r.avatarLetter === 'string'
        ? r.avatarLetter
        : avatarLetterFromName(String(r.name)),
    medicalNotes: typeof r.medicalNotes === 'string' ? r.medicalNotes : undefined,
    icon: (typeof r.icon === 'string' ? r.icon : iconForRole(role)) as Icon3DName,
    permission,
    createdAt:
      typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
  };
}

function defaultPermission(role: HouseholdRole): SharingPermission {
  if (role === 'pet' || role === 'child') return 'viewer';
  return 'editor';
}

function roleLabel(role: HouseholdRole): string {
  switch (role) {
    case 'pet':
      return 'Pet';
    case 'child':
      return 'Child';
    case 'parent':
      return 'Parent';
    default:
      return 'Family';
  }
}
