const SKIP = new Set(['unknown', 'document', '—', '-', 'n/a', 'na']);

function capitalScore(label: string): number {
  let score = 0;
  for (const ch of label) if (ch !== ch.toLowerCase()) score += 1;
  return score;
}

/** Distinct labels, most-used spelling first. Empty and placeholder values are dropped. */
export function rememberedLabels(values: Array<string | undefined | null>): string[] {
  const counts = new Map<string, { label: string; n: number }>();
  for (const raw of values) {
    const label = raw?.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (SKIP.has(key)) continue;
    const prev = counts.get(key);
    if (!prev) counts.set(key, { label, n: 1 });
    else {
      prev.n += 1;
      if (capitalScore(label) > capitalScore(prev.label)) prev.label = label;
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .map((row) => row.label);
}

/** Prefix matches that are not already the exact household spelling. */
export function suggestionsFor(query: string, history: string[], limit = 5): string[] {
  const typed = query.trim();
  const q = typed.toLowerCase();
  if (!q) return [];
  return history
    .filter((label) => label.toLowerCase().startsWith(q) && label !== typed)
    .slice(0, limit);
}
