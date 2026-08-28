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
    (/\b(enrolled|enrol|signed up|sign up|joining|joined|has|takes|started|starting|registered)\b/i.test(
      text
    ) &&
      /\b(class|classes|lesson|lessons|course|pack|skating|swimming|piano|tennis|football|soccer|dance|yoga|karate|guitar|violin|chess|coding|art|boxing|ballet|cricket|golf)\b/i.test(
        text
      )) ||
    /\b(total of\s+\d+|\d+\s+classes|pack of\s+\d+)\b/i.test(text)
  );
}

export function looksLikeClassAttendance(text) {
  if (!text?.trim()) return false;
  if (/^i attended\b/i.test(text.trim())) return true;
  return /\b(attended|went to|had)\b.{0,48}\b(class|classes|lesson|session)\b/i.test(
    text
  );
}

export function classScheduleDaysFromUtterance(text) {
  if (!text?.trim()) return undefined;
  const lower = text.toLowerCase();
  const set = new Set();

  if (/\b(every\s+day|daily|all\s+days)\b/.test(lower)) {
    return [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ];
  }
  if (/\b(weekdays)\b/.test(lower)) {
    return ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  }
  if (/\b(weekends)\b/.test(lower)) {
    return ['saturday', 'sunday'];
  }

  const DAY_PATTERNS = [
    { id: 'monday', regex: /\b(mondays?|mon)\b/ },
    { id: 'tuesday', regex: /\b(tuesdays?|tue|tues)\b/ },
    { id: 'wednesday', regex: /\b(wednesdays?|wed)\b/ },
    { id: 'thursday', regex: /\b(thursdays?|thu|thur|thurs)\b/ },
    { id: 'friday', regex: /\b(fridays?|fri)\b/ },
    { id: 'saturday', regex: /\b(saturdays?|sat)\b/ },
    { id: 'sunday', regex: /\b(sundays?|sun)\b/ },
  ];

  for (const { id, regex } of DAY_PATTERNS) {
    if (regex.test(lower)) {
      set.add(id);
    }
  }

  return set.size ? Array.from(set) : undefined;
}

export function classScheduleTimeFromUtterance(text) {
  if (!text?.trim()) return undefined;
  const m =
    text.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ||
    text.match(/\bat\s+(\d{1,2})(?::(\d{2}))\b/i);
  if (!m) return undefined;
  const hours = Number(m[1]);
  if (hours < 0 || hours > 24) return undefined;
  const mins = m[2] ? m[2] : '00';
  const ampm = m[3]
    ? m[3].toUpperCase()
    : hours >= 12
      ? 'PM'
      : 'AM';
  const formattedHours = m[3] ? hours : hours % 12 || 12;
  return `${formattedHours}:${mins} ${ampm}`;
}

export function classCompletedCountFromUtterance(text) {
  if (!text?.trim()) return undefined;
  const m =
    text.match(
      /\b(\d{1,3})\s+(?:are\s+)?(?:already\s+)?(?:done|completed|attended|finished)\b/i
    ) ||
    text.match(
      /\b(?:already\s+)?(?:done|completed|attended|finished)\s+(?:with\s+)?(\d{1,3})\b/i
    ) ||
    text.match(
      /\b(?:done|completed|attended)\s+(\d{1,3})\s+of\s+(?:them|the\s+\d+)\b/i
    );
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function ensureClassActions(actions, lastUserText, classPacksSummary) {
  const list = (Array.isArray(actions) ? actions : []).filter(
    (a) => a && a.type && a.type !== 'none'
  );
  const types = new Set(list.map((a) => a.type));
  const packs = Array.isArray(classPacksSummary) ? classPacksSummary : [];
  const newest = packs[0];

  const spokenDays = classScheduleDaysFromUtterance(lastUserText);
  const spokenTime = classScheduleTimeFromUtterance(lastUserText);
  const spokenCompleted = classCompletedCountFromUtterance(lastUserText);

  if (looksLikeClassEnrollment(lastUserText) && !types.has('add_class_pack')) {
    const spoken = classPackFromUtterance(lastUserText);
    list.push({
      type: 'add_class_pack',
      title: classTitleFromUtterance(lastUserText) || 'Class',
      total: spoken.total,
      months: spoken.months,
      scheduleDays: spokenDays,
      scheduleTime: spokenTime,
      completed: spokenCompleted,
    });
  }

  if (looksLikeClassEnrollment(lastUserText)) {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i]?.type === 'habit_check_in') list.splice(i, 1);
    }
  }

  // If user is updating an existing pack (e.g. "out of the 12 classes, 6 are already done")
  if (
    !types.has('add_class_pack') &&
    !types.has('update_class_pack') &&
    packs.length &&
    spokenCompleted != null
  ) {
    const title = classTitleFromUtterance(lastUserText);
    const target = (title && packs.find((p) => p.title?.toLowerCase().includes(title.toLowerCase()))) || newest;
    if (target?.id) {
      list.push({
        type: 'update_class_pack',
        id: target.id,
        title: target.title,
        patch: {
          completed: spokenCompleted,
          scheduleDays: spokenDays,
          scheduleTime: spokenTime,
        },
      });
    }
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
        if (!next.title && packs.length === 1 && newest?.title) {
          next.title = newest.title;
        }
        return next;
      }
      if (a.type === 'add_class_pack') {
        const spoken = classPackFromUtterance(lastUserText);
        const next = { ...a };
        if (spoken.total && !next.total) next.total = spoken.total;
        if (spoken.months && !next.months) next.months = spoken.months;
        if (!next.title) next.title = classTitleFromUtterance(lastUserText) || 'Class';
        if (spokenDays && !next.scheduleDays) next.scheduleDays = spokenDays;
        if (spokenTime && !next.scheduleTime) next.scheduleTime = spokenTime;
        if (spokenCompleted != null && next.completed == null) next.completed = spokenCompleted;
        return next;
      }
      if (a.type === 'update_class_pack') {
        const next = { ...a };
        const patch = { ...(next.patch || {}) };
        if (spokenCompleted != null && patch.completed == null) patch.completed = spokenCompleted;
        if (spokenDays && !patch.scheduleDays) patch.scheduleDays = spokenDays;
        if (spokenTime && !patch.scheduleTime) patch.scheduleTime = spokenTime;
        next.patch = patch;
        return next;
      }
      return a;
    })
    .filter(Boolean);
}
