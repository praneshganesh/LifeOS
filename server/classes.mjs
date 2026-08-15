/** Class-pack utterance repair — keep in sync with lib/classes.ts */

const CLASS_ACTIVITY =
  'swimming|skating|piano|tennis|football|soccer|dance|yoga|karate|guitar|violin|chess|coding|art|boxing|ballet|cricket|golf';

const MONTH_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

export function classPackFromUtterance(text) {
  if (!text?.trim()) return {};
  const totalM = text.match(
    /\b(\d{1,3})(?:st|nd|rd|th)?\s+(?:class(?:es)?|lesson(?:s)?|session(?:s)?)\b/i
  );
  const monthsM =
    text.match(/\b(\d{1,2})\s+months?\b/i) ||
    text.match(
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+months?\b/i
    );
  const total = totalM ? Number(totalM[1]) : undefined;
  let months;
  if (monthsM) {
    months = MONTH_WORDS[monthsM[1].toLowerCase()] ?? Number(monthsM[1]);
  }
  return {
    total: total && total > 0 ? total : undefined,
    months: months && months > 0 ? months : undefined,
  };
}

export function classTitleFromUtterance(text) {
  if (!text?.trim()) return undefined;
  const named = text.match(new RegExp(`\\b(${CLASS_ACTIVITY})\\b`, 'i'));
  if (named) {
    const w = named[1].toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  const generic = text.match(
    /\b(?:for|to|my|a|the)\s+(?:a\s+|the\s+)?([a-z]{3,20})\s+class(?:es)?\b/i
  );
  if (generic && !/^(first|next|last|new|the|this|that)$/i.test(generic[1])) {
    const w = generic[1].toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  return undefined;
}

export function looksLikeClassEnrollment(text) {
  if (!text?.trim()) return false;
  return (
    /\b(enrolled|enrol|signed up|sign up|joining|joined)\b/i.test(text) &&
    /\b(class|classes|lesson|lessons|course|pack)\b/i.test(text)
  );
}

export function looksLikeClassAttendance(text) {
  if (!text?.trim()) return false;
  if (/^i attended\b/i.test(text.trim())) return true;
  return /\b(attended|went to|had)\b.{0,48}\b(class|classes|lesson|session)\b/i.test(
    text
  );
}

export function ensureClassActions(actions, lastUserText, classPacksSummary) {
  const list = (Array.isArray(actions) ? actions : []).filter(
    (a) => a && a.type && a.type !== 'none'
  );
  const types = new Set(list.map((a) => a.type));
  const packs = Array.isArray(classPacksSummary) ? classPacksSummary : [];
  const newest = packs[0];

  if (looksLikeClassEnrollment(lastUserText) && !types.has('add_class_pack')) {
    const spoken = classPackFromUtterance(lastUserText);
    list.push({
      type: 'add_class_pack',
      title: classTitleFromUtterance(lastUserText) || 'Class',
      total: spoken.total,
      months: spoken.months,
    });
  }

  if (looksLikeClassAttendance(lastUserText) && !types.has('log_class') && packs.length) {
    list.push({
      type: 'log_class',
      title: classTitleFromUtterance(lastUserText),
    });
  }

  return list
    .map((a) => {
      if (a.type === 'log_class') {
        if (!packs.length) return null;
        const next = { ...a };
        if (!next.title && newest?.title) next.title = newest.title;
        if (!next.id && newest?.id) next.id = newest.id;
        return next;
      }
      if (a.type !== 'add_class_pack') return a;
      const spoken = classPackFromUtterance(lastUserText);
      const next = { ...a };
      if (spoken.total) next.total = spoken.total;
      if (spoken.months) next.months = spoken.months;
      if (!next.title) next.title = classTitleFromUtterance(lastUserText) || 'Class';
      return next;
    })
    .filter(Boolean);
}
