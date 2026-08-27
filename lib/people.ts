import type { HouseholdMember } from '@/lib/household';

export type PersonRef = {
  personId?: string;
  assignedTo: string;
};

/** Seed / empty profile — not a real given name. */
export function isPlaceholderName(name: string | undefined): boolean {
  return !name?.trim() || /^you$/i.test(name.trim());
}

/** The local “You” member — first-person Talk (“I attended”) binds here. */
export function selfMember(
  members: HouseholdMember[]
): HouseholdMember | undefined {
  if (!members.length) return undefined;
  return (
    members.find((m) => /you/i.test(m.relation)) ||
    members.find((m) => m.permission === 'owner') ||
    members.find((m) => m.role === 'adult' || m.role === 'parent')
  );
}

/** Profile name, else the household self member. Never returns “You”. */
export function resolveSelfDisplayName(
  profileName: string | undefined,
  members: HouseholdMember[]
): string {
  if (!isPlaceholderName(profileName)) return profileName!.trim();
  const self = selfMember(members);
  if (self && !isPlaceholderName(self.name)) return self.name.trim();
  return '';
}

/** P from Pranesh, PG from Pranesh Ganesh. Empty when we only have “You”. */
export function selfAvatarInitial(
  profileName: string | undefined,
  members: HouseholdMember[]
): string {
  const name = resolveSelfDisplayName(profileName, members);
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0]![0]!.toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

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
      re: /\bmy\s+son\b|\b(for|to)\s+(my\s+)?(son|boy)\b|\benrolled\s+(my\s+)?(son|boy)\b/,
      pick: (m) => {
        const kids = members.filter((x) => x.role === 'child');
        if (kids.length === 1) return m.id === kids[0]!.id;
        return m.role === 'child' && /son|boy/i.test(`${m.relation} ${m.name}`);
      },
    },
    {
      re: /\bmy\s+(daughter|kid|child)\b|\b(for|to)\s+(my\s+)?(daughter|girl|kid|child)\b|\benrolled\s+(my\s+)?(daughter|girl|kid|child)\b/,
      pick: (m) => {
        const kids = members.filter((x) => x.role === 'child');
        if (kids.length === 1) return m.id === kids[0]!.id;
        return m.role === 'child';
      },
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
    if (
      new RegExp(
        `\\b(for|to|enrolled|enrolling|booked|registered|signed\\s+up)\\s+${escapeRe(name)}\\b`,
        'i'
      ).test(t)
    ) {
      return { personId: m.id, assignedTo: m.name };
    }
    if (new RegExp(`\\b${escapeRe(name)}['']s\\b`, 'i').test(t)) {
      return { personId: m.id, assignedTo: m.name };
    }
  }

  // ASR rarely spells names right ("Saara" → "Sara"/"Sarah") — fuzzy-bind the
  // spoken enroll-object / possessive word before inventing a new person.
  const enrollWord = t.match(
    /\b(?:for|to|enrolled|enrolling|booked|registered|signed\s+up)\s+([a-z][a-z'’-]+)\b/i
  )?.[1];
  if (enrollWord && !ENROLL_OBJECT_STOPWORDS.has(enrollWord.toLowerCase())) {
    const hit = fuzzyMatchMember(enrollWord, members);
    if (hit) return { personId: hit.id, assignedTo: hit.name };
  }
  const possessiveWord = t.match(/\b([a-z][a-z-]+)['’]s\b/i)?.[1];
  if (possessiveWord && !ENROLL_OBJECT_STOPWORDS.has(possessiveWord.toLowerCase())) {
    const hit = fuzzyMatchMember(possessiveWord, members);
    if (hit) return { personId: hit.id, assignedTo: hit.name };
  }

  const self = selfMember(members);
  if (self && looksLikeFirstPersonSelf(t)) {
    return { personId: self.id, assignedTo: self.name };
  }

  return null;
}

/** “I attended / I walked / remind me” with no other person named. */
export function looksLikeFirstPersonSelf(utterance: string): boolean {
  const t = utterance.toLowerCase().trim();
  if (!t) return false;
  if (
    /\b(my\s+)?(wife|husband|partner|spouse|son|daughter|kid|child|boy|girl)\b/.test(
      t
    )
  ) {
    return false;
  }
  // "I enrolled Maya…" — the verb has a person object, so it isn't about self.
  if (
    /^i\s+(?:enrolled|enrolling|signed\s+up|registered|booked)\s+(?!for\b|in\b|into\b|to\b|at\b|myself\b|my\b)/i.test(
      t
    )
  ) {
    return false;
  }
  return /^(i |i'm |i’m |i've |i’ve |i am |i have |remind me\b)/i.test(t);
}

const ENROLL_OBJECT_STOPWORDS = new Set([
  'for',
  'in',
  'into',
  'to',
  'at',
  'on',
  'myself',
  'me',
  'my',
  'him',
  'her',
  'them',
  'us',
  'a',
  'an',
  'the',
  'some',
  'today',
  'yesterday',
  'tomorrow',
]);

/**
 * "I enrolled Maya for piano" → "Maya", when that name is NOT already a
 * household member. Returns null for "enrolled for swimming" style phrasing.
 */
export function spokenEnrolleeName(
  utterance: string,
  members: HouseholdMember[]
): string | null {
  const m = utterance.match(
    /\b(?:enrolled|enrolling|signed\s+up|registered|booked)\s+([a-z][a-z'’-]+)/i
  );
  const word = m?.[1]?.trim();
  if (!word) return null;
  const lower = word.toLowerCase();
  if (ENROLL_OBJECT_STOPWORDS.has(lower)) return null;
  // Fuzzy too — "Sara" must bind to the member "Saara", not spawn a twin.
  if (fuzzyMatchMember(word, members)) return null;
  return word[0]!.toUpperCase() + word.slice(1);
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "ishaan" → "ishan" — ASR drops doubled letters constantly. */
function collapseRepeats(s: string): string {
  return s.replace(/(.)\1+/g, '$1');
}

function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const prev = new Array<number>(cols);
  const curr = new Array<number>(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;
  for (let i = 1; i < rows; i++) {
    curr[0] = i;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j < cols; j++) prev[j] = curr[j]!;
  }
  return prev[cols - 1]!;
}

/**
 * Bind an ASR-mangled spoken name ("Sara", "Sarah") to the one household
 * member it plausibly is ("Saara"). Exact match first; then doubled-letter
 * collapse plus a small edit distance. Returns undefined when ambiguous —
 * never guess between two members.
 */
export function fuzzyMatchMember(
  spoken: string,
  members: HouseholdMember[]
): HouseholdMember | undefined {
  const s = spoken.trim().toLowerCase();
  if (s.length < 2 || !members.length) return undefined;
  const exact = members.find((m) => m.name.trim().toLowerCase() === s);
  if (exact) return exact;
  const sKey = collapseRepeats(s);
  const hits = members.filter((m) => {
    const n = m.name.trim().toLowerCase().split(/\s+/)[0] || '';
    if (n.length < 2) return false;
    const nKey = collapseRepeats(n);
    if (nKey === sKey) return true;
    const len = Math.min(nKey.length, sKey.length);
    const maxDist = len >= 6 ? 2 : len >= 4 ? 1 : 0;
    return maxDist > 0 && editDistance(sKey, nKey) <= maxDist;
  });
  return hits.length === 1 ? hits[0] : undefined;
}

export function personById(members: HouseholdMember[], id?: string | null) {
  if (!id) return undefined;
  return members.find((m) => m.id === id);
}

/**
 * Live owner name for display — the member's CURRENT name wins over the
 * assignedTo string copied at creation time (which goes stale on rename).
 */
export function displayNameFor(
  members: HouseholdMember[],
  personId?: string | null,
  assignedTo?: string | null
): string {
  const member = personId ? members.find((m) => m.id === personId) : undefined;
  return (member?.name || assignedTo || '').trim();
}

/**
 * Bind ownership to a real household member when possible.
 * Model names like "Ananya" from few-shots are dropped if they are not in the
 * list AND not spoken in the utterance. A spoken name that isn't a member yet
 * is returned WITHOUT a personId so callers can create that person.
 */
export function resolveAssignment(params: {
  assignedTo?: string;
  personId?: string;
  utterance?: string;
  members: HouseholdMember[];
  /** Habits / classes / reminders: unnamed first-person → You. Not for Things. */
  preferSelf?: boolean;
}): PersonRef | null {
  const members = params.members ?? [];

  const fromSpeech =
    params.utterance && members.length
      ? resolvePersonMention(params.utterance, members)
      : null;
  if (fromSpeech) return fromSpeech;

  if (params.personId) {
    const hit = personById(members, params.personId);
    if (hit) return { personId: hit.id, assignedTo: hit.name };
  }

  const name = params.assignedTo?.trim();
  const lower = name?.toLowerCase();
  if (name && lower && lower.length >= 2) {
    const hit =
      members.find((m) => m.name.trim().toLowerCase() === lower) ||
      (!/^(you|me|myself)$/.test(lower)
        ? fuzzyMatchMember(name, members)
        : undefined);
    if (hit) return { personId: hit.id, assignedTo: hit.name };
    // Only trust an unknown name if the user actually said it this turn —
    // that filters model hallucinations but keeps "I enrolled Maya…".
    if (
      !/^(you|me|myself)$/.test(lower) &&
      params.utterance?.toLowerCase().includes(lower)
    ) {
      return { assignedTo: name };
    }
  }

  const enrollee = params.utterance
    ? spokenEnrolleeName(params.utterance, members)
    : null;
  if (enrollee) return { assignedTo: enrollee };

  if (params.preferSelf && members.length) {
    const self = selfMember(members);
    if (self) return { personId: self.id, assignedTo: self.name };
  }

  return null;
}
