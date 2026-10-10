/**
 * Creating a habit is not a check-in. "Create a new habit to meditate…"
 * must not mark today done.
 */

export function looksLikeCreateHabit(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  const create =
    /\b(create|add|make|start|set up|setup|track)\b[\s\S]{0,60}\bhabits?\b/i.test(t) ||
    /\b(new|another)\s+habits?\b/i.test(t) ||
    /\bhabits?\s+(to|for|called|named)\b/i.test(t);
  if (!create) return false;
  if (
    /\b(mark( it| today)? done|already (did|done)|check(ed)? (it )?in|i (just |already )?(did|finished|completed) (it|today|my))\b/i.test(
      t
    )
  ) {
    return false;
  }
  return true;
}

export function habitDetailFromUtterance(text) {
  const t = String(text || '');
  const bits = [];
  const mins = t.match(/\b(\d+)\s*(?:min|mins|minutes)\b/i);
  if (mins) bits.push(`${mins[1]} minutes`);
  if (/\bevery\s+day\b|\bdaily\b/i.test(t)) bits.push('every day');
  return bits.length ? bits.join(', ') : undefined;
}

export function habitTitleFromCreateUtterance(text) {
  const t = String(text || '').trim();
  const m = t.match(/\bhabits?\s+(?:to|for|called|named)\s+(.+)/i);
  if (!m) return undefined;
  let rest = m[1]
    .replace(/\b(every\s+day|daily|for\s+\d+\s*(?:min|mins|minutes))\b/gi, ' ')
    .replace(/[.,!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(a|an|the)\s+/i, '');
  if (!rest) return undefined;
  const word = rest.split(/\s+/).slice(0, 4).join(' ');
  return word.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Rewrite check-ins into add_habit when the user asked to create a habit. */
export function ensureHabitCreateActions(actions, lastUserText) {
  const list = (Array.isArray(actions) ? actions : []).filter(Boolean).map((a) => ({ ...a }));
  if (!looksLikeCreateHabit(lastUserText)) return list;
  const why = habitDetailFromUtterance(lastUserText);
  const spokenTitle = habitTitleFromCreateUtterance(lastUserText);
  let converted = false;
  const next = list.map((a) => {
      if (a.type !== 'habit_check_in') return a;
      converted = true;
      return {
        type: 'add_habit',
        title: spokenTitle || a.title,
        why: a.why || why,
        assignedTo: a.assignedTo,
        personId: a.personId,
      };
    });
  if (!converted && !next.some((a) => a.type === 'add_habit')) {
    const title = spokenTitle;
    if (title) {
      next.push({ type: 'add_habit', title, why });
    }
  }
  const meaningful = next.filter((a) => a.type !== 'none');
  return meaningful.length ? meaningful : next;
}
