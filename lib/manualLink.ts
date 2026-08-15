/**
 * Manual / support links for inventory items.
 * Prefer a real URL from the model; then a known brand support page; else web search.
 */

export function isHttpUrl(value?: string | null): value is string {
  if (!value?.trim()) return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Drop obvious hallucinated junk; keep plausible http(s) URLs. */
export function sanitizeManualUrl(raw?: string | null): string | undefined {
  if (!isHttpUrl(raw)) return undefined;
  const u = raw.trim();
  if (/example\.com|localhost|127\.0\.0\.1/i.test(u)) return undefined;
  return u;
}

export function manualSearchUrl(brand: string, name: string): string {
  const q = [brand !== 'Unknown' ? brand : '', name, 'user guide', 'manual', 'PDF']
    .filter(Boolean)
    .join(' ')
    .trim();
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

/** Well-known brand support hubs — used only when the model omits manualUrl. */
const BRAND_SUPPORT: Array<{ test: RegExp; url: string }> = [
  { test: /\bapple\b/i, url: 'https://support.apple.com' },
  { test: /\bde'?longhi\b/i, url: 'https://www.delonghi.com/en-us/support' },
  { test: /\bsamsung\b/i, url: 'https://www.samsung.com/us/support' },
  { test: /\blg\b/i, url: 'https://www.lg.com/us/support' },
  { test: /\bsony\b/i, url: 'https://www.sony.com/electronics/support' },
  { test: /\bdyson\b/i, url: 'https://www.dyson.com/support' },
  { test: /\bbose\b/i, url: 'https://www.bose.com/support' },
  { test: /\bmicrosoft\b|\bsurface\b/i, url: 'https://support.microsoft.com' },
  { test: /\bgoogle\b|\bpixel\b/i, url: 'https://support.google.com' },
  { test: /\bhp\b/i, url: 'https://support.hp.com' },
  { test: /\bdell\b/i, url: 'https://www.dell.com/support' },
  { test: /\blenovo\b/i, url: 'https://support.lenovo.com' },
];

export function brandSupportUrl(brand: string, name: string): string | undefined {
  const blob = `${brand} ${name}`;
  for (const row of BRAND_SUPPORT) {
    if (row.test.test(blob)) return row.url;
  }
  return undefined;
}

/**
 * Resolve what to store / open for an item.
 */
export function resolveManualLink(input: {
  manualUrl?: string | null;
  brand: string;
  name: string;
}): { url: string; kind: 'official' | 'support' | 'search'; label: string } {
  const official = sanitizeManualUrl(input.manualUrl);
  if (official) {
    return { url: official, kind: 'official', label: 'View manual' };
  }
  const support = brandSupportUrl(input.brand, input.name);
  if (support) {
    return { url: support, kind: 'support', label: 'Support & manuals' };
  }
  return {
    url: manualSearchUrl(input.brand, input.name),
    kind: 'search',
    label: 'Find manual',
  };
}
