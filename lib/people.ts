import type { HouseholdMember } from '@/lib/household';

export type PersonRef = {
  personId?: string;
  assignedTo: string;
};

/** Household list for chat context. */
export function getHouseholdPeople(members: HouseholdMember[]): Array<{
  id: string;
  name: string;
  relation: string;
  role: string;
}> {
  return members.map((m) => ({
    id: m.id,
    name: m.name,
    relation: m.relation,
    role: m.role,
  }));
}

/**
 * Map spoken ownership ("for my wife", "Priya's") to a household person.
 */
export function resolvePersonMention(
  utterance: string,
  members: HouseholdMember[]
): PersonRef | null {
  if (!members.length) return null;
  const t = utterance.toLowerCase();

  const byRelation: Array<{
    re: RegExp;
    pick: (m: HouseholdMember) => boolean;
  }> = [
    {
      re: /\b(for|to)\s+(my\s+)?(wife|partner|spouse)\b/,
      pick: (m) => /partner|wife|spouse/i.test(m.relation) || m.id.includes('partner'),
    },
    {
      re: /\b(for|to)\s+(my\s+)?(husband|partner|spouse)\b/,
      pick: (m) => /partner|husband|spouse/i.test(m.relation) || m.id.includes('partner'),
    },
    {
      re: /\b(for|to)\s+(my\s+)?(son|boy|kid|child)\b/,
      pick: (m) => m.role === 'child' && /son|boy/i.test(m.relation + m.name),
    },
    {
      re: /\b(for|to)\s+(my\s+)?(daughter|girl|kid|child)\b/,
      pick: (m) => m.role === 'child',
    },
    {
      re: /\b(for|to)\s+(my\s+)?(dog|pet)\b/,
      pick: (m) => m.role === 'pet',
    },
    {
      re: /\bfor\s+me\b|\bmy\s+own\b/,
      pick: (m) => /you/i.test(m.relation),
    },
  ];

  for (const rule of byRelation) {
    if (!rule.re.test(t)) continue;
    const hit = members.find(rule.pick);
    if (hit) return { personId: hit.id, assignedTo: hit.name };
  }

  for (const m of members) {
    const name = m.name.toLowerCase();
    if (name.length < 2) continue;
    if (new RegExp(`\\b(for|to)\\s+${escapeRe(name)}\\b`, 'i').test(t)) {
      return { personId: m.id, assignedTo: m.name };
    }
    if (new RegExp(`\\b${escapeRe(name)}['']s\\b`, 'i').test(t)) {
      return { personId: m.id, assignedTo: m.name };
    }
  }

  return null;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function personById(members: HouseholdMember[], id?: string | null) {
  if (!id) return undefined;
  return members.find((m) => m.id === id);
}

/**
 * Bind ownership only to a real household member.
 * Model names like "Ananya" from few-shots are dropped if they are not in the list.
 */
export function resolveAssignment(params: {
  assignedTo?: string;
  personId?: string;
  utterance?: string;
  members: HouseholdMember[];
}): PersonRef | null {
  const members = params.members ?? [];
  if (!members.length) return null;

  const fromSpeech = params.utterance
    ? resolvePersonMention(params.utterance, members)
    : null;
  if (fromSpeech) return fromSpeech;

  if (params.personId) {
    const hit = personById(members, params.personId);
    if (hit) return { personId: hit.id, assignedTo: hit.name };
  }

  const name = params.assignedTo?.trim().toLowerCase();
  if (name && name.length >= 2) {
    const hit = members.find((m) => m.name.trim().toLowerCase() === name);
    if (hit) return { personId: hit.id, assignedTo: hit.name };
  }

  return null;
}
